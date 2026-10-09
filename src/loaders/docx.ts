// DOCX → HTML con mammoth (respeta títulos y listas del documento de Word).

import mammoth from 'mammoth/mammoth.browser.js';

export async function htmlFromDocx(buffer: ArrayBuffer): Promise<string> {
  const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
  return result.value;
}
