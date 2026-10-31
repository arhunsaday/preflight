---
name: pdf-inspector
description: Convert PDFs to clean Markdown and classify them as text-based vs scanned, without OCR, using the firecrawl/pdf-inspector CLI. Use when a PDF is large (30+ pages), when many PDFs need batch conversion to text/Markdown, when the extracted text must be saved to a file or piped into another tool, or when you need to know whether a PDF actually contains a text layer before attempting extraction. Do NOT use for small PDFs you just need to read or summarize — the native Read tool handles those directly.
source:
  upstream: hand-authored in preflight, from firecrawl/pdf-inspector docs (that tool is MIT)
  imported: 2026-08-02
---

# pdf-inspector

`pdf-inspector` is a Rust PDF parser (by Firecrawl) exposed as a CLI. It does two things fast (~10–50ms/doc) and locally:

1. **Classify** a PDF — `TextBased`, `Scanned`, `ImageBased`, or `Mixed`, plus which pages need OCR.
2. **Extract** the text layer into clean Markdown — headings, lists, tables, multi-column layouts, CID fonts.

It does **not** do OCR. On a scanned PDF it will correctly tell you there is nothing to extract, which is the point: classify first, and don't waste a pass trying to read pixels as text.

## When to reach for this vs. native Read

| Situation | Use |
|---|---|
| "What does this contract say?" — one PDF, a few pages | native `Read` |
| 300-page manual, need §4 only | `pdf-inspector extract --pages` |
| 40 invoices → 40 `.md` files | this skill, in a loop |
| Text extraction came back empty/garbled | `pdf-inspector detect` to find out why |
| Output must feed a script, index, or diff | this skill (`--json`, `-o`) |

## Running it

No install step needed — `npx` fetches a prebuilt native binary (macOS arm64, Linux x64, Windows x64):

```bash
npx -y @firecrawl/pdf-inspector@latest --help
```

If it will be used repeatedly, install it once so later calls are instant:

```bash
npm install -g @firecrawl/pdf-inspector
```

Both give a `pdf-inspector` command. Use `npx -y @firecrawl/pdf-inspector@latest` in place of `pdf-inspector` below if it is not installed globally.

## Commands

**Classify — always cheap, run it first when the PDF's provenance is unknown:**

```bash
pdf-inspector detect report.pdf --json
```

Returns `pdfType`, `pageCount`, `confidence` (0.0–1.0), and `pagesNeedingOcr` (array of page numbers with no text operators).

**Extract to Markdown:**

```bash
pdf-inspector extract report.pdf
pdf-inspector extract report.pdf -o report.md
pdf-inspector extract report.pdf --pages 1,3,5
pdf-inspector extract report.pdf --json
cat report.pdf | pdf-inspector extract -
```

`extract` is the default subcommand, so `pdf-inspector report.pdf` also works. Flags: `--json`, `--pages <list>`, `-o/--output <file>`, `-h`, `-v`.

## How to use it in a task

1. **Detect before extracting** on any PDF you did not create.
   - `TextBased` → extract; the Markdown will be good.
   - `Mixed` → extract, then check `pagesNeedingOcr` and tell the user which pages came back empty.
   - `Scanned` / `ImageBased` → **stop**. Do not report an empty extraction as "the PDF is empty." Say the PDF is a scan with no text layer and that OCR is required; pdf-inspector cannot read it.
2. **Extract to a file, not to stdout**, when the PDF is long — dumping 200 pages of Markdown into the conversation wastes the context you need for the actual work. Write it with `-o`, then read the slice you need.
3. **Narrow with `--pages`** whenever the target section is known.
4. **Batch** with a shell loop:

```bash
for f in ./pdfs/*.pdf; do
  npx -y @firecrawl/pdf-inspector@latest extract "$f" -o "./out/$(basename "${f%.pdf}").md"
done
```

## Other bindings

Same engine, if a script needs it in-process rather than by shelling out:

- Node: `npm i @firecrawl/pdf-inspector` → `processPdf(buffer)` returns `{ pdfType, markdown }`; `classifyPdf(buffer)`.
- Python: `pip install pdf-inspector` → `pdf_inspector.process_pdf("doc.pdf")`.
- Rust: `cargo add pdf-inspector`. `cargo install pdf-inspector` also builds the standalone `pdf2md` and `detect-pdf` binaries, which take slightly different flags than the npm CLI (`pdf2md doc.pdf --compact`, `detect-pdf doc.pdf --analyze --json`).

Source and docs: https://github.com/firecrawl/pdf-inspector (MIT).
