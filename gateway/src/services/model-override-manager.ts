import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

let overrideCache: Map<string, string> | null = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 30_000; // 30 seconds

async function refreshCache(): Promise<Map<string, string>> {
  const rows = await prisma.modelOverride.findMany({ where: { active: true } });
  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(row.fromModel.toLowerCase(), row.toModel);
  }
  overrideCache = map;
  cacheExpiry = Date.now() + CACHE_TTL_MS;
  return map;
}

export const ModelOverrideManager = {
  async listOverrides() {
    return prisma.modelOverride.findMany({ orderBy: { createdAt: 'desc' } });
  },

  async getOverrideById(id: string) {
    return prisma.modelOverride.findUnique({ where: { id } });
  },

  async getActiveOverrides() {
    return prisma.modelOverride.findMany({ where: { active: true } });
  },

  async createOverride(data: { fromModel: string; toModel: string; active?: boolean }) {
    const result = await prisma.modelOverride.create({
      data: {
        fromModel: data.fromModel,
        toModel: data.toModel,
        active: data.active ?? true,
      },
    });
    overrideCache = null; // invalidate cache
    return result;
  },

  async updateOverride(id: string, data: { toModel?: string; active?: boolean }) {
    const result = await prisma.modelOverride.update({
      where: { id },
      data: {
        ...(data.toModel !== undefined && { toModel: data.toModel }),
        ...(data.active !== undefined && { active: data.active }),
      },
    });
    overrideCache = null; // invalidate cache
    return result;
  },

  async deleteOverride(id: string) {
    const result = await prisma.modelOverride.delete({ where: { id } });
    overrideCache = null; // invalidate cache
    return result;
  },

  /**
   * Build a lookup map of active overrides for fast proxy-time replacement.
   * Keys are lower-cased for case-insensitive matching.
   */
  async getOverrideMap(): Promise<Map<string, string>> {
    if (overrideCache && Date.now() < cacheExpiry) {
      return overrideCache;
    }
    return refreshCache();
  },

  /**
   * Apply an override to a model string (case-insensitive).
   * Returns the original if no override matches.
   */
  async applyOverride(model: string | undefined): Promise<string | undefined> {
    if (!model) return undefined;
    const map = await this.getOverrideMap();
    return map.get(model.toLowerCase()) ?? model;
  },
};
