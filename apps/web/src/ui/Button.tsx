import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "ghost" | "primary" | "danger";

export function Button({
  variant = "ghost",
  className = "",
  children,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; children: ReactNode }) {
  return (
    <button type={type} className={`dc-btn dc-btn-${variant} ${className}`.trim()} {...props}>
      {children}
    </button>
  );
}
