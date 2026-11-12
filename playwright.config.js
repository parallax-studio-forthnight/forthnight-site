const { defineConfig } = require('@playwright/test');
const live = process.env.BASE_URL;
module.exports = defineConfig({
  testDir: 'tests',
  testMatch: /.*\.spec\.js/,
  timeout: 60000,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: live || 'http://localhost:4173',
    browserName: 'chromium',
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce',
    locale: 'nl-NL'
  },
  // Ook bij een live-controle draait de lokale server: het ontwerp (design/) staat niet online.
  webServer: { command: 'node tests/server.js', url: 'http://localhost:4173', reuseExistingServer: true }
});
