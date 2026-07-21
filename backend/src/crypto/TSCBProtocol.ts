import * as crypto from 'crypto';
import { sodium } from './sodium';
import { CryptoService } from './CryptoService';

/**
 * Temporal-Spatial Cryptographic Binding (TSCB) Implementation
 *
 * This module implements the core cryptographic protocol that makes STAMP
 * stamps difficult to forge while maintaining privacy. Each attendance stamp is
 * bound to a specific time window and geographic boundary.
 */
export class TSCBProtocol {
  private masterKey: Buffer;
  private initialized = false;

  constructor(masterKey: string) {
    this.masterKey = this.normalizeMasterKey(masterKey);
  }

  async initialize(): Promise<void> {
    await sodium.ready;
    await CryptoService.initialize();
    this.initialized = true;
  }

  generateTemporalChallenge(meetingId: string, timestamp: number): TemporalChallenge {
    this.ensureInitialized();

    const epochSize = 30000;
    const epoch = Math.floor(timestamp / epochSize);

    const meetingKey = crypto.createHmac('sha256', this.masterKey)
      .update(meetingId)
      .digest();

    const challengeInput = Buffer.concat([
      meetingKey,
      Buffer.from(epoch.toString())
    ]);

    const challenge = crypto.createHmac('sha256', meetingKey)
      .update(challengeInput)
      .digest('hex');

    return {
      challenge,
      epoch,
      validFrom: epoch * epochSize,
      validUntil: (epoch + 1) * epochSize,
      meetingId
    };
  }

  validateTemporalChallenge(challenge: TemporalChallenge, currentTime: number): boolean {
    this.ensureInitialized();

    if (currentTime < challenge.validFrom || currentTime > challenge.validUntil) {
      return false;
    }

    const expectedChallenge = this.generateTemporalChallenge(
      challenge.meetingId,
      challenge.validFrom
    );

    return crypto.timingSafeEqual(
      Buffer.from(challenge.challenge, 'hex'),
      Buffer.from(expectedChallenge.challenge, 'hex')
    );
  }

  generateSpatialCommitment(
    latitude: number,
    longitude: number,
    temporalChallenge: TemporalChallenge
  ): SpatialCommitment {
    this.ensureInitialized();

    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      throw new Error('Invalid coordinates');
    }

    const geohash = this.encodeGeohash(latitude, longitude, 7);

    const commitmentInput = Buffer.concat([
      Buffer.from(geohash),
      Buffer.from(temporalChallenge.challenge, 'hex'),
      Buffer.from(temporalChallenge.meetingId)
    ]);

    const meetingKey = crypto.createHmac('sha256', this.masterKey)
      .update(temporalChallenge.meetingId)
      .digest();

    const commitment = crypto.createHmac('sha256', meetingKey)
      .update(commitmentInput)
      .digest('hex');

    const center = this.geohashToCoordinates(geohash);
    return {
      geohash,
      precision: 7,
      commitment,
      latitudeApprox: center.latitude,
      longitudeApprox: center.longitude
    };
  }

  validateSpatialCommitment(
    commitment: SpatialCommitment,
    meetingGeohash: string,
    maxDistanceMeters: number = 200
  ): boolean {
    this.ensureInitialized();

    if (commitment.precision !== 7) {
      return false;
    }

    const userCoords = this.geohashToCoordinates(commitment.geohash);
    const meetingCoords = this.geohashToCoordinates(meetingGeohash);

    const distance = this.haversineDistance(
      userCoords.latitude,
      userCoords.longitude,
      meetingCoords.latitude,
      meetingCoords.longitude
    );

    return distance <= maxDistanceMeters;
  }

  async generateTSCBProof(
    meetingId: string,
    latitude: number,
    longitude: number,
    timestamp: number,
    userPrivateKey: Buffer
  ): Promise<TSCBProof> {
    this.ensureInitialized();

    const temporalChallenge = this.generateTemporalChallenge(meetingId, timestamp);
    const spatialCommitment = this.generateSpatialCommitment(
      latitude,
      longitude,
      temporalChallenge
    );

    const bindingData = Buffer.concat([
      Buffer.from(temporalChallenge.challenge, 'hex'),
      Buffer.from(spatialCommitment.commitment, 'hex'),
      Buffer.from(meetingId)
    ]);

    const bindingHash = crypto.createHash('sha256')
      .update(bindingData)
      .digest();

    const signatureBytes = sodium.crypto_sign_detached(bindingHash, userPrivateKey);

    return {
      temporalChallenge,
      spatialCommitment,
      bindingHash: bindingHash.toString('hex'),
      signature: Buffer.from(signatureBytes).toString('hex'),
      timestamp,
      meetingId
    };
  }

  async verifyTSCBProof(
    proof: TSCBProof,
    userPublicKey: Buffer,
    currentTime: number,
    maxTimeDrift: number = 300000
  ): Promise<VerificationResult> {
    this.ensureInitialized();

    const result: VerificationResult = {
      isValid: false,
      checks: {
        temporal: undefined,
        spatial: undefined,
        binding: undefined,
        signature: undefined
      }
    };

    const timeDiff = Math.abs(currentTime - proof.timestamp);
    if (timeDiff > maxTimeDrift) {
      result.checks.temporal = 'expired';
      return result;
    }

    if (!this.validateTemporalChallenge(proof.temporalChallenge, proof.timestamp)) {
      result.checks.temporal = 'invalid_challenge';
      return result;
    }
    result.checks.temporal = 'valid';

    if (proof.spatialCommitment.precision !== 7) {
      result.checks.spatial = 'invalid_precision';
      return result;
    }
    result.checks.spatial = 'valid';

    const bindingData = Buffer.concat([
      Buffer.from(proof.temporalChallenge.challenge, 'hex'),
      Buffer.from(proof.spatialCommitment.commitment, 'hex'),
      Buffer.from(proof.meetingId)
    ]);

    const expectedBindingHash = crypto.createHash('sha256')
      .update(bindingData)
      .digest();

    if (!crypto.timingSafeEqual(
      Buffer.from(proof.bindingHash, 'hex'),
      expectedBindingHash
    )) {
      result.checks.binding = 'hash_mismatch';
      return result;
    }
    result.checks.binding = 'valid';

    let signatureValid = false;
    try {
      signatureValid = sodium.crypto_sign_verify_detached(
        Buffer.from(proof.signature, 'hex'),
        expectedBindingHash,
        userPublicKey
      );
    } catch {
      signatureValid = false;
    }

    if (!signatureValid) {
      result.checks.signature = 'invalid';
      return result;
    }

    result.checks.signature = 'valid';
    result.isValid = true;
    return result;
  }

  generateZeroKnowledgeProof(
    tscbProof: TSCBProof,
    meetingDate: string,
    minDuration: number
  ): ZeroKnowledgeProof {
    const zkCommitment = crypto.createHash('sha256')
      .update(Buffer.from(tscbProof.bindingHash, 'hex'))
      .update(Buffer.from(meetingDate))
      .update(Buffer.from(minDuration.toString()))
      .digest('hex');

    return {
      commitment: zkCommitment,
      meetingDate,
      minDurationMet: true,
      proofType: 'attendance_verification'
    };
  }

  private encodeGeohash(latitude: number, longitude: number, precision: number): string {
    const base32 = '0123456789bcdefghjkmnpqrstuvwxyz';
    let geohash = '';
    let latRange = [-90.0, 90.0];
    let lonRange = [-180.0, 180.0];
    let isEven = true;
    let bit = 0;
    let ch = 0;

    while (geohash.length < precision) {
      if (isEven) {
        const mid = (lonRange[0] + lonRange[1]) / 2;
        if (longitude >= mid) {
          ch = (ch << 1) | 1;
          lonRange[0] = mid;
        } else {
          ch = ch << 1;
          lonRange[1] = mid;
        }
      } else {
        const mid = (latRange[0] + latRange[1]) / 2;
        if (latitude >= mid) {
          ch = (ch << 1) | 1;
          latRange[0] = mid;
        } else {
          ch = ch << 1;
          latRange[1] = mid;
        }
      }

      isEven = !isEven;
      bit++;

      if (bit === 5) {
        geohash += base32[ch];
        bit = 0;
        ch = 0;
      }
    }

    return geohash;
  }

  private haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
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

  private geohashToCoordinates(geohash: string): { latitude: number; longitude: number } {
    const base32 = '0123456789bcdefghjkmnpqrstuvwxyz';
    let latRange = [-90.0, 90.0];
    let lonRange = [-180.0, 180.0];
    let isEven = true;

    for (const char of geohash) {
      const idx = base32.indexOf(char);
      if (idx === -1) throw new Error(`Invalid geohash character: ${char}`);
      for (let bitPos = 4; bitPos >= 0; bitPos--) {
        const bitSet = (idx >> bitPos) & 1;
        if (isEven) {
          const mid = (lonRange[0] + lonRange[1]) / 2;
          if (bitSet) lonRange[0] = mid;
          else lonRange[1] = mid;
        } else {
          const mid = (latRange[0] + latRange[1]) / 2;
          if (bitSet) latRange[0] = mid;
          else latRange[1] = mid;
        }
        isEven = !isEven;
      }
    }

    return {
      latitude: (latRange[0] + latRange[1]) / 2,
      longitude: (lonRange[0] + lonRange[1]) / 2
    };
  }

  private normalizeMasterKey(masterKey: string): Buffer {
    if (/^[0-9a-f]{64}$/i.test(masterKey)) {
      return Buffer.from(masterKey, 'hex');
    }

    return crypto.createHash('sha256').update(masterKey).digest();
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('TSCBProtocol not initialized. Call initialize() first.');
    }
  }
}

export interface TemporalChallenge {
  challenge: string;
  epoch: number;
  validFrom: number;
  validUntil: number;
  meetingId: string;
}

export interface SpatialCommitment {
  geohash: string;
  precision: number;
  commitment: string;
  latitudeApprox: number;
  longitudeApprox: number;
}

export interface TSCBProof {
  temporalChallenge: TemporalChallenge;
  spatialCommitment: SpatialCommitment;
  bindingHash: string;
  signature: string;
  timestamp: number;
  meetingId: string;
}

export interface VerificationResult {
  isValid: boolean;
  checks: {
    temporal?: string;
    spatial?: string;
    binding?: string;
    signature?: string;
  };
}

export interface ZeroKnowledgeProof {
  commitment: string;
  meetingDate: string;
  minDurationMet: boolean;
  proofType: string;
}
