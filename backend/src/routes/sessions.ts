import { FastifyInstance } from 'fastify';
import { SessionService } from '../services/SessionService';
import { TSCBProtocol } from '../crypto/TSCBProtocol';
import { initSodium, getSodium } from '../crypto/sodium';

const protocol = new TSCBProtocol(
  process.env.TSCB_MASTER_KEY ||
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
);

export async function sessionRoutes(fastify: FastifyInstance) {
  await protocol.initialize();
  await initSodium();

  fastify.get('/api/sessions', async (_request, reply) => {
    const sessions = SessionService.list().map(toValidatorView);
    return reply.send({ sessions });
  });

  fastify.get<{ Params: { sessionId: string } }>(
    '/api/sessions/:sessionId',
    async (request, reply) => {
      const session = SessionService.get(request.params.sessionId);
      if (!session) {
        return reply.code(404).send({ error: 'Session not found' });
      }
      return reply.send(toValidatorView(session));
    }
  );

  fastify.post<{ Body: { sessionIds: string[] } }>(
    '/api/sessions/verify',
    async (request, reply) => {
      const { sessionIds } = request.body;
      if (!Array.isArray(sessionIds) || sessionIds.length === 0) {
        return reply.code(400).send({ error: 'sessionIds required' });
      }
      const verified = SessionService.markVerified(sessionIds);
      return reply.send({ verified, sessionIds });
    }
  );

  fastify.post<{ Params: { sessionId: string }; Body: { facilityPublicKey: string } }>(
    '/api/sessions/:sessionId/validate',
    async (request, reply) => {
      const session = SessionService.get(request.params.sessionId);
      if (!session) {
        return reply.code(404).send({ error: 'Session not found' });
      }

      const facilityKey = Buffer.from(request.body.facilityPublicKey, 'hex');
      const proof = session.checkinProof;
      const bindingHash = Buffer.from(proof.bindingHash, 'hex');
      const sigValid = getSodium().crypto_sign_verify_detached(
        Buffer.from(proof.signature, 'hex'),
        bindingHash,
        facilityKey
      );

      const result = await protocol.verifyTSCBProof(
        proof,
        facilityKey,
        proof.timestamp
      );

      return reply.send({
        sessionId: session.sessionId,
        signatureValid: sigValid,
        proofValid: result.isValid,
        checks: result.checks,
        meetsMinimum: session.meetsMinimum,
        locationVerified: session.locationVerified,
        status: session.status
      });
    }
  );
}

function toValidatorView(session: NonNullable<ReturnType<typeof SessionService.get>>) {
  const status =
    session.status === 'verified'
      ? 'verified'
      : session.status === 'invalid'
        ? 'invalid'
        : session.status === 'completed'
          ? 'pending'
          : 'active';

  return {
    id: session.sessionId,
    participantId: session.participantDisplay,
    meetingDate: new Date(session.checkinTime).toISOString().slice(0, 10),
    meetingType: session.meetingType,
    meetingName: session.meetingName,
    duration: (session.durationMinutes ?? 0) * 60,
    locationVerified: session.locationVerified,
    cryptographicSignature: session.checkinProof.signature.slice(0, 24) + '...',
    status,
    meetsMinimum: session.meetsMinimum ?? false,
    checkinTime: session.checkinTime,
    checkoutTime: session.checkoutTime
  };
}
