#!/bin/sh
# Build with the release version, then package production assets.
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
release_dir="$project_dir/releases"
fail() { printf '%s\n' "$*" >&2; exit 1; }

[ "$#" -le 1 ] || fail '사용법: sh release.sh [버전]'
case "${1-}" in
  -h|--help)
    printf '%s\n' '사용법: sh release.sh [버전]' '버전을 생략하면 package.json의 version을 사용합니다.'
    exit 0
    ;;
esac

if [ "$#" -eq 1 ]; then
  version=$1
else
  command -v node >/dev/null 2>&1 || fail '버전 확인에 Node.js가 필요합니다. 빌드 PC에서 실행하거나 버전을 지정하세요.'
  version=$(node -p 'require(process.argv[1]).version' "$project_dir/package.json")
fi
case "$version" in ''|*[!a-zA-Z0-9.+-]*) fail '버전은 영문, 숫자, 점(.), 더하기(+), 하이픈(-)만 사용할 수 있습니다.' ;; esac
archive_name="hformatter-$version.tar.gz"

[ -f "$project_dir/run.sh" ] || fail 'run.sh가 없습니다.'
[ -f "$project_dir/deploy/nginx.conf" ] || fail 'deploy/nginx.conf가 없습니다.'
command -v tar >/dev/null 2>&1 || fail 'tar 명령을 찾을 수 없습니다.'

VITE_APP_VERSION="$version" sh "$project_dir/build.sh"

staging_dir=$(mktemp -d "${TMPDIR:-/tmp}/hformatter-release.XXXXXX")
trap 'rm -rf "$staging_dir"' 0
trap 'exit 1' 1 2 15

mkdir -p "$staging_dir/hformatter/deploy" "$release_dir"
cp "$project_dir/run.sh" "$staging_dir/hformatter/run.sh"
cp "$project_dir/deploy/nginx.conf" "$staging_dir/hformatter/deploy/nginx.conf"
cp -R "$project_dir/dist" "$staging_dir/hformatter/dist"

# Avoid macOS metadata files in archives deployed to Linux.
COPYFILE_DISABLE=1 tar \
  --exclude='.DS_Store' --exclude='._*' \
  -czf "$staging_dir/$archive_name" \
  -C "$staging_dir" hformatter
mv -f "$staging_dir/$archive_name" "$release_dir/$archive_name"

printf '배포 파일: %s/%s\n' "$release_dir" "$archive_name"
printf '포함 항목: hformatter/run.sh, hformatter/dist/, hformatter/deploy/nginx.conf\n'
