import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import { config } from './config.js';
import { errorHandlerPlugin } from './plugins/error-handler.js';
import { jwtAuthPlugin } from './plugins/jwt-auth.js';
import { bearerAuthPlugin } from './plugins/bearer-auth.js';
import { authRoutes } from './routes/admin/auth.js';
import { keysRoutes } from './routes/admin/keys.js';
import { groupsRoutes } from './routes/admin/groups.js';
import { usersRoutes } from './routes/admin/users.js';
import { statsRoutes } from './routes/admin/stats.js';
import { openaiRoutes } from './routes/proxy/openai.js';
import { anthropicRoutes } from './routes/proxy/anthropic.js';
import { responsesRoutes } from './routes/proxy/responses.js';

const server = Fastify({ logger: true });

await server.register(cors, { origin: true });
await server.register(helmet);
await server.register(jwt, { secret: config.JWT_SECRET });
await server.register(errorHandlerPlugin);
await server.register(jwtAuthPlugin);
await server.register(bearerAuthPlugin);

await server.register(authRoutes, { prefix: '/api/v1/admin/auth' });
await server.register(keysRoutes, { prefix: '/api/v1/admin/keys' });
await server.register(groupsRoutes, { prefix: '/api/v1/admin/groups' });
await server.register(usersRoutes, { prefix: '/api/v1/admin/users' });
await server.register(statsRoutes, { prefix: '/api/v1/admin/stats' });

await server.register(openaiRoutes, { prefix: '/v1' });
await server.register(anthropicRoutes, { prefix: '/v1' });
await server.register(responsesRoutes, { prefix: '/v1' });

server.get('/health', async () => ({ status: 'ok' }));

const start = async () => {
  try {
    await server.listen({ port: config.GATEWAY_PORT, host: '0.0.0.0' });
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
