#!/bin/sh
# Run from the server that owns dist/. No application image build is needed.
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
container_name=${CONTAINER_NAME:-hformatter}
host_port=${PORT:-8080}
bind_address=${BIND_ADDRESS:-0.0.0.0}
nginx_image=${NGINX_IMAGE:-nginx:stable-alpine}
dist_dir=${DIST_DIR:-"$project_dir/dist"}
nginx_config="$project_dir/deploy/nginx.conf"

fail() { printf '%s\n' "$*" >&2; exit 1; }

[ -f "$dist_dir/index.html" ] && [ -d "$dist_dir/assets" ] ||
  fail 'dist/index.html 또는 dist/assets가 없습니다. 빌드한 dist/ 전체를 서버에 전달하세요.'
[ -f "$nginx_config" ] || fail 'deploy/nginx.conf가 없습니다.'
dist_dir=$(CDPATH= cd -- "$dist_dir" && pwd -P)
case "$host_port" in ''|*[!0-9]*) fail 'PORT에는 1~65535 사이의 포트 번호를 지정하세요.' ;; esac
[ "$host_port" -ge 1 ] && [ "$host_port" -le 65535 ] || fail 'PORT는 1~65535 범위여야 합니다.'
command -v docker >/dev/null 2>&1 || fail 'Docker를 설치한 뒤 실행하세요.'
docker info >/dev/null 2>&1 || fail 'Docker 데몬에 연결할 수 없습니다. Docker 실행 상태와 현재 계정의 권한을 확인하세요.'

if docker container inspect "$container_name" >/dev/null 2>&1; then
  fail "이미 '$container_name' 컨테이너가 있습니다. 재기동은 docker restart $container_name 명령을 사용하세요. 포트·마운트 변경 시 README의 재생성 절차를 따르세요."
fi

# Check the configuration before starting the persistent container.
docker run --rm \
  --mount "type=bind,src=$nginx_config,dst=/etc/nginx/conf.d/default.conf,readonly" \
  --entrypoint nginx \
  "$nginx_image" -t

docker run -d \
  --name "$container_name" \
  --restart unless-stopped \
  --publish "$bind_address:$host_port:80" \
  --mount "type=bind,src=$dist_dir,dst=/usr/share/nginx/html,readonly" \
  --mount "type=bind,src=$nginx_config,dst=/etc/nginx/conf.d/default.conf,readonly" \
  --health-cmd 'wget -q -O /dev/null http://127.0.0.1/ || exit 1' \
  --health-interval 30s \
  --health-timeout 3s \
  "$nginx_image"

printf '\n컨테이너: %s\n서버 확인: http://127.0.0.1:%s/\n' "$container_name" "$host_port"
printf '상태 확인: docker ps --filter name=%s\n' "$container_name"
