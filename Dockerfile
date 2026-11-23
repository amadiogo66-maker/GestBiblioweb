# syntax=docker/dockerfile:1
#
# Gest Biblio Web : image de l'application et image des outils d'exploitation.
#
#   docker build --target app   -t gestbiblio-app   .
#   docker build --target tools -t gestbiblio-tools .
#
# Aucun secret n'est utilisé ni copié pendant le build : next build et
# prisma generate n'ont besoin ni de la base ni d'une clé. Les secrets sont
# fournis à l'exécution (env_file .env.production, voir docker-compose.prod.yml).

ARG NODE_IMAGE=node:22-bookworm-slim

# --- Base commune : OpenSSL pour les moteurs Prisma ------------------------------
FROM ${NODE_IMAGE} AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# --- Dépendances complètes (build) -----------------------------------------------
# Le schéma Prisma est nécessaire au postinstall (prisma generate).
FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# --- Build Next.js (sortie standalone) ------------------------------------------
FROM deps AS builder
COPY . .
RUN npm run build

# --- Dépendances de production seules (outils) ----------------------------------
FROM base AS prod-deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npm cache clean --force

# --- Cible "tools" : migrations et scripts d'exploitation, lancés à la demande ---
#   docker compose ... run --rm tools npx prisma migrate deploy
#   docker compose ... run --rm tools npm run db:seed-structure -- --yes
FROM base AS tools
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.json ./
COPY prisma ./prisma
COPY scripts ./scripts
COPY lib ./lib
COPY schemas ./schemas
COPY types ./types
USER node
# Sans argument : liste des scripts disponibles.
CMD ["npm", "run"]

# --- Cible "app" : serveur Next.js autonome ---------------------------------------
FROM base AS app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "server.js"]
