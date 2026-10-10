import assert from "node:assert/strict";
import {after, test} from "node:test";
import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import ts from "typescript";
import React from "react";
import {act, create} from "react-test-renderer";

// Exercise the production controller. Only its visual Button/CSS and translation
// dependencies are replaced; request timing, effects, guards and state are real.
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const compiled = await mkdtemp(path.join(appRoot, ".calendar-ui-tests-"));
after(() => rm(compiled, {recursive: true, force: true}));
const source = (await readFile(path.join(appRoot, "components/google-calendar-connection.tsx"), "utf8"))
  .replace('import {Button} from "@/components/ui/button";', 'import {Button} from "./dependencies.mjs";')
  .replace('import {useI18n} from "@/lib/i18n";', 'import {useI18n} from "./dependencies.mjs";')
  .replace('import styles from "./google-calendar-connection.module.css";', 'const styles = {};');
await writeFile(path.join(compiled, "dependencies.mjs"), `
import React from "react";
export function Button({asChild,children,variant,...props}) {
 return asChild ? React.cloneElement(React.Children.only(children),props) : React.createElement("button",props,children);
}
export function useI18n() {return {locale:"pt-BR",t:(key,values={})=>key.replace(/\\{(\\w+)\\}/g,(match,name)=>String(values[name]??match))};}
`);
await writeFile(path.join(compiled, "controller.mjs"), ts.transpileModule(source, {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX}}).outputText);
const {default: GoogleCalendarConnection} = await import(pathToFileURL(path.join(compiled, "controller.mjs")).href);

const flush = async () => {for (let index = 0; index < 20; index++) await Promise.resolve();};
const response = (body, status=200) => Response.json(body, {status});
const connected = (extra={}) => ({configured:true,connected:true,needsSync:false,lastSyncedAt:"2026-10-01T12:00:00.000Z",...extra});
const disconnected = () => ({configured:true,connected:false});
const deferred = () => {let resolve, reject; const promise = new Promise((yes,no) => {resolve=yes;reject=no;}); return {promise,resolve,reject};};
const textOf = node => typeof node === "string" ? node : node?.children?.map(textOf).join("") ?? "";

async function withController(props, action) {
  const originals = new Map();
  function replace(name,value) {originals.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{configurable:true,writable:true,value});}
  const window = new EventTarget(), document = new EventTarget();
  const intervals = new Map(), navigations = [], confirmations = [];
  let nextTimer=0, root;
  window.location = {search:"",assign:url=>navigations.push(url)};
  window.confirm = message => {confirmations.push(message);return true;};
  window.setInterval = callback => {const id=++nextTimer;intervals.set(id,callback);return id;};
  document.hidden=false;
  replace("window",window);replace("document",document);replace("clearInterval",id=>intervals.delete(id));replace("IS_REACT_ACT_ENVIRONMENT",true);
  let current={demo:false,ready:true,dirty:false,savedVersion:1,visible:true,...props};
  const settle = callback => act(async () => {await callback?.();await flush();});
  try {
    await settle(() => {root=create(React.createElement(GoogleCalendarConnection,current));});
    const harness = {
      update: changes => settle(() => {current={...current,...changes};root.update(React.createElement(GoogleCalendarConnection,current));}),
      settle,
      button: label => root.root.findAllByType("button").find(button=>textOf(button).includes(label)),
      click: async label => {const button=harness.button(label);assert.ok(button,`Missing button: ${label}`);assert.ok(!button.props.disabled,`Disabled button: ${label}`);await settle(()=>button.props.onClick());},
      wake: () => settle(() => {window.dispatchEvent(new Event("online"));document.dispatchEvent(new Event("visibilitychange"));for(const callback of [...intervals.values()])callback();}),
      get text() {return textOf(root.toJSON());},
      get json() {return root.toJSON();},
      window,document,intervals,navigations,confirmations,
    };
    await action(harness);
  } finally {
    if(root)await settle(()=>root.unmount());
    assert.equal(intervals.size,0,"polling interval removed on unmount");
    for(const [name,descriptor] of originals) {if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}
  }
}

function recorder(handler) {
  const calls=[];
  const request=(url,options={})=>{const call={url,method:options.method??"GET",options};calls.push(call);return handler(call,calls.length);};
  return {request,calls,paths:()=>calls.map(({url,method})=>`${method} ${url}`)};
}

test("demo never calls calendar APIs on mount, save, online, visibility or interval events", async () => {
  const api=recorder(()=>{throw new Error("Demo must not request calendar APIs");});
  await withController({demo:true,request:api.request}, async h => {
    assert.match(h.text,/Entre na sua conta para conectar sua agenda/);
    assert.equal(h.intervals.size,0);
    await h.update({savedVersion:2,visible:false});await h.wake();
    await h.update({visible:true,dirty:true});await h.update({dirty:false,ready:false});await h.update({ready:true});
    assert.deepEqual(api.calls,[]);
  });
});

test("only ready, confirmed notebook versions trigger automatic sync, even outside the calendar panel", async () => {
  let pending=false;
  const api=recorder(({url})=>Promise.resolve(response(url.endsWith("/sync") ? connected({syncedVersion:2}) : connected({needsSync:pending}))));
  await withController({ready:false,visible:false,request:api.request}, async h => {
    assert.deepEqual(api.calls,[]);
    await h.update({ready:true});
    assert.deepEqual(api.paths(),["GET /api/calendar/status"]);
    pending=true;
    await h.update({dirty:true});await h.wake();
    assert.equal(api.calls.length,1,"unsaved changes do not sync");
    await h.update({dirty:false,savedVersion:2});
    assert.deepEqual(api.paths(),["GET /api/calendar/status","GET /api/calendar/status","POST /api/calendar/sync"]);
    assert.deepEqual(JSON.parse(api.calls.at(-1).options.body),{force:false},"automatic sync does not force a remote rewrite");
    assert.equal(h.json,null,"background controller remains active while panel is hidden");
    await h.update({visible:true,savedVersion:2});
    assert.equal(api.calls.length,3,"unrelated rerenders and unchanged version do not repeat sync");
  });
});

for(const change of [{dirty:true},{ready:false}]) {
  test(`status response cannot start sync after notebook becomes ${change.dirty?"dirty":"not ready"}`, async () => {
    const status=deferred();
    const api=recorder(({url})=>{assert.equal(url,"/api/calendar/status");return status.promise;});
    await withController({request:api.request}, async h => {
      assert.equal(api.calls.length,1);
      await h.update(change);
      await h.settle(()=>status.resolve(response(connected({needsSync:true}))));
      assert.deepEqual(api.paths(),["GET /api/calendar/status"]);
    });
  });
}

test("manual sync retries a transient stored error and clears the failure on success", async () => {
  const api=recorder(({url})=>Promise.resolve(response(url.endsWith("/sync") ? connected() : connected({errorCode:"unavailable"}))));
  await withController({request:api.request}, async h => {
    assert.match(h.text,/Não foi possível sincronizar/);
    await h.click("Sincronizar agora");
    assert.deepEqual(api.paths(),["GET /api/calendar/status","GET /api/calendar/status","POST /api/calendar/sync"]);
    assert.deepEqual(JSON.parse(api.calls.at(-1).options.body),{force:true},"manual retry explicitly requests forced reconciliation");
    assert.match(h.text,/Atualizado no Google/);
    assert.doesNotMatch(h.text,/Não foi possível sincronizar/);
  });
});

test("reconnect-required errors do not enter automatic sync retry loops", async () => {
  const api=recorder(()=>Promise.resolve(response(connected({errorCode:"reconnect_required",needsSync:true}))));
  await withController({request:api.request}, async h => {
    assert.ok(h.button("Reconectar Google"));
    await h.wake();
    assert.ok(api.calls.every(call=>call.url==="/api/calendar/status"));
  });
});

test("connecting holds the shared working guard against double clicks and background polling", async () => {
  const connect=deferred();
  const api=recorder(({url})=>url.endsWith("/connect")?connect.promise:Promise.resolve(response(disconnected())));
  await withController({request:api.request}, async h => {
    const click=h.button("Conectar Google Calendar").props.onClick;
    await h.settle(()=>{click();click();});await h.wake();
    assert.deepEqual(api.paths(),["GET /api/calendar/status","POST /api/calendar/connect"]);
    const body=JSON.parse(api.calls[1].options.body);
    assert.equal(body.timeZone,Intl.DateTimeFormat().resolvedOptions().timeZone);
    await h.settle(()=>connect.resolve(response({url:"https://accounts.google.com/o/oauth2/v2/auth?test=1"})));
    assert.deepEqual(h.navigations,["https://accounts.google.com/o/oauth2/v2/auth?test=1"]);
    await h.wake();assert.equal(api.calls.length,2,"redirect in progress retains the operation lock");
  });
});

test("disconnect and sync cannot overlap, and a disconnected account stays disconnected", async () => {
  const deletion=deferred(),syncStatus=deferred();let holdStatus=false;
  const api=recorder(({url})=>url.endsWith("/connection")?deletion.promise:url.endsWith("/sync")?Promise.resolve(response(connected())):holdStatus?syncStatus.promise:Promise.resolve(response(connected())));
  await withController({request:api.request}, async h => {
    const sync=h.button("Sincronizar agora").props.onClick;
    const disconnect=h.button("Desconectar").props.onClick;
    holdStatus=true;await h.settle(()=>sync());await h.settle(()=>disconnect());
    assert.equal(h.confirmations.length,0,"disconnect guard is synchronous while sync owns the lock");
    await h.settle(()=>syncStatus.resolve(response(connected())));
    assert.match(h.text,/Atualizado no Google/,"the preceding sync completed before deletion");
    await h.settle(()=>disconnect());await h.settle(()=>sync());await h.wake();
    assert.equal(h.confirmations.length,1);
    assert.equal(api.calls.filter(call=>call.method==="DELETE").length,1);
    assert.equal(api.calls.at(-1).method,"DELETE","polling and cached sync handler cannot race deletion");
    await h.settle(()=>deletion.resolve(response(disconnected())));
    assert.ok(h.button("Conectar Google Calendar"));
    assert.equal(h.button("Desconectar"),undefined);
  });
});

test("owner request changes discard old status promises and release stale busy state", async () => {
  const oldStatus=deferred();
  const old=recorder(()=>oldStatus.promise);
  const next=recorder(()=>Promise.resolve(response(disconnected())));
  await withController({request:old.request}, async h => {
    await h.update({request:next.request});
    assert.equal(h.button("Conectar Google Calendar").props.disabled,false);
    await h.settle(()=>oldStatus.resolve(response(connected({needsSync:true}))));
    assert.deepEqual(old.paths(),["GET /api/calendar/status"],"old owner cannot start a late sync");
    assert.deepEqual(next.paths(),["GET /api/calendar/status"]);
    assert.ok(h.button("Conectar Google Calendar"));
    assert.equal(h.button("Desconectar"),undefined);
  });
});

test("late connect completion cannot redirect after the account request changes", async () => {
  const oldConnect=deferred();
  const old=recorder(({url})=>url.endsWith("/connect")?oldConnect.promise:Promise.resolve(response(disconnected())));
  const next=recorder(()=>Promise.resolve(response(disconnected())));
  await withController({request:old.request}, async h => {
    await h.click("Conectar Google Calendar");
    await h.update({request:next.request});
    await h.settle(()=>oldConnect.resolve(response({url:"https://accounts.google.com/o/oauth2/v2/auth?old-owner=1"})));
    assert.deepEqual(h.navigations,[]);
    assert.equal(h.button("Conectar Google Calendar").props.disabled,false);
  });
});


test("old sync completion cannot overwrite the next owner's connection or release its active lock", async () => {
  const oldSync=deferred(),nextStatus=deferred();
  const old=recorder(({url})=>url.endsWith("/sync")?oldSync.promise:Promise.resolve(response(connected({needsSync:true}))));
  const next=recorder(()=>nextStatus.promise);
  await withController({request:old.request}, async h => {
    assert.deepEqual(old.paths(),["GET /api/calendar/status","POST /api/calendar/sync"]);
    await h.update({request:next.request});
    await h.settle(()=>oldSync.resolve(response(connected())));
    await h.wake();
    assert.equal(next.calls.length,1,"old finally cannot unlock the next owner's pending status operation");
    assert.equal(h.button("Desconectar"),undefined);
    await h.settle(()=>nextStatus.resolve(response(disconnected())));
    assert.ok(h.button("Conectar Google Calendar"));
    assert.equal(h.button("Conectar Google Calendar").props.disabled,false);
  });
});

test("old disconnect completion cannot overwrite a newly connected account", async () => {
  const oldDelete=deferred();
  const old=recorder(({url})=>url.endsWith("/connection")?oldDelete.promise:Promise.resolve(response(connected())));
  const next=recorder(()=>Promise.resolve(response(connected())));
  await withController({request:old.request}, async h => {
    await h.click("Desconectar");
    await h.update({request:next.request});
    await h.settle(()=>oldDelete.resolve(response(disconnected())));
    assert.ok(h.button("Sincronizar agora"));
    assert.ok(h.button("Desconectar"));
    assert.equal(h.button("Conectar Google Calendar"),undefined);
  });
});


for(const errorCode of ["calendar_missing","calendar_creation_uncertain"]) {
  test(`${errorCode} requires explicit confirmation before creating a replacement calendar`, async () => {
    const reset=deferred();
    const api=recorder(({url})=>url.endsWith("/reset")?reset.promise:Promise.resolve(response(connected({errorCode,needsSync:true}))));
    await withController({request:api.request}, async h => {
      assert.ok(h.button("Criar novo calendário"));await h.wake();
      assert.ok(api.calls.every(call=>call.url==="/api/calendar/status"),"background polling never creates a replacement");
      h.window.confirm=message=>{h.confirmations.push(message);return false;};
      await h.click("Criar novo calendário");
      assert.ok(api.calls.every(call=>call.url==="/api/calendar/status"),"declining leaves the calendar untouched");
      assert.match(h.confirmations.at(-1),/anterior será mantido/);
      assert.match(h.confirmations.at(-1),/cópia/);
      h.window.confirm=message=>{h.confirmations.push(message);return true;};
      await h.click("Criar novo calendário");const pendingCount=api.calls.length;await h.wake();
      assert.equal(api.calls.length,pendingCount,"replacement operation holds the shared working guard");
      assert.equal(api.calls.at(-1).url,"/api/calendar/reset");
      assert.equal(api.calls.at(-1).method,"POST");
      assert.deepEqual(JSON.parse(api.calls.at(-1).options.body),{confirm:true});
      await h.settle(()=>reset.resolve(response(connected())));
      assert.ok(h.button("Sincronizar agora"));
      assert.equal(h.button("Criar novo calendário"),undefined);
    });
  });
}
