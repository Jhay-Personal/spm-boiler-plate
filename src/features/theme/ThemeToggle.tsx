"use client";

import { useTheme } from "./ThemeProvider";
import { THEME_CHOICES, type ThemeChoice } from "./theme";

const LABELS: Record<ThemeChoice, { icon: string; text: string }> = {
  light: { icon: "☀️", text: "Light" },
  dark: { icon: "🌙", text: "Dark" },
  system: { icon: "🖥️", text: "System" },
};

/**
 * Three-way theme switch.
 *
 * "System" is a first-class option rather than the absence of a choice, so a
 * user who wants to follow their OS can say so explicitly and see that it
 * took effect.
 */
export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { choice, setChoice } = useTheme();

  return (
    <div
      className={"theme-toggle" + (compact ? " compact" : "")}
      role="radiogroup"
      aria-label="Colour theme"
    >
      {THEME_CHOICES.map((option) => {
        const { icon, text } = LABELS[option];
        const active = choice === option;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={text}
            title={`${text} theme`}
            className={"theme-option" + (active ? " active" : "")}
            onClick={() => setChoice(option)}
          >
            <span aria-hidden="true">{icon}</span>
            {!compact && <span className="theme-option-text">{text}</span>}
          </button>
        );
      })}
    </div>
  );
}
