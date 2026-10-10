"use client";

import {useEffect, useRef, useState, type FormEvent} from "react";
import {CalendarDays, ChevronDown, ChevronUp, Clock3, Link2, Plus, Trash2, Undo2, X} from "lucide-react";
import type {Block, Goal} from "@/app/content";
import {getGoalTitle, getHabitSummary} from "@/lib/goal-planning";
import {createWeeklyBlocks, WEEKDAYS, type Weekday} from "@/lib/weekly-planning";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle} from "@/components/ui/dialog";
import styles from "./weekly-planner.module.css";

type Props = {
  goals: Goal[];
  blocks: Block[];
  disabled: boolean;
  onChange: (update: (blocks: Block[]) => Block[]) => void;
  pendingGoalId: string | null;
  onPendingConsumed: () => void;
};
type AppointmentDraft = {goalId: string; activity: string; days: Weekday[]; time: string; duration: string};
const emptyDraft = (): AppointmentDraft => ({goalId: "", activity: "", days: [], time: "", duration: ""});
const validTime = (time: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
const validDuration = (duration: string) => Number(duration) > 0 && Number(duration) <= 1440;
const formatMinutes = (minutes: number) => minutes >= 60 ? `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}min` : ""}` : `${minutes} min`;

export default function WeeklyPlanner({goals, blocks, disabled, onChange, pendingGoalId, onPendingConsumed}: Props) {
  const [dialog, setDialog] = useState(false);
  const [draft, setDraft] = useState<AppointmentDraft>(emptyDraft);
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [removed, setRemoved] = useState<{block: Block; index: number} | null>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const plannerRef = useRef<HTMLElement>(null);
  const consumedId = useRef<string | null>(null);
  const selectedGoal = goals.find(goal => goal.id === draft.goalId);
  const limit = blocks.length >= 150;
  const totalMinutes = blocks.reduce((sum, block) => sum + (validTime(block.time) && validDuration(block.duration) ? Number(block.duration) : 0), 0);
  const scheduledDays = new Set(blocks.map(block => block.day)).size;
  const incompleteBlocks = blocks.filter(block => !validTime(block.time) || !validDuration(block.duration)).length;

  useEffect(() => {
    if (!pendingGoalId) {consumedId.current = null; return;}
    if (disabled || consumedId.current === pendingGoalId) return;
    consumedId.current = pendingGoalId;
    const goal = goals.find(value => value.id === pendingGoalId);
    if (goal) {
      setDraft({goalId: goal.id, activity: goal.next.trim() || getGoalTitle(goal), days: [], time: "", duration: goal.tracking === "habit" && !goal.habit?.durationMax ? goal.habit?.duration ?? "" : ""});
      setError("");
      setDialog(true);
      returnFocusRef.current = null;
    } else {
      setAnnouncement("Esta meta não está mais no caderno. Você pode criar um compromisso livre.");
    }
    onPendingConsumed();
  }, [pendingGoalId, disabled, goals, onPendingConsumed]);

  function openNew(day?: Weekday) {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDraft({...emptyDraft(), days: day ? [day] : []});
    setError("");
    setDialog(true);
  }
  function selectGoal(goalId: string) {
    const goal = goals.find(value => value.id === goalId);
    setDraft(current => ({...current, goalId, activity: goal ? goal.next.trim() || getGoalTitle(goal) : current.activity, duration: goal?.tracking === "habit" && !goal.habit?.durationMax ? goal.habit?.duration ?? "" : current.duration}));
    setError("");
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;
    if (draft.goalId && !selectedGoal) {setError("Esta meta foi removida. Escolha outra ou use compromisso livre."); return;}
    const input = {...draft, goalId: draft.goalId || undefined};
    try {
      const result = createWeeklyBlocks(input, blocks, () => crypto.randomUUID());
      const added = result.length - blocks.length;
      if (!added) {setError("Esses compromissos já estão na sua semana. Escolha outro horário ou ajuste a atividade."); return;}
      onChange(current => createWeeklyBlocks(input, current, () => crypto.randomUUID()));
      setAnnouncement(`${added} ${added === 1 ? "compromisso adicionado" : "compromissos adicionados"} à sua semana.`);
      setDialog(false);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Revise os dias, horário e duração antes de continuar.");
    }
  }
  function updateBlock(id: string, patch: Partial<Block>) {
    onChange(current => current.map(block => block.id === id ? {...block, ...patch} : block));
  }
  function remove(block: Block) {
    setRemoved({block, index: blocks.findIndex(value => value.id === block.id)});
    onChange(current => current.filter(value => value.id !== block.id));
    if (expandedId === block.id) setExpandedId(null);
    setAnnouncement("Compromisso retirado da semana. A meta continua no passo 5.");
    requestAnimationFrame(() => addButtonRef.current?.focus());
  }
  function focusEditor(id: string) {
    requestAnimationFrame(() => plannerRef.current?.querySelector<HTMLInputElement>(`[data-block-activity="${id}"]`)?.focus());
  }

  return <section className={styles.planner} aria-label="Meu planejamento semanal" ref={plannerRef}>
    <header className={styles.intro}>
      <div><span className={styles.eyebrow}>DA INTENÇÃO AO TEMPO REAL</span><h2>Uma semana que cabe na sua vida.</h2><p>Escolha dias e horários para praticar suas metas, cuidar de você e descansar.</p></div>
      <Button ref={addButtonRef} type="button" disabled={disabled || limit} onClick={() => openNew()}><Plus/> Novo compromisso</Button>
    </header>
    <div className={styles.overview}>
      <span><CalendarDays size={18}/><strong>{blocks.length}</strong> {blocks.length === 1 ? "compromisso" : "compromissos"}</span>
      <span><Clock3 size={18}/><strong>{formatMinutes(totalMinutes)}</strong> reservados</span>
      <span>{scheduledDays} de 7 dias com planos</span>
      <p>Esta é sua rotina semanal. Reservar um horário não conclui uma meta; você acompanha os resultados no passo 5.</p>
    </div>
    <div className="sr-only" role="status">{announcement}</div>
    {incompleteBlocks > 0 && <p className={styles.notice} role="status">{incompleteBlocks === 1 ? "Há um compromisso com horário ou duração a ajustar." : `Há ${incompleteBlocks} compromissos com horário ou duração a ajustar.`} Ajuste os campos destacados para salvar sua semana.</p>}
    {limit && <p className={styles.notice}>Seu caderno já tem 150 compromissos. Ajuste os existentes para abrir espaço.</p>}
    {removed && !blocks.some(block => block.id === removed.block.id) && <div className={styles.undo} role="status"><span>“{removed.block.activity || "Compromisso"}” foi retirado.</span><Button variant="outline" type="button" disabled={disabled || limit} onClick={() => {onChange(current => {if (current.length >= 150 || current.some(block => block.id === removed.block.id)) return current; const next = [...current]; next.splice(Math.min(removed.index, next.length), 0, removed.block); return next;}); setExpandedId(removed.block.id); focusEditor(removed.block.id); setRemoved(null); setAnnouncement("Compromisso restaurado.");}}><Undo2/> Desfazer</Button></div>}
    <div className={styles.week}>
      {WEEKDAYS.map((day, index) => {
        const dayBlocks = blocks.filter(block => block.day === day).sort((left, right) => left.time.localeCompare(right.time));
        return <section className={styles.day} key={day} aria-label={day}>
          <header className={styles.dayHeader}><div><span className={styles.dayNumber}>{String(index + 1).padStart(2, "0")}</span><h3>{day}</h3><span className={styles.dayCount}>{dayBlocks.length}</span></div><Button variant="ghost" type="button" size="icon" disabled={disabled || limit} aria-label={`Adicionar compromisso: ${day}`} onClick={() => openNew(day)}><Plus size={17}/></Button></header>
          <div className={styles.dayContent}>{dayBlocks.map(block => {
            const goal = goals.find(value => value.id === block.goalId);
            const expanded = expandedId === block.id;
            const editorId = `weekly-block-${block.id}`;
            const timeInvalid = !validTime(block.time);
            const durationInvalid = !validDuration(block.duration);
            return <article className={styles.block} key={block.id} aria-label={block.activity || "Compromisso sem título"}>
              <div className={styles.blockTime}><span>{timeInvalid ? "Horário a escolher" : block.time}</span><small>{durationInvalid ? "Duração a ajustar" : `${block.duration} min`}</small></div>
              <h4>{block.activity || "O que vou cultivar?"}</h4>
              {block.goalId && <p className={styles.goalTag}><Link2 size={12}/>{goal ? getGoalTitle(goal) : "Meta removida"}</p>}
              <Button className={styles.editButton} type="button" variant="ghost" aria-expanded={expanded} aria-controls={editorId} onClick={() => setExpandedId(expanded ? null : block.id)}>{expanded ? "Recolher" : "Ajustar"}{expanded ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}</Button>
              {expanded && <fieldset className={styles.editor} id={editorId} disabled={disabled}><legend className="sr-only">Ajustar compromisso</legend>
                <label>Atividade<Input data-block-activity={block.id} value={block.activity} maxLength={2000} onChange={event => updateBlock(block.id, {activity: event.target.value})}/></label>
                <label>Meta relacionada<select value={block.goalId ?? ""} onChange={event => updateBlock(block.id, {goalId: event.target.value || undefined})}><option value="">Compromisso livre</option>{block.goalId && !goal && <option value={block.goalId}>Meta removida</option>}{goals.map(value => <option key={value.id} value={value.id}>{getGoalTitle(value)}</option>)}</select></label>
                <label>Dia<select value={block.day} onChange={event => {updateBlock(block.id, {day: event.target.value}); focusEditor(block.id);}}>{WEEKDAYS.map(value => <option key={value}>{value}</option>)}</select></label>
                <div className={styles.timeFields}><label>Início<Input type="time" aria-invalid={timeInvalid} aria-describedby={timeInvalid ? `${editorId}-time-error` : undefined} value={block.time} onInput={event => updateBlock(block.id, {time: event.currentTarget.value})} onChange={event => updateBlock(block.id, {time: event.target.value})}/></label><label>Minutos<Input type="number" min="0.01" max="1440" step="any" aria-invalid={durationInvalid} aria-describedby={durationInvalid ? `${editorId}-duration-error` : undefined} value={block.duration} onChange={event => updateBlock(block.id, {duration: event.target.value})}/></label></div>
                {timeInvalid && <p id={`${editorId}-time-error`} className={styles.fieldError}>Escolha um horário de início válido.</p>}
                {durationInvalid && <p id={`${editorId}-duration-error`} className={styles.fieldError}>Informe uma duração maior que zero e de até 1.440 minutos.</p>}
                <Button className={styles.removeButton} variant="ghost" type="button" onClick={() => remove(block)}><Trash2 size={14}/> Retirar da semana</Button>
              </fieldset>}
            </article>;
          })}
          {!dayBlocks.length && <div className={styles.empty}><CalendarDays size={22}/><span>Espaço para a vida.</span><p>Nem todo horário precisa de um plano.</p></div>}</div>
        </section>;
      })}
    </div>
    <Dialog open={dialog} onOpenChange={setDialog}>
      <DialogContent className={styles.dialog} showCloseButton={false} onCloseAutoFocus={event => {event.preventDefault(); const target = returnFocusRef.current; (target?.isConnected ? target : addButtonRef.current)?.focus();}}>
        <DialogHeader><DialogTitle>Abra espaço na sua semana</DialogTitle><DialogDescription>Escolha quando esta atividade cabe na sua rotina. Você pode ajustar depois.</DialogDescription></DialogHeader>
        <DialogClose asChild><Button className={styles.closeDialog} type="button" variant="ghost" size="icon" aria-label="Fechar compromisso"><X/></Button></DialogClose>
        <form className={styles.form} onSubmit={submit}>
          <fieldset disabled={disabled}>
            <label>Meta relacionada<select value={draft.goalId} onChange={event => selectGoal(event.target.value)}><option value="">Compromisso livre</option>{draft.goalId && !selectedGoal && <option value={draft.goalId}>Meta removida</option>}{goals.map(goal => <option key={goal.id} value={goal.id}>{getGoalTitle(goal)}</option>)}</select></label>
            {selectedGoal && <div className={styles.goalNote}><Link2 size={17}/><div><strong>{getGoalTitle(selectedGoal)}</strong><p>{selectedGoal.tracking === "habit" ? getHabitSummary(selectedGoal) : "Escolha uma ação que ajude a avançar nesta meta."}</p></div></div>}
            <label>O que vou fazer neste tempo?<Input required value={draft.activity} maxLength={2000} placeholder="Ex.: praticar piano, caminhar ou atualizar meu currículo" onChange={event => setDraft(current => ({...current, activity: event.target.value}))}/></label>
            <fieldset className={styles.daysField}><legend>Em quais dias?</legend><div className={styles.dayChoices}>{WEEKDAYS.map(day => <label key={day}><input type="checkbox" checked={draft.days.includes(day)} onChange={event => setDraft(current => ({...current, days: event.target.checked ? [...current.days, day] : current.days.filter(value => value !== day)}))}/><span aria-hidden="true">{day.slice(0, 3)}</span><span className="sr-only">{day}</span></label>)}</div><p>Escolha apenas os dias que cabem na sua semana.</p></fieldset>
            <div className={styles.timeFields}><label>Horário de início<Input type="time" required value={draft.time} onInput={event => {const time = event.currentTarget.value; setDraft(current => ({...current, time}));}} onChange={event => setDraft(current => ({...current, time: event.target.value}))}/></label><label>Duração em minutos<Input type="number" required min="1" max="1440" step="1" value={draft.duration} placeholder="Ex.: 60" onChange={event => setDraft(current => ({...current, duration: event.target.value}))}/></label></div>
            {selectedGoal?.tracking === "habit" && selectedGoal.habit?.durationMax && <p className={styles.durationHint}>Sua intenção é de {selectedGoal.habit.duration} a {selectedGoal.habit.durationMax} minutos. Escolha quanto tempo reservar.</p>}
            <p className={styles.scheduleNote}>O mesmo horário e duração serão reservados em cada dia escolhido.</p>
            {error && <p className={styles.error} role="alert">{error}</p>}
            <div className={styles.dialogFooter}><DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose><Button type="submit" disabled={disabled}>Adicionar à minha semana</Button></div>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  </section>;
}
