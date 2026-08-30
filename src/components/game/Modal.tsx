"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

export function Modal({
  title,
  onClose,
  children,
  maxWidthClassName = "max-w-md",
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  maxWidthClassName?: string;
}) {
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  useEffect(() => {
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <div
      className="coindle-backdrop-in fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      {/* Mobile: bottom sheet flush to the edges with a drag handle.
          sm+: centered dialog, unconstrained by viewport edges. */}
      <div
        className={`coindle-sheet-in flex w-full ${maxWidthClassName} max-h-[88dvh] flex-col overflow-hidden rounded-t-2xl border border-border-strong bg-panel sm:max-h-[85vh] sm:rounded-2xl`}
        style={{ boxShadow: "var(--shadow-elevated)" }}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex shrink-0 flex-col px-5 pt-3 sm:pt-5">
          <div className="mx-auto mb-2 h-1 w-10 shrink-0 rounded-full bg-border-strong sm:hidden" aria-hidden />
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="-mr-1.5 flex h-9 w-9 items-center justify-center rounded-full text-text-faint transition-colors hover:bg-elevated hover:text-text sm:h-8 sm:w-8"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="coindle-safe-bottom min-h-0 overflow-y-auto px-5 pb-5 pt-4">
          {children}
        </div>
      </div>
    </div>
  );
}
