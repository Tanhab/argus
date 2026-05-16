# ---------- builder ----------
FROM node:24-alpine AS builder

WORKDIR /repo

# Copy manifests first so this layer caches when only source changes
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/checker/package.json apps/checker/
COPY packages/db/package.json packages/db/
COPY packages/logger/package.json packages/logger/

# Install all deps (including dev) for the whole workspace
RUN npm ci

# Copy source
COPY tsconfig.base.json ./
COPY apps/api apps/api
COPY packages/db packages/db
COPY packages/logger packages/logger

# Build the api and its workspace deps
RUN npm run build -w @argus/logger -w @argus/db -w @argus/api

# Prune dev deps so the runtime stage gets a clean node_modules
RUN npm prune --omit=dev

# ---------- runtime ----------
FROM node:24-alpine AS runtime

WORKDIR /app

# Copy only what the runtime needs
COPY --from=builder /repo/node_modules ./node_modules
COPY --from=builder /repo/apps/api/dist ./apps/api/dist
COPY --from=builder /repo/apps/api/package.json ./apps/api/
COPY --from=builder /repo/packages/db/dist ./packages/db/dist
COPY --from=builder /repo/packages/db/package.json ./packages/db/
COPY --from=builder /repo/packages/logger/dist ./packages/logger/dist
COPY --from=builder /repo/packages/logger/package.json ./packages/logger/
COPY --from=builder /repo/package.json ./

# Drop privileges
RUN chown -R node:node /app
USER node

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "apps/api/dist/index.js"]