import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, DragEvent } from 'react';
import { Editor } from '../components/Editor.tsx';
import type { EditorHandle } from '../components/Editor.tsx';
import { getFormatter } from '../formatters/registry.ts';
import { SQL_DIALECTS, SQL_SAMPLES } from '../formatters/sql/config.ts';
import type { SqlDialect, KeywordCase } from '../formatters/sql/config.ts';
import type { Action, Diagnostic, Indent } from '../formatters/types.ts';
import { assertInputSize, byteLength, download, readFile } from '../services/files.ts';
import { WorkerClient } from '../services/worker-client.ts';
import { readXmlFile } from '../formatters/xml/files.ts';

type Status = { kind: 'empty' | 'changed' | 'busy' | 'success' | 'syntax' | 'error' | 'unsupported'; message: string; error?: Diagnostic };
const SAMPLE = '{"project":"Dev Toolkit","description":"브라우저 안에서 처리합니다.","enabled":true,"formats":["JSON"],"count":9007199254740993,"options":{"indent":2,"storage":null}}';
const LABELS: Record<Action, string> = { format: '포매팅', minify: '압축', validate: '문법 검사' };

export function FormatterWorkspace({ formatId }: { formatId: string }) {
  const formatter = getFormatter(formatId);
  const [indent, setIndent] = useState<Indent>(formatter.options.indent.default);
  const [dialect, setDialect] = useState<SqlDialect>('postgresql');
  const [keywordCase, setKeywordCase] = useState<KeywordCase>('preserve');
  const sqlMode = formatId === 'sql';
  const selectedDialect = SQL_DIALECTS.find(item => item.id === dialect)!;
  const emptyStatus: Status = { kind: 'empty', message: `${formatter.name}을 입력하거나 파일을 열어 시작하세요.` };
  const editorLanguage = sqlMode ? dialect : formatter.language;
  const [input, setInput] = useState('');
  const [filename, setFilename] = useState('');
  const [status, setStatus] = useState<Status>(emptyStatus);
  const [notice, setNotice] = useState('');
  const [output, setOutput] = useState<{ text: string; version: number; generation: number } | null>(null);
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [split, setSplit] = useState(50);
  const source = useRef<EditorHandle>(null), result = useRef<EditorHandle>(null);
  const fileInput = useRef<HTMLInputElement>(null), workspace = useRef<HTMLDivElement>(null);
  const currentText = useRef(''), version = useRef(0), requestId = useRef(0), fileRequest = useRef(0);
  const optionGeneration = useRef(0);
  const worker = useRef<WorkerClient | null>(null);
  if (!worker.current) worker.current = new WorkerClient(() => new Worker(new URL('../workers/formatter.worker.ts', import.meta.url), { type: 'module' }));
  useEffect(() => () => { worker.current?.cancel(); fileRequest.current++; }, []);
  const validOutput = !!output && output.version === version.current && output.generation === optionGeneration.current && status.kind !== 'busy' && status.kind !== 'syntax' && status.kind !== 'error' && status.kind !== 'unsupported';
  const stale = !!output && (output.version !== version.current || output.generation !== optionGeneration.current);

  function changeInput(text: string) {
    currentText.current = text; version.current++; fileRequest.current++; requestId.current++;
    worker.current?.cancel(); setReading(false); setInput(text); setNotice('');
    setStatus(text.replace(/^\uFEFF/, '').replace(/[ \t\r\n]/g, '') ? { kind: 'changed', message: '입력이 변경되었습니다. 작업을 실행하세요.' } : emptyStatus);
  }
  function changeIndent(value: Indent) {
    setIndent(value); optionGeneration.current++; requestId.current++; worker.current?.cancel();
    setStatus(currentText.current.trim() ? { kind: 'changed', message: '들여쓰기가 변경되었습니다. 다시 포매팅하세요.' } : emptyStatus);
  }
  function changeSqlOption(nextDialect: SqlDialect, nextCase: KeywordCase) {
    setDialect(nextDialect); setKeywordCase(nextCase);
    version.current++; requestId.current++; worker.current?.cancel(); setNotice('');
    setStatus(currentText.current.trim() ? { kind: 'changed', message: 'SQL 옵션이 변경되었습니다. 다시 실행하세요.' } : emptyStatus);
  }
  async function run(action: Action) {
    if (sqlMode && (action === 'minify' || (action === 'validate' && !selectedDialect.validate))) return;
    if (status.kind === 'busy' || reading) return;
    const text = currentText.current;
    if (!text.replace(/^\uFEFF/, '').replace(/[ \t\r\n]/g, '')) { setStatus(emptyStatus); return; }
    try { assertInputSize(text); } catch (error) { setStatus({ kind: 'error', message: (error as Error).message }); return; }
    const id = ++requestId.current, inputVersion = version.current, generation = optionGeneration.current;
    setStatus({ kind: 'busy', message: `${LABELS[action]} 중…` }); setNotice('');
    try {
      const response = await worker.current!.run({ id, version: inputVersion, formatter: formatId, action, text, options: { indent, dialect, keywordCase } });
      if (requestId.current !== id || version.current !== inputVersion || generation !== optionGeneration.current) return;
      if (!response.result.ok) { setStatus({ kind: response.result.kind === 'unsupported' ? 'unsupported' : response.result.kind === 'error' ? 'error' : 'syntax', message: response.result.error.message, error: response.result.error }); return; }
      if (action !== 'validate') {
        setOutput({ text: response.result.text, version: inputVersion, generation });
        result.current?.replace(response.result.text);
      }
      setStatus({ kind: 'success', message: sqlMode
        ? action === 'validate' ? `문법 검사 완료 · ${selectedDialect.name} 파서 기준 구문 분석 통과` : `포매팅 완료 · ${selectedDialect.name}`
        : `${LABELS[action]} 완료 · 올바른 ${formatter.name}입니다.` });
    } catch (error) {
      if (requestId.current === id && version.current === inputVersion) setStatus({ kind: 'error', message: (error as Error).message });
    }
  }
  async function openFiles(files: File[]) {
    const token = ++fileRequest.current, inputVersion = version.current;
    requestId.current++; worker.current?.cancel();
    if (status.kind === 'busy') setStatus({ kind: 'changed', message: '작업이 취소되었습니다. 파일을 읽은 후 다시 실행하세요.' });
    setReading(false); setNotice('');
    if (files.length !== 1) { setNotice('파일은 한 번에 하나씩 넣어 주세요. 기존 입력을 유지합니다.'); return; }
    setReading(true);
    try {
      const text = await (formatId === 'xml' ? readXmlFile(files[0]) : readFile(files[0], formatter.extensions));
      if (token !== fileRequest.current || inputVersion !== version.current) return;
      // Editor dispatch calls changeInput synchronously and keeps the undo history.
      source.current?.replace(text); setFilename(files[0].name); setReading(false);
      if (text === currentText.current) setStatus(text.trim() ? { kind: 'changed', message: '파일을 읽었습니다. 작업을 실행하세요.' } : emptyStatus);
    } catch (error) { if (token === fileRequest.current && inputVersion === version.current) setNotice((error as Error).message); }
    finally { if (token === fileRequest.current) setReading(false); }
  }
  function reset() {
    fileRequest.current++; requestId.current++; worker.current?.cancel(); version.current++;
    currentText.current = ''; setInput(''); setOutput(null); setFilename(''); setReading(false); setNotice('');
    source.current?.replace('', true); result.current?.replace('', true); setStatus(emptyStatus);
    if (fileInput.current) fileInput.current.value = '';
  }
  async function copy() {
    if (!validOutput || !output) return;
    const copyVersion = version.current;
    try {
      await navigator.clipboard.writeText(output.text);
      if (copyVersion === version.current) setNotice('결과를 복사했습니다.');
    } catch {
      if (copyVersion === version.current) { result.current?.selectAll(); setNotice('복사 권한이 없습니다. 선택된 결과를 Ctrl+C 또는 Cmd+C로 복사하세요. HTTPS 환경도 확인하세요.'); }
    }
  }
  function drop(event: DragEvent) { event.preventDefault(); setDragging(false); void openFiles(Array.from(event.dataTransfer.files)); }
  return <>
    <main>
      <h1 className="sr-only">{formatter.name} 포매터</h1>
      <section className="toolbox" aria-label={`${formatter.name} 도구`}>
        <div className="tool-row"><div className="button-group">
          <button onClick={() => fileInput.current?.click()}>↥ <span>파일 열기</span></button>
          <input ref={fileInput} type="file" className="sr-only" tabIndex={-1} aria-label={`${formatter.name} 파일 선택`} accept={formatter.extensions.map(ext => '.' + ext).join(',')} onChange={event => { const files = Array.from(event.target.files || []); event.target.value = ''; if (files.length) void openFiles(files); }} />
          <button onClick={() => { const sample = sqlMode ? SQL_SAMPLES[dialect] : formatter.sample ?? SAMPLE; changeInput(sample); source.current?.replace(sample); setFilename(''); }}>예제</button>
          <span className="button-divider" /><button onClick={reset}>초기화</button>
        </div><div className="format-options">{sqlMode && <>
          <label className="indent-select">DB 종류<select aria-label="DB 종류" value={dialect} onChange={event => changeSqlOption(event.target.value as SqlDialect, keywordCase)}>{SQL_DIALECTS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="indent-select">키워드<select aria-label="키워드 대소문자" value={keywordCase} onChange={event => changeSqlOption(dialect, event.target.value as KeywordCase)}><option value="preserve">원본 유지</option><option value="upper">대문자</option><option value="lower">소문자</option></select></label>
        </>}<label className="indent-select">{formatter.options.indent.label}<select aria-label="들여쓰기" value={indent} onChange={event => changeIndent(event.target.value as Indent)}>{formatter.options.indent.values.map(value => <option key={value} value={value}>{value === 'tab' ? '탭' : `${value}칸`}</option>)}</select></label></div></div>
        <div className="tool-row actions"><div className="button-group">{(['format', 'minify', 'validate'] as const).filter(action => formatter.capabilities[action]).map(action => <button className={action === 'format' ? 'primary' : 'secondary'} key={action} disabled={status.kind === 'busy' || reading || (action === 'validate' && sqlMode && !selectedDialect.validate)} onClick={() => void run(action)}>{LABELS[action]} <span className="english">{action === 'format' ? 'Beautify' : action === 'minify' ? 'Minify' : 'Validate'}</span></button>)}</div><span className="shortcut"><kbd>⌘ / Ctrl</kbd> + <kbd>Enter</kbd> 포매팅</span></div>
      {sqlMode && <p className="sql-help">{dialect === 'plsql' ? 'Oracle 문법 검사는 실험적이며 일반 SQL을 지원합니다. PL/SQL·SQL*Plus는 추후 지원 예정입니다. DB 버전별 구문과 테이블·컬럼 존재 여부, 실행 가능 여부는 보장하지 않습니다.' : dialect === 'clickhouse' ? 'ClickHouse 문법 검사는 실험적입니다. INSERT VALUES·FORMAT·외부 데이터 검사는 지원하지 않습니다. 테이블·컬럼 존재 여부와 실행 가능 여부는 검사하지 않습니다.' : selectedDialect.validate ? '문법 검사는 파서 지원 범위 내의 구문 검사입니다. DB 버전·전용 구문에 따라 제한이 있으며, 테이블·컬럼 존재 여부와 실행 가능 여부는 검사하지 않습니다.' : `${selectedDialect.name} 문법 검사 · 추후 구현 예정. 현재 포매팅을 지원합니다.`}</p>}
      </section>
      <div className="feedback">
      <div className={`status status-${status.kind}`} role="status" aria-live="polite"><span className="status-icon">{status.kind === 'busy' ? '◌' : status.kind === 'success' ? '✓' : ['syntax', 'error'].includes(status.kind) ? '!' : '•'}</span><span>{reading ? '파일을 읽는 중…' : status.message}</span>{status.error?.offset !== undefined && <button className="error-location" onClick={() => source.current?.goTo(status.error!.offset!)}>{status.error.line}행 {status.error.column}열로 이동 ↗</button>}</div>
      {notice && <div className="notice" role="status">{notice}</div>}
      </div>
      <div ref={workspace} className="workspace" style={{ '--split': `${split}%` } as CSSProperties}>
        <section className={`pane input-pane ${dragging ? 'dragging' : ''}`} aria-label="입력 영역" onDragOver={event => { event.preventDefault(); if (event.dataTransfer.types.includes('Files')) setDragging(true); }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }} onDrop={drop}>
          <div className="pane-heading"><div><span className="pane-dot" /><h2>입력</h2><span className="file-name" title={filename}>{filename || `원본 ${formatter.name}`}</span></div><div className="pane-tools"><button aria-label="입력 실행 취소" title="실행 취소 (Ctrl/Cmd+Z)" onClick={() => source.current?.undo()}>↶</button><button aria-label="입력 다시 실행" title="다시 실행" onClick={() => source.current?.redo()}>↷</button><button aria-label="입력 검색" title="검색 (Ctrl/Cmd+F)" onClick={() => source.current?.search()}>⌕</button></div></div>
          <div className="editor-body"><Editor ref={source} label={`${formatter.name} 입력`} language={editorLanguage} onChange={changeInput} onLimit={setNotice} onRun={() => void run('format')} />{!input && <div className="editor-placeholder"><span>{'{ }'}</span><p>{formatter.name}을 붙여넣어 주세요</p><small>또는 {formatter.extensions.map(ext => '.' + ext).join(' / ')} 파일을 여기에 놓으세요</small><small>UTF-8 · 최대 10 MiB</small></div>}{dragging && <div className="drop-overlay">파일 한 개를 놓아 열기</div>}</div>
          <div className="pane-footer"><span>UTF-8</span><span>{byteLength(input).toLocaleString()} bytes</span></div>
        </section>
        <div role="separator" aria-label="편집기 너비 조절" aria-orientation="vertical" aria-valuemin={25} aria-valuemax={75} aria-valuenow={split} tabIndex={0} className="resizer" onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); setSplit(value => Math.min(75, Math.max(25, value + (event.key === 'ArrowRight' ? 2 : -2)))); } }} onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) { const bounds = workspace.current!.getBoundingClientRect(); setSplit(Math.max(25, Math.min(75, (event.clientX - bounds.left) / bounds.width * 100))); } }} onPointerUp={event => event.currentTarget.releasePointerCapture(event.pointerId)}><span /></div>
        <section className="pane output-pane" aria-label="결과 영역"><div className="pane-heading"><div><span className="pane-dot result-dot" /><h2>결과</h2><span className={`result-label ${stale ? 'stale' : ''}`}>{stale ? '이전 결과 · 재실행 필요' : '읽기 전용'}</span></div><div className="pane-tools"><button aria-label="결과 검색" onClick={() => result.current?.search()}>⌕</button><button disabled={!validOutput} onClick={() => void copy()}>복사</button><button disabled={!validOutput} onClick={() => { if (output) { download(output.text, filename, formatter.extensions[0]); setNotice('다운로드를 시작했습니다.'); } }}>다운로드</button></div></div>
          <div className="editor-body"><Editor ref={result} label={`${formatter.name} 결과`} readOnly language={editorLanguage} />{!output && <div className="editor-placeholder"><span>↳</span><p>결과가 여기에 표시됩니다</p><small>{formatter.capabilities.minify ? '포매팅 또는 압축을 실행하세요' : '포매팅을 실행하세요'}</small></div>}</div><div className="pane-footer"><span>{stale ? '오래된 결과' : formatter.name}</span><span>{output ? byteLength(output.text).toLocaleString() : 0} bytes</span></div>
        </section>
      </div>

    </main>
  </>;
}
