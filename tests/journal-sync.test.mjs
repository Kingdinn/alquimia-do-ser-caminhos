import assert from "node:assert/strict";
import test from "node:test";
import {createJournalSync, createJournalDraftStore, classifyJournalDraft, JournalSaveError} from "../lib/journal-sync.ts";

const settle = async () => { for (let i = 0; i < 16; i += 1) await Promise.resolve(); };
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
}
function clock() {
  let time = 0, id = 0;
  const tasks = new Map();
  return {
    now: () => time,
    setTimer(fn, delay) { const key = ++id; tasks.set(key, {fn, at: time + delay}); return key; },
    clearTimer(key) { tasks.delete(key); },
    async advance(ms) {
      const target = time + ms;
      while (true) {
        const next = [...tasks.entries()].filter(([, task]) => task.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        time = next[1].at;
        tasks.delete(next[0]);
        next[1].fn();
        await settle();
      }
      time = target;
      await settle();
    },
    size: () => tasks.size,
  };
}
function harness(save, extra = {}) {
  const timer = clock(), drafts = [], snapshots = [];
  const sync = createJournalSync({data: {text: "saved"}, version: 4, save, onDraft: (event) => drafts.push(event), onChange: (state) => snapshots.push(state), ...timer, ...extra});
  return {sync, timer, drafts, snapshots};
}

test("debounces consecutive edits and acknowledges the saved revision", async () => {
  const calls = [];
  const {sync, timer, drafts} = harness(async (data, version) => { calls.push({data, version}); return version + 1; });
  sync.edit({text: "first"});
  await timer.advance(700);
  sync.edit({text: "latest"});
  await timer.advance(999);
  assert.equal(calls.length, 0);
  await timer.advance(1);
  assert.deepEqual(calls, [{data: {text: "latest"}, version: 4}]);
  assert.equal(sync.getSnapshot().status, "saved");
  assert.equal(sync.getSnapshot().dirty, false);
  assert.equal(sync.getSnapshot().version, 5);
  assert.deepEqual(drafts.at(-1), {type: "clear", revision: 2});
});

test("slow saves serialize newer edits, preserve their draft and flush the latest revision", async () => {
  const first = deferred(), second = deferred(), calls = [];
  const {sync, timer, drafts} = harness((data, version) => {
    calls.push({data, version});
    return calls.length === 1 ? first.promise : second.promise;
  });
  sync.edit({text: "first"});
  await timer.advance(1000);
  sync.edit({text: "second"});
  let flushed = false;
  const flush = sync.flush().then((value) => { flushed = value; return value; });
  assert.equal(calls.length, 1);
  assert.equal(sync.getSnapshot().saving, true);
  first.resolve(5);
  await settle();
  assert.equal(flushed, false);
  assert.deepEqual(calls, [{data: {text: "first"}, version: 4}, {data: {text: "second"}, version: 5}]);
  assert.equal(drafts.filter((event) => event.type === "clear").length, 0);
  assert.equal(drafts.at(-1).baseVersion, 5);
  assert.equal(drafts.at(-1).data.text, "second");
  second.resolve(6);
  assert.equal(await flush, true);
  assert.equal(sync.getSnapshot().version, 6);
  assert.equal(sync.getSnapshot().dirty, false);
  assert.deepEqual(drafts.at(-1), {type: "clear", revision: 2});
});

test("network failures use bounded exponential retries and edits never create a retry hot loop", async () => {
  let calls = 0, fail = true;
  const {sync, timer} = harness(async (_data, version) => { calls += 1; if (fail) throw new Error("offline"); return version + 1; });
  sync.edit({text: "unsent"});
  await timer.advance(1000);
  assert.equal(calls, 1);
  sync.edit({text: "unsent and revised"});
  await timer.advance(1999);
  assert.equal(calls, 1);
  await timer.advance(1);
  assert.equal(calls, 2);
  await timer.advance(4000);
  assert.equal(calls, 3);
  await timer.advance(8000);
  assert.equal(calls, 4);
  assert.equal(sync.getSnapshot().status, "blocked");
  sync.edit({text: "still unsent"});
  await timer.advance(300000);
  assert.equal(calls, 4);
  assert.equal(timer.size(), 0);
  fail = false;
  assert.equal(await sync.retry(), true);
  assert.equal(calls, 5);
  assert.equal(sync.getSnapshot().dirty, false);
});

test("server failures retry, validation changes resume, and auth/conflicts remain blocked", async () => {
  for (const status of [400, 401, 403, 409, 413, 503]) {
    let calls = 0, fail = true;
    const versions = [];
    const {sync, timer, drafts} = harness(async (_data, version) => {
      calls += 1;
      versions.push(version);
      if (fail) throw new JournalSaveError(status, "Safe test message");
      return version + 1;
    });
    sync.edit({text: "local"});
    assert.equal(await sync.flush(), false);
    assert.equal(sync.getSnapshot().dirty, true);
    assert.equal(drafts.some((event) => event.type === "clear"), false);
    fail = false;
    sync.edit({text: "revised"});
    await timer.advance(2500);
    if ([400, 413, 503].includes(status)) {
      assert.equal(calls, 2);
      assert.equal(sync.getSnapshot().status, "saved");
    } else {
      assert.equal(calls, 1);
      assert.equal(sync.getSnapshot().status, "blocked");
      assert.equal(await sync.flush(), false);
      assert.equal(await sync.retry(), true);
    }
    assert.deepEqual(versions, [4, 4]);
    sync.dispose();
  }
});

test("conflict retry never adopts the remote version or overwrites it implicitly", async () => {
  const versions = [];
  const {sync, timer} = harness(async (_data, version) => { versions.push(version); throw new JournalSaveError(409, "Outra aba salvou."); });
  sync.edit({text: "must survive"});
  await sync.flush();
  await timer.advance(300000);
  await sync.retry();
  assert.deepEqual(versions, [4, 4]);
  assert.equal(sync.getSnapshot().data.text, "must survive");
  assert.equal(sync.getSnapshot().dirty, true);
  assert.equal(sync.getSnapshot().version, 4);
});

test("explicit pause reports an in-flight write independently and resumes remaining changes", async () => {
  const waiting = deferred();
  let calls = 0;
  const {sync, timer} = harness(async (_data, version) => { calls += 1; return calls === 1 ? waiting.promise : version + 1; });
  sync.edit({text: "first"});
  await timer.advance(1000);
  sync.pause();
  assert.equal(sync.getSnapshot().status, "paused");
  assert.equal(sync.getSnapshot().saving, true);
  sync.edit({text: "second"});
  assert.equal(await sync.flush(), false);
  waiting.resolve(5);
  await settle();
  assert.equal(sync.getSnapshot().saving, false);
  assert.equal(sync.getSnapshot().status, "paused");
  await timer.advance(5000);
  assert.equal(calls, 1);
  sync.resume();
  await timer.advance(1000);
  assert.equal(calls, 2);
  assert.equal(sync.getSnapshot().status, "saved");
});

test("dispose prevents late callbacks and retains the unacknowledged local draft", async () => {
  const waiting = deferred();
  const {sync, timer, drafts, snapshots} = harness(() => waiting.promise);
  sync.edit({text: "preserved"});
  await timer.advance(1000);
  assert.throws(() => sync.reset({text: "remote"}, 9), /active save/);
  const before = snapshots.length;
  sync.dispose();
  waiting.resolve(5);
  await settle();
  assert.equal(snapshots.length, before);
  assert.equal(drafts.some((event) => event.type === "clear"), false);
  assert.equal(timer.size(), 0);
});

function memoryStorage() {
  const entries = new Map();
  return {
    get length() { return entries.size; },
    key(index) { return [...entries.keys()][index] ?? null; },
    getItem(key) { return entries.get(key) ?? null; },
    setItem(key, value) { entries.set(key, value); },
    removeItem(key) { entries.delete(key); },
  };
}
const isData = (value) => !!value && typeof value.text === "string";
const draft = (text, revision = 1, baseVersion = 4, updatedAt = 100) => ({type: "write", data: {text}, revision, baseVersion, updatedAt});

test("reload finds a schema-checked unsaved draft and classifies changed server versions conservatively", () => {
  const storage = memoryStorage();
  const before = createJournalDraftStore({storage, accountId: "user-a", editorId: "page-before", isData});
  assert.equal(before.write(draft("unsaved")), true);
  const after = createJournalDraftStore({storage, accountId: "user-a", editorId: "page-after", isData});
  const [record] = after.list();
  assert.equal(record.editorId, "page-before");
  assert.equal(record.schemaVersion, 1);
  assert.equal(classifyJournalDraft(record, {text: "saved"}, 4), "recoverable");
  assert.equal(classifyJournalDraft(record, {text: "new remote"}, 5), "conflict");
  assert.equal(classifyJournalDraft(record, {text: "older remote"}, 3), "conflict");
  assert.equal(classifyJournalDraft(record, {text: "unsaved"}, 9), "same");
  assert.equal(after.clearThrough(999), true);
  assert.equal(after.list().length, 1, "a fresh page cannot erase another page's recovery record");
});

test("draft storage isolates accounts and tabs, including acknowledgements of older revisions", () => {
  const storage = memoryStorage();
  const a1 = createJournalDraftStore({storage, accountId: "user-a", editorId: "page-1", isData});
  const a2 = createJournalDraftStore({storage, accountId: "user-a", editorId: "page-2", isData});
  const b1 = createJournalDraftStore({storage, accountId: "user-b", editorId: "page-1", isData});
  a1.write(draft("a1", 3));
  a2.write(draft("a2", 1));
  b1.write(draft("b1", 1));
  a1.clearThrough(2);
  assert.equal(a1.list().length, 2);
  a1.clearThrough(3);
  assert.deepEqual(a1.list().map((value) => value.data.text), ["a2"]);
  assert.deepEqual(b1.list().map((value) => value.data.text), ["b1"]);
  assert.equal(a2.available(), true);
});

test("storage errors are visible without throwing, exposing data, or deleting earlier drafts", () => {
  const storage = memoryStorage();
  const store = createJournalDraftStore({storage, accountId: "user-a", editorId: "page-1", isData});
  store.write(draft("last protected", 1));
  const write = storage.setItem;
  storage.setItem = () => { throw new Error("Quota exceeded"); };
  assert.equal(store.write(draft("newest", 2)), false);
  assert.equal(store.available(), false);
  storage.setItem = write;
  assert.equal(store.list()[0].data.text, "last protected");
  storage.getItem = () => { throw new Error("Storage denied"); };
  assert.deepEqual(store.list(), []);
  assert.equal(store.available(), false);
  assert.equal(store.clearThrough(99), false);
  assert.equal(storage.length, 1);
});

test("invalid and mismatched draft records are ignored without changing storage", () => {
  const storage = memoryStorage();
  const store = createJournalDraftStore({storage, accountId: "user-a", editorId: "page-1", isData});
  store.write(draft("valid"));
  const key = storage.key(0), record = JSON.parse(storage.getItem(key));
  storage.setItem(key + "-wrong", JSON.stringify(record));
  storage.setItem(key + "-broken", "not json");
  storage.setItem(key + "-schema", JSON.stringify({...record, schemaVersion: 2}));
  storage.setItem(key + "-unsafe", JSON.stringify({...record, data: {text: 42}}));
  assert.equal(store.list().length, 1);
  assert.equal(storage.length, 5);
});

test("explicit discard removes only the exact account and draft revision that was reviewed", () => {
  const storage = memoryStorage();
  const active = createJournalDraftStore({storage, accountId: "user-a", editorId: "active", isData});
  const recovery = createJournalDraftStore({storage, accountId: "user-a", editorId: "recovery", isData});
  const other = createJournalDraftStore({storage, accountId: "user-b", editorId: "active", isData});
  active.write(draft("old", 1));
  const reviewed = recovery.list()[0];
  active.write(draft("new", 2));
  assert.equal(recovery.discard(reviewed), false);
  assert.equal(active.list()[0].data.text, "new");
  other.write(draft("private b", 1));
  assert.equal(recovery.discard(other.list()[0]), false);
  assert.equal(other.list()[0].data.text, "private b");
  assert.equal(recovery.discard(recovery.list()[0]), true);
  assert.equal(active.list().length, 0);
  assert.equal(other.list().length, 1);
});

test("persisted drafts follow slow-save revisions and recover after an interrupted second save", async () => {
  const storage = memoryStorage();
  const store = createJournalDraftStore({storage, accountId: "owner", editorId: "old-page", isData});
  const first = deferred(), second = deferred();
  let calls = 0;
  const {sync, timer} = harness(() => ++calls === 1 ? first.promise : second.promise, {
    onDraft(event) { if (event.type === "write") store.write(event); else store.clearThrough(event.revision); },
  });
  sync.edit({text: "first"});
  await timer.advance(1000);
  sync.edit({text: "last unsent"});
  first.resolve(5);
  await settle();
  assert.equal(store.list()[0].baseVersion, 5);
  await timer.advance(1000);
  sync.dispose();
  const recovery = createJournalDraftStore({storage, accountId: "owner", editorId: "new-page", isData}).list()[0];
  assert.equal(recovery.data.text, "last unsent");
  assert.equal(classifyJournalDraft(recovery, {text: "first"}, 5), "recoverable");
  second.resolve(6);
  await settle();
  assert.equal(store.list().length, 1, "late disposed requests must not clear a recovery record");
});
