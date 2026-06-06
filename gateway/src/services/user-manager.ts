import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

export const UserManager = {
  async listUsers() {
    return prisma.user.findMany({
      where: { role: 'user' },
      orderBy: { createdAt: 'desc' },
    });
  },

  async createUser(data: { email: string; password: string; name?: string }) {
    const hashed = await bcrypt.hash(data.password, 10);
    return prisma.user.create({
      data: { ...data, password: hashed, role: 'user' },
    });
  },

  async deleteUser(id: string) {
    return prisma.user.delete({ where: { id } });
  },
};
