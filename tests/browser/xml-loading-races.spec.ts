import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

const input = (page: Page) => page.getByRole('textbox', { name: 'XML 입력', exact: true });
const output = (page: Page) => page.getByRole('textbox', { name: 'XML 결과', exact: true });
const save = (page: Page) => page.getByRole('button', { name: '다운로드', exact: true });
const open = (page: Page) => page.getByLabel('XML 파일 선택', { exact: true });
const file = (name: string, text: string) => ({
  name, mimeType: 'application/xml', buffer: Buffer.from(text),
});
type ReadHarness = { started: boolean; finishRead: () => Promise<void> };

for (const fails of [false, true]) {
  test('pending XML import cannot survive a loading Markdown round trip; read fails=' + fails, async ({ page }) => {
    await page.goto('./');
    await page.getByRole('button', { name: 'XML', exact: true }).click();
    await open(page).setInputFiles(file('previous.xml', '<previous/>'));
    await expect(input(page)).toHaveText('<previous/>');
    await input(page).press('ControlOrMeta+Enter');
    await expect(save(page)).toBeEnabled();

    await page.evaluate(failRead => {
      const original = File.prototype.arrayBuffer;
      const state = window as unknown as ReadHarness;
      state.started = false;
      File.prototype.arrayBuffer = function() {
        if (this.name !== 'pending.xml') return original.call(this);
        state.started = true;
        return new Promise<ArrayBuffer>((resolve, reject) => {
          state.finishRead = async () => {
            if (failRead) reject(new Error('obsolete read failure'));
            else resolve(await original.call(this));
            await new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done())));
          };
        });
      };
    }, fails);
    await open(page).setInputFiles(file('pending.xml', '<obsolete/>'));
    await expect.poll(() => page.evaluate(() => (window as unknown as ReadHarness).started)).toBe(true);

    let requested = false;
    let release!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/MarkdownWorkspace-*.js', async route => {
      requested = true;
      await blocked;
      await route.continue();
    });
    try {
      await page.getByRole('button', { name: 'Markdown', exact: true }).click();
      await expect.poll(() => requested).toBe(true);
      await expect(page.getByRole('status').filter({ hasText: 'Markdown 화면을 불러오는 중…' })).toBeVisible();
      await page.getByRole('button', { name: 'XML', exact: true }).click();
      await expect(input(page)).toBeEmpty();
      await expect(output(page)).toBeEmpty();
      await expect(page.locator('.file-name')).toHaveText('원본 XML');
      await expect(save(page)).toBeDisabled();

      await open(page).setInputFiles(file('current.xml', '<current><leaf/></current>'));
      await expect(input(page)).toHaveText('<current><leaf/></current>');
      await input(page).press('ControlOrMeta+Enter');
      await expect(save(page)).toBeEnabled();
      await page.evaluate(() => (window as unknown as ReadHarness).finishRead());
      await expect(input(page)).toHaveText('<current><leaf/></current>');
      await expect(output(page).locator('.cm-line')).toHaveText(['<current>', '  <leaf/>', '</current>']);
      await expect(page.locator('.file-name')).toHaveText('current.xml');
      await expect(page.locator('.notice')).toHaveCount(0);
      await expect(page.locator('.status-success')).toBeVisible();
      await expect(save(page)).toBeEnabled();
      await expect(page.getByRole('button', { name: '복사', exact: true })).toBeEnabled();
    } finally {
      release();
      await page.unrouteAll({ behavior: 'wait' });
    }
    await expect(input(page)).toHaveText('<current><leaf/></current>');
    await expect(output(page).locator('.cm-line')).toHaveText(['<current>', '  <leaf/>', '</current>']);
    await expect(save(page)).toBeEnabled();
  });
}
