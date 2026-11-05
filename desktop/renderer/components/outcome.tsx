import { CheckCircle2, Copy, ExternalLink } from "lucide-react";
import type { Workspace } from "../workspace";
import { Button, Dialog, Json } from "./ui";

const shareUrl = (value: unknown) =>
  typeof value === "object" &&
  value !== null &&
  "url" in value &&
  typeof value.url === "string" &&
  /^https?:\/\//.test(value.url)
    ? value.url
    : null;

/** The result of a read-only command, or the receipt of an applied change. */
export function OutcomeDialog({ workspace: w }: { workspace: Workspace }) {
  const outcome = w.outcome;
  const url = shareUrl(outcome?.value);
  const close = () => w.setOutcome(undefined);
  return (
    <Dialog
      open={outcome !== undefined && !w.prepared}
      onClose={close}
      title="Operation result"
      description={
        outcome?.applied
          ? "Changes were written. Roll back from Activity if needed."
          : "The result returned by the shared Preflight command engine."
      }
      wide
    >
      <div className="dialog-body">
        {outcome?.applied && (
          <div className="result-summary">
            <CheckCircle2 size={22} />
            <div>
              <strong>{w.describe(outcome.args)}</strong>
              <span className="path">preflight {outcome.args[0]}</span>
            </div>
          </div>
        )}
        {url && (
          <>
            <h3>Your share link</h3>
            <div className="share-link">
              <code>{url}</code>
              <Button
                onClick={() =>
                  void window.preflight
                    .copyText(url)
                    .then(() => w.notify("Link copied"))
                }
              >
                <Copy size={14} />
                Copy link
              </Button>
              <Button onClick={() => void window.preflight.openExternal(url)}>
                <ExternalLink size={14} />
                Open share
              </Button>
            </div>
          </>
        )}
        {outcome?.applied ? (
          <details>
            <summary>Technical details</summary>
            <Json value={outcome.value} />
          </details>
        ) : (
          <Json value={outcome?.value} />
        )}
      </div>
      <div className="dialog-footer">
        <Button
          variant="ghost"
          onClick={() =>
            void window.preflight
              .copyText(JSON.stringify(outcome?.value, null, 2) ?? "")
              .then(() => w.notify("Result copied"))
          }
        >
          <Copy size={14} />
          Copy JSON
        </Button>
        <Button variant="primary" autoFocus onClick={close}>
          Done
        </Button>
      </div>
    </Dialog>
  );
}
