#!/usr/bin/env bash
set -euo pipefail

# Build all JMRC apps into _site for Netlify deployment.
# - App-launcher landing page (static index.html) at the site root.
# - Cabinet Designer (OPPEIN catalog) → /cabinet-designer/
# - Aline Cabinet Designer (ALINE catalog) → /aline-designer/
# - Finish Selections (Robins Interiors & Designs) → /selections/

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${ROOT_DIR}/_site"

echo "==> Cleaning ${OUT_DIR}"
rm -rf "${OUT_DIR}"
mkdir -p "${OUT_DIR}"

echo "==> Copying landing page + static assets"
cp "${ROOT_DIR}/index.html" "${OUT_DIR}/index.html"
[[ -f "${ROOT_DIR}/_headers" ]] && cp "${ROOT_DIR}/_headers" "${OUT_DIR}/_headers"
[[ -f "${ROOT_DIR}/_redirects" ]] && cp "${ROOT_DIR}/_redirects" "${OUT_DIR}/_redirects"

build_vite_app() {
  local APP_DIR="$1"
  local URL_PATH="$2"
  echo "==> Building ${APP_DIR} (Vite)"
  pushd "${ROOT_DIR}/${APP_DIR}" >/dev/null
  if [[ ! -d node_modules ]]; then
    npm ci --no-audit --no-fund
  fi
  npm run build
  popd >/dev/null
  echo "==> Copying ${APP_DIR}/dist → ${OUT_DIR}/${URL_PATH}"
  mkdir -p "${OUT_DIR}/${URL_PATH}"
  cp -R "${ROOT_DIR}/${APP_DIR}/dist/." "${OUT_DIR}/${URL_PATH}/"
}

build_vite_app cabinet-designer cabinet-designer
build_vite_app aline-designer aline-designer
build_vite_app selections selections

echo "==> Build complete. Contents:"
ls -la "${OUT_DIR}"
