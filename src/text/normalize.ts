// Preparación del texto en español para la síntesis de voz.
//
// Los motores de voz suenan más naturales cuando reciben texto "hablable": sin
// abreviaturas ni símbolos, con los números escritos con la concordancia correcta
// y con una puntuación que marque bien las pausas y la entonación.

import { cardinal, cardinalFor, digits, ordinal, parseRoman, type Gender } from './numbers';

const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre',
  'noviembre', 'diciembre',
];

/** Abreviaturas frecuentes → forma hablada. La clave es exactamente como aparece en el texto. */
const ABBREVIATIONS: [RegExp, string][] = [
  [/\bEE\.\s?UU\./g, 'Estados Unidos'],
  [/\bEEUU\b/g, 'Estados Unidos'],
  [/\bp\.\s?ej\./gi, 'por ejemplo'],
  [/\bv\.\s?gr\./gi, 'por ejemplo'],
  [/\bi\.\s?e\./g, 'es decir'],
  [/\bSrta\./g, 'señorita'],
  [/\bSres\./g, 'señores'],
  [/\bSras\./g, 'señoras'],
  [/\bSra\./g, 'señora'],
  [/\bSr\./g, 'señor'],
  [/\bDra\./g, 'doctora'],
  [/\bDr\./g, 'doctor'],
  [/\bDña\./g, 'doña'],
  [/\bDª/g, 'doña'],
  [/\bLic\./g, 'licenciado'],
  [/\bIng\./g, 'ingeniero'],
  [/\bProf\./g, 'profesor'],
  [/\bProfa\./g, 'profesora'],
  [/\bUds\./g, 'ustedes'],
  [/\bUd\./g, 'usted'],
  [/\bVds\./g, 'ustedes'],
  [/\bVd\./g, 'usted'],
  [/\bStgo\./g, 'Santiago'],
  [/\bpágs\./gi, 'páginas'],
  [/\bpág\./gi, 'página'],
  [/\bpp\.(?=\s*\d)/g, 'páginas'],
  [/\bp\.(?=\s*\d)/g, 'página'],
  [/\bcap\.(?=\s*\d)/gi, 'capítulo'],
  [/\bvol\.(?=\s*\d)/gi, 'volumen'],
  [/\bart\.(?=\s*\d)/gi, 'artículo'],
  [/\bfig\.(?=\s*\d)/gi, 'figura'],
  [/\bed\.(?=\s*\d)/gi, 'edición'],
  [/\b[Nn]\.?\s?º\s?(?=\d)/g, 'número '],
  [/\b[Nn]\.o\s?(?=\d)/g, 'número '],
  [/\b[Nn]úm\.(?=\s*\d)/g, 'número'],
  [/\btel\.(?=\s*[\d+])/gi, 'teléfono'],
  [/\bAvda\./g, 'avenida'],
  [/\bAv\./g, 'avenida'],
  [/\bC\/\s?(?=[A-ZÁÉÍÓÚÑ])/g, 'calle '],
  [/\bc\/\s?(?=[A-ZÁÉÍÓÚÑ])/g, 'calle '],
  [/\bPza\./g, 'plaza'],
  [/\bctra\./gi, 'carretera'],
  [/\bdcha\./gi, 'derecha'],
  [/\bizq\./gi, 'izquierda'],
  [/\bS\.\s?A\.(?=\s|$|,)/g, 'sociedad anónima'],
  [/\bS\.\s?L\.(?=\s|$|,)/g, 'sociedad limitada'],
  [/\baprox\./gi, 'aproximadamente'],
  [/\bapdo\./gi, 'apartado'],
  [/\batte\./gi, 'atentamente'],
  [/\bdpto\./gi, 'departamento'],
  [/\bentlo\./gi, 'entresuelo'],
  [/\bsig\./gi, 'siguiente'],
  [/\bsigs\./gi, 'siguientes'],
  [/\bcf\./gi, 'compárese'],
  [/\bvs\.?(?=\s)/g, 'contra'],
  [/\ba\.\s?C\./g, 'antes de Cristo'],
  [/\bd\.\s?C\./g, 'después de Cristo'],
  [/\ba\.\s?m\./g, 'de la mañana'],
  [/\bp\.\s?m\./g, 'de la tarde'],
  [/\betc\.(?=\s*[a-záéíóúñ,;:)]|$)/g, 'etcétera,'],
  [/\betc\./g, 'etcétera.'],
];

/** Unidades tras un número: [regex del símbolo, singular, plural]. */
const UNITS: [string, string, string, Gender | null][] = [
  ['km/h', 'kilómetro por hora', 'kilómetros por hora', 'm'],
  ['m²', 'metro cuadrado', 'metros cuadrados', 'm'],
  ['m2', 'metro cuadrado', 'metros cuadrados', 'm'],
  ['km²', 'kilómetro cuadrado', 'kilómetros cuadrados', 'm'],
  ['m³', 'metro cúbico', 'metros cúbicos', 'm'],
  ['°C', 'grado centígrado', 'grados centígrados', 'm'],
  ['ºC', 'grado centígrado', 'grados centígrados', 'm'],
  ['°', 'grado', 'grados', 'm'],
  ['km', 'kilómetro', 'kilómetros', 'm'],
  ['cm', 'centímetro', 'centímetros', 'm'],
  ['mm', 'milímetro', 'milímetros', 'm'],
  ['m', 'metro', 'metros', 'm'],
  ['kg', 'kilo', 'kilos', 'm'],
  ['mg', 'miligramo', 'miligramos', 'm'],
  ['gr', 'gramo', 'gramos', 'm'],
  ['g', 'gramo', 'gramos', 'm'],
  ['ml', 'mililitro', 'mililitros', 'm'],
  ['l', 'litro', 'litros', 'm'],
  ['h', 'hora', 'horas', 'f'],
  ['min', 'minuto', 'minutos', 'm'],
  ['seg', 'segundo', 'segundos', 'm'],
  ['GB', 'gigabyte', 'gigabytes', 'm'],
  ['MB', 'megabyte', 'megabytes', 'm'],
  ['€', 'euro', 'euros', 'm'],
  ['$', 'dólar', 'dólares', 'm'],
  ['US$', 'dólar', 'dólares', 'm'],
  ['£', 'libra', 'libras', 'f'],
  ['%', 'por ciento', 'por ciento', null],
];

/** Sustantivos que no siguen la regla "termina en -a → femenino". */
const MASCULINE_A = new Set([
  'día', 'días', 'mapa', 'mapas', 'tema', 'temas', 'problema', 'problemas', 'programa', 'programas', 'sistema',
  'sistemas', 'idioma', 'idiomas', 'clima', 'climas', 'planeta', 'planetas', 'poema', 'poemas', 'drama', 'dramas',
  'esquema', 'esquemas', 'cometa', 'cometas', 'sofá', 'sofás', 'papá', 'papás', 'dilema', 'dilemas', 'lema',
  'teorema', 'teoremas', 'síntoma', 'síntomas', 'diploma', 'diplomas', 'enigma', 'enigmas', 'fantasma',
  'fantasmas', 'pijama', 'pijamas', 'tranvía', 'tranvías', 'guardia', 'guardias', 'atleta', 'atletas',
  'artista', 'artistas', 'turista', 'turistas', 'periodista', 'periodistas', 'dentista', 'dentistas',
]);
const FEMININE_OTHER = new Set([
  'mano', 'manos', 'foto', 'fotos', 'moto', 'motos', 'vez', 'veces', 'mujer', 'mujeres', 'noche', 'noches',
  'gente', 'calle', 'calles', 'clase', 'clases', 'parte', 'partes', 'muerte', 'muertes', 'suerte', 'leche',
  'nave', 'naves', 'llave', 'llaves', 'red', 'redes', 'piel', 'pieles', 'ley', 'leyes', 'flor', 'flores',
  'imagen', 'imágenes', 'razón', 'razones', 'tarde', 'tardes', 'frase', 'frases', 'cárcel', 'madre', 'madres',
  'sal', 'miel', 'fe', 'sed', 'hambre', 'fuente', 'fuentes', 'torre', 'torres', 'carne', 'carnes', 'nube',
  'nubes', 'orden', 'órdenes', 'radio', 'labor', 'labores', 'catedral', 'catedrales', 'serie', 'series',
  'especie', 'especies', 'superficie', 'superficies', 'nariz', 'raíz', 'raíces', 'paz', 'luz', 'luces', 'voz',
  'voces', 'cruz', 'cruces', 'crisis', 'tesis', 'dosis', 'base', 'bases', 'fase', 'fases', 'clave', 'claves',
  'mente', 'mentes', 'corriente', 'corrientes', 'edad', 'edades', 'col', 'cumbre', 'cumbres',
]);

export function guessGender(word: string | undefined): Gender | null {
  if (!word) return null;
  const w = word.toLowerCase();
  if (!/^[a-záéíóúüñ]+$/.test(w)) return null;
  if (MASCULINE_A.has(w)) return 'm';
  if (FEMININE_OTHER.has(w)) return 'f';
  if (/(ción|ciones|sión|siones|dad|dades|tad|tades|tud|tudes|umbre|umbres|itis)$/.test(w)) return 'f';
  if (/(a|as)$/.test(w)) return 'f';
  if (/(o|os|or|ores|aje|ajes|ma|mas|án|ón|ones|és|e|es|l|les|n|r|s|z)$/.test(w)) return 'm';
  return null;
}

/** "1.234.567" → 1234567; "3,5" → 3.5 (formato español). */
function parseSpanishNumber(s: string): { int: number; dec: string | null } | null {
  const m = s.match(/^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?$/);
  if (!m) return null;
  return { int: Number(m[1].replace(/\./g, '')), dec: m[2] ?? null };
}

function numberWords(s: string, gender: Gender | null): string {
  const parsed = parseSpanishNumber(s);
  if (!parsed) return s;
  const { int, dec } = parsed;
  // Números muy largos sin separadores (teléfonos, códigos) se leen por cifras.
  if (!dec && /^\d{9,}$/.test(s)) return digitGroups(s);
  if (!dec && /^0\d+$/.test(s)) return digits(s);
  let words = cardinalFor(int, dec ? null : gender);
  if (dec) {
    const decWords = /^0/.test(dec) || dec.length > 2 ? digits(dec) : cardinal(Number(dec));
    words = `${words} coma ${decWords}`;
  }
  return words;
}

/** "600123456" → "seiscientos, doce, treinta y cuatro, cincuenta y seis" (lectura por grupos). */
function digitGroups(s: string): string {
  const groups = s.length === 9 ? [s.slice(0, 3), s.slice(3, 5), s.slice(5, 7), s.slice(7)] : s.match(/.{1,3}/g)!;
  return groups.map((g) => (g.startsWith('0') ? digits(g) : cardinal(Number(g)))).join(', ');
}

function timeWords(h: number, m: number): string {
  const hour = h === 1 || h === 13 ? 'una' : cardinalFor(h, 'f');
  if (m === 0) return `${hour} en punto`;
  if (m === 15) return `${hour} y cuarto`;
  if (m === 30) return `${hour} y media`;
  return `${hour} y ${cardinal(m)}`;
}

const NUM = String.raw`\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?`;
const ROMAN_KEYWORDS =
  'siglo|siglos|capítulo|capítulos|tomo|tomos|volumen|libro|parte|título|acto|escena|fase|canto|sección|artículo|apartado|anexo|tema|lección|unidad|bloque';

/** Prepara un fragmento (una frase) para ser leído en voz alta. */
export function normalizeForSpeech(input: string): string {
  let s = ` ${input} `;

  // Caracteres invisibles, comillas tipográficas y espacios raros.
  s = s.replace(/[­​-‍﻿]/g, '').replace(/[   ]/g, ' ');

  // Enlaces y correos.
  s = s.replace(/\bhttps?:\/\/\S+|\bwww\.\S+/gi, (url) => {
    const host = url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split(/[/?#]/)[0];
    return ` enlace a ${host.replace(/\./g, ' punto ')} `;
  });
  s = s.replace(/\b([\w.+-]+)@([\w-]+(?:\.[\w-]+)+)\b/g, (_m, user: string, domain: string) =>
    ` ${user.replace(/\./g, ' punto ')} arroba ${domain.replace(/\./g, ' punto ')} `,
  );

  // Formato markdown residual y viñetas.
  s = s.replace(/[*_`#]+/g, '').replace(/^\s*[•·▪◦‣●■□➢►-]\s+/, ' ');

  // Fechas: 12/05/2024 → doce de mayo de dos mil veinticuatro.
  s = s.replace(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4}|\d{2})\b/g, (m, d: string, mo: string, y: string) => {
    const day = Number(d);
    const month = Number(mo);
    if (day < 1 || day > 31 || month < 1 || month > 12) return m;
    const year = cardinal(Number(y));
    return `${cardinal(day)} de ${MONTHS[month - 1]} de ${year}`;
  });

  // Horas: 10:30 → diez y media.
  s = s.replace(/\b([01]?\d|2[0-4]):([0-5]\d)(?:\s?h\b)?/g, (_m, h: string, mi: string) =>
    timeWords(Number(h), Number(mi)),
  );

  // Ordinales: 1.º, 2.ª, 3.er, 4º, 1er.
  s = s.replace(/\b(\d{1,3})\.?\s?(er|ª|º|o|a)(?=[\s,.;:)]|$)/g, (m, n: string, suf: string, offset: number, all: string) => {
    // "5º C" es temperatura; "3o"/"3a" solo cuentan con punto (3.o), para no confundir.
    if ((suf === 'o' || suf === 'a') && all[offset + n.length] !== '.') return m;
    if (suf === 'º' && /^\s*(C|F)\b/.test(all.slice(offset + m.length))) return m;
    const num = Number(n);
    if (suf === 'er') return ordinal(num, 'm', true);
    return ordinal(num, suf === 'ª' || suf === 'a' ? 'f' : 'm');
  });

  // Números romanos tras palabras clave: "siglo XXI" → "siglo veintiuno".
  s = s.replace(
    new RegExp(`\\b(${ROMAN_KEYWORDS})\\s+([IVXLCDM]+)\\b`, 'gi'),
    (m, kw: string, roman: string) => {
      const n = parseRoman(roman);
      return n ? `${kw} ${cardinal(n)}` : m;
    },
  );

  // Rangos numéricos: 1990-2000 → 1990 a 2000.
  s = s.replace(new RegExp(`(${NUM})\\s?[-–]\\s?(${NUM})`, 'g'), '$1 a $2');

  // Unidades y monedas tras un número: "20 €", "3,5 km", "50%".
  for (const [sym, sing, plur, gender] of UNITS) {
    const esc = sym.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    const after = /\w$/.test(sym) ? '(?![\\wáéíóúñ])' : '';
    s = s.replace(new RegExp(`(${NUM})\\s?${esc}${after}`, 'g'), (_m, n: string) => {
      const parsed = parseSpanishNumber(n);
      const one = parsed && parsed.int === 1 && !parsed.dec;
      return `${numberWords(n, gender)} ${one ? sing : plur}`;
    });
  }
  // Moneda delante: "€20", "$ 5".
  s = s.replace(new RegExp(`(US\\$|\\$|€|£)\\s?(${NUM})`, 'g'), (_m, sym: string, n: string) => {
    const unit = UNITS.find((u) => u[0] === sym)!;
    const parsed = parseSpanishNumber(n);
    const one = parsed && parsed.int === 1 && !parsed.dec;
    return `${numberWords(n, unit[3])} ${one ? unit[1] : unit[2]}`;
  });

  // Abreviaturas.
  for (const [re, rep] of ABBREVIATIONS) s = s.replace(re, rep);

  // Resto de números, concordando con el sustantivo siguiente.
  s = s.replace(new RegExp(`(?<![\\w,.])(${NUM})(?![\\w])(\\s+([a-záéíóúüñA-ZÁÉÍÓÚÜÑ]+))?`, 'g'),
    (_m, n: string, tail: string | undefined, next: string | undefined) => {
      const gender = next && next.toLowerCase() !== 'de' ? guessGender(next) : null;
      return numberWords(n, gender) + (tail ?? '');
    },
  );

  // Símbolos sueltos.
  s = s
    .replace(/\s&\s/g, ' y ')
    .replace(/\by\/o\b/gi, 'y o')
    .replace(/\s\+\s/g, ' más ')
    .replace(/\s=\s/g, ' igual a ')
    .replace(/§\s?/g, 'sección ')
    .replace(/\s@\s/g, ' arroba ')
    .replace(/\s\/\s/g, ', ');

  // Incisos: paréntesis y rayas se convierten en pausas breves.
  s = s.replace(/\s*[([]\s*/g, ', ').replace(/\s*[)\]]\s*(?=[.,;:!?…])/g, '').replace(/\s*[)\]]\s*/g, ', ');
  s = s.replace(/^\s*[—–-]\s*/, ' '); // raya de diálogo al inicio
  s = s.replace(/\s*[—–]\s*(?=[.,;:!?…])/g, '').replace(/\s*[—–]\s*/g, ', ').replace(/\s+-\s+/g, ', ');

  // Comillas: no aportan a la voz.
  s = s.replace(/[«»“”„"]/g, '').replace(/(^|\s)['‘’]|['‘’](?=\s|[.,;:!?]|$)/g, '$1');

  // Palabras en MAYÚSCULAS largas → minúsculas para evitar que se deletreen o se griten.
  if (/^[^a-záéíóúüñ]*$/.test(s) && /[A-ZÁÉÍÓÚÜÑ]{2,}/.test(s)) {
    s = s.toLowerCase().replace(/^\s*\p{L}/u, (c) => c.toUpperCase());
  }
  s = s.replace(/(?<!\p{L})\p{Lu}{5,}(?!\p{L})/gu, (w) => w.charAt(0) + w.slice(1).toLowerCase());

  // Puntos suspensivos.
  s = s.replace(/\.{3,}/g, '…');

  // Limpieza de espacios y puntuación duplicada.
  s = s
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?…])/g, '$1')
    .replace(/,\s*,+/g, ',')
    .replace(/,\s*([.;:!?…])/g, '$1')
    .replace(/^\s*[,;:]\s*/, '')
    .replace(/([¿¡])\s*,\s*/g, '$1')
    .trim();

  if (!s) return s;

  // Preguntas/exclamaciones sin signo de apertura: los motores entonan mejor con ambos.
  if (/\?$/.test(s) && !s.includes('¿')) s = `¿${s}`;
  if (/!$/.test(s) && !s.includes('¡')) s = `¡${s}`;

  // Toda frase termina en puntuación para que la entonación "cierre".
  // (Un fragmento cortado en una coma la conserva: la entonación queda "abierta".)
  if (!/[.!?…:;,]$/.test(s)) s += '.';

  return s;
}
