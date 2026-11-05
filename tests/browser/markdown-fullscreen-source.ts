import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

// CodeMirror renders only visible lines. Compare the complete source bytes instead.
export async function expectMarkdownSource(page: Page, text: string) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '다운로드', exact: true }).click();
  const saved = await pending;
  const stream = await saved.createReadStream();
  expect(stream).not.toBeNull();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks).toString('utf8')).toBe(text);
}

// Exercise the editor's copy handler to read its selection, including offscreen lines.
export function selectedMarkdownSource(page: Page) {
  return page.getByRole('textbox', { name: 'Markdown 입력', exact: true }).evaluate(element => {
    const clipboardData = new DataTransfer();
    element.dispatchEvent(new ClipboardEvent('copy', { clipboardData, bubbles: true, cancelable: true }));
    return clipboardData.getData('text/plain');
  });
}
