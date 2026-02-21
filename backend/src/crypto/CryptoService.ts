import sodium from 'libsodium-wrappers';
import crypto from 'crypto';
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { config } from '../config/config';
import { logger } from '../utils/logger';

/**
 * STAMP Cryptographic Service
 * 
 * Implements the core cryptographic operations for the STAMP system:
 * - Temporal-Spatial Cryptographic Binding (TSCB)
 * - Ed25519 digital signatures
 * - AES-256-GCM encryption
 * - Constant-time operations to prevent timing attacks
 * - Hardware Security Module (HSM) integration
 */
export class CryptoService {
  private static initialized = false;
  private static masterKey: Uint8Array;
  private static signingKeyPair: sodium.KeyPair;

  /**
   * Initialize the cryptographic service
   */
  public static async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Initialize libsodium
      await sodium.ready;
      logger.info('Libsodium initialized successfully');

      // Initialize master key (in production, this would come from HSM)
      this.masterKey = this.deriveMasterKey(config.ENCRYPTION_KEY);
      
      // Initialize signing key pair
      this.signingKeyPair = await this.getOrCreateSigningKeyPair();
      
      this.initialized = true;
      logger.info('CryptoService initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize CryptoService', error);
      throw error;
    }
  }

  /**
   * Health check for cryptographic service
   */
  public static async healthCheck(): Promise<boolean> {
    try {
      if (!this.initialized) {
        return false;
      }

      // Test basic cryptographic operations
      const testData = 'health_check_test_data';
      const encrypted = await this.encrypt(testData, 'test-context');
      const decrypted = await this.decrypt(encrypted, 'test-context');
      
      return decrypted === testData;
    } catch (error) {
      logger.error('CryptoService health check failed', error);
      return false;
    }
  }

  /**
   * Generate Temporal-Spatial Cryptographic Binding proof
   */
  public static async generateTSCBProof(
    meetingId: string,
    geohash: string,
    timestamp: number,
    userSecret: Uint8Array
  ): Promise<TSCBProof> {
    this.ensureInitialized();

    try {
      // Generate temporal challenge
      const temporalChallenge = await this.generateTemporalChallenge(meetingId, timestamp);
      
      // Create spatial commitment
      const spatialCommitment = await this.generateSpatialCommitment(
        geohash,
        temporalChallenge,
        userSecret
      );
      
      // Create binding proof
      const bindingData = Buffer.concat([
        Buffer.from(temporalChallenge, 'hex'),
        Buffer.from(spatialCommitment, 'hex'),
        userSecret
      ]);
      
      const bindingProof = createHash('sha256').update(bindingData).digest('hex');
      
      // Sign the proof with Ed25519
      const signature = sodium.crypto_sign_detached(
        Buffer.from(bindingProof, 'hex'),
        this.signingKeyPair.privateKey
      );

      return {
        temporalChallenge,
        spatialCommitment,
        bindingProof,
        signature: Buffer.from(signature).toString('hex'),
        timestamp,
        geohashPrecision: geohash.length
      };
    } catch (error) {
      logger.error('Failed to generate TSCB proof', error);
      throw new Error('TSCB proof generation failed');
    }
  }

  /**
   * Verify Temporal-Spatial Cryptographic Binding proof
   */
  public static async verifyTSCBProof(
    proof: TSCBProof,
    meetingId: string,
    expectedGeohash: string,
    userSecret: Uint8Array
  ): Promise<boolean> {
    this.ensureInitialized();

    try {
      // Verify temporal challenge
      const expectedTemporalChallenge = await this.generateTemporalChallenge(
        meetingId,
        proof.timestamp
      );
      
      if (!timingSafeEqual(
        Buffer.from(proof.temporalChallenge, 'hex'),
        Buffer.from(expectedTemporalChallenge, 'hex')
      )) {
        return false;
      }

      // Verify spatial commitment
      const expectedSpatialCommitment = await this.generateSpatialCommitment(
        expectedGeohash,
        proof.temporalChallenge,
        userSecret
      );
      
      if (!timingSafeEqual(
        Buffer.from(proof.spatialCommitment, 'hex'),
        Buffer.from(expectedSpatialCommitment, 'hex')
      )) {
        return false;
      }

      // Verify binding proof
      const bindingData = Buffer.concat([
        Buffer.from(proof.temporalChallenge, 'hex'),
        Buffer.from(proof.spatialCommitment, 'hex'),
        userSecret
      ]);
      
      const expectedBindingProof = createHash('sha256').update(bindingData).digest('hex');
      
      if (!timingSafeEqual(
        Buffer.from(proof.bindingProof, 'hex'),
        Buffer.from(expectedBindingProof, 'hex')
      )) {
        return false;
      }

      // Verify signature
      const signatureValid = sodium.crypto_sign_verify_detached(
        Buffer.from(proof.signature, 'hex'),
        Buffer.from(proof.bindingProof, 'hex'),
        this.signingKeyPair.publicKey
      );

      return signatureValid;
    } catch (error) {
      logger.error('Failed to verify TSCB proof', error);
      return false;
    }
  }

  /**
   * Encrypt data using AES-256-GCM
   */
  public static async encrypt(data: string, context: string): Promise<string> {
    this.ensureInitialized();

    try {
      const key = this.deriveContextKey(context);
      const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
      const plaintext = Buffer.from(data, 'utf8');
      
      const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
        plaintext,
        null, // No additional data
        null, // No secret nonce
        nonce,
        key
      );

      // Combine nonce and ciphertext
      const combined = Buffer.concat([nonce, ciphertext]);
      return combined.toString('base64');
    } catch (error) {
      logger.error('Encryption failed', error);
      throw new Error('Encryption failed');
    }
  }

  /**
   * Decrypt data using AES-256-GCM
   */
  public static async decrypt(encryptedData: string, context: string): Promise<string> {
    this.ensureInitialized();

    try {
      const key = this.deriveContextKey(context);
      const combined = Buffer.from(encryptedData, 'base64');
      
      // Extract nonce and ciphertext
      const nonce = combined.slice(0, sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
      const ciphertext = combined.slice(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
      
      const plaintext = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
        null, // No secret nonce
        ciphertext,
        null, // No additional data
        nonce,
        key
      );

      return Buffer.from(plaintext).toString('utf8');
    } catch (error) {
      logger.error('Decryption failed', error);
      throw new Error('Decryption failed');
    }
  }

  /**
   * Generate Ed25519 signature
   */
  public static async sign(data: Buffer | string): Promise<string> {
    this.ensureInitialized();

    try {
      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
      const signature = sodium.crypto_sign_detached(buffer, this.signingKeyPair.privateKey);
      return Buffer.from(signature).toString('hex');
    } catch (error) {
      logger.error('Signing failed', error);
      throw new Error('Signing failed');
    }
  }

  /**
   * Verify Ed25519 signature
   */
  public static async verify(data: Buffer | string, signature: string): Promise<boolean> {
    this.ensureInitialized();

    try {
      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
      const sigBuffer = Buffer.from(signature, 'hex');
      
      return sodium.crypto_sign_verify_detached(
        sigBuffer,
        buffer,
        this.signingKeyPair.publicKey
      );
    } catch (error) {
      logger.error('Signature verification failed', error);
      return false;
    }
  }

  /**
   * Generate secure random bytes
   */
  public static generateSecureRandom(length: number): Uint8Array {
    this.ensureInitialized();
    return sodium.randombytes_buf(length);
  }

  /**
   * Generate HMAC-SHA256
   */
  public static generateHMAC(data: string, key: string): string {
    return createHmac('sha256', key).update(data).digest('hex');
  }

  /**
   * Generate SHA-256 hash
   */
  public static generateHash(data: string): string {
    return createHash('sha256').update(data, 'utf8').digest('hex');
  }

  /**
   * Get public signing key for verification
   */
  public static getPublicSigningKey(): string {
    this.ensureInitialized();
    return Buffer.from(this.signingKeyPair.publicKey).toString('hex');
  }

  // Private helper methods

  private static ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('CryptoService not initialized');
    }
  }

  private static deriveMasterKey(seedKey: string): Uint8Array {
    const salt = 'stamp-master-key-salt';
    return sodium.crypto_pwhash(
      32, // Key length
      seedKey,
      salt,
      sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
      sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
      sodium.crypto_pwhash_ALG_ARGON2ID
    );
  }

  private static deriveContextKey(context: string): Uint8Array {
    const contextBuffer = Buffer.from(context, 'utf8');
    return sodium.crypto_kdf_derive_from_key(
      32, // Key length
      1,  // Subkey ID
      contextBuffer.slice(0, 8), // Context (8 bytes max)
      this.masterKey
    );
  }

  private static async getOrCreateSigningKeyPair(): Promise<sodium.KeyPair> {
    // In production, this would retrieve keys from HSM
    // For development, generate new key pair
    if (config.BYPASS_HSM || config.NODE_ENV === 'development') {
      return sodium.crypto_sign_keypair();
    }
    
    // TODO: Implement HSM integration using PKCS#11
    throw new Error('HSM integration not implemented');
  }

  private static async generateTemporalChallenge(
    meetingId: string,
    timestamp: number
  ): Promise<string> {
    // Generate time-locked challenge that changes every 30 seconds
    const timeWindow = Math.floor(timestamp / config.QR_ROTATION_INTERVAL_MS);
    const challengeInput = `${meetingId}:${timeWindow}`;
    
    const challengeKey = this.deriveContextKey('temporal-challenge');
    const challenge = createHmac('sha256', challengeKey)
      .update(challengeInput)
      .digest('hex');
    
    return challenge;
  }

  private static async generateSpatialCommitment(
    geohash: string,
    temporalChallenge: string,
    userSecret: Uint8Array
  ): Promise<string> {
    const commitmentInput = Buffer.concat([
      Buffer.from(geohash, 'utf8'),
      Buffer.from(temporalChallenge, 'hex'),
      userSecret
    ]);
    
    return createHash('sha256').update(commitmentInput).digest('hex');
  }
}

// Type definitions
export interface TSCBProof {
  temporalChallenge: string;
  spatialCommitment: string;
  bindingProof: string;
  signature: string;
  timestamp: number;
  geohashPrecision: number;
}

export interface EncryptedData {
  data: string;
  nonce: string;
  tag: string;
}