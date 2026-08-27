#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
SITE_DIR="${ROOT_DIR}/site"
rm -rf "${SITE_DIR}"
mkdir -p "${SITE_DIR}/runtime" "${SITE_DIR}/assets"
cp "${ROOT_DIR}/index.html" "${ROOT_DIR}/styles.css" "${ROOT_DIR}/app.js" "${ROOT_DIR}/coi-serviceworker.js" "${SITE_DIR}/"
cp "${ROOT_DIR}/runtime/"* "${SITE_DIR}/runtime/"
cp "${ROOT_DIR}/assets/"* "${SITE_DIR}/assets/"
cp "${ROOT_DIR}/THIRD_PARTY_NOTICES.md" "${SITE_DIR}/"
