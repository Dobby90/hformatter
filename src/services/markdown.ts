import { byteLength } from './files.ts';

export const MARKDOWN_EXTENSIONS = ['md', 'markdown', 'txt'] as const;
export const MAX_PREVIEW_BYTES = 256 * 1024;
export const MAX_PREVIEW_LINES = 4000;
export const MAX_PREVIEW_NODES = 8000;
export const MAX_PREVIEW_DEPTH = 64;

export function markdownPreviewLimit(text: string): string | null {
  if (byteLength(text) > MAX_PREVIEW_BYTES) return '미리보기는 UTF-8 기준 256 KiB까지 지원합니다. 원문 편집·복사·다운로드는 계속 사용할 수 있습니다.';
  let lines = 1;
  for (let i = 0; i < text.length; i++) {
    if ((text[i] === '\n' || (text[i] === '\r' && text[i + 1] !== '\n')) && ++lines > MAX_PREVIEW_LINES) {
      return '미리보기는 4,000행까지 지원합니다. 원문 편집·복사·다운로드는 계속 사용할 수 있습니다.';
    }
  }
  return null;
}

// Local paths cannot resolve against a user's disk. Do not resolve them against
// this application's origin either, where they could trigger unintended requests.
export function markdownUrl(url: string): string {
  if (/[\u0000-\u0020\u007f]/.test(url)) return '';
  if (url.startsWith('#')) return url;
  if (!/^(https?:\/\/|mailto:)/i.test(url)) return '';
  try {
    const parsed = new URL(url);
    return ['https:', 'http:', 'mailto:'].includes(parsed.protocol) ? url : '';
  } catch { return ''; }
}

export function markdownDownloadName(filename: string): string {
  const stem = filename.replace(/\.[^.]*$/, '');
  return `${stem || 'document'}.md`;
}

export const MARKDOWN_SAMPLE = `# Markdown 미리보기

문서를 **굵게**, *기울임*, ~~취소선~~으로 작성해 보세요.

## 사용 방법

1. 원문을 붙여넣거나 파일을 열어 주세요.
2. 오른쪽에서 미리보기를 확인하세요.
3. 수정한 문서는 Markdown 파일로 다운로드할 수 있습니다.

> 입력은 브라우저 안에서 처리합니다. 탭 전환·새로고침 시 사라집니다.

| 기능 | 지원 |
| --- | --- |
| 표 | 예 |
| 코드블록 | 예 |

- [x] 파일 열기와 드롭
- [ ] 문서 작성하기

\`\`\`json
{
  "project": "Dev Toolkit",
  "localOnly": true
}
\`\`\`

[Markdown 안내](https://commonmark.org/)

![이미지는 자동으로 불러오지 않습니다](./example.png)
`;
