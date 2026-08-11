"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  TOAST_DURATION_MS,
  initialToastState,
  toastReducer,
  type ToastTone,
} from "@/lib/toasts";
import { Icon } from "@/components/icons";

// Confirmations live here; failures live in ErrorDialogProvider's modal. The
// split is deliberate: a success needs to be noticed and then go away on its
// own, while a failure needs to stop the user and be acknowledged.

type ToastContextValue = {
  showToast: (message: string, tone?: ToastTone) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(toastReducer, initialToastState);
  // Hovering or focusing the stack holds everything on screen, so a toast
  // cannot vanish from under the pointer on its way to the dismiss button.
  const [held, setHeld] = useState(false);
  const heldSince = useRef<number | null>(null);

  // No interval exists while held, so the countdown simply stops; `resume` then
  // repays the time. Reading `held` in the dependency list rather than through
  // a ref keeps this honest — the effect re-runs on every change of it.
  useEffect(() => {
    if (state.toasts.length === 0 || held) return;
    const timer = window.setInterval(() => {
      dispatch({ type: "expire", now: Date.now() });
    }, 250);
    return () => window.clearInterval(timer);
  }, [state.toasts.length, held]);

  const hold = useCallback(() => {
    if (heldSince.current === null) heldSince.current = Date.now();
    setHeld(true);
  }, []);

  const release = useCallback(() => {
    const since = heldSince.current;
    heldSince.current = null;
    if (since !== null) {
      dispatch({ type: "resume", heldForMs: Date.now() - since });
    }
    setHeld(false);
  }, []);

  const showToast = useCallback((message: string, tone: ToastTone = "success") => {
    dispatch({ type: "add", message, tone, now: Date.now() });
  }, []);

  const value = useMemo<ToastContextValue>(() => ({ showToast }), [showToast]);

  return (
    <ToastContext value={value}>
      {children}
      <div
        className="toast-region"
        role="status"
        aria-live="polite"
        onMouseEnter={hold}
        onMouseLeave={release}
        onFocusCapture={hold}
        onBlurCapture={release}
      >
        {state.toasts.map((toast) => (
          <div key={toast.id} className={"toast " + toast.tone} data-testid="toast">
            <span className="toast-message">{toast.message}</span>
            <button
              type="button"
              className="toast-dismiss"
              aria-label="Dismiss notification"
              onClick={() => dispatch({ type: "dismiss", id: toast.id })}
            >
              <Icon name="close" size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside a ToastProvider.");
  }
  return context;
}

export { TOAST_DURATION_MS };
