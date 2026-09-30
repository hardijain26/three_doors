import type { HTMLAttributes, ReactNode } from "react";

type CardProps = HTMLAttributes<HTMLElement> & {
  children: ReactNode;
  variant?: "outlined" | "elevated" | "tight";
};

export function Card({ variant = "outlined", className = "", children, ...props }: CardProps) {
  const variantClass = variant === "outlined" ? "" : ` ${variant}`;
  return (
    <section className={`card${variantClass}${className ? ` ${className}` : ""}`} {...props}>
      {children}
    </section>
  );
}
