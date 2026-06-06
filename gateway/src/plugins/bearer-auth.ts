import fp from 'fastify-plugin';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const bearerAuthPlugin = fp(async (server) => {
  server.decorate('verifyBearer', async (request, reply) => {
    const auth = request.headers.authorization;
    if (!auth?.startsWith('Bearer ')) {
      reply.status(401).send({ error: 'Missing Bearer token' });
      return;
    }
    const token = auth.slice(7);
    const dbToken = await prisma.serviceToken.findUnique({
      where: { token },
      include: { user: true },
    });
    if (!dbToken || !dbToken.active || (dbToken.expiresAt && dbToken.expiresAt < new Date())) {
      reply.status(401).send({ error: 'Invalid or expired token' });
      return;
    }
    request.tokenId = dbToken.id;
    request.tokenUser = dbToken.user;
  });
});
