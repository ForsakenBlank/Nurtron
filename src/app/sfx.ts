// little sounds for what happens to creatures, made on the spot so there are no sound files to load. they're quiet,
// and Settings can switch them off.
import type { WorldEvent } from '../sim/world.ts';

type Note = { pitch: number; at: number; length: number; wave?: OscillatorType; loud?: number; slide?: number };

const TUNES: Partial<Record<WorldEvent['type'], Note[]>> = {
  petted: [
    { pitch: 660, at: 0, length: 0.12 },
    { pitch: 880, at: 0.09, length: 0.16 },
  ],
  slapped: [{ pitch: 220, at: 0, length: 0.16, wave: 'square', loud: 0.5, slide: 110 }],
  hatched: [
    { pitch: 523, at: 0, length: 0.12 },
    { pitch: 659, at: 0.1, length: 0.12 },
    { pitch: 784, at: 0.2, length: 0.12 },
    { pitch: 1047, at: 0.3, length: 0.25 },
  ],
  cuddled: [
    { pitch: 392, at: 0, length: 0.3, wave: 'sine' },
    { pitch: 494, at: 0.05, length: 0.3, wave: 'sine' },
    { pitch: 587, at: 0.1, length: 0.35, wave: 'sine' },
  ],
  died: [{ pitch: 440, at: 0, length: 0.7, wave: 'sine', slide: 150 }],
  revived: [
    { pitch: 392, at: 0, length: 0.12 },
    { pitch: 587, at: 0.1, length: 0.12 },
    { pitch: 784, at: 0.2, length: 0.2 },
  ],
  laid: [
    { pitch: 587, at: 0, length: 0.1, wave: 'sine' },
    { pitch: 784, at: 0.08, length: 0.18, wave: 'sine' },
  ],
  solved: [
    { pitch: 523, at: 0, length: 0.14 },
    { pitch: 659, at: 0.12, length: 0.14 },
    { pitch: 784, at: 0.24, length: 0.14 },
    { pitch: 1047, at: 0.36, length: 0.4 },
  ],
};

const EAT: Note[] = [
  { pitch: 300, at: 0, length: 0.06, wave: 'square', loud: 0.35, slide: 180 },
  { pitch: 520, at: 0.07, length: 0.09, wave: 'triangle', loud: 0.6 },
];

const CALL: Note[] = [{ pitch: 700, at: 0, length: 0.18, wave: 'sine', slide: 980 }];

export class Sounds {
  on = true;
  volume = 0.5;
  private audio: AudioContext | null = null;
  private lastAt = new Map<string, number>();

  // only what happens to the creatures you can see, and never the same sound many times at once
  play(events: WorldEvent[], heard: (who: number) => boolean): void {
    if (!this.on || this.volume <= 0) return;
    for (const event of events) {
      let tune: Note[] | undefined;
      if (event.type === 'touched') tune = event.ate && !event.cuddle ? EAT : undefined;
      else if (event.type === 'called') tune = CALL;
      else tune = TUNES[event.type];
      if (!tune) continue;
      if ('who' in event && typeof event.who === 'number' && !heard(event.who)) continue;
      const now = performance.now();
      if (now - (this.lastAt.get(event.type) ?? -1e9) < 120) continue;
      this.lastAt.set(event.type, now);
      this.tune(tune);
    }
  }

  private tune(notes: Note[]): void {
    try {
      this.audio ??= new AudioContext();
      // a browser keeps sound off until you've clicked something, which you will have by now
      if (this.audio.state === 'suspended') void this.audio.resume();
      const start = this.audio.currentTime + 0.01;
      for (const n of notes) {
        const note = this.audio.createOscillator();
        const level = this.audio.createGain();
        note.type = n.wave ?? 'triangle';
        note.frequency.setValueAtTime(n.pitch, start + n.at);
        if (n.slide) note.frequency.exponentialRampToValueAtTime(n.slide, start + n.at + n.length);
        const peak = 0.12 * this.volume * (n.loud ?? 1);
        level.gain.setValueAtTime(0.0001, start + n.at);
        level.gain.exponentialRampToValueAtTime(peak, start + n.at + 0.015);
        level.gain.exponentialRampToValueAtTime(0.0001, start + n.at + n.length);
        note.connect(level).connect(this.audio.destination);
        note.start(start + n.at);
        note.stop(start + n.at + n.length + 0.05);
      }
    } catch {
      // no sound on this machine, and nothing depends on it
    }
  }
}
