import { createHash, timingSafeEqual } from "node:crypto";

import { isFederalDemoMode } from "./demo-mode";

export type AccessEnvironment = {
  FDEA_DEMO_MODE?: string;
  FDEA_ADMIN_USERNAME?: string;
  FDEA_ADMIN_PASSWORD?: string;
};

export type AccessDecision = "demo" | "unconfigured" | "authorized" | "unauthorized";

function constantTimeEqual(left: string, right: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();
  return timingSafeEqual(digest(left), digest(right));
}

/** HTTP Basic is a deployment access gate; use only over HTTPS.
 * CAIAE remains authoritative for scoped actions and audit records.
 */
export function evaluateAccess(
  authorization: string | null,
  env: AccessEnvironment = process.env as AccessEnvironment,
): AccessDecision {
  if (isFederalDemoMode(env)) return "demo";
  const username = env.FDEA_ADMIN_USERNAME?.trim();
  const password = env.FDEA_ADMIN_PASSWORD;
  if (!username || !password || password.trim().length < 16) return "unconfigured";
  if (!authorization?.startsWith("Basic ") || authorization.length > 8192) {
    return "unauthorized";
  }
  const encoded = authorization.slice(6);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0) {
    return "unauthorized";
  }
  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  const colon = decoded.indexOf(":");
  if (colon < 1) return "unauthorized";
  const suppliedUsername = decoded.slice(0, colon);
  const suppliedPassword = decoded.slice(colon + 1);
  const usernameMatches = constantTimeEqual(suppliedUsername, username);
  const passwordMatches = constantTimeEqual(suppliedPassword, password);
  return usernameMatches && passwordMatches ? "authorized" : "unauthorized";
}
