// PDF → bloques de texto con pdf.js, reconstruyendo líneas y párrafos a partir de
// las posiciones del texto y eliminando cabeceras, pies y números de página.

import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import { joinLines, looksLikeHeading } from '../text/blocks';
import type { Block } from '../text/segment';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

interface Line {
  text: string;
  y: number;
  x: number;
  height: number;
}

function pageLines(items: TextItem[]): Line[] {
  const lines: Line[] = [];
  let current: Line | null = null;
  for (const item of items) {
    const [, , , , x, y] = item.transform;
    const height = Math.abs(item.height || item.transform[3]) || 10;
    if (current && Math.abs(current.y - y) > height * 0.5) {
      lines.push(current);
      current = null;
    }
    if (!current) current = { text: '', y, x, height };
    if (item.str) {
      // pdf.js no siempre incluye los espacios entre fragmentos de la misma línea.
      const needsSpace = current.text && !/\s$/.test(current.text) && !/^\s/.test(item.str);
      current.text += (needsSpace ? ' ' : '') + item.str;
      current.height = Math.max(current.height, height);
    }
    if (item.hasEOL) {
      lines.push(current);
      current = null;
    }
  }
  if (current) lines.push(current);
  return lines
    .map((l) => ({ ...l, text: l.text.replace(/\s+/g, ' ').trim() }))
    .filter((l) => l.text);
}

const PAGE_NUMBER = /^\s*(p[áa]g(ina)?\.?\s*)?[-–—]?\s*\d{1,4}\s*[-–—]?\s*(de\s+\d+)?\s*$/i;

export async function blocksFromPdf(buffer: ArrayBuffer): Promise<Block[]> {
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  const pages: Line[][] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    pages.push(pageLines(content.items.filter((i): i is TextItem => 'str' in i)));
  }

  // Cabeceras y pies repetidos: la primera y última línea de cada página que se repiten.
  const edgeCount = new Map<string, number>();
  const edgeKey = (t: string) => t.replace(/\d+/g, '#').toLowerCase();
  for (const lines of pages) {
    for (const l of [lines[0], lines[lines.length - 1]]) {
      if (l) edgeCount.set(edgeKey(l.text), (edgeCount.get(edgeKey(l.text)) ?? 0) + 1);
    }
  }
  const repeated = (t: string) => pages.length >= 3 && (edgeCount.get(edgeKey(t)) ?? 0) >= Math.max(3, pages.length * 0.4);

  const blocks: Block[] = [];
  let pending: string[] = [];
  const flush = () => {
    const text = joinLines(pending);
    pending = [];
    if (!text) return;
    blocks.push({ kind: looksLikeHeading(text) && text.length < 80 ? 'heading' : 'paragraph', text });
  };

  for (const lines of pages) {
    const kept = lines.filter((l, i) => {
      if (PAGE_NUMBER.test(l.text)) return false;
      if ((i === 0 || i === lines.length - 1) && repeated(l.text)) return false;
      return true;
    });
    const lengths = kept.map((l) => l.text.length).sort((a, b) => a - b);
    const typical = lengths[Math.floor(lengths.length * 0.75)] ?? 0;
    const heights = kept.map((l) => l.height).sort((a, b) => a - b);
    const bodyHeight = heights[Math.floor(heights.length / 2)] ?? 10;

    kept.forEach((line, i) => {
      const prev = kept[i - 1];
      if (prev) {
        const gap = prev.y - line.y;
        const bigGap = gap > Math.max(prev.height, line.height) * 1.7 || gap < 0;
        const prevEndsShort = /[.!?…:»”"]$/.test(prev.text) && prev.text.length < typical * 0.85;
        const fontChange = Math.abs(line.height - prev.height) > bodyHeight * 0.2;
        const indented = line.x - prev.x > bodyHeight * 1.2 && /[.!?…:»”"]$/.test(prev.text);
        if (bigGap || prevEndsShort || fontChange || indented) flush();
      }
      pending.push(line.text);
    });
    // Un párrafo puede continuar en la página siguiente si no terminó en punto.
    const last = kept[kept.length - 1];
    if (last && /[.!?…:»”"]$/.test(last.text)) flush();
  }
  flush();
  await pdf.destroy();
  return blocks;
}
