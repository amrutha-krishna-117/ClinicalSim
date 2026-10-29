#!/usr/bin/env bash
# Headless checks for the patient avatar (no browser needed).  Run from the frontend folder:  bash tests/run-avatar-tests.sh
set -e
cd "$(dirname "$0")/.."
npm i --no-save --legacy-peer-deps @react-three/test-renderer esbuild >/dev/null 2>&1   # test-only tools, not added to package.json
export NODE_PATH="$PWD/node_modules"
OUT=$(mktemp -d)
echo "== 1/3 pose maths on a synthetic skeleton"
node_modules/.bin/tsc lib/poseMath.ts --target es2020 --module commonjs --moduleResolution node --esModuleInterop --skipLibCheck --outDir "$OUT/pm" >/dev/null 2>&1 || true
POSEMATH_JS="$OUT/pm/poseMath.js" node tests/avatar/pose-math.test.js 2>&1 | grep -v -i "deprecat\|THREE_CJS\|Replace .const"
echo "== 2/3 built-in patient body: arms, head, mouth, tongue"
node_modules/.bin/esbuild tests/avatar/procedural-pose.test.tsx --bundle --platform=node --format=cjs --jsx=automatic --alias:@="$PWD" --outfile="$OUT/a.js" --log-level=error
node "$OUT/a.js" 2>&1 | grep -v -i "deprecat\|THREE_CJS\|Replace .const\|THREE.Clock\|Multiple instances"
echo "== 3/3 real-model loader: gown, poses, blendshapes, speaking, blinking, fallback"
node_modules/.bin/esbuild tests/avatar/model-loader.test.tsx --bundle --platform=node --format=cjs --jsx=automatic --alias:@="$PWD" --alias:@react-three/drei="$PWD/tests/avatar/drei-stub.ts" --outfile="$OUT/b.js" --log-level=error
node "$OUT/b.js" 2>&1 | grep -v -i "deprecat\|THREE_CJS\|Replace .const\|THREE.Clock\|Multiple instances"
