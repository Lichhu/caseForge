/** 将紧凑或杂乱 XML 格式化为 Tab 缩进（与 ESB 报文示例一致） */
export function prettyPrintXml(xml: string, indentChar = '\t'): string {
  const source = xml.trim().replace(/>\s+</g, '><');
  if (!source.startsWith('<')) return xml;

  const lines = source
    .replace(/></g, '>\n<')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  let depth = 0;
  const result: string[] = [];

  for (const line of lines) {
    if (/^<\//.test(line)) {
      depth = Math.max(0, depth - 1);
    }
    result.push(`${indentChar.repeat(depth)}${line}`);
    if (/^<[^!?/][^>]*[^/]>$/.test(line)) {
      depth += 1;
    }
  }

  return `${result.join('\n')}\n`;
}

/** 去除 XML 换行与缩进，用于 TCP 发送 */
export function minifyXml(xml: string): string {
  return xml.replace(/>\s+</g, '><').trim();
}

/** 将字面量 \\n \\t 转为真实换行/制表（修复 AI 或错误序列化） */
export function unescapeLiteralXmlEscapes(value: string): string {
  if (!value.includes('\\n') && !value.includes('\\t')) {
    return value;
  }
  const stripped = value.replace(/\\n|\\t|\\r/g, '');
  if (!stripped.includes('<')) {
    return value;
  }
  return value.replace(/\\r/g, '\r').replace(/\\n/g, '\n').replace(/\\t/g, '\t');
}

export function looksLikeXml(value: string): boolean {
  const trimmed = unescapeLiteralXmlEscapes(value).trim();
  return trimmed.startsWith('<') && trimmed.includes('</');
}
