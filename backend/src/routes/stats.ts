import { FastifyInstance } from 'fastify';
import { SessionService } from '../services/SessionService';

export async function statsRoutes(fastify: FastifyInstance) {
  fastify.get('/api/stats', async (_request, reply) => {
    const sessions = SessionService.list();
    const completed = sessions.filter((s) => s.status !== 'active');
    const verified = sessions.filter((s) => s.status === 'verified').length;
    const pending = sessions.filter((s) => s.status === 'completed').length;
    const invalid = sessions.filter((s) => s.status === 'invalid').length;
    const active = sessions.filter((s) => s.status === 'active').length;
    const participants = new Set(sessions.map((s) => s.participantToken)).size;
    const complianceRate =
      completed.length > 0
        ? Math.round(((verified + pending) / completed.length) * 1000) / 10
        : 100;

    const recent = sessions.slice(0, 5).map((s) => ({
      id: s.sessionId,
      participantId: s.participantDisplay,
      meetingType: s.meetingType,
      meetingName: s.meetingName,
      status: s.status,
      checkinTime: s.checkinTime
    }));

    return reply.send({
      totalVerifications: verified,
      pendingReviews: pending,
      invalidStamps: invalid,
      activeSessions: active,
      activeParticipants: participants,
      complianceRate,
      recent
    });
  });
}
