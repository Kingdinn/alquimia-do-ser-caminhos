import type { Block } from "../app/content";
import { isValidCalendarDate, occurrencesForDate } from "./calendar-planning";

export type DayReservation = {
  block: Block;
  start: number;
  end: number;
  continuesFromPreviousDay: boolean;
  continuesToNextDay: boolean;
};
export type AvailableHourSlot = { time: string; available: boolean; conflicts: DayReservation[] };

function adjacentDate(date: string, delta: number): string | null {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + delta);
  if (value.getUTCFullYear() < 1 || value.getUTCFullYear() > 9999) return null;
  return value.toISOString().slice(0, 10);
}

function timing(block: Block): { start: number; end: number } | null {
  if (typeof block?.time !== "string" || typeof block.duration !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(block.time)) return null;
  const duration = Number(block.duration);
  if (!Number.isFinite(duration) || duration <= 0 || duration > 1440) return null;
  const [hour, minute] = block.time.split(":").map(Number);
  const start = hour * 60 + minute;
  return { start, end: start + duration };
}

/** Reservations are clipped to the queried day, including unfinished activity from yesterday. */
export function getDayReservations(blocks: readonly Block[], date: string): DayReservation[] {
  if (!isValidCalendarDate(date)) throw new Error("Escolha uma data válida para consultar os horários.");
  // Filtering first also protects occurrence sorting against malformed legacy time fields.
  const valid = blocks.filter((block) => timing(block) !== null);
  const previous = adjacentDate(date, -1);
  const overflow: DayReservation[] = previous === null ? [] : occurrencesForDate(valid, previous).flatMap((block) => {
    const interval = timing(block)!;
    return interval.end > 1440 ? [{ block, start: 0, end: interval.end - 1440, continuesFromPreviousDay: true, continuesToNextDay: false }] : [];
  });
  const today = occurrencesForDate(valid, date).map((block): DayReservation => {
    const interval = timing(block)!;
    return { block, start: interval.start, end: Math.min(1440, interval.end), continuesFromPreviousDay: false, continuesToNextDay: interval.end > 1440 };
  });
  return [...overflow, ...today].sort((a, b) => a.start - b.start || a.end - b.end);
}

/** Half-open intervals allow one activity to begin at the exact minute another ends. */
export function getAvailableHourSlots(blocks: readonly Block[], date: string, duration: number): AvailableHourSlot[] {
  if (!Number.isFinite(duration) || duration <= 0 || duration > 1440) throw new Error("Escolha uma duração maior que zero e de até 1.440 minutos.");
  const today = getDayReservations(blocks, date);
  const tomorrowDate = adjacentDate(date, 1);
  if (duration > 60 && tomorrowDate === null) throw new Error("Escolha uma data anterior para consultar um compromisso que termine no dia seguinte.");
  const tomorrow = duration > 60 && tomorrowDate !== null ? getDayReservations(blocks, tomorrowDate) : [];
  return Array.from({ length: 24 }, (_, hour) => {
    const start = hour * 60, end = start + duration;
    const conflicts = today.filter((reservation) => start < reservation.end && end > reservation.start);
    if (end > 1440) {
      const seen = new Set(conflicts.map((reservation) => reservation.block));
      for (const reservation of tomorrow) {
        if (reservation.start < end - 1440 && reservation.end > 0 && !seen.has(reservation.block)) {
          conflicts.push(reservation);
          seen.add(reservation.block);
        }
      }
    }
    return { time: `${String(hour).padStart(2, "0")}:00`, available: conflicts.length === 0, conflicts };
  });
}
