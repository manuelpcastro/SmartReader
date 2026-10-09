# SmartReader

**Pruébalo:** https://manuelpcastro.github.io/SmartReader/

Escucha documentos en español con una voz lo más natural posible. Sube un archivo, abre un enlace o pega un texto, y SmartReader lo lee en voz alta con controles de reproducción completos.

## Funciones

- **Fuentes**: PDF, Word (.docx), TXT, Markdown y HTML (arrastrar y soltar o elegir archivo); enlaces a PDF/páginas web, Google Docs públicos y Dropbox; texto pegado.
- **Controles**: reproducir, pausar (se retoma en la misma palabra), detener, frase anterior/siguiente, párrafo anterior/siguiente, barra de progreso para saltar a cualquier punto, clic en una frase para leer desde ahí, y velocidad de 0,75× a 2×.
- **Atajos**: `Espacio` reproducir/pausar · `←`/`→` frase · `Mayús`+`←`/`→` párrafo · `Esc` detener. También funcionan las teclas multimedia y los controles de auriculares (Media Session).
- **Seguimiento**: la frase en curso se resalta y la página se desplaza sola; muestra el tiempo restante estimado.
- **Recuerda** el último documento y la posición para continuar más tarde.

## Cómo se consigue una voz natural

1. **Preparación del texto para la voz** (`src/text/normalize.ts`): antes de sintetizar, cada frase se reescribe en forma "hablable":
   - abreviaturas → palabras (`Sr.` → señor, `EE. UU.` → Estados Unidos, `p. ej.` → por ejemplo…);
   - números con **concordancia de género** (`21 personas` → veintiuna personas, `1 libro` → un libro, `300 casas` → trescientas casas);
   - fechas, horas, ordinales, porcentajes, monedas y unidades (`12/05/2024` → doce de mayo de dos mil veinticuatro, `10:30` → diez y media, `3.er` → tercer, `1.500 €` → mil quinientos euros, `siglo XXI` → siglo veintiuno);
   - paréntesis y rayas convertidos en pausas, signos `¿`/`¡` de apertura añadidos para mejorar la entonación, títulos en MAYÚSCULAS normalizados, enlaces resumidos.
2. **Segmentación inteligente** (`src/text/segment.ts`): frases cortadas respetando abreviaturas, iniciales y diálogos; las frases muy largas se parten en pausas naturales (`;`, `:`, `,`), y se añade un silencio breve tras cada párrafo y título.
3. **Limpieza del documento** (`src/text/blocks.ts`, `src/loaders/pdf.ts`): se unen las líneas cortadas, se deshacen los guiones de final de línea y se eliminan números de página, cabeceras y pies repetidos de los PDF.
4. **Elección de voz**: hay tres motores (⚙️ Ajustes de voz) y la opción de acento (España, México, Latinoamérica, Argentina, Colombia):

| Motor | Coste | Naturalidad |
| --- | --- | --- |
| **Voz del navegador** (por defecto) | Gratis | Elige automáticamente la mejor voz neuronal disponible (★). Las mejores: Microsoft Edge ("… Online (Natural)"), Chrome ("Google español") y voces "Mejorada/Premium" de macOS/iOS. |
| **OpenAI** (`gpt-4o-mini-tts`) | Clave de API | Voz neuronal a la que se le indica acento y estilo de narración (p. ej. "español de España, como un narrador de audiolibros"). Estilo personalizable. |
| **ElevenLabs** (`eleven_multilingual_v2`) | Clave de API | La más humana. Se le envían las frases anterior y siguiente para mantener la entonación continua entre fragmentos. |

Las claves de API se guardan solo en el navegador (localStorage) y se envían directamente al servicio. Con los motores en la nube, el texto se envía a ese servicio; el audio se pre-genera un par de frases por delante para que no haya cortes.

## Desarrollo

```bash
npm install
npm run dev        # servidor de desarrollo
npm test           # pruebas del procesado de texto
npm run build      # comprobación de tipos + compilación en dist/
```

Es una aplicación estática (Vite + TypeScript, sin backend). Cada push a `main` la compila y la publica en GitHub Pages (`.github/workflows/pages.yml`).

### Estructura

```
src/
  main.ts            interfaz y conexión de todo
  player.ts          reproductor: estado, navegación, pausas entre párrafos
  tts/browser.ts     motor Web Speech (ranking de voces naturales, pausa por palabra)
  tts/cloud.ts       motores OpenAI y ElevenLabs (caché y precarga de audio)
  loaders/           lectura de PDF (pdf.js), DOCX (mammoth), HTML, Markdown, enlaces
  text/              limpieza, segmentación y normalización del español
tests/               pruebas (vitest)
```

## Limitaciones

- Los PDF escaneados (imágenes sin capa de texto) no se pueden leer; haría falta OCR.
- Muchos sitios web bloquean la descarga desde otra página (CORS). En ese caso, descarga el archivo y súbelo, o copia y pega el texto.
- La voz del navegador varía según el sistema; si solo hay voces básicas, la app lo indica y sugiere alternativas.
