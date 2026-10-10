"use client";

import {useEffect, useRef, useState, type KeyboardEvent} from "react";
import {CalendarDays, ChevronLeft, ChevronRight, ListChecks, Plus, Repeat2, Search, Target, Undo2} from "lucide-react";
import {useI18n} from "@/lib/i18n";
import type {Block, Goal} from "@/app/content";
import {getGoalTitle, getHabitSummary} from "@/lib/goal-planning";
import {buildMonthGrid, createCalendarBlocks, localDateKey, occurrencesForDate, shiftMonth, updateCalendarBlock, weekdayForDate} from "@/lib/calendar-planning";
import {WEEKDAYS} from "@/lib/weekly-planning";
import CalendarEventDialog, {type CalendarEventDraft} from "./calendar-event-dialog";
import DayTimePicker from "./day-time-picker";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import styles from "./monthly-planner.module.css";

type Props = {goals: Goal[]; blocks: Block[]; disabled: boolean; onChange: (update: (blocks: Block[]) => Block[]) => void; pendingGoalId: string | null; onPendingConsumed: () => void; onPlan: (goalId?: string) => void};
const dateObject = (key: string) => new Date(`${key}T12:00:00Z`);
const dayNumber = (key: string) => String(Number(key.slice(8)));
const tone = (id?: string) => id ? Array.from(id).reduce((hash,char)=>(hash+char.charCodeAt(0))%6,0) : 6;
const minutesLabel = (minutes: number) => minutes >= 60 ? `${Math.floor(minutes/60)}h${minutes%60 ? ` ${Math.round(minutes%60)}min` : ""}` : `${Math.round(minutes)} min`;
function shiftDay(key:string, count:number) {const date=dateObject(key); date.setUTCDate(date.getUTCDate()+count); return date.toISOString().slice(0,10);}
function blankDraft(date:string):CalendarEventDraft {return {goalId:"",activity:"",date,time:"",duration:"",repeat:"once",days:[],endsOn:""};}

export default function MonthlyPlanner({goals, blocks, disabled, onChange, pendingGoalId, onPendingConsumed, onPlan}:Props) {
  const {locale, t} = useI18n();
  const fullDate = (key: string) => new Intl.DateTimeFormat(locale, {weekday:"long",day:"numeric",month:"long",year:"numeric",timeZone:"UTC"}).format(dateObject(key));
  const formatMonth = (month: string) => new Intl.DateTimeFormat(locale, {month:"long",year:"numeric",timeZone:"UTC"}).format(dateObject(`${month}-01`));
  const briefType = (goal: Goal) => goal.tracking === "habit" ? getHabitSummary(goal, t) : goal.tracking === "monthly" ? `${t("Meta mensal")}${goal.target ? ` · ${goal.target} ${goal.metric}` : ""}` : goal.tracking === "checklist" ? t("Projeto por etapas") : goal.target ? `${goal.target} ${goal.metric || t("unidades")}` : t("Meta por quantidade");
  const [today,setToday]=useState("");
  const [month,setMonth]=useState("");
  const [selected,setSelected]=useState("");
  const [filter,setFilter]=useState("");
  const [search,setSearch]=useState("");
  const [dialog,setDialog]=useState(false);
  const [draft,setDraft]=useState<CalendarEventDraft>(blankDraft(""));
  const [editingId,setEditingId]=useState<string|null>(null);
  const [removed,setRemoved]=useState<{block:Block;index:number}|null>(null);
  const [announcement,setAnnouncement]=useState("");
  const addRef=useRef<HTMLButtonElement>(null);
  const dayPanelRef=useRef<HTMLElement>(null);
  const calendarRef=useRef<HTMLDivElement>(null);
  const calendarFocusRef=useRef<HTMLButtonElement>(null);
  const dialogReturnRef=useRef<HTMLButtonElement>(null);
  const consumedId=useRef<string|null>(null);
  useEffect(()=>{const date=localDateKey(new Date());setToday(date);setMonth(date.slice(0,7));setSelected(date);},[]);
  useEffect(()=>{if(filter && !goals.some(goal=>goal.id===filter))setFilter("");},[goals,filter]);
  useEffect(()=>{
    if(!pendingGoalId){consumedId.current=null;return;}
    if(disabled || !today || consumedId.current===pendingGoalId)return;
    consumedId.current=pendingGoalId;
    const goal=goals.find(value=>value.id===pendingGoalId);
    if(goal){setEditingId(null);setDraft({...blankDraft(selected||today),goalId:goal.id,activity:goal.next.trim()||getGoalTitle(goal, t),duration:goal.tracking==="habit"&&!goal.habit?.durationMax?goal.habit?.duration||"":""});setDialog(true);}
    else setAnnouncement("Esta meta não está mais no caderno. Você pode agendar uma atividade livre.");
    onPendingConsumed();
  },[pendingGoalId,disabled,today,selected,goals,onPendingConsumed]);
  const cells=month?buildMonthGrid(month):[];
  const matchingBlocks=filter?blocks.filter(block=>block.goalId===filter):blocks;
  const matchingGoals=filter?goals.filter(goal=>goal.id===filter):goals;
  const occurrences=new Map(cells.map(date=>[date,occurrencesForDate(matchingBlocks,date)]));
  const reviews=new Map(cells.map(date=>[date,matchingGoals.filter(goal=>goal.date===date)]));
  const monthCells=cells.filter(date=>date.startsWith(month));
  const monthCount=monthCells.reduce((sum,date)=>sum+(occurrences.get(date)?.length||0),0);
  const reviewCount=monthCells.reduce((sum,date)=>sum+(reviews.get(date)?.length||0),0);
  const selectedBlocks=selected?occurrencesForDate(matchingBlocks,selected):[];
  const selectedReviews=matchingGoals.filter(goal=>goal.date===selected);
  const selectedMinutes=selectedBlocks.reduce((sum,block)=>sum+(/^([01]\d|2[0-3]):[0-5]\d$/.test(block.time)&&Number(block.duration)>0&&Number(block.duration)<=1440?Number(block.duration):0),0);
  const visibleGoals=goals.filter(goal=>`${getGoalTitle(goal, t)} ${goal.area}`.toLocaleLowerCase(locale).includes(search.toLocaleLowerCase(locale)));
  const scheduledGoalIds=new Set(monthCells.flatMap(date=>occurrencesForDate(blocks,date).map(block=>block.goalId).filter(id=>id&&goals.some(goal=>goal.id===id))));
  const activeGoal=goals.find(goal=>goal.id===filter);
  const limit=blocks.length>=150;
  function rememberTrigger() {dialogReturnRef.current=document.activeElement instanceof HTMLButtonElement?document.activeElement:calendarFocusRef.current;}
  function openNew(goal?:Goal,date=selected||today,time="",duration?:string) {
    rememberTrigger();
    setEditingId(null);
    setDraft({...blankDraft(date),time,goalId:goal?.id||"",activity:goal?goal.next.trim()||getGoalTitle(goal, t):"",duration:duration??(goal?.tracking==="habit"&&!goal.habit?.durationMax?goal.habit?.duration||"":"")});
    setDialog(true);
  }
  function openEdit(block:Block) {
    rememberTrigger();
    setEditingId(block.id);
    setDraft({goalId:block.goalId||"",activity:block.activity,date:block.date||block.startsOn||"",legacyWeekly:!block.date&&!block.startsOn,time:block.time,duration:block.duration,repeat:block.date?"once":"weekly",days:WEEKDAYS.filter(day=>day===block.day),endsOn:block.endsOn||""});
    setDialog(true);
  }
  function submit(value:CalendarEventDraft):string|void {
    if(disabled)return t("Aguarde o caderno carregar.");
    if(value.goalId&&!goals.some(goal=>goal.id===value.goalId)&&blocks.find(block=>block.id===editingId)?.goalId!==value.goalId)return t("Escolha uma meta válida ou uma atividade livre.");
    if(editingId&&value.repeat==="weekly"&&value.days.length!==1)return t("Escolha um dia para esta rotina. Agende outros dias separadamente.");
    const input={...value,goalId:value.goalId||undefined,endsOn:value.repeat==="weekly"?value.endsOn||undefined:undefined};
    const update=(current:Block[])=>{
      if(editingId)return updateCalendarBlock(editingId,input,current);
      const next=createCalendarBlocks(input,current,()=>crypto.randomUUID());
      if(next.length===current.length)throw Error(t("Esse compromisso já está no calendário. Ajuste a data, o horário ou a atividade."));
      return next;
    };
    try {update(blocks);onChange(update);setAnnouncement(editingId?t("Compromisso atualizado."):t("Atividade adicionada ao calendário."));if(value.date){const focusDate=value.repeat==="weekly"?Array.from({length:7},(_,i)=>shiftDay(value.date,i)).find(date=>value.days.includes(weekdayForDate(date)))||value.date:value.date;setMonth(focusDate.slice(0,7));setSelected(focusDate);}setDialog(false);setFilter("");}
    catch(problem){return problem instanceof Error?problem.message:t("Revise os dados do compromisso.");}
  }
  function remove() {
    const block=blocks.find(value=>value.id===editingId);if(!block||disabled)return;
    setRemoved({block,index:blocks.findIndex(value=>value.id===block.id)});
    onChange(current=>current.filter(value=>value.id!==block.id));
    setDialog(false);setAnnouncement(block.date?t("Compromisso retirado. Você pode desfazer."):t("Rotina retirada de todas as semanas. Você pode desfazer."));
  }
  function pickDate(date:string,focusPanel=false){setSelected(date);if(date.slice(0,7)!==month)setMonth(date.slice(0,7));if(focusPanel)requestAnimationFrame(()=>{dayPanelRef.current?.focus({preventScroll:true});dayPanelRef.current?.scrollIntoView({block:"start",behavior:"instant"});});}
  function navigateMonth(delta:number){const next=shiftMonth(month,delta);setMonth(next);setSelected(`${next}-01`);}
  function keyboardDate(event:KeyboardEvent<HTMLButtonElement>,date:string){
    const delta=({ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7} as Partial<Record<string,number>>)[event.key];
    if(delta!==undefined){event.preventDefault();const next=shiftDay(date,delta);pickDate(next);requestAnimationFrame(()=>calendarRef.current?.querySelector<HTMLButtonElement>(`[data-date="${next}"]`)?.focus());}
  }
  return <section className={styles.planner} aria-label={t("Meu calendário mensal")}>
    <header className={styles.intro}><div><span className={styles.eyebrow}>{t("SUAS INTENÇÕES, NO TEMPO REAL")}</span><h2>{t("Veja o mês. Cultive um dia de cada vez.")}</h2><p>{t("Escolha uma meta para agendar. Clique em um dia para ver os horários e as revisões.")}</p></div><Button ref={addRef} type="button" disabled={disabled||limit||!today} onClick={()=>openNew()}><Plus/>{" " + t("Agendar atividade")}</Button></header>
    <div role="status" className="sr-only">{t(announcement)}</div>
    {removed&&!blocks.some(block=>block.id===removed.block.id)&&<div className={styles.undo}><span>“{removed.block.activity||t("Compromisso")}” {removed.block.date?t("foi retirado."):t("foi retirado de todas as semanas.")}</span><Button type="button" variant="outline" disabled={disabled||limit} onClick={()=>{onChange(current=>{if(current.length>=150||current.some(block=>block.id===removed.block.id))return current;const next=[...current];next.splice(Math.min(removed.index,next.length),0,removed.block);return next;});setRemoved(null);setAnnouncement("Compromisso restaurado.");}}><Undo2/>{" " + t("Desfazer")}</Button></div>}
    {limit&&<p className={styles.notice}>{t("Você chegou a 150 compromissos ou rotinas. Edite os existentes para reorganizar o calendário.")}</p>}
    <div className={styles.layout}>
      <aside className={styles.goals} aria-label={t("Metas para agendar")}>
        <div className={styles.goalsHeader}><span className={styles.eyebrow}>{t("MEUS CAMINHOS")}</span><h3>{t("Todas as metas") + " "}<span>{goals.length}</span></h3><p>{goals.length-scheduledGoalIds.size}{" " + t("sem atividade neste mês")}</p></div>
        <label className={styles.search}><Search size={15}/><Input aria-label={t("Buscar meta")} value={search} onChange={event=>setSearch(event.target.value)} placeholder={t("Buscar uma meta…")}/></label>
        <Button className={styles.allGoals} variant="outline" type="button" aria-pressed={!filter} onClick={()=>setFilter("")}>{t("Ver todas no calendário")}</Button>
        <div className={styles.goalList}>{visibleGoals.map(goal=><article key={goal.id} data-tone={tone(goal.id)} className={styles.goalCard} aria-label={getGoalTitle(goal, t)}>
          <button type="button" className={styles.goalFilter} aria-pressed={filter===goal.id} onClick={()=>setFilter(filter===goal.id?"":goal.id)}><span className={styles.dot}/><span><strong>{getGoalTitle(goal, t)}</strong><small>{goal.area||t("Área livre")}</small></span></button>
          <p>{briefType(goal)}</p><div className={styles.goalFooter}><span>{scheduledGoalIds.has(goal.id)?t("Agendada no mês"):t("Sem horário no mês")}</span><Button type="button" variant="ghost" disabled={disabled||limit} aria-label={t("Agendar: {title}", {title: getGoalTitle(goal, t)})} onClick={()=>openNew(goal)}><Plus size={14}/>{" " + t("Agendar")}</Button></div>
        </article>)}</div>
        {!goals.length&&<p className={styles.emptyGoals}>{t("Suas metas do passo 5 aparecerão aqui.")}</p>}{goals.length>0&&!visibleGoals.length&&<p className={styles.emptyGoals}>{t("Nenhuma meta encontrada.")}</p>}
        <Button type="button" variant="outline" className={styles.planButton} onClick={()=>onPlan()}>{t("Organizar minhas metas") + " "}<ChevronRight size={15}/></Button>
      </aside>
      <div className={styles.main}>
        <div className={styles.calendar}>
          <div className={styles.toolbar}><div><span className={styles.eyebrow}>{t("VISÃO MENSAL")}</span><h3 aria-live="polite">{month?formatMonth(month):t("Abrindo calendário…")}</h3></div><div className={styles.monthActions}><Button type="button" variant="outline" disabled={!today} onClick={()=>{setMonth(today.slice(0,7));setSelected(today);}}>{t("Hoje")}</Button><Button type="button" variant="ghost" size="icon" aria-label={t("Mês anterior")} disabled={!month} onClick={()=>navigateMonth(-1)}><ChevronLeft/></Button><Button type="button" variant="ghost" size="icon" aria-label={t("Próximo mês")} disabled={!month} onClick={()=>navigateMonth(1)}><ChevronRight/></Button></div></div>
          <div className={styles.calendarSummary}><span><CalendarDays size={14}/> {monthCount} {monthCount===1?t("atividade"):t("atividades")}</span><span><Target size={14}/> {reviewCount} {reviewCount===1?t("revisão de meta"):t("revisões de metas")}</span>{activeGoal&&<button type="button" onClick={()=>setFilter("")}>{t("Filtro:") + " "}{getGoalTitle(activeGoal, t)} ×</button>}</div>
          <div className={styles.grid} ref={calendarRef} role="group" aria-label={month?t("Calendário de {month}", {month: formatMonth(month)}):t("Calendário")}>
            {WEEKDAYS.map(day=><div key={day} className={styles.weekday} aria-hidden="true">{t(day).slice(0,3)}</div>)}
            {cells.map(date=>{const events=occurrences.get(date)||[],due=reviews.get(date)||[],hidden=events.length+due.length-Math.min(events.length,2)-Math.min(due.length,1);return <button type="button" key={date} ref={date===selected?calendarFocusRef:undefined} data-date={date} className={styles.day} data-outside={!date.startsWith(month)} data-selected={date===selected} data-today={date===today} aria-pressed={date===selected} aria-current={date===today?"date":undefined} aria-label={t("{date}; {activities} atividades; {reviews} revisões", {date: fullDate(date), activities: events.length, reviews: due.length})} tabIndex={date===selected?0:-1} onKeyDown={event=>keyboardDate(event,date)} onClick={()=>pickDate(date,true)}>
              <span className={styles.dayTop}><span className={styles.dayNumber}>{dayNumber(date)}</span>{date===today&&<small>{t("Hoje")}</small>}</span>
              <span className={styles.dayEvents}>{events.slice(0,2).map(block=><span className={styles.eventChip} key={block.id} data-tone={tone(block.goalId)}><span>{block.time}</span> {block.activity||t("Atividade")}</span>)}{due.slice(0,1).map(goal=><span className={styles.reviewChip} key={goal.id}>{t("Revisar ·") + " "}{getGoalTitle(goal, t)}</span>)}{hidden>0&&<span className={styles.more}>+{hidden}{" " + t("mais")}</span>}</span>
              <span className={styles.mobileDots} aria-hidden="true">{events.slice(0,3).map(block=><span className={styles.dot} data-tone={tone(block.goalId)} key={block.id}/>)}{due.length>0&&<span className={styles.reviewDot}/>}</span>
            </button>;})}
          </div>
          <p className={styles.legend}><span><i/>{" " + t("Atividade agendada")}</span><span><i/>{" " + t("Revisão da meta")}</span><small>{t("As revisões vêm das datas que você definiu no passo 5.")}</small></p>
        </div>
        {selected&&<section className={styles.dayPanel} ref={dayPanelRef} tabIndex={-1} aria-label={t("Agenda de {date}", {date: fullDate(selected)})}>
          <header><div><span className={styles.eyebrow}>{selected===today?t("SEU DIA, HOJE"):t("DIA SELECIONADO")}</span><h3>{fullDate(selected)}</h3><p>{selectedBlocks.length} {selectedBlocks.length===1?t("atividade"):t("atividades")} · {minutesLabel(selectedMinutes)}{" " + t("reservados")}</p></div><Button type="button" variant="outline" disabled={disabled||limit} onClick={()=>openNew(activeGoal)}><Plus size={15}/>{" " + t("Agendar neste dia")}</Button></header>
          <DayTimePicker date={selected} blocks={blocks} disabled={disabled||limit} onPick={(time,duration)=>openNew(activeGoal,selected,time,duration)} onOther={duration=>openNew(activeGoal,selected,"",duration)}/>
          {selectedBlocks.map(block=>{const goal=goals.find(value=>value.id===block.goalId);return <article key={block.id} className={styles.agendaItem} data-tone={tone(block.goalId)} aria-label={block.activity||t("Atividade")}><div className={styles.agendaTime}><strong>{block.time||"—"}</strong><small>{block.duration} min</small></div><span className={styles.dot}/><div className={styles.agendaText}><h4>{block.activity||t("Atividade")}</h4><p>{goal?getGoalTitle(goal, t):block.goalId?t("Meta removida"):t("Atividade livre")}{!block.date&&<span><Repeat2 size={12}/>{" " + t("Toda semana")}</span>}</p></div><Button type="button" variant="ghost" aria-label={t("Editar: {activity}", {activity: block.activity || t("Atividade")})} onClick={()=>openEdit(block)}>{t("Editar")}</Button></article>;})}
          {selectedReviews.map(goal=><article key={goal.id} className={styles.reviewItem}><ListChecks size={20}/><div><span>{t("REVISÃO DA META")}</span><h4>{getGoalTitle(goal, t)}</h4><p>{t("Reserve um momento para observar seu avanço e ajustar o próximo passo.")}</p></div><Button type="button" variant="ghost" onClick={()=>onPlan(goal.id)}>{t("Ver meta") + " "}<ChevronRight size={14}/></Button></article>)}
        </section>}
        <p className={styles.footnote}>{t("Agendar cria espaço para praticar. Seus resultados continuam sendo acompanhados nas metas do passo 5.")}</p>
      </div>
    </div>
    <CalendarEventDialog open={dialog} onOpenChange={setDialog} goals={goals} initialDraft={draft} editing={Boolean(editingId)} disabled={disabled} onSubmit={submit} onDelete={editingId?remove:undefined} returnFocusRef={dialogReturnRef} fallbackFocusRef={dayPanelRef}/>
  </section>;
}
