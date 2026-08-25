# syntax=docker/dockerfile:1.7
#
# BUILD CONTEXT = REPO ROOT (docker build -f frontend/Dockerfile .)
# Chunki @hisobchi/shared workspace paketi frontend'ga kerak.
# Railway'da: service Root Directory bo'sh qoldiriladi va
# RAILWAY_DOCKERFILE_PATH=frontend/Dockerfile o'rnatiladi.

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN npm ci --workspace frontend --workspace shared --include-workspace-root
COPY shared/ ./shared/
COPY frontend/ ./frontend/
RUN npm run build --workspace frontend

FROM nginx:1.27-alpine AS runner
# nginx rasmiy image /etc/nginx/templates/*.template fayllarini envsubst
# qilib /etc/nginx/conf.d/ ga yozadi.
COPY frontend/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/frontend/dist /usr/share/nginx/html

ENV PORT=8080 \
    BACKEND_ORIGIN=http://backend:4000 \
    API_PUBLIC_URL=

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:${PORT}/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
