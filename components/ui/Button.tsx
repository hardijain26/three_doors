import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "tonal" | "outlined" | "text" | "accent" | "danger";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  children: ReactNode;
};

export function Button({ variant, className = "", children, ...props }: ButtonProps) {
  const variantClass = variant ? ` ${variant}` : "";
  return (
    <button className={`btn${variantClass}${className ? ` ${className}` : ""}`} {...props}>
      {children}
    </button>
  );
}
