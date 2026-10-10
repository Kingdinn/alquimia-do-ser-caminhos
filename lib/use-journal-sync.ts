"use client";

import {useCallback, useEffect, useRef, useState} from "react";
import {emptyJournal, type Journal} from "@/app/content";
import {draftJournalSchema} from "@/app/validation";
import {
  createJournalSync, createJournalDraftStore, classifyJournalDraft, JournalSaveError,
  type JournalSyncSnapshot, type JournalSync, type JournalDraftRecord, type JournalDraftStore,
} from "./journal-sync";

function initialSnapshot(): JournalSyncSnapshot<Journal> {
  return {data: emptyJournal(), version: 0, revision: 0, dirty: false, saving: false, status: "saved", error: null, lastSavedAt: null};
}

export function useJournalSync({demo, ownerId, translateMessage = (text: string) => text}: {demo: boolean; ownerId?: string; translateMessage?: (text: string) => string}) {
  const translator = useRef(translateMessage);
  translator.current = translateMessage;
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [ready, setReady] = useState(demo);
  const [loadedOwner, setLoadedOwner] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(!demo);
  const [loadError, setLoadError] = useState("");
  const [storageWarning, setStorageWarning] = useState("");
  const [drafts, setDrafts] = useState<JournalDraftRecord<Journal>[]>([]);
  const controller = useRef<JournalSync<Journal> | null>(null);
  const activeOwner = useRef(ownerId);
  activeOwner.current = ownerId;
  const store = useRef<JournalDraftStore<Journal> | null>(null);
  const current = useRef(snapshot);
  const loadCurrent = useRef<() => Promise<void>>(async () => {});
  const suppressDraftClear = useRef(false);
  const recovered = useRef<JournalDraftRecord<Journal> | null>(null);
  const editorId = useRef("");

  const request = useCallback((url: string, options: RequestInit = {}) => {
    const headers = new Headers(options.headers);
    if (ownerId) headers.set("X-Journal-Owner", ownerId);
    return fetch(url, {...options, headers, cache: "no-store"});
  }, [ownerId]);

  useEffect(() => {
    if (demo) return;
    setReady(false);
    recovered.current = null;
    setDrafts([]);
    let alive = true;
    let fetching = false;
    editorId.current = crypto.randomUUID();
    const warnStorage = () => {
      if (alive) setStorageWarning("Este navegador não conseguiu guardar o rascunho neste aparelho. Aguarde a confirmação de salvamento antes de fechar a página.");
    };
    try {
      if (!ownerId) throw new Error("missing_owner");
      store.current = createJournalDraftStore<Journal>({
        storage: window.localStorage, accountId: ownerId, editorId: editorId.current,
        isData: (value): value is Journal => draftJournalSchema.safeParse(value).success,
      });
    } catch { store.current = null; warnStorage(); }

    function refreshDrafts(data: Journal, version: number) {
      if (!alive || !store.current) return;
      setDrafts(store.current.list().filter(record => record.editorId !== editorId.current && classifyJournalDraft(record, data, version) !== "same"));
      if (!store.current.available()) warnStorage();
    }

    const sync = createJournalSync<Journal>({
      data: emptyJournal(), version: 0, debounceMs: 1000, maxRetries: 3,
      save: async (data, version) => {
        if (!navigator.onLine) throw new TypeError("offline");
        const response = await request("/api/journal", {
          method: "PUT", headers: {"Content-Type": "application/json"}, body: JSON.stringify({data, version}),
        });
        const body = await response.json();
        if (!response.ok) throw new JournalSaveError(response.status, body.error || "Não foi possível salvar agora.");
        return body.version;
      },
      onChange: next => {
        if (!alive) return;
        current.current = next;
        setSnapshot(next);
        if (!next.dirty && next.status === "saved" && recovered.current) {
          store.current?.discard(recovered.current);
          recovered.current = null;
          refreshDrafts(next.data, next.version);
        }
      },
      onDraft: event => {
        if (!alive) return;
        if (event.type === "clear" && suppressDraftClear.current) return;
        const ok = event.type === "write" ? store.current?.write(event) : store.current?.clearThrough(event.revision);
        if (!ok) warnStorage();
      },
    });
    controller.current = sync;

    async function load() {
      if (!alive || fetching || sync.getSnapshot().saving) return;
      fetching = true;
      setLoading(true);
      setLoadError("");
      try {
        if (!ownerId) throw new Error("Entre novamente para abrir seu caderno.");
        const response = await request("/api/journal");
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Não foi possível abrir seu caderno.");
        if (body.ownerId !== ownerId) throw new Error("A conta mudou. Entre novamente na conta deste caderno.");
        if (!alive) return;
        const data: Journal = body.data ?? emptyJournal();
        sync.reset(data, body.version);
        refreshDrafts(data, body.version);
        setReady(true);
        setLoadedOwner(ownerId);
      } catch (error) {
        if (alive) setLoadError(error instanceof Error ? error.message : "Não foi possível abrir seu caderno. Tente novamente.");
      } finally { fetching = false; if (alive) setLoading(false); }
    }
    loadCurrent.current = load;
    void load();

    const online = () => {
      const state = sync.getSnapshot();
      if (!state.dirty) return;
      if (!state.error?.status || state.error.status >= 500) void sync.retry();
    };
    const leaving = () => { if (document.visibilityState === "hidden") void sync.flush(); };
    const storageChanged = () => { const state = sync.getSnapshot(); refreshDrafts(state.data, state.version); };
    window.addEventListener("online", online);
    document.addEventListener("visibilitychange", leaving);
    window.addEventListener("storage", storageChanged);
    return () => {
      alive = false;
      sync.dispose();
      window.removeEventListener("online", online);
      document.removeEventListener("visibilitychange", leaving);
      window.removeEventListener("storage", storageChanged);
      if (controller.current === sync) controller.current = null;
    };
  }, [demo, ownerId, request]);

  function change(update: Partial<Journal> | ((journal: Journal) => Partial<Journal>)) {
    if (!demo && (!ready || loadedOwner !== ownerId || activeOwner.current !== ownerId)) return;
    const previous = controller.current?.getSnapshot() ?? current.current;
    const data = {...previous.data, ...(typeof update === "function" ? update(previous.data) : update)};
    if (demo) {
      const next = {...previous, data, dirty: true, revision: previous.revision + 1, status: "pending" as const};
      current.current = next; setSnapshot(next);
    } else controller.current?.edit(data);
  }

  async function save() {
    if (demo || !ready || loadedOwner !== ownerId || activeOwner.current !== ownerId) return false;
    return (await controller.current?.flush()) ?? false;
  }

  async function chooseVersion(keepLocal: boolean, draft?: JournalDraftRecord<Journal>) {
    const sync = controller.current;
    if (!sync || sync.getSnapshot().saving) return;
    sync.pause();
    setLoading(true);
    setLoadError("");
    try {
      const response = await request("/api/journal");
      const body = await response.json();
      if (controller.current !== sync || activeOwner.current !== ownerId) return;
      if (!response.ok || body.ownerId !== ownerId) throw new Error(body.error || "Entre novamente na conta deste caderno.");
      const remote: Journal = body.data ?? emptyJournal();
      const differs = draft ? classifyJournalDraft(draft, remote, body.version) === "conflict" : keepLocal && body.version !== sync.getSnapshot().version;
      if (differs && !window.confirm(translator.current("A conta tem uma versão mais recente. Substituir essa versão pelo rascunho escolhido?"))) return;
      if (!keepLocal && sync.getSnapshot().dirty && !window.confirm(translator.current("Descartar as alterações desta aba e abrir a versão salva na conta?"))) return;
      if (draft && sync.getSnapshot().dirty && !window.confirm(translator.current("Trocar as alterações desta aba pelo rascunho escolhido?"))) return;
      const local = draft?.data ?? sync.getSnapshot().data;
      suppressDraftClear.current = keepLocal;
      sync.reset(remote, body.version);
      suppressDraftClear.current = false;
      if (keepLocal) {
        recovered.current = draft ?? null;
        sync.edit(local);
      }
      setReady(true);
      setLoadedOwner(ownerId);
    } catch (error) {
      if (controller.current === sync && activeOwner.current === ownerId) setLoadError(error instanceof Error ? error.message : "Não foi possível comparar as versões. Seu rascunho foi mantido.");
    } finally {
      if (controller.current === sync && activeOwner.current === ownerId) {
        suppressDraftClear.current = false; sync.resume(); setLoading(false);
      }
    }
  }

  function discardDraft(draft: JournalDraftRecord<Journal>) {
    if (!window.confirm(translator.current("Descartar este rascunho guardado neste aparelho? O caderno salvo na conta continua igual."))) return;
    store.current?.discard(draft);
    setDrafts(store.current?.list().filter(record => record.editorId !== editorId.current && classifyJournalDraft(record, current.current.data, current.current.version) !== "same") ?? []);
  }

  let status = demo ? (snapshot.dirty ? "Alterações apenas nesta demonstração" : "Demonstração pronta para explorar") : "Salvamento automático ativo";
  if (!demo) {
    if (!ready) status = loadError || "Abrindo seu caderno…";
    else if (snapshot.status === "saving") status = "Salvando na sua conta…";
    else if (snapshot.status === "pending") status = "Alterações recebidas. Salvando automaticamente…";
    else if (snapshot.status === "retrying") status = "Não foi possível sincronizar agora. Tentando novamente…";
    else if (snapshot.status === "blocked") {
      if (snapshot.error?.status === 409) status = "Outra versão foi salva. Escolha como continuar; suas alterações foram mantidas nesta aba.";
      else if (snapshot.error?.status === 401 || snapshot.error?.status === 403) status = "Entre novamente na conta deste caderno para continuar o salvamento.";
      else status = snapshot.error?.message || "O salvamento está pausado. Tente novamente.";
    } else if (snapshot.status === "paused") status = "Comparando as versões do caderno…";
    else if (snapshot.lastSavedAt) status = "Tudo salvo na sua conta";
  }
  return {
    journal: demo || loadedOwner === ownerId ? snapshot.data : emptyJournal(), dirty: snapshot.dirty, saving: snapshot.saving, ready: demo || (ready && loadedOwner === ownerId), loading, status,
    savedVersion: snapshot.version, error: snapshot.error, loadError, storageWarning, drafts, change, save, request,
    load: () => loadCurrent.current(), retry: () => controller.current?.retry(),
    recoverDraft: (draft: JournalDraftRecord<Journal>) => chooseVersion(true, draft), discardDraft,
    useSaved: () => chooseVersion(false), keepMine: () => chooseVersion(true),
    currentJournal: () => controller.current?.getSnapshot().data ?? current.current.data,
  };
}
