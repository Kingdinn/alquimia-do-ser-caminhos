"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {CalendarDays,Link2,RefreshCw,Unplug} from "lucide-react";
import {Button} from "@/components/ui/button";
import {useI18n} from "@/lib/i18n";
import styles from "./google-calendar-connection.module.css";
type CalendarStatus={ownerId?:string;configured:boolean;connected:boolean;calendarName?:string;lastSyncedAt?:string|null;syncedVersion?:number;needsSync?:boolean;syncing?:boolean;errorCode?:string|null};
type Props={demo:boolean;ready:boolean;dirty:boolean;savedVersion:number;visible:boolean;request:(url:string,options?:RequestInit)=>Promise<Response>};
export default function GoogleCalendarConnection({demo,ready,dirty,savedVersion,visible,request}:Props){
 const {t,locale}=useI18n();
 const [status,setStatus]=useState<CalendarStatus|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const callbackError=useRef("");
 const authBlocked=useRef(false);
 const active=useRef(0),working=useRef(false),current=useRef({dirty,ready,status});current.current={dirty,ready,status};
 const run=useCallback(async(manual=false)=>{
  if(demo||!current.current.ready||current.current.dirty||working.current||(!manual&&(document.hidden||authBlocked.current||current.current.status?.configured===false)))return;
  const generation=active.current;working.current=true;setBusy(true);
  try{
   const response=await request("/api/calendar/status");const body=await response.json();
   if(generation!==active.current)return;
   if(!response.ok){if(response.status===401||response.status===403)authBlocked.current=true;throw new Error(body.errorCode||body.code||"unavailable");}
   authBlocked.current=false;
   setStatus(body);setError(callbackError.current);
   if(body.configured&&body.connected&&(body.needsSync||manual)&&!["reconnect_required","insufficient_scope","refresh_token_missing","different_google_account","calendar_creation_uncertain","calendar_missing","event_ownership_conflict"].includes(body.errorCode??"")&&current.current.ready&&!current.current.dirty){
    const synced=await request("/api/calendar/sync",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({force:manual})});const result=await synced.json();
    if(generation!==active.current)return;
    if(!synced.ok)throw new Error(result.errorCode||result.code||"unavailable");
    setStatus(result);
   }
  }catch(e){if(generation===active.current)setError(e instanceof Error?e.message:"unavailable");}
  finally{if(generation===active.current){working.current=false;setBusy(false);}}
 },[demo,request]);
 useEffect(()=>{active.current++;working.current=false;authBlocked.current=false;setStatus(null);setBusy(false);const callback=new URLSearchParams(window.location.search).get("calendar");callbackError.current=callback&&callback!=="connected"?callback:"";setError(callbackError.current);return()=>{active.current++;working.current=false;};},[request,demo]);
 useEffect(()=>{if(ready&&!demo)void run();},[ready,demo,savedVersion,run]);
 useEffect(()=>{
  if(demo||!ready)return;
  const refresh=()=>void run();
  const timer=window.setInterval(refresh,30_000);
  window.addEventListener("online",refresh);document.addEventListener("visibilitychange",refresh);
  return()=>{clearInterval(timer);window.removeEventListener("online",refresh);document.removeEventListener("visibilitychange",refresh);};
 },[demo,ready,run]);
 async function connect(){
  if(dirty||busy||working.current)return;const generation=active.current;working.current=true;callbackError.current="";setBusy(true);setError("");
  try{
   const timeZone=Intl.DateTimeFormat().resolvedOptions().timeZone;
   const r=await request("/api/calendar/connect",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({timeZone})});const body=await r.json();
   if(generation!==active.current)return;
   if(!r.ok)throw new Error(body.errorCode||"unavailable");
   const url=new URL(body.url);if(url.origin!=="https://accounts.google.com")throw new Error("unavailable");
   window.location.assign(url.href);
  }catch(e){if(generation===active.current){setError(e instanceof Error?e.message:"unavailable");working.current=false;setBusy(false);}}
 }
 async function disconnect(){
  if(working.current)return;
  if(!window.confirm(t("Desconectar o Google Calendar? Os eventos já enviados continuam no Google. Novas alterações não serão sincronizadas.")))return;
  const generation=active.current;working.current=true;callbackError.current="";setBusy(true);setError("");
  try{const r=await request("/api/calendar/connection",{method:"DELETE"});const body=await r.json();if(generation!==active.current)return;if(!r.ok)throw new Error(body.errorCode||"unavailable");setStatus(body);}
  catch(e){if(generation===active.current)setError(e instanceof Error?e.message:"unavailable");}
  finally{if(generation===active.current){working.current=false;setBusy(false);}}
 }
 async function repair(){
  if(working.current||dirty)return;
  if(!window.confirm(t("Criar um novo calendário Alquimia do Ser? Qualquer calendário ou evento anterior será mantido no Google e poderá aparecer como uma cópia. O novo calendário receberá as atividades salvas na app.")))return;
  const generation=active.current;working.current=true;setBusy(true);setError("");callbackError.current="";
  try{const r=await request("/api/calendar/reset",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({confirm:true})});const body=await r.json();if(generation!==active.current)return;if(!r.ok)throw new Error(body.errorCode||"calendar_unavailable");setStatus(body);}
  catch(e){if(generation===active.current)setError(e instanceof Error?e.message:"calendar_unavailable");}
  finally{if(generation===active.current){working.current=false;setBusy(false);}}
 }
 if(!visible)return null;
 const problem=error||status?.errorCode;
 const needsRepair=["calendar_missing","calendar_creation_uncertain"].includes(problem??"");
 const needsReconnect=["reconnect_required","refresh_token_missing","insufficient_scope"].includes(problem??"");
 const problemMessages:Record<string,string>={consent_denied:"A conexão foi cancelada. Você pode tentar novamente quando quiser.",different_google_account:"Use a mesma conta Google conectada anteriormente.",invalid_schedule:"Revise os horários das atividades antes de sincronizar.",invalid_schedule_timezone:"Um horário não existe no fuso escolhido. Revise o agendamento.",calendar_creation_uncertain:"Precisamos conferir a criação do calendário antes de tentar novamente. Fale com o suporte.",calendar_missing:"O calendário conectado não está disponível no Google. Fale com o suporte para restabelecer a conexão.",event_ownership_conflict:"Um evento no Google precisa de revisão antes de sincronizar. Fale com o suporte.",invalid_oauth_state:"A autorização expirou. Inicie a conexão novamente."};
 return <section className={styles.card} aria-label={t("Conexão com Google Calendar")}>
  <div className={styles.icon}><CalendarDays size={22}/></div>
  <div className={styles.copy}><h3>Google Calendar</h3><p>{t("Suas atividades em um calendário separado, Alquimia do Ser. Edite os horários aqui; a app envia as mudanças enquanto estiver aberta.")}</p>
   <small>{t("Somente atividades agendadas. Textos, imagens e registros pessoais do caderno não são enviados.")}</small>
   <div className={styles.status} role="status">{demo?t("Entre na sua conta para conectar sua agenda."):!status&&!error?t("Verificando conexão…"):status?.configured===false?t("A conexão com Google Calendar está em preparação. Seu calendário continua salvo normalmente na app."):problem?t(needsReconnect?"Autorize novamente a conexão com Google Calendar.":problem==="account_changed"||problem==="unauthenticated"?"Entre novamente na conta deste caderno para conectar a agenda.":problemMessages[problem]||"Não foi possível sincronizar com Google agora. Seu caderno continua salvo na app."):busy?t("Sincronizando com Google…"):status?.connected?(dirty?t("Aguardando o salvamento do caderno…"):status.needsSync?t("Há atividades aguardando sincronização."):status.lastSyncedAt?t("Atualizado no Google em {date}",{date:new Date(status.lastSyncedAt).toLocaleString(locale)}):t("Google conectado. Preparando a primeira sincronização…")):t("Conecte quando quiser. Você escolhe sua conta na próxima tela.")}</div>
  </div>
  <div className={styles.actions}>{demo?<Button variant="outline" asChild><a href="/entrar">{t("Entrar")}</a></Button>:status?.configured&&<>{needsRepair?<Button variant="outline" onClick={()=>void repair()} disabled={busy||dirty}>{t("Criar novo calendário")}</Button>:!status.connected||needsReconnect?<Button onClick={()=>void connect()} disabled={busy||dirty||!ready}><Link2 size={16}/>{t(needsReconnect?"Reconectar Google":"Conectar Google Calendar")}</Button>:<Button variant="outline" onClick={()=>void run(true)} disabled={busy||dirty||!ready}><RefreshCw size={16}/>{t("Sincronizar agora")}</Button>}{status.connected&&<Button variant="ghost" onClick={()=>void disconnect()} disabled={busy}><Unplug size={15}/>{t("Desconectar")}</Button>}</>}{!demo&&error&&!status&&<Button variant="outline" disabled={busy} onClick={()=>void run(true)}>{t("Tentar novamente")}</Button>}</div>
 </section>;
}
