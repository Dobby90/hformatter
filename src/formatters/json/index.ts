import type { Formatter } from '../types.ts';
import { processJson } from './engine.ts';

export const jsonFormatter: Formatter = {
  id: 'json', name: 'JSON', available: true, extensions: ['json', 'txt'], language: 'json',
  capabilities: { format: true, minify: true, validate: true },
  options: { indent: { label: '들여쓰기', default: '2', values: ['2', '4', 'tab'] } },
  format: (text, options) => processJson(text, 'format', options),
  minify: (text, options) => processJson(text, 'minify', options),
  validate: (text, options) => processJson(text, 'validate', options),
};
