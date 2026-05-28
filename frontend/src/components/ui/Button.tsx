import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<Variant, string> = {
  primary:
    "bg-amber-brand text-white hover:bg-amber-brand-dark shadow-sm disabled:opacity-50",
  secondary:
    "bg-cream-100 text-brown-800 border border-cream-200 hover:bg-cream-200",
  ghost: "text-brown-700 hover:bg-cream-100",
  danger: "bg-red-600 text-white hover:bg-red-700",
};

export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: Variant;
}) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
