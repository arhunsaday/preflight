import React from "react";
import { expect, it, vi } from "vitest";
import { render } from "ink-testing-library";
import { mkdir, mkdtemp, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { App } from "../src/ui/index.js";
import { PreflightService } from "../src/service.js";
import { ResourceSchema } from "../src/schema.js";

// The plan calls a 500-row list the predictable performance trap in Ink, so
// the viewport stays bounded and a burst of keystrokes collapses into one
// render rather than one frame per key.
it("keeps a 500 resource profile bounded and responsive", async () => {
  const root = await mkdtemp(join(await realpath(tmpdir()), "preflight-scale-"));
  const context = { root, home: join(root, "home") };
  await mkdir(context.home);
  const service = new PreflightService(context);
  const config = await service.init();
  config.profiles.default!.resources.push(
    ...Array.from({ length: 500 }, (_, i) =>
      ResourceSchema.parse({
        id: `skill:scale-${i}`,
        type: "skill",
        name: `scale skill number ${i}`,
        description: `Description ${i}`.repeat(8),
        source: "local:owned",
        scope: i % 2 ? "global" : "project",
        harnesses: ["claude-code"],
        content: "---\nname: scale\n---\nbody line\n".repeat(200),
      }),
    ),
  );
  await service.store.write(config);
  const view = render(<App context={context} />);
  const tick = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  try {
    const frame = () => view.lastFrame() ?? "";
    await vi.waitFor(
      () => {
        expect(frame()).toContain("scale skill number 0");
        expect(frame()).toContain("✖");
        expect(frame()).not.toContain("doctor pending");
      },
      { timeout: 10000, interval: 25 },
    );
    await tick(25);
    expect(frame()).not.toContain("scale skill number 400");
    expect(frame().split("\n").length).toBeLessThanOrEqual(34);
    // Ink may paint before its passive input effect subscribes under a busy worker.
    // Establish that input is active before measuring a burst of navigation.
    await vi.waitFor(() => {
      view.stdin.write("j");
      expect(frame()).toMatch(/preflight inspect skill:scale-[1-9]/);
    }, { timeout: 5000, interval: 25 });
    const start = performance.now();
    for (let i = 0; i < 60; i++) view.stdin.write("j");
    await vi.waitFor(
      () => expect(frame()).not.toContain("scale skill number 0 "),
      { timeout: 2500, interval: 25 },
    );
    expect(performance.now() - start).toBeLessThan(3000);
  } finally {
    view.unmount();
  }
}, 30000);
