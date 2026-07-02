import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      vscode: fileURLToPath(new URL("./test/vscodeMock.ts", import.meta.url)),
    },
  },
  test: {
    globals: true,
    restoreMocks: true,
    include: ["test/**/*.test.ts"],
  },
});
