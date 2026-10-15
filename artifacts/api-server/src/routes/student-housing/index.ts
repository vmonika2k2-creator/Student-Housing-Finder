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

router.get("/housing/listings", (_req, res): void => {
  res.json(ListStudentHousingListingsResponse.parse(sampleListings));
});

router.post("/housing/assistant", assistantLimiter, async (req, res): Promise<void> => {
  const parsedBody = SendStudentHousingChatBody.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: parsedBody.error.message });
    return;
  }

  const { message, history, listingIds } = parsedBody.data;
  const availableListings = sampleListings.filter((listing) =>
    listingIds.includes(listing.id),
  );
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
          content: `${buildSystemPrompt(behavior)}\n\nThe website currently shows illustrative demo records, not verified live inventory. Never claim a listing is real, available, or verified. transitMinutes describes an illustrative walk to transit, not a campus commute.`,
        },
        {
          role: "system",
          content: `Sample listings the website currently shows: ${JSON.stringify(availableListings)}`,
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

    const result = SendStudentHousingChatResponse.parse({
      reply: parsedResponse.data.reply,
      recommendedListingIds: parsedResponse.data.recommendedListingIds
        .filter((id) => allowedIds.has(id))
        .slice(0, 3),
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
