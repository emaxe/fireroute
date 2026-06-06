import { FastifyRequest, FastifyReply } from 'fastify';
import { KeyManager } from '../../services/key-manager.js';
import { StatsService } from '../../services/stats-service.js';
import { proxyToFireworks } from '../../services/proxy-client.js';

export async function handleProxy(
  request: FastifyRequest,
  reply: FastifyReply,
  endpoint: string,
  groupId: string
) {
  const start = Date.now();
  const key = await KeyManager.getNextKey(groupId);

  if (!key) {
    await StatsService.log({
      tokenId: request.tokenId,
      groupId,
      endpoint,
      status: 503,
      latencyMs: Date.now() - start,
      error: 'No available API keys',
    });
    return reply.status(503).send({ error: 'No available API keys' });
  }

  try {
    const isGet = request.method === 'GET';
    const response = await proxyToFireworks(
      endpoint,
      isGet ? undefined : request.body,
      key.key,
      {
        Accept: request.headers['accept'] || 'application/json',
      },
      request.method
    );

    const latency = Date.now() - start;
    const status = response.status;

    await StatsService.log({
      tokenId: request.tokenId,
      keyId: key.id,
      groupId,
      endpoint,
      status,
      latencyMs: latency,
    });

    if (!response.ok) {
      const body = await response.text();
      await StatsService.log({
        tokenId: request.tokenId,
        keyId: key.id,
        groupId,
        endpoint,
        status,
        latencyMs: latency,
        error: body,
      });
      return reply.status(status).send({
        error: 'Fireworks API error',
        details: body,
      });
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/event-stream')) {
      reply.raw.writeHead(response.status, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      const reader = response.body?.getReader();
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          reply.raw.write(value);
        }
        reply.raw.end();
      }
      return;
    }

    const body = await response.json();
    return reply.send(body);
  } catch (err) {
    const latency = Date.now() - start;
    await StatsService.log({
      tokenId: request.tokenId,
      keyId: key.id,
      groupId,
      endpoint,
      status: 500,
      latencyMs: latency,
      error: (err as Error).message,
    });
    return reply.status(500).send({
      error: 'Proxy error',
      details: (err as Error).message,
    });
  }
}
