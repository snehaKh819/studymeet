FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
# `npm ci` installs exactly what package-lock.json says (faster, reproducible). The cache
# mount keeps already-downloaded packages between builds, so a flaky network only costs a retry.
RUN --mount=type=cache,target=/root/.npm \
    npm config set fetch-retries 5 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-timeout 300000 && \
    npm ci --no-audit --no-fund

ARG DATABASE_URL=postgresql://localhost/studymeet_workspaces

COPY prisma.config.ts ./
COPY prisma ./prisma
RUN DATABASE_URL=$DATABASE_URL npx prisma generate

COPY scripts ./scripts
COPY src ./src

EXPOSE 5004

# 1) create the database if it doesn't exist yet, 2) apply migrations, 3) start
CMD ["sh", "-c", "node scripts/ensure-db.js && npx prisma migrate deploy && node src/index.js"]
