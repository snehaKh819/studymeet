FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

ARG DATABASE_URL=postgresql://localhost/studymeet

COPY prisma.config.ts ./
COPY prisma ./prisma
RUN DATABASE_URL=$DATABASE_URL npx prisma generate

COPY src ./src

EXPOSE 3001

CMD ["node", "src/index.js"]