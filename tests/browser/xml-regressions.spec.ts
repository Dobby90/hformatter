import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

const input = (page: Page) => page.getByRole('textbox', { name: 'XML 입력', exact: true });
const output = (page: Page) => page.getByRole('textbox', { name: 'XML 결과', exact: true });
const save = (page: Page) => page.getByRole('button', { name: '다운로드', exact: true });

async function enterXml(page: Page) {
  await page.goto('./');
  await page.getByRole('button', { name: 'XML', exact: true }).click();
  await expect(input(page)).toBeVisible();
}

test('long unfinished XML tags allow editing, reset and a successful retry', async ({ page }) => {
  await enterXml(page);
  for (const source of ['<' + 'a'.repeat(100_000), '<r note="' + 'a'.repeat(100_000)]) {
    await input(page).fill(source);
    await input(page).press('ControlOrMeta+End');
    await page.keyboard.insertText(' ');
    await page.getByRole('button', { name: '초기화', exact: true }).click({ timeout: 5000 });
    await expect(input(page)).toBeEmpty();
    await expect(output(page)).toBeEmpty();
    await input(page).fill('<recovered><leaf/></recovered>');
    await input(page).press('ControlOrMeta+Enter');
    await expect(save(page)).toBeEnabled();
    await expect(output(page).locator('.cm-line')).toHaveText(['<recovered>', '  <leaf/>', '</recovered>']);
  }
});

test('returning from a still-loading Markdown tab discards XML state immediately', async ({ page }) => {
  await enterXml(page);
  await page.getByLabel('XML 파일 선택', { exact: true }).setInputFiles({
    name: 'previous.xml', mimeType: 'application/xml', buffer: Buffer.from('<previous/>'),
  });
  await expect(input(page)).toHaveText('<previous/>');
  await input(page).press('ControlOrMeta+Enter');
  await expect(save(page)).toBeEnabled();

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
    await expect(page.locator('.file-name')).not.toContainText('previous.xml');
    await expect(save(page)).toBeDisabled();
    await expect(page.getByRole('button', { name: '복사', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: '입력 실행 취소', exact: true }).click();
    await expect(input(page)).toBeEmpty();
  } finally {
    release();
    await page.unrouteAll({ behavior: 'wait' });
  }
  await expect(input(page)).toBeEmpty();
  await input(page).fill('<fresh/>');
  await input(page).press('ControlOrMeta+Enter');
  await expect(save(page)).toBeEnabled();
  await expect(output(page)).toHaveText('<fresh/>');
});
