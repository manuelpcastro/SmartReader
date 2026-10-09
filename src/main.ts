import './styles.css';
import { ACCEPTED_FILES, loadFile, loadPastedText, loadUrl, type LoadedDocument } from './loaders';
import { Player } from './player';
import {
  loadDocument,
  loadPosition,
  loadSettings,
  saveDocument,
  savePosition,
  saveSettings,
  type EngineId,
  type Settings,
} from './storage';
import { buildSegments, type Segment } from './text/segment';
import { BrowserEngine, browserTtsSupported, onVoicesReady, spanishVoices } from './tts/browser';
import { ElevenLabsEngine, OpenAIEngine, OPENAI_VOICES } from './tts/cloud';
import { isCancelled, type TtsEngine } from './tts/types';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const el = {
  home: $('home'),
  docTitle: $('doc-title'),
  loader: $('loader'),
  reader: $('reader'),
  text: $('text'),
  player: $('player'),
  fileInput: $<HTMLInputElement>('file-input'),
  dropzone: $('dropzone'),
  urlForm: $<HTMLFormElement>('url-form'),
  urlInput: $<HTMLInputElement>('url-input'),
  pasteForm: $<HTMLFormElement>('paste-form'),
  pasteInput: $<HTMLTextAreaElement>('paste-input'),
  loadStatus: $('load-status'),
  resumeCard: $('resume-card'),
  resumeTitle: $('resume-title'),
  resumeProgress: $('resume-progress'),
  resumeBtn: $('resume-btn'),
  progress: $<HTMLInputElement>('progress'),
  positionLabel: $('position-label'),
  timeLabel: $('time-label'),
  play: $('play'),
  prev: $('prev'),
  next: $('next'),
  prevPara: $('prev-para'),
  nextPara: $('next-para'),
  stop: $('stop'),
  rate: $<HTMLSelectElement>('rate'),
  engineBadge: $('engine-badge'),
  playerError: $('player-error'),
  openSettings: $('open-settings'),
  settings: $<HTMLDialogElement>('settings'),
  accent: $<HTMLSelectElement>('accent'),
  browserVoice: $<HTMLSelectElement>('browser-voice'),
  browserVoiceHint: $('browser-voice-hint'),
  pitch: $<HTMLInputElement>('pitch'),
  openaiKey: $<HTMLInputElement>('openai-key'),
  openaiVoice: $<HTMLSelectElement>('openai-voice'),
  openaiStyle: $<HTMLInputElement>('openai-style'),
  elevenKey: $<HTMLInputElement>('eleven-key'),
  elevenVoice: $<HTMLSelectElement>('eleven-voice'),
  elevenLoad: $('eleven-load'),
  testVoice: $('test-voice'),
  showSpoken: $<HTMLInputElement>('show-spoken'),
};

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------

const settings: Settings = loadSettings();
const engines = {
  browser: new BrowserEngine(),
  openai: new OpenAIEngine(),
  elevenlabs: new ElevenLabsEngine(),
};
const player = new Player(engines[settings.engine]);
let doc: LoadedDocument | null = null;
let segments: Segment[] = [];
let spans: HTMLElement[] = [];
/** Caracteres hablados acumulados, para estimar el tiempo restante. */
let cumulative: number[] = [];

/** Velocidad media de lectura en español (caracteres por segundo a 1×). */
const CHARS_PER_SECOND = 15;

function activeEngine(): TtsEngine {
  return engines[settings.engine];
}

function persistSettings(): void {
  saveSettings(settings);
}

// ---------------------------------------------------------------------------
// Configuración de los motores
// ---------------------------------------------------------------------------

function applyEngineSettings(): void {
  const b = engines.browser;
  b.lang = settings.accent;
  b.pitch = settings.pitch;
  const voices = spanishVoices(settings.accent);
  b.voice = voices.find((v) => v.voice.voiceURI === settings.browserVoice)?.voice ?? voices[0]?.voice ?? null;

  const o = engines.openai;
  o.apiKey = settings.openaiKey.trim();
  o.voice = settings.openaiVoice;
  o.accent = settings.accent;
  o.style = settings.openaiStyle.trim();

  const e = engines.elevenlabs;
  e.apiKey = settings.elevenKey.trim();
  e.voiceId = settings.elevenVoice;

  updateEngineBadge();
}

function updateEngineBadge(): void {
  let label: string;
  if (settings.engine === 'browser') {
    const v = engines.browser.voice;
    label = v ? `Voz: ${v.name.replace(/^Microsoft /, '').replace(/ - .*$/, '')}` : 'Voz del navegador';
  } else if (settings.engine === 'openai') {
    label = `OpenAI · ${settings.openaiVoice}`;
  } else {
    const name = el.elevenVoice.selectedOptions[0]?.textContent;
    label = `ElevenLabs${name ? ` · ${name}` : ''}`;
  }
  el.engineBadge.textContent = label;
}

function populateBrowserVoices(): void {
  const voices = spanishVoices(settings.accent);
  el.browserVoice.replaceChildren(
    ...voices.map(({ voice, natural }) => {
      const opt = document.createElement('option');
      opt.value = voice.voiceURI;
      opt.textContent = `${natural ? '★ ' : ''}${voice.name} (${voice.lang})`;
      return opt;
    }),
  );
  const selected = voices.find((v) => v.voice.voiceURI === settings.browserVoice) ?? voices[0];
  if (selected) el.browserVoice.value = selected.voice.voiceURI;

  let hint = '';
  if (!browserTtsSupported()) {
    hint = 'Este navegador no admite síntesis de voz. Usa OpenAI o ElevenLabs, o prueba con Chrome, Edge o Safari.';
  } else if (!voices.length) {
    hint = 'No se han encontrado voces en español en este sistema. Instala una voz en español en los ajustes del sistema, o usa un motor en la nube.';
  } else if (!voices[0].natural) {
    hint =
      'Solo hay voces básicas disponibles. Para una lectura más natural, abre la página en Microsoft Edge (voces «Natural»), ' +
      'en Chrome (voz «Google español») o instala voces mejoradas en tu sistema; o usa un motor en la nube.';
  } else {
    hint = '★ = voz neuronal o mejorada (más natural). Se elige automáticamente la mejor disponible.';
  }
  el.browserVoiceHint.textContent = hint;
  applyEngineSettings();
}

function populateOpenAIVoices(): void {
  el.openaiVoice.replaceChildren(
    ...OPENAI_VOICES.map((v) => {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v.charAt(0).toUpperCase() + v.slice(1);
      return opt;
    }),
  );
  el.openaiVoice.value = settings.openaiVoice;
}

function setElevenOptions(voices: { id: string; name: string }[]): void {
  el.elevenVoice.replaceChildren(
    ...voices.map((v) => {
      const opt = document.createElement('option');
      opt.value = v.id;
      opt.textContent = v.name;
      return opt;
    }),
  );
  if (settings.elevenVoice) el.elevenVoice.value = settings.elevenVoice;
}

async function loadElevenVoices(): Promise<void> {
  applyEngineSettings();
  el.elevenLoad.textContent = 'Cargando…';
  try {
    const voices = await engines.elevenlabs.listVoices();
    setElevenOptions(voices.map((v) => ({ id: v.voice_id, name: v.name })));
    if (!voices.some((v) => v.voice_id === settings.elevenVoice) && voices[0]) {
      settings.elevenVoice = voices[0].voice_id;
      el.elevenVoice.value = voices[0].voice_id;
    }
    localStorage.setItem('smartreader:eleven-voices', JSON.stringify(voices.map((v) => ({ id: v.voice_id, name: v.name }))));
    persistSettings();
    applyEngineSettings();
  } catch (e) {
    alert(e instanceof Error ? e.message : String(e));
  } finally {
    el.elevenLoad.textContent = 'Cargar voces';
  }
}

function showEnginePanels(): void {
  el.settings.querySelectorAll<HTMLElement>('[data-engine]').forEach((panel) => {
    panel.hidden = panel.dataset.engine !== settings.engine;
  });
}

function initSettingsUI(): void {
  el.settings.querySelectorAll<HTMLInputElement>('input[name="engine"]').forEach((radio) => {
    radio.checked = radio.value === settings.engine;
    radio.addEventListener('change', () => {
      settings.engine = radio.value as EngineId;
      persistSettings();
      showEnginePanels();
      applyEngineSettings();
      player.setEngine(activeEngine());
    });
  });
  showEnginePanels();

  el.accent.value = settings.accent;
  el.accent.addEventListener('change', () => {
    settings.accent = el.accent.value;
    settings.browserVoice = '';
    persistSettings();
    populateBrowserVoices();
  });

  el.browserVoice.addEventListener('change', () => {
    settings.browserVoice = el.browserVoice.value;
    persistSettings();
    applyEngineSettings();
  });
  el.pitch.value = String(settings.pitch);
  el.pitch.addEventListener('change', () => {
    settings.pitch = Number(el.pitch.value);
    persistSettings();
    applyEngineSettings();
  });

  populateOpenAIVoices();
  el.openaiKey.value = settings.openaiKey;
  el.openaiStyle.value = settings.openaiStyle;
  const onOpenAI = () => {
    settings.openaiKey = el.openaiKey.value;
    settings.openaiVoice = el.openaiVoice.value;
    settings.openaiStyle = el.openaiStyle.value;
    persistSettings();
    applyEngineSettings();
  };
  el.openaiKey.addEventListener('change', onOpenAI);
  el.openaiVoice.addEventListener('change', onOpenAI);
  el.openaiStyle.addEventListener('change', onOpenAI);

  el.elevenKey.value = settings.elevenKey;
  try {
    const cached = JSON.parse(localStorage.getItem('smartreader:eleven-voices') ?? '[]');
    if (Array.isArray(cached)) setElevenOptions(cached);
  } catch {
    /* ignorar */
  }
  el.elevenKey.addEventListener('change', () => {
    settings.elevenKey = el.elevenKey.value;
    persistSettings();
    if (settings.elevenKey.trim()) void loadElevenVoices();
  });
  el.elevenVoice.addEventListener('change', () => {
    settings.elevenVoice = el.elevenVoice.value;
    persistSettings();
    applyEngineSettings();
  });
  el.elevenLoad.addEventListener('click', () => void loadElevenVoices());

  el.showSpoken.checked = settings.showSpoken;
  el.showSpoken.addEventListener('change', () => {
    settings.showSpoken = el.showSpoken.checked;
    persistSettings();
    spans.forEach((span, i) => (span.textContent = settings.showSpoken ? segments[i].spoken : segments[i].text));
  });

  el.testVoice.addEventListener('click', async () => {
    player.release();
    const label = el.testVoice.textContent;
    el.testVoice.textContent = 'Reproduciendo…';
    try {
      await activeEngine().speak(
        'Hola. Esta es la voz con la que vas a escuchar tus documentos. ¿Te suena natural? Si no, prueba con otra voz.',
        { rate: settings.rate },
      );
    } catch (e) {
      if (!isCancelled(e)) alert(e instanceof Error ? e.message : String(e));
    } finally {
      el.testVoice.textContent = label;
    }
  });

  el.openSettings.addEventListener('click', () => el.settings.showModal());
  el.settings.addEventListener('click', (e) => {
    if (e.target === el.settings) el.settings.close();
  });

  populateBrowserVoices();
  onVoicesReady(populateBrowserVoices);
}

// ---------------------------------------------------------------------------
// Documento
// ---------------------------------------------------------------------------

function renderDocument(): void {
  const frag = document.createDocumentFragment();
  spans = [];
  let container: HTMLElement | null = null;
  let currentBlock = -1;
  for (const seg of segments) {
    if (seg.block !== currentBlock) {
      currentBlock = seg.block;
      container = document.createElement(seg.kind === 'heading' ? 'h2' : 'p');
      frag.append(container);
    } else {
      container!.append(' ');
    }
    const span = document.createElement('span');
    span.className = 'seg';
    span.dataset.i = String(seg.index);
    span.textContent = settings.showSpoken ? seg.spoken : seg.text;
    container!.append(span);
    spans.push(span);
  }
  el.text.replaceChildren(frag);
}

function openDocument(loaded: LoadedDocument, start = 0): void {
  doc = loaded;
  segments = buildSegments(loaded.blocks);
  if (!segments.length) {
    setLoadStatus('El documento no contiene texto legible.', true);
    return;
  }
  cumulative = [];
  let total = 0;
  for (const s of segments) {
    cumulative.push(total);
    total += s.spoken.length;
  }
  cumulative.push(total);

  renderDocument();
  el.docTitle.textContent = loaded.title;
  document.title = `${loaded.title} · SmartReader`;
  el.progress.max = String(segments.length - 1);
  el.loader.hidden = true;
  el.reader.hidden = false;
  el.player.hidden = false;
  hideError();
  player.load(segments, start);
  updateMediaMetadata();
  saveDocument(loaded);
  scrollToCurrent(true);
}

function setLoadStatus(message: string, isError = false): void {
  el.loadStatus.textContent = message;
  el.loadStatus.classList.toggle('error', isError);
}

async function handleLoad(task: () => Promise<LoadedDocument> | LoadedDocument): Promise<void> {
  setLoadStatus('Procesando el documento…');
  try {
    const loaded = await task();
    setLoadStatus('');
    savePosition(0);
    openDocument(loaded, 0);
  } catch (e) {
    console.error(e);
    setLoadStatus(e instanceof Error ? e.message : String(e), true);
  }
}

function showLoader(): void {
  player.stop();
  el.loader.hidden = false;
  el.reader.hidden = true;
  el.player.hidden = true;
  el.docTitle.textContent = '';
  document.title = 'SmartReader';
  refreshResumeCard();
}

function refreshResumeCard(): void {
  const saved = loadDocument();
  if (!saved || !saved.blocks?.length) {
    el.resumeCard.hidden = true;
    return;
  }
  const pos = loadPosition();
  const count = buildSegments(saved.blocks).length;
  el.resumeCard.hidden = false;
  el.resumeTitle.textContent = saved.title;
  el.resumeProgress.textContent = count ? ` · ${Math.round((pos / count) * 100)} % escuchado` : '';
}

function initLoader(): void {
  el.fileInput.accept = ACCEPTED_FILES;
  el.fileInput.addEventListener('change', () => {
    const file = el.fileInput.files?.[0];
    if (file) void handleLoad(() => loadFile(file));
    el.fileInput.value = '';
  });

  ['dragenter', 'dragover'].forEach((type) =>
    el.dropzone.addEventListener(type, (e) => {
      e.preventDefault();
      el.dropzone.classList.add('dragging');
    }),
  );
  ['dragleave', 'drop'].forEach((type) =>
    el.dropzone.addEventListener(type, () => el.dropzone.classList.remove('dragging')),
  );
  el.dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = (e as DragEvent).dataTransfer?.files?.[0];
    if (file) void handleLoad(() => loadFile(file));
  });
  // Soltar un archivo en cualquier parte de la página también funciona.
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file) void handleLoad(() => loadFile(file));
  });

  el.urlForm.addEventListener('submit', (e) => {
    e.preventDefault();
    void handleLoad(() => loadUrl(el.urlInput.value));
  });
  el.pasteForm.addEventListener('submit', (e) => {
    e.preventDefault();
    void handleLoad(() => loadPastedText(el.pasteInput.value));
  });

  document.querySelectorAll<HTMLButtonElement>('.tab').forEach((tab) =>
    tab.addEventListener('click', () => {
      document.querySelectorAll<HTMLButtonElement>('.tab').forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
      document.querySelectorAll<HTMLElement>('.tab-panel').forEach((p) => (p.hidden = p.dataset.panel !== tab.dataset.tab));
      setLoadStatus('');
    }),
  );

  el.resumeBtn.addEventListener('click', () => {
    const saved = loadDocument();
    if (saved) openDocument(saved, loadPosition());
  });
  el.home.addEventListener('click', showLoader);
  refreshResumeCard();
}

// ---------------------------------------------------------------------------
// Reproductor
// ---------------------------------------------------------------------------

function formatDuration(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (m < 1) return 'menos de 1 min';
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

function updatePositionLabels(index: number): void {
  const total = segments.length;
  el.progress.value = String(index);
  const pct = total > 1 ? Math.round((index / (total - 1)) * 100) : 0;
  el.progress.style.setProperty('--pct', `${pct}%`);
  el.positionLabel.textContent = `Frase ${index + 1} de ${total} · ${pct} %`;
  const remaining = (cumulative[cumulative.length - 1] - cumulative[index]) / (CHARS_PER_SECOND * settings.rate);
  el.timeLabel.textContent = `Quedan ${formatDuration(remaining)}`;
}

let lastHighlighted: HTMLElement | null = null;

function scrollToCurrent(force = false): void {
  const span = spans[player.index];
  if (!span) return;
  const rect = span.getBoundingClientRect();
  const bottomLimit = window.innerHeight - el.player.offsetHeight - 24;
  if (force || rect.top < 70 || rect.bottom > bottomLimit) {
    span.scrollIntoView({ behavior: force ? 'auto' : 'smooth', block: 'center' });
  }
}

function highlight(index: number): void {
  lastHighlighted?.classList.remove('current');
  lastHighlighted?.parentElement?.classList.remove('current-block');
  const span = spans[index];
  if (!span) return;
  span.classList.add('current');
  span.parentElement?.classList.add('current-block');
  lastHighlighted = span;
}

function showError(message: string): void {
  el.playerError.textContent = message;
  el.playerError.hidden = false;
}

function hideError(): void {
  el.playerError.hidden = true;
}

function updateMediaMetadata(): void {
  if (!('mediaSession' in navigator) || !doc) return;
  navigator.mediaSession.metadata = new MediaMetadata({ title: doc.title, artist: 'SmartReader' });
}

function initPlayer(): void {
  player.rate = settings.rate;
  el.rate.value = String(settings.rate);
  if (!el.rate.value) el.rate.value = '1';

  player.on('position', (index) => {
    highlight(index);
    updatePositionLabels(index);
    if (player.state === 'playing') scrollToCurrent();
    savePosition(index);
  });
  player.on('state', (state) => {
    el.player.dataset.state = state;
    el.play.setAttribute('aria-label', state === 'playing' ? 'Pausar' : 'Reproducir');
    if (state === 'playing') {
      hideError();
      scrollToCurrent();
    }
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = state === 'playing' ? 'playing' : state === 'paused' ? 'paused' : 'none';
    }
  });
  player.on('error', (message) => showError(message));
  player.on('finished', () => savePosition(0));

  el.play.addEventListener('click', () => player.toggle());
  el.stop.addEventListener('click', () => player.stop());
  el.prev.addEventListener('click', () => player.previous());
  el.next.addEventListener('click', () => player.next());
  el.prevPara.addEventListener('click', () => player.previousParagraph());
  el.nextPara.addEventListener('click', () => player.nextParagraph());

  el.progress.addEventListener('input', () => updatePositionLabels(Number(el.progress.value)));
  el.progress.addEventListener('change', () => {
    player.seek(Number(el.progress.value));
    scrollToCurrent();
  });

  el.rate.addEventListener('change', () => {
    settings.rate = Number(el.rate.value);
    persistSettings();
    player.setRate(settings.rate);
    updatePositionLabels(player.index);
  });

  // Clic en una frase: saltar a ella y leer desde ahí.
  el.text.addEventListener('click', (e) => {
    const span = (e.target as HTMLElement).closest<HTMLElement>('.seg');
    if (!span || window.getSelection()?.toString()) return;
    player.seek(Number(span.dataset.i));
    if (player.state !== 'playing') {
      if (player.state === 'paused') player.resume();
      else player.play();
    }
  });

  // Atajos de teclado.
  document.addEventListener('keydown', (e) => {
    if (el.player.hidden || el.settings.open) return;
    const target = e.target as HTMLElement;
    if (target.closest('input, textarea, select, [contenteditable]') && target !== el.progress) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    switch (e.key) {
      case ' ':
      case 'k':
        e.preventDefault();
        player.toggle();
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (e.shiftKey) player.nextParagraph();
        else player.next();
        scrollToCurrent();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        if (e.shiftKey) player.previousParagraph();
        else player.previous();
        scrollToCurrent();
        break;
      case 'Escape':
        player.stop();
        break;
    }
  });

  // Controles del sistema (teclas multimedia, auriculares, pantalla de bloqueo).
  if ('mediaSession' in navigator) {
    const ms = navigator.mediaSession;
    const handlers: [MediaSessionAction, () => void][] = [
      ['play', () => player.play()],
      ['pause', () => player.pause()],
      ['stop', () => player.stop()],
      ['previoustrack', () => player.previous()],
      ['nexttrack', () => player.next()],
      ['seekbackward', () => player.previousParagraph()],
      ['seekforward', () => player.nextParagraph()],
    ];
    for (const [action, handler] of handlers) {
      try {
        ms.setActionHandler(action, handler);
      } catch {
        /* acción no soportada */
      }
    }
  }
}

// ---------------------------------------------------------------------------

initSettingsUI();
initLoader();
initPlayer();
applyEngineSettings();
