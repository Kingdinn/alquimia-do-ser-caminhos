import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp, mkdir, writeFile, chmod, symlink, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {PROJECT, parseOptions, parseMetadata, cliArguments, invokeCli, readPrivateJson, googleValues, supabaseValue} from "../scripts/configure-google-calendar.mjs";
const metadata = "  NEXT_PUBLIC_SITE_URL  Encrypted  Production\n  NEXT_PUBLIC_SUPABASE_URL  Encrypted  Production\n  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY  Encrypted  Production\n  GOOGLE_AUTH_ENABLED  Config  Production\n";

test("provisioning defaults to names-only checks and requires explicit activation flags", () => {
  assert.equal(parseOptions([]).apply, false);
  assert.throws(() => parseOptions(["--enable"]));
  assert.throws(() => parseOptions(["--google-client", "relative.json"]));
  assert.throws(() => parseOptions(["--value", "secret"]));
  assert.throws(() => parseOptions(["--apply", "--apply"]));
  assert.equal(parseOptions(["--apply", "--enable"]).enable, true);
  assert.deepEqual([...parseMetadata(metadata)], ["NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "GOOGLE_AUTH_ENABLED"]);
  assert.throws(() => parseMetadata("unexpected CLI format"));
});

test("CLI receives secrets only through stdin, scoped to production and with no force/debug flags", () => {
  const secret = "synthetic-private-value";
  let captured;
  invokeCli("add", "GOOGLE_CALENDAR_CLIENT_SECRET", secret, (command,args,options) => {captured={command,args,options};return {status:0,stdout:"not forwarded",stderr:"not forwarded"};});
  assert.equal(captured.options.input, secret);
  assert.equal(captured.args.includes(secret), false);
  assert.deepEqual(captured.options.stdio, ["pipe","pipe","pipe"]);
  for (const name of ["--value","--force","--debug"]) assert.equal(captured.args.includes(name), false);
  for (const name of ["--sensitive","production","--non-interactive",PROJECT.id,PROJECT.scope]) assert.ok(captured.args.includes(name));
  assert.equal(cliArguments("ls").includes("--json"), false);
  assert.throws(() => invokeCli("add", "SAFE_NAME", secret, () => ({status:1,stdout:secret,stderr:secret})), error => !error.message.includes(secret));
});

test("downloaded OAuth client is validated against the exact registered production callback", () => {
  const input = {web:{client_id:"123.apps.googleusercontent.com",client_secret:"synthetic-google-secret",redirect_uris:[PROJECT.callback]}};
  assert.deepEqual(googleValues(input), {GOOGLE_CALENDAR_CLIENT_ID:input.web.client_id,GOOGLE_CALENDAR_CLIENT_SECRET:input.web.client_secret});
  assert.throws(() => googleValues({...input,web:{...input.web,redirect_uris:["https://elsewhere.test/callback"]}}));
  assert.throws(() => googleValues({installed:input.web}));
  assert.throws(() => googleValues({...input,web:{...input.web,client_secret:" secret\n"}}));
});

test("only server credentials for the explicitly identified Supabase project are selected", () => {
  assert.deepEqual(supabaseValue({project_ref:PROJECT.supabase,SUPABASE_SECRET_KEY:"sb_secret_synthetic"}), {name:"SUPABASE_SECRET_KEY",value:"sb_secret_synthetic"});
  assert.throws(() => supabaseValue({project_ref:"wrong",SUPABASE_SECRET_KEY:"sb_secret_synthetic"}));
  assert.throws(() => supabaseValue({project_ref:PROJECT.supabase,SUPABASE_SECRET_KEY:"sb_publishable_synthetic"}));
  const jwt = role => "synthetic."+Buffer.from(JSON.stringify({role,ref:PROJECT.supabase})).toString("base64url")+".signature";
  assert.equal(supabaseValue({project_ref:PROJECT.supabase,SUPABASE_SERVICE_ROLE_KEY:jwt("service_role")}).name,"SUPABASE_SERVICE_ROLE_KEY");
  assert.throws(() => supabaseValue({project_ref:PROJECT.supabase,SUPABASE_SERVICE_ROLE_KEY:jwt("anon")}));
});

test("private files must be owner-only regular files outside uploaded application paths", async () => {
  const folder = await mkdtemp(path.join(tmpdir(),"alquimia-private-fixture-"));
  try {
    const app = path.join(folder,"app"), file = path.join(folder,"private.json");
    await mkdir(app); await writeFile(file,JSON.stringify({synthetic:true}),{mode:0o600});
    assert.deepEqual(await readPrivateJson(file,"test",app),{synthetic:true});
    await chmod(file,0o644); await assert.rejects(readPrivateJson(file,"test",app),/owner-only/); await chmod(file,0o600);
    const link = path.join(folder,"link.json");await symlink(file,link); await assert.rejects(readPrivateJson(link,"test",app));
    const inside = path.join(app,"secret.json"); await writeFile(inside,"{}",{mode:0o600}); await assert.rejects(readPrivateJson(inside,"test",app),/outside/);
    await writeFile(file,"synthetic-sensitive-malformed-json",{mode:0o600});
    await assert.rejects(readPrivateJson(file,"test",app), error => !error.message.includes("synthetic-sensitive"));
  } finally {await rm(folder,{recursive:true,force:true});}
});
