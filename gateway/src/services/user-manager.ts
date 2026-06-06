import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const prisma = new PrismaClient();

export const UserManager = {
  async listUsers() {
    return prisma.user.findMany({
      where: { role: 'user' },
      include: { tokens: true },
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

  async createServiceToken(userId: string, name?: string) {
    const token = crypto.randomBytes(32).toString('hex');
    return prisma.serviceToken.create({
      data: { token, userId, name },
    });
  },

  async revokeToken(id: string) {
    return prisma.serviceToken.update({
      where: { id },
      data: { active: false },
    });
  },

  async listServiceTokens(userId: string) {
    return prisma.serviceToken.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  },
};
