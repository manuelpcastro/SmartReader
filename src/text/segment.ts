// División del documento en frases navegables.

import { normalizeForSpeech } from './normalize';

export type BlockKind = 'heading' | 'paragraph';

export interface Block {
  kind: BlockKind;
  text: string;
}

export interface Segment {
  /** Posición global de la frase. */
  index: number;
  /** Bloque (párrafo o título) al que pertenece. */
  block: number;
  kind: BlockKind;
  /** Texto tal como se muestra. */
  text: string;
  /** Texto preparado para la voz. */
  spoken: string;
  /** Última frase de su bloque: se deja una pausa más larga a continuación. */
  blockEnd: boolean;
}

/** Abreviaturas tras las que un punto no cierra la frase. */
const NON_TERMINAL = new Set([
  'sr', 'sra', 'srta', 'sres', 'sras', 'dr', 'dra', 'dña', 'd', 'lic', 'ing', 'prof', 'profa', 'ud', 'uds', 'vd',
  'vds', 'pág', 'págs', 'p', 'pp', 'cap', 'vol', 'art', 'fig', 'ed', 'núm', 'n', 'tel', 'av', 'avda', 'pza',
  'ctra', 'dcha', 'izq', 'aprox', 'apdo', 'atte', 'dpto', 'sig', 'sigs', 'cf', 'vs', 'ej', 'gr', 'ee', 'uu',
  'stgo', 'etc', 'a', 'c', 'm', 'i', 'e', 'v', 'pl', 'excmo', 'excma', 'ilmo', 'ilma', 'mons', 'gral', 'cnel',
  'tte', 'sto', 'sta', 'fdo', 'admón', 'nº',
]);

/** Abreviaturas que, aunque las siga una mayúscula, casi nunca cierran frase. */
const STRONG_NON_TERMINAL = new Set([
  'sr', 'sra', 'srta', 'sres', 'sras', 'dr', 'dra', 'dña', 'lic', 'ing', 'prof', 'profa', 'excmo', 'excma',
  'ilmo', 'ilma', 'mons', 'gral', 'cnel', 'tte', 'sto', 'sta', 'av', 'avda', 'pza', 'p', 'pp', 'pág', 'págs',
  'núm', 'n', 'vol', 'cap', 'art', 'fig',
]);

const OPENING = /^[\s"'«“‘(\[]*[¿¡—–-]?[\s"'«“‘(\[]*[\p{Lu}\d¿¡]/u;

/** Divide un párrafo en frases, respetando abreviaturas, iniciales y decimales. */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  const re = /([.!?…]+)(["'»”’)\]]*)(\s+)/g;
  let start = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const end = m.index + m[1].length + m[2].length;
    const rest = text.slice(end);
    if (!OPENING.test(rest)) continue;
    if (m[1] === '.') {
      const before = text.slice(start, m.index);
      const word = (before.match(/(\p{L}+)$/u)?.[1] ?? '').toLowerCase();
      const original = before.match(/(\p{L}+)$/u)?.[1] ?? '';
      // Inicial de nombre propio: "J. R. R. Tolkien".
      if (/^\p{Lu}$/u.test(original)) continue;
      if (STRONG_NON_TERMINAL.has(word)) continue;
      // Abreviatura seguida de minúscula/número: no es fin de frase (ya filtrado por OPENING
      // para minúsculas); seguida de número, tampoco.
      if (NON_TERMINAL.has(word) && /^\s*\d/.test(rest)) continue;
    }
    const sentence = text.slice(start, end).trim();
    if (sentence) out.push(sentence);
    start = end + m[3].length;
  }
  const tail = text.slice(start).trim();
  if (tail) out.push(tail);
  return out;
}

/**
 * Parte frases muy largas por pausas naturales (; : , —) para que cada fragmento
 * dure pocos segundos: mejora la navegación y evita cortes en algunos navegadores.
 */
export function splitLong(sentence: string, max = 200): string[] {
  if (sentence.length <= max) return [sentence];
  const mid = sentence.length / 2;
  const min = 40;
  let best = -1;
  let bestScore = Infinity;
  const re = /([;:]|,|\s[—–]|\s-)\s/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sentence))) {
    const pos = m.index + m[1].length;
    if (pos < min || sentence.length - pos < min) continue;
    // Preferimos ; y : frente a la coma.
    const weight = /[;:]/.test(m[1]) ? 0.6 : 1;
    const score = Math.abs(pos - mid) * weight;
    if (score < bestScore) {
      bestScore = score;
      best = pos;
    }
  }
  if (best < 0) {
    // Sin pausas naturales: cortamos por el espacio más cercano al centro.
    const space = sentence.lastIndexOf(' ', mid);
    if (space <= 0) return [sentence];
    best = space;
  }
  return [...splitLong(sentence.slice(0, best).trim(), max), ...splitLong(sentence.slice(best).trim(), max)];
}

export function buildSegments(blocks: Block[]): Segment[] {
  const segments: Segment[] = [];
  blocks.forEach((block, b) => {
    const pieces =
      block.kind === 'heading' ? [block.text.trim()] : splitSentences(block.text).flatMap((s) => splitLong(s));
    const valid = pieces.filter((p) => /[\p{L}\p{N}]/u.test(p));
    valid.forEach((text, i) => {
      const spoken = normalizeForSpeech(text);
      if (!spoken) return;
      segments.push({
        index: segments.length,
        block: b,
        kind: block.kind,
        text,
        spoken,
        blockEnd: i === valid.length - 1,
      });
    });
  });
  return segments;
}
