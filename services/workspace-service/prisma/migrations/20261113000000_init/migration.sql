-- CreateEnum
CREATE TYPE "SharingMode" AS ENUM ('PRIVATE', 'VIEW_ONLY', 'COLLABORATIVE');

-- CreateTable
CREATE TABLE "workspaces" (
    "id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "owner_name" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Untitled',
    "language" TEXT NOT NULL DEFAULT 'python',
    "sharing_mode" "SharingMode" NOT NULL DEFAULT 'PRIVATE',
    "code" TEXT NOT NULL DEFAULT '',
    "yjs_state" BYTEA,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_editors" (
    "workspace_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "user_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_editors_pkey" PRIMARY KEY ("workspace_id","user_id")
);

-- CreateIndex
CREATE INDEX "workspaces_room_id_idx" ON "workspaces"("room_id");

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_room_id_owner_id_key" ON "workspaces"("room_id", "owner_id");

-- AddForeignKey
ALTER TABLE "workspace_editors" ADD CONSTRAINT "workspace_editors_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
