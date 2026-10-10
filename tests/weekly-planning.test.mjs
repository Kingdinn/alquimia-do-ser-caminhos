import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {WEEKDAYS, weekdays, createWeeklyBlocks} from "../lib/weekly-planning.ts";

const input = (overrides = {}) => ({activity: "Meditar", days: ["Segunda", "Quarta"], time: "07:30", duration: "15", ...overrides});
const block = (overrides = {}) => ({id: randomUUID(), day: "Domingo", time: "10:00", activity: "Descansar", duration: "60", ...overrides});

test("creates linked practices in weekday order while preserving all previous commitments", () => {
  const old = [block()], copy = structuredClone(old), goalId = randomUUID();
  const next = createWeeklyBlocks(input({goalId, days: ["Sexta", "Segunda", "Quarta", "Segunda"]}), old, randomUUID);
  assert.deepEqual(old, copy);
  assert.equal(next[0], old[0]);
  assert.deepEqual(next.slice(1).map((item) => item.day), ["Segunda", "Quarta", "Sexta"]);
  assert.ok(next.slice(1).every((item) => item.goalId === goalId && item.duration === "15" && item.activity === "Meditar"));
  assert.equal(new Set(next.map((item) => item.id)).size, 4);
  assert.equal(WEEKDAYS, weekdays);
  assert.equal(WEEKDAYS.length, 7);
});

test("repeating a request is idempotent, but different goal, activity, duration or time remains distinct", () => {
  const request = input({goalId: randomUUID()});
  const first = createWeeklyBlocks(request, [], randomUUID);
  let calls = 0;
  const repeated = createWeeklyBlocks(request, first, () => { calls++; return randomUUID(); });
  assert.deepEqual(repeated, first);
  assert.equal(calls, 0, "duplicates should not allocate new identities");
  for (const change of [{goalId: randomUUID()}, {activity: "Escrever"}, {time: "08:00"}, {duration: "20"}]) {
    assert.equal(createWeeklyBlocks({...request, ...change}, first, randomUUID).length, 4);
  }
  const unlinked = createWeeklyBlocks(input(), [], randomUUID);
  assert.equal(Object.hasOwn(unlinked[0], "goalId"), false);
  assert.equal(createWeeklyBlocks(request, unlinked, randomUUID).length, 4);
});

test("partial duplication only adds missing days and never rewrites a legacy block", () => {
  const legacy = [block({day: "Segunda", time: "07:30", duration: "15", activity: "Meditar"})];
  const next = createWeeklyBlocks(input(), legacy, randomUUID);
  assert.equal(next.length, 2);
  assert.equal(next[0], legacy[0]);
  assert.equal(next[1].day, "Quarta");
});

test("invalid selections fail before generating IDs or changing existing commitments", () => {
  const existing = [block()], copy = structuredClone(existing);
  let calls = 0;
  for (const change of [
    {days: []}, {days: ["Monday"]}, {time: "24:00"}, {time: "9:00"},
    {activity: " "}, {activity: "a".repeat(2001)}, {duration: "0"}, {duration: "1441"},
    {duration: "1.5"}, {duration: "Infinity"}, {duration: ""}, {goalId: ""}, {goalId: "not-an-id"},
  ]) assert.throws(() => createWeeklyBlocks(input(change), existing, () => { calls++; return randomUUID(); }), Error);
  assert.equal(calls, 0);
  assert.deepEqual(existing, copy);
});

test("the 150-commitment cap rejects the entire addition while duplicates remain usable", () => {
  const existing = Array.from({length: 149}, (_, index) => block({activity: `Atividade ${index}`}));
  let calls = 0;
  assert.throws(() => createWeeklyBlocks(input(), existing, () => { calls++; return randomUUID(); }), /150 compromissos/);
  assert.equal(calls, 0);
  assert.equal(existing.length, 149);
  const full = createWeeklyBlocks(input({days: ["Segunda"]}), existing, randomUUID);
  assert.equal(full.length, 150);
  assert.deepEqual(createWeeklyBlocks(input({days: ["Segunda"]}), full, randomUUID), full);
});

test("invalid or duplicate generated IDs fail without returning a partially modified schedule", () => {
  const previous = [block()], copy = structuredClone(previous);
  assert.throws(() => createWeeklyBlocks(input(), previous, () => previous[0].id), /identificar/);
  assert.throws(() => createWeeklyBlocks(input(), previous, () => "bad-id"), /identificar/);
  const duplicate = randomUUID();
  assert.throws(() => createWeeklyBlocks(input(), previous, () => duplicate), /identificar/);
  assert.deepEqual(previous, copy);
});
