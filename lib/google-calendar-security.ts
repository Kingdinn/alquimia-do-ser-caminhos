import {createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual} from "node:crypto";

export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.app.created";
export const CALENDAR_SCOPES = ["openid", CALENDAR_SCOPE] as const;
export const OAUTH_COOKIE = "alquimia_calendar_oauth";
export type CalendarOAuthState = {owner: string; session: string; nonce: string; verifier: string; timeZone: string; expires: number};

export function encryptionKey(value: string): Buffer {
  const key = Buffer.from(value, "base64");
  if (key.length !== 32 || key.toString("base64") !== value) throw new Error("calendar_not_configured");
  return key;
}

/** AES-GCM also binds each secret to its purpose/account; ciphertext cannot be transplanted. */
export function seal(value: unknown, key: Buffer, context: string): string {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(`alquimia-calendar-v1:${context}`));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}
export function unseal<T>(sealed: string, key: Buffer, context: string): T {
  const [version, iv, tag, ciphertext, extra] = sealed.split(".");
  if (version !== "v1" || !iv || !tag || !ciphertext || extra || sealed.length > 24000) throw new Error("invalid_calendar_secret");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(`alquimia-calendar-v1:${context}`));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8")) as T;
}
export const digest = (value: string): string => createHash("sha256").update(value).digest("hex");
export const safeEqual = (a: string, b: string): boolean => {const left = Buffer.from(a), right = Buffer.from(b); return left.length === right.length && timingSafeEqual(left, right);};
export function isTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 100 || !value) return false;
  try {new Intl.DateTimeFormat("en", {timeZone: value}).format(); return true;} catch {return false;}
}
export function makeOAuthState(owner: string, session: string, timeZone: string, now = Date.now()): CalendarOAuthState {
  if (!owner || !session || !isTimeZone(timeZone)) throw new Error("invalid_request");
  return {owner, session: digest(session), timeZone, nonce: randomBytes(32).toString("base64url"), verifier: randomBytes(48).toString("base64url"), expires: now + 600000};
}
export function verifyOAuthState(state: CalendarOAuthState, nonce: string, owner: string, session: string, now = Date.now()): boolean {
  return !!state && typeof state.nonce === "string" && typeof state.verifier === "string" && state.verifier.length >= 43 && state.verifier.length <= 128 && state.owner === owner && state.session === digest(session) && Number.isFinite(state.expires) && state.expires > now && state.expires <= now + 600000 && isTimeZone(state.timeZone) && safeEqual(state.nonce, nonce);
}
export function authorizationUrl(clientId: string, redirectUri: string, state: CalendarOAuthState): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({client_id: clientId, redirect_uri: redirectUri, response_type: "code", scope: CALENDAR_SCOPES.join(" "), access_type: "offline", include_granted_scopes: "true", prompt: "consent", state: state.nonce, code_challenge: createHash("sha256").update(state.verifier).digest("base64url"), code_challenge_method: "S256"}).toString();
  return url.toString();
}
export function validateCalendarRequest(request: Request, owner: string, mutating: boolean, siteOrigin: string): "account_changed" | "invalid_origin" | null {
  const expected = request.headers.get("X-Journal-Owner");
  if ((mutating && !expected) || (expected !== null && expected !== owner)) return "account_changed";
  if (mutating && (request.headers.get("origin") !== siteOrigin || new URL(request.url).origin !== siteOrigin)) return "invalid_origin";
  return null;
}
