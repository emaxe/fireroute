import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * KeyManager — CRUD for API keys and key groups, plus round-robin selection.
 *
 * Each key can belong to many groups (GroupMember junction table). When a token
 * is authenticated with a specific group, getNextKey() picks the next active key
 * in that group using a modulo counter stored on the group itself (currentIndex).
 * This is a simple, stateless round-robin that survives restarts.
 *
 * Deleting a key is blocked if it still belongs to any group to prevent accidental
 * loss of routing capacity.
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

  async getNextKey(groupIdOrName: string) {
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

    const idx = group.currentIndex % activeMembers.length;
    await prisma.keyGroup.update({
      where: { id: group.id },
      data: { currentIndex: { increment: 1 } },
    });
    return activeMembers[idx].key;
  },
};
