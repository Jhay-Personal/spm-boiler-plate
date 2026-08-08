// eslint-config-next 16 ships native flat config, so it is spread directly —
// no FlatCompat wrapper (which is for legacy .eslintrc-style configs).
import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescriptConfig from "eslint-config-next/typescript";

const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "data/**",
      "next-env.d.ts",
    ],
  },
  ...coreWebVitals,
  ...typescriptConfig,
  {
    rules: {
      // Profile photos are served from our own authenticated route and are
      // already size-capped at upload; next/image's optimizer adds nothing.
      "@next/next/no-img-element": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
];

export default config;
