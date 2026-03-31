import { defineConfig } from "cypress";

export default defineConfig({
e2e: {
    baseUrl: "http://localhost:3000",
    viewportWidth: 1280,
    viewportHeight: 720,
    specPattern: "cypress/e2e/**/*.{js,jsx,ts,tsx}",
    supportFile: "cypress/support/e2e.js",
    video: false,
    screenshotOnRunFailure: true,
    videoCompression: false,
    retries: {
      runMode: 1,    
      openMode: 0    
    },
    // defaultCommandTimeout: 5000,
    // pageLoadTimeout: 60000,
    // responseTimeout: 30000,
    // requestTimeout: 5000,
    
  env: {
    apiUrl: "http://localhost:8000",
    username: "testuser",
    password: "testpassword"
  },

    setupNodeEvents(on, config) {
      on('task', {
        log(message) {
          console.log(message);
          return null;
        }
      });
      return config;
    }
  }
});
