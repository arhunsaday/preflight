# tools/

One skill per external tool, each teaching the agent when the tool beats the
built-ins — and, just as importantly, when it does not.

| Skill | Tool | Use it when |
| --- | --- | --- |
| [`pdf-inspector`](pdf-inspector/) | [firecrawl/pdf-inspector](https://github.com/firecrawl/pdf-inspector) | Long PDFs, batch conversion, or checking whether a PDF has a text layer at all. **Not** for small PDFs — native `Read` handles those |
| [`reverse-engineer-api`](reverse-engineer-api/) | browser network inspection | Integrating with an undocumented internal API, or documenting a legacy service |
| [`memory-snapshot-perf`](memory-snapshot-perf/) | Chrome DevTools heap snapshots | A web app that gets slower the longer it stays open |

`reverse-engineer-api` carries an authorization gate at the top and refuses
captchas, ID enumeration and rate-limit probing. It is for your own systems,
your employer's, or services you have written permission to test.
