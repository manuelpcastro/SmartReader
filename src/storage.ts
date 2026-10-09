// Preferencias y último documento, guardados en localStorage (si está disponible).

import type { LoadedDocument } from './loaders';

export type EngineId = 'browser' | 'openai' | 'elevenlabs';

export interface Settings {
  engine: EngineId;
  accent: string;
  rate: number;
  pitch: number;
  browserVoice: string;
  openaiKey: string;
  openaiVoice: string;
  openaiStyle: string;
  elevenKey: string;
  elevenVoice: string;
  showSpoken: boolean;
}

const DEFAULTS: Settings = {
  engine: 'browser',
  accent: 'es-ES',
  rate: 1,
  pitch: 1,
  browserVoice: '',
  openaiKey: '',
  openaiVoice: 'coral',
  openaiStyle: '',
  elevenKey: '',
  elevenVoice: '',
  showSpoken: false,
};

const SETTINGS_KEY = 'smartreader:settings';
const DOC_KEY = 'smartreader:document';
const POS_KEY = 'smartreader:position';

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* almacenamiento lleno o bloqueado: no es crítico */
  }
}

export function loadSettings(): Settings {
  return { ...DEFAULTS, ...(read<Partial<Settings>>(SETTINGS_KEY) ?? {}) };
}

export function saveSettings(s: Settings): void {
  write(SETTINGS_KEY, s);
}

export function saveDocument(doc: LoadedDocument): void {
  write(DOC_KEY, doc);
}

export function loadDocument(): LoadedDocument | null {
  return read<LoadedDocument>(DOC_KEY);
}

export function savePosition(index: number): void {
  write(POS_KEY, index);
}

export function loadPosition(): number {
  return read<number>(POS_KEY) ?? 0;
}
