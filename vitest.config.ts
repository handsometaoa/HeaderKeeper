import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// lib/ 均为纯函数（不依赖 browser/#imports），只需 @/ 别名
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
