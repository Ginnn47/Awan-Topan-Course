import React from "react";
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
} from "lucide-react";

const iconMap = {
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

export function Icon({ name, className = "" }) {
  const Component = iconMap[name] || Info;
  const size = className.includes("text-4xl") ? 36 : className.includes("text-2xl") ? 24 : className.includes("text-base") ? 16 : 20;

  return <Component aria-hidden="true" className={`shrink-0 ${className}`} size={size} strokeWidth={2} />;
}

export function statusTone(status) {
  if (["Lunas", "Ongoing", "Aktif", "Berjalan", "Hadir"].includes(status)) return "success";
  if (["Sebagian", "Sakit"].includes(status)) return "warning";
  if (["Jatuh Tempo", "Belum Bayar", "Alfa", "Cancelled"].includes(status)) return "danger";
  if (["Izin"].includes(status)) return "info";
  return "neutral";
}

export function Badge({ children, tone = "neutral" }) {
  const tones = {
    success: "bg-primary-container text-on-primary-container",
    warning: "bg-accent-sand/75 text-on-background",
    danger: "bg-error-container text-on-error-container",
    info: "bg-secondary-container text-on-secondary-container",
    neutral: "bg-surface-variant text-on-surface-variant",
  };

  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function PageHeader({ title, description, action }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="mb-2 text-xs font-semibold text-on-surface-variant">Awan Topan Course</p>
        <h2 className="text-[28px] font-bold leading-9 text-primary sm:text-[32px]">{title}</h2>
        <p className="mt-2 text-sm text-on-surface-variant">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function StatCard({ icon, label, value, note, highlight = false }) {
  return (
    <div
      className={`relative overflow-hidden rounded-[2rem] border p-5 shadow-soft transition hover:scale-[1.02] ${
        highlight
          ? "border-primary/20 bg-surface-tint text-on-primary"
          : "border-outline-variant/30 bg-surface-container-lowest text-on-surface"
      }`}
    >
      {highlight && <div className="pointer-events-none absolute -right-4 -top-4 h-24 w-24 rounded-full bg-primary/20 blur-xl" />}
      <div className="mb-4 flex items-center gap-3">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-xl ${
            highlight ? "bg-primary-container text-on-primary-container" : "bg-secondary-container text-on-secondary-container"
          }`}
        >
          <Icon name={icon} />
        </div>
        <span className={`text-sm font-medium ${highlight ? "text-on-primary/90" : "text-on-surface-variant"}`}>{label}</span>
      </div>
      <div className="text-[32px] font-bold leading-10">{value}</div>
      <div className={`mt-2 flex items-center gap-1 text-xs font-medium ${highlight ? "text-primary-fixed" : "text-secondary"}`}>{note}</div>
    </div>
  );
}
