import type { Formatter } from '../types.ts';
import { processXml } from './engine.ts';

export const xmlFormatter: Formatter = {
  id: 'xml', name: 'XML', available: true, extensions: ['xml', 'txt'], language: 'xml',
  sample: '<?xml version="1.0" encoding="UTF-8"?>\n<catalog xmlns="urn:example" xmlns:p="urn:product"><!-- 예제 --><p:item id="1"><name>한글 &amp; XML</name><description><![CDATA[<텍스트>]]></description></p:item></catalog>',
  capabilities: { format: true, minify: false, validate: true },
  options: { indent: { label: '들여쓰기', default: '2', values: ['2', '4', 'tab'] } },
  format: (text, options) => processXml(text, 'format', options),
  validate: (text, options) => processXml(text, 'validate', options),
};
