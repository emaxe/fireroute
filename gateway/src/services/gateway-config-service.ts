import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const cache = new Map<string, { value: string; expires: number }>();
const CACHE_TTL_MS = 30_000;

function getCached(key: string): string | undefined {
  const entry = cache.get(key);
  if (entry && Date.now() < entry.expires) {
    return entry.value;
  }
  cache.delete(key);
  return undefined;
}

function setCached(key: string, value: string) {
  cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
}

function invalidateCache() {
  cache.clear();
}

export const GatewayConfigService = {
  async get(key: string): Promise<string | null> {
    const cached = getCached(key);
    if (cached !== undefined) return cached;

    const row = await prisma.gatewayConfig.findUnique({ where: { key } });
    const value = row?.value ?? null;
    if (value !== null) setCached(key, value);
    return value;
  },

  async getBoolean(key: string, defaultValue = false): Promise<boolean> {
    const raw = await this.get(key);
    if (raw === null) return defaultValue;
    return raw === 'true' || raw === '1';
  },

  async set(key: string, value: string): Promise<void> {
    await prisma.gatewayConfig.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
    setCached(key, value);
  },

  async setBoolean(key: string, value: boolean): Promise<void> {
    await this.set(key, value ? 'true' : 'false');
  },

  async list(): Promise<{ key: string; value: string; updatedAt: Date }[]> {
    const rows = await prisma.gatewayConfig.findMany({
      orderBy: { key: 'asc' },
      select: { key: true, value: true, updatedAt: true },
    });
    return rows;
  },

  async delete(key: string): Promise<void> {
    await prisma.gatewayConfig.delete({ where: { key } });
    cache.delete(key);
  },

  invalidateCache,
};
