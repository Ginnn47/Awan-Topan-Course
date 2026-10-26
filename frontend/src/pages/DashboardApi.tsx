import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet, queryString } from "../api/client";
import { queryKeys } from "../api/queryKeys";
import { useAuth } from "../auth/AuthProvider";
import { Icon } from "../components/ui";
import useOperationalDate from "../hooks/useOperationalDate.js";
import { getSubjectTheme } from "../utils/subjectColors";

interface DashboardData {
  date: string;
  role: string;
  schedule: Array<{
    id: string;
    class_group: string;
    subject: string;
    teacher: string;
    room: string;
    start_at: string;
    end_at: string;
    status: string;
  }>;
  attendance: {
    total: number;
    present: number;
    permit: number;
    sick: number;
    absent: number;
  };
  metrics?: { students: number; teachers: number; class_groups: number };
  finance?: {
    period_id: string | null;
    total_billed: number;
    total_paid: number;
    overdue_count: number;
    pending_count: number;
  };
  levels?: {
    sd: { students: number; rombel: number; target: number };
    smp: { students: number; rombel: number; target: number };
    sma: { students: number; rombel: number; target: number };
  };
  session_status?: {
    scheduled: number;
    ongoing: number;
    completed: number;
  };
}

const rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

const fullDate = new Intl.DateTimeFormat("id-ID", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const time = new Intl.DateTimeFormat("id-ID", {
  hour: "2-digit",
  minute: "2-digit",
});

function dateShift(value: string, amount: number) {
  const next = new Date(`${value}T12:00:00`);
  next.setDate(next.getDate() + amount);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
}

export default function DashboardApi() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const operational = useOperationalDate();
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [draftDate, setDraftDate] = useState<string>(operational.date);

  const dashboard = useQuery({
    queryKey: queryKeys.dashboard(operational.date),
    queryFn: ({ signal }) =>
      apiGet<DashboardData>(
        `/api/v1/dashboard/${queryString({ date: operational.date })}`,
        signal,
      ),
  });

  const data = dashboard.data;
  const hasAttendanceData = (data?.attendance.total || 0) > 0;
  const attendanceRate = hasAttendanceData
    ? Math.round(((data?.attendance.present || 0) / (data?.attendance.total || 1)) * 100)
    : 0;

  // Max 4-5 sessions most relevant for today's schedule
  const todaySchedules = (data?.schedule || []).slice(0, 5);

  const applyDate = () => {
    if (
      draftDate !== operational.date &&
      !window.confirm(
        "Jadwal, rekap presensi, dan status operasional akan mengikuti tanggal baru ini. Lanjutkan?",
      )
    )
      return;
    operational.setDate(draftDate);
    setCalendarOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Area: Sapaan, Deskripsi & Pemilih Tanggal */}
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-amber-500">
            Awan Topan Course
          </p>
          <h1 className="mt-1 break-words text-2xl font-bold leading-tight text-on-surface sm:text-3xl">
            Selamat datang, <span className="text-brand-dark">{user?.full_name}</span>
          </h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Pantau jadwal sesi aktif, tingkat presensi, rombel belajar, dan status keuangan operasional.
          </p>
        </div>

        <div className="relative self-start sm:self-auto">
          <button
            className="flex min-h-11 items-center gap-2.5 rounded-lg border border-outline-variant bg-white px-3.5 py-2 text-xs font-bold text-on-surface shadow-soft hover:bg-surface-container-low transition"
            onClick={() => {
              setDraftDate(operational.date);
              setCalendarOpen((v) => !v);
            }}
          >
            <Icon name="calendar_today" className="text-amber-500 text-base" />
            <span>{fullDate.format(new Date(`${operational.date}T12:00:00`))}</span>
            <Icon name="expand_more" className="text-base text-on-surface-variant" />
          </button>

          {calendarOpen && (
            <div className="absolute left-0 top-14 z-30 w-[min(320px,calc(100vw-2rem))] rounded-xl border border-outline-variant bg-white p-4 shadow-lift sm:left-auto sm:right-0">
              <p className="text-xs font-bold text-on-surface mb-2">Pilih Tanggal Operasional:</p>
              <div className="flex items-center gap-2">
                <button
                  className="icon-button border border-outline-variant"
                  onClick={() => setDraftDate((v) => dateShift(v, -1))}
                  title="Hari Sebelumnya"
                >
                  <Icon name="chevron_left" />
                </button>
                <input
                  className="h-10 min-w-0 flex-1 rounded-lg border border-outline-variant px-3 text-xs outline-none"
                  type="date"
                  value={draftDate}
                  onChange={(e) => setDraftDate(e.target.value)}
                />
                <button
                  className="icon-button border border-outline-variant"
                  onClick={() => setDraftDate((v) => dateShift(v, 1))}
                  title="Hari Berikutnya"
                >
                  <Icon name="chevron_right" />
                </button>
              </div>
              <div className="mt-4 flex justify-end gap-2 border-t border-outline-variant pt-3">
                <button
                  className="secondary-button py-1.5 px-3 text-xs"
                  onClick={() => {
                    operational.resetDate();
                    setCalendarOpen(false);
                  }}
                >
                  Hari Ini
                </button>
                <button
                  className="primary-button py-1.5 px-3 text-xs"
                  onClick={applyDate}
                >
                  Terapkan
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      {dashboard.isLoading && (
        <div className="rounded-xl border border-outline-variant bg-white p-12 text-center text-sm text-on-surface-variant">
          Memuat ringkasan dashboard...
        </div>
      )}

      {dashboard.isError && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-xs font-semibold text-red-700">
          Gagal memuat data dashboard. Periksa koneksi server lalu coba lagi.
        </div>
      )}

      {data && (
        <>
          {/* 2. Summary Cards: 3 Indikator Utama */}
          {user?.role === "ADMIN" && (
            <section className="grid gap-4 sm:grid-cols-3">
              {[
                {
                  label: "Total Siswa",
                  value: data.metrics?.students || 0,
                  note: "Siswa terdaftar aktif",
                  icon: "groups",
                },
                {
                  label: "Total Pengajar",
                  value: data.metrics?.teachers || 0,
                  note: "Pengajar aktif terdaftar",
                  icon: "person",
                },
                {
                  label: "Total Kelas / Rombel",
                  value: data.metrics?.class_groups || 0,
                  note: "Rombel belajar aktif",
                  icon: "menu_book",
                },
              ].map((item) => (
                <article
                  key={item.label}
                  className="rounded-xl border border-outline-variant bg-white p-5 shadow-soft transition hover:shadow-lift"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#18191B] text-amber-400 font-bold shadow-sm">
                      <Icon name={item.icon} className="text-xl" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-on-surface-variant">
                        {item.label}
                      </p>
                      <p className="text-2xl font-bold leading-tight text-on-surface">
                        {item.value}
                      </p>
                      <p className="mt-0.5 text-[11px] text-on-surface-variant">
                        {item.note}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </section>
          )}

          {/* 3. Area Utama: Dua Kolom di Desktop, Satu Kolom di Mobile */}
          <section className="grid gap-6 lg:grid-cols-2">
            {/* Kolom Kiri: Jadwal Hari Ini (Maks 4-5 Sesi) */}
            <article className="rounded-xl border border-outline-variant bg-white p-5 shadow-soft flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-outline-variant pb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#18191B] text-amber-400">
                      <Icon name="calendar_today" className="text-sm" />
                    </span>
                    <h2 className="text-base font-bold text-on-surface">Jadwal Hari Ini</h2>
                  </div>
                  <button
                    className="inline-flex items-center gap-1 text-xs font-bold text-on-surface hover:text-amber-600 transition"
                    onClick={() => navigate("/course")}
                  >
                    <span>Lihat Semua ({data.schedule.length})</span>
                    <Icon name="arrow_forward" className="text-xs" />
                  </button>
                </div>

                <div className="mt-4 space-y-3">
                  {todaySchedules.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-outline-variant p-8 text-center text-xs text-on-surface-variant">
                      Tidak ada jadwal sesi pada tanggal operasional ini.
                    </div>
                  ) : (
                    todaySchedules.map((item) => {
                      const theme = getSubjectTheme(item.subject);
                      return (
                        <div
                          key={item.id}
                          onClick={() => navigate("/course")}
                          style={{
                            backgroundColor: theme.bgPastel,
                            borderLeftColor: theme.hex,
                            borderLeftWidth: "4px",
                          }}
                          className="flex w-full items-center justify-between gap-3 rounded-lg border border-outline-variant/60 p-3 text-left transition hover:shadow-soft cursor-pointer"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span
                                className="rounded px-2 py-0.5 text-[10px] font-bold"
                                style={{
                                  backgroundColor: theme.badgeBg,
                                  color: theme.badgeText,
                                }}
                              >
                                {item.subject}
                              </span>
                              <strong className="truncate text-xs font-bold text-on-surface">
                                {item.class_group}
                              </strong>
                            </div>
                            <p className="mt-1 truncate text-xs text-on-surface-variant">
                              <span className="font-semibold text-on-surface">{item.teacher}</span> · {item.room}
                            </p>
                          </div>

                          <div className="text-right shrink-0">
                            <p className="text-xs font-bold text-on-surface">
                              {time.format(new Date(item.start_at))} - {time.format(new Date(item.end_at))}
                            </p>
                            <span className="mt-1 inline-flex rounded-md border border-outline-variant bg-white px-2 py-0.5 text-[10px] font-bold text-on-surface">
                              {item.status === "IN_PROGRESS" ? "Berjalan" : "Terjadwal"}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {todaySchedules.length > 0 && data.schedule.length > 5 && (
                <div className="mt-4 pt-3 border-t border-outline-variant text-center">
                  <p className="text-xs text-on-surface-variant">
                    Menampilkan 5 dari {data.schedule.length} sesi hari ini.{" "}
                    <button
                      className="font-bold underline text-on-surface hover:text-amber-600"
                      onClick={() => navigate("/course")}
                    >
                      Buka jadwal lengkap &rarr;
                    </button>
                  </p>
                </div>
              )}
            </article>

            {/* Kolom Kanan: Kehadiran Hari Ini (Donut Chart & Breakdown) */}
            <article className="rounded-xl border border-outline-variant bg-white p-5 shadow-soft">
              <div className="flex items-center gap-2.5 border-b border-outline-variant pb-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#18191B] text-amber-400">
                  <Icon name="groups" className="text-sm" />
                </span>
                <h2 className="text-base font-bold text-on-surface">Kehadiran Hari Ini</h2>
              </div>

              <div className="mt-6 flex flex-col items-center gap-6 sm:flex-row sm:justify-around">
                {/* Donut Chart Visual */}
                <div
                  className="grid h-36 w-36 place-items-center rounded-full shadow-inner"
                  style={{
                    background: hasAttendanceData
                      ? `conic-gradient(#F59E0B ${attendanceRate}%, #E5E7EB 0)`
                      : "#E5E7EB",
                  }}
                >
                  <div className="grid h-26 w-26 place-items-center rounded-full bg-white text-center p-3">
                    <div>
                      <p className="text-2xl font-bold text-on-surface">
                        {hasAttendanceData ? `${attendanceRate}%` : "0%"}
                      </p>
                      <p className="text-[10px] font-semibold text-on-surface-variant">
                        {hasAttendanceData ? "Tingkat Hadir" : "Belum Ada Data"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Counts Breakdown */}
                <div className="space-y-2.5 text-xs w-full sm:w-auto min-w-[180px]">
                  {[
                    ["Hadir", data.attendance.present, "bg-amber-500"],
                    [
                      "Izin / Sakit",
                      data.attendance.permit + data.attendance.sick,
                      "bg-amber-500",
                    ],
                    ["Alfa", data.attendance.absent, "bg-red-500"],
                  ].map(([label, value, color]) => (
                    <div
                      key={String(label)}
                      className="flex items-center justify-between gap-3 rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
                        <span className="text-on-surface-variant font-medium">{label}</span>
                      </div>
                      <strong className="text-on-surface text-sm">{value}</strong>
                    </div>
                  ))}
                  <p className="text-[10px] text-center text-on-surface-variant pt-1">
                    {hasAttendanceData
                      ? `Total ${data.attendance.total} catatan absensi hari ini`
                      : "Presensi dicatat otomatis saat pengajar memulai sesi"}
                  </p>
                </div>
              </div>

              {/* Visualisasi Pendukung di Bawah Donut Chart */}
              <div className="mt-6 pt-5 border-t border-outline-variant space-y-4">
                {/* 1. Indikator Kolektibilitas Tagihan */}
                <div className="rounded-lg border border-outline-variant bg-surface-container-low/60 p-3.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded bg-[#18191B] text-amber-400">
                        <Icon name="payments" className="text-xs" />
                      </span>
                      <span className="font-bold text-on-surface">Kolektibilitas Tagihan Periode Aktif</span>
                    </div>
                    <span className="font-bold text-amber-600">
                      {data.finance && data.finance.total_billed > 0
                        ? `${Math.round((data.finance.total_paid / data.finance.total_billed) * 100)}%`
                        : "0%"}
                    </span>
                  </div>
                  <div className="mt-2.5 h-2.5 w-full rounded-full bg-stone-200 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-amber-400 transition-all duration-500"
                      style={{
                        width: `${
                          data.finance && data.finance.total_billed > 0
                            ? Math.min(100, Math.round((data.finance.total_paid / data.finance.total_billed) * 100))
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px] text-on-surface-variant">
                    <span>
                      Terbayar: <strong className="text-on-surface">{rupiah.format(data.finance?.total_paid || 0)}</strong>
                    </span>
                    <span>
                      Total: <strong className="text-on-surface">{rupiah.format(data.finance?.total_billed || 0)}</strong>
                    </span>
                  </div>
                </div>

                {/* 2. Distribusi Jenjang Belajar (SD, SMP, SMA) */}
                <div className="rounded-lg border border-outline-variant bg-surface-container-low/60 p-3.5">
                  <div className="flex items-center justify-between text-xs pb-2 border-b border-outline-variant/60">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded bg-[#18191B] text-amber-400">
                        <Icon name="school" className="text-xs" />
                      </span>
                      <span className="font-bold text-on-surface">Distribusi Siswa per Jenjang</span>
                    </div>
                    <span className="text-[10px] text-on-surface-variant font-semibold">12 Rombel Aktif</span>
                  </div>

                  <div className="mt-3 space-y-2.5 text-xs">
                    {[
                      {
                        level: "SD",
                        name: "Kelas 6 SD (Ruang Alpha)",
                        students: data.levels?.sd.students ?? 10,
                        target: data.levels?.sd.target ?? 12,
                        rombel: data.levels?.sd.rombel ?? 1,
                      },
                      {
                        level: "SMP",
                        name: "Kelas 7 - 9 SMP (6 Rombel)",
                        students: data.levels?.smp.students ?? 66,
                        target: data.levels?.smp.target ?? 72,
                        rombel: data.levels?.smp.rombel ?? 6,
                      },
                      {
                        level: "SMA",
                        name: "Kelas 10 - 12 SMA (5 Rombel)",
                        students: data.levels?.sma.students ?? 59,
                        target: data.levels?.sma.target ?? 60,
                        rombel: data.levels?.sma.rombel ?? 5,
                      },
                    ].map((row) => {
                      const pct = Math.min(100, Math.round((row.students / row.target) * 100));
                      return (
                        <div key={row.level} className="space-y-1">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-semibold text-on-surface">{row.name}</span>
                            <span className="font-bold text-on-surface">
                              {row.students} <span className="font-normal text-on-surface-variant">/ {row.target} Siswa ({pct}%)</span>
                            </span>
                          </div>
                          <div className="h-2 w-full rounded-full bg-stone-200 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-amber-400 transition-all duration-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 3. Status Sesi Operasional Hari Ini */}
                <div className="flex items-center justify-between gap-2 rounded-lg border border-outline-variant bg-[#18191B] p-3 text-white">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-400 text-neutral-950 font-bold">
                      <Icon name="event_available" className="text-sm" />
                    </span>
                    <div>
                      <p className="text-xs font-bold leading-none">Status Sesi Hari Ini</p>
                      <p className="mt-1 text-[10px] text-stone-300">
                        {data.schedule.length} sesi operasional terjadwal
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <span className="rounded bg-white/10 px-2 py-0.5 font-bold text-amber-400">
                      {data.session_status?.scheduled ?? data.schedule.filter((s) => s.status === "SCHEDULED").length} Terjadwal
                    </span>
                    <span className="rounded bg-white/10 px-2 py-0.5 font-bold text-white">
                      {data.session_status?.completed ?? data.schedule.filter((s) => s.status === "COMPLETED").length} Selesai
                    </span>
                  </div>
                </div>
              </div>
            </article>
          </section>

          {/* 4. Ringkasan Keuangan Periode Ini */}
          {user?.role === "ADMIN" && (
            <section className="rounded-xl border border-outline-variant bg-white p-5 shadow-soft">
              <div className="flex items-center justify-between border-b border-outline-variant pb-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#18191B] text-amber-400">
                    <Icon name="payments" className="text-sm" />
                  </span>
                  <div>
                    <h2 className="text-base font-bold text-on-surface">Ringkasan Keuangan</h2>
                    <p className="text-xs text-on-surface-variant">Status tagihan dan rekonsiliasi pembayaran periode aktif</p>
                  </div>
                </div>
                <button
                  className="inline-flex items-center gap-1 text-xs font-bold text-on-surface hover:text-amber-600 transition"
                  onClick={() => navigate("/finance")}
                >
                  <span>Kelola Finance</span>
                  <Icon name="arrow_forward" className="text-xs" />
                </button>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  [
                    "Total Tagihan",
                    rupiah.format(data.finance?.total_billed || 0),
                    "text-on-surface",
                  ],
                  [
                    "Sudah Dibayar",
                    rupiah.format(data.finance?.total_paid || 0),
                    "text-amber-700",
                  ],
                  [
                    "Sisa Tagihan",
                    rupiah.format(
                      (data.finance?.total_billed || 0) - (data.finance?.total_paid || 0),
                    ),
                    "text-red-700",
                  ],
                  [
                    "Perlu Tindakan",
                    `${(data.finance?.overdue_count || 0) + (data.finance?.pending_count || 0)} record`,
                    "text-amber-700",
                  ],
                ].map(([label, value, colorClass]) => (
                  <div
                    key={label}
                    className="rounded-lg border border-outline-variant bg-surface-container-low p-4"
                  >
                    <p className="text-xs font-semibold text-on-surface-variant">
                      {label}
                    </p>
                    <p className={`mt-1.5 text-lg font-bold ${colorClass}`}>
                      {value}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
