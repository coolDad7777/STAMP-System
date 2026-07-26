import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { tscbVerifyRoutes } from '../routes/tscb-verify';
import { TSCBProtocol, TSCBProof } from '../crypto/TSCBProtocol';
import { sodium } from '../crypto/sodium';
import { config } from '../config/config';

/**
 * backend/src/routes/tscb-verify.ts now:
 *  - reads its master key from `config.TSCB_MASTER_KEY` instead of raw
 *    `process.env.TSCB_MASTER_KEY`,
 *  - makes `currentTime` optional in the request body and defaults it to
 *    `Date.now()`,
 *  - validates that `userPublicKey` is a 64-character hex string before
 *    attempting verification,
 *  - wraps the verification call in try/catch and returns 500 on failure.
 */
describe('TSCB verify routes', () => {
  let app: FastifyInstance;
  let protocol: TSCBProtocol;
  let userKeyPair: { publicKey: Uint8Array; privateKey: Uint8Array };

  beforeAll(async () => {
    await sodium.ready;
    app = Fastify();
    await app.register(tscbVerifyRoutes);
    await app.ready();

    // Use the same master key the route registers internally so proofs verify correctly.
    protocol = new TSCBProtocol(config.TSCB_MASTER_KEY);
    await protocol.initialize();
    userKeyPair = sodium.crypto_sign_keypair();
  });

  afterAll(async () => {
    await app.close();
  });

  function userPublicKeyHex(): string {
    return Buffer.from(userKeyPair.publicKey).toString('hex');
  }

  describe('GET /api/health', () => {
    it('reports the TSCB service as initialized', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/health' });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: 'ok', tscb: 'initialized' });
    });
  });

  describe('POST /api/verify', () => {
    it('rejects a malformed public key before attempting verification', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/verify',
        payload: { proof: {}, userPublicKey: 'not-a-hex-key' }
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.verified).toBe(false);
      expect(body.error).toBe('Invalid Ed25519 public key format');
    });

    it('rejects a public key of the wrong length', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/verify',
        payload: { proof: {}, userPublicKey: 'ab'.repeat(31) } // 62 hex chars, too short
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toBe('Invalid Ed25519 public key format');
    });

    it('returns a schema validation error when a required field is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/verify',
        payload: { userPublicKey: userPublicKeyHex() } // proof omitted
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 500 when the proof object is malformed', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/verify',
        payload: { proof: {}, userPublicKey: userPublicKeyHex() }
      });

      expect(response.statusCode).toBe(500);
      const body = response.json();
      expect(body.error).toBe('Verification failed');
      expect(typeof body.message).toBe('string');
    });

    it('verifies a genuine TSCB proof and returns its per-check results', async () => {
      const timestamp = Date.now();
      const proof = await protocol.generateTSCBProof(
        'meeting_verify_route',
        40.7128,
        -74.006,
        timestamp,
        Buffer.from(userKeyPair.privateKey)
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/verify',
        payload: {
          proof,
          userPublicKey: userPublicKeyHex(),
          currentTime: timestamp
        }
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.verified).toBe(true);
      expect(body.checks).toEqual({
        temporal: 'valid',
        spatial: 'valid',
        binding: 'valid',
        signature: 'valid'
      });
    });

    it('defaults currentTime to now when it is not supplied', async () => {
      const timestamp = Date.now();
      const proof = await protocol.generateTSCBProof(
        'meeting_verify_default_time',
        40.7128,
        -74.006,
        timestamp,
        Buffer.from(userKeyPair.privateKey)
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/verify',
        payload: {
          proof,
          userPublicKey: userPublicKeyHex()
          // currentTime intentionally omitted
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().verified).toBe(true);
    });

    it('rejects a proof that fails verification and reports the failing check', async () => {
      const timestamp = Date.now();
      const proof = await protocol.generateTSCBProof(
        'meeting_verify_bad',
        40.7128,
        -74.006,
        timestamp,
        Buffer.from(userKeyPair.privateKey)
      );

      const tamperedProof: TSCBProof = { ...proof, bindingHash: 'f'.repeat(64) };

      const response = await app.inject({
        method: 'POST',
        url: '/api/verify',
        payload: {
          proof: tamperedProof,
          userPublicKey: userPublicKeyHex(),
          currentTime: timestamp
        }
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.verified).toBe(false);
      expect(body.checks.binding).toBe('hash_mismatch');
    });

    it('rejects a proof signed for a different public key', async () => {
      const timestamp = Date.now();
      const proof = await protocol.generateTSCBProof(
        'meeting_verify_wrong_key',
        40.7128,
        -74.006,
        timestamp,
        Buffer.from(userKeyPair.privateKey)
      );

      const otherKeyPair = sodium.crypto_sign_keypair();

      const response = await app.inject({
        method: 'POST',
        url: '/api/verify',
        payload: {
          proof,
          userPublicKey: Buffer.from(otherKeyPair.publicKey).toString('hex'),
          currentTime: timestamp
        }
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.verified).toBe(false);
      expect(body.checks.signature).toBe('invalid');
    });
  });
});