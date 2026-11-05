import { readFile } from '../../services/files.ts';

// Decode and check before replacing the editor or its filename.
export async function readXmlFile(file: File): Promise<string> {
  const text = await readFile(file, ['xml', 'txt']);
  if (/^(?:\0|<\0)/.test(text)) throw new Error('UTF-16·UTF-32는 지원하지 않습니다. UTF-8 파일을 선택하세요.');
  const declaration = /^<\?xml[ \t\r\n]+([\s\S]*?)\?>/.exec(text);
  const encoding = declaration && /[ \t\r\n]encoding[ \t\r\n]*=[ \t\r\n]*(['"])([^'"]+)\1/.exec(' ' + declaration[1]);
  if (encoding && !/^utf-8$/i.test(encoding[2])) throw new Error('XML 선언의 인코딩은 UTF-8만 지원합니다. 기존 입력을 유지합니다.');
  return text;
}
