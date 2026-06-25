CREATE TABLE "model_overrides" (
  "id" TEXT NOT NULL,
  "from_model" TEXT NOT NULL,
  "to_model" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "model_overrides_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "model_overrides_from_model_key" ON "model_overrides"("from_model");
