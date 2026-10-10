#!/usr/bin/env node
/** Private values enter Vercel through stdin only. Default mode reads names, never writes environments. */
import {spawnSync} from "node:child_process";
import {randomBytes} from "node:crypto";
import {constants} from "node:fs";
import {mkdir, open, readFile, realpath} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";

export const PROJECT = Object.freeze({id: "prj_QmlG1Fz9ljPiN8pGmmfnOs4sQUD2", org: "team_W6eu2JfejR585LI3B4I7cAWs", scope: "din-dafc", name: "alquimia-do-ser-caminhos", supabase: "sbujezhugcthqkchsqcf", callback: "https://alquimia-do-ser-caminhos.vercel.app/api/calendar/callback"});
const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NODE = "/usr/local/bin/node";
const CLI = "/Users/din/.npm/_npx/37e4cbee03b987c3/node_modules/.bin/vercel";
const BASELINE = ["NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
const KEY_NAME = "GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY";
const CLIENT_NAMES = ["GOOGLE_CALENDAR_CLIENT_ID", "GOOGLE_CALENDAR_CLIENT_SECRET"];
export class ProvisioningError extends Error {}
function fail(message) {throw new ProvisioningError(message);}
function inside(candidate, parent) {const relative = path.relative(parent, candidate); return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));}
const safeString = value => typeof value === "string" && value.length > 0 && value.length < 16000 && value === value.trim() && !/[\r\n\0]/.test(value);

export function parseOptions(args) {
  const options = {apply: false, enable: false, help: false};
  const files = new Map([["--google-client", "google"], ["--supabase-secret", "supabase"], ["--key-file", "key"]]);
  const seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const argument = args[i];
    if (seen.has(argument)) fail("Each option may appear only once.");
    seen.add(argument);
    if (files.has(argument)) {
      const value = args[++i]; if (!value || !path.isAbsolute(value)) fail("Private input files must use absolute paths.");
      options[files.get(argument)] = value;
    } else if (argument === "--apply") options.apply = true;
    else if (argument === "--enable") options.enable = true;
    else if (argument === "--help") options.help = true;
    else fail("Unknown option. Use --help; never put credential values on the command line.");
  }
  if (options.enable && !options.apply) fail("Activation requires --apply --enable.");
  return options;
}

export function parseMetadata(output) {
  // Do not request --json: Vercel CLI 60 includes readable values in that format.
  const names = new Set([...output.matchAll(/^\s+([A-Z][A-Z0-9_]+)\s+/gm)].map(match => match[1]));
  if (!BASELINE.every(name => names.has(name))) fail("Could not verify production metadata for the expected project. No values were changed.");
  return names;
}

export function cliArguments(action, name) {
  const args = [CLI, "env", action];
  if (name) args.push(name);
  args.push("production", "--scope", PROJECT.scope, "--project", PROJECT.id, "--no-color", "--non-interactive");
  if (action === "add" || action === "update") args.push("--sensitive", "--yes");
  return args;
}
export function invokeCli(action, name, value, spawn = spawnSync) {
  if (value !== undefined && !safeString(value)) fail("A credential contains invalid whitespace or an unsupported value.");
  const environment = {...process.env, NO_COLOR: "1", VERCEL_TELEMETRY_DISABLED: "1"};
  for (const flag of ["DEBUG", "VERCEL_DEBUG", "NODE_DEBUG", "NODE_OPTIONS"]) delete environment[flag];
  const result = spawn(NODE, cliArguments(action, name), {
    cwd: APP, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
    input: value ?? "", timeout: 60000, maxBuffer: 1024 * 1024, env: environment,
  });
  if (result.error || result.status !== 0) fail(`Vercel ${action}${name ? ` for ${name}` : ""} failed. Private command output was suppressed; no secret was printed. Previously added values are retained for a safe retry.`);
  return action === "ls" ? parseMetadata(`${result.stdout ?? ""}\n${result.stderr ?? ""}`) : undefined;
}

async function verifyProject() {
  let project;
  try {project = JSON.parse(await readFile(path.join(APP, ".vercel/project.json"), "utf8"));} catch {fail("The app must already be linked to its intended Vercel project.");}
  if (project.projectId !== PROJECT.id || project.orgId !== PROJECT.org || project.projectName !== PROJECT.name) fail("The local Vercel link does not match the approved project. Nothing was changed.");
}

export async function readPrivateJson(filename, label, appDirectory = APP) {
  if (!filename || !path.isAbsolute(filename)) fail(`A private ${label} JSON file outside the app is required.`);
  let file;
  try {
    const [resolved, appResolved] = await Promise.all([realpath(filename), realpath(appDirectory)]);
    if (inside(resolved, appResolved)) fail(`The private ${label} file must stay outside the uploaded app directory.`);
    file = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
    const info = await file.stat();
    if (!info.isFile() || info.size > 64000 || (info.mode & 0o077) !== 0 || (process.getuid && info.uid !== process.getuid())) fail(`The private ${label} file must be a regular owner-only file (chmod 600), not a symlink.`);
    const raw = await file.readFile("utf8");
    try {return JSON.parse(raw);} catch {fail(`The private ${label} file is not valid JSON. Its content was not printed.`);}
  } catch (error) {
    if (error instanceof ProvisioningError) throw error;
    fail(`Could not safely read the private ${label} file. Check its location, ownership and permissions.`);
  } finally {await file?.close();}
}

export function googleValues(document) {
  const web = document?.web;
  if (!web || !safeString(web.client_id) || !web.client_id.endsWith(".apps.googleusercontent.com") || !safeString(web.client_secret)) fail("The Google file must be a downloaded web OAuth client JSON with its client ID and secret.");
  if (!Array.isArray(web.redirect_uris) || !web.redirect_uris.includes(PROJECT.callback)) fail("The Google web OAuth client must include the exact production Calendar callback before provisioning.");
  if (web.auth_uri !== undefined && !["https://accounts.google.com/o/oauth2/auth", "https://accounts.google.com/o/oauth2/v2/auth"].includes(web.auth_uri)) fail("The Google client authorization endpoint is unexpected.");
  if (web.token_uri !== undefined && web.token_uri !== "https://oauth2.googleapis.com/token") fail("The Google client token endpoint is unexpected.");
  return {GOOGLE_CALENDAR_CLIENT_ID: web.client_id, GOOGLE_CALENDAR_CLIENT_SECRET: web.client_secret};
}

export function supabaseValue(document) {
  if (!document || document.project_ref !== PROJECT.supabase) fail("The Supabase secret JSON must explicitly identify the approved project_ref.");
  const modern = document.SUPABASE_SECRET_KEY, legacy = document.SUPABASE_SERVICE_ROLE_KEY;
  if (modern && legacy) fail("Supply only one Supabase server credential type.");
  if (modern) {
    if (!safeString(modern) || !/^sb_secret_[A-Za-z0-9_-]+$/.test(modern)) fail("The Supabase credential must be a server secret key, never a publishable/anon key.");
    return {name: "SUPABASE_SECRET_KEY", value: modern};
  }
  if (!safeString(legacy)) fail("A Supabase server secret or legacy service-role key is required.");
  let claims;
  try {claims = JSON.parse(Buffer.from(legacy.split(".")[1], "base64url").toString("utf8"));} catch {fail("The legacy Supabase key has invalid service-role metadata.");}
  // Metadata checks are a guard against selecting the wrong key, not JWT authentication.
  if (legacy.split(".").length !== 3 || claims.role !== "service_role" || claims.ref !== PROJECT.supabase) fail("The legacy key is not service_role for the approved Supabase project.");
  return {name: "SUPABASE_SERVICE_ROLE_KEY", value: legacy};
}

function keyValue(document) {
  const value = document?.key;
  if (document?.kind !== "alquimia-google-calendar-token-key" || !safeString(value)) fail("The encryption key file has an unexpected format.");
  const key = Buffer.from(value, "base64");
  if (key.length !== 32 || key.toString("base64") !== value) fail("The encryption key must contain exactly 32 random bytes in canonical base64.");
  return value;
}
async function existingKey(filename) {
  try {await realpath(filename);} catch (error) {if (error.code === "ENOENT") return null; fail("Could not inspect the private encryption key file.");}
  return keyValue(await readPrivateJson(filename, "encryption key"));
}
async function obtainKey(filename) {
  if (!filename || !path.isAbsolute(filename)) fail("Choose an absolute private encryption-key file path outside the app before provisioning.");
  const stored = await existingKey(filename); if (stored) return stored;
  const directory = path.dirname(filename);
  if (inside(path.resolve(directory), APP)) fail("The encryption key must be stored outside the uploaded app directory.");
  await mkdir(directory, {recursive: true, mode: 0o700});
  const [parent, app] = await Promise.all([realpath(directory), realpath(APP)]);
  if (inside(parent, app)) fail("The encryption key directory resolves inside the app.");
  const key = randomBytes(32).toString("base64");
  let handle;
  try {
    handle = await open(filename, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    await handle.writeFile(JSON.stringify({version: 1, kind: "alquimia-google-calendar-token-key", key}) + "\n", "utf8");
    await handle.sync();
  } catch (error) {
    if (error.code === "EEXIST") return keyValue(await readPrivateJson(filename, "encryption key"));
    fail("Could not safely store the encryption key. No new key was submitted to Vercel.");
  } finally {await handle?.close();}
  return key;
}

export async function main(args = process.argv.slice(2)) {
  const options = parseOptions(args);
  if (options.help) {
    process.stdout.write("Usage: node scripts/configure-google-calendar.mjs [--apply] [--google-client /PRIVATE/web-client.json] [--supabase-secret /PRIVATE/server-key.json] [--key-file /PRIVATE/calendar-encryption.json] [--enable]\nDefault: check production variable names only. --apply adds missing values through private stdin. --enable additionally activates the feature. Existing secrets are never overwritten. Private files must be owner-only and outside the app.\n");
    return;
  }
  await verifyProject();
  let names = invokeCli("ls");
  const before = new Set(names);
  const required = [...CLIENT_NAMES, KEY_NAME];
  const existingServer = names.has("SUPABASE_SECRET_KEY") || names.has("SUPABASE_SERVICE_ROLE_KEY");
  const missing = [...required.filter(name => !names.has(name)), ...(!existingServer ? ["SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY"] : [])];
  process.stdout.write(JSON.stringify({project: PROJECT.name, scope: PROJECT.scope, environment: "production", mode: options.apply ? "apply" : "check", existingNames: [...names].sort(), missingNames: missing}) + "\n");
  if (!options.apply) return;

  // Validate all supplied inputs before any external write. No values are exposed through logs/arguments.
  let google = null, supabase = null;
  if (CLIENT_NAMES.some(name => !names.has(name))) google = googleValues(await readPrivateJson(options.google, "Google OAuth client"));
  if (!existingServer) supabase = supabaseValue(await readPrivateJson(options.supabase, "Supabase server secret"));
  if (!names.has(KEY_NAME) && !options.key) fail("A private encryption-key file path is required when Vercel has no encryption key.");
  const key = names.has(KEY_NAME) ? null : await obtainKey(options.key);
  const pending = {...(google ?? {}), ...(supabase ? {[supabase.name]: supabase.value} : {}), ...(key ? {[KEY_NAME]: key} : {})};
  for (const [name, value] of Object.entries(pending)) {
    if (names.has(name)) continue;
    // A concurrent invocation may have added it. Never use --force, especially for encryption keys.
    names = invokeCli("ls");
    if (names.has(name)) continue;
    invokeCli("add", name, value);
    names.add(name);
    process.stdout.write(JSON.stringify({addedName: name, target: "production", sensitive: true}) + "\n");
  }
  names = invokeCli("ls");
  if (!required.every(name => names.has(name)) || (!names.has("SUPABASE_SECRET_KEY") && !names.has("SUPABASE_SERVICE_ROLE_KEY"))) fail("Some required production variable names are missing. Existing additions were retained; retry safely.");
  if (options.enable) {
    // Explicit activation is the only permitted update, and only to this non-secret feature flag.
    invokeCli(names.has("GOOGLE_CALENDAR_ENABLED") ? "update" : "add", "GOOGLE_CALENDAR_ENABLED", "true");
    names.add("GOOGLE_CALENDAR_ENABLED");
  }
  process.stdout.write(JSON.stringify({complete: true, verifiedNames: [...required, names.has("SUPABASE_SECRET_KEY") ? "SUPABASE_SECRET_KEY" : "SUPABASE_SERVICE_ROLE_KEY"], preservedNames: [...before].filter(name => required.includes(name) || name.startsWith("SUPABASE_")), activationRequested: options.enable, requiresNewDeployment: true, note: "Existing values were not read or compared. No deployment or Google account action was performed."}) + "\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => {process.stderr.write((error instanceof ProvisioningError ? error.message : "Provisioning could not complete. Private error details were suppressed.") + "\n"); process.exitCode = 1;});
}
