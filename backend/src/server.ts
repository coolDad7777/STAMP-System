import Fastify from 'fastify';
import cors from 'fastify-cors';
import helmet from 'fastify-helmet';
import jwt from 'fastify-jwt';
import rateLimit from 'fastify-rate-limit';
import websocket from 'fastify-websocket';
import autoLoad from '@fastify/autoload';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { join } from 'path';
import { config } from './config/config';
import { logger } from './utils/logger';
import { DatabaseService } from './services/DatabaseService';
import { CryptoService } from './crypto/CryptoService';
import { GeohashService } from './services/GeohashService';

// Initialize Fastify with logging
const fastify = Fastify({
  logger: logger,
  requestIdHeader: 'x-request-id',
  requestIdLogLabel: 'reqId',
  disableRequestLogging: false
});

// Register plugins
async function registerPlugins() {
  // Security plugins
  await fastify.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"]
      }
    }
  });

  await fastify.register(cors, {
    origin: (origin, callback) => {
      const allowedOrigins = config.ALLOWED_ORIGINS.split(',');
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'), false);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id']
  });

  // Rate limiting
  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    keyGenerator: (request) => {
      return request.headers['authorization'] || request.ip;
    },
    errorResponseBuilder: (request, context) => {
      return {
        code: 429,
        error: 'Too Many Requests',
        message: `Rate limit exceeded, retry in ${Math.round(context.ttl / 1000)} seconds.`,
        expiresIn: Math.round(context.ttl / 1000)
      };
    }
  });

  // JWT authentication
  await fastify.register(jwt, {
    secret: config.JWT_SECRET,
    sign: {
      algorithm: 'HS256',
      expiresIn: '15m',
      issuer: 'stamp-api',
      audience: 'stamp-clients'
    },
    verify: {
      algorithms: ['HS256'],
      issuer: 'stamp-api',
      audience: 'stamp-clients'
    }
  });

  // WebSocket support
  await fastify.register(websocket);

  // Swagger documentation
  await fastify.register(swagger, {
    swagger: {
      info: {
        title: 'STAMP API',
        description: 'Secure Tracking & Anonymous Meeting Protocol API',
        version: '1.0.0',
        contact: {
          name: 'STAMP Development Team',
          email: 'security@stamp-system.gov'
        }
      },
      host: config.API_HOST,
      schemes: ['https', 'http'],
      consumes: ['application/json'],
      produces: ['application/json'],
      securityDefinitions: {
        Bearer: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      },
      security: [{ Bearer: [] }]
    }
  });

  await fastify.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'full',
      deepLinking: false
    },
    staticCSP: true,
    transformStaticCSP: (header) => header,
    transformSpecification: (swaggerObject) => {
      return swaggerObject;
    }
  });

  // Auto-load routes
  await fastify.register(autoLoad, {
    dir: join(__dirname, 'routes'),
    options: {}
  });

  // Auto-load plugins
  await fastify.register(autoLoad, {
    dir: join(__dirname, 'plugins'),
    options: {}
  });
}

// Global error handler
fastify.setErrorHandler((error, request, reply) => {
  // Log the error
  fastify.log.error({
    error,
    url: request.url,
    method: request.method,
    headers: request.headers,
    query: request.query
  }, 'Request failed');

  // Security: Don't expose internal error details in production
  if (config.NODE_ENV === 'production') {
    reply.status(500).send({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
      statusCode: 500,
      timestamp: new Date().toISOString(),
      requestId: request.id
    });
  } else {
    reply.status(500).send({
      error: error.name,
      message: error.message,
      stack: error.stack,
      statusCode: 500,
      timestamp: new Date().toISOString(),
      requestId: request.id
    });
  }
});

// Health check endpoint
fastify.get('/health', {
  schema: {
    description: 'Health check endpoint',
    tags: ['Health'],
    response: {
      200: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          timestamp: { type: 'string' },
          uptime: { type: 'number' },
          version: { type: 'string' },
          services: {
            type: 'object',
            properties: {
              database: { type: 'string' },
              redis: { type: 'string' },
              crypto: { type: 'string' }
            }
          }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    const dbStatus = await DatabaseService.healthCheck();
    const cryptoStatus = await CryptoService.healthCheck();
    
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      services: {
        database: dbStatus ? 'healthy' : 'unhealthy',
        redis: 'healthy', // TODO: Implement Redis health check
        crypto: cryptoStatus ? 'healthy' : 'unhealthy'
      }
    };
  } catch (error) {
    fastify.log.error(error, 'Health check failed');
    reply.status(503).send({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  fastify.log.info(`Received ${signal}, starting graceful shutdown...`);
  
  try {
    await fastify.close();
    await DatabaseService.disconnect();
    fastify.log.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    fastify.log.error(error, 'Error during graceful shutdown');
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
async function start() {
  try {
    await registerPlugins();
    
    // Initialize services
    await DatabaseService.initialize();
    await CryptoService.initialize();
    await GeohashService.initialize();
    
    const address = await fastify.listen({
      port: config.PORT,
      host: config.HOST
    });
    
    fastify.log.info(`STAMP Backend API server listening at ${address}`);
    fastify.log.info(`API Documentation available at ${address}/docs`);
    
  } catch (error) {
    fastify.log.error(error, 'Failed to start server');
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  fastify.log.error({
    reason,
    promise
  }, 'Unhandled promise rejection');
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  fastify.log.error(error, 'Uncaught exception');
  process.exit(1);
});

if (require.main === module) {
  start();
}

export { fastify };