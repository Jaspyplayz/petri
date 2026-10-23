import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-culture-deep text-agar hover:bg-ink",
  secondary: "bg-agar-deep text-ink hover:bg-agar-deep/70 border border-ink/10",
  ghost: "bg-transparent text-ink hover:bg-agar-deep",
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly variant?: ButtonVariant;
};

export function Button({ variant = "primary", className = "", type = "button", ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${variantClasses[variant]} ${className}`}
      {...rest}
    />
  );
}
