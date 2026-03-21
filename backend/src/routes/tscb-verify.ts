import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { TSCBProtocol } from '../crypto/TSCBProtocol';

const masterKey = process.env.TSCB_MASTER_KEY;
if (!masterKey) {
  throw new Error('TSCB_MASTER_KEY environment variable is required');
}
const protocol = new TSCBProtocol(masterKey);

interface VerifyBody {
    proof: {
        temporalChallenge: any;
        spatialCommitment: any;
        bindingHash: string;
        signature: string;
        timestamp: number;
        meetingId: string;
    };
    userPublicKey: string;
    currentTime: number;
}

export async function tscbVerifyRoutes(fastify: FastifyInstance) {
    
    await protocol.initialize();

    fastify.post<{ Body: VerifyBody }>('/api/verify', {
        schema: {
            body: {
                type: 'object',
                required: ['proof', 'userPublicKey', 'currentTime'],
                properties: {
                    proof: { type: 'object' },
                    userPublicKey: { type: 'string' },
                    currentTime: { type: 'number' }
                }
            }
        }
    }, async (request: FastifyRequest<{ Body: VerifyBody }>, reply: FastifyReply) => {
        const { proof, userPublicKey, currentTime } = request.body;

        try {
            const result = await protocol.verifyTSCBProof(
                proof,
                Buffer.from(userPublicKey, 'hex'),
                currentTime
            );
            
            if (result.isValid) {
                return reply.code(200).send({
                    verified: true,
                    checks: result.checks
                });
            } else {
                return reply.code(400).send({
                    verified: false,
                    checks: result.checks
                });
            }
        } catch (e: any) {
            return reply.code(500).send({
                error: 'Verification failed',
                message: e.message
            });
        }
    });

    fastify.get('/api/health', async (request, reply) => {
        return reply.code(200).send({
            status: 'ok',
            tscb: 'initialized'
        });
    });
}
