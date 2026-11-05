import { useEffect, useMemo, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Search, CornerDownLeft, ArrowUp, ArrowDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface PaletteEntry {
  id: string;
  label: string;
  group: string;
  icon: LucideIcon;
  hint?: string;
  keywords?: string;
  run: () => void;
}

/** Every query word must appear; labels that start with the query rank first. */
function score(entry: PaletteEntry, query: string) {
  if (!query) return 1;
  const label = entry.label.toLowerCase();
  const haystack =
    `${label} ${entry.keywords ?? ""} ${entry.group}`.toLowerCase();
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.every((word) => haystack.includes(word))) return 0;
  const first = label.indexOf(words[0]!);
  return first === 0 ? 3 : first > 0 ? 2 : 1;
}

export function CommandPalette({
  open,
  onClose,
  entries,
}: {
  open: boolean;
  onClose: () => void;
  entries: PaletteEntry[];
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
    }
  }, [open]);
  const results = useMemo(
    () =>
      entries
        .map((entry, index) => ({ entry, index, rank: score(entry, query) }))
        .filter((item) => item.rank > 0)
        .sort((a, b) =>
          query ? b.rank - a.rank || a.index - b.index : a.index - b.index,
        )
        .map((item) => item.entry),
    [entries, query],
  );
  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    list.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);
  const choose = (entry: PaletteEntry | undefined) => {
    if (!entry) return;
    onClose();
    entry.run();
  };
  let group = "";
  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="dialog-overlay" />
        <DialogPrimitive.Content className="dialog palette">
          <DialogPrimitive.Title className="sr-only">
            Go to…
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Search views and actions, then press Enter.
          </DialogPrimitive.Description>
          <div className="palette-search">
            <Search size={18} />
            <input
              autoFocus
              aria-label="Find a view or action"
              role="combobox"
              aria-expanded="true"
              aria-controls="palette-results"
              aria-activedescendant={
                results[active] ? `palette-${results[active].id}` : undefined
              }
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search views and actions…"
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((i) => Math.min(i + 1, results.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((i) => Math.max(i - 1, 0));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  choose(results[active]);
                }
              }}
            />
          </div>
          <div
            className="palette-body"
            id="palette-results"
            role="listbox"
            ref={list}
          >
            {results.map((entry, index) => {
              const heading = entry.group !== group;
              group = entry.group;
              return (
                <div key={entry.id}>
                  {heading && (
                    <div className="palette-group-label" aria-hidden="true">
                      {entry.group}
                    </div>
                  )}
                  <button
                    type="button"
                    role="option"
                    id={`palette-${entry.id}`}
                    data-index={index}
                    aria-selected={index === active}
                    className={`palette-item ${index === active ? "active" : ""}`}
                    onMouseMove={() => setActive(index)}
                    onClick={() => choose(entry)}
                  >
                    <entry.icon size={17} />
                    {entry.label}
                    {entry.hint && <small>{entry.hint}</small>}
                  </button>
                </div>
              );
            })}
            {!results.length && (
              <div className="palette-empty">
                No view or action matches “{query}”.
              </div>
            )}
          </div>
          <div className="palette-footer" aria-hidden="true">
            <span>
              <ArrowUp size={12} />
              <ArrowDown size={12} /> move
            </span>
            <span>
              <CornerDownLeft size={12} /> open
            </span>
            <span>
              <kbd>esc</kbd> close
            </span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
