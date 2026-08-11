"use client";

import { useTheme } from "./ThemeProvider";
import { Icon, type IconName } from "@/components/icons";
import { THEME_CHOICES, type ThemeChoice } from "./theme";

const LABELS: Record<ThemeChoice, { icon: IconName; text: string }> = {
  light: { icon: "sun", text: "Light" },
  dark: { icon: "moon", text: "Dark" },
  system: { icon: "monitor", text: "System" },
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
            <span aria-hidden="true">
              <Icon name={icon} size={15} />
            </span>
            {!compact && <span className="theme-option-text">{text}</span>}
          </button>
        );
      })}
    </div>
  );
}
