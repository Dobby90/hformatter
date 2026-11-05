import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

const sourceText = '# 전체화면 경계 조건\n\n**원문 보존**';
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const input = (page: Page) => page.getByRole('textbox', { name: 'Markdown 입력', exact: true });
const panel = (page: Page) => page.getByRole('region', { name: '미리보기 영역', exact: true });
const enter = (page: Page) => button(page, '미리보기 전체화면');
const exit = (page: Page) => button(page, '전체화면 종료');
const ownsFullscreen = (page: Page) => panel(page).evaluate(element => document.fullscreenElement === element);
const pageErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./');
  await button(page, 'Markdown').click();
  await input(page).fill(sourceText);
  await expect(page.getByRole('heading', { name: '전체화면 경계 조건', exact: true })).toBeVisible();
  await button(page, '미리보기 확대').click();
});

test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
});

test('missing exit API disables entry and explains why accessibly', async ({ page }) => {
  await page.evaluate(() => {
    Object.defineProperty(document, 'exitFullscreen', { value: undefined, configurable: true });
  });
  await button(page, 'JSON').click();
  await button(page, 'Markdown').click();
  await button(page, '미리보기 확대').click();

  const reason = '이 브라우저는 전체화면을 지원하지 않습니다.';
  await expect(enter(page)).toBeDisabled();
  await expect(enter(page)).toHaveAccessibleName('미리보기 전체화면');
  await expect(enter(page)).toHaveAttribute('title', reason);
  await expect(enter(page)).toHaveAccessibleDescription(reason);
  await expect(panel(page).locator('.notice')).toHaveText(reason);
  await expect(enter(page).locator('svg')).toHaveAttribute('aria-hidden', 'true');
  await expect(enter(page).locator('svg')).toHaveAttribute('focusable', 'false');
  expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
});

test('pending entry keeps the real state, ignores duplicate clicks and permits retry after denial', async ({ page }) => {
  await panel(page).evaluate(element => {
    element.setAttribute('data-entry-requests', '0');
    Object.defineProperty(element, 'requestFullscreen', {
      configurable: true,
      value: () => {
        element.setAttribute('data-entry-requests', String(Number(element.getAttribute('data-entry-requests')) + 1));
        return new Promise<void>((_resolve, reject) => {
          element.addEventListener('test-fullscreen-denial', () => {
            reject(new DOMException('Fullscreen request denied', 'NotAllowedError'));
          }, { once: true });
        });
      },
    });
  });

  await enter(page).click({ clickCount: 2 });
  await expect(panel(page)).toHaveAttribute('data-entry-requests', '1');
  expect(await ownsFullscreen(page)).toBe(false);
  await expect(enter(page)).toBeVisible();
  await expect(exit(page)).toHaveCount(0);

  await panel(page).evaluate(element => element.dispatchEvent(new Event('test-fullscreen-denial')));
  await expect(page.locator('.feedback .notice')).toContainText('전체화면을 시작하지 못했습니다');
  await expect(enter(page)).toBeEnabled();
  expect(await ownsFullscreen(page)).toBe(false);

  await panel(page).evaluate(element => { Reflect.deleteProperty(element, 'requestFullscreen'); });
  await enter(page).click();
  await expect.poll(() => ownsFullscreen(page)).toBe(true);
  await expect(exit(page)).toBeVisible();
  await exit(page).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  await expect(enter(page)).toBeFocused();
});

test('denied copy with failed fullscreen exit keeps source hidden and offers a recoverable notice inside the panel', async ({ page }) => {
  await enter(page).click();
  await expect.poll(() => ownsFullscreen(page)).toBe(true);
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.reject(new DOMException('Clipboard denied', 'NotAllowedError')) },
    });
    Object.defineProperty(document, 'exitFullscreen', {
      configurable: true,
      value: () => Promise.reject(new DOMException('Exit denied', 'NotAllowedError')),
    });
  });

  await button(page, '원문 복사').click();
  const notice = panel(page).getByRole('status');
  await expect(notice).toHaveText('전체화면을 종료하지 못했습니다. 종료 버튼이나 Escape로 종료한 뒤 원문 복사를 다시 시도해 주세요.');
  await expect(notice).toBeVisible();
  expect(await ownsFullscreen(page)).toBe(true);
  await expect(exit(page)).toBeEnabled();
  await expect(input(page)).toBeHidden();
  await expect(button(page, '원문 함께 보기')).toHaveAttribute('aria-pressed', 'true');

  await page.evaluate(() => { Reflect.deleteProperty(document, 'exitFullscreen'); });
  await button(page, '원문 복사').click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  await expect(input(page)).toBeVisible();
  await expect(input(page)).toHaveText(sourceText);
  await expect(input(page)).toBeFocused();
  expect(await input(page).evaluate(element => element.ownerDocument.getSelection()?.toString())).toBe(sourceText);
  await expect(page.locator('.feedback .notice')).toContainText('복사 권한이 없습니다');
  await expect(enter(page)).toHaveCount(0);
});

test('unmount removes the fullscreen subscription without exiting fullscreen owned by another element', async ({ page }) => {
  const navigation = await button(page, 'JSON').elementHandle();
  expect(navigation).not.toBeNull();
  await page.evaluate(() => {
    const foreign = document.createElement('button');
    foreign.id = 'foreign-fullscreen-test';
    foreign.type = 'button';
    foreign.textContent = '다른 영역 전체화면 테스트';
    foreign.dataset.exitRequests = '0';
    foreign.dataset.fullscreenCleanup = '0';
    foreign.addEventListener('click', () => {
      void foreign.requestFullscreen().catch(error => {
        foreign.dataset.requestError = String(error);
      });
    }, { once: true });
    document.body.append(foreign);

    const nativeExit = document.exitFullscreen.bind(document);
    Object.defineProperty(document, 'exitFullscreen', {
      configurable: true,
      value: () => {
        foreign.dataset.exitRequests = String(Number(foreign.dataset.exitRequests) + 1);
        return nativeExit();
      },
    });
    const nativeRemove = document.removeEventListener.bind(document);
    document.removeEventListener = function(type, callback, options) {
      if (type === 'fullscreenchange') {
        foreign.dataset.fullscreenCleanup = String(Number(foreign.dataset.fullscreenCleanup) + 1);
      }
      return nativeRemove(type, callback, options);
    };
  });

  const foreign = page.locator('#foreign-fullscreen-test');
  await foreign.click();
  await expect.poll(() => foreign.evaluate(element => document.fullscreenElement === element)).toBe(true);
  await expect(foreign).not.toHaveAttribute('data-request-error');

  // Simulate host navigation while the unrelated fullscreen surface owns user input.
  await navigation!.evaluate(element => (element as HTMLButtonElement).click());
  await expect(input(page)).toHaveCount(0);
  await expect(foreign).toHaveAttribute('data-fullscreen-cleanup', '1');
  await expect(foreign).toHaveAttribute('data-exit-requests', '0');
  expect(await foreign.evaluate(element => document.fullscreenElement === element)).toBe(true);

  await page.evaluate(() => document.exitFullscreen());
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  await button(page, 'Markdown').click();
  await expect(input(page)).toBeVisible();
  await expect(input(page)).toBeEmpty();
  await expect(enter(page)).toHaveCount(0);
});
