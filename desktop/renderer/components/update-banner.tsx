import { Button } from "./ui/button";
import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { initialUpdateState, updateBanner } from "../../updates";
import type { UpdateState } from "../../updates";

const releases = "https://github.com/arhunsaday/preflight/releases/latest";

/** A small card in the top-right corner; silent unless there is news. */
export function UpdateBanner() {
  const [state, setState] = useState<UpdateState>(initialUpdateState);
  useEffect(() => {
    let live = true;
    void window.preflight.updateState().then((s) => live && setState(s));
    const off = window.preflight.onUpdate(setState);
    return () => {
      live = false;
      off();
    };
  }, []);
  const banner = updateBanner(state);
  if (!banner) return null;
  return (
    <div
      className={`update-banner ${banner.tone}`}
      role="status"
      aria-live="polite"
    >
      <Download size={16} />
      <span>{banner.text}</span>
      {banner.action === "install" && (
        <Button size="sm" onClick={() => void window.preflight.installUpdate()}>
          Restart to update
        </Button>
      )}
      {banner.action === "releases" && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => void window.preflight.openExternal(releases)}
        >
          Open releases
        </Button>
      )}
      {state.status !== "downloading" && state.status !== "checking" && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Dismiss update notice"
          onClick={() => void window.preflight.dismissUpdate()}
        >
          <X size={14} />
        </Button>
      )}
    </div>
  );
}
