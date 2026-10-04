import { FilePlus2, FileEdit, FileMinus2, Check } from "lucide-react";
import { summarize } from "../../../src/ui/preview";
import type { Prepared } from "../../protocol";
import { Button, Dialog, Json, Notice } from "./ui";
export function Preview({
  prepared,
  busy,
  onClose,
  onConfirm,
}: {
  prepared: Prepared | null;
  busy: boolean;
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
      description="Check the operation and affected files before applying."
      wide
    >
      <div className="dialog-body">
        <div className="command-line">adk {prepared?.args.join(" ")}</div>
        {prepared?.note && <Notice>{prepared.note}</Notice>}
        {summary ? (
          <>
            <div className="preview-stats">
              <strong>{summary.changes.length} resource changes</strong>
              <span>{summary.files.length} files affected</span>
            </div>
            {summary.warnings.map((warning, i) => (
              <Notice key={i}>{warning}</Notice>
            ))}
            <div className="file-list">
              {summary.files.map((file) => (
                <div className="file-row" key={file.path}>
                  {file.status === "created" ? (
                    <FilePlus2 size={17} />
                  ) : file.status === "deleted" ? (
                    <FileMinus2 size={17} />
                  ) : (
                    <FileEdit size={17} />
                  )}
                  <span>{file.path}</span>
                  <b className="additions">+{file.added}</b>
                  <b className="deletions">−{file.removed}</b>
                </div>
              ))}
            </div>
            {summary.changes.map((change) => (
              <div className="change-row" key={change.id}>
                <Check size={14} />
                <b>{change.name}</b>
                <span>{change.kind}</span>
              </div>
            ))}
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
