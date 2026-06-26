#!/usr/bin/env bash
# 在有网络的机器上打包 deploy 运行依赖，供 CentOS 内网离线部署。
#
# 产出：deploy/offline-packages/deploy-node-modules.tar.gz
# 用法：bash deploy/scripts/pack-web-deps.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="${ROOT}/deploy/offline-packages"
DEPLOY="${ROOT}/deploy"

mkdir -p "${OUT}"
cd "${DEPLOY}"

echo ">> npm install（deploy 目录）..."
npm install --omit=dev --ignore-scripts

echo ">> 打包 node_modules + package.json..."
tar -czf "${OUT}/deploy-node-modules.tar.gz" node_modules package.json

echo ""
echo "完成。将 offline-packages/deploy-node-modules.tar.gz 拷贝到内网后："
echo "  cd deploy && tar -xzf offline-packages/deploy-node-modules.tar.gz"
