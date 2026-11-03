import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
const input = (page: Page) => page.getByRole('textbox', { name: 'JSON 입력', exact: true });
const output = (page: Page) => page.getByRole('textbox', { name: 'JSON 결과', exact: true });
const format = (page: Page) => page.getByRole('button', { name: /포매팅 Beautify/ });
const download = (page: Page) => page.getByRole('button', { name: '다운로드', exact: true });
const file = (name: string, body: string | Uint8Array) => ({ name, mimeType: 'application/octet-stream', buffer: Buffer.from(body) });

test.beforeEach(async ({ page }) => { await page.goto('./'); await expect(input(page)).toBeVisible(); });

test('paste, format with Worker, stale result, validation and download', async ({ page }) => {
  await input(page).focus();
  await input(page).evaluate(element => {
    const clipboardData = new DataTransfer(); clipboardData.setData('text/plain', '{"id":9007199254740993,"id":2,"text":"한글"}');
    element.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData }));
  });
  await format(page).click();
  await expect(page.getByText('포매팅 완료 · 올바른 JSON입니다.', { exact: true })).toBeVisible();
  await expect(output(page)).toContainText('9007199254740993');
  await expect(download(page)).toBeEnabled();
  const pending = page.waitForEvent('download'); await download(page).click();
  const downloaded = await pending; expect(downloaded.suggestedFilename()).toBe('formatted.json');
  const stream = await downloaded.createReadStream(); const chunks: Buffer[] = []; for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks).toString()).toBe('{\n  "id": 9007199254740993,\n  "id": 2,\n  "text": "한글"\n}');
  await input(page).fill('{"changed":true}');
  await expect(download(page)).toBeDisabled();
  await page.getByRole('button', { name: /문법 검사 Validate/ }).click();
  await expect(page.getByText('문법 검사 완료 · 올바른 JSON입니다.', { exact: true })).toBeVisible();
  await expect(download(page)).toBeDisabled();
  await input(page).press('ControlOrMeta+Enter'); await expect(download(page)).toBeEnabled();
  await expect(output(page)).toContainText('changed');
});

test('syntax location, file BOM, invalid encoding, undo and reset', async ({ page }) => {
  await input(page).fill('{\n "a":1,\n}'); await format(page).click();
  await expect(page.getByRole('button', { name: '3행 1열로 이동 ↗' })).toBeVisible();
  await page.getByRole('button', { name: '3행 1열로 이동 ↗' }).click(); await expect(input(page)).toBeFocused();
  await page.getByLabel('JSON 파일 선택', { exact: true }).setInputFiles(file('sample.json', '\uFEFF{"file":true}'));
  await expect(input(page)).toContainText('file'); await format(page).click(); await expect(download(page)).toBeEnabled();
  const pending = page.waitForEvent('download'); await download(page).click(); expect((await pending).suggestedFilename()).toBe('sample.formatted.json');
  await page.getByLabel('JSON 파일 선택', { exact: true }).setInputFiles(file('broken.txt', new Uint8Array([0xff, 0xfe])));
  await expect(page.getByText(/파일을 읽을 수 없습니다/)).toBeVisible(); await expect(input(page)).toContainText('file');
  await page.getByRole('button', { name: '입력 실행 취소', exact: true }).click(); await expect(input(page)).toContainText('"a":1');
  await page.getByRole('button', { name: '초기화', exact: true }).click(); await expect(input(page)).toBeEmpty(); await expect(download(page)).toBeDisabled();
  await input(page).press('ControlOrMeta+z'); await expect(input(page)).toBeEmpty();
});

test('drop one file; multiple files and oversized paste keep original input', async ({ page }) => {
  await input(page).fill('{"original":true}');
  await page.getByRole('region', { name: '입력 영역', exact: true }).evaluate(element => {
    const dataTransfer = new DataTransfer(); dataTransfer.items.add(new File(['{}'], 'one.json')); dataTransfer.items.add(new File(['[]'], 'two.txt'));
    element.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
  });
  await expect(page.getByText(/파일은 한 번에 하나씩/)).toBeVisible(); await expect(input(page)).toContainText('original');
  await input(page).evaluate(element => {
    const clipboardData = new DataTransfer(); clipboardData.setData('text/plain', 'a'.repeat(10 * 1024 * 1024 + 1));
    element.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData }));
  });
  await expect(page.getByText(/입력은 UTF-8 기준 10 MiB/)).toBeVisible(); await expect(input(page)).toContainText('original');
  await page.getByRole('region', { name: '입력 영역', exact: true }).evaluate(element => {
    const dataTransfer = new DataTransfer(); dataTransfer.items.add(new File(['{"dropped":true}'], 'drop.txt'));
    element.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
  });
  await expect(input(page)).toContainText('dropped');
});

test('copy denial selects result; planned formats unavailable; reload discards data; no data requests', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', request => { if (!['document','script','stylesheet','image','font','other'].includes(request.resourceType())) requests.push(request.url()); });
  await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('denied')) }, configurable: true }); });
  await page.getByRole('button', { name: '예제', exact: true }).click(); await format(page).click(); await expect(download(page)).toBeEnabled();
  await page.getByRole('button', { name: '복사', exact: true }).click(); await expect(page.getByText(/복사 권한이 없습니다/)).toBeVisible();
  for (const format of ['XML', 'YAML']) {
    await expect(page.getByRole('button', { name: `${format} 추후 구현 예정`, exact: true })).toBeDisabled();
  }
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
  expect(requests).toEqual([]);
  await page.reload(); await expect(input(page)).toBeEmpty(); await expect(output(page)).toBeEmpty();
});

test('editing or reset during a delayed Worker response cannot restore obsolete results', async ({ page }) => {
  await page.addInitScript(() => {
    const Original = window.Worker;
    window.Worker = class extends Original {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.addEventListener('message', event => { event.stopImmediatePropagation(); setTimeout(() => this.onmessage?.call(this, event), 500); });
      }
    };
  });
  await page.reload(); await input(page).fill('{"old":1}'); await format(page).click(); await input(page).fill('{"new":2}');
  await page.waitForTimeout(800); await expect(output(page)).toBeEmpty(); await expect(download(page)).toBeDisabled();
  await format(page).click(); await page.getByRole('button', { name: '초기화', exact: true }).click();
  await page.waitForTimeout(800); await expect(input(page)).toBeEmpty(); await expect(output(page)).toBeEmpty();
  await page.getByRole('button', { name: '예제', exact: true }).click(); await format(page).click(); await expect(download(page)).toBeEnabled();
});

test('mobile stacks editors and stays light with a dark OS preference', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'light');
  await expect(page.locator('.app')).toHaveCSS('background-color', 'rgb(246, 248, 250)');
  const first = await page.getByRole('region', { name: '입력 영역', exact: true }).boundingBox();
  const second = await page.getByRole('region', { name: '결과 영역', exact: true }).boundingBox();
  expect(second!.y).toBeGreaterThanOrEqual(first!.y + first!.height);
});

test('last file request wins, and typing invalidates a pending file read', async ({ page }) => {
  await page.evaluate(() => {
    const original = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = async function() {
      if (this.name === 'slow.json') await new Promise(resolve => setTimeout(resolve, 700));
      return original.call(this);
    };
  });
  await page.getByLabel('JSON 파일 선택', { exact: true }).setInputFiles(file('slow.json', '{"slow":1}'));
  await page.getByLabel('JSON 파일 선택', { exact: true }).setInputFiles(file('fast.json', '{"fast":2}'));
  await expect(input(page)).toContainText('fast'); await page.waitForTimeout(900); await expect(input(page)).toContainText('fast');
  await page.getByLabel('JSON 파일 선택', { exact: true }).setInputFiles(file('slow.json', '{"slow":1}'));
  await input(page).fill('{"typed":3}'); await page.waitForTimeout(900); await expect(input(page)).toContainText('typed');
});

test('copies the entire current output when clipboard is available', async ({ page }) => {
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (text: string) => { (window as unknown as { copied: string }).copied = text; } }, configurable: true });
  });
  await input(page).fill('{"copy":"한글"}'); await format(page).click(); await expect(download(page)).toBeEnabled();
  await page.getByRole('button', { name: '복사', exact: true }).click();
  expect(await page.evaluate(() => (window as unknown as { copied: string }).copied)).toBe('{\n  "copy": "한글"\n}');
  await expect(page.getByText('결과를 복사했습니다.', { exact: true })).toBeVisible();
});
