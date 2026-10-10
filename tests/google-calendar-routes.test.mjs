import test, {after, beforeEach} from "node:test";
import assert from "node:assert/strict";
import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import {randomBytes} from "node:crypto";
import ts from "typescript";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const compiled = await mkdtemp(path.join(root, ".calendar-route-tests-"));
const originalFetch = globalThis.fetch;
const envNames = ["GOOGLE_CALENDAR_ENABLED", "GOOGLE_CALENDAR_CLIENT_ID", "GOOGLE_CALENDAR_CLIENT_SECRET", "GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY", "NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY"];
const originalEnv = new Map(envNames.map(name => [name, process.env[name]]));
after(async () => {globalThis.fetch = originalFetch; for (const [name, value] of originalEnv) {if (value === undefined) delete process.env[name]; else process.env[name] = value;} await rm(compiled, {recursive: true, force: true});});
for (const module of ["google-calendar-server", "google-calendar-security", "google-calendar-mapping", "google-calendar-sync", "limits"]) {
  let source = await readFile(path.join(root, "lib", `${module}.ts`), "utf8");
  source = source.replace('import "server-only";', "")
    .replace('import {createClient as createServiceClient} from "@supabase/supabase-js";', 'import {createServiceClient} from "./fixture.mjs";')
    .replace('from "next/headers"', 'from "./fixture.mjs"').replace('from "next/server"', 'from "./fixture.mjs"')
    .replace('from "./supabase/server"', 'from "./fixture.mjs"');
  for (const name of ["google-calendar-security", "google-calendar-mapping", "google-calendar-sync", "limits"]) source = source.replaceAll(`"./${name}"`, `"./${name}.mjs"`);
  await writeFile(path.join(compiled, `${module}.mjs`), ts.transpileModule(source, {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext}}).outputText);
}
await writeFile(path.join(compiled, "fixture.mjs"), `
export const state = {owner: 'account-A', session: 'session-A', rows: new Map(), attempts: new Map(), jar: new Map(), calls: [], googleCalls: []};
export const currentUser = async () => state.owner ? {id: state.owner} : null;
export const cookies = async () => ({get: name => state.jar.has(name) ? {value: state.jar.get(name)} : undefined, set: (name,value,options) => {if(options?.maxAge===0) state.jar.delete(name);else state.jar.set(name,value);}});
export const NextResponse = {redirect: url => new Response(null,{status:307,headers:{Location:String(url)}})};
export const createClient = async () => ({auth:{getClaims:async()=>({data:{claims:{sub:state.owner,session_id:state.session}}})},from:()=>({select:()=>({eq:(key,owner)=>({maybeSingle:async()=>({data:{body:{blocks:[]},version:1},error:null})})})})});
export const createServiceClient = () => ({rpc:async(name,{p_owner:owner,p_action:action,p_payload:p})=>{
  state.calls.push({owner,action});
  let row=state.rows.get(owner), attempt=state.attempts.get(owner);
  const ok=data=>({data:structuredClone(data),error:null}), fail=message=>({data:null,error:{message}});
  if(action==='oauth_begin'){state.attempts.set(owner,{...p,consumed:false});return ok(true);}
  if(action==='oauth_consume'){if(!attempt||attempt.consumed||attempt.nonce!==p.nonce||attempt.session!==p.session)return ok(false);attempt.consumed=true;return ok(true);}
  if(action==='connect'){
    if(!attempt||!attempt.consumed||attempt.nonce!==p.nonce||attempt.session!==p.session)return fail('invalid_oauth_state');
    if(row?.syncing)return fail('calendar_busy');
    if(row?.credentials&&row.data.googleSubject!==p.data.googleSubject)return fail('different_google_account');
    row={data:row?.data.googleSubject===p.data.googleSubject?{...row.data,timeZone:p.data.timeZone,syncedVersion:-1,errorCode:null}:p.data,credentials:p.credentials,syncing:false,lease:null};state.rows.set(owner,row);state.attempts.delete(owner);return ok(row);
  }
  if(action==='read')return ok(row??null);
  if(action==='disconnect'){if(row?.syncing)return fail('calendar_busy');state.attempts.delete(owner);if(row){row.credentials=null;row.data.errorCode=null;}return ok(true);}
  if(action==='acquire'){if(!row?.credentials||row.syncing)return ok(null);row.syncing=true;row.lease=p.lease;return ok(row);}
  if(action==='checkpoint'){if(!row||row.lease!==p.lease)return fail('calendar_lease_lost');row.data=p.data;row.credentials=p.credentials;return ok(row);}
  if(action==='release'){if(row?.lease===p.lease){row.syncing=false;row.lease=null;}return ok(true);}
  throw Error('unexpected RPC action');
}});
`);
const api = await import(pathToFileURL(path.join(compiled, "google-calendar-server.mjs")).href);
const {state} = await import(pathToFileURL(path.join(compiled, "fixture.mjs")).href);
const security = await import(pathToFileURL(path.join(compiled, "google-calendar-security.mjs")).href);
let pauseIdentity = null;
beforeEach(() => {
  Object.assign(process.env, {GOOGLE_CALENDAR_ENABLED: "true", GOOGLE_CALENDAR_CLIENT_ID: "test-client", GOOGLE_CALENDAR_CLIENT_SECRET: "synthetic-client-secret", GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("base64"), NEXT_PUBLIC_SITE_URL: "https://example.com", NEXT_PUBLIC_SUPABASE_URL: "https://database.example.com", SUPABASE_SECRET_KEY: "synthetic-service-secret"});
  state.owner = "account-A"; state.session = "session-A"; state.rows.clear(); state.attempts.clear(); state.jar.clear(); state.calls.length = 0; state.googleCalls.length = 0; pauseIdentity = null;
  globalThis.fetch = async (url, options) => {
    state.googleCalls.push({url, method: options?.method});
    if (url === "https://oauth2.googleapis.com/token") return Response.json({access_token: "synthetic-access", refresh_token: "synthetic-refresh", expires_in: 3600, scope: security.CALENDAR_SCOPE+" openid"});
    if (url === "https://openidconnect.googleapis.com/v1/userinfo") {if(pauseIdentity) await pauseIdentity;return Response.json({sub: "google-A"});}
    throw Error("Unexpected external request: "+url);
  };
});
const request = (route, method = "GET", body, extra = {}) => new Request(`https://example.com/api/calendar/${route}`, {method, headers: {Origin: "https://example.com", "X-Journal-Owner": state.owner??"account-A", ...extra}, ...(body === undefined ? {} : {body: JSON.stringify(body)})});
async function begin() {
  const response = await api.calendarConnect(request("connect", "POST", {timeZone: "UTC"}));
  assert.equal(response.status, 200); const body = await response.json();
  const oauth = new URL(body.url); return {nonce: oauth.searchParams.get("state"), cookie: state.jar.get(security.OAUTH_COOKIE)};
}
const callback = nonce => new Request(`https://example.com/api/calendar/callback?state=${encodeURIComponent(nonce)}&code=synthetic-code`);

test("disabled Calendar status still requires authentication and performs no storage or Google call", async () => {
  process.env.GOOGLE_CALENDAR_ENABLED = "false";
  state.owner = null; assert.equal((await api.calendarStatus(request("status"))).status, 401);
  state.owner = "account-A"; const response = await api.calendarStatus(request("status"));
  assert.equal(response.status, 200); const body = await response.json(); assert.equal(body.configured, false); assert.equal(body.connected, false);
  assert.equal(state.calls.length, 0); assert.equal(state.googleCalls.length, 0);
});

test("mutations reject account switches, missing origin and invalid input before OAuth requests", async () => {
  assert.equal((await api.calendarConnect(request("connect", "POST", {timeZone:"UTC"}, {"X-Journal-Owner":"account-B"}))).status, 403);
  assert.equal((await api.calendarDisconnect(new Request("https://example.com/api/calendar/connection", {method:"DELETE",headers:{"X-Journal-Owner":"account-A"}}))).status, 403);
  assert.equal((await api.calendarConnect(request("connect", "POST", {timeZone:"Invalid/Zone"}))).status, 400);
  assert.equal(state.calls.length, 0); assert.equal(state.googleCalls.length, 0);
});

test("OAuth callback stores only sealed tokens, returns safe status, and cannot be replayed", async () => {
  const attempt = await begin();
  const response = await api.calendarCallback(callback(attempt.nonce));
  assert.equal(response.headers.get("location"), "https://example.com/?calendar=connected");
  assert.ok(state.rows.get("account-A").credentials.startsWith("v1."));
  assert.equal(JSON.stringify(state.rows.get("account-A")).includes("synthetic-refresh"), false);
  const status = await api.calendarStatus(request("status")); const body = await status.json();
  assert.equal(body.connected, true); assert.equal(body.ownerId, "account-A");
  assert.equal(JSON.stringify(body).includes("credentials"), false); assert.equal(JSON.stringify(body).includes("v1."), false);
  state.jar.set(security.OAUTH_COOKIE, attempt.cookie);
  assert.match((await api.calendarCallback(callback(attempt.nonce))).headers.get("location"), /invalid_oauth_state/);
  assert.equal(state.googleCalls.filter(call=>call.url.includes("/token")).length, 1);
});

test("changed login sessions and another account cannot consume a pending OAuth connection", async () => {
  const attempt = await begin(); state.owner = "account-B";
  assert.match((await api.calendarCallback(callback(attempt.nonce))).headers.get("location"), /invalid_oauth_state/);
  state.owner = "account-A"; state.session = "new-session"; state.jar.set(security.OAUTH_COOKIE, attempt.cookie);
  assert.match((await api.calendarCallback(callback(attempt.nonce))).headers.get("location"), /invalid_oauth_state/);
  assert.equal(state.googleCalls.length, 0); assert.equal(state.rows.size, 0);
});

test("disconnect during OAuth exchange invalidates final credential commit", async () => {
  const attempt = await begin(); let release; pauseIdentity = new Promise(resolve=>{release=resolve;});
  const result = api.calendarCallback(callback(attempt.nonce));
  for(let tick=0;tick<100&&!state.googleCalls.some(call=>call.url.includes("userinfo"));tick++) await new Promise(resolve=>setImmediate(resolve));
  assert.ok(state.googleCalls.some(call=>call.url.includes("userinfo")));
  const disconnected = await api.calendarDisconnect(request("connection", "DELETE")); assert.equal(disconnected.status, 200);
  release();
  assert.match((await result).headers.get("location"), /invalid_oauth_state/);
  assert.equal(state.rows.size, 0);
});

test("repair requires confirmation and only operates on broken connections, preserving Google copies", async () => {
  const attempt = await begin(); await api.calendarCallback(callback(attempt.nonce));
  assert.equal((await api.calendarReset(request("reset", "POST", {confirm:false}))).status, 400);
  assert.equal((await api.calendarReset(request("reset", "POST", {confirm:true}))).status, 400);
  const row = state.rows.get("account-A"), oldId = row.data.connectionId;
  row.data.calendarId="old-calendar";row.data.errorCode="calendar_missing";row.data.events={old:{id:"old",hash:"x",revision:0}};
  const calls = state.googleCalls.length;
  const response = await api.calendarReset(request("reset", "POST", {confirm:true})); assert.equal(response.status,200);
  assert.equal(state.rows.get("account-A").data.calendarId,null); assert.deepEqual(state.rows.get("account-A").data.events,{}); assert.notEqual(state.rows.get("account-A").data.connectionId,oldId);
  assert.equal(state.googleCalls.length,calls,"repair itself neither creates nor deletes remote calendars");
});
