import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

/**
 * TokenManager — CRUD for service tokens with many-to-many group bindings.
 *
 * The token ↔ group relation is stored in the junction table `token_groups`.
 * When updating a token we first delete all existing links and recreate them
 * so that the UI can simply send the full desired list of groupIds every time.
 */
export const TokenManager = {
  async listTokens() {
    return prisma.serviceToken.findMany({
      include: {
        groups: {
          include: {
            group: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  async createToken(data: { name?: string; groupIds?: string[] }) {
    const token = crypto.randomBytes(32).toString('hex');
    const groupIds = data.groupIds?.filter(Boolean) ?? [];
    return prisma.serviceToken.create({
      data: {
        token,
        name: data.name || 'default',
        active: true,
        groups: groupIds.length > 0
          ? { create: groupIds.map((id) => ({ group: { connect: { id } } })) }
          : undefined,
      },
      include: {
        groups: {
          include: { group: { select: { id: true, name: true } } },
        },
      },
    });
  },

  async updateToken(id: string, data: { name?: string; groupIds?: string[] }) {
    const groupIds = data.groupIds?.filter(Boolean) ?? [];

    // Remove existing links, then recreate
    await prisma.tokenGroup.deleteMany({ where: { tokenId: id } });

    return prisma.serviceToken.update({
      where: { id },
      data: {
        name: data.name,
        groups: groupIds.length > 0
          ? { create: groupIds.map((gid) => ({ group: { connect: { id: gid } } })) }
          : undefined,
      },
      include: {
        groups: {
          include: { group: { select: { id: true, name: true } } },
        },
      },
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
      include: {
        groups: {
          include: { group: { select: { id: true, name: true } } },
        },
      },
    });
  },
};
