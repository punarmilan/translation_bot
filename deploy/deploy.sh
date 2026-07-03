#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 <ghcr-image-prefix> <image-tag>" >&2
  exit 2
fi

image_prefix="$1"
image_tag="$2"
compose_file="docker-compose.prod.yml"
release_file=".release.env"
previous_release_file=".release.env.previous"

if [[ ! -s .env ]]; then
  echo "Missing production environment file: $(pwd)/.env" >&2
  exit 1
fi

if [[ -f "${release_file}" ]]; then
  cp "${release_file}" "${previous_release_file}"
else
  rm -f "${previous_release_file}"
fi

printf 'IMAGE_PREFIX=%s\nIMAGE_TAG=%s\n' "${image_prefix}" "${image_tag}" > "${release_file}"
chmod 600 .env "${release_file}"

compose=(docker compose --env-file .env --env-file "${release_file}" -f "${compose_file}")

restore_release() {
  if [[ -f "${previous_release_file}" ]]; then
    cp "${previous_release_file}" "${release_file}"
    return 0
  fi
  rm -f "${release_file}"
  return 1
}

if ! "${compose[@]}" config --quiet; then
  restore_release || true
  exit 1
fi

if ! "${compose[@]}" pull; then
  restore_release || true
  exit 1
fi

# Voice files live in a named volume. Existing files are skipped on later deploys.
if ! "${compose[@]}" --profile setup run --rm piper-models; then
  restore_release || true
  exit 1
fi

if ! "${compose[@]}" up -d --remove-orphans --wait --wait-timeout 1200; then
  echo "Deployment health check failed." >&2
  if restore_release; then
    echo "Rolling back to the previous image tag..." >&2
    compose=(docker compose --env-file .env --env-file "${release_file}" -f "${compose_file}")
    "${compose[@]}" pull
    "${compose[@]}" up -d --remove-orphans --wait --wait-timeout 1200
  else
    echo "No previous release is available for rollback." >&2
    rm -f "${release_file}"
  fi
  exit 1
fi

"${compose[@]}" ps
echo "Deployment completed: ${image_prefix}:${image_tag}"
