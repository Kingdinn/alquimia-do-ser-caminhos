import type {DesiredCalendarEvent, GoogleCalendarEvent} from "./google-calendar-mapping";

export type CalendarEventRecord = {id: string; hash: string | null; revision: number};
export type CalendarConnectionData = {
  connectionId: string; googleSubject: string; timeZone: string; legacyAnchor: string;
  calendarId: string | null; events: Record<string, CalendarEventRecord>;
  syncedVersion: number; lastSyncedAt: string | null; errorCode: string | null;
};
export type CalendarProviderEvent = {id: string; status?: string; extendedProperties?: {private?: Record<string, string>}};
export type CalendarProvider = {
  get(id: string): Promise<CalendarProviderEvent | null>;
  insert(event: GoogleCalendarEvent): Promise<"created" | "exists">;
  update(id: string, event: GoogleCalendarEvent): Promise<void>;
  remove(id: string): Promise<void>;
};
export type ReconcileOptions = {
  owner: string; data: CalendarConnectionData; desired: readonly DesiredCalendarEvent[]; version: number;
  provider: CalendarProvider;
  checkpoint: (data: CalendarConnectionData) => Promise<void>;
  eventId: (blockId: string, revision: number) => string;
  maxOperations?: number; shouldStop?: () => boolean; now?: () => Date;
};
function owns(event: CalendarProviderEvent, owner: string, connection: string, block: string): boolean {
  const metadata = event.extendedProperties?.private;
  return metadata?.alquimiaOwner === owner && metadata.alquimiaConnection === connection && metadata.alquimiaBlock === block;
}
/** Checkpoint each successful change. Retries inspect deterministic IDs after ambiguous insert failures. */
export async function reconcileCalendar(options: ReconcileOptions): Promise<{complete: boolean; operations: number; data: CalendarConnectionData}> {
  const {owner, desired, version, provider, checkpoint, eventId} = options;
  const data: CalendarConnectionData = structuredClone(options.data);
  const desiredIds = new Set(desired.map(item => item.blockId));
  let operations = 0;
  const stop = () => operations >= (options.maxOperations ?? 12) || options.shouldStop?.();
  const save = async () => {await checkpoint(structuredClone(data));};
  for (const [blockId, saved] of Object.entries(data.events)) {
    if (desiredIds.has(blockId)) continue;
    if (stop()) return {complete: false, operations, data};
    const existing = await provider.get(saved.id); operations++;
    if (existing && existing.status !== "cancelled") {
      if (!owns(existing, owner, data.connectionId, blockId)) throw new Error("event_ownership_conflict");
      await save(); // Renew/verify lease before any external mutation.
      await provider.remove(saved.id);
    }
    delete data.events[blockId]; await save();
  }
  for (const target of desired) {
    let saved = data.events[target.blockId];
    if (saved?.hash === target.hash) continue;
    if (stop()) return {complete: false, operations, data};
    if (!saved) {
      saved = {id: eventId(target.blockId, 0), hash: null, revision: 0};
      data.events[target.blockId] = saved; await save();
    }
    let existing = await provider.get(saved.id); operations++;
    if (existing?.status === "cancelled") {
      // Deleted Google IDs cannot safely be reused. Persist the next deterministic revision first.
      saved = {id: eventId(target.blockId, saved.revision + 1), hash: null, revision: saved.revision + 1};
      data.events[target.blockId] = saved; await save();
      return {complete: false, operations, data};
    }
    const event = {...target.event, id: saved.id};
    if (existing) {
      if (!owns(existing, owner, data.connectionId, target.blockId)) throw new Error("event_ownership_conflict");
      await save(); await provider.update(saved.id, event);
    } else {
      await save();
      const inserted = await provider.insert(event);
      if (inserted === "exists") {
        existing = await provider.get(saved.id);
        if (!existing || existing.status === "cancelled") {
          data.events[target.blockId] = {id: eventId(target.blockId, saved.revision + 1), hash: null, revision: saved.revision + 1};
          await save(); return {complete: false, operations, data};
        }
        if (!owns(existing, owner, data.connectionId, target.blockId)) throw new Error("event_ownership_conflict");
        await save(); await provider.update(saved.id, event);
      }
    }
    data.events[target.blockId] = {...saved, hash: target.hash}; await save();
  }
  data.syncedVersion = version; data.errorCode = null; data.lastSyncedAt = (options.now?.() ?? new Date()).toISOString();
  await save(); return {complete: true, operations, data};
}
