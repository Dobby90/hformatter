import { getFormatter } from '../formatters/registry.ts';
import type { Request, Response } from '../formatters/types.ts';

self.onmessage = async (event: MessageEvent<Request>) => {
  const request = event.data;
  try {
    const module = getFormatter(request.formatter);
    const handler = module[request.action];
    if (!handler) throw new Error('지원하지 않는 작업입니다.');
    const result = await handler(request.text, request.options);
    self.postMessage({ id: request.id, version: request.version, result } satisfies Response);
  } catch {
    // An async listener's rejected promise does not trigger Worker.onerror.
    // Raise a regular worker error without exposing input or parser internals.
    setTimeout(() => { throw new Error('포매터 실행 오류'); }, 0);
  }
};
