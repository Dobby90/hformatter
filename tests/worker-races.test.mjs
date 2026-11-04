import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WorkerClient } from '../src/services/worker-client.ts';

const request = (id) => ({
  id, version: id, formatter: 'json', action: 'format',
  text: '{}', options: { indent: '2' },
});
class ControlledWorker {
  onmessage = null;
  onerror = null;
  onmessageerror = null;
  terminated = false;
  postMessage(message) { this.sent = message; }
  terminate() { this.terminated = true; }
  reply() {
    this.onmessage?.({ data: {
      id: this.sent.id, version: this.sent.version,
      result: { ok: true, text: '{}' },
    } });
  }
}

for (const callback of ['onerror', 'onmessageerror']) {
  for (const cancelFirst of [false, true]) {
    test('obsolete ' + callback + ' cannot reject a successor (explicit cancel: ' + cancelFirst + ')', async () => {
      const workers = [];
      const client = new WorkerClient(() => {
        const worker = new ControlledWorker();
        workers.push(worker);
        return worker;
      });
      try {
        const first = client.run(request(1));
        const cancelled = assert.rejects(first, /취소/);
        const lateFailure = workers[0][callback];
        assert.equal(typeof lateFailure, 'function');
        if (cancelFirst) client.cancel();
        const second = client.run(request(2));
        const settled = second.then(
          value => ({ state: 'resolved', value }),
          error => ({ state: 'rejected', message: error.message }),
        );
        await cancelled;
        assert.equal(workers[0].terminated, true);
        // An event queued on the owner can outlive termination of its worker.
        lateFailure.call(workers[0], {});
        workers[1].reply();
        const outcome = await settled;
        assert.equal(outcome.state, 'resolved', JSON.stringify(outcome));
        assert.equal(outcome.value.id, 2);
        assert.equal(outcome.value.version, 2);
        assert.equal(outcome.value.result.text, '{}');
      } finally {
        client.cancel();
      }
    });
  }
}

test('a current message decoding failure terminates the worker and permits a fresh retry', async () => {
  const workers = [];
  const client = new WorkerClient(() => {
    const worker = new ControlledWorker();
    workers.push(worker);
    return worker;
  });
  try {
    const failed = client.run(request(1));
    const rejected = assert.rejects(failed, /처리 결과를 읽을 수 없습니다/);
    workers[0].onmessageerror({});
    await rejected;
    assert.equal(workers[0].terminated, true);
    const retry = client.run(request(2));
    workers[1].reply();
    assert.equal((await retry).result.ok, true);
    assert.equal(workers[1].terminated, true);
  } finally {
    client.cancel();
  }
});
