# Audio Credits

All audio in Booty Clicker is **synthesised procedurally at runtime** via the
Web Audio API (`src/audio/`) — there are no audio files shipped with the game.

- **Music** (one generative loop per stage): bass + arpeggio + hi-hat sequences
  built from the per-background configs in `src/audio/tracks.ts`.
- **SFX** (shake/click, buy, unlock, combo, beat clap, boss hit/win/lose):
  short oscillator + filtered-noise envelopes in `src/audio/engine.ts`.

Because every sound is generated from original code (oscillators and noise), it
is entirely self-authored and free of third-party licences — effectively **CC0
(public domain)**. If pre-recorded CC0 tracks are added later, list each source,
author and licence here.

## Third-party code

- **Three.js** — MIT License (https://threejs.org)
