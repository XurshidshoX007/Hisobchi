# syntax=docker/dockerfile:1.7
#
# BUILD CONTEXT = REPO ROOT (docker build -f backend/Dockerfile .)
# Chunki @hisobchi/shared workspace paketi backend'ga kerak.
# Railway'da: service Root Directory bo'sh qoldiriladi va
# RAILWAY_DOCKERFILE_PATH=backend/Dockerfile o'rnatiladi.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN npm ci --workspace backend --workspace shared --include-workspace-root

FROM node:22-bookworm-slim AS runner
WORKDIR /app/backend
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000

RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs hisobchi

# Prod dependency'lari: tsx runtime transform uchun kerak (dependencies'da).
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN npm ci --workspace backend --workspace shared --include-workspace-root --omit=dev \
    && npm cache clean --force

# Manba kod (tsx to'g'ridan-to'g'ri TS ishga tushiradi).
COPY --chown=hisobchi:nodejs shared/ /app/shared/
COPY --chown=hisobchi:nodejs backend/ /app/backend/

RUN chmod +x ./scripts/start-production.sh
USER hisobchi
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health/live').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["./scripts/start-production.sh"]
