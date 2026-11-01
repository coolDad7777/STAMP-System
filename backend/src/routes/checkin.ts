import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as crypto from 'crypto';
import sodium from 'libsodium-wrappers';
import { TSCBProtocol, TSCBProof } from '../crypto/TSCBProtocol';
import { RegisteredMeeting, loadMeetings, locationError, checkinMessage, checkoutMessage } from '../services/MeetingRegistry';

const protocol = new TSCBProtocol(process.env.TSCB_MASTER_KEY || 'default-master-key');

// Server-managed Ed25519 signing keypair.
// FACILITY_PRIVATE_KEY must be a 64-byte hex Ed25519 secret key (seed || pubkey).
// Generate once with: node -e "const s=require('libsodium-wrappers');s.ready.then(()=>{const kp=s.crypto_sign_keypair();console.log('priv:',Buffer.from(kp.privateKey).toString('hex'));console.log('pub:',Buffer.from(kp.publicKey).toString('hex'));})"
// The public key is the "facility key" used by stamp_verify auditors.
let facilityPrivateKey: Uint8Array;
let facilityPublicKey: Uint8Array;

async function loadFacilityKeypair(): Promise<void> {
  await sodium.ready;
  const privHex = process.env.FACILITY_PRIVATE_KEY;
  if (privHex && privHex.length === 128) {
    facilityPrivateKey = Buffer.from(privHex, 'hex');
    // Ed25519 secret key is seed(32) || pubkey(32); public key is the last 32 bytes
    facilityPublicKey = facilityPrivateKey.slice(32);
  } else {
    // Ephemeral keypair for development — rotate on every restart, not suitable for production
    const kp = sodium.crypto_sign_keypair();
    facilityPrivateKey = kp.privateKey;
    facilityPublicKey = kp.publicKey;
    if (process.env.NODE_ENV === 'production') {
      throw new Error('FACILITY_PRIVATE_KEY must be set in production');
    }
  }
}

interface CheckinBody {
  version: 2;
  accuracyMeters: number;
  participantToken: string;   // hex-encoded Ed25519 public key (pseudonymous ID)
  meetingId: string;
  latitude: number;
  longitude: number;
  timestamp: number;
  signature: string;          // Signature over checkinMessage v2
}

interface CheckoutBody {
  version: 2;
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  timestamp: number;
  sessionId: string;
  participantToken: string;
  signature: string;          // Signature over checkoutMessage v2
}

// In-memory session store — replace with DatabaseService in production
type Session = {
  sessionId: string;
  participantToken: string;
  meetingId: string;
  checkinProof: TSCBProof;
  checkinTime: number;        // server wall-clock time at check-in (not client-supplied)
  checkoutTime?: number;      // server wall-clock time at checkout
  status: 'active' | 'completed';
  meeting: RegisteredMeeting;
};

export async function checkinRoutes(fastify: FastifyInstance) {
  await protocol.initialize();
  await loadFacilityKeypair();
  const meetings = loadMeetings();
  const sessions = new Map<string, Session>();

  // GET /api/facility-pubkey — auditors retrieve the facility public key out-of-band
  fastify.get('/api/facility-pubkey', async (_request, reply) => {
    return reply.code(200).send({
      publicKey: Buffer.from(facilityPublicKey).toString('hex'),
      algorithm: 'ed25519'
    });
  });

  // POST /api/checkin — client arrives at session, submits GPS + timestamp
  fastify.post<{ Body: CheckinBody }>('/api/checkin', {
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['version', 'participantToken', 'meetingId', 'latitude', 'longitude', 'accuracyMeters', 'timestamp', 'signature'],
        properties: {
          version: { type: 'integer', const: 2 },
          accuracyMeters: { type: 'number', exclusiveMinimum: 0, maximum: 100 },
          participantToken: { type: 'string', pattern: '^[a-fA-F0-9]{64}$' },
          meetingId: { type: 'string', minLength: 1, maxLength: 128 },
          latitude: { type: 'number', minimum: -90, maximum: 90 },
          longitude: { type: 'number', minimum: -180, maximum: 180 },
          timestamp: { type: 'integer', minimum: 0 },
          signature: { type: 'string', pattern: '^[a-fA-F0-9]{128}$' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: CheckinBody }>, reply: FastifyReply) => {
    const { participantToken, meetingId, latitude, longitude, timestamp, signature } = request.body;

    const meeting = meetings.get(meetingId);
    if (!meeting) return reply.code(404).send({ error: 'Unknown meeting' });
    const rejected = locationError(meeting, request.body, Date.now());
    if (rejected) return reply.code(400).send({ error: rejected });

    const publicKeyBytes = Buffer.from(participantToken, 'hex');
    const message = checkinMessage(request.body);
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

    // Generate TSCB proof signed by the facility's Ed25519 secret key.
    // The facility public key is what stamp_verify auditors use to verify the signature.
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

    // Use server wall-clock time for the authoritative check-in timestamp,
    // not the client-supplied value, so clients cannot manipulate duration.
    const serverCheckinTime = Date.now();
    const sessionId = crypto.randomUUID();
    sessions.set(sessionId, {
      sessionId,
      participantToken: participantHash,
      meetingId,
      checkinProof: proof,
      checkinTime: serverCheckinTime,
      status: 'active',
      meeting
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

  // POST /api/checkout — client leaves session
  fastify.post<{ Body: CheckoutBody }>('/api/checkout', {
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['version', 'sessionId', 'participantToken', 'latitude', 'longitude', 'accuracyMeters', 'timestamp', 'signature'],
        properties: {
          sessionId: { type: 'string' },
          latitude: { type: 'number', minimum: -90, maximum: 90 },
          longitude: { type: 'number', minimum: -180, maximum: 180 },
          timestamp: { type: 'integer', minimum: 0 },
          version: { type: 'integer', const: 2 },
          accuracyMeters: { type: 'number', exclusiveMinimum: 0, maximum: 100 },
          participantToken: { type: 'string', pattern: '^[a-fA-F0-9]{64}$' },
          signature: { type: 'string', pattern: '^[a-fA-F0-9]{128}$' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: CheckoutBody }>, reply: FastifyReply) => {
    const { sessionId, participantToken, signature } = request.body;

    const session = sessions.get(sessionId);
    if (!session) {
      return reply.code(404).send({ error: 'Session not found' });
    }
    if (session.status === 'completed') {
      return reply.code(409).send({ error: 'Session already checked out' });
    }

    // Verify ownership
    const publicKeyBytes = Buffer.from(participantToken, 'hex');
    const participantHash = crypto.createHash('sha256').update(publicKeyBytes).digest('hex');
    if (participantHash !== session.participantToken) {
      return reply.code(403).send({ error: 'Token mismatch' });
    }

    const rejected = locationError(session.meeting, request.body, Date.now());
    if (rejected) return reply.code(400).send({ error: rejected });
    const message = checkoutMessage(request.body, session.checkinTime);
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

    // Use server wall-clock time for checkout — client cannot influence duration
    const serverCheckoutTime = Date.now();
    const durationMs = serverCheckoutTime - session.checkinTime;
    const durationMinutes = Math.floor(durationMs / 60000);

    if (durationMs < session.meeting.minimumDurationMs) {
      return reply.code(409).send({ error: 'Minimum attendance duration not reached' });
    }

    session.status = 'completed';
    session.checkoutTime = serverCheckoutTime;

    return reply.code(200).send({
      sessionId,
      checkedOut: true,
      durationMinutes,
      meetsMinimum: true,
      checkinBindingHash: session.checkinProof.bindingHash
    });
  });

  // GET /api/session/:sessionId — retrieve a session record for audit
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
