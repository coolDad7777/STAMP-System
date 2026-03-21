import { Pool, PoolClient } from 'pg';
import { config } from '../config/config';
import { logger } from '../utils/logger';

class DatabaseServiceClass {
  private pool: Pool | null = null;

  async initialize(): Promise<void> {
    try {
      this.pool = new Pool({
        connectionString: config.DATABASE_URL,
        max: config.DB_POOL_SIZE,
        idleTimeoutMillis: config.DB_TIMEOUT,
        ssl: config.DB_SSL ? { rejectUnauthorized: false } : false
      });
      
      await this.pool.query('SELECT 1');
      logger.info('Database connected');
    } catch (error) {
      logger.warn('Database connection failed, running in mock mode');
      this.pool = null;
    }
  }

  async healthCheck(): Promise<boolean> {
    if (!this.pool) return false;
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }

  async query(text: string, params?: any[]): Promise<any> {
    if (!this.pool) return { rows: [], rowCount: 0 };
    return this.pool.query(text, params);
  }
}

export const DatabaseService = new DatabaseServiceClass();
