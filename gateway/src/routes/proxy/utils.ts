import { FastifyRequest, FastifyReply } from 'fastify';
import { KeyManager } from '../../services/key-manager.js';
import { StatsService } from '../../services/stats-service.js';
import { proxyToFireworks } from '../../services/proxy-client.js';

/**
 * Shared proxy handler used by all /v1/* routes (OpenAI, Anthropic, wildcard).
 * Responsibilities:
 *   1. Rotate to the next available API key for the requested group.
 *   2. Forward the request to Fireworks AI and record stats.
 *   3. Stream SSE or binary responses without buffering them as JSON.
 *   4. Log both successful and failed attempts for the analytics dashboard.
 */
export async function handleProxy(
  request: FastifyRequest,
  reply: FastifyReply,
  endpoint: string,
  groupId: string
) {
  const start = Date.now();

  // Round-robin key selection per group; 503 if the group has no active keys
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
    // GET requests (e.g., model lists) have no body; everything else is JSON-forwarded
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

    // Record the round-trip for analytics even before we know if it succeeded
    await StatsService.log({
      tokenId: request.tokenId,
      keyId: key.id,
      groupId,
      endpoint,
      status,
      latencyMs: latency,
    });

    // Upstream errors are forwarded as-is so the client sees the original Fireworks status
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

    // SSE (streaming) responses must be piped through reply.raw because Fastify
    // does not natively support streaming text/event-stream backpressure.
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

    // Binary responses (images, audio, video, arbitrary blobs) must be forwarded
    // as raw buffers. Calling .json() here would corrupt the data.
    const isBinary = /^(image|audio|video)\/|^application\/octet-stream/.test(contentType);
    if (isBinary) {
      const buffer = await response.arrayBuffer();
      reply.header('Content-Type', contentType);
      const disposition = response.headers.get('content-disposition');
      if (disposition) reply.header('Content-Disposition', disposition);
      return reply.send(Buffer.from(buffer));
    }

    // Default path: standard JSON response from the upstream LLM API
    const body = await response.json();
    return reply.send(body);
  } catch (err) {
    // Catch network or parsing errors and log them so the dashboard can alert on failures
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
