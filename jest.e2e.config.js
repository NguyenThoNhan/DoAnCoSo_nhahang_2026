/** Cấu hình Jest riêng cho Selenium E2E — cần server + MySQL thật */
module.exports = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/tests/e2e/setup.js'],
  testMatch: ['**/tests/e2e/**/*.e2e.test.js'],
  testTimeout: 120000,
  verbose: true,
};
