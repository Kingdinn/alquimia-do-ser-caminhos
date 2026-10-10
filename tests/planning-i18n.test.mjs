import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {createPlanningGoal, getGoalTitle, getGoalProgress, getHabitSummary} from "../lib/goal-planning.ts";
import {planningTranslations} from "../lib/i18n-planning.ts";
const translator = language => (key, values = {}) => (planningTranslations[key]?.[language] ?? key).replace(/\{(\w+)\}/g, (match, name) => String(values[name] ?? match));

test("switching interface language never translates personal goal titles, areas, units or existing content", () => {
  const goal = {...createPlanningGoal("custom", "Música", randomUUID), title: "Minha meta", baseline: "Minha história", metric: "músicas", current: "1,5", target: "30"};
  const before = structuredClone(goal);
  const t = translator("en");
  assert.equal(getGoalTitle(goal, t), "Minha meta");
  assert.equal(getGoalTitle({...goal, title: "", three: "", six: ""}, t), "Música");
  assert.equal(getGoalProgress(goal, "2026-10", t, "en-US").label, "1.5 of 30 músicas");
  assert.equal(getGoalTitle({...goal, title: "", area: ""}, t), "My goal");
  assert.deepEqual(goal, before);
});

test("new templates use the chosen language and preserve the person's entered area and unknown progress", () => {
  for (const [language, title, unit] of [["es", "Leer un libro al mes", "libros"], ["en", "Read one book a month", "books"]]) {
    const goal = createPlanningGoal("reading", "Meu ritual de leitura", randomUUID, translator(language));
    assert.equal(goal.title, title);
    assert.equal(goal.metric, unit);
    assert.equal(goal.area, "Meu ritual de leitura");
    assert.equal(goal.current, "");
    assert.equal(goal.baseline, "");
    assert.deepEqual(goal.monthlyProgress, []);
  }
  const guitar = createPlanningGoal("technique", "Guitar", randomUUID, translator("en"));
  assert.equal(guitar.title, "Learn a fingerstyle arrangement");
  assert.equal(guitar.milestones[1].title, "Practice fingerpicking slowly, section by section");
  assert.ok(guitar.milestones.every(item => !item.done));
});

test("localized progress and habit summaries keep the same values and do not report scheduled practice as done", () => {
  const goal = {...createPlanningGoal("habit", "Meditación", randomUUID), habit: {period: "weekly", times: "4", duration: "10", durationMax: "15"}};
  const before = structuredClone(goal);
  assert.equal(getHabitSummary(goal, translator("es")), "4 días por semana · 10–15 min");
  assert.equal(getHabitSummary(goal, translator("en")), "4 days a week · 10–15 min");
  assert.equal(getGoalProgress(goal, "2026-10", translator("en"), "en-US"), null);
  assert.deepEqual(goal, before);
  const project = {...createPlanningGoal("project", "Job search", randomUUID), milestones: [{id: randomUUID(), title: "Actualizar mi CV", done: true}, {id: randomUUID(), title: "Contatar recrutador", done: false}]};
  assert.equal(getGoalProgress(project, "2026-10", translator("en")).label, "1 of 2 steps completed");
  assert.equal(project.milestones[1].title, "Contatar recrutador");
});

test("every planning translation preserves placeholders in both languages", () => {
  const placeholders = value => [...value.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
  for (const [key, translations] of Object.entries(planningTranslations)) {
    for (const language of ["es", "en"]) {
      assert.ok(translations[language]?.trim(), `${key}: ${language} is not empty`);
      assert.deepEqual(placeholders(translations[language]), placeholders(key), `${key}: ${language} placeholders`);
    }
  }
});
