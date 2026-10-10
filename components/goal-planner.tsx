"use client";

import {useEffect, useRef, useState} from "react";
import {ArrowRight, BookOpen, CalendarDays, Check, ChevronDown, ChevronUp, Guitar, ListChecks, Music2, Plus, Repeat2, Target, Trash2, Undo2, X} from "lucide-react";
import {isValidCalendarDate} from "@/lib/calendar-planning";
import {useI18n} from "@/lib/i18n";
import type {Goal} from "@/app/content";
import {createPlanningGoal, getGoalProgress, getGoalTitle, setMonthlyGoalProgress, getHabitSummary, type PlanningTemplate} from "@/lib/goal-planning";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {Progress} from "@/components/ui/progress";
import {Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger} from "@/components/ui/dialog";
import styles from "./goal-planner.module.css";

type Template = PlanningTemplate;
type Props = {
  initialGoalId?: string | null;
  onInitialGoalConsumed?: () => void;
  goals: Goal[];
  disabled: boolean;
  onChange: (update: (goals: Goal[]) => Goal[]) => void;
  onPractice: (goalId?: string) => void;
};
const templates = [
  {id: "habit", icon: Repeat2, tag: "HÁBITO", title: "Cultivar uma rotina", description: "Academia, meditação, escrita… defina a frequência e o tempo que quer dedicar."},
  {id: "project", icon: ListChecks, tag: "PROJETO", title: "Avançar por etapas", description: "Encontrar trabalho, aprender uma peça, organizar uma viagem… divida o caminho em ações."},
  {id: "monthly", icon: CalendarDays, tag: "META MENSAL", title: "Um resultado por mês", description: "Livros lidos, músicas criadas… cada mês guarda seu próprio resultado."},
  {id: "custom", icon: Target, tag: "QUANTIDADE", title: "Construir aos poucos", description: "Um repertório de 30 músicas, uma coleção… acompanhe o quanto já construiu."},
] as const;
const examples = [
  {id: "reading", icon: BookOpen, tag: "LEITURA", title: "1 livro por mês", description: "Acompanhe os livros concluídos; reserve os momentos de leitura no passo 6."},
  {id: "repertoire", icon: Guitar, tag: "REPERTÓRIO", title: "30 músicas para tocar", description: "Escolha seu instrumento e acompanhe quantas músicas já consegue tocar."},
  {id: "composition", icon: Music2, tag: "CRIAÇÃO", title: "1 composição por mês", description: "Dê espaço às suas músicas, com um resultado registrado a cada mês."},
  {id: "technique", icon: ListChecks, tag: "TÉCNICA", title: "Um arranjo de cada vez", description: "Divida dedilhados e arranjos em pequenas etapas que você consegue concluir."},
] as const;
const currentMonth = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};
const monthLabel = (month: string, locale: string, t: (key: string) => string) => {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return t("mês selecionado");
  const [year, number] = month.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, {month: "long", year: "numeric"}).format(new Date(year, number - 1, 1));
};

function GoalTemplates({area, setArea, disabled, onCreate}: {
  area: string; setArea: (value: string) => void; disabled: boolean; onCreate: (template: Template) => void;
}) {
  const {t} = useI18n();
  return <div className={styles.templates}>
    <div className={styles.areaChoice}>
      <label>{t("Área ou instrumento")}<Input value={area} maxLength={2000} onChange={event => setArea(event.target.value)} placeholder={t("Ex.: trabalho, leitura, violão…")} disabled={disabled}/></label>
      <div className={styles.chips} aria-label={t("Sugestões de área")}>{["Corpo", "Trabalho", "Leitura", "Música"].map(instrument => <button type="button" key={instrument} disabled={disabled} aria-pressed={area === t(instrument)} onClick={() => setArea(t(instrument))}>{t(instrument)}</button>)}</div>
    </div>
    <div className={styles.templateGrid}>{templates.map(template => <button className={styles.template} type="button" disabled={disabled} key={template.id} onClick={() => onCreate(template.id)}>
      <span className={styles.templateTop}><template.icon size={21}/><span>{t(template.tag)}</span><Plus size={16}/></span>
      <strong>{t(template.title)}</strong><span className={styles.templateDescription}>{t(template.description)}</span>
    </button>)}</div>
    <details className={styles.exampleModels}><summary>{t("Prefere um exemplo? Música e leitura") + " "}<ChevronDown size={16}/></summary>
      <div className={styles.templateGrid}>{examples.map(template => <button className={styles.template} type="button" disabled={disabled} key={template.id} onClick={() => onCreate(template.id)}>
        <span className={styles.templateTop}><template.icon size={21}/><span>{t(template.tag)}</span><Plus size={16}/></span><strong>{t(template.title)}</strong><span className={styles.templateDescription}>{t(template.description)}</span>
      </button>)}</div>
    </details>
    <p className={styles.hint}>{t("Escolha a forma de acompanhar. Você pode mudar o tipo depois, mantendo o que escreveu.")}</p>
  </div>;
}

function GoalCard({goal, expanded, month, disabled, onToggle, onUpdate, onRemove, onPractice}: {
  goal: Goal; expanded: boolean; month: string; disabled: boolean;
  onToggle: () => void; onUpdate: (update: (goal: Goal) => Goal) => void; onRemove: () => void; onPractice: () => void;
}) {
  const {locale, t} = useI18n();
  const tracking = goal.tracking ?? "count";
  const [selectedMonth, setSelectedMonth] = useState("");
  const activeMonth = selectedMonth || month;
  const progress = getGoalProgress(goal, activeMonth, t, locale);
  const title = getGoalTitle(goal, t);
  const items = goal.milestones ?? [];
  const habit = goal.habit ?? {period: "daily" as const, times: "7", duration: "", durationMax: ""};
  function updateHabit(patch: Partial<NonNullable<Goal["habit"]>>) {
    onUpdate(current => ({...current, habit: {...(current.habit ?? {period: "daily", times: "7", duration: "", durationMax: ""}), ...patch}}));
  }
  const durationError = Boolean(habit.duration && habit.durationMax && Number(habit.durationMax) < Number(habit.duration));
  const isWholeInRange = (value: string, max: number) => !value || (/^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= max);
  const habitError = habit.period === "weekly" && !isWholeInRange(habit.times, 7) ? t("Escolha de 1 a 7 dias por semana.") : !isWholeInRange(habit.duration, 1440) || !isWholeInRange(habit.durationMax ?? "", 1440) ? t("Use um número inteiro de minutos, entre 1 e 1440.") : durationError ? t("O tempo máximo precisa ser igual ou maior que o tempo por prática.") : "";
  const monthlyRecord = goal.monthlyProgress?.find(record => record.month === activeMonth);
  const monthlyLimit = (goal.monthlyProgress?.length ?? 0) >= 120 && !monthlyRecord;
  const editorId = `goal-editor-${goal.id}`;
  const cardRef = useRef<HTMLElement>(null);
  const addMilestoneRef = useRef<HTMLButtonElement>(null);
  const [error, setError] = useState("");
  function update(patch: Partial<Goal>) {onUpdate(current => ({...current, ...patch}));}
  function removeMilestone(id: string, index: number) {
    const adjacent = items[index + 1] ?? items[index - 1];
    onUpdate(current => ({...current, milestones: current.milestones?.filter(value => value.id !== id)}));
    requestAnimationFrame(() => {
      const input = adjacent && cardRef.current?.querySelector<HTMLInputElement>(`[data-milestone-id="${adjacent.id}"]`);
      (input || addMilestoneRef.current)?.focus();
    });
  }
  function updateMonth(value: string) {
    if (!activeMonth) return;
    try {
      // Validate before entering the state updater so feedback stays outside React's render path.
      setMonthlyGoalProgress(goal, activeMonth, value);
      onUpdate(current => setMonthlyGoalProgress(current, activeMonth, value));
      setError("");
    } catch (problem) {setError(problem instanceof Error ? problem.message : t("Revise o valor deste mês."));}
  }
  const Icon = tracking === "habit" ? Repeat2 : tracking === "monthly" ? CalendarDays : tracking === "checklist" ? ListChecks : Target;
  return <article ref={cardRef} className={styles.card} aria-label={title} data-expanded={expanded}>
    <div className={styles.cardHeader}>
      <div className={styles.cardIcon}><Icon size={21}/></div>
      <div className={styles.cardHeading}>
        <div className={styles.tags}><span>{goal.area.trim() || t("Área a escolher")}</span><span>{tracking === "habit" ? t("Hábito") : tracking === "monthly" ? t("Meta mensal") : tracking === "checklist" ? t("Projeto · etapas") : t("Quantidade")}</span>{goal.date && <span>{t("Revisar em {date}", {date: isValidCalendarDate(goal.date) ? new Intl.DateTimeFormat(locale, {timeZone: "UTC"}).format(new Date(`${goal.date}T12:00:00Z`)) : goal.date})}</span>}</div>
        <h3>{title}</h3>
        {!expanded && goal.next.trim() && <p><strong>{t("Próximo passo:")}</strong> {goal.next}</p>}
      </div>
      <Button type="button" className={styles.editButton} variant="outline" aria-expanded={expanded} aria-controls={editorId} onClick={onToggle}>{expanded ? t("Recolher") : t("Editar meta")}{expanded ? <ChevronUp/> : <ChevronDown/>}</Button>
    </div>
    <div className={styles.progressRow}>
      {tracking === "habit" ? <div className={styles.habitSummary}><Repeat2 size={17}/><span><strong>{getHabitSummary(goal, t)}</strong><small>{t("Ritmo que quero cultivar. Escolho os dias e horários no passo 6.")}</small></span></div> : progress ? <><span className={styles.progressLabel}>{progress.label}{tracking === "monthly" && <small>{monthLabel(activeMonth, locale, t)}</small>}</span><Progress className={styles.progress} value={progress.percent} aria-label={t("Progresso: {title}", {title})}/><span className={styles.percent}>{Math.round(progress.percent)}%</span></> : <p className={styles.hint}>{tracking === "checklist" ? t("Divida esta meta em etapas para reconhecer seus avanços.") : tracking === "monthly" ? t("Ainda sem registro de {month}. Registre o que concluiu.", {month: monthLabel(activeMonth, locale, t)}) : t("Informe onde está hoje e aonde quer chegar para visualizar seu avanço.")}</p>}
    </div>
    <div className={styles.cardActions}><span>{tracking === "checklist" ? t("Etapas organizam o caminho; o resultado depende da sua avaliação.") : tracking === "monthly" ? t("O resultado fica aqui. Os momentos de dedicação vão para o calendário.") : t("Dê a esta intenção um espaço na sua rotina.")}</span><Button type="button" variant="outline" disabled={disabled} onClick={onPractice}><CalendarDays size={16}/>{" " + t("Agendar no calendário") + " "}<ArrowRight size={15}/></Button></div>
    {expanded && <div id={editorId} className={styles.editor}>
      <fieldset disabled={disabled} className={styles.fields}>
        <legend className="sr-only">{t("Editar {title}", {title})}</legend>
        <div className={styles.mainFields}>
          <label>{t("O que quero alcançar")}<Input data-goal-title={goal.id} value={goal.title ?? ""} placeholder={t("Ex.: meditar diariamente, encontrar trabalho…")} maxLength={2000} onChange={event => update({title: event.target.value})}/></label>
          <label>{t("Área ou instrumento")}<Input value={goal.area} maxLength={2000} placeholder={t("Ex.: Trabalho, Corpo, Piano…")} onChange={event => update({area: event.target.value})}/></label>
        </div>
        <div className={styles.measureHeading}><span><Icon size={17}/>{" " + t("Como reconheço meu avanço")}</span><label><span className="sr-only">{t("Tipo de acompanhamento")}</span><select value={tracking} onChange={event => update({tracking: event.target.value as Goal["tracking"], ...(event.target.value === "habit" && !goal.habit ? {habit: {period: "daily", times: "7", duration: "", durationMax: ""}} : {})})}><option value="habit">{t("Hábito: manter uma frequência")}</option><option value="checklist">{t("Projeto: avançar por etapas")}</option><option value="monthly">{t("Meta mensal: um resultado por mês")}</option><option value="count">{t("Quantidade: construir um total")}</option></select></label></div>
        {tracking === "habit" ? <div className={styles.habitFields}>
          <p className={styles.hint}>{t("Um hábito é algo que você quer repetir. Aqui você escolhe seu ritmo; no passo 6, os dias e horários.")}</p>
          <div className={styles.measureFields}>
            <label>{t("Frequência")}<select value={habit.period} onChange={event => updateHabit({period: event.target.value as "daily" | "weekly", ...(event.target.value === "daily" ? {times: "7"} : {})})}><option value="daily">{t("Todos os dias")}</option><option value="weekly">{t("Alguns dias por semana")}</option></select></label>
            {habit.period === "weekly" && <label>{t("Dias por semana")}<Input type="number" min="1" max="7" step="1" value={habit.times} placeholder={t("Ex.: 4")} onChange={event => updateHabit({times: event.target.value})}/></label>}
            <label>{t("Tempo por prática (min)")}<Input type="number" min="1" max="1440" step="1" value={habit.duration} placeholder={t("Opcional, ex.: 15")} onChange={event => updateHabit({duration: event.target.value})}/></label>
            <label>{t("Até quantos minutos? (opcional)")}<Input type="number" min={habit.duration || "1"} max="1440" step="1" value={habit.durationMax ?? ""} placeholder={t("Para uma faixa, ex.: 20")} onChange={event => updateHabit({durationMax: event.target.value})} aria-invalid={durationError}/></label>
          </div>
          {habitError && <p role="alert" className={styles.error}>{t(habitError)}</p>}
          <p className={styles.hint}>{t("A frequência é uma intenção, não uma porcentagem de conclusão. Você pode ajustá-la ao seu momento.")}</p>
        </div> : tracking === "checklist" ? <div className={styles.checklist}>
          <p className={styles.hint}>{t("Escreva etapas que dependem de você. Marque apenas as que realizou; reservar um horário de prática não conclui uma etapa.")}</p>
          {items.map((item, index) => <div className={styles.checkItem} key={item.id}>
            <input type="checkbox" aria-label={t("Concluir etapa {index}: {title}", {index: index + 1, title: item.title || t("sem título")})} checked={item.done} disabled={!item.title.trim() || disabled} onChange={event => onUpdate(current => ({...current, milestones: current.milestones?.map(value => value.id === item.id ? {...value, done: event.target.checked} : value)}))}/>
            <Input data-milestone-id={item.id} aria-label={t("Etapa {index}", {index: index + 1})} value={item.title} placeholder={t("Ex.: revisar meu currículo ou estudar a primeira parte")} maxLength={2000} onChange={event => onUpdate(current => ({...current, milestones: current.milestones?.map(value => value.id === item.id ? {...value, title: event.target.value} : value)}))}/>
            <Button type="button" variant="ghost" size="icon" aria-label={t("Remover etapa {index}", {index: index + 1})} onClick={() => removeMilestone(item.id, index)}><X size={16}/></Button>
          </div>)}
          <Button ref={addMilestoneRef} type="button" variant="outline" disabled={items.length >= 30 || disabled} onClick={() => {const id = crypto.randomUUID(); onUpdate(current => ({...current, milestones: (current.milestones?.length ?? 0) >= 30 ? current.milestones : [...(current.milestones ?? []), {id, title: "", done: false}]})); requestAnimationFrame(() => cardRef.current?.querySelector<HTMLInputElement>(`[data-milestone-id="${id}"]`)?.focus());}}><Plus/>{" " + t("Adicionar etapa")}</Button>
          {items.length >= 30 && <p className={styles.hint}>{t("Até 30 etapas por meta.")}</p>}
        </div> : <div className={styles.measureFields}>
          {tracking === "monthly" && <label>{t("Mês acompanhado")}<Input type="month" value={activeMonth} onInput={event => {setSelectedMonth(event.currentTarget.value); setError("");}} onChange={event => {setSelectedMonth(event.target.value); setError("");}}/></label>}
          <label>{tracking === "monthly" ? t("Concluído neste mês") : t("Onde estou hoje")}<Input type="number" step="any" min="0" value={tracking === "monthly" ? monthlyRecord?.current ?? "" : goal.current} disabled={tracking === "monthly" && (!activeMonth || monthlyLimit)} placeholder={t("Informe seu ponto de partida")} onChange={event => tracking === "monthly" ? updateMonth(event.target.value) : update({current: event.target.value})}/></label>
          <label>{tracking === "monthly" ? t("Minha meta por mês") : t("Aonde quero chegar")}<Input type="number" step="any" min="0.01" value={goal.target} placeholder={t("Ex.: 30")} onChange={event => update({target: event.target.value})}/></label>
          <label>{t("O que estou contando")}<Input value={goal.metric} maxLength={2000} placeholder={t("Ex.: músicas")} onChange={event => update({metric: event.target.value})}/></label>
        </div>}
        {tracking === "monthly" && <p className={styles.hint}>{t("Cada mês guarda seu próprio resultado. Mude o mês para consultar ou atualizar os anteriores.") + " "}{monthlyLimit && t("Você chegou ao limite de 120 meses nesta meta. Crie outra para continuar.")}</p>}
        {tracking === "count" && <p className={styles.hint}>{t("Use quantidades que deseja aumentar, como músicas, livros ou projetos concluídos.")}</p>}
        {error && <p role="alert" className={styles.error}>{t(error)}</p>}
        <div className={styles.nextFields}>
          <label>{t("Meu próximo passo concreto")}<Input value={goal.next} maxLength={2000} placeholder={t("Ex.: revisar o currículo, escolher um livro, separar o material…")} onChange={event => update({next: event.target.value})}/></label>
          <label>{t("Data para revisar")}<Input type="date" value={goal.date} onInput={event => update({date: event.currentTarget.value})} onChange={event => update({date: event.target.value})}/></label>
        </div>
        <details className={styles.horizons}>
          <summary>{t("Meu ponto de partida e horizontes de 3 e 6 meses") + " "}<ChevronDown size={16}/></summary>
          <label>{t("Meu ponto de partida")}<Textarea value={goal.baseline} maxLength={2000} placeholder={t("O que já consigo fazer? O que ainda é difícil?")} onChange={event => update({baseline: event.target.value})}/></label>
          <div className={styles.mainFields}>
            <label>{t("Daqui a 3 meses")}<Textarea value={goal.three} maxLength={2000} placeholder={t("Uma primeira conquista possível")} onChange={event => update({three: event.target.value})}/></label>
            <label>{t("Daqui a 6 meses")}<Textarea value={goal.six} maxLength={2000} placeholder={t("Como quero ter avançado")} onChange={event => update({six: event.target.value})}/></label>
          </div>
        </details>
        <div className={styles.editorFooter}><span><Check size={15}/>{" " + t("Você pode ajustar seu caminho.")}</span><Button type="button" variant="ghost" onClick={onRemove}><Trash2 size={15}/>{" " + t("Remover meta")}</Button></div>
      </fieldset>
    </div>}
  </article>;
}

export default function GoalPlanner({goals, disabled, onChange, onPractice, initialGoalId, onInitialGoalConsumed}: Props) {
  const {t} = useI18n();
  const [area, setArea] = useState("");
  const [dialog, setDialog] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [month, setMonth] = useState("");
  const [removed, setRemoved] = useState<{goal: Goal; index: number} | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [focusId, setFocusId] = useState<string | null>(null);
  const plannerRef = useRef<HTMLElement>(null);
  const createButtonRef = useRef<HTMLButtonElement>(null);
  const dialogCreatedId = useRef<string | null>(null);
  useEffect(() => {setMonth(currentMonth());}, []);
  useEffect(() => {if (!initialGoalId || disabled) return; if (goals.some(goal => goal.id === initialGoalId)) {setExpandedId(initialGoalId);setFocusId(initialGoalId);} onInitialGoalConsumed?.();}, [initialGoalId, disabled, goals, onInitialGoalConsumed]);
  useEffect(() => {
    if (!focusId || dialog) return;
    const frame = requestAnimationFrame(() => {
      const input = plannerRef.current?.querySelector<HTMLInputElement>(`[data-goal-title="${focusId}"]`);
      input?.focus({preventScroll: true});
      input?.scrollIntoView({behavior: "instant", block: "center"});
      setFocusId(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [focusId, dialog]);
  const limit = goals.length >= 30;
  function create(template: Template) {
    if (disabled || limit) return;
    const goal = createPlanningGoal(template, area, () => crypto.randomUUID(), t);
    onChange(current => current.length < 30 ? [...current, goal] : current);
    setExpandedId(goal.id);
    if (dialog) dialogCreatedId.current = goal.id;
    else setFocusId(goal.id);
    setDialog(false);
    setArea("");
    setAnnouncement("Meta adicionada. Ajuste os detalhes para fazer sentido para você.");
  }
  function remove(goal: Goal, index: number) {
    setRemoved({goal, index});
    onChange(current => current.filter(value => value.id !== goal.id));
    if (expandedId === goal.id) setExpandedId(null);
    setAnnouncement("Meta removida. Você pode desfazer enquanto estiver nesta etapa.");
    requestAnimationFrame(() => createButtonRef.current?.focus());
  }
  const areas = [...new Set(goals.map(goal => goal.area.trim()).filter(Boolean))];
  return <section className={styles.planner} ref={plannerRef} aria-label={t("Meu plano de metas")}>
    <div className={styles.intro}>
      <div><span className={styles.eyebrow}>{t("RESULTADOS QUE FAZEM SENTIDO")}</span><h2>{t("O que você quer conquistar?")}</h2><p>{t("Hábitos, projetos e conquistas têm ritmos diferentes. Escolha como acompanhar cada intenção.")}</p></div>
      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogTrigger asChild><Button ref={createButtonRef} type="button" disabled={disabled || limit}><Plus/>{" " + t("Nova meta")}</Button></DialogTrigger>
        <DialogContent className={styles.templateDialog} showCloseButton={false} onCloseAutoFocus={event => {if (dialogCreatedId.current) {event.preventDefault(); setFocusId(dialogCreatedId.current); dialogCreatedId.current = null;}}}>
          <DialogHeader><DialogTitle>{t("Qual será sua próxima meta?")}</DialogTitle><DialogDescription>{t("Comece com um modelo ou crie algo inteiramente seu.")}</DialogDescription></DialogHeader>
          <DialogClose asChild><Button className={styles.closeDialog} type="button" size="icon" variant="ghost" aria-label={t("Fechar modelos de metas")}><X/></Button></DialogClose>
          <GoalTemplates area={area} setArea={setArea} disabled={disabled || limit} onCreate={create}/>
        </DialogContent>
      </Dialog>
    </div>
    {!goals.length ? <div className={styles.starter}><GoalTemplates area={area} setArea={setArea} disabled={disabled} onCreate={create}/></div> : <div className={styles.overview}><span><strong>{goals.length}</strong> {goals.length === 1 ? t("meta no seu caminho") : t("metas no seu caminho")}</span><span>{areas.length ? areas.join(" · ") : t("Escolha as áreas que deseja cultivar")}</span><small>{limit ? t("Limite de 30 metas. Você pode ajustar as que já criou.") : t("Comece com poucas. Você não precisa fazer tudo ao mesmo tempo.")}</small></div>}
    <div className="sr-only" role="status">{t(announcement)}</div>
    {removed && !goals.some(goal => goal.id === removed.goal.id) && <div className={styles.undo} role="status"><span>{t("“{title}” foi removida.", {title: getGoalTitle(removed.goal, t)})}</span><Button type="button" variant="outline" disabled={disabled || limit} onClick={() => {onChange(current => {if (current.length >= 30 || current.some(goal => goal.id === removed.goal.id)) return current; const next = [...current]; next.splice(Math.min(removed.index, next.length), 0, removed.goal); return next;}); setExpandedId(removed.goal.id); setFocusId(removed.goal.id); setRemoved(null); setAnnouncement("Meta restaurada.");}}><Undo2/>{" " + t("Desfazer")}</Button></div>}
    <div className={styles.goalList}>{goals.map((goal, index) => <GoalCard key={goal.id} goal={goal} expanded={expandedId === goal.id} month={month} disabled={disabled} onToggle={() => setExpandedId(expandedId === goal.id ? null : goal.id)} onUpdate={update => onChange(current => current.map(value => value.id === goal.id ? update(value) : value))} onRemove={() => remove(goal, index)} onPractice={() => onPractice(goal.id)}/>)}</div>
    <div className={styles.bridge}><div><span className={styles.eyebrow}>{t("DO PLANO À PRÁTICA")}</span><h3>{t("Agora, abra espaço no seu calendário.")}</h3><p>{t("As metas ficam aqui. Os dias e horários da prática ficam no passo 6.")}</p></div><Button type="button" variant="outline" onClick={() => onPractice()}>{t("Abrir meu calendário") + " "}<ArrowRight/></Button></div>
  </section>;
}
