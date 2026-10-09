import { describe, expect, it } from 'vitest';
import { cardinal, cardinalFor, ordinal, parseRoman } from '../src/text/numbers';
import { normalizeForSpeech as n } from '../src/text/normalize';
import { buildSegments, splitLong, splitSentences } from '../src/text/segment';
import { blocksFromMarkdown, blocksFromPlainText } from '../src/text/blocks';

describe('numbers', () => {
  it('cardinals', () => {
    expect(cardinal(0)).toBe('cero');
    expect(cardinal(16)).toBe('dieciséis');
    expect(cardinal(21)).toBe('veintiuno');
    expect(cardinal(100)).toBe('cien');
    expect(cardinal(101)).toBe('ciento uno');
    expect(cardinal(1000)).toBe('mil');
    expect(cardinal(1998)).toBe('mil novecientos noventa y ocho');
    expect(cardinal(21000)).toBe('veintiún mil');
    expect(cardinal(1_000_000)).toBe('un millón');
    expect(cardinal(2_500_000)).toBe('dos millones quinientos mil');
  });
  it('gender agreement', () => {
    expect(cardinalFor(1, 'f')).toBe('una');
    expect(cardinalFor(21, 'm')).toBe('veintiún');
    expect(cardinalFor(21, 'f')).toBe('veintiuna');
    expect(cardinalFor(300, 'f')).toBe('trescientas');
    expect(cardinalFor(2_000_000, 'f')).toBe('dos millones');
  });
  it('ordinals and romans', () => {
    expect(ordinal(1)).toBe('primero');
    expect(ordinal(1, 'f')).toBe('primera');
    expect(ordinal(3, 'm', true)).toBe('tercer');
    expect(ordinal(13)).toBe('decimotercero');
    expect(ordinal(21, 'f')).toBe('vigésima primera');
    expect(parseRoman('XXI')).toBe(21);
    expect(parseRoman('IIII')).toBeNull();
  });
});

describe('normalizeForSpeech', () => {
  it('expands abbreviations', () => {
    expect(n('El Sr. García y la Dra. López')).toBe('El señor García y la doctora López.');
    expect(n('Viven en EE. UU. desde hace años')).toBe('Viven en Estados Unidos desde hace años.');
  });
  it('reads numbers with agreement', () => {
    expect(n('Había 21 personas y 1 perro')).toBe('Había veintiuna personas y un perro.');
    expect(n('Cuesta 1.500 €')).toBe('Cuesta mil quinientos euros.');
    expect(n('Subió un 3,5%')).toBe('Subió un tres coma cinco por ciento.');
    expect(n('Recorrió 12 km')).toBe('Recorrió doce kilómetros.');
  });
  it('dates, times, ordinals, centuries', () => {
    expect(n('Nació el 12/05/1990')).toBe('Nació el doce de mayo de mil novecientos noventa.');
    expect(n('Quedamos a las 10:30')).toBe('Quedamos a las diez y media.');
    expect(n('Vive en el 3.er piso')).toBe('Vive en el tercer piso.');
    expect(n('Es la 2.ª vez')).toBe('Es la segunda vez.');
    expect(n('En el siglo XXI')).toBe('En el siglo veintiuno.');
  });
  it('punctuation for prosody', () => {
    expect(n('Vino (sin avisar) ayer')).toBe('Vino, sin avisar, ayer.');
    expect(n('—Hola —dijo ella.')).toBe('Hola, dijo ella.');
    expect(n('Qué hora es?')).toBe('¿Qué hora es?');
    expect(n('CAPÍTULO PRIMERO')).toBe('Capítulo primero.');
    expect(n('Mira https://www.ejemplo.com/a ahora')).toBe('Mira enlace a ejemplo punto com ahora.');
  });
});

describe('segmentation', () => {
  it('splits sentences respecting abbreviations and initials', () => {
    expect(splitSentences('Habló el Sr. Pérez. Luego se fue. ¿Volverá? ¡Ojalá!')).toEqual([
      'Habló el Sr. Pérez.',
      'Luego se fue.',
      '¿Volverá?',
      '¡Ojalá!',
    ]);
    expect(splitSentences('Lo escribió J. R. R. Tolkien en 1937. Fue un éxito.')).toEqual([
      'Lo escribió J. R. R. Tolkien en 1937.',
      'Fue un éxito.',
    ]);
    expect(splitSentences('—¿Vienes? —preguntó. —Sí.')).toEqual(['—¿Vienes? —preguntó.', '—Sí.']);
  });
  it('splits long sentences at natural pauses', () => {
    const long = 'a'.repeat(120) + '; ' + 'b'.repeat(120) + '.';
    expect(splitLong(long, 200)).toEqual(['a'.repeat(120) + ';', 'b'.repeat(120) + '.']);
  });
  it('builds segments with block info', () => {
    const segs = buildSegments([
      { kind: 'heading', text: 'Introducción' },
      { kind: 'paragraph', text: 'Primera frase. Segunda frase.' },
    ]);
    expect(segs.map((s) => [s.block, s.spoken, s.blockEnd])).toEqual([
      [0, 'Introducción.', true],
      [1, 'Primera frase.', false],
      [1, 'Segunda frase.', true],
    ]);
  });
});

describe('blocks', () => {
  it('plain text with hard wraps and hyphenation', () => {
    const blocks = blocksFromPlainText('Capítulo uno\nEra una noche oscu-\nra y fría.\nNadie salió.\n12\n');
    expect(blocks).toEqual([
      { kind: 'heading', text: 'Capítulo uno' },
      { kind: 'paragraph', text: 'Era una noche oscura y fría.' },
      { kind: 'paragraph', text: 'Nadie salió.' },
    ]);
  });
  it('markdown', () => {
    expect(blocksFromMarkdown('# Título\n\nTexto **fuerte** con [enlace](http://x).\n\n- uno\n- dos')).toEqual([
      { kind: 'heading', text: 'Título' },
      { kind: 'paragraph', text: 'Texto fuerte con enlace.' },
      { kind: 'paragraph', text: 'uno' },
      { kind: 'paragraph', text: 'dos' },
    ]);
  });
});
