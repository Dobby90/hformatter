import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const input = (page: Page) => page.getByRole('textbox', { name: 'Markdown 입력', exact: true });
const preview = (page: Page) => page.getByRole('article', { name: 'Markdown 미리보기', exact: true });
const download = (page: Page) => page.getByRole('button', { name: '다운로드', exact: true });
const file = (name: string, body: string | Uint8Array) => ({ name, mimeType: 'application/octet-stream', buffer: Buffer.from(body) });
const openMarkdown = async (page: Page) => {
  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  await expect(input(page)).toBeVisible();
};

test.beforeEach(async ({ page }) => { await page.goto('./'); await openMarkdown(page); });

test('renders CommonMark and GFM automatically, updates headings/anchors, and clears empty input', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const text = '# 문서 제목\n\n[목차](#문서-제목)\n\n## 기능\n\n**굵게** *기울임* ~~취소선~~ `인라인`\n\n> 인용문\n\n1. 첫째\n2. 둘째\n\n- [x] 완료\n- [ ] 미완료\n\n| 이름 | 값 |\n| --- | ---: |\n| 한글 | 42 |\n\n```sql\nselect 1 < 2;\n```\n\n각주[^1]\n\n[^1]: 각주 내용\n';
  await input(page).fill(text);
  await expect(preview(page).getByRole('heading', { name: '문서 제목', exact: true })).toBeVisible();
  await expect(preview(page).locator('strong')).toHaveText('굵게');
  await expect(preview(page).locator('em')).toHaveText('기울임');
  await expect(preview(page).locator('del')).toHaveText('취소선');
  await expect(preview(page).locator('blockquote')).toHaveText('인용문');
  await expect(preview(page).locator('table')).toContainText('한글');
  await expect(preview(page).locator('pre code')).toHaveText('select 1 < 2;\n');
  await expect(preview(page).getByRole('checkbox')).toHaveCount(2);
  await expect(preview(page).getByRole('checkbox').first()).toBeChecked();
  await expect(preview(page).getByRole('checkbox').first()).toBeDisabled();
  await expect(preview(page).getByRole('link', { name: '목차', exact: true })).toHaveAttribute('href', '#md-heading-문서-제목');
  await expect(preview(page).locator('[data-footnote-ref]')).toHaveAttribute('aria-describedby', 'footnote-label');
  await expect(preview(page).locator('#footnote-label')).toHaveCount(1);
  await expect(page.getByRole('button', { name: /^포매팅|^압축|^문법 검사/ })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('markdown-desktop.png'), fullPage: true });
  await input(page).fill('# 최신\n\n내용');
  await input(page).press('ControlOrMeta+Enter');
  await expect(preview(page).getByRole('heading', { name: '최신', exact: true })).toBeVisible();
  await expect(preview(page).getByRole('heading', { name: '문서 제목', exact: true })).toHaveCount(0);
  await input(page).fill('');
  await expect(preview(page).locator('h1')).toHaveCount(0);
  await expect(download(page)).toBeDisabled();
});

test('opens UTF-8 Markdown/txt, rejects bad files, and downloads the latest source without formatting', async ({ page }) => {
  const original = '# 한글 😀\n\n  줄바꿈  \n\n```text\n<a> & "quoted"\n```\n';
  for (const name of ['README.MD', 'README.MARKDOWN', 'README.TXT']) {
    await page.getByLabel('Markdown 파일 선택', { exact: true }).setInputFiles(file(name, '\uFEFF' + original));
    await expect(preview(page).getByRole('heading', { name: '한글 😀', exact: true })).toBeVisible();
  }
  for (const bad of [file('invalid.csv', 'bad'), file('broken.md', new Uint8Array([0xff, 0xfe])), file('too-big.md', new Uint8Array(10 * 1024 * 1024 + 1))]) {
    await page.getByLabel('Markdown 파일 선택', { exact: true }).setInputFiles(bad);
    await expect(page.locator('.notice')).toBeVisible();
    await expect(input(page)).toContainText('한글');
  }
  const edited = original + '\n최신 원문';
  await input(page).fill(edited);
  const pending = page.waitForEvent('download'); await download(page).click();
  const saved = await pending;
  expect(saved.suggestedFilename()).toBe('README.md');
  const stream = await saved.createReadStream(); const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks).toString()).toBe(edited);
  await page.getByRole('button', { name: '초기화', exact: true }).click();
  await input(page).fill('# 새 문서');
  const unnamed = page.waitForEvent('download'); await download(page).click();
  expect((await unnamed).suggestedFilename()).toBe('document.md');
});

test('copies the latest source and reveals/selects source when clipboard access is denied', async ({ page }) => {
  await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (text: string) => { (window as unknown as { copied: string }).copied = text; } }, configurable: true }); });
  await input(page).fill('# 복사 **원문**');
  await page.getByRole('button', { name: '미리보기 확대', exact: true }).click();
  await expect(input(page)).toBeHidden();
  await page.getByRole('button', { name: '원문 복사', exact: true }).click();
  expect(await page.evaluate(() => (window as unknown as { copied: string }).copied)).toBe('# 복사 **원문**');
  await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('denied')) }, configurable: true }); });
  await page.getByRole('button', { name: '원문 복사', exact: true }).click();
  await expect(input(page)).toBeVisible();
  await expect(input(page)).toBeFocused();
  await expect(page.locator('.notice')).toContainText('복사 권한이 없습니다');
  expect(await input(page).evaluate(element => element.ownerDocument.getSelection()?.toString())).toBe('# 복사 **원문**');
});

test('file drops, replacement undo, search and reset preserve normal editor behavior', async ({ page }) => {
  await input(page).fill('# 기존 문서');
  await page.getByRole('region', { name: '입력 영역', exact: true }).evaluate(element => {
    const dataTransfer = new DataTransfer(); dataTransfer.items.add(new File(['# 드롭 문서'], 'drop.md'));
    element.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
  });
  await expect(preview(page).getByRole('heading', { name: '드롭 문서', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '입력 실행 취소', exact: true }).click();
  await expect(input(page)).toHaveText('# 기존 문서');
  await page.getByRole('button', { name: '입력 다시 실행', exact: true }).click();
  await expect(input(page)).toHaveText('# 드롭 문서');
  await page.getByRole('button', { name: '입력 검색', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '검색', exact: true })).toBeVisible();
  await input(page).focus(); await input(page).press('Escape');
  await page.getByRole('region', { name: '입력 영역', exact: true }).evaluate(element => {
    const dataTransfer = new DataTransfer(); dataTransfer.items.add(new File(['# a'], 'a.md')); dataTransfer.items.add(new File(['# b'], 'b.md'));
    element.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
  });
  await expect(page.locator('.notice')).toContainText('파일은 한 번에 하나씩');
  await expect(input(page)).toHaveText('# 드롭 문서');
  await input(page).evaluate(element => {
    const clipboardData = new DataTransfer(); clipboardData.setData('text/plain', 'a'.repeat(10 * 1024 * 1024 + 1));
    element.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData }));
  });
  await expect(page.locator('.notice')).toContainText('10 MiB');
  await expect(input(page)).toHaveText('# 드롭 문서');
  await page.getByRole('button', { name: '초기화', exact: true }).click();
  await input(page).press('ControlOrMeta+z');
  await expect(input(page)).toBeEmpty();
  await page.getByLabel('Markdown 파일 선택', { exact: true }).setInputFiles(file('empty.md', ''));
  await expect(input(page)).toBeEmpty();
  await expect(download(page)).toBeDisabled();
});

for (const csp of [false, true]) test(`does not execute HTML or request images/resources; filters links (deployment CSP: ${csp})`, async ({ page }) => {
  if (csp) {
    const policy = readFileSync('deploy/nginx.conf', 'utf8').match(/Content-Security-Policy "([^"]+)"/)![1];
    await page.route('**/*', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, headers: { ...response.headers(), 'Content-Security-Policy': policy } });
    });
    await page.reload(); await openMarkdown(page);
  }
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  const payload = '# 보안 검사\n\n<script>window.markdownExecuted=true</script>\n\n<img src="https://example.invalid/html.png" onerror="window.markdownExecuted=true">\n\n<iframe src="https://example.invalid/frame"></iframe>\n\n<style>body{background:url(https://example.invalid/css)}</style>\n\n![외부 이미지](https://example.invalid/track.png)\n![상대 이미지](./private.png)\n![SVG](data:image/svg+xml;base64,PHN2Zy8+)\n\n[실행](javascript:alert(1)) [엔티티](java&#x09;script:alert(1)) [로컬](/admin/logout) [프로토콜](//example.invalid) [정상](https://example.org/)\n';
  await input(page).fill(payload);
  await expect(preview(page).getByRole('heading', { name: '보안 검사', exact: true })).toBeVisible();
  await expect(preview(page).locator('script,img,iframe,style,object,form')).toHaveCount(0);
  await expect(preview(page).locator('.markdown-image')).toHaveCount(3);
  await expect(preview(page).getByRole('link')).toHaveCount(1);
  await expect(preview(page).getByRole('link', { name: '정상', exact: true })).toHaveAttribute('href', 'https://example.org/');
  await expect(preview(page).getByRole('link')).toHaveAttribute('target', '_blank');
  await expect(preview(page).getByRole('link')).toHaveAttribute('rel', 'noopener noreferrer');
  expect(await page.evaluate(() => (window as unknown as { markdownExecuted?: boolean }).markdownExecuted)).toBeUndefined();
  expect(requests).toEqual([]);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
});

test('preview limits and excessive DOM/depth preserve source actions and recover after editing', async ({ page }) => {
  await input(page).fill('# 작은 문서');
  await expect(preview(page).locator('h1')).toHaveText('작은 문서');
  await input(page).fill('a'.repeat(256 * 1024 + 1));
  await expect(preview(page)).toContainText('256 KiB');
  await expect(preview(page).locator('h1')).toHaveCount(0);
  await expect(download(page)).toBeEnabled();
  await expect(page.getByRole('button', { name: '원문 복사', exact: true })).toBeEnabled();
  await input(page).fill('a\n'.repeat(4000));
  await expect(preview(page)).toContainText('4,000행');
  await input(page).fill('| a | b |\n| - | - |\n' + '| x | y |\n'.repeat(1000));
  await expect(preview(page)).toContainText('요소 수 또는 중첩 한도');
  await expect(page.locator('.status-error')).toContainText('미리보기를 표시할 수 없습니다');
  await expect(download(page)).toBeEnabled();
  await input(page).fill('> '.repeat(70) + '깊은 인용문');
  await expect(preview(page)).toContainText('요소 수 또는 중첩 한도');
  await input(page).fill('# 복구');
  await expect(preview(page).locator('h1')).toHaveText('복구');
  await expect(page.locator('.status-success')).toContainText('미리보기 완료');
});

test('late file reads and debounce never restore text after edits, reset or tab changes', async ({ page }) => {
  await page.evaluate(() => {
    const original = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = async function() {
      if (this.name === 'slow.md') await new Promise(resolve => setTimeout(resolve, 700));
      return original.call(this);
    };
  });
  await page.getByLabel('Markdown 파일 선택', { exact: true }).setInputFiles(file('slow.md', '# 이전'));
  await input(page).fill('# 최신');
  await expect(preview(page).locator('h1')).toHaveText('최신');
  await page.waitForTimeout(800); await expect(input(page)).toHaveText('# 최신');
  await page.getByLabel('Markdown 파일 선택', { exact: true }).setInputFiles(file('slow.md', '# 이전'));
  await page.getByLabel('Markdown 파일 선택', { exact: true }).setInputFiles(file('fast.md', '# 빠른 문서'));
  await page.waitForTimeout(800); await expect(input(page)).toHaveText('# 빠른 문서');
  await page.getByLabel('Markdown 파일 선택', { exact: true }).setInputFiles(file('slow.md', '# 이전'));
  await page.getByRole('button', { name: '초기화', exact: true }).click();
  await page.waitForTimeout(800); await expect(input(page)).toBeEmpty();
  await input(page).fill('# 보류');
  await page.getByRole('button', { name: 'JSON', exact: true }).click();
  await openMarkdown(page);
  await expect(input(page)).toBeEmpty(); await expect(preview(page).locator('h1')).toHaveCount(0);
  await page.reload(); await openMarkdown(page);
  await expect(input(page)).toBeEmpty();
});

test('preview expansion, keyboard resize and mobile layout fit long tables/code', async ({ page }, testInfo) => {
  await page.getByRole('separator').focus(); await page.getByRole('separator').press('ArrowRight');
  await expect(page.getByRole('separator')).toHaveAttribute('aria-valuenow', '52');
  await page.setViewportSize({ width: 390, height: 844 });
  const text = '# 모바일\n\n| a | b | c | d | e | f |\n| - | - | - | - | - | - |\n| 긴내용 | 긴내용 | 긴내용 | 긴내용 | 긴내용 | 긴내용 |\n\n```text\n' + 'long_code_'.repeat(80) + '\n```';
  await input(page).fill(text);
  await expect(preview(page).locator('h1')).toHaveText('모바일');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('markdown-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: '미리보기 확대', exact: true }).click();
  await expect(input(page)).toBeHidden();
  await expect(preview(page)).toBeVisible();
  await expect(download(page)).toBeVisible();
  await page.getByRole('button', { name: '원문 함께 보기', exact: true }).click();
  await expect(input(page)).toBeVisible();
  const pending = page.waitForEvent('download'); await download(page).click();
  const saved = await pending;
  const stream = await saved.createReadStream(); const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks).toString()).toBe(text);
});

test('near-limit code preview completes and remains editable', async ({ page }, testInfo) => {
  const text = '```text\n' + 'x'.repeat(250 * 1024) + '\n```';
  const started = performance.now();
  await input(page).fill(text);
  await expect(preview(page).locator('pre code')).toHaveText('x'.repeat(250 * 1024) + '\n', { timeout: 5000 });
  await testInfo.attach('markdown-250KiB-preview-ms', { body: String((performance.now() - started).toFixed(1)), contentType: 'text/plain' });
  await input(page).fill('# 다음 문서');
  await expect(preview(page).locator('h1')).toHaveText('다음 문서');
});
