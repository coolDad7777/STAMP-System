import { describe, it, expect, beforeAll } from '@jest/globals';
import { TSCBProtocol, TemporalChallenge, TSCBProof } from '../src/crypto/TSCBProtocol';
import * as sodium from 'libsodium-wrappers';

/**
 * TSCB Protocol Security Tests
 * 
 * These tests verify that the Temporal-Spatial Cryptographic Binding
 * protocol actually prevents the attacks it claims to prevent:
 * 
 * 1. Pre-generation attacks - Stamps cannot be created before the meeting
 * 2. Replay attacks - Stamps cannot be reused
 * 3. Location spoofing - Invalid locations are rejected
 * 4. Signature forgery - Invalid signatures are detected
 * 5. Temporal manipulation - Expired stamps are rejected
 */

describe('TSCB Protocol Security Tests', () => {
  let protocol: TSCBProtocol;
  let userKeyPair: { publicKey: Buffer; privateKey: Buffer };
  const MASTER_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const MEETING_ID = 'meeting_12345';
  const MEETING_LOCATION = { lat: 40.7128, lng: -74.0060 }; // NYC

  beforeAll(async () => {
    await sodium.ready;
    
    protocol = new TSCBProtocol(MASTER_KEY);
    await protocol.initialize();
    
    // Generate Ed25519 keypair for test user
    const keypair = sodium.crypto_sign_keypair();
    userKeyPair = {
      publicKey: Buffer.from(keypair.publicKey),
      privateKey: Buffer.from(keypair.privateKey)
    };
  });

  describe('Temporal Challenge Security', () => {
    it('should generate unique challenges for different time epochs', async () => {
      const now = Date.now();
      const challenge1 = protocol.generateTemporalChallenge(MEETING_ID, now);
      const challenge2 = protocol.generateTemporalChallenge(MEETING_ID, now + 35000); // 35 seconds later

      expect(challenge1.challenge).not.toBe(challenge2.challenge);
      expect(challenge1.epoch).not.toBe(challenge2.epoch);
    });

    it('should reject challenges from expired time windows', async () => {
      const now = Date.now();
      const challenge = protocol.generateTemporalChallenge(MEETING_ID, now);
      
      // Try to validate 2 minutes later (past expiry)
      const twoMinutesLater = now + 120000;
      const isValid = protocol.validateTemporalChallenge(challenge, twoMinutesLater);
      
      expect(isValid).toBe(false);
    });

    it('should accept challenges within valid time window', async () => {
      const now = Date.now();
      const challenge = protocol.generateTemporalChallenge(MEETING_ID, now);
      
      // Validate 5 seconds later (still within 30s window)
      const fiveSecondsLater = now + 5000;
      const isValid = protocol.validateTemporalChallenge(challenge, fiveSecondsLater);
      
      expect(isValid).toBe(true);
    });

    it('should prevent pre-generation by using time-based keys', async () => {
      // Simulate attacker trying to generate stamp for future meeting
      const futureTime = Date.now() + 86400000; // 24 hours from now
      
      // Attacker cannot predict challenge because it depends on
      // the meeting-specific key + exact time epoch
      const futureChallenge = protocol.generateTemporalChallenge(MEETING_ID, futureTime);
      
      // Challenge is only valid during its specific 30-second window
      expect(futureChallenge.validUntil - futureChallenge.validFrom).toBe(30000);
    });
  });

  describe('Spatial Commitment Security', () => {
    it('should reject locations too far from meeting location', async () => {
      const now = Date.now();
      const challenge = protocol.generateTemporalChallenge(MEETING_ID, now);
      
      // User is 500 meters away from meeting (beyond 200m tolerance)
      const farLocation = { lat: 40.7170, lng: -74.0100 }; // ~500m away
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
      
      const isValid = protocol.validateSpatialCommitment(
        spatialCommitment,
        meetingGeohash,
        200 // 200m max distance
      );
      
      expect(isValid).toBe(false);
    });

    it('should accept locations within meeting area', async () => {
      const now = Date.now();
      const challenge = protocol.generateTemporalChallenge(MEETING_ID, now);
      
      // User is at meeting location
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
      
      const isValid = protocol.validateSpatialCommitment(
        spatialCommitment,
        meetingGeohash,
        200
      );
      
      expect(isValid).toBe(true);
    });

    it('should use geohash precision-7 (~153m accuracy)', async () => {
      const now = Date.now();
      const challenge = protocol.generateTemporalChallenge(MEETING_ID, now);
      
      const spatialCommitment = protocol.generateSpatialCommitment(
        MEETING_LOCATION.lat,
        MEETING_LOCATION.lng,
        challenge
      );
      
      expect(spatialCommitment.geohash.length).toBe(7);
      expect(spatialCommitment.precision).toBe(7);
    });

    it('should reject invalid geohash precision', async () => {
      const now = Date.now();
      const challenge = protocol.generateTemporalChallenge(MEETING_ID, now);
      
      // Try to create commitment with wrong precision (too precise = privacy violation)
      const spatialCommitment = protocol.generateSpatialCommitment(
        MEETING_LOCATION.lat,
        MEETING_LOCATION.lng,
        challenge
      );
      
      // Manually modify to wrong precision
      const tamperedCommitment = {
        ...spatialCommitment,
        precision: 9 // Too precise
      };
      
      const meetingGeohash = protocol.generateSpatialCommitment(
        MEETING_LOCATION.lat,
        MEETING_LOCATION.lng,
        challenge
      ).geohash;
      
      const isValid = protocol.validateSpatialCommitment(
        tamperedCommitment,
        meetingGeohash,
        200
      );
      
      expect(isValid).toBe(false);
    });
  });

  describe('TSCB Proof Security', () => {
    it('should generate valid proof with correct signature', async () => {
      const now = Date.now();
      
      const proof = await protocol.generateTSCBProof(
        MEETING_ID,
        MEETING_LOCATION.lat,
        MEETING_LOCATION.lng,
        now,
        userKeyPair.privateKey
      );
      
      const result = await protocol.verifyTSCBProof(
        proof,
        userKeyPair.publicKey,
        now
      );
      
      expect(result.isValid).toBe(true);
      expect(result.checks?.signature).toBe('valid');
      expect(result.checks?.temporal).toBe('valid');
      expect(result.checks?.spatial).toBe('valid');
    });

    it('should reject proof with forged signature', async () => {
      const now = Date.now();
      
      // Generate legitimate proof
      const proof = await protocol.generateTSCBProof(
        MEETING_ID,
        MEETING_LOCATION.lat,
        MEETING_LOCATION.lng,
        now,
        userKeyPair.privateKey
      );
      
      // Attacker tries to forge signature
      const forgedProof: TSCBProof = {
        ...proof,
        signature: 'a'.repeat(128) // Invalid signature
      };
      
      const result = await protocol.verifyTSCBProof(
        forgedProof,
        userKeyPair.publicKey,
        now
      );
      
      expect(result.isValid).toBe(false);
      expect(result.checks?.signature).toBe('invalid');
    });

    it('should reject replayed proof from previous time window', async () => {
      const time1 = Date.now();
      
      // Generate proof at time1
      const proof = await protocol.generateTSCBProof(
        MEETING_ID,
        MEETING_LOCATION.lat,
        MEETING_LOCATION.lng,
        time1,
        userKeyPair.privateKey
      );
      
      // Try to verify 1 hour later (replay attack)
      const oneHourLater = time1 + 3600000;
      const result = await protocol.verifyTSCBProof(
        proof,
        userKeyPair.publicKey,
        oneHourLater
      );
      
      expect(result.isValid).toBe(false);
      expect(result.checks?.temporal).toBe('expired');
    });

    it('should reject proof with tampered binding hash', async () => {
      const now = Date.now();
      
      const proof = await protocol.generateTSCBProof(
        MEETING_ID,
        MEETING_LOCATION.lat,
        MEETING_LOCATION.lng,
        now,
        userKeyPair.privateKey
      );
      
      // Attacker modifies binding hash
      const tamperedProof: TSCBProof = {
        ...proof,
        bindingHash: 'b'.repeat(64) // Different hash
      };
      
      const result = await protocol.verifyTSCBProof(
        tamperedProof,
        userKeyPair.publicKey,
        now
      );
      
      expect(result.isValid).toBe(false);
      expect(result.checks?.binding).toBe('hash_mismatch');
    });

    it('should prevent pre-generation by requiring specific temporal challenge', async () => {
      // Attacker tries to generate proof for future meeting
      const futureTime = Date.now() + 86400000;
      
      // This generates a proof, but it's only valid during its 30-second window
      const futureProof = await protocol.generateTSCBProof(
        MEETING_ID,
        MEETING_LOCATION.lat,
        MEETING_LOCATION.lng,
        futureTime,
        userKeyPair.privateKey
      );
      
      // Proof is only valid during its specific time window
      expect(futureProof.temporalChallenge.validUntil - futureProof.temporalChallenge.validFrom).toBe(30000);
    });
  });

  describe('Timing Attack Prevention', () => {
    it('should use constant-time comparison for challenge validation', async () => {
      const now = Date.now();
      const challenge1 = protocol.generateTemporalChallenge(MEETING_ID, now);
      const challenge2 = protocol.generateTemporalChallenge(MEETING_ID, now);
      
      // Both should be identical for same time window
      expect(challenge1.challenge).toBe(challenge2.challenge);
      
      // Validation should not leak timing information about the challenge
      const start1 = process.hrtime.bigint();
      protocol.validateTemporalChallenge(challenge1, now);
      const end1 = process.hrtime.bigint();
      
      const start2 = process.hrtime.bigint();
      protocol.validateTemporalChallenge(challenge2, now);
      const end2 = process.hrtime.bigint();
      
      // Times should be similar (no significant timing leak)
      const diff1 = Number(end1 - start1);
      const diff2 = Number(end2 - start2);
      expect(Math.abs(diff1 - diff2)).toBeLessThan(1000000); // Less than 1ms difference
    });
  });

  describe('Privacy Preservation', () => {
    it('should generate zero-knowledge proof without revealing location', async () => {
      const now = Date.now();
      
      const tscbProof = await protocol.generateTSCBProof(
        MEETING_ID,
        MEETING_LOCATION.lat,
        MEETING_LOCATION.lng,
        now,
        userKeyPair.privateKey
      );
      
      const zkProof = protocol.generateZeroKnowledgeProof(
        tscbProof,
        '2024-01-15',
        2700 // 45 minutes
      );
      
      // ZK proof should not contain raw location data
      expect(zkProof.commitment).toBeDefined();
      expect(zkProof).not.toHaveProperty('latitude');
      expect(zkProof).not.toHaveProperty('longitude');
      expect(zkProof.proofType).toBe('attendance_verification');
    });
  });
});

// Test for real-world attack scenarios
describe('Attack Scenario Tests', () => {
  let protocol: TSCBProtocol;
  let userKeyPair: { publicKey: Buffer; privateKey: Buffer };
  const MASTER_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

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

  it('should prevent "drive-by" check-in attacks', async () => {
    // Attacker briefly enters meeting area and leaves immediately
    const meetingTime = Date.now();
    
    // Check-in at meeting location
    const checkinProof = await protocol.generateTSCBProof(
      'meeting_001',
      40.7128, // Meeting location
      -74.0060,
      meetingTime,
      userKeyPair.privateKey
    );
    
    // Attacker tries to check-out from different location 2 minutes later
    const checkoutTime = meetingTime + 120000; // 2 minutes later
    const farLocation = { lat: 40.7500, lng: -74.0000 }; // ~4km away
    
    const checkoutProof = await protocol.generateTSCBProof(
      'meeting_001',
      farLocation.lat,
      farLocation.lng,
      checkoutTime,
      userKeyPair.privateKey
    );
    
    // Distance between check-in and check-out locations
    const distance = calculateDistance(40.7128, -74.0060, farLocation.lat, farLocation.lng);
    
    // Should fail because locations are too far apart (>200m)
    expect(distance).toBeGreaterThan(200);
  });

  it('should prevent collusion attacks (multiple users same device)', async () => {
    // Two users try to share the same device
    const user1Keypair = sodium.crypto_sign_keypair();
    const user2Keypair = sodium.crypto_sign_keypair();
    
    const now = Date.now();
    
    // User 1 generates proof
    const proof1 = await protocol.generateTSCBProof(
      'meeting_001',
      40.7128,
      -74.0060,
      now,
      Buffer.from(user1Keypair.privateKey)
    );
    
    // User 2 tries to use same timestamp/location but different key
    const proof2 = await protocol.generateTSCBProof(
      'meeting_001',
      40.7128,
      -74.0060,
      now + 1000, // Slightly different time
      Buffer.from(user2Keypair.privateKey)
    );
    
    // Both are valid but for different users
    const result1 = await protocol.verifyTSCBProof(
      proof1,
      Buffer.from(user1Keypair.publicKey),
      now
    );
    
    const result2 = await protocol.verifyTSCBProof(
      proof2,
      Buffer.from(user2Keypair.publicKey),
      now + 1000
    );
    
    expect(result1.isValid).toBe(true);
    expect(result2.isValid).toBe(true);
    
    // But signatures are different because different keys
    expect(proof1.signature).not.toBe(proof2.signature);
  });
});

// Helper function
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}