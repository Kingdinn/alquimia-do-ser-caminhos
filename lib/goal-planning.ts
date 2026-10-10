import type { Goal } from "../app/content";

export type PlanningTemplate = "repertoire" | "composition" | "technique" | "custom" | "habit" | "project" | "reading" | "monthly";
export type PlanningTranslate = (key: string, values?: Record<string, string | number>) => string;
const sourceText: PlanningTranslate = (key, values) => key.replace(/\{(\w+)\}/g, (match, name) => String(values?.[name] ?? match));
export type GoalProgress = { current: number; target: number; percent: number; label: string };

const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const numberPattern = /^(?:\d+(?:[.,]\d+)?|[.,]\d+)$/;

function nonnegativeNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!numberPattern.test(trimmed)) return null;
  const number = Number(trimmed.replace(",", "."));
  return Number.isFinite(number) && number >= 0 ? number : null;
}

/** Templates supply editable intentions, never a person's current skill or progress. */
function createPlanningGoalBase(template: PlanningTemplate, area: string, makeId: () => string): Goal {
  const goal: Goal = {
    id: makeId(), area, title: "", tracking: "count", baseline: "", three: "", six: "",
    metric: "", current: "", target: "", date: "", next: "",
  };
  if (template === "repertoire") return { ...goal, title: "Construir meu repertório", metric: "músicas", target: "30" };
  if (template === "composition") return { ...goal, title: "Criar uma música por mês", tracking: "monthly", metric: "músicas", target: "1", monthlyProgress: [] };
  if (template === "habit") return { ...goal, tracking: "habit", habit: { period: "daily", times: "7", duration: "" } };
  if (template === "project") return { ...goal, tracking: "checklist", milestones: [] };
  if (template === "reading") return { ...goal, title: "Ler um livro por mês", tracking: "monthly", metric: "livros", target: "1", monthlyProgress: [] };
  if (template === "monthly") return { ...goal, tracking: "monthly", monthlyProgress: [] };
  if (template === "technique") {
    const piano = /piano|teclado|keyboard/i.test(area);
    const guitar = /violão|violao|guitarra|guitar/i.test(area);
    return {
      ...goal,
      title: piano ? "Aprender um arranjo no piano" : guitar ? "Aprender um arranjo dedilhado" : "Aprender um arranjo",
      tracking: "checklist",
      milestones: [
        { id: makeId(), title: "Escolher a música e o arranjo", done: false },
        { id: makeId(), title: piano ? "Estudar as mãos separadas e juntar devagar" : guitar ? "Estudar os dedilhados devagar, por trechos" : "Estudar a técnica devagar, por trechos", done: false },
        { id: makeId(), title: "Tocar e gravar o arranjo completo", done: false },
      ],
    };
  }
  return goal;
}

/** Localize only newly authored template copy; never translate the supplied personal area. */
export function createPlanningGoal(template: PlanningTemplate, area: string, makeId: () => string, t: PlanningTranslate = sourceText): Goal {
  const goal = createPlanningGoalBase(template, area, makeId);
  return {...goal, title: goal.title ? t(goal.title) : goal.title, metric: goal.metric ? t(goal.metric) : goal.metric,
    ...(goal.milestones ? {milestones: goal.milestones.map(item => ({...item, title: t(item.title)}))} : {})};
}

/** Keep the older three/six-month writing visible until its owner chooses a title. */
export function getGoalTitle(goal: Goal, t: PlanningTranslate = sourceText): string {
  return goal.title?.trim() || goal.three.trim() || goal.six.trim() || goal.area.trim() || t("Minha meta");
}

export function getGoalProgress(goal: Goal, month: string, t: PlanningTranslate = sourceText, locale?: string): GoalProgress | null {
  if (goal.tracking === "habit") return null;
  if (goal.tracking === "checklist") {
    const milestones = (goal.milestones ?? []).filter((item) => item.title.trim());
    if (!milestones.length) return null;
    const current = milestones.filter((item) => item.done).length;
    const target = milestones.length;
    return { current, target, percent: current / target * 100, label: t("{current} de {target} etapas concluídas", {current, target}) };
  }
  const monthly = goal.tracking === "monthly";
  if (monthly && !monthPattern.test(month)) return null;
  const current = nonnegativeNumber(monthly ? goal.monthlyProgress?.find((record) => record.month === month)?.current ?? "" : goal.current);
  const target = nonnegativeNumber(goal.target);
  if (current === null || target === null || target <= 0) return null;
  const unit = goal.metric.trim() || t("unidades");
  const format = (value: number) => locale ? new Intl.NumberFormat(locale).format(value) : String(value).replace(".", ",");
  return {
    current, target, percent: Math.min(100, current / target * 100),
    label: t(monthly ? "{current} de {target} {unit} no mês" : "{current} de {target} {unit}", {current: format(current), target: format(target), unit}),
  };
}

/** Describe a desired rhythm without presenting it as completed practice. */
export function getHabitSummary(goal: Goal, t: PlanningTranslate = sourceText): string {
  if (goal.tracking !== "habit" || !goal.habit) return "";
  const { period, times, duration, durationMax } = goal.habit;
  const integer = (value: string | undefined, max: number) => value && /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= max ? Number(value) : null;
  const days = integer(times, 7);
  const rhythm = period === "daily" ? t("Todos os dias") : days ? t(days === 1 ? "{count} dia por semana" : "{count} dias por semana", {count: days}) : t("Frequência a definir");
  const min = integer(duration, 1440), max = integer(durationMax, 1440);
  if ((duration && min === null) || (durationMax && max === null) || (min !== null && max !== null && max < min)) return rhythm;
  const length = min === null ? max === null ? "" : t("até {count} min", {count: max}) : max !== null && max !== min ? `${min}–${max} min` : `${min} min`;
  return length ? `${rhythm} · ${length}` : rhythm;
}

/** A month gets its own record; changing months never resets or replaces another month. */
export function setMonthlyGoalProgress(goal: Goal, month: string, current: string): Goal {
  if (!monthPattern.test(month)) throw new Error("Escolha um mês válido.");
  if (current.length > 20 || (current !== "" && nonnegativeNumber(current) === null)) {
    throw new Error("Informe uma quantidade válida, maior ou igual a zero.");
  }
  const records = goal.monthlyProgress ?? [];
  if (new Set(records.map((record) => record.month)).size !== records.length) {
    throw new Error("O histórico contém meses repetidos e precisa ser revisado.");
  }
  const existing = records.findIndex((record) => record.month === month);
  if (records.length > 120 || (existing === -1 && records.length >= 120)) {
    throw new Error("O histórico desta meta já tem 120 meses. Crie uma nova meta para continuar.");
  }
  const record = { month, current };
  return {
    ...goal,
    monthlyProgress: existing === -1 ? [...records, record] : records.map((value, index) => index === existing ? record : value),
  };
}
