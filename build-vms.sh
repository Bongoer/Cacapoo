#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="${ROOT_DIR}/.build"
SITE_DIR="${ROOT_DIR}/site"
C2W_VERSION="v0.8.4"

command -v docker >/dev/null || { echo "Docker is required." >&2; exit 1; }
mkdir -p "${BUILD_DIR}" "${SITE_DIR}"

if [ ! -x "${BUILD_DIR}/c2w" ]; then
  curl -L --fail "https://github.com/container2wasm/container2wasm/releases/download/${C2W_VERSION}/container2wasm-${C2W_VERSION}-linux-amd64.tar.gz" -o "${BUILD_DIR}/c2w.tar.gz"
  tar -xzf "${BUILD_DIR}/c2w.tar.gz" -C "${BUILD_DIR}" c2w
fi

"${BUILD_DIR}/c2w" --show-dockerfile > "${BUILD_DIR}/c2w.Dockerfile"
sed -i 's/3000\*1024\*1024/1536*1024*1024/g; s/TOTAL_MEMORY=2300MB/TOTAL_MEMORY=1536MB/g; s#https://github.com/ktock/container2wasm#https://github.com/container2wasm/container2wasm#g' "${BUILD_DIR}/c2w.Dockerfile"

for os_name in debian fedora; do
  image_name="linux64-${os_name}:local"
  output_dir="${SITE_DIR}/vm/${os_name}"
  docker build -t "${image_name}" -f "${ROOT_DIR}/images/${os_name}.Dockerfile" "${ROOT_DIR}"
  mkdir -p "${output_dir}"
  "${BUILD_DIR}/c2w" \
    --dockerfile "${BUILD_DIR}/c2w.Dockerfile" \
    --to-js \
    --build-arg VM_MEMORY_SIZE_MB=192 \
    --build-arg VM_CORE_NUMS=1 \
    "${image_name}" "${output_dir}/"
  cp "${ROOT_DIR}/runtime-template/index.html" "${output_dir}/index.html"
done

cp "${ROOT_DIR}/index.html" "${ROOT_DIR}/styles.css" "${ROOT_DIR}/app.js" "${ROOT_DIR}/coi-serviceworker.js" "${SITE_DIR}/"
echo "Built site in ${SITE_DIR}"
