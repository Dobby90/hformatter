import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const packageVersion = JSON.parse(readFileSync('package.json', 'utf8')).version;
const version = `V${process.env.VITE_APP_VERSION || packageVersion}`;
const noticeText = '입력과 결과는 탭 전환·새로고침 시 사라집니다.';

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
  { width: 320, height: 740 },
]) {
  test(`footer omits creator and preserves notice/version without overlap at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('./');

    for (const tool of ['JSON', 'SQL', 'XML', 'Markdown']) {
      await test.step(`${tool} footer`, async () => {
        await page.getByRole('button', { name: tool, exact: true }).click();
        await expect(page.getByRole('textbox', { name: `${tool} 입력`, exact: true })).toBeVisible();

        const footer = page.getByRole('contentinfo');
        const notice = footer.getByText(noticeText, { exact: true });
        const versionLabel = footer.getByText(version, { exact: true });
        await expect(footer).toHaveCount(1);
        await expect(page.locator('body')).not.toContainText(/created\s+by\s+조홍연/i);
        expect(await page.locator('body').ariaSnapshot()).not.toMatch(/created\s+by\s+조홍연/i);
        await expect(notice).toBeVisible();
        await expect(versionLabel).toBeVisible();
        await expect(versionLabel).toHaveAttribute('aria-label', `버전 ${version}`);

        await footer.scrollIntoViewIfNeeded();
        const footerBox = await footer.boundingBox();
        const noticeBox = await notice.boundingBox();
        const versionBox = await versionLabel.boundingBox();
        expect(footerBox).not.toBeNull();
        expect(noticeBox).not.toBeNull();
        expect(versionBox).not.toBeNull();
        for (const box of [noticeBox!, versionBox!]) {
          expect(box.width).toBeGreaterThan(0);
          expect(box.height).toBeGreaterThan(0);
          expect(box.x).toBeGreaterThanOrEqual(footerBox!.x);
          expect(box.x + box.width).toBeLessThanOrEqual(footerBox!.x + footerBox!.width);
          expect(box.y).toBeGreaterThanOrEqual(footerBox!.y);
          expect(box.y + box.height).toBeLessThanOrEqual(footerBox!.y + footerBox!.height);
        }
        expect(footerBox!.x).toBeGreaterThanOrEqual(0);
        expect(footerBox!.x + footerBox!.width).toBeLessThanOrEqual(viewport.width);
        const separate = noticeBox!.x + noticeBox!.width <= versionBox!.x
          || versionBox!.x + versionBox!.width <= noticeBox!.x
          || noticeBox!.y + noticeBox!.height <= versionBox!.y
          || versionBox!.y + versionBox!.height <= noticeBox!.y;
        expect(separate, `${tool}: footer notice and version must not overlap`).toBe(true);
      });
    }
  });
}
