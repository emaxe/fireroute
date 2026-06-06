import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const StatsService = {
  async log(data: {
    tokenId?: string;
    keyId?: string;
    groupId?: string;
    endpoint: string;
    status: number;
    latencyMs: number;
    error?: string;
  }) {
    return prisma.requestLog.create({ data });
  },

  async getStats() {
    const total = await prisma.requestLog.count();
    const errors = await prisma.requestLog.count({
      where: { status: { gte: 400 } },
    });
    const avgLatency = await prisma.requestLog.aggregate({
      _avg: { latencyMs: true },
    });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayCount = await prisma.requestLog.count({
      where: { createdAt: { gte: today } },
    });
    return {
      total,
      errors,
      avgLatency: Math.round(avgLatency._avg.latencyMs || 0),
      todayCount,
    };
  },

  async getRecentLogs(limit = 100) {
    return prisma.requestLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        token: { select: { name: true } },
        key: { select: { name: true } },
      },
    });
  },
};
