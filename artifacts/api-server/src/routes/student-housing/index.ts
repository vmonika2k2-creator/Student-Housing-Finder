import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
import OpenAI from "openai";
import { createHash } from "node:crypto";
import {
  ListStudentHousingListingsResponse,
  SendStudentHousingChatBody,
  SendStudentHousingChatResponse,
} from "@workspace/api-zod";
import { sampleListings } from "./listings";
import adminRouter from "./admin";
import { getCachedRentalListings, searchSquareYardsRentals, SquareYardsError } from "../../lib/squareyards";
import {
  DEFAULT_AGENT_SETTINGS,
  buildSystemPrompt,
  getAgentSettings,
  type AgentSettingsInput,
} from "../../lib/agentSettings";

const router: IRouter = Router();
router.use(adminRouter);

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  throw new Error("OPENAI_API_KEY must be set for the student housing assistant.");
}

const openai = new OpenAI({ apiKey });

const assistantLimiter = rateLimit({
  windowMs: 60_000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Please wait a moment before sending another message." },
});

const rentalSearchLimiter = rateLimit({
  windowMs: 60_000,
  limit: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Please wait a moment before searching again." },
});

router.get("/housing/listings", (_req, res): void => {
  res.json(ListStudentHousingListingsResponse.parse(sampleListings));
});

router.post("/housing/search", rentalSearchLimiter, async (req, res): Promise<void> => {
  try {
    const result = await searchSquareYardsRentals(req.body);
    res.json(result);
  } catch (error) {
    const statusCode = error instanceof SquareYardsError ? error.statusCode : 502;
    const message = error instanceof Error ? error.message : "Unknown Square Yards MCP error";
    req.log.warn({ err: error, statusCode }, "Square Yards rental search failed");
    res.status(statusCode).json({ error: message });
  }
});

router.post("/housing/assistant", assistantLimiter, async (req, res): Promise<void> => {
  const parsedBody = SendStudentHousingChatBody.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: parsedBody.error.message });
    return;
  }

  const { message, history, listingIds } = parsedBody.data;
  const moveInUrgency = parsedBody.data.moveInUrgency ?? "flexible";
  const responseEmpathy = moveInUrgency === "urgent" ? 8 : moveInUrgency === "soon" ? 6 : 4;
  const availableListings = getCachedRentalListings(listingIds);
  const allowedIds = new Set(availableListings.map((listing) => listing.id));

  // Use the admin's saved behavior settings. If they cannot be read, the
  // assistant still answers with the defaults instead of failing.
  let behavior: AgentSettingsInput = DEFAULT_AGENT_SETTINGS;
  try {
    behavior = await getAgentSettings();
  } catch (error) {
    req.log.warn({ err: error }, "Using default agent settings");
  }

  let phase = "openai_completion";
  try {
    const configurationVersion = createHash("sha256")
      .update(buildSystemPrompt(behavior))
      .digest("hex")
      .slice(0, 16);
    req.log.info({ conversationId: parsedBody.data.conversationId, configurationVersion }, "Using housing assistant configuration");
    const completion = await openai.chat.completions.create({
      model: "gpt-5-mini",
      max_completion_tokens: 8192,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "student_housing_reply",
          strict: true,
          schema: {
            type: "object",
            properties: {
              reply: { type: "string" },
              recommendedListingIds: {
                type: "array",
                items: { type: "string" },
              },
            },
            required: ["reply", "recommendedListingIds"],
            additionalProperties: false,
          },
        },
      },
      messages: [
        {
          role: "system",
          content: `${buildSystemPrompt(behavior)}\n\nThe website shows Square Yards rental listing data. Availability is not verified by this app. Never claim a listing is available or verified unless the supplied listing data explicitly says so. Never invent transit times or campus commute distances; only use a distance when the supplied listing includes one.`,
        },
        {
          role: "system",
          content: "LIVE LISTING RESULTS: The web client runs the same Square Yards search used by the browse filters before sending a housing search message. When listings are supplied, answer the student's request with the best matching listings in this same reply. Do not ask permission to search or promise to search later. Rank up to three supplied listing IDs, explain the source-backed reason each matches and its trade-off, and let the UI display their cards with compare, save, and contact-via-listing actions. If no listings were supplied, state that no matching listings were returned and give one practical filter adjustment. Never say a listing is currently available; call it a current source listing and ask the student to confirm availability with its contact.",
        },
        {
          role: "system",
          content: `Square Yards listings supplied for this turn: ${JSON.stringify(availableListings)}`,
        },
        {
          role: "system",
          content: `Student-selected controls: move-in urgency is ${moveInUrgency}; response empathy is ${responseEmpathy}/10. Adapt prioritization and tone to these preferences.`,
        },
        ...history.map((entry) => ({
          role: entry.role,
          content: entry.content,
        })),
        { role: "user", content: message },
      ],
    });

    phase = "response_validation";
    const rawReply = completion.choices[0]?.message.content;
    if (!rawReply) {
      throw new Error("The assistant returned an empty response.");
    }

    const decoded: unknown = JSON.parse(rawReply);
    const parsedResponse = SendStudentHousingChatResponse.safeParse(decoded);
    if (!parsedResponse.success) {
      throw new Error("The assistant returned an invalid response.");
    }

    const rankedIds = parsedResponse.data.recommendedListingIds
      .filter((id) => allowedIds.has(id))
      .slice(0, 3);
    const result = SendStudentHousingChatResponse.parse({
      reply: parsedResponse.data.reply,
      recommendedListingIds: rankedIds.length > 0
        ? rankedIds
        : availableListings.slice(0, 3).map((listing) => listing.id),
    });
    res.json(result);
  } catch (error) {
    const safeErrorDetails =
      error instanceof OpenAI.APIError
        ? {
            name: error.name,
            status: error.status,
            code: error.code,
            requestId: error.requestID,
          }
        : {
            name: error instanceof Error ? error.name : "UnknownError",
          };
    req.log.error({ phase, upstream: safeErrorDetails }, "Student housing assistant request failed");
    res.status(502).json({
      error: "The housing assistant is temporarily unavailable. Please try again.",
    });
  }
});

export default router;
