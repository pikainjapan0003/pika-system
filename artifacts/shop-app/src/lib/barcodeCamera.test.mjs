import assert from "node:assert/strict";
import { test } from "node:test";
import { startBarcodeCamera } from "./barcodeCamera.ts";
const tick = () => new Promise((r) => setImmediate(r));
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
};
function rig(overrides = {}) {
  const tracks = [
      {
        calls: 0,
        stop() {
          this.calls++;
        },
      },
      {
        calls: 0,
        stop() {
          this.calls++;
        },
      },
    ],
    stream = { getTracks: () => tracks };
  const control = {
      calls: 0,
      stop() {
        this.calls++;
      },
    },
    win = new EventTarget(),
    doc = new EventTarget();
  doc.visibilityState = "visible";
  let callback;
  const results = [],
    errors = [],
    video = { srcObject: null };
  const deps = {
    secure: () => true,
    stream: async () => stream,
    decoder: async () => ({
      format: (x) => x,
      decode: async (_s, _v, cb) => {
        callback = cb;
        return control;
      },
    }),
    window: win,
    document: doc,
    ...overrides,
  };
  const stop = startBarcodeCamera(
    video,
    (x) => results.push(x),
    (x) => errors.push(x),
    deps,
  );
  return {
    stop,
    tracks,
    control,
    stream,
    results,
    errors,
    video,
    win,
    doc,
    callback: (...args) => callback(...args),
  };
}
test("insecure or missing camera provides manual fallback", async () => {
  const r = rig({ secure: () => false });
  await tick();
  assert.match(r.errors[0], /手動/);
  r.stop();
});
test("denied permission stops with actionable error", async () => {
  const r = rig({
    stream: async () => {
      throw Error("denied");
    },
  });
  await tick();
  assert.match(r.errors[0], /權限/);
  r.stop();
});
test("late permission after close stops every arriving track", async () => {
  const d = deferred(),
    r = rig({ stream: () => d.promise });
  await tick();
  r.stop();
  d.resolve(r.stream);
  await tick();
  assert.deepEqual(
    r.tracks.map((t) => t.calls),
    [1, 1],
  );
  assert.equal(r.video.srcObject, null);
});
test("synchronous first callback stops both callback and returned controls once", async () => {
  const a = {
      calls: 0,
      stop() {
        this.calls++;
      },
    },
    b = {
      calls: 0,
      stop() {
        this.calls++;
      },
    };
  const r = rig({
    decoder: async () => ({
      format: (x) => x,
      decode: async (s, v, cb) => {
        cb(
          { getText: () => "00123", getBarcodeFormat: () => "CODE_128" },
          undefined,
          a,
        );
        return b;
      },
    }),
  });
  await tick();
  assert.equal(r.results[0].barcode, "00123");
  assert.equal(a.calls, 1);
  assert.equal(b.calls, 1);
  assert.deepEqual(
    r.tracks.map((t) => t.calls),
    [1, 1],
  );
  r.stop();
  assert.equal(a.calls, 1);
});
test("late controls after stop cannot retain stream", async () => {
  const d = deferred(),
    r = rig({
      decoder: async () => ({ format: (x) => x, decode: () => d.promise }),
    });
  await tick();
  r.stop();
  d.resolve(r.control);
  await tick();
  assert.equal(r.control.calls, 1);
  assert.deepEqual(
    r.tracks.map((t) => t.calls),
    [1, 1],
  );
});
test("normal close is idempotent and stale results ignored", async () => {
  const r = rig();
  await tick();
  r.stop();
  r.stop();
  r.callback(
    { getText: () => "00123", getBarcodeFormat: () => "CODE_128" },
    undefined,
    r.control,
  );
  assert.equal(r.results.length, 0);
  assert.equal(r.control.calls, 1);
  assert.deepEqual(
    r.tracks.map((t) => t.calls),
    [1, 1],
  );
});
test("timeout bounds recognition and stops owned resources", async () => {
  const r = rig({ timeoutMs: 15 });
  await new Promise((r) => setTimeout(r, 30));
  assert.match(r.errors[0], /逾時/);
  assert.equal(r.control.calls, 1);
  assert.deepEqual(
    r.tracks.map((t) => t.calls),
    [1, 1],
  );
});
test("per-frame NotFound Checksum and Format are ignored", async () => {
  const r = rig();
  await tick();
  for (const name of [
    "NotFoundException",
    "ChecksumException",
    "FormatException",
  ])
    r.callback(undefined, Object.assign(new Error(), { name }), r.control);
  assert.deepEqual(r.errors, []);
  assert.equal(r.control.calls, 0);
  r.stop();
});
test("unexpected decoder error stops resources and offers manual input", async () => {
  const r = rig();
  await tick();
  r.callback(undefined, new Error("decoder broken"), r.control);
  assert.match(r.errors[0], /手動/);
  assert.equal(r.control.calls, 1);
  assert.deepEqual(
    r.tracks.map((t) => t.calls),
    [1, 1],
  );
});
test("minified ZXing errors use stable getKind, not constructor name", async () => {
  const r = rig();
  await tick();
  r.callback(
    undefined,
    { name: "a", getKind: () => "NotFoundException" },
    r.control,
  );
  assert.equal(r.errors.length, 0);
  assert.equal(r.control.calls, 0);
  r.callback(
    undefined,
    { name: "NotFoundException", getKind: () => "UnexpectedDecoderFailure" },
    r.control,
  );
  assert.equal(r.errors.length, 1);
  assert.equal(r.control.calls, 1);
});
test("pagehide and hidden clean up their own sessions", async () => {
  for (const event of ["pagehide", "visibilitychange"]) {
    const r = rig();
    await tick();
    if (event === "pagehide") r.win.dispatchEvent(new Event(event));
    else {
      r.doc.visibilityState = "hidden";
      r.doc.dispatchEvent(new Event(event));
    }
    assert.equal(r.control.calls, 1);
    assert.deepEqual(
      r.tracks.map((t) => t.calls),
      [1, 1],
    );
  }
});
test("old session late controls do not clear a new video node", async () => {
  const d = deferred(),
    oldVideo = { srcObject: null };
  let old;
  const r = rig({
    decoder: async () => ({
      format: (x) => x,
      decode: async (_s, v) => {
        old = v;
        return d.promise;
      },
    }),
  });
  await tick();
  r.stop();
  const fresh = rig();
  await tick();
  d.resolve({
    stop() {
      old.srcObject = null;
    },
  });
  await tick();
  assert.equal(fresh.video.srcObject, fresh.stream);
  fresh.stop();
});
