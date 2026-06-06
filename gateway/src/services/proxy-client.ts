import { config } from '../config.js';

export async function proxyToFireworks(
  endpoint: string,
  body: unknown,
  apiKey: string,
  headers: Record<string, string> = {}
) {
  const url = `${config.FIREWORKS_BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...headers,
    },
    body: JSON.stringify(body),
  });
  return response;
}
