// Conversión de números a palabras en español (cardinales, ordinales, romanos).

const UNITS = [
  'cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve',
  'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve',
  'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete',
  'veintiocho', 'veintinueve',
];
const TENS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const HUNDREDS = [
  '', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos',
  'ochocientos', 'novecientos',
];

export type Gender = 'm' | 'f';

function below100(n: number): string {
  if (n < 30) return UNITS[n];
  const t = Math.floor(n / 10);
  const u = n % 10;
  return u ? `${TENS[t]} y ${UNITS[u]}` : TENS[t];
}

function below1000(n: number): string {
  if (n === 100) return 'cien';
  const h = Math.floor(n / 100);
  const r = n % 100;
  const parts: string[] = [];
  if (h) parts.push(HUNDREDS[h]);
  if (r) parts.push(below100(r));
  return parts.join(' ');
}

/** "uno" → "un", "veintiuno" → "veintiún" (delante de sustantivo masculino o de "mil"/"millones"). */
function apocopate(words: string): string {
  return words.replace(/veintiuno$/, 'veintiún').replace(/\buno$/, 'un');
}

/** Número cardinal en palabras. Admite enteros de 0 hasta 10^15 - 1. */
export function cardinal(n: number): string {
  if (!Number.isFinite(n) || n < 0 || n >= 1e15 || !Number.isInteger(n)) return String(n);
  if (n === 0) return 'cero';
  const millions = Math.floor(n / 1e6);
  const thousands = Math.floor((n % 1e6) / 1000);
  const rest = n % 1000;
  const parts: string[] = [];
  if (millions) parts.push(millions === 1 ? 'un millón' : `${apocopate(cardinal(millions))} millones`);
  if (thousands) parts.push(thousands === 1 ? 'mil' : `${apocopate(below1000(thousands))} mil`);
  if (rest) parts.push(below1000(rest));
  return parts.join(' ');
}

/**
 * Cardinal concordado con el sustantivo que le sigue:
 * "21 personas" → "veintiuna personas", "1 libro" → "un libro", "200 casas" → "doscientas casas".
 */
export function cardinalFor(n: number, gender: Gender | null): string {
  const words = cardinal(n);
  if (!gender) return words;
  if (gender === 'm') return apocopate(words);
  // Femenino: solo cambia la parte por debajo del millón ("doscientos millones de personas" no cambia).
  if (n >= 1e6 && n % 1e6 === 0) return words;
  const idx = words.lastIndexOf('millones');
  const idx2 = words.lastIndexOf('millón');
  const cut = Math.max(idx >= 0 ? idx + 'millones'.length : -1, idx2 >= 0 ? idx2 + 'millón'.length : -1);
  const head = cut > 0 ? words.slice(0, cut) : '';
  const tail = cut > 0 ? words.slice(cut) : words;
  const fem = tail
    .replace(/ientos\b/g, 'ientas')
    .replace(/veintiuno$/, 'veintiuna')
    .replace(/\buno$/, 'una')
    .replace(/veintiún mil/, 'veintiuna mil')
    .replace(/\bun mil\b/, 'una mil');
  return head + fem;
}

const ORD_UNITS = ['', 'primero', 'segundo', 'tercero', 'cuarto', 'quinto', 'sexto', 'séptimo', 'octavo', 'noveno'];
const ORD_TENS = [
  '', 'décimo', 'vigésimo', 'trigésimo', 'cuadragésimo', 'quincuagésimo', 'sexagésimo', 'septuagésimo',
  'octogésimo', 'nonagésimo',
];
const ORD_HUNDREDS = [
  '', 'centésimo', 'ducentésimo', 'tricentésimo', 'cuadringentésimo', 'quingentésimo', 'sexcentésimo',
  'septingentésimo', 'octingentésimo', 'noningentésimo',
];

/** Ordinal en palabras (1–999). Fuera de rango devuelve el cardinal. */
export function ordinal(n: number, gender: Gender = 'm', apocope = false): string {
  if (!Number.isInteger(n) || n < 1 || n > 999) return cardinal(n);
  let words: string;
  if (n === 11) words = 'undécimo';
  else if (n === 12) words = 'duodécimo';
  else if (n > 12 && n < 20) words = `decimo${ORD_UNITS[n - 10]}`;
  else {
    const h = Math.floor(n / 100);
    const t = Math.floor((n % 100) / 10);
    const u = n % 10;
    const r = n % 100;
    const parts: string[] = [];
    if (h) parts.push(ORD_HUNDREDS[h]);
    if (r === 11) parts.push('undécimo');
    else if (r === 12) parts.push('duodécimo');
    else {
      if (t) parts.push(ORD_TENS[t]);
      if (u) parts.push(ORD_UNITS[u]);
    }
    words = parts.join(' ');
  }
  if (gender === 'f') return words.replace(/o\b/g, 'a');
  if (apocope) return words.replace(/(primer|tercer)o$/, '$1');
  return words;
}

const ROMAN: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };

export function toRoman(n: number): string {
  const table: [number, string][] = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
    [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ];
  let out = '';
  for (const [v, s] of table) {
    while (n >= v) {
      out += s;
      n -= v;
    }
  }
  return out;
}

/** Convierte un número romano canónico a entero, o null si no es válido. */
export function parseRoman(s: string): number | null {
  if (!/^[IVXLCDM]+$/.test(s)) return null;
  let total = 0;
  for (let i = 0; i < s.length; i++) {
    const v = ROMAN[s[i]];
    const next = ROMAN[s[i + 1]] ?? 0;
    total += v < next ? -v : v;
  }
  return total > 0 && toRoman(total) === s ? total : null;
}

/** Lee una secuencia de dígitos uno a uno ("0034" → "cero cero tres cuatro"). */
export function digits(s: string): string {
  return s
    .split('')
    .filter((c) => /\d/.test(c))
    .map((c) => UNITS[Number(c)])
    .join(' ');
}
