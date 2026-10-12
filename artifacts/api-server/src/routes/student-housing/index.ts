import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
import OpenAI from "openai";
import {
  ListStudentHousingListingsResponse,
  SendStudentHousingChatBody,
  SendStudentHousingChatResponse,
} from "@workspace/api-zod";
import { sampleListings } from "./listings";

const router: IRouter = Router();

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

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5-mini",
      max_completion_tokens: 768,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a practical, friendly housing guide for students. Help the student compare monthly budget, room privacy, shared living, transit, and amenities. These records are fictional demo examples, not current inventory. Never claim that a listing is real, available, or verified. Use only supplied listing details; do not invent prices, features, campus commute times, deposits, or lease terms. transitMinutes is an illustrative walk to transit, not a campus commute. If the campus or a key preference is unknown, ask one useful follow-up question rather than guessing. Be neutral and inclusive; never ask for or use protected characteristics to steer housing suggestions. Do not request sensitive personal or financial information or give legal or financial advice. Respond with JSON only: {\"reply\":\"short conversational answer\",\"recommendedListingIds\":[\"sample-01\"]}. Recommend zero to three IDs only from the supplied listings. If no listing fits or the list is empty, say so and suggest a practical next step.",
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
  } catch {
    req.log.error("Student housing assistant request failed");
    res.status(502).json({
      error: "The housing assistant is temporarily unavailable. Please try again.",
    });
  }
});

export default router;
