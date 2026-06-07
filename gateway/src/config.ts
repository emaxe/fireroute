import { z } from 'zod';
import dotenv from 'dotenv';

// Load environment variables from .env before validating them
// This is the only place in the codebase that touches process.env directly
dotenv.config();

// Centralised, runtime-validated configuration schema.
// Zod throws a descriptive error at startup if any required variable is missing or invalid,
// preventing silent failures later in the request lifecycle.
const schema = z.object({
  DATABASE_URL: z.string(),
  // Minimum length prevents accidentally using a weak placeholder in production
  JWT_SECRET: z.string().min(16),
  // Fallback credentials for the first admin seed (see prisma/seed.ts)
  ADMIN_EMAIL: z.string().email().default('admin@firegate.local'),
  ADMIN_PASSWORD: z.string().min(1).default('admin123'),
  // Prisma/Docker often supplies ports as strings; coerce to number for Fastify
  GATEWAY_PORT: z.string().transform(Number).default('3000'),
  // Base URL for the upstream Fireworks AI inference API
  FIREWORKS_BASE_URL: z.string().default('https://api.fireworks.ai/inference/v1'),
});

// Exports a frozen, validated config object. Import this instead of reading process.env directly.
export const config = schema.parse(process.env);
