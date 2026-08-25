import type { SVGProps } from "react";

/**
 * ONE icon vocabulary for every piece of UI chrome.
 *
 * Rules (mirror the bottom-nav set that shipped first):
 *   - 24×24 viewBox, stroke = currentColor, 1.8px weight, round caps/joins;
 *   - icons are decorative by default (`aria-hidden`); the interactive element
 *     that contains them owns the accessible name;
 *   - never use emoji for chrome: glyph rendering differs per platform
 *     (Telegram Android / iOS / desktop) and cannot inherit theme colors.
 * Data-driven emoji (user category/account artwork from the DB) stays emoji.
 */
export type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Base({ size = 20, strokeWidth = 1.8, children, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

/* ============================ Navigation ============================ */

export function HomeIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4v-5H9v5H5a1 1 0 0 1-1-1z" />
    </Base>
  );
}

export function ListIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 7h16M4 12h16M4 17h10" />
    </Base>
  );
}

export function CalendarIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="3.5" y="5" width="17" height="15" rx="3" />
      <path d="M8 3.5v3M16 3.5v3M3.5 10h17" />
    </Base>
  );
}

export function ChartIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 19V5M4 19h16" />
      <path d="M8 16v-4M12.5 16V8M17 16v-6" />
    </Base>
  );
}

export function GridIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="4" y="4" width="6.5" height="6.5" rx="2" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="2" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="2" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="2" />
    </Base>
  );
}

/* ============================ Chrome / actions ============================ */

export function PlusIcon(props: IconProps) {
  return (
    <Base strokeWidth={2.2} {...props}>
      <path d="M12 5v14M5 12h14" />
    </Base>
  );
}

export function XIcon(props: IconProps) {
  return (
    <Base strokeWidth={2} {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Base>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="m9 5 7 7-7 7" />
    </Base>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="m15 5-7 7 7 7" />
    </Base>
  );
}

export function FunnelIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 5h16l-6.4 7.2v5.3l-3.2 1.5v-6.8L4 5Z" />
    </Base>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m16.5 16.5 4 4" />
    </Base>
  );
}

export function BellIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 2.5 6.5H3.5C4.5 14.5 6 13 6 9Z" />
      <path d="M10 19a2.2 2.2 0 0 0 4 0" />
    </Base>
  );
}

export function SunIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2.5 12h2M19.5 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </Base>
  );
}

export function MoonIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M20 13.5A8 8 0 1 1 10.5 4a6.5 6.5 0 0 0 9.5 9.5Z" />
    </Base>
  );
}

export function MonitorIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="3" y="4.5" width="18" height="12.5" rx="2" />
      <path d="M8.5 20.5h7M12 17v3.5" />
    </Base>
  );
}

export function BotIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 3.5v3" />
      <rect x="4.5" y="6.5" width="15" height="11.5" rx="3.5" />
      <circle cx="9" cy="12" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r="0.8" fill="currentColor" stroke="none" />
      <path d="M9.5 15h5" />
    </Base>
  );
}

export function DotsIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="5" cy="12" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="0.9" fill="currentColor" stroke="none" />
    </Base>
  );
}

export function PencilIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
      <path d="m15 5 4 4" />
    </Base>
  );
}

export function ReceiptIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M6 3.5h12v17l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4z" />
      <path d="M9 8.5h6M9 12h6" />
    </Base>
  );
}

export function BanIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m6 6 12 12" />
    </Base>
  );
}

export function PauseIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M9 5.5v13M15 5.5v13" />
    </Base>
  );
}

export function PlayIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M8 5.5v13l10-6.5z" />
    </Base>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="m5 9 7 7 7-7" />
    </Base>
  );
}

export function InfoIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5M12 7.8h.01" />
    </Base>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="m5 12.5 4.5 4.5L19 7" />
    </Base>
  );
}

export function WarningIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 4 3.5 19h17L12 4Z" />
      <path d="M12 10v4M12 16.8h.01" />
    </Base>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </Base>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4.5 7h15M9.5 7V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2M6.5 7l1 12.5a1.5 1.5 0 0 0 1.5 1.4h6a1.5 1.5 0 0 0 1.5-1.4L17.5 7" />
      <path d="M10 11v5.5M14 11v5.5" />
    </Base>
  );
}

export function RefreshIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
      <path d="M19.5 3.5v3.7h-3.7" />
    </Base>
  );
}

/* ============================ Finance / sections ============================ */

export function WalletIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4.5 7.5V6.2A2.2 2.2 0 0 1 6.7 4h10.8a2 2 0 0 1 2 2v1.5" />
      <path d="M4.5 7.5h14.2a1.8 1.8 0 0 1 1.8 1.8v8.2a2.5 2.5 0 0 1-2.5 2.5H6.5A2.5 2.5 0 0 1 4 17.5V9.1a1.6 1.6 0 0 1 1.6-1.6" />
      <path d="M16.4 11.2h4.1v4.6h-4.1a2.3 2.3 0 1 1 0-4.6Z" />
      <path d="M16.5 13.5h.01" />
    </Base>
  );
}

export function TrendUpIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M8 13V3m0 0L4.5 6.5M8 3l3.5 3.5" />
    </Base>
  );
}

export function TrendDownIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M8 3v10m0 0 3.5-3.5M8 13 4.5 9.5" />
    </Base>
  );
}

export function CashIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="3" y="6.5" width="18" height="11" rx="2" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M6 10h.01M18 14h.01" />
    </Base>
  );
}

export function CardIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
      <path d="M3 10h18M7 15h4" />
    </Base>
  );
}

export function BankIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M3.5 9.5 12 4l8.5 5.5v1h-17z" />
      <path d="M5.5 10.5V17M10 10.5V17M14 10.5V17M18.5 10.5V17M4 20h16" />
    </Base>
  );
}

export function PhoneIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="7" y="3" width="10" height="18" rx="2.5" />
      <path d="M11 17.8h2" />
    </Base>
  );
}

export function TargetIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </Base>
  );
}

export function ClipboardIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="5" y="4.5" width="14" height="16" rx="2.5" />
      <path d="M9 4.5V3h6v1.5M9 10h6M9 14h4" />
    </Base>
  );
}

export function TrophyIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M8 4h8v5a4 4 0 0 1-8 0z" />
      <path d="M8 5H4.5v1.5A3.5 3.5 0 0 0 8 10M16 5h3.5v1.5A3.5 3.5 0 0 1 16 10" />
      <path d="M12 13v3M8.5 20h7M10 16.5h4L14.5 20h-5z" />
    </Base>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.2 12a7.2 7.2 0 0 0-.1-1.1l2-1.5-2-3.4-2.3 1a7.3 7.3 0 0 0-1.9-1.1L14.5 3h-5l-.4 2.9a7.3 7.3 0 0 0-1.9 1.1l-2.3-1-2 3.4 2 1.5a7.2 7.2 0 0 0 0 2.2l-2 1.5 2 3.4 2.3-1a7.3 7.3 0 0 0 1.9 1.1l.4 2.9h5l.4-2.9a7.3 7.3 0 0 0 1.9-1.1l2.3 1 2-3.4-2-1.5c.07-.36.1-.73.1-1.1Z" />
    </Base>
  );
}

export function FolderIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M3.5 6.5v11a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-8l-2-2.5h-3a2 2 0 0 0-2 2z" />
    </Base>
  );
}

export function PinIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 21s-6.5-5.5-6.5-11a6.5 6.5 0 0 1 13 0c0 5.5-6.5 11-6.5 11Z" />
      <circle cx="12" cy="10" r="2.4" />
    </Base>
  );
}

export function SparkleIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6z" />
      <path d="M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />
    </Base>
  );
}

/* ============================ Account & chart helpers ============================ */

/** One SVG per fixed account type. Categories keep user-supplied emoji. */
export const ACCOUNT_TYPE_ICON: Record<string, (props: IconProps) => React.ReactElement> = {
  cash: CashIcon,
  uzcard: CardIcon,
  humo: CardIcon,
  bank: BankIcon,
  ewallet: PhoneIcon,
  other: SparkleIcon,
};

export function AccountTypeIcon({ type, ...props }: IconProps & { type: string }) {
  const Icon = ACCOUNT_TYPE_ICON[type] ?? SparkleIcon;
  return <Icon {...props} />;
}
