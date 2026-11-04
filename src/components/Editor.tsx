import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Compartment, EditorState } from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, drawSelection, rectangularSelection } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab, undo, redo } from '@codemirror/commands';
import { bracketMatching, HighlightStyle, foldGutter, foldKeymap, syntaxHighlighting } from '@codemirror/language';
import { sql, PostgreSQL, MySQL, MariaSQL, PLSQL, StandardSQL } from '@codemirror/lang-sql';
import { json } from '@codemirror/lang-json';
import { search, searchKeymap, openSearchPanel } from '@codemirror/search';
import { tags } from '@lezer/highlight';
import { assertInputSize } from '../services/files.ts';
import { xmlLanguage } from '../formatters/xml/language.ts';

export type EditorHandle = { replace: (text: string, reset?: boolean) => void; goTo: (offset: number) => void; search: () => void; undo: () => void; redo: () => void; selectAll: () => void };
type Props = { label: string; readOnly?: boolean; language: string; languageSupport?: Extension; onChange?: (value: string) => void; onLimit?: (message: string) => void; onRun?: () => void };
export const Editor = forwardRef<EditorHandle, Props>(function Editor(props, ref) {
  const container = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const latest = useRef(props); latest.current = props;
  const editorExtensions = useRef<Extension[]>([]);
  const language = useRef(new Compartment());
  const attributes = useRef(new Compartment());
  const languages: Record<string, () => Extension> = { json, xml: () => xmlLanguage, postgresql: () => sql({ dialect: PostgreSQL }), mysql: () => sql({ dialect: MySQL }), mariadb: () => sql({ dialect: MariaSQL }), plsql: () => sql({ dialect: PLSQL }), clickhouse: () => sql({ dialect: StandardSQL }) };
  const languageExtension = (id: string): Extension => latest.current.languageSupport ?? languages[id]?.() ?? [];
  const themeExtension = EditorView.theme({
    '&': { height: '100%', backgroundColor: 'var(--editor)', color: 'var(--text)' },
    '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: '13px', lineHeight: '1.8', overflow: 'auto' },
    '.cm-content': { padding: '16px 0', caretColor: 'var(--accent)' },
    '.cm-line': { padding: '0 16px' },
    '.cm-gutters': { backgroundColor: 'var(--editor)', color: 'var(--muted)', borderRight: '1px solid var(--border)' },
    '.cm-activeLineGutter': { backgroundColor: 'var(--active-line)' },
    '.cm-cursor': { borderLeftColor: 'var(--accent)' },
    '& .cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': { backgroundColor: 'var(--selection)' },
    // drawSelection paints one shared selection layer. Native selection and
    // opaque active-line backgrounds would cover it in the editable pane.
    '.cm-content ::selection, .cm-content::selection': { backgroundColor: 'transparent' },
    '.cm-panels': { backgroundColor: 'var(--surface)', color: 'var(--text)' },
    '.cm-search input': { color: 'var(--text)', backgroundColor: 'var(--editor)', border: '1px solid var(--border)' },
  }, { dark: false });
  useEffect(() => {
    const extensions: Extension[] = [
      lineNumbers(), foldGutter(), drawSelection(), rectangularSelection(), bracketMatching(),
      syntaxHighlighting(HighlightStyle.define([
        { tag: [tags.propertyName, tags.typeName], color: '#334155' },
        { tag: tags.comment, color: '#64748b' },
        { tag: [tags.string, tags.escape], color: '#0f766e' },
        { tag: tags.number, color: '#1d4ed8' },
        { tag: [tags.bool, tags.null, tags.atom, tags.keyword], color: '#6d4c91' },
        { tag: [tags.brace, tags.squareBracket, tags.punctuation], color: '#64748b' },
        { tag: tags.invalid, color: '#b42318' },
        { tag: tags.heading, fontWeight: 'bold', color: '#1d4ed8' },
        { tag: tags.strong, fontWeight: 'bold' },
        { tag: tags.emphasis, fontStyle: 'italic' },
        { tag: tags.link, color: '#0f766e', textDecoration: 'underline' },
      ])), language.current.of(languageExtension(props.language)), search({ top: true }),
      EditorState.phrases.of({ 'Search': '검색', 'Find': '검색', 'Replace': '바꾸기', 'replace': '바꾸기', 'replace all': '모두 바꾸기', 'next': '다음', 'previous': '이전', 'all': '전체', 'match case': '대소문자 구분', 'by word': '단어 단위', 'regexp': '정규식', 'close': '닫기', 'Fold line': '줄 접기', 'Unfold line': '줄 펼치기', 'to': '~' }),
      keymap.of([{ key: 'Mod-Enter', run: () => { latest.current.onRun?.(); return true; } }, ...searchKeymap, ...foldKeymap, ...defaultKeymap, ...(props.readOnly ? [] : [...historyKeymap, indentWithTab])]),
      themeExtension,
      attributes.current.of(EditorView.contentAttributes.of({ 'aria-label': props.label, 'aria-multiline': 'true', spellcheck: 'false' })),
    ];
    if (props.readOnly) extensions.push(EditorState.readOnly.of(true));
    else extensions.push(history(), highlightActiveLineGutter(),
      EditorState.transactionFilter.of(transaction => {
        if (!transaction.docChanged) return transaction;
        try { assertInputSize(transaction.newDoc.toString()); return transaction; }
        catch (error) { queueMicrotask(() => latest.current.onLimit?.((error as Error).message)); return []; }
      }),
      EditorView.updateListener.of(update => { if (update.docChanged) latest.current.onChange?.(update.state.doc.toString()); }));
    editorExtensions.current = extensions;
    view.current = new EditorView({ state: EditorState.create({ extensions }), parent: container.current! });
    return () => { view.current?.destroy(); view.current = null; };
  }, []);
  useEffect(() => { view.current?.dispatch({ effects: [language.current.reconfigure(languageExtension(props.language)), attributes.current.reconfigure(EditorView.contentAttributes.of({ 'aria-label': props.label, 'aria-multiline': 'true', spellcheck: 'false' }))] }); }, [props.language, props.label, props.languageSupport]);
  useImperativeHandle<EditorHandle, EditorHandle>(ref, () => ({
    replace(text, reset = false) {
      const editor = view.current; if (!editor) return;
      if (reset) {
        editor.setState(EditorState.create({ doc: text, extensions: editorExtensions.current }));
        editor.dispatch({ effects: [language.current.reconfigure(languageExtension(latest.current.language)), attributes.current.reconfigure(EditorView.contentAttributes.of({ 'aria-label': latest.current.label, 'aria-multiline': 'true', spellcheck: 'false' }))] });
        if (!props.readOnly) latest.current.onChange?.(text);
      } else editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: text }, selection: { anchor: 0 }, userEvent: 'input.replace' });
    },
    goTo(offset) { const editor = view.current; if (editor) { const pos = Math.min(offset, editor.state.doc.length); editor.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'center' }) }); editor.focus(); } },
    search() { if (view.current) openSearchPanel(view.current); },
    undo() { if (view.current) undo(view.current); },
    redo() { if (view.current) redo(view.current); },
    selectAll() { const editor = view.current; if (editor) { editor.dispatch({ selection: { anchor: 0, head: editor.state.doc.length } }); editor.focus(); } },
  }));
  return <div className="editor" ref={container} />;
});
