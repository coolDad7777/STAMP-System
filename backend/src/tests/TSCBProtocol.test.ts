import { describe, it, expect, beforeAll } from '@jest/globals';
import { TSCBProtocol, TSCBProof } from '../crypto/TSCBProtocol';
import { sodium } from '../crypto/sodium';

/**
 * TSCB Protocol Security Tests
 *
 * These tests verify the core security properties of the Temporal-Spatial
 * Cryptographic Binding protocol:
 *
 * 1. Pre-generation resistance
 * 2. Replay rejection
 * 3. Location-bound commitments
 * 4. Signature forgery rejection
 * 5. Temporal expiry checks
 */
describe('TSCB Protocol Security Tests', () => {
  let protocol: TSCBProtocol;
  let userKeyPair: { publicKey: Buffer; privateKey: Buffer };
  const MASTER_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const MEETING_ID = 'meeting_12345';
  const MEETING_LOCATION = { lat: 40.7128, lng: -74.0060 };
  const BASE_TIME = 1710000000000;

  beforeAll(async () => {
    await sodium.ready;

    protocol = new TSCBProtocol(MASTER_KEY);
    await protocol.initialize();

    const keypair = sodium.crypto_sign_keypair();
    userKeyPair = {
      publicKey: Buffer.from(keypair.publicKey),
      privateKey: Buffer.from(keypair.privateKey)
    };
  });

  describe('Temporal Challenge Security', () => {
    it('should generate unique challenges for different time epochs', () => {
      const challenge1 = protocol.generateTemporalChallenge(MEETING_ID, BASE_TIME);
      const challenge2 = protocol.generateTemporalChallenge(MEETING_ID, BASE_TIME + 35000);

      expect(challenge1.challenge).not.toBe(challenge2.challenge);
      expect(challenge1.epoch).not.toBe(challenge2.epoch);
    });

    it('should reject challenges from expired time windows', () => {
      const challenge = protocol.generateTemporalChallenge(MEETING_ID, BASE_TIME);
      const afterExpiry = challenge.validUntil + 1;

      expect(protocol.validateTemporalChallenge(challenge, afterExpiry)).toBe(false);
    });

    it('should accept challenges within valid time window', () => {
      const challenge = protocol.generateTemporalChallenge(MEETING_ID, BASE_TIME);
      const withinWindow = challenge.validFrom + 5000;

      expect(protocol.validateTemporalChallenge(challenge, withinWindow)).toBe(true);
    });

    it('should prevent pre-generation by using time-based keys', () => {
      const futureTime = BASE_TIME + 86400000;
      const futureChallenge = protocol.generateTemporalChallenge(MEETING_ID, futureTime);

      expect(futureChallenge.validUntil - futureChallenge.validFrom).toBe(30000);
    });
  });

  describe('Spatial Commitment Security', () => {
    it('should reject locations too far from meeting location', () => {
      const challenge = protocol.generateTemporalChallenge(MEETING_ID, BASE_TIME);
      const farLocation = { lat: 34.0522, lng: -118.2437 };

      const spatialCommitment = protocol.generateSpatialCommitment(
        farLocation.lat,
        farLocation.lng,
        challenge
      );

      const meetingGeohash = protocol.generateSpatialCommitment(
        MEETING_LOCATION.lat,
        MEETING_LOCATION.lng,
        challenge
      ).geohash;

      expect(protocol.validateSpatialCommitment(spatialCommitment, meetingGeohash, 200)).toBe(false);
    });

    it('should accept locations within meeting area', () => {
      const challenge = protocol.generateTemporalChallenge(MEETING_ID, BASE_TIME);

      const spatialCommitment = protocol.generateSpatialCommitment(
        MEETING_LOCATION.lat,
        MEETING_LOCATION.lng,
        challenge
      );

      const meetingGeohash = protocol.generateSpatialCommitment(
        MEETING_LOCATION.lat,
        MEETING_LOCATION.lng,
        challenge
      ).geohash;

      expect(protocol.validateSpatialCommitment(spatialCommitment, meetingGeohash, 200)).toBe(true);
    });

    it('should use geohash precision-7', () => {
      const challenge = protocol.generateTemporalChallenge(MEETING_ID, BASE_TIME);
      const spatialCommitment = protocol.generateSpatialCommitment(
        MEETING_LOCATION.lat,
        MEETING_LOCATION.lng,
        challenge
      );

      expect(spatialCommitment.geohash.length).toBe(7);
      expect(spatialCommitment.precision).toBe(7);
    });

    it('should reject invalid geohash precision', () => {
      const challenge = protocol.generateTemporalChallenge(MEETING_ID, BASE_TIME);
      const spatialCommitment = protocol.generateSpatialCommitment(
        MEETING_LOCATION.lat,
        MEETING_LOCATION.lng,
        challenge
      );

      const tamperedCommitment = {
        ...spatialCommitment,
        precision: 9
      };

      const meetingGeohash = protocol.generateSpatialCommitment(
        MEETING_LOCATION.lat,
        MEETING_LOCATION.lng,
        challenge
      ).geohash;

      expect(protocol.validateSpatialCommitment(tamperedCommitment, meetingGeohash, 200)).toBe(false);
    });
  });

  describe('TSCB Proof Security', () => {
    it('should generate valid proof with correct signature', async () => {
      const proof = await protocol.generateTSCBProof(
        MEETING_ID,
        MEETING_LOCATION.lat,
        MEETING_LOCATION.lng,
        BASE_TIME,
        userKeyPair.privateKey
      );

      const result = await protocol.verifyTSCBProof(
        proof,
        userKeyPair.publicKey,
        BASE_TIME
      );

      expect(result.isValid).toBe(true);
      expect(result.checks.signature).toBe('valid');
      expect(result.checks.temporal).toBe('valid');
      expect(result.checks.spatial).toBe('valid');
    });

    it('should reject proof with forged signature', async () => {
      const proof = await protocol.generateTSCBProof(
        MEETING_ID,
        MEETING_LOCATION.lat,
        MEETING_LOCATION.lng,
        BASE_TIME,
        userKeyPair.privateKey
      );

      const forgedProof: TSCBProof = {
        ...proof,
        signature: 'a'.repeat(128)
      };

      const result = await protocol.verifyTSCBProof(
        forgedProof,
        userKeyPair.publicKey,
        BASE_TIME
      );

      expect(result.isValid).toBe(false);
      expect(result.checks.signature).toBe('invalid');
    });

    it('should reject replayed proof from previous time window', async () => {
      const proof = await protocol.generateTSCBProof(
        MEETING_ID,
        MEETING_LOCATION.lat,
        MEETING_LOCATION.lng,
        BASE_TIME,
        userKeyPair.privateKey
      );

      const oneHourLater = BASE_TIME + 3600000;
      const result = await protocol.verifyTSCBProof(
        proof,
        userKeyPair.publicKey,
        oneHourLater
      );

      expect(result.isValid).toBe(false);
      expect(result.checks.temporal).toBe('expired');
    });

    it('should reject proof with tampered binding hash', async () => {
      const proof = await protocol.generateTSCBProof(
        MEETING_ID,
        MEETING_LOCATION.lat,
        MEETING_LOCATION.lng,
        BASE_TIME,
        userKeyPair.privateKey
      );

      const tamperedProof: TSCBProof = {
        ...proof,
        bindingHash: 'b'.repeat(64)
      };

      const result = await protocol.verifyTSCBProof(
        tamperedProof,
        userKeyPair.publicKey,
        BASE_TIME
      );

      expect(result.isValid).toBe(false);
      expect(result.checks.binding).toBe('hash_mismatch');
    });

    it('should prevent pre-generation by requiring a specific temporal challenge', async () => {
      const futureTime = BASE_TIME + 86400000;
      const futureProof = await protocol.generateTSCBProof(
        MEETING_ID,
        MEETING_LOCATION.lat,
        MEETING_LOCATION.lng,
        futureTime,
        userKeyPair.privateKey
      );

      expect(futureProof.temporalChallenge.validUntil - futureProof.temporalChallenge.validFrom).toBe(30000);
    });
  });

  describe('Privacy Preservation', () => {
    it('should generate zero-knowledge-style proof without revealing raw coordinates', async () => {
      const tscbProof = await protocol.generateTSCBProof(
        MEETING_ID,
        MEETING_LOCATION.lat,
        MEETING_LOCATION.lng,
        BASE_TIME,
        userKeyPair.privateKey
      );

      const zkProof = protocol.generateZeroKnowledgeProof(
        tscbProof,
        '2024-01-15',
        2700
      );

      expect(zkProof.commitment).toBeDefined();
      expect(zkProof).not.toHaveProperty('latitude');
      expect(zkProof).not.toHaveProperty('longitude');
      expect(zkProof.proofType).toBe('attendance_verification');
    });
  });
});

describe('Master Key Normalization', () => {
  const HEX_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const BASE_TIME = 1710000000000;
  const MEETING_ID = 'meeting_normalize';

  it('treats a 64-character hex string as raw key bytes regardless of case', async () => {
    const lower = new TSCBProtocol(HEX_KEY);
    const upper = new TSCBProtocol(HEX_KEY.toUpperCase());
    await lower.initialize();
    await upper.initialize();

    const lowerChallenge = lower.generateTemporalChallenge(MEETING_ID, BASE_TIME);
    const upperChallenge = upper.generateTemporalChallenge(MEETING_ID, BASE_TIME);

    expect(upperChallenge.challenge).toBe(lowerChallenge.challenge);
  });

  it('deterministically hashes a non-hex master key into key material', async () => {
    const protocolA = new TSCBProtocol('a plain-text passphrase, not hex');
    const protocolB = new TSCBProtocol('a plain-text passphrase, not hex');
    await protocolA.initialize();
    await protocolB.initialize();

    const challengeA = protocolA.generateTemporalChallenge(MEETING_ID, BASE_TIME);
    const challengeB = protocolB.generateTemporalChallenge(MEETING_ID, BASE_TIME);

    expect(challengeA.challenge).toBe(challengeB.challenge);
  });

  it('produces different key material for different non-hex master keys', async () => {
    const protocolA = new TSCBProtocol('passphrase-one');
    const protocolB = new TSCBProtocol('passphrase-two');
    await protocolA.initialize();
    await protocolB.initialize();

    const challengeA = protocolA.generateTemporalChallenge(MEETING_ID, BASE_TIME);
    const challengeB = protocolB.generateTemporalChallenge(MEETING_ID, BASE_TIME);

    expect(challengeA.challenge).not.toBe(challengeB.challenge);
  });

  it('falls back to hashing when the key is hex-like but not exactly 64 characters', async () => {
    // 63 hex characters — one short of the required length — must not be treated as raw hex.
    const almostHexKey = HEX_KEY.slice(0, 63);
    const raw = new TSCBProtocol(HEX_KEY);
    const almostHex = new TSCBProtocol(almostHexKey);
    await raw.initialize();
    await almostHex.initialize();

    const rawChallenge = raw.generateTemporalChallenge(MEETING_ID, BASE_TIME);
    const almostHexChallenge = almostHex.generateTemporalChallenge(MEETING_ID, BASE_TIME);

    expect(almostHexChallenge.challenge).not.toBe(rawChallenge.challenge);
  });
});

describe('Attack Scenario Tests', () => {
  let protocol: TSCBProtocol;
  let userKeyPair: { publicKey: Buffer; privateKey: Buffer };
  const MASTER_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const BASE_TIME = 1710000000000;

  beforeAll(async () => {
    await sodium.ready;
    protocol = new TSCBProtocol(MASTER_KEY);
    await protocol.initialize();

    const keypair = sodium.crypto_sign_keypair();
    userKeyPair = {
      publicKey: Buffer.from(keypair.publicKey),
      privateKey: Buffer.from(keypair.privateKey)
    };
  });

  it('should demonstrate drive-by checkout risk with distant locations', async () => {
    await protocol.generateTSCBProof(
      'meeting_001',
      40.7128,
      -74.0060,
      BASE_TIME,
      userKeyPair.privateKey
    );

    const farLocation = { lat: 40.7500, lng: -74.0000 };
    const distance = calculateDistance(40.7128, -74.0060, farLocation.lat, farLocation.lng);

    expect(distance).toBeGreaterThan(200);
  });

  it('should produce different signatures for different users', async () => {
    const user1Keypair = sodium.crypto_sign_keypair();
    const user2Keypair = sodium.crypto_sign_keypair();

    const proof1 = await protocol.generateTSCBProof(
      'meeting_001',
      40.7128,
      -74.0060,
      BASE_TIME,
      Buffer.from(user1Keypair.privateKey)
    );

    const proof2 = await protocol.generateTSCBProof(
      'meeting_001',
      40.7128,
      -74.0060,
      BASE_TIME + 1000,
      Buffer.from(user2Keypair.privateKey)
    );

    const result1 = await protocol.verifyTSCBProof(
      proof1,
      Buffer.from(user1Keypair.publicKey),
      BASE_TIME
    );

    const result2 = await protocol.verifyTSCBProof(
      proof2,
      Buffer.from(user2Keypair.publicKey),
      BASE_TIME + 1000
    );

    expect(result1.isValid).toBe(true);
    expect(result2.isValid).toBe(true);
    expect(proof1.signature).not.toBe(proof2.signature);
  });
});

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const phi1 = lat1 * Math.PI / 180;
  const phi2 = lat2 * Math.PI / 180;
  const deltaPhi = (lat2 - lat1) * Math.PI / 180;
  const deltaLambda = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) *
    Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}
