-- AlterTable
ALTER TABLE "service_tokens" ADD COLUMN "group_id" TEXT;

-- AddForeignKey
ALTER TABLE "service_tokens" ADD CONSTRAINT "service_tokens_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "key_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
