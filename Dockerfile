# syntax=docker/dockerfile:1

###########################################
# Stage 1 — build the SPA
###########################################
FROM --platform=$BUILDPLATFORM node:24-alpine@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5 AS build
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
FROM caddy:2-alpine@sha256:eb4d35b7452d1ab6171fbdbe8d9275b2301dad6dad92115d91e19fb9b24d510f AS runtime
COPY docker/Caddyfile /etc/caddy/Caddyfile
COPY --chmod=755 docker/entrypoint.sh /usr/local/bin/entrypoint.sh
COPY --from=build /app/dist /srv

ENTRYPOINT ["entrypoint.sh"]
