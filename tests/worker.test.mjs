import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WorkerClient } from '../src/services/worker-client.ts';
const request = (id, version = 1) => ({ id, version, formatter: 'json', action: 'format', text: '{}', options: { indent: '2' } });
class FakeWorker { onmessage = null; onerror = null; onmessageerror = null; terminated = false; postMessage(message) { this.sent = message; } terminate() { this.terminated = true; } reply(id, version = 1) { this.onmessage?.({ data: { id, version, result: { ok: true, text: '{}' } } }); } }
test('ignores mismatched IDs and versions; resolves only current response', async () => {
  let worker; const client = new WorkerClient(() => worker = new FakeWorker());
  const pending = client.run(request(2));
  worker.reply(1); worker.reply(2, 0); worker.reply(2);
  assert.equal((await pending).id, 2); assert.equal(worker.terminated, true);
});
test('input changes/reset cancel obsolete work and new requests get a fresh worker', async () => {
  const workers = []; const client = new WorkerClient(() => { const worker = new FakeWorker(); workers.push(worker); return worker; });
  const first = client.run(request(1)); const firstRejected = assert.rejects(first, /취소/);
  client.cancel(); await firstRejected;
  const next = client.run(request(2, 3)); workers[0].reply(1); workers[1].reply(2, 3);
  assert.equal((await next).version, 3); assert.equal(workers[0].terminated, true);
});
test('timeout and worker crash terminate worker and allow retry', async () => {
  let worker; const client = new WorkerClient(() => worker = new FakeWorker(), 10);
  await assert.rejects(client.run(request(1)), /10초/); assert.equal(worker.terminated, true);
  const next = client.run(request(2)); const crashed = assert.rejects(next, /실행 오류/); worker.onerror({}); await crashed;
  const retry = client.run(request(3)); worker.reply(3); assert.equal((await retry).result.ok, true);
});
test('worker construction failure is reported', async () => {
  const client = new WorkerClient(() => { throw new Error('blocked'); });
  await assert.rejects(client.run(request(1)), /시작할 수 없습니다/);
});
