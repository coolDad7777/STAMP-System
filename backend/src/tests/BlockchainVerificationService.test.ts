import { describe, it, expect, beforeAll } from '@jest/globals';
import { config } from '../config/config';
import { BlockchainVerificationService } from '../services/BlockchainVerificationService';
import type { AttendanceStamp } from '../services/BlockchainVerificationService';

type BlockchainServiceClass = typeof BlockchainVerificationService;

/**
 * backend/src/services/BlockchainVerificationService.ts was rewritten from an
 * `ethers`-backed cross-jurisdiction blockchain client (which imported a
 * missing `ethers` module and referenced config keys that don't exist,
 * breaking the build) into a deterministic, dependency-free local adapter.
 *
 * These tests cover the new local-verification-mode behavior: initialization
 * gating, stamp validity rules, and the fixed shapes returned by the trust /
 * network-stats helpers.
 *
 * Each describe block uses `jest.resetModules()` to get a fresh copy of the
 * class (it holds static, module-level state) so initialization order
 * doesn't leak between tests.
 */
function buildStamp(overrides: Partial<AttendanceStamp> = {}): AttendanceStamp {
  return {
    userPseudonym: 'user-pseudonym-1',
    meetingId: 'meeting-1',
    sessionStart: 0,
    sessionEnd: config.SESSION_MIN_DURATION_MS,
    sessionDuration: config.SESSION_MIN_DURATION_MS,
    locationProof: 'geohash-proof',
    integrityHash: 'a'.repeat(64),
    ...overrides
  };
}

describe('BlockchainVerificationService', () => {
  describe('before initialization', () => {
    function freshService(): BlockchainServiceClass {
      jest.resetModules();
      return require('../services/BlockchainVerificationService').BlockchainVerificationService;
    }

    it('reports healthCheck as false', async () => {
      const Service = freshService();
      expect(await Service.healthCheck()).toBe(false);
    });

    it('throws when requestCrossJurisdictionVerification is called before initialize()', async () => {
      const Service = freshService();
      await expect(
        Service.requestCrossJurisdictionVerification(buildStamp(), 'jurisdiction-b')
      ).rejects.toThrow('BlockchainVerificationService not initialized');
    });

    it('throws when establishTrust is called before initialize()', async () => {
      const Service = freshService();
      await expect(Service.establishTrust('partner-jurisdiction')).rejects.toThrow(
        'BlockchainVerificationService not initialized'
      );
    });

    it('throws when getNetworkStats is called before initialize()', async () => {
      const Service = freshService();
      await expect(Service.getNetworkStats()).rejects.toThrow(
        'BlockchainVerificationService not initialized'
      );
    });
  });

  describe('after initialization', () => {
    let Service: BlockchainServiceClass;

    beforeAll(async () => {
      jest.resetModules();
      ({ BlockchainVerificationService: Service } = require('../services/BlockchainVerificationService'));
      await Service.initialize();
    });

    it('is idempotent when initialize() is called more than once', async () => {
      await expect(Service.initialize()).resolves.toBeUndefined();
      expect(await Service.healthCheck()).toBe(true);
    });

    it('marks a stamp valid when duration meets the minimum and an integrity hash is present', async () => {
      const result = await Service.requestCrossJurisdictionVerification(buildStamp(), 'jurisdiction-b');

      expect(result.success).toBe(true);
      expect(result.isValid).toBe(true);
      expect(result.confidenceScore).toBe(80);
      expect(result.requestId).toMatch(/^[0-9a-f]{64}$/);
      expect(result.transactionHash).toMatch(/^[0-9a-f]{64}$/);
      expect(result.blockNumber).toBe(0);
      expect(typeof result.verificationTime).toBe('number');
    });

    it('marks a stamp invalid when duration is below the configured minimum', async () => {
      const result = await Service.requestCrossJurisdictionVerification(
        buildStamp({ sessionDuration: config.SESSION_MIN_DURATION_MS - 1 }),
        'jurisdiction-b'
      );

      expect(result.success).toBe(true);
      expect(result.isValid).toBe(false);
      expect(result.confidenceScore).toBe(0);
    });

    it('marks a stamp invalid when the integrity hash is missing', async () => {
      const result = await Service.requestCrossJurisdictionVerification(
        buildStamp({ integrityHash: '' }),
        'jurisdiction-b'
      );

      expect(result.isValid).toBe(false);
      expect(result.confidenceScore).toBe(0);
    });

    it('generates different request ids for requests with different stamp content', async () => {
      const first = await Service.requestCrossJurisdictionVerification(buildStamp(), 'jurisdiction-b');
      const second = await Service.requestCrossJurisdictionVerification(
        buildStamp({ meetingId: 'meeting-2' }),
        'jurisdiction-b'
      );

      expect(first.requestId).not.toBe(second.requestId);
    });

    it('accepts trust establishment outside of production', async () => {
      const accepted = await Service.establishTrust('partner-jurisdiction');
      expect(accepted).toBe(config.NODE_ENV !== 'production');
    });

    it('reports mutual trust only when both jurisdiction identifiers are provided', async () => {
      expect(await Service.hasMutualTrust('jurisdiction-a', 'jurisdiction-b')).toBe(
        config.NODE_ENV !== 'production'
      );
      expect(await Service.hasMutualTrust('', 'jurisdiction-b')).toBe(false);
      expect(await Service.hasMutualTrust('jurisdiction-a', '')).toBe(false);
    });

    it('registers a jurisdiction only when a name and public key hash are provided', async () => {
      expect(await Service.registerJurisdiction('Test County', 'pubkey-hash-abc')).toBe(
        config.NODE_ENV !== 'production'
      );
      expect(await Service.registerJurisdiction('', 'pubkey-hash-abc')).toBe(false);
      expect(await Service.registerJurisdiction('Test County', '')).toBe(false);
    });

    it('returns fixed local-verification-mode network stats', async () => {
      const stats = await Service.getNetworkStats();

      expect(stats).toEqual({
        network: 'local-verification-mode',
        chainId: 0,
        currentBlock: 0,
        walletBalance: '0',
        contractAddress: '0x0000000000000000000000000000000000000000'
      });
    });
  });
});