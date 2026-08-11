import { describe, expect, it } from "vitest";
import { ICON_NAMES } from "@/components/icons";
import { MODULES } from "@/lib/modules";

describe("icon registry", () => {
  it("covers every module's icon", () => {
    // TypeScript already enforces this through `satisfies` in modules.ts, but a
    // cast there would slip past it and render a blank square in the sidebar.
    const missing = MODULES.map((m) => m.icon).filter(
      (icon) => !(ICON_NAMES as readonly string[]).includes(icon),
    );
    expect(missing).toEqual([]);
  });

  it("exposes the fifteen icons the app uses", () => {
    expect(ICON_NAMES).toHaveLength(15);
  });
});
