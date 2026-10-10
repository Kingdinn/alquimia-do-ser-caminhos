import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {reconcileCalendar} from "../lib/google-calendar-sync.ts";
import {mapCalendarBlocks, googleEventId} from "../lib/google-calendar-mapping.ts";
const block = (change = {}) => ({id: randomUUID(), day: "Quarta", time: "09:00", duration: "60", activity: "Prática", ...change});
const state = () => ({connectionId: "conn", googleSubject: "google-A", timeZone: "UTC", legacyAnchor: "2026-09-30", calendarId: "calendar-A", events: {}, syncedVersion: -1, lastSyncedAt: null, errorCode: null});
function fixture() {
  let saved = state(), version = 1, items = [], fenced = false, failAfterInsert = false;
  const remote = new Map(), operations = [];
  const provider = {
    async get(id) {operations.push(["get", id]); return structuredClone(remote.get(id) ?? null);},
    async insert(event) {operations.push(["insert", event.id]); if (remote.has(event.id)) return "exists"; remote.set(event.id, structuredClone(event)); if (failAfterInsert) {failAfterInsert = false; throw new Error("network_lost_after_remote_commit");} return "created";},
    async update(id, event) {operations.push(["update", id]); remote.set(id, {...remote.get(id), ...structuredClone(event)});},
    async remove(id) {operations.push(["delete", id]); remote.set(id, {...remote.get(id), status: "cancelled"});},
  };
  const sync = (extra = {}) => reconcileCalendar({owner: "owner", data: saved, desired: mapCalendarBlocks(items, "owner", "conn", "UTC", "2026-09-30"), version, provider, checkpoint: async next => {if (fenced) throw new Error("lease_lost"); saved = structuredClone(next);}, eventId: (id, revision) => googleEventId("owner", "conn", id, revision), ...extra});
  return {sync, remote, operations, get saved() {return saved;}, set blocks(value) {items = value; version++;}, fence() {fenced = true;}, failAfterInsert() {failAfterInsert = true;}};
}

test("create/update/delete converge to the latest saved schedule without changing unrelated Google events", async () => {
  const f = fixture(), item = block(); f.blocks = [item];
  f.remote.set("unrelated", {id: "unrelated", summary: "Personal Google event"});
  let result = await f.sync(); assert.equal(result.complete, true);
  const id = f.saved.events[item.id].id;
  assert.equal(f.remote.get(id).summary, "Prática");
  f.blocks = [{...item, activity: "Piano", date: "2026-09-30"}];
  result = await f.sync(); assert.equal(result.complete, true);
  assert.equal(f.saved.events[item.id].id, id); assert.equal(f.remote.get(id).summary, "Piano");
  const opCount = f.operations.length; await f.sync(); assert.equal(f.operations.length, opCount, "unchanged saves avoid redundant API writes");
  f.blocks = []; await f.sync();
  assert.equal(f.remote.get(id).status, "cancelled"); assert.equal(f.saved.events[item.id], undefined);
  assert.equal(f.remote.get("unrelated").summary, "Personal Google event");
});

test("bounded batches checkpoint partial work and continue after app reopening", async () => {
  const f = fixture(); f.blocks = [block(), block(), block()];
  assert.equal((await f.sync({maxOperations: 1})).complete, false);
  assert.equal(f.saved.syncedVersion, -1);
  assert.equal(Object.values(f.saved.events).filter(entry => entry.hash).length, 1);
  assert.equal((await f.sync({maxOperations: 1})).complete, false);
  assert.equal((await f.sync({maxOperations: 1})).complete, true);
  assert.equal(f.saved.syncedVersion, 2);
  assert.equal([...f.remote.values()].filter(event => event.status !== "cancelled").length, 3);
});

test("lost HTTP acknowledgement after Google creation retries the same deterministic ID", async () => {
  const f = fixture(), item = block(); f.blocks = [item]; f.failAfterInsert();
  await assert.rejects(f.sync(), /network_lost/);
  assert.equal(f.remote.size, 1); assert.equal(f.saved.events[item.id].hash, null);
  assert.equal((await f.sync()).complete, true);
  assert.equal(f.remote.size, 1); assert.equal(f.operations.filter(([op]) => op === "insert").length, 1);
});

test("deleted Google tombstones receive a persisted revised ID, including remove/readd of the same app ID", async () => {
  const f = fixture(), item = block(); f.blocks = [item]; await f.sync(); const old = f.saved.events[item.id].id;
  f.blocks = []; await f.sync(); f.blocks = [item];
  assert.equal((await f.sync()).complete, false);
  assert.notEqual(f.saved.events[item.id].id, old);
  assert.equal((await f.sync()).complete, true);
  assert.equal([...f.remote.values()].filter(event => event.status !== "cancelled").length, 1);
});

test("another account's event cannot be changed or deleted even if a corrupted mapping points at it", async () => {
  const f = fixture(), item = block(); f.blocks = [item];
  const id = googleEventId("owner", "conn", item.id);
  f.remote.set(id, {id, summary: "Other account", extendedProperties: {private: {alquimiaOwner: "someone-else", alquimiaConnection: "conn", alquimiaBlock: item.id}}});
  await assert.rejects(f.sync(), /event_ownership_conflict/);
  assert.equal(f.remote.get(id).summary, "Other account");
  f.blocks = [];
  await assert.rejects(f.sync(), /event_ownership_conflict/);
  assert.equal(f.operations.some(([op]) => op === "delete" || op === "update"), false);
});

test("lost lease aborts before any Google mutation and never reports a completed version", async () => {
  const f = fixture(); f.blocks = [block()]; f.fence();
  await assert.rejects(f.sync(), /lease_lost/);
  assert.equal(f.remote.size, 0); assert.equal(f.saved.syncedVersion, -1);
});

test("a newer notebook version arriving mid-batch is reconciled next instead of marking it already synced", async () => {
  const f = fixture(), item = block(); f.blocks = [item];
  await f.sync({version: 2}); assert.equal(f.saved.syncedVersion, 2);
  f.blocks = [{...item, activity: "More recent saved activity"}];
  await f.sync(); assert.equal(f.saved.syncedVersion, 3);
  assert.equal([...f.remote.values()][0].summary, "More recent saved activity");
});
