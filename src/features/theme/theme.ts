export const THEME_STORAGE_KEY = "admin-portal-theme";

export const THEME_CHOICES = ["light", "dark", "system"] as const;
export type ThemeChoice = (typeof THEME_CHOICES)[number];

/** What the user actually sees, once "system" has been resolved. */
export type ResolvedTheme = "light" | "dark";

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return (
    typeof value === "string" &&
    (THEME_CHOICES as readonly string[]).includes(value)
  );
}

/**
 * Inline script that runs before first paint.
 *
 * Without this the page renders with the default (light) palette for one
 * frame and then snaps to dark — the "white flash" that makes a themed app
 * feel broken. It stamps `data-theme` on <html> only for an explicit choice;
 * "system" deliberately leaves the attribute off so the CSS
 * prefers-color-scheme media query stays in charge.
 *
 * Kept deliberately tiny and dependency-free: it is inlined into the HTML and
 * runs synchronously, so every byte is blocking.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});var r=document.documentElement;if(t==="light"||t==="dark"){r.setAttribute("data-theme",t);r.style.colorScheme=t;}else{r.removeAttribute("data-theme");r.style.colorScheme="light dark";}}catch(e){}})();`;
