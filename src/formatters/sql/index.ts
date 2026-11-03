import type { Formatter } from '../types.ts';
export const sqlFormatter: Formatter = {
  id: 'sql', name: 'SQL', available: true, extensions: ['sql', 'txt'], language: 'sql',
  capabilities: { format: true, minify: false, validate: true },
  options: { indent: { label: '들여쓰기', default: '2', values: ['2', '4', 'tab'] } },
  format: async (text, options) => (await import('./engine.ts')).processSql(text, 'format', options),
  validate: async (text, options) => (await import('./engine.ts')).processSql(text, 'validate', options),
};
