import { Component, memo } from 'react';
import type { ReactNode } from 'react';
import Markdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { markdownUrl, MAX_PREVIEW_DEPTH, MAX_PREVIEW_NODES } from '../services/markdown.ts';

type TreeNode = { type: string; children?: TreeNode[]; tagName?: string; value?: string; properties?: Record<string, unknown> };

// Bound the React tree as well as the source size: a small Markdown table can
// expand to many DOM nodes. Prefix heading IDs to avoid document name collisions.
function previewTree() {
  return (tree: TreeNode) => {
    let count = 0;
    const stack = [{ node: tree, depth: 0 }];
    const headings = new Map<string, string>();
    const links: TreeNode[] = [];
    const slugs = new Map<string, number>();
    while (stack.length) {
      const { node, depth } = stack.pop()!;
      if (++count > MAX_PREVIEW_NODES || depth > MAX_PREVIEW_DEPTH) throw new Error('미리보기 렌더링 한도 초과');
      if (/^h[1-6]$/.test(node.tagName || '') && !node.properties?.id) {
        const text: string[] = [];
        const pending = [node];
        while (pending.length) {
          const part = pending.pop()!;
          if (part.value) text.push(part.value);
          if (part.children) pending.push(...part.children.slice().reverse());
        }
        const slug = text.join('').toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').trim().replace(/\s+/g, '-') || 'section';
        const repeated = slugs.get(slug) || 0;
        slugs.set(slug, repeated + 1);
        const anchor = repeated ? `${slug}-${repeated}` : slug;
        const id = `md-heading-${anchor}`;
        node.properties = { ...node.properties, id };
        headings.set(`#${anchor}`, `#${id}`);
      }
      if (node.tagName === 'a') links.push(node);
      if (node.children) for (let i = node.children.length - 1; i >= 0; i--) stack.push({ node: node.children[i], depth: depth + 1 });
    }
    for (const node of links) {
      const href = node.properties?.href;
      if (typeof href !== 'string' || !href.startsWith('#')) continue;
      // remark normalizes non-ASCII URLs to percent escapes; heading IDs retain
      // Unicode, so decode the fragment before matching Korean headings.
      let fragment = href;
      try { fragment = decodeURIComponent(href); } catch { /* Keep malformed fragments inert. */ }
      if (headings.has(fragment)) node.properties!.href = headings.get(fragment);
    }
  };
}

const components: Components = {
  a({ href, children, node: _node, ...attributes }) {
    if (!href) return <span>{children}</span>;
    return <a {...attributes} href={href} target={href.startsWith('#') ? undefined : '_blank'} rel="noopener noreferrer">{children}</a>;
  },
  // Never mount an img element, even in development where the nginx CSP is absent.
  img({ alt }) { return <span className="markdown-image">이미지 · {alt || '설명 없음'} <small>(자동 로드 안 함)</small></span>; },
  table({ children }) { return <div className="markdown-table"><table>{children}</table></div>; },
};
const remarkPlugins = [remarkGfm];
const rehypePlugins = [previewTree];

export class PreviewBoundary extends Component<{ children: ReactNode; onFailure: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFailure(); }
  render() {
    return this.state.failed
      ? <p className="preview-error" role="status">미리보기의 요소 수 또는 중첩 한도를 초과했거나 표시 중 오류가 발생했습니다. 문서를 나눠 주세요. 원문 복사·다운로드는 계속 사용할 수 있습니다.</p>
      : this.props.children;
  }
}

export const MarkdownPreview = memo(function MarkdownPreview({ text }: { text: string }) {
  return <Markdown skipHtml remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins}
    urlTransform={(url, key) => key === 'src' ? '' : markdownUrl(url)} components={components}>{text}</Markdown>;
});
