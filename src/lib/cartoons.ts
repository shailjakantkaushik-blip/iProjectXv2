/** Platform cartoon / mascot catalog (independent of style theme). */

export const CARTOON_IDS = [
  "guide",
  "tiger",
  "astronaut",
  "football",
  "cricket",
  "santa",
  "eid",
  "diwali",
  "holi",
  "fitness",
  "yoga",
] as const;

export type CartoonId = (typeof CARTOON_IDS)[number];

export type CartoonMeta = {
  id: CartoonId;
  name: string;
  description: string;
  /** Tiny emoji-like hint for compact picker chips */
  hint: string;
};

export const CARTOONS: CartoonMeta[] = [
  {
    id: "guide",
    name: "PMO Guide",
    description: "Classic tablet-wielding portfolio guide.",
    hint: "📋",
  },
  {
    id: "tiger",
    name: "Tiger",
    description: "Bold wildlife mascot with a friendly wave.",
    hint: "🐯",
  },
  {
    id: "astronaut",
    name: "Astronaut",
    description: "Helmeted explorer for mission-mode teams.",
    hint: "🚀",
  },
  {
    id: "football",
    name: "Football player",
    description: "Kit, ball, and goal-energy for delivery sprints.",
    hint: "⚽",
  },
  {
    id: "cricket",
    name: "Cricket player",
    description: "Bat-ready companion for the long innings.",
    hint: "🏏",
  },
  {
    id: "santa",
    name: "Santa Claus",
    description: "Festive winter cheer for year-end close.",
    hint: "🎅",
  },
  {
    id: "eid",
    name: "Eid festival",
    description: "Celebration-ready guide with lantern glow.",
    hint: "🌙",
  },
  {
    id: "diwali",
    name: "Diwali",
    description: "Festival lady with a glowing diya.",
    hint: "🪔",
  },
  {
    id: "holi",
    name: "Holi",
    description: "Colour-splashed joy for colourful portfolios.",
    hint: "🎨",
  },
  {
    id: "fitness",
    name: "Fitness",
    description: "Energetic trainer for healthy delivery habits.",
    hint: "💪",
  },
  {
    id: "yoga",
    name: "Yoga",
    description: "Calm presence for focused, balanced work.",
    hint: "🧘",
  },
];

export function isCartoonId(v: unknown): v is CartoonId {
  return typeof v === "string" && (CARTOON_IDS as readonly string[]).includes(v);
}

export function normalizeCartoonId(v: unknown, fallback: CartoonId = "guide"): CartoonId {
  return isCartoonId(v) ? v : fallback;
}

export function cartoonMeta(id: CartoonId): CartoonMeta {
  return CARTOONS.find((c) => c.id === id) ?? CARTOONS[0]!;
}
