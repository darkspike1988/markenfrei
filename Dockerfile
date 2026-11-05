# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# Nur Laufzeit-Abhängigkeiten für das fertige Image (ohne ESLint, TypeScript-Werkzeuge, Tests)
FROM base AS prod-deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --chmod=u=rwX,go=rX --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
# next start liest die Laufzeit-Optionen (cacheComponents, poweredByHeader) erneut aus der Konfiguration
COPY --chmod=u=rwX,go=rX --from=builder /app/next.config.ts ./next.config.ts
COPY --chmod=u=rwX,go=rX --from=builder /app/src/lib/security-headers.ts ./src/lib/security-headers.ts
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --chmod=u=rwX,go=rX --from=builder /app/package.json ./package.json

USER nextjs
EXPOSE 3000

CMD ["node_modules/.bin/next", "start"]
