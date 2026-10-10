import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { createPlanningGoal, getGoalProgress, getGoalTitle, getHabitSummary, setMonthlyGoalProgress } from "../lib/goal-planning.ts";

const goal = (overrides = {}) => ({ ...createPlanningGoal("custom", "Violão", randomUUID), ...overrides });

test("starting templates are editable intentions without fabricated progress or baseline", () => {
  for (const template of ["repertoire", "composition", "technique", "custom", "habit", "project", "reading", "monthly"]) {
    const result = createPlanningGoal(template, "Violão", randomUUID);
    assert.equal(result.area, "Violão");
    assert.equal(result.baseline, "");
    assert.equal(result.current, "");
    assert.equal(result.date, "");
    assert.equal(result.three, "");
    assert.equal(result.six, "");
    if (template !== "technique") assert.equal(getGoalProgress(result, "2026-09"), null);
  }
  assert.equal(createPlanningGoal("repertoire", "Violão", randomUUID).target, "30");
  const monthly = createPlanningGoal("composition", "Piano", randomUUID);
  assert.equal(monthly.target, "1");
  assert.equal(monthly.tracking, "monthly");
  assert.deepEqual(monthly.monthlyProgress, []);
});

test("technique suggestions fit piano, guitar and other instruments, all unchecked with unique IDs", () => {
  for (const area of ["Piano", "Teclado", "Violão", "Violao", "Guitarra", "Flauta transversal", "Outro instrumento"]) {
    const result = createPlanningGoal("technique", area, randomUUID);
    const ids = [result.id, ...result.milestones.map((item) => item.id)];
    assert.equal(new Set(ids).size, 4);
    assert.equal(result.milestones.some((item) => item.done), false);
    if (/piano|teclado/i.test(area)) assert.match(result.milestones[1].title, /mãos separadas/);
    else if (/violão|violao|guitarra/i.test(area)) assert.match(result.milestones[1].title, /dedilhados/);
    else {
      assert.equal(result.title, "Aprender um arranjo");
      assert.equal(result.milestones[1].title, "Estudar a técnica devagar, por trechos");
    }
  }
});

test("legacy goals have useful titles and count progress without rewriting their content", () => {
  const legacy = goal({ title: undefined, tracking: undefined, three: "Tocar dez músicas", six: "Tocar trinta", current: "7", target: "30", metric: "músicas" });
  const copy = structuredClone(legacy);
  assert.equal(getGoalTitle(legacy), "Tocar dez músicas");
  assert.equal(getGoalTitle({ ...legacy, title: " Meu repertório " }), "Meu repertório");
  assert.equal(getGoalTitle({ ...legacy, three: "", six: "" }), "Violão");
  assert.equal(getGoalProgress(legacy, "2026-09").current, 7);
  assert.deepEqual(legacy, copy);
});

test("count progress distinguishes unknown from zero and caps the visual percentage only", () => {
  for (const current of ["", " ", "-1", "Infinity", "NaN", "0x10", "one", "1e999"]) {
    assert.equal(getGoalProgress(goal({ current, target: "30" }), "2026-09"), null);
  }
  for (const target of ["", "0", "-1", "Infinity", "NaN"]) {
    assert.equal(getGoalProgress(goal({ current: "1", target }), "2026-09"), null);
  }
  assert.equal(getGoalProgress(goal({ current: "0", target: "30" }), "2026-09").percent, 0);
  assert.equal(getGoalProgress(goal({ current: "1,5", target: "3" }), "2026-09").percent, 50);
  const over = getGoalProgress(goal({ current: "35", target: "30" }), "2026-09");
  assert.equal(over.current, 35);
  assert.equal(over.percent, 100);
});

test("checklist progress counts only named stages, including unfinished named stages", () => {
  const result = goal({ tracking: "checklist", current: "999", target: "1", milestones: [
    { id: randomUUID(), title: "Escolher o arranjo", done: true },
    { id: randomUUID(), title: "Gravar o arranjo", done: false },
    { id: randomUUID(), title: "  ", done: true },
  ] });
  assert.deepEqual(getGoalProgress(result, "2026-09"), { current: 1, target: 2, percent: 50, label: "1 de 2 etapas concluídas" });
  assert.equal(getGoalProgress({ ...result, milestones: [{ id: randomUUID(), title: "", done: false }] }, "2026-09"), null);
});

test("general templates keep a blank area and distinguish habits, projects and monthly results", () => {
  const habit = createPlanningGoal("habit", "", randomUUID);
  assert.equal(habit.title, "");
  assert.equal(habit.area, "");
  assert.deepEqual(habit.habit, {period: "daily", times: "7", duration: ""});
  assert.equal(getGoalProgress({...habit, current: "4", target: "7"}, "2026-09"), null, "a desired habit rhythm must never become claimed completion");
  const project = createPlanningGoal("project", "Trabalho", randomUUID);
  assert.equal(project.tracking, "checklist");
  assert.equal(project.title, "");
  assert.deepEqual(project.milestones, []);
  const reading = createPlanningGoal("reading", "", randomUUID);
  assert.equal(reading.area, "");
  assert.equal(reading.target, "1");
  assert.equal(reading.metric, "livros");
  assert.equal(reading.tracking, "monthly");
  const monthly = createPlanningGoal("monthly", "Criação", randomUUID);
  assert.equal(monthly.title, "");
  assert.equal(monthly.target, "");
  assert.deepEqual(monthly.monthlyProgress, []);
});

test("habit summaries describe planned frequency and valid duration without invented completion", () => {
  const habit = createPlanningGoal("habit", "Meditação", randomUUID);
  assert.equal(getHabitSummary(habit), "Todos os dias");
  assert.equal(getHabitSummary({...habit, habit: {...habit.habit, duration: "10", durationMax: "15"}}), "Todos os dias · 10–15 min");
  assert.equal(getHabitSummary({...habit, habit: {period: "weekly", times: "4", duration: "15"}}), "4 dias por semana · 15 min");
  assert.equal(getHabitSummary({...habit, habit: {period: "weekly", times: "1", duration: "60"}}), "1 dia por semana · 60 min");
  assert.equal(getHabitSummary({...habit, habit: {period: "weekly", times: "", duration: ""}}), "Frequência a definir");
  assert.equal(getHabitSummary({...habit, habit: {...habit.habit, duration: "15", durationMax: "10"}}), "Todos os dias");
  assert.equal(getHabitSummary({...habit, habit: {...habit.habit, duration: "-", durationMax: "15"}}), "Todos os dias");
  assert.equal(getHabitSummary({...habit, habit: {...habit.habit, duration: "15", durationMax: "15"}}), "Todos os dias · 15 min");
  assert.equal(getHabitSummary(goal()), "");
});

test("monthly progress isolates months and preserves history through edits and clearing", () => {
  const initial = goal({ tracking: "monthly", current: "900", target: "1", metric: "músicas" });
  const september = setMonthlyGoalProgress(initial, "2026-09", "1");
  const october = setMonthlyGoalProgress(september, "2026-10", "0");
  assert.equal(initial.monthlyProgress, undefined);
  assert.deepEqual(september.monthlyProgress, [{ month: "2026-09", current: "1" }]);
  assert.equal(getGoalProgress(october, "2026-09").percent, 100);
  assert.equal(getGoalProgress(october, "2026-10").percent, 0);
  assert.equal(getGoalProgress(october, "2026-11"), null);
  assert.equal(getGoalProgress(october, "2026-13"), null);
  const cleared = setMonthlyGoalProgress(october, "2026-10", "");
  assert.equal(getGoalProgress(cleared, "2026-10"), null);
  assert.deepEqual(cleared.monthlyProgress[0], { month: "2026-09", current: "1" });
  assert.equal(cleared.monthlyProgress.length, 2);
});

test("monthly updates reject invalid inputs and duplicate history rather than losing data", () => {
  const initial = goal({ tracking: "monthly" });
  for (const month of ["", "2026-00", "2026-13", "2026-9", "2026-09-01"]) {
    assert.throws(() => setMonthlyGoalProgress(initial, month, "1"), /mês válido/);
  }
  for (const current of ["-1", "Infinity", "  ", "0x10", "1".repeat(21)]) {
    assert.throws(() => setMonthlyGoalProgress(initial, "2026-09", current), /quantidade válida/);
  }
  assert.throws(() => setMonthlyGoalProgress({ ...initial, monthlyProgress: [{ month: "2026-09", current: "1" }, { month: "2026-09", current: "2" }] }, "2026-09", "3"), /repetidos/);
});

test("120-month history supports corrections but rejects appending without truncating old months", () => {
  const records = Array.from({ length: 120 }, (_, index) => ({ month: `${2016 + Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, "0")}`, current: "1" }));
  const initial = goal({ tracking: "monthly", monthlyProgress: records });
  const corrected = setMonthlyGoalProgress(initial, "2016-01", "2");
  assert.equal(corrected.monthlyProgress.length, 120);
  assert.equal(corrected.monthlyProgress[0].current, "2");
  assert.deepEqual(initial.monthlyProgress, records);
  assert.throws(() => setMonthlyGoalProgress(initial, "2026-01", "1"), /120 meses/);
  assert.equal(initial.monthlyProgress.length, 120);
});
