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
import { getSubjectTheme } from "../utils/subjectColors";

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


interface MoveState {
  occurrence: Occurrence;
  targetDate: string;
  start: string;
  end: string;
  room: string;
  scope: "this" | "this_and_future";
}

interface EditScheduleState {
  occurrence: Occurrence;
  date: string;
  start: string;
  end: string;
  class_group: string;
  teacher: string;
  room: string;
}

interface DeleteState {
  occurrence: Occurrence;
  reason: string;
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
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const [replicateOpen, setReplicateOpen] = useState(false);
  const [replicateWeeks, setReplicateWeeks] = useState(2);
  const [skipConflicts, setSkipConflicts] = useState(true);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [moveDraft, setMoveDraft] = useState<MoveState | null>(null);
  const [editDraft, setEditDraft] = useState<EditScheduleState | null>(null);
  const [deleteDraft, setDeleteDraft] = useState<DeleteState | null>(null);
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
  const replicateMutation = useMutation({
    mutationFn: () =>
      apiEnvelope<{
        created_count: number;
        repeat_weeks: number;
        target_start_date: string;
        target_end_date: string;
        skipped_count?: number;
      }>("/api/v1/schedule-series/replicate-week/", {
        method: "POST",
        body: {
          source_from: bounds.from,
          source_to: shift(bounds.to, -1),
          repeat_weeks: replicateWeeks,
          skip_conflicts: skipConflicts,
        },
      }),
    onSuccess: (res: { data: { created_count: number; repeat_weeks: number; target_start_date: string; target_end_date: string; skipped_count?: number } }) => {
      void invalidate();
      setReplicateOpen(false);
      const data = res.data;
      setNotice(
        `Berhasil membuat batch ${data.created_count} jadwal baru untuk ${data.repeat_weeks} periode minggu ke depan (${data.target_start_date} s/d ${data.target_end_date})${data.skipped_count ? ` (${data.skipped_count} dilewati karena bentrok)` : ""}.`,
      );
    },
  });
  const rescheduleMutation = useMutation({
    mutationFn: ({
      occurrence,
      targetDate,
      start,
      end,
      room,
      scope,
    }: {
      occurrence: Occurrence;
      targetDate: string;
      start?: string;
      end?: string;
      room?: string;
      scope: "this" | "this_and_future";
    }) => {
      const startClock = start || occurrence.start_at.slice(11, 16);
      const endClock = end || occurrence.end_at.slice(11, 16);
      return apiEnvelope(
        `/api/v1/schedule-occurrences/${occurrence.id}/reschedule/`,
        {
          method: "POST",
          body: {
            start_at: apiDateTime(targetDate, startClock),
            end_at: apiDateTime(targetDate, endClock),
            room: room || undefined,
            expected_version: occurrence.version,
            scope,
          },
        },
      );
    },
    onSuccess: () => {
      void invalidate();
      setMoveDraft(null);
      setSelected(null);
      setNotice("Sesi berhasil dipindahkan.");
    },
  });

  const editMutation = useMutation({
    mutationFn: (draft: EditScheduleState) => {
      return apiEnvelope(
        `/api/v1/schedule-occurrences/${draft.occurrence.id}/`,
        {
          method: "PATCH",
          body: {
            class_group: draft.class_group,
            teacher: draft.teacher,
            room: draft.room,
            start_at: apiDateTime(draft.date, draft.start),
            end_at: apiDateTime(draft.date, draft.end),
          },
        },
      );
    },
    onSuccess: () => {
      void invalidate();
      setEditDraft(null);
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
      setDeleteDraft(null);
      setSelected(null);
      setNotice("Sesi berhasil dibatalkan tanpa menghapus histori.");
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

  const openCreate = (initialDate?: string, initialStart?: string, initialEnd?: string) =>
    setEditor({
      date: initialDate || selectedDate,
      start: initialStart || "14:00",
      end: initialEnd || "15:30",
      class_group: classes.data?.[0]?.id || "",
      subject: subjects.data?.[0]?.id || "",
      teacher: teachers.data?.[0]?.id || "",
      room: rooms.data?.[0]?.id || "",
      occurrence_count: 1,
    });

  const openMove = (item: Occurrence) => {
    setMoveDraft({
      occurrence: item,
      targetDate: item.start_at.slice(0, 10),
      start: item.start_at.slice(11, 16),
      end: item.end_at.slice(11, 16),
      room: item.room_name || "",
      scope: "this",
    });
  };

  const openEdit = (item: Occurrence) => {
    setEditDraft({
      occurrence: item,
      date: item.start_at.slice(0, 10),
      start: item.start_at.slice(11, 16),
      end: item.end_at.slice(11, 16),
      class_group: item.class_group,
      teacher: item.teacher,
      room: item.room_name || "",
    });
  };

  const openDelete = (item: Occurrence) => {
    setDeleteDraft({
      occurrence: item,
      reason: "Dibatalkan oleh administrator",
    });
  };
  const startSession = (item: Occurrence) => {
    setStartDraft({ occurrence: item, topic: "" });
  };
  const dropOnDay = (targetDate: string) => {
    if (!dragged) return;
    const sourceDate = dragged.start_at.slice(0, 10);
    if (targetDate === sourceDate) return;

    const confirmed = window.confirm(
      `Pindahkan sesi ${dragged.class_name} (${dragged.subject_name}) ke hari ${dayName.format(parseLocal(targetDate))}, ${targetDate}?\n\nKlik OK untuk konfirmasi perpindahan jadwal.`,
    );
    if (!confirmed) return;

    rescheduleMutation.mutate({
      occurrence: dragged,
      targetDate,
      scope: "this",
    });
    setDragged(null);
    setDragOverDate(null);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Manajemen Jadwal"
        description="Kelola jadwal mingguan, pengajar, ruangan, dan pelaksanaan sesi."
        action={
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            {user?.permissions.manage_schedule && (
              <>
                <button
                  className="secondary-button min-w-0 flex-1 rounded-[8px] border-amber-300 bg-amber-50 px-3 text-xs font-bold text-amber-950 hover:bg-amber-100 sm:flex-none"
                  onClick={() => setReplicateOpen(true)}
                  title="Ulangi seluruh jadwal aktif minggu ini ke beberapa periode mendatang"
                >
                  <Icon name="event_repeat" />
                  Ulangi Jadwal Mingguan
                </button>
                <button
                  className={`secondary-button min-w-0 flex-1 rounded-[8px] px-3 text-xs sm:flex-none ${arrangeMode ? "bg-amber-100 text-amber-900 ring-2 ring-amber-400" : ""}`}
                  onClick={() => {
                    setArrangeMode((value) => !value);
                    setSelected(null);
                  }}
                >
                  <Icon name="drag_indicator" />
                  {arrangeMode ? "Selesai Atur" : "Atur Sesi (Drag & Drop)"}
                </button>
              </>
            )}
            <button
              className="primary-button min-w-0 flex-1 rounded-[8px] px-3 text-xs sm:flex-none"
              onClick={() => openCreate()}
              disabled={!user?.permissions.manage_schedule}
            >
              <Icon name="add" />
              Buat Jadwal Baru
            </button>
          </div>
        }
      />
      {notice && (
        <div className="flex items-center justify-between rounded-[8px] border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-950">
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
          <label className="flex h-full min-w-0 flex-1 items-center justify-center gap-2 border-x px-2 text-xs font-bold text-amber-600 xl:flex-none xl:px-3">
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
            className={`rounded-[6px] px-5 text-xs font-bold ${mode === "week" ? "bg-[#18191B] text-amber-400 shadow-xs" : "text-stone-600 hover:text-neutral-900"}`}
            onClick={() => setMode("week")}
          >
            <Icon
              name="format_list_bulleted"
              className="mr-1 inline text-base"
            />
            Minggu
          </button>
          <button
            className={`rounded-[6px] px-5 text-xs font-bold ${mode === "day" ? "bg-[#18191B] text-amber-400 shadow-xs" : "text-stone-600 hover:text-neutral-900"}`}
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
        <div className="space-y-2">
          <div className="flex items-center justify-between rounded-[8px] border border-amber-300 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-900 shadow-sm">
            <div className="flex items-center gap-2">
              <Icon name="drag_indicator" className="text-lg text-amber-700" />
              <span>
                <strong>Mode Atur Jadwal Aktif:</strong> Tarik (drag) kartu kelas lalu lepaskan (drop) pada hari tujuan yang diinginkan.
              </span>
            </div>
            <button
              className="rounded bg-amber-200 px-2.5 py-1 text-[11px] font-bold text-amber-900 hover:bg-amber-300"
              onClick={() => setArrangeMode(false)}
            >
              Selesai
            </button>
          </div>
          {rescheduleMutation.error && (
            <div className="flex items-center justify-between rounded-[8px] border border-red-300 bg-red-50 px-4 py-3 text-xs font-bold text-red-700">
              <div className="flex items-center gap-2">
                <Icon name="error" className="text-base" />
                <span>
                  {rescheduleMutation.error instanceof ApiError
                    ? rescheduleMutation.error.detail.message
                    : "Jadwal gagal dipindahkan."}
                </span>
              </div>
              <button onClick={() => rescheduleMutation.reset()} className="text-red-700 hover:text-red-900">
                <Icon name="close" className="text-sm" />
              </button>
            </div>
          )}
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
                className={`rounded-[8px] border bg-white p-3 shadow-soft transition-colors sm:p-4 ${
                  dragOverDate === date && arrangeMode
                    ? "border-amber-500 bg-amber-50/80 ring-2 ring-amber-500/40"
                    : "border-stone-200"
                }`}
                onDragOver={(event) => {
                  if (arrangeMode) {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    if (dragOverDate !== date) setDragOverDate(date);
                  }
                }}
                onDragEnter={(event) => {
                  if (arrangeMode) {
                    event.preventDefault();
                    setDragOverDate(date);
                  }
                }}
                onDragLeave={(event) => {
                  if (arrangeMode && event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) {
                    setDragOverDate(null);
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragOverDate(null);
                  dropOnDay(date);
                }}
              >
                <div className="flex items-center gap-3 border-b border-stone-200 pb-3 sm:gap-4">
                  <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-[8px] bg-[#18191B] text-amber-400 font-bold shadow-xs">
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
                      className="inline-flex min-h-10 shrink-0 items-center gap-1 text-xs font-bold text-amber-600 sm:gap-2"
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
                          className="overflow-hidden rounded-[8px] border border-stone-200"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 bg-stone-100/90 border-b border-stone-200 px-3 py-2 text-neutral-900">
                            <div className="flex items-center gap-3">
                              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-dark text-amber-400 shadow-xs">
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
                            <span className="rounded-full rounded-full border border-stone-200 bg-white px-2.5 py-0.5 text-[10px] font-bold text-neutral-800 shadow-xs">
                              {slotItems.length} kelas paralel
                            </span>
                          </div>
                          <div className="slot-scroll-container p-2.5">
                            {slotItems.map((item) => {
                              const theme = getSubjectTheme(item.subject_name);
                              const isSelected = selected?.id === item.id;
                              return (
                                <div
                                  key={item.id}
                                  draggable={arrangeMode}
                                  onDragStart={(event) => {
                                    if (!arrangeMode) return;
                                    event.dataTransfer.setData("text/plain", item.id);
                                    event.dataTransfer.effectAllowed = "move";
                                    setDragged(item);
                                  }}
                                  onDragEnd={() => {
                                    setDragged(null);
                                    setDragOverDate(null);
                                  }}
                                  onClick={() => !arrangeMode && setSelected(item)}
                                  style={{
                                    backgroundColor: theme.bgPastel,
                                    borderLeftColor: theme.hex,
                                    borderLeftWidth: "4px",
                                    borderTopColor: theme.borderColor + "40",
                                    borderRightColor: theme.borderColor + "40",
                                    borderBottomColor: theme.borderColor + "40",
                                  }}
                                  className={`group relative flex flex-col justify-between rounded-lg border p-3 text-left shadow-sm transition hover:shadow-soft cursor-pointer min-w-[280px] max-w-[340px] flex-shrink-0 snap-start ${
                                    arrangeMode ? "cursor-grab active:cursor-grabbing" : ""
                                  } ${dragged?.id === item.id ? "opacity-40 ring-2 ring-primary" : ""} ${
                                    isSelected ? "ring-2 ring-brand-dark" : ""
                                  }`}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <span
                                      className="rounded-md px-2.5 py-1 text-xs font-bold leading-5"
                                      style={{
                                        backgroundColor: theme.badgeBg,
                                        color: theme.badgeText,
                                      }}
                                    >
                                      {item.subject_name || "Mapel"}
                                    </span>
                                    <div
                                      className="flex items-center gap-1"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {user?.permissions.manage_schedule && (
                                        <>
                                          <button
                                            className="h-7 w-7 rounded bg-white/80 p-1 text-on-surface hover:bg-white hover:text-amber-600 shadow-sm"
                                            onClick={() => openMove(item)}
                                            title="Pindahkan sesi ini"
                                          >
                                            <Icon name="arrow_forward" className="text-xs" />
                                          </button>
                                          <button
                                            className="h-7 w-7 rounded bg-white/80 p-1 text-on-surface hover:bg-white hover:text-amber-600 shadow-sm"
                                            onClick={() => openEdit(item)}
                                            title="Edit sesi ini"
                                          >
                                            <Icon name="edit" className="text-xs" />
                                          </button>
                                          <button
                                            className="h-7 w-7 rounded bg-white/80 p-1 text-on-surface hover:bg-white hover:text-red-600 shadow-sm"
                                            onClick={() => openDelete(item)}
                                            title="Hapus sesi ini"
                                          >
                                            <Icon name="delete" className="text-xs" />
                                          </button>
                                        </>
                                      )}
                                      <button
                                        className="h-7 w-7 rounded bg-white/80 p-1 text-on-surface hover:bg-white hover:text-amber-600 shadow-sm"
                                        onClick={() => setSelected(item)}
                                        title="Detail lengkap"
                                      >
                                        <Icon name="more_vert" className="text-xs" />
                                      </button>
                                    </div>
                                  </div>
                                  <div className="mt-2.5">
                                    <p className="min-w-0 break-words text-base font-bold leading-6 text-on-surface">
                                      {item.class_name}
                                    </p>
                                    <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-xs text-on-surface-variant">
                                      <span className="flex min-w-0 items-center gap-1 text-on-surface">
                                        <Icon name="person" className="text-xs text-on-surface" />
                                        <strong className="font-semibold">{item.teacher_name}</strong>
                                      </span>
                                      <span className="flex min-w-0 items-center gap-1 text-on-surface">
                                        <Icon name="meeting_room" className="text-xs text-on-surface" />
                                        <strong className="font-semibold">{item.room_name}</strong>
                                      </span>
                                    </div>
                                  </div>
                                  <div className="mt-3 flex items-center justify-between border-t border-black/5 pt-2 text-[10px] text-on-surface-variant">
                                    <span>{item.student_count} Siswa Terdaftar</span>
                                    {item.session_id ? (
                                      <span className="font-bold text-amber-800">Sesi Berjalan</span>
                                    ) : (
                                      <span className="font-medium">Terjadwal</span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
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
          <aside className="fixed inset-0 z-[60] overflow-y-auto bg-white shadow-lift xl:sticky xl:inset-auto xl:top-0 xl:self-start xl:overflow-hidden xl:rounded-[8px] xl:border xl:border-stone-200">
            <div className="bg-[#18191B] text-white p-6">
              <div className="flex items-center justify-between">
                <button
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition"
                  onClick={() => setSelected(null)}
                  aria-label="Tutup detail jadwal"
                >
                  <Icon name="chevron_right" />
                </button>
                <button
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition"
                  aria-label="Opsi sesi"
                >
                  <Icon name="more_vert" />
                </button>
              </div>
              <p className="mt-7 text-xs font-bold uppercase tracking-wider text-amber-400">
                Detail Session
              </p>
              <h2 className="mt-2 text-[30px] font-bold text-white">
                Detail Jadwal
              </h2>
            </div>
            <div className="space-y-4 p-4 pb-24 sm:p-5 xl:pb-5">
              <div>
                <span
                  className="rounded-full bg-amber-400 px-3 py-1 text-xs font-bold text-neutral-950"
                  style={{ backgroundColor: "#F59E0B", color: "#18191B" }}
                >
                  {selected.subject_name}
                </span>
                <h3 className="mt-3 text-2xl font-bold text-neutral-900">
                  {selected.class_name}
                </h3>
              </div>
              <div className="divide-y rounded-[8px] border border-stone-200 px-4">
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
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-50 text-amber-700">
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
                    style={{ backgroundColor: "#F59E0B", color: "#18191B" }}
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
                    style={{ backgroundColor: "#F59E0B", color: "#18191B" }}
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
                  <>
                    <button
                      className="secondary-button rounded-lg w-full"
                      onClick={() => openMove(selected)}
                    >
                      <Icon name="arrow_forward" />
                      Pindahkan Sesi Ini
                    </button>
                    <button
                      className="secondary-button rounded-lg w-full"
                      onClick={() => openEdit(selected)}
                    >
                      <Icon name="edit" />
                      Edit Data Sesi
                    </button>
                    <button
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-red-300 bg-red-50 text-xs font-bold text-red-700 hover:bg-red-100"
                      onClick={() => openDelete(selected)}
                    >
                      <Icon name="delete" className="text-base" />
                      Hapus / Batalkan Sesi
                    </button>
                  </>
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
                <p className="text-xs font-bold uppercase tracking-wider text-amber-600">Jadwal Baru</p>
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
                className="h-10 rounded-lg bg-amber-400 px-5 text-xs font-bold text-neutral-950 shadow-sm hover:bg-amber-500"
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
            className="w-full max-w-md rounded-[8px] border border-stone-200 bg-white p-5 shadow-lift sm:p-6"
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
                <p className="text-xs font-bold uppercase tracking-wider text-amber-600">Mulai Sesi</p>
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
                className="h-11 rounded-lg bg-amber-400 text-xs font-bold text-neutral-950 shadow-sm hover:bg-amber-500 disabled:opacity-60"
                type="submit"
                disabled={startMutation.isPending || !startDraft.topic.trim()}
              >
                {startMutation.isPending ? "Memulai..." : "Mulai Sesi"}
              </button>
            </div>
          </form>
        </div>
      )}
      
      {/* DIALOG: Pindahkan Sesi */}
      {moveDraft && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/40 p-4">
          <form
            className="w-full max-w-md rounded-xl border border-outline-variant bg-white p-5 shadow-lift"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              rescheduleMutation.mutate(moveDraft);
            }}
          >
            <div className="flex items-center justify-between border-b border-outline-variant pb-3">
              <div>
                <h2 className="text-base font-bold text-on-surface">Pindahkan Jadwal Sesi</h2>
                <p className="text-xs text-on-surface-variant">
                  {moveDraft.occurrence.class_name} ({moveDraft.occurrence.subject_name})
                </p>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={() => setMoveDraft(null)}
              >
                <Icon name="close" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <label className="block text-xs font-bold text-on-surface">
                Tanggal Tujuan Baru
                <input
                  className="mt-1 h-10 w-full rounded-lg border border-outline-variant px-3 font-normal"
                  type="date"
                  value={moveDraft.targetDate}
                  onChange={(e) => setMoveDraft((c) => c ? { ...c, targetDate: e.target.value } : c)}
                  required
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-bold text-on-surface">
                  Jam Mulai
                  <input
                    className="mt-1 h-10 w-full rounded-lg border border-outline-variant px-3 font-normal"
                    type="time"
                    value={moveDraft.start}
                    onChange={(e) => setMoveDraft((c) => c ? { ...c, start: e.target.value } : c)}
                    required
                  />
                </label>
                <label className="block text-xs font-bold text-on-surface">
                  Jam Selesai
                  <input
                    className="mt-1 h-10 w-full rounded-lg border border-outline-variant px-3 font-normal"
                    type="time"
                    value={moveDraft.end}
                    onChange={(e) => setMoveDraft((c) => c ? { ...c, end: e.target.value } : c)}
                    required
                  />
                </label>
              </div>

              <label className="block text-xs font-bold text-on-surface">
                Ruangan Tujuan
                <select
                  className="mt-1 h-10 w-full rounded-lg border border-outline-variant bg-white px-3 font-normal"
                  value={moveDraft.room}
                  onChange={(e) => setMoveDraft((c) => c ? { ...c, room: e.target.value } : c)}
                >
                  <option value={moveDraft.occurrence.room_name}>{moveDraft.occurrence.room_name} (Tetap)</option>
                  {rooms.data?.map((r) => (
                    <option key={r.id} value={r.name}>{r.name}</option>
                  ))}
                </select>
              </label>

              {moveDraft.occurrence.series && (
                <div className="rounded-lg border border-outline-variant bg-surface-container-low p-3 text-xs">
                  <p className="font-bold text-on-surface">Cakupan Pemindahan:</p>
                  <div className="mt-2 space-y-1">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="scope"
                        checked={moveDraft.scope === "this"}
                        onChange={() => setMoveDraft((c) => c ? { ...c, scope: "this" } : c)}
                      />
                      <span>Hanya sesi tanggal ini saja</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="scope"
                        checked={moveDraft.scope === "this_and_future"}
                        onChange={() => setMoveDraft((c) => c ? { ...c, scope: "this_and_future" } : c)}
                      />
                      <span>Sesi ini dan semua sesi berulang berikutnya</span>
                    </label>
                  </div>
                </div>
              )}
            </div>

            {rescheduleMutation.error && (
              <div className="mt-3 rounded-lg border border-red-300 bg-red-50 p-3 text-xs font-semibold text-red-700">
                {rescheduleMutation.error instanceof ApiError
                  ? rescheduleMutation.error.detail.message
                  : "Gagal memindahkan jadwal."}
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2 border-t border-outline-variant pt-3">
              <button
                className="secondary-button"
                type="button"
                onClick={() => setMoveDraft(null)}
              >
                Batal
              </button>
              <button
                className="primary-button"
                type="submit"
                disabled={rescheduleMutation.isPending}
              >
                {rescheduleMutation.isPending ? "Memindahkan..." : "Konfirmasi Pindah"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* DIALOG: Edit Sesi */}
      {editDraft && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/40 p-4">
          <form
            className="w-full max-w-md rounded-xl border border-outline-variant bg-white p-5 shadow-lift"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              editMutation.mutate(editDraft);
            }}
          >
            <div className="flex items-center justify-between border-b border-outline-variant pb-3">
              <div>
                <h2 className="text-base font-bold text-on-surface">Edit Data Jadwal Sesi</h2>
                <p className="text-xs text-on-surface-variant">Ubah penugasan guru, rombel, atau ruangan.</p>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={() => setEditDraft(null)}
              >
                <Icon name="close" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <label className="block text-xs font-bold text-on-surface">
                Rombel / Kelas
                <select
                  className="mt-1 h-10 w-full rounded-lg border border-outline-variant bg-white px-3 font-normal"
                  value={editDraft.class_group}
                  onChange={(e) => setEditDraft((c) => c ? { ...c, class_group: e.target.value } : c)}
                  required
                >
                  {classes.data?.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>

              <label className="block text-xs font-bold text-on-surface">
                Pengajar
                <select
                  className="mt-1 h-10 w-full rounded-lg border border-outline-variant bg-white px-3 font-normal"
                  value={editDraft.teacher}
                  onChange={(e) => setEditDraft((c) => c ? { ...c, teacher: e.target.value } : c)}
                  required
                >
                  {teachers.data?.map((t) => (
                    <option key={t.id} value={t.id}>{t.full_name}</option>
                  ))}
                </select>
              </label>

              <label className="block text-xs font-bold text-on-surface">
                Ruangan
                <select
                  className="mt-1 h-10 w-full rounded-lg border border-outline-variant bg-white px-3 font-normal"
                  value={editDraft.room}
                  onChange={(e) => setEditDraft((c) => c ? { ...c, room: e.target.value } : c)}
                  required
                >
                  {rooms.data?.map((r) => (
                    <option key={r.id} value={r.name}>{r.name}</option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-bold text-on-surface">
                  Jam Mulai
                  <input
                    className="mt-1 h-10 w-full rounded-lg border border-outline-variant px-3 font-normal"
                    type="time"
                    value={editDraft.start}
                    onChange={(e) => setEditDraft((c) => c ? { ...c, start: e.target.value } : c)}
                    required
                  />
                </label>
                <label className="block text-xs font-bold text-on-surface">
                  Jam Selesai
                  <input
                    className="mt-1 h-10 w-full rounded-lg border border-outline-variant px-3 font-normal"
                    type="time"
                    value={editDraft.end}
                    onChange={(e) => setEditDraft((c) => c ? { ...c, end: e.target.value } : c)}
                    required
                  />
                </label>
              </div>
            </div>

            {editMutation.error && (
              <div className="mt-3 rounded-lg border border-red-300 bg-red-50 p-3 text-xs font-semibold text-red-700">
                {editMutation.error instanceof ApiError
                  ? editMutation.error.detail.message
                  : "Gagal menyimpan perubahan."}
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2 border-t border-outline-variant pt-3">
              <button
                className="secondary-button"
                type="button"
                onClick={() => setEditDraft(null)}
              >
                Batal
              </button>
              <button
                className="primary-button"
                type="submit"
                disabled={editMutation.isPending}
              >
                {editMutation.isPending ? "Menyimpan..." : "Simpan Perubahan"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* DIALOG: Hapus Sesi */}
      {deleteDraft && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl border border-outline-variant bg-white p-5 shadow-lift">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-red-600">
                <Icon name="delete" />
              </span>
              <div>
                <h3 className="text-base font-bold text-on-surface">Hapus Sesi Jadwal?</h3>
                <p className="text-xs text-on-surface-variant">
                  {deleteDraft.occurrence.class_name} ({deleteDraft.occurrence.subject_name})
                </p>
              </div>
            </div>

            <p className="mt-3 text-xs text-on-surface-variant leading-relaxed">
              Sesi pada tanggal{" "}
              <strong>{dateLabel.format(new Date(deleteDraft.occurrence.start_at))}</strong>{" "}
              akan dibatalkan. Histori kehadiran dan data siswa tetap tersimpan aman.
            </p>

            <label className="mt-3 block text-xs font-bold text-on-surface">
              Alasan Pembatalan
              <input
                className="mt-1 h-9 w-full rounded-lg border border-outline-variant px-3 text-xs font-normal"
                value={deleteDraft.reason}
                onChange={(e) => setDeleteDraft((c) => c ? { ...c, reason: e.target.value } : c)}
                placeholder="Misal: Guru berhalangan hadir / libur"
                required
              />
            </label>

            {cancelMutation.error && (
              <p className="mt-2 text-xs font-bold text-red-600">
                {cancelMutation.error instanceof ApiError
                  ? cancelMutation.error.detail.message
                  : "Gagal membatalkan sesi."}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2 border-t border-outline-variant pt-3">
              <button
                className="secondary-button"
                type="button"
                onClick={() => setDeleteDraft(null)}
              >
                Batal
              </button>
              <button
                className="inline-flex h-9 items-center justify-center rounded-lg bg-red-600 px-4 text-xs font-bold text-white hover:bg-red-700"
                onClick={() => cancelMutation.mutate(deleteDraft)}
                disabled={cancelMutation.isPending}
              >
                {cancelMutation.isPending ? "Menghapus..." : "Ya, Hapus Sesi"}
              </button>
            </div>
          </div>
        </div>
      )}

      {replicateOpen && (
        <div
          className="fixed inset-0 z-[80] grid place-items-center bg-black/40 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !replicateMutation.isPending) setReplicateOpen(false);
          }}
        >
          <form
            className="w-full max-w-lg rounded-[8px] border border-stone-200 bg-white p-5 shadow-lift sm:p-6"
            onSubmit={(e) => {
              e.preventDefault();
              replicateMutation.mutate();
            }}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-amber-600">Batch Scheduling</p>
                <h2 className="mt-1 text-xl font-bold">Ulangi Jadwal Minggu Ini</h2>
                <p className="mt-1 text-xs leading-5 text-on-surface-variant">
                  Duplikasi seluruh jadwal kelas aktif pada minggu ini ke beberapa minggu/periode mendatang secara otomatis.
                </p>
              </div>
              <button
                className="icon-button shrink-0"
                type="button"
                onClick={() => setReplicateOpen(false)}
                disabled={replicateMutation.isPending}
              >
                <Icon name="close" />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div className="rounded-[8px] border border-amber-200 bg-amber-50/70 p-3.5 text-xs">
                <p className="font-bold text-amber-950">Periode Sumber Jadwal:</p>
                <p className="mt-1 font-semibold text-amber-700">
                  {bounds.from} s/d {shift(bounds.to, -1)} ({occurrences.data?.length || 0} jadwal kelas terdaftar)
                </p>
              </div>

              <label className="block text-xs font-bold">
                Ulangi Ke Berapa Minggu Mendatang?
                <select
                  className="mt-2 h-11 w-full rounded-[8px] border border-outline-variant/60 bg-white px-3 font-normal outline-none focus:border-primary"
                  value={replicateWeeks}
                  onChange={(e) => setReplicateWeeks(Number(e.target.value))}
                >
                  <option value={1}>1 Minggu ke Depan</option>
                  <option value={2}>2 Minggu ke Depan</option>
                  <option value={3}>3 Minggu ke Depan</option>
                  <option value={4}>4 Minggu ke Depan (1 Bulan)</option>
                  <option value={6}>6 Minggu ke Depan</option>
                  <option value={8}>8 Minggu ke Depan (2 Bulan)</option>
                </select>
              </label>

              <label className="flex items-center gap-2 text-xs font-medium text-on-surface cursor-pointer">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500"
                  checked={skipConflicts}
                  onChange={(e) => setSkipConflicts(e.target.checked)}
                />
                <span>Lewati otomatis jika ditemukan benturan jadwal (Recommended)</span>
              </label>
            </div>

            {replicateMutation.error && (
              <p className="mt-4 text-xs font-semibold text-red-600">
                {replicateMutation.error instanceof ApiError
                  ? replicateMutation.error.detail.message
                  : "Gagal menduplikasi jadwal mingguan."}
              </p>
            )}

            <div className="mt-6 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
              <button
                className="h-10 rounded-[8px] border px-4 text-xs font-bold"
                type="button"
                onClick={() => setReplicateOpen(false)}
                disabled={replicateMutation.isPending}
              >
                Batal
              </button>
              <button
                className="h-10 rounded-lg bg-amber-400 px-5 text-xs font-bold text-neutral-950 shadow-sm hover:bg-amber-500 disabled:opacity-60"
                type="submit"
                disabled={replicateMutation.isPending}
              >
                {replicateMutation.isPending ? "Memproses Batch..." : "Mulai Duplikasi"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}