import type { HTMLAttributes } from "react";

export function Card({ className = "", ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-[28px] border border-ink/10 bg-card p-5 shadow-[0_10px_28px_rgb(70_50_20/0.05)] ${className}`}
      {...rest}
    />
  );
}
