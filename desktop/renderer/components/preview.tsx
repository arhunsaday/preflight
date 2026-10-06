import {
  FilePlus2,
  FileEdit,
  FileMinus2,
  Plus,
  Minus,
  PenLine,
} from "lucide-react";
import { summarize } from "../../../src/ui/preview";
import type { Prepared } from "../../protocol";
import { plural, tildify } from "../format";
import { Button, Dialog, Json, Notice } from "./ui";
const changeIcon = (kind: string) =>
  /add|creat/i.test(kind) ? Plus : /remov|delet/i.test(kind) ? Minus : PenLine;
/** Commands whose effects leave this machine or a package manager. */
const irreversible = ["install", "share", "revoke", "git"];
export function Preview({
  prepared,
  busy,
  home,
  onClose,
  onConfirm,
}: {
  prepared: Prepared | null;
  busy: boolean;
  home?: string | undefined;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const summary = prepared ? summarize(prepared.value) : null;
  return (
    <Dialog
      open={!!prepared}
      onClose={() => {
        if (!busy) onClose();
      }}
      title="Review changes"
      description="Nothing is written until you apply. Check the operation and affected files first."
      wide
    >
      <div className="dialog-body">
        <div className="command-line">adk {prepared?.args.join(" ")}</div>
        {prepared?.note && <Notice>{prepared.note}</Notice>}
        {summary ? (
          <>
            <div className="preview-stats">
              <strong>
                {plural(summary.changes.length, "resource change")}
              </strong>
              <span>{plural(summary.files.length, "file")} affected</span>
            </div>
            {summary.warnings.map((warning, i) => (
              <Notice key={i}>{warning}</Notice>
            ))}
            {summary.changes.length > 0 && (
              <div className="file-list">
                {summary.changes.map((change) => {
                  const Icon = changeIcon(change.kind);
                  return (
                    <div className="file-row" key={change.id}>
                      <Icon size={15} />
                      <span>{change.name}</span>
                      <small>{change.kind}</small>
                    </div>
                  );
                })}
              </div>
            )}
            {summary.files.length > 0 && (
              <div className="file-list">
                {summary.files.map((file) => (
                  <div
                    className={`file-row ${file.status}`}
                    key={file.path}
                    title={file.path}
                  >
                    {file.status === "created" ? (
                      <FilePlus2 size={16} />
                    ) : file.status === "deleted" ? (
                      <FileMinus2 size={16} />
                    ) : (
                      <FileEdit size={16} />
                    )}
                    <span>{tildify(file.path, home)}</span>
                    <b className="additions">+{file.added}</b>
                    <b className="deletions">−{file.removed}</b>
                  </div>
                ))}
              </div>
            )}
            {!summary.files.length && !summary.changes.length && (
              <p className="muted">This operation does not change any file.</p>
            )}
            <details>
              <summary>Full preview</summary>
              <Json value={prepared?.value} />
            </details>
          </>
        ) : (
          <Json value={prepared?.value} />
        )}
      </div>
      <div className="dialog-footer">
        <span className="hint">
          {prepared && irreversible.includes(prepared.args[0] ?? "")
            ? "External effects of this operation are not reversed by rollback."
            : "Configuration writes are journaled and can be rolled back."}
        </span>
        <Button disabled={busy} onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" disabled={busy} onClick={onConfirm}>
          {busy ? "Applying…" : "Apply changes"}
        </Button>
      </div>
    </Dialog>
  );
}
