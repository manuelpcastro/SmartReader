export interface SpeakOptions {
  /** Velocidad: 1 = normal. */
  rate: number;
  /** Frases vecinas: algunos motores las usan para dar continuidad a la entonación. */
  previousText?: string;
  nextText?: string;
}

export class CancelledError extends Error {
  constructor() {
    super('cancelled');
    this.name = 'CancelledError';
  }
}

export const isCancelled = (e: unknown): boolean => e instanceof CancelledError;

/**
 * Motor de voz. `speak` resuelve cuando la frase termina de sonar y se rechaza con
 * CancelledError si se cancela. `pause`/`resume` deben mantener pendiente esa promesa.
 */
export interface TtsEngine {
  speak(text: string, opts: SpeakOptions): Promise<void>;
  pause(): void;
  resume(): void;
  cancel(): void;
  /** Cambia la velocidad de la frase en curso, si el motor lo permite. */
  setRate(rate: number): void;
  /** Anticipa la síntesis de próximas frases (motores en la nube). */
  prefetch?(text: string, opts: SpeakOptions): void;
  /** Usa un elemento <audio>: habilita los controles multimedia del sistema. */
  readonly usesAudioElement: boolean;
}
