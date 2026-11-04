import { describe, it, expect } from "vitest";
import {
  initialUpdateState,
  reduceUpdate,
  updateBanner,
  updateUnsupportedReason,
} from "../desktop/updates.js";
import type { UpdateEvent, UpdateState } from "../desktop/updates.js";

const run = (events: UpdateEvent[], from: UpdateState = initialUpdateState) =>
  events.reduce(reduceUpdate, from);

describe("update state", () => {
  it("walks check, available, download, ready", () => {
    expect(
      run([
        { type: "checking", manual: false },
        { type: "available", version: "0.2.0" },
        { type: "progress", percent: 41.6 },
      ]),
    ).toEqual({ status: "downloading", version: "0.2.0", percent: 42 });
    expect(
      run([
        { type: "available", version: "0.2.0" },
        { type: "downloaded", version: "0.2.0" },
      ]),
    ).toEqual({ status: "ready", version: "0.2.0" });
  });
  it("keeps a ready update through later background checks and errors", () => {
    const ready: UpdateState = { status: "ready", version: "0.2.0" };
    expect(
      run(
        [
          { type: "checking", manual: false },
          { type: "not-available" },
          { type: "error", message: "offline" },
          { type: "dismiss" },
        ],
        ready,
      ),
    ).toEqual(ready);
  });
  it("remembers whether the person asked", () => {
    expect(
      run([{ type: "checking", manual: true }, { type: "not-available" }]),
    ).toEqual({ status: "current", manual: true });
    expect(
      run([
        { type: "checking", manual: false },
        { type: "error", message: "x" },
      ]),
    ).toEqual({
      status: "error",
      message: "x",
      manual: false,
    });
  });
  it("ignores progress when nothing is downloading and clamps it", () => {
    expect(run([{ type: "progress", percent: 5 }])).toEqual(initialUpdateState);
    expect(
      run([
        { type: "available", version: "1.0.0" },
        { type: "progress", percent: 250 },
      ]),
    ).toMatchObject({ percent: 100 });
  });
  it("stays disabled but lets a manual check explain why", () => {
    const quiet = run([{ type: "disable", reason: "no", manual: false }]);
    expect(run([{ type: "checking", manual: true }], quiet)).toEqual(quiet);
    expect(updateBanner(quiet)).toBeNull();
    const asked = run([{ type: "disable", reason: "no", manual: true }], quiet);
    expect(updateBanner(asked)).toMatchObject({
      tone: "warning",
      text: "no",
      action: "releases",
    });
    expect(run([{ type: "dismiss" }], asked)).toEqual({
      status: "disabled",
      reason: "no",
      manual: false,
    });
  });
  it("keeps background checks silent", () => {
    expect(updateBanner(run([{ type: "checking", manual: false }]))).toBeNull();
    expect(
      updateBanner(
        run([{ type: "checking", manual: false }, { type: "not-available" }]),
      ),
    ).toBeNull();
    expect(updateBanner({ status: "ready", version: "1.2.3" })).toMatchObject({
      action: "install",
    });
  });
  it("explains why a build cannot update", () => {
    const base = {
      packaged: true,
      platform: "win32" as const,
      signed: true,
      appImage: false,
      testMode: false,
    };
    expect(updateUnsupportedReason(base)).toBeNull();
    expect(updateUnsupportedReason({ ...base, packaged: false })).toMatch(
      /installed/,
    );
    expect(updateUnsupportedReason({ ...base, testMode: true })).toMatch(
      /test/,
    );
    expect(
      updateUnsupportedReason({ ...base, platform: "darwin", signed: false }),
    ).toMatch(/not signed/);
    expect(updateUnsupportedReason({ ...base, platform: "darwin" })).toBeNull();
    expect(updateUnsupportedReason({ ...base, platform: "linux" })).toMatch(
      /AppImage/,
    );
    expect(
      updateUnsupportedReason({ ...base, platform: "linux", appImage: true }),
    ).toBeNull();
  });
});
