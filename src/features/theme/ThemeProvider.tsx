"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  THEME_STORAGE_KEY,
  isThemeChoice,
  type ResolvedTheme,
  type ThemeChoice,
} from "./theme";

type ThemeContextValue = {
  /** What the user picked: light, dark, or follow the OS. */
  choice: ThemeChoice;
  /** What that currently resolves to. */
  resolved: ResolvedTheme;
  setChoice: (choice: ThemeChoice) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

// Both the stored preference and the OS setting are external stores that
// React does not own, so they are read with useSyncExternalStore rather than
// copied into state inside an effect. That keeps server and client renders
// consistent (both start at "system") without a setState-in-effect cascade,
// and it means a theme change in another tab propagates to this one.

type Listener = () => void;

const listeners = new Set<Listener>();

function notify(): void {
  for (const listener of listeners) listener();
}

function readStoredChoice(): ThemeChoice {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeChoice(stored) ? stored : "system";
  } catch {
    // Private browsing can throw on localStorage access.
    return "system";
  }
}

function subscribeToChoice(listener: Listener): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY) notify();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

// Server render has no localStorage; "system" matches what the inline script
// in the root layout assumes before it runs.
const choiceServerSnapshot = (): ThemeChoice => "system";

const DARK_QUERY = "(prefers-color-scheme: dark)";

function subscribeToSystem(listener: Listener): () => void {
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}

function systemSnapshot(): ResolvedTheme {
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

const systemServerSnapshot = (): ResolvedTheme => "light";

function applyChoice(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === "system") {
    // No attribute at all — the prefers-color-scheme media query takes over.
    root.removeAttribute("data-theme");
    root.style.colorScheme = "light dark";
  } else {
    root.setAttribute("data-theme", choice);
    root.style.colorScheme = choice;
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const choice = useSyncExternalStore(
    subscribeToChoice,
    readStoredChoice,
    choiceServerSnapshot,
  );

  const systemResolved = useSyncExternalStore(
    subscribeToSystem,
    systemSnapshot,
    systemServerSnapshot,
  );

  const setChoice = useCallback((next: ThemeChoice) => {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // The preference won't persist, but the current page still switches.
    }
    applyChoice(next);
    notify();
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      choice,
      resolved: choice === "system" ? systemResolved : choice,
      setChoice,
    }),
    [choice, systemResolved, setChoice],
  );

  return <ThemeContext value={value}>{children}</ThemeContext>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used inside a ThemeProvider.");
  }
  return context;
}
