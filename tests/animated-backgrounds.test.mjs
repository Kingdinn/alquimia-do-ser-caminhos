import assert from "node:assert/strict";
import {after, test} from "node:test";
import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import ts from "typescript";
import React from "react";
import {act, create} from "react-test-renderer";

// Run the production lifecycle code; substitute only browser/renderer boundaries.
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const compiled = await mkdtemp(path.join(appRoot, ".animated-background-tests-"));
after(async () => { await rm(compiled, {recursive: true, force: true}); });
await writeFile(path.join(compiled, "renderers.mjs"), `
  let factory;
  export const setFactory = (next) => { factory = next; };
  export const ORBITAL_SPHERE_DEFAULTS = {hue: 0, speed: 1};
  export const createOrbitalSphereRenderer = (canvas, options) => factory(canvas, options);
  export const createAuroraRenderer = (canvas) => factory(canvas);
`);
const components = {};
for (const name of ["orbital-sphere", "aurora-shader"]) {
  const source = (await readFile(path.join(appRoot, `components/ui/${name}.tsx`), "utf8"))
    .replace('"@/components/ui/orbital-sphere-utils/orbitalSphereRenderer"', '"./renderers.mjs"')
    .replace('"./aurora-shader-utils/auroraRenderer"', '"./renderers.mjs"');
  const result = ts.transpileModule(source, {compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX,
  }});
  const output = path.join(compiled, `${name}.mjs`);
  await writeFile(output, result.outputText);
  components[name] = (await import(pathToFileURL(output).href)).default;
}
const {setFactory} = await import(pathToFileURL(path.join(compiled, "renderers.mjs")).href);

class Surface extends EventTarget {
  listeners = new Map();
  dataset = {renderer: "fallback"};
  style = {opacity: "0"};
  hidden = false;
  addEventListener(type, callback, options) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(callback);
    super.addEventListener(type, callback, options);
  }
  removeEventListener(type, callback, options) {
    this.listeners.get(type)?.delete(callback);
    super.removeEventListener(type, callback, options);
  }
  get listenerCount() { return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0); }
  getBoundingClientRect() { return {left: 20, top: 10, width: 640, height: 360}; }
  closest() { return this.parentElement; }
}

async function fixture(name, run, {failure, strict = false, reduced = false} = {}) {
  const frames = new Map(), instances = [], resizeObservers = [], intersections = [];
  const browser = new Surface(), document = new Surface(), media = new Surface();
  const host = new Surface(), canvas = new Surface(), pointerSurface = new Surface();
  host.parentElement = pointerSurface;
  media.matches = reduced;
  browser.matchMedia = () => media;
  let frameId = 0, factoryCalls = 0, root, unmounted = false, props = {};
  const globals = {
    window: browser, document, IS_REACT_ACT_ENVIRONMENT: true,
    requestAnimationFrame: (callback) => { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame: (id) => { frames.delete(id); },
    ResizeObserver: class {
      disconnected = false;
      constructor(callback) { this.callback = callback; resizeObservers.push(this); }
      observe(target) { this.target = target; }
      disconnect() { this.disconnected = true; this.target = null; }
    },
    IntersectionObserver: class {
      disconnected = false;
      constructor(callback) { this.callback = callback; intersections.push(this); }
      observe(target) { this.target = target; }
      disconnect() { this.disconnected = true; this.target = null; }
    },
  };
  const descriptors = new Map(Object.keys(globals).map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, {configurable: true, writable: true, value});
  setFactory((receivedCanvas, options) => {
    factoryCalls += 1;
    assert.equal(receivedCanvas, canvas);
    if (failure === "create") throw new Error("WebGL unavailable");
    const renderer = {
      options, draws: [], sizes: [], disposals: 0, failRender: false,
      resize(width, height) {
        this.sizes.push([width, height]);
        if (failure === "resize") throw new Error("Drawing buffer resize failed");
      },
      render(seconds, pointer) {
        if (this.failRender) throw new Error("GPU draw failed");
        this.draws.push({seconds, pointer: pointer ? {...pointer} : undefined});
      },
      dispose() { this.disposals += 1; },
    };
    instances.push(renderer);
    return renderer;
  });
  const tree = () => {
    const element = React.createElement(components[name], props);
    return strict ? React.createElement(React.StrictMode, null, element) : element;
  };
  const perform = async (callback) => { await act(async () => { callback(); }); };
  const unmount = async () => {
    if (!unmounted && root) { unmounted = true; await perform(() => root.unmount()); }
  };
  try {
    await perform(() => {
      root = create(tree(), {createNodeMock: (element) => element.type === "canvas" ? canvas : host});
    });
    await run({
      root, host, canvas, browser, document, media, pointerSurface, frames, instances, resizeObservers, intersections,
      get factoryCalls() { return factoryCalls; },
      perform, unmount,
      update: async (next) => { props = {...props, ...next}; await perform(() => root.update(tree())); },
      emit: async (surface, type, fields = {}) => {
        const event = new Event(type, {cancelable: true});
        Object.assign(event, fields);
        await perform(() => surface.dispatchEvent(event));
        return event;
      },
      step: async (timestamp) => { await perform(() => {
        const pending = [...frames];
        for (const [id, callback] of pending) { frames.delete(id); callback(timestamp); }
      }); },
      visibility: async (hidden) => { document.hidden = hidden; await perform(() => document.dispatchEvent(new Event("visibilitychange"))); },
      reducedMotion: async (matches) => { media.matches = matches; await perform(() => media.dispatchEvent(new Event("change"))); },
      intersection: async (isIntersecting) => { await perform(() => {
        for (const observer of intersections) if (!observer.disconnected) observer.callback([{isIntersecting}]);
      }); },
    });
  } finally {
    await unmount();
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

const names = Object.keys(components);

test("both backgrounds stop and resume for pause, hidden tabs, reduced motion and offscreen state", async () => {
  for (const name of names) await fixture(name, async (f) => {
    const renderer = f.instances[0];
    assert.equal(f.frames.size, 1, name);
    await f.step(0); await f.step(40);
    assert.ok(renderer.draws.at(-1).seconds > 0);
    for (const [stop, resume] of [
      [() => f.update({paused: true}), () => f.update({paused: false})],
      [() => f.visibility(true), () => f.visibility(false)],
      [() => f.reducedMotion(true), () => f.reducedMotion(false)],
      [() => f.intersection(false), () => f.intersection(true)],
    ]) {
      await stop();
      assert.equal(f.frames.size, 0, `${name}: inactive backgrounds must not schedule frames`);
      const draws = renderer.draws.length, elapsed = renderer.draws.at(-1).seconds;
      await f.step(20_000);
      assert.equal(renderer.draws.length, draws);
      await resume();
      assert.equal(f.frames.size, 1);
      await f.step(30_000);
      assert.equal(renderer.draws.at(-1).seconds, elapsed, "resuming must not jump by hidden wall-clock time");
      assert.equal(f.frames.size, 1);
    }
    assert.equal(f.factoryCalls, 1);
  });
});

test("prop updates preserve the renderer and keep at most one animation loop", async () => {
  for (const name of names) await fixture(name, async (f) => {
    const renderer = f.instances[0];
    await f.step(0); await f.step(40);
    const elapsed = renderer.draws.at(-1).seconds;
    for (let index = 0; index < 4; index += 1) {
      await f.update({hue: 120 + index, speed: 0.5, className: `updated-${index}`});
      await f.emit(f.document, "visibilitychange");
      await f.emit(f.media, "change");
      await f.intersection(true);
      assert.equal(f.frames.size, 1, "duplicate synchronization cannot duplicate the loop");
    }
    assert.equal(f.factoryCalls, 1);
    assert.equal(renderer.disposals, 0);
    assert.match(f.root.root.findByType("div").props.className, /updated-3/);
    if (name === "orbital-sphere") assert.deepEqual(renderer.options(), {hue: 123, speed: 0.5});
    await f.step(80);
    assert.ok(renderer.draws.at(-1).seconds > elapsed, "prop changes must not restart animation time");
  });
});

test("context loss shows the fallback and restoration respects pause before resuming", async () => {
  for (const name of names) await fixture(name, async (f) => {
    const previous = f.instances[0];
    const event = await f.emit(f.canvas, "webglcontextlost");
    assert.equal(event.defaultPrevented, true, "allow the browser to restore the context");
    assert.equal(f.canvas.style.opacity, "0");
    assert.equal(f.frames.size, 0);
    assert.equal(previous.disposals, 1);
    if (name === "orbital-sphere") assert.equal(f.host.dataset.renderer, "fallback");
    await f.update({paused: true});
    await f.emit(f.canvas, "webglcontextrestored");
    assert.equal(f.factoryCalls, 2);
    assert.equal(f.canvas.style.opacity, "1");
    assert.equal(f.frames.size, 0, "restoring a context cannot override pause");
    await f.update({paused: false});
    assert.equal(f.frames.size, 1);
    await f.step(0);
    await f.unmount();
    assert.deepEqual(f.instances.map((item) => item.disposals), [1, 1]);
  });
});

test("renderer creation, initialization and drawing failures preserve the fallback without leaking", async () => {
  for (const name of names) {
    for (const failure of ["create", "resize"]) await fixture(name, async (f) => {
      assert.equal(f.canvas.style.opacity, "0", `${name}: ${failure}`);
      assert.equal(f.frames.size, 0);
      await f.unmount();
      assert.ok(f.instances.every((item) => item.disposals === 1), `${name}: failed initialization must dispose an allocated renderer`);
    }, {failure});
    await fixture(name, async (f) => {
      const renderer = f.instances[0];
      renderer.failRender = true;
      await f.step(0);
      assert.equal(f.canvas.style.opacity, "0");
      assert.equal(f.frames.size, 0);
      assert.equal(renderer.disposals, 1);
      await f.unmount();
      assert.equal(renderer.disposals, 1, "a failed renderer must not be disposed twice");
    });
  }
});

test("StrictMode setup and unmount leave no frames, observers or event listeners behind", async () => {
  for (const name of names) await fixture(name, async (f) => {
    assert.equal(f.factoryCalls, 2, "StrictMode exercises setup, cleanup and setup again");
    assert.deepEqual(f.instances.map((item) => item.disposals), [1, 0]);
    assert.equal(f.frames.size, 1);
    await f.step(0); await f.step(40);
    await f.unmount();
    assert.equal(f.frames.size, 0);
    assert.ok(f.resizeObservers.every((observer) => observer.disconnected));
    assert.ok(f.intersections.every((observer) => observer.disconnected));
    assert.deepEqual(f.instances.map((item) => item.disposals), [1, 1]);
    for (const surface of [f.canvas, f.pointerSurface, f.document, f.media, f.browser]) assert.equal(surface.listenerCount, 0);
    const calls = f.factoryCalls;
    await f.emit(f.canvas, "webglcontextrestored");
    await f.emit(f.document, "visibilitychange");
    await f.emit(f.browser, "resize");
    assert.equal(f.factoryCalls, calls, "late browser events cannot resurrect an unmounted background");
    assert.equal(f.frames.size, 0);
  }, {strict: true});
});

test("Aurora clears cursor distortion while paused or reduced-motion and ignores touch input", async () => {
  await fixture("aurora-shader", async (f) => {
    const renderer = f.instances[0];
    await f.emit(f.pointerSurface, "pointermove", {pointerType: "mouse", clientX: 500, clientY: 100});
    await f.step(0);
    assert.deepEqual(renderer.draws.at(-1).pointer, {x: 0.5, y: 0.5, presence: 1});
    await f.update({paused: true});
    assert.equal(renderer.draws.at(-1).pointer.presence, 0);
    await f.emit(f.pointerSurface, "pointermove", {pointerType: "mouse", clientX: 340, clientY: 190});
    await f.update({paused: false});
    await f.step(40);
    assert.equal(renderer.draws.at(-1).pointer.presence, 0);
    await f.emit(f.pointerSurface, "pointermove", {pointerType: "touch", clientX: 340, clientY: 190});
    await f.step(80);
    assert.equal(renderer.draws.at(-1).pointer.presence, 0);
    await f.emit(f.pointerSurface, "pointermove", {pointerType: "mouse", clientX: 340, clientY: 190});
    await f.step(120);
    assert.equal(renderer.draws.at(-1).pointer.presence, 1);
    await f.reducedMotion(true);
    assert.equal(renderer.draws.at(-1).pointer.presence, 0);
    assert.equal(f.frames.size, 0);
  });
});
