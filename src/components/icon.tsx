import {
  ArrowDown, ArrowLeftRight, ArrowUp, Bell, BriefcaseBusiness, CalendarDays, Camera, CarFront,
  ChartNoAxesCombined, Check, ChevronDown, ChevronLeft, ChevronRight, Circle, CircleCheck,
  CircleHelp, CircleSlash, Clapperboard, Clock3, CreditCard, Cross, Ellipsis, Eye, FileText,
  Flag, Flame, Gem, Gift, GraduationCap, House, KeyRound, Landmark, Lightbulb, ListFilter,
  Medal, Minus, Monitor, Moon, NotebookText, Pause, Pencil, Pin, Plus, ReceiptText, RotateCcw,
  Search, Send, Settings2, Shield, Shirt, ShoppingBag, Smartphone, Sparkles, Store, Sun, Tag,
  Target, TrendingDown, TrendingUp, TriangleAlert, Trophy, UsersRound, WalletCards, Wrench, X,
  type LucideIcon,
} from "lucide-react";

/**
 * One line-icon system, replacing the emoji strings the product shipped with.
 *
 * All non-navigation icons are provided by Lucide: they share one 24×24 grid,
 * rounded geometry and an optically consistent 1.9px stroke. The approved
 * bottom-navigation artwork stays custom and untouched.
 *
 * MIGRATION NOTE — icons are user data, not just markup. `categories.icon` and
 * `goals.icon` are text columns in Postgres, written by the seed, by the
 * per-user bootstrap. Migration 0010 rewrites known emoji to semantic keys.
 * An unknown legacy value falls back to a stable outline rather than a
 * platform-dependent emoji. See resolveIconName below.
 */

type El =
  | { t: "path"; d: string }
  | { t: "circle"; cx: number; cy: number; r: number }
  | { t: "rect"; x: number; y: number; w: number; h: number; rx: number };

type IconDef = {
  el: El[];
  /** viewBox size; 16 unless noted. */
  box?: number;
  /** stroke-width; 1.7 unless noted. */
  sw?: number;
};

const p = (d: string): El => ({ t: "path", d });
const c = (cx: number, cy: number, r: number): El => ({ t: "circle", cx, cy, r });
const r = (x: number, y: number, w: number, h: number, rx: number): El => ({ t: "rect", x, y, w, h, rx });

const ICONS = {
  /* ---- Categories ------------------------------------------------------- */
  food: {
    el: [
      p("M4.3 5.9h7.4l-.7 7a1.1 1.1 0 0 1-1.1 1H6.1a1.1 1.1 0 0 1-1.1-1z"),
      p("M6.3 5.9V4.8a1.7 1.7 0 0 1 3.4 0v1.1"),
    ],
  },
  transport: {
    el: [
      p("M4.4 7.5 5.6 4.8a1.2 1.2 0 0 1 1.1-.7h2.6a1.2 1.2 0 0 1 1.1.7l1.2 2.7"),
      p("M2.9 7.5h10.2v3.4H2.9z"),
      p("M4.9 10.9v1.2M11.1 10.9v1.2"),
    ],
  },
  home: {
    el: [p("M2.6 7.2 8 3.2l5.4 4"), p("M4 8.4v4.4h8V8.4"), p("M6.8 12.8V10h2.4v2.8")],
  },
  /** Ijara — a rent row next to its "Uy" parent needs its own mark. */
  key: {
    el: [c(5.6, 10.4, 2.4), p("M7.3 8.7 12.4 3.6"), p("M10.6 5.4l1.4 1.4M12.4 3.6l1.4 1.4")],
  },
  utilities: {
    el: [p("M6.2 11.2a3.6 3.6 0 1 1 3.6 0v1.3H6.2z"), p("M6.7 14h2.6")],
  },
  repair: {
    el: [
      p("M10.9 2.9a3.2 3.2 0 0 0-4.2 4L3.5 10.1a1.6 1.6 0 0 0 2.3 2.3l3.2-3.2a3.2 3.2 0 0 0 4-4.2l-1.9 1.9-1.6-.4-.4-1.6z"),
    ],
  },
  bank: {
    el: [
      p("M2.6 6.7 8 3.6l5.4 3.1"),
      p("M4 6.9v5.4M12 6.9v5.4M6.7 6.9v5.4M9.3 6.9v5.4"),
      p("M2.6 12.7h10.8"),
    ],
  },
  wallet: {
    el: [
      p("M2.7 5.8h9.1a1.6 1.6 0 0 1 1.6 1.6v3.9a1.6 1.6 0 0 1-1.6 1.6H4.3a1.6 1.6 0 0 1-1.6-1.6z"),
      p("M2.7 5.8V5.2a1.1 1.1 0 0 1 1.1-1.1h6.5"),
      c(10.5, 9.3, 0.95),
    ],
  },
  card: { el: [r(2, 4, 12, 8, 2), p("M2 7h12")] },
  salary: {
    el: [
      r(2.5, 5.3, 11, 7.3, 1.8),
      p("M6 5.3V4.4a1.1 1.1 0 0 1 1.1-1.1h1.8A1.1 1.1 0 0 1 10 4.4v.9"),
      p("M2.5 8.7h11"),
    ],
  },
  business: {
    el: [p("M2.6 6.4h10.8v6.6H2.6z"), p("M2.6 6.4 4 3.6h8l1.4 2.8"), p("M6.4 13V9.4h3.2V13")],
  },
  entertainment: {
    el: [r(2.5, 4.2, 11, 7, 1.6), p("M8 11.2v2.2M6.4 13.4h3.2")],
  },
  phone: { el: [r(4, 1.8, 8, 12.4, 2), p("M7 12.4h2")] },
  family: {
    el: [
      c(6, 5.6, 1.9),
      p("M2.7 12.7a3.3 3.3 0 0 1 6.6 0"),
      c(11.5, 6.6, 1.4),
      p("M10.6 10.2a2.9 2.9 0 0 1 2.7 2.5"),
    ],
  },
  health: { el: [r(2.5, 2.5, 11, 11, 3), p("M8 5.6v4.8M5.6 8h4.8")] },
  education: {
    el: [p("M8 5.2S6.8 4 3.3 4v7.6C6.8 11.6 8 12.8 8 12.8s1.2-1.2 4.7-1.2V4C9.2 4 8 5.2 8 5.2Z"), p("M8 5.2v7.6")],
  },
  clothing: {
    el: [p("M6 3.2 3 4.7l.9 2.4 1.3-.5v5.9h5.6V6.6l1.3.5.9-2.4-3-1.5a2 2 0 0 1-4 0Z")],
  },
  gift: {
    el: [
      r(2.6, 6.4, 10.8, 6.6, 1.4),
      p("M2.6 8.9h10.8M8 6.4V13"),
      p("M8 6.4C6.9 6.4 5.4 6 5.4 4.9a1.3 1.3 0 0 1 2.6 0"),
      p("M8 6.4c1.1 0 2.6-.4 2.6-1.5a1.3 1.3 0 0 0-2.6 0"),
    ],
  },
  sparkle: {
    el: [
      p("M8 2.6 9.3 5.7 12.4 7 9.3 8.3 8 11.4 6.7 8.3 3.6 7l3.1-1.3z"),
      p("M12.2 10.6l.5 1.2 1.2.5-1.2.5-.5 1.2-.5-1.2-1.2-.5 1.2-.5z"),
    ],
  },
  /** Qarz qaytishi — money coming back, not a handshake. */
  return: {
    el: [p("M13.2 8a5.2 5.2 0 1 1-1.5-3.7"), p("M13.4 2.3v2.9h-2.9")],
  },
  goal: {
    el: [
      p("M5.4 3.3h5.2v2.4a2.6 2.6 0 0 1-5.2 0z"),
      p("M5.4 4h-1.2a1.2 1.2 0 0 0 1.4 1.7M10.6 4h1.2a1.2 1.2 0 0 1-1.4 1.7"),
      p("M8 8.3v2.1M5.6 13.1h4.8M6.6 10.4h2.8"),
    ],
  },
  target: { el: [c(8, 8, 5.4), c(8, 8, 2.6), c(8, 8, 0.3)] },
  shield: {
    el: [p("M8 2.4 13 4.3v3.9c0 3-2.1 4.6-5 5.4-2.9-.8-5-2.4-5-5.4V4.3z")],
  },
  doc: { el: [r(3, 2.5, 10, 11, 2), p("M6 6h4M6 9h2.5")] },
  settings: {
    el: [p("M3 5.6h9.9M3.1 10.4H13"), c(6.1, 5.6, 1.6), c(9.9, 10.4, 1.6)],
  },
  telegram: {
    el: [p("M2.5 8 13.5 3.5l-2 9-3.5-2.5z"), p("M8 10l-.5 3 2-1.5")],
  },
  tag: {
    el: [p("M13.2 8.7 8.7 13.2a1.4 1.4 0 0 1-2 0L2.9 9.4a1.4 1.4 0 0 1-.4-1V3.7a1.2 1.2 0 0 1 1.2-1.2h4.7a1.4 1.4 0 0 1 1 .4l3.8 3.8a1.4 1.4 0 0 1 0 2Z"), c(5.7, 5.7, 0.9)],
  },
  chart: {
    el: [p("M2.8 13.2V2.8M2.8 13.2h10.4"), p("M6 11V7.4M9 11V4.6M12 11V8.4")],
  },
  dot: { el: [c(8, 8, 2.2)] },
  /** Overflow menu. Three drawn dots beat "•••" text, which varies by font. */
  more: { el: [c(3.4, 8, 1.05), c(8, 8, 1.05), c(12.6, 8, 1.05)] },

  /* ---- Interface -------------------------------------------------------- */
  bell: {
    box: 20,
    el: [p("M6 8a4 4 0 0 1 8 0c0 3 1.2 4.2 1.6 4.6H4.4C4.8 12.2 6 11 6 8Z"), p("M8.6 15.2a1.6 1.6 0 0 0 2.8 0")],
  },
  eye: { el: [p("M1.5 8S3.8 4 8 4s6.5 4 6.5 4-2.3 4-6.5 4S1.5 8 1.5 8Z"), c(8, 8, 1.8)] },
  calendar: {
    el: [r(2.5, 3.5, 11, 10, 2), p("M5.5 2v2.5M10.5 2v2.5M2.5 7h11")],
  },
  camera: {
    el: [r(2, 4, 12, 9, 2), c(8, 8.5, 2.3), p("M5.5 4l1-1.5h3l1 1.5")],
  },
  /** Brand mark — a ledger, shown in the gold square. */
  ledger: {
    el: [p("M3.5 13V4.5A1.5 1.5 0 0 1 5 3h6a1.5 1.5 0 0 1 1.5 1.5V13"), p("M6 6.5h4M6 9.5h2.5M2.5 13h11")],
  },
  filter: { el: [p("M2.5 4.5h11M4.5 8h7M6.5 11.5h3")] },
  edit: { box: 24, el: [p("M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z")] },
  moon: { el: [p("M13 9.5A5.5 5.5 0 0 1 6.5 3a5.5 5.5 0 1 0 6.5 6.5Z")] },
  sun: {
    el: [c(8, 8, 2.9), p("M8 1.6v1.5M8 12.9v1.5M1.6 8h1.5M12.9 8h1.5M3.5 3.5l1 1M11.5 11.5l1 1M12.5 3.5l-1 1M4.5 11.5l-1 1")],
  },
  info: { el: [c(8, 8, 5.6), p("M8 7.4v3.4M8 5.3h.01")], sw: 1.8 },
  /** "Tizim" theme mode — follow the device. */
  monitor: {
    el: [r(2.2, 3.2, 11.6, 8, 1.6), p("M6 13.6h4M8 11.2v2.4")],
  },
  receipt: {
    el: [p("M3.4 13.6V3.2a.6.6 0 0 1 .9-.5l1.4.8 1.4-.8a.6.6 0 0 1 .6 0l1.4.8 1.4-.8a.6.6 0 0 1 .9.5v10.4l-1.4-.8-1.4.8-1.4-.8-1.4.8-1.4-.8z"), p("M5.8 6.2h4.4M5.8 9h2.8")],
  },
  clock: { el: [c(8, 8, 5.6), p("M8 4.9V8l2.2 1.5")] },
  pause: { el: [p("M6.2 3.8v8.4M9.8 3.8v8.4")], sw: 1.9 },
  ban: { el: [c(8, 8, 5.4), p("M4.2 4.2 11.8 11.8")] },
  flag: { el: [p("M4 13.4V3"), p("M4 3.4h7.4L9.9 5.8l1.5 2.4H4")] },
  pin: {
    el: [p("M9.6 2.4 13.6 6.4l-2.2.6-2.7 2.7-.3 2.6-4.6-4.6 2.6-.3 2.7-2.7z"), p("M5.8 10.2 2.8 13.2")],
  },
  "trend-up": {
    el: [p("M2.6 11.4 6.2 7.8l2.4 2.4 4.8-4.8"), p("M9.8 5.4h3.6V9")],
    sw: 1.8,
  },
  "trend-down": {
    el: [p("M2.6 4.6 6.2 8.2l2.4-2.4 4.8 4.8"), p("M9.8 10.6h3.6V7")],
    sw: 1.8,
  },
  "check-circle": { el: [c(8, 8, 5.6), p("m5.5 8.2 1.8 1.8 3.4-3.6")], sw: 1.8 },
  flame: {
    el: [p("M8 13.6c2.2 0 3.8-1.5 3.8-3.5C11.8 7.4 8 2.4 8 2.4S4.2 7.4 4.2 10.1c0 2 1.6 3.5 3.8 3.5Z"), p("M8 13.6c1 0 1.7-.7 1.7-1.6 0-1.2-1.7-3-1.7-3s-1.7 1.8-1.7 3c0 .9.7 1.6 1.7 1.6Z")],
  },
  medal: {
    el: [c(8, 9.8, 3.6), p("M6.2 6.6 4.5 2.4M9.8 6.6l1.7-4.2"), p("m8 8.2.7 1.4 1.5.2-1.1 1.1.3 1.5-1.4-.7-1.4.7.3-1.5-1.1-1.1 1.5-.2z")],
  },
  gem: {
    el: [p("M4.2 3.4h7.6l2.2 3.2L8 13.2 1.99 6.6z"), p("M1.99 6.6h12.02M5.6 6.6 8 13.2l2.4-6.6M4.2 3.4l1.4 3.2M11.8 3.4l-1.4 3.2")],
  },

  /* ---- Directional / utility ------------------------------------------- */
  "arrow-up": { el: [p("M8 13V3m0 0L4.5 6.5M8 3l3.5 3.5")], sw: 2 },
  "arrow-down": { el: [p("M8 3v10m0 0 3.5-3.5M8 13 4.5 9.5")], sw: 2 },
  transfer: {
    el: [p("M2.5 6h9m0 0L9 3.5M11.5 6 9 8.5"), p("M13.5 10h-9m0 0L7 7.5M4.5 10 7 12.5")],
    sw: 2,
  },
  "chevron-right": { el: [p("M6 4l4 4-4 4")], sw: 2 },
  "chevron-down": { el: [p("M4 6l4 4 4-4")], sw: 2 },
  "chevron-left": { el: [p("M10 4l-4 4 4 4")], sw: 2 },
  close: { el: [p("M4 4l8 8M12 4l-8 8")], sw: 2 },
  check: { box: 24, el: [p("m5 13 4.5 4.5L19 7")], sw: 2.8 },
  plus: { box: 24, el: [p("M12 5v14M5 12h14")], sw: 2.2 },
  minus: { box: 24, el: [p("M5 12h14")], sw: 2.2 },
  warning: { el: [p("M8 2.5 14.5 13.5h-13z"), p("M8 6.5v3M8 11.5h.01")], sw: 1.8 },
  search: { box: 24, el: [c(11, 11, 7), p("m16.5 16.5 4 4")], sw: 2 },

  /* ---- Navigation (24×24) ---------------------------------------------- */
  "nav-home": {
    box: 24,
    sw: 1.8,
    el: [p("M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4v-5H9v5H5a1 1 0 0 1-1-1z")],
  },
  "nav-history": { box: 24, sw: 1.8, el: [p("M4 7h16M4 12h16M4 17h10")] },
  "nav-plans": {
    box: 24,
    sw: 1.8,
    el: [r(3.5, 5, 17, 15, 3), p("M8 3.5v3M16 3.5v3M3.5 10h17")],
  },
  "nav-analytics": {
    box: 24,
    sw: 1.8,
    el: [p("M4 19V5M4 19h16"), p("M8 16v-4M12.5 16V8M17 16v-6")],
  },
  "nav-more": {
    box: 24,
    sw: 1.8,
    el: [r(4, 4, 6.5, 6.5, 2), r(13.5, 4, 6.5, 6.5, 2), r(4, 13.5, 6.5, 6.5, 2), r(13.5, 13.5, 6.5, 6.5, 2)],
  },
} satisfies Record<string, IconDef>;

export type IconName = keyof typeof ICONS;

/*
 * All product icons other than the approved bottom navigation use one mature
 * icon family. It fixes the former mix of hand-drawn 16px and 24px glyphs:
 * every symbol now shares the same corner language, optical weight and canvas.
 * `nav-*` deliberately stays on the original artwork requested by the user.
 */
const STANDARD_ICONS: Record<Exclude<IconName, `nav-${string}`>, LucideIcon> = {
  food: ShoppingBag,
  transport: CarFront,
  home: House,
  key: KeyRound,
  utilities: Lightbulb,
  repair: Wrench,
  bank: Landmark,
  wallet: WalletCards,
  card: CreditCard,
  salary: BriefcaseBusiness,
  business: Store,
  entertainment: Clapperboard,
  phone: Smartphone,
  family: UsersRound,
  health: Cross,
  education: GraduationCap,
  clothing: Shirt,
  gift: Gift,
  sparkle: Sparkles,
  return: RotateCcw,
  goal: Trophy,
  target: Target,
  shield: Shield,
  doc: FileText,
  settings: Settings2,
  telegram: Send,
  tag: Tag,
  chart: ChartNoAxesCombined,
  dot: Circle,
  more: Ellipsis,
  bell: Bell,
  eye: Eye,
  calendar: CalendarDays,
  camera: Camera,
  ledger: NotebookText,
  filter: ListFilter,
  edit: Pencil,
  moon: Moon,
  sun: Sun,
  info: CircleHelp,
  monitor: Monitor,
  receipt: ReceiptText,
  clock: Clock3,
  pause: Pause,
  ban: CircleSlash,
  flag: Flag,
  pin: Pin,
  "trend-up": TrendingUp,
  "trend-down": TrendingDown,
  "check-circle": CircleCheck,
  flame: Flame,
  medal: Medal,
  gem: Gem,
  "arrow-up": ArrowUp,
  "arrow-down": ArrowDown,
  transfer: ArrowLeftRight,
  "chevron-right": ChevronRight,
  "chevron-down": ChevronDown,
  "chevron-left": ChevronLeft,
  close: X,
  check: Check,
  plus: Plus,
  minus: Minus,
  warning: TriangleAlert,
  search: Search,
};

/**
 * Every emoji this product has ever written into the database or hard-coded in
 * a component, mapped to its replacement. Migration 0010 applies the same table
 * to `categories.icon` and `goals.icon`; this map is what keeps rows that were
 * written BEFORE the migration (or by an older running instance) rendering
 * correctly, and it is the reason the two must stay in sync.
 */
const LEGACY_EMOJI: Record<string, IconName> = {
  // expense categories
  "🏠": "home",
  "🔑": "key",
  "💡": "utilities",
  "🛠": "repair",
  "🛠️": "repair",
  "🥗": "food",
  "🍎": "food",
  "🚕": "transport",
  "🚌": "transport",
  "🚗": "transport",
  "🏦": "bank",
  "📱": "phone",
  "👨‍👩‍👧": "family",
  "💊": "health",
  "📚": "education",
  "👕": "clothing",
  "🎬": "entertainment",
  // income categories
  "💼": "salary",
  "🏪": "business",
  "🎁": "gift",
  "✨": "sparkle",
  "🤝": "return",
  // accounts
  "💵": "wallet",
  "💳": "card",
  "💰": "wallet",
  // goals + menu
  "🎯": "target",
  "🛟": "shield",
  "✈️": "telegram",
  "🏆": "goal",
  "📋": "doc",
  "📄": "doc",
  "🤖": "telegram",
  "⚙️": "settings",
  "☀️": "sun",
  "🌙": "moon",
  "🏷️": "tag",
  "📊": "chart",
  "📈": "trend-up",
  "📉": "trend-down",
  // controls + insights
  "➕": "arrow-up",
  "➖": "arrow-down",
  "↔️": "transfer",
  "↔": "transfer",
  "🔄": "transfer",
  "📌": "pin",
  "🚫": "ban",
  "🏁": "flag",
  "⚠️": "warning",
  "🚨": "warning",
  "✅": "check-circle",
  "🔥": "flame",
  "🥇": "medal",
  "💎": "gem",
  "🎲": "sparkle",
  "👁": "eye",
  "📅": "calendar",
  "📷": "camera",
  "✏️": "edit",
  "🔔": "bell",
  "•": "dot",
  "◎": "target",
  "❚❚": "pause",
};

/**
 * Map a stored icon value to a registry key. Returns null when the value is
 * neither a known key nor a known emoji.
 */
export function resolveIconName(raw: string | null | undefined): IconName | null {
  if (!raw) return null;
  const key = raw.trim();
  if (!key) return null;
  if (key in ICONS) return key as IconName;
  return LEGACY_EMOJI[key] ?? null;
}

export function hasIcon(raw: string | null | undefined): boolean {
  return resolveIconName(raw) !== null;
}

/**
 * The icons offered when a user picks one for their own category or goal.
 * Deliberately a curated subset — the navigation, chevron and control glyphs
 * are interface furniture and would be meaningless on a category row.
 */
export const PICKABLE_ICONS: IconName[] = [
  "dot", "food", "transport", "home", "key", "utilities", "repair", "bank", "wallet", "card",
  "salary", "business", "entertainment", "phone", "family", "health", "education", "clothing",
  "gift", "sparkle", "return", "goal", "target", "shield", "doc", "tag", "chart", "telegram",
  "calendar", "camera", "bell", "flame", "medal", "gem", "settings",
];

/**
 * Replaces the old "Ikona (emoji)" free-text field. A text input would still
 * accept an arbitrary glyph, which is exactly what this step moves away from,
 * so the choice is constrained to the registry.
 */
export function IconPicker({
  value,
  onChange,
  labelledBy,
}: {
  value: string;
  onChange: (name: IconName) => void;
  labelledBy?: string;
}) {
  const selected = resolveIconName(value);
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      className="grid max-h-40 grid-cols-7 gap-1.5 overflow-y-auto overscroll-contain rounded-xl border border-line bg-surface-2 p-2 sm:grid-cols-9"
    >
      {PICKABLE_ICONS.map((name) => {
        const active = name === selected;
        return (
          <button
            key={name}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={name}
            onClick={() => onChange(name)}
            className={`grid h-9 w-full min-w-9 place-items-center rounded-lg border transition-colors touch-manipulation ${
              active
                ? "border-transparent bg-accent-soft text-accent-text ring-2 ring-inset ring-accent"
                : "border-line bg-surface text-muted hover:text-fg active:bg-surface-3"
            }`}
          >
            <Icon name={name} size={17} />
          </button>
        );
      })}
    </div>
  );
}

export function Icon({
  name,
  size = 17,
  fallback = "tag",
  className,
  strokeWidth,
}: {
  /** A registry key, or any stored icon value (legacy emoji included). */
  name: IconName | (string & {}) | null | undefined;
  size?: number;
  /**
   * Used when a stored value is empty or no longer part of the curated system.
   * Unknown legacy glyphs resolve to this stable outline instead of rendering
   * platform-dependent emoji alongside the new icon family.
   */
  fallback?: IconName | null;
  className?: string;
  strokeWidth?: number;
}) {
  const resolved = resolveIconName(name);

  if (!resolved) {
    if (!fallback) return null;
    return <Icon name={fallback} size={size} className={className} strokeWidth={strokeWidth} fallback={null} />;
  }

  const standardIcon = STANDARD_ICONS[resolved as keyof typeof STANDARD_ICONS];
  if (standardIcon) {
    const LucideIcon = standardIcon;
    return (
      <LucideIcon
        width={size}
        height={size}
        strokeWidth={strokeWidth ?? 1.9}
        absoluteStrokeWidth
        className={className}
        aria-hidden="true"
        focusable="false"
      />
    );
  }

  const icon: IconDef = ICONS[resolved];
  const box = icon.box ?? 16;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${box} ${box}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth ?? icon.sw ?? 1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {icon.el.map((element, index) => {
        if (element.t === "circle") {
          return <circle key={index} cx={element.cx} cy={element.cy} r={element.r} />;
        }
        if (element.t === "rect") {
          return (
            <rect key={index} x={element.x} y={element.y} width={element.w} height={element.h} rx={element.rx} />
          );
        }
        return <path key={index} d={element.d} />;
      })}
    </svg>
  );
}
