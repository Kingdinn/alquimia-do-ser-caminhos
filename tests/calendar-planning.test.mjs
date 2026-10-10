import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {spawnSync} from "node:child_process";
import {buildMonthGrid, shiftMonth, localDateKey, weekdayForDate, isValidCalendarDate, occurrencesForDate, createCalendarBlocks, updateCalendarBlock} from "../lib/calendar-planning.ts";

const input = (overrides = {}) => ({activity: "Praticar", time: "09:00", duration: "60", date: "2026-09-30", repeat: "once", days: [], ...overrides});
const block = (overrides = {}) => ({id: randomUUID(), activity: "Legado", time: "10:00", duration: "60", day: "Quarta", ...overrides});

test("month grids have 42 unique consecutive days, start Monday and cross leap-year boundaries", () => {
  const grid = buildMonthGrid("2026-03");
  assert.equal(grid.length, 42);
  assert.equal(new Set(grid).size, 42);
  assert.equal(grid[0], "2026-02-23");
  assert.equal(grid.at(-1), "2026-04-05");
  assert.equal(weekdayForDate(grid[0]), "Segunda");
  for (let i = 1; i < grid.length; i++) assert.equal(Date.parse(grid[i]) - Date.parse(grid[i - 1]), 86400000);
  assert.ok(buildMonthGrid("2024-02").includes("2024-02-29"));
  assert.equal(buildMonthGrid("2025-02").includes("2025-02-29"), false);
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(shiftMonth("2026-09", 0), "2026-09");
});

test("calendar values reject impossible dates and malformed months instead of rolling over", () => {
  for (const value of ["2026-02-29", "1900-02-29", "2026-04-31", "2026-00-01", "2026-13-01", "2026-01-00", "2026-01-32", "2026-9-01", "2026-09-1", "0000-01-01", "2026-09-30T00:00:00Z"]) {
    assert.equal(isValidCalendarDate(value), false, value);
    assert.throws(() => weekdayForDate(value), /data válida/);
  }
  assert.equal(isValidCalendarDate("2000-02-29"), true);
  assert.equal(isValidCalendarDate("0096-02-29"), true, "two-digit year values must not become 1900-based Date.UTC years");
  for (const month of ["2026-13", "2026-00", "2026-9", "2026-09-01", "no"]) assert.throws(() => buildMonthGrid(month));
  assert.throws(() => shiftMonth("2026-09", 0.5));
  assert.throws(() => shiftMonth("9999-12", 1));
  assert.throws(() => localDateKey(new Date(NaN)));
});

test("calendar arithmetic stays stable across timezones and DST while today uses local components", () => {
  const moduleUrl = new URL("../lib/calendar-planning.ts", import.meta.url).href;
  for (const [zone, expectedLocal] of [["UTC", "2026-03-08"], ["America/New_York", "2026-03-07"], ["America/Sao_Paulo", "2026-03-07"], ["Asia/Tokyo", "2026-03-08"]]) {
    const script = `import {buildMonthGrid,localDateKey,weekdayForDate} from ${JSON.stringify(moduleUrl)}; console.log(JSON.stringify({grid:buildMonthGrid('2026-03'),day:weekdayForDate('2026-03-08'),local:localDateKey(new Date('2026-03-08T02:30:00Z'))}));`;
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {env: {...process.env, TZ: zone}, encoding: "utf8"});
    assert.equal(result.status, 0, result.stderr);
    const data = JSON.parse(result.stdout);
    assert.deepEqual(data.grid, buildMonthGrid("2026-03"));
    assert.equal(data.day, "Domingo");
    assert.equal(data.local, expectedLocal);
  }
});

test("legacy recurrence, single dates and inclusive weekly bounds coexist and sort without mutation", () => {
  const legacy = block({time: "11:00"});
  const once = block({activity: "Sessão única", date: "2026-09-30", time: "07:00"});
  const bounded = block({activity: "Estudar", startsOn: "2026-09-30", endsOn: "2026-10-07", time: "09:00"});
  const blocks = [legacy, bounded, once], copy = structuredClone(blocks);
  assert.deepEqual(occurrencesForDate(blocks, "2026-09-23").map((item) => item.id), [legacy.id]);
  assert.deepEqual(occurrencesForDate(blocks, "2026-09-30").map((item) => item.id), [once.id, bounded.id, legacy.id]);
  assert.deepEqual(occurrencesForDate(blocks, "2026-10-07").map((item) => item.id), [bounded.id, legacy.id]);
  assert.deepEqual(occurrencesForDate(blocks, "2026-10-14").map((item) => item.id), [legacy.id]);
  assert.deepEqual(occurrencesForDate(blocks, "2026-10-01"), []);
  assert.deepEqual(blocks, copy);
});

test("creation derives a dated event's weekday and recurring starts/ends without touching legacy entries", () => {
  const legacy = [block()], original = structuredClone(legacy), goalId = randomUUID();
  const once = createCalendarBlocks(input({date: "2026-10-02", goalId}), legacy, randomUUID);
  assert.equal(once[1].day, "Sexta");
  assert.equal(once[1].date, "2026-10-02");
  assert.equal(once[1].goalId, goalId);
  assert.equal(Object.hasOwn(once[1], "startsOn"), false);
  const recurring = createCalendarBlocks(input({repeat: "weekly", days: ["Quarta", "Segunda", "Quarta"], endsOn: "2026-10-07"}), [], randomUUID);
  assert.deepEqual(recurring.map((item) => item.day), ["Segunda", "Quarta"]);
  assert.ok(recurring.every((item) => item.startsOn === "2026-09-30" && item.endsOn === "2026-10-07" && !Object.hasOwn(item, "date")));
  assert.equal(occurrencesForDate(recurring, "2026-09-28").length, 0);
  assert.equal(occurrencesForDate(recurring, "2026-10-05").length, 1);
  assert.equal(occurrencesForDate(recurring, "2026-10-12").length, 0);
  assert.deepEqual(legacy, original);
});

test("deduplication includes dates, goal links and recurrence bounds", () => {
  const weeklyInput = input({repeat: "weekly", days: ["Quarta"], endsOn: "2026-10-07", goalId: randomUUID()});
  const first = createCalendarBlocks(weeklyInput, [], randomUUID);
  let calls = 0;
  assert.deepEqual(createCalendarBlocks(weeklyInput, first, () => {calls++; return randomUUID();}), first);
  assert.equal(calls, 0);
  for (const change of [{date: "2026-10-01"}, {endsOn: "2026-10-14"}, {goalId: randomUUID()}]) assert.equal(createCalendarBlocks({...weeklyInput, ...change}, first, randomUUID).length, 2);
  const one = createCalendarBlocks(input(), [], randomUUID);
  assert.equal(createCalendarBlocks(input({date: "2026-10-07"}), one, randomUUID).length, 2);
  assert.equal(createCalendarBlocks(input({repeat: "weekly", days: ["Quarta"]}), one, randomUUID).length, 2);
});

test("invalid entries fail atomically and fractional or overnight activities stay on their start date", () => {
  const old = [block()], original = structuredClone(old);let calls = 0;
  for (const change of [{date: "2026-02-30"}, {time: "24:00"}, {duration: "0"}, {duration: "1441"}, {duration: "Infinity"}, {activity: ""}, {repeat: "bad"}, {repeat: "weekly", days: []}, {repeat: "weekly", days: ["Monday"]}, {repeat: "weekly", days: ["Quarta"], endsOn: "2026-09-29"}, {endsOn: "2026-10-07"}]) {
    assert.throws(() => createCalendarBlocks(input(change), old, () => {calls++; return randomUUID();}));
  }
  assert.equal(calls, 0);
  assert.deepEqual(old, original);
  assert.equal(createCalendarBlocks(input({time: "23:30", duration: "30"}), [], randomUUID).length, 1);
  assert.equal(createCalendarBlocks(input({time: "00:00", duration: "1440"}), [], randomUUID).length, 1);
  assert.equal(createCalendarBlocks(input({duration: "0.5"}), [], randomUUID)[0].duration, "0.5");
  const overnight = createCalendarBlocks(input({time: "23:30", duration: "120"}), [], randomUUID);
  assert.equal(occurrencesForDate(overnight, "2026-09-30").length, 1);
  assert.equal(occurrencesForDate(overnight, "2026-10-01").length, 0);
});

test("capacity and identity failures never return a partial calendar", () => {
  const existing = Array.from({length: 149}, (_, index) => block({activity: `Old ${index}`}));let calls = 0;
  assert.throws(() => createCalendarBlocks(input({repeat: "weekly", days: ["Segunda", "Quarta"]}), existing, () => {calls++; return randomUUID();}), /150 compromissos/);
  assert.equal(calls, 0);
  assert.equal(existing.length, 149);
  const full = createCalendarBlocks(input(), existing, randomUUID);
  assert.equal(full.length, 150);
  assert.deepEqual(createCalendarBlocks(input(), full, randomUUID), full);
  assert.throws(() => createCalendarBlocks(input(), existing, () => existing[0].id), /identificar/);
  assert.throws(() => createCalendarBlocks(input(), existing, () => "bad-id"), /identificar/);
});

test("bounded recurrence cannot create invisible weekdays outside its date window", () => {
  let calls = 0;
  for (const days of [["Segunda"], ["Quarta", "Segunda"]]) {
    assert.throws(() => createCalendarBlocks(input({repeat: "weekly", days, endsOn: "2026-10-01"}), [], () => {calls++; return randomUUID();}), /não ocorre nesse intervalo/);
  }
  assert.equal(calls, 0, "a mixture of valid and invisible weekdays must fail as a whole");
  assert.equal(createCalendarBlocks(input({repeat: "weekly", days: ["Quarta"], endsOn: "2026-09-30"}), [], randomUUID).length, 1);
});

test("editing unbounded legacy practice preserves history, identity, order and unrelated fields", () => {
  const earlier = block({day: "Segunda"});
  const original = block({time: "23:30", duration: "120", goalId: randomUUID(), extraNote: "Preserve future extension fields"});
  const later = block({day: "Sexta"});
  const entries = [earlier, original, later], copy = structuredClone(entries);
  const edited = updateCalendarBlock(original.id, input({repeat: "weekly", date: "", days: ["Quarta"], time: "23:30", duration: "120", activity: "Renamed", goalId: original.goalId}), entries);
  assert.equal(edited[1].id, original.id);
  assert.equal(edited[1].extraNote, original.extraNote);
  assert.equal(edited[0], earlier);
  assert.equal(edited[2], later);
  assert.equal(Object.hasOwn(edited[1], "startsOn"), false);
  assert.equal(Object.hasOwn(edited[1], "date"), false);
  assert.equal(occurrencesForDate(edited, "2020-01-01")[0].activity, "Renamed");
  assert.deepEqual(entries, copy);
  const fractional = updateCalendarBlock(original.id, input({repeat: "weekly", date: "", days: ["Quarta"], duration: "0.5"}), entries);
  assert.equal(fractional[1].duration, "0.5");
  assert.equal(Object.hasOwn(fractional[1], "goalId"), false, "explicitly unlinking removes the previous goal reference");
});

test("changing event modes removes the other mode's fields and derives date weekdays", () => {
  const weekly = block({startsOn: "2026-09-30", endsOn: "2026-10-07"});
  const once = updateCalendarBlock(weekly.id, input({date: "2026-10-02"}), [weekly]);
  assert.equal(once[0].id, weekly.id);
  assert.equal(once[0].date, "2026-10-02");
  assert.equal(once[0].day, "Sexta");
  assert.equal(Object.hasOwn(once[0], "startsOn"), false);
  assert.equal(Object.hasOwn(once[0], "endsOn"), false);
  const again = updateCalendarBlock(weekly.id, input({repeat: "weekly", days: ["Segunda"], date: "2026-10-05", endsOn: "2026-10-12"}), once);
  assert.equal(Object.hasOwn(again[0], "date"), false);
  assert.equal(again[0].startsOn, "2026-10-05");
  assert.equal(again[0].endsOn, "2026-10-12");
  assert.throws(() => updateCalendarBlock(weekly.id, input({repeat: "weekly", date: "", days: ["Segunda"]}), once), /data válida/);
});

test("editing rejects collisions after deriving the weekday instead of merging or dropping entries", () => {
  const first = createCalendarBlocks(input(), [], randomUUID)[0];
  const second = createCalendarBlocks(input({date: "2026-10-01"}), [], randomUUID)[0];
  const entries = [first, second], copy = structuredClone(entries);
  assert.throws(() => updateCalendarBlock(second.id, input(), entries), /Já existe/);
  assert.deepEqual(entries, copy);
  assert.throws(() => updateCalendarBlock(second.id, input({repeat: "weekly", days: ["Segunda", "Quarta"]}), entries), /um dia/);
  assert.throws(() => updateCalendarBlock(randomUUID(), input(), entries), /não está mais/);
});
