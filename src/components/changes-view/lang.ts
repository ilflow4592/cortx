/** 파일 확장자 → Monaco language id 매핑. */

const EXT_LANG: Record<string, string> = {
  java: 'java',
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  json: 'json',
  md: 'markdown',
  yml: 'yaml',
  yaml: 'yaml',
  xml: 'xml',
  html: 'html',
  css: 'css',
  sql: 'sql',
  sh: 'shell',
  py: 'python',
  kt: 'kotlin',
  gradle: 'groovy',
  properties: 'ini',
  toml: 'ini',
};

export function getLanguageFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  return EXT_LANG[ext] || 'plaintext';
}
