import { describe, expect, it } from "vitest";
import {
  TOAST_DURATION_MS,
  TOAST_LIMIT,
  initialToastState,
  toastReducer,
  type ToastState,
} from "@/lib/toasts";

function add(state: ToastState, message: string, now = 1_000): ToastState {
  return toastReducer(state, { type: "add", message, tone: "success", now });
}

describe("toastReducer", () => {
  it("adds a toast with an incrementing id and a deadline", () => {
    const state = add(initialToastState, "Saved.");
    expect(state.toasts).toHaveLength(1);
    expect(state.toasts[0]).toMatchObject({
      id: 1,
      message: "Saved.",
      tone: "success",
      expiresAt: 1_000 + TOAST_DURATION_MS,
    });
    expect(add(state, "Again.").toasts[1]?.id).toBe(2);
  });

  it("drops the oldest toast once the limit is exceeded", () => {
    let state = initialToastState;
    for (let i = 1; i <= TOAST_LIMIT + 1; i += 1) state = add(state, `#${i}`);
    expect(state.toasts).toHaveLength(TOAST_LIMIT);
    expect(state.toasts[0]?.message).toBe("#2");
    expect(state.toasts.at(-1)?.message).toBe(`#${TOAST_LIMIT + 1}`);
  });

  it("dismisses by id and ignores an unknown id", () => {
    const state = add(add(initialToastState, "a"), "b");
    expect(toastReducer(state, { type: "dismiss", id: 1 }).toasts).toHaveLength(1);
    expect(toastReducer(state, { type: "dismiss", id: 99 })).toBe(state);
  });

  it("expires only toasts past their deadline", () => {
    const state = add(add(initialToastState, "old", 1_000), "new", 4_000);
    const expired = toastReducer(state, {
      type: "expire",
      now: 1_000 + TOAST_DURATION_MS + 1,
    });
    expect(expired.toasts.map((t) => t.message)).toEqual(["new"]);
  });

  it("returns the same state when nothing has expired", () => {
    const state = add(initialToastState, "still fresh", 1_000);
    expect(toastReducer(state, { type: "expire", now: 1_500 })).toBe(state);
  });

  it("pushes deadlines forward by however long the stack was held", () => {
    const state = add(initialToastState, "hovered", 1_000);
    const resumed = toastReducer(state, { type: "resume", heldForMs: 10_000 });

    // Without the shift this toast would already be past its deadline, and
    // would disappear the instant the pointer left it.
    expect(resumed.toasts[0]?.expiresAt).toBe(1_000 + TOAST_DURATION_MS + 10_000);
    expect(toastReducer(resumed, { type: "expire", now: 12_000 }).toasts).toHaveLength(
      1,
    );
  });

  it("ignores a resume that held for no time and one with nothing queued", () => {
    const state = add(initialToastState, "a", 1_000);
    expect(toastReducer(state, { type: "resume", heldForMs: 0 })).toBe(state);
    expect(
      toastReducer(initialToastState, { type: "resume", heldForMs: 500 }),
    ).toBe(initialToastState);
  });
});
