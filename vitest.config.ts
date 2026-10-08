import { defineConfig } from 'vitest/config';

// Standalone config (no app plugins) so the pure-logic society tests run fast
// in a Node environment without the React/Tailwind/relay dev pipeline.
export default defineConfig({
  test: {
    include: ['src/core/society/**/*.test.ts', 'src/core/llm/**/*.test.ts', 'src/data/**/*.test.ts', 'src/simulation/**/*.test.ts', 'src/replay/**/*.test.ts', 'src/alexa/**/*.test.ts', 'src/interface/**/*.test.ts', 'server/**/*.test.ts'],
    environment: 'node',
  },
});
