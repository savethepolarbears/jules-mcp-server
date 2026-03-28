/// <reference types="vitest" />
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    include: ["src/**/*.test.ts"],
    exclude: ["node_modules", "dist", "pieces"],
    testTimeout: 10_000,
    restoreMocks: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/__tests__/**", "src/types/**"],
      thresholds: {
        lines: 60,
        branches: 50,
        functions: 65,
        statements: 55,
      },
    },
  },
});
