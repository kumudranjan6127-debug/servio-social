import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Seed the required env so modules that import src/config/env.ts (via
    // publish/logger) load without the startup process.exit(1). These are dummy
    // values that never leave the test process.
    env: {
      GEMINI_API_KEY: "test-gemini",
      BUFFER_API_KEY: "test-buffer",
      BUFFER_LINKEDIN_CHANNEL_ID: "li-test",
      BUFFER_INSTAGRAM_CHANNEL_ID: "ig-test",
    },
  },
});
