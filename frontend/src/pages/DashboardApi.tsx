import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet, queryString } from "../api/client";
import { queryKeys } from "../api/queryKeys";
import { useAuth } from "../auth/AuthProvider";
import { Icon } from "../components/ui";
import useOperationalDate from "../hooks/useOperationalDate.js";

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
  const attendanceRate = data?.attendance.total
    ? Math.round((data.attendance.present / data.attendance.total) * 100)
    : 0;

  const applyDate = () => {
    if (
      draftDate !== operational.date &&
      !window.confirm(
        "Jadwal, rekap, Finance, dan status jatuh tempo akan mengikuti tanggal ini. Lanjutkan?",
      )
    )
      return;
    operational.setDate(draftDate);
    setCalendarOpen(false);
  };

  return (
    <div className="space-y-5 sm:space-y-7">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold text-primary">
            Awan Topan Course
          </p>
          <h1 className="mt-2 break-words text-[26px] font-bold leading-8 text-on-surface sm:text-[30px] sm:leading-9">
            <span className="text-primary">Selamat datang,</span>{" "}
            {user?.full_name}
          </h1>
          <p className="mt-2 text-sm text-on-surface-variant">
            Pantau jadwal, kehadiran, rombel, dan pembayaran dari satu ruang
            kerja.
          </p>
        </div>
        <div className="relative w-full self-start sm:w-auto">
          <button
            className="flex min-h-12 w-full items-center justify-between gap-2 rounded-[8px] border border-emerald-200 bg-white px-3 text-left text-xs font-bold text-primary shadow-soft hover:-translate-y-0.5 sm:w-auto sm:gap-3 sm:px-4 sm:text-sm"
            onClick={() => {
              setDraftDate(operational.date);
              setCalendarOpen((value) => !value);
            }}
          >
            <Icon name="calendar_today" />
            {fullDate.format(new Date(`${operational.date}T12:00:00`))}
            <Icon name="expand_more" className="text-base" />
          </button>
          {calendarOpen && (
            <div className="absolute left-0 top-14 z-30 w-[min(310px,calc(100vw-1.5rem))] rounded-[8px] border border-emerald-200 bg-white p-3 shadow-lift sm:left-auto sm:right-0 sm:p-4">
              <div className="flex items-center gap-2">
                <button
                  className="icon-button border"
                  onClick={() => setDraftDate((value) => dateShift(value, -1))}
                >
                  <Icon name="chevron_left" />
                </button>
                <input
                  className="h-10 min-w-0 flex-1 rounded-[7px] border border-outline-variant px-3 text-sm"
                  type="date"
                  value={draftDate}
                  onChange={(event) => setDraftDate(event.target.value)}
                />
                <button
                  className="icon-button border"
                  onClick={() => setDraftDate((value) => dateShift(value, 1))}
                >
                  <Icon name="chevron_right" />
                </button>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  className="h-9 rounded-[7px] border px-3 text-xs font-bold"
                  onClick={() => {
                    operational.resetDate();
                    setCalendarOpen(false);
                  }}
                >
                  Hari Ini
                </button>
                <button
                  className="h-9 rounded-[7px] bg-primary px-4 text-xs font-bold text-white"
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
        <div className="rounded-[8px] border bg-white p-10 text-center text-sm text-on-surface-variant">
          Memuat dashboard...
        </div>
      )}
      {dashboard.isError && (
        <div className="rounded-[8px] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Dashboard tidak dapat dimuat. Periksa koneksi API lalu coba lagi.
        </div>
      )}
      {data && (
        <>
          {user?.role === "ADMIN" && (
            <section className="grid gap-4 md:grid-cols-3">
              {[
                {
                  label: "Total Siswa",
                  value: data.metrics?.students || 0,
                  note: "Siswa aktif dan terdaftar",
                  icon: "groups",
                  tone: "from-[#16a467] to-[#00764f] text-white",
                },
                {
                  label: "Total Pengajar",
                  value: data.metrics?.teachers || 0,
                  note: "Pengajar aktif pada master Course",
                  icon: "record_voice_over",
                  tone: "from-[#e5f8ed] to-[#c7ebdc] text-primary",
                },
                {
                  label: "Total Kelas",
                  value: data.metrics?.class_groups || 0,
                  note: "Rombel aktif dan tersinkron",
                  icon: "menu_book",
                  tone: "from-[#f1f9d9] to-[#dceebd] text-[#34551f]",
                },
              ].map((item) => (
                <article
                  key={item.label}
                  className={`group relative min-h-[132px] overflow-hidden rounded-[8px] border border-white/70 bg-gradient-to-br p-5 shadow-soft transition hover:-translate-y-1 hover:shadow-lift sm:min-h-[150px] sm:p-6 ${item.tone}`}
                >
                  <div className="flex items-start gap-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/85 text-primary shadow-sm">
                      <Icon name={item.icon} className="text-2xl" />
                    </div>
                    <div>
                      <p className="text-sm font-bold opacity-90">
                        {item.label}
                      </p>
                      <p className="mt-1 text-[34px] font-bold leading-10">
                        {item.value}
                      </p>
                      <p className="mt-3 text-xs font-medium opacity-80">
                        {item.note}
                      </p>
                    </div>
                  </div>
                  <Icon
                    name={item.icon}
                    className="absolute -bottom-4 right-2 text-4xl opacity-10 transition group-hover:scale-110"
                  />
                </article>
              ))}
            </section>
          )}

          <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
            <article className="rounded-[8px] border border-emerald-100 bg-white p-4 shadow-soft transition hover:shadow-lift sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="flex items-center gap-3 text-lg font-bold">
                  <Icon name="calendar_today" className="text-primary" />
                  Jadwal Hari Ini
                </h2>
                <button
                  className="text-xs font-bold text-primary"
                  onClick={() => navigate("/course")}
                >
                  Lihat Semua
                </button>
              </div>
              <div className="mt-5 space-y-3">
                {data.schedule.length === 0 ? (
                  <div className="rounded-[8px] border border-dashed p-8 text-center text-sm text-on-surface-variant">
                    Tidak ada sesi pada tanggal operasional ini.
                  </div>
                ) : (
                  data.schedule.map((item) => (
                    <button
                      key={item.id}
                      className="flex w-full flex-wrap items-center gap-3 rounded-[8px] border border-emerald-100 bg-[#fbfefc] p-3 text-left transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-soft sm:flex-nowrap sm:gap-4 sm:p-4"
                      onClick={() => navigate("/course")}
                    >
                      <span className="h-12 w-1 rounded-full bg-primary" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold">
                          {item.subject} - {item.class_group}
                        </p>
                        <p className="mt-1 truncate text-xs text-on-surface-variant">
                          {item.room} · {item.teacher}
                        </p>
                      </div>
                      <div className="ml-4 w-[calc(100%-1rem)] text-left sm:ml-0 sm:w-auto sm:text-right">
                        <p className="text-xs font-bold">
                          {time.format(new Date(item.start_at))} -{" "}
                          {time.format(new Date(item.end_at))}
                        </p>
                        <span className="mt-2 inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold text-primary">
                          {item.status === "IN_PROGRESS"
                            ? "Berlangsung"
                            : "Terjadwal"}
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </article>
            <article className="rounded-[8px] border border-emerald-100 bg-white p-4 shadow-soft transition hover:shadow-lift sm:p-5">
              <h2 className="flex items-center gap-3 text-lg font-bold">
                <Icon name="groups" className="text-primary" />
                Kehadiran Hari Ini
              </h2>
              <div className="mt-7 flex flex-col items-center gap-7 sm:flex-row sm:justify-center">
                <div
                  className="grid h-40 w-40 place-items-center rounded-full"
                  style={{
                    background: `conic-gradient(#078447 ${attendanceRate}%, #dfe9e1 0)`,
                  }}
                >
                  <div className="grid h-28 w-28 place-items-center rounded-full bg-white text-center">
                    <div>
                      <p className="text-[30px] font-bold">{attendanceRate}%</p>
                      <p className="text-xs text-on-surface-variant">Hadir</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-3 text-sm">
                  {[
                    ["Hadir", data.attendance.present, "bg-emerald-600"],
                    [
                      "Izin + Sakit",
                      data.attendance.permit + data.attendance.sick,
                      "bg-amber-500",
                    ],
                    ["Alfa", data.attendance.absent, "bg-red-500"],
                  ].map(([label, value, color]) => (
                    <div
                      key={String(label)}
                      className="flex min-w-[170px] items-center gap-3"
                    >
                      <span className={`h-3 w-3 rounded-full ${color}`} />
                      <span className="flex-1 text-on-surface-variant">
                        {label}
                      </span>
                      <strong>{value}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </article>
          </section>

          {user?.role === "ADMIN" && (
            <section className="rounded-[8px] border border-emerald-100 bg-gradient-to-r from-white via-[#f5fbf7] to-[#e7f5ed] p-5 shadow-soft transition hover:shadow-lift">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-3 text-lg font-bold">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-primary">
                    <Icon name="payments" />
                  </span>
                  Ringkasan Keuangan Bulan Ini
                </h2>
                <button
                  className="text-xs font-bold text-primary"
                  onClick={() => navigate("/finance")}
                >
                  Lihat Detail
                </button>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  [
                    "Total Tagihan",
                    rupiah.format(data.finance?.total_billed || 0),
                  ],
                  [
                    "Sudah Dibayar",
                    rupiah.format(data.finance?.total_paid || 0),
                  ],
                  [
                    "Sisa Tagihan",
                    rupiah.format(
                      (data.finance?.total_billed || 0) -
                        (data.finance?.total_paid || 0),
                    ),
                  ],
                  [
                    "Perlu Tindakan",
                    `${(data.finance?.overdue_count || 0) + (data.finance?.pending_count || 0)} record`,
                  ],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-[8px] border border-emerald-100 bg-white/90 p-4 shadow-sm"
                  >
                    <p className="text-xs font-semibold text-on-surface-variant">
                      {label}
                    </p>
                    <p className="mt-2 text-lg font-bold text-on-surface">
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
