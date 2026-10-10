import assert from "node:assert/strict";
import {after, test} from "node:test";
import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import ts from "typescript";
import React from "react";
import {act, create} from "react-test-renderer";

// Exercise the production React component. Only CSS loading and the browser's
// media element and Portuguese translation context are substituted; playback decisions and handlers stay unchanged.
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const compiled = await mkdtemp(path.join(appRoot, ".ambient-music-tests-"));
after(async () => { await rm(compiled, {recursive: true, force: true}); });
const source = (await readFile(path.join(appRoot, "components/ambient-music.tsx"), "utf8"))
  .replace('"./ambient-music.module.css"', '"./styles.mjs"')
  .replace('"@/lib/i18n"', '"./i18n.mjs"');
const result = ts.transpileModule(source, {compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX,
}});
await writeFile(path.join(compiled, "ambient-music.mjs"), result.outputText);
await writeFile(path.join(compiled, "styles.mjs"), "export default new Proxy({}, {get: (_, name) => String(name)});\n");
await writeFile(path.join(compiled, "i18n.mjs"), 'export const useI18n = () => ({locale: "pt-BR", t: key => key});\n');
const {default: AmbientMusic} = await import(pathToFileURL(path.join(compiled, "ambient-music.mjs")).href);
const settle = async () => { for (let i = 0; i < 16; i += 1) await Promise.resolve(); };
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
}

class MediaElement extends EventTarget {
  paused = true;
  error = null;
  volume = 1;
  playCalls = 0;
  pauseCalls = 0;
  loadCalls = 0;
  seeks = [];
  plans = [];
  position = 0;
  constructor(props) { super(); this.props = props; }
  get currentTime() { return this.position; }
  set currentTime(value) { this.seeks.push(value); this.position = value; }
  emit(name) {
    this.dispatchEvent(new Event(name));
    const handler = {playing: "onPlaying", pause: "onPause", waiting: "onWaiting", error: "onError"}[name];
    this.props()[handler]?.({currentTarget: this, target: this});
  }
  play() {
    this.playCalls += 1;
    this.paused = false;
    return (this.plans.shift()?.promise ?? Promise.resolve()).then(() => {
      if (!this.paused) this.emit("playing");
    });
  }
  pause() {
    this.pauseCalls += 1;
    if (this.paused) return;
    this.paused = true;
    // Native media events are queued, including pause events that can arrive
    // after a subsequent play request has already changed `paused` again.
    queueMicrotask(() => this.emit("pause"));
  }
  load() { this.loadCalls += 1; this.position = 0; this.error = null; }
}

async function fixture(run) {
  const previousAct = Object.getOwnPropertyDescriptor(globalThis, "IS_REACT_ACT_ENVIRONMENT");
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {configurable: true, writable: true, value: true});
  let root, connected = true;
  const media = [];
  function Notebook({step}) {
    return React.createElement(React.Fragment, null,
      React.createElement("main", {"data-step": step}, `Notebook step ${step}`),
      React.createElement(AmbientMusic),
    );
  }
  const click = async (label) => {
    const button = root.root.findAllByType("button").find((node) => (
      typeof label === "string" ? node.props["aria-label"] === label : label.test(node.props["aria-label"] ?? "")
    ));
    assert.ok(button, `Expected an available control: ${label}`);
    assert.notEqual(button.props.disabled, true, "control must remain usable");
    await act(async () => { button.props.onClick(); await settle(); });
  };
  try {
    await act(async () => {
      root = create(React.createElement(Notebook, {step: 0}), {createNodeMock(element) {
        if (element.type !== "audio") return null;
        const audio = new MediaElement(() => connected ? root.root.findByType("audio").props : {});
        media.push(audio);
        return audio;
      }});
      await settle();
    });
    await run({
      root, media, audio: media[0], click,
      update: async (step) => { await act(async () => { root.update(React.createElement(Notebook, {step})); await settle(); }); },
      status: () => root.root.find((node) => node.props["aria-live"] === "polite").children.join(""),
      alerts: () => root.root.findAll((node) => node.props.role === "alert"),
    });
  } finally {
    connected = false; // React removes DOM handlers when the media node unmounts.
    if (root) await act(async () => { root.unmount(); await settle(); });
    if (previousAct) Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", previousAct);
    else delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  }
}

test("mounting, opening settings and changing notebook steps never start audio", async () => {
  await fixture(async ({root, audio, media, click, update}) => {
    assert.equal(audio.playCalls, 0);
    assert.notEqual(root.root.findByType("audio").props.autoPlay, true);
    assert.equal(root.root.findByType("audio").props.preload, "none", "do not fetch the track before a listening request");
    await click("Abrir volume e informações da música");
    await click("Recolher controles de música");
    await update(4);
    assert.equal(audio.playCalls, 0);
    assert.equal(audio.pauseCalls, 0);
    assert.equal(media.length, 1);
  });
});

test("collapsing, reopening and notebook rerenders preserve playing audio and its position", async () => {
  await fixture(async ({root, audio, media, click, update, status}) => {
    await click("Reproduzir música");
    assert.equal(status(), "Tocando");
    audio.position = 137.25; // Passage of playback time, not a programmatic seek.
    await click("Abrir volume e informações da música");
    await act(async () => { root.root.findByType("input").props.onChange({currentTarget: {value: "54"}}); });
    await click("Recolher controles; música continua");
    await update(5);
    await click("Abrir volume e informações da música");
    await update(6);
    assert.equal(media.length, 1, "the audio element must not remount with its controls or notebook");
    assert.equal(audio.playCalls, 1);
    assert.equal(audio.pauseCalls, 0);
    assert.equal(audio.loadCalls, 0);
    assert.equal(audio.currentTime, 137.25);
    assert.equal(audio.volume, 0.54);
    assert.deepEqual(audio.seeks, []);
    assert.equal(status(), "Tocando");
    await click("Pausar música");
    assert.equal(audio.paused, true);
    assert.equal(audio.currentTime, 137.25);
    await click("Reproduzir música");
    assert.equal(audio.paused, false);
    assert.equal(audio.currentTime, 137.25, "ordinary resume continues from the listening position");
    assert.equal(audio.loadCalls, 0);
  });
});

test("a rejected play request offers a retry without automatic playback", async () => {
  await fixture(async ({audio, click, status, alerts}) => {
    const request = deferred();
    audio.plans.push(request);
    await click("Reproduzir música");
    assert.equal(status(), "Carregando…");
    await act(async () => { request.reject(new DOMException("User gesture required", "NotAllowedError")); await settle(); });
    assert.equal(audio.paused, true);
    assert.equal(audio.playCalls, 1);
    assert.equal(alerts().length, 1);
    assert.match(alerts()[0].children.join(""), /navegador/);
    await click("Reproduzir música");
    assert.equal(audio.playCalls, 2);
    assert.equal(status(), "Tocando");
    assert.equal(alerts().length, 0);
  });
});

test("pausing a pending play request stays paused when the browser rejects that request", async () => {
  await fixture(async ({audio, click, status, alerts}) => {
    const request = deferred();
    audio.plans.push(request);
    await click("Reproduzir música");
    await click("Pausar música");
    await act(async () => { request.reject(new DOMException("Interrupted by pause", "AbortError")); await settle(); });
    assert.equal(audio.paused, true);
    assert.equal(status(), "Pausada");
    assert.equal(alerts().length, 0, "an intentional pause is not a listening error");
    assert.equal(audio.playCalls, 1);
    await click("Reproduzir música");
    assert.equal(status(), "Tocando");
  });
});

test("a late failure from cancelled playback cannot cancel a newer listening request", async () => {
  await fixture(async ({audio, click, status, alerts}) => {
    const oldRequest = deferred();
    audio.plans.push(oldRequest);
    await click("Reproduzir música");
    await click("Pausar música");
    await click("Reproduzir música");
    const pauseCalls = audio.pauseCalls;
    await act(async () => { oldRequest.reject(new DOMException("Old request cancelled", "AbortError")); await settle(); });
    assert.equal(audio.paused, false);
    assert.equal(audio.pauseCalls, pauseCalls);
    assert.equal(status(), "Tocando");
    assert.equal(alerts().length, 0);
  });
});
