import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
import OpenAI from "openai";
import {
  ListStudentHousingListingsResponse,
  SendStudentHousingChatBody,
  SendStudentHousingChatResponse,
} from "@workspace/api-zod";
import { sampleListings } from "./listings";
import adminRouter from "./admin";
import {
  DEFAULT_AGENT_SETTINGS,
  buildBehaviorInstructions,
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
          content:
            "You are a housing guide for students; a separate message sets your persona, tone, and style. Help the student compare monthly budget, room privacy, shared living, transit, and amenities. These records are fictional demo examples, not current inventory. Never claim that a listing is real, available, or verified. Use only supplied listing details; do not invent prices, features, campus commute times, deposits, or lease terms. transitMinutes is an illustrative walk to transit, not a campus commute. If the campus or a key preference is unknown, ask one useful follow-up question rather than guessing. Be neutral and inclusive; never ask for or use protected characteristics to steer housing suggestions. Do not request sensitive personal or financial information or give legal or financial advice. Respond with JSON only: {\"reply\":\"short answer written as bullet points\",\"recommendedListingIds\":[\"sample-01\"]}. Format the reply for a busy student who is reading on a small screen: write one short opening line (at most 15 words), then 2 to 5 bullet points. Put each bullet on its own line starting with \"- \", and keep each bullet to one short sentence (about 20 words or fewer) with one idea. Use the line breaks \"\\n\" between lines. Do not write long paragraphs, tables, headings, or numbered essays. If you need to ask a follow-up question, make it the last line, and ask only one. This formatting rule applies whatever the persona, tone, empathy, or initiative settings are. Recommend zero to three IDs only from the supplied listings. If no listing fits or the list is empty, say so and suggest a practical next step.",
        },
        {
          role: "system",
          content: buildBehaviorInstructions(behavior),
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
