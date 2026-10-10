#!/usr/bin/env node
/**
 * Optional provider smoke test. Default mode does not read credentials or make requests.
 * --run creates/edits/removes ONE synthetic event, never a journal/goal/calendar.
 * --cleanup only removes the exact previously recorded synthetic event.
 * Receipts must be retained privately until cleanupVerified is true.
 */
import {randomUUID} from "node:crypto";
import {constants} from "node:fs";
import {open, realpath, stat} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import {createClient} from "@supabase/supabase-js";
import {PROJECT, googleValues, readPrivateJson, supabaseValue} from "./configure-google-calendar.mjs";
import {CALENDAR_SCOPE, encryptionKey, unseal} from "../lib/google-calendar-security.ts";
import {dateInTimeZone, googleEventId, mapCalendarBlocks} from "../lib/google-calendar-mapping.ts";
import {reconcileCalendar} from "../lib/google-calendar-sync.ts";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const KIND = "alquimia-calendar-provider-smoke-v1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TITLE = "[TESTE TEMPORÁRIO] Alquimia — verificação de integração";
const RESULTS = () => ({live:false,connectionVerified:false,tokenRefreshed:false,calendarVerified:false,receiptStored:false,created:false,updated:false,deleted:false,cleanupVerified:false,success:false});
function ensure(value) {if (!value) throw new Error("smoke_check_failed");}
function inside(candidate,parent) {const relative=path.relative(parent,candidate);return relative===""||(!relative.startsWith(`..${path.sep}`)&&relative!==".."&&!path.isAbsolute(relative));}
export function parseSmokeOptions(args) {
  const result={run:false,cleanup:false};
  const paths=new Map([["--google-client","google"],["--supabase-secret","supabase"],["--key-file","key"],["--receipt","receipt"]]);
  const seen=new Set();
  for(let index=0;index<args.length;index++) {
    const arg=args[index];ensure(!seen.has(arg));seen.add(arg);
    if(arg==="--run")result.run=true;
    else if(arg==="--cleanup")result.cleanup=true;
    else if(arg==="--owner") {result.owner=args[++index];ensure(UUID.test(result.owner??""));}
    else if(paths.has(arg)) {const value=args[++index];ensure(typeof value==="string"&&path.isAbsolute(value));result[paths.get(arg)]=value;}
    else ensure(false);
  }
  ensure(!(result.run&&result.cleanup));
  if(result.run||result.cleanup)ensure(result.owner&&result.google&&result.supabase&&result.key&&result.receipt);
  return result;
}
function receiptValid(receipt,owner,row) {
  return receipt?.kind===KIND&&receipt.owner===owner&&UUID.test(receipt.blockId??"")&&UUID.test(receipt.marker??"")
    &&receipt.connectionId===row.data.connectionId&&receipt.calendarId===row.data.calendarId
    &&receipt.eventId===googleEventId(owner,receipt.connectionId,receipt.blockId);
}
function owns(event,receipt) {
  const metadata=event?.extendedProperties?.private;
  return event?.id===receipt.eventId&&metadata?.alquimiaOwner===receipt.owner&&metadata.alquimiaConnection===receipt.connectionId
    &&metadata.alquimiaBlock===receipt.blockId&&metadata.alquimiaSmoke===receipt.marker;
}
function sameConnection(first,next) {
  return !!next?.credentials&&next.data?.connectionId===first.data.connectionId&&next.data?.calendarId===first.data.calendarId
    &&next.data?.googleSubject===first.data.googleSubject;
}
async function jsonOrNull(response) {return response.status===204?null:response.json().catch(()=>null);}

/** Testable provider boundary; never receives journal data or database mutation methods. */
export async function exerciseSyntheticEvent({owner,row,api,readConnection,saveReceipt,receipt:prior,cleanupOnly=false,result=RESULTS()}) {
  ensure(UUID.test(owner)&&row?.credentials&&UUID.test(row.data?.connectionId??"")&&typeof row.data.calendarId==="string"&&row.data.calendarId!=="primary");
  const calendarPath=`calendars/${encodeURIComponent(row.data.calendarId)}`;
  const health=await api(calendarPath);ensure(health.ok);
  const calendar=await health.json();
  ensure(calendar.id===row.data.calendarId&&calendar.summary==="Alquimia do Ser"&&calendar.description===`Agenda criada pela Alquimia do Ser. ${row.data.connectionId}`);
  result.calendarVerified=true;
  const date=dateInTimeZone(new Date(Date.now()+7*86400000),row.data.timeZone);
  const blockId=randomUUID();
  const receipt=prior??{kind:KIND,owner,connectionId:row.data.connectionId,calendarId:row.data.calendarId,blockId,eventId:googleEventId(owner,row.data.connectionId,blockId),marker:randomUUID(),date,timeZone:row.data.timeZone};
  ensure(receiptValid(receipt,owner,row));
  if(cleanupOnly)ensure(!!prior);
  const eventPath=`${calendarPath}/events/${encodeURIComponent(receipt.eventId)}`;
  const verifyConnection=async()=>ensure(sameConnection(row,await readConnection()));
  const get=async()=>{
    const response=await api(eventPath);
    if(response.status===404||response.status===410)return null;
    ensure(response.ok);const event=await response.json();
    if(event.status==="cancelled")return null;
    ensure(owns(event,receipt));return event;
  };
  const remove=async()=>{
    const existing=await get();
    if(existing){await verifyConnection();const response=await api(`${eventPath}?sendUpdates=none`,{method:"DELETE"});ensure(response.ok||response.status===404||response.status===410);}
    ensure(await get()===null);result.cleanupVerified=true;
  };
  if(cleanupOnly){await remove();result.deleted=true;result.success=true;return result;}
  await saveReceipt(receipt);result.receiptStored=true;
  // The entire reconciliation map is new and private to this process. Real maps are never passed.
  let state={...row.data,events:{},syncedVersion:-1,lastSyncedAt:null,errorCode:null};
  let insertionAttempted=false;
  const decorate=event=>({...event,description:"Evento sintético temporário criado somente para verificar a integração. Será removido pelo mesmo teste.",visibility:"private",transparency:"transparent",reminders:{useDefault:false},extendedProperties:{private:{...event.extendedProperties.private,alquimiaSmoke:receipt.marker}}});
  const provider={
    get:async id=>{ensure(id===receipt.eventId);return get();},
    insert:async event=>{
      ensure(event.id===receipt.eventId);await verifyConnection();insertionAttempted=true;
      const response=await api(`${calendarPath}/events?sendUpdates=none`,{method:"POST",body:JSON.stringify(decorate(event))});
      ensure(response.ok);return "created";
    },
    update:async(id,event)=>{
      ensure(id===receipt.eventId&&event.id===receipt.eventId);ensure(await get());await verifyConnection();
      const response=await api(`${eventPath}?sendUpdates=none`,{method:"PATCH",body:JSON.stringify({...decorate(event),recurrence:[]})});ensure(response.ok);
    },
    remove:async id=>{ensure(id===receipt.eventId);await remove();},
  };
  const reconcile=async(blocks,version)=>{
    const desired=mapCalendarBlocks(blocks,owner,row.data.connectionId,row.data.timeZone,row.data.legacyAnchor);
    const complete=await reconcileCalendar({owner,data:state,desired,version,provider,maxOperations:3,
      eventId:(id,revision)=>{ensure(id===receipt.blockId&&revision===0);return receipt.eventId;},
      checkpoint:async next=>{ensure(Object.keys(next.events).every(id=>id===receipt.blockId));state=structuredClone(next);},
    });ensure(complete.complete);state=complete.data;return desired[0]?.event;
  };
  const block={id:receipt.blockId,date:receipt.date,day:["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"][new Date(`${receipt.date}T00:00:00Z`).getUTCDay()],time:"12:00",duration:"1",activity:TITLE};
  const verifyEvent=async expected=>{
    const actual=await get();ensure(actual&&actual.summary===expected.summary&&Date.parse(actual.start?.dateTime)===Date.parse(expected.start.dateTime)&&Date.parse(actual.end?.dateTime)===Date.parse(expected.end.dateTime));
  };
  try {
    // Fail closed if the cryptographically unpredictable ID nevertheless already exists.
    const existing=await api(eventPath);ensure(existing.status===404);
    const first=await reconcile([block],1);await verifyEvent(first);result.created=true;
    const second=await reconcile([{...block,time:"12:05",activity:`${TITLE} — atualizado`}],2);await verifyEvent(second);result.updated=true;
    await reconcile([],3);ensure(await get()===null);result.deleted=true;result.cleanupVerified=true;result.success=true;
  } finally {
    // Also handles an insert which reached Google but whose response was lost.
    if(insertionAttempted&&!result.cleanupVerified){try{await remove();}catch{/* Only boolean outcome escapes; retained receipt enables explicit cleanup. */}}
  }
  return result;
}

async function privateReceiptWriter(filename,inputFiles) {
  ensure(path.isAbsolute(filename)&&!inputFiles.some(file=>path.resolve(file)===path.resolve(filename)));
  const [parent,app]=await Promise.all([realpath(path.dirname(filename)),realpath(APP)]);
  ensure(!inside(parent,app));const info=await stat(parent);ensure(info.isDirectory()&&(info.mode&0o077)===0&&(!process.getuid||info.uid===process.getuid()));
  return async receipt=>{
    let file;try{file=await open(filename,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);await file.writeFile(`${JSON.stringify(receipt)}\n`,"utf8");await file.sync();}finally{await file?.close();}
  };
}
async function boundedFetch(url,init={}) {
  return fetch(url,{...init,redirect:"error",cache:"no-store",signal:AbortSignal.timeout(8000)});
}
export async function main(args=process.argv.slice(2)) {
  const result=RESULTS();
  try {
    const options=parseSmokeOptions(args);
    if(!options.run&&!options.cleanup)return {...result,success:true};
    result.live=true;
    const [googleDoc,supabaseDoc,keyDoc]=await Promise.all([readPrivateJson(options.google,"Google OAuth client"),readPrivateJson(options.supabase,"Supabase server secret"),readPrivateJson(options.key,"encryption key")]);
    const google=googleValues(googleDoc),secret=supabaseValue(supabaseDoc);
    ensure(keyDoc.kind==="alquimia-google-calendar-token-key");const key=encryptionKey(keyDoc.key);
    const db=createClient(`https://${PROJECT.supabase}.supabase.co`,secret.value,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:boundedFetch}});
    const readConnection=async()=>{const {data,error}=await db.rpc("alquimia_calendar_state",{p_owner:options.owner,p_action:"read",p_payload:{}});ensure(!error&&data);return data;};
    const row=await readConnection();ensure(row.credentials&&row.data?.calendarId&&!row.syncing);
    const credentials=unseal(row.credentials,key,`tokens:${options.owner}`);ensure(typeof credentials.refreshToken==="string"&&credentials.scope?.split(" ").includes(CALENDAR_SCOPE));result.connectionVerified=true;
    const refreshed=await boundedFetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:google.GOOGLE_CALENDAR_CLIENT_ID,client_secret:google.GOOGLE_CALENDAR_CLIENT_SECRET,refresh_token:credentials.refreshToken,grant_type:"refresh_token"})});
    const token=await jsonOrNull(refreshed);ensure(refreshed.ok&&typeof token?.access_token==="string"&&token.access_token&&(!token.scope||token.scope.split(" ").includes(CALENDAR_SCOPE)));result.tokenRefreshed=true;
    // Refreshed access tokens remain only in memory; no credentials or maps are overwritten.
    const identity=await boundedFetch("https://openidconnect.googleapis.com/v1/userinfo",{headers:{Authorization:`Bearer ${token.access_token}`}});ensure(identity.ok&&(await identity.json()).sub===row.data.googleSubject);
    const api=(endpoint,init={})=>boundedFetch(`https://www.googleapis.com/calendar/v3/${endpoint}`,{...init,headers:{...init.headers,Authorization:`Bearer ${token.access_token}`,"Content-Type":"application/json"}});
    const receipt=options.cleanup?await readPrivateJson(options.receipt,"smoke receipt"):undefined;
    const saveReceipt=options.cleanup?async()=>{}:await privateReceiptWriter(options.receipt,[options.google,options.supabase,options.key]);
    await exerciseSyntheticEvent({owner:options.owner,row,api,readConnection,saveReceipt,receipt,cleanupOnly:options.cleanup,result});
  } catch {/* Do not print raw provider errors, credentials, identifiers or paths. */}
  return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  const result=await main();process.stdout.write(`${JSON.stringify(result)}\n`);process.exitCode=result.success?0:1;
}
