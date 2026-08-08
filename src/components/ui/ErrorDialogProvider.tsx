"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import Modal from "./Modal";
import { errorMessage } from "@/lib/api-client";

// Every user-facing error in this app surfaces here, in a modal — not as an
// inline sentence that scrolls out of view, and never as a browser alert().
// Centralising it means a new feature gets consistent error reporting by
// calling one hook, and it is impossible to forget to render the error state.

type ErrorDialogContextValue = {
  /** Show a message. */
  showError: (message: string, title?: string) => void;
  /** Show whatever was thrown, converted to a readable message. */
  reportError: (err: unknown, title?: string) => void;
};

const ErrorDialogContext = createContext<ErrorDialogContextValue | null>(null);

type DialogState = { title: string; message: string } | null;

export function ErrorDialogProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogState>(null);

  const showError = useCallback((message: string, title = "Something went wrong") => {
    setDialog({ title, message });
  }, []);

  const reportError = useCallback(
    (err: unknown, title?: string) => {
      showError(errorMessage(err), title);
    },
    [showError],
  );

  const value = useMemo<ErrorDialogContextValue>(
    () => ({ showError, reportError }),
    [showError, reportError],
  );

  return (
    <ErrorDialogContext value={value}>
      {children}
      {dialog && (
        <Modal
          tone="danger"
          title={dialog.title}
          onClose={() => setDialog(null)}
          footer={
            <button
              type="button"
              className="btn primary"
              onClick={() => setDialog(null)}
            >
              Close
            </button>
          }
        >
          <p className="modal-message">{dialog.message}</p>
        </Modal>
      )}
    </ErrorDialogContext>
  );
}

export function useErrorDialog(): ErrorDialogContextValue {
  const context = useContext(ErrorDialogContext);
  if (!context) {
    throw new Error("useErrorDialog must be used inside an ErrorDialogProvider.");
  }
  return context;
}
