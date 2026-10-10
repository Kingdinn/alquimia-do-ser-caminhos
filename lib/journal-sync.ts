/** Immutable journal values in, serialized saves out. No authentication or browser globals. */
export class JournalSaveError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "JournalSaveError";
    this.status = status;
  }
}

export type JournalSyncStatus = "saved" | "pending" | "saving" | "retrying" | "blocked" | "paused";
export type JournalSyncError = {status?: number; message: string};
export type JournalDraftEvent<T> =
  | {type: "write"; data: T; baseVersion: number; revision: number; updatedAt: number}
  | {type: "clear"; revision: number};
export type JournalSyncSnapshot<T> = {
  data: T;
  version: number;
  revision: number;
  dirty: boolean;
  saving: boolean;
  status: JournalSyncStatus;
  error: JournalSyncError | null;
  lastSavedAt: number | null;
};
export type JournalSyncOptions<T> = {
  data: T;
  version: number;
  save: (data: T, version: number) => Promise<number>;
  onChange?: (snapshot: JournalSyncSnapshot<T>) => void;
  onDraft?: (event: JournalDraftEvent<T>) => void;
  debounceMs?: number;
  maxRetries?: number;
  retryBaseMs?: number;
  now?: () => number;
  setTimer?: (callback: () => void, delay: number) => unknown;
  clearTimer?: (timer: unknown) => void;
};

export function createJournalSync<T>(options: JournalSyncOptions<T>) {
  const now = options.now ?? Date.now;
  const setTimer = options.setTimer ?? ((callback, delay) => setTimeout(callback, delay));
  const clearTimer = options.clearTimer ?? ((timer) => clearTimeout(timer as ReturnType<typeof setTimeout>));
  const debounceMs = options.debounceMs ?? 1000;
  const maxRetries = options.maxRetries ?? 3;
  const retryBaseMs = options.retryBaseMs ?? 2000;
  let data = options.data;
  let version = options.version;
  let revision = 0;
  let savedRevision = 0;
  let status: JournalSyncStatus = "saved";
  let error: JournalSyncError | null = null;
  let lastSavedAt: number | null = null;
  let paused = false;
  let disposed = false;
  let retries = 0;
  let timer: unknown = null;
  let inFlight: Promise<boolean> | null = null;

  function getSnapshot(): JournalSyncSnapshot<T> {
    return {data, version, revision, dirty: revision !== savedRevision, saving: inFlight !== null, status, error, lastSavedAt};
  }
  function notify() { if (!disposed) options.onChange?.(getSnapshot()); }
  function cancelTimer() {
    if (timer !== null) { clearTimer(timer); timer = null; }
  }
  function writeDraft() {
    if (!disposed) options.onDraft?.({type: "write", data, baseVersion: version, revision, updatedAt: now()});
  }
  function schedule(delay: number) {
    cancelTimer();
    if (disposed || paused || status === "blocked" || revision === savedRevision || inFlight) return;
    timer = setTimer(() => { timer = null; void run(); }, delay);
  }
  function normalizeError(value: unknown): JournalSyncError {
    if (value instanceof JournalSaveError) return {status: value.status, message: value.message};
    // Network implementations can throw messages containing URLs or transport details.
    return {message: "Não foi possível salvar agora. Suas alterações continuam neste caderno."};
  }
  function isRetryable(problem: JournalSyncError) {
    return problem.status === undefined || problem.status >= 500;
  }

  function run(): Promise<boolean> {
    if (inFlight) return inFlight;
    if (disposed || paused || status === "blocked") return Promise.resolve(false);
    if (revision === savedRevision) return Promise.resolve(true);
    cancelTimer();
    const sentData = data;
    const sentRevision = revision;
    const sentVersion = version;
    status = "saving";
    error = null;
    // Defer the adapter until inFlight is assigned, including adapters that throw synchronously.
    inFlight = Promise.resolve().then(() => options.save(sentData, sentVersion)).then((nextVersion) => {
      if (disposed) return false;
      if (!Number.isSafeInteger(nextVersion) || nextVersion <= sentVersion) {
        throw new JournalSaveError(502, "Não foi possível confirmar o salvamento. Tente novamente.");
      }
      version = nextVersion;
      savedRevision = sentRevision;
      lastSavedAt = now();
      retries = 0;
      error = null;
      if (revision === sentRevision) {
        options.onDraft?.({type: "clear", revision: sentRevision});
        status = paused ? "paused" : "saved";
      } else {
        // This is a new draft based on the acknowledged version, not the old request.
        writeDraft();
        status = paused ? "paused" : "pending";
      }
      return true;
    }).catch((failure: unknown) => {
      if (disposed) return false;
      error = normalizeError(failure);
      if (isRetryable(error) && retries < maxRetries) {
        retries += 1;
        status = paused ? "paused" : "retrying";
      } else status = "blocked";
      return false;
    }).finally(() => {
      inFlight = null;
      if (disposed) return;
      notify();
      if (status === "retrying") schedule(Math.min(retryBaseMs * 2 ** (retries - 1), 30_000));
      else if (status === "pending") schedule(debounceMs);
    });
    notify();
    return inFlight;
  }

  function edit(nextData: T) {
    if (disposed || Object.is(nextData, data)) return;
    data = nextData;
    revision += 1;
    writeDraft();
    // Validation failures can be fixed by editing. Authentication and conflicts require an explicit action.
    if (status === "blocked" && (error?.status === 400 || error?.status === 413)) {
      error = null;
      retries = 0;
      status = paused ? "paused" : "pending";
    } else if (!inFlight && status !== "blocked" && status !== "retrying") {
      status = paused ? "paused" : "pending";
    }
    notify();
    // Editing during a backoff must not reset its delay or create an unbounded retry loop.
    if (status === "pending") schedule(debounceMs);
  }

  async function flush(): Promise<boolean> {
    if (disposed || paused || status === "blocked") return false;
    cancelTimer();
    // Wait for every edit that arrives during a write. true always means the latest revision was saved.
    while (!disposed && !paused && getSnapshot().status !== "blocked" && revision !== savedRevision) {
      const successful = await (inFlight ?? run());
      cancelTimer();
      if (!successful) {
        if (status === "retrying") schedule(Math.min(retryBaseMs * 2 ** (retries - 1), 30_000));
        return false;
      }
    }
    return !disposed && revision === savedRevision;
  }

  async function retry(): Promise<boolean> {
    if (disposed || paused) return false;
    retries = 0;
    error = null;
    if (!inFlight) status = revision === savedRevision ? "saved" : "pending";
    notify();
    return flush();
  }

  function reset(nextData: T, nextVersion: number) {
    if (disposed) return;
    if (inFlight) throw new Error("Wait for the active save before resetting the journal.");
    cancelTimer();
    data = nextData;
    version = nextVersion;
    revision += 1;
    savedRevision = revision;
    retries = 0;
    error = null;
    status = paused ? "paused" : "saved";
    options.onDraft?.({type: "clear", revision});
    notify();
  }

  function pause() {
    if (disposed) return;
    paused = true;
    cancelTimer();
    if (status !== "blocked") status = "paused";
    notify();
  }
  function resume() {
    if (disposed || !paused) return;
    paused = false;
    if (status !== "blocked") status = inFlight ? "saving" : revision === savedRevision ? "saved" : "pending";
    notify();
    if (status === "pending") schedule(debounceMs);
  }
  function dispose() { disposed = true; cancelTimer(); }

  return {edit, flush, retry, reset, pause, resume, dispose, getSnapshot};
}

export type JournalSync<T> = ReturnType<typeof createJournalSync<T>>;

export type JournalDraftRecord<T> = {
  schemaVersion: 1;
  accountId: string;
  editorId: string;
  baseVersion: number;
  revision: number;
  updatedAt: number;
  data: T;
};
export type JournalDraftStorage = Pick<Storage, "length" | "key" | "getItem" | "setItem" | "removeItem">;

/** Each page instance owns exactly one key. Reading old drafts never adopts or deletes them. */
export function createJournalDraftStore<T>({storage, accountId, editorId, isData}: {
  storage: JournalDraftStorage;
  accountId: string;
  editorId: string;
  isData: (data: unknown) => data is T;
}) {
  const prefix = `alquimia:draft:v1:${encodeURIComponent(accountId)}:`;
  const ownKey = prefix + encodeURIComponent(editorId);
  let storageAvailable = true;
  function parse(raw: string | null): JournalDraftRecord<T> | null {
    if (!raw) return null;
    try {
      const record = JSON.parse(raw) as JournalDraftRecord<T>;
      if (record.schemaVersion !== 1 || record.accountId !== accountId || typeof record.editorId !== "string"
          || !Number.isSafeInteger(record.baseVersion) || record.baseVersion < 0
          || !Number.isSafeInteger(record.revision) || record.revision < 0
          || !Number.isFinite(record.updatedAt) || record.updatedAt < 0 || !isData(record.data)) return null;
      return record;
    } catch { return null; }
  }
  function write(event: Extract<JournalDraftEvent<T>, {type: "write"}>): boolean {
    try {
      const record: JournalDraftRecord<T> = {schemaVersion: 1, accountId, editorId, data: event.data, baseVersion: event.baseVersion, revision: event.revision, updatedAt: event.updatedAt};
      storage.setItem(ownKey, JSON.stringify(record));
      storageAvailable = true;
      return true;
    } catch { storageAvailable = false; return false; }
  }
  function list(): JournalDraftRecord<T>[] {
    try {
      const records: JournalDraftRecord<T>[] = [];
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (!key?.startsWith(prefix)) continue;
        const record = parse(storage.getItem(key));
        if (record && key === prefix + encodeURIComponent(record.editorId)) records.push(record);
      }
      storageAvailable = true;
      return records.sort((a, b) => b.updatedAt - a.updatedAt);
    } catch { storageAvailable = false; return []; }
  }
  function clearThrough(revision: number): boolean {
    try {
      const record = parse(storage.getItem(ownKey));
      if (record && record.editorId === editorId && record.revision <= revision) storage.removeItem(ownKey);
      storageAvailable = true;
      return true;
    } catch { storageAvailable = false; return false; }
  }
  /** Only for an explicit recovery/discard decision; never prune other editors automatically. */
  function discard(record: JournalDraftRecord<T>): boolean {
    if (record.accountId !== accountId || record.schemaVersion !== 1 || typeof record.editorId !== "string") return false;
    try {
      const key = prefix + encodeURIComponent(record.editorId);
      const raw = storage.getItem(key);
      // Re-read immediately before removal: a newer revision in another tab must survive.
      if (!raw || !parse(raw) || raw !== JSON.stringify(record)) {
        storageAvailable = true;
        return false;
      }
      storage.removeItem(key);
      storageAvailable = true;
      return true;
    } catch { storageAvailable = false; return false; }
  }
  return {write, list, clearThrough, discard, available: () => storageAvailable};
}

export type JournalDraftStore<T> = ReturnType<typeof createJournalDraftStore<T>>;

/** A changed server version always requires comparison, even when the local timestamp is newer. */
export function classifyJournalDraft<T>(draft: JournalDraftRecord<T>, serverData: T, serverVersion: number): "same" | "recoverable" | "conflict" {
  if (JSON.stringify(draft.data) === JSON.stringify(serverData)) return "same";
  return draft.baseVersion === serverVersion ? "recoverable" : "conflict";
}
