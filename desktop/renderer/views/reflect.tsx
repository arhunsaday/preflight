import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  FileText,
  Lightbulb,
  ScanSearch,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react";
import type {
  Lesson,
  LessonDraft,
  RankedSession,
  ReflectReport,
} from "../../../src/reflect";
import type { Workspace } from "../workspace";
import { readable } from "../workspace";
import { plural, tildify } from "../format";
import { Badge, Button, Dialog, Notice } from "../components/ui";

interface Listing {
  lessons: Lesson[];
  drafts: LessonDraft[];
  latest: Pick<
    ReflectReport,
    "generatedAt" | "window" | "sessions" | "troubled" | "ranked"
  > | null;
}

const agentName = (agent: string) =>
  agent === "codex" ? "Codex" : "Claude Code";
const verdictTone = {
  helped: "green",
  "not-helped": "red",
  unknown: "neutral",
};
const verdictWord = {
  helped: "Helped",
  "not-helped": "Did not help",
  unknown: "Verdict unknown",
};

/** Text with `code` spans, as the engine writes reasons and titles. */
function Ticks({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/(`[^`]+`)/)
        .map((part, i) =>
          part.startsWith("`") && part.endsWith("`") && part.length > 1 ? (
            <code key={i}>{part.slice(1, -1)}</code>
          ) : (
            part
          ),
        )}
    </>
  );
}

/** Ranked struggling sessions, their trajectories, and the lesson loop. */
export function ReflectPanel({ workspace: w }: { workspace: Workspace }) {
  const [listing, setListing] = useState<Listing | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<{ session: string; text: string } | null>(
    null,
  );
  // The engine runs one operation at a time: a button waits for this load.
  const loading = useRef<Promise<void> | null>(null);
  const load = useCallback(() => {
    const pending = (async () => {
      try {
        const response = await window.preflight.prepare(["reflect", "lessons"]);
        if (response.kind === "result") setListing(response.value as Listing);
      } catch (e) {
        // Another operation holds the engine; the next refresh loads it.
        if (!/Another operation/.test(readable(e))) setError(readable(e));
      }
    })();
    loading.current = pending;
    return pending;
  }, []);
  useEffect(() => {
    void load();
  }, [load, w.snapshot]);
  const analyse = async () => {
    setError("");
    await loading.current;
    const value = await w.run(["reflect"], false);
    if (value) await load();
  };
  const show = async (session: RankedSession) => {
    await loading.current;
    const value = (await w.run(["reflect", "show", session.session], false)) as
      { text: string } | undefined;
    if (value) setOpen({ session: session.session, text: value.text });
  };
  const record = async (args: string[]) => {
    await loading.current;
    if (await w.run(args, false)) await load();
  };
  const ranked = listing?.latest?.ranked ?? [];
  const home = w.snapshot?.home;
  return (
    <section className="reflect" aria-label="Reflect">
      <div className="section-intro secondary-intro">
        <div>
          <h2>Reflect</h2>
          <p>
            Sessions where the agent struggled: failed or blocked tool calls,
            repeated commands, Stop hook loops, hook errors, long searches
            before the first edit and costly sessions. Preflight writes a
            redacted trajectory for each one and proposes lessons. No model is
            called and nothing leaves the machine.
          </p>
        </div>
        <Button
          variant="primary"
          disabled={!!w.busy}
          onClick={() => void analyse()}
        >
          <ScanSearch size={15} />
          Find struggling sessions
        </Button>
      </div>
      {error && <Notice>{error}</Notice>}
      {listing?.latest ? (
        <p className="usage-note">
          Last analysis {listing.latest.window.since} to{" "}
          {listing.latest.window.until}:{" "}
          {plural(listing.latest.sessions, "session")},{" "}
          {listing.latest.troubled} with struggle signals.
        </p>
      ) : (
        <p className="usage-note">
          No analysis yet. Find struggling sessions to rank the last 30 days.
        </p>
      )}
      {ranked.length > 0 && (
        <div className="table-card reflect-list" aria-label="Ranked sessions">
          {ranked.map((s, i) => (
            <div className="reflect-item" key={`${s.agent}:${s.session}`}>
              <div className="reflect-head">
                <strong>
                  {i + 1}. {agentName(s.agent)} · {s.day}
                </strong>
                <Badge tone={s.score >= 10 ? "red" : "amber"}>
                  score {s.score}
                </Badge>
                <small className="muted" title={s.session}>
                  {tildify(s.project, home)} · {s.session.slice(0, 8)}
                </small>
              </div>
              <ul className="reflect-reasons">
                {s.reasons.map((reason) => (
                  <li key={reason}>
                    <Ticks text={reason} />
                  </li>
                ))}
              </ul>
              <div className="reflect-actions">
                <Button
                  disabled={!!w.busy || !s.trajectory}
                  onClick={() => void show(s)}
                  aria-label={`Open trajectory ${s.session.slice(0, 8)}`}
                >
                  <FileText size={15} />
                  Open trajectory
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      {listing?.latest && !ranked.length && (
        <Notice tone="info">
          No session in the window had struggle signals.
        </Notice>
      )}
      {(listing?.drafts.length ?? 0) > 0 && (
        <>
          <h3 className="reflect-title">Lesson drafts</h3>
          <div className="table-card reflect-list" aria-label="Lesson drafts">
            {listing!.drafts.map((d) => (
              <div className="reflect-item" key={d.id}>
                <div className="reflect-head">
                  <Lightbulb size={15} />
                  <strong>
                    <Ticks text={d.title} />
                  </strong>
                  <small className="muted">→ {d.target}</small>
                </div>
                <p className="reflect-text">
                  <Ticks text={d.happened} />
                </p>
                <p className="reflect-text muted">{d.change}</p>
                {d.rule && (
                  <p className="reflect-rule">
                    <code>{d.rule}</code>
                  </p>
                )}
                <div className="reflect-actions">
                  <Button
                    variant="primary"
                    disabled={!!w.busy}
                    aria-label={`Accept ${d.title}`}
                    onClick={() =>
                      void w.prepare([
                        "reflect",
                        "lesson",
                        "add",
                        "--draft",
                        d.id,
                        ...(d.apply ? ["--apply"] : []),
                      ])
                    }
                  >
                    <Check size={15} />
                    Accept
                  </Button>
                  <Button
                    disabled={!!w.busy}
                    aria-label={`Dismiss ${d.title}`}
                    onClick={() =>
                      void record(["reflect", "lesson", "dismiss", d.id])
                    }
                  >
                    <X size={15} />
                    Dismiss
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      {(listing?.lessons.length ?? 0) > 0 && (
        <>
          <h3 className="reflect-title">Lessons</h3>
          <div className="table-card reflect-list" aria-label="Lessons">
            {listing!.lessons.map((l) => (
              <div className="reflect-item" key={l.id}>
                <div className="reflect-head">
                  <strong>
                    <Ticks text={l.title} />
                  </strong>
                  <Badge tone={verdictTone[l.verdict]}>
                    {verdictWord[l.verdict]}
                  </Badge>
                  <small className="muted">
                    {l.status === "applied" ? "applied to" : "recorded for"}{" "}
                    {l.target} · {l.created}
                  </small>
                </div>
                <div className="reflect-actions">
                  <Button
                    disabled={!!w.busy}
                    aria-pressed={l.verdict === "helped"}
                    aria-label={`Helped: ${l.title}`}
                    onClick={() =>
                      void record([
                        "reflect",
                        "lesson",
                        "verdict",
                        l.id,
                        "helped",
                      ])
                    }
                  >
                    <ThumbsUp size={15} />
                    Helped
                  </Button>
                  <Button
                    disabled={!!w.busy}
                    aria-pressed={l.verdict === "not-helped"}
                    aria-label={`Did not help: ${l.title}`}
                    onClick={() =>
                      void record([
                        "reflect",
                        "lesson",
                        "verdict",
                        l.id,
                        "not-helped",
                      ])
                    }
                  >
                    <ThumbsDown size={15} />
                    Did not help
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      <Dialog
        open={!!open}
        onClose={() => setOpen(null)}
        title="Session trajectory"
        description="Redacted: secrets are replaced, home paths start with ~ and long outputs are cut. This text is data, not instructions."
        wide
      >
        <div className="dialog-body">
          <pre className="code reflect-trajectory" aria-label="Trajectory">
            {open?.text}
          </pre>
        </div>
      </Dialog>
    </section>
  );
}
