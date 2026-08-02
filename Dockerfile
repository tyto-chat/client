# syntax=docker/dockerfile:1

###########################################
# Stage 1 — build the SPA
###########################################
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY scripts ./scripts
RUN npm ci
COPY . .
# Runtime config is injected at deploy time (config.js); no build-time API URL needed.
RUN npm run build

###########################################
# Stage 2 — static runtime (Caddy)
###########################################
FROM caddy:2-alpine AS runtime
COPY docker/Caddyfile /etc/caddy/Caddyfile
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh
COPY --from=build /app/dist /srv

ENTRYPOINT ["entrypoint.sh"]
