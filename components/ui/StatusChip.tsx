import type { HTMLAttributes, ReactNode } from "react";

type StatusTone = "default" | "ok" | "warn" | "hot" | "mute";

type StatusChipProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: StatusTone;
  children: ReactNode;
};

export function StatusChip({ tone = "default", className = "", children, ...props }: StatusChipProps) {
  const toneClass = tone === "default" ? "" : ` ${tone}`;
  return (
    <span className={`chip${toneClass}${className ? ` ${className}` : ""}`} {...props}>
      {children}
    </span>
  );
}
