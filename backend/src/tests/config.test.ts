import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

/**
 * Config Tests
 *
 * backend/src/config/config.ts now ships safe development defaults for every
 * required value (DATABASE_URL, REDIS_URL, JWT_SECRET, ENCRYPTION_KEY,
 * TSCB_MASTER_KEY) so the backend can boot without a `.env` file, while still
 * refusing to start in production with those same placeholder values.
 *
 * Because the config module validates `process.env` and can throw at import
 * time, each test loads a fresh copy of the module (via `jest.resetModules`)
 * with a controlled environment.
 */

const CONFIG_MODULE_PATH = '../config/config';

const PROD_JWT_SECRET = 'y'.repeat(40);
const PROD_ENCRYPTION_KEY = 'x'.repeat(32);
const PROD_FACILITY_PRIVATE_KEY = 'f'.repeat(128);

describe('Backend configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  function loadConfigWithEnv(overrides: Record<string, string | undefined>) {
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(overrides)) {
      if (value !== undefined) {
        env[key] = value;
      }
    }
    process.env = env;
    return require(CONFIG_MODULE_PATH);
  }

  describe('development defaults', () => {
    it('applies safe development defaults when no env vars are set', () => {
      const { config, isDevelopment, isProduction, isStaging } = loadConfigWithEnv({});

      expect(config.NODE_ENV).toBe('development');
      expect(config.PORT).toBe(3000);
      expect(config.HOST).toBe('0.0.0.0');
      expect(config.DATABASE_URL).toBe('postgresql://stamp:stamp@localhost:5432/stamp_dev');
      expect(config.DB_TIMEOUT).toBe(2000);
      expect(config.REDIS_URL).toBe('redis://localhost:6379');
      expect(config.JWT_SECRET).toBe('dev_jwt_secret_change_in_production');
      expect(config.ENCRYPTION_KEY).toBe('dev_encryption_key_32_bytes_long');
      expect(config.TSCB_MASTER_KEY).toBe(
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
      );
      expect(config.FACILITY_PRIVATE_KEY).toBeUndefined();
      expect(config.GEOHASH_PRECISION).toBe(7);
      expect(config.SESSION_MIN_DURATION_MS).toBe(2700000);

      expect(isDevelopment).toBe(true);
      expect(isProduction).toBe(false);
      expect(isStaging).toBe(false);
    });

    it('coerces numeric and boolean env vars from strings', () => {
      const { config } = loadConfigWithEnv({
        PORT: '4000',
        DB_SSL: 'true',
        METRICS_ENABLED: 'false',
        RATE_LIMIT_MAX: '250'
      });

      expect(config.PORT).toBe(4000);
      expect(config.DB_SSL).toBe(true);
      expect(config.METRICS_ENABLED).toBe(false);
      expect(config.RATE_LIMIT_MAX).toBe(250);
    });

    it('allows overriding TSCB_MASTER_KEY and FACILITY_PRIVATE_KEY in development', () => {
      const customMasterKey = 'a'.repeat(64);
      const { config } = loadConfigWithEnv({
        TSCB_MASTER_KEY: customMasterKey,
        FACILITY_PRIVATE_KEY: PROD_FACILITY_PRIVATE_KEY
      });

      expect(config.TSCB_MASTER_KEY).toBe(customMasterKey);
      expect(config.FACILITY_PRIVATE_KEY).toBe(PROD_FACILITY_PRIVATE_KEY);
    });
  });

  describe('schema validation', () => {
    it('rejects an ENCRYPTION_KEY that is not exactly 32 characters', () => {
      expect(() => loadConfigWithEnv({ ENCRYPTION_KEY: 'too-short' })).toThrow();
    });

    it('rejects a JWT_SECRET shorter than 32 characters', () => {
      expect(() => loadConfigWithEnv({ JWT_SECRET: 'short-secret' })).toThrow();
    });

    it('rejects an unrecognized NODE_ENV value', () => {
      expect(() => loadConfigWithEnv({ NODE_ENV: 'qa' })).toThrow();
    });

    it('rejects an unrecognized LOG_LEVEL value', () => {
      expect(() => loadConfigWithEnv({ LOG_LEVEL: 'verbose' })).toThrow();
    });
  });

  describe('production safety checks', () => {
    it('throws when JWT_SECRET is left as the development default in production', () => {
      expect(() =>
        loadConfigWithEnv({
          NODE_ENV: 'production',
          ENCRYPTION_KEY: PROD_ENCRYPTION_KEY,
          FACILITY_PRIVATE_KEY: PROD_FACILITY_PRIVATE_KEY
        })
      ).toThrow('JWT_SECRET must be changed in production');
    });

    it('throws when ENCRYPTION_KEY is left as the development default in production', () => {
      expect(() =>
        loadConfigWithEnv({
          NODE_ENV: 'production',
          JWT_SECRET: PROD_JWT_SECRET,
          FACILITY_PRIVATE_KEY: PROD_FACILITY_PRIVATE_KEY
        })
      ).toThrow('ENCRYPTION_KEY must be changed in production');
    });

    it('throws when FACILITY_PRIVATE_KEY is missing in production', () => {
      expect(() =>
        loadConfigWithEnv({
          NODE_ENV: 'production',
          JWT_SECRET: PROD_JWT_SECRET,
          ENCRYPTION_KEY: PROD_ENCRYPTION_KEY
        })
      ).toThrow('FACILITY_PRIVATE_KEY must be set in production');
    });

    it('throws when BYPASS_HSM is true in production', () => {
      expect(() =>
        loadConfigWithEnv({
          NODE_ENV: 'production',
          JWT_SECRET: PROD_JWT_SECRET,
          ENCRYPTION_KEY: PROD_ENCRYPTION_KEY,
          FACILITY_PRIVATE_KEY: PROD_FACILITY_PRIVATE_KEY,
          BYPASS_HSM: 'true'
        })
      ).toThrow('BYPASS_HSM must be false in production');
    });

    it('loads successfully in production once all secrets are configured', () => {
      const { config, isProduction } = loadConfigWithEnv({
        NODE_ENV: 'production',
        JWT_SECRET: PROD_JWT_SECRET,
        ENCRYPTION_KEY: PROD_ENCRYPTION_KEY,
        FACILITY_PRIVATE_KEY: PROD_FACILITY_PRIVATE_KEY,
        DB_SSL: 'true'
      });

      expect(isProduction).toBe(true);
      expect(config.JWT_SECRET).toBe(PROD_JWT_SECRET);
      expect(config.ENCRYPTION_KEY).toBe(PROD_ENCRYPTION_KEY);
      expect(config.FACILITY_PRIVATE_KEY).toBe(PROD_FACILITY_PRIVATE_KEY);
    });

    it('warns but does not throw when DB_SSL is disabled in production', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

      expect(() =>
        loadConfigWithEnv({
          NODE_ENV: 'production',
          JWT_SECRET: PROD_JWT_SECRET,
          ENCRYPTION_KEY: PROD_ENCRYPTION_KEY,
          FACILITY_PRIVATE_KEY: PROD_FACILITY_PRIVATE_KEY
        })
      ).not.toThrow();

      expect(warnSpy).toHaveBeenCalledWith('WARNING: Database SSL is disabled in production');
      warnSpy.mockRestore();
    });

    it('does not run production checks outside of production', () => {
      // Even with every "bad" value set, staging/development should not throw.
      expect(() =>
        loadConfigWithEnv({
          NODE_ENV: 'staging',
          BYPASS_HSM: 'true'
        })
      ).not.toThrow();
    });
  });
});