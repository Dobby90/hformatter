import type { Request, Response } from '../formatters/types.ts';
type WorkerLike = Pick<Worker, 'postMessage' | 'terminate' | 'onmessage' | 'onerror' | 'onmessageerror'>;
export class WorkerClient {
  private worker: WorkerLike | null = null;
  private pending: { id: number; version: number; resolve: (value: Response) => void; reject: (error: Error) => void } | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private factory: () => WorkerLike;
  private timeout: number;
  constructor(factory: () => WorkerLike, timeout = 10_000) { this.factory = factory; this.timeout = timeout; }
  cancel() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.worker?.terminate(); this.worker = null;
    this.pending?.reject(new Error('작업이 취소되었습니다.'));
    this.pending = null;
  }
  run(request: Request): Promise<Response> {
    this.cancel();
    return new Promise((resolve, reject) => {
      try {
        this.worker = this.factory();
        this.pending = { id: request.id, version: request.version, resolve, reject };
        const fail = (message: string) => { const pending = this.pending; this.pending = null; this.cancel(); pending?.reject(new Error(message)); };
        this.worker.onerror = () => fail('처리 중 실행 오류가 발생했습니다. 입력 크기나 중첩 깊이를 줄이고 다시 시도하세요.');
        this.worker.onmessageerror = () => fail('처리 결과를 읽을 수 없습니다. 다시 시도하세요.');
        this.worker.onmessage = (event: MessageEvent<Response>) => {
          if (event.data.id !== this.pending?.id || event.data.version !== this.pending.version) return;
          const pending = this.pending; this.pending = null; this.cancel(); pending.resolve(event.data);
        };
        this.timer = setTimeout(() => fail('처리 시간이 10초를 초과했습니다. 입력을 나누고 다시 시도하세요.'), this.timeout);
        this.worker.postMessage(request);
      } catch { const pending = this.pending; this.pending = null; this.cancel(); (pending?.reject ?? reject)(new Error('Worker를 시작할 수 없습니다. 정적 웹서버와 브라우저 정책을 확인하세요.')); }
    });
  }
}
