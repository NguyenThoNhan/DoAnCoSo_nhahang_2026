// tests/helpers/mockDb.js
// Mock toàn bộ kết nối database — test không cần MySQL thật chạy

jest.mock('../../config/database', () => ({
  pool: {
    execute: jest.fn(),
    getConnection: jest.fn(() =>
      Promise.resolve({
        execute:          jest.fn(),
        beginTransaction: jest.fn(),
        commit:           jest.fn(),
        rollback:         jest.fn(),
        release:          jest.fn(),
      })
    ),
  },
}));