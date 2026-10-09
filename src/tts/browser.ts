// Motor basado en la Web Speech API del navegador.
//
// La calidad depende de las voces instaladas. Las voces neuronales (Edge: "Microsoft
// … Online (Natural)", Chrome: "Google español", Safari/macOS: voces "Mejorada" o
// "Premium") suenan mucho menos robóticas que las voces locales clásicas, así que las
// priorizamos al elegir la voz por defecto.

import { CancelledError, type SpeakOptions, type TtsEngine } from './types';

interface Job {
  text: string;
  /** Desde dónde se está leyendo (tras una pausa se retoma desde la última palabra). */
  base: number;
  lastBoundary: number;
  opts: SpeakOptions;
  utterance?: SpeechSynthesisUtterance;
  paused: boolean;
  resolve: () => void;
  reject: (e: Error) => void;
}

export interface VoiceInfo {
  voice: SpeechSynthesisVoice;
  score: number;
  natural: boolean;
}

export const browserTtsSupported = (): boolean => typeof window !== 'undefined' && 'speechSynthesis' in window;

/** Puntúa una voz: más alto = más natural y más cercana al acento elegido. */
export function scoreVoice(v: SpeechSynthesisVoice, accent: string): VoiceInfo {
  const name = v.name.toLowerCase();
  const lang = v.lang.replace('_', '-').toLowerCase();
  let score = 0;
  let natural = false;
  if (/natural|neural|online/.test(name)) {
    score += 100;
    natural = true;
  }
  if (/premium|enhanced|mejorada|siri/.test(name)) {
    score += 80;
    natural = true;
  }
  if (/google/.test(name)) {
    score += 60;
    natural = true;
  }
  if (/eloquence|espeak|compact|robot/.test(name)) score -= 50;
  if (lang === accent.toLowerCase()) score += 30;
  else if (accent.toLowerCase() === 'es-419' && /^es-(mx|us|ar|co|cl|pe|ve|uy|419)/.test(lang)) score += 25;
  if (!v.localService) score += 5;
  return { voice: v, score, natural };
}

export function spanishVoices(accent: string): VoiceInfo[] {
  if (!browserTtsSupported()) return [];
  return speechSynthesis
    .getVoices()
    .filter((v) => v.lang.toLowerCase().startsWith('es'))
    .map((v) => scoreVoice(v, accent))
    .sort((a, b) => b.score - a.score || a.voice.name.localeCompare(b.voice.name));
}

/** Las voces se cargan de forma asíncrona en la mayoría de navegadores. */
export function onVoicesReady(cb: () => void): void {
  if (!browserTtsSupported()) return;
  if (speechSynthesis.getVoices().length) cb();
  speechSynthesis.addEventListener('voiceschanged', cb);
}

export class BrowserEngine implements TtsEngine {
  readonly usesAudioElement = false;
  voice: SpeechSynthesisVoice | null = null;
  lang = 'es-ES';
  pitch = 1;
  private job: Job | null = null;

  speak(text: string, opts: SpeakOptions): Promise<void> {
    this.cancel();
    return new Promise<void>((resolve, reject) => {
      this.job = { text, base: 0, lastBoundary: 0, opts: { ...opts }, paused: false, resolve, reject };
      this.start(this.job);
    });
  }

  private start(job: Job): void {
    const u = new SpeechSynthesisUtterance(job.text.slice(job.base));
    u.lang = this.voice?.lang ?? this.lang;
    if (this.voice) u.voice = this.voice;
    u.rate = job.opts.rate;
    u.pitch = this.pitch;
    u.onboundary = (e) => {
      if (job.utterance === u && (e.name === 'word' || !e.name)) job.lastBoundary = job.base + e.charIndex;
    };
    u.onend = () => {
      if (this.job !== job || job.utterance !== u || job.paused) return;
      this.job = null;
      job.resolve();
    };
    u.onerror = (e) => {
      if (this.job !== job || job.utterance !== u || job.paused) return;
      if (e.error === 'interrupted' || e.error === 'canceled') return;
      this.job = null;
      job.reject(new Error(`Error de síntesis: ${e.error}`));
    };
    job.utterance = u;
    // Algunos navegadores (Chrome) descartan un speak() lanzado justo tras cancel().
    speechSynthesis.cancel();
    setTimeout(() => {
      if (job.utterance === u && !job.paused) speechSynthesis.speak(u);
    }, 30);
  }

  /**
   * speechSynthesis.pause() es poco fiable (Chrome en Android, voces en línea), así que
   * pausamos cancelando y recordando la última palabra; al reanudar seguimos desde ahí.
   */
  pause(): void {
    const job = this.job;
    if (!job || job.paused) return;
    job.paused = true;
    job.base = job.lastBoundary;
    job.utterance = undefined;
    speechSynthesis.cancel();
  }

  resume(): void {
    const job = this.job;
    if (!job || !job.paused) return;
    job.paused = false;
    this.start(job);
  }

  cancel(): void {
    const job = this.job;
    this.job = null;
    if (!job) return;
    job.utterance = undefined;
    speechSynthesis.cancel();
    job.reject(new CancelledError());
  }

  setRate(rate: number): void {
    const job = this.job;
    if (!job) return;
    job.opts.rate = rate;
    if (!job.paused) {
      this.pause();
      this.resume();
    }
  }
}
