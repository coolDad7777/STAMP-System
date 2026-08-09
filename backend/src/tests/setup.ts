// Jest setup file for backend tests
import '@jest/globals';

// Set up test environment variables
process.env.NODE_ENV = 'development';
process.env.PORT = '3000';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/stamp_test';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
process.env.ENCRYPTION_KEY = '12345678901234567890123456789012'; // Exactly 32 characters
process.env.LOG_LEVEL = 'error';

// Add any global test setup here