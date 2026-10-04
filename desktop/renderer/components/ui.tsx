import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  X,
  ArrowUpRight,
  LoaderCircle,
  FolderOpen,
  TriangleAlert,
} from "lucide-react";
import type { ReactNode, ButtonHTMLAttributes } from "react";
export function Button({
  children,
  variant = "secondary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  return (
    <button className={`button ${variant} ${className}`} {...props}>
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
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <FolderOpen size={30} />
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
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  children: ReactNode;
  wide?: boolean;
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
        <DialogPrimitive.Content className={`dialog ${wide ? "wide" : ""}`}>
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
export function Json({ value }: { value: unknown }) {
  return (
    <pre className="code">
      {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
    </pre>
  );
}
export function Busy({ label }: { label: string }) {
  return (
    <span className="busy">
      <LoaderCircle size={15} className="spin" />
      {label}
    </span>
  );
}
export function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="notice">
      <TriangleAlert size={17} />
      <div>{children}</div>
    </div>
  );
}
export function Link({ url, children }: { url: string; children: ReactNode }) {
  return (
    <button
      className="text-link"
      onClick={() => void window.adk.openExternal(url).catch(() => {})}
    >
      {children}
      <ArrowUpRight size={13} />
    </button>
  );
}
