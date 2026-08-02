#!/bin/bash
# Point core-test.ddev.site at the ddev-router inside the web container so
# Playwright E2E can reach the sibling `core-test` project over TLS. ddev's
# in-container DNS would otherwise resolve additional_hostnames to 127.0.0.1.
#
# E2E-only convenience: never fail `ddev start` if it can't run — just warn so
# the failure is visible (the silent `|| true` it replaced hid real breakage).

IP=$(ddev exec getent hosts ddev-router 2>/dev/null | awk '{print $1}')

if [ -z "$IP" ]; then
    echo "map-core-test-host: could not resolve ddev-router IP — skipping." >&2
    echo "  (E2E against core-test.ddev.site may not work until this is fixed.)" >&2
    exit 0
fi

# /etc/hosts inside the container is recreated on each start, so a plain append
# is idempotent across restarts; guard against duplicates within a single boot.
if ddev exec grep -q "core-test.ddev.site" /etc/hosts 2>/dev/null; then
    exit 0
fi

if ddev exec -u root bash -c "echo '$IP core-test.ddev.site' >> /etc/hosts"; then
    echo "map-core-test-host: mapped core-test.ddev.site → $IP"
else
    echo "map-core-test-host: failed to write /etc/hosts — skipping." >&2
fi
exit 0
