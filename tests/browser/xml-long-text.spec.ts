import { test, expect } from '@playwright/test';
import type { Locator } from '@playwright/test';

async function readDocument(editor: Locator) {
  await editor.press('ControlOrMeta+a');
  return editor.evaluate(element => {
    const clipboardData = new DataTransfer();
    element.dispatchEvent(new ClipboardEvent('copy', { bubbles: true, cancelable: true, clipboardData }));
    return clipboardData.getData('text/plain');
  });
}

test('near-limit XML text allows formatting, editing, reset and retry', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'XML', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'XML 입력', exact: true });
  const output = page.getByRole('textbox', { name: 'XML 결과', exact: true });
  const save = page.getByRole('button', { name: '다운로드', exact: true });
  const prefix = '<r>';
  const suffix = '&amp;</r>';
  // Leave one byte for an edit; both the reference and closing tag follow a long text run.
  const source = prefix + 'a'.repeat(10 * 1024 * 1024 - prefix.length - suffix.length - 1) + suffix;
  await page.getByLabel('XML 파일 선택', { exact: true }).setInputFiles({
    name: 'long.xml', mimeType: 'application/xml', buffer: Buffer.from(source),
  });
  await expect(page.locator('.file-name')).toHaveText('long.xml');
  await input.press('ControlOrMeta+Enter');
  await expect(save).toBeEnabled();
  expect(await readDocument(output)).toBe(source);

  await input.press('ControlOrMeta+Home');
  for (let i = 0; i < prefix.length; i++) await input.press('ArrowRight');
  await page.keyboard.insertText('b');
  expect(await readDocument(input)).toBe(prefix + 'b' + source.slice(prefix.length));
  await expect(save).toBeDisabled();
  await expect(page.getByRole('button', { name: '복사', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '초기화', exact: true }).click({ timeout: 5000 });
  await expect(input).toBeEmpty();
  await expect(output).toBeEmpty();
  await expect(page.locator('.file-name')).toHaveText('원본 XML');

  await input.fill('<recovered><leaf/></recovered>');
  await input.press('ControlOrMeta+Enter');
  await expect(save).toBeEnabled();
  await expect(output.locator('.cm-line')).toHaveText(['<recovered>', '  <leaf/>', '</recovered>']);
  await expect(page.locator('.notice')).toHaveCount(0);
});
