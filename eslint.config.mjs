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
  // services·infra 는 Next.js 를 모른다 (모바일 앱 대비, 결정 0033).
  // Next.js 서버 기능은 src/app 에만 둔다. 테스트 파일도 같은 규칙.
  {
    files: ["src/services/**", "src/infra/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["next", "next/*"],
              message:
                "src/services·src/infra 에는 Next.js 코드를 넣지 마세요. Next.js 기능은 src/app 에만 둡니다 (결정 0033, docs/ARCHITECTURE.md).",
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
    // 시안 원본 (Claude Design 내보내기). 검사하지 않는다.
    "design/**",
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
