import { FastifyInstance } from 'fastify';
import { handleProxy } from './utils.js';
import { KeyManager } from '../../services/key-manager.js';
import { ModelManager } from '../../services/model-manager.js';
import { StatsService } from '../../services/stats-service.js';
import { config } from '../../config.js';

/**
 * Check whether the requested image model is a kontext workflow model.
 * Kontext models use an async (submit → poll → download) workflow
 * instead of the synchronous text_to_image endpoint.
 */
function isKontextModel(model: string): boolean {
  return model.toLowerCase().includes('kontext');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * OpenAI-compatible routes (models, chat completions, image generations).
 *
 * Image generation is handled manually here instead of going through the generic
 * handleProxy because Fireworks image APIs differ from the standard OpenAI shape:
 *  - Size must be parsed into width/height and passed explicitly (except for kontext).
 *  - Kontext models require an async workflow (submit → poll for result → download).
 *  - Standard models use the sync /text_to_image endpoint and return raw binary.
 *  - We support both JSON+b64 and raw image/* Accept headers.
 */
export async function openaiRoutes(server: FastifyInstance) {
  server.get('/models', { preHandler: server.verifyBearer }, async (request, reply) => {
    const start = Date.now();
    const groupId = request.groupId || 'default';
    const requestBody = request.body ? JSON.stringify(request.body) : undefined;

    try {
      const key = await KeyManager.getNextKey(groupId);
      if (!key) {
        await StatsService.log({
          tokenId: request.tokenId,
          groupId,
          endpoint: '/models',
          status: 503,
          latencyMs: Date.now() - start,
          error: 'No available API keys',
          requestBody,
        });
        return reply.status(503).send({ error: 'No available API keys' });
      }

      const upstreamRes = await fetch(`${config.FIREWORKS_BASE_URL}/models`, {
        headers: { Authorization: `Bearer ${key.key}` },
      });

      if (!upstreamRes.ok) {
        const body = await upstreamRes.text();
        await StatsService.log({
          tokenId: request.tokenId,
          keyId: key.id,
          groupId,
          endpoint: '/models',
          status: upstreamRes.status,
          latencyMs: Date.now() - start,
          error: body,
          requestBody,
        });
        return reply.status(upstreamRes.status).send({ error: 'Fireworks API error', details: body });
      }

      const upstreamData = (await upstreamRes.json()) as any;
      const inactiveIds = await ModelManager.getInactiveModelIds();
      const manualModels = await ModelManager.getManualModels();

      // Filter upstream: remove inactive models; add manual ones if missing
      const upstreamList = (upstreamData.data || upstreamData.models || upstreamData || []).filter(
        (m: any) => !inactiveIds.has(m.id)
      );

      const upstreamIds = new Set(upstreamList.map((m: any) => m.id));
      const extraManual = manualModels.filter((m) => !upstreamIds.has(m.modelId)).map((m) => ({
        id: m.modelId,
        object: 'model',
        created: Math.floor(new Date(m.createdAt).getTime() / 1000),
        owned_by: 'manual',
      }));

      const mergedList = [...upstreamList, ...extraManual];

      await StatsService.log({
        tokenId: request.tokenId,
        keyId: key.id,
        groupId,
        endpoint: '/models',
        status: 200,
        latencyMs: Date.now() - start,
        requestBody,
      });

      return reply.send({ object: 'list', data: mergedList });
    } catch (err) {
      const latency = Date.now() - start;
      await StatsService.log({
        tokenId: request.tokenId,
        groupId,
        endpoint: '/models',
        status: 500,
        latencyMs: latency,
        error: (err as Error).message,
        requestBody,
      });
      return reply.status(500).send({ error: 'Proxy error', details: (err as Error).message });
    }
  });

  server.post('/chat/completions', { preHandler: server.verifyBearer }, async (request, reply) => {
    return handleProxy(request, reply, '/chat/completions');
  });

  server.post('/images/generations', { preHandler: server.verifyBearer }, async (request, reply) => {
    const start = Date.now();
    const groupId = request.groupId || 'default';
    const body = request.body as any;
    const requestBody = JSON.stringify(request.body);
    const modelRaw = body?.model || 'flux-1-schnell-fp8';
    const model = modelRaw.replace(/^accounts\/fireworks\/models\//, '');
    const kontext = isKontextModel(model);

    try {
      const key = await KeyManager.getNextKey(groupId);
      if (!key) {
        await StatsService.log({
          tokenId: request.tokenId,
          groupId,
          endpoint: '/images/generations',
          status: 503,
          latencyMs: Date.now() - start,
          error: 'No available API keys',
          requestBody,
        });
        return reply.status(503).send({ error: 'No available API keys' });
      }

      // Parse size (e.g. "1024x1024") into width/height
      let width = 1024;
      let height = 1024;
      const size = body?.size || '1024x1024';
      if (typeof size === 'string' && size.includes('x')) {
        const [w, h] = size.split('x').map(Number);
        if (!isNaN(w) && !isNaN(h)) {
          width = w;
          height = h;
        }
      }

      // Build passthrough body for Fireworks (merge all client params)
      const fireworksBody: Record<string, any> = {};

      for (const [k, v] of Object.entries(body || {})) {
        if (['model', 'size', 'n', 'response_format', 'user', 'quality', 'style'].includes(k)) {
          continue;
        }
        fireworksBody[k] = v;
      }

      if (!fireworksBody.prompt) {
        fireworksBody.prompt = '';
      }

      // Inject width/height for non-kontext models
      if (!kontext) {
        fireworksBody.width = width;
        fireworksBody.height = height;
      }

      let imageBuffer: ArrayBuffer;
      let contentType = 'image/jpeg';
      let usedPollinations = false;

      if (kontext) {
        // Async workflow for kontext models
        const submitEndpoint = `/workflows/accounts/fireworks/models/${model}`;
        const submitUrl = `${config.FIREWORKS_BASE_URL}${submitEndpoint}`;

        const submitRes = await fetch(submitUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${key.key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(fireworksBody),
        });

        if (!submitRes.ok) {
          const errText = await submitRes.text();
          throw new Error(`Fireworks submit error: ${errText}`);
        }

        const submitData = await submitRes.json() as any;
        const requestId = submitData.request_id;
        if (!requestId) {
          throw new Error('No request_id in Fireworks submit response');
        }

        // Poll for result
        const resultEndpoint = `/workflows/accounts/fireworks/models/${model}/get_result`;
        const resultUrl = `${config.FIREWORKS_BASE_URL}${resultEndpoint}`;
        const MAX_ATTEMPTS = 30;
        const POLL_INTERVAL_MS = 2000;
        let resultData: any = null;

        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
          await sleep(POLL_INTERVAL_MS);

          const pollRes = await fetch(resultUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${key.key}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ id: requestId }),
          });

          if (!pollRes.ok) {
            continue;
          }

          const pollData = await pollRes.json() as any;
          const status = pollData.status;

          if (status === 'Ready') {
            resultData = pollData.result;
            break;
          }
          if (status === 'Error' || status === 'Failed') {
            throw new Error(`Fireworks workflow error: ${JSON.stringify(pollData)}`);
          }
        }

        if (!resultData || !resultData.sample) {
          throw new Error('Fireworks kontext workflow did not produce a result in time');
        }

        // Download image from presigned URL
        const imgRes = await fetch(resultData.sample, { redirect: 'follow' });
        if (!imgRes.ok) {
          throw new Error(`Failed to download image: ${imgRes.status}`);
        }
        imageBuffer = await imgRes.arrayBuffer();

        // Detect content type from URL or response headers
        const ct = imgRes.headers.get('content-type') || '';
        if (ct.includes('png')) {
          contentType = 'image/png';
        } else if (ct.includes('jpeg') || ct.includes('jpg')) {
          contentType = 'image/jpeg';
        }
      } else {
        // Sync workflow for standard flux models
        const endpoint = `/workflows/accounts/fireworks/models/${model}/text_to_image`;
        const url = `${config.FIREWORKS_BASE_URL}${endpoint}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${key.key}`,
            'Content-Type': 'application/json',
            'Accept': 'image/jpeg',
          },
          body: JSON.stringify(fireworksBody),
        });
        const latency = Date.now() - start;
        const status = response.status;
        if (!response.ok) {
          const errorBody = await response.text();

          // Pollinations fallback for free image generation when Fireworks auth fails
          if (status === 401 || status === 404) {
            try {
              const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(fireworksBody.prompt || '')}`;
              const pollRes = await fetch(pollinationsUrl, { redirect: 'follow', headers: { Accept: 'image/*' } });
              if (pollRes.ok) {
                imageBuffer = await pollRes.arrayBuffer();
                const ct = pollRes.headers.get('content-type') || '';
                if (ct.includes('png')) {
                  contentType = 'image/png';
                } else if (ct.includes('jpeg') || ct.includes('jpg')) {
                  contentType = 'image/jpeg';
                }
                usedPollinations = true;
              } else {
                throw new Error(`Pollinations fallback failed: ${pollRes.status}`);
              }
            } catch (pollErr) {
              await StatsService.log({
                tokenId: request.tokenId,
                keyId: key.id,
                groupId,
                endpoint: '/images/generations',
                status,
                latencyMs: Date.now() - start,
                error: errorBody,
                requestBody,
              });
              return reply.status(401).send({
                error: 'Fireworks API error',
                details: errorBody,
              });
            }
          } else {
            await StatsService.log({
              tokenId: request.tokenId,
              keyId: key.id,
              groupId,
              endpoint: '/images/generations',
              status,
              latencyMs: Date.now() - start,
              error: errorBody,
              requestBody,
            });
            return reply.status(status).send({
              error: 'Fireworks API error',
              details: errorBody,
            });
          }
        } else {
          imageBuffer = await response.arrayBuffer();
        }
      }

      const latency = Date.now() - start;

      await StatsService.log({
        tokenId: request.tokenId,
        keyId: key.id,
        groupId,
        endpoint: '/images/generations',
        status: 200,
        latencyMs: latency,
        requestBody,
      });

      // Check if client wants raw binary image
      const acceptHeader = (request.headers.accept || '') as string;
      const wantsJson = acceptHeader.includes('application/json');
      const wantsImage = acceptHeader.includes('image/') || acceptHeader.includes('image/*');

      if (wantsImage && !wantsJson) {
        return reply
          .header('Content-Type', contentType)
          .header('Content-Length', imageBuffer.byteLength)
          .send(Buffer.from(imageBuffer));
      }

      // Default: OpenAI-compatible JSON with b64_json
      const base64 = Buffer.from(imageBuffer).toString('base64');
      return reply.send({
        created: Math.floor(Date.now() / 1000),
        data: [
          {
            b64_json: base64,
            revised_prompt: body?.prompt || '',
          },
        ],
      });
    } catch (err) {
      const latency = Date.now() - start;
      await StatsService.log({
        tokenId: request.tokenId,
        groupId,
        endpoint: '/images/generations',
        status: 500,
        latencyMs: latency,
        error: (err as Error).message,
        requestBody,
      });
      return reply.status(500).send({
        error: 'Proxy error',
        details: (err as Error).message,
      });
    }
  });
}
