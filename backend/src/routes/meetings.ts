import { FastifyInstance } from 'fastify';
import { MeetingService } from '../services/MeetingService';
import { TSCBProtocol } from '../crypto/TSCBProtocol';

const protocol = new TSCBProtocol(
  process.env.TSCB_MASTER_KEY ||
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
);

export async function meetingRoutes(fastify: FastifyInstance) {
  await protocol.initialize();
  await MeetingService.initialize(protocol);

  fastify.get('/api/meetings', async (_request, reply) => {
    const meetings = MeetingService.listActive().map((m) => ({
      id: m.id,
      name: m.name,
      meetingType: m.meetingType,
      latitude: m.latitude,
      longitude: m.longitude,
      minimumDurationMinutes: m.minimumDurationMinutes
    }));
    return reply.send({ meetings });
  });

  fastify.get<{ Params: { meetingId: string } }>(
    '/api/meetings/:meetingId',
    async (request, reply) => {
      const meeting = MeetingService.getById(request.params.meetingId);
      if (!meeting) {
        return reply.code(404).send({ error: 'Meeting not found' });
      }
      return reply.send({
        id: meeting.id,
        name: meeting.name,
        meetingType: meeting.meetingType,
        latitude: meeting.latitude,
        longitude: meeting.longitude,
        minimumDurationMinutes: meeting.minimumDurationMinutes
      });
    }
  );

  fastify.get<{ Params: { meetingId: string } }>(
    '/api/meetings/:meetingId/qr',
    async (request, reply) => {
      try {
        const payload = MeetingService.buildQrPayload(request.params.meetingId);
        return reply.send(payload);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'QR generation failed';
        return reply.code(404).send({ error: message });
      }
    }
  );
}
