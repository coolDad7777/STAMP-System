import { z } from 'zod';
import { config as dotenvConfig } from 'dotenv';

// Load environment variables
dotenvConfig();

// Configuration schema with validation
const configSchema = z.object({
  // Server configuration
  NODE_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  API_HOST: z.string().default('localhost:3000'),
  ALLOWED_ORIGINS: z.string().default('http://localhost:3001,http://localhost:3000'),

  // Database configuration
  DATABASE_URL: z.string().default('postgres://stamp_user:secure_dev_password@localhost:5432/stamp_dev'),
  DB_POOL_SIZE: z.coerce.number().default(20),
  DB_TIMEOUT: z.coerce.number().default(30000),
  DB_SSL: z.coerce.boolean().default(false),

  // Redis configuration
  REDIS_URL: z.string().default('redis://localhost:6379'),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.coerce.number().default(0),
  REDIS_TTL: z.coerce.number().default(3600), // 1 hour

  // Cryptography configuration
  JWT_SECRET: z.string().min(32).default('dev_jwt_secret_32_characters_long_change_in_production'),
  ENCRYPTION_KEY: z.string().length(32).default('dev_encryption_key_32_bytes_long'),
  TSCB_MASTER_KEY: z.string().default('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'),
  HSM_PKCS11_LIB: z.string().optional(),
  HSM_SLOT: z.coerce.number().default(0),
  HSM_PIN: z.string().optional(),

  // Geohash configuration
  GEOHASH_PRECISION: z.coerce.number().default(7),
  LOCATION_TOLERANCE_METERS: z.coerce.number().default(200),
  SESSION_MIN_DURATION_MS: z.coerce.number().default(2700000), // 45 minutes
  SESSION_MAX_DURATION_MS: z.coerce.number().default(14400000), // 4 hours

  // QR Code configuration
  QR_ROTATION_INTERVAL_MS: z.coerce.number().default(30000), // 30 seconds
  QR_EXPIRY_MS: z.coerce.number().default(14400000), // 4 hours

  // Rate limiting
  RATE_LIMIT_MAX: z.coerce.number().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000), // 1 minute

  // Logging configuration
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  LOG_FORMAT: z.enum(['json', 'text']).default('json'),

  // Security configuration
  BCRYPT_ROUNDS: z.coerce.number().default(12),
  SESSION_TIMEOUT_MS: z.coerce.number().default(900000), // 15 minutes
  MFA_ISSUER: z.string().default('STAMP System'),

  // Audit configuration
  AUDIT_RETENTION_DAYS: z.coerce.number().default(2555), // 7 years
  DATA_RETENTION_DAYS: z.coerce.number().default(2555),
  ANONYMIZATION_SCHEDULE_CRON: z.string().default('0 2 * * 0'), // Weekly at 2 AM

  // Monitoring configuration
  METRICS_ENABLED: z.coerce.boolean().default(true),
  PROMETHEUS_PORT: z.coerce.number().default(9090),
  HEALTH_CHECK_INTERVAL_MS: z.coerce.number().default(30000),

  // External services
  NOTIFICATION_SERVICE_URL: z.string().optional(),
  COURT_INTEGRATION_URL: z.string().optional(),
  
  // Development/Testing flags
  BYPASS_HSM: z.coerce.boolean().default(false),
  MOCK_LOCATION: z.coerce.boolean().default(false),
  DISABLE_RATE_LIMITING: z.coerce.boolean().default(false)
});

// Validate and export configuration
export const config = configSchema.parse(process.env);

// Type export for TypeScript
export type Config = z.infer<typeof configSchema>;

// Derived configuration values
export const isDevelopment = config.NODE_ENV === 'development';
export const isProduction = config.NODE_ENV === 'production';
export const isStaging = config.NODE_ENV === 'staging';

// Security validations for production
if (isProduction) {
  if (config.JWT_SECRET === 'dev_jwt_secret_change_in_production') {
    throw new Error('JWT_SECRET must be changed in production');
  }
  
  if (config.ENCRYPTION_KEY === 'dev_encryption_key_32_bytes_long') {
    throw new Error('ENCRYPTION_KEY must be changed in production');
  }
  
  if (config.BYPASS_HSM) {
    throw new Error('BYPASS_HSM must be false in production');
  }
  
  if (!config.DB_SSL) {
    console.warn('WARNING: Database SSL is disabled in production');
  }
}