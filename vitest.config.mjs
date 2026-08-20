import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js', 'test/**/*.test.js'],
    exclude: ['node_modules', '.agents', '.antigravity', '.git', 'dist'],
    environment: 'node',
    testTimeout: 10000,
    globals: true
  }
});
