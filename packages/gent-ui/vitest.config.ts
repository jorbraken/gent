import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    restoreMocks: true,
    include: ["test/**/*.test.ts"],
  },
});
