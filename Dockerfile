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
FROM caddy:2-alpine@sha256:003a97808e781aa9f7e75cc2f43d34d461099031faf5e20faefb9f61126836f0 AS runtime
COPY docker/Caddyfile /etc/caddy/Caddyfile
COPY --chmod=755 docker/entrypoint.sh /usr/local/bin/entrypoint.sh
COPY --from=build /app/dist /srv

ENTRYPOINT ["entrypoint.sh"]
