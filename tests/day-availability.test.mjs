import assert from "node:assert/strict";
import {after, test} from "node:test";
import {randomUUID} from "node:crypto";
import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import ts from "typescript";

// Compile the real modules, replacing only Node's extensionless import paths.
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const compiled = await mkdtemp(path.join(appRoot, ".day-availability-tests-"));
after(async () => { await rm(compiled, {recursive: true, force: true}); });
for (const name of ["calendar-planning", "day-availability"]) {
  const source = (await readFile(path.join(appRoot, "lib", `${name}.ts`), "utf8")).replaceAll('"./calendar-planning"', '"./calendar-planning.mjs"');
  const output = ts.transpileModule(source, {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext}});
  await writeFile(path.join(compiled, `${name}.mjs`), output.outputText);
}
const {getDayReservations, getAvailableHourSlots} = await import(pathToFileURL(path.join(compiled, "day-availability.mjs")).href);

const block = (overrides = {}) => ({id: randomUUID(), day: "Quarta", time: "09:00", duration: "60", activity: "Praticar", ...overrides});
const slot = (slots, time) => slots.find((item) => item.time === time);

test("returns all 24 starts and respects exact-touch boundaries without treating free time as busy", () => {
  const reserved = block({time: "09:00", duration: "60"});
  const slots = getAvailableHourSlots([reserved], "2026-09-30", 60);
  assert.equal(slots.length, 24);
  assert.equal(slots[0].time, "00:00");
  assert.equal(slots.at(-1).time, "23:00");
  assert.equal(slot(slots, "08:00").available, true);
  assert.equal(slot(slots, "09:00").available, false);
  assert.equal(slot(slots, "10:00").available, true);
  assert.equal(slot(slots, "09:00").conflicts[0].block, reserved);
});

test("partial, contained and fractional overlaps are detected for the entire proposed duration", () => {
  const one = block({time: "10:15", duration: "15.5"});
  const two = block({time: "11:00", duration: "0.5"});
  const short = getAvailableHourSlots([one, two], "2026-09-30", 15);
  assert.equal(slot(short, "10:00").available, true, "ending exactly at 10:15 is free");
  const fractional = getAvailableHourSlots([one], "2026-09-30", 15.01);
  assert.equal(slot(fractional, "10:00").available, false);
  const long = getAvailableHourSlots([one, two], "2026-09-30", 121);
  assert.deepEqual(slot(long, "09:00").conflicts.map((entry) => entry.block.id), [one.id, two.id]);
});

test("date-only events and inclusive recurring bounds apply before availability is calculated", () => {
  const once = block({date: "2026-09-30"});
  const weekly = block({time: "11:00", startsOn: "2026-09-30", endsOn: "2026-10-07"});
  assert.equal(getDayReservations([once, weekly], "2026-09-23").length, 0);
  assert.equal(getDayReservations([once, weekly], "2026-09-30").length, 2);
  assert.equal(getDayReservations([once, weekly], "2026-10-07").length, 1);
  assert.equal(getDayReservations([once, weekly], "2026-10-14").length, 0);
  assert.equal(getDayReservations([once, weekly], "2026-10-01").length, 0);
});

test("prior-day overflow is clipped to today and exact-midnight endings do not spill over", () => {
  const late = block({day: "Terça", date: "2026-09-29", time: "23:30", duration: "90.5"});
  const midnight = block({day: "Terça", date: "2026-09-29", time: "23:00", duration: "60"});
  const reservations = getDayReservations([late, midnight], "2026-09-30");
  assert.deepEqual(reservations, [{block: late, start: 0, end: 60.5, continuesFromPreviousDay: true, continuesToNextDay: false}]);
  const slots = getAvailableHourSlots([late, midnight], "2026-09-30", 60);
  assert.equal(slot(slots, "00:00").available, false);
  assert.equal(slot(slots, "01:00").available, false);
  assert.equal(slot(slots, "02:00").available, true);
  assert.deepEqual(getDayReservations([late], "2026-09-29"), [{block: late, start: 1410, end: 1440, continuesFromPreviousDay: false, continuesToNextDay: true}]);
});

test("overflow from a final recurrence survives into the day after its end date", () => {
  const last = block({time: "23:30", duration: "120", startsOn: "2026-09-30", endsOn: "2026-09-30"});
  const nextDay = getDayReservations([last], "2026-10-01");
  assert.equal(nextDay.length, 1);
  assert.equal(nextDay[0].end, 90);
  assert.equal(getDayReservations([last], "2026-10-08").length, 0);
});

test("a proposed overnight interval checks tomorrow's reservations and exact-touch boundaries", () => {
  const tomorrow = block({day: "Quinta", date: "2026-10-01", time: "00:30", duration: "30"});
  const ninety = getAvailableHourSlots([tomorrow], "2026-09-30", 90);
  assert.equal(slot(ninety, "23:00").available, true, "23:00 to 00:30 only touches the later reservation");
  const ninetyPlus = getAvailableHourSlots([tomorrow], "2026-09-30", 90.01);
  assert.equal(slot(ninetyPlus, "23:00").available, false);
  assert.equal(slot(ninetyPlus, "23:00").conflicts[0].block, tomorrow);
  const endTomorrow = getAvailableHourSlots([tomorrow], "2026-09-30", 1440);
  assert.equal(slot(endTomorrow, "00:00").available, true, "a full day ending at midnight excludes tomorrow");
  assert.equal(slot(endTomorrow, "01:00").available, false);
});

test("the same overnight activity is reported once even when the proposed interval overlaps both days", () => {
  const overnight = block({time: "23:30", duration: "90"});
  const slots = getAvailableHourSlots([overnight], "2026-09-30", 180);
  assert.equal(slot(slots, "23:00").conflicts.length, 1);
  assert.equal(slot(slots, "23:00").conflicts[0].block, overnight);
});

test("next-day weekly rules are checked only inside their own inclusive recurrence window", () => {
  const tomorrow = block({day: "Quinta", time: "00:30", duration: "30", startsOn: "2026-10-01", endsOn: "2026-10-01"});
  assert.equal(slot(getAvailableHourSlots([tomorrow], "2026-09-30", 120), "23:00").available, false);
  assert.equal(slot(getAvailableHourSlots([tomorrow], "2026-09-23", 120), "23:00").available, true);
  assert.equal(slot(getAvailableHourSlots([tomorrow], "2026-10-07", 120), "23:00").available, true);
});

test("malformed legacy time or duration values are ignored safely without mutating records", () => {
  const malformed = ["", "0", "-1", "1441", "Infinity", "NaN", "abc", true, [60], 60, undefined].map((duration) => block({duration}));
  malformed.push(...["", "24:00", "9:00", "09:60", undefined, null].map((time) => block({time})));
  const valid = block({duration: "0.5"});
  const blocks = [...malformed, valid], snapshot = structuredClone(blocks);
  assert.deepEqual(getDayReservations(blocks, "2026-09-30").map((entry) => entry.block), [valid]);
  assert.equal(slot(getAvailableHourSlots(blocks, "2026-09-30", 60), "09:00").available, false);
  assert.deepEqual(blocks, snapshot);
});

test("month/year boundaries and leap days include the correct prior-day overflow", () => {
  for (const [previous, current] of [["2026-12-31", "2027-01-01"], ["2024-02-29", "2024-03-01"], ["2026-03-08", "2026-03-09"]]) {
    const late = block({date: previous, time: "23:00", duration: "120"});
    assert.equal(getDayReservations([late], current)[0].end, 60);
  }
});

test("invalid queries fail explicitly instead of incorrectly declaring slots free", () => {
  for (const date of ["", "2026-02-29", "2026-9-30", "2026-13-01"]) {
    assert.throws(() => getDayReservations([], date), /data válida/);
    assert.throws(() => getAvailableHourSlots([], date, 60), /data válida/);
  }
  for (const duration of [0, -1, 1441, NaN, Infinity]) assert.throws(() => getAvailableHourSlots([], "2026-09-30", duration), /duração/);
  assert.throws(() => getAvailableHourSlots([], "9999-12-31", 90), /data anterior/);
});
