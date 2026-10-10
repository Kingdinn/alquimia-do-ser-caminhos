import assert from "node:assert/strict";
import {after, test} from "node:test";
import {mkdtemp, readFile, readdir, rm, writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import ts from "typescript";
import React from "react";
import {act, create} from "react-test-renderer";
import {randomUUID} from "node:crypto";
import {isLocale, LANGUAGE_STORAGE_KEY, translate} from "../lib/translate.ts";

// Run the production provider and persistence hook, changing only module paths for Node.
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const compiled = await mkdtemp(path.join(appRoot, ".i18n-tests-"));
after(() => rm(compiled, {recursive: true, force: true}));
const translationFiles = (await readdir(path.join(appRoot, "lib"))).filter(name => /^i18n.*\.tsx?$/.test(name));
const sources = ["app/content.ts", "app/validation.ts", "lib/journal-sync.ts", "lib/use-journal-sync.ts", "lib/translate.ts", ...translationFiles.map(name => `lib/${name}`)];
const moduleNames = new Set(sources.map(source => path.basename(source).replace(/\.tsx?$/, "")));
for (const source of sources) {
  const destination = path.basename(source).replace(/\.tsx?$/, ".mjs");
  const input = (await readFile(path.join(appRoot, source), "utf8")).replace(/from (["'])([^"']+)\1/g, (match, quote, specifier) => {
    const name = specifier.startsWith("@/app/") ? specifier.slice(6) : specifier.startsWith("./") ? specifier.slice(2) : "";
    return moduleNames.has(name) ? `from "./${name}.mjs"` : match;
  });
  await writeFile(path.join(compiled, destination), ts.transpileModule(input, {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX}}).outputText);
}
const load = name => import(pathToFileURL(path.join(compiled, `${name}.mjs`)).href);
const {I18nProvider, useI18n} = await load("i18n");
const {useJournalSync} = await load("use-journal-sync");
const {emptyJournal, steps} = await load("content");
const {saveSchema} = await load("validation");
const catalog = {};
for (const file of translationFiles.filter(name => name.startsWith("i18n-"))) {
  const exports = await load(file.replace(/\.tsx?$/, ""));
  for (const [name, value] of Object.entries(exports)) if (name.endsWith("Translations")) Object.assign(catalog, value);
}

test("supported locales and interpolation preserve values without recursive translation", () => {
  for (const locale of ["pt-BR", "es-MX", "en-US"]) assert.equal(isLocale(locale), true);
  for (const locale of ["en", "es-ES", "pt", "", null, 42]) assert.equal(isLocale(locale), false);
  assert.equal(translate(catalog, "en-US", "Idioma"), "Language");
  assert.equal(translate(catalog, "es-MX", "Minha meta"), "Mi meta");
  assert.equal(translate(catalog, "pt-BR", "Progresso: {title}", {title: "Minha meta {count}"}), "Progresso: Minha meta {count}");
  assert.equal(translate(catalog, "en-US", "Progresso: {title}", {title: "Minha meta {count}"}), "Progress: Minha meta {count}");
  assert.equal(translate(catalog, "es-MX", "Texto pessoal sem tradução"), "Texto pessoal sem tradução");
});

test("all catalog translations preserve named placeholders", () => {
  const placeholders = text => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
  for (const [key, translations] of Object.entries(catalog)) {
    for (const language of ["es", "en"]) {
      assert.equal(typeof translations[language], "string", `${language}: ${key}`);
      assert.ok(translations[language].trim(), `Empty ${language}: ${key}`);
      assert.deepEqual(placeholders(translations[language]), placeholders(key), `${language}: ${key}`);
    }
  }
});

async function sourceFiles(directory) {
  const entries = await readdir(directory, {withFileTypes: true});
  const children = await Promise.all(entries.filter(entry => entry.name !== "ui").map(entry => entry.isDirectory() ? sourceFiles(path.join(directory, entry.name)) : entry.name.endsWith(".tsx") ? [path.join(directory, entry.name)] : []));
  return children.flat();
}
test("static translation keys rendered by app components exist in both language catalogs", async () => {
  const files = [...await sourceFiles(path.join(appRoot, "app")), ...await sourceFiles(path.join(appRoot, "components"))];
  const missing = new Set();
  for (const step of steps) for (const key of Object.values(step)) if (!catalog[key]) missing.add(`app/content.ts: ${key}`);
  function staticKeys(node) {
    if (!node) return [];
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text];
    if (ts.isConditionalExpression(node)) return [...staticKeys(node.whenTrue), ...staticKeys(node.whenFalse)];
    return [];
  }
  for (const file of files) {
    const source = ts.createSourceFile(file, await readFile(file, "utf8"), ts.ScriptTarget.Latest, true);
    function walk(node) {
      if (ts.isCallExpression(node) && node.expression.getText(source) === "t") {
        for (const key of staticKeys(node.arguments[0])) if (key && !catalog[key]) missing.add(`${path.relative(appRoot, file)}: ${key}`);
      }
      ts.forEachChild(node, walk);
    }
    walk(source);
  }
  assert.deepEqual([...missing].sort(), [], "Static UI keys need Spanish and English entries");
});

const microtasks = async () => {for (let index = 0; index < 20; index++) await Promise.resolve();};
test("changing language preserves mounted editor state, pending drafts, account ownership and autosave", async () => {
  const originals = new Map();
  function replace(name, value) {originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name)); Object.defineProperty(globalThis, name, {configurable: true, writable: true, value});}
  const storage = new Map();
  const windows = new EventTarget();
  windows.localStorage = {get length(){return storage.size;}, key(index){return [...storage.keys()][index] ?? null;}, getItem:key => storage.get(key) ?? null, setItem:(key,value) => storage.set(key,String(value)), removeItem:key => storage.delete(key)};
  const confirmations = [];
  windows.confirm = message => {confirmations.push(message); return false;};
  const document = new EventTarget(); document.visibilityState = "visible"; document.documentElement = {lang: "pt-BR"};
  const timers = new Map(); let timerId = 0;
  replace("setTimeout", callback => {const id = ++timerId; timers.set(id, callback); return id;}); replace("clearTimeout", id => timers.delete(id));
  replace("window", windows); replace("localStorage", windows.localStorage); replace("document", document); replace("navigator", {onLine: true}); replace("IS_REACT_ACT_ENVIRONMENT", true);
  const ownerId = randomUUID();
  let remote = {ownerId, version: 1, data: {...emptyJournal(), texts: ["Minha meta", "", "", "", "", "", ""]}};
  const requests = [];
  replace("fetch", async (url, options = {}) => {
    assert.equal(url, "/api/journal");
    assert.equal(new Headers(options.headers).get("X-Journal-Owner"), ownerId);
    const method = options.method ?? "GET"; requests.push(method);
    if (method === "GET") return Response.json(structuredClone(remote));
    assert.equal(method, "PUT");
    const body = saveSchema.parse(JSON.parse(options.body));
    assert.equal(body.version, remote.version);
    remote = {...remote, version: remote.version + 1, data: structuredClone(body.data)};
    return Response.json({version: remote.version});
  });
  let root, api, language, localEditor, mounts = 0;
  function Harness() {
    language = useI18n();
    api = useJournalSync({demo: false, ownerId, translateMessage: language.t});
    const [draft, setDraft] = React.useState("Unsaved dialog text");
    localEditor = {draft, setDraft};
    React.useEffect(() => {mounts++;}, []);
    return null;
  }
  try {
    await act(async () => {root = create(React.createElement(I18nProvider, null, React.createElement(Harness))); await microtasks();});
    assert.equal(api.ready, true); assert.equal(mounts, 1); assert.deepEqual(requests, ["GET"]);
    const personalText = "Música — mi historia personal {title} — 我自己的文字";
    await act(async () => {api.change(current => ({texts: current.texts.map((text,index) => index === 0 ? personalText : text)})); localEditor.setDraft("Ainda escrevendo mi meta"); await microtasks();});
    const pendingJournal = structuredClone(api.journal), pendingTimers = [...timers.keys()];
    const draftKeys = [...storage.keys()].filter(key => key !== LANGUAGE_STORAGE_KEY);
    assert.ok(draftKeys.length, "pending journal has a durable local draft");
    const storedDrafts = draftKeys.map(key => storage.get(key));
    await act(async () => {language.setLocale("es-MX"); await microtasks();});
    assert.equal(document.documentElement.lang, "es-MX"); assert.equal(storage.get(LANGUAGE_STORAGE_KEY), "es-MX");
    assert.equal(mounts, 1); assert.equal(localEditor.draft, "Ainda escrevendo mi meta");
    assert.deepEqual(api.journal, pendingJournal); assert.equal(api.dirty, true); assert.deepEqual(requests, ["GET"]);
    assert.deepEqual([...timers.keys()], pendingTimers, "locale changes do not recreate the autosave controller");
    assert.deepEqual(draftKeys.map(key => storage.get(key)), storedDrafts, "locale preference does not rewrite notebook drafts");
    await act(async () => {await api.useSaved(); await microtasks();});
    assert.equal(confirmations.at(-1), translate(catalog, "es-MX", "Descartar as alterações desta aba e abrir a versão salva na conta?"));
    assert.deepEqual(api.journal, pendingJournal, "declining translated discard preserves the draft");
    await act(async () => {language.setLocale("en-US"); await microtasks();});
    assert.equal(mounts, 1); assert.equal(localEditor.draft, "Ainda escrevendo mi meta");
    let saved;
    await act(async () => {saved = await api.save(); await microtasks();});
    assert.equal(saved, true); assert.equal(api.dirty, false); assert.equal(remote.data.texts[0], personalText);
    assert.deepEqual(remote.data, pendingJournal); assert.equal(Object.hasOwn(remote.data, "locale"), false);
  } finally {
    if (root) await act(async () => {root.unmount(); await microtasks();});
    for (const [name, descriptor] of originals) {if (descriptor) Object.defineProperty(globalThis,name,descriptor); else delete globalThis[name];}
  }
});
