// Limpieza del texto extraído y detección de párrafos y títulos.

import type { Block } from './segment';

/** Une líneas de un mismo párrafo, deshaciendo guiones de corte ("pala-\nbra" → "palabra"). */
export function joinLines(lines: string[]): string {
  let out = '';
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (!out) out = line;
    else if (/\p{L}-$/u.test(out) && /^\p{Ll}/u.test(line)) out = out.slice(0, -1) + line;
    else out += ` ${line}`;
  }
  return out.replace(/\s+/g, ' ').trim();
}

/** Un párrafo corto sin puntuación final se trata como título. */
export function looksLikeHeading(text: string): boolean {
  const t = text.trim();
  if (t.length === 0 || t.length > 90) return false;
  if (/[.,;:!?…»”"-]$/.test(t)) return false;
  if (t.split(/\s+/).length > 12) return false;
  return /^\p{Lu}|^\d+[.)]?\s+\p{Lu}|^(cap[ií]tulo|parte|libro|tema)\b/iu.test(t);
}

const PAGE_NUMBER = /^\s*(p[áa]g(ina)?\.?\s*)?[-–—]?\s*\d{1,4}\s*[-–—]?\s*(de\s+\d+)?\s*$/i;

/** Convierte texto plano en bloques. Acepta párrafos separados por líneas en blanco o por saltos simples. */
export function blocksFromPlainText(text: string): Block[] {
  const normalized = text.replace(/\r\n?/g, '\n').replace(/\t/g, ' ');
  const hasBlankLines = /\n\s*\n/.test(normalized);
  const rawParas = hasBlankLines ? normalized.split(/\n\s*\n+/) : groupWrappedLines(normalized.split('\n'));
  const blocks: Block[] = [];
  for (const para of rawParas) {
    const lines = para.split('\n').filter((l) => !PAGE_NUMBER.test(l));
    const joined = joinLines(lines);
    if (!joined) continue;
    blocks.push({ kind: lines.length === 1 && looksLikeHeading(joined) ? 'heading' : 'paragraph', text: joined });
  }
  return blocks;
}

/**
 * Sin líneas en blanco, cada salto puede ser un párrafo o un simple ajuste de línea
 * (texto copiado de un PDF). Agrupamos hasta encontrar un final de frase o un título.
 */
function groupWrappedLines(lines: string[]): string[] {
  const paras: string[] = [];
  let current: string[] = [];
  const flush = () => {
    if (current.length) paras.push(current.join('\n'));
    current = [];
  };
  // En texto ajustado, una línea "corta" respecto al ancho habitual puede ser un título.
  const width = lines.reduce((max, l) => Math.max(max, l.trim().length), 0);
  for (const line of lines) {
    if (!line.trim()) continue;
    if (current.length === 0 && line.trim().length < width * 0.7 && looksLikeHeading(line)) {
      flush();
      paras.push(line);
      continue;
    }
    current.push(line);
    if (/[.!?…:»”"]\s*$/.test(line)) flush();
  }
  flush();
  return paras;
}

/** Markdown sencillo → bloques (títulos con #, listas, citas; se elimina el formato). */
export function blocksFromMarkdown(md: string): Block[] {
  const blocks: Block[] = [];
  let buffer: string[] = [];
  const flush = () => {
    const text = joinLines(buffer);
    if (text) blocks.push({ kind: 'paragraph', text });
    buffer = [];
  };
  const clean = (s: string) =>
    s
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/`{1,3}([^`]*)`{1,3}/g, '$1')
      .replace(/(\*\*|__)(.*?)\1/g, '$2')
      .replace(/(\*|_)(.*?)\1/g, '$2')
      .replace(/<[^>]+>/g, '');
  let inCode = false;
  for (const line of md.replace(/\r\n?/g, '\n').split('\n')) {
    if (/^\s*```/.test(line)) {
      inCode = !inCode;
      flush();
      continue;
    }
    if (inCode) continue;
    const heading = line.match(/^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/);
    if (heading) {
      flush();
      const text = clean(heading[1]).trim();
      if (text) blocks.push({ kind: 'heading', text });
      continue;
    }
    if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line) || !line.trim()) {
      flush();
      continue;
    }
    const item = line.match(/^\s*(?:[-*+]|\d+[.)])\s+(.*)$/);
    if (item) {
      flush();
      buffer.push(clean(item[1]));
      flush();
      continue;
    }
    buffer.push(clean(line.replace(/^\s*>\s?/, '')));
  }
  flush();
  return blocks;
}

/** Extrae bloques legibles de un documento HTML (artículos web, DOCX convertido…). */
export function blocksFromHtml(html: string): Block[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, style, noscript, nav, header, footer, aside, form, button, svg, iframe, template, figure img').forEach((el) => el.remove());
  const root = doc.querySelector('article') ?? doc.querySelector('main') ?? doc.body;
  if (!root) return [];
  const selector = 'h1, h2, h3, h4, h5, h6, p, li, blockquote, pre, dt, dd, figcaption, td, th';
  const elements = Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(
    (el) => !el.querySelector(selector),
  );
  const blocks: Block[] = [];
  for (const el of elements) {
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    blocks.push({ kind: /^H[1-6]$/.test(el.tagName) ? 'heading' : 'paragraph', text });
  }
  if (blocks.length === 0) return blocksFromPlainText(root.textContent ?? '');
  return blocks;
}
