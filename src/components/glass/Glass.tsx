import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../utils/cn";

interface GlassPanelProps {
  className?: string;
  children: ReactNode;
  /** "default" = standard translucent, "soft" = lower blur, "heavy" = saturate 1.5, ideal for hero cards. */
  variant?: "default" | "soft" | "heavy";
}

const PANEL_KEY = {
  default: "glass",
  soft: "glass-soft",
  heavy: "glass-heavy",
} as const;

/** Translucent card with backdrop-blur. Accepts arbitrary children. */
export function GlassPanel({ className, children, variant = "default" }: GlassPanelProps) {
  return (
    <div className={cn(PANEL_KEY[variant], "rounded-2xl", className)}>
      {children}
    </div>
  );
}

/** Pill-shaped glass button. Defaults to subtle interactive motion. */
export function GlassButton({ className, children, variant = "default", ...rest }: GlassButtonProps) {
  const surface = variant === "subtle" ? "glass-soft" : "glass";
  return (
    <button
      type="button"
      {...rest}
      className={cn(
        surface,
        "rounded-full px-5 py-2.5 text-sm font-medium text-zinc-100",
        "hover:scale-[1.03] active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30",
        className,
      )}
    >
      {children}
    </button>
  );
}

type GlassButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "subtle";
};
