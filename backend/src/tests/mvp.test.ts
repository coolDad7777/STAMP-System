import { describe, it, expect, beforeAll } from '@jest/globals';
import { TSCBProtocol } from '../crypto/TSCBProtocol';

/**
 * MVP Test Suite for STAMP System
 * 
 * These tests verify the core functionality of the TSCB protocol
 * without requiring full cryptographic implementation.
 */

describe('STAMP MVP Test Suite', () => {
  let protocol: TSCBProtocol;
  const MASTER_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const MEETING_ID = 'mvp_meeting_001';
  const MEETING_LOCATION = { lat: 40.7128, lng: -74.0060 }; // NYC

  beforeAll(async () => {
    protocol = new TSCBProtocol(MASTER_KEY);
    await protocol.initialize();
  });

  describe('Temporal Challenge Generation', () => {
    it('should generate temporal challenge with valid structure', () => {
      const now = Date.now();
      const challenge = protocol.generateTemporalChallenge(MEETING_ID, now);
      
      expect(challenge).toBeDefined();
      expect(challenge.challenge).toBeDefined();
      expect(typeof challenge.challenge).toBe('string');
      expect(challenge.challenge.length).toBeGreaterThan(0);
      expect(challenge.meetingId).toBe(MEETING_ID);
      expect(challenge.epoch).toBeDefined();
      expect(challenge.validFrom).toBeLessThanOrEqual(now);
      expect(challenge.validUntil).toBeGreaterThan(now);
    });

    it('should generate different challenges for different time epochs', () => {
      const now = Date.now();
      const challenge1 = protocol.generateTemporalChallenge(MEETING_ID, now);
      const challenge2 = protocol.generateTemporalChallenge(MEETING_ID, now + 35000);
      
      expect(challenge1.challenge).not.toBe(challenge2.challenge);
      expect(challenge1.epoch).not.toBe(challenge2.epoch);
    });

    it('should validate temporal challenge within valid window', () => {
      const now = Math.floor(Date.now() / 30000) * 30000 + 10000;
      const challenge = protocol.generateTemporalChallenge(MEETING_ID, now);
      
      const isValid = protocol.validateTemporalChallenge(challenge, now + 5000);
      expect(isValid).toBe(true);
    });

    it('should reject expired temporal challenges', () => {
      const now = Date.now();
      const challenge = protocol.generateTemporalChallenge(MEETING_ID, now);
      
      const isValid = protocol.validateTemporalChallenge(challenge, now + 120000);
      expect(isValid).toBe(false);
    });
  });

  describe('Spatial Commitment Generation', () => {
    it('should generate spatial commitment with valid structure', () => {
      const now = Date.now();
      const challenge = protocol.generateTemporalChallenge(MEETING_ID, now);
      
      const commitment = protocol.generateSpatialCommitment(
        MEETING_LOCATION.lat,
        MEETING_LOCATION.lng,
        challenge
      );
      
      expect(commitment).toBeDefined();
      expect(commitment.geohash).toBeDefined();
      expect(commitment.geohash.length).toBe(7);
      expect(commitment.precision).toBe(7);
      expect(commitment.commitment).toBeDefined();
      expect(typeof commitment.commitment).toBe('string');
    });

    it('should reject invalid coordinates', () => {
      const now = Date.now();
      const challenge = protocol.generateTemporalChallenge(MEETING_ID, now);
      
      expect(() => {
        protocol.generateSpatialCommitment(91, 0, challenge); // Invalid latitude
      }).toThrow('Invalid coordinates');
      
      expect(() => {
        protocol.generateSpatialCommitment(0, 181, challenge); // Invalid longitude
      }).toThrow('Invalid coordinates');
    });

    it('should validate spatial commitment within meeting area', () => {
      const now = Date.now();
      const challenge = protocol.generateTemporalChallenge(MEETING_ID, now);
      
      const commitment = protocol.generateSpatialCommitment(
        MEETING_LOCATION.lat,
        MEETING_LOCATION.lng,
        challenge
      );
      
      const meetingGeohash = commitment.geohash;
      const isValid = protocol.validateSpatialCommitment(commitment, meetingGeohash, 200);
      
      expect(isValid).toBe(true);
    });

    it('should reject spatial commitment with wrong precision', () => {
      const now = Date.now();
      const challenge = protocol.generateTemporalChallenge(MEETING_ID, now);
      
      const commitment = protocol.generateSpatialCommitment(
        MEETING_LOCATION.lat,
        MEETING_LOCATION.lng,
        challenge
      );
      
      const tamperedCommitment = {
        ...commitment,
        precision: 9 // Wrong precision
      };
      
      const isValid = protocol.validateSpatialCommitment(
        tamperedCommitment,
        commitment.geohash,
        200
      );
      
      expect(isValid).toBe(false);
    });
  });

  describe('MVP Integration Tests', () => {
    it('should complete full temporal-spatial binding flow', () => {
      const now = Math.floor(Date.now() / 30000) * 30000 + 10000;
      
      // Step 1: Generate temporal challenge
      const challenge = protocol.generateTemporalChallenge(MEETING_ID, now);
      expect(challenge).toBeDefined();
      
      // Step 2: Generate spatial commitment
      const commitment = protocol.generateSpatialCommitment(
        MEETING_LOCATION.lat,
        MEETING_LOCATION.lng,
        challenge
      );
      expect(commitment).toBeDefined();
      
      // Step 3: Validate temporal challenge
      const temporalValid = protocol.validateTemporalChallenge(challenge, now + 5000);
      expect(temporalValid).toBe(true);
      
      // Step 4: Validate spatial commitment
      const spatialValid = protocol.validateSpatialCommitment(
        commitment,
        commitment.geohash,
        200
      );
      expect(spatialValid).toBe(true);
    });

    it('should prevent replay attacks with expired challenges', () => {
      const now = Date.now();
      const challenge = protocol.generateTemporalChallenge(MEETING_ID, now);
      
      // Try to use challenge 2 minutes later
      const isValid = protocol.validateTemporalChallenge(challenge, now + 120000);
      expect(isValid).toBe(false);
    });

    it('should enforce 30-second time windows', () => {
      const now = Date.now();
      const challenge = protocol.generateTemporalChallenge(MEETING_ID, now);
      
      const windowSize = challenge.validUntil - challenge.validFrom;
      expect(windowSize).toBe(30000); // 30 seconds
    });
  });
});
