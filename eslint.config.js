/**
 * eslint.config.js — flat ESLint configuration.
 *
 * JS recommended + typescript-eslint recommended, nothing stylistic:
 * formatting is Prettier's job (.prettierrc), so no formatting rules live
 * here and the two tools never fight.
 */
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // Generated/installed/output folders are never linted.
    ignores: ["node_modules/", "dist/", "logs/", "assets/", "data/"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  }
);
