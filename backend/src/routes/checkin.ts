import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as crypto from 'crypto';
import { TSCBProtocol } from '../crypto/TSCBProtocol';
import { initSodium, getSodium } from '../crypto/sodium';
import { config } from '../config/config';
import { MeetingService } from '../services/MeetingService';
import { SessionService } from '../services/SessionService';

const protocol = new TSCBProtocol(
  process.env.TSCB_MASTER_KEY ||
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
);

let facilityPrivateKey: Uint8Array;
let facilityPublicKey: Uint8Array;

async function loadFacilityKeypair(): Promise<void> {
  await initSodium();
  const sodium = getSodium();
  const privHex = process.env.FACILITY_PRIVATE_KEY;
  if (privHex && privHex.length === 128) {
    facilityPrivateKey = Buffer.from(privHex, 'hex');
    facilityPublicKey = facilityPrivateKey.slice(32);
  } else {
    const kp = sodium.crypto_sign_keypair();
    facilityPrivateKey = kp.privateKey;
    facilityPublicKey = kp.publicKey;
    if (process.env.NODE_ENV === 'production') {
      throw new Error('FACILITY_PRIVATE_KEY must be set in production');
    }
  }
}

interface CheckinBody {
  participantToken: string;
  meetingId: string;
  latitude: number;
  longitude: number;
  timestamp: number;
  signature: string;
  qrChallenge?: string;
  qrEpoch?: number;
}

interface CheckoutBody {
  sessionId: string;
  participantToken: string;
  latitude: number;
  longitude: number;
  signature: string;
}

function verifyParticipantSignature(
  publicKeyBytes: Buffer,
  signatureHex: string,
  message: Buffer
): boolean {
  try {
    return getSodium().crypto_sign_verify_detached(
      Buffer.from(signatureHex, 'hex'),
      message,
      publicKeyBytes
    );
  } catch {
    return false;
  }
}

function participantDisplay(publicKeyBytes: Buffer): string {
  return `P-${crypto.createHash('sha256').update(publicKeyBytes).digest('hex').slice(0, 8)}`;
}

export async function checkinRoutes(fastify: FastifyInstance) {
  await protocol.initialize();
  await loadFacilityKeypair();
  await MeetingService.initialize(protocol);

  fastify.get('/api/facility-pubkey', async (_request, reply) => {
    return reply.code(200).send({
      publicKey: Buffer.from(facilityPublicKey).toString('hex'),
      algorithm: 'ed25519'
    });
  });

  fastify.post<{ Body: CheckinBody }>('/api/checkin', async (request, reply) => {
    const {
      participantToken,
      meetingId,
      latitude,
      longitude,
      timestamp,
      signature,
      qrChallenge,
      qrEpoch
    } = request.body;

    const drift = Math.abs(Date.now() - timestamp);
    if (drift > 120000) {
      return reply.code(400).send({ error: 'Timestamp too old or in the future' });
    }

    const publicKeyBytes = Buffer.from(participantToken, 'hex');
    const message = Buffer.concat([
      Buffer.from(meetingId),
      Buffer.from(timestamp.toString())
    ]);
    if (!verifyParticipantSignature(publicKeyBytes, signature, message)) {
      return reply.code(401).send({ error: 'Invalid participant signature' });
    }

    if (qrChallenge && qrEpoch !== undefined) {
      const expected = protocol.generateTemporalChallenge(meetingId, timestamp);
      if (expected.epoch !== qrEpoch || expected.challenge !== qrChallenge) {
        return reply.code(400).send({ error: 'QR challenge expired or invalid — scan again' });
      }
    }

    const locationCheck = MeetingService.validateAtMeeting(
      meetingId,
      latitude,
      longitude,
      timestamp
    );
    if (!locationCheck.ok) {
      return reply.code(400).send({ error: locationCheck.error });
    }

    let proof;
    try {
      proof = await protocol.generateTSCBProof(
        meetingId,
        latitude,
        longitude,
        timestamp,
        Buffer.from(facilityPrivateKey)
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Proof generation failed';
      return reply.code(400).send({ error: message });
    }

    const participantHash = crypto.createHash('sha256').update(publicKeyBytes).digest('hex');
    const serverCheckinTime = Date.now();
    const sessionId = crypto.randomUUID();

    const session = {
      sessionId,
      participantToken: participantHash,
      participantDisplay: participantDisplay(publicKeyBytes),
      meetingId,
      meetingName: locationCheck.meeting.name,
      meetingType: locationCheck.meeting.meetingType,
      checkinProof: proof,
      checkinTime: serverCheckinTime,
      checkinGeohash: proof.spatialCommitment.geohash,
      status: 'active' as const,
      locationVerified: true
    };

    SessionService.save(session);

    return reply.code(201).send({
      sessionId,
      checkedIn: true,
      meetingId,
      meetingName: locationCheck.meeting.name,
      serverCheckinTime,
      geohash: proof.spatialCommitment.geohash,
      bindingHash: proof.bindingHash,
      minimumDurationMinutes: locationCheck.meeting.minimumDurationMinutes
    });
  });

  fastify.post<{ Body: CheckoutBody }>('/api/checkout', async (request, reply) => {
    const { sessionId, participantToken, latitude, longitude, signature } = request.body;

    const session = SessionService.get(sessionId);
    if (!session) {
      return reply.code(404).send({ error: 'Session not found' });
    }
    if (session.status !== 'active') {
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
    if (!verifyParticipantSignature(publicKeyBytes, signature, message)) {
      return reply.code(401).send({ error: 'Invalid participant signature' });
    }

    const checkoutTime = Date.now();
    const locationCheck = MeetingService.validateAtMeeting(
      session.meetingId,
      latitude,
      longitude,
      checkoutTime
    );
    if (!locationCheck.ok) {
      return reply.code(400).send({ error: locationCheck.error });
    }

    let checkoutProof;
    try {
      checkoutProof = await protocol.generateTSCBProof(
        session.meetingId,
        latitude,
        longitude,
        checkoutTime,
        Buffer.from(facilityPrivateKey)
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Checkout proof failed';
      return reply.code(400).send({ error: msg });
    }

    if (session.checkinGeohash !== checkoutProof.spatialCommitment.geohash) {
      return reply.code(400).send({
        error: 'Check-out must occur in the same geohash cell as check-in'
      });
    }

    const durationMs = checkoutTime - session.checkinTime;
    const durationMinutes = Math.floor(durationMs / 60000);
    const minMinutes = locationCheck.meeting.minimumDurationMinutes;
    const meetsMinimum = durationMs >= minMinutes * 60000;

    const completed = {
      ...session,
      checkoutProof,
      checkoutTime,
      checkoutGeohash: checkoutProof.spatialCommitment.geohash,
      status: meetsMinimum ? ('completed' as const) : ('invalid' as const),
      durationMinutes,
      meetsMinimum,
      locationVerified: true
    };

    SessionService.save(completed);

    return reply.code(200).send({
      sessionId,
      checkedOut: true,
      durationMinutes,
      meetsMinimum,
      minimumDurationMinutes: minMinutes,
      checkinBindingHash: session.checkinProof.bindingHash,
      exportRecord: buildExportRecord(completed)
    });
  });

  fastify.get<{ Params: { sessionId: string } }>(
    '/api/session/:sessionId',
    async (request, reply) => {
      const session = SessionService.get(request.params.sessionId);
      if (!session) {
        return reply.code(404).send({ error: 'Not found' });
      }
      return reply.code(200).send(buildExportRecord(session));
    }
  );
}

function buildExportRecord(session: ReturnType<typeof SessionService.get>) {
  if (!session) return null;
  return {
    sessionId: session.sessionId,
    meetingId: session.meetingId,
    meetingName: session.meetingName,
    meetingType: session.meetingType,
    participantDisplay: session.participantDisplay,
    checkinTime: session.checkinTime,
    checkoutTime: session.checkoutTime,
    status: session.status,
    durationMinutes: session.durationMinutes,
    meetsMinimum: session.meetsMinimum,
    locationVerified: session.locationVerified,
    proof: session.checkinProof
  };
}
