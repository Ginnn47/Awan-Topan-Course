import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  ApiError,
  apiEnvelope,
  apiListAll,
  idempotencyKey,
  queryString,
} from "../api/client";
import { queryKeys } from "../api/queryKeys";
import type {
  ClassGroup,
  Occurrence,
  Room,
  Subject,
  Teacher,
  TeachingSession,
} from "../api/types";
import { useAuth } from "../auth/AuthProvider";
import { Icon, PageHeader } from "../components/ui";
import useOperationalDate from "../hooks/useOperationalDate.js";

const dayName = new Intl.DateTimeFormat("id-ID", { weekday: "long" });
const dateLabel = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "long",
  year: "numeric",
});
const clock = new Intl.DateTimeFormat("id-ID", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const subjectTones: Record<string, string> = {
  blue: "border-blue-500 bg-blue-50 text-blue-700",
  green: "border-lime-600 bg-lime-50 text-lime-700",
  purple: "border-purple-500 bg-purple-50 text-purple-700",
  orange: "border-orange-500 bg-orange-50 text-orange-700",
  red: "border-red-500 bg-red-50 text-red-700",
  pink: "border-pink-500 bg-pink-50 text-pink-700",
  teal: "border-teal-600 bg-teal-50 text-teal-700",
  amber: "border-amber-500 bg-amber-50 text-amber-700",
};
const subjectBadgeTones: Record<string, string> = {
  blue: "bg-blue-600 text-white",
  green: "bg-lime-600 text-white",
  purple: "bg-purple-600 text-white",
  orange: "bg-orange-600 text-white",
  red: "bg-red-600 text-white",
  pink: "bg-pink-600 text-white",
  teal: "bg-teal-700 text-white",
  amber: "bg-amber-600 text-white",
};

function parseLocal(value: string) {
  return new Date(`${value}T12:00:00`);
}
function isoDate(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}
function shift(value: string, days: number) {
  const date = parseLocal(value);
  date.setDate(date.getDate() + days);
  return isoDate(date);
}
function weekBounds(value: string) {
  const date = parseLocal(value);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  const from = isoDate(date);
  date.setDate(date.getDate() + 7);
  return { from, to: isoDate(date) };
}
function apiDateTime(date: string, value: string) {
  return `${date}T${value}:00+07:00`;
}
function durationLabel(start: string, end: string) {
  const minutes = Math.round(
    (new Date(end).getTime() - new Date(start).getTime()) / 60000,
  );
  return minutes >= 60
    ? `${Math.floor(minutes / 60)} jam${minutes % 60 ? ` ${minutes % 60} menit` : ""}`
    : `${minutes} menit`;
}

interface EditorState {
  date: string;
  start: string;
  end: string;
  class_group: string;
  subject: string;
  teacher: string;
  room: string;
  occurrence_count: number;
}

export default function CourseApi() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const operational = useOperationalDate();
  const [selectedDate, setSelectedDate] = useState<string>(operational.date);
  const [mode, setMode] = useState<"week" | "day">("week");
  const [selected, setSelected] = useState<Occurrence | null>(null);
  const [arrangeMode, setArrangeMode] = useState(false);
  const [dragged, setDragged] = useState<Occurrence | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [startDraft, setStartDraft] = useState<{
    occurrence: Occurrence;
    topic: string;
  } | null>(null);
  const [notice, setNotice] = useState("");
  const [filters, setFilters] = useState({
    teacher: "",
    room: "",
    subject: "",
    class_group: "",
  });
  const bounds =
    mode === "week"
      ? weekBounds(selectedDate)
      : { from: selectedDate, to: shift(selectedDate, 1) };
  const filterQuery = queryString(filters);
  const occurrences = useQuery({
    queryKey: queryKeys.occurrences(bounds.from, bounds.to, filterQuery),
    queryFn: ({ signal }) =>
      apiListAll<Occurrence>(
        `/api/v1/schedule-occurrences/${queryString({ from: `${bounds.from}T00:00:00+07:00`, to: `${bounds.to}T00:00:00+07:00`, ...filters })}`,
        signal,
      ),
  });
  const teachers = useQuery({
    queryKey: queryKeys.teachers,
    queryFn: ({ signal }) =>
      apiListAll<Teacher>("/api/v1/teachers/?is_active=true", signal),
  });
  const subjects = useQuery({
    queryKey: queryKeys.subjects,
    queryFn: ({ signal }) =>
      apiListAll<Subject>("/api/v1/subjects/?is_active=true", signal),
  });
  const rooms = useQuery({
    queryKey: queryKeys.rooms,
    queryFn: ({ signal }) =>
      apiListAll<Room>("/api/v1/rooms/?is_active=true", signal),
  });
  const classes = useQuery({
    queryKey: queryKeys.classes,
    queryFn: ({ signal }) =>
      apiListAll<ClassGroup>("/api/v1/class-groups/?is_active=true", signal),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["scheduling"] });
  const createMutation = useMutation({
    mutationFn: (value: EditorState) =>
      apiEnvelope("/api/v1/schedule-series/", {
        method: "POST",
        body: {
          class_group: value.class_group,
          subject: value.subject,
          teacher: value.teacher,
          room: value.room,
          start_at: apiDateTime(value.date, value.start),
          end_at: apiDateTime(value.date, value.end),
          occurrence_count: value.occurrence_count,
          interval_weeks: 1,
        },
      }),
    onSuccess: () => {
      void invalidate();
      setEditor(null);
      setNotice("Jadwal berhasil dibuat dan disinkronkan.");
    },
  });
  const rescheduleMutation = useMutation({
    mutationFn: ({
      occurrence,
      targetDate,
      scope,
    }: {
      occurrence: Occurrence;
      targetDate: string;
      scope: string;
    }) => {
      const start = new Date(occurrence.start_at);
      const end = new Date(occurrence.end_at);
      const startClock = `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`;
      const endClock = `${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`;
      return apiEnvelope(
        `/api/v1/schedule-occurrences/${occurrence.id}/reschedule/`,
        {
          method: "POST",
          body: {
            start_at: apiDateTime(targetDate, startClock),
            end_at: apiDateTime(targetDate, endClock),
            expected_version: occurrence.version,
            scope,
          },
        },
      );
    },
    onSuccess: () => {
      void invalidate();
      setSelected(null);
      setNotice("Perubahan jadwal berhasil disimpan.");
    },
  });
  const cancelMutation = useMutation({
    mutationFn: ({
      occurrence,
      reason,
    }: {
      occurrence: Occurrence;
      reason: string;
    }) =>
      apiEnvelope(`/api/v1/schedule-occurrences/${occurrence.id}/cancel/`, {
        method: "POST",
        body: { expected_version: occurrence.version, reason },
      }),
    onSuccess: () => {
      void invalidate();
      setSelected(null);
      setNotice("Sesi dibatalkan tanpa menghapus histori.");
    },
  });
  const startMutation = useMutation({
    mutationFn: ({
      occurrence,
      reason,
      topic,
    }: {
      occurrence: Occurrence;
      reason: string;
      topic: string;
    }) =>
      apiEnvelope<TeachingSession>(
        `/api/v1/schedule-occurrences/${occurrence.id}/start/`,
        {
          method: "POST",
          idempotencyKey: idempotencyKey(),
          body: {
            expected_version: occurrence.version,
            override_reason: reason,
            topic,
          },
        },
      ).then((response) => response.data),
    onSuccess: (session) => {
      void invalidate();
      setStartDraft(null);
      navigate(`/course/sessions/${session.id}`);
    },
  });

  const days = useMemo(() => {
    const count = mode === "week" ? 7 : 1;
    return Array.from({ length: count }, (_, index) =>
      shift(bounds.from, index),
    );
  }, [bounds.from, mode]);

  const openCreate = () =>
    setEditor({
      date: selectedDate,
      start: "15:30",
      end: "17:00",
      class_group: classes.data?.[0]?.id || "",
      subject: subjects.data?.[0]?.id || "",
      teacher: teachers.data?.[0]?.id || "",
      room: rooms.data?.[0]?.id || "",
      occurrence_count: 5,
    });
  const startSession = (item: Occurrence) => {
    setStartDraft({ occurrence: item, topic: "" });
  };
  const cancelSession = (item: Occurrence) => {
    const reason = window.prompt("Alasan pembatalan sesi:")?.trim();
    if (reason) cancelMutation.mutate({ occurrence: item, reason });
  };
  const dropOnDay = (targetDate: string) => {
    if (!dragged || targetDate === dragged.start_at.slice(0, 10)) return;
    const future = window.confirm(
      "Terapkan juga pada kejadian berikutnya dalam seri? Pilih Batal untuk hanya sesi ini.",
    );
    rescheduleMutation.mutate({
      occurrence: dragged,
      targetDate,
      scope: future ? "this_and_future" : "this",
    });
    setDragged(null);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Manajemen Jadwal"
        description="Kelola jadwal mingguan, pengajar, ruangan, dan pelaksanaan sesi."
        action={
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            {user?.permissions.manage_schedule && (
              <button
                className={`secondary-button min-w-0 flex-1 rounded-[8px] px-3 text-xs sm:flex-none ${arrangeMode ? "bg-amber-100 text-amber-900" : ""}`}
                onClick={() => {
                  setArrangeMode((value) => !value);
                  setSelected(null);
                }}
              >
                <Icon name="drag_indicator" />
                {arrangeMode ? "Selesai Atur" : "Atur Sesi"}
              </button>
            )}
            <button
              className="primary-button min-w-0 flex-1 rounded-[8px] px-3 text-xs sm:flex-none"
              onClick={openCreate}
              disabled={!user?.permissions.manage_schedule}
            >
              <Icon name="add" />
              Buat Jadwal Baru
            </button>
          </div>
        }
      />
      {notice && (
        <div className="flex items-center justify-between rounded-[8px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-primary">
          <span>{notice}</span>
          <button onClick={() => setNotice("")}>
            <Icon name="close" className="text-base" />
          </button>
        </div>
      )}
      <section className="grid grid-cols-1 gap-3 rounded-[8px] border border-outline-variant/40 bg-white p-3 shadow-soft sm:grid-cols-2 xl:flex xl:items-center">
        <div className="flex h-11 w-full items-center rounded-[8px] border border-outline-variant/50 xl:w-auto">
          <button
            className="icon-button rounded-[7px]"
            onClick={() =>
              setSelectedDate((value) =>
                shift(value, mode === "week" ? -7 : -1),
              )
            }
          >
            <Icon name="chevron_left" />
          </button>
          <label className="flex h-full min-w-0 flex-1 items-center justify-center gap-2 border-x px-2 text-xs font-bold text-primary xl:flex-none xl:px-3">
            <Icon name="calendar_today" className="text-base" />
            <input
              className="min-w-0 flex-1 bg-transparent outline-none xl:w-[116px] xl:flex-none"
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
            />
          </label>
          <button
            className="icon-button rounded-[7px]"
            onClick={() =>
              setSelectedDate((value) => shift(value, mode === "week" ? 7 : 1))
            }
          >
            <Icon name="chevron_right" />
          </button>
        </div>
        <div className="grid h-11 w-full grid-cols-2 rounded-[8px] border p-1 xl:ml-auto xl:w-auto">
          <button
            className={`rounded-[6px] px-5 text-xs font-bold ${mode === "week" ? "bg-primary text-white" : ""}`}
            onClick={() => setMode("week")}
          >
            <Icon
              name="format_list_bulleted"
              className="mr-1 inline text-base"
            />
            Minggu
          </button>
          <button
            className={`rounded-[6px] px-5 text-xs font-bold ${mode === "day" ? "bg-primary text-white" : ""}`}
            onClick={() => setMode("day")}
          >
            <Icon name="calendar_today" className="mr-1 inline text-base" />
            Hari
          </button>
        </div>
        {[
          { key: "teacher", label: "Pengajar", data: teachers.data || [] },
          { key: "room", label: "Ruangan", data: rooms.data || [] },
          { key: "subject", label: "Mapel", data: subjects.data || [] },
          { key: "class_group", label: "Rombel", data: classes.data || [] },
        ].map((filter) => (
          <select
            key={filter.key}
            className="h-11 w-full min-w-0 rounded-[8px] border border-outline-variant/50 bg-white px-3 text-xs font-semibold xl:w-auto xl:min-w-[140px]"
            value={filters[filter.key as keyof typeof filters]}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                [filter.key]: event.target.value,
              }))
            }
          >
            <option value="">Semua {filter.label}</option>
            {filter.data.map((item: Teacher | Room | Subject | ClassGroup) => (
              <option key={item.id} value={item.id}>
                {"full_name" in item ? item.full_name : item.name}
              </option>
            ))}
          </select>
        ))}
      </section>

      {arrangeMode && (
        <div className="rounded-[8px] border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-900">
          Tarik kartu sesi ke hari tujuan. Pilihan cakupan pengulangan akan
          diminta sebelum perubahan disimpan.
        </div>
      )}
      <div
        className={`grid min-w-0 gap-5 ${selected && !arrangeMode ? "xl:grid-cols-[minmax(0,1fr)_420px]" : ""}`}
      >
        <div className="space-y-4">
          {occurrences.isLoading && (
            <div className="rounded-[8px] border bg-white p-10 text-center text-sm">
              Memuat jadwal...
            </div>
          )}
          {days.map((date) => {
            const items = (occurrences.data || []).filter(
              (item) => item.start_at.slice(0, 10) === date,
            );
            const slots = [...new Set(items.map((item) => item.start_at))];
            return (
              <section
                key={date}
                className="rounded-[8px] border border-emerald-100 bg-white p-3 shadow-soft sm:p-4"
                onDragOver={(event) => arrangeMode && event.preventDefault()}
                onDrop={() => dropOnDay(date)}
              >
                <div className="flex items-center gap-3 border-b border-emerald-100 pb-3 sm:gap-4">
                  <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-[8px] bg-gradient-to-br from-[#dff5ea] to-[#bce6d2] text-primary">
                    <strong className="text-xl">
                      {parseLocal(date).getDate()}
                    </strong>
                    <span className="text-[9px] font-bold uppercase">
                      {dayName.format(parseLocal(date))}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-bold capitalize">
                      {dayName.format(parseLocal(date))},{" "}
                      {dateLabel.format(parseLocal(date))}
                    </h2>
                    <p className="mt-1 text-xs text-on-surface-variant">
                      {items.length} kelas dalam {slots.length} slot sesi
                    </p>
                  </div>
                  {user?.permissions.manage_schedule && (
                    <button
                      className="inline-flex min-h-10 shrink-0 items-center gap-1 text-xs font-bold text-primary sm:gap-2"
                      onClick={() => {
                        openCreate();
                        setEditor((current) =>
                          current ? { ...current, date } : current,
                        );
                      }}
                    >
                      <Icon name="add" className="text-base" />
                      Tambah
                    </button>
                  )}
                </div>
                {slots.length === 0 ? (
                  <div className="mt-4 rounded-[8px] border border-dashed border-outline-variant p-7 text-center text-xs text-on-surface-variant">
                    Belum ada jadwal pada hari ini.
                  </div>
                ) : (
                  <div className="mt-3 space-y-3">
                    {slots.map((slot) => {
                      const slotItems = items.filter(
                        (item) => item.start_at === slot,
                      );
                      return (
                        <div
                          key={slot}
                          className="overflow-hidden rounded-[8px] border border-emerald-100"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 bg-gradient-to-r from-[#e5f5ec] via-[#d7eee7] to-[#d8e9e8] px-3 py-2">
                            <div className="flex items-center gap-3">
                              <span className="flex h-9 w-9 items-center justify-center rounded-[8px] bg-primary text-white">
                                <Icon name="schedule" className="text-base" />
                              </span>
                              <div>
                                <p className="text-sm font-bold">
                                  {clock.format(new Date(slot))} -{" "}
                                  {clock.format(new Date(slotItems[0].end_at))}
                                </p>
                                <p className="text-[10px] text-on-surface-variant">
                                  {durationLabel(slot, slotItems[0].end_at)}
                                </p>
                              </div>
                            </div>
                            <span className="rounded-full border border-emerald-300 bg-white/70 px-3 py-1 text-[10px] font-bold text-primary">
                              {slotItems.length} kelas paralel
                            </span>
                          </div>
                          <div className="grid gap-2 p-2 md:grid-cols-2">
                            {slotItems.map((item) => (
                              <button
                                key={item.id}
                                draggable={arrangeMode}
                                onDragStart={() => setDragged(item)}
                                onClick={() =>
                                  !arrangeMode && setSelected(item)
                                }
                                className={`group min-w-0 rounded-[8px] border-t-4 p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-soft ${subjectTones[item.subject_color] || subjectTones.teal} ${selected?.id === item.id ? "ring-2 ring-primary/30" : ""}`}
                              >
                                <div className="flex min-w-0 items-center justify-between gap-3">
                                  <span
                                    className={`min-w-0 break-words rounded-[6px] px-2.5 py-1 text-xs font-bold leading-5 ${subjectBadgeTones[item.subject_color] || subjectBadgeTones.teal}`}
                                  >
                                    {item.subject_name || "Mapel belum ditetapkan"}
                                  </span>
                                  <Icon
                                    name={
                                      arrangeMode
                                        ? "drag_indicator"
                                        : "more_vert"
                                    }
                                    className="text-base opacity-70"
                                  />
                                </div>
                                <div className="mt-2">
                                  <p className="min-w-0 break-words text-base font-bold leading-6 text-on-surface">
                                    {item.class_name}
                                  </p>
                                  <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-5 gap-y-1.5">
                                    <span className="flex min-w-0 items-center gap-1.5 text-xs text-on-surface">
                                      <Icon
                                        name="person"
                                        className="text-base text-primary"
                                      />
                                      <strong className="break-words font-semibold">
                                        {item.teacher_name}
                                      </strong>
                                    </span>
                                    <span className="flex min-w-0 items-center gap-1.5 text-xs text-on-surface">
                                      <Icon
                                        name="meeting_room"
                                        className="text-base text-primary"
                                      />
                                      <strong className="break-words font-semibold">
                                        {item.room_name}
                                      </strong>
                                    </span>
                                  </div>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
        {selected && !arrangeMode && (
          <aside className="fixed inset-0 z-[60] overflow-y-auto bg-white shadow-lift xl:sticky xl:inset-auto xl:top-0 xl:self-start xl:overflow-hidden xl:rounded-[8px] xl:border xl:border-emerald-200">
            <div className="bg-[#e9f7ef] bg-[url('/assets/generated/sidebar-mint-canvas.png')] bg-cover p-6">
              <div className="flex items-center justify-between">
                <button
                  className="icon-button bg-white shadow-sm"
                  onClick={() => setSelected(null)}
                  aria-label="Tutup detail jadwal"
                >
                  <Icon name="chevron_right" />
                </button>
                <button
                  className="icon-button bg-white shadow-sm"
                  aria-label="Opsi sesi"
                >
                  <Icon name="more_vert" />
                </button>
              </div>
              <p className="mt-7 text-xs font-bold uppercase tracking-wider text-primary">
                Detail Session
              </p>
              <h2 className="mt-2 text-[30px] font-bold text-primary">
                Detail Jadwal
              </h2>
            </div>
            <div className="space-y-4 p-4 pb-24 sm:p-5 xl:pb-5">
              <div>
                <span className="rounded-full bg-primary px-3 py-1 text-xs font-bold text-white">
                  {selected.subject_name}
                </span>
                <h3 className="mt-3 text-2xl font-bold text-primary">
                  {selected.class_name}
                </h3>
              </div>
              <div className="divide-y rounded-[8px] border border-emerald-100 px-4">
                {[
                  [
                    "Tanggal",
                    dateLabel.format(new Date(selected.start_at)),
                    "calendar_today",
                  ],
                  [
                    "Hari / Waktu",
                    `${dayName.format(new Date(selected.start_at))}, ${clock.format(new Date(selected.start_at))} - ${clock.format(new Date(selected.end_at))}`,
                    "schedule",
                  ],
                  [
                    "Durasi",
                    durationLabel(selected.start_at, selected.end_at),
                    "pending_actions",
                  ],
                  ["Pengajar", selected.teacher_name, "person"],
                  ["Ruang Kelas", selected.room_name, "meeting_room"],
                  ["Jumlah Siswa", `${selected.student_count} siswa`, "groups"],
                  [
                    "Pengulangan",
                    selected.series
                      ? `Pertemuan ke-${selected.sequence}`
                      : "Satu kali",
                    "sync",
                  ],
                ].map(([label, value, icon]) => (
                  <div
                    key={label}
                    className="grid grid-cols-[28px_minmax(78px,0.7fr)_minmax(0,1.3fr)] items-center gap-2 py-3 text-xs sm:grid-cols-[28px_110px_1fr]"
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-50 text-primary">
                      <Icon name={icon} className="text-base" />
                    </span>
                    <span className="text-on-surface-variant">{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
              <div className="grid gap-2">
                {selected.session_id ? (
                  <button
                    className="primary-button rounded-[8px]"
                    onClick={() =>
                      navigate(`/course/sessions/${selected.session_id}`)
                    }
                  >
                    <Icon name="open_in_new" />
                    Lihat Detail Session
                  </button>
                ) : selected.permissions.can_start ? (
                  <button
                    className="primary-button rounded-[8px]"
                    onClick={() => startSession(selected)}
                    disabled={startMutation.isPending}
                  >
                    <Icon name="play_arrow" />
                    {startMutation.isPending ? "Memulai..." : "Mulai Sesi"}
                  </button>
                ) : (
                  <div className="rounded-[8px] bg-surface-container-low p-3 text-center text-xs text-on-surface-variant">
                    Sesi belum dimulai oleh pengajar.
                  </div>
                )}
                {selected.permissions.can_edit && (
                  <button
                    className="secondary-button rounded-[8px]"
                    onClick={() => {
                      const target = window.prompt(
                        "Tanggal baru (YYYY-MM-DD):",
                        selected.start_at.slice(0, 10),
                      );
                      if (!target) return;
                      const future = window.confirm(
                        "Terapkan juga untuk kejadian berikutnya?",
                      );
                      rescheduleMutation.mutate({
                        occurrence: selected,
                        targetDate: target,
                        scope: future ? "this_and_future" : "this",
                      });
                    }}
                  >
                    <Icon name="edit" />
                    Edit Jadwal
                  </button>
                )}
                {selected.permissions.can_edit && (
                  <button
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-[8px] border border-red-300 text-xs font-bold text-red-600"
                    onClick={() => cancelSession(selected)}
                  >
                    <Icon name="delete" className="text-base" />
                    Batalkan Sesi
                  </button>
                )}
              </div>
              {[
                createMutation.error,
                rescheduleMutation.error,
                cancelMutation.error,
                startMutation.error,
              ].find(Boolean) && (
                <p className="text-xs text-red-600">
                  {(
                    [
                      createMutation.error,
                      rescheduleMutation.error,
                      cancelMutation.error,
                      startMutation.error,
                    ].find(Boolean) as ApiError
                  )?.detail?.message || "Aksi gagal diproses."}
                </p>
              )}
            </div>
          </aside>
        )}
      </div>

      {editor && (
        <div
          className="fixed inset-0 z-[70] grid place-items-center bg-black/30 p-0 sm:p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setEditor(null);
          }}
        >
          <form
            className="h-[100dvh] w-full max-w-2xl overflow-y-auto border bg-white p-4 shadow-lift sm:h-auto sm:max-h-[90vh] sm:rounded-[8px] sm:p-6"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              createMutation.mutate(editor);
            }}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-primary">Jadwal Baru</p>
                <h2 className="mt-1 text-xl font-bold">Buat Sesi Course</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={() => setEditor(null)}
              >
                <Icon name="close" />
              </button>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {[
                ["Tanggal", "date", "date"],
                ["Mulai", "start", "time"],
                ["Selesai", "end", "time"],
              ].map(([label, key, type]) => (
                <label key={key} className="text-xs font-bold">
                  {label}
                  <input
                    className="mt-2 h-11 w-full rounded-[8px] border px-3 font-normal"
                    type={type}
                    value={String(editor[key as keyof EditorState])}
                    onChange={(event) =>
                      setEditor((current) =>
                        current
                          ? { ...current, [key]: event.target.value }
                          : current,
                      )
                    }
                    required
                  />
                </label>
              ))}
              <label className="text-xs font-bold">
                Pengulangan
                <input
                  className="mt-2 h-11 w-full rounded-[8px] border px-3 font-normal"
                  type="number"
                  min="1"
                  max="13"
                  value={editor.occurrence_count}
                  onChange={(event) =>
                    setEditor((current) =>
                      current
                        ? {
                            ...current,
                            occurrence_count: Number(event.target.value),
                          }
                        : current,
                    )
                  }
                />
              </label>
              {[
                ["Rombel", "class_group", classes.data || []],
                ["Mapel", "subject", subjects.data || []],
                ["Pengajar", "teacher", teachers.data || []],
                ["Ruangan", "room", rooms.data || []],
              ].map(([label, key, values]) => (
                <label key={String(key)} className="text-xs font-bold">
                  {String(label)}
                  <select
                    className="mt-2 h-11 w-full rounded-[8px] border bg-white px-3 font-normal"
                    value={String(editor[key as keyof EditorState])}
                    onChange={(event) =>
                      setEditor((current) =>
                        current
                          ? { ...current, [String(key)]: event.target.value }
                          : current,
                      )
                    }
                    required
                  >
                    {(
                      values as Array<Teacher | Subject | Room | ClassGroup>
                    ).map((item) => (
                      <option key={item.id} value={item.id}>
                        {"full_name" in item ? item.full_name : item.name}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            {createMutation.error && (
              <p className="mt-4 text-xs text-red-600">
                {createMutation.error instanceof ApiError
                  ? createMutation.error.detail.message
                  : "Jadwal gagal dibuat."}
              </p>
            )}
            <div className="mt-6 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
              <button
                className="h-10 rounded-[8px] border px-4 text-xs font-bold"
                type="button"
                onClick={() => setEditor(null)}
              >
                Batal
              </button>
              <button
                className="h-10 rounded-[8px] bg-primary px-5 text-xs font-bold text-white"
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? "Menyimpan..." : "Simpan Jadwal"}
              </button>
            </div>
          </form>
        </div>
      )}

      {startDraft && (
        <div
          className="fixed inset-0 z-[80] grid place-items-center bg-black/35 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !startMutation.isPending)
              setStartDraft(null);
          }}
        >
          <form
            className="w-full max-w-md rounded-[8px] border border-emerald-100 bg-white p-5 shadow-lift sm:p-6"
            onSubmit={(event) => {
              event.preventDefault();
              const topic = startDraft.topic.trim();
              if (!topic) return;
              startMutation.mutate({
                occurrence: startDraft.occurrence,
                topic,
                reason:
                  user?.role === "ADMIN"
                    ? "Admin memulai sesi melalui halaman Course."
                    : "",
              });
            }}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold text-primary">Mulai Sesi</p>
                <h2 className="mt-1 text-xl font-bold">
                  Isi topik pembelajaran
                </h2>
                <p className="mt-2 text-xs leading-5 text-on-surface-variant">
                  Topik akan langsung tersimpan pada catatan sesi dan tetap
                  dapat diubah di halaman Detail Session.
                </p>
              </div>
              <button
                className="icon-button shrink-0"
                type="button"
                onClick={() => setStartDraft(null)}
                disabled={startMutation.isPending}
                aria-label="Tutup dialog mulai sesi"
              >
                <Icon name="close" />
              </button>
            </div>
            <label className="mt-5 block text-xs font-bold">
              Topik pembelajaran
              <textarea
                className="mt-2 min-h-24 w-full resize-y rounded-[8px] border border-outline-variant/60 px-3 py-3 font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                value={startDraft.topic}
                onChange={(event) =>
                  setStartDraft((current) =>
                    current ? { ...current, topic: event.target.value } : null,
                  )
                }
                maxLength={160}
                placeholder="Contoh: Persamaan kuadrat dan diskriminan"
                autoFocus
                required
              />
            </label>
            {startMutation.error && (
              <p className="mt-3 text-xs font-semibold text-red-600">
                {startMutation.error instanceof ApiError
                  ? startMutation.error.detail.message
                  : "Sesi gagal dimulai."}
              </p>
            )}
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                className="h-11 rounded-[8px] border text-xs font-bold"
                type="button"
                onClick={() => setStartDraft(null)}
                disabled={startMutation.isPending}
              >
                Batal
              </button>
              <button
                className="h-11 rounded-[8px] bg-primary text-xs font-bold text-white disabled:opacity-60"
                type="submit"
                disabled={startMutation.isPending || !startDraft.topic.trim()}
              >
                {startMutation.isPending ? "Memulai..." : "Mulai Sesi"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
