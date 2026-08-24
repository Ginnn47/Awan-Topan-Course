import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Icon, PageHeader } from "../components/ui.jsx";
import {
  courseTeachers,
  loadCourseClasses,
  loadCourseSubjects,
  saveCourseClasses,
  saveCourseSubjects,
} from "../datadummy.js";
import {
  attendanceOptions,
  completeSession,
  getSessionDetail,
  saveAttendance,
  saveSessionNotes,
  startSession,
  updateSessionSchedule,
} from "../services/sessionService.js";
import useDataRevision from "../hooks/useDataRevision.js";
import useOperationalDate from "../hooks/useOperationalDate.js";

const dateFormatter = new Intl.DateTimeFormat("id-ID", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const attendanceTone = {
  unset: "border-outline-variant/60 bg-white text-on-surface-variant",
  present: "border-emerald-200 bg-emerald-50 text-emerald-800",
  permit: "border-blue-200 bg-blue-50 text-blue-700",
  sick: "border-amber-200 bg-amber-50 text-amber-800",
  absent: "border-red-200 bg-red-50 text-red-700",
};

const statusLabel = {
  scheduled: "Belum dimulai",
  active: "Sedang berlangsung",
  completed: "Selesai",
};

function parseDate(value) {
  return new Date(`${value}T12:00:00`);
}

function formatTime(value) {
  return value?.replace(":", ".") || "-";
}

function durationLabel(startTime, endTime) {
  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [endHour, endMinute] = endTime.split(":").map(Number);
  const duration = endHour * 60 + endMinute - (startHour * 60 + startMinute);
  const hours = Math.floor(duration / 60);
  const minutes = duration % 60;
  if (!minutes) return `${hours} jam`;
  return hours ? `${hours} jam ${minutes} menit` : `${minutes} menit`;
}

function sameAttendance(left, right) {
  if (left.length !== right.length) return false;
  const rightById = new Map(right.map((student) => [student.studentId, student.status]));
  return left.every((student) => rightById.get(student.studentId) === student.status);
}

function IdentityItem({ icon, label, value }) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-white/80 text-primary shadow-sm">
        <Icon name={icon} className="text-base" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-on-surface-variant">{label}</p>
        <p className="mt-1 break-words text-sm font-bold text-on-surface">{value}</p>
      </div>
    </div>
  );
}

function NotesField({ label, value, onChange, placeholder, rows = 3, disabled }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-bold text-on-surface">{label}</span>
      {rows === 1 ? (
        <input
          className="w-full rounded-[8px] border border-outline-variant/50 bg-white px-3.5 py-3 text-sm outline-none transition placeholder:text-on-surface-variant/60 focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:bg-surface-container-low disabled:text-on-surface-variant"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          disabled={disabled}
        />
      ) : (
        <textarea
          className="w-full resize-y rounded-[8px] border border-outline-variant/50 bg-white px-3.5 py-3 text-sm leading-6 outline-none transition placeholder:text-on-surface-variant/60 focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:bg-surface-container-low disabled:text-on-surface-variant"
          rows={rows}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          disabled={disabled}
        />
      )}
    </label>
  );
}

function makeScheduleForm(detail) {
  return {
    subject: detail.subject,
    classId: detail.classId,
    date: detail.date,
    startTime: detail.startTime,
    endTime: detail.endTime,
    teacherId: detail.teacherId,
    room: detail.room,
    recurrence: detail.repeatWeeks ? "5 minggu ke depan" : "Tidak berulang",
    conflict: Boolean(detail.conflict),
  };
}

function ScheduleField({ label, children }) {
  return (
    <div className="block">
      <span className="mb-2 block text-xs font-bold text-on-surface-variant">{label}</span>
      <div className="[&>input]:h-11 [&>input]:w-full [&>input]:rounded-[8px] [&>input]:border [&>input]:border-outline-variant/60 [&>input]:bg-white [&>input]:px-3 [&>input]:text-sm [&>input]:outline-none [&>input]:focus:border-primary [&>select]:h-11 [&>select]:w-full [&>select]:rounded-[8px] [&>select]:border [&>select]:border-outline-variant/60 [&>select]:bg-white [&>select]:px-3 [&>select]:text-sm [&>select]:outline-none [&>select]:focus:border-primary [&>select]:disabled:bg-surface-container-low [&>select]:disabled:text-on-surface-variant">{children}</div>
    </div>
  );
}

function InlineScheduleEditor({ detail, form, setForm, classes, subjects, onAddClass, onAddSubject, onClose, onSave, working }) {
  const [addingSubject, setAddingSubject] = useState(false);
  const [addingClass, setAddingClass] = useState(false);
  const [subjectDraft, setSubjectDraft] = useState({ name: "", tone: "teal" });
  const [classDraft, setClassDraft] = useState({ name: "", level: "SD" });
  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const submit = (event) => {
    event.preventDefault();
    onSave();
  };

  return (
    <section id="session-schedule-editor" className="session-editor-drawer overflow-hidden rounded-[8px] border border-primary/30 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-4 border-b border-emerald-200/70 bg-gradient-to-r from-emerald-100 via-teal-50 to-white px-5 py-4">
        <div>
          <div className="flex items-center gap-2 text-primary"><Icon name="edit" className="text-base" /><p className="text-xs font-bold uppercase">Editor Jadwal</p></div>
          <h2 className="mt-1 text-lg font-bold">Edit Jadwal Session</h2>
          <p className="mt-1 text-xs text-on-surface-variant">Perubahan berlaku untuk occurrence sesi ini.</p>
        </div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="Tutup editor jadwal"><Icon name="close" /></button>
      </div>

      <form onSubmit={submit}>
        <div className="grid gap-4 bg-[#f8fbf8] p-5 sm:grid-cols-2 lg:grid-cols-3">
          <ScheduleField label="Mata Pelajaran">
            <select value={form.subject} onChange={(event) => setField("subject", event.target.value)} disabled={detail.attendanceInitialized}>
              {subjects.map((subject) => <option key={subject.id} value={subject.name}>{subject.name}</option>)}
            </select>
            {!detail.attendanceInitialized && <button className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-primary" type="button" onClick={() => setAddingSubject((current) => !current)}><Icon name="add" className="text-base" /> Pelajaran baru</button>}
            {addingSubject && <div className="mt-2 grid grid-cols-[minmax(0,1fr)_95px_auto] gap-2"><input value={subjectDraft.name} onChange={(event) => setSubjectDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Nama pelajaran" /><select value={subjectDraft.tone} onChange={(event) => setSubjectDraft((current) => ({ ...current, tone: event.target.value }))}>{["blue", "green", "red", "purple", "orange", "teal", "amber"].map((tone) => <option key={tone}>{tone}</option>)}</select><button className="rounded-[8px] bg-primary px-3 text-white" type="button" onClick={() => { const created = onAddSubject(subjectDraft); if (created) { setField("subject", created.name); setAddingSubject(false); setSubjectDraft({ name: "", tone: "teal" }); } }} aria-label="Simpan pelajaran"><Icon name="save" className="text-base" /></button></div>}
          </ScheduleField>
          <ScheduleField label="Kelas">
            <select value={form.classId} onChange={(event) => setField("classId", event.target.value)} disabled={detail.attendanceInitialized}>
              {classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            {!detail.attendanceInitialized && <button className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-primary" type="button" onClick={() => setAddingClass((current) => !current)}><Icon name="add" className="text-base" /> Kelas baru</button>}
            {addingClass && <div className="mt-2 grid grid-cols-[minmax(0,1fr)_95px_auto] gap-2"><input value={classDraft.name} onChange={(event) => setClassDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Nama kelas" /><select value={classDraft.level} onChange={(event) => setClassDraft((current) => ({ ...current, level: event.target.value }))}>{["SD", "9 SMP", "10 SMA", "11 SMA", "12 SMA"].map((level) => <option key={level}>{level}</option>)}</select><button className="rounded-[8px] bg-primary px-3 text-white" type="button" onClick={() => { const created = onAddClass(classDraft); if (created) { setField("classId", created.id); setAddingClass(false); setClassDraft({ name: "", level: "SD" }); } }} aria-label="Simpan kelas"><Icon name="save" className="text-base" /></button></div>}
          </ScheduleField>
          <ScheduleField label="Tanggal">
            <input type="date" value={form.date} onChange={(event) => setField("date", event.target.value)} required />
          </ScheduleField>
          <ScheduleField label="Pengajar">
            <select value={form.teacherId} onChange={(event) => setField("teacherId", event.target.value)}>
              {courseTeachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name} - {teacher.subject}</option>)}
            </select>
          </ScheduleField>
          <ScheduleField label="Jam Mulai">
            <input type="time" value={form.startTime} onChange={(event) => setField("startTime", event.target.value)} required />
          </ScheduleField>
          <ScheduleField label="Jam Selesai">
            <input type="time" value={form.endTime} onChange={(event) => setField("endTime", event.target.value)} required />
          </ScheduleField>
          <ScheduleField label="Ruang Kelas">
            <input value={form.room} onChange={(event) => setField("room", event.target.value)} placeholder="Contoh: R. Anggrek" required />
          </ScheduleField>
          <ScheduleField label="Pengulangan">
            <select value={form.recurrence} onChange={(event) => setField("recurrence", event.target.value)}>
              <option>5 minggu ke depan</option>
              <option>Tidak berulang</option>
            </select>
          </ScheduleField>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 self-end rounded-[8px] border border-outline-variant/50 bg-white px-3 text-xs font-bold text-on-surface">
            <input className="h-4 w-4 accent-primary" type="checkbox" checked={form.conflict} onChange={(event) => setField("conflict", event.target.checked)} />
            Tandai konflik ruangan
          </label>
          {detail.attendanceInitialized && <p className="text-xs leading-5 text-on-surface-variant sm:col-span-2 lg:col-span-3">Mata pelajaran dan kelas dikunci karena snapshot absensi sesi sudah dibuat.</p>}
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-outline-variant/30 px-5 py-4">
          <button className="rounded-[8px] border border-outline-variant/60 bg-white px-4 py-2.5 text-sm font-bold" type="button" onClick={onClose}>Batal</button>
          <button className="inline-flex items-center gap-2 rounded-[8px] bg-primary px-5 py-2.5 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-60" type="submit" disabled={Boolean(working)}><Icon name="save" className="text-base" /> {working === "schedule" ? "Menyimpan..." : "Simpan Jadwal"}</button>
        </div>
      </form>
    </section>
  );
}

export default function SessionDetail({ role }) {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const operational = useOperationalDate();
  const actor = useMemo(() => ({ role, teacherId: role === "teacher" ? "teacher-topan" : null }), [role]);
  const [classes, setClasses] = useState(() => loadCourseClasses());
  const [subjects, setSubjects] = useState(() => loadCourseSubjects());
  const [detail, setDetail] = useState(null);
  const [notes, setNotes] = useState(null);
  const [students, setStudents] = useState([]);
  const [scheduleEditorOpen, setScheduleEditorOpen] = useState(false);
  const [scheduleForm, setScheduleForm] = useState(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [startMismatchOpen, setStartMismatchOpen] = useState(false);
  const masterRevision = useDataRevision(["roster", "catalog"]);
  const detailRevision = useDataRevision(["schedule", "session"]);
  const notesDirty = Boolean(detail && notes && JSON.stringify(notes) !== JSON.stringify(detail.notes));
  const attendanceDirty = Boolean(detail && !sameAttendance(students, detail.students));

  useEffect(() => {
    setClasses(loadCourseClasses());
    setSubjects(loadCourseSubjects());
  }, [masterRevision]);

  const addSubject = ({ name, tone }) => {
    const normalizedName = name.trim();
    if (!normalizedName || subjects.some((subject) => subject.name.toLowerCase() === normalizedName.toLowerCase())) {
      setError(!normalizedName ? "Nama pelajaran wajib diisi." : "Pelajaran tersebut sudah tersedia.");
      return null;
    }
    const created = { id: `subject-${Date.now()}`, name: normalizedName, tone: tone || "teal" };
    const next = [...subjects, created];
    setSubjects(next);
    saveCourseSubjects(next);
    setNotice(`${created.name} ditambahkan ke master pelajaran.`);
    return created;
  };

  const addClass = ({ name, level }) => {
    const normalizedName = name.trim();
    if (!normalizedName || classes.some((classGroup) => classGroup.name.toLowerCase() === normalizedName.toLowerCase())) {
      setError(!normalizedName ? "Nama kelas wajib diisi." : "Kelas tersebut sudah tersedia.");
      return null;
    }
    const created = { id: `class-${Date.now()}`, name: normalizedName, level, monthlyFee: 500000, totalStudents: 0, members: [] };
    const next = saveCourseClasses([...classes, created]);
    setClasses(next);
    setNotice(`${created.name} ditambahkan. Anggota dapat diatur dari menu Rombel.`);
    return created;
  };

  const applyDetail = (nextDetail) => {
    setDetail(nextDetail);
    setNotes({ ...nextDetail.notes });
    setStudents(nextDetail.students.map((student) => ({ ...student })));
  };

  const openScheduleEditor = () => {
    if (scheduleEditorOpen) {
      setScheduleEditorOpen(false);
      return;
    }
    setScheduleForm(makeScheduleForm(detail));
    setScheduleEditorOpen(true);
    window.requestAnimationFrame(() => {
      document.getElementById("session-schedule-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  useEffect(() => {
    if (detail && (notesDirty || attendanceDirty)) return undefined;
    let active = true;
    setLoading(true);
    getSessionDetail(sessionId, actor)
      .then((result) => {
        if (active) applyDetail(result);
      })
      .catch((caughtError) => {
        if (active) setError(caughtError.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [sessionId, actor, detailRevision, masterRevision, notesDirty, attendanceDirty]);

  useEffect(() => {
    if (!notice) return undefined;
    const timeout = window.setTimeout(() => setNotice(""), 3000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (!startMismatchOpen) return undefined;
    const closeOnEscape = (event) => { if (event.key === "Escape") setStartMismatchOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [startMismatchOpen]);

  const summary = useMemo(() => {
    const result = { total: students.length, unset: 0, present: 0, permit: 0, sick: 0, absent: 0 };
    students.forEach((student) => { result[student.status] += 1; });
    return result;
  }, [students]);
  const visibleStudents = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return students;
    return students.filter((student) => (
      student.name.toLowerCase().includes(normalizedQuery) || student.studentId.toLowerCase().includes(normalizedQuery)
    ));
  }, [query, students]);

  const runAction = async (key, action, successMessage, preserve = "") => {
    const notesBeforeAction = notes ? { ...notes } : null;
    const studentsBeforeAction = students.map((student) => ({ ...student }));
    setWorking(key);
    setError("");
    try {
      const result = await action();
      applyDetail(result);
      if (preserve === "notes" && notesBeforeAction) setNotes(notesBeforeAction);
      if (preserve === "attendance") setStudents(studentsBeforeAction);
      if (preserve === "notes-attendance" && notesBeforeAction) {
        setNotes(notesBeforeAction);
        setStudents(studentsBeforeAction);
      }
      setNotice(successMessage);
      return true;
    } catch (caughtError) {
      setError(caughtError.message);
      return false;
    } finally {
      setWorking("");
    }
  };

  const saveSchedule = async () => {
    const saved = await runAction(
      "schedule",
      () => updateSessionSchedule(detail.id, scheduleForm, actor),
      "Perubahan jadwal berhasil disimpan.",
      attendanceDirty ? "notes-attendance" : "notes",
    );
    if (saved) setScheduleEditorOpen(false);
  };

  const handleBack = () => {
    if (location.state?.fromCourse) navigate(-1);
    else navigate("/course");
  };

  const changeAttendance = (studentId, status) => {
    setStudents((current) => current.map((student) => (
      student.studentId === studentId ? { ...student, status } : student
    )));
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center text-primary">
          <Icon name="sync" className="mx-auto animate-spin text-2xl" />
          <p className="mt-3 text-sm font-semibold">Memuat detail sesi...</p>
        </div>
      </div>
    );
  }

  if (!detail) {
    return (
      <section className="mx-auto max-w-lg rounded-[8px] border border-red-200 bg-white p-6 text-center shadow-sm">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-[8px] bg-red-50 text-red-600"><Icon name="warning" /></div>
        <h1 className="mt-4 text-xl font-bold">Detail sesi tidak tersedia</h1>
        <p className="mt-2 text-sm text-on-surface-variant">{error || "Sesi tidak ditemukan."}</p>
        <button className="mt-5 rounded-[8px] bg-primary px-5 py-2.5 text-sm font-bold text-white" onClick={() => navigate("/course")}>Kembali ke Course</button>
      </section>
    );
  }

  const canEdit = detail.permissions.canEdit;
  const completionBlocked = !detail.attendanceInitialized || summary.unset > 0 || attendanceDirty || notesDirty || !detail.notesReady;

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-5">
      <nav className="flex flex-wrap items-center gap-2 text-xs font-semibold text-on-surface-variant" aria-label="Breadcrumb">
        <button className="inline-flex items-center gap-1 transition hover:text-primary" onClick={handleBack}><Icon name="chevron_left" className="text-base" /> Course</button>
        <Icon name="chevron_right" className="text-base" />
        <span>{detail.className}</span>
        <Icon name="chevron_right" className="text-base" />
        <span className="text-primary">Session Detail</span>
      </nav>
      <PageHeader
        title="Session Detail"
        description={`Pertemuan ke-${detail.occurrenceNumber} untuk ${detail.className}`}
        action={<div className="flex flex-wrap gap-2">
          {canEdit && (
            <button
              className="inline-flex h-11 items-center justify-center gap-2 rounded-[8px] border border-primary bg-white px-4 text-sm font-bold text-primary transition hover:bg-emerald-50"
              onClick={openScheduleEditor}
            >
              <Icon name={scheduleEditorOpen ? "close" : "edit"} className="text-base" /> {scheduleEditorOpen ? "Tutup Editor" : "Edit Jadwal"}
            </button>
          )}
          {canEdit && detail.status === "scheduled" && (
            <button
              className="inline-flex h-11 items-center justify-center gap-2 rounded-[8px] bg-primary px-5 text-sm font-bold text-white shadow-sm transition hover:brightness-110 disabled:opacity-60"
              disabled={Boolean(working)}
              onClick={() => detail.date === operational.date
                ? runAction("start", () => startSession(detail.id, actor), "Sesi dimulai dan daftar siswa berhasil disiapkan.")
                : setStartMismatchOpen(true)}
            >
              <Icon name="play_arrow" className="text-base" /> {working === "start" ? "Memulai..." : "Mulai Sesi"}
            </button>
          )}
          {canEdit && detail.status === "active" && (
            <button
              className="inline-flex h-11 items-center justify-center gap-2 rounded-[8px] bg-primary px-5 text-sm font-bold text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-outline"
              disabled={Boolean(working) || completionBlocked}
              title={completionBlocked ? "Simpan catatan dan lengkapi seluruh absensi terlebih dahulu" : "Selesaikan sesi"}
              onClick={() => runAction("complete", () => completeSession(detail.id, actor), "Sesi berhasil diselesaikan.")}
            >
              <Icon name="task_alt" className="text-base" /> {working === "complete" ? "Menyelesaikan..." : "Selesaikan Sesi"}
            </button>
          )}
          {detail.status === "completed" && (
            <span className="inline-flex h-11 items-center gap-2 rounded-[8px] border border-emerald-200 bg-emerald-50 px-4 text-sm font-bold text-emerald-800"><Icon name="check_circle" className="text-base" /> Sesi Selesai</span>
          )}
        </div>}
      />

      {error && (
        <div className="flex items-start gap-3 rounded-[8px] border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          <Icon name="warning" className="text-base" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError("")} aria-label="Tutup pesan"><Icon name="close" className="text-base" /></button>
        </div>
      )}

      {!canEdit && (
        <div className="flex items-start gap-3 rounded-[8px] border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <Icon name="info" className="text-base" />
          <div><p className="font-bold">Mode hanya lihat</p><p className="mt-1 text-xs">{detail.permissions.reason}</p></div>
        </div>
      )}

      {detail.status === "active" && (
        <section className="rounded-[8px] border border-blue-200 bg-gradient-to-r from-blue-50 via-cyan-50 to-emerald-50 px-4 py-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-blue-600 text-white"><Icon name="pending_actions" /></div>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-bold text-blue-900">Pencatatan sesi sedang berlangsung</h2>
              <p className="mt-1 text-xs leading-5 text-blue-800">Isi status kehadiran seluruh siswa dan catatan pemateri, lalu simpan masing-masing panel. Sesi tidak dapat diselesaikan selama salah satu record masih kosong atau belum disimpan.</p>
              <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-bold">
                <span className={`rounded-full px-2.5 py-1 ${detail.attendanceInitialized && summary.unset === 0 && !attendanceDirty ? "bg-emerald-100 text-emerald-800" : "bg-white text-blue-800"}`}>{detail.attendanceInitialized && summary.unset === 0 && !attendanceDirty ? "Absensi tersimpan" : `${summary.unset} absensi belum lengkap`}</span>
                <span className={`rounded-full px-2.5 py-1 ${detail.notesReady && !notesDirty ? "bg-emerald-100 text-emerald-800" : "bg-white text-blue-800"}`}>{detail.notesReady && !notesDirty ? "Catatan tersimpan" : "Catatan pemateri belum lengkap"}</span>
              </div>
            </div>
          </div>
        </section>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_390px] 2xl:grid-cols-[minmax(0,1fr)_430px]">
        <main className="min-w-0 space-y-5">
          <section className="overflow-hidden rounded-[8px] border border-emerald-200/80 bg-gradient-to-br from-[#e2f3e8] via-[#edf7f2] to-[#e1f1f1] shadow-sm">
            <div className="flex flex-col gap-5 p-5 sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-blue-600 px-3 py-1 text-xs font-bold text-white">{detail.subject}</span>
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${detail.status === "completed" ? "bg-emerald-700 text-white" : detail.status === "active" ? "bg-amber-100 text-amber-800" : "bg-white/80 text-primary"}`}>{statusLabel[detail.status]}</span>
                  </div>
                  <h2 className="mt-3 text-xl font-bold text-on-surface sm:text-2xl">{detail.subject} - {detail.className}</h2>
                  <p className="mt-2 text-xs font-semibold text-on-surface-variant">ID sesi {detail.id}</p>
                </div>
                <div className="flex items-center gap-3 rounded-[8px] border border-white/80 bg-white/75 p-3 shadow-sm">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-800">{detail.teacher.initials}</div>
                  <div><p className="text-[11px] text-on-surface-variant">Pengajar</p><p className="mt-1 text-sm font-bold">{detail.teacher.name}</p></div>
                </div>
              </div>

              <div className="grid gap-4 border-t border-emerald-200/70 pt-5 sm:grid-cols-2 lg:grid-cols-3">
                <IdentityItem icon="calendar_month" label="Tanggal" value={dateFormatter.format(parseDate(detail.date))} />
                <IdentityItem icon="schedule" label="Waktu" value={`${formatTime(detail.startTime)} - ${formatTime(detail.endTime)} (${durationLabel(detail.startTime, detail.endTime)})`} />
                <IdentityItem icon="meeting_room" label="Ruang Kelas" value={detail.room} />
                <IdentityItem icon="person" label="Pengajar" value={detail.teacher.name} />
                <IdentityItem icon="groups" label="Jumlah Siswa" value={`${detail.attendanceSummary.total} siswa`} />
                <IdentityItem icon="sync" label="Pengulangan" value={detail.repeatWeeks ? `Batch ${detail.repeatWeeks} minggu - pertemuan ke-${detail.occurrenceNumber}` : "Tidak berulang"} />
              </div>
            </div>
          </section>

          {scheduleEditorOpen && scheduleForm && (
            <InlineScheduleEditor detail={detail} form={scheduleForm} setForm={setScheduleForm} classes={classes} subjects={subjects} onAddClass={addClass} onAddSubject={addSubject} onClose={() => setScheduleEditorOpen(false)} onSave={saveSchedule} working={working} />
          )}

          <section className="rounded-[8px] border border-outline-variant/40 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2"><Icon name="menu_book" className="text-primary" /><h2 className="text-lg font-bold">Catatan Materi</h2></div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <p className="text-xs text-on-surface-variant">Catatan ini khusus untuk occurrence sesi saat ini.</p>
                  <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${notesDirty || !detail.notesReady ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>{notesDirty ? "Perubahan belum disimpan" : detail.notesReady ? "Catatan tersimpan" : "Topik dan deskripsi wajib diisi"}</span>
                </div>
              </div>
              {canEdit && (
                <button
                  className={`inline-flex h-10 items-center gap-2 rounded-[8px] border border-primary px-4 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-45 ${notesDirty ? "bg-primary text-white hover:brightness-110" : "bg-white text-primary hover:bg-emerald-50"}`}
                  disabled={!notesDirty || Boolean(working)}
                  onClick={() => runAction("notes", () => saveSessionNotes(detail.id, notes, actor), "Catatan materi berhasil disimpan.", "attendance")}
                >
                  <Icon name="save" className="text-base" /> {working === "notes" ? "Menyimpan..." : "Simpan Catatan"}
                </button>
              )}
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2"><NotesField label="Topik Pembelajaran" rows={1} value={notes.topic} onChange={(value) => setNotes((current) => ({ ...current, topic: value }))} placeholder="Contoh: Persamaan kuadrat" disabled={!canEdit} /></div>
              <NotesField label="Deskripsi Materi" value={notes.materialDescription} onChange={(value) => setNotes((current) => ({ ...current, materialDescription: value }))} placeholder="Materi dan cakupan yang disampaikan" disabled={!canEdit} />
              <NotesField label="Catatan Pembelajaran" value={notes.learningNotes} onChange={(value) => setNotes((current) => ({ ...current, learningNotes: value }))} placeholder="Perkembangan kelas dan poin penting" disabled={!canEdit} />
              <div className="md:col-span-2"><NotesField label="Pekerjaan Rumah" value={notes.homework} onChange={(value) => setNotes((current) => ({ ...current, homework: value }))} placeholder="Tugas atau latihan untuk pertemuan berikutnya" rows={2} disabled={!canEdit} /></div>
            </div>
          </section>
        </main>

        <aside className="min-w-0 rounded-[8px] border border-outline-variant/40 bg-white shadow-sm xl:sticky xl:top-0 xl:max-h-[calc(100vh-3rem)]">
          <div className="border-b border-outline-variant/35 p-5">
            <div className="flex items-start justify-between gap-3">
              <div><h2 className="text-lg font-bold">Daftar Siswa</h2><p className="mt-1 text-xs text-on-surface-variant">{students.length} siswa terdaftar</p></div>
              {attendanceDirty && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold text-amber-800">Belum disimpan</span>}
            </div>
            <div className="mt-4 grid grid-cols-5 gap-1.5 text-center">
              {[
                ["Hadir", summary.present, "bg-emerald-50 text-emerald-800"],
                ["Izin", summary.permit, "bg-blue-50 text-blue-700"],
                ["Sakit", summary.sick, "bg-amber-50 text-amber-800"],
                ["Alfa", summary.absent, "bg-red-50 text-red-700"],
                ["Kosong", summary.unset, "bg-surface-container-low text-on-surface-variant"],
              ].map(([label, value, style]) => (
                <div key={label} className={`rounded-[6px] px-1 py-2 ${style}`}><p className="text-sm font-bold">{value}</p><p className="mt-0.5 text-[9px] font-semibold">{label}</p></div>
              ))}
            </div>
            <div className="relative mt-4">
              <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-base text-on-surface-variant" />
              <input className="h-10 w-full rounded-[8px] border border-outline-variant/40 bg-surface-container-low pl-10 pr-3 text-xs outline-none transition focus:border-primary focus:bg-white" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari nama atau ID siswa..." />
            </div>
          </div>

          {!detail.attendanceInitialized && (
            <div className="mx-5 mt-4 flex gap-3 rounded-[8px] border border-blue-200 bg-blue-50 p-3 text-xs leading-5 text-blue-800">
              <Icon name="info" className="text-base" />
              <p>Daftar ini masih mengikuti anggota kelas aktif. Tekan <strong>Mulai Sesi</strong> untuk membuat snapshot absensi.</p>
            </div>
          )}

          <div className="divide-y divide-outline-variant/30 px-5 xl:max-h-[calc(100vh-420px)] xl:min-h-[220px] xl:overflow-y-auto">
            {visibleStudents.map((student, index) => (
              <div key={student.studentId} className="flex items-center gap-3 py-3">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${index % 3 === 0 ? "bg-emerald-100 text-emerald-800" : index % 3 === 1 ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>{student.initials}</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold" title={student.name}>{student.name}</p>
                  <p className="mt-1 truncate text-[10px] text-on-surface-variant">ID: {student.studentId.toUpperCase()}</p>
                </div>
                <select
                  className={`h-9 w-[112px] shrink-0 rounded-[6px] border px-2 text-[11px] font-bold outline-none transition focus:ring-2 focus:ring-primary/15 ${attendanceTone[student.status]}`}
                  value={student.status}
                  onChange={(event) => changeAttendance(student.studentId, event.target.value)}
                  disabled={!canEdit || !detail.attendanceInitialized || Boolean(working)}
                  aria-label={`Status kehadiran ${student.name}`}
                >
                  {attendanceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
            ))}
            {visibleStudents.length === 0 && <p className="py-8 text-center text-xs text-on-surface-variant">Siswa tidak ditemukan.</p>}
          </div>

          {canEdit && (
            <div className="border-t border-outline-variant/35 bg-[#f8fbf8] p-5">
              <button
                className="flex h-11 w-full items-center justify-center gap-2 rounded-[8px] bg-primary text-sm font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
                disabled={!detail.attendanceInitialized || !attendanceDirty || Boolean(working)}
                onClick={() => runAction("attendance", () => saveAttendance(detail.id, students.map(({ studentId, status }) => ({ studentId, status })), actor), "Absensi seluruh siswa berhasil disimpan.", "notes")}
              >
                <Icon name="save" className="text-base" /> {working === "attendance" ? "Menyimpan..." : "Simpan Absensi"}
              </button>
              {detail.status === "active" && summary.unset > 0 && <p className="mt-2 text-center text-[10px] font-semibold text-on-surface-variant">{summary.unset} siswa masih berstatus Belum Diisi</p>}
              {detail.status === "completed" && <p className="mt-2 text-center text-[10px] font-semibold text-emerald-700">Koreksi setelah sesi selesai tetap tersimpan pada occurrence ini.</p>}
            </div>
          )}
        </aside>
      </div>

      {startMismatchOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/35 p-4 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget) setStartMismatchOpen(false); }}>
          <section className="w-full max-w-md overflow-hidden rounded-[8px] border border-amber-200 bg-white shadow-lift" role="dialog" aria-modal="true" aria-labelledby="start-date-warning-title">
            <div className="flex items-start gap-3 border-b border-amber-100 bg-amber-50 px-5 py-4"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-amber-700"><Icon name="warning" /></span><div><h2 id="start-date-warning-title" className="text-base font-bold text-on-surface">Tanggal sesi berbeda</h2><p className="mt-1 text-xs leading-5 text-on-surface-variant">Pastikan Anda tidak mencatat absensi pada occurrence yang salah.</p></div></div>
            <div className="space-y-3 px-5 py-4 text-xs"><div className="flex justify-between gap-4"><span className="text-on-surface-variant">Tanggal sesi</span><strong>{dateFormatter.format(parseDate(detail.date))}</strong></div><div className="flex justify-between gap-4"><span className="text-on-surface-variant">Tanggal operasional</span><strong className="text-amber-800">{dateFormatter.format(parseDate(operational.date))}</strong></div><p className="rounded-[7px] bg-surface-container-low p-3 leading-5 text-on-surface-variant">Melanjutkan akan membuat snapshot absensi pada sesi ini. Timestamp audit tetap memakai waktu nyata.</p></div>
            <div className="flex justify-end gap-2 border-t border-outline-variant/35 px-5 py-4"><button className="h-10 rounded-[8px] border border-outline-variant/55 px-4 text-xs font-bold" onClick={() => setStartMismatchOpen(false)}>Batal</button><button className="h-10 rounded-[8px] bg-primary px-4 text-xs font-bold text-white" onClick={async () => { setStartMismatchOpen(false); await runAction("start", () => startSession(detail.id, actor, { allowDateMismatch: true }), "Sesi dimulai dan daftar siswa berhasil disiapkan."); }}>Tetap Mulai Sesi</button></div>
          </section>
        </div>
      )}

      {notice && (
        <div className="fixed bottom-6 right-6 z-[80] flex max-w-sm items-center gap-3 rounded-[8px] border border-primary/20 bg-primary px-4 py-3 text-sm font-semibold text-white shadow-lift">
          <Icon name="check_circle" /> {notice}
        </div>
      )}
    </div>
  );
}
