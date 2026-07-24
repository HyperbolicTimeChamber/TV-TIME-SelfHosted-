import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.defineConfig(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // RN Animated.Value pattern: useRef().current is fine
      "react-hooks/refs": "off",
      // setState in effects is intentional for Firestore listener sync
      "react-hooks/set-state-in-effect": "off",
      // Not using React Compiler — disable all compiler-specific rules
      "react-hooks/immutability": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/static-components": "off",
      // Allow unused vars prefixed with _
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Allow any for gradual typing
      "@typescript-eslint/no-explicit-any": "off",
      // Allow require() in config files
      "@typescript-eslint/no-require-imports": "off",
      // Allow empty catch blocks
      "no-empty": ["error", { allowEmptyCatch: true }],
      "@typescript-eslint/no-empty-function": "off",
      // No console.log in production (warn only)
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  { ignores: ["node_modules/", "ios/", "android/", "dist/", ".expo/"] },
);
