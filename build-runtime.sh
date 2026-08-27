#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="${ROOT_DIR}/.build-qemu"
RUNTIME_DIR="${ROOT_DIR}/runtime"
QEMU_COMMIT="0ef7b4e2814b231705d8371dd7997f5b72e70baf"
SDL_TAG="release-2.30.11"

command -v docker >/dev/null || { echo "Docker is required." >&2; exit 1; }
mkdir -p "${BUILD_DIR}" "${RUNTIME_DIR}"

if [ ! -d "${BUILD_DIR}/qemu/.git" ]; then
  git clone https://github.com/ktock/qemu-wasm.git "${BUILD_DIR}/qemu"
fi
git -C "${BUILD_DIR}/qemu" fetch --depth 1 origin "${QEMU_COMMIT}"
git -C "${BUILD_DIR}/qemu" checkout --detach "${QEMU_COMMIT}"

docker build --progress=plain -t web-qemu-emsdk "${BUILD_DIR}/qemu"
docker rm -f web-qemu-build >/dev/null 2>&1 || true
docker run --rm -d --name web-qemu-build \
  -v "${BUILD_DIR}/qemu:/qemu:ro" \
  -v "${RUNTIME_DIR}:/out" \
  web-qemu-emsdk

cleanup() { docker rm -f web-qemu-build >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker exec -e SDL_TAG="${SDL_TAG}" web-qemu-build bash -lc '
set -euo pipefail

git clone --depth 1 --branch "$SDL_TAG" https://github.com/libsdl-org/SDL.git /tmp/SDL
emcmake cmake -S /tmp/SDL -B /tmp/SDL/build \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_INSTALL_PREFIX=/build/target \
  -DSDL_SHARED=OFF -DSDL_STATIC=ON -DSDL_TEST=OFF -DSDL_TESTS=OFF
cmake --build /tmp/SDL/build -j"$(nproc)"
cmake --install /tmp/SDL/build

EXTRA_FLAGS="-O3 -g0 -Wno-error=unused-command-line-argument -matomics -mbulk-memory -DNDEBUG -DG_DISABLE_ASSERT -D_GNU_SOURCE -sASYNCIFY=1 -pthread -sPROXY_TO_PTHREAD=1 -sOFFSCREENCANVAS_SUPPORT=1 -sFORCE_FILESYSTEM=1 -sALLOW_TABLE_GROWTH=1 -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=256MB -sMAXIMUM_MEMORY=2048MB -sWASM_BIGINT=1 -sMALLOC=mimalloc -sEXPORT_ES6=1 -sUSE_WEBGL2=1 -sGL_ENABLE_GET_PROC_ADDRESS=1 -lworkerfs.js --js-library=/build/node_modules/xterm-pty/emscripten-pty.js -sEXPORTED_RUNTIME_METHODS=getTempRet0,setTempRet0,addFunction,removeFunction,TTY,FS,WORKERFS -sASYNCIFY_IMPORTS=ffi_call_js"

rm -rf /build/qemu-out
mkdir /build/qemu-out
cd /build/qemu-out
PKG_CONFIG_PATH=/build/target/lib/pkgconfig \
emconfigure /qemu/configure \
  --static --target-list=x86_64-softmmu --cpu=wasm32 --cross-prefix= \
  --without-default-features --enable-system --enable-sdl --with-sdlabi=2.0 \
  --with-coroutine=fiber --enable-virtfs \
  --extra-cflags="$EXTRA_FLAGS" --extra-cxxflags="$EXTRA_FLAGS" --extra-ldflags="$EXTRA_FLAGS"
emmake make -j"$(nproc)" qemu-system-x86_64

mkdir -p /tmp/pack
cp /qemu/pc-bios/{bios-256k.bin,vgabios-stdvga.bin,kvmvapic.bin,linuxboot_dma.bin} /tmp/pack/
cd /tmp
/emsdk/upstream/emscripten/tools/file_packager.py qemu-system-x86_64.data --preload /tmp/pack@/pack > load.js
cd /build/qemu-out

cp qemu-system-x86_64 /out/qemu-system-x86_64.js
cp qemu-system-x86_64.wasm qemu-system-x86_64.worker.js /out/
cp /tmp/qemu-system-x86_64.data /tmp/load.js /out/

# Emscripten currently proxies EGL calls to the wrong thread after transferring the canvas.
sed -i "/^function _egl/{n;/ENVIRONMENT_IS_PTHREAD.*proxyToMainThread/d;}" /out/qemu-system-x86_64.js
if awk "/^function _egl/{getline; if (\$0 ~ /proxyToMainThread/) found=1} END {exit found ? 0 : 1}" /out/qemu-system-x86_64.js; then
  echo "EGL proxy patch did not apply completely." >&2
  exit 1
fi
'

test -s "${RUNTIME_DIR}/qemu-system-x86_64.js"
test -s "${RUNTIME_DIR}/qemu-system-x86_64.wasm"
test -s "${RUNTIME_DIR}/qemu-system-x86_64.worker.js"
test -s "${RUNTIME_DIR}/qemu-system-x86_64.data"
echo "Graphical QEMU x86_64 runtime built in ${RUNTIME_DIR}"
