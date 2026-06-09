import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * BlockedEndpointService — manage a deny-list of URL patterns.
 *
 * Patterns are matched against the full request path (e.g. "/v1/fine_tuning/jobs").
 * If a pattern is active and matches, the wildcard proxy returns 404 with a custom
 * message so that unsupported upstream endpoints are blocked at the gateway level.
 */
export const BlockedEndpointService = {
  async getAll() {
    return prisma.blockedEndpoint.findMany({ orderBy: { createdAt: 'asc' } });
  },

  async getAllActive() {
    return prisma.blockedEndpoint.findMany({ where: { active: true } });
  },

  async findByPattern(pattern: string) {
    return prisma.blockedEndpoint.findFirst({
      where: { pattern, active: true },
    });
  },

  async create(data: { pattern: string; message?: string }) {
    return prisma.blockedEndpoint.create({
      data: {
        pattern: data.pattern,
        message: data.message || 'Endpoint not supported',
      },
    });
  },

  async update(id: string, data: { pattern?: string; message?: string; active?: boolean }) {
    return prisma.blockedEndpoint.update({ where: { id }, data });
  },

  async delete(id: string) {
    return prisma.blockedEndpoint.delete({ where: { id } });
  },
};
