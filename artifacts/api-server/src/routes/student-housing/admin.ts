import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
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
import { getAgentSettings, saveAgentSettings } from "../../lib/agentSettings";

const router: IRouter = Router();

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

router.get("/housing/admin/agent-settings", requireAdmin, async (req, res): Promise<void> => {
  try {
    const settings = await getAgentSettings();
    res.json(GetHousingAdminAgentSettingsResponse.parse(settings));
  } catch (error) {
    req.log.error({ err: error }, "Could not load agent settings");
    res.status(500).json({ error: "Settings could not be loaded." });
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
  try {
    const saved = await saveAgentSettings({
      persona,
      tone,
      empathyScale: parsed.data.empathyScale,
      goalOrientationScale: parsed.data.goalOrientationScale,
      empathyExamples: parsed.data.empathyExamples.map((example) => example.trim()),
      goal: parsed.data.goal.trim(),
    });
    res.json(UpdateHousingAdminAgentSettingsResponse.parse(saved));
  } catch (error) {
    req.log.error({ err: error }, "Could not save agent settings");
    res.status(500).json({ error: "Settings could not be saved. Please try again." });
  }
});

export default router;
