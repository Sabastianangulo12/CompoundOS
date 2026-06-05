import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname
});

const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "member-app/.expo-web-export-smoke/**",
      "member-app/.expo-export-smoke/**",
      ".expo-web-export-smoke/**",
      ".expo-export-smoke/**"
    ]
  },
  ...compat.extends("next/core-web-vitals")
];

export default config;
