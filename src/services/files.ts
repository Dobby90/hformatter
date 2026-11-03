export const MAX_INPUT_BYTES = 10 * 1024 * 1024;
const encoder = new TextEncoder();
export const byteLength = (text: string) => encoder.encode(text).length;
export function assertInputSize(text: string) {
  if (byteLength(text) > MAX_INPUT_BYTES) throw new Error('입력은 UTF-8 기준 10 MiB까지 지원합니다. 기존 입력을 유지합니다.');
}
export async function readFile(file: File, extensions: readonly string[]): Promise<string> {
  if (!extensions.includes(file.name.split('.').at(-1)?.toLowerCase() || '')) throw new Error(extensions.map(ext => '.' + ext).join(' 또는 ') + ' 파일을 선택하세요.');
  if (file.size > MAX_INPUT_BYTES) throw new Error('파일은 UTF-8 기준 10 MiB까지 지원합니다.');
  try {
    const bytes = await file.arrayBuffer();
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch { throw new Error('파일을 읽을 수 없습니다. UTF-8 인코딩의 텍스트 파일인지 확인하세요.'); }
}
export function downloadName(filename: string, extension = 'json') { return filename ? filename.replace(/\.[^.]*$/, '') + '.formatted.' + extension : 'formatted.' + extension; }
export function download(text: string, filename: string, extension = 'json') {
  downloadFile(text, downloadName(filename, extension), extension === 'json' ? 'application/json;charset=utf-8' : 'text/plain;charset=utf-8');
}
export function downloadFile(text: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a'); link.href = url; link.download = filename;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
