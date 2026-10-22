import type { HTMLAttributes } from "react";

export function Card({ className = "", ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`rounded-3xl border border-ink/10 bg-agar-deep/60 p-5 ${className}`} {...rest} />;
}
