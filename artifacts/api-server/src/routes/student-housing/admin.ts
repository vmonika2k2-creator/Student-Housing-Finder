import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
import OpenAI from "openai";
import {
  GetHousingAdminAgentSettingsResponse,
  GetHousingAdminSessionResponse,
  LoginHousingAdminBody,
  LoginHousingAdminResponse,
  LogoutHousingAdminResponse,
  UpdateHousingAdminAgentSettingsBody,
  UpdateHousingAdminAgentSettingsResponse,
} from "@workspace/api-zod";
import {
  ADMIN_COOKIE_NAME,
  ADMIN_SESSION_TTL_MS,
  adminPassword,
  createSessionToken,
  hasAdminSession,
  passwordMatches,
  requireAdmin,
} from "../../lib/adminAuth";
import { buildSystemPrompt, getAgentSettings, saveAgentSettings } from "../../lib/agentSettings";
import { checkApifyConnection } from "../../lib/apifyRealEstate";
import { getHousingConversation, getStudentName, isConversationFarewell, listHousingConversations, saveConversationFeedback } from "../../lib/conversations";

const router: IRouter = Router();
const previewOpenAI = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
} as const;

// Only failed sign-ins count toward the limit.
const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many sign-in attempts. Please wait and try again." },
});

// Admin responses are private and must never be cached.
router.use("/housing/admin", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

router.get("/housing/admin/session", (req, res): void => {
  res.json(GetHousingAdminSessionResponse.parse({ authenticated: hasAdminSession(req) }));
});

router.post("/housing/admin/session", loginLimiter, (req, res): void => {
  const parsed = LoginHousingAdminBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter the admin password." });
    return;
  }
  if (!adminPassword()) {
    res.status(503).json({ error: "The admin password has not been configured." });
    return;
  }
  if (!passwordMatches(parsed.data.password)) {
    res.status(401).json({ error: "That password was not accepted." });
    return;
  }
  const token = createSessionToken();
  if (!token) {
    res.status(503).json({ error: "The admin password has not been configured." });
    return;
  }
  res.cookie(ADMIN_COOKIE_NAME, token, { ...cookieOptions, maxAge: ADMIN_SESSION_TTL_MS });
  res.json(LoginHousingAdminResponse.parse({ authenticated: true }));
});

router.post("/housing/admin/logout", (_req, res): void => {
  res.clearCookie(ADMIN_COOKIE_NAME, cookieOptions);
  res.json(LogoutHousingAdminResponse.parse({ authenticated: false }));
});

router.get("/housing/admin/integrations/apify/status", requireAdmin, async (_req, res): Promise<void> => {
  try {
    res.json({ configured: true, ...(await checkApifyConnection()) });
  } catch (error) {
    const statusCode = typeof (error as { statusCode?: unknown })?.statusCode === "number" ? (error as { statusCode: number }).statusCode : 502;
    res.status(statusCode).json({ configured: Boolean(process.env.APIFY_API_TOKEN), connected: false, error: error instanceof Error ? error.message : "Could not connect to Apify." });
  }
});

router.get("/housing/admin/conversations", requireAdmin, async (req, res): Promise<void> => {
  try {
    const rows = await listHousingConversations();
    res.json({ conversations: rows.map((row) => {
      const messages = Array.isArray(row.messages) ? row.messages : [];
      const lastUser = [...messages].reverse().find((entry) => entry.role === "user");
      return {
        id: row.id,
        studentName: getStudentName(messages) ?? "Student",
        startedAt: row.createdAt.toISOString(),
        lastActiveAt: row.updatedAt.toISOString(),
        messageCount: messages.length,
        lastMessage: lastUser?.content.slice(0, 220) ?? "",
        status: lastUser && isConversationFarewell(lastUser.content) ? "Ended" : "In progress",
        feedback: row.feedback,
      };
    }) });
  } catch (error) {
    req.log.error({ err: error }, "Could not load housing conversations for admin");
    res.status(500).json({ error: "Conversation records could not be loaded." });
  }
});

router.get("/housing/admin/conversations/:id", requireAdmin, async (req, res): Promise<void> => {
  try {
    const row = await getHousingConversation(req.params.id);
    if (!row) { res.status(404).json({ error: "Conversation not found." }); return; }
    res.json({
      id: row.id,
      studentName: getStudentName(row.messages) ?? "Student",
      startedAt: row.createdAt.toISOString(),
      lastActiveAt: row.updatedAt.toISOString(),
      feedback: row.feedback,
      messages: row.messages,
    });
  } catch (error) {
    req.log.error({ err: error }, "Could not load housing conversation details");
    res.status(500).json({ error: "Conversation details could not be loaded." });
  }
});

router.post("/housing/conversations/:id/feedback", async (req, res): Promise<void> => {
  const feedback = req.body?.feedback;
  if (typeof feedback !== "string" || !["Very helpful", "Somewhat helpful", "Not helpful"].includes(feedback)) {
    res.status(400).json({ error: "Choose one of the available feedback options." });
    return;
  }
  try {
    const saved = await saveConversationFeedback(req.params.id, feedback);
    if (!saved) { res.status(404).json({ error: "Conversation not found." }); return; }
    res.json({ feedback });
  } catch (error) {
    req.log.warn({ err: error }, "Could not save conversation feedback");
    res.status(500).json({ error: "Feedback could not be saved." });
  }
});

router.get("/housing/admin/agent-settings", requireAdmin, async (req, res): Promise<void> => {
  try {
    const settings = await getAgentSettings();
    res.json(GetHousingAdminAgentSettingsResponse.parse(settings));
  } catch (error) {
    req.log.error({ err: error }, "Could not load agent settings");
    // Only reachable with a valid admin session, so a short technical reason is safe to show.
    // The database library wraps the real failure in `cause`, so look there first.
    const root = (error as { cause?: unknown })?.cause ?? error;
    const code = (root as { code?: unknown })?.code;
    if (code === "42703") {
      res.status(503).json({
        error: "The settings database schema is out of date. In Replit Development Shell, run `pnpm --filter @workspace/db run push` and approve the schema sync, then Publish the app to update production. Do not rename the database or change DATABASE_URL.",
      });
      return;
    }
    const reason = root instanceof Error && root.message
      ? root.message.split("\n")[0].slice(0, 160)
      : "Unknown error";
    res.status(500).json({
      error: "Settings could not be loaded.",
      detail: `${typeof code === "string" ? `${code}: ` : ""}${reason}`,
    });
  }
});

router.get("/housing/admin/agent-settings/preview", requireAdmin, async (req, res): Promise<void> => {
  try {
    const settings = await getAgentSettings();
    res.json({ prompt: buildSystemPrompt(settings) });
  } catch (error) {
    req.log.error({ err: error }, "Could not preview agent prompt");
    res.status(500).json({ error: "The final system prompt could not be loaded." });
  }
});

router.post("/housing/admin/agent-settings/test", requireAdmin, async (req, res): Promise<void> => {
  const message = typeof req.body?.message === "string" ? req.body.message.trim().slice(0, 1200) : "";
  if (!message) { res.status(400).json({ error: "Enter a test message." }); return; }
  if (!previewOpenAI) { res.status(503).json({ error: "The agent is not configured." }); return; }
  try {
    const settings = await getAgentSettings();
    const result = await previewOpenAI.chat.completions.create({
      model: "gpt-5-mini",
      messages: [{ role: "system", content: buildSystemPrompt(settings) }, { role: "user", content: message }],
      max_completion_tokens: 500,
    });
    res.json({ reply: result.choices[0]?.message.content ?? "The agent returned an empty response." });
  } catch (error) {
    req.log.error({ err: error }, "Agent test failed");
    res.status(502).json({ error: "The test conversation could not be completed." });
  }
});

router.put("/housing/admin/agent-settings", requireAdmin, async (req, res): Promise<void> => {
  const parsed = UpdateHousingAdminAgentSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Check the persona, tone, and scale values and try again." });
    return;
  }
  const persona = parsed.data.persona.trim();
  const tone = parsed.data.tone.trim();
  if (!persona || !tone) {
    res.status(400).json({ error: "Persona and tone cannot be blank." });
    return;
  }
  if (parsed.data.integrations.some((entry) => {
    try { return new URL(entry.url).protocol !== "https:"; } catch { return true; }
  })) {
    res.status(400).json({ error: "Integration links must use HTTPS." });
    return;
  }
  try {
    const saved = await saveAgentSettings({
      persona,
      environment: parsed.data.environment.trim(),
      tone,
      empathyScale: parsed.data.empathyScale,
      goalOrientationScale: parsed.data.goalOrientationScale,
      empathyExamples: parsed.data.empathyExamples.map((example) => example.trim()),
      goal: parsed.data.goal.trim(),
      conversationBehavior: parsed.data.conversationBehavior.trim(),
      guardrails: parsed.data.guardrails.trim(),
      handoverRules: parsed.data.handoverRules.trim(),
      knowledgeRules: parsed.data.knowledgeRules.trim(),
      ctaSettings: parsed.data.ctaSettings.trim(),
      feedbackSettings: parsed.data.feedbackSettings.trim(),
      integrations: parsed.data.integrations.map((entry) => ({ ...entry, label: entry.label.trim(), url: entry.url.trim() })),
    });
    res.json(UpdateHousingAdminAgentSettingsResponse.parse(saved));
  } catch (error) {
    req.log.error({ err: error }, "Could not save agent settings");
    res.status(500).json({ error: "Settings could not be saved. Please try again." });
  }
});

export default router;
