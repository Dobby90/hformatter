import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
const input = (page: Page) => page.getByRole('textbox', { name: 'SQL 입력', exact: true });
const output = (page: Page) => page.getByRole('textbox', { name: 'SQL 결과', exact: true });
const format = (page: Page) => page.getByRole('button', { name: /^포매팅/ });
const validate = (page: Page) => page.getByRole('button', { name: /문법 검사 Validate/ });
const download = (page: Page) => page.getByRole('button', { name: '다운로드', exact: true });
test.beforeEach(async ({ page }) => { await page.goto('./'); await page.getByRole('button', { name: 'SQL', exact: true }).click(); await expect(input(page)).toBeVisible(); });

test('defaults to PostgreSQL; validation has diagnostics and never refreshes stale output', async ({ page }) => {
  await expect(page.getByLabel('DB 종류')).toHaveValue('postgresql');
  await expect(page.getByRole('button', { name: /압축 Minify/ })).toHaveCount(0);
  await input(page).fill('select * from users;'); await format(page).click(); await expect(download(page)).toBeEnabled();
  await input(page).fill('\uFEFF-- 한글 😀\nselect *\nfrom;'); await validate(page).click();
  await expect(page.getByText(/구문 분석 실패/)).toBeVisible();
  await page.getByRole('button', { name: '3행 5열로 이동 ↗' }).click(); await expect(input(page)).toBeFocused();
  await input(page).fill('select 1;'); await validate(page).click();
  await expect(page.getByText('문법 검사 완료 · PostgreSQL 파서 기준 구문 분석 통과', { exact: true })).toBeVisible();
  await expect(download(page)).toBeDisabled();
  await input(page).press('ControlOrMeta+Enter'); await expect(download(page)).toBeEnabled();
});

test('all five DB examples format; all expose enabled validation', async ({ page }, testInfo) => {
  for (const [id, name, supported] of [['postgresql', 'PostgreSQL', true], ['mysql', 'MySQL', true], ['mariadb', 'MariaDB', true], ['plsql', 'Oracle', true], ['clickhouse', 'ClickHouse', true]] as const) {
    await page.getByLabel('DB 종류').selectOption(id);
    await page.getByRole('button', { name: '예제', exact: true }).click();
    await format(page).click(); await expect(page.getByText(`포매팅 완료 · ${name}`, { exact: true })).toBeVisible();
    await expect(download(page)).toBeEnabled(); await expect(output(page)).not.toBeEmpty();
    if (supported) {
      await expect(validate(page)).toBeEnabled(); await validate(page).click();
      await expect(page.getByText(`문법 검사 완료 · ${name} 파서 기준 구문 분석 통과`, { exact: true })).toBeVisible();
    } else {
      await expect(validate(page)).toBeDisabled();
      await expect(page.getByText(`${name} 문법 검사 · 추후 구현 예정. 현재 포매팅을 지원합니다.`, { exact: true })).toBeVisible();
    }
  }
  await page.screenshot({ path: testInfo.outputPath('sql-desktop.png'), fullPage: true });
});

test('SQL options invalidate results; import, download, reset and format switching work', async ({ page }) => {
  await page.getByLabel('SQL 파일 선택', { exact: true }).setInputFiles({ name: 'sample.sql', mimeType: 'text/plain', buffer: Buffer.from("select '한글' as title from users;") });
  await format(page).click(); await expect(download(page)).toBeEnabled();
  await page.getByLabel('키워드 대소문자').selectOption('upper'); await expect(download(page)).toBeDisabled();
  await validate(page).click(); await expect(page.getByText(/구문 분석 통과/)).toBeVisible(); await expect(download(page)).toBeDisabled();
  await page.getByLabel('들여쓰기', { exact: true }).selectOption('4');
  await format(page).click(); await expect(download(page)).toBeEnabled(); await expect(output(page)).toContainText('SELECT');
  const pending = page.waitForEvent('download'); await download(page).click(); const saved = await pending;
  expect(saved.suggestedFilename()).toBe('sample.formatted.sql');
  const stream = await saved.createReadStream(); const chunks: Buffer[] = []; for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks).toString()).toBe("SELECT\n    '한글' AS title\nFROM\n    users;");
  await page.getByLabel('DB 종류').selectOption('mysql'); await expect(download(page)).toBeDisabled();
  await page.getByRole('button', { name: '초기화', exact: true }).click(); await expect(input(page)).toBeEmpty();
  await input(page).press('ControlOrMeta+z'); await expect(input(page)).toBeEmpty();
  await page.getByRole('button', { name: 'JSON', exact: true }).click();
  await page.getByRole('textbox', { name: 'JSON 입력', exact: true }).fill('{"ok":true}');
  await format(page).click(); await expect(page.getByText('포매팅 완료 · 올바른 JSON입니다.', { exact: true })).toBeVisible();
});

test('dialect changes cancel pending validation; local-only processing and reload discard SQL', async ({ page }) => {
  await page.addInitScript(() => {
    const Original = window.Worker;
    window.Worker = class extends Original {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.addEventListener('message', event => { event.stopImmediatePropagation(); setTimeout(() => this.onmessage?.call(this, event), 500); });
      }
    };
  });
  await page.reload(); await page.getByRole('button', { name: 'SQL', exact: true }).click();
  const requests: string[] = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.origin !== 'http://127.0.0.1:4173' || request.method() !== 'GET' || ['fetch', 'xhr', 'websocket'].includes(request.resourceType())) requests.push(request.url());
  });
  await page.getByLabel('DB 종류').selectOption('clickhouse');
  await input(page).fill('select 1;'); await validate(page).click();
  await page.getByLabel('DB 종류').selectOption('plsql');
  await page.waitForTimeout(800); await expect(page.getByText(/구문 분석 통과/)).toHaveCount(0);
  await format(page).click(); await expect(download(page)).toBeEnabled();
  expect(requests).toEqual([]);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
  await page.reload(); await page.getByRole('button', { name: 'SQL', exact: true }).click();
  await expect(input(page)).toBeEmpty(); await expect(output(page)).toBeEmpty();
});

test('SQL controls fit mobile and file drops accept SQL', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('region', { name: '입력 영역', exact: true }).evaluate(element => {
    const dataTransfer = new DataTransfer(); dataTransfer.items.add(new File(['select 1;'], 'drop.sql'));
    element.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
  });
  await expect(input(page)).toContainText('select 1;');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await format(page).click(); await expect(download(page)).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath('sql-mobile.png'), fullPage: true });
});

test('async worker failures are reported promptly and a new worker can retry', async ({ page }) => {
  await page.addInitScript(() => {
    const Original = window.Worker;
    let failOnce = true;
    window.Worker = class extends Original {
      postMessage(message: { options: Record<string, unknown> }) {
        if (failOnce) { failOnce = false; super.postMessage({ ...message, options: { ...message.options, dialect: 'unsupported' } }); }
        else super.postMessage(message);
      }
    };
  });
  await page.reload(); await page.getByRole('button', { name: 'SQL', exact: true }).click();
  await input(page).fill('select 1;'); await format(page).click();
  await expect(page.getByText(/처리 중 실행 오류가 발생했습니다/)).toBeVisible({ timeout: 3000 });
  await expect(download(page)).toBeDisabled();
  await format(page).click(); await expect(download(page)).toBeEnabled();
});

test('ClickHouse validates locally, locates errors, and leaves input untouched', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', request => { requests.push(request.url()); expect(request.method()).toBe('GET'); });
  await page.getByLabel('DB 종류').selectOption('clickhouse');
  await expect(validate(page)).toBeEnabled();
  await expect(page.getByText(/ClickHouse 문법 검사는 실험적입니다/)).toBeVisible();
  const text = 'select {id:UInt64} from events final prewhere id > 1 limit 2 by id settings max_threads=2;';
  await input(page).fill(text); await validate(page).click();
  await expect(page.getByText('문법 검사 완료 · ClickHouse 파서 기준 구문 분석 통과', { exact: true })).toBeVisible();
  await expect(input(page)).toHaveText(text); await expect(output(page)).toBeEmpty();
  await expect(download(page)).toBeDisabled();
  await input(page).fill('\uFEFF-- 한글 😀\nselect *\nfrom;'); await validate(page).click();
  await expect(page.getByText(/구문 분석 실패/)).toBeVisible();
  await page.getByRole('button', { name: '3행 5열로 이동 ↗' }).click();
  await expect(input(page)).toBeFocused();
  expect(requests.every(url => new URL(url).origin === 'http://127.0.0.1:4173' && new URL(url).pathname.includes('/assets/'))).toBe(true);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
});

test('ClickHouse unchecked data is distinct from success and syntax errors; INSERT SELECT remains supported', async ({ page }) => {
  await page.getByLabel('DB 종류').selectOption('clickhouse');
  await input(page).fill('insert into t values (1);'); await format(page).click(); await expect(download(page)).toBeEnabled();
  await validate(page).click();
  await expect(page.locator('.status-unsupported')).toContainText('검사 미지원');
  await expect(page.locator('.status-success')).toHaveCount(0); await expect(page.locator('.status-syntax')).toHaveCount(0);
  await expect(download(page)).toBeDisabled();
  await expect(input(page)).toHaveText('insert into t values (1);');
  await input(page).fill('insert into t format JSONEachRow invalid_json'); await validate(page).click();
  await expect(page.locator('.status-unsupported')).toContainText('검사 미지원');
  await input(page).fill('insert into t select 1;'); await validate(page).click();
  await expect(page.getByText('문법 검사 완료 · ClickHouse 파서 기준 구문 분석 통과', { exact: true })).toBeVisible();
  await expect(download(page)).toBeDisabled();
  await format(page).click(); await expect(download(page)).toBeEnabled();
  await page.getByLabel('DB 종류').selectOption('plsql'); await expect(validate(page)).toBeEnabled();
});

test('Oracle validates in a Worker under deployment CSP and moves to Unicode error positions', async ({ page }, testInfo) => {
  await page.route('**/*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), 'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; worker-src 'self'; connect-src 'none'; img-src 'self' data:; font-src 'self'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'" } });
  });
  await page.reload(); await page.getByRole('button', { name: 'SQL', exact: true }).click();
  const requests: string[] = [];
  page.on('request', request => { requests.push(request.url()); expect(request.method()).toBe('GET'); });
  await page.getByLabel('DB 종류').selectOption('plsql');
  await expect(validate(page)).toBeEnabled(); await expect(page.getByText(/Oracle 문법 검사는 실험적/)).toBeVisible();
  await page.getByRole('button', { name: '예제', exact: true }).click();
  const original = await input(page).innerText();
  const started = performance.now(); await validate(page).click();
  await expect(page.getByText('문법 검사 완료 · Oracle 파서 기준 구문 분석 통과', { exact: true })).toBeVisible();
  await testInfo.attach('oracle-cold-validation-ms', { body: String((performance.now() - started).toFixed(1)), contentType: 'text/plain' });
  expect(await input(page).innerText()).toBe(original); await expect(output(page)).toBeEmpty(); await expect(download(page)).toBeDisabled();
  await input(page).fill('\uFEFF-- 한글😀\r\nselect § from dual;'); await validate(page).click();
  await expect(page.getByText(/구문 분석 실패/)).toBeVisible();
  await page.getByRole('button', { name: '2행 8열로 이동 ↗' }).click(); await expect(input(page)).toBeFocused();
  expect(requests.every(url => new URL(url).origin === 'http://127.0.0.1:4173' && new URL(url).pathname.includes('/assets/'))).toBe(true);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
});

test('Oracle separates unsupported scripts from syntax errors and preserves stale output', async ({ page }) => {
  await page.getByLabel('DB 종류').selectOption('plsql');
  await input(page).fill('select 1 from dual;'); await format(page).click(); await expect(download(page)).toBeEnabled();
  await input(page).fill('begin null; end;'); await validate(page).click();
  await expect(page.locator('.status-unsupported')).toContainText('검사 미지원');
  await expect(page.locator('.status-success')).toHaveCount(0); await expect(download(page)).toBeDisabled();
  await expect(input(page)).toHaveText('begin null; end;');
  await input(page).fill('select 2 from dual;'); await validate(page).click();
  await expect(page.getByText('문법 검사 완료 · Oracle 파서 기준 구문 분석 통과', { exact: true })).toBeVisible();
  await expect(download(page)).toBeDisabled(); await format(page).click(); await expect(download(page)).toBeEnabled();
  await page.getByLabel('DB 종류').selectOption('postgresql'); await expect(download(page)).toBeDisabled();
});

test('Oracle parser loads only for validation and handles 250 statements within the Worker timeout', async ({ page }, testInfo) => {
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  await page.getByLabel('DB 종류').selectOption('plsql');
  await input(page).fill('select 1 from dual;'); await format(page).click(); await expect(download(page)).toBeEnabled();
  expect(requests.some(url => /\/validate-[^/]+\.js/.test(url))).toBe(false);
  await input(page).fill('select :id as id from dual;\n'.repeat(250));
  const started = performance.now(); await validate(page).click();
  await expect(page.getByText('문법 검사 완료 · Oracle 파서 기준 구문 분석 통과', { exact: true })).toBeVisible({ timeout: 11000 });
  await testInfo.attach('oracle-250-statements-ms', { body: String((performance.now() - started).toFixed(1)), contentType: 'text/plain' });
  expect(requests.some(url => /\/validate-[^/]+\.js/.test(url))).toBe(true);
});
