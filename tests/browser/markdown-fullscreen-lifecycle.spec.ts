import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { expectMarkdownSource } from './markdown-fullscreen-source.ts';

const text = '# 전체화면 수명\n\n**원문**  \n';
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const input = (page: Page) => page.getByRole('textbox', { name: 'Markdown 입력', exact: true });
const panel = (page: Page) => page.getByRole('region', { name: '미리보기 영역', exact: true });
const ownsFullscreen = (page: Page) => panel(page).evaluate(element => document.fullscreenElement === element);
const errors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const seen: string[] = [];
  errors.set(page, seen);
  page.on('pageerror', error => seen.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('./');
  await button(page, 'Markdown').click();
  await page.getByLabel('Markdown 파일 선택', { exact: true }).setInputFiles({
    name: 'lifecycle.md', mimeType: 'text/markdown', buffer: Buffer.from(text),
  });
  await expect(page.getByRole('heading', { name: '전체화면 수명', exact: true })).toBeVisible();
});

test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
});

test('external fullscreen exit synchronizes the icon, focus and preserved expanded view', async ({ page }) => {
  await page.getByRole('separator').press('ArrowRight');
  await button(page, '미리보기 확대').click();
  await button(page, '미리보기 전체화면').click();
  await expect.poll(() => ownsFullscreen(page)).toBe(true);
  await expect(button(page, '전체화면 종료')).toBeVisible();

  // Independently exercise fullscreenchange; the separate Escape tests remain in place.
  await page.evaluate(() => document.exitFullscreen());
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  await expect(button(page, '전체화면 종료')).toHaveCount(0);
  await expect(button(page, '미리보기 전체화면')).toBeFocused();
  await expect(button(page, '원문 함께 보기')).toHaveAttribute('aria-pressed', 'true');
  await expect(input(page)).toBeHidden();
  await expectMarkdownSource(page, text);

  await button(page, '원문 함께 보기').click();
  await expect(input(page)).toBeVisible();
  await expect(page.locator('.file-name')).toHaveText('lifecycle.md');
  await expect(page.getByRole('separator')).toHaveAttribute('aria-valuenow', '52');
  await expect(button(page, '미리보기 전체화면')).toHaveCount(0);
});

test('cancelled late entry retains a usable exit when automatic exit is rejected', async ({ page }) => {
  await page.getByRole('separator').press('ArrowRight');
  await button(page, '미리보기 확대').click();
  await panel(page).evaluate(element => {
    const nativeRequest = element.requestFullscreen.bind(element);
    Object.defineProperty(element, 'requestFullscreen', {
      configurable: true,
      value: () => new Promise<void>((resolve, reject) => {
        const finish = document.createElement('button');
        finish.textContent = '수명 테스트 진입 완료';
        finish.addEventListener('click', () => {
          // Preserve real fullscreen entry and the required user activation.
          void nativeRequest().then(resolve, reject);
          finish.remove();
        }, { once: true });
        document.body.append(finish);
      }),
    });
    Object.defineProperty(document, 'exitFullscreen', {
      configurable: true,
      value: () => Promise.reject(new DOMException('Exit denied', 'NotAllowedError')),
    });
  });

  await button(page, '미리보기 전체화면').click();
  await expect(button(page, '수명 테스트 진입 완료')).toBeVisible();
  expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
  await button(page, '원문 함께 보기').click();
  await expect(input(page)).toBeVisible();
  await button(page, '수명 테스트 진입 완료').click();

  await expect.poll(() => ownsFullscreen(page)).toBe(true);
  await expect(panel(page).getByRole('status')).toContainText('전체화면을 종료하지 못했습니다');
  await expect(panel(page).getByRole('status')).toBeVisible();
  const exit = button(page, '전체화면 종료');
  await expect(exit).toBeVisible();
  await expect(exit).toBeEnabled();
  await expect(exit).toHaveAttribute('title', '전체화면 종료');
  expect(await exit.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return rect.top >= 0 && rect.left >= 0 && rect.bottom <= innerHeight && rect.right <= innerWidth;
  })).toBe(true);

  await page.evaluate(() => { Reflect.deleteProperty(document, 'exitFullscreen'); });
  await exit.click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  await expect(input(page)).toBeVisible();
  await expect(button(page, '미리보기 확대')).toHaveAttribute('aria-pressed', 'false');
  await expect(button(page, '전체화면 종료')).toHaveCount(0);
  await expect(button(page, '미리보기 전체화면')).toHaveCount(0);
  await expect(page.locator('.file-name')).toHaveText('lifecycle.md');
  await expect(page.getByRole('separator')).toHaveAttribute('aria-valuenow', '52');
  await expectMarkdownSource(page, text);
});

test('unmount releases owned fullscreen and both document subscriptions before remount', async ({ page }) => {
  await button(page, 'JSON').click();
  await page.evaluate(() => {
    const tracked = new Map<string, Set<EventListenerOrEventListenerObject>>([
      ['fullscreenchange', new Set()], ['keydown', new Set()],
    ]);
    const publish = () => {
      for (const [type, listeners] of tracked) {
        document.documentElement.setAttribute('data-lifecycle-' + type, String(listeners.size));
      }
    };
    const nativeAdd = document.addEventListener.bind(document);
    const nativeRemove = document.removeEventListener.bind(document);
    document.addEventListener = function(type, callback, options) {
      if (callback) tracked.get(type)?.add(callback);
      publish();
      return nativeAdd(type, callback, options);
    };
    document.removeEventListener = function(type, callback, options) {
      if (callback) tracked.get(type)?.delete(callback);
      publish();
      return nativeRemove(type, callback, options);
    };
    publish();
  });
  await button(page, 'Markdown').click();
  await input(page).fill(text);
  await button(page, '미리보기 확대').click();
  const navigation = await button(page, 'JSON').elementHandle();
  expect(navigation).not.toBeNull();
  await expect.poll(async () => Number(await page.locator('html').getAttribute('data-lifecycle-fullscreenchange'))).toBeGreaterThan(0);
  await expect.poll(async () => Number(await page.locator('html').getAttribute('data-lifecycle-keydown'))).toBeGreaterThan(0);
  await button(page, '미리보기 전체화면').click();
  await expect.poll(() => ownsFullscreen(page)).toBe(true);

  // Host navigation is possible even while the app navigation lies outside fullscreen.
  await navigation!.evaluate(element => (element as HTMLButtonElement).click());
  await expect(input(page)).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  await expect(page.locator('html')).toHaveAttribute('data-lifecycle-fullscreenchange', '0');
  await expect(page.locator('html')).toHaveAttribute('data-lifecycle-keydown', '0');

  await button(page, 'Markdown').click();
  await expect(input(page)).toBeEmpty();
  await expect(button(page, '미리보기 전체화면')).toHaveCount(0);
  await button(page, '미리보기 확대').click();
  await button(page, '미리보기 전체화면').click();
  await expect.poll(() => ownsFullscreen(page)).toBe(true);
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  await expect(button(page, '미리보기 전체화면')).toBeFocused();
});
