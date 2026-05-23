#!/usr/bin/env bash
set -euo pipefail

# Build both JMRC apps into _site for Netlify deployment.
# - Time Track CRM is a static single-HTML app at the site root.
# - Cabinet Designer is a Vite + React app served from /cabinet-designer/.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${ROOT_DIR}/_site"

echo "==> Cleaning ${OUT_DIR}"
rm -rf "${OUT_DIR}"
mkdir -p "${OUT_DIR}"

echo "==> Copying Time Track static assets"
cp "${ROOT_DIR}/index.html" "${OUT_DIR}/index.html"
[[ -f "${ROOT_DIR}/_headers" ]] && cp "${ROOT_DIR}/_headers" "${OUT_DIR}/_headers"
[[ -f "${ROOT_DIR}/_redirects" ]] && cp "${ROOT_DIR}/_redirects" "${OUT_DIR}/_redirects"

echo "==> Building Cabinet Designer (Vite)"
pushd "${ROOT_DIR}/cabinet-designer" >/dev/null
if [[ ! -d node_modules ]]; then
  npm ci --no-audit --no-fund
fi
npm run build
popd >/dev/null

echo "==> Copying Cabinet Designer build to ${OUT_DIR}/cabinet-designer"
mkdir -p "${OUT_DIR}/cabinet-designer"
cp -R "${ROOT_DIR}/cabinet-designer/dist/." "${OUT_DIR}/cabinet-designer/"

echo "==> Build complete. Contents:"
ls -la "${OUT_DIR}"
echo "---"
ls -la "${OUT_DIR}/cabinet-designer" | head
