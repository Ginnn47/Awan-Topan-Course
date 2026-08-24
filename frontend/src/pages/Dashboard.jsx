import React, { useEffect, useRef, useState } from "react";
import { Icon } from "../components/ui.jsx";
import {
  courseTeachers,
  loadCourseClasses,
  loadCourseSessions,
  loadStudentMonthlyRecords,
  toISODate,
} from "../datadummy.js";
import { getBillingPeriods, getFinanceOverview } from "../services/financeService.js";
import useDataRevision from "../hooks/useDataRevision.js";
import useOperationalDate from "../hooks/useOperationalDate.js";

const rupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("id-ID");
const billingMonthLabel = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" });
const panelClass = "group overflow-hidden rounded-[8px] border border-white/85 bg-white/90 shadow-[0_10px_28px_rgba(25,94,62,0.09)] backdrop-blur-sm transition duration-300 hover:-translate-y-1 hover:border-emerald-200/90 hover:shadow-[0_20px_46px_rgba(20,104,67,0.16)]";
const sessionAccent = ["bg-[#00875a]", "bg-[#1d91a5]", "bg-[#83a936]", "bg-[#d08829]"];

function dashboardData(operationalDate) {
  const classes = loadCourseClasses();
  const sessions = loadCourseSessions();
  const totalStudents = classes.reduce((total, classGroup) => total + classGroup.members.length, 0);
  const classMap = new Map(classes.map((classGroup) => [classGroup.id, classGroup]));
  const todaySessions = sessions
    .filter((session) => session.date === operationalDate)
    .sort((left, right) => left.startTime.localeCompare(right.startTime));
  const activeMonth = operationalDate.slice(0, 7);
  const activePeriod = getBillingPeriods().find((period) => period.month === activeMonth) || null;
  const finance = activePeriod ? getFinanceOverview(activePeriod.id) : null;
  const attendanceRecords = loadStudentMonthlyRecords()
    .filter((record) => record.month === activeMonth)
    .filter((record) => classes.some((classGroup) => classGroup.members.some((student) => student.id === record.studentId)));
  const attendance = attendanceRecords.reduce((summary, record) => ({
    total: summary.total + record.attendance.totalSessions,
    present: summary.present + record.attendance.present,
    permit: summary.permit + record.attendance.permit,
    sick: summary.sick + record.attendance.sick,
    absent: summary.absent + record.attendance.absent,
  }), { total: 0, present: 0, permit: 0, sick: 0, absent: 0 });
  attendance.rate = attendance.total ? Math.round((attendance.present / attendance.total) * 100) : 0;
  return { classes, classMap, sessions, totalStudents, todaySessions, activePeriod, finance, attendance, activeMonth };
}

function shiftDate(value, amount) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return toISODate(date);
}

function DashboardHeader({ name, description, role, operationalDate, physicalToday, isOverridden, onChangeDate, onResetDate }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draftDate, setDraftDate] = useState(operationalDate);
  const [confirming, setConfirming] = useState(false);
  const pickerRef = useRef(null);
  const formattedDate = new Date(`${operationalDate}T12:00:00`).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });

  useEffect(() => setDraftDate(operationalDate), [operationalDate]);
  useEffect(() => {
    if (!pickerOpen) return undefined;
    const closePicker = (event) => {
      if (event.key === "Escape") { setPickerOpen(false); setConfirming(false); }
      if (event.type === "mousedown" && !pickerRef.current?.contains(event.target)) { setPickerOpen(false); setConfirming(false); }
    };
    document.addEventListener("keydown", closePicker);
    document.addEventListener("mousedown", closePicker);
    return () => {
      document.removeEventListener("keydown", closePicker);
      document.removeEventListener("mousedown", closePicker);
    };
  }, [pickerOpen]);

  const applyDate = () => {
    onChangeDate(draftDate);
    setPickerOpen(false);
    setConfirming(false);
  };

  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-[11px] font-bold text-primary">Awan Topan Course</p>
        <h1 className="mt-2 text-[28px] font-bold leading-tight text-on-surface sm:text-[32px]"><span className="text-primary">Selamat pagi,</span> {name}.</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-on-surface-variant">{description}</p>
      </div>
      <div className="relative self-start sm:self-auto" ref={pickerRef}>
        <button
          className={`flex h-10 items-center gap-2 rounded-[8px] border bg-white/85 px-3 text-xs font-bold text-primary shadow-sm backdrop-blur-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-white hover:shadow-md ${isOverridden ? "border-amber-300 ring-2 ring-amber-100" : "border-white/80"}`}
          onClick={() => role === "admin" && setPickerOpen((current) => !current)}
          aria-expanded={role === "admin" ? pickerOpen : undefined}
          title={role === "admin" ? "Atur tanggal operasional" : "Tanggal operasional"}
        >
          <Icon name="calendar_month" className="text-base" /> {formattedDate}
          {role === "admin" && <Icon name="expand_more" className={`text-sm transition ${pickerOpen ? "rotate-180" : ""}`} />}
        </button>

        {role === "admin" && pickerOpen && (
          <div className="absolute right-0 top-[calc(100%+10px)] z-50 w-[320px] rounded-[8px] border border-emerald-200 bg-white p-4 text-left shadow-lift">
            {!confirming ? (
              <>
                <div><p className="text-sm font-bold text-on-surface">Tanggal Operasional</p><p className="mt-1 text-[10px] leading-4 text-on-surface-variant">Mengubah konteks jadwal, rekap, dan status pembayaran tanpa mengubah histori.</p></div>
                <div className="mt-4 grid grid-cols-[40px_minmax(0,1fr)_40px] overflow-hidden rounded-[8px] border border-outline-variant/50">
                  <button className="flex h-11 items-center justify-center border-r border-outline-variant/40 text-primary hover:bg-emerald-50" onClick={() => setDraftDate((current) => shiftDate(current, -1))} aria-label="Hari sebelumnya"><Icon name="chevron_left" /></button>
                  <input className="min-w-0 px-2 text-center text-xs font-bold outline-none" type="date" value={draftDate} onChange={(event) => setDraftDate(event.target.value)} />
                  <button className="flex h-11 items-center justify-center border-l border-outline-variant/40 text-primary hover:bg-emerald-50" onClick={() => setDraftDate((current) => shiftDate(current, 1))} aria-label="Hari berikutnya"><Icon name="chevron_right" /></button>
                </div>
                <div className="mt-4 flex gap-2">
                  <button className="h-10 flex-1 rounded-[8px] border border-outline-variant/55 text-xs font-bold text-primary hover:bg-emerald-50" onClick={() => { setDraftDate(physicalToday); setConfirming(operationalDate !== physicalToday); }}>Kembali ke Hari Ini</button>
                  <button className="h-10 flex-1 rounded-[8px] bg-primary text-xs font-bold text-white disabled:opacity-45" disabled={!draftDate || draftDate === operationalDate} onClick={() => setConfirming(true)}>Terapkan</button>
                </div>
              </>
            ) : (
              <div>
                <div className="flex gap-3 rounded-[8px] border border-amber-200 bg-amber-50 p-3 text-amber-900"><Icon name="warning" className="shrink-0 text-lg" /><p className="text-[11px] leading-5">Jadwal, periode Finance, rekap bulanan, dan status jatuh tempo akan memakai tanggal <strong>{new Date(`${draftDate}T12:00:00`).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}</strong>. Tidak ada record yang dibuat atau diubah.</p></div>
                <div className="mt-4 flex justify-end gap-2"><button className="h-9 rounded-[7px] border border-outline-variant/55 px-4 text-xs font-bold" onClick={() => setConfirming(false)}>Batal</button><button className="h-9 rounded-[7px] bg-primary px-4 text-xs font-bold text-white" onClick={draftDate === physicalToday ? () => { onResetDate(); setPickerOpen(false); setConfirming(false); } : applyDate}>Ya, Terapkan</button></div>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}

function MetricCard({ icon, label, value, note, tone, art = tone }) {
  const styles = {
    strong: "border-[#168d64]/35 text-white shadow-[0_12px_28px_rgba(0,125,84,0.20)] hover:shadow-[0_20px_38px_rgba(0,125,84,0.28)]",
    calm: "border-[#9fd8c5] text-[#123f34] shadow-[0_12px_28px_rgba(29,145,165,0.10)] hover:shadow-[0_20px_38px_rgba(29,145,165,0.18)]",
    light: "border-[#d0e39e] text-[#263e2f] shadow-[0_12px_28px_rgba(131,169,54,0.10)] hover:shadow-[0_20px_38px_rgba(131,169,54,0.18)]",
  };
  const backgrounds = {
    students: "/assets/generated/metric-students-bg.png",
    teachers: "/assets/generated/metric-teachers-bg.png",
    classes: "/assets/generated/metric-classes-bg.png",
    strong: "/assets/generated/metric-students-bg.png",
    calm: "/assets/generated/metric-teachers-bg.png",
    light: "/assets/generated/metric-classes-bg.png",
  };
  const iconStyles = tone === "strong" ? "bg-white/95 text-[#007a52]" : "bg-white/85 text-[#00845d]";
  return (
    <section
      className={`group relative min-h-[118px] overflow-hidden rounded-[8px] border bg-cover bg-center p-4 transition duration-300 hover:-translate-y-1.5 hover:scale-[1.01] ${styles[tone]}`}
      style={{ backgroundImage: `url(${backgrounds[art]})`, backgroundPosition: "center right" }}
    >
      <div className="relative z-10 flex items-center gap-3">
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full shadow-[0_5px_14px_rgba(16,93,65,0.10)] transition duration-300 group-hover:-rotate-2 group-hover:scale-110 ${iconStyles}`}><Icon name={icon} className="text-[23px]" /></div>
        <div className="min-w-0"><p className={`text-[11px] font-bold ${tone === "strong" ? "text-white/90" : "text-[#21483f]"}`}>{label}</p><p className="mt-0.5 text-[27px] font-bold leading-none">{value}</p></div>
      </div>
      <p className={`relative z-10 mt-3 text-[10px] font-medium ${tone === "strong" ? "text-white/90" : "text-[#315b51]"}`}>{note}</p>
    </section>
  );
}

function SectionHeader({ icon, title, action, onAction }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-emerald-100/70 bg-gradient-to-r from-white/95 to-[#eff9f3]/75 px-5 py-4">
      <div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-[7px] bg-emerald-50 text-primary transition duration-300 group-hover:bg-primary group-hover:text-white group-hover:shadow-md"><Icon name={icon} className="text-lg" /></span><h2 className="text-base font-bold text-on-surface">{title}</h2></div>
      {action && <button className="inline-flex h-8 items-center gap-1.5 rounded-[7px] border border-transparent bg-[#edf8f1] px-3 text-[10px] font-bold text-primary transition duration-200 hover:-translate-y-0.5 hover:border-emerald-200 hover:bg-white hover:shadow-sm" onClick={onAction}>{action}<Icon name="arrow_forward" className="text-sm transition group-hover:translate-x-0.5" /></button>}
    </div>
  );
}

function SchedulePanel({ sessions, classMap, onNavigate, operationalDate, title = "Jadwal Hari Ini" }) {
  const now = new Date().toTimeString().slice(0, 5);
  return (
    <section className={panelClass}>
      <SectionHeader icon="calendar_month" title={title} action="Lihat semua" onAction={() => onNavigate("course")} />
      {sessions.length ? (
        <div className="divide-y divide-emerald-100/60 px-4 py-1">
          {sessions.slice(0, 5).map((schedule, index) => {
            const classGroup = classMap.get(schedule.classId);
            const ongoing = schedule.date === operationalDate && schedule.startTime <= now && now <= schedule.endTime;
            return (
              <button key={schedule.id} className="group/row grid w-full grid-cols-[5px_minmax(0,1fr)_auto] items-center gap-3 rounded-[7px] px-2 py-3 text-left transition duration-200 hover:bg-[#f0faf4] hover:shadow-[0_6px_16px_rgba(25,94,62,0.08)]" onClick={() => onNavigate("course")}>
                <span className={`h-11 rounded-full transition duration-200 group-hover/row:h-12 group-hover/row:shadow-sm ${sessionAccent[index % sessionAccent.length]}`} />
                <span className="min-w-0"><strong className="block truncate text-xs text-on-surface">{schedule.subject} - {schedule.className}</strong><span className="mt-1 block truncate text-[10px] text-on-surface-variant">{schedule.room} · {schedule.teacher} · {classGroup?.members.length || 0} siswa</span></span>
                <span className="text-right"><strong className="block text-[11px] text-on-surface">{schedule.startTime} - {schedule.endTime}</strong><span className={`mt-1 inline-flex rounded-full px-2 py-1 text-[9px] font-bold ${ongoing ? "bg-emerald-100 text-emerald-800" : "bg-surface-container text-on-surface-variant"}`}>{ongoing ? "Berlangsung" : "Terjadwal"}</span></span>
              </button>
            );
          })}
        </div>
      ) : <div className="px-5 py-12 text-center"><Icon name="event_busy" className="mx-auto text-2xl text-primary/45" /><p className="mt-3 text-xs font-semibold text-on-surface-variant">Tidak ada sesi yang dijadwalkan hari ini.</p></div>}
    </section>
  );
}

function AttendancePanel({ attendance, totalStudents, totalClasses }) {
  const nonPresent = Math.max(attendance.total - attendance.present, 0);
  const presentShare = attendance.rate;
  const permitShare = attendance.total ? Math.round(((attendance.permit + attendance.sick) / attendance.total) * 100) : 0;
  const absentShare = attendance.total ? Math.round((attendance.absent / attendance.total) * 100) : 0;
  return (
    <section className={panelClass}>
      <SectionHeader icon="groups" title="Kehadiran Bulan Ini" />
      <div className="grid items-center gap-5 px-5 py-6 sm:grid-cols-[180px_minmax(0,1fr)]">
        <div className="relative mx-auto flex h-40 w-40 items-center justify-center rounded-full shadow-[0_12px_28px_rgba(0,135,90,0.18)] transition duration-300 group-hover:scale-[1.03] group-hover:shadow-[0_18px_36px_rgba(0,135,90,0.24)]" style={{ background: `conic-gradient(#00875a 0 ${presentShare}%, #9fbe68 ${presentShare}% ${Math.min(presentShare + permitShare, 100)}%, #667085 ${Math.min(presentShare + permitShare, 100)}% 100%)` }}>
          <div className="flex h-[116px] w-[116px] flex-col items-center justify-center rounded-full bg-white"><strong className="text-[30px] text-on-surface">{attendance.rate}%</strong><span className="text-xs text-on-surface-variant">Hadir</span></div>
        </div>
        <div className="space-y-4 text-xs">
          <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2"><i className="h-3 w-3 rounded-full bg-[#00875a]" />Hadir</span><strong>{number.format(attendance.present)} <span className="font-medium text-on-surface-variant">({attendance.rate}%)</span></strong></div>
          <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2"><i className="h-3 w-3 rounded-full bg-[#9fbe68]" />Izin + sakit</span><strong>{number.format(attendance.permit + attendance.sick)} <span className="font-medium text-on-surface-variant">({permitShare}%)</span></strong></div>
          <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2"><i className="h-3 w-3 rounded-full bg-[#667085]" />Alfa</span><strong>{number.format(attendance.absent)} <span className="font-medium text-on-surface-variant">({absentShare}%)</span></strong></div>
          <p className="border-t border-emerald-100 pt-3 text-[10px] text-on-surface-variant">{number.format(nonPresent)} catatan tidak hadir dari {number.format(attendance.total)} record sesi.</p>
        </div>
      </div>
      <div className="grid grid-cols-2 border-t border-emerald-100/70 bg-gradient-to-r from-white/65 to-emerald-50/65 px-5 py-3 text-xs"><div><p className="text-[10px] text-on-surface-variant">Total Siswa</p><strong className="mt-1 block">{number.format(totalStudents)}</strong></div><div className="border-l border-emerald-100 pl-5 text-right"><p className="text-[10px] text-on-surface-variant">Total Rombel</p><strong className="mt-1 block">{number.format(totalClasses)}</strong></div></div>
    </section>
  );
}

function FinanceSummary({ finance, period, operationalDate, onNavigate }) {
  const activeMonth = operationalDate.slice(0, 7);
  const periodName = billingMonthLabel.format(new Date(`${period?.month || activeMonth}-01T12:00:00`));
  if (!period) {
    return (
      <section className={`${panelClass} bg-gradient-to-r from-white/95 to-[#e9f8f1]/95`}>
        <div className="flex items-center justify-between gap-4 border-b border-emerald-100 px-5 py-4"><div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-full border border-emerald-200 bg-white text-primary"><Icon name="payments" className="text-lg" /></span><div><h2 className="text-sm font-bold">Ringkasan Keuangan Bulan Ini</h2><p className="mt-0.5 text-[9px] font-semibold text-primary">{periodName}</p></div></div><button className="inline-flex h-8 items-center gap-2 rounded-[7px] border border-emerald-200 bg-white px-3 text-[10px] font-bold text-primary" onClick={() => onNavigate("finance")}>Buka Finance <Icon name="arrow_forward" className="text-sm" /></button></div>
        <div className="flex flex-col items-center justify-center px-5 py-9 text-center"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-primary"><Icon name="event_busy" /></span><p className="mt-3 text-sm font-bold">Periode {periodName} belum dibuat</p><p className="mt-1 max-w-lg text-xs leading-5 text-on-surface-variant">Pergantian tanggal tidak membuat tagihan secara otomatis. Buat periode dari halaman Finance saat sudah siap.</p></div>
      </section>
    );
  }
  const paidRate = finance?.invoiceCount ? Math.round((finance.paidInvoiceCount / finance.invoiceCount) * 100) : 0;
  const metrics = [
    { label: "Total Tagihan", value: finance?.totalBilled || 0, change: `${finance?.invoiceCount || 0} tagihan siswa`, icon: "receipt_long" },
    { label: "Sudah Dibayar", value: finance?.totalPaid || 0, change: `${paidRate}% tagihan lunas`, icon: "task_alt" },
    { label: "Sisa Tagihan", value: finance?.outstanding || 0, change: `${finance?.overdue?.length || 0} perlu ditindaklanjuti`, icon: "account_balance_wallet" },
  ];
  return (
    <section className={`${panelClass} relative bg-gradient-to-r from-white/95 via-[#f9fdfb]/95 to-[#e9f8f1]/95`}>
      <div className="relative z-10 flex items-center justify-between gap-4 px-5 pb-3 pt-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-emerald-200 bg-white text-primary shadow-sm"><Icon name="payments" className="text-lg" /></span>
          <div className="min-w-0"><h2 className="truncate text-sm font-bold text-on-surface">Ringkasan Keuangan Bulan Ini</h2><p className="mt-0.5 text-[9px] font-semibold text-primary">{periodName}</p></div>
        </div>
        <button className="inline-flex h-8 shrink-0 items-center gap-2 rounded-[7px] border border-emerald-100 bg-white/85 px-3 text-[10px] font-bold text-primary shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md" onClick={() => onNavigate("finance")}>Lihat detail <Icon name="arrow_forward" className="text-sm" /></button>
      </div>

      <div className="relative z-10 grid gap-4 px-4 pb-5 xl:grid-cols-[minmax(0,1fr)_minmax(470px,0.92fr)]">
        <div className="grid gap-3 sm:grid-cols-3">
          {metrics.map((metric) => (
            <div key={metric.label} className="group/metric min-h-[126px] min-w-0 rounded-[7px] border-2 border-emerald-100 bg-white/95 px-4 py-4 shadow-[0_7px_18px_rgba(28,91,64,0.10)] transition duration-200 hover:-translate-y-1 hover:border-emerald-300 hover:bg-white hover:shadow-[0_12px_28px_rgba(28,91,64,0.16)]">
              <div className="flex items-center justify-between gap-2"><p className="text-[10px] font-semibold text-on-surface-variant">{metric.label}</p><span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-50 text-emerald-700"><Icon name={metric.icon} className="text-[17px] transition group-hover/metric:scale-110" /></span></div>
              <strong className="mt-2 block truncate text-lg text-on-surface">{rupiah.format(metric.value)}</strong>
              <p className="mt-2 flex items-center gap-1 text-[10px] font-bold text-primary"><Icon name="trending_up" className="text-sm" />{metric.change}</p>
            </div>
          ))}
        </div>

        <div className="rounded-[7px] border-2 border-emerald-200 bg-gradient-to-r from-[#f8fcf9] to-[#e4f5ed] px-4 py-3 shadow-[0_7px_18px_rgba(28,91,64,0.09)] transition duration-200 hover:border-emerald-300 hover:shadow-[0_12px_28px_rgba(25,105,70,0.14)]">
          <div className="mb-3 flex items-center gap-2 text-xs font-bold text-on-surface"><Icon name="fact_check" className="text-xl text-primary" />Status Pembayaran</div>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="flex min-h-[78px] min-w-0 items-center gap-2 rounded-[7px] border-2 border-emerald-100 bg-white/95 px-3 py-2 shadow-sm"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-primary shadow-sm"><Icon name="verified_user" className="text-xl" /></span><div className="min-w-0"><p className="truncate text-[9px] font-semibold text-on-surface-variant">Menunggu Verifikasi</p><strong className="text-lg leading-none">{finance?.pendingCount || 0}</strong><p className="mt-1 truncate text-[9px] text-on-surface-variant">transaksi</p></div></div>
            <div className="flex min-h-[78px] min-w-0 items-center gap-2 rounded-[7px] border-2 border-emerald-100 bg-white/95 px-3 py-2 shadow-sm"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#dcf5e7] text-primary shadow-sm"><Icon name="pie_chart" className="text-xl" /></span><div className="min-w-0"><p className="truncate text-[9px] font-semibold text-on-surface-variant">Tagihan Lunas</p><strong className="text-lg leading-none">{paidRate}%</strong><p className="mt-1 truncate text-[9px] text-on-surface-variant">dari total invoice</p></div></div>
            <div className="flex min-h-[78px] min-w-0 items-center gap-2 rounded-[7px] border-2 border-emerald-100 bg-white/95 px-3 py-2 shadow-sm"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-primary shadow-sm"><Icon name="event_busy" className="text-xl" /></span><div className="min-w-0"><p className="truncate text-[9px] font-semibold text-on-surface-variant">Jatuh Tempo</p><strong className="text-lg leading-none">{finance?.overdue?.length || 0}</strong><p className="mt-1 truncate text-[9px] text-on-surface-variant">tagihan siswa</p></div></div>
          </div>
        </div>
      </div>
    </section>
  );
}

function AdminDashboard({ onNavigate, operational }) {
  const data = dashboardData(operational.date);
  const slotCount = new Set(data.todaySessions.map((session) => `${session.startTime}-${session.endTime}`)).size;
  return (
    <div className="space-y-5">
      <DashboardHeader name="Super Admin" description="Pantau operasional Rombel, pengajar, jadwal, kehadiran, dan keuangan dalam satu tempat." role="admin" operationalDate={operational.date} physicalToday={operational.physicalToday} isOverridden={operational.isOverridden} onChangeDate={operational.setDate} onResetDate={operational.resetDate} />
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard icon="groups" label="Total Siswa" value={number.format(data.totalStudents)} note={`${data.classes.length} Rombel aktif dan tersinkron`} tone="strong" art="students" />
        <MetricCard icon="record_voice_over" label="Total Pengajar" value={number.format(courseTeachers.length)} note="Pengajar tersedia pada master Course" tone="calm" art="teachers" />
        <MetricCard icon="school" label="Total Kelas" value={number.format(data.classes.length)} note={`${data.todaySessions.length} kelas dalam ${slotCount} slot hari ini`} tone="light" art="classes" />
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.08fr)_minmax(380px,0.92fr)]">
        <SchedulePanel sessions={data.todaySessions} classMap={data.classMap} onNavigate={onNavigate} operationalDate={operational.date} />
        <AttendancePanel attendance={data.attendance} totalStudents={data.totalStudents} totalClasses={data.classes.length} />
      </div>
      <FinanceSummary finance={data.finance} period={data.activePeriod} operationalDate={operational.date} onNavigate={onNavigate} />
    </div>
  );
}

function TeacherDashboard({ onNavigate, operational }) {
  const data = dashboardData(operational.date);
  const teacherId = "teacher-topan";
  const teachingToday = data.todaySessions.filter((session) => session.teacherId === teacherId);
  const fallbackSession = [...data.sessions]
    .filter((session) => session.teacherId === teacherId)
    .sort((left, right) => left.date.localeCompare(right.date))
    .find((session) => session.date >= operational.date) || data.sessions.find((session) => session.teacherId === teacherId);
  const displayedSessions = teachingToday.length ? teachingToday : fallbackSession ? [fallbackSession] : [];
  return (
    <div className="space-y-5">
      <DashboardHeader name="Mas Topan" description="Pantau jadwal mengajar, Rombel, dan catatan kehadiran siswa hari ini." role="teacher" operationalDate={operational.date} physicalToday={operational.physicalToday} isOverridden={operational.isOverridden} onChangeDate={operational.setDate} onResetDate={operational.resetDate} />
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard icon="event" label="Sesi Mengajar" value={number.format(teachingToday.length)} note="Sesi yang ditugaskan hari ini" tone="strong" art="teachers" />
        <MetricCard icon="school" label="Rombel Aktif" value={number.format(data.classes.length)} note="Tersedia pada master Rombel" tone="calm" art="classes" />
        <MetricCard icon="groups" label="Siswa Terdaftar" value={number.format(data.totalStudents)} note="Seluruh anggota aktif" tone="light" art="students" />
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.08fr)_minmax(380px,0.92fr)]">
        <SchedulePanel sessions={displayedSessions} classMap={data.classMap} onNavigate={onNavigate} operationalDate={operational.date} title={teachingToday.length ? "Jadwal Mengajar Hari Ini" : "Jadwal Mengajar Terdekat"} />
        <AttendancePanel attendance={data.attendance} totalStudents={data.totalStudents} totalClasses={data.classes.length} />
      </div>
    </div>
  );
}

export default function Dashboard({ role, onNavigate }) {
  useDataRevision(["roster", "schedule", "finance", "attendance", "session"]);
  const operational = useOperationalDate();
  return role === "admin" ? <AdminDashboard onNavigate={onNavigate} operational={operational} /> : <TeacherDashboard onNavigate={onNavigate} operational={operational} />;
}
