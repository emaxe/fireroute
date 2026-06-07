import { config } from '../config.js';

/**
 * Thin fetch wrapper around the Fireworks AI inference API.
 * Uses the native global fetch so we can stream the response body directly
 * (required for SSE passthrough without buffering into memory).
 */
export async function proxyToFireworks(
  endpoint: string,
  body: unknown,
  apiKey: string,
  headers: Record<string, string> = {},
  method = 'POST'
) {
  const url = `${config.FIREWORKS_BASE_URL}${endpoint}`;
  const opts: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...headers,
    },
  };

  // GET requests (e.g., /v1/models) have no body; everything else is JSON-serialised
  if (method !== 'GET' && body) {
    opts.headers = { 'Content-Type': 'application/json', ...opts.headers };
    opts.body = JSON.stringify(body);
  }

  // Return the raw fetch response so the caller can decide how to handle
  // streaming, binary, or JSON payloads without double-parsing.
  const response = await fetch(url, opts);
  return response;
}
