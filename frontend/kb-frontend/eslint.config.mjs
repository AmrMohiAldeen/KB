import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: [
      "src/@core/components/customizer/**/*.{ts,tsx}",
      "src/@core/components/mui/**/*.{ts,tsx}",
      "src/@core/components/option-menu/**/*.{ts,tsx}",
      "src/@menu/**/*.{ts,tsx}",
      "tailwind.config.js",
    ],
    rules: {
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
      "react/display-name": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "src/_template_reference/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
