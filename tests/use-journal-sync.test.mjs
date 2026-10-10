import assert from "node:assert/strict";
import {after, test} from "node:test";
import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import ts from "typescript";
import React from "react";
import {act, create} from "react-test-renderer";
import {randomUUID} from "node:crypto";
import {createPlanningGoal, setMonthlyGoalProgress} from "../lib/goal-planning.ts";
import {createWeeklyBlocks} from "../lib/weekly-planning.ts";
import {createCalendarBlocks, occurrencesForDate, updateCalendarBlock} from "../lib/calendar-planning.ts";

// Compile production modules unchanged apart from import paths; no production dependencies are mocked.
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const compiled = await mkdtemp(path.join(appRoot, ".journal-hook-tests-"));
after(async () => { await rm(compiled, {recursive: true, force: true}); });
for (const [source, destination] of [
  ["app/content.ts", "content.mjs"], ["app/validation.ts", "validation.mjs"],
  ["lib/journal-sync.ts", "journal-sync.mjs"], ["lib/use-journal-sync.ts", "use-journal-sync.mjs"],
]) {
  const input = (await readFile(path.join(appRoot, source), "utf8"))
    .replaceAll('"@/app/content"', '"./content.mjs"')
    .replaceAll('"@/app/validation"', '"./validation.mjs"')
    .replaceAll('"./journal-sync"', '"./journal-sync.mjs"');
  const result = ts.transpileModule(input, {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext}});
  await writeFile(path.join(compiled, destination), result.outputText);
}
const {useJournalSync} = await import(pathToFileURL(path.join(compiled, "use-journal-sync.mjs")).href);
const {emptyJournal} = await import(pathToFileURL(path.join(compiled, "content.mjs")).href);
const {saveSchema} = await import(pathToFileURL(path.join(compiled, "validation.mjs")).href);
const clone = (value) => structuredClone(value);
const journal = (text) => ({...emptyJournal(), texts: [text, "", "", "", "", "", ""]});
const microtasks = async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); };
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return {promise, resolve};
}
function memoryStorage() {
  const items = new Map();
  return {
    get length() { return items.size; },
    key(index) { return [...items.keys()][index] ?? null; },
    getItem(key) { return items.get(key) ?? null; },
    setItem(key, value) { items.set(key, value); },
    removeItem(key) { items.delete(key); },
  };
}

async function fixture(run) {
  const originals = new Map();
  function replace(name, value) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, {configurable: true, writable: true, value});
  }
  const storage = memoryStorage(), windows = new EventTarget(), document = new EventTarget();
  const confirmations = [];
  windows.localStorage = storage;
  windows.confirm = (message) => { confirmations.push(message); return true; };
  document.visibilityState = "visible";
  const timers = new Map();
  let now = 0, timerId = 0;
  replace("setTimeout", (callback, delay = 0) => { const id = ++timerId; timers.set(id, {at: now + delay, callback}); return id; });
  replace("clearTimeout", (id) => timers.delete(id));
  replace("window", windows);
  replace("document", document);
  replace("navigator", {onLine: true});
  replace("IS_REACT_ACT_ENVIRONMENT", true);
  const remote = new Map([
    ["account-a", {ownerId: "account-a", version: 1, data: journal("saved a")}],
    ["account-b", {ownerId: "account-b", version: 1, data: journal("saved b")}],
  ]);
  const requests = [], getGates = [], putGates = [];
  let failWrites = false;
  replace("fetch", async (url, options = {}) => {
    assert.equal(url, "/api/journal", "unexpected external request");
    const owner = new Headers(options.headers).get("X-Journal-Owner");
    assert.ok(remote.has(owner), "every request is pinned to the expected account");
    const method = options.method ?? "GET";
    requests.push({owner, method});
    if (method === "GET") {
      const body = clone(remote.get(owner));
      if (getGates.length) await getGates.shift().promise;
      return Response.json(body);
    }
    assert.equal(method, "PUT");
    if (putGates.length) await putGates.shift().promise;
    if (failWrites) throw new TypeError("Offline");
    const parsed = saveSchema.safeParse(JSON.parse(options.body));
    if (!parsed.success) return Response.json({error: "Revise os campos."}, {status: 400});
    const before = remote.get(owner);
    if (parsed.data.version !== before.version) return Response.json({error: "Outra versão foi salva."}, {status: 409});
    const saved = {ownerId: owner, version: before.version + 1, data: clone(parsed.data.data)};
    remote.set(owner, saved);
    return Response.json({version: saved.version});
  });
  const mounted = new Set();
  async function mount(ownerId = "account-a") {
    let api, root;
    function Harness(props) { api = useJournalSync(props); return null; }
    await act(async () => { root = create(React.createElement(Harness, {demo: false, ownerId})); await microtasks(); });
    const handle = {
      get api() { return api; },
      async updateOwner(nextOwner) { await act(async () => { root.update(React.createElement(Harness, {demo: false, ownerId: nextOwner})); await microtasks(); }); },
      async unmount() { if (!mounted.delete(handle)) return; await act(async () => { root.unmount(); await microtasks(); }); },
    };
    mounted.add(handle);
    return handle;
  }
  async function tick(ms) {
    await act(async () => {
      const target = now + ms;
      while (true) {
        const next = [...timers.entries()].filter(([, value]) => value.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        now = next[1].at;
        timers.delete(next[0]);
        next[1].callback();
        await microtasks();
      }
      now = target;
      await microtasks();
    });
  }
  async function edit(handle, text) {
    await act(async () => { handle.api.change({texts: [text, "", "", "", "", "", ""]}); await microtasks(); });
  }
  try {
    await run({mount, tick, edit, storage, remote, requests, getGates, putGates, confirmations,
      failWrites(value) { failWrites = value; },
    });
  } finally {
    for (const handle of [...mounted]) await handle.unmount();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

test("actual hook debounces edits, saves through the validated API and reloads the saved journal", async () => {
  await fixture(async ({mount, tick, edit, remote, requests, storage}) => {
    const first = await mount();
    assert.equal(first.api.ready, true);
    assert.equal(first.api.journal.texts[0], "saved a");
    await edit(first, "a lasting thought");
    assert.equal(first.api.dirty, true);
    assert.equal(storage.length, 1);
    await tick(999);
    assert.equal(requests.filter((entry) => entry.method === "PUT").length, 0);
    await tick(1);
    assert.equal(remote.get("account-a").data.texts[0], "a lasting thought");
    assert.equal(first.api.dirty, false);
    assert.equal(storage.length, 0);
    await first.unmount();
    const reloaded = await mount();
    assert.equal(reloaded.api.journal.texts[0], "a lasting thought");
    assert.equal(reloaded.api.drafts.length, 0);
  });
});

test("new planning fields survive actual-hook saves and reloads while accounts keep independent goals", async () => {
  await fixture(async ({mount, tick, remote, requests}) => {
    const page = await mount("account-a");
    const repertoire = {...createPlanningGoal("repertoire", "Violão", randomUUID), current: "7", baseline: "Comecei com duas músicas"};
    const composition = setMonthlyGoalProgress(setMonthlyGoalProgress(createPlanningGoal("composition", "Piano", randomUUID), "2026-09", "1"), "2026-10", "");
    const technique = createPlanningGoal("technique", "Flauta transversal", randomUUID);
    technique.milestones[0].done = true;
    const goalsA = [repertoire, composition, technique];
    await act(async () => { page.api.change({goals: goalsA}); await microtasks(); });
    assert.equal(page.api.dirty, true);
    await tick(1000);
    assert.equal(page.api.dirty, false);
    assert.deepEqual(remote.get("account-a").data.goals, goalsA, "API validation must retain goal titles, tracking, history and checklist completion");
    assert.deepEqual(remote.get("account-b").data.goals, [], "saving one notebook must not change another account");

    await page.updateOwner("account-b");
    assert.deepEqual(page.api.journal.goals, []);
    const goalsB = [{...createPlanningGoal("custom", "Leitura", randomUUID), title: "Ler cinco livros", metric: "livros", current: "1", target: "5"}];
    await act(async () => { page.api.change({goals: goalsB}); await microtasks(); });
    await tick(1000);
    assert.deepEqual(remote.get("account-b").data.goals, goalsB);
    assert.deepEqual(remote.get("account-a").data.goals, goalsA, "account switching must not retarget earlier goal data");
    await page.unmount();

    const reloadedA = await mount("account-a");
    assert.deepEqual(reloadedA.api.journal.goals, goalsA);
    assert.equal(reloadedA.api.drafts.length, 0);
    await reloadedA.unmount();
    const reloadedB = await mount("account-b");
    assert.deepEqual(reloadedB.api.journal.goals, goalsB);
    assert.deepEqual(requests.filter((entry) => entry.method === "PUT").map((entry) => entry.owner), ["account-a", "account-b"]);
  });
});

test("habit plans and linked weekly practices survive validated saves and reloads with account isolation", async () => {
  await fixture(async ({mount, tick, remote, requests}) => {
    const first = await mount("account-a");
    const habit = {...createPlanningGoal("habit", "Corpo", randomUUID), title: "Academia quatro dias por semana", habit: {period: "weekly", times: "4", duration: "45", durationMax: "60"}};
    const legacyBlock = {id: randomUUID(), day: "Domingo", time: "12:00", duration: "60", activity: "Almoço em família"};
    const blocks = createWeeklyBlocks({goalId: habit.id, activity: "Treinar", days: ["Segunda", "Terça", "Quinta", "Sexta"], time: "08:00", duration: "60"}, [legacyBlock], randomUUID);
    await act(async () => { first.api.change({goals: [habit], blocks}); await microtasks(); });
    await tick(1000);
    assert.equal(first.api.dirty, false);
    assert.deepEqual(remote.get("account-a").data.goals, [habit]);
    assert.deepEqual(remote.get("account-a").data.blocks, blocks);
    await first.unmount();

    const reloaded = await mount("account-a");
    assert.deepEqual(reloaded.api.journal.goals, [habit]);
    assert.deepEqual(reloaded.api.journal.blocks, blocks);
    assert.equal(Object.hasOwn(reloaded.api.journal.blocks[0], "goalId"), false);
    await reloaded.updateOwner("account-b");
    assert.deepEqual(reloaded.api.journal.goals, []);
    assert.deepEqual(reloaded.api.journal.blocks, []);
    const otherHabit = {...createPlanningGoal("habit", "Presença", randomUUID), title: "Meditar", habit: {period: "daily", times: "7", duration: "15"}};
    const otherBlocks = createWeeklyBlocks({goalId: otherHabit.id, activity: "Meditar", days: ["Segunda"], time: "07:00", duration: "15"}, [], randomUUID);
    await act(async () => { reloaded.api.change({goals: [otherHabit], blocks: otherBlocks}); await microtasks(); });
    await tick(1000);
    assert.deepEqual(remote.get("account-b").data.goals, [otherHabit]);
    assert.deepEqual(remote.get("account-b").data.blocks, otherBlocks);
    assert.deepEqual(remote.get("account-a").data.goals, [habit]);
    assert.deepEqual(remote.get("account-a").data.blocks, blocks, "another account cannot overwrite linked practices");
    assert.deepEqual(requests.filter((entry) => entry.method === "PUT").map((entry) => entry.owner), ["account-a", "account-b"]);
  });
});

test("calendar dates, edited legacy recurrence and monthly boundaries persist independently for each account", async () => {
  await fixture(async ({mount, tick, remote}) => {
    const first = await mount("account-a");
    const goal = {...createPlanningGoal("habit", "Música", randomUUID), title: "Praticar piano"};
    const legacy = {id: randomUUID(), day: "Quarta", time: "23:30", duration: "120", activity: "Prática antiga"};
    const once = createCalendarBlocks({goalId: goal.id, activity: "Concerto", time: "20:00", duration: "120", date: "2026-10-02", repeat: "once", days: []}, [legacy], randomUUID);
    const bounded = createCalendarBlocks({goalId: goal.id, activity: "Piano", time: "09:00", duration: "60", date: "2026-09-30", repeat: "weekly", days: ["Quarta"], endsOn: "2026-10-07"}, once, randomUUID);
    const blocks = updateCalendarBlock(legacy.id, {activity: "Prática livre", time: "23:30", duration: "120", date: "", repeat: "weekly", days: ["Quarta"]}, bounded);
    await act(async () => { first.api.change({goals: [goal], blocks}); await microtasks(); });
    await tick(1000);
    assert.equal(first.api.dirty, false);
    assert.deepEqual(remote.get("account-a").data.blocks, blocks);
    await first.unmount();
    const reload = await mount("account-a");
    assert.deepEqual(reload.api.journal.blocks, blocks);
    assert.deepEqual(occurrencesForDate(reload.api.journal.blocks, "2026-09-23").map((item) => item.activity), ["Prática livre"]);
    assert.deepEqual(occurrencesForDate(reload.api.journal.blocks, "2026-10-02").map((item) => item.activity), ["Concerto"]);
    assert.deepEqual(occurrencesForDate(reload.api.journal.blocks, "2026-10-07").map((item) => item.activity), ["Piano", "Prática livre"]);
    assert.deepEqual(occurrencesForDate(reload.api.journal.blocks, "2026-10-14").map((item) => item.activity), ["Prática livre"]);
    await reload.updateOwner("account-b");
    assert.deepEqual(reload.api.journal.blocks, []);
    const other = createCalendarBlocks({activity: "Ler", time: "21:00", duration: "15.5", date: "2026-10-02", repeat: "once", days: []}, [], randomUUID);
    await act(async () => { reload.api.change({blocks: other}); await microtasks(); });
    await tick(1000);
    assert.deepEqual(remote.get("account-b").data.blocks, other);
    assert.deepEqual(remote.get("account-a").data.blocks, blocks);
    assert.deepEqual(remote.get("account-a").data.goals, [goal]);
  });
});

test("an unfinished habit duration range survives interrupted editing and local recovery", async () => {
  await fixture(async ({mount, tick, remote}) => {
    const first = await mount("account-a");
    const unfinished = {...createPlanningGoal("habit", "Escrita", randomUUID), title: "Escrever diariamente", habit: {period: "daily", times: "7", duration: "10", durationMax: "1"}};
    await act(async () => { first.api.change({goals: [unfinished]}); await microtasks(); });
    await tick(1000);
    assert.equal(first.api.error?.status, 400);
    assert.equal(first.api.dirty, true);
    assert.deepEqual(remote.get("account-a").data.goals, []);
    await first.unmount();
    const other = await mount("account-b");
    assert.equal(other.api.drafts.length, 0);
    await other.unmount();
    const recovered = await mount("account-a");
    assert.equal(recovered.api.drafts.length, 1);
    await act(async () => { await recovered.api.recoverDraft(recovered.api.drafts[0]); await microtasks(); });
    assert.deepEqual(recovered.api.journal.goals, [unfinished]);
    const finished = {...unfinished, habit: {...unfinished.habit, durationMax: "15"}};
    await act(async () => { recovered.api.change({goals: [finished]}); await microtasks(); });
    await tick(1000);
    assert.equal(recovered.api.dirty, false);
    assert.deepEqual(remote.get("account-a").data.goals, [finished]);
  });
});

test("actual hook retains changes made while a slow write is in progress", async () => {
  await fixture(async ({mount, tick, edit, remote, putGates}) => {
    const page = await mount();
    const firstWrite = deferred();
    putGates.push(firstWrite);
    await edit(page, "first revision");
    await tick(1000);
    assert.equal(page.api.saving, true);
    await edit(page, "latest revision");
    await act(async () => { firstWrite.resolve(); await microtasks(); });
    assert.equal(page.api.journal.texts[0], "latest revision");
    assert.equal(page.api.dirty, true);
    assert.equal(remote.get("account-a").data.texts[0], "first revision");
    await tick(1000);
    assert.equal(remote.get("account-a").data.texts[0], "latest revision");
    assert.equal(remote.get("account-a").version, 3);
    assert.equal(page.api.dirty, false);
  });
});

test("failed saves survive reload as an account-isolated recovery choice", async () => {
  await fixture(async ({mount, tick, edit, remote, failWrites, storage}) => {
    const first = await mount();
    failWrites(true);
    await edit(first, "recover my unfinished thought");
    await tick(1000);
    assert.equal(first.api.dirty, true);
    await first.unmount();
    const otherAccount = await mount("account-b");
    assert.equal(otherAccount.api.drafts.length, 0);
    assert.equal(otherAccount.api.journal.texts[0], "saved b");
    await otherAccount.unmount();
    failWrites(false);
    const recovery = await mount();
    assert.equal(recovery.api.journal.texts[0], "saved a");
    assert.equal(recovery.api.drafts.length, 1);
    await act(async () => { await recovery.api.recoverDraft(recovery.api.drafts[0]); await microtasks(); });
    assert.equal(recovery.api.journal.texts[0], "recover my unfinished thought");
    await tick(1000);
    assert.equal(remote.get("account-a").data.texts[0], "recover my unfinished thought");
    assert.equal(recovery.api.dirty, false);
    assert.equal(recovery.api.drafts.length, 0);
    assert.equal(storage.length, 0);
  });
});

test("an unfinished progress entry with an empty date survives validation, saving and reload", async () => {
  await fixture(async ({mount, tick, remote}) => {
    const first = await mount();
    const checkinDraft = {date: "", action: "Still writing", energy: "3", learned: "An unfinished insight", next: ""};
    await act(async () => { first.api.change({checkinDraft}); await microtasks(); });
    await tick(1000);
    assert.deepEqual(remote.get("account-a").data.checkinDraft, checkinDraft, "actual API schema must not strip the draft");
    assert.equal(first.api.dirty, false);
    await first.unmount();
    const reloaded = await mount();
    assert.deepEqual(reloaded.api.journal.checkinDraft, checkinDraft);
  });
});

test("keeping this tab after a conflict preserves edits made while the comparison GET is pending", async () => {
  await fixture(async ({mount, tick, edit, remote, getGates, confirmations}) => {
    const page = await mount();
    await edit(page, "local before conflict");
    remote.set("account-a", {ownerId: "account-a", version: 2, data: journal("another device")});
    await tick(1000);
    assert.equal(page.api.error?.status, 409);
    const compare = deferred();
    getGates.push(compare);
    let decision;
    await act(async () => { decision = page.api.keepMine(); await microtasks(); });
    await edit(page, "local edit during comparison");
    await act(async () => { compare.resolve(); await decision; await microtasks(); });
    assert.equal(page.api.journal.texts[0], "local edit during comparison");
    assert.ok(confirmations.length > 0);
    await tick(1000);
    assert.equal(remote.get("account-a").data.texts[0], "local edit during comparison");
    assert.equal(remote.get("account-a").version, 3);
    assert.equal(page.api.dirty, false);
  });
});

test("a stale version-choice response cannot overwrite a newly selected account", async () => {
  await fixture(async ({mount, tick, edit, remote, getGates}) => {
    const page = await mount();
    await edit(page, "account a private draft");
    const compare = deferred();
    getGates.push(compare);
    let decision;
    await act(async () => { decision = page.api.keepMine(); await microtasks(); });
    await page.updateOwner("account-b");
    assert.equal(page.api.ready, true);
    assert.equal(page.api.journal.texts[0], "saved b");
    await edit(page, "account b private draft");
    await act(async () => { compare.resolve(); await decision; await microtasks(); });
    assert.equal(page.api.journal.texts[0], "account b private draft");
    await tick(1000);
    assert.equal(remote.get("account-b").data.texts[0], "account b private draft");
    assert.equal(remote.get("account-a").data.texts[0], "saved a");
  });
});
