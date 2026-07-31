import { describe, expect, it } from 'vitest';

import { ANCIENTS } from '../game/ancients';
import { CREW } from '../game/heroes';
import {
  AVATAR_IDS,
  avatarFrame,
  avatarSpec,
  avatarSpriteSvg,
  avatarSymbolId,
  hasHandSetPortrait,
  mountAvatarSprite,
  portraitSvg,
  portraitTile,
  tierClass,
} from './avatars';

/** Der Rumpf eines Symbols aus dem Sprite (ohne die `<symbol …>`-Hülle). */
function symbolBody(sprite: string, symbolId: string): string {
  const open = sprite.indexOf(`<symbol id="${symbolId}"`);
  expect(open).toBeGreaterThanOrEqual(0);
  const start = sprite.indexOf('>', open) + 1;
  return sprite.slice(start, sprite.indexOf('</symbol>', start));
}

describe('avatars — Roster-Abdeckung (4a)', () => {
  it('bringt für JEDES Crew-Mitglied und JEDEN Ahnen ein Portrait mit', () => {
    expect(AVATAR_IDS).toHaveLength(CREW.length + ANCIENTS.length);
    for (const cfg of CREW) expect(AVATAR_IDS).toContain(cfg.id);
    for (const a of ANCIENTS) expect(AVATAR_IDS).toContain(a.id);
  });

  it('hat für jede Roster-Id einen HANDGESETZTEN Bauplan (kein Hash-Fallback)', () => {
    // Ein neu erfundenes Mitglied bekommt ein Hash-Gesicht, damit nie eine
    // Zeile ohne Portrait dasteht — genau deshalb muss ein Test festhalten,
    // dass kein BESTEHENDES Mitglied still in diesen Fallback rutscht.
    for (const id of AVATAR_IDS) {
      expect(hasHandSetPortrait(id), id).toBe(true);
      expect(avatarSpec(id).sig.behind ?? avatarSpec(id).sig.front, id).toBeTruthy();
    }
    expect(hasHandSetPortrait('neues-mitglied')).toBe(false);
  });

  it('gibt jedem Crew-Mitglied eine EIGENE Rahmenfarbe', () => {
    const frames = CREW.map((c) => avatarFrame(c.id));
    expect(new Set(frames).size).toBe(CREW.length);
    for (const f of frames) expect(f).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe('avatars — Stroke-Icon-Sprache (4a)', () => {
  const sprite = avatarSpriteSvg();

  it('zeichnet mit currentColor-Strichen und ohne Bild-Assets oder Emojis', () => {
    expect(sprite).toContain('stroke="currentColor"');
    expect(sprite).not.toContain('<image');
    expect(sprite).not.toContain('url(');
    // Emojis: alles oberhalb der BMP-Basisebene ist hier ein Fehler.
    expect(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(sprite)).toBe(false);
  });

  it('macht 15 unterscheidbare Crew-Signaturen (keine zwei gleichen Portraits)', () => {
    const bodies = AVATAR_IDS.map((id) => symbolBody(sprite, avatarSymbolId(id)));
    expect(new Set(bodies).size).toBe(AVATAR_IDS.length);
  });

  it('unterscheidet Standard- und Power-Pose für jedes Portrait', () => {
    for (const id of AVATAR_IDS) {
      const base = symbolBody(sprite, avatarSymbolId(id, 'base'));
      const power = symbolBody(sprite, avatarSymbolId(id, 'power'));
      expect(power, id).not.toBe(base);
      expect(power, id).toContain('stroke-width="1.75"'); // kräftigerer Strich
    }
  });

  it('ist deterministisch — gleicher Input, byte-gleicher Output', () => {
    expect(avatarSpriteSvg()).toBe(sprite);
    expect(portraitSvg('legend')).toBe(portraitSvg('legend'));
    expect(avatarSpec('legend')).toEqual(avatarSpec('legend'));
  });
});

describe('avatars — Sprite-Guardrail (4b: die Crew-Liste rebuildet im 0.25-s-Tick)', () => {
  it('trägt die Geometrie NUR im Sprite — eine Zeile ist zwei Knoten', () => {
    const markup = portraitSvg('dj');
    expect(markup).toContain('<use href="#av-dj"/>');
    // Keine Geometrie in der Zeile: sonst wäre jeder Rebuild DOM-Müll.
    for (const tag of ['<path', '<circle', '<ellipse', '<rect', '<g ']) {
      expect(markup).not.toContain(tag);
    }
    expect(markup.match(/</g)).toHaveLength(3); // <svg  <use  </svg
  });

  it('legt je Id genau ein Symbol pro Pose an, mit eindeutigen Ids', () => {
    const sprite = avatarSpriteSvg();
    const ids = [...sprite.matchAll(/<symbol id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toHaveLength(AVATAR_IDS.length * 2);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^av-[a-z0-9-]+$/);
  });

  it('hängt das Sprite nur EINMAL in den Body (idempotent)', () => {
    const appended: unknown[] = [];
    const store: Record<string, unknown> = {};
    const doc = {
      getElementById: (id: string) => store[id] ?? null,
      createElement: () => ({
        set innerHTML(html: string) {
          (this as { firstElementChild?: unknown }).firstElementChild = { html };
        },
        firstElementChild: null as unknown,
      }),
      body: {
        appendChild: (n: unknown) => {
          appended.push(n);
          store.avatarSprite = n;
        },
      },
    } as unknown as Document;
    mountAvatarSprite(doc);
    mountAvatarSprite(doc);
    expect(appended).toHaveLength(1);
  });
});

describe('avatars — Kachel-Rahmen (4b)', () => {
  it('gibt der Kachel die Mitglieds-Palette als CSS-Variable mit', () => {
    expect(portraitTile('hype')).toContain(`--av-frame:${avatarFrame('hype')}`);
    expect(portraitTile('hype', 'power', 'av-lg')).toContain('class="av av-lg"');
    expect(portraitTile('hype', 'power')).toContain('#av-hype-power');
  });

  it('staffelt den Tier-Rahmen je zwei Stufen und deckelt bei Prisma', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 20].map(tierClass)).toEqual([
      'tr1',
      'tr1',
      'tr2',
      'tr2',
      'tr3',
      'tr3',
      'tr4',
      'tr4',
      'tr5',
      'tr5',
    ]);
    expect(tierClass(0)).toBe('tr1'); // defensiv: keine leere Klasse
  });
});

describe('avatars — unbekannte Ids (Zukunftssicherheit)', () => {
  it('erfindet deterministisch ein Gesicht statt gar keins', () => {
    const a = avatarSpec('neues-mitglied');
    expect(a).toEqual(avatarSpec('neues-mitglied'));
    expect(a).not.toEqual(avatarSpec('anderes-mitglied'));
    expect(avatarFrame('neues-mitglied')).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('nimmt eine neue Id ins Sprite auf, wenn sie mitgegeben wird', () => {
    const sprite = avatarSpriteSvg(['neues-mitglied']);
    expect(sprite).toContain('<symbol id="av-neues-mitglied"');
    expect(sprite).toContain('<symbol id="av-neues-mitglied-power"');
  });

  it('putzt Fremdzeichen aus der Symbol-Id (kein kaputtes Attribut)', () => {
    expect(avatarSymbolId('bö"se<id')).toBe('av-bseid');
  });
});
