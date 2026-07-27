import { describe, expect, it } from 'vitest';

import { type EmptyIcon, emptyState } from './empty';

const ICONS: EmptyIcon[] = ['ancients', 'fame', 'chest', 'heaven', 'transcend', 'goals'];
// Emoji-Bereiche (Piktogramme, Symbole, Zusatzsymbole) — der Leerzustand nutzt
// die Stroke-Icon-Sprache, nicht die Emoji-Sprache des Inhalts.
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

describe('ROADMAP-V2 G6 — emptyState', () => {
  it('rendert für jedes Icon ein Stroke-SVG plus den Satz', () => {
    for (const icon of ICONS) {
      const html = emptyState(icon, 'Ein Satz, der sagt, wie es weitergeht.');
      expect(html).toContain('class="empty"');
      expect(html).toContain('<svg class="empty-ic"');
      expect(html).toContain('viewBox="0 0 24 24"');
      expect(html).toContain('Ein Satz, der sagt, wie es weitergeht.');
    }
  });

  it('nutzt je Leerzustand ein UNTERSCHIEDLICHES Icon', () => {
    const svgs = ICONS.map((i) => emptyState(i, 'x').replace(/Ein Satz.*/, ''));
    expect(new Set(svgs).size).toBe(ICONS.length);
  });

  it('bringt keine Emojis mit (bestehende Icon-Sprache, keine Doppelung)', () => {
    for (const icon of ICONS) expect(EMOJI.test(emptyState(icon, 'Text'))).toBe(false);
  });

  it('escaped den Satz, statt Markup durchzureichen', () => {
    const html = emptyState('fame', 'Ruhm & <b>mehr</b>');
    expect(html).toContain('Ruhm &amp; &lt;b&gt;mehr&lt;/b&gt;');
    expect(html).not.toContain('<b>mehr</b>');
  });
});
