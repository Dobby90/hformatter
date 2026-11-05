import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

const input = (page: Page) => page.getByRole('textbox', { name: 'Markdown 입력', exact: true });
const panel = (page: Page) => page.getByRole('region', { name: '미리보기 영역', exact: true });
const enter = (page: Page) => page.getByRole('button', { name: '미리보기 전체화면', exact: true });
const exit = (page: Page) => page.getByRole('button', { name: '전체화면 종료', exact: true });
const article = (page: Page) => page.getByRole('article', { name: 'Markdown 미리보기', exact: true });
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const isFullscreen = (page: Page) => panel(page).evaluate(element => document.fullscreenElement === element);
const errors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const seen: string[] = [];
  errors.set(page, seen);
  page.on('pageerror', error => seen.push(error.message));
  await page.goto('./');
  await button(page, 'Markdown').click();
  await expect(input(page)).toBeVisible();
});

test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
});

test('only expanded preview offers fullscreen; button and Escape restore document and split', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(enter(page)).toHaveCount(0);
  await page.getByLabel('Markdown 파일 선택', { exact: true }).setInputFiles({
    name: 'fullscreen.md', mimeType: 'text/markdown', buffer: Buffer.from('# 문서'),
  });
  await expect(input(page)).toHaveText('# 문서');
  const text = '# 문서\n\n최신 **원문**';
  await input(page).fill(text);
  await expect(article(page).locator('h1')).toHaveText('문서');
  await page.getByRole('separator').press('ArrowRight');
  await expect(page.getByRole('separator')).toHaveAttribute('aria-valuenow', '52');
  await button(page, '미리보기 확대').click();
  await expect(enter(page)).toHaveAttribute('title', '미리보기 전체화면');

  for (const escape of [false, true]) {
    await enter(page).click();
    await expect.poll(() => isFullscreen(page)).toBe(true);
    await expect(exit(page)).toBeVisible();
    await expect(exit(page)).toHaveAttribute('title', '전체화면 종료');
    await expect(article(page).locator('h1')).toBeVisible();
    expect(await panel(page).evaluate(element =>
      !element.contains(document.querySelector('.toolbox')) &&
      !element.contains(document.querySelector('.input-pane')))).toBe(true);
    if (escape) await page.keyboard.press('Escape');
    else await exit(page).click();
    await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
    await expect(enter(page)).toBeFocused();
    await expect(input(page)).toBeHidden();
    await expect(button(page, '원문 함께 보기')).toHaveAttribute('aria-pressed', 'true');
  }

  await button(page, '원문 함께 보기').click();
  await expect(input(page)).toHaveText(text);
  await expect(page.locator('.file-name')).toHaveText('fullscreen.md');
  await expect(page.getByRole('separator')).toHaveAttribute('aria-valuenow', '52');
  await expect(enter(page)).toHaveCount(0);
});

test('Enter and Space control fullscreen with visible keyboard focus', async ({ page }) => {
  await input(page).fill('# 키보드');
  await button(page, '미리보기 확대').click();
  await enter(page).focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  for (const key of ['Enter', 'Space']) {
    await enter(page).focus();
    expect(await enter(page).evaluate(element => element.matches(':focus-visible') &&
      getComputedStyle(element).outlineStyle !== 'none')).toBe(true);
    await enter(page).press(key);
    await expect.poll(() => isFullscreen(page)).toBe(true);
    await exit(page).focus();
    await exit(page).press(key);
    await expect.poll(() => isFullscreen(page)).toBe(false);
    await expect(enter(page)).toBeFocused();
  }
});

for (const reason of ['unsupported', 'disallowed']) {
  test('explains disabled fullscreen: ' + reason, async ({ page }) => {
    await page.evaluate(reason => {
      if (reason === 'unsupported') Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', { value: undefined, configurable: true });
      else Object.defineProperty(document, 'fullscreenEnabled', { value: false, configurable: true });
    }, reason);
    await button(page, 'JSON').click();
    await button(page, 'Markdown').click();
    await button(page, '미리보기 확대').click();
    await expect(enter(page)).toBeDisabled();
    const explanation = reason === 'unsupported' ? '이 브라우저는 전체화면을 지원하지 않습니다.' : '이 환경에서는 전체화면이 허용되지 않습니다.';
    await expect(enter(page)).toHaveAttribute('title', explanation);
    await expect(enter(page)).toHaveAccessibleDescription(explanation);
    await expect(panel(page).locator('.notice')).toHaveText(explanation);
  });
}

test('failed entry and exit show Korean notices and permit retry without lying about state', async ({ page }) => {
  await input(page).fill('# 재시도');
  await button(page, '미리보기 확대').click();
  await panel(page).evaluate(element => {
    Object.defineProperty(element, 'requestFullscreen', { value: () => Promise.reject(new Error('denied')), configurable: true });
  });
  await enter(page).click();
  await expect.poll(() => isFullscreen(page)).toBe(false);
  await expect(enter(page)).toBeEnabled();
  await expect(page.locator('.feedback .notice')).toContainText('전체화면을 시작하지 못했습니다');
  await panel(page).evaluate(element => { Reflect.deleteProperty(element, 'requestFullscreen'); });
  await enter(page).click();
  await expect.poll(() => isFullscreen(page)).toBe(true);
  await page.evaluate(() => {
    Object.defineProperty(document, 'exitFullscreen', { value: () => Promise.reject(new Error('denied')), configurable: true });
  });
  await exit(page).click();
  await expect(panel(page).getByRole('status')).toContainText('전체화면을 종료하지 못했습니다');
  await expect.poll(() => isFullscreen(page)).toBe(true);
  await expect(exit(page)).toBeEnabled();
  await page.evaluate(() => { Reflect.deleteProperty(document, 'exitFullscreen'); });
  await exit(page).click();
  await expect.poll(() => isFullscreen(page)).toBe(false);
});

test('fullscreen copy and download use source; denied copy exits and selects source', async ({ page }) => {
  const text = '# 원문\n\n**그대로**  \n';
  await page.getByLabel('Markdown 파일 선택', { exact: true }).setInputFiles({
    name: 'source.md', mimeType: 'text/markdown', buffer: Buffer.from(text),
  });
  await expect(input(page)).toHaveText(text);
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { value: {
      writeText: async (text: string) => { document.documentElement.dataset.copied = text; },
    }, configurable: true });
  });
  await button(page, '미리보기 확대').click();
  await enter(page).click();
  await expect.poll(() => isFullscreen(page)).toBe(true);
  await button(page, '원문 복사').click();
  expect(await page.evaluate(() => document.documentElement.dataset.copied)).toBe(text);
  await expect(panel(page).getByRole('status')).toHaveText('원문을 복사했습니다.');
  const pending = page.waitForEvent('download');
  await button(page, '다운로드').click();
  const saved = await pending;
  expect(saved.suggestedFilename()).toBe('source.md');
  const stream = await saved.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks).toString()).toBe(text);
  await expect.poll(() => isFullscreen(page)).toBe(true);
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { value: {
      writeText: () => Promise.reject(new Error('denied')),
    }, configurable: true });
  });
  await button(page, '원문 복사').click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  await expect(input(page)).toBeVisible();
  await expect(input(page)).toBeFocused();
  expect(await input(page).evaluate(element => element.ownerDocument.getSelection()?.toString())).toBe(text);
  await expect(page.locator('.feedback .notice')).toContainText('복사 권한이 없습니다');
});

for (const size of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test('fullscreen fills screen and keeps header accessible with long content at ' + size.width, async ({ page }) => {
    await page.setViewportSize(size);
    const table = '| ' + Array.from({ length: 24 }, (_, index) => '열' + index).join(' | ') + ' |\n'
      + '| ' + Array(24).fill('---').join(' | ') + ' |\n'
      + '| ' + Array(24).fill('긴내용').join(' | ') + ' |';
    const text = '# 긴 문서\n\n' + table + '\n\n~~~text\n'
      + 'long_code_'.repeat(80) + '\n~~~\n\n' + '문단\n\n'.repeat(120);
    await input(page).fill(text);
    await expect(article(page).locator('h1')).toHaveText('긴 문서');
    await button(page, '미리보기 확대').click();
    await enter(page).click();
    await expect.poll(() => isFullscreen(page)).toBe(true);
    expect(await panel(page).evaluate(element => {
      const rect = element.getBoundingClientRect();
      return Math.abs(rect.width - innerWidth) <= 1 && Math.abs(rect.height - innerHeight) <= 1 &&
        Math.abs(rect.top) <= 1 && Math.abs(rect.left) <= 1;
    })).toBe(true);
    for (const selector of ['pre', '.markdown-table']) {
      expect(await article(page).locator(selector).evaluate(element => {
        element.scrollLeft = element.scrollWidth;
        return element.scrollWidth > element.clientWidth && element.scrollLeft > 0;
      })).toBe(true);
    }
    expect(await article(page).evaluate(element => {
      element.scrollTop = element.scrollHeight;
      return element.scrollHeight > element.clientHeight;
    })).toBe(true);
    await expect.poll(() => article(page).evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    expect(await exit(page).evaluate(element => {
      const rect = element.getBoundingClientRect();
      return rect.top >= 0 && rect.left >= 0 && rect.bottom <= innerHeight && rect.right <= innerWidth;
    })).toBe(true);
    await exit(page).click();
    await expect.poll(() => isFullscreen(page)).toBe(false);
    await button(page, '원문 함께 보기').click();
    await expect(input(page)).toHaveText(text);
  });
}

test('unmount during entry removes subscription and safely handles late rejection', async ({ page }) => {
  await button(page, '미리보기 확대').click();
  await page.evaluate(() => {
    const originalAdd = document.addEventListener.bind(document);
    const originalRemove = document.removeEventListener.bind(document);
    const listeners = new Set<EventListenerOrEventListenerObject>();
    document.addEventListener = function(type, callback, options) {
      if (type === 'fullscreenchange' && callback) listeners.add(callback);
      return originalAdd(type, callback, options);
    };
    document.removeEventListener = function(type, callback, options) {
      if (type === 'fullscreenchange' && callback) listeners.delete(callback);
      document.documentElement.dataset.fullscreenListeners = String(listeners.size);
      return originalRemove(type, callback, options);
    };
  });
  await button(page, 'JSON').click();
  await button(page, 'Markdown').click();
  await button(page, '미리보기 확대').click();
  await panel(page).evaluate(element => {
    Object.defineProperty(element, 'requestFullscreen', { value: () => new Promise<void>((_resolve, reject) => {
      (window as unknown as { rejectFullscreen: () => void }).rejectFullscreen = () => reject(new Error('late denial'));
    }) });
  });
  await enter(page).click();
  await button(page, 'JSON').click();
  await expect(page.locator('html')).toHaveAttribute('data-fullscreen-listeners', '0');
  await page.evaluate(() => (window as unknown as { rejectFullscreen: () => void }).rejectFullscreen());
  await button(page, 'Markdown').click();
  await expect(page.locator('.notice')).toHaveCount(0);
});
