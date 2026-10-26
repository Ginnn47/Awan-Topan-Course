import type { CSSProperties, ReactNode } from "react";
import {
  ArrowRight,
  Banknote,
  Bell,
  BookOpen,
  CalendarDays,
  CalendarX2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleCheckBig,
  ClipboardList,
  ClipboardClock,
  Clock3,
  Cloud,
  CreditCard,
  Database,
  DoorOpen,
  ExternalLink,
  Eye,
  EyeOff,
  GraduationCap,
  GripVertical,
  Info,
  LayoutDashboard,
  List,
  LogOut,
  Mail,
  MoreVertical,
  Pencil,
  Play,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Search,
  Speech,
  Trash2,
  TriangleAlert,
  UserRound,
  UsersRound,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";

const iconMap: Record<string, LucideIcon> = {
  account_balance_wallet: Wallet,
  add: Plus,
  add_card: CreditCard,
  arrow_forward: ArrowRight,
  calendar_month: CalendarDays,
  calendar_today: CalendarDays,
  check_circle: CircleCheckBig,
  chevron_left: ChevronLeft,
  chevron_right: ChevronRight,
  close: X,
  cloud: Cloud,
  dashboard: LayoutDashboard,
  database: Database,
  delete: Trash2,
  drag_indicator: GripVertical,
  edit: Pencil,
  event: CalendarDays,
  event_busy: CalendarX2,
  expand_more: ChevronDown,
  format_list_bulleted: List,
  group: UsersRound,
  groups: UsersRound,
  info: Info,
  logout: LogOut,
  mail: Mail,
  meeting_room: DoorOpen,
  menu_book: BookOpen,
  more_vert: MoreVertical,
  notifications: Bell,
  open_in_new: ExternalLink,
  payments: Banknote,
  pending_actions: ClipboardClock,
  receipt_long: ClipboardList,
  person: UserRound,
  play_arrow: Play,
  print: Printer,
  record_voice_over: Speech,
  restart_alt: RefreshCw,
  save: Save,
  schedule: Clock3,
  search: Search,
  school: GraduationCap,
  sync: RefreshCw,
  task_alt: CircleCheckBig,
  visibility: Eye,
  visibility_off: EyeOff,
  warning: TriangleAlert,
};

export function Icon({
  name,
  className = "",
  style,
}: {
  name: string;
  className?: string;
  style?: CSSProperties;
}) {
  const Component = iconMap[name] || Info;
  const size = className.includes("text-4xl")
    ? 36
    : className.includes("text-2xl")
      ? 24
      : className.includes("text-base")
        ? 16
        : 20;

  return (
    <Component
      aria-hidden="true"
      className={`shrink-0 ${className}`}
      size={size}
      strokeWidth={2}
      style={style}
    />
  );
}

type BadgeTone = "success" | "warning" | "danger" | "info" | "neutral";

export function statusTone(status: string): BadgeTone {
  if (["Lunas", "Ongoing", "Aktif", "Berjalan", "Hadir"].includes(status))
    return "success";
  if (["Sebagian", "Sakit"].includes(status)) return "warning";
  if (["Jatuh Tempo", "Belum Bayar", "Alfa", "Cancelled"].includes(status))
    return "danger";
  if (["Izin"].includes(status)) return "info";
  return "neutral";
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: BadgeTone;
}) {
  const tones: Record<BadgeTone, string> = {
    success: "bg-amber-100 text-amber-950 border border-amber-300 font-bold",
    warning: "bg-amber-50 text-amber-900 border border-amber-200",
    danger: "bg-red-50 text-red-800 border border-red-200",
    info: "bg-blue-50 text-blue-800 border border-blue-200",
    neutral: "bg-gray-100 text-gray-800 border border-gray-200",
  };

  return (
    <span
      className={`inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <p className="mb-1 text-xs font-bold uppercase tracking-wider text-amber-500">
          Awan Topan Course
        </p>
        <h2 className="break-words text-[25px] font-bold leading-8 text-on-surface sm:text-[32px] sm:leading-9">
          {title}
        </h2>
        <p className="mt-1.5 max-w-3xl text-sm leading-6 text-on-surface-variant">
          {description}
        </p>
      </div>
      {action && <div className="min-w-0 lg:shrink-0">{action}</div>}
    </div>
  );
}

export function StatCard({
  icon,
  label,
  value,
  note,
  highlight = false,
}: {
  icon: string;
  label: ReactNode;
  value: ReactNode;
  note: ReactNode;
  highlight?: boolean;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-xl border p-5 shadow-soft transition hover:shadow-lift ${
        highlight
          ? "border-primary/40 bg-brand-dark text-white"
          : "border-outline-variant bg-surface text-on-surface"
      }`}
    >
      {highlight && (
        <div className="pointer-events-none absolute -right-4 -top-4 h-24 w-24 rounded-full bg-primary/20 blur-xl" />
      )}
      <div className="mb-4 flex items-center gap-3">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-lg ${
            highlight
              ? "bg-amber-400 text-neutral-950 font-bold"
              : "bg-amber-100 text-amber-900"
          }`}
          style={highlight ? { backgroundColor: "#F59E0B", color: "#18191B" } : undefined}
        >
          <Icon name={icon} />
        </div>
        <span
          className={`text-sm font-semibold ${highlight ? "text-gray-200" : "text-on-surface-variant"}`}
        >
          {label}
        </span>
      </div>
      <div className="text-[32px] font-bold leading-10">{value}</div>
      <div
        className={`mt-2 flex items-center gap-1 text-xs font-medium ${highlight ? "text-amber-400 font-bold" : "text-on-surface-variant"}`}
      >
        {note}
      </div>
    </div>
  );
}
