import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {exerciseSyntheticEvent,main,parseSmokeOptions} from "../scripts/live-google-calendar-smoke.mjs";

function fixture() {
  const owner=randomUUID(),connectionId=randomUUID(),realBlock=randomUUID();
  const row={credentials:"synthetic-ciphertext",syncing:false,data:{connectionId,googleSubject:"synthetic-subject",timeZone:"America/Sao_Paulo",legacyAnchor:"2026-10-01",calendarId:"synthetic-calendar-id",events:{[realBlock]:{id:"real-event-must-stay",hash:"real-hash",revision:0}},syncedVersion:42,lastSyncedAt:null,errorCode:null}};
  const original=structuredClone(row),events=new Map(),calls=[];let receipt;
  const api=async(endpoint,init={})=>{
    const url=new URL(`https://www.googleapis.com/calendar/v3/${endpoint}`),method=init.method??"GET";calls.push({endpoint,method,body:init.body&&JSON.parse(init.body)});
    assert.equal(url.origin,"https://www.googleapis.com");assert.equal(url.pathname.startsWith("/calendar/v3/calendars/synthetic-calendar-id"),true);
    if(url.pathname.endsWith("/synthetic-calendar-id"))return Response.json({id:row.data.calendarId,summary:"Alquimia do Ser",description:`Agenda criada pela Alquimia do Ser. ${connectionId}`});
    const id=url.pathname.split("/").at(-1);
    if(method==="POST") {const body=JSON.parse(init.body);assert.equal(events.has(body.id),false);events.set(body.id,body);return Response.json(body);}
    if(method==="GET")return events.has(id)?Response.json(events.get(id)):Response.json({}, {status:404});
    assert.equal(id,receipt.eventId,"mutations are restricted to the recorded synthetic event");
    if(method==="PATCH") {assert.ok(events.has(id));const body=JSON.parse(init.body);events.set(id,body);return Response.json(body);}
    if(method==="DELETE") {events.delete(id);return new Response(null,{status:204});}
    assert.fail("Unexpected API action");
  };
  return {owner,row,original,events,calls,api,get receipt(){return receipt;},saveReceipt:async value=>{assert.equal(receipt,undefined);receipt=structuredClone(value);},readConnection:async()=>row};
}

test("default smoke invocation does not read credentials or call a network service",async()=>{
  const original=globalThis.fetch;globalThis.fetch=()=>assert.fail("default mode must not make requests");
  try{assert.deepEqual(await main(),{live:false,connectionVerified:false,tokenRefreshed:false,calendarVerified:false,receiptStored:false,created:false,updated:false,deleted:false,cleanupVerified:false,success:true});}finally{globalThis.fetch=original;}
  assert.throws(()=>parseSmokeOptions(["--run"]));assert.throws(()=>parseSmokeOptions(["--run","--cleanup"]));
  assert.throws(()=>parseSmokeOptions(["--owner","not-a-uuid"]));assert.throws(()=>parseSmokeOptions(["--google-client","relative-secret"]));
});

test("real reconciliation performs one synthetic create/update/delete without changing stored maps or journal",async()=>{
  const f=fixture();const result=await exerciseSyntheticEvent(f);
  assert.equal(result.success,true);assert.equal(result.created,true);assert.equal(result.updated,true);assert.equal(result.deleted,true);assert.equal(result.cleanupVerified,true);
  assert.equal(f.events.size,0);assert.deepEqual(f.row,f.original,"stored connection and real mappings never change");
  const writes=f.calls.filter(call=>call.method!=="GET");assert.deepEqual(writes.map(call=>call.method),["POST","PATCH","DELETE"]);
  for(const write of writes)assert.match(write.endpoint,/sendUpdates=none/);
  assert.match(writes[0].body.summary,/TESTE TEMPORÁRIO/);assert.match(writes[1].body.summary,/atualizado/);
  assert.equal(writes[0].body.id,writes[1].body.id);assert.equal(writes[0].body.attendees,undefined);
  assert.deepEqual(writes[0].body.reminders,{useDefault:false});assert.equal(writes[0].body.transparency,"transparent");
  assert.equal(f.calls.some(call=>call.endpoint.includes("real-event-must-stay")),false);
});

test("a lost insert acknowledgement is cleaned by the known event ID and private ownership marker",async()=>{
  const f=fixture(),api=f.api;f.api=async(endpoint,init)=>{const result=await api(endpoint,init);if(init?.method==="POST")throw new Error("synthetic lost acknowledgement");return result;};
  const result={};await assert.rejects(exerciseSyntheticEvent({...f,result}));
  assert.equal(result.cleanupVerified,true);assert.equal(f.events.size,0);
  assert.deepEqual(f.calls.filter(call=>call.method!=="GET").map(call=>call.method),["POST","DELETE"]);
  assert.deepEqual(f.row,f.original);
});

test("mismatched event ownership prevents both patch and cleanup deletion",async()=>{
  const f=fixture(),api=f.api;f.api=async(endpoint,init)=>{
    const response=await api(endpoint,init);
    if(init?.method==="POST") {const event=f.events.get(f.receipt.eventId);event.extendedProperties.private.alquimiaSmoke="another-creator";}
    return response;
  };
  await assert.rejects(exerciseSyntheticEvent(f));
  assert.equal(f.events.size,1);assert.equal(f.calls.some(call=>["PATCH","DELETE"].includes(call.method)),false);
});

test("connection change prevents the first mutation instead of writing through a stale account",async()=>{
  const f=fixture();f.readConnection=async()=>({...f.row,data:{...f.row.data,connectionId:randomUUID()}});
  await assert.rejects(exerciseSyntheticEvent(f));assert.equal(f.calls.some(call=>call.method!=="GET"),false);
});

test("explicit cleanup uses only a matching private receipt and does not create new events",async()=>{
  const f=fixture(),api=f.api;let rejectDelete=true;
  f.api=async(endpoint,init)=>{if(init?.method==="DELETE"&&rejectDelete)return Response.json({}, {status:503});return api(endpoint,init);};
  await assert.rejects(exerciseSyntheticEvent(f));assert.equal(f.events.size,1);
  rejectDelete=false;const before=f.calls.length;
  const result=await exerciseSyntheticEvent({...f,receipt:f.receipt,cleanupOnly:true});
  assert.equal(result.success,true);assert.equal(result.cleanupVerified,true);assert.equal(f.events.size,0);
  assert.deepEqual(f.calls.slice(before).filter(call=>call.method!=="GET").map(call=>call.method),["DELETE"]);
  await assert.rejects(exerciseSyntheticEvent({...f,receipt:{...f.receipt,eventId:"not-the-known-id"},cleanupOnly:true}));
});
