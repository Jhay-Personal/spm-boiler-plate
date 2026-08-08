import { describe, expect, it } from "vitest";
import {
  THEME_CHOICES,
  THEME_INIT_SCRIPT,
  THEME_STORAGE_KEY,
  isThemeChoice,
} from "@/features/theme/theme";

describe("theme choices", () => {
  it("offers light, dark and system", () => {
    expect([...THEME_CHOICES]).toEqual(["light", "dark", "system"]);
  });

  it.each(THEME_CHOICES)("accepts %s", (choice) => {
    expect(isThemeChoice(choice)).toBe(true);
  });

  it.each(["", "LIGHT", "auto", null, undefined, 1, {}])(
    "rejects %j so a corrupted localStorage value falls back safely",
    (value) => {
      expect(isThemeChoice(value)).toBe(false);
    },
  );
});

describe("no-flash init script", () => {
  it("is a self-contained IIFE, safe to inline", () => {
    expect(THEME_INIT_SCRIPT.startsWith("(function()")).toBe(true);
    expect(THEME_INIT_SCRIPT.endsWith("})();")).toBe(true);
  });

  it("reads the same storage key the provider writes", () => {
    expect(THEME_INIT_SCRIPT).toContain(JSON.stringify(THEME_STORAGE_KEY));
  });

  it("removes data-theme for system so the media query stays in charge", () => {
    // Setting data-theme="system" would break the CSS, which keys off the
    // attribute being absent.
    expect(THEME_INIT_SCRIPT).toContain('removeAttribute("data-theme")');
    expect(THEME_INIT_SCRIPT).not.toContain('"system")');
  });

  it("only ever stamps the two concrete themes", () => {
    expect(THEME_INIT_SCRIPT).toContain('t==="light"||t==="dark"');
  });

  it("is wrapped in try/catch, since localStorage throws in private mode", () => {
    expect(THEME_INIT_SCRIPT).toContain("try{");
    expect(THEME_INIT_SCRIPT).toContain("catch");
  });

  it("contains no closing script tag that could break out of the tag", () => {
    expect(THEME_INIT_SCRIPT.toLowerCase()).not.toContain("</script");
  });

  it("stays small enough to inline without hurting first paint", () => {
    expect(THEME_INIT_SCRIPT.length).toBeLessThan(600);
  });
});
