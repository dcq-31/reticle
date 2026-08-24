"use client";

import type { ReactNode } from "react";

interface PanelGroupProps {
  readonly title: string;
  readonly children: ReactNode;
  readonly className?: string;
}

export function PanelGroup({ title, children, className }: PanelGroupProps): React.ReactElement {
  return (
    <section className={`mb-4 ${className ?? ""}`}>
      <h3 className="text-faint border-line mb-2 flex items-center gap-2 text-[10px] tracking-[0.16em] uppercase">
        <span>{title}</span>
        <span aria-hidden className="bg-line h-px flex-1" />
      </h3>
      {children}
    </section>
  );
}

interface RowProps {
  readonly label?: string;
  readonly children: ReactNode;
  readonly className?: string;
}

export function Row({ label, children, className }: RowProps): React.ReactElement {
  return (
    <div
      className={`mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2 ${className ?? ""}`}
    >
      {label !== undefined ? (
        <label className="text-dim w-auto flex-none text-[11px] sm:w-15.5">{label}</label>
      ) : null}
      {children}
    </div>
  );
}

interface ChipProps {
  readonly on?: boolean;
  readonly onClick?: () => void;
  readonly children: ReactNode;
  readonly title?: string;
  readonly disabled?: boolean;
}

export function Chip({
  on = false,
  onClick,
  children,
  title,
  disabled,
}: ChipProps): React.ReactElement {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={
        "border-line-bright cursor-pointer rounded-full border px-2.5 py-1 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-50 " +
        (on
          ? "border-accent text-accent bg-[rgba(45,212,191,0.14)]"
          : "bg-surface-2 text-dim hover:text-fg hover:border-[#3a4b5a]")
      }
    >
      {children}
    </button>
  );
}

interface HintProps {
  readonly children: ReactNode;
}

export function Hint({ children }: HintProps): React.ReactElement {
  return <p className="text-faint mt-1 text-[10.5px] leading-relaxed">{children}</p>;
}
