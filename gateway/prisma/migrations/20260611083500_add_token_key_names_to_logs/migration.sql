-- AlterTable
ALTER TABLE "request_logs" ADD COLUMN IF NOT EXISTS "token_name" TEXT;
ALTER TABLE "request_logs" ADD COLUMN IF NOT EXISTS "key_name" TEXT;
