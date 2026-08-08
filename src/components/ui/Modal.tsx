"use client";

import { useEffect, useRef, type ReactNode } from "react";

type ModalProps = {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  /** Visual treatment — `danger` is used by the error dialog. */
  tone?: "default" | "danger";
};

export default function Modal({
  title,
  onClose,
  children,
  footer,
  wide = false,
  tone = "default",
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Escape closes, and focus moves into the dialog so keyboard users aren't
  // left behind on the page underneath.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    dialogRef.current?.focus();

    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={
          "modal" + (wide ? " wide" : "") + (tone === "danger" ? " danger" : "")
        }
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <h3>{title}</h3>
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
