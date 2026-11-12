# Dev Toolkit

브라우저에서 실행하는 JSON·SQL·XML 포매터와 Markdown 편집·미리보기 도구입니다. 저장소 이름은 `hformatter`이며, 사내망에 정적 파일로 배포할 수 있습니다.

파일 읽기, 포매팅, 문법 검사, 미리보기는 사용자 브라우저 안에서 처리합니다. 입력을 서버로 전송하거나 브라우저 저장소에 기록하지 않으며, 별도 애플리케이션 서버나 DB가 필요하지 않습니다. 실행에 필요한 라이브러리는 배포 파일에 포함합니다.

> 입력과 결과는 도구 탭 전환·새로고침 시 사라집니다. 보관할 내용은 먼저 복사하거나 다운로드하세요.

## 주요 기능

| 도구 | 기능 | 열 수 있는 파일 |
| --- | --- | --- |
| JSON | 포매팅, 압축, 문법 검사 | `.json`, `.txt` |
| SQL | PostgreSQL·MySQL·MariaDB·Oracle·ClickHouse 포매팅 및 문법 검사 | `.sql`, `.txt` |
| Markdown | 원문 편집, 실시간 미리보기, 확대·전체화면 보기 | `.md`, `.markdown`, `.txt` |
| XML | XML 1.0 포매팅 및 문법 검사 | `.xml`, `.txt` |

파일 열기·드래그 앤 드롭, 검색, 실행 취소·다시 실행, 예제, 초기화, 복사·다운로드를 제공합니다. 포매터는 2칸·4칸·탭 들여쓰기를 지원하며, YAML은 추후 구현 예정입니다.

## 빠른 시작

Node.js **22.18.0 이상**과 npm이 필요합니다. 저장소의 `.node-version`은 `22.18.0`으로 지정되어 있습니다.

프로젝트 디렉토리에서 다음 명령을 실행합니다.

```sh
npm ci
npm run dev
```

터미널에 표시된 로컬 주소로 접속합니다. 기본 주소는 `http://127.0.0.1:5173/`입니다.

## 사용 방법

1. 사용할 도구 탭을 선택하고, 원문을 붙여넣거나 파일 한 개를 열거나 입력 영역에 놓습니다.
2. JSON·SQL·XML은 옵션을 선택한 뒤 **포매팅** 또는 **문법 검사**를 실행합니다. JSON은 **압축**도 지원합니다. Markdown은 입력 후 자동으로 미리보기를 갱신합니다.
3. 결과를 확인하고 **복사** 또는 **다운로드**로 내보냅니다. 오류 위치가 제공되면 행·열 이동 버튼으로 원문을 수정할 수 있습니다.

`Ctrl+Enter` 또는 `Cmd+Enter`로 포매팅을 실행합니다. Markdown에서는 미리보기를 즉시 갱신합니다.

포매팅 후 입력이나 옵션을 변경하면 이전 결과의 복사·다운로드가 비활성화됩니다. 다시 포매팅하거나 JSON 압축을 실행해야 하며, 문법 검사만으로 결과가 갱신되지는 않습니다.

### JSON

엄격한 JSON 문법을 검사합니다. 주석, 후행 쉼표, 작은따옴표 키는 허용하지 않습니다. 큰 정수, 중복 키, 키 순서, 문자열 이스케이프를 보존하며 공백과 들여쓰기를 정리합니다.

### SQL

기본 DB는 PostgreSQL입니다. DB 종류와 들여쓰기, 키워드 대소문자 처리(원본 유지·대문자·소문자)를 선택할 수 있습니다. SQL 압축은 제공하지 않습니다.

| DB | 포매팅 | 문법 검사 범위 |
| --- | --- | --- |
| PostgreSQL | 지원 | 파서가 지원하는 구문 |
| MySQL | 지원 | 파서가 지원하는 구문 |
| MariaDB | 지원 | 파서가 지원하는 구문 |
| Oracle | 지원 | 실험적 지원, 일반 SQL |
| ClickHouse | 지원 | 실험적 지원, 일반 쿼리와 `INSERT … SELECT` |

- Oracle의 PL/SQL 블록·프로시저·함수·패키지·호출문과 SQL*Plus 명령은 검사 미지원입니다.
- ClickHouse의 `INSERT … VALUES`, `INSERT … FORMAT`, `FROM INFILE` 등 데이터 입력 구문은 검사 미지원입니다.
- 저장 프로시저·함수 본문 및 `DELIMITER` 변경 스크립트는 지원 범위에서 제외합니다.

문법 검사는 선택한 파서의 지원 범위에 한정되며 실제 DB와 연결하지 않습니다. DB 버전별 구문, 테이블·컬럼 존재 여부, 타입·권한, 실행 성공 여부는 확인하지 않습니다. **포매팅 성공이 문법 검사 성공을 뜻하지는 않습니다.**

### Markdown

제목·목록·강조·인용문·링크·코드블록과 GFM 표·체크리스트·취소선·자동 링크·각주를 표시합니다. 체크리스트는 읽기 전용입니다.

- 입력 후 250ms 지연해 자동 갱신하며, **미리보기 갱신** 버튼으로 즉시 갱신할 수 있습니다.
- **미리보기 확대**로 문서만 넓게 봅니다. 확대 상태의 **미리보기 전체화면** 아이콘으로 전체화면에 진입하고, 종료 아이콘이나 `Escape`로 돌아옵니다. 브라우저에서 전체화면을 허용하지 않으면 이유를 표시합니다.
- **원문 복사**와 **다운로드**는 현재 편집기 원문을 사용합니다. 다운로드 이름은 불러온 파일의 확장자를 `.md`로 바꾸며, 직접 입력한 문서는 `document.md`로 저장합니다.
- 원시 HTML은 렌더링하지 않고, 이미지는 대체 설명으로 표시합니다. 이미지나 같은 폴더의 파일을 자동으로 불러오지 않습니다.
- 링크는 `http`, `https`, `mailto`, 문서 내부 `#`만 허용합니다. 외부 웹 링크는 사용자가 클릭할 때 새 탭으로 열며, 상대경로 링크는 일반 텍스트로 표시합니다.

### XML

XML 1.0의 문서 구조, 태그·속성·문자 참조·네임스페이스 구문을 검사합니다. 이름·속성 순서·따옴표·참조·선언·주석·CDATA·처리 명령을 보존하며 구조적 공백을 정리합니다. 텍스트 전용·혼합 콘텐츠와 `xml:space="preserve"` 내부의 공백은 보존합니다.

XML 1.1, DOCTYPE·DTD·사용자 정의 엔티티 선언은 지원하지 않습니다. 외부 DTD·엔티티·스타일시트·스키마를 요청하거나 실행하지 않으며, 압축·변환·XPath·XSD/DTD 유효성 검증은 제공하지 않습니다.

### 입력 및 처리 제한

| 항목 | 제한 |
| --- | --- |
| 파일·붙여넣기 입력 | UTF-8, 최대 10 MiB, 파일 한 개 |
| JSON·SQL·XML 처리 | Web Worker에서 실행, 작업당 최대 10초 |
| JSON·XML 결과 | UTF-8 최대 40 MiB |
| Markdown 미리보기 | UTF-8 최대 256 KiB, 최대 4,000행 |
| Markdown 렌더링 트리 | 최대 8,000노드, 중첩 64단계 |

이 한도는 대용량 문서의 처리 성능을 보장하는 기준은 아닙니다. Markdown 미리보기 한도를 넘겨도 원문 편집·복사·다운로드는 사용할 수 있습니다.

지원하지 않는 인코딩이나 파일 읽기 오류가 발생하면 기존 입력을 유지합니다. 편집기는 줄바꿈을 정규화하므로 다운로드는 원본 파일의 바이트 단위 복제 기능이 아닙니다. 포매터 결과는 `원래이름.formatted.json`처럼 저장하며, 직접 입력한 경우 `formatted.json`을 사용합니다. SQL·XML도 해당 확장자를 사용합니다.

## 빌드 및 로컬 미리보기

```sh
npm run build
npm run preview
```

`npm run build`는 TypeScript 타입 검사와 Vite 운영 빌드를 실행하고 `dist/`를 생성합니다. 미리보기 기본 주소는 `http://127.0.0.1:4173/`입니다. 소스 수정 후에는 다시 빌드하고, 의존성 변경 시에는 먼저 `npm ci`를 실행합니다.

`sh build.sh`를 사용하면 Node.js 버전과 npm·의존성 설치 여부를 확인한 뒤 같은 빌드를 실행합니다.

VS Code Live Server를 사용하는 경우에도 먼저 빌드해야 합니다. 저장소의 `.vscode/settings.json`에 루트가 `/dist`, 주소가 `http://127.0.0.1:5500/`으로 설정되어 있습니다. Worker 실행을 위해 `file://` 대신 HTTP 서버로 접속하세요.

## 배포

### 배포 파일 생성

빌드 PC에서 실행합니다.

```sh
sh release.sh 0.1.0
```

지정한 버전으로 빌드하고 `releases/hformatter-0.1.0.tar.gz`를 생성합니다. 화면 하단에는 `V0.1.0`이 표시됩니다. 버전을 생략하면 `package.json`의 값을 사용하며, 스크립트는 `package.json`을 수정하지 않습니다. 같은 버전의 압축 파일은 덮어씁니다.

압축 파일에는 서버 실행에 필요한 다음 항목이 포함됩니다. Worker와 라이선스 파일을 포함한 **`dist/` 전체**를 배포해야 합니다.

```text
hformatter/
├── run.sh
├── dist/
│   ├── index.html
│   ├── assets/
│   └── …
└── deploy/
    └── nginx.conf
```

### Docker로 실행

운영 서버에 Docker가 설치·실행되어 있어야 합니다. 압축 파일을 서버로 전달한 뒤 배포할 상위 디렉토리에 해제합니다.

```sh
mkdir -p /srv/tools
tar -xzf hformatter-0.1.0.tar.gz -C /srv/tools
cd /srv/tools/hformatter
sh run.sh
```

`run.sh`는 nginx 설정을 검사하고 공식 nginx 컨테이너를 실행합니다. 정적 파일과 설정을 읽기 전용으로 마운트하며, 서버에 Node.js를 설치하거나 별도 이미지를 빌드할 필요가 없습니다.

기본 접속 경로는 `http://서버주소:8080/` 및 `http://서버주소:8080/tools/formatter/`입니다. 필요한 실행 옵션은 환경변수로 지정합니다.

```sh
PORT=8090 BIND_ADDRESS=127.0.0.1 sh run.sh
```

| 변수 | 기본값 | 용도 |
| --- | --- | --- |
| `PORT` | `8080` | 서버 포트 |
| `CONTAINER_NAME` | `hformatter` | 컨테이너 이름 |
| `BIND_ADDRESS` | `0.0.0.0` | 바인딩 주소, 같은 서버의 프록시 전용이면 `127.0.0.1` |
| `NGINX_IMAGE` | `nginx:stable-alpine` | nginx 이미지 태그 또는 digest |
| `DIST_DIR` | `run.sh` 옆 `dist/` | 정적 파일 디렉토리, 절대 경로 권장 |

폐쇄망에서는 서버와 같은 CPU 아키텍처의 nginx 이미지를 `docker save` / `docker load`로 미리 반입하세요. HTTPS와 접근 제어는 사내 리버스 프록시·웹서버 정책을 적용합니다. HTTP 접속에서는 브라우저 정책에 따라 클립보드 복사가 제한될 수 있습니다.

### 상태 확인 및 업데이트

```sh
docker ps --filter name=hformatter
docker logs --tail 100 hformatter
docker exec hformatter nginx -t
docker restart hformatter
```

같은 이름의 컨테이너가 있으면 `run.sh`는 중단합니다. 포트·이미지·마운트 또는 nginx 설정 파일을 변경할 때는 컨테이너를 재생성합니다. 컨테이너 이름을 바꿨다면 아래 명령에도 해당 이름을 사용하세요.

```sh
docker stop hformatter
docker rm hformatter
PORT=8090 sh run.sh
```

정적 파일만 업데이트할 때는 기존 `dist/` 디렉토리를 유지하고 새 `assets/`를 먼저 복사한 뒤 `index.html`을 마지막에 교체합니다. 컨테이너 재기동은 필요하지 않습니다. 이전 화면의 Worker 요청을 처리할 수 있도록 기존 해시 자산은 일정 기간 보관하세요.

`dist/` 디렉토리 자체를 교체하거나 심볼릭 링크 대상을 변경했다면 새 경로를 `DIST_DIR`로 지정해 컨테이너를 재생성합니다. 복구를 위해 직전 배포 파일을 보관하세요.

Vite의 기본 자산 경로는 `./`입니다. 다른 하위 경로로 배포할 때는 `deploy/nginx.conf`의 경로와 캐시 규칙도 함께 수정합니다.

## 개발 및 검증

React·TypeScript·Vite와 CodeMirror를 사용합니다. JSON·XML은 토큰 기반 엔진으로 처리하고, SQL은 `sql-formatter`와 DB별 파서로 처리합니다. Markdown은 `react-markdown`과 `remark-gfm`으로 렌더링합니다.

```sh
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

- `npm test`: 포매터 엔진, 문법 오류·경계값, 파일 처리, Worker 상태와 취소 동작을 검사합니다.
- `npm run build`: 타입 검사 및 운영 빌드를 수행합니다. 브라우저 테스트 전에 최신 `dist/`를 생성해야 합니다.
- `npm run test:browser`: Playwright가 테스트 서버를 띄우고 루트 및 `/tools/formatter/` 경로에서 UI 동작을 검사합니다. 실제 DB 서버나 운영 nginx 컨테이너를 실행하는 검증은 포함하지 않습니다.

설치된 Chrome을 사용하려면 실행 파일 경로를 지정할 수 있습니다.

```sh
CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npm run test:browser -- --workers=1
```

### 저장소 구조 및 관련 문서

| 경로 | 내용 |
| --- | --- |
| `src/app/` | 도구 탭과 포매터·Markdown 작업 화면 |
| `src/components/` | 공통 편집기와 Markdown 미리보기 |
| `src/formatters/` | 포맷별 엔진, SQL 파서, 등록 정보 |
| `src/services/`, `src/workers/` | 파일 처리, Worker 통신 및 실행 |
| `tests/` | 단위 테스트와 Playwright 브라우저 테스트 |
| `deploy/`, `scripts/` | nginx 설정과 개발 보조 스크립트 |
| `public/` | 정적 자산과 제3자 라이선스 고지 |

- [설계 및 구현 지침](formatter-design.md)
- [Oracle 파서 원본 및 재생성 방법](vendor/oracle-grammar/README.md): 일반 빌드에는 Java가 필요하지 않습니다.
- [제3자 소프트웨어 고지](public/THIRD_PARTY_NOTICES.txt) 및 [라이선스 파일](public/licenses/)
- [Markdown 의존성 라이선스](public/licenses/markdown-dependencies.txt): 의존성 변경 시 `npm ci` 후 `node scripts/generate-markdown-notices.mjs`로 갱신합니다.
