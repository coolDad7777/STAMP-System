import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as crypto from 'crypto';
import * as sodium from 'libsodium-wrappers';
import { TSCBProtocol, TSCBProof } from '../crypto/TSCBProtocol';

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
  participantToken: string;   // hex-encoded Ed25519 public key (pseudonymous ID)
  meetingId: string;
  latitude: number;
  longitude: number;
  timestamp: number;
  signature: string;          // Ed25519 sig over (meetingId || timestamp), hex — proves key ownership
}

interface CheckoutBody {
  sessionId: string;
  participantToken: string;
  signature: string;          // Ed25519 sig over (sessionId || serverCheckinTime), hex
}

// In-memory session store — replace with DatabaseService in production
const sessions = new Map<string, {
  sessionId: string;
  participantToken: string;
  meetingId: string;
  checkinProof: TSCBProof;
  checkinTime: number;        // server wall-clock time at check-in (not client-supplied)
  checkoutTime?: number;      // server wall-clock time at checkout
  status: 'active' | 'completed';
}>();

export async function checkinRoutes(fastify: FastifyInstance) {
  await protocol.initialize();
  await loadFacilityKeypair();

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

    // Verify client timestamp is fresh (±2 minutes) — used only for TSCB epoch, not for duration
    const drift = Math.abs(Date.now() - timestamp);
    if (drift > 120000) {
      return reply.code(400).send({ error: 'Timestamp too old or in the future' });
    }

    // Verify the participant's Ed25519 signature over (meetingId || timestamp)
    // This proves they hold the private key — prevents token theft
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

  // POST /api/checkout — client leaves session
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

    // Signature is over (sessionId || serverCheckinTime) — binds checkout to the specific
    // server-recorded check-in time so the client cannot alter the duration baseline.
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

    // Use server wall-clock time for checkout — client cannot influence duration
    const serverCheckoutTime = Date.now();
    const durationMs = serverCheckoutTime - session.checkinTime;
    const durationMinutes = Math.floor(durationMs / 60000);

    session.status = 'completed';
    session.checkoutTime = serverCheckoutTime;

    return reply.code(200).send({
      sessionId,
      checkedOut: true,
      durationMinutes,
      meetsMinimum: durationMinutes >= 45,
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
