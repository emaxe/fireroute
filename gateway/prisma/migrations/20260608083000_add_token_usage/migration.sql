-- Add token usage columns to request_logs

ALTER TABLE "request_logs" ADD COLUMN "prompt_tokens" INTEGER;
ALTER TABLE "request_logs" ADD COLUMN "completion_tokens" INTEGER;
ALTER TABLE "request_logs" ADD COLUMN "total_tokens" INTEGER;
