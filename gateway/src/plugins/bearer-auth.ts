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
      include: {
        groups: { select: { groupId: true } },
      },
    });
    if (!dbToken || !dbToken.active || (dbToken.expiresAt && dbToken.expiresAt < new Date())) {
      reply.status(401).send({ error: 'Invalid or expired token' });
      return;
    }

    request.tokenId = dbToken.id;

    const allowedGroupIds = dbToken.groups.map((g) => g.groupId);
    request.allowedGroupIds = allowedGroupIds;

    const body = request.body as any;
    const requestedGroup = body?.group;

    // If token has no group restrictions, allow any group (or default)
    if (allowedGroupIds.length === 0) {
      request.groupId = requestedGroup || 'default';
      return;
    }

    // Token is restricted to specific groups
    if (requestedGroup) {
      // Resolve requested group name/ID to a canonical ID
      let resolvedId: string | undefined;
      const byId = await prisma.keyGroup.findUnique({ where: { id: requestedGroup }, select: { id: true } });
      if (byId) {
        resolvedId = byId.id;
      } else {
        const byName = await prisma.keyGroup.findFirst({ where: { name: requestedGroup }, select: { id: true } });
        if (byName) resolvedId = byName.id;
      }
      if (!resolvedId) {
        reply.status(400).send({ error: 'Group not found' });
        return;
      }
      if (!allowedGroupIds.includes(resolvedId)) {
        reply.status(403).send({ error: 'Token not allowed for this group' });
        return;
      }
      request.groupId = resolvedId;
      return;
    }

    // No explicit group requested: if token is tied to exactly one group, use it
    if (allowedGroupIds.length === 1) {
      request.groupId = allowedGroupIds[0];
      return;
    }

    // Multiple groups but none requested
    request.groupId = 'default';
    // Validate that 'default' is among allowed groups; otherwise block
    if (!allowedGroupIds.includes('default')) {
      reply.status(400).send({
        error: 'Group required. Pass "group" in request body or set a default group for this token.',
      });
      return;
    }
  });
});
