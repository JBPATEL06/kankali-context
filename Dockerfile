# ---- Stage 1: Build ----
FROM node:22-alpine AS builder
WORKDIR /app

# Install dependencies first (cached layer)
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Copy source and build
COPY . .
RUN npm run build

# ---- Stage 2: Production runtime ----
FROM node:22-alpine AS runner
WORKDIR /app

# Only copy the built output and production deps
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Cloud Run injects PORT=8080 automatically
ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["node", "dist/server.cjs"]
