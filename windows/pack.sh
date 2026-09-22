#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAGE="/tmp/opencode/erp-isac-windows"
NODE_VER="22.22.0"
NODE_ZIP="node-v${NODE_VER}-win-x64.zip"
NODE_URL="https://nodejs.org/dist/v${NODE_VER}/${NODE_ZIP}"
OUT_DIR="${ROOT}/dist"
OUT_ZIP="${OUT_DIR}/ERP-ISAC-Windows.zip"

mkdir -p "${STAGE}" "${OUT_DIR}" /tmp/opencode

if [ ! -f "/tmp/opencode/${NODE_ZIP}" ]; then
  echo "Baixando Node.js ${NODE_VER} para Windows..."
  curl -L --fail --retry 3 --max-time 180 -o "/tmp/opencode/${NODE_ZIP}" "${NODE_URL}"
fi

echo "Preparando pasta do instalador..."
mkdir -p "${STAGE}/ERP-ISAC/runtime" "${STAGE}/ERP-ISAC/app"

# Extrai Node no stage
python3 - <<PY
import zipfile, os, shutil
src = "/tmp/opencode/${NODE_ZIP}"
dst = "${STAGE}/ERP-ISAC/runtime"
inner = "node-v${NODE_VER}-win-x64"
with zipfile.ZipFile(src) as z:
    z.extractall("${STAGE}")
src_dir = os.path.join("${STAGE}", inner)
for name in os.listdir(src_dir):
    s = os.path.join(src_dir, name)
    d = os.path.join(dst, name)
    if os.path.isdir(s):
        if os.path.exists(d):
            shutil.rmtree(d)
        shutil.copytree(s, d)
    else:
        shutil.copy2(s, d)
shutil.copy2(os.path.join(dst, "node.exe"), os.path.join(dst, "erp-isac.exe"))
PY

copy_file() {
  cp -a "$1" "$2"
}

copy_file "${ROOT}/server.js" "${STAGE}/ERP-ISAC/app/server.js"
copy_file "${ROOT}/database.js" "${STAGE}/ERP-ISAC/app/database.js"
copy_file "${ROOT}/package.json" "${STAGE}/ERP-ISAC/app/package.json"
copy_file "${ROOT}/package-lock.json" "${STAGE}/ERP-ISAC/app/package-lock.json"
copy_file "${ROOT}/README.md" "${STAGE}/ERP-ISAC/app/README.md"
if [ -f "${ROOT}/erp.db" ]; then
  copy_file "${ROOT}/erp.db" "${STAGE}/ERP-ISAC/app/erp.db"
fi
cp -a "${ROOT}/public" "${STAGE}/ERP-ISAC/app/public"
cp -a "${ROOT}/assistente" "${STAGE}/ERP-ISAC/app/assistente"

echo "Copiando node_modules e binario Windows do SQLite..."
rm -rf "${STAGE}/ERP-ISAC/app/node_modules"
cp -a "${ROOT}/node_modules" "${STAGE}/ERP-ISAC/app/node_modules"
mkdir -p /tmp/opencode/bsql
if [ ! -f /tmp/opencode/bsql/win.tgz ]; then
  curl -L --fail --retry 3 --max-time 120 -o /tmp/opencode/bsql/win.tgz \
    "https://github.com/WiseLibs/better-sqlite3/releases/download/v11.10.0/better-sqlite3-v11.10.0-node-v127-win32-x64.tar.gz"
fi
mkdir -p /tmp/opencode/bsql/extract
tar -xzf /tmp/opencode/bsql/win.tgz -C /tmp/opencode/bsql/extract
mkdir -p "${STAGE}/ERP-ISAC/app/node_modules/better-sqlite3/build/Release"
cp -a /tmp/opencode/bsql/extract/build/Release/better_sqlite3.node \
  "${STAGE}/ERP-ISAC/app/node_modules/better-sqlite3/build/Release/better_sqlite3.node"
cp -a "${ROOT}/windows/Instalar.bat" "${STAGE}/ERP-ISAC/Instalar.bat"
cp -a "${ROOT}/windows/Iniciar.bat" "${STAGE}/ERP-ISAC/Iniciar.bat"
cp -a "${ROOT}/windows/Iniciar-oculto.bat" "${STAGE}/ERP-ISAC/Iniciar-oculto.bat"
cp -a "${ROOT}/windows/Iniciar.vbs" "${STAGE}/ERP-ISAC/Iniciar.vbs"
cp -a "${ROOT}/windows/Parar.bat" "${STAGE}/ERP-ISAC/Parar.bat"
cp -a "${ROOT}/windows/Desinstalar.bat" "${STAGE}/ERP-ISAC/Desinstalar.bat"
cp -a "${ROOT}/windows/LEIA-ME.txt" "${STAGE}/ERP-ISAC/LEIA-ME.txt"

# Garante CRLF nos scripts Windows
python3 - <<'PY'
from pathlib import Path
root = Path("/tmp/opencode/erp-isac-windows/ERP-ISAC")
for p in list(root.glob("*.bat")) + list(root.glob("*.vbs")) + list(root.glob("*.txt")):
    data = p.read_bytes().replace(b"\r\n", b"\n").replace(b"\n", b"\r\n")
    p.write_bytes(data)
PY

echo "Gerando ZIP..."
(
  cd "${STAGE}"
  zip -r -q "${OUT_ZIP}" ERP-ISAC
)

if command -v makensis >/dev/null 2>&1; then
  echo "Gerando instalador EXE..."
  cp -a "${ROOT}/windows/installer.nsi" "${STAGE}/ERP-ISAC/installer.nsi"
  (
    cd "${STAGE}/ERP-ISAC"
    makensis -V2 installer.nsi
  )
  cp -a "${STAGE}/ERP-ISAC/ERP-ISAC-Setup.exe" "${OUT_DIR}/ERP-ISAC-Setup.exe"
fi

echo "Pacote pronto:"
ls -lh "${OUT_ZIP}" "${OUT_DIR}/ERP-ISAC-Setup.exe" 2>/dev/null || true
