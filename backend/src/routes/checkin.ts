import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as crypto from 'crypto';
import { sodium } from '../crypto/sodium';
import { TSCBProtocol, TSCBProof } from '../crypto/TSCBProtocol';
import { config } from '../config/config';

const protocol = new TSCBProtocol(config.TSCB_MASTER_KEY);

// Server-managed Ed25519 signing keypair.
// FACILITY_PRIVATE_KEY must be a 64-byte hex Ed25519 secret key (seed || pubkey).
// The public key is the "facility key" used by stamp_verify auditors.
let facilityPrivateKey: Uint8Array;
let facilityPublicKey: Uint8Array;

async function loadFacilityKeypair(): Promise<void> {
  await sodium.ready;
  const privHex = config.FACILITY_PRIVATE_KEY;

  if (privHex && /^[0-9a-f]{128}$/i.test(privHex)) {
    facilityPrivateKey = Buffer.from(privHex, 'hex');
    facilityPublicKey = facilityPrivateKey.slice(32);
    return;
  }

  if (config.NODE_ENV === 'production') {
    throw new Error('FACILITY_PRIVATE_KEY must be set in production');
  }

  // Ephemeral keypair for development — rotate on every restart.
  const kp = sodium.crypto_sign_keypair();
  facilityPrivateKey = kp.privateKey;
  facilityPublicKey = kp.publicKey;
}

interface CheckinBody {
  participantToken: string;
  meetingId: string;
  latitude: number;
  longitude: number;
  timestamp: number;
  signature: string;
}

interface CheckoutBody {
  sessionId: string;
  participantToken: string;
  signature: string;
}

const sessions = new Map<string, {
  sessionId: string;
  participantToken: string;
  meetingId: string;
  checkinProof: TSCBProof;
  checkinTime: number;
  checkoutTime?: number;
  status: 'active' | 'completed';
}>();

function isHex(value: string, expectedLength?: number): boolean {
  return /^[0-9a-f]+$/i.test(value) && (!expectedLength || value.length === expectedLength);
}

export async function checkinRoutes(fastify: FastifyInstance) {
  await protocol.initialize();
  await loadFacilityKeypair();

  fastify.get('/api/facility-pubkey', async (_request, reply) => {
    return reply.code(200).send({
      publicKey: Buffer.from(facilityPublicKey).toString('hex'),
      algorithm: 'ed25519'
    });
  });

  fastify.post<{ Body: CheckinBody }>('/api/checkin', {
    schema: {
      body: {
        type: 'object',
        required: ['participantToken', 'meetingId', 'latitude', 'longitude', 'timestamp', 'signature'],
        properties: {
          participantToken: { type: 'string' },
          meetingId: { type: 'string' },
          latitude: { type: 'number' },
          longitude: { type: 'number' },
          timestamp: { type: 'number' },
          signature: { type: 'string' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: CheckinBody }>, reply: FastifyReply) => {
    const { participantToken, meetingId, latitude, longitude, timestamp, signature } = request.body;

    if (!isHex(participantToken, 64) || !isHex(signature, 128)) {
      return reply.code(400).send({ error: 'Invalid participant key or signature format' });
    }

    const drift = Math.abs(Date.now() - timestamp);
    if (drift > 120000) {
      return reply.code(400).send({ error: 'Timestamp too old or in the future' });
    }

    const publicKeyBytes = Buffer.from(participantToken, 'hex');
    const message = Buffer.concat([
      Buffer.from(meetingId),
      Buffer.from(timestamp.toString())
    ]);

    let sigValid = false;
    try {
      sigValid = sodium.crypto_sign_verify_detached(
        Buffer.from(signature, 'hex'),
        message,
        publicKeyBytes
      );
    } catch {
      sigValid = false;
    }

    if (!sigValid) {
      return reply.code(401).send({ error: 'Invalid participant signature' });
    }

    let proof: TSCBProof;
    try {
      proof = await protocol.generateTSCBProof(
        meetingId,
        latitude,
        longitude,
        timestamp,
        Buffer.from(facilityPrivateKey)
      );
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }

    const participantHash = crypto.createHash('sha256').update(publicKeyBytes).digest('hex');
    const serverCheckinTime = Date.now();
    const sessionId = crypto.randomUUID();

    sessions.set(sessionId, {
      sessionId,
      participantToken: participantHash,
      meetingId,
      checkinProof: proof,
      checkinTime: serverCheckinTime,
      status: 'active'
    });

    return reply.code(201).send({
      sessionId,
      checkedIn: true,
      meetingId,
      serverCheckinTime,
      epoch: proof.temporalChallenge.epoch,
      validUntil: proof.temporalChallenge.validUntil,
      geohash: proof.spatialCommitment.geohash,
      bindingHash: proof.bindingHash
    });
  });

  fastify.post<{ Body: CheckoutBody }>('/api/checkout', {
    schema: {
      body: {
        type: 'object',
        required: ['sessionId', 'participantToken', 'signature'],
        properties: {
          sessionId: { type: 'string' },
          participantToken: { type: 'string' },
          signature: { type: 'string' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: CheckoutBody }>, reply: FastifyReply) => {
    const { sessionId, participantToken, signature } = request.body;

    if (!isHex(participantToken, 64) || !isHex(signature, 128)) {
      return reply.code(400).send({ error: 'Invalid participant key or signature format' });
    }

    const session = sessions.get(sessionId);
    if (!session) {
      return reply.code(404).send({ error: 'Session not found' });
    }
    if (session.status === 'completed') {
      return reply.code(409).send({ error: 'Session already checked out' });
    }

    const publicKeyBytes = Buffer.from(participantToken, 'hex');
    const participantHash = crypto.createHash('sha256').update(publicKeyBytes).digest('hex');
    if (participantHash !== session.participantToken) {
      return reply.code(403).send({ error: 'Token mismatch' });
    }

    const message = Buffer.concat([
      Buffer.from(sessionId),
      Buffer.from(session.checkinTime.toString())
    ]);

    let sigValid = false;
    try {
      sigValid = sodium.crypto_sign_verify_detached(
        Buffer.from(signature, 'hex'),
        message,
        publicKeyBytes
      );
    } catch {
      sigValid = false;
    }

    if (!sigValid) {
      return reply.code(401).send({ error: 'Invalid participant signature' });
    }

    const serverCheckoutTime = Date.now();
    const durationMs = serverCheckoutTime - session.checkinTime;
    const durationMinutes = Math.floor(durationMs / 60000);

    session.status = 'completed';
    session.checkoutTime = serverCheckoutTime;

    return reply.code(200).send({
      sessionId,
      checkedOut: true,
      durationMinutes,
      meetsMinimum: durationMs >= config.SESSION_MIN_DURATION_MS,
      checkinBindingHash: session.checkinProof.bindingHash
    });
  });

  fastify.get<{ Params: { sessionId: string } }>('/api/session/:sessionId', async (request, reply) => {
    const session = sessions.get(request.params.sessionId);
    if (!session) {
      return reply.code(404).send({ error: 'Not found' });
    }

    return reply.code(200).send({
      sessionId: session.sessionId,
      meetingId: session.meetingId,
      status: session.status,
      checkinTime: session.checkinTime,
      checkoutTime: session.checkoutTime,
      proof: session.checkinProof
    });
  });
}
