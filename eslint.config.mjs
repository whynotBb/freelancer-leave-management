import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // 중첩된 git worktree(.claude/worktrees/**)의 .next 빌드 산출물이 스캔되는 것을 방지
    "**/.next/**",
    ".claude/**",
  ]),
]);

export default eslintConfig;
