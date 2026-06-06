import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const schema = z.object({
  DATABASE_URL: z.string(),
  JWT_SECRET: z.string().min(16),
  ADMIN_EMAIL: z.string().email().default('admin@firegate.local'),
  ADMIN_PASSWORD: z.string().min(1).default('admin123'),
  GATEWAY_PORT: z.string().transform(Number).default('3000'),
  FIREWORKS_BASE_URL: z.string().default('https://api.fireworks.ai/inference/v1'),
});

export const config = schema.parse(process.env);
