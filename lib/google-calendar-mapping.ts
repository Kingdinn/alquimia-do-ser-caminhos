import {createHash} from "node:crypto";
import type {Block} from "../app/content";

const names = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const weekdays = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
export type GoogleCalendarEvent = {id: string; summary: string; start: {dateTime: string; timeZone: string}; end: {dateTime: string; timeZone: string}; recurrence?: string[]; extendedProperties: {private: {alquimiaBlock: string; alquimiaOwner: string; alquimiaConnection: string}}};
export type DesiredCalendarEvent = {blockId: string; hash: string; event: GoogleCalendarEvent};
function dateValue(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("invalid_schedule");
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value || value.startsWith("0000")) throw new Error("invalid_schedule");
  return date;
}
function dateKey(value: Date): string {
  const key = value.toISOString().slice(0, 10);
  if (!/^\d{4}-/.test(key)) throw new Error("invalid_schedule");
  return key;
}
export function dateInTimeZone(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {timeZone, year: "numeric", month: "2-digit", day: "2-digit"}).formatToParts(now);
  return ["year", "month", "day"].map(type => parts.find(part => part.type === type)!.value.padStart(type === "year" ? 4 : 2, "0")).join("-");
}
function wallParts(instant: number, timeZone: string): number[] {
  const parts = new Intl.DateTimeFormat("en-US", {timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit"}).formatToParts(instant);
  return ["year", "month", "day", "hour", "minute", "second"].map(type => Number(parts.find(part => part.type === type)!.value));
}
function wallMilliseconds(parts: number[]): number {
  const date = new Date(0); date.setUTCFullYear(parts[0], parts[1] - 1, parts[2]); date.setUTCHours(parts[3], parts[4], parts[5], 0); return date.getTime();
}
/** Resolve local wall time without depending on the server's timezone. Gaps fail; folds choose the earlier instant. */
export function zonedInstant(date: string, time: string, timeZone: string): Date {
  dateValue(date);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error("invalid_schedule");
  const wanted = [...date.split("-").map(Number), ...time.split(":").map(Number), 0];
  const approximate = wallMilliseconds(wanted), candidates: number[] = [];
  for (const hours of [-36, 0, 36]) {
    const probe = approximate + hours * 3600000, offset = wallMilliseconds(wallParts(probe, timeZone)) - probe;
    const candidate = approximate - offset;
    if (wallParts(candidate, timeZone).every((value, index) => value === wanted[index])) candidates.push(candidate);
  }
  if (!candidates.length) throw new Error("invalid_schedule_timezone");
  return new Date(Math.min(...candidates));
}
export function googleEventId(owner: string, connection: string, blockId: string, revision = 0): string {
  return "a" + createHash("sha256").update(JSON.stringify([owner, connection, blockId, revision])).digest("hex");
}
/** Only explicit calendar blocks are exported. Goals, journal prose, health data and images stay private. */
export function mapCalendarBlocks(blocks: readonly Block[], owner: string, connection: string, timeZone: string, legacyAnchor: string): DesiredCalendarEvent[] {
  dateValue(legacyAnchor);
  if (blocks.length > 150 || new Set(blocks.map(block => block.id)).size !== blocks.length) throw new Error("invalid_schedule");
  const desired: DesiredCalendarEvent[] = [];
  for (const block of blocks) {
    const day = names.indexOf(block.day), duration = Number(block.duration);
    if (!/^[0-9a-f-]{36}$/i.test(block.id) || day < 0 || typeof block.activity !== "string" || block.activity.length > 2000 || !Number.isFinite(duration) || duration <= 0 || duration > 1440) throw new Error("invalid_schedule");
    if (block.date && (block.startsOn || block.endsOn)) throw new Error("invalid_schedule");
    let date = block.date ?? block.startsOn ?? legacyAnchor;
    const first = dateValue(date);
    if (block.date && first.getUTCDay() !== day) throw new Error("invalid_schedule");
    if (!block.date) {first.setUTCDate(first.getUTCDate() + (day - first.getUTCDay() + 7) % 7); date = dateKey(first);}
    if (block.endsOn) {
      dateValue(block.endsOn);
      if (block.startsOn && block.endsOn < block.startsOn) throw new Error("invalid_schedule");
      // Legacy unbounded rules which already ended before first connection have no future instances.
      if (date > block.endsOn) continue;
    }
    const start = zonedInstant(date, block.time, timeZone), end = new Date(start.getTime() + duration * 60000);
    if (end.getTime() <= start.getTime()) throw new Error("invalid_schedule");
    const event: GoogleCalendarEvent = {id: googleEventId(owner, connection, block.id), summary: block.activity.trim() || "Alquimia do Ser", start: {dateTime: start.toISOString(), timeZone}, end: {dateTime: end.toISOString(), timeZone}, extendedProperties: {private: {alquimiaBlock: block.id, alquimiaOwner: owner, alquimiaConnection: connection}}};
    if (!block.date) {
      let rule = `RRULE:FREQ=WEEKLY;BYDAY=${weekdays[day]}`;
      if (block.endsOn) {
        const last = dateValue(block.endsOn); last.setUTCDate(last.getUTCDate() - (last.getUTCDay() - day + 7) % 7);
        const until = zonedInstant(dateKey(last), block.time, timeZone).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
        rule += `;UNTIL=${until}`;
      }
      event.recurrence = [rule];
    }
    const hash = createHash("sha256").update(JSON.stringify(event)).digest("hex");
    desired.push({blockId: block.id, hash, event});
  }
  return desired;
}
