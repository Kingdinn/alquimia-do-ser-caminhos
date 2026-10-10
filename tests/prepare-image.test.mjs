import assert from "node:assert/strict";
import test from "node:test";
import { prepareVisionImage } from "../lib/prepare-image.ts";

const MIB = 1024 * 1024;
const pngHeader = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const png = (size = 64) => new File([pngHeader, new Uint8Array(size - pngHeader.length)], "Minha visão.PNG", { type: "image/png" });

async function withBrowser(options, run) {
  const state = { created: [], revoked: [], encodes: [], draws: [], fills: [], image: null };
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => options.noContext ? null : {
      clearRect() {},
      fillStyle: "",
      fillRect() { state.fills.push(this.fillStyle); },
      drawImage(_image, _x, _y, width, height) { state.draws.push([width, height]); },
    },
    toBlob(callback, type, quality) {
      state.encodes.push({ type, quality, width: this.width, height: this.height });
      const result = options.encode?.(type, quality, this.width, this.height)
        ?? { type, size: 200_000 };
      queueMicrotask(() => callback(result.type === "null" ? null : new Blob([new Uint8Array(result.size)], { type: result.type })));
    },
  };
  state.canvas = canvas;
  class FakeImage {
    naturalWidth = options.width ?? 4000;
    naturalHeight = options.height ?? 3000;
    constructor() { state.image = this; }
    set src(value) {
      this.source = value;
      if (value) queueMicrotask(() => options.decodeError ? this.onerror?.() : this.onload?.());
    }
  }
  const patches = [
    [globalThis, "document", { createElement: () => canvas }],
    [globalThis, "Image", FakeImage],
    [URL, "createObjectURL", (file) => { state.created.push(file); return "blob:test-image"; }],
    [URL, "revokeObjectURL", (url) => state.revoked.push(url)],
  ].map(([target, key, value]) => {
    const previous = Object.getOwnPropertyDescriptor(target, key);
    Object.defineProperty(target, key, { configurable: true, writable: true, value });
    return { target, key, previous };
  });
  try {
    await run(state);
  } finally {
    for (const { target, key, previous } of patches) {
      if (previous) Object.defineProperty(target, key, previous);
      else delete target[key];
    }
  }
}

function assertCleaned(state) {
  assert.deepEqual(state.revoked, ["blob:test-image"]);
  assert.equal(state.image.source, "");
  assert.equal(state.canvas.width, 0);
  assert.equal(state.canvas.height, 0);
}

test("caps longest edge, preserves proportions and returns the actual WebP file", async () => {
  await withBrowser({ width: 4800, height: 3000 }, async (state) => {
    const result = await prepareVisionImage(png(10 * MIB));
    assert.equal(result.type, "image/webp");
    assert.equal(result.name, "Minha visão.webp");
    assert.equal(result.size, 200_000);
    assert.deepEqual(state.draws[0], [1600, 1000]);
    assertCleaned(state);
  });
});

test("does not enlarge small portraits and accepts output exactly at the limit", async () => {
  await withBrowser({ width: 600, height: 1000, encode: (type) => ({ type, size: MIB }) }, async (state) => {
    const result = await prepareVisionImage(png());
    assert.equal(result.size, MIB);
    assert.deepEqual(state.draws, [[600, 1000]]);
    assertCleaned(state);
  });
});

test("reduces quality before dimensions until the output fits", async () => {
  await withBrowser({ encode: (type, quality, width) => ({ type, size: width > 1280 || quality > 0.56 ? MIB + 1 : MIB - 1 }) }, async (state) => {
    const result = await prepareVisionImage(png());
    assert.equal(result.size, MIB - 1);
    assert.deepEqual(state.draws, [[1600, 1200], [1280, 960]]);
    assert.equal(state.encodes.at(-1).quality, 0.56);
    assertCleaned(state);
  });
});

test("falls back from unsupported WebP to correctly labelled JPEG with a white background", async () => {
  await withBrowser({ encode: (type) => ({ type: type === "image/webp" ? "image/png" : type, size: 200_000 }) }, async (state) => {
    const result = await prepareVisionImage(png());
    assert.equal(result.type, "image/jpeg");
    assert.equal(result.name, "Minha visão.jpg");
    assert.deepEqual(state.encodes.map((entry) => entry.type), ["image/webp", "image/jpeg"]);
    assert.deepEqual(state.fills, ["#ffffff"]);
    assertCleaned(state);
  });
});

test("rejects excessive input, empty files, unapproved MIME and mismatched signatures before decoding", async () => {
  await withBrowser({}, async (state) => {
    await assert.rejects(prepareVisionImage(png(10 * MIB + 1)), /até 10 MB/);
    await assert.rejects(prepareVisionImage(new File([], "empty.png", { type: "image/png" })), /até 10 MB/);
    await assert.rejects(prepareVisionImage(new File(["<svg/>"], "image.svg", { type: "image/svg+xml" })), /PNG, JPEG ou WebP/);
    await assert.rejects(prepareVisionImage(new File(["<svg/>"], "image.png", { type: "image/png" })), /não corresponde/);
    assert.equal(state.created.length, 0);
  });
});

test("accepts JPEG and WebP signatures, rejecting a forged MIME for each", async () => {
  for (const [type, bytes] of [
    ["image/jpeg", new Uint8Array([255, 216, 255, 224])],
    ["image/webp", new TextEncoder().encode("RIFFxxxxWEBP")],
  ]) {
    await withBrowser({}, async (state) => {
      assert.equal((await prepareVisionImage(new File([bytes], "image", { type }))).type, "image/webp");
      assertCleaned(state);
    });
    await assert.rejects(prepareVisionImage(new File([pngHeader], "forged", { type })), /não corresponde/);
  }
});

test("rejects failed decoding and releases the object URL", async () => {
  await withBrowser({ decodeError: true }, async (state) => {
    await assert.rejects(prepareVisionImage(png()), /Não foi possível abrir/);
    assertCleaned(state);
  });
});

test("fails safely on null encoding or unavailable canvas", async () => {
  for (const options of [{ encode: () => ({ type: "null", size: 0 }) }, { noContext: true }]) {
    await withBrowser(options, async (state) => {
      await assert.rejects(prepareVisionImage(png()), /preparar/);
      assertCleaned(state);
    });
  }
});

test("never returns oversized output even if the encoder cannot meet the cap", async () => {
  await withBrowser({ encode: (type) => ({ type, size: MIB + 1 }) }, async (state) => {
    await assert.rejects(prepareVisionImage(png()), /até 1 MB/);
    assert.equal(state.encodes.length, 28);
    assertCleaned(state);
  });
});
