import { test, expect } from '@playwright/test';
import { expectMarkdownSource, selectedMarkdownSource } from './markdown-fullscreen-source.ts';

for (const action of ['view', 'copy']) {
  test('late fullscreen entry is cancelled after source request: ' + action, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const text = '# 지연된 전체화면\n\n**원문**  \n';
    const button = (name: string) => page.getByRole('button', { name, exact: true });
    const input = page.getByRole('textbox', { name: 'Markdown 입력', exact: true });
    const panel = page.getByRole('region', { name: '미리보기 영역', exact: true });
    await page.goto('./');
    await button('Markdown').click();
    await input.fill(text);
    await expect(page.getByRole('heading', { name: '지연된 전체화면', exact: true })).toBeVisible();
    await button('미리보기 확대').click();
    await panel.evaluate(element => {
      const nativeRequest = element.requestFullscreen.bind(element);
      const nativeExit = document.exitFullscreen.bind(document);
      element.setAttribute('data-exit-requests', '0');
      Object.defineProperty(document, 'exitFullscreen', {
        configurable: true,
        value: () => {
          element.setAttribute('data-exit-requests', String(Number(element.getAttribute('data-exit-requests')) + 1));
          return nativeExit();
        },
      });
      Object.defineProperty(element, 'requestFullscreen', {
        configurable: true,
        value: () => new Promise<void>((resolve, reject) => {
          const finish = document.createElement('button');
          finish.textContent = '지연 요청 완료';
          finish.addEventListener('click', () => {
            // A fresh user gesture completes the delayed request with the real API.
            void nativeRequest().then(() => {
              element.setAttribute('data-entry-finished', 'true');
              resolve();
            }, reject);
            finish.remove();
          }, { once: true });
          document.body.append(finish);
        }),
      });
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: () => Promise.reject(new Error('denied')) },
      });
    });

    await button('미리보기 전체화면').click();
    await expect(button('지연 요청 완료')).toBeVisible();
    expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
    if (action === 'view') {
      await button('원문 함께 보기').click();
      await expect(input).toBeVisible();
    } else {
      await button('원문 복사').click();
    }
    await button('지연 요청 완료').click();
    await expect(panel).toHaveAttribute('data-entry-finished', 'true');
    await expect(panel).toHaveAttribute('data-exit-requests', '1');
    await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
    await expect(input).toBeVisible();
    await expect(button('미리보기 확대')).toHaveAttribute('aria-pressed', 'false');
    await expect(button('전체화면 종료')).toHaveCount(0);
    await expect(button('미리보기 전체화면')).toHaveCount(0);
    if (action === 'copy') {
      await expect(input).toBeFocused();
      expect(await selectedMarkdownSource(page)).toBe(text);
      await expect(page.locator('.feedback .notice')).toContainText('복사 권한이 없습니다');
    }
    await expectMarkdownSource(page, text);
    expect(errors).toEqual([]);
  });
}
