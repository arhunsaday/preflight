#!/usr/bin/env python3
"""Convert a board into a LikeC4 model (.c4).

Usage: diagram_to_likec4.py <input> <output.c4>

Two board formats carry their nodes and edges as structured data, so this script
converts them without a model reading the file:

- `.excalidraw` (JSON)
    rectangle / ellipse / diamond -> LikeC4 elements (kind: node)
    bound text (containerId) or the element's own text -> element title
    arrow / line with start and end bindings -> relationships
    arrow label text -> relationship label

- `.drawio` (mxGraph XML, plain or deflated)
    mxCell with vertex="1" -> LikeC4 elements (kind: node)
    the cell's value, with any HTML markup removed -> element title
    mxCell with edge="1" and both source and target -> relationships
    the edge's value -> relationship label

- `.drawio.svg` (a picture that carries the same model in its `content` attribute)
    the model is unwrapped first, then read exactly as a `.drawio` file

Mermaid (`.mmd`) is text that already names its nodes and edges in the source, so
the skill reads it directly and this script refuses it. BPMN (`.bpmn`) is a process
model rather than an architecture model, so it is not an input at all.

Only the intended .c4 is written; the source is never modified.
"""
import base64
import html
import json
import re
import sys
import xml.etree.ElementTree as ET
import zlib
from urllib.parse import unquote

SHAPE_TYPES = {"rectangle", "ellipse", "diamond"}
EDGE_TYPES = {"arrow", "line"}


def slugify(text: str, used: set) -> str:
    base = re.sub(r"[^a-zA-Z0-9]+", "_", text.strip()).strip("_").lower() or "node"
    if base[0].isdigit():
        base = "n_" + base
    name, i = base, 2
    while name in used:
        name, i = f"{base}_{i}", i + 1
    used.add(name)
    return name


def quote(text: str) -> str:
    """LikeC4 string literal — pick a quote char not present in the text."""
    if "'" not in text:
        return "'" + text + "'"
    if '"' not in text:
        return '"' + text + '"'
    return "'" + text.replace("'", "") + "'"


def read_excalidraw(path: str):
    """Return (nodes, rels) from an Excalidraw scene."""
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)
    elements = [e for e in data.get("elements", []) if not e.get("isDeleted")]

    # Text bound to a container (Excalidraw stores labels as separate text els).
    text_for = {}
    for el in elements:
        if el.get("type") == "text" and el.get("containerId"):
            text_for[el["containerId"]] = (el.get("text") or "").strip()

    used: set = set()
    nodes = {}  # excalidraw id -> (varname, title)
    for el in elements:
        if el.get("type") in SHAPE_TYPES:
            title = (el.get("text") or text_for.get(el.get("id"), "") or "Node").strip() or "Node"
            nodes[el["id"]] = (slugify(title, used), title)

    rels = []
    for el in elements:
        if el.get("type") in EDGE_TYPES:
            s = (el.get("startBinding") or {}).get("elementId")
            t = (el.get("endBinding") or {}).get("elementId")
            if s in nodes and t in nodes:
                label = (el.get("text") or text_for.get(el.get("id"), "") or "").strip()
                rels.append((nodes[s][0], nodes[t][0], label))
    return nodes, rels


def inflate_drawio(text: str) -> str:
    """Expand a deflated <diagram> body.

    draw.io writes the model as raw-deflate, base64, then percent-encoded. the host project
    writes it as plain XML, but a file that went through the draw.io desktop
    application or the hosted editor arrives compressed, and a converter that only
    reads the plain form would report every one of those as an empty diagram.
    """
    try:
        raw = zlib.decompress(base64.b64decode(text), -zlib.MAX_WBITS)
        return unquote(raw.decode("utf-8"))
    except Exception:
        return ""


def strip_markup(value: str) -> str:
    """A draw.io label may hold HTML. Keep the words, drop the tags."""
    text = re.sub(r"<br\s*/?>", " ", value, flags=re.I)
    text = re.sub(r"<[^>]+>", "", text)
    return re.sub(r"\s+", " ", html.unescape(text)).strip()


def unwrap_drawio_svg(source: str) -> str:
    """The model inside a `.drawio.svg`, or "" when the SVG carries none.

    draw.io can save a board as an SVG that holds its own source in the root
    element's `content` attribute. The file is then a picture any viewer renders and
    a board this script can still read. An SVG with no such attribute is only a
    picture, and returning "" is what stops it being reported as an empty diagram.
    """
    try:
        root = ET.fromstring(source)
    except ET.ParseError:
        return ""
    content = (root.get("content") or "").strip()
    return content if content.startswith("<") else ""


def read_drawio(path: str):
    """Return (nodes, rels) from a draw.io file, plain, deflated, or inside an SVG."""
    with open(path, encoding="utf-8") as fh:
        source = fh.read()
    if path.lower().endswith(".drawio.svg"):
        source = unwrap_drawio_svg(source)
        if not source:
            print(f"{path} is an SVG with no draw.io model in it", file=sys.stderr)
            sys.exit(1)
    root = ET.fromstring(source)

    cells = []
    # An .drawio file holds one <diagram> per page. Every page contributes, so a
    # two-page board becomes one model rather than half a model.
    for diagram in root.iter("diagram"):
        model = diagram.find("mxGraphModel")
        if model is None:
            expanded = inflate_drawio((diagram.text or "").strip())
            if not expanded:
                continue
            model = ET.fromstring(expanded)
        cells.extend(model.iter("mxCell"))
    if root.tag == "mxGraphModel":
        cells.extend(root.iter("mxCell"))

    used: set = set()
    nodes = {}
    for cell in cells:
        if cell.get("vertex") != "1":
            continue
        title = strip_markup(cell.get("value") or "") or "Node"
        nodes[cell.get("id")] = (slugify(title, used), title)

    rels = []
    for cell in cells:
        if cell.get("edge") != "1":
            continue
        s, t = cell.get("source"), cell.get("target")
        if s in nodes and t in nodes:
            rels.append((nodes[s][0], nodes[t][0], strip_markup(cell.get("value") or "")))
    return nodes, rels


# Longest suffix first: `.drawio.svg` must win over `.drawio` would-be matches
# and over a bare `.svg`, which is not a board at all.
READERS = {
    ".excalidraw": read_excalidraw,
    ".drawio.svg": read_drawio,
    ".drawio": read_drawio,
}


def main() -> None:
    if len(sys.argv) != 3:
        print("usage: diagram_to_likec4.py <input> <output.c4>", file=sys.stderr)
        sys.exit(2)
    src, dst = sys.argv[1], sys.argv[2]

    reader = next((fn for ext, fn in READERS.items() if src.lower().endswith(ext)), None)
    if reader is None:
        print(
            f"unsupported input: {src}\n"
            "This script reads .excalidraw, .drawio and .drawio.svg. A Mermaid or PlantUML "
            "source already names its nodes and edges, so read it directly instead. A "
            "BPMN board is a process model, not an architecture model.",
            file=sys.stderr,
        )
        sys.exit(2)

    nodes, rels = reader(src)

    out = ["specification {", "  element node", "}", "", "model {"]
    for _id, (var, title) in nodes.items():
        out.append(f"  {var} = node {quote(title)}")
    if nodes and rels:
        out.append("")
    for s, t, label in rels:
        out.append(f"  {s} -> {t} {quote(label)}" if label else f"  {s} -> {t}")
    out += ["}", "", "views {", "  view index {", "    title 'Landscape'", "    include *", "  }", "}"]

    with open(dst, "w", encoding="utf-8") as fh:
        fh.write("\n".join(out) + "\n")
    print(f"wrote {dst}: {len(nodes)} elements, {len(rels)} relationships")


if __name__ == "__main__":
    main()
