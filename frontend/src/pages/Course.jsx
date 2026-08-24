import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Icon, PageHeader } from "../components/ui.jsx";
import {
  addDays,
  courseTeachers,
  loadCourseClasses,
  loadCourseSessions,
  loadCourseSubjects,
  saveCourseClasses,
  saveCourseSessions,
  saveCourseSubjects,
  startOfWeek,
  toISODate,
} from "../datadummy.js";
import { getSessionDetail } from "../services/sessionService.js";
import useDataRevision from "../hooks/useDataRevision.js";
import useOperationalDate from "../hooks/useOperationalDate.js";

const toneClass = {
  blue: { border: "border-blue-200 border-t-blue-600", card: "bg-gradient-to-br from-blue-50 to-white", badge: "bg-blue-600 text-white" },
  green: { border: "border-green-200 border-t-green-600", card: "bg-gradient-to-br from-green-50 to-white", badge: "bg-green-600 text-white" },
  red: { border: "border-red-200 border-t-red-600", card: "bg-gradient-to-br from-red-50 to-white", badge: "bg-red-600 text-white" },
  purple: { border: "border-purple-200 border-t-purple-600", card: "bg-gradient-to-br from-purple-50 to-white", badge: "bg-purple-600 text-white" },
  orange: { border: "border-orange-200 border-t-orange-600", card: "bg-gradient-to-br from-orange-50 to-white", badge: "bg-orange-600 text-white" },
  teal: { border: "border-teal-200 border-t-teal-600", card: "bg-gradient-to-br from-teal-50 to-white", badge: "bg-teal-600 text-white" },
  amber: { border: "border-amber-200 border-t-amber-500", card: "bg-gradient-to-br from-amber-50 to-white", badge: "bg-amber-500 text-white" },
};

const subjectTone = {
  Matematika: "blue",
  Fisika: "orange",
  Kimia: "red",
  "B. Inggris": "purple",
  Biologi: "green",
  IPA: "teal",
  "B. Indonesia": "amber",
};

const dateFormatter = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" });
const dayFormatter = new Intl.DateTimeFormat("id-ID", { weekday: "long" });
const shortMonthFormatter = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" });

function parseDate(value) {
  return value instanceof Date ? new Date(value) : new Date(`${value}T12:00:00`);
}

function formatTime(value) {
  return value.replace(":", ".");
}

function durationLabel(startTime, endTime) {
  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [endHour, endMinute] = endTime.split(":").map(Number);
  const minutes = endHour * 60 + endMinute - (startHour * 60 + startMinute);
  if (minutes <= 0) return "-";
  if (minutes % 60 === 0) return `${minutes / 60} jam`;
  if (minutes > 60) return `${Math.floor(minutes / 60)} jam ${minutes % 60} menit`;
  return `${minutes} menit`;
}

function recurrenceLabel(session) {
  if (session.recurrence === "Tidak berulang" || !session.repeatWeeks) return "Tidak berulang";
  const current = Number(session.occurrenceIndex || 0) + 1;
  return `Batch ${session.repeatWeeks} minggu - Pertemuan ke-${current}`;
}

function makeFutureOccurrences(record, count = 5) {
  const seriesId = record.seriesId || `series-${Date.now()}`;
  const startIndex = Number(record.occurrenceIndex || 0);
  return Array.from({ length: count }, (_, offset) => {
    const occurrenceIndex = startIndex + offset + 1;
    return {
      ...record,
      id: `${seriesId}-occurrence-${occurrenceIndex}`,
      seriesId,
      occurrenceIndex,
      repeatWeeks: count,
      date: toISODate(addDays(record.date, (offset + 1) * 7)),
    };
  });
}

function weekLabel(selectedDate) {
  const start = startOfWeek(selectedDate);
  const end = addDays(start, 6);
  const sameMonth = start.getMonth() === end.getMonth();
  return sameMonth
    ? `${start.getDate()} - ${end.getDate()} ${shortMonthFormatter.format(end)}`
    : `${start.getDate()} ${start.toLocaleDateString("id-ID", { month: "short" })} - ${dateFormatter.format(end)}`;
}

function makeEditorRecord(date, classes, subjects) {
  const defaultSubject = subjects[0] || { name: "Matematika", tone: "blue" };
  const defaultClass = classes[0] || { id: "", name: "" };
  return {
    id: "",
    date,
    subject: defaultSubject.name,
    classId: defaultClass.id,
    className: defaultClass.name,
    startTime: "13:00",
    endTime: "14:00",
    teacherId: courseTeachers[0].id,
    teacher: courseTeachers[0].name,
    room: "R. Anggrek",
    tone: defaultSubject.tone,
    recurrence: "5 minggu ke depan",
    repeatWeeks: 5,
    occurrenceIndex: 0,
    conflict: false,
  };
}

function groupTimeSlots(sessions) {
  const slots = new Map();
  sessions.forEach((session) => {
    const key = `${session.startTime}-${session.endTime}`;
    if (!slots.has(key)) {
      slots.set(key, { id: key, startTime: session.startTime, endTime: session.endTime, classes: [] });
    }
    slots.get(key).classes.push(session);
  });
  return [...slots.values()].sort((a, b) => a.startTime.localeCompare(b.startTime));
}

function tone(name) {
  return toneClass[name] || toneClass.blue;
}

function Toolbar({ selectedDate, viewMode, onMoveDate, onToday, onSelectDate, onViewMode, filters, onFilter, filterOptions, arrangeMode, hasArrangementChanges, onStartArrange, onCancelArrange, onSaveArrange, onGenerateBatch }) {
  const hasFilter = filters.teacherId || filters.room || filters.subject;
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [batchPickerOpen, setBatchPickerOpen] = useState(false);
  const [batchUntilDate, setBatchUntilDate] = useState(() => toISODate(addDays(startOfWeek(selectedDate), 41)));
  const minimumBatchDate = toISODate(addDays(startOfWeek(selectedDate), 13));
  const maximumBatchDate = toISODate(addDays(startOfWeek(selectedDate), 90));
  const batchWeeks = Math.max(0, Math.ceil((parseDate(batchUntilDate) - addDays(startOfWeek(selectedDate), 6)) / (7 * 24 * 60 * 60 * 1000)));

  useEffect(() => {
    if (!batchPickerOpen) setBatchUntilDate(toISODate(addDays(startOfWeek(selectedDate), 41)));
  }, [selectedDate, batchPickerOpen]);

  return (
    <div className="border-y border-outline-variant/40 bg-white px-5 py-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="relative shrink-0">
          <div className="flex h-12 items-center rounded-[8px] border border-outline-variant/60 bg-white">
            <button className="flex h-full w-11 items-center justify-center text-on-surface transition hover:bg-surface-container-low" onClick={() => onMoveDate(-1)} aria-label={viewMode === "week" ? "Minggu sebelumnya" : "Hari sebelumnya"}>
              <Icon name="chevron_left" />
            </button>
            <button className="flex h-full min-w-0 items-center gap-3 border-x border-outline-variant/40 px-4 text-sm font-bold text-on-surface transition hover:bg-surface-container-low sm:min-w-[218px]" onClick={() => { setDatePickerOpen((open) => !open); setBatchPickerOpen(false); }} aria-expanded={datePickerOpen}>
              <Icon name="calendar_month" className="text-primary" />
              {viewMode === "week" ? weekLabel(selectedDate) : dateFormatter.format(parseDate(selectedDate))}
            </button>
            <button className="flex h-full w-11 items-center justify-center text-on-surface transition hover:bg-surface-container-low" onClick={() => onMoveDate(1)} aria-label={viewMode === "week" ? "Minggu berikutnya" : "Hari berikutnya"}>
              <Icon name="chevron_right" />
            </button>
          </div>
          {datePickerOpen && (
            <div className="absolute left-11 top-[calc(100%+8px)] z-[55] w-[250px] rounded-[8px] border border-outline-variant/50 bg-white p-4 shadow-lift">
              <label className="block text-xs font-bold text-on-surface-variant">
                Pilih tanggal jadwal
                <input className="mt-2 h-11 w-full rounded-[7px] border border-outline-variant/60 px-3 text-sm outline-none focus:border-primary" type="date" value={selectedDate} onChange={(event) => { onSelectDate(event.target.value); setDatePickerOpen(false); }} />
              </label>
              <button className="mt-3 w-full rounded-[7px] bg-surface-container-low px-3 py-2.5 text-xs font-bold text-primary" onClick={() => { onToday(); setDatePickerOpen(false); }}>Tanggal operasional</button>
            </div>
          )}
        </div>

        <div className="flex h-12 shrink-0 items-center rounded-[8px] border border-outline-variant/60 bg-white p-1">
          <ViewModeButton active={viewMode === "week"} icon="format_list_bulleted" label="Tampilan Mingguan" onClick={() => onViewMode("week")} />
          <ViewModeButton active={viewMode === "day"} icon="calendar_today" label="Tampilan Harian" onClick={() => onViewMode("day")} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect icon="person" label="Teacher" value={filters.teacherId} options={filterOptions.teachers} onChange={(value) => onFilter("teacherId", value)} />
          <FilterSelect icon="meeting_room" label="Room" value={filters.room} options={filterOptions.rooms} onChange={(value) => onFilter("room", value)} />
          <FilterSelect icon="menu_book" label="Subject" value={filters.subject} options={filterOptions.subjects} onChange={(value) => onFilter("subject", value)} />
          {arrangeMode ? (
            <>
              <button className="flex h-12 items-center gap-2 rounded-[8px] border border-outline-variant/60 bg-white px-3 text-sm font-bold text-on-surface transition hover:bg-surface-container-low" onClick={onCancelArrange}>
                <Icon name="close" className="text-base" /> Batal
              </button>
              <button className="flex h-12 items-center gap-2 rounded-[8px] bg-primary px-3 text-sm font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45" disabled={!hasArrangementChanges} onClick={onSaveArrange}>
                <Icon name="save" className="text-base" /> Simpan
              </button>
            </>
          ) : (
            <button className="flex h-12 items-center gap-2 rounded-[8px] border border-primary/50 bg-emerald-50 px-3 text-sm font-bold text-primary transition hover:bg-emerald-100" onClick={onStartArrange}>
              <Icon name="drag_indicator" className="text-base" /> Atur Sesi
            </button>
          )}
          {hasFilter && (
            <button className="flex h-12 items-center gap-2 rounded-[8px] px-3 text-sm font-bold text-primary transition hover:bg-secondary-container/30" onClick={() => onFilter("reset", "")}>
              <Icon name="sync" /> Reset
            </button>
          )}
          <div className="hidden h-10 w-px bg-outline-variant/40 lg:block" />
          <div className="relative">
            <button className="flex h-12 items-center gap-2 rounded-[8px] border border-[#00726E]/35 bg-[#e6f2ef] px-3 text-sm font-bold text-[#00646F] transition hover:bg-[#d9ebe7] disabled:cursor-not-allowed disabled:opacity-45" disabled={arrangeMode} onClick={() => { setBatchPickerOpen((open) => !open); setDatePickerOpen(false); }} aria-expanded={batchPickerOpen}>
              <Icon name="sync" className="text-base" /> Generate Batch <Icon name="expand_more" className="text-base" />
            </button>
            {batchPickerOpen && !arrangeMode && (
              <div className="absolute right-0 top-[calc(100%+8px)] z-[55] w-[280px] rounded-[8px] border border-outline-variant/50 bg-white p-4 shadow-lift">
                <p className="text-sm font-bold text-on-surface">Pengulangan jadwal</p>
                <p className="mt-1 text-xs leading-5 text-on-surface-variant">Jadwal minggu {weekLabel(selectedDate)} akan diulang sampai tanggal yang dipilih.</p>
                <label className="mt-4 block text-xs font-bold text-on-surface-variant">
                  Ulangi sampai
                  <input className="mt-2 h-11 w-full rounded-[7px] border border-outline-variant/60 px-3 text-sm outline-none focus:border-primary" type="date" min={minimumBatchDate} max={maximumBatchDate} value={batchUntilDate} onChange={(event) => setBatchUntilDate(event.target.value)} />
                </label>
                <div className="mt-3 flex items-center justify-between rounded-[7px] bg-surface-container-low px-3 py-2 text-xs">
                  <span className="text-on-surface-variant">Cakupan</span>
                  <span className="font-bold text-primary">{batchWeeks} minggu</span>
                </div>
                <button className="mt-3 flex w-full items-center justify-center gap-2 rounded-[7px] bg-primary px-3 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-45" disabled={batchWeeks < 1} onClick={() => { onGenerateBatch(batchUntilDate); setBatchPickerOpen(false); }}>
                  <Icon name="sync" className="text-base" /> Generate Batch
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ViewModeButton({ active, icon, label, onClick }) {
  return (
    <button className={`group relative flex h-10 w-12 items-center justify-center rounded-[6px] transition ${active ? "bg-primary text-white shadow-sm" : "text-on-surface-variant hover:bg-surface-container-low"}`} onClick={onClick} aria-label={label}>
      <Icon name={icon} />
      <span className="pointer-events-none absolute left-1/2 top-[calc(100%+8px)] z-[60] -translate-x-1/2 whitespace-nowrap rounded-[6px] bg-inverse-surface px-2.5 py-1.5 text-[10px] font-semibold text-inverse-on-surface opacity-0 shadow-md transition group-hover:opacity-100 group-focus-visible:opacity-100">{label}</span>
    </button>
  );
}

function FilterSelect({ icon, label, value, options, onChange }) {
  return (
    <label className="relative flex h-12 items-center gap-2 rounded-[8px] border border-outline-variant/60 bg-white pl-4 pr-2 text-sm font-semibold text-on-surface-variant transition focus-within:border-primary/60 hover:bg-surface-container-low">
      <Icon name={icon} />
      <select className="h-full min-w-[92px] appearance-none bg-transparent pr-7 outline-none" value={value} onChange={(event) => onChange(event.target.value)} aria-label={`Filter ${label}`}>
        <option value="">{label}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      <Icon name="expand_more" className="pointer-events-none absolute right-2 text-base" />
    </label>
  );
}

function DayBlock({ day, compact, selectedId, arrangeMode, draggedSessionId, onAdd, onSelect, onDragStart, onDragEnd, onDropSession }) {
  return (
    <section className="grid grid-cols-[72px_minmax(0,1fr)] gap-4">
      <div>
        <div className="flex h-[82px] w-[72px] flex-col items-center justify-center rounded-[8px] bg-gradient-to-br from-emerald-600 via-teal-600 to-emerald-800 text-white shadow-[0_8px_20px_rgba(0,106,59,0.18)]">
          <span className="text-[10px] font-bold uppercase">{day.day}</span>
          <span className="my-1 text-[26px] font-bold leading-none">{day.number}</span>
          <span className="text-[9px] font-semibold capitalize text-white/85">{day.month}</span>
        </div>
      </div>

      <div>
        <div className="mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
          <div className="h-px bg-outline-variant/50" />
          <div className="flex flex-wrap justify-end gap-1">
            <button className="flex items-center gap-2 rounded-[6px] px-2 py-2 text-sm font-bold text-primary transition hover:bg-secondary-container/40" onClick={() => onAdd(day.isoDate)}>
              <Icon name="add" className="text-lg" /> Tambah Jadwal
            </button>
          </div>
        </div>

        {day.slots.length > 0 ? (
          <div className="space-y-3">
            {day.slots.map((slot) => (
              <TimeSlotCard
                key={slot.id}
                slot={slot}
                date={day.isoDate}
                compact={compact}
                selectedId={selectedId}
                arrangeMode={arrangeMode}
                draggedSessionId={draggedSessionId}
                onSelect={onSelect}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onDropSession={onDropSession}
              />
            ))}
          </div>
        ) : (
          <EmptyDay
            date={day.isoDate}
            arrangeMode={arrangeMode}
            draggedSessionId={draggedSessionId}
            onAdd={() => onAdd(day.isoDate)}
            onDropSession={onDropSession}
          />
        )}
      </div>
    </section>
  );
}

function TimeSlotCard({ slot, date, compact, selectedId, arrangeMode, draggedSessionId, onSelect, onDragStart, onDragEnd, onDropSession }) {
  const columnClass = compact
    ? "sm:grid-cols-2"
    : slot.classes.length === 2
      ? "sm:grid-cols-2"
      : slot.classes.length === 3
        ? "sm:grid-cols-2 xl:grid-cols-3"
        : "sm:grid-cols-2 2xl:grid-cols-4";

  return (
    <article
      className={`overflow-hidden rounded-[8px] border bg-[#fbfdfc] shadow-[0_4px_14px_rgba(24,29,25,0.07)] transition ${arrangeMode ? "border-dashed border-[#00726E]/60" : "border-emerald-200/80"}`}
      onDragOver={(event) => {
        if (!arrangeMode) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        event.currentTarget.classList.add("ring-2", "ring-[#00726E]/35");
      }}
      onDragLeave={(event) => event.currentTarget.classList.remove("ring-2", "ring-[#00726E]/35")}
      onDrop={(event) => {
        if (!arrangeMode) return;
        event.preventDefault();
        event.currentTarget.classList.remove("ring-2", "ring-[#00726E]/35");
        const sessionId = event.dataTransfer.getData("text/session-id") || draggedSessionId;
        if (sessionId) onDropSession(sessionId, date, slot.startTime, slot.endTime);
      }}
    >
      <header
        className="flex flex-wrap items-center justify-between gap-3 border-b border-[#8fbfba] px-4 py-3 text-[#173f3b]"
        style={{ backgroundImage: "linear-gradient(100deg, #B8DDC7 0%, #A8D5C8 28%, #9BCBCD 52%, #92BEC7 76%, #9FAFBA 100%)" }}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-[7px] border border-white/60 bg-white/55 text-[#00646F] shadow-sm"><Icon name="schedule" /></div>
          <div>
            <p className="text-sm font-bold text-[#173f3b]">{slot.startTime} - {slot.endTime}</p>
            <p className="mt-0.5 text-[11px] text-[#345d59]">{durationLabel(slot.startTime, slot.endTime)}</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-[#00646F]/25 bg-white/55 px-3 py-1.5 text-xs font-bold text-[#174f4c]"><Icon name="groups" className="text-base" /> {slot.classes.length} kelas paralel</span>
      </header>

      <div className={`grid gap-2 p-3 ${columnClass}`}>
        {slot.classes.map((session) => {
          const style = tone(subjectTone[session.subject] || session.tone);
          const selected = selectedId === session.id;
          return (
            <button
              key={session.id}
              draggable={arrangeMode}
              className={`relative min-w-0 overflow-hidden rounded-[7px] border border-t-4 text-left transition duration-200 hover:-translate-y-0.5 hover:shadow-md ${style.border} ${style.card} ${selected ? "ring-2 ring-primary ring-offset-2" : ""} ${session.conflict ? "border-red-400 bg-red-50" : ""} ${arrangeMode ? "cursor-grab active:cursor-grabbing" : ""} ${draggedSessionId === session.id ? "opacity-45" : ""}`}
              onClick={() => onSelect(session)}
              onDragStart={(event) => {
                if (!arrangeMode) return;
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/session-id", session.id);
                onDragStart(session.id);
              }}
              onDragEnd={onDragEnd}
            >
              <div className="flex min-h-10 items-center justify-between gap-2 px-3 py-2">
                <span className={`inline-flex max-w-[calc(100%-2rem)] items-center truncate rounded-full px-3 py-1.5 text-xs font-bold leading-none ${style.badge}`} title={session.subject}>{session.subject}</span>
                <Icon name={session.conflict ? "warning" : "more_vert"} className={session.conflict ? "text-red-600" : "text-outline"} />
              </div>
              <div className="grid min-h-12 grid-cols-[minmax(100px,1fr)_auto_auto] items-center gap-2 px-3 py-2.5">
                <h3 className="min-w-0 truncate text-[13px] font-bold text-on-surface" title={session.className}>{session.className}</h3>
                <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-on-surface-variant"><Icon name="person" className="text-base" /><span className="max-w-20 truncate">{session.teacher}</span></div>
                <div className={`flex min-w-0 items-center gap-1.5 border-l border-outline-variant/60 pl-2 text-[11px] ${session.conflict ? "text-red-600" : "text-on-surface-variant"}`}><Icon name="meeting_room" className="text-base" /><span className="max-w-20 truncate">{session.room}</span></div>
              </div>
            </button>
          );
        })}
      </div>
    </article>
  );
}

function EmptyDay({ date, arrangeMode, draggedSessionId, onAdd, onDropSession }) {
  return (
    <div
      className={`flex min-h-[150px] flex-col items-center justify-center rounded-[8px] border border-dashed bg-white text-center transition ${arrangeMode ? "border-[#00726E]/70 bg-cyan-50/30" : "border-outline-variant/80"}`}
      onDragOver={(event) => {
        if (!arrangeMode) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        event.currentTarget.classList.add("ring-2", "ring-[#00726E]/35");
      }}
      onDragLeave={(event) => event.currentTarget.classList.remove("ring-2", "ring-[#00726E]/35")}
      onDrop={(event) => {
        if (!arrangeMode) return;
        event.preventDefault();
        event.currentTarget.classList.remove("ring-2", "ring-[#00726E]/35");
        const sessionId = event.dataTransfer.getData("text/session-id") || draggedSessionId;
        if (sessionId) onDropSession(sessionId, date);
      }}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary-container/60 text-primary">
        <Icon name="event_busy" />
      </div>
      <p className="mt-4 text-sm font-semibold text-on-surface">Tidak ada jadwal KBM hari ini</p>
      {arrangeMode ? (
        <p className="mt-2 text-xs font-semibold text-[#00646F]">Siap dijadwalkan</p>
      ) : (
        <button className="mt-5 flex items-center gap-2 rounded-[8px] border border-primary px-5 py-2.5 text-sm font-bold text-primary transition hover:bg-secondary-container/30" onClick={onAdd}>
          <Icon name="add" /> Tambah Jadwal
        </button>
      )}
    </div>
  );
}

function DetailDrawer({ session, classes, onClose, onEdit, onDelete, onOpenFull, embedded = false }) {
  const style = session ? tone(subjectTone[session.subject] || session.tone) : tone("blue");
  const teacher = courseTeachers.find((item) => item.id === session?.teacherId);
  const classGroup = classes.find((item) => item.id === session?.classId);
  const [record, setRecord] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const detailRevision = useDataRevision(["roster", "schedule", "session"]);

  useEffect(() => {
    let active = true;
    setRecord(null);
    if (session?.id) {
      getSessionDetail(session.id).then((result) => {
        if (active) setRecord(result);
      }).catch(() => {
        if (active) setRecord(null);
      });
    }
    return () => { active = false; };
  }, [session?.id, detailRevision]);

  if (!session) return null;

  const attendance = record?.attendanceSummary || { present: 0, sick: 0, permit: 0, absent: 0, unset: classGroup?.totalStudents || 0 };

  return (
    <aside className={embedded ? "h-full min-w-0 overflow-y-auto border-l border-emerald-200/70 bg-[#fbfdfb]" : "fixed inset-y-0 right-0 z-50 w-full max-w-[460px] min-w-0 overflow-y-auto border-l border-emerald-200/70 bg-[#fbfdfb] shadow-lift xl:sticky xl:inset-auto xl:top-0 xl:z-auto xl:max-h-[calc(100vh-3rem)] xl:w-auto xl:max-w-none xl:self-start xl:shadow-none"}>
      <header className="relative min-h-[170px] overflow-hidden bg-[#eef8f1] bg-cover bg-center px-5 pb-8 pt-5" style={{ backgroundImage: "url('/assets/session-drawer-mint-bg.jpg')" }}>
        <div className="relative z-10 flex items-center justify-between">
          <button className="flex h-11 w-11 items-center justify-center rounded-full border border-white/80 bg-white/90 text-primary shadow-[0_8px_20px_rgba(0,75,42,0.12)] transition hover:-translate-x-0.5 hover:bg-white" onClick={onClose} aria-label="Tutup detail jadwal">
            <Icon name="chevron_left" />
          </button>
          <div className="relative">
            <button className="flex h-11 w-11 items-center justify-center rounded-full border border-white/80 bg-white/90 text-primary shadow-[0_8px_20px_rgba(0,75,42,0.12)] transition hover:bg-white" onClick={() => setMenuOpen((current) => !current)} aria-label="Opsi detail jadwal" aria-expanded={menuOpen}>
              <Icon name="more_vert" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-12 z-30 w-44 overflow-hidden rounded-[8px] border border-emerald-100 bg-white p-1 shadow-lift">
                {!embedded && <button className="flex w-full items-center gap-2 rounded-[6px] px-3 py-2.5 text-left text-xs font-bold text-primary hover:bg-emerald-50" onClick={() => { setMenuOpen(false); onEdit(); }}><Icon name="edit" className="text-base" /> Edit Jadwal</button>}
                <button className="flex w-full items-center gap-2 rounded-[6px] px-3 py-2.5 text-left text-xs font-bold text-red-600 hover:bg-red-50" onClick={() => { setMenuOpen(false); onDelete(); }}><Icon name="delete" className="text-base" /> Batalkan Sesi</button>
              </div>
            )}
          </div>
        </div>
        <div className="relative z-10 mt-7">
          <p className="text-[11px] font-bold uppercase text-primary">Detail Session</p>
          <h2 className="mt-1 text-[28px] font-bold leading-9 text-[#075c35]">Detail Jadwal</h2>
        </div>
        <div className="absolute -bottom-12 -left-[10%] h-20 w-[120%] rounded-[50%] bg-[#fbfdfb]" />
      </header>

      <div className="relative z-10 -mt-3 space-y-3 px-4 pb-5">
        <section className="px-1">
          <span className={`inline-flex rounded-[7px] px-3 py-1 text-xs font-bold ${style.badge}`}>{session.subject}</span>
          <h3 className="mt-2 text-xl font-bold leading-7 text-[#075c35]">{session.className}</h3>
        </section>

        <section className="overflow-hidden rounded-[8px] border border-emerald-200/90 bg-white/95 px-4 py-3 shadow-[0_8px_24px_rgba(0,82,45,0.06)]">
          <div className="flex items-center gap-3 border-b border-outline-variant/40 pb-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-[8px] bg-primary text-white"><Icon name="calendar_month" className="text-base" /></div>
            <h4 className="text-sm font-bold text-primary">Informasi Sesi</h4>
          </div>
          <div>
            <DetailRow icon="calendar_month" label="Tanggal" value={dateFormatter.format(parseDate(session.date))} />
            <DetailRow icon="schedule" label="Hari / Waktu" value={`${dayFormatter.format(parseDate(session.date))}, ${formatTime(session.startTime)} - ${formatTime(session.endTime)}`} />
            <DetailRow icon="pending_actions" label="Durasi" value={durationLabel(session.startTime, session.endTime)} />
            <DetailRow icon="person" label="Pengajar" value={session.teacher} />
            <DetailRow icon="meeting_room" label="Ruang Kelas" value={session.room} danger={session.conflict} />
            <DetailRow icon="groups" label="Jumlah Siswa" value={`${classGroup?.totalStudents || 0} siswa`} />
            <DetailRow icon="sync" label="Pengulangan" value={recurrenceLabel(session)} last />
          </div>
        </section>

        <section className="relative overflow-hidden rounded-[8px] border border-emerald-200/90 bg-white p-4 shadow-[0_8px_24px_rgba(0,82,45,0.06)]">
          <div className="pointer-events-none absolute inset-0 bg-cover bg-right opacity-20" style={{ backgroundImage: "url('/assets/session-drawer-mint-bg.jpg')" }} />
          <div className="relative flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-container text-base font-bold text-white shadow-sm">{teacher?.initials || "-"}</div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-bold text-on-surface">{teacher?.name || session.teacher}</p>
              <p className="mt-1 truncate text-xs text-on-surface-variant">{teacher?.title || "Pengajar"} - {teacher?.subject || session.subject}</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-primary"><Icon name="school" /></div>
          </div>
        </section>

        <section className="rounded-[8px] border border-emerald-200/90 bg-white p-4 shadow-[0_8px_24px_rgba(0,82,45,0.06)]">
          <div className="flex items-start justify-between gap-3">
            <div><h4 className="text-sm font-bold text-primary">Rekap Absensi</h4><p className="mt-1 text-xs text-on-surface-variant">{record?.attendanceInitialized ? "Record sesi saat ini" : "Sesi belum dimulai"}</p></div>
            {attendance.unset > 0 && <span className="rounded-full bg-surface-container px-2.5 py-1 text-[10px] font-bold text-on-surface-variant">{attendance.unset} kosong</span>}
          </div>
          <div className="mt-4 grid grid-cols-3 divide-x divide-outline-variant/50 text-center">
            <AttendanceStat icon="check_circle" value={attendance.present} label="Hadir" tone="success" />
            <AttendanceStat icon="pending_actions" value={attendance.sick + attendance.permit} label="Sakit + Izin" tone="warning" />
            <AttendanceStat icon="warning" value={attendance.absent} label="Alfa" tone="danger" />
          </div>
        </section>

        <section className="relative overflow-hidden rounded-[8px] border border-emerald-200/90 bg-[#f8fcf8] p-4 shadow-[0_8px_24px_rgba(0,82,45,0.05)]">
          <div className="pointer-events-none absolute -right-8 -top-16 h-44 w-44 bg-cover bg-center opacity-25" style={{ backgroundImage: "url('/assets/session-drawer-mint-bg.jpg')" }} />
          <div className="relative flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] bg-emerald-100 text-primary"><Icon name="menu_book" /></div>
            <div className="min-w-0"><h4 className="text-sm font-bold text-primary">Catatan Materi</h4><p className={`mt-1 truncate text-xs ${record?.notes?.topic ? "font-semibold text-on-surface" : "text-on-surface-variant"}`} title={record?.notes?.topic || "Belum ada topik pembelajaran."}>{record?.notes?.topic || "Belum ada topik pembelajaran."}</p></div>
          </div>
        </section>

        <div className="space-y-2 pt-1">
          <button className="flex h-11 w-full items-center justify-center gap-2 rounded-[8px] bg-primary px-4 text-sm font-bold text-white shadow-sm transition hover:brightness-110" onClick={onOpenFull}><Icon name="open_in_new" /> Lihat Detail Session</button>
        </div>
      </div>
    </aside>
  );
}

function DetailRow({ icon, label, value, danger = false, last = false }) {
  return (
    <div className={`grid grid-cols-[30px_minmax(86px,1fr)_8px_minmax(0,1.35fr)] items-center gap-2 py-2 text-[11px] ${last ? "" : "border-b border-outline-variant/30"}`}>
      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-50 text-primary"><Icon name={icon} className="text-base" /></div>
      <span className="text-on-surface-variant">{label}</span>
      <span className="text-on-surface-variant">:</span>
      <span className={`min-w-0 break-words font-bold leading-4 ${danger ? "text-red-600" : "text-on-surface"}`}>{value}</span>
    </div>
  );
}

function AttendanceStat({ icon, value, label, tone: toneName }) {
  const tones = {
    success: "bg-emerald-50 text-emerald-700",
    warning: "bg-amber-50 text-amber-600",
    danger: "bg-red-50 text-red-600",
  };
  return (
    <div className="flex min-w-0 flex-col items-center px-2">
      <div className={`flex h-9 w-9 items-center justify-center rounded-full ${tones[toneName]}`}><Icon name={icon} className="text-base" /></div>
      <p className={`mt-2 text-lg font-bold ${toneName === "success" ? "text-emerald-700" : toneName === "warning" ? "text-amber-600" : "text-red-600"}`}>{value}</p>
      <p className="mt-0.5 text-[10px] font-medium text-on-surface-variant">{label}</p>
    </div>
  );
}

function ScheduleEditorDialog({
  open,
  initialSession,
  defaultDate,
  classes,
  subjects,
  onAddClass,
  onAddSubject,
  onClose,
  onSave,
  variant = "modal",
  detailPanel = null,
}) {
  const [form, setForm] = useState(() => makeEditorRecord(defaultDate, classes, subjects));
  const [addingSubject, setAddingSubject] = useState(false);
  const [addingClass, setAddingClass] = useState(false);
  const [subjectDraft, setSubjectDraft] = useState({ name: "", tone: "teal" });
  const [classDraft, setClassDraft] = useState({ name: "", level: "SD" });

  useEffect(() => {
    if (!open) return;
    setForm(initialSession ? { ...initialSession } : makeEditorRecord(defaultDate, classes, subjects));
    setAddingSubject(false);
    setAddingClass(false);
    setSubjectDraft({ name: "", tone: "teal" });
    setClassDraft({ name: "", level: "SD" });
  }, [open, initialSession, defaultDate]);

  if (!open) return null;

  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const handleTeacher = (teacherId) => {
    const teacher = courseTeachers.find((item) => item.id === teacherId);
    setForm((current) => ({ ...current, teacherId, teacher: teacher?.name || "" }));
  };
  const handleClass = (classId) => {
    const classGroup = classes.find((item) => item.id === classId);
    setForm((current) => ({ ...current, classId, className: classGroup?.name || "" }));
  };
  const handleSubject = (subjectName) => {
    const subject = subjects.find((item) => item.name === subjectName);
    setForm((current) => ({ ...current, subject: subjectName, tone: subject?.tone || current.tone }));
  };
  const createSubject = () => {
    const created = onAddSubject(subjectDraft);
    if (!created) return;
    handleSubject(created.name);
    setAddingSubject(false);
    setSubjectDraft({ name: "", tone: "teal" });
  };
  const createClass = () => {
    const created = onAddClass(classDraft);
    if (!created) return;
    handleClass(created.id);
    setAddingClass(false);
    setClassDraft({ name: "", level: "SD" });
  };
  const submit = (event) => {
    event.preventDefault();
    const selectedSubject = subjects.find((item) => item.name === form.subject);
    onSave({ ...form, tone: selectedSubject?.tone || subjectTone[form.subject] || form.tone || "blue" });
  };

  const isDrawer = variant === "drawer";

  return (
    <div className={isDrawer ? "fixed inset-0 z-[65] flex justify-end bg-black/25 backdrop-blur-[1px]" : "fixed inset-0 z-[60] flex items-center justify-center bg-black/35 p-4 backdrop-blur-[2px]"}>
      <div className={isDrawer ? "grid h-full w-full max-w-[1060px] bg-white shadow-lift xl:grid-cols-[minmax(0,1fr)_440px]" : "w-full max-w-2xl"}>
      <form className={isDrawer ? "h-full min-w-0 overflow-y-auto border-l border-outline-variant/40 bg-white" : "max-h-[92vh] w-full overflow-y-auto rounded-[10px] border border-outline-variant/40 bg-white shadow-lift"} onSubmit={submit}>
        <div className="flex items-start justify-between gap-4">
          <div className="px-6 pt-6">
            <p className="text-xs font-bold uppercase text-primary">{initialSession ? "Update Session" : "Create Session"}</p>
            <h2 className="mt-1 text-2xl font-bold">{initialSession ? "Edit Jadwal" : "Buat Jadwal Baru"}</h2>
            <p className="mt-2 text-sm text-on-surface-variant">Data tersimpan sementara pada browser dan dapat diubah kembali.</p>
          </div>
          <button className="icon-button mr-4 mt-4" onClick={onClose} type="button" aria-label="Tutup editor jadwal">
            <Icon name="close" />
          </button>
        </div>

        <div className="mt-6 border-y border-outline-variant/30 bg-surface-container-low/45 px-6 py-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Mata Pelajaran">
              <select value={form.subject} onChange={(event) => handleSubject(event.target.value)} required>
                {subjects.map((subject) => <option key={subject.id} value={subject.name}>{subject.name}</option>)}
              </select>
              <button className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-primary" type="button" onClick={() => setAddingSubject((current) => !current)}><Icon name="add" className="text-base" /> Pelajaran baru</button>
              {addingSubject && (
                <div className="mt-2 grid grid-cols-[minmax(0,1fr)_110px_auto] gap-2 rounded-[8px] border border-emerald-200 bg-emerald-50/60 p-2">
                  <input value={subjectDraft.name} onChange={(event) => setSubjectDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Nama pelajaran" />
                  <select value={subjectDraft.tone} onChange={(event) => setSubjectDraft((current) => ({ ...current, tone: event.target.value }))}>
                    {Object.keys(toneClass).map((toneName) => <option key={toneName} value={toneName}>{toneName}</option>)}
                  </select>
                  <button className="rounded-[8px] bg-primary px-3 text-white" type="button" onClick={createSubject} aria-label="Simpan pelajaran baru"><Icon name="save" className="text-base" /></button>
                </div>
              )}
            </FormField>
            <FormField label="Kelas">
              <select value={form.classId} onChange={(event) => handleClass(event.target.value)} required>
                {classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              <button className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-primary" type="button" onClick={() => setAddingClass((current) => !current)}><Icon name="add" className="text-base" /> Kelas baru</button>
              {addingClass && (
                <div className="mt-2 grid grid-cols-[minmax(0,1fr)_110px_auto] gap-2 rounded-[8px] border border-emerald-200 bg-emerald-50/60 p-2">
                  <input value={classDraft.name} onChange={(event) => setClassDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Nama kelas" />
                  <select value={classDraft.level} onChange={(event) => setClassDraft((current) => ({ ...current, level: event.target.value }))}>
                    {["SD", "9 SMP", "10 SMA", "11 SMA", "12 SMA"].map((level) => <option key={level}>{level}</option>)}
                  </select>
                  <button className="rounded-[8px] bg-primary px-3 text-white" type="button" onClick={createClass} aria-label="Simpan kelas baru"><Icon name="save" className="text-base" /></button>
                </div>
              )}
            </FormField>
            <FormField label="Tanggal">
              <input type="date" value={form.date} onChange={(event) => setField("date", event.target.value)} required />
            </FormField>
            <FormField label="Pengajar">
              <select value={form.teacherId} onChange={(event) => handleTeacher(event.target.value)} required>
                {courseTeachers.map((item) => <option key={item.id} value={item.id}>{item.name} - {item.subject}</option>)}
              </select>
            </FormField>
            <FormField label="Jam Mulai">
              <input type="time" value={form.startTime} onChange={(event) => setField("startTime", event.target.value)} required />
            </FormField>
            <FormField label="Jam Selesai">
              <input type="time" value={form.endTime} onChange={(event) => setField("endTime", event.target.value)} required />
            </FormField>
            <FormField label="Ruang Kelas">
              <input value={form.room} onChange={(event) => setField("room", event.target.value)} placeholder="Contoh: R. Anggrek" required />
            </FormField>
            <FormField label="Pengulangan">
              <select value={form.recurrence} onChange={(event) => setField("recurrence", event.target.value)}>
                <option>5 minggu ke depan</option>
                <option>Tidak berulang</option>
              </select>
            </FormField>
          </div>
          <label className="mt-5 flex cursor-pointer items-center gap-3 text-sm font-semibold text-on-surface">
            <input className="h-4 w-4 accent-primary" type="checkbox" checked={Boolean(form.conflict)} onChange={(event) => setField("conflict", event.target.checked)} />
            Tandai konflik penggunaan ruangan
          </label>
        </div>

        <div className="flex justify-end gap-3 px-6 py-5">
          <button className="rounded-[8px] border border-outline-variant/60 bg-white px-5 py-3 text-sm font-bold text-on-surface transition hover:bg-surface-container-low" onClick={onClose} type="button">Batal</button>
          <button className="inline-flex items-center gap-2 rounded-[8px] bg-primary px-5 py-3 text-sm font-bold text-on-primary transition hover:brightness-110" type="submit">
            <Icon name="save" /> {initialSession ? "Simpan Perubahan" : "Tambah Jadwal"}
          </button>
        </div>
      </form>
      {isDrawer && <div className="hidden h-full min-h-0 overflow-hidden xl:block">{detailPanel}</div>}
      </div>
    </div>
  );
}

function FormField({ label, children, wide = false }) {
  return (
    <div className={`block ${wide ? "sm:col-span-2" : ""}`}>
      <span className="mb-2 block text-xs font-bold text-on-surface-variant">{label}</span>
      <div className="[&>input]:w-full [&>input]:rounded-[8px] [&>input]:border [&>input]:border-outline-variant/60 [&>input]:bg-white [&>input]:px-3 [&>input]:py-3 [&>input]:text-sm [&>input]:outline-none [&>input]:focus:border-primary [&>select]:w-full [&>select]:rounded-[8px] [&>select]:border [&>select]:border-outline-variant/60 [&>select]:bg-white [&>select]:px-3 [&>select]:py-3 [&>select]:text-sm [&>select]:outline-none [&>select]:focus:border-primary [&>textarea]:w-full [&>textarea]:resize-none [&>textarea]:rounded-[8px] [&>textarea]:border [&>textarea]:border-outline-variant/60 [&>textarea]:bg-white [&>textarea]:px-3 [&>textarea]:py-3 [&>textarea]:text-sm [&>textarea]:outline-none [&>textarea]:focus:border-primary">{children}</div>
    </div>
  );
}

function DeleteDialog({ session, onClose, onConfirm }) {
  if (!session) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/35 p-4 backdrop-blur-[2px]">
      <section className="w-full max-w-md rounded-[10px] border border-outline-variant/40 bg-white p-6 shadow-lift">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-red-100 text-red-700"><Icon name="delete" /></div>
        <h2 className="mt-5 text-xl font-bold text-on-surface">Batalkan sesi ini?</h2>
        <p className="mt-2 text-sm leading-6 text-on-surface-variant">{session.subject} - {session.className} akan dihapus dari jadwal dan penyimpanan sementara.</p>
        <div className="mt-6 flex justify-end gap-3">
          <button className="rounded-[8px] border border-outline-variant/60 px-4 py-2.5 text-sm font-bold" onClick={onClose}>Kembali</button>
          <button className="rounded-[8px] bg-red-600 px-4 py-2.5 text-sm font-bold text-white" onClick={onConfirm}>Hapus Sesi</button>
        </div>
      </section>
    </div>
  );
}

function ArrangementScopeDialog({ open, changeCount, onClose, onConfirm }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/35 p-4 backdrop-blur-[2px]">
      <section className="w-full max-w-lg rounded-[10px] border border-outline-variant/40 bg-white p-6 shadow-lift">
        <div className="flex h-11 w-11 items-center justify-center rounded-[8px] bg-emerald-100 text-primary"><Icon name="sync" /></div>
        <h2 className="mt-5 text-xl font-bold text-on-surface">Terapkan perubahan jadwal</h2>
        <p className="mt-2 text-sm leading-6 text-on-surface-variant">{changeCount} perubahan belum disimpan. Pilih cakupan perubahan sebelum memperbarui jadwal.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button className="rounded-[8px] border border-outline-variant/60 bg-white p-4 text-left transition hover:border-primary hover:bg-emerald-50" onClick={() => onConfirm("single")}>
            <span className="block text-sm font-bold text-on-surface">Minggu ini saja</span>
            <span className="mt-1 block text-xs leading-5 text-on-surface-variant">Hanya sesi pada minggu yang sedang dibuka.</span>
          </button>
          <button className="rounded-[8px] border border-primary bg-primary p-4 text-left text-white transition hover:brightness-110" onClick={() => onConfirm("future")}>
            <span className="block text-sm font-bold">5 pengulangan berikutnya</span>
            <span className="mt-1 block text-xs leading-5 text-white/80">Terapkan hari dan jam baru ke lima minggu ke depan.</span>
          </button>
        </div>
        <button className="mt-4 w-full rounded-[8px] px-4 py-2.5 text-sm font-bold text-on-surface-variant transition hover:bg-surface-container-low" onClick={onClose}>Kembali mengatur</button>
      </section>
    </div>
  );
}

export default function Course() {
  const navigate = useNavigate();
  const location = useLocation();
  const operational = useOperationalDate();
  const today = operational.date;
  const appliedOperationalDate = useRef(operational.date);
  const [sessions, setSessions] = useState(() => loadCourseSessions());
  const [classes, setClasses] = useState(() => loadCourseClasses());
  const [subjects, setSubjects] = useState(() => loadCourseSubjects());
  const [selectedDate, setSelectedDate] = useState(today);
  const [viewMode, setViewMode] = useState("week");
  const [filters, setFilters] = useState({ teacherId: "", room: "", subject: "" });
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [editor, setEditor] = useState(null);
  const [deleteTargetId, setDeleteTargetId] = useState(null);
  const [notice, setNotice] = useState("");
  const [arrangeMode, setArrangeMode] = useState(false);
  const [arrangementDraft, setArrangementDraft] = useState([]);
  const [draggedSessionId, setDraggedSessionId] = useState(null);
  const [scopeDialogOpen, setScopeDialogOpen] = useState(false);
  const dataRevision = useDataRevision(["roster", "schedule", "catalog", "session"]);

  useEffect(() => {
    setClasses(loadCourseClasses());
    setSubjects(loadCourseSubjects());
    if (!arrangeMode) setSessions(loadCourseSessions());
  }, [dataRevision, arrangeMode]);

  useEffect(() => {
    if (!notice) return undefined;
    const timeout = window.setTimeout(() => setNotice(""), 2800);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    const scrollContainer = document.getElementById("app-scroll-container");
    const savedScroll = Number(window.sessionStorage.getItem("awan-topan-course-scroll") || 0);
    if (scrollContainer && savedScroll > 0) {
      window.requestAnimationFrame(() => { scrollContainer.scrollTop = savedScroll; });
    }

    const editSessionId = location.state?.editSessionId;
    if (editSessionId) {
      const target = sessions.find((session) => session.id === editSessionId);
      if (target) {
        setSelectedDate(target.date);
        setSelectedSessionId(target.id);
        setEditor({ mode: "edit", date: target.date, session: target });
      }
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.key]);

  const activeSessions = arrangeMode ? arrangementDraft : sessions;
  const selectedSession = activeSessions.find((session) => session.id === selectedSessionId) || null;
  const deleteTarget = activeSessions.find((session) => session.id === deleteTargetId) || null;

  const arrangementChanges = useMemo(() => {
    if (!arrangeMode) return [];
    const originalById = new Map(sessions.map((session) => [session.id, session]));
    return arrangementDraft.filter((draft) => {
      const original = originalById.get(draft.id);
      if (!original) return true;
      return draft.date !== original.date || draft.startTime !== original.startTime || draft.endTime !== original.endTime;
    });
  }, [arrangeMode, arrangementDraft, sessions]);

  useEffect(() => {
    if (operational.date === appliedOperationalDate.current) return;
    const hasDraft = Boolean(editor) || scopeDialogOpen || (arrangeMode && arrangementChanges.length > 0);
    if (hasDraft) {
      setNotice("Tanggal operasional berubah. Tampilan akan berpindah setelah draft disimpan atau dibatalkan.");
      return;
    }
    setSelectedDate(operational.date);
    setSelectedSessionId(null);
    appliedOperationalDate.current = operational.date;
  }, [operational.date, editor, scopeDialogOpen, arrangeMode, arrangementChanges.length]);

  const filterOptions = useMemo(() => ({
    teachers: courseTeachers.map((teacher) => ({ value: teacher.id, label: teacher.name })),
    rooms: [...new Set(activeSessions.map((session) => session.room))].sort().map((room) => ({ value: room, label: room })),
    subjects: [...new Set(activeSessions.map((session) => session.subject))].sort().map((subject) => ({ value: subject, label: subject })),
  }), [activeSessions]);

  const filteredSessions = useMemo(() => activeSessions.filter((session) => {
    if (filters.teacherId && session.teacherId !== filters.teacherId) return false;
    if (filters.room && session.room !== filters.room) return false;
    if (filters.subject && session.subject !== filters.subject) return false;
    return true;
  }), [activeSessions, filters]);

  const visibleDays = useMemo(() => {
    const firstDate = viewMode === "week" ? startOfWeek(selectedDate) : parseDate(selectedDate);
    const length = viewMode === "week" ? 7 : 1;
    return Array.from({ length }, (_, index) => {
      const date = addDays(firstDate, index);
      const isoDate = toISODate(date);
      const daySessions = filteredSessions
        .filter((session) => session.date === isoDate)
        .sort((a, b) => a.startTime.localeCompare(b.startTime));
      return {
        isoDate,
        number: String(date.getDate()),
        day: dayFormatter.format(date),
        month: date.toLocaleDateString("id-ID", { month: "short", year: "numeric" }),
        slots: groupTimeSlots(daySessions),
      };
    });
  }, [filteredSessions, selectedDate, viewMode]);

  const storeSessions = (nextSessions) => {
    setSessions(nextSessions);
    saveCourseSessions(nextSessions);
  };

  const addSubject = ({ name, tone }) => {
    const normalizedName = name.trim();
    if (!normalizedName) {
      setNotice("Nama pelajaran wajib diisi.");
      return null;
    }
    if (subjects.some((subject) => subject.name.toLowerCase() === normalizedName.toLowerCase())) {
      setNotice("Pelajaran tersebut sudah tersedia.");
      return null;
    }
    const created = { id: `subject-${Date.now()}`, name: normalizedName, tone: tone || "teal" };
    const nextSubjects = [...subjects, created];
    setSubjects(nextSubjects);
    saveCourseSubjects(nextSubjects);
    setNotice(`${created.name} ditambahkan ke master pelajaran.`);
    return created;
  };

  const addClass = ({ name, level }) => {
    const normalizedName = name.trim();
    if (!normalizedName) {
      setNotice("Nama kelas wajib diisi.");
      return null;
    }
    if (classes.some((classGroup) => classGroup.name.toLowerCase() === normalizedName.toLowerCase())) {
      setNotice("Kelas tersebut sudah tersedia.");
      return null;
    }
    const created = { id: `class-${Date.now()}`, name: normalizedName, level, monthlyFee: 500000, totalStudents: 0, members: [] };
    const nextClasses = saveCourseClasses([...classes, created]);
    setClasses(nextClasses);
    setNotice(`${created.name} ditambahkan. Anggota dapat diatur dari menu Rombel.`);
    return created;
  };

  const moveDate = (direction) => {
    const amount = direction * (viewMode === "week" ? 7 : 1);
    setSelectedDate(toISODate(addDays(parseDate(selectedDate), amount)));
    setSelectedSessionId(null);
  };

  const changeViewMode = (mode) => {
    setViewMode(mode);
    setSelectedSessionId(null);
  };

  const changeFilter = (field, value) => {
    if (field === "reset") setFilters({ teacherId: "", room: "", subject: "" });
    else setFilters((current) => ({ ...current, [field]: value }));
    setSelectedSessionId(null);
  };

  const startArrangement = () => {
    setArrangementDraft(sessions.map((session) => ({ ...session })));
    setArrangeMode(true);
    setDraggedSessionId(null);
    setSelectedSessionId(null);
    setNotice("Mode Atur Sesi aktif.");
  };

  const cancelArrangement = () => {
    setArrangeMode(false);
    setArrangementDraft([]);
    setDraggedSessionId(null);
    setScopeDialogOpen(false);
    setSelectedSessionId(null);
    setNotice("Perubahan tata sesi dibatalkan.");
  };

  const moveDraftSession = (sessionId, date, startTime, endTime) => {
    const applyMove = () => {
      setArrangementDraft((current) => current.map((session) => (
        session.id === sessionId
          ? { ...session, date, startTime: startTime || session.startTime, endTime: endTime || session.endTime }
          : session
      )));
      setDraggedSessionId(null);
    };
    if (document.startViewTransition) document.startViewTransition(applyMove);
    else applyMove();
  };

  const generateWeekBatch = (untilDate) => {
    const weekStart = startOfWeek(selectedDate);
    const weekEnd = addDays(weekStart, 6);
    const targetDate = parseDate(untilDate);
    const sourceSessions = sessions.filter((session) => {
      const date = parseDate(session.date);
      return date >= weekStart && date <= weekEnd;
    });

    if (sourceSessions.length === 0) {
      setNotice("Tidak ada jadwal pada minggu ini untuk dibuatkan batch.");
      return;
    }
    if (targetDate <= weekEnd) {
      setNotice("Pilih tanggal setelah minggu yang sedang ditampilkan.");
      return;
    }

    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const weekCount = Math.min(12, Math.ceil((targetDate - weekEnd) / weekMs));
    const next = sessions.map((session) => ({ ...session }));
    let added = 0;
    sourceSessions.forEach((source) => {
      const seriesId = source.seriesId || `series-${source.id}`;
      const sourceIndex = next.findIndex((session) => session.id === source.id);
      next[sourceIndex] = { ...source, seriesId, repeatWeeks: weekCount, recurrence: `${weekCount} minggu ke depan` };

      for (let offset = 1; offset <= weekCount; offset += 1) {
        const date = toISODate(addDays(source.date, offset * 7));
        if (parseDate(date) > targetDate) break;
        const occurrenceIndex = Number(source.occurrenceIndex || 0) + offset;
        const exists = next.some((session) => session.seriesId === seriesId && session.date === date);
        if (!exists) {
          next.push({
            ...source,
            id: `${seriesId}-batch-${date}`,
            seriesId,
            occurrenceIndex,
            repeatWeeks: weekCount,
            recurrence: `${weekCount} minggu ke depan`,
            date,
          });
          added += 1;
        }
      }
    });

    storeSessions(next);
    setNotice(added > 0 ? `${added} sesi berhasil dibuat hingga ${dateFormatter.format(targetDate)}.` : "Batch jadwal pada rentang tersebut sudah tersedia.");
  };

  const commitArrangement = (scope) => {
    let next = arrangementDraft.map((session) => ({ ...session }));
    const originalById = new Map(sessions.map((session) => [session.id, session]));
    const movedSessions = arrangementDraft.filter((draft) => {
      const original = originalById.get(draft.id);
      return original && (draft.date !== original.date || draft.startTime !== original.startTime || draft.endTime !== original.endTime);
    });

    if (scope === "future") {
      movedSessions.forEach((draft) => {
        const seriesId = draft.seriesId || `series-${draft.id}`;
        const baseIndex = Number(draft.occurrenceIndex || 0);
        const draftIndex = next.findIndex((session) => session.id === draft.id);
        next[draftIndex] = { ...next[draftIndex], seriesId, repeatWeeks: 5, recurrence: "5 minggu ke depan" };

        for (let offset = 1; offset <= 5; offset += 1) {
          const occurrenceIndex = baseIndex + offset;
          const date = toISODate(addDays(draft.date, offset * 7));
          const existingIndex = next.findIndex((session) => session.seriesId === seriesId && Number(session.occurrenceIndex || 0) === occurrenceIndex);
          if (existingIndex >= 0) {
            next[existingIndex] = { ...next[existingIndex], date, startTime: draft.startTime, endTime: draft.endTime, repeatWeeks: 5, recurrence: "5 minggu ke depan" };
          } else {
            next.push({ ...draft, id: `${seriesId}-occurrence-${occurrenceIndex}`, seriesId, occurrenceIndex, repeatWeeks: 5, recurrence: "5 minggu ke depan", date });
          }
        }
      });
    }

    storeSessions(next);
    setArrangeMode(false);
    setArrangementDraft([]);
    setDraggedSessionId(null);
    setScopeDialogOpen(false);
    setNotice(scope === "future" ? "Perubahan diterapkan ke lima pengulangan berikutnya." : "Perubahan disimpan khusus minggu ini.");
  };

  const openCreate = (date = selectedDate) => {
    if (arrangeMode) {
      setNotice("Simpan atau batalkan mode Atur Sesi sebelum menambah jadwal.");
      return;
    }
    setEditor({ mode: "create", date, session: null });
  };
  const openEdit = (session) => setEditor({ mode: "edit", date: session.date, session });

  const openFullDetail = (sessionId) => {
    const scrollContainer = document.getElementById("app-scroll-container");
    if (scrollContainer) window.sessionStorage.setItem("awan-topan-course-scroll", String(scrollContainer.scrollTop));
    navigate(`/course/sessions/${sessionId}`, { state: { fromCourse: true } });
  };

  const saveSession = (record) => {
    if (record.endTime <= record.startTime) {
      setNotice("Jam selesai harus lebih besar dari jam mulai.");
      return;
    }

    const timestamp = Date.now();
    const savedRecord = record.id
      ? record
      : {
          ...record,
          id: `session-${timestamp}`,
          seriesId: `series-${timestamp}`,
          occurrenceIndex: 0,
          repeatWeeks: record.recurrence === "Tidak berulang" ? 0 : 5,
          createdAt: new Date().toISOString(),
        };
    const repeatedRecords = !record.id && record.recurrence !== "Tidak berulang" ? makeFutureOccurrences(savedRecord, 5) : [];
    const nextSessions = record.id
      ? sessions.map((session) => (session.id === record.id ? savedRecord : session))
      : [...sessions, savedRecord, ...repeatedRecords];

    storeSessions(nextSessions);
    setSelectedDate(savedRecord.date);
    setSelectedSessionId(savedRecord.id);
    setEditor(null);
    setNotice(record.id ? "Perubahan jadwal berhasil disimpan." : repeatedRecords.length > 0 ? "Jadwal dan lima pengulangan berhasil ditambahkan." : "Jadwal baru berhasil ditambahkan.");
  };

  const deleteSession = () => {
    if (!deleteTarget) return;
    storeSessions(sessions.filter((session) => session.id !== deleteTarget.id));
    setDeleteTargetId(null);
    setSelectedSessionId(null);
    setNotice("Sesi berhasil dihapus dari jadwal.");
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Course"
        description="Kelola jadwal belajar mingguan, pengajar, dan ruang kelas."
        action={<div className="flex flex-wrap gap-3">
          <button className="inline-flex h-12 items-center justify-center gap-2 rounded-[8px] border border-outline-variant/60 bg-white px-5 text-sm font-bold text-on-surface transition hover:bg-surface-container-low" onClick={() => window.print()}>
            <Icon name="print" /> Cetak
          </button>
          <button className="inline-flex h-12 items-center justify-center gap-2 rounded-[8px] bg-primary px-5 text-sm font-bold text-on-primary shadow-sm transition hover:brightness-110" onClick={() => openCreate(selectedDate)}>
            <Icon name="add" /> Buat Jadwal Baru
          </button>
        </div>}
      />

      <section className="rounded-[8px] border border-outline-variant/50 bg-white shadow-[0_2px_10px_rgba(24,29,25,0.04)]">
        <Toolbar
          selectedDate={selectedDate}
          viewMode={viewMode}
          onMoveDate={moveDate}
          onToday={() => { setSelectedDate(today); setSelectedSessionId(null); }}
          onSelectDate={(date) => { setSelectedDate(date); setSelectedSessionId(null); }}
          onViewMode={changeViewMode}
          filters={filters}
          onFilter={changeFilter}
          filterOptions={filterOptions}
          arrangeMode={arrangeMode}
          hasArrangementChanges={arrangementChanges.length > 0}
          onStartArrange={startArrangement}
          onCancelArrange={cancelArrangement}
          onSaveArrange={() => setScopeDialogOpen(true)}
          onGenerateBatch={generateWeekBatch}
        />
        {arrangeMode && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#8fbfba] bg-gradient-to-r from-[#e0f1e7] via-[#d8eeee] to-[#dfe8ec] px-5 py-3 text-xs text-[#174f4c]">
            <span className="flex items-center gap-2 font-bold"><Icon name="drag_indicator" className="text-base" /> Mode Atur Sesi aktif</span>
            <span>{arrangementChanges.length} perubahan belum disimpan</span>
          </div>
        )}
        <div className={selectedSession && !arrangeMode && editor?.mode !== "edit" ? "grid xl:grid-cols-[minmax(0,1fr)_400px] 2xl:grid-cols-[minmax(0,1fr)_440px]" : "block"}>
          <main className="min-w-0 space-y-6 p-5 2xl:p-6">
            {visibleDays.map((day) => (
              <DayBlock
                key={day.isoDate}
                day={day}
                compact={Boolean(selectedSession && !arrangeMode)}
                selectedId={arrangeMode ? null : selectedSessionId}
                arrangeMode={arrangeMode}
                draggedSessionId={draggedSessionId}
                onAdd={openCreate}
                onSelect={(session) => { if (!arrangeMode) setSelectedSessionId(session.id); }}
                onDragStart={setDraggedSessionId}
                onDragEnd={() => setDraggedSessionId(null)}
                onDropSession={moveDraftSession}
              />
            ))}
          </main>
          {selectedSession && !arrangeMode && editor?.mode !== "edit" && (
            <DetailDrawer
              session={selectedSession}
              classes={classes}
              onClose={() => setSelectedSessionId(null)}
              onEdit={() => arrangeMode ? setNotice("Simpan atau batalkan mode Atur Sesi sebelum mengedit data.") : openEdit(selectedSession)}
              onDelete={() => arrangeMode ? setNotice("Simpan atau batalkan mode Atur Sesi sebelum membatalkan sesi.") : setDeleteTargetId(selectedSession.id)}
              onOpenFull={() => openFullDetail(selectedSession.id)}
            />
          )}
        </div>
      </section>

      <ScheduleEditorDialog
        open={Boolean(editor)}
        initialSession={editor?.session || null}
        defaultDate={editor?.date || selectedDate}
        classes={classes}
        subjects={subjects}
        onAddClass={addClass}
        onAddSubject={addSubject}
        onClose={() => setEditor(null)}
        onSave={saveSession}
        variant={editor?.mode === "edit" ? "drawer" : "modal"}
        detailPanel={editor?.mode === "edit" && selectedSession ? (
          <DetailDrawer
            embedded
            session={selectedSession}
            classes={classes}
            onClose={() => setEditor(null)}
            onEdit={() => {}}
            onDelete={() => setDeleteTargetId(selectedSession.id)}
            onOpenFull={() => openFullDetail(selectedSession.id)}
          />
        ) : null}
      />
      <DeleteDialog session={deleteTarget} onClose={() => setDeleteTargetId(null)} onConfirm={deleteSession} />
      <ArrangementScopeDialog open={scopeDialogOpen} changeCount={arrangementChanges.length} onClose={() => setScopeDialogOpen(false)} onConfirm={commitArrangement} />
      {notice && (
        <div className="fixed bottom-6 right-6 z-[80] flex max-w-sm items-center gap-3 rounded-[8px] border border-primary/20 bg-primary px-4 py-3 text-sm font-semibold text-on-primary shadow-lift">
          <Icon name="check_circle" /> {notice}
        </div>
      )}
    </div>
  );
}
