#!/bin/sh
# Build static production assets before running release.sh.
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
fail() { printf '%s\n' "$*" >&2; exit 1; }

command -v node >/dev/null 2>&1 || fail 'Node.js 22.18 이상을 설치한 뒤 실행하세요.'
command -v npm >/dev/null 2>&1 || fail 'npm을 설치한 뒤 실행하세요.'
node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 22 || (major === 22 && minor >= 18) ? 0 : 1)' ||
  fail 'Node.js 22.18 이상이 필요합니다.'
[ -d "$project_dir/node_modules" ] || fail '의존성이 없습니다. 프로젝트 폴더에서 npm ci를 먼저 실행하세요.'

cd "$project_dir"
npm run build

printf '\n빌드 완료: %s/dist/\n' "$project_dir"
printf '배포 파일을 묶으려면 sh release.sh를 실행하세요.\n'
