import { storage } from '#imports';

/** 自定义解析的默认代码 */
export const DEFAULT_PARSER_CODE = `// data 是解析后的 JSON；返回标准需求数组
return data.map((item) => ({
  id: item.id,              // 可选：外部唯一编号
  name: item.name,
  description: item.desc ?? '',
  expiresAt: null,
  headers: item.headers
}));`;

const parserItem = storage.defineItem<string>('local:parserCode', {
  fallback: DEFAULT_PARSER_CODE,
});

export function loadParserCode(): Promise<string> {
  return parserItem.getValue();
}

export function saveParserCode(code: string): Promise<void> {
  return parserItem.setValue(code);
}
