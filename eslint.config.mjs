import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

const hooksConfig = reactHooks.configs["recommended-latest"];
const hooksConfigs = Array.isArray(hooksConfig) ? hooksConfig : [hooksConfig];

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "frontend/dist/**",
      "**/.next/**",
      "**/coverage/**",
      "next-env.d.ts",
    ],
    linterOptions: {
      // Fayl darajasidagi eslint-disable izohlari (kod hujjatlari sifatida
      // saqlanadi) eskirganda build'ni buzmasin.
      reportUnusedDisableDirectives: "off",
    },
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...hooksConfigs,
  {
    languageOptions: {
      // Quyidagi qoidalar eski (Next.js) konfigda ham o'chirilgan edi —
      // mavjud kod uslubini buzmaslik uchun saqlanadi.
      parserOptions: { ecmaVersion: "latest" },
    },
    rules: {
      // payment-schedule-parser'dagi belgilar toifasidagi ortiqcha
      // escape'lar uslubiy masala — xatti-harakatga ta'sir qilmaydi.
      "no-useless-escape": "off",
      // mutations.ts'da boshqaruv belgilarini tozalash regex'i ATAYLAB yozilgan.
      "no-control-regex": "off",
      // Bo'sh catch bloklari izoh bilan hujjatlashtirilgan noop'lar.
      "no-empty": ["error", { allowEmptyCatch: true }],
      // Ikonalar props'ni ataylab bo'sh destrukturalaydi.
      "no-empty-pattern": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrors: "none",
        },
      ],
    },
  },
  {
    files: ["frontend/**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  {
    files: ["backend/**/*.ts", "backend/**/*.mjs", "shared/**/*.ts", "tests/**/*.ts", "scripts/**/*.mjs", "*.mjs"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
);
