import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { KeyManager } from '../../services/key-manager.js';
import { StatsService } from '../../services/stats-service.js';
import { proxyToFireworks } from '../../services/proxy-client.js';
import { parseSSEUsage } from './utils.js';
import {
  convertAnthropicToOpenAI,
  convertOpenAIToAnthropic,
  convertOpenAISSEChunkToAnthropic,
  sseEvent,
} from './anthropic-converter.js';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

export async function anthropicRoutes(server: FastifyInstance) {
  server.post('/messages', { preHandler: server.verifyBearer }, async (request, reply) => {
    const start = Date.now();
    const groupId = request.groupId || 'default';
    const body = request.body as any;
    const modelId = body?.model as string | undefined;
    const requestBodyStr = request.body ? JSON.stringify(body) : undefined;

    // Check whether this model should be proxied with Anthropic format passthrough
    // or converted to OpenAI format (default: convert).
    let anthropicProxy = true;
    if (modelId) {
      const model = await prisma.model.findUnique({
        where: { modelId },
        select: { anthropicProxy: true },
      });
      if (model && model.anthropicProxy !== null) {
        anthropicProxy = model.anthropicProxy;
      }
    }

    // If conversion is disabled, send body as-is to /messages (Anthropic passthrough)
    if (!anthropicProxy) {
      const endpoint = '/messages';
      while (true) {
        const key = await KeyManager.getNextKey(groupId);
        if (!key) {
          await StatsService.log({
            tokenId: request.tokenId,
            tokenName: request.tokenName,
            groupId,
            endpoint,
            status: 503,
            latencyMs: Date.now() - start,
            error: 'No available API keys',
            model: modelId,
            requestBody: requestBodyStr,
          });
          return reply.status(503).send({ error: 'No available API keys' });
        }

        try {
          const response = await proxyToFireworks(
            endpoint,
            request.body,
            key.key,
            { Accept: request.headers['accept'] || 'application/json' },
            'POST'
          );
          const latency = Date.now() - start;
          const status = response.status;
          const contentType = response.headers.get('content-type') || '';

          if (!response.ok) {
            const bodyText = await response.text();
            const isSuspended = bodyText.toLowerCase().includes('suspended');
            if (isSuspended) {
              await KeyManager.suspendKey(key.id);
              await StatsService.log({
                tokenId: request.tokenId,
                tokenName: request.tokenName,
                keyId: key.id,
                keyName: key.name,
                groupId,
                endpoint,
                status,
                latencyMs: latency,
                error: bodyText,
                model: modelId,
                requestBody: requestBodyStr,
              });
              continue;
            }
            await StatsService.log({
              tokenId: request.tokenId,
              tokenName: request.tokenName,
              keyId: key.id,
              keyName: key.name,
              groupId,
              endpoint,
              status,
              latencyMs: latency,
              error: bodyText,
              model: modelId,
              requestBody: requestBodyStr,
            });
            return reply.status(status).send({ error: 'Fireworks API error', details: bodyText });
          }

          // SSE passthrough
          if (contentType.includes('text/event-stream')) {
            reply.raw.writeHead(response.status, {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              Connection: 'keep-alive',
            });
            const chunks: Buffer[] = [];
            const reader = response.body?.getReader();
            if (reader) {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const buf = Buffer.from(value);
                chunks.push(buf);
                reply.raw.write(buf);
              }
              reply.raw.end();
            }
            const fullText = Buffer.concat(chunks).toString('utf-8');
            const usage = parseSSEUsage(fullText);
            await StatsService.log({
              tokenId: request.tokenId,
              tokenName: request.tokenName,
              keyId: key.id,
              keyName: key.name,
              groupId,
              endpoint,
              status,
              latencyMs: latency,
              promptTokens: usage.promptTokens,
              completionTokens: usage.completionTokens,
              totalTokens: usage.totalTokens,
              model: modelId,
              requestBody: requestBodyStr,
            });
            return;
          }

          const isBinary = /^(image|audio|video)\/|^application\/octet-stream/.test(contentType);
          if (isBinary) {
            const buffer = await response.arrayBuffer();
            reply.header('Content-Type', contentType);
            const disposition = response.headers.get('content-disposition');
            if (disposition) reply.header('Content-Disposition', disposition);
            await StatsService.log({
              tokenId: request.tokenId,
              tokenName: request.tokenName,
              keyId: key.id,
              keyName: key.name,
              groupId,
              endpoint,
              status,
              latencyMs: latency,
              model: modelId,
              requestBody: requestBodyStr,
            });
            return reply.send(Buffer.from(buffer));
          }

          const resBody = await response.json();
          await StatsService.log({
            tokenId: request.tokenId,
            tokenName: request.tokenName,
            keyId: key.id,
            keyName: key.name,
            groupId,
            endpoint,
            status,
            latencyMs: latency,
            model: modelId,
            requestBody: requestBodyStr,
          });
          return reply.send(resBody);
        } catch (err) {
          const latency = Date.now() - start;
          await StatsService.log({
            tokenId: request.tokenId,
            tokenName: request.tokenName,
            keyId: key.id,
            keyName: key.name,
            groupId,
            endpoint,
            status: 500,
            latencyMs: latency,
            error: (err as Error).message,
            model: modelId,
            requestBody: requestBodyStr,
          });
          return reply.status(500).send({ error: 'Proxy error', details: (err as Error).message });
        }
      }
    }

    // ---- Anthropic → OpenAI conversion ----
    const openaiBody = convertAnthropicToOpenAI(body);
    const endpoint = '/chat/completions';

    while (true) {
      const key = await KeyManager.getNextKey(groupId);
      if (!key) {
        await StatsService.log({
          tokenId: request.tokenId,
          tokenName: request.tokenName,
          groupId,
          endpoint: '/messages',
          status: 503,
          latencyMs: Date.now() - start,
          error: 'No available API keys',
          model: modelId,
          requestBody: requestBodyStr,
        });
        return reply.status(503).send({ error: 'No available API keys' });
      }

      try {
        const response = await proxyToFireworks(
          endpoint,
          openaiBody,
          key.key,
          { Accept: request.headers['accept'] || 'application/json' },
          'POST'
        );
        const latency = Date.now() - start;
        const status = response.status;
        const contentType = response.headers.get('content-type') || '';

        if (!response.ok) {
          const bodyText = await response.text();
          const isSuspended = bodyText.toLowerCase().includes('suspended');
          if (isSuspended) {
            await KeyManager.suspendKey(key.id);
            await StatsService.log({
              tokenId: request.tokenId,
              tokenName: request.tokenName,
              keyId: key.id,
              keyName: key.name,
              groupId,
              endpoint: '/messages',
              status,
              latencyMs: latency,
              error: bodyText,
              model: modelId,
              requestBody: requestBodyStr,
            });
            continue;
          }
          await StatsService.log({
            tokenId: request.tokenId,
            tokenName: request.tokenName,
            keyId: key.id,
            keyName: key.name,
            groupId,
            endpoint: '/messages',
            status,
            latencyMs: latency,
            error: bodyText,
            model: modelId,
            requestBody: requestBodyStr,
          });
          return reply.status(status).send({ error: 'Fireworks API error', details: bodyText });
        }

        // SSE: convert OpenAI stream to Anthropic stream on-the-fly
        if (contentType.includes('text/event-stream')) {
          reply.raw.writeHead(response.status, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          });

          const chunks: Buffer[] = [];
          const reader = response.body?.getReader();
          const state = {
            msgId: `msg_${randomUUID().replace(/-/g, '')}`,
            model: modelId || '',
            started: false,
            outputTokens: 0,
            done: false,
          };

          if (reader) {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              const buf = Buffer.from(value);
              chunks.push(buf);
              const text = buf.toString('utf-8');
              const anthropicText = convertOpenAISSEChunkToAnthropic(text, state);
              if (anthropicText) {
                reply.raw.write(anthropicText);
              }
            }
            // If stream ended without explicit [DONE] or finish_reason, close it
            if (!state.done) {
              reply.raw.write(
                sseEvent('content_block_stop', { type: 'content_block_stop', index: 0 }) +
                sseEvent('message_delta', {
                  type: 'message_delta',
                  delta: { stop_reason: 'end_turn', stop_sequence: null },
                  usage: { output_tokens: state.outputTokens },
                }) +
                sseEvent('message_stop', { type: 'message_stop' })
              );
            }
            reply.raw.end();
          }

          const fullText = Buffer.concat(chunks).toString('utf-8');
          const usage = parseSSEUsage(fullText);
          await StatsService.log({
            tokenId: request.tokenId,
            tokenName: request.tokenName,
            keyId: key.id,
            keyName: key.name,
            groupId,
            endpoint: '/messages',
            status,
            latencyMs: latency,
            promptTokens: usage.promptTokens,
            completionTokens: usage.completionTokens,
            totalTokens: usage.totalTokens,
            model: modelId,
            requestBody: requestBodyStr,
          });
          return;
        }

        // Binary
        const isBinary = /^(image|audio|video)\/|^application\/octet-stream/.test(contentType);
        if (isBinary) {
          const buffer = await response.arrayBuffer();
          reply.header('Content-Type', contentType);
          const disposition = response.headers.get('content-disposition');
          if (disposition) reply.header('Content-Disposition', disposition);
          await StatsService.log({
            tokenId: request.tokenId,
            tokenName: request.tokenName,
            keyId: key.id,
            keyName: key.name,
            groupId,
            endpoint: '/messages',
            status,
            latencyMs: latency,
            model: modelId,
            requestBody: requestBodyStr,
          });
          return reply.send(Buffer.from(buffer));
        }

        // JSON
        const resBody = (await response.json()) as any;
        const anthropicBody = convertOpenAIToAnthropic(resBody, modelId || '');

        const usage = resBody?.usage;
        await StatsService.log({
          tokenId: request.tokenId,
          tokenName: request.tokenName,
          keyId: key.id,
          keyName: key.name,
          groupId,
          endpoint: '/messages',
          status,
          latencyMs: latency,
          promptTokens: typeof usage?.prompt_tokens === 'number' ? usage.prompt_tokens : undefined,
          completionTokens: typeof usage?.completion_tokens === 'number' ? usage.completion_tokens : undefined,
          totalTokens: typeof usage?.total_tokens === 'number' ? usage.total_tokens : undefined,
          model: modelId,
          requestBody: requestBodyStr,
        });
        return reply.send(anthropicBody);
      } catch (err) {
        const latency = Date.now() - start;
        await StatsService.log({
          tokenId: request.tokenId,
          tokenName: request.tokenName,
          keyId: key.id,
          keyName: key.name,
          groupId,
          endpoint: '/messages',
          status: 500,
          latencyMs: latency,
          error: (err as Error).message,
          model: modelId,
          requestBody: requestBodyStr,
        });
        return reply.status(500).send({ error: 'Proxy error', details: (err as Error).message });
      }
    }
  });
}
