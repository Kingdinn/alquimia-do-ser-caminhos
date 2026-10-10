import type { Block } from "../app/content";

export const WEEKDAYS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"] as const;
export const weekdays = WEEKDAYS;
export type Weekday = typeof WEEKDAYS[number];
export type WeeklyBlockInput = { goalId?: string; activity: string; days: readonly Weekday[]; time: string; duration: string };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const signature = (block: Pick<Block, "day" | "time" | "activity" | "duration" | "goalId">) => JSON.stringify([block.day, block.time, block.activity, block.duration, block.goalId ?? null]);

/** Add a complete selection atomically. Repeating the same request adds no duplicates. */
export function createWeeklyBlocks(input: WeeklyBlockInput, existing: readonly Block[], makeId: () => string): Block[] {
  if (!input.activity.trim() || input.activity.length > 2000) throw new Error("Escreva a atividade, com até 2.000 caracteres.");
  if (!input.days.length || input.days.some((day) => !(WEEKDAYS as readonly string[]).includes(day))) throw new Error("Escolha pelo menos um dia válido da semana.");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time)) throw new Error("Escolha um horário válido.");
  if (!/^\d+$/.test(input.duration) || input.duration.length > 20 || Number(input.duration) < 1 || Number(input.duration) > 1440) throw new Error("Informe uma duração entre 1 e 1.440 minutos inteiros.");
  if (input.goalId !== undefined && !uuid.test(input.goalId)) throw new Error("Escolha uma meta válida para vincular à prática.");
  const requestedDays = new Set(input.days);
  const recorded = new Set(existing.map(signature));
  const additions = WEEKDAYS.filter((day) => requestedDays.has(day)).map((day) => ({
    day, time: input.time, duration: input.duration, activity: input.activity,
    ...(input.goalId === undefined ? {} : { goalId: input.goalId }),
  })).filter((block) => !recorded.has(signature(block)));
  if (existing.length + additions.length > 150) throw new Error("Sua semana pode ter até 150 compromissos. Retire algum antes de adicionar novos.");
  const usedIds = new Set(existing.map((block) => block.id));
  const next = additions.map((block) => {
    const id = makeId();
    if (!uuid.test(id) || usedIds.has(id)) throw new Error("Não foi possível identificar os novos compromissos. Tente novamente.");
    usedIds.add(id);
    return { id, ...block };
  });
  return [...existing, ...next];
}
