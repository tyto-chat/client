#!/bin/sh
set -eu

if [ -z "${SERVER_INFO_URL:-}" ]; then
  : "${API_DOMAIN:?set API_DOMAIN (e.g. chat.example.com) or SERVER_INFO_URL}"
  SERVER_INFO_URL="https://${API_DOMAIN}/api/server-info"
fi

# Inject deploy-time config the SPA reads at runtime.
cat > /srv/config.js <<EOF
window.__TYTO_CONFIG__ = { serverInfoUrl: "${SERVER_INFO_URL}" };
EOF
echo "entrypoint: wrote /srv/config.js (serverInfoUrl=${SERVER_INFO_URL})"

if [ "${BEHIND_PROXY:-false}" = "true" ]; then
  export CADDY_SITE_ADDRESS="http://${SERVER_DOMAIN:-localhost}"
else
  export CADDY_SITE_ADDRESS="${SERVER_DOMAIN:-localhost}"
fi

exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
