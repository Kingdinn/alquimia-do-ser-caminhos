import assert from "node:assert/strict";
import test from "node:test";
import {emptyJournal} from "../app/content.ts";
import {draftJournalSchema, saveSchema} from "../app/validation.ts";
import {randomUUID} from "node:crypto";
import {createPlanningGoal, setMonthlyGoalProgress} from "../lib/goal-planning.ts";
import {createCalendarBlocks} from "../lib/calendar-planning.ts";

const unfinishedCheckin = (date) => ({date, action: "Uma ideia ainda em elaboração", energy: "3", learned: "", next: "Continuar amanhã"});

test("cloud validation preserves the unfinished daily record, including an empty date", () => {
  for (const date of ["2026-09-28", ""]) {
    const data = {...emptyJournal(), checkinDraft: unfinishedCheckin(date)};
    const saved = saveSchema.parse({version: 7, data});
    assert.deepEqual(saved.data.checkinDraft, data.checkinDraft);
    assert.deepEqual(draftJournalSchema.parse(saved.data).checkinDraft, data.checkinDraft);
  }
});

test("legacy journals remain valid without a daily-record draft", () => {
  const legacy = emptyJournal();
  legacy.texts[0] = "Um caderno escrito antes do salvamento automático.";
  const result = saveSchema.parse({version: 2, data: legacy});
  assert.deepEqual(result.data, legacy);
  assert.equal(Object.hasOwn(result.data, "checkinDraft"), false);
});

test("local recovery preserves unfinished schedule fields without making them valid cloud records", () => {
  for (const [time, duration] of [["", ""], ["09:", "-"], ["09:00", "0"]]) {
    const data = {
      ...emptyJournal(),
      blocks: [{id: "d396ce09-2955-4cf9-94e6-7285e3dbdf50", day: "Segunda", time, duration, activity: "Praticar música"}],
    };
    assert.deepEqual(draftJournalSchema.parse(data).blocks, data.blocks);
    assert.equal(saveSchema.safeParse({version: 0, data}).success, false);
  }
});

test("daily-record drafts still enforce bounded text and a valid energy value", () => {
  const valid = {...emptyJournal(), checkinDraft: unfinishedCheckin("")};
  assert.equal(saveSchema.safeParse({version: 0, data: {...valid, checkinDraft: {...valid.checkinDraft, action: "a".repeat(2001)}}}).success, false);
  assert.equal(draftJournalSchema.safeParse({...valid, checkinDraft: {...valid.checkinDraft, energy: "6"}}).success, false);
});

test("old goal records stay unchanged and new planning fields survive cloud and draft round trips", () => {
  const legacy = {id: randomUUID(), area: "Música", baseline: "Um começo", three: "Aprender repertório", six: "Tocar para amigos", metric: "músicas", current: "2", target: "30", date: "2026-12-30", next: "Escolher uma música"};
  const data = {...emptyJournal(), goals: [legacy, createPlanningGoal("technique", "Piano", randomUUID), setMonthlyGoalProgress(createPlanningGoal("composition", "Violão", randomUUID), "2026-09", "")]};
  const cloud = saveSchema.parse({version: 1, data}).data;
  assert.deepEqual(cloud, data);
  assert.equal(Object.hasOwn(cloud.goals[0], "tracking"), false);
  assert.deepEqual(draftJournalSchema.parse(JSON.parse(JSON.stringify(cloud))), data);
});

test("planning validation bounds content and rejects duplicate checklist identifiers", () => {
  const valid = createPlanningGoal("technique", "Violão", randomUUID);
  const accepts = (goal) => saveSchema.safeParse({version: 0, data: {...emptyJournal(), goals: [goal]}}).success;
  assert.equal(accepts({...valid, title: "a".repeat(2000)}), true);
  assert.equal(accepts({...valid, title: "a".repeat(2001)}), false);
  assert.equal(accepts({...valid, tracking: "weekly"}), false);
  assert.equal(accepts({...valid, milestones: [valid.milestones[0], valid.milestones[0]]}), false);
  assert.equal(accepts({...valid, milestones: [{id: randomUUID(), title: "a".repeat(2001), done: false}]}), false);
  assert.equal(accepts({...valid, milestones: Array.from({length: 30}, () => ({id: randomUUID(), title: "", done: false}))}), true);
  assert.equal(accepts({...valid, milestones: Array.from({length: 31}, () => ({id: randomUUID(), title: "", done: false}))}), false);
});

test("monthly cloud and draft validation accept empty progress but reject bad or duplicate months", () => {
  const goal = createPlanningGoal("composition", "Violão", randomUUID);
  const accepts = (monthlyProgress, schema = draftJournalSchema) => schema.safeParse({...emptyJournal(), goals: [{...goal, monthlyProgress}]}).success;
  for (const current of ["", "0", "1", "1,5", "0.5"]) {
    const data = {...emptyJournal(), goals: [{...goal, monthlyProgress: [{month: "2026-09", current}]}]};
    assert.deepEqual(saveSchema.parse({version: 0, data}).data, data);
  }
  for (const month of ["2026-00", "2026-13", "2026-9", "2026-09-30", "invalid"]) assert.equal(accepts([{month, current: "1"}]), false);
  for (const current of ["-1", "Infinity", "NaN", "0x10", " ", "1".repeat(21)]) assert.equal(accepts([{month: "2026-09", current}]), false);
  assert.equal(accepts([{month: "2026-09", current: "1"}, {month: "2026-09", current: "2"}]), false);
  const records = Array.from({length: 121}, (_, index) => ({month: `${2016 + Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, "0")}`, current: "1"}));
  assert.equal(accepts(records.slice(0, 120)), true);
  assert.equal(accepts(records), false);
});

test("habit frequency, duration ranges and weekly goal links survive cloud and draft round trips", () => {
  const habit = {...createPlanningGoal("habit", "Corpo", randomUUID), habit: {period: "weekly", times: "4", duration: "10", durationMax: "15"}};
  const legacyBlock = {id: randomUUID(), day: "Segunda", time: "09:00", duration: "60", activity: "Trabalhar"};
  const linkedBlock = {...legacyBlock, id: randomUUID(), activity: "Treinar", goalId: habit.id};
  const data = {...emptyJournal(), goals: [habit], blocks: [legacyBlock, linkedBlock]};
  assert.deepEqual(saveSchema.parse({version: 0, data}).data, data);
  assert.deepEqual(draftJournalSchema.parse(data), data);
  assert.equal(Object.hasOwn(draftJournalSchema.parse(data).blocks[0], "goalId"), false);
  const blank = {...data, goals: [{...habit, habit: {period: "weekly", times: "", duration: "", durationMax: ""}}]};
  assert.deepEqual(saveSchema.parse({version: 0, data: blank}).data, blank);
});

test("cloud rejects invalid habit values while local drafts preserve unfinished numeric edits", () => {
  const goal = createPlanningGoal("habit", "", randomUUID);
  const original = {period: "weekly", times: "4", duration: "10", durationMax: "15"};
  for (const changes of [{times: "8"}, {times: "0"}, {times: "2.5"}, {duration: "-"}, {duration: "1441"}, {durationMax: "5"}, {durationMax: "-1"}, {duration: "NaN"}]) {
    const data = {...emptyJournal(), goals: [{...goal, habit: {...original, ...changes}}]};
    assert.equal(saveSchema.safeParse({version: 0, data}).success, false);
    assert.deepEqual(draftJournalSchema.parse(data), data, "typing an unfinished range must not discard the local backup");
  }
  const badPeriod = {...emptyJournal(), goals: [{...goal, habit: {...original, period: "monthly"}}]};
  assert.equal(draftJournalSchema.safeParse(badPeriod).success, false);
  const tooLong = {...emptyJournal(), goals: [{...goal, habit: {...original, duration: "1".repeat(21)}}]};
  assert.equal(draftJournalSchema.safeParse(tooLong).success, false);
  const badLink = {...emptyJournal(), blocks: [{id: randomUUID(), day: "Segunda", time: "09:00", duration: "60", activity: "Treinar", goalId: "other"}]};
  assert.equal(saveSchema.safeParse({version: 0, data: badLink}).success, false);
  assert.equal(draftJournalSchema.safeParse(badLink).success, false);
});

test("hidden retained habit edits do not block another goal type or a daily frequency", () => {
  const habit = {...createPlanningGoal("habit", "", randomUUID), habit: {period: "weekly", times: "8", duration: "15", durationMax: "1"}};
  const data = {...emptyJournal(), goals: [habit]};
  assert.equal(saveSchema.safeParse({version: 0, data}).success, false);
  const count = {...data, goals: [{...habit, tracking: "count"}]};
  assert.deepEqual(saveSchema.parse({version: 0, data: count}).data, count, "switching away must preserve unfinished habit fields without blocking visible goal input");
  const daily = {...data, goals: [{...habit, habit: {...habit.habit, period: "daily", durationMax: "20"}}]};
  assert.deepEqual(saveSchema.parse({version: 0, data: daily}).data, daily, "daily ignores the hidden weekly-frequency field");
});

test("dated events and recurrence windows round-trip with legacy weekly blocks intact", () => {
  const legacy = {id: randomUUID(), day: "Quarta", time: "23:30", duration: "120", activity: "Compromisso antigo"};
  const once = createCalendarBlocks({activity: "Revisão", time: "09:00", duration: "60", date: "2026-09-30", repeat: "once", days: []}, [legacy], randomUUID);
  const blocks = createCalendarBlocks({activity: "Praticar", time: "10:00", duration: "30", date: "2026-09-30", repeat: "weekly", days: ["Quarta"], endsOn: "2026-10-07"}, once, randomUUID);
  const data = {...emptyJournal(), blocks};
  assert.deepEqual(saveSchema.parse({version: 0, data}).data, data);
  assert.deepEqual(draftJournalSchema.parse(data), data);
  assert.deepEqual(blocks[0], legacy, "legacy overnight entries are preserved instead of silently shortened or removed");
});

test("calendar validation rejects impossible dates, mismatched weekdays and contradictory ranges", () => {
  const valid = {id: randomUUID(), day: "Quarta", time: "09:00", duration: "60", activity: "Praticar", date: "2026-09-30"};
  const invalid = [
    {...valid, date: "2026-02-29"}, {...valid, date: "2026-04-31"}, {...valid, day: "Segunda"},
    {...valid, startsOn: "2026-09-30"}, {...valid, endsOn: "2026-10-07"},
    {...valid, date: undefined, startsOn: "2026-10-07", endsOn: "2026-09-30"},
    {...valid, date: undefined, startsOn: "2026-02-30"},
    {...valid, date: undefined, day: "Segunda", startsOn: "2026-09-30", endsOn: "2026-10-01"},
  ];
  for (const block of invalid) {
    const data = {...emptyJournal(), blocks: [block]};
    assert.equal(saveSchema.safeParse({version: 0, data}).success, false);
    assert.equal(draftJournalSchema.safeParse(data).success, false);
  }
  const leap = {...valid, day: "Quinta", date: "2024-02-29"};
  assert.equal(saveSchema.safeParse({version: 0, data: {...emptyJournal(), blocks: [leap]}}).success, true);
});

test("calendar durations retain fractional and overnight compatibility while unfinished time stays recoverable", () => {
  const valid = {id: randomUUID(), day: "Quarta", time: "09:00", duration: "60", activity: "Praticar", date: "2026-09-30"};
  for (const changes of [{time: "23:30", duration: "120"}, {duration: "0.5"}]) {
    const data = {...emptyJournal(), blocks: [{...valid, ...changes}]};
    assert.deepEqual(saveSchema.parse({version: 0, data}).data, data);
    assert.deepEqual(draftJournalSchema.parse(data), data);
  }
  const unfinished = {...emptyJournal(), blocks: [{...valid, time: "09:", duration: ""}]};
  assert.equal(saveSchema.safeParse({version: 0, data: unfinished}).success, false);
  assert.deepEqual(draftJournalSchema.parse(unfinished), unfinished);
  const midnight = {...emptyJournal(), blocks: [{...valid, time: "23:30", duration: "30"}]};
  assert.deepEqual(saveSchema.parse({version: 0, data: midnight}).data, midnight);
});
