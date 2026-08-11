// The toast queue, as a pure reducer.
//
// `now` is supplied by the caller rather than read here, so expiry is testable
// without fake timers and the module stays free of side effects — the same
// approach src/lib/rate-limit.ts takes.

export type ToastTone = "success" | "info";

export type Toast = {
  id: number;
  message: string;
  tone: ToastTone;
  expiresAt: number;
};

export type ToastState = {
  toasts: Toast[];
  nextId: number;
};

/** Beyond this many, the oldest is dropped — a stack taller than this is noise. */
export const TOAST_LIMIT = 3;

/** How long a toast stays up when it is neither hovered nor focused. */
export const TOAST_DURATION_MS = 5_000;

export const initialToastState: ToastState = { toasts: [], nextId: 1 };

export type ToastAction =
  | { type: "add"; message: string; tone: ToastTone; now: number }
  | { type: "dismiss"; id: number }
  | { type: "expire"; now: number }
  /**
   * Hovering pauses the countdown. Deadlines are absolute, so resuming has to
   * push every one forward by however long the pointer rested there — without
   * this, a toast held for ten seconds would vanish the moment you moved away,
   * which is the opposite of what pausing is for.
   */
  | { type: "resume"; heldForMs: number };

export function toastReducer(state: ToastState, action: ToastAction): ToastState {
  switch (action.type) {
    case "add": {
      const toast: Toast = {
        id: state.nextId,
        message: action.message,
        tone: action.tone,
        expiresAt: action.now + TOAST_DURATION_MS,
      };
      const toasts = [...state.toasts, toast];
      return {
        toasts: toasts.slice(Math.max(0, toasts.length - TOAST_LIMIT)),
        nextId: state.nextId + 1,
      };
    }
    case "dismiss": {
      const toasts = state.toasts.filter((t) => t.id !== action.id);
      // Same reference when nothing matched, so React can skip the re-render.
      return toasts.length === state.toasts.length ? state : { ...state, toasts };
    }
    case "expire": {
      const toasts = state.toasts.filter((t) => t.expiresAt > action.now);
      return toasts.length === state.toasts.length ? state : { ...state, toasts };
    }
    case "resume": {
      if (action.heldForMs <= 0 || state.toasts.length === 0) return state;
      return {
        ...state,
        toasts: state.toasts.map((t) => ({
          ...t,
          expiresAt: t.expiresAt + action.heldForMs,
        })),
      };
    }
  }
}
