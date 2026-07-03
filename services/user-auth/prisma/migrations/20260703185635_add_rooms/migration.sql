-- CreateTable
CREATE TABLE "rooms" (
    "room_id" TEXT NOT NULL,
    "room_name" TEXT NOT NULL,
    "host_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "rooms_pkey" PRIMARY KEY ("room_id")
);

-- CreateIndex
CREATE INDEX "rooms_host_id_index" ON "rooms"("host_id");

-- AddForeignKey
ALTER TABLE "rooms"
  ADD CONSTRAINT "rooms_host_id_fkey"
  FOREIGN KEY ("host_id") REFERENCES "auth_credentials"("id") ON DELETE CASCADE;
