import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { apiGet, queryString } from "../api/client";
import { queryKeys } from "../api/queryKeys";
import type { CurrentUser } from "../api/types";
import useOperationalDate from "../hooks/useOperationalDate.js";
import { Icon } from "./ui";

interface NotificationSummary {
  overdue_payments?: number;
  pending_verifications?: number;
  assigned_sessions_today?: number;
  total: number;
}

interface NavItem {
  page: string;
  active?: string;
  label: string;
  icon: string;
}

const adminNavItems: NavItem[] = [
  { page: "dashboard", label: "Dashboard", icon: "dashboard" },
  { page: "course", label: "Course", icon: "school" },
  {
    page: "database/students",
    active: "database",
    label: "Database",
    icon: "database",
  },
  { page: "finance", label: "Finance", icon: "payments" },
];

const teacherNavItems: NavItem[] = [
  { page: "dashboard", label: "Dashboard", icon: "dashboard" },
  { page: "course", label: "Course", icon: "school" },
  { page: "payments", label: "Pembayaran", icon: "add_card" },
];

const dateFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export default function ShellApi({
  user,
  activePage,
  onNavigate,
  onLogout,
  children,
}: {
  user: CurrentUser;
  activePage: string;
  onNavigate: (page: string) => void;
  onLogout: () => void;
  children: ReactNode;
}) {
  const { date, isOverridden, resetDate } = useOperationalDate();
  const [search, setSearch] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<
    "search" | "notifications" | "account" | null
  >(null);
  const items = user.role === "ADMIN" ? adminNavItems : teacherNavItems;
  const notifications = useQuery({
    queryKey: queryKeys.notifications(date),
    queryFn: ({ signal }) =>
      apiGet<NotificationSummary>(
        `/api/v1/notifications/${queryString({ date })}`,
        signal,
      ),
  });
  const matches = search.trim()
    ? items.filter((item) =>
        item.label.toLowerCase().includes(search.trim().toLowerCase()),
      )
    : [];
  const initials = user.full_name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  const simulationLabel = dateFormatter.format(new Date(`${date}T12:00:00`));

  const go = (page: string) => {
    onNavigate(page);
    setNotificationsOpen(false);
    setMobilePanel(null);
  };

  return (
    <div
      className={`flex h-[100dvh] overflow-hidden text-on-background ${activePage === "dashboard" ? "bg-[#edf7f1]" : "bg-background"}`}
    >
      <aside
        className="fixed left-0 top-0 z-40 hidden h-full w-[288px] flex-col border-r border-emerald-100/80 bg-white px-4 py-6 shadow-sm md:flex"
        style={{
          backgroundImage: "url('/assets/generated/sidebar-mint-canvas.png')",
          backgroundPosition: "center",
          backgroundSize: "cover",
        }}
      >
        <div className="mb-8 flex items-center gap-3 px-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-[8px] bg-primary text-white">
            <Icon name="school" />
          </div>
          <div>
            <h1 className="text-[21px] font-bold leading-tight text-primary">
              Awan Topan
            </h1>
            <p className="text-xs font-medium text-on-surface-variant">
              Academic MS
            </p>
          </div>
        </div>
        <nav className="flex-1">
          <ul className="flex flex-col gap-1">
            {items.map((item) => (
              <li key={item.page}>
                <button
                  className={`mx-1 flex w-[calc(100%-0.5rem)] items-center gap-3 rounded-full px-5 py-3.5 text-left text-sm font-semibold transition ${activePage === (item.active || item.page) ? "bg-primary-container text-white" : "text-on-surface-variant hover:bg-emerald-50 hover:text-primary"}`}
                  onClick={() => go(item.page)}
                >
                  <Icon name={item.icon} />
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div className="border-t border-outline-variant/40 px-1 pt-5">
          {isOverridden && (
            <div className="mb-3 rounded-[8px] border border-amber-300 bg-amber-50 p-3 text-amber-900">
              <div className="flex items-start gap-2">
                <Icon name="schedule" className="mt-0.5 text-base" />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold uppercase">
                    Mode Simulasi
                  </p>
                  <p className="mt-1 text-xs font-bold">{simulationLabel}</p>
                </div>
                {user.role === "ADMIN" && (
                  <button
                    className="icon-button h-7 w-7 rounded-[6px]"
                    onClick={resetDate}
                    title="Kembali ke hari ini"
                  >
                    <Icon name="restart_alt" className="text-base" />
                  </button>
                )}
              </div>
            </div>
          )}
          <div className="relative">
            {matches.length > 0 && (
              <div className="absolute bottom-[calc(100%+8px)] left-0 right-0 rounded-[8px] border bg-white p-1 shadow-lift">
                {matches.map((item) => (
                  <button
                    key={item.page}
                    className="flex w-full items-center gap-3 rounded-[6px] px-3 py-2.5 text-left text-sm font-semibold hover:bg-emerald-50"
                    onClick={() => {
                      go(item.page);
                      setSearch("");
                    }}
                  >
                    <Icon name={item.icon} />
                    {item.label}
                  </button>
                ))}
              </div>
            )}
            <div className="flex h-11 items-center gap-2 rounded-[8px] border border-outline-variant/50 bg-white px-3">
              <Icon name="search" />
              <input
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cari halaman..."
              />
            </div>
          </div>
          <div className="relative mt-3 flex items-center gap-3 rounded-[8px] border border-outline-variant/40 bg-white p-3">
            {notificationsOpen && (
              <div className="absolute bottom-[calc(100%+8px)] left-0 right-0 rounded-[8px] border bg-white p-3 shadow-lift">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold">Notifikasi</p>
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                    {notifications.data?.total || 0}
                  </span>
                </div>
                <div className="mt-3 space-y-3 text-xs leading-5 text-on-surface-variant">
                  {user.role === "ADMIN" ? (
                    <>
                      <button
                        className="block w-full text-left"
                        onClick={() => go("finance?view=list&status=OVERDUE")}
                      >
                        <strong className="text-red-700">
                          {notifications.data?.overdue_payments || 0} tagihan
                        </strong>{" "}
                        melewati jatuh tempo.
                      </button>
                      <button
                        className="block w-full text-left"
                        onClick={() =>
                          go(
                            "finance?view=list&tab=transactions&status=PENDING",
                          )
                        }
                      >
                        <strong className="text-amber-700">
                          {notifications.data?.pending_verifications || 0}{" "}
                          transaksi
                        </strong>{" "}
                        menunggu verifikasi.
                      </button>
                    </>
                  ) : (
                    <button
                      className="block w-full text-left"
                      onClick={() => go("course")}
                    >
                      <strong>
                        {notifications.data?.assigned_sessions_today || 0} sesi
                      </strong>{" "}
                      ditugaskan hari ini.
                    </button>
                  )}
                </div>
              </div>
            )}
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary-container text-sm font-bold text-primary">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">{user.full_name}</p>
              <p className="truncate text-[11px] text-on-surface-variant">
                {user.role === "ADMIN"
                  ? "Super Administrator"
                  : "Guru / Pengajar"}
              </p>
            </div>
            <button
              className="icon-button relative"
              onClick={() => setNotificationsOpen((value) => !value)}
              aria-label="Notifikasi"
            >
              <Icon name="notifications" />
              {(notifications.data?.total || 0) > 0 && (
                <span className="absolute right-2 top-2 h-2 w-2 rounded-full border border-white bg-red-500" />
              )}
            </button>
          </div>
          <button
            className="mt-2 flex w-full items-center gap-3 rounded-[8px] px-4 py-3 text-sm font-semibold text-on-surface-variant hover:bg-emerald-50 hover:text-primary"
            onClick={onLogout}
          >
            <Icon name="logout" />
            Keluar
          </button>
        </div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col md:ml-[288px]">
        <header className="relative z-50 flex min-h-16 items-center gap-2 border-b border-emerald-100 bg-white/95 px-3 shadow-sm backdrop-blur-xl md:hidden">
          <button
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
            onClick={() => go("dashboard")}
            aria-label="Buka Dashboard"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-primary text-white">
              <Icon name="school" className="text-base" />
            </span>
            <span className="min-w-0">
              <strong className="block truncate text-sm text-primary">
                Awan Topan
              </strong>
              <span className="block truncate text-[9px] text-on-surface-variant">
                Academic MS
              </span>
            </span>
          </button>
          <button
            className={`icon-button border border-emerald-100 ${mobilePanel === "search" ? "bg-emerald-50 text-primary" : ""}`}
            onClick={() =>
              setMobilePanel((value) => (value === "search" ? null : "search"))
            }
            aria-label="Cari halaman"
          >
            <Icon name="search" />
          </button>
          <button
            className={`icon-button relative border border-emerald-100 ${mobilePanel === "notifications" ? "bg-emerald-50 text-primary" : ""}`}
            onClick={() =>
              setMobilePanel((value) =>
                value === "notifications" ? null : "notifications",
              )
            }
            aria-label="Notifikasi"
          >
            <Icon name="notifications" />
            {(notifications.data?.total || 0) > 0 && (
              <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[8px] font-bold text-white">
                {Math.min(notifications.data?.total || 0, 99)}
              </span>
            )}
          </button>
          <button
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary-container text-xs font-bold text-primary"
            onClick={() =>
              setMobilePanel((value) =>
                value === "account" ? null : "account",
              )
            }
            aria-label="Menu akun"
          >
            {initials}
          </button>

          {mobilePanel && (
            <>
              <button
                className="fixed inset-0 top-16 z-[-1] bg-black/10"
                onClick={() => setMobilePanel(null)}
                aria-label="Tutup panel"
              />
              <section className="absolute left-3 right-3 top-[calc(100%+8px)] max-h-[calc(100dvh-10rem)] overflow-y-auto rounded-[8px] border border-emerald-100 bg-white p-4 shadow-lift">
                {mobilePanel === "search" && (
                  <>
                    <label className="flex h-11 items-center gap-2 rounded-[8px] border border-outline-variant/50 px-3">
                      <Icon name="search" />
                      <input
                        className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Cari halaman..."
                        autoFocus
                      />
                    </label>
                    <div className="mt-2 space-y-1">
                      {(matches.length ? matches : items).map((item) => (
                        <button
                          key={item.page}
                          className="flex min-h-11 w-full items-center gap-3 rounded-[7px] px-3 text-left text-sm font-semibold hover:bg-emerald-50"
                          onClick={() => {
                            go(item.page);
                            setSearch("");
                          }}
                        >
                          <Icon name={item.icon} />
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {mobilePanel === "notifications" && (
                  <>
                    <div className="flex items-center justify-between">
                      <h2 className="text-sm font-bold">Notifikasi</h2>
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                        {notifications.data?.total || 0}
                      </span>
                    </div>
                    <div className="mt-3 space-y-2 text-xs leading-5">
                      {user.role === "ADMIN" ? (
                        <>
                          <button
                            className="block min-h-11 w-full rounded-[7px] bg-red-50 px-3 py-2 text-left"
                            onClick={() =>
                              go("finance?view=list&status=OVERDUE")
                            }
                          >
                            <strong className="text-red-700">
                              {notifications.data?.overdue_payments || 0}{" "}
                              tagihan
                            </strong>{" "}
                            melewati jatuh tempo.
                          </button>
                          <button
                            className="block min-h-11 w-full rounded-[7px] bg-amber-50 px-3 py-2 text-left"
                            onClick={() =>
                              go(
                                "finance?view=list&tab=transactions&status=PENDING",
                              )
                            }
                          >
                            <strong className="text-amber-700">
                              {notifications.data?.pending_verifications || 0}{" "}
                              transaksi
                            </strong>{" "}
                            menunggu verifikasi.
                          </button>
                        </>
                      ) : (
                        <button
                          className="block min-h-11 w-full rounded-[7px] bg-emerald-50 px-3 py-2 text-left"
                          onClick={() => go("course")}
                        >
                          <strong>
                            {notifications.data?.assigned_sessions_today || 0}{" "}
                            sesi
                          </strong>{" "}
                          ditugaskan hari ini.
                        </button>
                      )}
                    </div>
                  </>
                )}
                {mobilePanel === "account" && (
                  <>
                    <div className="flex items-center gap-3 border-b border-emerald-100 pb-4">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-secondary-container text-sm font-bold text-primary">
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold">
                          {user.full_name}
                        </p>
                        <p className="truncate text-[10px] text-on-surface-variant">
                          {user.role === "ADMIN"
                            ? "Super Administrator"
                            : "Guru / Pengajar"}
                        </p>
                      </div>
                    </div>
                    {isOverridden && (
                      <div className="mt-3 rounded-[8px] border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                        <p className="font-bold">Mode Simulasi</p>
                        <p className="mt-1">{simulationLabel}</p>
                      </div>
                    )}
                    <button
                      className="mt-3 flex min-h-11 w-full items-center gap-3 rounded-[7px] px-3 text-sm font-semibold text-red-700 hover:bg-red-50"
                      onClick={onLogout}
                    >
                      <Icon name="logout" />
                      Keluar
                    </button>
                  </>
                )}
              </section>
            </>
          )}
        </header>
        {isOverridden && (
          <div className="flex min-h-10 items-center justify-between border-b border-amber-200 bg-amber-50 px-4 py-2 text-[11px] font-bold text-amber-900 md:hidden">
            <span>Mode Simulasi · {simulationLabel}</span>
            {user.role === "ADMIN" && (
              <button onClick={resetDate}>Reset</button>
            )}
          </div>
        )}
        <div
          id="app-scroll-container"
          className={`flex-1 overflow-y-auto px-3 py-4 pb-24 sm:p-margin-page md:pb-margin-page ${activePage === "dashboard" ? "bg-[#f3faf6] bg-cover bg-center bg-no-repeat" : ""}`}
          style={
            activePage === "dashboard"
              ? {
                  backgroundImage:
                    "url('/assets/generated/dashboard-mint-canvas.png')",
                }
              : undefined
          }
        >
          <div
            className={
              ["course", "database", "finance", "payments"].includes(activePage)
                ? "w-full"
                : "mx-auto w-full max-w-[1500px]"
            }
          >
            {children}
          </div>
        </div>
      </main>
      <nav
        className="fixed bottom-0 left-0 z-40 grid min-h-16 w-full border-t border-outline-variant/30 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
        style={{
          gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`,
        }}
      >
        {items.map((item) => (
          <button
            key={item.page}
            className={`flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 px-1 text-[10px] font-semibold ${activePage === (item.active || item.page) ? "text-primary" : "text-on-surface-variant"}`}
            onClick={() => go(item.page)}
          >
            <Icon name={item.icon} />
            {item.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
