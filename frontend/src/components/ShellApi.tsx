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
  const [logoLoaded, setLogoLoaded] = useState(true);
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
    <div className="flex h-[100dvh] overflow-hidden bg-background text-on-background">
      <aside className="fixed left-0 top-0 z-40 hidden h-full w-[288px] flex-col border-r border-outline-variant bg-white px-4 py-6 shadow-sm md:flex">
        <div className="mb-8 flex items-center gap-3 px-3">
          {logoLoaded ? (
            <img
              src="/logo.png"
              alt="Awan Topan Logo"
              className="h-10 w-10 object-contain rounded-lg"
              onError={() => setLogoLoaded(false)}
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-dark text-primary font-bold shadow-sm">
              <Icon name="school" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold leading-tight text-on-surface">
              Awan Topan
            </h1>
            <p className="text-xs font-semibold tracking-wide text-primary">
              Course Academic MS
            </p>
          </div>
        </div>
        <nav className="flex-1">
          <ul className="flex flex-col gap-1.5">
            {items.map((item) => {
              const isActive = activePage === (item.active || item.page);
              return (
                <li key={item.page}>
                  <button
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition ${
                      isActive
                        ? "rounded-r-xl border-l-4 border-amber-400 bg-[#18191B] text-white font-bold shadow-sm"
                        : "rounded-lg text-stone-600 hover:bg-stone-100 hover:text-neutral-900 font-medium"
                    }`}
                    style={
                      isActive
                        ? {
                            backgroundColor: "#18191B",
                            color: "#FFFFFF",
                            borderLeft: "4px solid #F59E0B",
                          }
                        : undefined
                    }
                    onClick={() => go(item.page)}
                  >
                    <Icon
                      name={item.icon}
                      className={isActive ? "text-amber-400 text-lg" : "text-stone-400"}
                      style={isActive ? { color: "#F59E0B" } : undefined}
                    />
                    <span
                      className={isActive ? "text-white font-bold tracking-wide" : "text-stone-700 font-medium"}
                      style={isActive ? { color: "#FFFFFF" } : undefined}
                    >
                      {item.label}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="border-t border-outline-variant px-1 pt-5">
          {isOverridden && (
            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
              <div className="flex items-start gap-2">
                <Icon name="schedule" className="mt-0.5 text-base text-amber-700" />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800">
                    Mode Simulasi
                  </p>
                  <p className="mt-0.5 text-xs font-bold">{simulationLabel}</p>
                </div>
                {user.role === "ADMIN" && (
                  <button
                    className="icon-button h-6 w-6 rounded text-amber-800 hover:bg-amber-100"
                    onClick={resetDate}
                    title="Kembali ke hari ini"
                  >
                    <Icon name="restart_alt" className="text-sm" />
                  </button>
                )}
              </div>
            </div>
          )}
          <div className="relative">
            {matches.length > 0 && (
              <div className="absolute bottom-[calc(100%+8px)] left-0 right-0 rounded-lg border border-outline-variant bg-white p-1 shadow-lift">
                {matches.map((item) => (
                  <button
                    key={item.page}
                    className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-xs font-semibold hover:bg-surface-container-low"
                    onClick={() => {
                      go(item.page);
                      setSearch("");
                    }}
                  >
                    <Icon name={item.icon} className="text-primary" />
                    {item.label}
                  </button>
                ))}
              </div>
            )}
            <div className="flex h-10 items-center gap-2 rounded-lg border border-outline-variant bg-surface-container-low px-3">
              <Icon name="search" className="text-on-surface-variant text-base" />
              <input
                className="min-w-0 flex-1 bg-transparent text-xs text-on-surface outline-none"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cari menu halaman..."
              />
            </div>
          </div>
          <div className="relative mt-3 flex items-center gap-3 rounded-lg border border-outline-variant bg-surface p-2.5">
            {notificationsOpen && (
              <div className="absolute bottom-[calc(100%+8px)] left-0 right-0 rounded-lg border border-outline-variant bg-white p-3 shadow-lift">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-on-surface">Notifikasi</p>
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                    {notifications.data?.total || 0}
                  </span>
                </div>
                <div className="mt-2 space-y-2 text-xs leading-5 text-on-surface-variant">
                  {user.role === "ADMIN" ? (
                    <>
                      <button
                        className="block w-full text-left hover:text-red-700"
                        onClick={() => go("finance?view=list&status=OVERDUE")}
                      >
                        <strong className="text-red-700">
                          {notifications.data?.overdue_payments || 0} tagihan
                        </strong>{" "}
                        melewati jatuh tempo.
                      </button>
                      <button
                        className="block w-full text-left hover:text-amber-700"
                        onClick={() =>
                          go("finance?view=list&tab=transactions&status=PENDING")
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
                      className="block w-full text-left hover:text-primary"
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
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-dark text-xs font-bold text-primary">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold text-on-surface">{user.full_name}</p>
              <p className="truncate text-[10px] text-on-surface-variant">
                {user.role === "ADMIN" ? "Super Admin" : "Guru"}
              </p>
            </div>
            <button
              className="icon-button relative h-8 w-8"
              onClick={() => setNotificationsOpen((value) => !value)}
              aria-label="Notifikasi"
            >
              <Icon name="notifications" className="text-base" />
              {(notifications.data?.total || 0) > 0 && (
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full border border-white bg-red-500" />
              )}
            </button>
          </div>
          <button
            className="mt-2 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50"
            onClick={onLogout}
          >
            <Icon name="logout" className="text-base" />
            Keluar Akun
          </button>
        </div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col md:ml-[288px]">
        <header className="relative z-50 flex min-h-16 items-center gap-2 border-b border-outline-variant bg-white px-3 shadow-sm md:hidden">
          <button
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
            onClick={() => go("dashboard")}
            aria-label="Buka Dashboard"
          >
            {logoLoaded ? (
              <img
                src="/logo.png"
                alt="Awan Topan"
                className="h-8 w-8 object-contain rounded"
                onError={() => setLogoLoaded(false)}
              />
            ) : (
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-brand-dark text-primary">
                <Icon name="school" className="text-base" />
              </span>
            )}
            <span className="min-w-0">
              <strong className="block truncate text-sm font-bold text-on-surface">
                Awan Topan
              </strong>
              <span className="block truncate text-[10px] font-semibold text-primary">
                Academic MS
              </span>
            </span>
          </button>
          <button
            className={`icon-button border border-outline-variant ${mobilePanel === "search" ? "bg-primary-container text-on-primary-container" : ""}`}
            onClick={() =>
              setMobilePanel((value) => (value === "search" ? null : "search"))
            }
            aria-label="Cari halaman"
          >
            <Icon name="search" />
          </button>
          <button
            className={`icon-button relative border border-outline-variant ${mobilePanel === "notifications" ? "bg-primary-container text-on-primary-container" : ""}`}
            onClick={() =>
              setMobilePanel((value) =>
                value === "notifications" ? null : "notifications",
              )
            }
            aria-label="Notifikasi"
          >
            <Icon name="notifications" />
            {(notifications.data?.total || 0) > 0 && (
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[8px] font-bold text-white">
                {Math.min(notifications.data?.total || 0, 99)}
              </span>
            )}
          </button>
          <button
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-dark text-xs font-bold text-primary"
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
                className="fixed inset-0 top-16 z-[-1] bg-black/20"
                onClick={() => setMobilePanel(null)}
                aria-label="Tutup panel"
              />
              <section className="absolute left-3 right-3 top-[calc(100%+8px)] max-h-[calc(100dvh-10rem)] overflow-y-auto rounded-lg border border-outline-variant bg-white p-4 shadow-lift">
                {mobilePanel === "search" && (
                  <>
                    <label className="flex h-10 items-center gap-2 rounded-lg border border-outline-variant px-3">
                      <Icon name="search" className="text-on-surface-variant" />
                      <input
                        className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Cari menu halaman..."
                        autoFocus
                      />
                    </label>
                    <div className="mt-2 space-y-1">
                      {(matches.length ? matches : items).map((item) => {
                        const isActive = activePage === (item.active || item.page);
                        return (
                          <button
                            key={item.page}
                            className={`flex min-h-10 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-semibold transition ${
                              isActive
                                ? "bg-[#18191B] text-amber-400 font-bold"
                                : "text-on-surface hover:bg-surface-container-low"
                            }`}
                            style={isActive ? { backgroundColor: "#18191B", color: "#F59E0B" } : undefined}
                            onClick={() => {
                              go(item.page);
                              setSearch("");
                            }}
                          >
                            <Icon name={item.icon} className={isActive ? "text-amber-400" : "text-amber-600"} style={isActive ? { color: "#F59E0B" } : undefined} />
                            <span style={isActive ? { color: "#FFFFFF" } : undefined}>{item.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
                {mobilePanel === "notifications" && (
                  <>
                    <div className="flex items-center justify-between">
                      <h2 className="text-sm font-bold text-on-surface">Notifikasi</h2>
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                        {notifications.data?.total || 0}
                      </span>
                    </div>
                    <div className="mt-3 space-y-2 text-xs leading-5">
                      {user.role === "ADMIN" ? (
                        <>
                          <button
                            className="block min-h-10 w-full rounded-md bg-red-50 p-2.5 text-left"
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
                            className="block min-h-10 w-full rounded-md bg-amber-50 p-2.5 text-left"
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
                          className="block min-h-10 w-full rounded-md bg-surface-container-low p-2.5 text-left"
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
                    <div className="flex items-center gap-3 border-b border-outline-variant pb-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-dark text-xs font-bold text-primary">
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-on-surface">
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
                      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
                        <p className="font-bold">Mode Simulasi</p>
                        <p className="mt-0.5">{simulationLabel}</p>
                      </div>
                    )}
                    <button
                      className="mt-3 flex min-h-10 w-full items-center gap-3 rounded-md px-3 text-sm font-semibold text-red-600 hover:bg-red-50"
                      onClick={onLogout}
                    >
                      <Icon name="logout" />
                      Keluar Akun
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
              <button onClick={resetDate} className="underline text-amber-950">Reset</button>
            )}
          </div>
        )}
        <div
          id="app-scroll-container"
          className="flex-1 overflow-y-auto bg-background px-3 py-4 pb-24 sm:p-margin-page md:pb-margin-page"
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
        className="fixed bottom-0 left-0 z-40 grid min-h-16 w-full border-t border-outline-variant bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
        style={{
          gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`,
        }}
      >
        {items.map((item) => {
          const isActive = activePage === (item.active || item.page);
          return (
            <button
              key={item.page}
              className={`flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 px-1 text-[10px] font-bold transition ${
                isActive ? "text-brand-dark" : "text-on-surface-variant"
              }`}
              onClick={() => go(item.page)}
            >
              <span
                className={`p-1.5 rounded-lg ${isActive ? "bg-amber-400 text-neutral-950 shadow-xs" : "text-stone-500"}`}
                style={isActive ? { backgroundColor: "#F59E0B", color: "#18191B" } : undefined}
              >
                <Icon name={item.icon} />
              </span>
              <span className={isActive ? "text-neutral-950 font-bold" : "text-stone-500"}>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
