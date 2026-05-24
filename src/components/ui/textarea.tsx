import * as React from "react"

import { cn } from "@/lib/utils"

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

/**
 * Textarea that grows with its content instead of showing a scrollbar.
 * Modern browsers use the native `field-sizing: content` CSS rule;
 * older browsers fall back to a JS resize handler that bumps the height
 * to match `scrollHeight` on every value change. `rows` still works
 * as a minimum height.
 */
const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, value, defaultValue, onChange, onInput, rows, ...props }, ref) => {
    const innerRef = React.useRef<HTMLTextAreaElement | null>(null);
    React.useImperativeHandle(ref, () => innerRef.current as HTMLTextAreaElement);

    const supportsFieldSizing = React.useMemo(
      () => typeof window !== "undefined" && typeof CSS !== "undefined" && CSS.supports?.("field-sizing", "content"),
      []
    );

    const resize = React.useCallback(() => {
      if (supportsFieldSizing) return;
      const ta = innerRef.current;
      if (!ta) return;
      ta.style.height = "auto";
      ta.style.height = `${ta.scrollHeight}px`;
    }, [supportsFieldSizing]);

    React.useLayoutEffect(() => { resize(); }, [value, defaultValue, resize]);

    return (
      <textarea
        ref={innerRef}
        rows={rows}
        value={value}
        defaultValue={defaultValue}
        onChange={(e) => { onChange?.(e); resize(); }}
        onInput={(e) => { onInput?.(e); resize(); }}
        className={cn(
          "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          "resize-none overflow-hidden [field-sizing:content]",
          !rows && "min-h-[80px]",
          className
        )}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }
