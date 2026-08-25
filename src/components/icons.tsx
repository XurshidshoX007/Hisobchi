import type { ReactNode } from "react";

export type IconProps = { active?: boolean; className?: string };

function iconClassName(className = "", fallback = "h-5 w-5"): string {
  return className ? `${fallback} ${className}` : fallback;
}

function strokeIcon(children: ReactNode, className?: string, strokeWidth = 1.8) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={iconClassName(className)}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function Logomark({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={iconClassName(className)} aria-hidden="true">
      <path
        d="M6 19V5M18 19V5M6 12h12M10 19v-4c0-1.7 1.3-3 3-3h5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function HomeIcon({ className }: IconProps) {
  return strokeIcon(<path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4v-5H9v5H5a1 1 0 0 1-1-1z" />, className);
}

export function ListIcon({ className }: IconProps) {
  return strokeIcon(
    <>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h10" />
    </>,
    className,
  );
}

export function CalendarIcon({ className }: IconProps) {
  return strokeIcon(
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="3" />
      <path d="M8 3.5v3" />
      <path d="M16 3.5v3" />
      <path d="M3.5 10h17" />
    </>,
    className,
  );
}

export function ChartIcon({ className }: IconProps) {
  return strokeIcon(
    <>
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <path d="M8 16v-4" />
      <path d="M12.5 16V8" />
      <path d="M17 16v-6" />
    </>,
    className,
  );
}

export function GridIcon({ className }: IconProps) {
  return strokeIcon(
    <>
      <rect x="4" y="4" width="6.5" height="6.5" rx="2" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="2" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="2" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="2" />
    </>,
    className,
  );
}

export function WalletIcon({ className }: IconProps) {
  return strokeIcon(
    <>
      <path d="M4.5 7.5V6.2A2.2 2.2 0 0 1 6.7 4h10.8a2 2 0 0 1 2 2v1.5" />
      <path d="M4.5 7.5h14.2a1.8 1.8 0 0 1 1.8 1.8v8.2a2.5 2.5 0 0 1-2.5 2.5H6.5A2.5 2.5 0 0 1 4 17.5V9.1a1.6 1.6 0 0 1 1.6-1.6" />
      <path d="M16.4 11.2h4.1v4.6h-4.1a2.3 2.3 0 1 1 0-4.6Z" />
      <path d="M16.5 13.5h.01" />
    </>,
    className,
    2.1,
  );
}

export function TrendUpIcon({ className }: IconProps) {
  return strokeIcon(<path d="M12 20V6m0 0L7 11m5-5 5 5" />, className);
}

export function TrendDownIcon({ className }: IconProps) {
  return strokeIcon(<path d="M12 4v14m0 0 5-5m-5 5-5-5" />, className);
}

export function BellIcon({ className }: IconProps) {
  return strokeIcon(
    <>
      <path d="M6 9a6 6 0 1 1 12 0c0 3.2 1 5 1.6 5.8H4.4C5 14 6 12.2 6 9Z" />
      <path d="M10 18.5a2 2 0 0 0 4 0" />
    </>,
    className,
  );
}

export function ThemeSunIcon({ className }: IconProps) {
  return strokeIcon(
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2.2" />
      <path d="M12 19.3v2.2" />
      <path d="m4.9 4.9 1.6 1.6" />
      <path d="m17.5 17.5 1.6 1.6" />
      <path d="M2.5 12h2.2" />
      <path d="M19.3 12h2.2" />
      <path d="m4.9 19.1 1.6-1.6" />
      <path d="m17.5 6.5 1.6-1.6" />
    </>,
    className,
  );
}

export function ThemeMoonIcon({ className }: IconProps) {
  return strokeIcon(<path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.7 7.7 0 1 0 9.5 9.5Z" />, className);
}

export function ThemeSystemIcon({ className }: IconProps) {
  return strokeIcon(
    <>
      <rect x="4" y="5" width="16" height="11" rx="2.5" />
      <path d="M9 19h6" />
      <path d="M12 16v3" />
    </>,
    className,
  );
}

export function AlertInfoIcon({ className }: IconProps) {
  return strokeIcon(
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 10.5v5" />
      <path d="M12 7.5h.01" />
    </>,
    className,
  );
}

export function AlertWarningIcon({ className }: IconProps) {
  return strokeIcon(
    <>
      <path d="M12 4 3.8 18.5h16.4L12 4Z" />
      <path d="M12 9.3v4.6" />
      <path d="M12 17h.01" />
    </>,
    className,
  );
}

export function AlertCriticalIcon({ className }: IconProps) {
  return strokeIcon(
    <>
      <path d="M9 3.8h6l4.2 4.2v6L15 20.2H9L4.8 16V8L9 3.8Z" />
      <path d="M12 8.5v5.2" />
      <path d="M12 16.7h.01" />
    </>,
    className,
  );
}

export function CloseIcon({ className }: IconProps) {
  return strokeIcon(<path d="M6 6l12 12M18 6 6 18" />, className, 2);
}

export function CheckIcon({ className }: IconProps) {
  return strokeIcon(<path d="m5 13 4.5 4.5L19 7" />, className, 2.1);
}

export function SearchIcon({ className }: IconProps) {
  return strokeIcon(
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m16.5 16.5 4 4" />
    </>,
    className,
    2,
  );
}

export function EditIcon({ className }: IconProps) {
  return strokeIcon(<path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />, className, 2);
}

export function BotIcon({ className }: IconProps) {
  return strokeIcon(
    <>
      <rect x="6" y="8" width="12" height="9" rx="3" />
      <path d="M12 4v4" />
      <path d="M8 20h8" />
      <path d="M8.5 12h.01" />
      <path d="M15.5 12h.01" />
      <path d="M9.5 15c.9.7 1.7 1 2.5 1s1.6-.3 2.5-1" />
    </>,
    className,
  );
}

export function SettingsGearIcon({ className }: IconProps) {
  return strokeIcon(
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.8v2.1" />
      <path d="M12 19.1v2.1" />
      <path d="m5.5 5.5 1.5 1.5" />
      <path d="m17 17 1.5 1.5" />
      <path d="M2.8 12h2.1" />
      <path d="M19.1 12h2.1" />
      <path d="m5.5 18.5 1.5-1.5" />
      <path d="m17 7 1.5-1.5" />
    </>,
    className,
  );
}

export function AccountCashIcon({ className }: IconProps) {
  return strokeIcon(
    <>
      <rect x="4" y="7" width="16" height="10" rx="2.5" />
      <circle cx="12" cy="12" r="2.4" />
      <path d="M7.2 10.2h.01" />
      <path d="M16.8 13.8h.01" />
    </>,
    className,
  );
}

export function AccountCardIcon({ className }: IconProps) {
  return strokeIcon(
    <>
      <rect x="3.5" y="6" width="17" height="12" rx="3" />
      <path d="M3.5 10h17" />
      <path d="M7 14h3.5" />
      <path d="M13 14h4" />
    </>,
    className,
  );
}

export function AccountBankIcon({ className }: IconProps) {
  return strokeIcon(
    <>
      <path d="M4 9 12 4l8 5" />
      <path d="M6.5 9v8" />
      <path d="M12 9v8" />
      <path d="M17.5 9v8" />
      <path d="M4 20h16" />
    </>,
    className,
  );
}

export function AccountWalletIcon({ className }: IconProps) {
  return strokeIcon(
    <>
      <path d="M5 8V6.5A2.5 2.5 0 0 1 7.5 4h9.7A1.8 1.8 0 0 1 19 5.8V8" />
      <rect x="4" y="8" width="16" height="11" rx="3" />
      <path d="M15.5 12h4.5v3.5h-4.5a1.8 1.8 0 0 1 0-3.5Z" />
      <path d="M15.8 13.7h.01" />
    </>,
    className,
  );
}

export function AccountOtherIcon({ className }: IconProps) {
  return strokeIcon(
    <>
      <circle cx="7" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="17" cy="12" r="1" fill="currentColor" stroke="none" />
      <rect x="4" y="7" width="16" height="10" rx="3" />
    </>,
    className,
  );
}

export function TransferIcon({ className }: IconProps) {
  return strokeIcon(
    <>
      <path d="M7 8h11" />
      <path d="m14.5 5.5 3.5 2.5-3.5 2.5" />
      <path d="M17 16H6" />
      <path d="m9.5 13.5-3.5 2.5 3.5 2.5" />
    </>,
    className,
  );
}

export function PlusIcon({ className }: IconProps) {
  return strokeIcon(<path d="M12 5v14M5 12h14" />, className, 2.2);
}

export function MinusIcon({ className }: IconProps) {
  return strokeIcon(<path d="M5 12h14" />, className, 2.2);
}

export function GoalIcon({ className }: IconProps) {
  return strokeIcon(
    <>
      <circle cx="12" cy="12" r="7.5" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="M20 4 15.5 8.5" />
      <path d="M16 4h4v4" />
    </>,
    className,
  );
}

export function BudgetIcon({ className }: IconProps) {
  return strokeIcon(
    <>
      <path d="M5 19V9" />
      <path d="M10 19V5" />
      <path d="M15 19v-7" />
      <path d="M20 19v-4" />
      <path d="M4 19h17" />
    </>,
    className,
  );
}

export function DebtIcon({ className }: IconProps) {
  return strokeIcon(
    <>
      <rect x="5" y="4" width="14" height="16" rx="2.5" />
      <path d="M8.5 9h7" />
      <path d="M8.5 13h7" />
      <path d="M8.5 17h4.5" />
    </>,
    className,
  );
}

export function CategoryIcon({ className }: IconProps) {
  return strokeIcon(
    <>
      <path d="M4 11V6.8A1.8 1.8 0 0 1 5.8 5h4.3l8.9 8.9a2.2 2.2 0 0 1 0 3.1l-2 2a2.2 2.2 0 0 1-3.1 0L5 10.1V11" />
      <circle cx="8.3" cy="8.3" r="1.2" />
    </>,
    className,
  );
}

export function ReceiptIcon({ className }: IconProps) {
  return strokeIcon(
    <>
      <path d="M7 4h10v16l-2-1.2L13 20l-2-1.2L9 20l-2-1.2L5 20V6a2 2 0 0 1 2-2Z" />
      <path d="M9 9h6" />
      <path d="M9 13h6" />
    </>,
    className,
  );
}

export function PauseIcon({ className }: IconProps) {
  return strokeIcon(
    <>
      <rect x="7" y="5" width="3.5" height="14" rx="1" />
      <rect x="13.5" y="5" width="3.5" height="14" rx="1" />
    </>,
    className,
  );
}

export function PlayIcon({ className }: IconProps) {
  return strokeIcon(<path d="M8 6.5 18 12 8 17.5V6.5Z" />, className);
}

export function BanIcon({ className }: IconProps) {
  return strokeIcon(
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.5 8.5 7 7" />
    </>,
    className,
  );
}

export function FlagIcon({ className }: IconProps) {
  return strokeIcon(
    <>
      <path d="M6 20V4" />
      <path d="M6 5h9l-1.5 3L15 11H6" />
    </>,
    className,
  );
}

export function RiskIcon({ className }: IconProps) {
  return <AlertWarningIcon className={className} />;
}

export function AnalyticsIcon({ className }: IconProps) {
  return <ChartIcon className={className} />;
}

export function MoreHorizontalIcon({ className }: IconProps) {
  return strokeIcon(
    <>
      <circle cx="7" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="17" cy="12" r="1" fill="currentColor" stroke="none" />
    </>,
    className,
    0,
  );
}

export function ChevronDownIcon({ className }: IconProps) {
  return strokeIcon(<path d="M6 9.5 12 15l6-5.5" />, className, 2);
}

export function accountTypeIconName(type: string): "cash" | "card" | "bank" | "wallet" | "other" {
  switch (type) {
    case "cash":
      return "cash";
    case "uzcard":
    case "humo":
      return "card";
    case "bank":
      return "bank";
    case "ewallet":
      return "wallet";
    default:
      return "other";
  }
}

export function AccountTypeIcon({ type, className }: { type: string; className?: string }) {
  switch (accountTypeIconName(type)) {
    case "cash":
      return <AccountCashIcon className={className} />;
    case "card":
      return <AccountCardIcon className={className} />;
    case "bank":
      return <AccountBankIcon className={className} />;
    case "wallet":
      return <AccountWalletIcon className={className} />;
    default:
      return <AccountOtherIcon className={className} />;
  }
}
