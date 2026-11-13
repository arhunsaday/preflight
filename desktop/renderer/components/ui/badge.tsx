import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// shadcn/ui Badge with the desktop's signal tones. A status tone is a dot
// plus a word, never colour alone.
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center gap-1.5 overflow-hidden whitespace-nowrap rounded-sm border px-1.5 text-[11.5px] leading-[18px] font-semibold tabular-nums [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: "border-transparent bg-destructive text-white",
        outline: "border-border text-muted-foreground",
        blue: "border-transparent bg-accent-soft text-primary",
        info: "status-dot border-info-border bg-info-soft text-info",
        green: "status-dot border-success-border bg-success-soft text-success",
        amber: "status-dot border-warning-border bg-warning-soft text-warning",
        red: "status-dot border-danger-border bg-danger-soft text-danger",
      },
    },
    defaultVariants: {
      variant: "outline",
    },
  },
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span";
  return (
    <Comp
      data-slot="badge"
      className={cn(
        badgeVariants({ variant }),
        "[&.status-dot]:before:size-1.5 [&.status-dot]:before:shrink-0 [&.status-dot]:before:rounded-full [&.status-dot]:before:bg-current [&.status-dot]:before:content-['']",
        className,
      )}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
