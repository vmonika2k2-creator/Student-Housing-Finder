import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export const ADMIN_COOKIE_NAME = "housing_admin_session";
export const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000;

function sha256(value: string): Buffer {
  return crypto.createHash("sha256").update(value).digest();
}

/** The admin password comes from the ADMIN_PASSWORD secret. */
export function adminPassword(): string | null {
  const password = process.env.ADMIN_PASSWORD;
  return password && password.length > 0 ? password : null;
}

export function passwordMatches(candidate: string): boolean {
  const expected = adminPassword();
  if (!expected) return false;
  return crypto.timingSafeEqual(sha256(candidate), sha256(expected));
}

// Session tokens are signed with a key derived from the admin password (or
// ADMIN_SESSION_SECRET when set), so changing the password signs everyone out.
function signingKey(): Buffer | null {
  const secret = process.env.ADMIN_SESSION_SECRET || adminPassword();
  return secret ? sha256(`housing-admin-session:${secret}`) : null;
}

function sign(payload: string, key: Buffer): string {
  return crypto.createHmac("sha256", key).update(payload).digest("base64url");
}

export function createSessionToken(now = Date.now()): string | null {
  const key = signingKey();
  if (!key) return null;
  const payload = String(now + ADMIN_SESSION_TTL_MS);
  return `${payload}.${sign(payload, key)}`;
}

export function isValidSessionToken(token: unknown, now = Date.now()): boolean {
  if (typeof token !== "string") return false;
  const key = signingKey();
  if (!key) return false;
  const [payload, signature, ...rest] = token.split(".");
  if (!payload || !signature || rest.length > 0) return false;
  const expected = sign(payload, key);
  const given = Buffer.from(signature);
  const wanted = Buffer.from(expected);
  if (given.length !== wanted.length) return false;
  if (!crypto.timingSafeEqual(given, wanted)) return false;
  const expiresAt = Number(payload);
  return Number.isFinite(expiresAt) && expiresAt > now;
}

export function hasAdminSession(req: Request): boolean {
  const cookies = req.cookies as Record<string, unknown> | undefined;
  return isValidSessionToken(cookies?.[ADMIN_COOKIE_NAME]);
}

export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!hasAdminSession(req)) {
    res.status(401).json({ error: "Admin session required." });
    return;
  }
  next();
}
