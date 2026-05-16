# ---------- builder ----------
FROM node:24-alpine AS builder

WORKDIR /repo

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/checker/package.json apps/checker/
COPY packages/db/package.json packages/db/
COPY packages/logger/package.json packages/logger/

RUN npm ci

COPY tsconfig.base.json ./
COPY apps/checker apps/checker
COPY packages/logger packages/logger

RUN npm run build -w @argus/logger -w @argus/checker

RUN npm prune --omit=dev

# ---------- runtime ----------
FROM node:24-alpine AS runtime

WORKDIR /app

COPY --from=builder /repo/node_modules ./node_modules
COPY --from=builder /repo/apps/checker/dist ./apps/checker/dist
COPY --from=builder /repo/apps/checker/package.json ./apps/checker/
COPY --from=builder /repo/packages/logger/dist ./packages/logger/dist
COPY --from=builder /repo/packages/logger/package.json ./packages/logger/
COPY --from=builder /repo/package.json ./

RUN chown -R node:node /app
USER node

ENV NODE_ENV=production

CMD ["node", "apps/checker/dist/index.js"]