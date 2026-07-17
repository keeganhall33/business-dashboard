# Install dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps

# Build the Next.js app
FROM node:20-alpine AS builder
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Production image
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Copy the standalone build output
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./standalone
COPY --from=builder /app/.next/static ./standalone/.next/static

WORKDIR /app

EXPOSE 3000
CMD ["sh", "-c", "SERVER_FILE=$(find /app/standalone -maxdepth 2 -name server.js -print -quit) && if [ -z \"$SERVER_FILE\" ]; then echo 'server.js not found in standalone output' >&2; exit 1; fi; node \"$SERVER_FILE\""]
