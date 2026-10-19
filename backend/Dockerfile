FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
# npm ci runs `prisma generate` (postinstall), which needs the schema and config to exist already
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build
ENV NODE_ENV=production
EXPOSE 3000
# Apply database migrations, then start. Safe to run on every start: already applied migrations are skipped.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
