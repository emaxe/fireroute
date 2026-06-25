import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ROTATION_MODES = [
  'round_robin',
  'count_50',
  'count_100',
  'tokens_1m',
  'tokens_5m',
  'tokens_10m',
  'tokens_30m',
  'squeeze',
] as const;

export type RotationMode = (typeof ROTATION_MODES)[number];

export const ROTATION_LIMITS: Record<string, number | undefined> = {
  count_50: 50,
  count_100: 100,
  tokens_1m: 1_000_000,
  tokens_5m: 5_000_000,
  tokens_10m: 10_000_000,
  tokens_30m: 30_000_000,
};

function hashTokenId(tokenId: string): number {
  let h = 0;
  for (let i = 0; i < tokenId.length; i++) {
    h = (h * 31 + tokenId.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * KeyManager — CRUD for API keys and key groups, plus pluggable rotation modes.
 *
 * Rotation modes:
 *   round_robin   — classic round-robin, offset by token hash so different tokens
 *                   start on different keys.
 *   count_50/100  — every N requests from a given token rotates to the next key.
 *   tokens_*m     — every N tokens consumed from a given token rotates to the next key.
 *   squeeze       — stick to the first available key until it gets suspended,
 *                   then fall through to the next one (handled by retry loop in proxy).
 */
export const KeyManager = {
  async listKeys() {
    return prisma.apiKey.findMany({
      include: { groups: { include: { group: true } } },
      orderBy: { createdAt: 'desc' },
    });
  },

  async createKey(data: { name: string; key: string }) {
    return prisma.apiKey.create({ data });
  },

  async deleteKey(id: string) {
    const key = await prisma.apiKey.findUnique({
      where: { id },
      include: { groups: true },
    });
    if (!key) throw new Error('Key not found');
    if (key.groups.length > 0) {
      const groupNames = key.groups.map((g) => g.groupId).join(', ');
      throw new Error(`Cannot delete key assigned to group(s). Remove from groups first. Group IDs: ${groupNames}`);
    }
    return prisma.apiKey.delete({ where: { id } });
  },

  async toggleKey(id: string, active: boolean) {
    return prisma.apiKey.update({ where: { id }, data: { active } });
  },

  async suspendKey(id: string) {
    return prisma.apiKey.update({ where: { id }, data: { suspended: true } });
  },

  async unsuspendKey(id: string) {
    return prisma.apiKey.update({ where: { id }, data: { suspended: false } });
  },

  async listGroups() {
    return prisma.keyGroup.findMany({
      include: { members: { include: { key: true } } },
      orderBy: { createdAt: 'desc' },
    });
  },

  async createGroup(data: { name: string; description?: string }) {
    return prisma.keyGroup.create({ data });
  },

  async updateGroup(id: string, data: { name?: string; description?: string; rotationMode?: RotationMode }) {
    return prisma.keyGroup.update({ where: { id }, data });
  },

  async deleteGroup(id: string) {
    return prisma.keyGroup.delete({ where: { id } });
  },

  async assignKeyToGroup(groupId: string, keyId: string) {
    return prisma.groupMember.create({
      data: { groupId, keyId },
    });
  },

  async removeKeyFromGroup(groupId: string, keyId: string) {
    return prisma.groupMember.deleteMany({
      where: { groupId, keyId },
    });
  },

  async getNextKey(groupIdOrName: string, tokenId?: string) {
    let group = await prisma.keyGroup.findUnique({
      where: { id: groupIdOrName },
      include: { members: { include: { key: true } } },
    });
    if (!group) {
      group = await prisma.keyGroup.findFirst({
        where: { name: groupIdOrName },
        include: { members: { include: { key: true } } },
      });
    }
    if (!group || group.members.length === 0) return null;

    const activeMembers = group.members.filter((m) => m.key.active && !m.key.suspended);
    if (activeMembers.length === 0) return null;

    const mode = group.rotationMode as RotationMode;

    // ── squeeze: always return the first active key ──────────────────
    if (mode === 'squeeze') {
      return activeMembers[0].key;
    }

    // ── round-robin: token-hash offset + global counter ─────────────
    if (mode === 'round_robin') {
      const offset = tokenId ? hashTokenId(tokenId) % activeMembers.length : 0;
      const idx = (group.currentIndex + offset) % activeMembers.length;
      await prisma.keyGroup.update({
        where: { id: group.id },
        data: { currentIndex: { increment: 1 } },
      });
      return activeMembers[idx].key;
    }

    // ── count-based: floor(totalRequests / limit) % N ───────────────
    if (mode === 'count_50' || mode === 'count_100') {
      const limit = ROTATION_LIMITS[mode]!;
      const totalRequests = await prisma.requestLog.count({
        where: {
          tokenId: tokenId ?? undefined,
          groupId: group.id,
          keyId: { not: null },
        },
      });
      const idx = Math.floor(totalRequests / limit) % activeMembers.length;
      return activeMembers[idx].key;
    }

    // ── token-based: floor(totalTokens / limit) % N ──────────────────
    if (mode.startsWith('tokens_')) {
      const limit = ROTATION_LIMITS[mode];
      if (!limit) return activeMembers[0].key;
      const agg = await prisma.requestLog.aggregate({
        where: {
          tokenId: tokenId ?? undefined,
          groupId: group.id,
          keyId: { not: null },
        },
        _sum: { totalTokens: true },
      });
      const totalTokens = agg._sum.totalTokens ?? 0;
      const idx = Math.floor(totalTokens / limit) % activeMembers.length;
      return activeMembers[idx].key;
    }

    // Fallback to round-robin for unknown modes
    const idx = group.currentIndex % activeMembers.length;
    await prisma.keyGroup.update({
      where: { id: group.id },
      data: { currentIndex: { increment: 1 } },
    });
    return activeMembers[idx].key;
  },
};
