/*
  Warnings:

  - You are about to drop the column `user_id` on the `service_tokens` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "service_tokens" DROP CONSTRAINT "service_tokens_user_id_fkey";

-- AlterTable
ALTER TABLE "service_tokens" DROP COLUMN "user_id";
