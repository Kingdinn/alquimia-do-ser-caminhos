import type { Block } from "../app/content";
import type { Weekday } from "./weekly-planning";

export type CalendarBlockInput = { goalId?: string; activity: string; time: string; duration: string; date: string; repeat: "once" | "weekly"; days: readonly Weekday[]; endsOn?: string };

const dayNames: readonly Weekday[] = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const pad = (value: number) => String(value).padStart(2, "0");

function utcDate(year: number, month: number, day: number): Date {
  const result = new Date(0);
  result.setUTCHours(0, 0, 0, 0);
  result.setUTCFullYear(year, month - 1, day);
  return result;
}

function parseDate(value: string): Date | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1) return null;
  const parsed = utcDate(year, month, day);
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day ? parsed : null;
}

function utcKey(date: Date): string {
  const year = date.getUTCFullYear();
  if (year < 1 || year > 9999) throw new Error("Escolha uma data entre os anos 0001 e 9999.");
  return `${String(year).padStart(4, "0")}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function isValidCalendarDate(value: string): boolean { return parseDate(value) !== null; }

export function weekdayForDate(value: string): Weekday {
  const date = parseDate(value);
  if (!date) throw new Error("Escolha uma data válida.");
  return dayNames[(date.getUTCDay() + 6) % 7];
}

/** Date inputs are local calendar days; converting them to ISO instants can change the day. */
export function localDateKey(date: Date): string {
  if (!Number.isFinite(date.getTime())) throw new Error("Escolha uma data válida.");
  const year = date.getFullYear();
  if (year < 1 || year > 9999) throw new Error("Escolha uma data entre os anos 0001 e 9999.");
  return `${String(year).padStart(4, "0")}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function buildMonthGrid(month: string): string[] {
  const first = parseDate(`${month}-01`);
  if (!first) throw new Error("Escolha um mês válido.");
  const start = utcDate(first.getUTCFullYear(), first.getUTCMonth() + 1, 1 - (first.getUTCDay() + 6) % 7);
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start.getTime());
    day.setUTCDate(day.getUTCDate() + index);
    return utcKey(day);
  });
}

export function shiftMonth(month: string, delta: number): string {
  const first = parseDate(`${month}-01`);
  if (!first || !Number.isSafeInteger(delta)) throw new Error("Escolha um mês válido.");
  first.setUTCMonth(first.getUTCMonth() + delta);
  if (!Number.isFinite(first.getTime())) throw new Error("Escolha um mês válido.");
  return utcKey(first).slice(0, 7);
}

/** Legacy blocks have no bounds and keep their original weekday recurrence. */
export function occurrencesForDate(blocks: readonly Block[], date: string): Block[] {
  const day = weekdayForDate(date);
  return blocks.filter((block) => block.date !== undefined
    ? block.date === date
    : block.day === day && (block.startsOn === undefined || block.startsOn <= date) && (block.endsOn === undefined || block.endsOn >= date)
  ).sort((a, b) => a.time.localeCompare(b.time));
}

const signature = (block: Omit<Block, "id">) => JSON.stringify([block.day, block.time, block.activity, block.duration, block.goalId ?? null, block.date ?? null, block.startsOn ?? null, block.endsOn ?? null]);

function validateCommonFields(input: CalendarBlockInput): void {
  if (!input.activity.trim() || input.activity.length > 2000) throw new Error("Escreva a atividade, com até 2.000 caracteres.");
  if (input.repeat !== "once" && input.repeat !== "weekly") throw new Error("Escolha uma repetição válida.");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time)) throw new Error("Escolha um horário válido.");
  if (!Number.isFinite(Number(input.duration)) || Number(input.duration) <= 0 || Number(input.duration) > 1440) throw new Error("Informe uma duração maior que zero e de até 1.440 minutos.");
  if (input.goalId !== undefined && !uuid.test(input.goalId)) throw new Error("Escolha uma meta válida para vincular ao compromisso.");
}

/** Return the entire next schedule, or fail before making any partial change. */
export function createCalendarBlocks(input: CalendarBlockInput, existing: readonly Block[], makeId: () => string): Block[] {
  validateCommonFields(input);
  const day = weekdayForDate(input.date);
  const endsOn = input.endsOn || undefined;
  if (input.repeat === "once" && endsOn !== undefined) throw new Error("Um compromisso único não precisa de data final de repetição.");
  if (endsOn !== undefined && (!isValidCalendarDate(endsOn) || endsOn < input.date)) throw new Error("O fim da repetição deve ser uma data válida a partir do início.");
  if (input.repeat === "weekly" && (!input.days.length || input.days.some((value) => !dayNames.includes(value)))) throw new Error("Escolha pelo menos um dia válido da semana.");
  if (input.repeat === "weekly" && endsOn !== undefined) {
    const start = parseDate(input.date)!;
    for (const selected of new Set(input.days)) {
      const occurrence = new Date(start.getTime());
      occurrence.setUTCDate(occurrence.getUTCDate() + (dayNames.indexOf(selected) - dayNames.indexOf(day) + 7) % 7);
      if (utcKey(occurrence) > endsOn) throw new Error(`${selected} não ocorre nesse intervalo. Ajuste os dias ou o fim da repetição.`);
    }
  }
  const base = { time: input.time, duration: input.duration, activity: input.activity, ...(input.goalId === undefined ? {} : { goalId: input.goalId }) };
  const candidates: Omit<Block, "id">[] = input.repeat === "once"
    ? [{ ...base, day, date: input.date }]
    : dayNames.filter((value) => input.days.includes(value)).map((value) => ({ ...base, day: value, startsOn: input.date, ...(endsOn === undefined ? {} : { endsOn }) }));
  const recorded = new Set(existing.map(signature));
  const additions = candidates.filter((block) => !recorded.has(signature(block)));
  if (existing.length + additions.length > 150) throw new Error("Seu calendário pode ter até 150 compromissos. Retire algum antes de adicionar novos.");
  const usedIds = new Set(existing.map((block) => block.id));
  const next = additions.map((block) => {
    const id = makeId();
    if (!uuid.test(id) || usedIds.has(id)) throw new Error("Não foi possível identificar os novos compromissos. Tente novamente.");
    usedIds.add(id);
    return { id, ...block };
  });
  return [...existing, ...next];
}

/** Editing one commitment keeps its identity, position and all unrelated saved fields. */
export function updateCalendarBlock(blockId: string, input: CalendarBlockInput, existing: readonly Block[]): Block[] {
  const index = existing.findIndex((block) => block.id === blockId);
  if (index === -1) throw new Error("Este compromisso não está mais no calendário.");
  const original = existing[index];
  validateCommonFields(input);
  const selected = [...new Set(input.days)];
  if (input.repeat === "weekly" && (selected.length !== 1 || !dayNames.includes(selected[0]))) throw new Error("Ao editar, escolha um dia da semana para este compromisso.");
  const unbounded = input.repeat === "weekly" && input.date === "" && original.date === undefined && original.startsOn === undefined;
  let replacement: Block;
  if (unbounded) {
    const endsOn = input.endsOn || undefined;
    if (endsOn !== undefined && !isValidCalendarDate(endsOn)) throw new Error("Escolha uma data válida para o fim da repetição.");
    replacement = {
      id: original.id, day: selected[0], time: input.time, duration: input.duration, activity: input.activity,
      ...(input.goalId === undefined ? {} : { goalId: input.goalId }),
      ...(endsOn === undefined ? {} : { endsOn }),
    };
  } else replacement = createCalendarBlocks(input, [], () => original.id)[0];
  if (!replacement) throw new Error("Revise os dados do compromisso.");
  // Date and repeat fields belong to the edited mode; keeping the other mode would make the entry contradictory.
  const { date: _date, startsOn: _startsOn, endsOn: _endsOn, goalId: _goalId, ...unchanged } = original;
  const updated = { ...unchanged, ...replacement };
  if (existing.some((block, otherIndex) => otherIndex !== index && signature(block) === signature(updated))) throw new Error("Já existe um compromisso igual no calendário. Escolha outro horário ou atividade.");
  return existing.map((block, otherIndex) => otherIndex === index ? updated : block);
}
