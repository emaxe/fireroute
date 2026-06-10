import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
// ESM requires .js extensions even for .ts source files when importing local modules
import { config } from './config.js';
import { errorHandlerPlugin } from './plugins/error-handler.js';
import { jwtAuthPlugin } from './plugins/jwt-auth.js';
import { bearerAuthPlugin } from './plugins/bearer-auth.js';
import { authRoutes } from './routes/admin/auth.js';
import { keysRoutes } from './routes/admin/keys.js';
import { groupsRoutes } from './routes/admin/groups.js';
import { usersRoutes } from './routes/admin/users.js';
import { tokensRoutes } from './routes/admin/tokens.js';
import { statsRoutes } from './routes/admin/stats.js';
import { blockedEndpointsRoutes } from './routes/admin/blocked-endpoints.js';
import { configRoutes } from './routes/admin/config.js';
import { openaiRoutes } from './routes/proxy/openai.js';
import { anthropicRoutes } from './routes/proxy/anthropic.js';
import { responsesRoutes } from './routes/proxy/responses.js';
import { wildcardRoutes } from './routes/proxy/wildcard.js';
import { modelsRoutes } from './routes/admin/models.js';

const server = Fastify({ logger: true });

// Register plugins in order: security → JWT → error handling → auth decorators → routes
// Changing this order can break auth middleware or error handling semantics
await server.register(cors, { origin: true });
await server.register(helmet);
await server.register(jwt, { secret: config.JWT_SECRET });
await server.register(errorHandlerPlugin);
await server.register(jwtAuthPlugin);
await server.register(bearerAuthPlugin);

// Admin API routes protected by JWT (used by the React admin panel)
await server.register(authRoutes, { prefix: '/api/v1/admin/auth' });
await server.register(keysRoutes, { prefix: '/api/v1/admin/keys' });
await server.register(groupsRoutes, { prefix: '/api/v1/admin/groups' });
await server.register(usersRoutes, { prefix: '/api/v1/admin/users' });
await server.register(tokensRoutes, { prefix: '/api/v1/admin/tokens' });
await server.register(statsRoutes, { prefix: '/api/v1/admin/stats' });
  await server.register(blockedEndpointsRoutes, { prefix: '/api/v1/admin/blocked-endpoints' });
  await server.register(configRoutes, { prefix: '/api/v1/admin/config' });
  await server.register(modelsRoutes, { prefix: '/api/v1/admin/models' });

// Proxy routes pass requests to Fireworks AI; protected by Bearer tokens
// Wildcard catch-all MUST be registered last so specific routes (openai, anthropic) match first
await server.register(openaiRoutes, { prefix: '/v1' });
await server.register(anthropicRoutes, { prefix: '/v1' });
await server.register(responsesRoutes, { prefix: '/v1' });
await server.register(wildcardRoutes, { prefix: '/v1' });

// Simple health check for Docker / load balancer probes; no auth required
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
