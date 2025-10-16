import type { ESLint, Linter } from "eslint";
import noDuplicateTypeDeclaration from "./rules/no-duplicate-type-declaration";
import preferInterfaceExtension from "./rules/prefer-interface-extension";

export const rules = {
  "no-duplicate-type-declaration": noDuplicateTypeDeclaration,
  "prefer-interface-extension": preferInterfaceExtension,
};

const plugin = {
  meta: {
    name: "eslint-plugin-type-checker",
    version: "0.0.0",
  },
  rules,
};

export const configs: Record<string, Linter.FlatConfig[]> = {
  recommended: [
    {
      name: "type-checker/recommended",
      plugins: {
        "type-checker": plugin as unknown as ESLint.Plugin,
      },
      rules: {
        "type-checker/no-duplicate-type-declaration": "warn",
        "type-checker/prefer-interface-extension": "warn",
      },
    },
  ],
};

export default plugin;
