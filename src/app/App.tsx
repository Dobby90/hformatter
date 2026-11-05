import { lazy, Suspense, useState } from 'react';
import { formatters } from '../formatters/registry.ts';
import { FormatterWorkspace } from './FormatterWorkspace.tsx';

const MarkdownWorkspace = lazy(() => import('./MarkdownWorkspace.tsx'));
const APP_VERSION = `V${import.meta.env.VITE_APP_VERSION}`;
const tools = [
  ...formatters.filter(item => item.available && item.id !== 'xml'),
  { id: 'markdown', name: 'Markdown', available: true },
  ...formatters.filter(item => item.id === 'xml'),
  ...formatters.filter(item => !item.available),
];

export function App() {
  const [toolId, setToolId] = useState('json');
  return <div className="app" onDragOver={event => event.preventDefault()} onDrop={event => event.preventDefault()}>
    <header className="header">
      <a className="brand" href="./" aria-label="Dev Toolkit 시작 화면"><img className="brand-mark" src={`${import.meta.env.BASE_URL}dev-toolkit.svg`} width="32" height="32" alt="" aria-hidden="true" /><span>Dev Toolkit</span></a>
      <nav className="format-nav" aria-label="포맷 선택">
        {tools.map(item => <button key={item.id} className={`format-tab ${toolId === item.id ? 'is-active' : ''}`}
          disabled={!item.available} aria-current={toolId === item.id ? 'page' : undefined}
          onClick={() => setToolId(item.id)}>
          {item.available ? item.name : <><span>{item.id.toUpperCase()}</span><small>추후 구현 예정</small></>}
        </button>)}
      </nav>
    </header>
    <Suspense key={toolId} fallback={<main role="status">Markdown 화면을 불러오는 중…</main>}>
      {toolId === 'markdown' ? <MarkdownWorkspace /> : <FormatterWorkspace key={toolId} formatId={toolId} />}
    </Suspense>
    <footer className="site-footer"><span>입력과 결과는 탭 전환·새로고침 시 사라집니다.</span><span className="footer-meta"><span aria-label={`버전 ${APP_VERSION}`}>{APP_VERSION}</span><span>Created by 조홍연</span></span></footer>
  </div>;
}
