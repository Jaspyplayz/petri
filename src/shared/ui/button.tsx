import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "poke" | "feed" | "lesson" | "tan";

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-culture-deep text-agar hover:bg-ink px-5 py-2.5 text-sm",
  secondary: "bg-agar-deep text-ink hover:bg-agar-deep/70 border border-ink/10 px-5 py-2.5 text-sm",
  ghost: "bg-transparent text-ink hover:bg-agar-deep px-5 py-2.5 text-sm",
  poke: "bg-poke text-poke-ink shadow-sm hover:brightness-95 px-8 py-3 text-base",
  feed: "bg-feed text-feed-ink shadow-sm hover:brightness-95 px-8 py-3 text-base",
  lesson: "bg-lesson text-lesson-ink shadow-sm hover:brightness-95 px-5 py-2.5 text-sm",
  tan: "bg-teach text-ink border border-ink/10 hover:brightness-95 px-5 py-2.5 text-sm",
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly variant?: ButtonVariant;
};

export function Button({ variant = "primary", className = "", type = "button", ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-full font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${variantClasses[variant]} ${className}`}
      {...rest}
    />
  );
}
