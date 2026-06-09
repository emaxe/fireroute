-- CreateTable
CREATE TABLE "blocked_endpoints" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "pattern" TEXT NOT NULL UNIQUE,
  "message" TEXT NOT NULL DEFAULT 'Endpoint not supported',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

-- CreateIndex
CREATE INDEX "blocked_endpoints_pattern_idx" ON "blocked_endpoints"("pattern");
CREATE INDEX "blocked_endpoints_active_idx" ON "blocked_endpoints"("active");

-- Seed default blocked endpoint
INSERT INTO "blocked_endpoints" ("id", "pattern", "message", "active", "created_at", "updated_at")
VALUES (gen_random_uuid(), '/v1/messages/count_tokens', 'Endpoint not supported by upstream provider', true, NOW(), NOW());
