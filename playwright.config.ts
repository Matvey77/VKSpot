import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './.local/test-results',
  workers: 1,
  timeout: 60000,
  reporter: 'list',
})
