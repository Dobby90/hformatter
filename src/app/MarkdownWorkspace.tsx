import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, DragEvent } from 'react';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { Editor } from '../components/Editor.tsx';
import type { EditorHandle } from '../components/Editor.tsx';
import { MarkdownPreview, PreviewBoundary } from '../components/MarkdownPreview.tsx';
import { byteLength, downloadFile, readFile } from '../services/files.ts';
import { MARKDOWN_EXTENSIONS, MARKDOWN_SAMPLE, markdownDownloadName, markdownPreviewLimit } from '../services/markdown.ts';

const MARKDOWN_LANGUAGE = markdown({ base: markdownLanguage, completeHTMLTags: false, pasteURLAsLink: false });

export default function MarkdownWorkspace() {
  const [input, setInput] = useState('');
  const [filename, setFilename] = useState('');
  const [notice, setNotice] = useState('');
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [previewOnly, setPreviewOnly] = useState(false);
  const [split, setSplit] = useState(50);
  const [preview, setPreview] = useState({ text: '', version: 0 });
  const [failedVersion, setFailedVersion] = useState<number | null>(null);
  const source = useRef<EditorHandle>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const workspace = useRef<HTMLDivElement>(null);
  const currentText = useRef('');
  const version = useRef(0);
  const fileRequest = useRef(0);
  const limit = useMemo(() => markdownPreviewLimit(input), [input]);
  const bytes = useMemo(() => byteLength(input), [input]);
  const empty = !input.trim();
  const stale = preview.text !== input;
  const failed = !stale && failedVersion === preview.version;

  useEffect(() => () => { fileRequest.current++; }, []);
  useEffect(() => {
    if (limit) return;
    const inputVersion = version.current;
    const timer = setTimeout(() => setPreview({ text: input, version: inputVersion }), 250);
    return () => clearTimeout(timer);
  }, [input, limit]);

  function changeInput(text: string) {
    currentText.current = text;
    version.current++; fileRequest.current++;
    setInput(text); setReading(false); setNotice('');
  }

  function refresh() {
    if (!limit) setPreview({ text: currentText.current, version: version.current });
  }

  async function openFiles(files: File[]) {
    const token = ++fileRequest.current;
    setReading(false); setDragging(false); setNotice('');
    if (files.length !== 1) { setNotice('파일은 한 번에 하나씩 넣어 주세요. 기존 입력을 유지합니다.'); return; }
    setReading(true);
    try {
      const text = await readFile(files[0], MARKDOWN_EXTENSIONS);
      if (token !== fileRequest.current) return;
      // Keep normal file replacements undoable, including empty files.
      source.current?.replace(text); setFilename(files[0].name); setReading(false);
    } catch (error) {
      if (token === fileRequest.current) setNotice((error as Error).message);
    } finally {
      if (token === fileRequest.current) setReading(false);
    }
  }

  function reset() {
    fileRequest.current++; version.current++;
    source.current?.replace('', true);
    currentText.current = ''; setInput(''); setPreview({ text: '', version: version.current });
    setFilename(''); setNotice(''); setReading(false); setDragging(false); setFailedVersion(null);
    if (fileInput.current) fileInput.current.value = '';
  }

  async function copySource() {
    if (!currentText.current) return;
    const copyVersion = version.current;
    try {
      await navigator.clipboard.writeText(currentText.current);
      if (copyVersion === version.current) setNotice('원문을 복사했습니다.');
    } catch {
      if (copyVersion !== version.current) return;
      setPreviewOnly(false);
      requestAnimationFrame(() => source.current?.selectAll());
      setNotice('복사 권한이 없습니다. 선택된 원문을 Ctrl+C 또는 Cmd+C로 복사하세요. HTTPS 환경도 확인하세요.');
    }
  }

  function drop(event: DragEvent) {
    event.preventDefault(); setDragging(false);
    void openFiles(Array.from(event.dataTransfer.files));
  }

  const status = reading ? '파일을 읽는 중…'
    : limit || (failed ? '미리보기를 표시할 수 없습니다. 원문을 확인하거나 문서를 나눠 주세요.' : empty ? 'Markdown을 입력하거나 파일을 열어 시작하세요.'
      : stale ? '미리보기 갱신 중…' : '미리보기 완료');

  return <main>
    <h1 className="sr-only">Markdown 뷰어</h1>
    <section className="toolbox" aria-label="Markdown 도구">
      <div className="tool-row">
        <div className="button-group">
          <button onClick={() => fileInput.current?.click()}>↥ <span>파일 열기</span></button>
          <input ref={fileInput} type="file" className="sr-only" tabIndex={-1} aria-label="Markdown 파일 선택"
            accept={MARKDOWN_EXTENSIONS.map(ext => '.' + ext).join(',')}
            onChange={event => { const files = Array.from(event.target.files || []); event.target.value = ''; if (files.length) void openFiles(files); }} />
          <button onClick={() => { fileRequest.current++; source.current?.replace(MARKDOWN_SAMPLE); setFilename(''); setReading(false); }}>예제</button>
          <span className="button-divider" /><button onClick={reset}>초기화</button>
        </div>
        <button className="preview-toggle" aria-pressed={previewOnly} onClick={() => setPreviewOnly(value => !value)}>{previewOnly ? '원문 함께 보기' : '미리보기 확대'}</button>
      </div>
      <div className="tool-row actions"><div className="button-group">
        <button className="primary" onClick={refresh} disabled={!!limit || reading || empty}>미리보기 갱신</button>
        <span className="markdown-auto">자동 갱신</span>
      </div><span className="shortcut"><kbd>⌘ / Ctrl</kbd> + <kbd>Enter</kbd> 미리보기 갱신</span></div>
      <p className="sql-help">표·체크리스트·코드블록 지원 · HTML 실행·이미지 자동 로드 차단 · 미리보기 최대 256 KiB·4,000행</p>
    </section>
    <div className="feedback">
      <div className={`status ${limit || failed ? 'status-error' : !stale && !empty ? 'status-success' : ''}`} role="status" aria-live="polite"><span className="status-icon">{limit || failed ? '!' : !stale && !empty ? '✓' : '•'}</span><span>{status}</span></div>
      {notice && <div className="notice" role="status">{notice}</div>}
    </div>
    <div ref={workspace} className={`workspace markdown-workspace ${previewOnly ? 'preview-only' : ''}`} style={{ '--split': `${split}%` } as CSSProperties}>
      <section className={`pane input-pane ${dragging ? 'dragging' : ''}`} aria-label="입력 영역"
        onDragOver={event => { event.preventDefault(); if (event.dataTransfer.types.includes('Files')) setDragging(true); }}
        onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }} onDrop={drop}>
        <div className="pane-heading"><div><span className="pane-dot" /><h2>원문</h2><span className="file-name" title={filename}>{filename || '원본 Markdown'}</span></div><div className="pane-tools">
          <button aria-label="입력 실행 취소" title="실행 취소 (Ctrl/Cmd+Z)" onClick={() => source.current?.undo()}>↶</button>
          <button aria-label="입력 다시 실행" title="다시 실행" onClick={() => source.current?.redo()}>↷</button>
          <button aria-label="입력 검색" title="검색 (Ctrl/Cmd+F)" onClick={() => source.current?.search()}>⌕</button>
        </div></div>
        <div className="editor-body"><Editor ref={source} label="Markdown 입력" language="markdown" languageSupport={MARKDOWN_LANGUAGE} onChange={changeInput} onLimit={setNotice} onRun={refresh} />
          {!input && <div className="editor-placeholder"><span>#</span><p>Markdown을 붙여넣어 주세요</p><small>또는 .md / .markdown / .txt 파일을 여기에 놓으세요</small><small>UTF-8 · 입력 최대 10 MiB</small></div>}
          {dragging && <div className="drop-overlay">파일 한 개를 놓아 열기</div>}
        </div>
        <div className="pane-footer"><span>UTF-8</span><span>{bytes.toLocaleString()} bytes</span></div>
      </section>
      <div role="separator" aria-label="편집기 너비 조절" aria-orientation="vertical" aria-valuemin={25} aria-valuemax={75} aria-valuenow={split} tabIndex={0} className="resizer"
        onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); setSplit(value => Math.min(75, Math.max(25, value + (event.key === 'ArrowRight' ? 2 : -2)))); } }}
        onPointerDown={event => event.currentTarget.setPointerCapture(event.pointerId)}
        onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) { const bounds = workspace.current!.getBoundingClientRect(); setSplit(Math.max(25, Math.min(75, (event.clientX - bounds.left) / bounds.width * 100))); } }}
        onPointerUp={event => event.currentTarget.releasePointerCapture(event.pointerId)}><span /></div>
      <section className="pane output-pane" aria-label="미리보기 영역" onDragOver={event => event.preventDefault()} onDrop={drop}>
        <div className="pane-heading"><div><span className="pane-dot result-dot" /><h2>미리보기</h2><span className={`result-label ${stale ? 'stale' : ''}`}>{stale && !empty && !limit ? '갱신 중…' : '읽기 전용'}</span></div>
          <div className="pane-tools"><button disabled={!input || reading} onClick={() => void copySource()}>원문 복사</button><button disabled={!input || reading} onClick={() => { downloadFile(currentText.current, markdownDownloadName(filename), 'text/markdown;charset=utf-8'); setNotice('다운로드를 시작했습니다.'); }}>다운로드</button></div>
        </div>
        <div className="editor-body">
          <article className="markdown-preview" aria-label="Markdown 미리보기" tabIndex={0} aria-busy={stale && !limit && !empty}>
            {limit ? <p className="preview-error">{limit}</p> : empty ? <div className="editor-placeholder"><span>↳</span><p>문서가 여기에 표시됩니다</p><small>입력하면 미리보기가 자동으로 갱신됩니다</small></div>
              : <PreviewBoundary key={preview.version} onFailure={() => setFailedVersion(preview.version)}><MarkdownPreview text={preview.text} /></PreviewBoundary>}
          </article>
        </div>
        <div className="pane-footer"><span>Markdown · GFM</span><span>{limit ? '미리보기 제한' : '브라우저 안에서 처리'}</span></div>
      </section>
    </div>
  </main>;
}
