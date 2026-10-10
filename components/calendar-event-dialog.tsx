"use client";

import {useEffect, useId, useRef, useState, type FormEvent, type RefObject} from "react";
import {CalendarDays, Link2, Repeat2, Trash2, X} from "lucide-react";
import {useI18n} from "@/lib/i18n";
import type {Goal} from "@/app/content";
import {getGoalTitle, getHabitSummary} from "@/lib/goal-planning";
import {WEEKDAYS, type Weekday} from "@/lib/weekly-planning";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle} from "@/components/ui/dialog";
import styles from "./calendar-event-dialog.module.css";

export type CalendarEventDraft = {
  goalId: string;
  activity: string;
  date: string;
  time: string;
  duration: string;
  repeat: "once" | "weekly";
  days: Weekday[];
  endsOn: string;
  legacyWeekly?: boolean;
};
type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goals: Goal[];
  initialDraft: CalendarEventDraft;
  editing: boolean;
  disabled: boolean;
  onSubmit: (draft: CalendarEventDraft) => string | void;
  onDelete?: () => void;
  returnFocusRef?: RefObject<HTMLButtonElement | null>;
  fallbackFocusRef?: RefObject<HTMLElement | null>;
};
const copyDraft = (draft: CalendarEventDraft): CalendarEventDraft => ({...draft, days: [...draft.days]});
const validDate = (date: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
};

export default function CalendarEventDialog({open, onOpenChange, goals, initialDraft, editing, disabled, onSubmit, onDelete, returnFocusRef, fallbackFocusRef}: Props) {
  const {t} = useI18n();
  const [draft, setDraft] = useState<CalendarEventDraft>(() => copyDraft(initialDraft));
  const [error, setError] = useState("");
  const [invalidField, setInvalidField] = useState("");
  const previousOpen = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const id = useId();
  const selectedGoal = goals.find(goal => goal.id === draft.goalId);
  const editingRoutine = editing && initialDraft.repeat === "weekly";
  const keepUnboundedStart = editingRoutine && initialDraft.legacyWeekly === true && draft.repeat === "weekly";
  const originalDay = initialDraft.days[0];
  const originalDayLabel = originalDay ? t(originalDay) : "";
  const errorId = `${id}-error`;

  useEffect(() => {
    if (open && !previousOpen.current) {
      setDraft(copyDraft(initialDraft));
      setError("");
      setInvalidField("");
    }
    previousOpen.current = open;
  }, [open, initialDraft]);

  function update(patch: Partial<CalendarEventDraft>) {
    setDraft(current => ({...current, ...patch}));
    if (error) {setError(""); setInvalidField("");}
  }
  function selectGoal(goalId: string) {
    const goal = goals.find(value => value.id === goalId);
    if (!goal) {update({goalId}); return;}
    update({
      goalId,
      activity: goal.next.trim() || getGoalTitle(goal, t),
      duration: draft.duration || (goal.tracking === "habit" && !goal.habit?.durationMax ? goal.habit?.duration ?? "" : ""),
    });
  }
  function changeRepeat(repeat: CalendarEventDraft["repeat"]) {
    // A saved appointment remains a single editable series even if its cadence changes.
    update({repeat, days: editing && draft.days.length > 1 ? draft.days.slice(0, 1) : draft.days});
  }
  function fail(message: string, field: string) {
    setError(message);
    setInvalidField(field);
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>(`[name="${field}"]`)?.focus());
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;
    if (!draft.activity.trim()) {fail("Escreva a atividade que quer reservar neste tempo.", "activity"); return;}
    if (!(keepUnboundedStart && !draft.date) && !validDate(draft.date)) {fail("Escolha uma data válida para o compromisso.", "date"); return;}
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.time)) {fail("Escolha um horário de início válido.", "time"); return;}
    if (!draft.duration.trim() || !Number.isFinite(Number(draft.duration)) || Number(draft.duration) <= 0 || Number(draft.duration) > 1440) {fail("Informe uma duração maior que zero e de até 1.440 minutos.", "duration"); return;}
    if (draft.repeat === "weekly") {
      if (!draft.days.length) {fail("Escolha pelo menos um dia da semana.", "days"); return;}
      if (editing && draft.days.length !== 1) {fail("Escolha um dia para esta rotina. Para outro dia, crie mais um compromisso.", "days"); return;}
      if (draft.endsOn && (!validDate(draft.endsOn) || draft.endsOn < draft.date)) {fail("A data final precisa ser igual ou posterior ao início da rotina.", "endsOn"); return;}
    }
    try {
      const message = onSubmit(copyDraft(draft));
      if (message) {setError(message); setInvalidField("");}
      else onOpenChange(false);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : t("Não foi possível guardar este compromisso. Revise os campos e tente novamente."));
      setInvalidField("");
    }
  }
  const invalidProps = (field: string) => ({"aria-invalid": invalidField === field || undefined, "aria-describedby": invalidField === field ? errorId : undefined});

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className={styles.dialog} showCloseButton={false} onCloseAutoFocus={event => {const trigger=returnFocusRef?.current;const target=trigger?.isConnected&&!trigger.disabled?trigger:fallbackFocusRef?.current;if(target){event.preventDefault();target.focus();}}}>
      <DialogHeader>
        <DialogTitle>{editing ? t("Ajustar meu compromisso") : t("Abrir espaço no calendário")}</DialogTitle>
        <DialogDescription>{editing ? t("Mude o que precisar para este tempo continuar fazendo sentido.") : t("Reserve um momento para uma meta, um cuidado ou algo que você quer viver.")}</DialogDescription>
      </DialogHeader>
      <DialogClose asChild><Button className={styles.closeButton} type="button" size="icon" variant="ghost" aria-label={t("Fechar compromisso")}><X/></Button></DialogClose>
      <form className={styles.form} ref={formRef} onSubmit={submit} noValidate>
        <fieldset disabled={disabled} className={styles.fields}>
          <label>{t("Atividade")}<Input name="activity" required value={draft.activity} maxLength={2000} placeholder={t("O que vou fazer neste tempo?")} onChange={event => update({activity: event.target.value})} {...invalidProps("activity")}/></label>
          <label>{t("Meta relacionada")}<select value={draft.goalId} onChange={event => selectGoal(event.target.value)}><option value="">{t("Compromisso livre")}</option>{draft.goalId && !selectedGoal && <option value={draft.goalId}>{t("Meta removida")}</option>}{goals.map(goal => <option value={goal.id} key={goal.id}>{getGoalTitle(goal, t)}</option>)}</select></label>
          {selectedGoal && <div className={styles.goalNote}><Link2 size={17}/><div><strong>{getGoalTitle(selectedGoal, t)}</strong><p>{selectedGoal.tracking === "habit" ? getHabitSummary(selectedGoal, t) : t("Um espaço na agenda para avançar nesta meta.")}</p></div></div>}
          <fieldset className={styles.repeatField}><legend>{t("Quando acontece?")}</legend><div className={styles.repeatChoices}>
            <label><input type="radio" name={`${id}-repeat`} checked={draft.repeat === "once"} onChange={() => changeRepeat("once")}/><span><CalendarDays size={17}/>{" " + t("Esta data")}</span></label>
            <label><input type="radio" name={`${id}-repeat`} checked={draft.repeat === "weekly"} onChange={() => changeRepeat("weekly")}/><span><Repeat2 size={17}/>{" " + t("Toda semana")}</span></label>
          </div></fieldset>
          <div className={styles.dateFields}>
            <label>{keepUnboundedStart ? t("Data inicial (opcional)") : draft.repeat === "weekly" ? t("A partir de") : t("Data")}<Input name="date" type="date" required={!keepUnboundedStart} value={draft.date} onInput={event => update({date: event.currentTarget.value})} onChange={event => update({date: event.target.value})} {...invalidProps("date")}/></label>
            {draft.repeat === "weekly" && <label>{t("Até quando? (opcional)")}<Input name="endsOn" type="date" min={draft.date || undefined} value={draft.endsOn} onInput={event => update({endsOn: event.currentTarget.value})} onChange={event => update({endsOn: event.target.value})} {...invalidProps("endsOn")}/></label>}
          </div>
          {keepUnboundedStart && <p className={styles.legacyNote}>{t("Esta rotina já existia sem data inicial. Deixe em branco para manter as semanas anteriores.")}</p>}
          {draft.repeat === "weekly" && <fieldset className={styles.daysField}><legend>{editing ? t("Em qual dia da semana?") : t("Em quais dias da semana?")}</legend><div className={styles.dayChoices}>{WEEKDAYS.map(day => <label key={day}><input type={editing ? "radio" : "checkbox"} name="days" checked={draft.days.includes(day)} onChange={event => {const checked = event.target.checked; update({days: editing ? [day] : checked ? [...draft.days, day] : draft.days.filter(value => value !== day)});}} {...invalidProps("days")}/><span aria-hidden="true">{t(day).slice(0, 3)}</span><span className="sr-only">{t(day)}</span></label>)}</div><p>{editing ? t("Para praticar em mais dias, adicione outros compromissos.") : t("O mesmo horário e duração serão usados em cada dia escolhido.")}</p></fieldset>}
          <div className={styles.timeFields}>
            <label>{t("Horário de início")}<Input name="time" type="time" required value={draft.time} onInput={event => update({time: event.currentTarget.value})} onChange={event => update({time: event.target.value})} {...invalidProps("time")}/></label>
            <label>{t("Duração em minutos")}<Input name="duration" type="number" min="0.01" max="1440" step="any" required value={draft.duration} placeholder={t("Ex.: 60")} onChange={event => update({duration: event.target.value})} {...invalidProps("duration")}/></label>
          </div>
          {selectedGoal?.tracking === "habit" && selectedGoal.habit?.durationMax && <p className={styles.durationHint}>{t("Sua intenção é de {min} a {max} minutos. Escolha quanto tempo reservar.", {min: selectedGoal.habit.duration, max: selectedGoal.habit.durationMax})}</p>}
          {editingRoutine && <div className={styles.routineNote}><Repeat2 size={17}/><p><strong>{t("Todas as repetições deste compromisso")}</strong>{t("Esta edição vale para as repetições deste compromisso ({day}), inclusive as datas anteriores no calendário. Os compromissos dos outros dias continuam como estão.", {day: originalDayLabel})}</p></div>}
          {error && <p id={errorId} className={styles.error} role="alert">{t(error)}</p>}
          <div className={styles.actions}><DialogClose asChild><Button variant="outline" type="button">{t("Cancelar")}</Button></DialogClose><Button type="submit" className={styles.primary} disabled={disabled}>{editing ? t("Salvar alterações") : t("Adicionar ao calendário")}</Button></div>
          {editing && onDelete && <Button variant="ghost" type="button" className={styles.deleteButton} onClick={onDelete}><Trash2 size={15}/>{editingRoutine ? t("Retirar todas as repetições") : t("Retirar compromisso")}</Button>}
        </fieldset>
      </form>
    </DialogContent>
  </Dialog>;
}
