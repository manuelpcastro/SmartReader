// Reproductor: recorre las frases del documento con el motor de voz activo y
// ofrece pausa, parada, reanudación y navegación por frases y párrafos.

import type { Segment } from './text/segment';
import { isCancelled, type SpeakOptions, type TtsEngine } from './tts/types';

export type PlayerState = 'idle' | 'playing' | 'paused';

export interface PlayerEvents {
  state: PlayerState;
  position: number;
  error: string;
  finished: void;
}

/** Silencio extra tras un párrafo o un título: da respiración a la lectura. */
const PAUSE_AFTER_PARAGRAPH = 450;
const PAUSE_AFTER_HEADING = 700;
const PREFETCH_AHEAD = 2;

export class Player {
  segments: Segment[] = [];
  index = 0;
  state: PlayerState = 'idle';
  rate = 1;
  private engine: TtsEngine;
  private runId = 0;
  /** Se ha movido la posición estando en pausa: al reanudar se empieza la frase nueva. */
  private restartOnResume = false;
  private resumeWaiters: (() => void)[] = [];
  /** Se llegó al final: el siguiente "play" empieza desde el principio. */
  private atEnd = false;
  private listeners = new Map<keyof PlayerEvents, ((v: never) => void)[]>();

  constructor(engine: TtsEngine) {
    this.engine = engine;
  }

  on<K extends keyof PlayerEvents>(event: K, cb: (v: PlayerEvents[K]) => void): void {
    const list = this.listeners.get(event) ?? [];
    list.push(cb as (v: never) => void);
    this.listeners.set(event, list);
  }

  private emit<K extends keyof PlayerEvents>(event: K, value: PlayerEvents[K]): void {
    this.listeners.get(event)?.forEach((cb) => (cb as (v: PlayerEvents[K]) => void)(value));
  }

  private setState(state: PlayerState): void {
    if (this.state === state) return;
    this.state = state;
    this.emit('state', state);
  }

  load(segments: Segment[], start = 0): void {
    this.stop();
    this.segments = segments;
    this.index = Math.min(Math.max(0, start), Math.max(0, segments.length - 1));
    this.emit('position', this.index);
  }

  setEngine(engine: TtsEngine): void {
    const wasPlaying = this.state === 'playing';
    this.halt();
    this.engine = engine;
    if (wasPlaying) this.startRun();
    else if (this.state === 'paused') this.restartOnResume = true;
  }

  setRate(rate: number): void {
    this.rate = rate;
    this.engine.setRate(rate);
  }

  /**
   * Libera el motor para otro uso (p. ej. probar una voz). La lectura queda en pausa
   * y, al reanudar, repite la frase actual.
   */
  release(): void {
    if (this.state === 'idle') return;
    this.halt();
    this.restartOnResume = true;
    this.setState('paused');
  }

  get current(): Segment | undefined {
    return this.segments[this.index];
  }

  play(): void {
    if (!this.segments.length) return;
    if (this.state === 'playing') return;
    if (this.state === 'paused') return this.resume();
    if (this.atEnd) this.seek(0);
    this.startRun();
  }

  pause(): void {
    if (this.state !== 'playing') return;
    this.setState('paused');
    this.engine.pause();
  }

  resume(): void {
    if (this.state !== 'paused') return;
    if (this.restartOnResume) {
      this.restartOnResume = false;
      this.startRun();
      return;
    }
    this.setState('playing');
    this.engine.resume();
    const waiters = this.resumeWaiters;
    this.resumeWaiters = [];
    waiters.forEach((w) => w());
  }

  toggle(): void {
    if (this.state === 'playing') this.pause();
    else this.play();
  }

  /** Detiene la lectura y vuelve al principio del documento. */
  stop(): void {
    this.halt();
    this.restartOnResume = false;
    this.atEnd = false;
    this.setState('idle');
    if (this.index !== 0) {
      this.index = 0;
      this.emit('position', 0);
    }
  }

  /** Salta a una frase concreta. Mantiene el estado (si estaba sonando, sigue sonando). */
  seek(index: number): void {
    if (!this.segments.length) return;
    const target = Math.min(Math.max(0, index), this.segments.length - 1);
    const state = this.state;
    this.halt();
    this.atEnd = false;
    this.index = target;
    this.emit('position', target);
    if (state === 'playing') this.startRun();
    else if (state === 'paused') this.restartOnResume = true;
  }

  next(): void {
    this.seek(this.index + 1);
  }

  previous(): void {
    this.seek(this.index - 1);
  }

  nextParagraph(): void {
    const block = this.current?.block;
    const i = this.segments.findIndex((s) => s.block > (block ?? -1));
    this.seek(i < 0 ? this.segments.length - 1 : i);
  }

  previousParagraph(): void {
    const cur = this.current;
    if (!cur) return;
    const blockStart = this.segments.findIndex((s) => s.block === cur.block);
    if (blockStart < this.index) return this.seek(blockStart);
    // Ya al inicio del párrafo: vamos al comienzo del anterior.
    const prev = this.segments[blockStart - 1];
    if (!prev) return this.seek(0);
    this.seek(this.segments.findIndex((s) => s.block === prev.block));
  }

  /** Cancela la frase en curso sin cambiar el estado visible. */
  private halt(): void {
    this.runId++;
    this.engine.cancel();
    const waiters = this.resumeWaiters;
    this.resumeWaiters = [];
    waiters.forEach((w) => w());
  }

  private startRun(): void {
    this.setState('playing');
    void this.run(++this.runId);
  }

  private options(i: number): SpeakOptions {
    return {
      rate: this.rate,
      previousText: this.segments[i - 1]?.spoken,
      nextText: this.segments[i + 1]?.spoken,
    };
  }

  private async run(id: number): Promise<void> {
    const engine = this.engine;
    while (id === this.runId && this.index < this.segments.length) {
      const seg = this.segments[this.index];
      this.emit('position', this.index);
      try {
        // Primero la frase actual (menor latencia) y luego las siguientes en segundo plano.
        const speaking = engine.speak(seg.spoken, this.options(this.index));
        for (let k = 1; k <= PREFETCH_AHEAD; k++) {
          const ahead = this.segments[this.index + k];
          if (ahead) engine.prefetch?.(ahead.spoken, this.options(this.index + k));
        }
        await speaking;
      } catch (e) {
        if (id !== this.runId || isCancelled(e)) return;
        this.runId++;
        this.setState('idle');
        this.emit('error', e instanceof Error ? e.message : String(e));
        return;
      }
      if (id !== this.runId) return;

      const gap = seg.blockEnd ? (seg.kind === 'heading' ? PAUSE_AFTER_HEADING : PAUSE_AFTER_PARAGRAPH) : 0;
      if (gap) await new Promise((r) => setTimeout(r, gap / this.rate));
      while (id === this.runId && this.state === 'paused') {
        await new Promise<void>((r) => this.resumeWaiters.push(r));
      }
      if (id !== this.runId) return;
      if (this.index + 1 >= this.segments.length) break;
      this.index++;
    }
    if (id !== this.runId) return;
    this.runId++;
    this.atEnd = true;
    this.setState('idle');
    this.emit('finished', undefined);
  }
}
