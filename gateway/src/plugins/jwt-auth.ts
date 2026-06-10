import fp from 'fastify-plugin';

export const jwtAuthPlugin = fp(async (server) => {
  server.decorate('authenticate', async (request, reply) => {
    try {
      await request.jwtVerify();
      const payload = request.user;
      if (payload.role !== 'admin' && payload.role !== 'superadmin') {
        reply.status(403).send({ error: 'Forbidden' });
      }
    } catch {
      reply.status(401).send({ error: 'Unauthorized' });
    }
  });
});
