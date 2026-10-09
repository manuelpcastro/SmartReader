// Motores de voz neuronal en la nube (OpenAI y ElevenLabs).
//
// Generan audio mucho más expresivo que las voces del sistema. Cada frase se sintetiza
// por separado (con las frases vecinas como contexto cuando el servicio lo admite), se
// guarda en caché y se reproduce con un <audio>, lo que permite pausar en el punto exacto.

import { CancelledError, type SpeakOptions, type TtsEngine } from './types';

interface Job {
  resolve: () => void;
  reject: (e: Error) => void;
  paused: boolean;
}

const CACHE_LIMIT = 40;

abstract class AudioEngine implements TtsEngine {
  readonly usesAudioElement = true;
  readonly audio = new Audio();
  private cache = new Map<string, Promise<string>>();
  private job: Job | null = null;

  constructor() {
    this.audio.preload = 'auto';
    (this.audio as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true;
  }

  protected abstract synthesize(text: string, opts: SpeakOptions): Promise<Blob>;
  /** Identifica la configuración actual (voz, modelo…) para la caché. */
  protected abstract configKey(): string;

  private audioUrl(text: string, opts: SpeakOptions): Promise<string> {
    const key = `${this.configKey()}|${text}`;
    let entry = this.cache.get(key);
    if (entry) {
      // LRU: lo movemos al final.
      this.cache.delete(key);
      this.cache.set(key, entry);
      return entry;
    }
    entry = this.synthesize(text, opts).then((blob) => URL.createObjectURL(blob));
    entry.catch(() => this.cache.delete(key));
    this.cache.set(key, entry);
    while (this.cache.size > CACHE_LIMIT) {
      const [oldKey, oldEntry] = this.cache.entries().next().value!;
      this.cache.delete(oldKey);
      oldEntry.then((url) => URL.revokeObjectURL(url)).catch(() => {});
    }
    return entry;
  }

  clearCache(): void {
    for (const entry of this.cache.values()) entry.then((url) => URL.revokeObjectURL(url)).catch(() => {});
    this.cache.clear();
  }

  prefetch(text: string, opts: SpeakOptions): void {
    this.audioUrl(text, opts).catch(() => {});
  }

  speak(text: string, opts: SpeakOptions): Promise<void> {
    this.cancel();
    return new Promise<void>((resolve, reject) => {
      const job: Job = { resolve, reject, paused: false };
      this.job = job;
      this.audioUrl(text, opts).then(
        (url) => {
          if (this.job !== job) return;
          this.audio.src = url;
          this.audio.defaultPlaybackRate = opts.rate;
          this.audio.playbackRate = opts.rate;
          this.audio.onended = () => {
            if (this.job !== job) return;
            this.job = null;
            resolve();
          };
          this.audio.onerror = () => {
            if (this.job !== job) return;
            this.job = null;
            reject(new Error('No se pudo reproducir el audio generado.'));
          };
          if (!job.paused) this.play(job);
        },
        (err: Error) => {
          if (this.job !== job) return;
          this.job = null;
          reject(err);
        },
      );
    });
  }

  private play(job: Job): void {
    this.audio.play().catch((err: Error) => {
      if (this.job !== job || err.name === 'AbortError') return;
      this.job = null;
      job.reject(err.name === 'NotAllowedError' ? new Error('El navegador bloqueó la reproducción. Pulsa ▶.') : err);
    });
  }

  pause(): void {
    if (!this.job) return;
    this.job.paused = true;
    this.audio.pause();
  }

  resume(): void {
    const job = this.job;
    if (!job || !job.paused) return;
    job.paused = false;
    if (this.audio.src) this.play(job);
  }

  cancel(): void {
    const job = this.job;
    this.job = null;
    this.audio.pause();
    this.audio.onended = null;
    this.audio.onerror = null;
    this.audio.removeAttribute('src');
    if (job) job.reject(new CancelledError());
  }

  setRate(rate: number): void {
    this.audio.defaultPlaybackRate = rate;
    this.audio.playbackRate = rate;
  }
}

async function errorMessage(res: Response, service: string): Promise<string> {
  let detail = '';
  try {
    const body = await res.json();
    detail = body?.error?.message ?? body?.detail?.message ?? body?.detail ?? '';
    if (typeof detail !== 'string') detail = JSON.stringify(detail);
  } catch {
    /* sin cuerpo JSON */
  }
  if (res.status === 401) return `${service}: clave de API no válida.`;
  if (res.status === 429) return `${service}: límite de uso alcanzado. ${detail}`;
  return `${service} (${res.status}): ${detail || res.statusText}`;
}

export const ACCENT_DESCRIPTIONS: Record<string, string> = {
  'es-ES': 'español de España (castellano peninsular, con distinción de "z" y "c")',
  'es-MX': 'español de México',
  'es-US': 'español latinoamericano neutro',
  'es-419': 'español latinoamericano neutro',
  'es-AR': 'español rioplatense de Argentina',
  'es-CO': 'español de Colombia',
};

export const OPENAI_VOICES = ['coral', 'nova', 'sage', 'shimmer', 'alloy', 'ash', 'ballad', 'echo', 'fable', 'onyx', 'verse'];

export class OpenAIEngine extends AudioEngine {
  apiKey = '';
  voice = 'coral';
  model = 'gpt-4o-mini-tts';
  accent = 'es-ES';
  style = '';

  protected configKey(): string {
    return `openai|${this.model}|${this.voice}|${this.accent}|${this.style}`;
  }

  instructions(): string {
    const accent = ACCENT_DESCRIPTIONS[this.accent] ?? 'español';
    return [
      `Habla en ${accent}, con pronunciación nativa.`,
      'Lee como un narrador de audiolibros cercano y natural: entonación expresiva pero no exagerada,',
      'ritmo pausado, respetando comas y puntos, subiendo la entonación en las preguntas y',
      'dando énfasis a las exclamaciones. Nunca suenes robótico ni monótono.',
      this.style,
    ]
      .filter(Boolean)
      .join(' ');
  }

  protected async synthesize(text: string): Promise<Blob> {
    if (!this.apiKey) throw new Error('Falta la clave de API de OpenAI (Ajustes de voz).');
    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        voice: this.voice,
        input: text,
        response_format: 'mp3',
        ...(this.model.startsWith('gpt-') ? { instructions: this.instructions() } : {}),
      }),
    });
    if (!res.ok) throw new Error(await errorMessage(res, 'OpenAI'));
    return res.blob();
  }
}

export interface ElevenVoice {
  voice_id: string;
  name: string;
  labels?: Record<string, string>;
}

export class ElevenLabsEngine extends AudioEngine {
  apiKey = '';
  voiceId = '';
  model = 'eleven_multilingual_v2';

  protected configKey(): string {
    return `eleven|${this.model}|${this.voiceId}`;
  }

  async listVoices(): Promise<ElevenVoice[]> {
    if (!this.apiKey) throw new Error('Falta la clave de API de ElevenLabs.');
    const res = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': this.apiKey } });
    if (!res.ok) throw new Error(await errorMessage(res, 'ElevenLabs'));
    const body = (await res.json()) as { voices: ElevenVoice[] };
    return body.voices;
  }

  protected async synthesize(text: string, opts: SpeakOptions): Promise<Blob> {
    if (!this.apiKey) throw new Error('Falta la clave de API de ElevenLabs (Ajustes de voz).');
    if (!this.voiceId) throw new Error('Elige una voz de ElevenLabs en los Ajustes de voz.');
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(this.voiceId)}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: { 'xi-api-key': this.apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
        body: JSON.stringify({
          text,
          model_id: this.model,
          // El contexto de las frases vecinas mantiene una entonación continua entre fragmentos.
          previous_text: opts.previousText,
          next_text: opts.nextText,
          voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true },
        }),
      },
    );
    if (!res.ok) throw new Error(await errorMessage(res, 'ElevenLabs'));
    return res.blob();
  }
}
