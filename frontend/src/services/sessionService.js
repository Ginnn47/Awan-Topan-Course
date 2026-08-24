import { courseTeachers, loadCourseClasses, loadCourseSessions, loadCourseSubjects, saveCourseSessions } from "../datadummy.js";
import { readStorageJSON, writeStorageJSON } from "./dataStore.js";
import { getOperationalDate } from "./operationalDateService.js";

const SESSION_RECORDS_KEY = "awan-topan-session-records-v5";
const VALID_ATTENDANCE = new Set(["unset", "present", "permit", "sick", "absent"]);

export const attendanceOptions = [
  { value: "unset", label: "Belum Diisi" },
  { value: "present", label: "Hadir" },
  { value: "permit", label: "Izin" },
  { value: "sick", label: "Sakit" },
  { value: "absent", label: "Alfa" },
];

function readRecords() {
  const value = readStorageJSON(SESSION_RECORDS_KEY, {});
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function writeRecords(records, action = "update") {
  writeStorageJSON(SESSION_RECORDS_KEY, records, { domain: "session", action });
}

function findSchedule(sessionId) {
  const schedule = loadCourseSessions().find((item) => item.id === sessionId);
  if (!schedule) throw new Error("Sesi yang diminta tidak ditemukan.");
  return schedule;
}

function emptyNotes() {
  return {
    topic: "",
    materialDescription: "",
    learningNotes: "",
    homework: "",
  };
}

function baseRecord(schedule) {
  return {
    id: schedule.id,
    status: "scheduled",
    startedAt: null,
    completedAt: null,
    notes: emptyNotes(),
    notesSavedAt: null,
    attendance: null,
    updatedAt: null,
  };
}

function getRecord(schedule, records) {
  return records[schedule.id] || baseRecord(schedule);
}

function getPermissions(schedule, actor = {}) {
  const isAdmin = actor.role === "admin";
  const isAssignedTeacher = actor.role === "teacher" && actor.teacherId === schedule.teacherId;
  return {
    canEdit: isAdmin || isAssignedTeacher,
    canEditSchedule: isAdmin || isAssignedTeacher,
    reason: isAdmin || isAssignedTeacher ? "" : "Sesi ini ditugaskan kepada pengajar lain.",
  };
}

function assertCanEdit(schedule, actor) {
  if (!getPermissions(schedule, actor).canEdit) {
    throw new Error("Anda tidak memiliki izin untuk mengubah sesi ini.");
  }
}

function rosterFromClass(classGroup) {
  return (classGroup?.members || []).map((student) => ({
    studentId: student.id,
    name: student.name,
    initials: student.initials,
    status: "unset",
  }));
}

function attendanceSummary(students) {
  const counts = { total: students.length, unset: 0, present: 0, permit: 0, sick: 0, absent: 0 };
  students.forEach((student) => {
    counts[student.status] = (counts[student.status] || 0) + 1;
  });
  return counts;
}

function serializeDetail(schedule, record, actor) {
  const classGroup = loadCourseClasses().find((item) => item.id === schedule.classId);
  const teacher = courseTeachers.find((item) => item.id === schedule.teacherId);
  const attendanceInitialized = Array.isArray(record.attendance);
  const students = attendanceInitialized ? record.attendance : rosterFromClass(classGroup);

  return {
    id: schedule.id,
    seriesId: schedule.seriesId || schedule.id,
    occurrenceNumber: Number(schedule.occurrenceIndex || 0) + 1,
    repeatWeeks: Number(schedule.repeatWeeks || 0),
    status: record.status,
    startedAt: record.startedAt,
    completedAt: record.completedAt,
    date: schedule.date,
    startTime: schedule.startTime,
    endTime: schedule.endTime,
    subject: schedule.subject,
    classId: schedule.classId,
    className: schedule.className,
    room: schedule.room,
    teacherId: schedule.teacherId,
    teacher: teacher || { id: schedule.teacherId, name: schedule.teacher, initials: "PG", title: "Pengajar" },
    recurrence: schedule.recurrence,
    conflict: Boolean(schedule.conflict),
    notes: { ...emptyNotes(), ...record.notes },
    notesSavedAt: record.notesSavedAt || null,
    notesReady: Boolean(
      record.notesSavedAt
      && record.notes?.topic?.trim()
      && record.notes?.materialDescription?.trim()
    ),
    attendanceInitialized,
    attendanceSummary: attendanceSummary(students),
    students: students.map((student) => ({ ...student })),
    permissions: getPermissions(schedule, actor),
    updatedAt: record.updatedAt,
  };
}

export async function getSessionDetail(sessionId, actor = {}) {
  const schedule = findSchedule(sessionId);
  const records = readRecords();
  return serializeDetail(schedule, getRecord(schedule, records), actor);
}

export async function updateSessionSchedule(sessionId, changes, actor = {}) {
  const sessions = loadCourseSessions();
  const scheduleIndex = sessions.findIndex((item) => item.id === sessionId);
  if (scheduleIndex < 0) throw new Error("Sesi yang diminta tidak ditemukan.");
  const schedule = sessions[scheduleIndex];
  assertCanEdit(schedule, actor);

  if (!changes.date || !changes.startTime || !changes.endTime || !changes.room?.trim()) {
    throw new Error("Tanggal, waktu, dan ruang kelas wajib diisi.");
  }
  if (changes.endTime <= changes.startTime) throw new Error("Jam selesai harus lebih besar dari jam mulai.");

  const records = readRecords();
  const record = getRecord(schedule, records);
  const attendanceInitialized = Array.isArray(record.attendance);
  if (attendanceInitialized && changes.classId && changes.classId !== schedule.classId) {
    throw new Error("Kelas tidak dapat diganti setelah snapshot absensi dibuat.");
  }

  const classGroup = loadCourseClasses().find((item) => item.id === (changes.classId || schedule.classId));
  const teacher = courseTeachers.find((item) => item.id === (changes.teacherId || schedule.teacherId));
  const subject = loadCourseSubjects().find((item) => item.name === (changes.subject || schedule.subject));
  const updatedSchedule = {
    ...schedule,
    subject: changes.subject || schedule.subject,
    tone: subject?.tone || schedule.tone,
    classId: classGroup?.id || schedule.classId,
    className: classGroup?.name || schedule.className,
    date: changes.date,
    startTime: changes.startTime,
    endTime: changes.endTime,
    teacherId: teacher?.id || schedule.teacherId,
    teacher: teacher?.name || schedule.teacher,
    room: changes.room.trim(),
    recurrence: changes.recurrence || schedule.recurrence,
    repeatWeeks: changes.recurrence === "Tidak berulang" ? 0 : Number(schedule.repeatWeeks || 5),
    conflict: Boolean(changes.conflict),
  };
  sessions[scheduleIndex] = updatedSchedule;
  saveCourseSessions(sessions);
  return serializeDetail(updatedSchedule, record, actor);
}

export async function startSession(sessionId, actor = {}, options = {}) {
  const schedule = findSchedule(sessionId);
  assertCanEdit(schedule, actor);
  const operationalDate = getOperationalDate();
  if (schedule.date !== operationalDate && !options.allowDateMismatch) {
    const error = new Error(`Tanggal sesi ${schedule.date} berbeda dari tanggal operasional ${operationalDate}.`);
    error.code = "OPERATIONAL_DATE_MISMATCH";
    throw error;
  }
  const records = readRecords();
  const record = getRecord(schedule, records);

  if (!Array.isArray(record.attendance)) {
    const classGroup = loadCourseClasses().find((item) => item.id === schedule.classId);
    record.attendance = rosterFromClass(classGroup);
  }
  if (record.status === "scheduled") {
    record.status = "active";
    record.startedAt = new Date().toISOString();
  }
  record.updatedAt = new Date().toISOString();
  records[sessionId] = record;
  writeRecords(records, "start");
  return serializeDetail(schedule, record, actor);
}

export async function saveSessionNotes(sessionId, notes, actor = {}) {
  const schedule = findSchedule(sessionId);
  assertCanEdit(schedule, actor);
  const records = readRecords();
  const record = getRecord(schedule, records);
  record.notes = {
    topic: String(notes.topic || ""),
    materialDescription: String(notes.materialDescription || ""),
    learningNotes: String(notes.learningNotes || ""),
    homework: String(notes.homework || ""),
  };
  record.notesSavedAt = new Date().toISOString();
  record.updatedAt = record.notesSavedAt;
  records[sessionId] = record;
  writeRecords(records, "save-notes");
  return serializeDetail(schedule, record, actor);
}

export async function saveAttendance(sessionId, attendance, actor = {}) {
  const schedule = findSchedule(sessionId);
  assertCanEdit(schedule, actor);
  const records = readRecords();
  const record = getRecord(schedule, records);
  if (!Array.isArray(record.attendance)) throw new Error("Mulai sesi sebelum mengisi absensi.");

  const submitted = new Map(attendance.map((item) => [item.studentId, item.status]));
  record.attendance = record.attendance.map((student) => {
    const nextStatus = submitted.get(student.studentId);
    return nextStatus && VALID_ATTENDANCE.has(nextStatus) ? { ...student, status: nextStatus } : student;
  });
  record.updatedAt = new Date().toISOString();
  records[sessionId] = record;
  writeRecords(records, "save-attendance");
  return serializeDetail(schedule, record, actor);
}

export async function completeSession(sessionId, actor = {}) {
  const schedule = findSchedule(sessionId);
  assertCanEdit(schedule, actor);
  const records = readRecords();
  const record = getRecord(schedule, records);
  if (!Array.isArray(record.attendance)) throw new Error("Sesi belum dimulai.");
  if (!record.notesSavedAt || !record.notes?.topic?.trim() || !record.notes?.materialDescription?.trim()) {
    throw new Error("Simpan topik dan deskripsi materi sebelum menyelesaikan sesi.");
  }
  if (record.attendance.some((student) => student.status === "unset")) {
    throw new Error("Lengkapi seluruh status kehadiran sebelum menyelesaikan sesi.");
  }
  record.status = "completed";
  record.completedAt = new Date().toISOString();
  record.updatedAt = record.completedAt;
  records[sessionId] = record;
  writeRecords(records, "complete");
  return serializeDetail(schedule, record, actor);
}
