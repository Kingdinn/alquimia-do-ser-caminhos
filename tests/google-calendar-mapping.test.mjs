import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {mapCalendarBlocks, zonedInstant, googleEventId, dateInTimeZone} from "../lib/google-calendar-mapping.ts";
const block = (change = {}) => ({id: randomUUID(), day: "Quarta", time: "09:00", duration: "60", activity: "Praticar violão", ...change});
const map = (blocks, zone = "America/Sao_Paulo", anchor = "2026-09-30") => mapCalendarBlocks(blocks, "owner-A", "connection-A", zone, anchor);

test("single events preserve local time, overnight and fractional elapsed durations", () => {
  const records = [block({date: "2026-09-30", time: "23:30", duration: "120"}), block({date: "2026-09-30", duration: "0.5"})];
  const original = structuredClone(records), result = map(records);
  assert.equal(result[0].event.start.dateTime, "2026-10-01T02:30:00.000Z");
  assert.equal(result[0].event.end.dateTime, "2026-10-01T04:30:00.000Z");
  assert.equal(result[0].event.recurrence, undefined);
  assert.equal(Date.parse(result[1].event.end.dateTime)-Date.parse(result[1].event.start.dateTime), 30000);
  assert.deepEqual(records, original);
});

test("weekly projection uses first matching day and inclusive end while legacy uses stable connection anchor", () => {
  const records = [block({day: "Segunda", startsOn: "2026-09-30", endsOn: "2026-10-12"}), block()];
  const result = map(records);
  assert.equal(result[0].event.start.dateTime, "2026-10-05T12:00:00.000Z");
  assert.deepEqual(result[0].event.recurrence, ["RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20261012T120000Z"]);
  assert.equal(result[1].event.start.dateTime, "2026-09-30T12:00:00.000Z");
  assert.deepEqual(result[1].event.recurrence, ["RRULE:FREQ=WEEKLY;BYDAY=WE"]);
  assert.deepEqual(map([block({endsOn: "2026-09-23"})]), []);
  assert.deepEqual(map(records), result);
});

test("DST timezone mapping is explicit, handles folds, and refuses nonexistent local start times", () => {
  assert.equal(zonedInstant("2026-03-08", "01:30", "America/New_York").toISOString(), "2026-03-08T06:30:00.000Z");
  assert.throws(() => zonedInstant("2026-03-08", "02:30", "America/New_York"), /invalid_schedule_timezone/);
  assert.equal(zonedInstant("2026-11-01", "01:30", "America/New_York").toISOString(), "2026-11-01T05:30:00.000Z");
  const event = map([block({day: "Domingo", startsOn: "2026-03-01", endsOn: "2026-03-15"})], "America/New_York")[0].event;
  assert.equal(event.start.dateTime, "2026-03-01T14:00:00.000Z");
  assert.deepEqual(event.recurrence, ["RRULE:FREQ=WEEKLY;BYDAY=SU;UNTIL=20260315T130000Z"]);
  assert.equal(dateInTimeZone(new Date("2026-10-01T01:00:00Z"), "America/Sao_Paulo"), "2026-09-30");
});

test("mapping fails atomically for invalid saved schedules instead of deleting remote records", () => {
  for (const change of [{date: "2026-02-30"}, {date: "2026-10-01"}, {time: "24:00"}, {duration: "NaN"}, {duration: "0"}, {duration: "1441"}, {day: "bad"}, {date: "2026-09-30", startsOn: "2026-09-30"}]) assert.throws(() => map([block(), block(change)]));
  const item = block(); assert.throws(() => map([item, item]));
});

test("event identity is stable, isolated by owner/connection/revision, and never includes unrelated notebook data", () => {
  const item = block({goalId: randomUUID(), healthNote: "not exported"});
  const first = map([item])[0], second = map([{...item, activity: "Piano"}])[0];
  assert.equal(first.event.id, second.event.id); assert.notEqual(first.hash, second.hash);
  assert.match(first.event.id, /^[0-9a-v]{5,1024}$/);
  assert.notEqual(googleEventId("A", "conn", item.id), googleEventId("B", "conn", item.id));
  assert.notEqual(googleEventId("A", "conn", item.id), googleEventId("A", "conn2", item.id));
  assert.notEqual(googleEventId("A", "conn", item.id), googleEventId("A", "conn", item.id, 1));
  assert.equal(JSON.stringify(first).includes("not exported"), false);
  assert.equal(JSON.stringify(first).includes(item.goalId), false);
});
