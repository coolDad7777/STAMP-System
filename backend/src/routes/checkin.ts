import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as crypto from 'crypto';
import { TSCBProtocol, TSCBProof } from '../crypto/TSCBProtocol';

const protocol = new TSCBProtocol(process.env.TSCB_MASTER_KEY || 'default-master-key');

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
  latitude: number;
  longitude: number;
  timestamp: number;
  signature: string;
}

// In-memory session store — replace with DatabaseService in production
const sessions = new Map<string, {
  sessionId: string;
  participantToken: string;
  meetingId: string;
  checkinProof: TSCBProof;
  checkinTime: number;
  status: 'active' | 'completed';
}>();

export async function checkinRoutes(fastify: FastifyInstance) {
  await protocol.initialize();

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

    // Verify timestamp is fresh (±2 minutes)
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
      const { default: sodium } = await import('libsodium-wrappers');
      await sodium.ready;
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

    // Generate TSCB proof server-side using the participant's public key as their identity
    // The private key used here is the server's meeting key — the participant's public key
    // is bound into the proof as the identity commitment, not used for signing.
    // NOTE: In production, the client generates and signs the proof; server only verifies.
    // For MVP we generate server-side to avoid shipping private keys to client.
    const meetingKey = crypto.createHmac('sha256', Buffer.from(process.env.TSCB_MASTER_KEY || 'default-master-key', 'hex'))
      .update(meetingId)
      .digest();

    let proof: TSCBProof;
    try {
      proof = await protocol.generateTSCBProof(meetingId, latitude, longitude, timestamp, meetingKey);
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }

    // Attach participant identity hash (pseudonymous — not raw public key in production)
    const participantHash = crypto.createHash('sha256').update(publicKeyBytes).digest('hex');

    const sessionId = crypto.randomUUID();
    sessions.set(sessionId, {
      sessionId,
      participantToken: participantHash,
      meetingId,
      checkinProof: proof,
      checkinTime: timestamp,
      status: 'active'
    });

    return reply.code(201).send({
      sessionId,
      checkedIn: true,
      meetingId,
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
        required: ['sessionId', 'participantToken', 'latitude', 'longitude', 'timestamp', 'signature'],
        properties: {
          sessionId: { type: 'string' },
          participantToken: { type: 'string' },
          latitude: { type: 'number' },
          longitude: { type: 'number' },
          timestamp: { type: 'number' },
          signature: { type: 'string' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: CheckoutBody }>, reply: FastifyReply) => {
    const { sessionId, participantToken, latitude, longitude, timestamp, signature } = request.body;

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

    // Verify checkout signature
    const message = Buffer.concat([
      Buffer.from(sessionId),
      Buffer.from(timestamp.toString())
    ]);
    let sigValid = false;
    try {
      const { default: sodium } = await import('libsodium-wrappers');
      await sodium.ready;
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

    const durationMs = timestamp - session.checkinTime;
    const durationMinutes = Math.floor(durationMs / 60000);

    session.status = 'completed';

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
      proof: session.checkinProof
    });
  });
}
