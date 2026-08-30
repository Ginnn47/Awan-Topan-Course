import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError, apiEnvelope, apiGet, idempotencyKey } from "../api/client";
import { queryKeys } from "../api/queryKeys";
import type { AttendanceRow, Occurrence, TeachingSession } from "../api/types";
import { Icon, PageHeader } from "../components/ui";

const dateFormat = new Intl.DateTimeFormat("id-ID", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const clock = new Intl.DateTimeFormat("id-ID", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const statusOptions: AttendanceRow["status"][] = [
  "UNSET",
  "PRESENT",
  "PERMIT",
  "SICK",
  "ABSENT",
];
const statusLabel: Record<AttendanceRow["status"], string> = {
  UNSET: "Belum Diisi",
  PRESENT: "Hadir",
  PERMIT: "Izin",
  SICK: "Sakit",
  ABSENT: "Alfa",
};
const statusTone: Record<AttendanceRow["status"], string> = {
  UNSET: "bg-gray-100 text-gray-700",
  PRESENT: "bg-emerald-100 text-emerald-700",
  PERMIT: "bg-blue-100 text-blue-700",
  SICK: "bg-amber-100 text-amber-700",
  ABSENT: "bg-red-100 text-red-700",
};

function localInput(value: string) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function jakartaDateTime(value: string) {
  return `${value}:00+07:00`;
}

export default function SessionDetailApi() {
  const { sessionId = "" } = useParams();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [notesDirty, setNotesDirty] = useState(false);
  const [attendanceDirty, setAttendanceDirty] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [mobileSection, setMobileSection] = useState<"details" | "attendance">(
    "details",
  );
  const [notice, setNotice] = useState("");
  const [notes, setNotes] = useState({
    topic: "",
    material_description: "",
    learning_notes: "",
    homework: "",
  });
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [scheduleDraft, setScheduleDraft] = useState({
    start_at: "",
    end_at: "",
    scope: "this",
  });
  const session = useQuery({
    queryKey: queryKeys.session(sessionId),
    queryFn: ({ signal }) =>
      apiGet<TeachingSession>(`/api/v1/sessions/${sessionId}/`, signal),
    enabled: Boolean(sessionId),
  });
  const occurrence = useQuery({
    queryKey: ["scheduling", "detail", session.data?.occurrence_id],
    queryFn: ({ signal }) =>
      apiGet<Occurrence>(
        `/api/v1/schedule-occurrences/${session.data?.occurrence_id}/`,
        signal,
      ),
    enabled: Boolean(session.data?.occurrence_id),
  });

  useEffect(() => {
    if (!session.data || notesDirty) return;
    setNotes({
      topic: session.data.topic,
      material_description: session.data.material_description,
      learning_notes: session.data.learning_notes,
      homework: session.data.homework,
    });
  }, [session.data, notesDirty]);
  useEffect(() => {
    if (session.data && !attendanceDirty)
      setAttendance(session.data.student_attendance);
  }, [session.data, attendanceDirty]);
  useEffect(() => {
    if (session.data)
      setScheduleDraft({
        start_at: localInput(session.data.start_at),
        end_at: localInput(session.data.end_at),
        scope: "this",
      });
  }, [session.data]);

  const refresh = (value?: TeachingSession) => {
    if (value) queryClient.setQueryData(queryKeys.session(sessionId), value);
    void queryClient.invalidateQueries({
      queryKey: queryKeys.session(sessionId),
    });
    void queryClient.invalidateQueries({ queryKey: ["scheduling"] });
  };
  const notesMutation = useMutation({
    mutationFn: () =>
      apiEnvelope<TeachingSession>(
        `/api/v1/sessions/${sessionId}/lesson-report/`,
        {
          method: "PUT",
          body: { ...notes, expected_version: session.data?.version },
        },
      ).then((response) => response.data),
    onSuccess: (value) => {
      setNotesDirty(false);
      setNotice("Catatan materi berhasil disimpan.");
      refresh(value);
    },
  });
  const attendanceMutation = useMutation({
    mutationFn: () =>
      apiEnvelope<TeachingSession>(
        `/api/v1/sessions/${sessionId}/attendance/`,
        {
          method: "PUT",
          body: {
            expected_version: session.data?.version,
            attendance: attendance.map((item) => ({
              id: item.id,
              status: item.status,
              note: item.note,
            })),
          },
        },
      ).then((response) => response.data),
    onSuccess: (value) => {
      setAttendanceDirty(false);
      setNotice("Absensi seluruh siswa berhasil disimpan.");
      refresh(value);
    },
  });
  const completeMutation = useMutation({
    mutationFn: () =>
      apiEnvelope<TeachingSession>(`/api/v1/sessions/${sessionId}/complete/`, {
        method: "POST",
        idempotencyKey: idempotencyKey(),
        body: { expected_version: session.data?.version },
      }).then((response) => response.data),
    onSuccess: (value) => {
      setNotice("Sesi telah diselesaikan dan dikunci sebagai histori.");
      refresh(value);
    },
  });
  const reopenMutation = useMutation({
    mutationFn: (reason: string) =>
      apiEnvelope<TeachingSession>(`/api/v1/sessions/${sessionId}/reopen/`, {
        method: "POST",
        body: { reason },
      }).then((response) => response.data),
    onSuccess: (value) => {
      setNotice("Sesi dibuka kembali untuk koreksi.");
      refresh(value);
    },
  });
  const scheduleMutation = useMutation({
    mutationFn: () =>
      apiEnvelope<Occurrence[]>(
        `/api/v1/schedule-occurrences/${session.data?.occurrence_id}/reschedule/`,
        {
          method: "POST",
          body: {
            start_at: jakartaDateTime(scheduleDraft.start_at),
            end_at: jakartaDateTime(scheduleDraft.end_at),
            expected_version: occurrence.data?.version,
            scope: scheduleDraft.scope,
          },
        },
      ).then((response) => response.data),
    onSuccess: () => {
      setEditorOpen(false);
      setNotice("Identitas jadwal berhasil diperbarui.");
      refresh();
      void occurrence.refetch();
    },
  });
  const uploadMutation = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return apiEnvelope(`/api/v1/sessions/${sessionId}/attachments/`, {
        method: "POST",
        body: form,
      });
    },
    onSuccess: () => {
      setNotice("Lampiran materi berhasil diunggah.");
      refresh();
    },
  });

  const visible = useMemo(
    () =>
      attendance.filter(
        (item) =>
          item.student_name_snapshot
            .toLowerCase()
            .includes(search.trim().toLowerCase()) ||
          item.student_code_snapshot
            .toLowerCase()
            .includes(search.trim().toLowerCase()),
      ),
    [attendance, search],
  );
  const counts = useMemo(
    () =>
      attendance.reduce<Record<string, number>>(
        (result, item) => ({
          ...result,
          [item.status]: (result[item.status] || 0) + 1,
        }),
        {},
      ),
    [attendance],
  );
  const canComplete = Boolean(
    session.data &&
    !notesDirty &&
    !attendanceDirty &&
    notes.topic.trim() &&
    notes.material_description.trim() &&
    !attendance.some((item) => item.status === "UNSET"),
  );
  const mutationError = [
    notesMutation.error,
    attendanceMutation.error,
    completeMutation.error,
    reopenMutation.error,
    scheduleMutation.error,
    uploadMutation.error,
  ].find(Boolean);

  if (session.isLoading)
    return (
      <div className="rounded-[8px] border bg-white p-10 text-center text-sm">
        Memuat detail sesi...
      </div>
    );
  if (session.isError || !session.data)
    return (
      <div className="rounded-[8px] border border-red-200 bg-red-50 p-5 text-sm text-red-700">
        <p className="font-bold">Session tidak dapat dibuka.</p>
        <Link className="mt-3 inline-block font-bold underline" to="/course">
          Kembali ke Course
        </Link>
      </div>
    );
  const detail = session.data;

  return (
    <div className="space-y-5">
      <div className="text-xs text-on-surface-variant">
        <Link className="font-bold text-primary" to="/course">
          Schedules
        </Link>
        <span className="mx-2">›</span>
        {detail.class_name}
        <span className="mx-2">›</span>Session Details
      </div>
      <PageHeader
        title="Session Detail"
        description={`${detail.subject_name} · ${detail.class_name}`}
        action={
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            {detail.permissions.can_edit &&
              occurrence.data?.permissions.can_edit && (
                <button
                  className="secondary-button min-w-0 flex-1 rounded-[8px] px-3 text-xs sm:flex-none"
                  onClick={() => setEditorOpen((value) => !value)}
                >
                  <Icon name="edit" />
                  Edit Jadwal
                </button>
              )}
            {detail.occurrence_status === "IN_PROGRESS" && (
              <button
                className="primary-button min-w-0 flex-1 rounded-[8px] px-3 text-xs disabled:opacity-50 sm:flex-none"
                disabled={!canComplete || completeMutation.isPending}
                onClick={() => completeMutation.mutate()}
              >
                <Icon name="task_alt" />
                Selesaikan Sesi
              </button>
            )}
            {detail.permissions.can_reopen && (
              <button
                className="secondary-button min-w-0 flex-1 rounded-[8px] px-3 text-xs sm:flex-none"
                onClick={() => {
                  const reason = window.prompt("Alasan koreksi sesi:")?.trim();
                  if (reason) reopenMutation.mutate(reason);
                }}
              >
                <Icon name="restart_alt" />
                Buka Koreksi
              </button>
            )}
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
      {detail.occurrence_status === "IN_PROGRESS" && (
        <div className="rounded-[8px] border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          <div className="flex gap-3">
            <Icon name="info" />
            <div>
              <p className="font-bold">Pencatatan sesi sedang berlangsung</p>
              <p className="mt-1 text-xs leading-5">
                Isi dan simpan absensi seluruh siswa, lalu simpan topik serta
                deskripsi materi. Sesi tidak dapat diselesaikan selama masih ada
                perubahan yang belum disimpan.
              </p>
              <button
                className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-[7px] bg-blue-700 px-3 text-xs font-bold text-white xl:hidden"
                onClick={() => setMobileSection("attendance")}
              >
                <Icon name="groups" className="text-base" />
                Isi Absensi Sekarang
              </button>
            </div>
          </div>
        </div>
      )}
      {mutationError && (
        <div className="rounded-[8px] border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700">
          {mutationError instanceof ApiError
            ? mutationError.detail.message
            : "Perubahan gagal diproses."}
        </div>
      )}

      <nav className="sticky top-0 z-20 grid grid-cols-2 gap-1 rounded-[8px] border border-emerald-200 bg-white/95 p-1.5 shadow-soft backdrop-blur-xl xl:hidden">
        <button
          className={`flex min-h-11 items-center justify-center gap-2 rounded-[7px] px-2 text-xs font-bold ${mobileSection === "details" ? "bg-primary text-white" : "text-on-surface-variant"}`}
          onClick={() => setMobileSection("details")}
        >
          <Icon name="info" className="text-base" />
          Info & Materi
          {notesDirty && <span className="h-2 w-2 rounded-full bg-amber-400" />}
        </button>
        <button
          className={`flex min-h-11 items-center justify-center gap-2 rounded-[7px] px-2 text-xs font-bold ${mobileSection === "attendance" ? "bg-primary text-white" : "text-on-surface-variant"}`}
          onClick={() => setMobileSection("attendance")}
        >
          <Icon name="groups" className="text-base" />
          Absensi
          <span
            className={`rounded-full px-1.5 py-0.5 text-[9px] ${mobileSection === "attendance" ? "bg-white/20 text-white" : "bg-emerald-100 text-primary"}`}
          >
            {attendance.length}
          </span>
        </button>
      </nav>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
        <main
          className={`${mobileSection === "details" ? "block" : "hidden"} min-w-0 space-y-5 xl:block`}
        >
          <section className="overflow-hidden rounded-[8px] border border-emerald-100 bg-white shadow-soft">
            <div className="bg-gradient-to-r from-[#dff5e8] via-[#eef8ef] to-[#e5f2e9] p-4 sm:p-6">
              <div className="flex flex-col justify-between gap-5 sm:flex-row">
                <div>
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-bold text-primary">
                    {detail.occurrence_status === "COMPLETED"
                      ? "Completed Session"
                      : "Active Session"}
                  </span>
                  <h2 className="mt-4 text-2xl font-bold">
                    {detail.subject_name}
                  </h2>
                  <p className="mt-1 text-sm font-semibold text-primary">
                    {detail.class_name}
                  </p>
                </div>
                <div className="rounded-[8px] border border-white/80 bg-white/80 p-4">
                  <p className="text-[10px] text-on-surface-variant">
                    Pengajar
                  </p>
                  <p className="mt-1 text-sm font-bold">
                    {detail.teacher_name}
                  </p>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-2 text-xs sm:mt-6 sm:grid-cols-3 sm:gap-3">
                <div className="rounded-[7px] border border-white/80 bg-white/65 p-3 sm:border-0 sm:bg-transparent sm:p-0">
                  <p className="text-on-surface-variant">Waktu</p>
                  <p className="mt-1 font-bold">
                    {clock.format(new Date(detail.start_at))} -{" "}
                    {clock.format(new Date(detail.end_at))}
                  </p>
                </div>
                <div className="rounded-[7px] border border-white/80 bg-white/65 p-3 sm:border-0 sm:bg-transparent sm:p-0">
                  <p className="text-on-surface-variant">Tanggal</p>
                  <p className="mt-1 font-bold">
                    {dateFormat.format(new Date(detail.start_at))}
                  </p>
                </div>
                <div className="col-span-2 rounded-[7px] border border-white/80 bg-white/65 p-3 sm:col-span-1 sm:border-0 sm:bg-transparent sm:p-0">
                  <p className="text-on-surface-variant">Lokasi</p>
                  <p className="mt-1 font-bold">{detail.room_name}</p>
                </div>
              </div>
            </div>
          </section>

          {editorOpen && (
            <section
              id="session-schedule-editor"
              className="session-editor-drawer rounded-[8px] border border-emerald-200 bg-white p-4 shadow-soft sm:p-5"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-primary">
                    Editor Jadwal
                  </p>
                  <h3 className="mt-1 text-lg font-bold">
                    Atur occurrence ini
                  </h3>
                </div>
                <button
                  className="icon-button"
                  onClick={() => setEditorOpen(false)}
                >
                  <Icon name="close" />
                </button>
              </div>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="text-xs font-bold">
                  Mulai
                  <input
                    className="mt-2 h-11 w-full rounded-[8px] border px-3 font-normal"
                    type="datetime-local"
                    value={scheduleDraft.start_at}
                    onChange={(event) =>
                      setScheduleDraft((value) => ({
                        ...value,
                        start_at: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="text-xs font-bold">
                  Selesai
                  <input
                    className="mt-2 h-11 w-full rounded-[8px] border px-3 font-normal"
                    type="datetime-local"
                    value={scheduleDraft.end_at}
                    onChange={(event) =>
                      setScheduleDraft((value) => ({
                        ...value,
                        end_at: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="text-xs font-bold sm:col-span-2">
                  Cakupan
                  <select
                    className="mt-2 h-11 w-full rounded-[8px] border bg-white px-3 font-normal"
                    value={scheduleDraft.scope}
                    onChange={(event) =>
                      setScheduleDraft((value) => ({
                        ...value,
                        scope: event.target.value,
                      }))
                    }
                  >
                    <option value="this">Khusus sesi ini</option>
                    <option value="this_and_future">
                      Sesi ini dan pengulangan berikutnya
                    </option>
                  </select>
                </label>
              </div>
              <div className="mt-5 flex justify-stretch sm:justify-end">
                <button
                  className="primary-button w-full rounded-[8px] sm:w-auto"
                  onClick={() => scheduleMutation.mutate()}
                  disabled={scheduleMutation.isPending}
                >
                  <Icon name="save" />
                  Simpan Jadwal
                </button>
              </div>
            </section>
          )}

          <section className="rounded-[8px] border border-emerald-100 bg-white p-4 shadow-soft sm:p-5">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-3 text-lg font-bold">
                <Icon name="menu_book" className="text-primary" />
                Catatan Materi
              </h2>
              <label
                className="icon-button cursor-pointer"
                title="Unggah lampiran"
              >
                <Icon name="add" />
                <input
                  className="hidden"
                  type="file"
                  accept=".jpg,.jpeg,.png,.pdf"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) uploadMutation.mutate(file);
                  }}
                />
              </label>
            </div>
            <div className="mt-5 grid gap-4">
              <label className="text-xs font-bold">
                Topik Pembelajaran
                <input
                  className="mt-2 h-11 w-full rounded-[8px] border border-outline-variant/60 px-3 font-normal outline-none focus:border-primary"
                  value={notes.topic}
                  onChange={(event) => {
                    setNotes((value) => ({
                      ...value,
                      topic: event.target.value,
                    }));
                    setNotesDirty(true);
                  }}
                  placeholder="Contoh: Persamaan kuadrat"
                  disabled={!detail.permissions.can_edit}
                />
              </label>
              <label className="text-xs font-bold">
                Deskripsi Materi
                <textarea
                  className="mt-2 min-h-28 w-full rounded-[8px] border border-outline-variant/60 p-3 font-normal outline-none focus:border-primary"
                  value={notes.material_description}
                  onChange={(event) => {
                    setNotes((value) => ({
                      ...value,
                      material_description: event.target.value,
                    }));
                    setNotesDirty(true);
                  }}
                  placeholder="Tuliskan materi yang benar-benar disampaikan..."
                  disabled={!detail.permissions.can_edit}
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-xs font-bold">
                  Catatan Pembelajaran
                  <textarea
                    className="mt-2 min-h-24 w-full rounded-[8px] border p-3 font-normal"
                    value={notes.learning_notes}
                    onChange={(event) => {
                      setNotes((value) => ({
                        ...value,
                        learning_notes: event.target.value,
                      }));
                      setNotesDirty(true);
                    }}
                    disabled={!detail.permissions.can_edit}
                  />
                </label>
                <label className="text-xs font-bold">
                  Pekerjaan Rumah
                  <textarea
                    className="mt-2 min-h-24 w-full rounded-[8px] border p-3 font-normal"
                    value={notes.homework}
                    onChange={(event) => {
                      setNotes((value) => ({
                        ...value,
                        homework: event.target.value,
                      }));
                      setNotesDirty(true);
                    }}
                    disabled={!detail.permissions.can_edit}
                  />
                </label>
              </div>
              {detail.permissions.can_edit && (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p
                    className={`text-[10px] font-bold ${notesDirty ? "text-amber-700" : "text-emerald-700"}`}
                  >
                    {notesDirty
                      ? "Ada perubahan belum disimpan"
                      : "Catatan tersimpan"}
                  </p>
                  <button
                    className="primary-button w-full rounded-[8px] sm:w-auto"
                    disabled={!notesDirty || notesMutation.isPending}
                    onClick={() => notesMutation.mutate()}
                  >
                    <Icon name="save" />
                    Simpan Materi
                  </button>
                </div>
              )}
            </div>
          </section>
        </main>

        <aside
          className={`${mobileSection === "attendance" ? "block" : "hidden"} min-w-0 self-start overflow-hidden rounded-[8px] border border-emerald-100 bg-white shadow-soft xl:sticky xl:top-0 xl:block`}
        >
          <div className="border-b bg-white p-4 sm:p-5 xl:static">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold">Daftar Siswa</h2>
                <p className="mt-1 text-[10px] text-on-surface-variant">
                  {attendance.length} Students Enrolled
                </p>
              </div>
              <div className="shrink-0 text-right">
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[9px] font-bold text-primary">
                  ABSENSI
                </span>
                <p className="mt-2 text-[9px] font-bold text-amber-700">
                  {counts.UNSET || 0} belum diisi
                </p>
              </div>
            </div>
            <div className="mt-4 flex h-10 items-center gap-2 rounded-[8px] bg-surface-container-low px-3">
              <Icon name="search" className="text-base" />
              <input
                className="min-w-0 flex-1 bg-transparent text-xs outline-none"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cari siswa..."
              />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-1.5 text-center text-[9px] font-bold sm:grid-cols-4 sm:gap-1">
              <span className="rounded bg-emerald-50 p-1.5 text-emerald-700">
                {counts.PRESENT || 0} Hadir
              </span>
              <span className="rounded bg-blue-50 p-1.5 text-blue-700">
                {counts.PERMIT || 0} Izin
              </span>
              <span className="rounded bg-amber-50 p-1.5 text-amber-700">
                {counts.SICK || 0} Sakit
              </span>
              <span className="rounded bg-red-50 p-1.5 text-red-700">
                {counts.ABSENT || 0} Alfa
              </span>
            </div>
          </div>
          <div className="divide-y px-3 sm:px-4 xl:max-h-[560px] xl:overflow-y-auto">
            {visible.map((item) => (
              <div
                key={item.id}
                className="grid grid-cols-[36px_minmax(0,1fr)] items-center gap-x-3 gap-y-2 py-3"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-[10px] font-bold text-primary">
                  {item.student_name_snapshot
                    .split(" ")
                    .slice(0, 2)
                    .map((part) => part[0])
                    .join("")}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-bold leading-5">
                    {item.student_name_snapshot}
                  </p>
                  <p className="mt-0.5 break-all text-[10px] leading-4 text-on-surface-variant">
                    {item.student_code_snapshot}
                  </p>
                </div>
                <select
                  className={`col-start-2 h-10 w-full min-w-0 rounded-[7px] border-0 px-3 text-xs font-bold ${statusTone[item.status]}`}
                  value={item.status}
                  disabled={!detail.permissions.can_edit}
                  aria-label={`Status kehadiran ${item.student_name_snapshot}`}
                  onChange={(event) => {
                    setAttendance((rows) =>
                      rows.map((row) =>
                        row.id === item.id
                          ? {
                              ...row,
                              status: event.target
                                .value as AttendanceRow["status"],
                            }
                          : row,
                      ),
                    );
                    setAttendanceDirty(true);
                  }}
                >
                  {statusOptions.map((status) => (
                    <option key={status} value={status}>
                      {statusLabel[status]}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          {detail.permissions.can_edit && (
            <div className="sticky bottom-0 z-10 border-t bg-white/95 p-4 backdrop-blur-xl">
              <p
                className={`mb-3 text-center text-[10px] font-bold ${attendanceDirty ? "text-amber-700" : "text-emerald-700"}`}
              >
                {attendanceDirty
                  ? "Perubahan absensi belum disimpan"
                  : "Absensi tersimpan"}
              </p>
              <button
                className="primary-button w-full rounded-[8px]"
                disabled={
                  !attendanceDirty ||
                  attendanceMutation.isPending ||
                  attendance.length === 0
                }
                onClick={() => attendanceMutation.mutate()}
              >
                <Icon name="save" />
                Simpan Absensi
              </button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
