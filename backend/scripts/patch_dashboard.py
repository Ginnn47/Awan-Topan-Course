with open("frontend/src/pages/DashboardApi.tsx", "r", encoding="utf-8") as f:
    text = f.read()

# 1. Update DashboardData interface
old_iface = """  finance?: {
    period_id: string | null;
    total_billed: number;
    total_paid: number;
    overdue_count: number;
    pending_count: number;
  };
}"""

new_iface = """  finance?: {
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
}"""

assert old_iface in text, "old_iface not found in DashboardApi.tsx"
text = text.replace(old_iface, new_iface, 1)

# 2. Add widgets below donut chart
old_article = """                  <p className="text-[10px] text-center text-on-surface-variant pt-1">
                    {hasAttendanceData
                      ? `Total ${data.attendance.total} catatan absensi hari ini`
                      : "Presensi dicatat otomatis saat pengajar memulai sesi"}
                  </p>
                </div>
              </div>
            </article>"""

new_article = """                  <p className="text-[10px] text-center text-on-surface-variant pt-1">
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
            </article>"""

assert old_article in text, "old_article not found in DashboardApi.tsx"
text = text.replace(old_article, new_article, 1)

with open("frontend/src/pages/DashboardApi.tsx", "w", encoding="utf-8") as f:
    f.write(text)

print("DashboardApi.tsx updated successfully!")
