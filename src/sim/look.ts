// how a creature looks. it's only for the player: it doesn't see itself, so none of this touches its brain.
export const SKINS = ['sprout', 'spots', 'stripes', 'fluff', 'ghost', 'robot', 'slime', 'bunny', 'cat', 'cosmos'] as const;
export type Skin = (typeof SKINS)[number];

export const SKIN_NAMES: Record<Skin, string> = {
  sprout: 'Sprout',
  spots: 'Spots',
  stripes: 'Stripes',
  fluff: 'Fluff',
  ghost: 'Ghost',
  robot: 'Robot',
  slime: 'Slime',
  bunny: 'Bunny',
  cat: 'Cat',
  cosmos: 'Cosmos',
};

export interface Look {
  skin: Skin;
  body: number;
  belly: number;
  accent: number; // the sprout on its head, and the skin's markings
  eyes: number;
}

export const DEFAULT_LOOK: Look = { skin: 'sprout', body: 0x4fd6c3, belly: 0xbdf3e9, accent: 0x35a899, eyes: 0x14202a };

// ready-made colours that go together
export const PALETTES: { name: string; body: number; belly: number; accent: number }[] = [
  { name: 'Mint', body: 0x4fd6c3, belly: 0xbdf3e9, accent: 0x35a899 },
  { name: 'Coral', body: 0xf2776b, belly: 0xffd6c9, accent: 0xc2453d },
  { name: 'Honey', body: 0xf5c04a, belly: 0xfff0c2, accent: 0xc98a1b },
  { name: 'Leaf', body: 0x7ccb5a, belly: 0xdcf5c8, accent: 0x4a9433 },
  { name: 'Sky', body: 0x5aa9f0, belly: 0xcfe6ff, accent: 0x2f76c2 },
  { name: 'Violet', body: 0xa684f0, belly: 0xe5daff, accent: 0x7450c7 },
  { name: 'Candy', body: 0xf48cc0, belly: 0xffdcee, accent: 0xc9568f },
  { name: 'Snow', body: 0xe8ecf4, belly: 0xffffff, accent: 0x9aa6bd },
  { name: 'Shadow', body: 0x454b63, belly: 0x7d84a0, accent: 0x2b2f42 },
];

function colour(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xffffff ? value : fallback;
}

export function cleanLook(raw: unknown): Look {
  const l = (raw ?? {}) as Record<string, unknown>;
  return {
    skin: SKINS.includes(l.skin as Skin) ? (l.skin as Skin) : DEFAULT_LOOK.skin,
    body: colour(l.body, DEFAULT_LOOK.body),
    belly: colour(l.belly, DEFAULT_LOOK.belly),
    accent: colour(l.accent, DEFAULT_LOOK.accent),
    eyes: colour(l.eyes, DEFAULT_LOOK.eyes),
  };
}
