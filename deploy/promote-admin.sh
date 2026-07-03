#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <existing-user-email>" >&2
  exit 2
fi

email="${1,,}"
compose=(docker compose --env-file .env --env-file .release.env -f docker-compose.prod.yml)

"${compose[@]}" exec -T -e TARGET_EMAIL="${email}" mongodb sh -lc \
  'mongosh --quiet \
    --username "$MONGO_APP_USERNAME" \
    --password "$MONGO_APP_PASSWORD" \
    --authenticationDatabase "$MONGODB_DB" \
    "$MONGODB_DB" \
    /opt/giftme/promote-admin.js'
