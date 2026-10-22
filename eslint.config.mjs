import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // domain 은 바깥(화면·DB·네트워크)을 모른다. docs/ARCHITECTURE.md 참고.
  {
    files: ["src/domain/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "next",
                "next/*",
                "react",
                "react/*",
                "react-dom",
                "react-dom/*",
                "@supabase/*",
                "**/infra",
                "**/infra/**",
                "**/services",
                "**/services/**",
                "**/app",
                "**/app/**",
              ],
              message:
                "src/domain 은 화면·DB·네트워크를 모릅니다. 순수 함수만 두세요 (docs/ARCHITECTURE.md).",
            },
          ],
        },
      ],
    },
  },
  prettier,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
