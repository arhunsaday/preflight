import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  X,
  ArrowUpRight,
  LoaderCircle,
  FolderOpen,
  TriangleAlert,
  Info,
  CheckCircle2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type ButtonHTMLAttributes,
} from "react";
import type { Toast } from "../workspace";
export function Button({
  children,
  variant = "secondary",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  return (
    <button type={type} className={`button ${variant} ${className}`} {...props}>
      {children}
    </button>
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function Empty({
  title,
  description,
  action,
  icon: Icon = FolderOpen,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon size={26} />
      </div>
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  wide = false,
  className = "",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  children: ReactNode;
  wide?: boolean;
  className?: string;
}) {
  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="dialog-overlay" />
        <DialogPrimitive.Content
          className={`dialog ${wide ? "wide" : ""} ${className}`}
        >
          <div className="dialog-heading">
            <div>
              <DialogPrimitive.Title>{title}</DialogPrimitive.Title>
              <DialogPrimitive.Description>
                {description}
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close
              className="icon-button"
              aria-label="Close dialog"
            >
              <X size={18} />
            </DialogPrimitive.Close>
          </div>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
const token =
  /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
/** Pretty JSON with light syntax colouring. Text content stays the exact JSON. */
export function Json({ value }: { value: unknown }) {
  const text =
    typeof value === "string" ? value : (JSON.stringify(value, null, 2) ?? "");
  if (typeof value === "string" || text.length > 200000)
    return <pre className="code">{text}</pre>;
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(token)) {
    const index = match.index ?? 0;
    if (index > last) parts.push(text.slice(last, index));
    const className = match[2]
      ? "json-key"
      : match[1]
        ? "json-string"
        : "json-literal";
    parts.push(
      <span className={className} key={index}>
        {match[1] ?? match[0]}
      </span>,
    );
    if (match[2]) parts.push(match[2]);
    last = index + match[0].length;
  }
  parts.push(text.slice(last));
  return <pre className="code">{parts}</pre>;
}
export function Busy({ label }: { label: string }) {
  return (
    <span className="busy" role="status">
      <LoaderCircle size={15} className="spin" />
      {label}
    </span>
  );
}
export function Notice({
  children,
  tone = "warning",
}: {
  children: ReactNode;
  tone?: "warning" | "info";
}) {
  const Icon = tone === "info" ? Info : TriangleAlert;
  return (
    <div className={`notice ${tone}`}>
      <Icon size={16} />
      <div>{children}</div>
    </div>
  );
}
export function Link({ url, children }: { url: string; children: ReactNode }) {
  return (
    <button
      type="button"
      className="text-link"
      onClick={() => void window.adk.openExternal(url).catch(() => {})}
    >
      {children}
      <ArrowUpRight size={13} />
    </button>
  );
}
/** Highlight the first case-insensitive occurrence of `query` in `text`. */
export function Highlight({ text, query }: { text: string; query: string }) {
  const needle = query.trim().toLowerCase();
  const index = needle ? text.toLowerCase().indexOf(needle) : -1;
  if (index < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, index)}
      <mark>{text.slice(index, index + needle.length)}</mark>
      {text.slice(index + needle.length)}
    </>
  );
}
/**
 * A small popover menu: opens from its trigger, closes on outside click,
 * Escape, or after an item runs.
 */
export function Menu({
  label,
  trigger,
  children,
}: {
  label: string;
  trigger: ReactNode;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const pointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
      }
    };
    document.addEventListener("pointerdown", pointer);
    document.addEventListener("keydown", key);
    ref.current
      ?.querySelector<HTMLButtonElement>(".dropdown button:not(:disabled)")
      ?.focus();
    return () => {
      document.removeEventListener("pointerdown", pointer);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  return (
    <div className="action-menu" ref={ref}>
      <Button
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {trigger}
      </Button>
      {open && (
        <div className="dropdown" role="menu">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
export function Toasts({
  toasts,
  dismiss,
}: {
  toasts: Toast[];
  dismiss: (id: number) => void;
}) {
  return (
    <div className="toast-region" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div className="toast" key={toast.id}>
          <CheckCircle2 size={17} />
          <span>{toast.text}</span>
          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={() => dismiss(toast.id)}
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
