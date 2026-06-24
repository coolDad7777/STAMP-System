import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { config } from './config/config';
import { logger } from './utils/logger';
import { DatabaseService } from './services/DatabaseService';
import { CryptoService } from './crypto/CryptoService';
import { GeohashService } from './services/GeohashService';
import { tscbVerifyRoutes } from './routes/tscb-verify';
import { checkinRoutes } from './routes/checkin';
import { meetingRoutes } from './routes/meetings';
import { sessionRoutes } from './routes/sessions';
import { statsRoutes } from './routes/stats';

const fastify = Fastify({
  logger: logger,
  requestIdHeader: 'x-request-id',
  requestIdLogLabel: 'reqId'
});

async function registerPlugins() {
  await fastify.register(cors, {
    origin: '*',
    credentials: true
  });

  await fastify.register(jwt, {
    secret: config.JWT_SECRET,
    sign: { expiresIn: '15m' }
  });
}

fastify.setErrorHandler((error, request, reply) => {
  fastify.log.error({ error, url: request.url }, 'Request failed');
  reply.status(500).send({
    error: error.name,
    message: error.message
  });
});

fastify.get('/health', async (request, reply) => {
  return {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  };
});

const gracefulShutdown = async (signal: string) => {
  fastify.log.info(`Received ${signal}, shutting down...`);
  await fastify.close();
  await DatabaseService.disconnect();
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

async function start() {
  try {
    await registerPlugins();
    await DatabaseService.initialize();
    await CryptoService.initialize();
    await GeohashService.initialize();

    await fastify.register(tscbVerifyRoutes);
    await fastify.register(checkinRoutes);
    await fastify.register(meetingRoutes);
    await fastify.register(sessionRoutes);
    await fastify.register(statsRoutes);

    const address = await fastify.listen({
      port: config.PORT,
      host: config.HOST
    });
    
    fastify.log.info(`STAMP Backend listening at ${address}`);
  } catch (error) {
    fastify.log.error(error, 'Failed to start server');
    process.exit(1);
  }
}

process.on('unhandledRejection', (reason) => {
  fastify.log.error({ reason }, 'Unhandled rejection');
});

process.on('uncaughtException', (error) => {
  fastify.log.error(error, 'Uncaught exception');
  process.exit(1);
});

if (require.main === module) {
  start();
}

export { fastify };
