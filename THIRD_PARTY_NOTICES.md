# Third-party notices

Preflight includes code adapted from the projects below. Each keeps its own
license. Each adapted file names its source in a header comment.

## agent-compass

- Source: https://github.com/me-cedric/agent-compass, commit `72d72711fa3d1941658b97755674e0204274a80d`
- License: MIT, Copyright (c) 2026 CGI
- Adapted:
  - `engine/usage.mjs` → `src/usage.ts` (transcript usage, deduplication,
    cache and cost accounting).
  - `engine/global.mjs` → `src/doctor-global.ts` (global setup reading,
    injecting hook events, Codex `config.toml` tables, SessionStart
    measurement, plugin and MCP budgets).
  - The listing-line estimate of `engine/tokens.mjs` informs `listingTokens`
    in `src/context-map.ts`.
  - `engine/reflect.mjs` and `scripts/lib/redact.mjs` → `src/reflect.ts`
    (session ranking by trouble signals, redacted trajectories, redaction
    patterns).

```
MIT License

Copyright (c) 2026 CGI

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## pstack (cursor/plugins)

- Source: https://github.com/cursor/plugins, folder `pstack`, commit `bb68f2365eceafa0cb2d253112f675acf5f144cc`
- License: MIT, Copyright (c) 2026 Lauren Tan
- Used as a reference, no code copied: the advice to set
  `disable-model-invocation: true` on overlapping or rarely used skills
  (`skill-cluster`, `unused-context`) and the per-role subagent model rule in
  `preflight instructions draft`.
- The `reflect` skill of pstack and the `continual-learning` plugin
  (cursor/plugins, MIT, Copyright (c) 2026 Cursor) inform the lesson loop of
  `preflight reflect`: a one-off is not a lesson, and no lesson is applied
  without review. No code copied.

```
MIT License

Copyright (c) 2026 Lauren Tan
```

The full MIT text above applies to pstack as well.
