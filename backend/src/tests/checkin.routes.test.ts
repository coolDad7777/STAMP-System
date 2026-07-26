import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { checkinRoutes } from '../routes/checkin';
import { sodium } from '../crypto/sodium';

/**
 * backend/src/routes/checkin.ts now:
 *  - reads its master key and facility key from `config` instead of raw
 *    `process.env` lookups,
 *  - validates that `participantToken`/`signature` are well-formed hex
 *    before doing any crypto work (`isHex`),
 *  - reports `meetsMinimum` against `config.SESSION_MIN_DURATION_MS` instead
 *    of a hard-coded 45-minute constant.
 *
 * These tests exercise the full check-in/check-out flow through Fastify's
 * `inject()` API (no real network socket needed) using a real libsodium
 * Ed25519 keypair to produce valid signatures.
 */
describe('Checkin routes', () => {
  let app: FastifyInstance;
  let participantKeyPair: { publicKey: Uint8Array; privateKey: Uint8Array };

  beforeAll(async () => {
    await sodium.ready;
    app = Fastify();
    await app.register(checkinRoutes);
    await app.ready();

    participantKeyPair = sodium.crypto_sign_keypair();
  });

  afterAll(async () => {
    await app.close();
  });

  function participantPublicKeyHex(): string {
    return Buffer.from(participantKeyPair.publicKey).toString('hex');
  }

  function signCheckin(meetingId: string, timestamp: number, privateKey: Uint8Array): string {
    const message = Buffer.concat([Buffer.from(meetingId), Buffer.from(timestamp.toString())]);
    return Buffer.from(sodium.crypto_sign_detached(message, privateKey)).toString('hex');
  }

  function signCheckout(sessionId: string, checkinTime: number, privateKey: Uint8Array): string {
    const message = Buffer.concat([Buffer.from(sessionId), Buffer.from(checkinTime.toString())]);
    return Buffer.from(sodium.crypto_sign_detached(message, privateKey)).toString('hex');
  }

  describe('GET /api/facility-pubkey', () => {
    it('returns a 64-character hex Ed25519 public key', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/facility-pubkey' });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.algorithm).toBe('ed25519');
      expect(body.publicKey).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('POST /api/checkin', () => {
    const meetingId = 'meeting_checkin_test';
    const latitude = 40.7128;
    const longitude = -74.006;

    it('rejects a non-hex participant token', async () => {
      const timestamp = Date.now();
      const response = await app.inject({
        method: 'POST',
        url: '/api/checkin',
        payload: {
          participantToken: 'not-a-valid-hex-key-value-zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz',
          meetingId,
          latitude,
          longitude,
          timestamp,
          signature: 'a'.repeat(128)
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toBe('Invalid participant key or signature format');
    });

    it('rejects a signature with the wrong length', async () => {
      const timestamp = Date.now();
      const response = await app.inject({
        method: 'POST',
        url: '/api/checkin',
        payload: {
          participantToken: participantPublicKeyHex(),
          meetingId,
          latitude,
          longitude,
          timestamp,
          signature: 'ab'.repeat(10)
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toBe('Invalid participant key or signature format');
    });

    it('rejects a request with a missing required field', async () => {
      const timestamp = Date.now();
      const response = await app.inject({
        method: 'POST',
        url: '/api/checkin',
        payload: {
          participantToken: participantPublicKeyHex(),
          meetingId,
          latitude,
          longitude,
          timestamp
          // signature omitted
        }
      });

      expect(response.statusCode).toBe(400);
    });

    it('rejects a stale timestamp outside the drift window', async () => {
      const staleTimestamp = Date.now() - 200000; // 200s > 120s allowed drift
      const signature = signCheckin(meetingId, staleTimestamp, participantKeyPair.privateKey);

      const response = await app.inject({
        method: 'POST',
        url: '/api/checkin',
        payload: {
          participantToken: participantPublicKeyHex(),
          meetingId,
          latitude,
          longitude,
          timestamp: staleTimestamp,
          signature
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toBe('Timestamp too old or in the future');
    });

    it('rejects an invalid participant signature', async () => {
      const timestamp = Date.now();
      const otherKeyPair = sodium.crypto_sign_keypair();
      const badSignature = signCheckin(meetingId, timestamp, otherKeyPair.privateKey);

      const response = await app.inject({
        method: 'POST',
        url: '/api/checkin',
        payload: {
          participantToken: participantPublicKeyHex(),
          meetingId,
          latitude,
          longitude,
          timestamp,
          signature: badSignature
        }
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().error).toBe('Invalid participant signature');
    });

    it('rejects out-of-range coordinates even with a valid signature', async () => {
      const timestamp = Date.now();
      const signature = signCheckin(meetingId, timestamp, participantKeyPair.privateKey);

      const response = await app.inject({
        method: 'POST',
        url: '/api/checkin',
        payload: {
          participantToken: participantPublicKeyHex(),
          meetingId,
          latitude: 999,
          longitude,
          timestamp,
          signature
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toBe('Invalid coordinates');
    });

    it('accepts a valid check-in and creates a session', async () => {
      const timestamp = Date.now();
      const signature = signCheckin(meetingId, timestamp, participantKeyPair.privateKey);

      const response = await app.inject({
        method: 'POST',
        url: '/api/checkin',
        payload: {
          participantToken: participantPublicKeyHex(),
          meetingId,
          latitude,
          longitude,
          timestamp,
          signature
        }
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.checkedIn).toBe(true);
      expect(body.meetingId).toBe(meetingId);
      expect(typeof body.sessionId).toBe('string');
      expect(typeof body.serverCheckinTime).toBe('number');
      expect(body.bindingHash).toMatch(/^[0-9a-f]{64}$/);
      expect(body.geohash).toHaveLength(7);
    });
  });

  describe('POST /api/checkout and GET /api/session/:sessionId', () => {
    const meetingId = 'meeting_checkout_test';
    const latitude = 40.7128;
    const longitude = -74.006;

    async function performCheckin(): Promise<{ sessionId: string; serverCheckinTime: number; bindingHash: string }> {
      const timestamp = Date.now();
      const signature = signCheckin(meetingId, timestamp, participantKeyPair.privateKey);
      const response = await app.inject({
        method: 'POST',
        url: '/api/checkin',
        payload: {
          participantToken: participantPublicKeyHex(),
          meetingId,
          latitude,
          longitude,
          timestamp,
          signature
        }
      });
      return response.json();
    }

    it('returns 404 for checkout of an unknown session', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/checkout',
        payload: {
          sessionId: 'session-does-not-exist',
          participantToken: participantPublicKeyHex(),
          signature: 'a'.repeat(128)
        }
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error).toBe('Session not found');
    });

    it('rejects a checkout with a malformed participant token or signature', async () => {
      const checkinBody = await performCheckin();

      const response = await app.inject({
        method: 'POST',
        url: '/api/checkout',
        payload: {
          sessionId: checkinBody.sessionId,
          participantToken: 'zzzz',
          signature: 'a'.repeat(128)
        }
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 403 when the participant token does not match the session', async () => {
      const checkinBody = await performCheckin();
      const otherKeyPair = sodium.crypto_sign_keypair();
      const signature = signCheckout(checkinBody.sessionId, checkinBody.serverCheckinTime, otherKeyPair.privateKey);

      const response = await app.inject({
        method: 'POST',
        url: '/api/checkout',
        payload: {
          sessionId: checkinBody.sessionId,
          participantToken: Buffer.from(otherKeyPair.publicKey).toString('hex'),
          signature
        }
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().error).toBe('Token mismatch');
    });

    it('returns 401 for an invalid checkout signature', async () => {
      const checkinBody = await performCheckin();

      const response = await app.inject({
        method: 'POST',
        url: '/api/checkout',
        payload: {
          sessionId: checkinBody.sessionId,
          participantToken: participantPublicKeyHex(),
          signature: 'b'.repeat(128)
        }
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().error).toBe('Invalid participant signature');
    });

    it('checks out successfully and reports a duration below the configured minimum', async () => {
      const checkinBody = await performCheckin();
      const signature = signCheckout(
        checkinBody.sessionId,
        checkinBody.serverCheckinTime,
        participantKeyPair.privateKey
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/checkout',
        payload: {
          sessionId: checkinBody.sessionId,
          participantToken: participantPublicKeyHex(),
          signature
        }
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.checkedOut).toBe(true);
      expect(typeof body.durationMinutes).toBe('number');
      // Checkin/checkout happen back-to-back in this test, so the recorded
      // duration is far below the 45-minute SESSION_MIN_DURATION_MS default.
      expect(body.meetsMinimum).toBe(false);
      expect(body.checkinBindingHash).toBe(checkinBody.bindingHash);
    });

    it('returns 409 when checking out an already-completed session', async () => {
      const checkinBody = await performCheckin();
      const firstSignature = signCheckout(
        checkinBody.sessionId,
        checkinBody.serverCheckinTime,
        participantKeyPair.privateKey
      );

      await app.inject({
        method: 'POST',
        url: '/api/checkout',
        payload: {
          sessionId: checkinBody.sessionId,
          participantToken: participantPublicKeyHex(),
          signature: firstSignature
        }
      });

      const secondSignature = signCheckout(
        checkinBody.sessionId,
        checkinBody.serverCheckinTime,
        participantKeyPair.privateKey
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/checkout',
        payload: {
          sessionId: checkinBody.sessionId,
          participantToken: participantPublicKeyHex(),
          signature: secondSignature
        }
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().error).toBe('Session already checked out');
    });

    it('retrieves an active session record via GET /api/session/:sessionId', async () => {
      const checkinBody = await performCheckin();

      const response = await app.inject({
        method: 'GET',
        url: `/api/session/${checkinBody.sessionId}`
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.sessionId).toBe(checkinBody.sessionId);
      expect(body.meetingId).toBe(meetingId);
      expect(body.status).toBe('active');
      expect(body.checkoutTime).toBeUndefined();
    });

    it('returns 404 for GET /api/session/:sessionId with an unknown id', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/session/unknown-session-id' });

      expect(response.statusCode).toBe(404);
      expect(response.json().error).toBe('Not found');
    });
  });
});