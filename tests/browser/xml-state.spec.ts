import { test, expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

const input = (page: Page) => page.getByRole('textbox', { name: 'XML 입력', exact: true });
const output = (page: Page) => page.getByRole('textbox', { name: 'XML 결과', exact: true });
const format = (page: Page) => page.getByRole('button', { name: /포매팅 Beautify/ });
const validate = (page: Page) => page.getByRole('button', { name: /문법 검사 Validate/ });
const copy = (page: Page) => page.getByRole('button', { name: '복사', exact: true });
const save = (page: Page) => page.getByRole('button', { name: '다운로드', exact: true });
const open = (page: Page) => page.getByLabel('XML 파일 선택', { exact: true });
const file = (name: string, body: string) => ({ name, mimeType: 'text/plain', buffer: Buffer.from(body) });
const lines = (editor: Locator) => editor.locator('.cm-line').allTextContents();

async function selectXml(page: Page) {
  await page.getByRole('button', { name: 'XML', exact: true }).click();
  await expect(input(page)).toBeVisible();
}

async function expectOldResult(page: Page, expected: string) {
  await expect(page.getByText('이전 결과 · 재실행 필요', { exact: true })).toBeVisible();
  await expect(copy(page)).toBeDisabled();
  await expect(save(page)).toBeDisabled();
  await expect.poll(() => lines(output(page))).toEqual(expected.split('\n'));
}

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await selectXml(page);
});

test('validation keeps the result; reverting input and syntax recovery require fresh formatting', async ({ page }) => {
  const source = '<r><a/></r>';
  const expected = '<r>\n  <a/>\n</r>';
  await expect(page.getByLabel('들여쓰기', { exact: true })).toHaveValue('2');
  await input(page).fill(source);
  await format(page).click();
  await expect(save(page)).toBeEnabled();
  await expect.poll(() => lines(input(page))).toEqual([source]);

  await validate(page).click();
  await expect(page.locator('.status-success')).toContainText('문법 검사 완료');
  await expect(save(page)).toBeEnabled();
  await expect.poll(() => lines(output(page))).toEqual(expected.split('\n'));

  await input(page).fill('<r><b/></r>');
  await expectOldResult(page, expected);
  await input(page).fill(source);
  await expectOldResult(page, expected);
  await validate(page).click();
  await expect(page.locator('.status-success')).toContainText('문법 검사 완료');
  await expectOldResult(page, expected);

  await format(page).click();
  await expect(save(page)).toBeEnabled();
  await input(page).fill('<r><a></r>');
  await validate(page).click();
  await expect(page.locator('.status-syntax')).toBeVisible();
  await expect.poll(() => lines(input(page))).toEqual(['<r><a></r>']);
  await expectOldResult(page, expected);

  await input(page).fill('<r><fixed/></r>');
  await input(page).press('ControlOrMeta+Enter');
  await expect(save(page)).toBeEnabled();
  await expect(copy(page)).toBeEnabled();
  await expect.poll(() => lines(output(page))).toEqual(['<r>', '  <fixed/>', '</r>']);
});

test('each action on blank input keeps old output stale and never reports syntax success', async ({ page }) => {
  await input(page).fill('<previous/>');
  await format(page).click();
  await expect(save(page)).toBeEnabled();
  for (const source of ['', ' \n\t ']) {
    await input(page).fill(source);
    for (const action of [format(page), validate(page)]) {
      await action.click();
      await expect(page.getByText('XML을 입력하거나 파일을 열어 시작하세요.', { exact: true })).toBeVisible();
      await expect(page.locator('.status-success')).toHaveCount(0);
      await expectOldResult(page, '<previous/>');
    }
  }
});

test('BOM and CRLF file diagnostics use the normalized editor document and focus the actual caret', async ({ page }) => {
  await open(page).setInputFiles(file('repair.txt', '\uFEFF<r>\r\n<a/>\r한😀</wrong>'));
  await expect.poll(() => lines(input(page))).toEqual(['<r>', '<a/>', '한😀</wrong>']);
  await validate(page).click();
  await page.getByRole('button', { name: '3행 4열로 이동 ↗', exact: true }).click();
  await expect(input(page)).toBeFocused();
  const caret = await input(page).evaluate(element => {
    const selection = window.getSelection();
    if (!selection?.anchorNode) return null;
    const anchor = selection.anchorNode;
    const line = (anchor.nodeType === Node.ELEMENT_NODE ? anchor as Element : anchor.parentElement)?.closest('.cm-line');
    if (!line) return null;
    const range = document.createRange();
    range.setStart(line, 0);
    range.setEnd(anchor, selection.anchorOffset);
    return { line: Array.from(element.querySelectorAll('.cm-line')).indexOf(line) + 1, column: range.toString().length + 1 };
  });
  expect(caret).toEqual({ line: 3, column: 4 });
  await expect(page.locator('.file-name')).toHaveText('repair.txt');
  await expect(save(page)).toBeDisabled();

  await input(page).fill('<fixed/>');
  await format(page).click();
  await expect(save(page)).toBeEnabled();
  await open(page).setInputFiles(file('repair.txt', '<?xml version="1.0" encoding="UTF-16"?><bad/>'));
  await expect(page.locator('.notice')).toContainText('UTF-8');
  await expect.poll(() => lines(input(page))).toEqual(['<fixed/>']);
  await expect(page.locator('.file-name')).toHaveText('repair.txt');
  await open(page).setInputFiles(file('repair.txt', '<same-name-retry/>'));
  await expect.poll(() => lines(input(page))).toEqual(['<same-name-retry/>']);
  await format(page).click();
  await expect(save(page)).toBeEnabled();
  await expect.poll(() => lines(output(page))).toEqual(['<same-name-retry/>']);
});

type XmlRequest = {
  id: number; version: number; formatter: string; action: string;
  text: string; options: { indent: string };
};
type XmlResult = { ok: true; text: string } | {
  ok: false; error: { message: string; offset: number; line: number; column: number };
};
type CapturedJob = {
  request: XmlRequest; readonly terminated: boolean;
  deliver(result: XmlResult): void;
  fail(kind: 'error' | 'messageerror'): void;
};
type WorkerHarness = { xmlJobs: CapturedJob[] };

test('a file replacement cancels its Worker and late success, syntax and runtime failures cannot replace newer work', async ({ page }) => {
  await page.addInitScript(() => {
    const jobs: CapturedJob[] = [];
    (window as unknown as WorkerHarness).xmlJobs = jobs;
    class ControlledWorker {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      onmessageerror: ((event: MessageEvent) => void) | null = null;
      terminated = false;
      terminate() { this.terminated = true; }
      postMessage(request: XmlRequest) {
        // Keep callbacks captured before termination, as already queued events can be late.
        const receive = this.onmessage, crash = this.onerror, unreadable = this.onmessageerror;
        const owner = this;
        jobs.push({
          request,
          get terminated() { return owner.terminated; },
          deliver(result) {
            receive?.(new MessageEvent('message', { data: { id: request.id, version: request.version, result } }));
          },
          fail(kind) {
            if (kind === 'error') crash?.(new Event('error'));
            else unreadable?.(new MessageEvent('messageerror'));
          },
        });
      }
    }
    window.Worker = ControlledWorker as unknown as typeof Worker;
  });
  await page.reload();
  await selectXml(page);
  await input(page).fill('<old/>');
  await format(page).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as WorkerHarness).xmlJobs.length)).toBe(1);
  expect(await page.evaluate(() => (window as unknown as WorkerHarness).xmlJobs[0].request)).toMatchObject({
    formatter: 'xml', action: 'format', text: '<old/>', options: { indent: '2' },
  });
  await open(page).setInputFiles(file('new.xml', '<new><leaf/></new>'));
  await expect.poll(() => lines(input(page))).toEqual(['<new><leaf/></new>']);
  expect(await page.evaluate(() => (window as unknown as WorkerHarness).xmlJobs[0].terminated)).toBe(true);
  await format(page).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as WorkerHarness).xmlJobs.length)).toBe(2);
  await page.evaluate(() => {
    const old = (window as unknown as WorkerHarness).xmlJobs[0];
    old.deliver({ ok: true, text: '<obsolete/>' });
    old.fail('error');
    old.fail('messageerror');
  });
  await expect(page.locator('.status-busy')).toBeVisible();
  await expect(output(page)).toBeEmpty();
  await expect(save(page)).toBeDisabled();
  const expected = '<new>\n  <leaf/>\n</new>';
  await page.evaluate(text => {
    (window as unknown as WorkerHarness).xmlJobs[1].deliver({ ok: true, text });
  }, expected);
  await expect(save(page)).toBeEnabled();
  await expect.poll(() => lines(output(page))).toEqual(expected.split('\n'));
  await page.evaluate(() => {
    const old = (window as unknown as WorkerHarness).xmlJobs[0];
    old.deliver({ ok: false, error: { message: 'obsolete syntax', offset: 0, line: 1, column: 1 } });
    old.fail('error');
    old.fail('messageerror');
  });
  await expect(page.locator('.status-success')).toBeVisible();
  await expect(save(page)).toBeEnabled();
  await expect.poll(() => lines(input(page))).toEqual(['<new><leaf/></new>']);
  await expect.poll(() => lines(output(page))).toEqual(expected.split('\n'));
  await expect(page.locator('.file-name')).toHaveText('new.xml');
});

type ReadHarness = { xmlReadStarted: boolean; xmlRejectRead: () => void };

test('an obsolete file read failure cannot add a notice or overwrite a later successful import', async ({ page }) => {
  await page.evaluate(() => {
    const original = File.prototype.arrayBuffer;
    const state = window as unknown as ReadHarness;
    state.xmlReadStarted = false;
    File.prototype.arrayBuffer = function() {
      if (this.name !== 'late.xml') return original.call(this);
      state.xmlReadStarted = true;
      return new Promise<ArrayBuffer>((_resolve, reject) => {
        state.xmlRejectRead = () => reject(new Error('late file read failure'));
      });
    };
  });
  await open(page).setInputFiles(file('late.xml', '<obsolete/>'));
  await expect.poll(() => page.evaluate(() => (window as unknown as ReadHarness).xmlReadStarted)).toBe(true);
  await open(page).setInputFiles(file('current.txt', '<current/>'));
  await expect.poll(() => lines(input(page))).toEqual(['<current/>']);
  await page.evaluate(async () => {
    (window as unknown as ReadHarness).xmlRejectRead();
    // Let the read rejection and React render finish, without a wall-clock delay.
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
  await expect(page.locator('.notice')).toHaveCount(0);
  await expect(page.locator('.file-name')).toHaveText('current.txt');
  await expect.poll(() => lines(input(page))).toEqual(['<current/>']);
  await format(page).click();
  await expect(save(page)).toBeEnabled();
  await expect.poll(() => lines(output(page))).toEqual(['<current/>']);
});
