import React from "react";
import { expect, it } from "vitest";
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
    await tick(300);
    const frame = () => view.lastFrame() ?? "";
    expect(frame()).toContain("scale skill number 0");
    expect(frame()).not.toContain("scale skill number 400");
    expect(frame().split("\n").length).toBeLessThanOrEqual(34);
    const start = performance.now();
    for (let i = 0; i < 60; i++) view.stdin.write("j");
    await tick(50);
    expect(performance.now() - start).toBeLessThan(3000);
    expect(frame()).not.toContain("scale skill number 0 ");
  } finally {
    view.unmount();
  }
}, 30000);
