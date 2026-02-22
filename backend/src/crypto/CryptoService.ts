import crypto from 'crypto';
import { config } from '../config/config';
import { logger } from '../utils/logger';

export class CryptoService {
  private static initialized = false;
  private static masterKey: Buffer;

  public static async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      this.masterKey = Buffer.from(config.ENCRYPTION_KEY, 'utf-8');
      this.initialized = true;
      logger.info('CryptoService initialized (stub mode)');
    } catch (error) {
      logger.error('Failed to initialize CryptoService', error);
    }
  }

  public static async healthCheck(): Promise<boolean> {
    return this.initialized;
  }

  static randomBytes(length: number): Buffer {
    return crypto.randomBytes(length);
  }

  static sha256(data: Buffer): Buffer {
    return crypto.createHash('sha256').update(data).digest();
  }

  static hmac(key: Buffer, data: Buffer): Buffer {
    return crypto.createHmac('sha256', key).update(data).digest();
  }

  static timingSafeEqual(a: Buffer, b: Buffer): boolean {
    try {
      return crypto.timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  static encryptAESGCM(plaintext: Buffer, key: Buffer): Buffer {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]);
  }

  static decryptAESGCM(ciphertext: Buffer, key: Buffer): Buffer {
    const iv = ciphertext.subarray(0, 12);
    const tag = ciphertext.subarray(12, 28);
    const encrypted = ciphertext.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  }
}
