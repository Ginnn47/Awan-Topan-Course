import React, { useEffect, useState } from "react";
import { Icon } from "./ui.jsx";
import { getFinanceNotifications } from "../services/financeService.js";
import useDataRevision from "../hooks/useDataRevision.js";
import useOperationalDate from "../hooks/useOperationalDate.js";

const operationalDateFormatter = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" });

const navItems = [
  { page: "dashboard", label: "Dashboard", icon: "dashboard" },
  { page: "course", label: "Course", icon: "school" },
  { page: "rombel", label: "Student", icon: "groups" },
  { page: "finance", label: "Finance", icon: "payments", adminOnly: true },
];

export default function Shell({ role, activePage, onNavigate, onLogout, children }) {
  const items = navItems.filter((item) => role === "admin" || !item.adminOnly);
  const [searchQuery, setSearchQuery] = useState("");
  const [showNotifications, setShowNotifications] = useState(false);
  const [financeNotifications, setFinanceNotifications] = useState({ overdueCount: 0, pendingCount: 0, total: 0 });
  const financeRevision = useDataRevision(["finance", "settings"]);
  const { date: operationalDate, isOverridden, resetDate } = useOperationalDate();
  const operationalDateLabel = operationalDateFormatter.format(new Date(`${operationalDate}T12:00:00`));
  const searchResults = searchQuery.trim()
    ? items.filter((item) => item.label.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    : [];
  const user = role === "admin"
    ? { initials: "AD", name: "Admin Awan Topan", title: "Super Administrator" }
    : { initials: "MT", name: "Mas Topan", title: "Guru / Pengajar" };

  useEffect(() => {
    if (role !== "admin") return undefined;
    setFinanceNotifications(getFinanceNotifications());
    return undefined;
  }, [role, financeRevision]);

  return (
    <div className={`flex h-screen overflow-hidden text-on-background ${activePage === "dashboard" ? "bg-[#edf7f1]" : "bg-background"}`}>
      <aside className="fixed left-0 top-0 z-40 hidden h-full w-[288px] flex-col border-r border-emerald-100/80 bg-white px-4 py-6 shadow-sm md:flex" style={{ backgroundImage: "url('/assets/generated/sidebar-mint-canvas.png')", backgroundPosition: "center", backgroundSize: "cover" }}>
        <div className="mb-8 flex items-center gap-3 px-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-primary text-on-primary">
            <Icon name="school" />
          </div>
          <div>
            <h1 className="text-[21px] font-bold leading-tight text-primary">Awan Topan</h1>
            <p className="text-xs font-medium text-on-surface-variant">Academic MS</p>
          </div>
        </div>

        <nav className="flex-1">
          <ul className="flex flex-col gap-1">
            {items.map((item) => (
              <li key={item.page}>
                <button
                  className={`mx-1 flex w-[calc(100%-0.5rem)] items-center gap-3 rounded-full px-5 py-3.5 text-left text-sm font-semibold transition ${
                    activePage === item.page
                      ? "bg-primary-container text-on-primary-container"
                      : "text-on-surface-variant hover:bg-surface-variant/50 hover:text-primary"
                  }`}
                  onClick={() => onNavigate(item.page)}
                >
                  <Icon name={item.icon} />
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="relative border-t border-outline-variant/40 px-1 pt-5">
          {isOverridden && (
            <div className="mb-3 rounded-[8px] border border-amber-300 bg-amber-50 p-3 text-amber-900 shadow-sm">
              <div className="flex items-start gap-2">
                <Icon name="schedule" className="mt-0.5 shrink-0 text-base" />
                <div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase">Mode Simulasi</p><p className="mt-1 text-xs font-bold">{operationalDateLabel}</p></div>
                {role === "admin" && <button className="icon-button h-7 w-7 shrink-0 rounded-[6px] text-amber-800 hover:bg-amber-100" onClick={resetDate} title="Kembali ke hari ini" aria-label="Reset tanggal operasional"><Icon name="restart_alt" className="text-base" /></button>}
              </div>
            </div>
          )}
          <div className="relative">
            {searchResults.length > 0 && (
              <div className="absolute bottom-[calc(100%+8px)] left-0 right-0 overflow-hidden rounded-[8px] border border-outline-variant/50 bg-white p-1 shadow-lift">
                {searchResults.map((item) => (
                  <button key={item.page} className="flex w-full items-center gap-3 rounded-[6px] px-3 py-2.5 text-left text-sm font-semibold hover:bg-surface-container-low" onClick={() => { onNavigate(item.page); setSearchQuery(""); }}>
                    <Icon name={item.icon} /> {item.label}
                  </button>
                ))}
              </div>
            )}
            <div className="flex h-11 items-center gap-2 rounded-[8px] border border-outline-variant/50 bg-white px-3">
              <Icon name="search" className="text-on-surface-variant" />
              <input className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-on-surface-variant/70" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Cari halaman..." />
            </div>
          </div>

          <div className="relative mt-3 flex items-center gap-3 rounded-[8px] border border-outline-variant/40 bg-white p-3">
            {showNotifications && (
              <div className="absolute bottom-[calc(100%+8px)] left-0 right-0 rounded-[8px] border border-outline-variant/50 bg-white p-3 shadow-lift">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold">Notifikasi</p>
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">{1 + financeNotifications.total} baru</span>
                </div>
                <div className="mt-3 divide-y divide-outline-variant/30 text-xs text-on-surface-variant">
                  <button className="w-full pb-3 text-left leading-5" onClick={() => { onNavigate("course"); setShowNotifications(false); }}>Jadwal kelas hari ini siap dimulai.</button>
                  {role === "admin" && financeNotifications.overdueCount > 0 && <button className="w-full py-3 text-left leading-5 hover:text-primary" onClick={() => { onNavigate("finance?view=list&tab=invoices&status=Jatuh%20Tempo"); setShowNotifications(false); }}><strong className="text-red-700">{financeNotifications.overdueCount} siswa</strong> melewati jatuh tempo pembayaran.</button>}
                  {role === "admin" && financeNotifications.pendingCount > 0 && <button className="w-full pt-3 text-left leading-5 hover:text-primary" onClick={() => { onNavigate("finance?view=list&tab=transactions&status=pending"); setShowNotifications(false); }}><strong className="text-amber-700">{financeNotifications.pendingCount} transaksi</strong> menunggu verifikasi.</button>}
                </div>
              </div>
            )}
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary-container text-sm font-bold text-primary">{user.initials}</div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-on-surface">{user.name}</p>
              <p className="mt-0.5 truncate text-[11px] text-on-surface-variant">{user.title}</p>
            </div>
            <button className={`icon-button relative ${showNotifications ? "bg-surface-container-low text-primary" : ""}`} onClick={() => setShowNotifications((current) => !current)} aria-label="Notifikasi">
              <Icon name="notifications" />
              {(role !== "admin" || financeNotifications.total > 0) && <span className="absolute right-2 top-2 h-2 w-2 rounded-full border border-white bg-red-500" />}
            </button>
          </div>

          <button
            className="mt-2 flex w-full items-center gap-3 rounded-[8px] px-4 py-3 text-sm font-semibold text-on-surface-variant transition hover:bg-surface-variant/50 hover:text-primary"
            onClick={onLogout}
          >
            <Icon name="logout" /> Keluar
          </button>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col md:ml-[288px]">
        {isOverridden && (
          <div className="flex min-h-10 items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-[11px] font-bold text-amber-900 md:hidden">
            <span className="flex min-w-0 items-center gap-2"><Icon name="schedule" className="shrink-0 text-base" /><span className="truncate">Mode Simulasi · {operationalDateLabel}</span></span>
            {role === "admin" && <button className="shrink-0 rounded-[6px] border border-amber-300 bg-white px-2.5 py-1" onClick={resetDate}>Reset</button>}
          </div>
        )}
        <div id="app-scroll-container" className={`flex-1 overflow-y-auto p-margin-page pb-24 md:pb-margin-page ${activePage === "dashboard" ? "bg-[#f3faf6] bg-cover bg-center bg-no-repeat" : ""}`} style={activePage === "dashboard" ? { backgroundImage: "url('/assets/generated/dashboard-mint-canvas.png')" } : undefined}>
          <div className={["course", "rombel", "finance"].includes(activePage) ? "w-full" : activePage === "dashboard" ? "mx-auto w-full max-w-[1500px]" : "mx-auto max-w-7xl"}>{children}</div>
        </div>
      </main>

      <nav className="fixed bottom-0 left-0 z-40 grid h-16 w-full border-t border-outline-variant/30 bg-surface/95 backdrop-blur-xl md:hidden" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((item) => (
          <button
            key={item.page}
            className={`flex flex-col items-center justify-center gap-1 text-xs font-semibold ${
              activePage === item.page ? "text-primary" : "text-on-surface-variant"
            }`}
            onClick={() => onNavigate(item.page)}
          >
            <Icon name={item.icon} />
            {item.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
