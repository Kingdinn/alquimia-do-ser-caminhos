import "server-only";
import {randomUUID} from "node:crypto";
import {createClient as createServiceClient} from "@supabase/supabase-js";
import {cookies} from "next/headers";
import {NextResponse} from "next/server";
import {createClient, currentUser} from "./supabase/server";
import {readLimitedBody} from "./limits";
import {authorizationUrl, CALENDAR_SCOPE, digest, encryptionKey, isTimeZone, makeOAuthState, OAUTH_COOKIE, seal, unseal, validateCalendarRequest, verifyOAuthState, type CalendarOAuthState} from "./google-calendar-security";
import {dateInTimeZone, googleEventId, mapCalendarBlocks} from "./google-calendar-mapping";
import {reconcileCalendar, type CalendarConnectionData, type CalendarProviderEvent} from "./google-calendar-sync";
import type {Block} from "../app/content";

export type CalendarErrorCode = "calendar_not_configured" | "unauthenticated" | "account_changed" | "invalid_origin" | "invalid_request" | "invalid_oauth_state" | "consent_denied" | "insufficient_scope" | "refresh_token_missing" | "reconnect_required" | "different_google_account" | "calendar_busy" | "calendar_unavailable" | "calendar_creation_uncertain" | "calendar_missing" | "invalid_schedule" | "invalid_schedule_timezone" | "event_ownership_conflict";
export type CalendarStatus = {ownerId: string; configured: boolean; connected: boolean; calendarName: string | null; timeZone: string | null; lastSyncedAt: string | null; syncedVersion: number; needsSync: boolean; syncing: boolean; errorCode: CalendarErrorCode | null};
type Config = {origin: string; clientId: string; clientSecret: string; key: Buffer; supabaseUrl: string; serviceKey: string};
type Credentials = {refreshToken: string; accessToken?: string; expiresAt?: number; scope: string};
type StoredData = CalendarConnectionData & {calendarCreationPending?: boolean};
type Row = {data: StoredData; credentials: string | null; syncing: boolean; lease: string | null};
const errors = new Set<CalendarErrorCode>(["calendar_not_configured", "unauthenticated", "account_changed", "invalid_origin", "invalid_request", "invalid_oauth_state", "consent_denied", "insufficient_scope", "refresh_token_missing", "reconnect_required", "different_google_account", "calendar_busy", "calendar_unavailable", "calendar_creation_uncertain", "calendar_missing", "invalid_schedule", "invalid_schedule_timezone", "event_ownership_conflict"]);
const unavailable = () => new Error("calendar_unavailable");
export function calendarConfig(): Config | null {
  if (process.env.GOOGLE_CALENDAR_ENABLED !== "true") return null;
  const {NEXT_PUBLIC_SITE_URL, GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET, GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY, NEXT_PUBLIC_SUPABASE_URL} = process.env;
  const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!NEXT_PUBLIC_SITE_URL || !GOOGLE_CALENDAR_CLIENT_ID || !GOOGLE_CALENDAR_CLIENT_SECRET || !GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY || !NEXT_PUBLIC_SUPABASE_URL || !serviceKey) return null;
  try {
    const site = new URL(NEXT_PUBLIC_SITE_URL);
    if (site.protocol !== "https:" && !(site.protocol === "http:" && ["localhost", "127.0.0.1"].includes(site.hostname))) return null;
    return {origin: site.origin, clientId: GOOGLE_CALENDAR_CLIENT_ID, clientSecret: GOOGLE_CALENDAR_CLIENT_SECRET, key: encryptionKey(GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY), supabaseUrl: NEXT_PUBLIC_SUPABASE_URL, serviceKey};
  } catch {return null;}
}
function service(config: Config) {
  return createServiceClient(config.supabaseUrl, config.serviceKey, {auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false}});
}
async function transition<T>(config: Config, owner: string, action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const {data, error} = await service(config).rpc("alquimia_calendar_state", {p_owner: owner, p_action: action, p_payload: payload});
  if (error) {
    if (error.message.includes("calendar_busy")) throw new Error("calendar_busy");
    if (error.message.includes("different_google_account")) throw new Error("different_google_account");
    if (error.message.includes("invalid_oauth_state")) throw new Error("invalid_oauth_state");
    throw unavailable();
  }
  return data as T;
}
async function notebook(owner: string): Promise<{version: number; blocks: Block[]}> {
  const db = await createClient();
  const {data, error} = await db.from("alquimia_journals").select("body,version").eq("owner", owner).maybeSingle();
  if (error) throw unavailable();
  if (data && (!data.body || !Array.isArray(data.body.blocks))) throw new Error("invalid_schedule");
  return {version: data?.version ?? 0, blocks: data?.body.blocks ?? []};
}
async function sessionIdentity(): Promise<{owner: string; session: string}> {
  const user = await currentUser();
  if (!user) throw new Error("unauthenticated");
  const db = await createClient();
  const {data, error} = await db.auth.getClaims();
  const claims = data?.claims;
  if (error || claims?.sub !== user.id || typeof claims.session_id !== "string" || !claims.session_id) throw new Error("unauthenticated");
  return {owner: user.id, session: claims.session_id};
}
async function requestIdentity(request: Request, mutating: boolean): Promise<{owner: string; config: Config | null}> {
  const user = await currentUser();
  if (!user) throw new Error("unauthenticated");
  const config = calendarConfig();
  const origin = config?.origin ?? (() => {try {return new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "").origin;} catch {return "";}})();
  const problem = validateCalendarRequest(request, user.id, mutating, origin);
  if (problem) throw new Error(problem);
  return {owner: user.id, config};
}
export function calendarErrorCode(error: unknown): CalendarErrorCode {
  return error instanceof Error && errors.has(error.message as CalendarErrorCode) ? error.message as CalendarErrorCode : "calendar_unavailable";
}
function json(value: unknown, status = 200): Response {
  return Response.json(value, {status, headers: {"Cache-Control": "private, no-store", "Vary": "Cookie", "Referrer-Policy": "no-referrer"}});
}
function failure(error: unknown): Response {
  const errorCode = calendarErrorCode(error);
  return json({errorCode}, errorCode === "unauthenticated" ? 401 : ["account_changed", "invalid_origin"].includes(errorCode) ? 403 : errorCode === "calendar_busy" ? 409 : ["invalid_request", "invalid_oauth_state"].includes(errorCode) ? 400 : 503);
}
async function statusFor(owner: string, config: Config | null): Promise<CalendarStatus> {
  const result: CalendarStatus = {ownerId: owner, configured: !!config, connected: false, calendarName: null, timeZone: null, lastSyncedAt: null, syncedVersion: -1, needsSync: false, syncing: false, errorCode: null};
  if (!config) return result;
  const [row, saved] = await Promise.all([transition<Row | null>(config, owner, "read"), notebook(owner)]);
  if (!row?.credentials) return result;
  return {...result, connected: true, calendarName: row.data.calendarId ? "Alquimia do Ser" : null, timeZone: row.data.timeZone, lastSyncedAt: row.data.lastSyncedAt, syncedVersion: row.data.syncedVersion, needsSync: saved.version !== row.data.syncedVersion || !!row.data.errorCode, syncing: !!row.syncing, errorCode: errors.has(row.data.errorCode as CalendarErrorCode) ? row.data.errorCode as CalendarErrorCode : null};
}
export async function calendarStatus(request: Request): Promise<Response> {
  try {const {owner, config} = await requestIdentity(request, false); return json(await statusFor(owner, config));} catch (error) {return failure(error);}
}
async function googleFetch(url: string, init: RequestInit = {}): Promise<Response> {
  try {return await fetch(url, {...init, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000)});} catch {throw unavailable();}
}
async function tokenRequest(config: Config, values: Record<string, string>): Promise<{access_token: string; refresh_token?: string; expires_in: number; scope?: string}> {
  const response = await googleFetch("https://oauth2.googleapis.com/token", {method: "POST", headers: {"Content-Type": "application/x-www-form-urlencoded"}, body: new URLSearchParams({client_id: config.clientId, client_secret: config.clientSecret, ...values})});
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error === "invalid_grant" ? "reconnect_required" : "calendar_unavailable");
  if (typeof body.access_token !== "string" || !body.access_token || !Number.isFinite(body.expires_in) || body.expires_in <= 0) throw unavailable();
  return body;
}
const callbackUri = (config: Config) => `${config.origin}/api/calendar/callback`;
export async function calendarConnect(request: Request): Promise<Response> {
  try {
    const {owner, config} = await requestIdentity(request, true);
    if (!config) throw new Error("calendar_not_configured");
    let input: {timeZone?: unknown};
    try {input = JSON.parse(new TextDecoder().decode(await readLimitedBody(request, 1024)));} catch {throw new Error("invalid_request");}
    if (!input || !isTimeZone(input.timeZone)) throw new Error("invalid_request");
    const identity = await sessionIdentity();
    if (identity.owner !== owner) throw new Error("account_changed");
    const state = makeOAuthState(owner, identity.session, input.timeZone);
    await transition(config, owner, "oauth_begin", {nonce: digest(state.nonce), session: state.session});
    (await cookies()).set(OAUTH_COOKIE, seal(state, config.key, "oauth"), {httpOnly: true, secure: config.origin.startsWith("https:"), sameSite: "lax", path: "/api/calendar", maxAge: 600});
    return json({ownerId: owner, url: authorizationUrl(config.clientId, callbackUri(config), state)});
  } catch (error) {return failure(error);}
}
export async function calendarCallback(request: Request): Promise<Response> {
  const config = calendarConfig();
  let result = "connected";
  try {
    if (!config) throw new Error("calendar_not_configured");
    const {owner, session} = await sessionIdentity(), url = new URL(request.url);
    const encrypted = (await cookies()).get(OAUTH_COOKIE)?.value;
    if (!encrypted) throw new Error("invalid_oauth_state");
    let state: CalendarOAuthState;
    try {state = unseal<CalendarOAuthState>(encrypted, config.key, "oauth");} catch {throw new Error("invalid_oauth_state");}
    if (!verifyOAuthState(state, url.searchParams.get("state") ?? "", owner, session)) throw new Error("invalid_oauth_state");
    const consumed = await transition<boolean>(config, owner, "oauth_consume", {nonce: digest(state.nonce), session: state.session});
    if (!consumed) throw new Error("invalid_oauth_state");
    if (url.searchParams.has("error")) throw new Error("consent_denied");
    const code = url.searchParams.get("code");
    if (!code || code.length > 4000) throw new Error("invalid_oauth_state");
    const token = await tokenRequest(config, {grant_type: "authorization_code", code, code_verifier: state.verifier, redirect_uri: callbackUri(config)});
    if (!token.scope?.split(" ").includes(CALENDAR_SCOPE)) throw new Error("insufficient_scope");
    const identityResponse = await googleFetch("https://openidconnect.googleapis.com/v1/userinfo", {headers: {Authorization: `Bearer ${token.access_token}`}});
    if (!identityResponse.ok) throw new Error("reconnect_required");
    const google = await identityResponse.json();
    if (typeof google.sub !== "string" || !google.sub || google.sub.length > 255) throw new Error("reconnect_required");
    const previous = await transition<Row | null>(config, owner, "read");
    const previousCredentials = previous?.credentials && previous.data.googleSubject === google.sub ? unseal<Credentials>(previous.credentials, config.key, `tokens:${owner}`) : null;
    const refreshToken = token.refresh_token || previousCredentials?.refreshToken;
    if (!refreshToken) throw new Error("refresh_token_missing");
    const credentials: Credentials = {refreshToken, accessToken: token.access_token, expiresAt: Date.now() + token.expires_in * 1000, scope: token.scope};
    const data: StoredData = {connectionId: randomUUID(), googleSubject: google.sub, timeZone: state.timeZone, legacyAnchor: dateInTimeZone(new Date(), state.timeZone), calendarId: null, events: {}, syncedVersion: -1, lastSyncedAt: null, errorCode: null};
    await transition(config, owner, "connect", {credentials: seal(credentials, config.key, `tokens:${owner}`), data, nonce: digest(state.nonce), session: state.session});
  } catch (error) {result = calendarErrorCode(error);}
  const jar = await cookies(); jar.set(OAUTH_COOKIE, "", {path: "/api/calendar", httpOnly: true, secure: config?.origin.startsWith("https:") ?? true, sameSite: "lax", maxAge: 0});
  let origin: string;
  try {origin = config?.origin ?? new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "").origin;} catch {return failure(new Error("calendar_not_configured"));}
  const target = new URL("/", origin); target.searchParams.set("calendar", result);
  const response = NextResponse.redirect(target);
  response.headers.set("Cache-Control", "private, no-store"); response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export async function calendarSync(request: Request): Promise<Response> {
  let config: Config | null = null, owner = "", lease = "", row: Row | null = null;
  try {
    ({owner, config} = await requestIdentity(request, true));
    if (!config) throw new Error("calendar_not_configured");
    const activeConfig = config;
    let force = false;
    try {
      const raw = await readLimitedBody(request, 1024);
      if (raw.length) {const body = JSON.parse(new TextDecoder().decode(raw)); if (!body || (body.force !== undefined && typeof body.force !== "boolean")) throw new Error(); force = body.force === true;}
    } catch {throw new Error("invalid_request");}
    lease = randomUUID(); row = await transition<Row | null>(config, owner, "acquire", {lease});
    if (!row) {const status = await statusFor(owner, config); return json(status, status.connected ? 202 : 200);}
    const currentRow = row;
    let credentials = unseal<Credentials>(row.credentials!, config.key, `tokens:${owner}`);
    const persist = async (data: CalendarConnectionData | StoredData) => {
      const next = await transition<Row>(activeConfig, owner, "checkpoint", {lease, data, credentials: seal(credentials, activeConfig.key, `tokens:${owner}`)});
      currentRow.data = next.data; currentRow.credentials = next.credentials;
    };
    if (force) {
      await persist({...currentRow.data, syncedVersion: -1, events: Object.fromEntries(Object.entries(currentRow.data.events).map(([id, entry]) => [id, {...entry, hash: null}]))});
    }
    if (!credentials.accessToken || !credentials.expiresAt || credentials.expiresAt < Date.now() + 60000) {
      const token = await tokenRequest(config, {grant_type: "refresh_token", refresh_token: credentials.refreshToken});
      if (token.scope && !token.scope.split(" ").includes(CALENDAR_SCOPE)) throw new Error("insufficient_scope");
      credentials = {refreshToken: token.refresh_token || credentials.refreshToken, accessToken: token.access_token, expiresAt: Date.now() + token.expires_in * 1000, scope: token.scope ?? credentials.scope};
      await persist(currentRow.data);
    }
    const api = async (path: string, init: RequestInit = {}): Promise<Response> => {
      // Check/extend the fence before each external call; request timeouts are shorter than the lease.
      await persist(currentRow.data);
      const response = await googleFetch(`https://www.googleapis.com/calendar/v3/${path}`, {...init, headers: {...init.headers, Authorization: `Bearer ${credentials.accessToken}`, "Content-Type": "application/json"}});
      if (response.status === 401) throw new Error("reconnect_required");
      if (response.status === 403) {
        const details = await response.json().catch(() => ({}));
        const reason = details.error?.errors?.[0]?.reason;
        throw new Error(["rateLimitExceeded", "userRateLimitExceeded", "quotaExceeded"].includes(reason) ? "calendar_unavailable" : "insufficient_scope");
      }
      if (response.status === 429 || response.status >= 500) throw unavailable();
      return response;
    };
    if (!currentRow.data.calendarId) {
      if (currentRow.data.calendarCreationPending) throw new Error("calendar_creation_uncertain");
      await persist({...currentRow.data, calendarCreationPending: true});
      const response = await api("calendars", {method: "POST", body: JSON.stringify({summary: "Alquimia do Ser", description: `Agenda criada pela Alquimia do Ser. ${currentRow.data.connectionId}`, timeZone: currentRow.data.timeZone})});
      if (!response.ok) throw new Error("calendar_creation_uncertain");
      const calendar = await response.json();
      if (typeof calendar.id !== "string" || !calendar.id) throw new Error("calendar_creation_uncertain");
      await persist({...currentRow.data, calendarId: calendar.id, calendarCreationPending: false});
    }
    const source = await notebook(owner);
    const desired = mapCalendarBlocks(source.blocks, owner, currentRow.data.connectionId, currentRow.data.timeZone, currentRow.data.legacyAnchor);
    const path = `calendars/${encodeURIComponent(currentRow.data.calendarId!)}/events`;
    // Detect a deleted/inaccessible dedicated calendar before treating event 404s as missing entries.
    const health = await api(`${path}?maxResults=1&fields=kind`);
    if (health.status === 404 || health.status === 410) throw new Error("calendar_missing");
    if (!health.ok) throw unavailable();
    const deadline = Date.now() + 15000;
    await reconcileCalendar({owner, data: currentRow.data, desired, version: source.version, eventId: (block, revision) => googleEventId(owner, currentRow.data.connectionId, block, revision), checkpoint: persist, shouldStop: () => Date.now() > deadline, provider: {
      get: async id => {const response = await api(`${path}/${encodeURIComponent(id)}`); if (response.status === 404) return null; if (response.status === 410) return {id, status: "cancelled"}; if (!response.ok) throw unavailable(); return await response.json() as CalendarProviderEvent;},
      insert: async event => {const response = await api(path, {method: "POST", body: JSON.stringify(event)}); if (response.status === 409) return "exists"; if (!response.ok) throw unavailable(); return "created";},
      update: async (id, event) => {const response = await api(`${path}/${encodeURIComponent(id)}`, {method: "PATCH", body: JSON.stringify({...event, recurrence: event.recurrence ?? []})}); if (!response.ok) throw unavailable();},
      remove: async id => {const response = await api(`${path}/${encodeURIComponent(id)}`, {method: "DELETE"}); if (!response.ok && response.status !== 404 && response.status !== 410) throw unavailable();},
    }});
    await transition(config, owner, "release", {lease}); lease = "";
    const status = await statusFor(owner, config);
    return json(status, status.needsSync ? 202 : 200);
  } catch (error) {
    const errorCode = calendarErrorCode(error);
    if (config && owner && row && lease) {
      try {await transition(config, owner, "checkpoint", {lease, data: {...row.data, errorCode}, credentials: row.credentials});} catch {/* A newer lease owns progress; do not overwrite it. */}
    }
    return failure(error);
  } finally {
    if (config && owner && lease) {try {await transition(config, owner, "release", {lease});} catch {/* Lease also expires if the request is interrupted. */}}
  }
}
export async function calendarDisconnect(request: Request): Promise<Response> {
  try {
    const {owner, config} = await requestIdentity(request, true);
    if (!config) throw new Error("calendar_not_configured");
    await transition(config, owner, "disconnect");
    // Removing tokens stops this app. Do not revoke project-wide Google grants used by Google sign-in.
    return json(await statusFor(owner, config));
  } catch (error) {return failure(error);}
}

/** Explicit repair only: previous Google calendars are never deleted by this action. */
export async function calendarReset(request: Request): Promise<Response> {
  let config: Config | null = null, owner = "", lease = "";
  try {
    ({owner, config} = await requestIdentity(request, true));
    if (!config) throw new Error("calendar_not_configured");
    let input;
    try {input = JSON.parse(new TextDecoder().decode(await readLimitedBody(request, 1024)));} catch {throw new Error("invalid_request");}
    if (input?.confirm !== true) throw new Error("invalid_request");
    lease = randomUUID();
    const row = await transition<Row | null>(config, owner, "acquire", {lease});
    if (!row) throw new Error("calendar_busy");
    if (!row.data.calendarCreationPending && row.data.errorCode !== "calendar_creation_uncertain" && row.data.errorCode !== "calendar_missing") throw new Error("invalid_request");
    const data: StoredData = {...row.data, connectionId: randomUUID(), calendarId: null, calendarCreationPending: false, legacyAnchor: dateInTimeZone(new Date(), row.data.timeZone), events: {}, syncedVersion: -1, lastSyncedAt: null, errorCode: null};
    await transition(config, owner, "checkpoint", {lease, data, credentials: row.credentials});
    await transition(config, owner, "release", {lease}); lease = "";
    return json(await statusFor(owner, config));
  } catch (error) {return failure(error);} finally {
    if (config && owner && lease) {try {await transition(config, owner, "release", {lease});} catch {/* Lease expiry also permits retry. */}}
  }
}
