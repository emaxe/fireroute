import { config } from '../config.js';

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
  if (method !== 'GET' && body) {
    opts.headers = { 'Content-Type': 'application/json', ...opts.headers };
    opts.body = JSON.stringify(body);
  }
  const response = await fetch(url, opts);
  return response;
}
