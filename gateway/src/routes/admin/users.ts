import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { UserManager } from '../../services/user-manager.js';

const prisma = new PrismaClient();

export async function usersRoutes(server: FastifyInstance) {
  server.get('/', { onRequest: server.authenticate }, async () => {
    return UserManager.listUsers();
  });

  server.post('/', { onRequest: server.authenticate }, async (request, reply) => {
    const { email, password, name } = request.body as {
      email: string;
      password: string;
      name?: string;
    };
    if (!email || !password) {
      return reply.status(400).send({ error: 'Email and password are required' });
    }
    return UserManager.createUser({ email, password, name });
  });

  server.delete('/:id', { onRequest: server.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = await prisma.user.findUnique({ where: { id } });
    if (user?.role === 'superadmin') {
      return reply.status(403).send({ error: 'Cannot delete superadmin' });
    }
    await UserManager.deleteUser(id);
    return reply.status(204).send();
  });
}
