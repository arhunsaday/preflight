import {
  ArrowUpRight,
  FolderOpen,
  TriangleAlert,
  Info,
  CheckCircle2,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import type { Toast } from "../workspace";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription } from "./ui/alert";
import { Badge as BadgeBase } from "./ui/badge";
import { Button as ButtonBase } from "./ui/button";
import {
  Dialog as DialogRoot,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
  Empty as EmptyBase,
  EmptyContent,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "./ui/empty";
import { Spinner } from "./ui/spinner";

// The app's primitives, built on shadcn/ui (components/ui). Views keep these
// short names; the look comes from the shadcn components and theme tokens.

const buttonVariant = {
  primary: "default",
  secondary: "outline",
  ghost: "ghost",
  danger: "destructive",
} as const;
export function Button({
  variant = "secondary",
  size,
  ...props
}: Omit<ComponentProps<typeof ButtonBase>, "variant"> & {
  variant?: keyof typeof buttonVariant;
}) {
  return <ButtonBase variant={buttonVariant[variant]} size={size} {...props} />;
}
const badgeTone = {
  neutral: "outline",
  info: "info",
  blue: "blue",
  green: "green",
  amber: "amber",
  orange: "amber",
  red: "red",
} as const;
export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: string;
  className?: string;
}) {
  return (
    <BadgeBase
      variant={badgeTone[tone as keyof typeof badgeTone] ?? "outline"}
      className={cn("badge", className)}
    >
      {children}
    </BadgeBase>
  );
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
    <EmptyBase className="empty">
      <EmptyMedia>
        <Icon />
      </EmptyMedia>
      <EmptyTitle>{title}</EmptyTitle>
      <EmptyDescription>{description}</EmptyDescription>
      {action && <EmptyContent>{action}</EmptyContent>}
    </EmptyBase>
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
    <DialogRoot
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <DialogContent
        className={cn(
          "dialog flex max-h-[calc(100vh-64px)] flex-col gap-0 overflow-hidden p-0",
          wide ? "sm:max-w-[820px]" : "sm:max-w-[540px]",
          className,
        )}
      >
        <DialogHeader className="dialog-heading px-[22px] pt-5 pr-14 pb-1.5">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </DialogRoot>
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
    <span
      className="busy flex items-center gap-1.5 pr-2 text-xs text-muted-foreground"
      role="status"
    >
      <Spinner aria-hidden="true" />
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
    <Alert
      variant={tone === "info" ? "default" : "warning"}
      role={tone === "info" ? "note" : "alert"}
      className="notice"
    >
      <Icon />
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}
export function Link({ url, children }: { url: string; children: ReactNode }) {
  return (
    <ButtonBase
      variant="link"
      className="text-link"
      onClick={() => void window.preflight.openExternal(url).catch(() => {})}
    >
      {children}
      <ArrowUpRight className="size-[13px]" />
    </ButtonBase>
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
/** A shadcn/ui dropdown menu behind a secondary button. */
export function Menu({
  label,
  trigger,
  children,
}: {
  label: string;
  trigger: ReactNode;
  children: ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button aria-label={label}>{trigger}</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">{children}</DropdownMenuContent>
    </DropdownMenu>
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
        <div
          className="toast pointer-events-auto flex w-[340px] animate-in fade-in-0 slide-in-from-bottom-1.5 items-center gap-2.5 rounded-lg border bg-popover py-2.5 pr-2.5 pl-3 text-[13px] font-medium shadow-md"
          key={toast.id}
        >
          <CheckCircle2 className="size-[17px] text-success" />
          <span className="flex-1">{toast.text}</span>
          <ButtonBase
            variant="ghost"
            size="icon-sm"
            className="size-6"
            aria-label="Dismiss notification"
            onClick={() => dismiss(toast.id)}
          >
            <X className="size-3.5" />
          </ButtonBase>
        </div>
      ))}
    </div>
  );
}
