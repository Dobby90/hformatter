import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

const input = (p: Page) => p.getByRole('textbox', { name: 'XML 입력', exact: true });
const output = (p: Page) => p.getByRole('textbox', { name: 'XML 결과', exact: true });
const format = (p: Page) => p.getByRole('button', { name: /포매팅 Beautify/ });
const validate = (p: Page) => p.getByRole('button', { name: /문법 검사 Validate/ });
const save = (p: Page) => p.getByRole('button', { name: '다운로드', exact: true });
const file = (name: string, body: string | Uint8Array) => ({ name, mimeType: 'application/octet-stream', buffer: Buffer.from(body) });
const open = (p: Page) => p.getByLabel('XML 파일 선택', { exact: true });
const reset = (p: Page) => p.getByRole('button', { name: '초기화', exact: true });
async function enter(p: Page) { await p.goto('./'); await p.getByRole('button', { name: 'XML', exact: true }).click(); await expect(input(p)).toBeVisible(); }
async function downloaded(p: Page) {
  const event = p.waitForEvent('download'); await save(p).click(); const result = await event;
  const stream = await result.createReadStream(), chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  return { name: result.suggestedFilename(), text: Buffer.concat(chunks).toString() };
}
test.beforeEach(async ({ page }) => { await enter(page); });

test('XML tools, real Worker, indentation, independent browser parser and full exports', async ({ page }) => {
  await expect(page.getByRole('region', { name: 'XML 도구' })).toBeVisible();
  await expect(page.getByRole('button', { name: /압축 Minify/ })).toHaveCount(0);
  await input(page).fill('<r xmlns:p="urn:p"><p:a id=\'1\'/><b/></r>');
  for (const [indent, unit] of [['2', '  '], ['4', '    '], ['tab', '\t']]) {
    await page.getByLabel('들여쓰기', { exact: true }).selectOption(indent);
    await input(page).press('ControlOrMeta+Enter'); await expect(save(page)).toBeEnabled();
    const result = await downloaded(page);
    expect(result).toEqual({ name: 'formatted.xml', text: '<r xmlns:p="urn:p">\n' + unit + '<p:a id=\'1\'/>\n' + unit + '<b/>\n</r>' });
    expect(await page.evaluate(text => new DOMParser().parseFromString(text, 'application/xml').querySelector('parsererror') === null, result.text)).toBe(true);
  }
  await output(page).focus(); await output(page).press('ControlOrMeta+a'); await output(page).press('Backspace');
  await expect(output(page)).toContainText('p:a');
  await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => { (window as unknown as { copied: string }).copied = text; } } }); });
  await page.getByRole('button', { name: '복사', exact: true }).click();
  expect(await page.evaluate(() => (window as unknown as { copied: string }).copied)).toBe((await downloaded(page)).text);
  await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw Error('denied'); } } }); });
  await page.getByRole('button', { name: '복사', exact: true }).click();
  await expect(page.getByText(/복사 권한이 없습니다/)).toBeVisible();
  expect(await page.evaluate(() => window.getSelection()?.toString())).toContain('<r');
});

test('mixed text, comments, CDATA and preserve scopes retain exact source', async ({ page }) => {
  const protectedNode = '<a xml:space="preserve"> \n<b xml:space="default"><c/></b>  </a>';
  const source = '<?xml version="1.0"?><r><!--x--><p>Hello <b> world </b> !</p>' + protectedNode + '<c><![CDATA[ <raw> ]]></c></r>';
  await input(page).fill(source); await format(page).click(); await expect(save(page)).toBeEnabled();
  expect((await downloaded(page)).text).toBe('<?xml version="1.0"?>\n<r>\n  <!--x-->\n  <p>Hello <b> world </b> !</p>\n  ' + protectedNode + '\n  <c><![CDATA[ <raw> ]]></c>\n</r>');
  await expect(input(page)).toContainText('Hello');
});

test('syntax diagnostics move the actual caret; blank and unsupported inputs never succeed', async ({ page }) => {
  const source = '<r>\n<a/>\n한😀</wrong>';
  await input(page).fill(source); await validate(page).click();
  await page.getByRole('button', { name: '3행 4열로 이동 ↗' }).click();
  await expect(input(page)).toBeFocused();
  await expect.poll(() => input(page).evaluate(element => {
    const selection = window.getSelection(); if (!selection?.anchorNode) return null;
    const line = selection.anchorNode.nodeType === Node.ELEMENT_NODE ? (selection.anchorNode as Element).closest('.cm-line') : selection.anchorNode.parentElement?.closest('.cm-line');
    if (!line) return null;
    const range = document.createRange(); range.setStart(line, 0); range.setEnd(selection.anchorNode, selection.anchorOffset);
    return { line: Array.from(element.querySelectorAll('.cm-line')).indexOf(line) + 1, column: range.toString().length + 1 };
  })).toEqual({ line: 3, column: 4 });
  expect(await page.evaluate(text => !!new DOMParser().parseFromString(text, 'application/xml').querySelector('parsererror'), source)).toBe(true);
  for (const source of ['', ' \n\t ']) {
    await input(page).fill(source); await format(page).click(); await validate(page).click();
    await expect(page.getByText('XML을 입력하거나 파일을 열어 시작하세요.', { exact: true })).toBeVisible(); await expect(save(page)).toBeDisabled();
  }
  await input(page).fill('<!DOCTYPE r SYSTEM "https://example.invalid/dtd"><r/>'); await validate(page).click();
  await expect(page.locator('.status-unsupported')).toContainText('DOCTYPE');
  await input(page).fill('<r/>'); await validate(page).click();
  await expect(page.getByText('문법 검사 완료 · 올바른 XML입니다.', { exact: true })).toBeVisible(); await expect(save(page)).toBeDisabled();
});

test('option round trips and validation cannot reactivate old results; file reads survive option changes', async ({ page }) => {
  await input(page).fill('<r><a/></r>'); await format(page).click(); await expect(save(page)).toBeEnabled();
  await page.getByLabel('들여쓰기', { exact: true }).selectOption('4'); await page.getByLabel('들여쓰기', { exact: true }).selectOption('2');
  await expect(page.getByText('이전 결과 · 재실행 필요', { exact: true })).toBeVisible();
  await validate(page).click(); await expect(page.locator('.status-success')).toBeVisible(); await expect(save(page)).toBeDisabled();
  await expect(page.getByRole('button', { name: '복사', exact: true })).toBeDisabled();
  await format(page).click(); await expect(save(page)).toBeEnabled();
  await page.evaluate(() => { const original = File.prototype.arrayBuffer; File.prototype.arrayBuffer = async function() { await new Promise(resolve => setTimeout(resolve, 250)); return original.call(this); }; });
  await open(page).setInputFiles(file('option.xml', '<new/>')); await page.getByLabel('들여쓰기', { exact: true }).selectOption('4');
  await expect(input(page)).toHaveText('<new/>');
});

test('file/drop failures preserve input and filename; reset removes undo history', async ({ page }) => {
  await open(page).setInputFiles(file('original.XML', '\uFEFF<original/>')); await expect(input(page)).toHaveText('<original/>');
  await format(page).click(); await expect(save(page)).toBeEnabled(); expect((await downloaded(page)).name).toBe('original.formatted.xml');
  for (const candidate of [
    file('bad.txt', '<?xml version="1.0" encoding="UTF-16"?><bad/>'),
    file('bad.xml', new Uint8Array([0xff, 0xfe])),
    file('bad.json', '<bad/>'), file('large.xml', new Uint8Array(10 * 1024 * 1024 + 1)),
  ]) {
    await open(page).setInputFiles(candidate); await expect(page.locator('.notice')).toBeVisible();
    await expect(input(page)).toHaveText('<original/>'); await expect(page.locator('.file-name')).toHaveText('original.XML');
  }
  await page.evaluate(() => { const original = File.prototype.arrayBuffer; File.prototype.arrayBuffer = function() { return this.name === 'fail.xml' ? Promise.reject(Error('read')) : original.call(this); }; });
  await open(page).setInputFiles(file('fail.xml', '<fail/>')); await expect(page.getByText(/파일을 읽을 수 없습니다/)).toBeVisible(); await expect(input(page)).toHaveText('<original/>');
  const region = page.getByRole('region', { name: '입력 영역', exact: true });
  await region.evaluate(element => { const dataTransfer = new DataTransfer(); for (const name of ['a.xml', 'b.txt']) dataTransfer.items.add(new File(['<bad/>'], name)); element.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer })); });
  await expect(page.getByText(/파일은 한 번에 하나씩/)).toBeVisible(); await expect(input(page)).toHaveText('<original/>');
  await region.evaluate(element => { const dataTransfer = new DataTransfer(); dataTransfer.items.add(new File(['<dropped/>'], 'drop.txt')); element.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer })); });
  await expect(input(page)).toHaveText('<dropped/>');
  await page.getByRole('button', { name: '입력 실행 취소', exact: true }).click(); await expect(input(page)).toHaveText('<original/>');
  await page.getByRole('button', { name: '입력 다시 실행', exact: true }).click(); await expect(input(page)).toHaveText('<dropped/>');
  await reset(page).click(); await input(page).press('ControlOrMeta+z'); await expect(input(page)).toBeEmpty(); await expect(output(page)).toBeEmpty();
});

test('file races are invalidated by later files, edits, example, reset and tab changes', async ({ page }) => {
  await page.evaluate(() => { const original = File.prototype.arrayBuffer; File.prototype.arrayBuffer = async function() { if (this.name === 'slow.xml') await new Promise(resolve => setTimeout(resolve, 300)); return original.call(this); }; });
  await open(page).setInputFiles(file('slow.xml', '<slow/>')); await open(page).setInputFiles(file('fast.xml', '<fast/>'));
  await expect(input(page)).toHaveText('<fast/>'); await page.waitForTimeout(400); await expect(input(page)).toHaveText('<fast/>');
  for (const action of ['edit', 'example', 'reset', 'tab']) {
    await open(page).setInputFiles(file('slow.xml', '<slow/>'));
    if (action === 'edit') await input(page).fill('<typed/>');
    if (action === 'example') await page.getByRole('button', { name: '예제', exact: true }).click();
    if (action === 'reset') await reset(page).click();
    if (action === 'tab') { await page.getByRole('button', { name: 'JSON', exact: true }).click(); await page.getByRole('button', { name: 'XML', exact: true }).click(); }
    await page.waitForTimeout(400);
    await expect(input(page)).not.toContainText('slow');
    if (action === 'edit') await expect(input(page)).toHaveText('<typed/>');
    if (action === 'example') await expect(input(page)).toContainText('catalog');
    if (action === 'reset' || action === 'tab') await expect(input(page)).toBeEmpty();
  }
});

test('Worker construction, execution, response failures and real ten-second timeout permit retry', async ({ page }) => {
  await page.addInitScript(() => {
    const Original = window.Worker;
    window.Worker = class extends Original {
      constructor(url: string | URL, options?: WorkerOptions) {
        if ((window as unknown as { xmlFailure: string }).xmlFailure === 'construct') throw Error('blocked');
        super(url, options);
      }
      postMessage(message: unknown) {
        const mode = (window as unknown as { xmlFailure: string }).xmlFailure;
        if (mode === 'timeout') return;
        if (mode === 'error') { queueMicrotask(() => this.onerror?.call(this, new ErrorEvent('error'))); return; }
        if (mode === 'message') { queueMicrotask(() => this.onmessageerror?.call(this, new MessageEvent('messageerror'))); return; }
        super.postMessage(message);
      }
    };
  });
  await enter(page); await input(page).fill('<r/>');
  for (const [mode, message] of [['construct', /Worker를 시작할 수 없습니다/], ['error', /실행 오류/], ['message', /결과를 읽을 수 없습니다/], ['timeout', /10초를 초과/]] as const) {
    await page.evaluate(mode => { (window as unknown as { xmlFailure: string }).xmlFailure = mode; }, mode);
    await format(page).click(); await expect(page.locator('.status-error')).toContainText(message, { timeout: 15000 }); await expect(input(page)).toHaveText('<r/>');
    await page.evaluate(() => { (window as unknown as { xmlFailure: string }).xmlFailure = ''; });
    await input(page).fill('<r><retry/></r>'); await format(page).click(); await expect(save(page)).toBeEnabled();
    await input(page).fill('<r/>');
  }
  await input(page).fill('<a>'.repeat(5000) + '<b/>' + '</a>'.repeat(5000)); await format(page).click();
  await expect(page.locator('.status-error')).toContainText('40 MiB'); await expect(input(page)).toContainText('<b/>');
  await input(page).fill('<recovered/>'); await format(page).click(); await expect(save(page)).toBeEnabled();
});

test('late Worker callbacks cannot overwrite edits, options, example, reset or a new tab', async ({ page }) => {
  await page.addInitScript(() => {
    const Original = window.Worker;
    window.Worker = class extends Original {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.addEventListener('message', event => {
          event.stopImmediatePropagation(); const callback = this.onmessage;
          setTimeout(() => callback?.call(this, event), 300);
        });
      }
    };
  });
  await enter(page);
  for (const action of ['edit', 'option', 'example', 'reset', 'tab']) {
    await input(page).fill('<old/>'); await format(page).click();
    if (action === 'edit') await input(page).fill('<new/>');
    if (action === 'option') await page.getByLabel('들여쓰기', { exact: true }).selectOption('4');
    if (action === 'example') await page.getByRole('button', { name: '예제', exact: true }).click();
    if (action === 'reset') await reset(page).click();
    if (action === 'tab') { await page.getByRole('button', { name: 'JSON', exact: true }).click(); await page.getByRole('button', { name: 'XML', exact: true }).click(); }
    await page.waitForTimeout(500); await expect(output(page)).toBeEmpty(); await expect(save(page)).toBeDisabled();
  }
});

for (const csp of [false, true]) test('XML stays text and makes no external/data requests or persistent writes, CSP=' + csp, async ({ page }) => {
  if (csp) await page.route('**/*', async route => {
    if (route.request().resourceType() !== 'document') return route.continue();
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': "default-src 'self'; script-src 'self'; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'self'" } });
  });
  const forbidden: string[] = [];
  page.on('request', request => {
    if (new URL(request.url()).origin !== new URL(page.url()).origin || ['fetch', 'xhr', 'websocket', 'eventsource', 'ping'].includes(request.resourceType())) forbidden.push(request.url());
  });
  await enter(page);
  await input(page).fill('<?xml-stylesheet href="https://example.invalid/style.xsl" type="text/xsl"?><r xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="urn:r https://example.invalid/a.xsd"><script>window.xmlExecuted=true</script>&lt;img src="https://example.invalid/x"&gt;</r>');
  await format(page).click(); await expect(save(page)).toBeEnabled();
  await input(page).fill('<!DOCTYPE r SYSTEM "https://example.invalid/a.dtd"><r/>'); await validate(page).click(); await expect(page.locator('.status-unsupported')).toBeVisible();
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length, (window as unknown as { xmlExecuted?: boolean }).xmlExecuted ?? false])).toEqual([0, 0, false]);
  expect(forbidden).toEqual([]);
  await page.reload(); await page.getByRole('button', { name: 'XML', exact: true }).click(); await expect(input(page)).toBeEmpty(); await expect(output(page)).toBeEmpty();
});

test('example, folding, search, keyboard resizing and mobile layout follow shared editor behavior', async ({ page }) => {
  await page.getByRole('button', { name: '예제', exact: true }).click(); await format(page).click(); await expect(save(page)).toBeEnabled();
  await page.getByRole('button', { name: '입력 검색', exact: true }).click(); await expect(page.locator('.input-pane .cm-search')).toBeVisible();
  await input(page).press('Escape');
  const separator = page.getByRole('separator', { name: '편집기 너비 조절' }); await separator.focus(); await separator.press('ArrowRight'); await expect(separator).toHaveAttribute('aria-valuenow', '52');
  await expect(page.locator('.output-pane .cm-foldGutter')).toContainText('⌄');
  await page.setViewportSize({ width: 390, height: 844 });
  const first = await page.getByRole('region', { name: '입력 영역', exact: true }).boundingBox(), second = await page.getByRole('region', { name: '결과 영역', exact: true }).boundingBox();
  expect(second!.y).toBeGreaterThanOrEqual(first!.y + first!.height);
  await expect(page.getByRole('button', { name: 'YAML 추후 구현 예정', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Markdown', exact: true }).click(); await page.getByRole('button', { name: 'XML', exact: true }).click();
  await expect(input(page)).toBeEmpty(); await expect(output(page)).toBeEmpty();
});
