"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

type ModalProps = {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  /** Visual treatment — `danger` is used by the error dialog. */
  tone?: "default" | "danger";
};

// Everything focusable that a Tab press should reach. `:not([disabled])`
// matters: a disabled "Saving…" button must not swallow the wrap-around.
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

export default function Modal({
  title,
  onClose,
  children,
  footer,
  wide = false,
  tone = "default",
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  // Which element the overlay's mousedown landed on. A drag that starts inside
  // the dialog and ends on the overlay must NOT close it — that gesture is a
  // text selection, and closing discards whatever the user has typed.
  const pressedOnOverlay = useRef(false);
  const headingId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialog?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;

      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );
      if (focusable.length === 0) {
        // Nothing to move to; keep focus on the panel rather than letting it
        // escape to the page underneath.
        event.preventDefault();
        return;
      }

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;

      if (event.shiftKey && (active === first || active === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      // Send the caret back where it came from, so closing a dialog does not
      // dump a keyboard user at the top of the document.
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      className="modal-overlay"
      onMouseDown={(event) => {
        pressedOnOverlay.current = event.target === event.currentTarget;
      }}
      onMouseUp={(event) => {
        const shouldClose =
          pressedOnOverlay.current && event.target === event.currentTarget;
        pressedOnOverlay.current = false;
        if (shouldClose) onClose();
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className={
          "modal" + (wide ? " wide" : "") + (tone === "danger" ? " danger" : "")
        }
      >
        <div className="modal-head">
          <h3 id={headingId}>{title}</h3>
          <button
            type="button"
            className="close-x"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}
