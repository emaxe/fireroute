import { PrismaClient } from '@prisma/client';
import { config } from '../config.js';

const prisma = new PrismaClient();

export interface UpstreamModel {
  id: string;
  object: string;
  owned_by: string;
  created?: number;
  kind?: string;
  supports_chat?: boolean;
  supports_image_input?: boolean;
  supports_tools?: boolean;
  context_length?: number;
}

async function fetchUpstreamModels(): Promise<UpstreamModel[]> {
  try {
    const key = await prisma.apiKey.findFirst({
      where: { active: true, suspended: false },
      orderBy: { createdAt: 'asc' },
    });
    if (!key) return [];
    const url = config.FIREWORKS_BASE_URL.endsWith('/')
      ? `${config.FIREWORKS_BASE_URL}models`
      : `${config.FIREWORKS_BASE_URL}/models`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${key.key}`, Accept: 'application/json' },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: UpstreamModel[] };
    return json.data || [];
  } catch {
    return [];
  }
}

function inferModelType(m: UpstreamModel): string {
  if (m.kind === 'FLUMINA_BASE_MODEL') return 'image';
  if (m.supports_chat) return 'chat';
  if (m.supports_image_input) return 'image';
  return 'chat';
}

export interface MergedModel {
  id: string | null;
  modelId: string;
  name: string | null;
  type: string;
  active: boolean;
  source: 'upstream' | 'manual';
  upstream?: UpstreamModel;
}

export const ModelManager = {
  async listModels() {
    return prisma.model.findMany({ orderBy: { createdAt: 'desc' } });
  },

  async listMergedModels(): Promise<MergedModel[]> {
    const [upstream, local] = await Promise.all([
      fetchUpstreamModels(),
      prisma.model.findMany(),
    ]);
    const localMap = new Map(local.map(l => [l.modelId, l]));
    const merged: MergedModel[] = [];

    for (const u of upstream) {
      const l = localMap.get(u.id);
      merged.push({
        id: l?.id ?? null,
        modelId: u.id,
        name: l?.name ?? u.id.split('/').pop() ?? u.id,
        type: l?.type ?? inferModelType(u),
        active: l?.active ?? true,
        source: (l?.source as 'upstream' | 'manual') ?? 'upstream',
        upstream: u,
      });
      localMap.delete(u.id);
    }

    // remaining local-only (manual or orphaned upstream records)
    for (const l of Array.from(localMap.values())) {
      merged.push({
        id: l.id,
        modelId: l.modelId,
        name: l.name,
        type: l.type,
        active: l.active,
        source: l.source as 'upstream' | 'manual',
      });
    }

    return merged.sort((a, b) => a.modelId.localeCompare(b.modelId));
  },

  async getModelById(id: string) {
    return prisma.model.findUnique({ where: { id } });
  },

  async createModel(data: { modelId: string; name?: string; type?: string; source?: string; active?: boolean }) {
    return prisma.model.create({
      data: {
        modelId: data.modelId,
        name: data.name || null,
        type: data.type || 'chat',
        source: data.source || 'manual',
        active: data.active ?? true,
      },
    });
  },

  async updateModel(id: string, data: { name?: string; type?: string; active?: boolean }) {
    return prisma.model.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name || null }),
        ...(data.type !== undefined && { type: data.type }),
        ...(data.active !== undefined && { active: data.active }),
      },
    });
  },

  async deleteModel(id: string) {
    return prisma.model.delete({ where: { id } });
  },

  async getActiveModels() {
    return prisma.model.findMany({ where: { active: true } });
  },

  async getInactiveModelIds() {
    const rows = await prisma.model.findMany({ where: { active: false } });
    return new Set(rows.map((r) => r.modelId));
  },

  async getManualModels() {
    return prisma.model.findMany({ where: { source: 'manual', active: true } });
  },
};
