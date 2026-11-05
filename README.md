# Dev Toolkit V0.1.0

브라우저에서 처리하는 사내 JSON·SQL·XML 포매터와 Markdown 뷰어입니다. 입력을 저장하거나 외부로 전송하지 않으며, 탭 전환·새로고침 시 입력과 결과가 사라집니다.

- JSON 포매팅·압축·문법 검사, 오류 위치 이동
- 파일 열기·드롭, 복사·다운로드, UTF-8 입력 최대 10 MiB
- 큰 정수·중복 키·키 순서·이스케이프 보존
- SQL 5종 포매팅, PostgreSQL·MySQL·MariaDB·Oracle·ClickHouse 문법 검사
- Markdown 원문 편집·실시간 미리보기, 표·체크리스트·코드블록·각주
- XML 포매팅·문법 검사, 2칸·4칸·탭, 원문 토큰과 혼합 콘텐츠·xml:space 공백 보존
- YAML은 추후 구현 예정

Created by 조홍연

## XML 사용 범위

- XML 탭에서 `.xml`·`.txt` 단일 파일 열기·드롭, 예제·초기화·검색·실행 취소·너비 조절·Ctrl/Cmd+Enter를 사용합니다. UTF-8 최대 10 MiB이며 읽기 실패나 지원하지 않는 인코딩은 기존 입력을 유지합니다.
- XML 1.0의 문서 구조·태그·속성·문자 참조·네임스페이스 구문을 검사합니다. 오류 위치는 원본 UTF-16 오프셋과 행·열로 표시합니다. CodeMirror는 편집기 줄바꿈을 정규화합니다.
- 원문 이름·속성 순서·인용·참조·선언·주석·CDATA·처리 명령을 유지합니다. 요소 사이의 구조적 공백만 정리하며 텍스트 전용·혼합 콘텐츠·상속된 `xml:space="preserve"` 내부는 보수적으로 그대로 보존합니다.
- 입력·들여쓰기를 바꾸면 결과가 오래된 상태가 됩니다. 옵션을 되돌리거나 문법 검사만 성공해도 복사·다운로드는 다시 포매팅할 때까지 비활성화됩니다. 결과는 `formatted.xml` 또는 `원래이름.formatted.xml`로 저장합니다.
- XML 1.1·DOCTYPE·DTD·사용자 정의 엔티티 선언은 이유와 함께 미지원으로 표시합니다. 외부 DTD·엔티티·스타일시트·스키마를 실행하거나 요청하지 않습니다. 압축·변환·XPath·XSD/DTD 유효성 검증은 제공하지 않습니다.
- Worker에서 처리하며 실행 제한은 10초, 결과 상한은 UTF-8 40 MiB입니다. 실패 후 원본을 수정하거나 재실행할 수 있습니다. 입력을 전송·영구 저장하지 않으며 탭 전환·새로고침 시 초기화됩니다.
- XML 추가 검증은 `tests/xml.test.mjs`, `tests/xml-files.test.mjs`, `tests/browser/xml.spec.ts`에 있습니다. 읽기 전용 패치 작성 단계에서는 빌드와 호스트 테스트를 실행하지 않았습니다.

## Markdown 사용 범위

- JSON·SQL 옆 **Markdown** 탭에서 왼쪽 원문을 편집하고 오른쪽 문서를 확인합니다. 입력 후 250ms 지연해 자동 갱신하며, **미리보기 갱신** 또는 `Ctrl/Cmd+Enter`로 즉시 갱신할 수 있습니다. **미리보기 확대**로 문서만 넓게 보고 **원문 함께 보기**로 돌아옵니다.
- 확대된 미리보기 헤더의 **미리보기 전체화면** 아이콘으로 미리보기 패널만 전체화면으로 표시합니다. **전체화면 종료** 아이콘 또는 `Escape`로 확대 보기로 돌아오며 원문·파일명·편집기 너비를 유지합니다. 브라우저가 Fullscreen API를 지원하지 않거나 사용을 허용하지 않으면 아이콘을 비활성화하고 이유를 표시합니다. 요청 실패 시 안내를 확인하고 다시 시도할 수 있습니다.
- 제목·목록·강조·인용문·링크·코드블록과 GFM 표·체크리스트·취소선·자동 링크·각주를 표시합니다. 체크리스트는 읽기 전용입니다. 한글 제목의 문서 내부 링크도 지원합니다.
- `.md`·`.markdown`·`.txt` 파일 한 개를 열거나 드롭합니다. UTF-8만 허용하고 BOM은 제거합니다. 검색·실행 취소·다시 실행·예제·초기화와 편집기 너비 조절을 제공합니다.
- **원문 복사**와 **다운로드**는 현재 편집기 원문을 사용합니다. 불러온 파일은 같은 이름의 `.md`로, 이름 없는 문서는 `document.md`로 다운로드합니다. `.formatted`를 붙이지 않습니다. CodeMirror의 줄바꿈 정규화가 적용되므로 원본 파일의 바이트 단위 복제 기능은 아닙니다.
- 입력 최대 크기는 기존과 동일하게 UTF-8 **10 MiB**입니다. 미리보기는 **256 KiB·4,000행**까지, 렌더링 트리는 **8,000노드·중첩 64단계**까지 지원합니다. 한도를 넘으면 안내를 표시하고 원문 편집·복사·다운로드를 제공합니다. 이 제한이 모든 문서의 처리 시간을 보장하지는 않습니다.
- 원시 HTML은 렌더링하지 않습니다. 모든 이미지는 대체 설명으로 표시하며, 외부 URL·상대경로·data URL 이미지도 요청하지 않습니다. 로컬 `.md` 하나를 여는 방식이므로 같은 폴더의 이미지나 다른 문서를 자동으로 열지 않습니다.
- 링크는 `http`·`https`·`mailto`·문서 내부 `#`만 허용합니다. 외부 링크는 사용자가 클릭할 때 새 탭으로 열고 `noopener noreferrer`를 적용합니다. 상대경로와 실행 가능한 URL은 일반 텍스트로 표시합니다.
- `react-markdown` 10.1.0, `remark-gfm` 4.0.1, `@codemirror/lang-markdown` 6.5.2를 배포 파일에 포함합니다. Markdown 렌더러는 탭을 처음 열 때 로드합니다. 별도 서버·외부 CDN·API 없이 처리하며 입력을 브라우저 저장소에 기록하지 않습니다.
- 작은 화면에서는 원문과 미리보기를 위아래로 배치합니다. 큰 표·긴 코드블록은 문서 영역 안에서 가로로 스크롤합니다. 탭 전환 시 입력을 초기화하고 관련 안내를 하단에 표시합니다.
- 전체 라이선스 고지는 `public/licenses/markdown-dependencies.txt`에 있습니다. 의존성을 변경했다면 `npm ci` 후 `node scripts/generate-markdown-notices.mjs`로 갱신합니다.

## SQL 사용 범위

SQL 탭의 기본 DB는 **PostgreSQL**입니다.

| DB | 포매팅 | 문법 검사 |
| --- | --- | --- |
| PostgreSQL | 지원 | 지원 |
| MySQL | 지원 | 지원 |
| MariaDB | 지원 | 지원 |
| Oracle | 지원 | 실험적 지원 · 일반 SQL |
| ClickHouse | 지원 | 실험적 지원 · INSERT 데이터 제외 |

- 들여쓰기 2칸·4칸·탭, 키워드 원본 유지·대문자·소문자를 선택합니다.
- `.sql`·`.txt` 파일 열기와 드롭, DB별 예제, 복사, `.sql` 다운로드를 지원합니다.
- DB·키워드·들여쓰기 또는 입력을 바꾸면 재포매팅이 필요합니다. 문법 검사만으로 이전 결과를 갱신하지 않습니다.
- SQL 압축은 제공하지 않습니다. 5종 모두 문법 검사 버튼을 제공하며, Oracle·ClickHouse는 실험적 검사입니다.
- `sql-formatter` 15.9.0으로 포매팅하고, `node-sql-parser` 5.4.0의 PostgreSQL·MySQL·MariaDB 개별 문법으로 검사합니다. 라이브러리와 파서는 배포 파일에 포함하고 Worker에서 실행합니다. 외부 CDN·API·DB 연결은 사용하지 않습니다.
- Oracle은 ANTLR 4.13.2 런타임과 `antlr/grammars-v4`의 고정된 PL/SQL 문법(커밋 `89fd36482e8cb68a4e55df021a8adbc7541b52f2`)에서 생성한 JavaScript로 **일반 SQL**을 검사합니다. SELECT·JOIN·CTE·윈도 함수·DML·DDL·MERGE·CONNECT BY·바인드 변수를 테스트했습니다. PL/SQL 블록·프로시저·함수·패키지·명시적/암시적 호출문 및 SQL*Plus 명령은 검사 미지원으로 구분합니다. 일반 SQL 사이의 독립된 `/` 종료 구분자는 허용합니다.
- Oracle은 최초 lexer/parser 오류에서 중단하고 입력 전체(EOF)를 확인합니다. 복구된 구문을 정상으로 표시하지 않으며 ANTLR의 Unicode 코드 포인트 위치를 편집기의 UTF-16 위치로 변환합니다. Oracle 실제 DB 파서가 아니므로 버전별 문법의 정확성을 보장하지 않습니다.
- Oracle 파서는 검사 요청 시 동적으로 로드합니다. 운영 빌드 청크는 약 5.66 MB(참고 gzip 약 1.00 MB)이며 기본 nginx 설정의 압축 전송 여부는 별도입니다. Worker 실행 제한은 로드 시간을 포함한 10초입니다. Node에서 콜드 로드+대표 SQL 묶음 약 1.98초, 워밍업 후 250문장(7,000자) 약 111ms를 측정했습니다. 브라우저에서는 콜드 로드·250문장 처리·운영 CSP를 검증하지만 대용량 파일 성능을 보장하지 않습니다.
- Oracle 생성 소스는 저장소에 포함됩니다. **일반 빌드·배포에는 Java가 필요하지 않습니다.** 파서를 재생성할 때만 Java와 공식 ANTLR 도구가 필요하며, 절차는 `vendor/oracle-grammar/README.md`에 있습니다. 문법 원본·수정 내역·Apache-2.0/BSD-3-Clause 고지는 함께 보관합니다.
- ClickHouse는 `@clickhouse/parser` 0.3.0을 Worker에서 동적으로 불러옵니다. 알파 단계 파서이므로 실험적 기능으로 표시합니다. 일반 쿼리와 `INSERT … SELECT`를 검사하며, `INSERT … VALUES`, `INSERT … FORMAT`, `FROM INFILE` 등 데이터 검사를 생략하는 입력은 **검사 미지원**으로 표시합니다. EXPLAIN 내부 또는 여러 문장에 포함된 INSERT도 검사합니다. 미지원 상태는 문법 정상·문법 오류와 구분하며 기존 결과의 복사·다운로드를 비활성화합니다.
- ClickHouse 파서는 검사에만 사용합니다. 포매팅은 기존 `sql-formatter`를 유지하고 입력을 AST로 재직렬화하지 않습니다. `public/THIRD_PARTY_NOTICES.txt`와 `public/licenses/`에 새 의존성의 라이선스를 포함했으며 빌드 시 `dist/`로 복사됩니다.
- 문법 검사는 **선택한 파서의 지원 범위**에 한정됩니다. 실제 DB 파서와 동일하지 않으며, DB 버전·전용 구문에 따라 유효한 쿼리가 거부되거나 DB에서 거부할 쿼리가 통과할 수 있습니다. 테이블·컬럼 존재 여부, 타입·권한 및 실행 성공 여부는 확인하지 않습니다.
- 오류는 가능한 경우 원본 입력 기준 행·열과 이동 버튼을 제공합니다. 파싱 실패와 미지원 구문을 완전히 구분할 수 없어 함께 안내합니다. 포매팅 성공은 문법 검사 성공을 뜻하지 않습니다.
- 일반 쿼리 중심으로 지원합니다. 저장 프로시저·함수 본문 및 `DELIMITER` 변경 스크립트는 이번 지원 범위에서 제외합니다. 입력은 UTF-8 최대 10 MiB이며 Worker 처리 제한은 10초입니다. 대용량 SQL 처리 성능을 보장하는 한도는 아닙니다.
- 탭 전환 시 입력과 결과를 초기화합니다. 입력과 설정은 영구 저장하지 않습니다.

## 설치 및 빌드

빌드 PC에 Node.js 22.18 이상과 npm이 필요합니다.

```sh
npm ci
npm test
sh build.sh
```

`build.sh`는 Node.js·npm과 의존성 설치 여부를 확인한 뒤 타입 검사와 운영 빌드를 실행합니다. 배포 파일은 `dist/`에 생성됩니다. 소스 수정 후에는 다시 빌드하세요. 의존성이 변경되었다면 먼저 `npm ci`를 실행하세요.

## 로컬 실행: Live Server

VS Code에서 프로젝트 폴더를 열고 **Go Live**를 누릅니다. `.vscode/settings.json`에 Live Server 루트를 `/dist`로 설정해 두었습니다.

접속 주소: `http://127.0.0.1:5500/`

`file://`로 직접 열면 Worker가 정상 동작하지 않습니다. 갱신된 화면이 보이지 않으면 `⌘⇧R`로 새로고침하세요.

## 배포 파일 묶기

빌드 PC에서 실행합니다. `release.sh`는 지정한 버전으로 빌드한 뒤 배포 파일을 압축합니다. 별도로 `build.sh`를 실행할 필요는 없습니다.

```sh
sh release.sh 0.2.0
```

`releases/hformatter-0.2.0.tar.gz`가 생성되고 화면 하단에는 `V0.2.0`이 표시됩니다. 첫 번째 인자로 버전을 지정하며, 생략하면 `package.json`의 버전을 사용합니다. `package.json`은 변경하지 않습니다. 일반 빌드와 개발 서버에서도 기본적으로 `package.json`의 버전을 표시합니다. 같은 버전으로 다시 실행하면 압축 파일을 교체합니다. 서버에 필요한 `run.sh`, `dist/` 전체, `deploy/nginx.conf`만 포함합니다.

## 서버 배포: run.sh

운영 서버에 Docker가 설치·실행되어 있어야 합니다. 아래 파일만 서버에 전달합니다. **Worker를 포함한 `dist/` 전체**를 복사하세요.

```text
hformatter/
├── run.sh
├── dist/
│   ├── index.html
│   └── assets/
└── deploy/
    └── nginx.conf
```

최초 배포 시 압축 파일을 서버로 전달하고, 배포 디렉토리에서 해제·실행합니다.

```sh
mkdir -p /서버배포경로
tar -xzf /전달경로/hformatter-0.1.0.tar.gz -C /서버배포경로
cd /서버배포경로/hformatter
sh run.sh
```

압축을 풀면 `hformatter/` 디렉토리가 생성됩니다. 이미 실행 중인 서버의 갱신은 아래 업데이트 절차를 따르세요.

공식 nginx 이미지에 정적 파일과 설정을 읽기 전용으로 마운트합니다. 별도 이미지 빌드나 서버의 Node.js 설치는 필요하지 않습니다. 스크립트는 nginx 설정 검사 후 컨테이너를 시작합니다.

- 기본 컨테이너: `hformatter`
- 접속 주소: `http://서버주소:8080/`
- 하위 경로: `http://서버주소:8080/tools/formatter/`

최초 실행 시 nginx 이미지가 없으면 다운로드합니다. 폐쇄망 서버에서는 동일 CPU 아키텍처의 `nginx:stable-alpine` 이미지를 미리 준비해 `docker save` / `docker load`로 반입하세요.

### 실행 옵션

필요한 옵션을 환경변수로 지정합니다.

```sh
PORT=8090 sh run.sh
```

| 변수 | 기본값 | 용도 |
| --- | --- | --- |
| `PORT` | `8080` | 서버 포트 |
| `CONTAINER_NAME` | `hformatter` | 컨테이너 이름 |
| `BIND_ADDRESS` | `0.0.0.0` | 바인딩 주소, 같은 서버의 프록시 전용이면 `127.0.0.1` |
| `NGINX_IMAGE` | `nginx:stable-alpine` | 사용할 nginx 이미지 태그 또는 digest |
| `DIST_DIR` | 스크립트 옆 `dist/` | 배포 파일 디렉토리, 절대 경로 권장 |

HTTPS와 접근 제어는 기존 사내 리버스 프록시·웹서버 정책을 적용하세요. HTTP에서는 브라우저 정책에 따라 복사가 제한될 수 있습니다.

### 상태 확인 및 재기동

```sh
docker ps --filter name=hformatter
docker logs --tail 100 hformatter
docker exec hformatter nginx -t
docker restart hformatter
docker stop hformatter
```

이름을 변경했다면 실제 컨테이너 이름을 사용하세요. 같은 이름의 컨테이너가 있으면 `run.sh`는 중단합니다. 포트·이미지·마운트 또는 nginx 설정 파일을 바꿀 때는 재생성합니다.

```sh
docker stop hformatter
docker rm hformatter
PORT=8090 sh run.sh
```

### 업데이트

기존 `dist/` 디렉토리는 유지하고 새 `assets/` 파일을 먼저 복사한 뒤 `index.html`을 마지막에 교체하세요. 파일 내용만 바꾸면 재기동은 필요하지 않습니다. 이전 페이지의 Worker 요청을 위해 기존 해시 자산은 일정 기간 보관하세요.

디렉토리 자체를 교체하거나 심볼릭 링크 대상을 변경했다면 새 경로를 `DIST_DIR`로 지정해 컨테이너를 재생성하세요. 직전 배포 파일을 보관하면 같은 방식으로 복구할 수 있습니다.

Vite의 기본 `base`는 `./`입니다. 다른 하위 경로를 쓰려면 `deploy/nginx.conf`의 경로와 캐시 규칙을 함께 수정하세요. HTML은 재검증하고, 해시 자산은 장기 캐시하도록 설정되어 있습니다.

## 검증

단위 테스트 **36개**, Chrome 브라우저 테스트 **58개**, 타입 검사·운영 빌드가 통과했습니다. 브라우저 검사는 루트·하위 경로 각각 Markdown 10개와 기존 JSON·SQL 19개를 포함합니다. 실제 서버의 nginx 컨테이너 실행은 별도 확인이 필요합니다. 의존성 설치 시 npm 감사 결과 취약점은 0건이었습니다.

```sh
npm audit
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

Oracle·ClickHouse 전용 구문·오류 위치·미지원 입력 처리·외부 전송 없는 Worker 실행과 기존 JSON·SQL 회귀 동작을 검사합니다. 실제 Oracle·ClickHouse 서버와의 대조 검증은 포함하지 않습니다. 빌드에는 큰 청크 및 Zod 주석 경고가 있으나 빌드는 성공하며, ClickHouse 파서는 검사할 때 동적으로 로드합니다.

Markdown은 기본/GFM 문법과 한글 제목·각주 링크, 최신 원문 복사·다운로드, 파일 열기·드롭·인코딩·크기 제한, 실행 취소·초기화·탭 전환 및 파일 읽기 경쟁을 검사합니다. 운영 CSP 유무 각각에서 HTML 실행·이미지 등 외부 요청 차단을 확인하고, 미리보기 크기·행 수·DOM 노드·깊이 제한 후 복구, 250 KiB 코드블록 표시, 모바일 표·코드블록 가로 스크롤과 확대 전환도 검사했습니다. 데스크톱·모바일 스크린샷은 `test-results/`에 생성됩니다.

설치된 Chrome을 사용하려면 `CHROME_PATH`에 실행 파일 경로를 지정할 수 있습니다. 이번 검증은 macOS의 설치된 Chrome으로 워커 한 개를 사용했습니다.

```sh
CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npm run test:browser -- --workers=1
```

브라우저 테스트는 루트와 `/tools/formatter/`에서 실행합니다. 상세 설계와 확장 구조는 `formatter-design.md`를 참고하세요.
