import * as React from "react";
import { ChevronDownIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/** shadcn/ui NativeSelect: a styled <select>, so values stay plain strings. */
function NativeSelect({
  className,
  wrapperClassName,
  ...props
}: React.ComponentProps<"select"> & { wrapperClassName?: string }) {
  return (
    <div
      data-slot="native-select-wrapper"
      className={cn(
        "group/native-select relative w-fit min-w-0 has-[select:disabled]:opacity-50",
        wrapperClassName,
      )}
    >
      <select
        data-slot="native-select"
        className={cn(
          "h-8 w-full min-w-0 cursor-pointer appearance-none rounded-md border border-input bg-background py-1 pr-8 pl-2.5 text-[13px] text-foreground transition-[color,border-color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed",
          "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25",
          "aria-invalid:border-destructive aria-invalid:ring-destructive/20",
          className,
        )}
        {...props}
      />
      <ChevronDownIcon
        className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-muted-foreground select-none"
        aria-hidden="true"
      />
    </div>
  );
}

function NativeSelectOption(props: React.ComponentProps<"option">) {
  return <option data-slot="native-select-option" {...props} />;
}

export { NativeSelect, NativeSelectOption };
