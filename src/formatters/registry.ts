import type { Formatter, PlannedFormatter } from './types.ts';
import { sqlFormatter } from './sql/index.ts';
import { jsonFormatter } from './json/index.ts';
import { xmlFormatter } from './xml/index.ts';
export const formatters: readonly (Formatter | PlannedFormatter)[] = [
  jsonFormatter,
  sqlFormatter,
  xmlFormatter,
  { id: 'yaml', name: 'YAML · 추후 구현 예정', available: false },
];
export function getFormatter(id: string): Formatter {
  const formatter = formatters.find(item => item.id === id);
  if (!formatter?.available) throw new Error('사용할 수 없는 포맷입니다.');
  return formatter;
}
