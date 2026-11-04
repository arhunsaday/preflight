import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['tests/support/temporary-root.ts'],
    coverage: {provider: 'v8'},
  },
});
