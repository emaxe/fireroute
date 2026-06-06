import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

export const TokenManager = {
  async listTokens() {
    return prisma.serviceToken.findMany({
      orderBy: { createdAt: 'desc' },
    });
  },

  async createToken(name?: string) {
    const token = crypto.randomBytes(32).toString('hex');
    return prisma.serviceToken.create({
      data: { token, name: name || 'default', active: true },
    });
  },

  async revokeToken(id: string) {
    return prisma.serviceToken.update({
      where: { id },
      data: { active: false },
    });
  },

  async deleteToken(id: string) {
    return prisma.serviceToken.delete({ where: { id } });
  },

  async findByToken(token: string) {
    return prisma.serviceToken.findUnique({
      where: { token },
    });
  },
};
