import { FastifyRequest, FastifyReply } from 'fastify';
import { KeyManager } from '../../services/key-manager.js';
import { StatsService } from '../../services/stats-service.js';
import { proxyToFireworks } from '../../services/proxy-client.js';
import { ModelOverrideManager } from '../../services/model-override-manager.js';

/**
 * Parse an accumulated SSE text buffer and extract token usage.
 * Supports both OpenAI (prompt_tokens / completion_tokens / total_tokens)
 * and Anthropic (input_tokens / output_tokens) shapes. The last seen
 * non-undefined value for each field wins, because the final event
 * (e.g. Anthropic message_delta) usually carries the definitive usage.
 */
export function parseSSEUsage(sseText: string): {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
} {
  let promptTokens: number | undefined;
  let completionTokens: number | undefined;
  let totalTokens: number | undefined;

  const events = sseText.split(/\n\n+/);
  for (const event of events) {
    const dataLines = event.split('\n').filter((l) => l.startsWith('data:'));
    for (const line of dataLines) {
      const jsonStr = line.slice(5).trim();
      if (jsonStr === '[DONE]') continue;
      try {
        const obj = JSON.parse(jsonStr);
        const usage = obj?.usage;
        if (!usage) continue;
        if (typeof usage.prompt_tokens === 'number') promptTokens = usage.prompt_tokens;
        if (typeof usage.completion_tokens === 'number') completionTokens = usage.completion_tokens;
        if (typeof usage.total_tokens === 'number') totalTokens = usage.total_tokens;
        if (typeof usage.input_tokens === 'number') promptTokens = usage.input_tokens;
        if (typeof usage.output_tokens === 'number') completionTokens = usage.output_tokens;
      } catch {
        // ignore malformed JSON from partial chunks
      }
    }
  }

  if (totalTokens === undefined && promptTokens !== undefined && completionTokens !== undefined) {
    totalTokens = promptTokens + completionTokens;
  }
  return { promptTokens, completionTokens, totalTokens };
}

/**
 * Shared proxy handler used by all /v1/* routes (OpenAI, Anthropic, wildcard).
 * Responsibilities:
 *   1. Rotate to the next available API key for the token's assigned group.
 *   2. Forward the request to Fireworks AI and record stats.
 *   3. Stream SSE or binary responses without buffering them as JSON.
 *   4. Log both successful and failed attempts for the analytics dashboard.
 *   5. For non-streaming JSON responses, extract usage.prompt_tokens / usage.completion_tokens
 *      and persist them so the dashboard can show token consumption analytics.
 *   6. For SSE streaming, buffer the raw text while proxying, then parse the final
 *      event chunks for usage so token analytics work for streaming requests too.
 *   7. Transparently apply model overrides configured in the admin panel before
 *      forwarding the request to the upstream provider.
 */
export async function handleProxy(
  request: FastifyRequest,
  reply: FastifyReply,
  endpoint: string
) {
  const start = Date.now();
  const groupId = request.groupId || 'default';
  const originalModel = (request.body as any)?.model as string | undefined;
  const overriddenModel = await ModelOverrideManager.applyOverride(originalModel);

  // Build a mutable body with the overridden model so upstream sees the replacement
  let proxyBody = request.body;
  if (overriddenModel !== undefined && overriddenModel !== originalModel && proxyBody && typeof proxyBody === 'object') {
    proxyBody = { ...proxyBody, model: overriddenModel };
  }

  const model = originalModel; // log the original model for analytics traceability
  const requestBody = request.method !== 'GET' && proxyBody ? JSON.stringify(proxyBody) : undefined;

  // Retry loop: if a key returns a "suspended" error, automatically
  // suspend it and try the next active key in the same group.
  // Only return an error to the user when no active keys remain.
  while (true) {
    const key = await KeyManager.getNextKey(groupId, request.tokenId);

    if (!key) {
      await StatsService.log({
        tokenId: request.tokenId,
        tokenName: request.tokenName,
        groupId,
        endpoint,
        status: 503,
        latencyMs: Date.now() - start,
        error: 'No available API keys',
        model,
        requestBody,
      });
      return reply.status(503).send({ error: 'No available API keys' });
    }

    try {
      // GET requests (e.g., model lists) have no body; everything else is JSON-forwarded
      const isGet = request.method === 'GET';
      const response = await proxyToFireworks(
        endpoint,
        isGet ? undefined : proxyBody,
        key.key,
        {
          Accept: request.headers['accept'] || 'application/json',
        },
        request.method
      );

      const latency = Date.now() - start;
      const status = response.status;
      const contentType = response.headers.get('content-type') || '';

      // ── Upstream error (non-2xx) ───────────────────────────────────────────
      if (!response.ok) {
        const body = await response.text();
        const isSuspended = body.toLowerCase().includes('suspended');

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
            error: body,
            model,
            requestBody,
          });
          // Continue the loop to try the next available key in the group
          continue;
        }

        // Any other upstream error is returned immediately
        await StatsService.log({
          tokenId: request.tokenId,
          tokenName: request.tokenName,
          keyId: key.id,
          keyName: key.name,
          groupId,
          endpoint,
          status,
          latencyMs: latency,
          error: body,
          model,
          requestBody,
        });
        return reply.status(status).send({
          error: 'Fireworks API error',
          details: body,
        });
      }

      // ── SSE (streaming) ──────────────────────────────────────────────────
      // Must be piped through reply.raw because Fastify does not natively support
      // streaming text/event-stream backpressure. We accumulate the raw text in
      // memory so we can parse the final event chunks for usage after the stream
      // ends, then log token analytics for streaming requests too.
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
          model,
          requestBody,
        });
        return;
      }

      // ── Binary responses (images, audio, video, blobs) ───────────────────
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
          model,
          requestBody,
        });
        return reply.send(Buffer.from(buffer));
      }

      // Default path: JSON response (OpenAI-compatible chat/embeddings/etc.)
      const body = (await response.json()) as any;

      // Extract usage from Fireworks/OpenAI-compatible response shape
      const usage = body?.usage;
      const promptTokens =
        typeof usage?.prompt_tokens === 'number' ? usage.prompt_tokens :
        typeof usage?.input_tokens  === 'number' ? usage.input_tokens  :
        undefined;
      const completionTokens =
        typeof usage?.completion_tokens === 'number' ? usage.completion_tokens :
        typeof usage?.output_tokens     === 'number' ? usage.output_tokens     :
        undefined;
      const totalTokens =
        typeof usage?.total_tokens === 'number' ? usage.total_tokens :
        (promptTokens && completionTokens ? promptTokens + completionTokens : undefined);

      await StatsService.log({
        tokenId: request.tokenId,
        tokenName: request.tokenName,
        keyId: key.id,
        keyName: key.name,
        groupId,
        endpoint,
        status,
        latencyMs: latency,
        promptTokens,
        completionTokens,
        totalTokens,
        model,
        requestBody,
      });

      return reply.send(body);
    } catch (err) {
      // Catch network or parsing errors and log them so the dashboard can alert on failures
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
        model,
        requestBody,
      });
      return reply.status(500).send({
        error: 'Proxy error',
        details: (err as Error).message,
      });
    }
  }
}
