import React, { useEffect, useMemo, useState } from "react";
import { Icon, PageHeader } from "../components/ui.jsx";
import {
  loadCourseClasses,
  loadCourseSessions,
  nganjukSchools,
  saveCourseClasses,
} from "../datadummy.js";
import { getStudentMonthlyRecap } from "../services/monthlyRecapService.js";
import {
  previewOutstandingInvoiceRepricing,
  synchronizeOutstandingInvoiceFees,
} from "../services/financeService.js";
import {
  createDefaultFeeCategories,
  resolveStudentFee,
  validateFeeConfiguration,
} from "../services/feeCategoryService.js";
import useDataRevision from "../hooks/useDataRevision.js";
import useOperationalDate from "../hooks/useOperationalDate.js";

const emptyClass = { id: "", name: "", level: "SD" };
const emptyStudent = { id: "", name: "", school: nganjukSchools[0], feeCategoryId: "" };
const monthFormatter = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" });
const dayFormatter = new Intl.DateTimeFormat("id-ID", { weekday: "long" });
const dateFormatter = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" });

const scheduleTone = {
  blue: "border-blue-500 bg-blue-50 text-blue-700",
  green: "border-green-500 bg-green-50 text-green-700",
  red: "border-red-500 bg-red-50 text-red-700",
  purple: "border-purple-500 bg-purple-50 text-purple-700",
  orange: "border-orange-500 bg-orange-50 text-orange-700",
  teal: "border-teal-500 bg-teal-50 text-teal-700",
  amber: "border-amber-500 bg-amber-50 text-amber-700",
};

const paymentTone = {
  Lunas: "bg-emerald-100 text-emerald-800",
  Sebagian: "bg-amber-100 text-amber-800",
  "Belum Bayar": "bg-red-100 text-red-700",
  "Jatuh Tempo": "bg-red-100 text-red-700",
  "Belum Ditagih": "bg-slate-100 text-slate-700",
};

function formatRupiah(value) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value || 0);
}

function MonthlyRecapPanel({ target, recap, loading, error, month, onClose }) {
  if (!target) return null;
  const period = monthFormatter.format(new Date(`${month}-01T12:00:00`));

  return (
    <div className="session-editor-drawer border-y border-emerald-200 bg-[#f3faf5] px-4 py-4" aria-label={`Rekap bulanan ${target.name}`}>
      <div className="mb-4 flex items-center justify-between gap-4">
        <div><p className="text-[10px] font-bold uppercase text-primary">Rekap Bulanan</p><p className="mt-1 text-sm font-bold capitalize text-on-surface">{period}</p></div>
        <button className="icon-button h-8 w-8 rounded-[7px] border border-emerald-200 bg-white" onClick={onClose} aria-label="Tutup rekap"><Icon name="close" className="text-base" /></button>
      </div>
      {loading && <div className="flex min-h-28 items-center justify-center text-primary"><Icon name="sync" className="animate-spin text-2xl" /><span className="ml-3 text-xs font-bold">Memuat rekap...</span></div>}
      {error && <div className="rounded-[8px] border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>}
      {recap && !loading && (
        <div className="grid gap-3 xl:grid-cols-[0.8fr_1fr_1.25fr]">
          <section className="flex items-center gap-4 rounded-[8px] border border-emerald-200 bg-white p-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">{recap.student.initials}</div>
            <div className="min-w-0"><h3 className="truncate text-sm font-bold text-on-surface">{recap.student.name}</h3><p className="mt-1 text-[10px] font-semibold text-primary">{recap.class.name}</p><p className="mt-1 text-[10px] leading-4 text-on-surface-variant">{recap.student.school}</p></div>
          </section>
          <section className="rounded-[8px] border border-outline-variant/45 bg-white p-4">
            <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Icon name="payments" className="text-base text-primary" /><h3 className="text-xs font-bold">Iuran Bulanan</h3></div><span className={`rounded-full px-2.5 py-1 text-[9px] font-bold ${paymentTone[recap.payment.status]}`}>{recap.payment.status}</span></div>
            {recap.permissions.canViewPaymentDetails ? <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[10px]"><span className="text-on-surface-variant">Kategori</span><strong className="text-right text-primary">{recap.payment.feeCategoryName}</strong><span className="text-on-surface-variant">Tagihan</span><strong className="text-right">{formatRupiah(recap.payment.amount)}</strong><span className="text-on-surface-variant">Dibayar</span><strong className="text-right text-primary">{formatRupiah(recap.payment.paidAmount)}</strong><span className="text-on-surface-variant">Sisa</span><strong className="text-right">{formatRupiah(Math.max((recap.payment.amount || 0) - (recap.payment.paidAmount || 0), 0))}</strong><span className="text-on-surface-variant">Tanggal</span><strong className="text-right">{recap.payment.paidAt ? dateFormatter.format(new Date(`${recap.payment.paidAt}T12:00:00`)) : "Belum tercatat"}</strong><span className="text-on-surface-variant">Metode</span><strong className="text-right">{recap.payment.method || "-"}</strong></div> : <p className="mt-3 text-[10px] leading-4 text-on-surface-variant">Kategori: <strong>{recap.payment.feeCategoryName}</strong>. Detail transaksi hanya dapat dilihat oleh admin.</p>}
          </section>
          <section className="rounded-[8px] border border-outline-variant/45 bg-white p-4">
            <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Icon name="receipt_long" className="text-base text-primary" /><h3 className="text-xs font-bold">Rekap Kehadiran</h3></div><span className="text-[10px] font-bold text-primary">{recap.attendance.attendanceRate}% hadir</span></div>
            <div className="mt-3 grid grid-cols-4 gap-2 text-center">{[["Hadir", recap.attendance.present, "bg-emerald-50 text-emerald-700"], ["Izin", recap.attendance.permit, "bg-blue-50 text-blue-700"], ["Sakit", recap.attendance.sick, "bg-amber-50 text-amber-700"], ["Alfa", recap.attendance.absent, "bg-red-50 text-red-700"]].map(([label, value, style]) => <div key={label} className={`rounded-[7px] px-1 py-2 ${style}`}><p className="text-base font-bold">{value}</p><p className="mt-0.5 text-[8px] font-semibold">{label}</p></div>)}</div>
            <p className="mt-2 text-[9px] text-on-surface-variant">Total {recap.attendance.totalSessions} sesi pada bulan ini.</p>
          </section>
        </div>
      )}
    </div>
  );
}

function MasterDialog({ title, description, children, onClose, onSave, saveLabel }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/35 p-4 backdrop-blur-[2px]">
      <form className="w-full max-w-lg overflow-hidden rounded-[8px] border border-outline-variant/50 bg-white shadow-lift" onSubmit={(event) => { event.preventDefault(); onSave(); }}>
        <div className="flex items-start justify-between gap-4 border-b border-outline-variant/35 px-6 py-5">
          <div><h2 className="text-xl font-bold text-on-surface">{title}</h2><p className="mt-1 text-xs leading-5 text-on-surface-variant">{description}</p></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Tutup"><Icon name="close" /></button>
        </div>
        <div className="space-y-4 bg-surface-container-low/45 px-6 py-5">{children}</div>
        <div className="flex justify-end gap-2 px-6 py-4">
          <button className="rounded-[8px] border border-outline-variant/60 px-4 py-2.5 text-sm font-bold" type="button" onClick={onClose}>Batal</button>
          <button className="inline-flex items-center gap-2 rounded-[8px] bg-primary px-5 py-2.5 text-sm font-bold text-white" type="submit"><Icon name="save" className="text-base" /> {saveLabel}</button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-bold text-on-surface-variant">{label}</span>
      <div className="[&>input]:h-11 [&>input]:w-full [&>input]:rounded-[8px] [&>input]:border [&>input]:border-outline-variant/60 [&>input]:px-3 [&>input]:text-sm [&>input]:outline-none [&>input]:focus:border-primary [&>select]:h-11 [&>select]:w-full [&>select]:rounded-[8px] [&>select]:border [&>select]:border-outline-variant/60 [&>select]:bg-white [&>select]:px-3 [&>select]:text-sm [&>select]:outline-none [&>select]:focus:border-primary">{children}</div>
    </label>
  );
}

export default function Rombel({ role }) {
  const operational = useOperationalDate();
  const currentMonth = operational.date.slice(0, 7);
  const canEdit = role === "admin";
  const [sessions, setSessions] = useState(() => loadCourseSessions());
  const [classes, setClasses] = useState(() => loadCourseClasses());
  const [selectedId, setSelectedId] = useState(() => loadCourseClasses()[0]?.id || "");
  const [query, setQuery] = useState("");
  const [studentQuery, setStudentQuery] = useState("");
  const [classDraft, setClassDraft] = useState(null);
  const [studentDraft, setStudentDraft] = useState(null);
  const [batchMode, setBatchMode] = useState(false);
  const [batchRows, setBatchRows] = useState([]);
  const [selectedBatchIds, setSelectedBatchIds] = useState([]);
  const [bulkFeeCategoryId, setBulkFeeCategoryId] = useState("");
  const [feeManagerOpen, setFeeManagerOpen] = useState(false);
  const [feeDrafts, setFeeDrafts] = useState([]);
  const [categoryReplacements, setCategoryReplacements] = useState({});
  const [pendingCategoryDelete, setPendingCategoryDelete] = useState(null);
  const [recapTarget, setRecapTarget] = useState(null);
  const [monthlyRecap, setMonthlyRecap] = useState(null);
  const [recapLoading, setRecapLoading] = useState(false);
  const [recapError, setRecapError] = useState("");
  const [notice, setNotice] = useState("");
  const dataRevision = useDataRevision(["roster", "schedule", "finance", "attendance", "session"]);

  useEffect(() => {
    const nextClasses = loadCourseClasses();
    setClasses(nextClasses);
    setSessions(loadCourseSessions());
    setSelectedId((current) => nextClasses.some((item) => item.id === current) ? current : nextClasses[0]?.id || "");
  }, [dataRevision]);

  const selectedClass = classes.find((item) => item.id === selectedId) || classes[0] || null;
  const visibleClasses = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return classes;
    return classes.filter((item) => `${item.name} ${item.level}`.toLowerCase().includes(normalized));
  }, [classes, query]);
  const visibleStudents = useMemo(() => {
    const normalized = studentQuery.trim().toLowerCase();
    const members = selectedClass?.members || [];
    if (!normalized) return members;
    return members.filter((student) => `${student.name} ${student.school}`.toLowerCase().includes(normalized));
  }, [selectedClass, studentQuery]);
  const visibleBatchRows = useMemo(() => {
    const normalized = studentQuery.trim().toLowerCase();
    if (!normalized) return batchRows;
    return batchRows.filter((student) => `${student.name} ${student.school}`.toLowerCase().includes(normalized));
  }, [batchRows, studentQuery]);
  const batchSummary = useMemo(() => ({
    created: batchRows.filter((student) => student.isNew && !student.markedForDelete).length,
    updated: batchRows.filter((student) => !student.isNew && !student.markedForDelete && (student.name.trim() !== student.originalName || student.school.trim() !== student.originalSchool || student.feeCategoryId !== student.originalFeeCategoryId)).length,
    deleted: batchRows.filter((student) => !student.isNew && student.markedForDelete).length,
  }), [batchRows]);

  const assignedSchedules = useMemo(() => {
    if (!selectedClass) return [];
    const unique = new Map();
    sessions.filter((session) => session.classId === selectedClass.id).forEach((session) => {
      const date = new Date(`${session.date}T12:00:00`);
      const dayIndex = date.getDay();
      const key = `${session.subject}-${dayIndex}-${session.startTime}-${session.endTime}-${session.teacherId}`;
      if (!unique.has(key)) {
        unique.set(key, {
          ...session,
          dayIndex,
          dayLabel: dayFormatter.format(date),
        });
      }
    });
    return [...unique.values()].sort((left, right) => left.dayIndex - right.dayIndex || left.startTime.localeCompare(right.startTime));
  }, [selectedClass, sessions]);

  useEffect(() => {
    if (!recapTarget) return undefined;
    let active = true;
    setMonthlyRecap(null);
    setRecapError("");
    setRecapLoading(true);
    getStudentMonthlyRecap(recapTarget.id, currentMonth, role)
      .then((result) => { if (active) setMonthlyRecap(result); })
      .catch((error) => { if (active) setRecapError(error.message); })
      .finally(() => { if (active) setRecapLoading(false); });
    return () => { active = false; };
  }, [recapTarget, role, dataRevision, currentMonth]);

  useEffect(() => {
    if (!recapTarget) return undefined;
    const closeOnEscape = (event) => { if (event.key === "Escape") setRecapTarget(null); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [recapTarget]);

  const assignedCount = (classId) => new Set(
    sessions
      .filter((session) => session.classId === classId)
      .map((session) => {
        const day = new Date(`${session.date}T12:00:00`).getDay();
        return `${session.subject}-${day}-${session.startTime}-${session.endTime}-${session.teacherId}`;
      }),
  ).size;
  const persist = (next, change = {}) => {
    const preview = previewOutstandingInvoiceRepricing(next);
    if (preview.conflicts.length) {
      const conflict = preview.conflicts[0];
      const detail = conflict.studentName
        ? `${conflict.studentName}: pembayaran aktif ${formatRupiah(conflict.totalPayments)}, tarif tujuan ${formatRupiah(conflict.targetAmount)}.`
        : conflict.message;
      showNotice(`Perubahan diblokir. ${detail}`);
      return null;
    }
    const saved = saveCourseClasses(next, {
      action: "update-roster",
      entityIds: selectedClass?.id ? [selectedClass.id] : [],
      ...change,
    });
    synchronizeOutstandingInvoiceFees({ classId: selectedClass?.id || "" });
    setClasses(saved);
    return saved;
  };
  const showNotice = (message) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2800);
  };
  const studentInitials = (name) => name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const startBatchEdit = () => {
    if (!selectedClass) return;
    setStudentQuery("");
    setRecapTarget(null);
    setStudentDraft(null);
    setBatchRows(selectedClass.members.map((member) => ({
      ...member,
      school: member.school || "",
      originalName: member.name,
      originalSchool: member.school || "",
      originalFeeCategoryId: member.feeCategoryId,
      isNew: false,
      markedForDelete: false,
    })));
    setSelectedBatchIds([]);
    setBulkFeeCategoryId(selectedClass.feeCategories?.[0]?.id || "");
    setBatchMode(true);
  };

  const cancelBatchEdit = () => {
    setBatchMode(false);
    setBatchRows([]);
    setSelectedBatchIds([]);
  };

  const selectClass = (classId) => {
    if (batchMode && !window.confirm("Batalkan perubahan batch yang belum disimpan?")) return;
    cancelBatchEdit();
    setFeeManagerOpen(false);
    setPendingCategoryDelete(null);
    setCategoryReplacements({});
    setSelectedId(classId);
    setStudentQuery("");
    setRecapTarget(null);
  };

  const updateBatchRow = (studentId, field, value) => {
    setBatchRows((current) => current.map((student) => student.id === studentId ? { ...student, [field]: value } : student));
  };

  const addBatchRow = () => {
    setStudentQuery("");
    setBatchRows((current) => [...current, {
      ...emptyStudent,
      id: `batch-new-${Date.now()}-${current.length}`,
      status: "Aktif",
      initials: "",
      originalName: "",
      originalSchool: "",
      originalFeeCategoryId: "",
      isNew: true,
      markedForDelete: false,
    }]);
  };

  const toggleBatchDelete = (studentId) => {
    setBatchRows((current) => current.map((student) => student.id === studentId ? { ...student, markedForDelete: !student.markedForDelete } : student));
  };

  const toggleBatchSelection = (studentId) => {
    setSelectedBatchIds((current) => current.includes(studentId) ? current.filter((id) => id !== studentId) : [...current, studentId]);
  };

  const assignSelectedFeeCategory = () => {
    if (!bulkFeeCategoryId || !selectedBatchIds.length) return showNotice("Pilih siswa dan kategori iuran terlebih dahulu.");
    setBatchRows((current) => current.map((student) => selectedBatchIds.includes(student.id) && !student.markedForDelete ? { ...student, feeCategoryId: bulkFeeCategoryId } : student));
    showNotice(`${selectedBatchIds.length} siswa dipindahkan ke kategori pilihan.`);
  };

  const saveBatchStudents = () => {
    const activeRows = batchRows.filter((student) => !student.markedForDelete);
    const normalizedRows = activeRows.map((student) => ({
      ...student,
      name: student.name.trim(),
      school: student.school.trim(),
    }));
    const validFeeIds = new Set(selectedClass.feeCategories.map((category) => category.id));
    if (normalizedRows.some((student) => !student.name || !student.school || !validFeeIds.has(student.feeCategoryId))) {
      return showNotice("Nama, asal sekolah, dan kategori iuran wajib valid pada semua baris aktif.");
    }
    const normalizedNames = normalizedRows.map((student) => student.name.toLowerCase());
    if (new Set(normalizedNames).size !== normalizedNames.length) {
      return showNotice("Ada nama siswa yang sama di dalam rombel. Periksa kembali data batch.");
    }
    if (batchSummary.deleted > 0 && !window.confirm(`Hapus ${batchSummary.deleted} siswa dari ${selectedClass.name} sekaligus?`)) return;

    const savedAt = Date.now();
    const nextMembers = normalizedRows.map((student, index) => {
      const { originalName, originalSchool, isNew, markedForDelete, ...stored } = student;
      return {
        ...stored,
        id: isNew ? `${selectedClass.id}-student-${savedAt}-${index}` : student.id,
        name: student.name,
        school: student.school,
        status: student.status || "Aktif",
        initials: studentInitials(student.name),
      };
    });
    const saved = persist(classes.map((item) => item.id === selectedClass.id ? { ...item, members: nextMembers } : item), { action: "batch-update-students" });
    if (!saved) return;
    cancelBatchEdit();
    showNotice(`Batch tersimpan: ${batchSummary.created} ditambah, ${batchSummary.updated} diperbarui, ${batchSummary.deleted} dihapus.`);
  };

  const saveClass = () => {
    const name = classDraft.name.trim();
    if (!name) return showNotice("Nama rombel wajib diisi.");
    const duplicate = classes.some((item) => item.id !== classDraft.id && item.name.toLowerCase() === name.toLowerCase());
    if (duplicate) return showNotice("Nama rombel tersebut sudah digunakan.");
    if (classDraft.id) {
      if (!persist(classes.map((item) => item.id === classDraft.id ? { ...item, name, level: classDraft.level } : item))) return;
    } else {
      const id = `class-${Date.now()}`;
      const created = { id, name, level: classDraft.level, monthlyFee: 150000, feeCategories: createDefaultFeeCategories(id), totalStudents: 0, members: [] };
      if (!persist([...classes, created])) return;
      setSelectedId(created.id);
    }
    setClassDraft(null);
    showNotice("Data rombel berhasil disimpan.");
  };

  const deleteClass = () => {
    if (!selectedClass) return;
    if (assignedCount(selectedClass.id) > 0) return showNotice("Rombel masih terhubung dengan jadwal dan belum dapat dihapus.");
    if (!window.confirm(`Hapus ${selectedClass.name} beserta daftar anggotanya?`)) return;
    const next = persist(classes.filter((item) => item.id !== selectedClass.id));
    setSelectedId(next[0]?.id || "");
    showNotice("Rombel berhasil dihapus.");
  };

  const saveStudent = () => {
    const name = studentDraft.name.trim();
    const school = studentDraft.school.trim();
    const feeCategoryId = studentDraft.feeCategoryId;
    if (!name || !school || !selectedClass.feeCategories.some((category) => category.id === feeCategoryId)) return showNotice("Nama, asal sekolah, dan kategori iuran wajib diisi.");
    const nextMembers = studentDraft.id
      ? selectedClass.members.map((member) => member.id === studentDraft.id ? { ...member, name, school, feeCategoryId, initials: name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase() } : member)
      : [...selectedClass.members, { id: `${selectedClass.id}-student-${Date.now()}`, name, school, feeCategoryId, status: "Aktif", initials: name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase() }];
    if (!persist(classes.map((item) => item.id === selectedClass.id ? { ...item, members: nextMembers } : item))) return;
    setStudentDraft(null);
    showNotice("Data siswa berhasil disimpan.");
  };

  const deleteStudent = (student) => {
    if (!window.confirm(`Keluarkan ${student.name} dari ${selectedClass.name}?`)) return;
    persist(classes.map((item) => item.id === selectedClass.id ? { ...item, members: item.members.filter((member) => member.id !== student.id) } : item));
    showNotice("Siswa dikeluarkan dari rombel.");
  };

  const openFeeManager = () => {
    setFeeDrafts(selectedClass.feeCategories.map((category) => ({ ...category })));
    setCategoryReplacements({});
    setPendingCategoryDelete(null);
    setFeeManagerOpen(true);
  };

  const addFeeCategory = () => {
    const suffix = Math.random().toString(36).slice(2, 7);
    setFeeDrafts((current) => [...current, { id: `${selectedClass.id}-fee-${Date.now()}-${suffix}`, name: "", amount: 150000 }]);
  };

  const requestFeeCategoryDelete = (categoryId) => {
    if (feeDrafts.length <= 1) return showNotice("Kategori terakhir tidak dapat dihapus.");
    const usedCount = selectedClass.members.filter((student) => student.feeCategoryId === categoryId).length;
    if (!usedCount) return setFeeDrafts((current) => current.filter((category) => category.id !== categoryId));
    const replacementId = feeDrafts.find((category) => category.id !== categoryId)?.id || "";
    setPendingCategoryDelete({ categoryId, replacementId, usedCount });
  };

  const confirmFeeCategoryDelete = () => {
    if (!pendingCategoryDelete?.replacementId) return showNotice("Pilih kategori pengganti terlebih dahulu.");
    setCategoryReplacements((current) => ({ ...current, [pendingCategoryDelete.categoryId]: pendingCategoryDelete.replacementId }));
    setFeeDrafts((current) => current.filter((category) => category.id !== pendingCategoryDelete.categoryId));
    setPendingCategoryDelete(null);
  };

  const saveFeeCategories = () => {
    const normalizedCategories = feeDrafts.map((category) => ({ ...category, name: category.name.trim(), amount: Number(category.amount) }));
    const nextClass = {
      ...selectedClass,
      feeCategories: normalizedCategories,
      members: selectedClass.members.map((student) => ({ ...student, feeCategoryId: categoryReplacements[student.feeCategoryId] || student.feeCategoryId })),
    };
    const validation = validateFeeConfiguration(nextClass);
    if (!validation.valid) return showNotice(validation.errors[0]);
    if (!persist(classes.map((item) => item.id === selectedClass.id ? nextClass : item), { action: "update-fee-categories" })) return;
    setFeeManagerOpen(false);
    setCategoryReplacements({});
    showNotice("Kategori iuran dan invoice belum lunas berhasil disinkronkan.");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rombel"
        description="Kelola kelompok belajar, anggota siswa, dan asal sekolah."
        action={canEdit ? <button className="inline-flex h-11 items-center gap-2 rounded-[8px] bg-primary px-5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50" disabled={batchMode} onClick={() => setClassDraft({ ...emptyClass })} title={batchMode ? "Simpan atau batalkan perubahan batch terlebih dahulu" : "Tambah rombel"}><Icon name="add" /> Tambah Rombel</button> : null}
      />

      {!canEdit && <div className="flex items-start gap-3 rounded-[8px] border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800"><Icon name="info" className="text-base" /><div><p className="font-bold">Mode hanya lihat</p><p className="mt-1 text-xs">Perubahan anggota rombel dikelola oleh admin.</p></div></div>}

      <section className="grid min-h-[620px] overflow-hidden rounded-[8px] border border-outline-variant/50 bg-white shadow-sm lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="border-b border-outline-variant/40 bg-[#f6faf6] lg:border-b-0 lg:border-r">
          <div className="border-b border-outline-variant/35 p-3">
            <div className="relative"><Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-base text-on-surface-variant" /><input className="h-10 w-full rounded-[8px] border border-outline-variant/50 bg-white pl-10 pr-3 text-xs outline-none focus:border-primary" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari rombel..." /></div>
          </div>
          <div className="max-h-[340px] space-y-1.5 overflow-y-auto p-3 lg:max-h-[calc(100vh-240px)]">
            {visibleClasses.map((item) => {
              const active = selectedClass?.id === item.id;
              return (
                <button key={item.id} className={`w-full rounded-[8px] border px-4 py-3 text-left transition ${active ? "border-primary bg-primary text-white shadow-sm" : "border-transparent text-on-surface hover:border-outline-variant/40 hover:bg-white"}`} onClick={() => selectClass(item.id)}>
                  <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className={`break-words text-sm font-bold leading-5 ${active ? "text-white" : "text-on-surface"}`}>{item.name}</p><p className={`mt-1 text-[10px] font-semibold ${active ? "text-white/75" : "text-on-surface-variant"}`}>{item.level}</p></div><span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-bold ${active ? "bg-white text-primary" : "bg-emerald-50 text-primary"}`}>{item.members.length} siswa</span></div>
                  <p className={`mt-3 flex items-center gap-1.5 text-[10px] font-semibold ${active ? "text-white/85" : "text-on-surface-variant"}`}><Icon name="calendar_month" className="text-base" /> {assignedCount(item.id)} pola sesi</p>
                </button>
              );
            })}
          </div>
        </aside>

        <main className="min-w-0">
          {selectedClass ? <>
            <div className="flex flex-col gap-4 border-b border-outline-variant/35 px-4 py-4 sm:flex-row sm:items-center sm:justify-between lg:px-5">
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="rounded-[6px] bg-emerald-100 px-2.5 py-1 text-[10px] font-bold text-emerald-900">{selectedClass.level}</span><span className="text-xs font-semibold text-on-surface-variant">{selectedClass.members.length} siswa aktif</span><span className="text-xs text-on-surface-variant">{selectedClass.feeCategories.length} kategori iuran</span></div><h2 className="mt-2 break-words text-[22px] font-bold leading-7 text-primary">{selectedClass.name}</h2></div>
              {canEdit && !batchMode && <div className="flex shrink-0 gap-2"><button className="icon-button border border-outline-variant/50 bg-white" onClick={() => setClassDraft({ id: selectedClass.id, name: selectedClass.name, level: selectedClass.level })} title="Edit rombel"><Icon name="edit" /></button><button className="icon-button border border-red-200 bg-white text-red-600" onClick={deleteClass} title="Hapus rombel"><Icon name="delete" /></button></div>}
            </div>

            <section className="border-b border-outline-variant/35 bg-white px-4 py-4 lg:px-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><Icon name="payments" className="text-primary" /><h3 className="text-sm font-bold">Kategori Iuran</h3></div><p className="mt-1 text-[10px] text-on-surface-variant">Tarif bulanan mengikuti kategori yang dipilih pada setiap siswa.</p></div>{canEdit && !batchMode && <button className="inline-flex h-9 items-center justify-center gap-2 rounded-[8px] border border-primary px-3 text-[10px] font-bold text-primary hover:bg-emerald-50" onClick={feeManagerOpen ? () => setFeeManagerOpen(false) : openFeeManager}><Icon name={feeManagerOpen ? "close" : "settings"} className="text-base" /> {feeManagerOpen ? "Tutup" : "Kelola Kategori"}</button>}</div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{selectedClass.feeCategories.map((category) => { const count = selectedClass.members.filter((student) => student.feeCategoryId === category.id).length; return <div key={category.id} className="flex items-center justify-between gap-3 rounded-[8px] border border-emerald-200 bg-[#f5fbf7] px-3 py-2.5"><div className="min-w-0"><p className="truncate text-xs font-bold text-primary">{category.name}</p><p className="mt-1 text-[10px] text-on-surface-variant">{count} siswa</p></div><strong className="shrink-0 text-xs">{formatRupiah(category.amount)}</strong></div>; })}</div>
              {feeManagerOpen && <div className="session-editor-drawer mt-4 border-t border-emerald-200 pt-4"><div className="space-y-2">{feeDrafts.map((category) => <div key={category.id} className="grid gap-2 rounded-[8px] border border-outline-variant/45 bg-[#fbfdfb] p-3 sm:grid-cols-[minmax(150px,1fr)_180px_36px]"><input className="h-9 rounded-[7px] border border-outline-variant/55 px-3 text-xs font-semibold outline-none focus:border-primary" value={category.name} onChange={(event) => setFeeDrafts((current) => current.map((item) => item.id === category.id ? { ...item, name: event.target.value } : item))} placeholder="Nama kategori" /><input className="h-9 rounded-[7px] border border-outline-variant/55 px-3 text-xs outline-none focus:border-primary" type="number" min="1" step="10000" value={category.amount} onChange={(event) => setFeeDrafts((current) => current.map((item) => item.id === category.id ? { ...item, amount: event.target.value } : item))} aria-label={`Nominal ${category.name}`} /><button className="icon-button h-9 w-9 text-red-600" onClick={() => requestFeeCategoryDelete(category.id)} title="Hapus kategori"><Icon name="delete" className="text-base" /></button></div>)}</div>{pendingCategoryDelete && <div className="mt-3 rounded-[8px] border border-amber-200 bg-amber-50 p-3"><p className="text-xs font-bold text-amber-900">Pindahkan {pendingCategoryDelete.usedCount} siswa sebelum menghapus kategori</p><div className="mt-2 flex flex-col gap-2 sm:flex-row"><select className="h-9 flex-1 rounded-[7px] border border-amber-300 bg-white px-3 text-xs" value={pendingCategoryDelete.replacementId} onChange={(event) => setPendingCategoryDelete((current) => ({ ...current, replacementId: event.target.value }))}>{feeDrafts.filter((category) => category.id !== pendingCategoryDelete.categoryId).map((category) => <option key={category.id} value={category.id}>{category.name || "Kategori tanpa nama"}</option>)}</select><button className="h-9 rounded-[7px] bg-amber-700 px-4 text-xs font-bold text-white" onClick={confirmFeeCategoryDelete}>Pindahkan dan Hapus</button><button className="h-9 rounded-[7px] border border-amber-300 px-4 text-xs font-bold" onClick={() => setPendingCategoryDelete(null)}>Batal</button></div></div>}<div className="mt-4 flex flex-wrap justify-between gap-2"><button className="inline-flex h-9 items-center gap-2 rounded-[7px] border border-primary px-3 text-xs font-bold text-primary" onClick={addFeeCategory}><Icon name="add" className="text-base" /> Tambah Kategori</button><button className="inline-flex h-9 items-center gap-2 rounded-[7px] bg-primary px-4 text-xs font-bold text-white" onClick={saveFeeCategories}><Icon name="save" className="text-base" /> Simpan dan Sinkronkan</button></div></div>}
            </section>

            <section className="border-b border-outline-variant/35 bg-[#f4faf6] px-4 py-4 lg:px-5">
              <div className="flex items-center justify-between gap-3"><div><div className="flex items-center gap-2"><Icon name="calendar_month" className="text-primary" /><h3 className="text-sm font-bold text-on-surface">Jadwal Ter-assign</h3></div><p className="mt-1 text-[10px] text-on-surface-variant">Pola jadwal mingguan tanpa duplikasi pengulangan.</p></div><span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-primary">{assignedSchedules.length} sesi</span></div>
              {assignedSchedules.length > 0 ? (
                <div className="mt-3 grid gap-x-5 md:grid-cols-2">
                  {assignedSchedules.map((session) => {
                    const style = scheduleTone[session.tone] || scheduleTone.teal;
                    return <div key={`${session.id}-${session.dayIndex}`} className={`grid grid-cols-[minmax(90px,0.8fr)_minmax(120px,1fr)_minmax(90px,0.8fr)] items-center gap-3 border-l-4 border-b border-b-outline-variant/30 px-3 py-2.5 text-[11px] ${style}`}><strong className="truncate" title={session.subject}>{session.subject}</strong><span className="truncate text-on-surface" title={`${session.dayLabel}, ${session.startTime} - ${session.endTime}`}>{session.dayLabel}, {session.startTime} - {session.endTime}</span><span className="flex min-w-0 items-center gap-1.5 text-on-surface-variant"><Icon name="person" className="text-base" /><span className="truncate" title={session.teacher}>{session.teacher}</span></span></div>;
                  })}
                </div>
              ) : <div className="mt-3 flex items-center gap-2 rounded-[8px] border border-dashed border-outline-variant/60 bg-white px-4 py-4 text-xs text-on-surface-variant"><Icon name="event_busy" className="text-primary" /> Belum ada sesi yang di-assign ke rombel ini.</div>}
            </section>

            <div className="flex flex-col gap-3 border-b border-outline-variant/35 px-4 py-3 lg:px-5">
              {batchMode && <div className="flex items-start gap-2 rounded-[8px] border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11px] leading-5 text-amber-900"><Icon name="info" className="mt-0.5 shrink-0 text-base" /><p><strong>Mode kelola batch aktif.</strong> Nama, sekolah, dan kategori iuran disimpan bersama. Invoice belum lunas akan disinkronkan; invoice lunas tetap menjadi histori.</p></div>}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full sm:max-w-sm"><Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-base text-on-surface-variant" /><input className="h-10 w-full rounded-[8px] border border-outline-variant/50 bg-surface-container-low/50 pl-10 pr-3 text-xs outline-none focus:border-primary focus:bg-white" value={studentQuery} onChange={(event) => setStudentQuery(event.target.value)} placeholder="Cari nama atau sekolah..." /></div>
              {canEdit && !batchMode && <div className="flex flex-wrap gap-2"><button className="inline-flex h-10 items-center justify-center gap-2 rounded-[8px] border border-outline-variant/60 bg-white px-4 text-xs font-bold text-on-surface hover:bg-surface-container-low" onClick={startBatchEdit}><Icon name="edit" className="text-base" /> Kelola Batch</button><button className="inline-flex h-10 items-center justify-center gap-2 rounded-[8px] border border-primary bg-white px-4 text-xs font-bold text-primary hover:bg-emerald-50" onClick={() => setStudentDraft({ ...emptyStudent })}><Icon name="add" className="text-base" /> Tambah Siswa</button></div>}
              {canEdit && batchMode && <div className="flex flex-wrap gap-2"><button className="inline-flex h-10 items-center justify-center gap-2 rounded-[8px] border border-primary bg-white px-4 text-xs font-bold text-primary hover:bg-emerald-50" onClick={addBatchRow}><Icon name="add" className="text-base" /> Tambah Baris</button><button className="inline-flex h-10 items-center justify-center rounded-[8px] border border-outline-variant/60 bg-white px-4 text-xs font-bold text-on-surface" onClick={cancelBatchEdit}>Batal</button><button className="inline-flex h-10 items-center justify-center gap-2 rounded-[8px] bg-primary px-4 text-xs font-bold text-white shadow-sm" onClick={saveBatchStudents}><Icon name="save" className="text-base" /> Simpan Batch</button></div>}
              </div>
              {batchMode && <><div className="flex flex-wrap gap-2 text-[10px] font-bold"><span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-700">{batchSummary.created} baru</span><span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">{batchSummary.updated} diubah</span><span className="rounded-full bg-red-50 px-2.5 py-1 text-red-700">{batchSummary.deleted} dihapus</span></div><div className="flex flex-col gap-2 rounded-[8px] border border-emerald-200 bg-emerald-50/55 p-2.5 sm:flex-row sm:items-center"><span className="text-[10px] font-bold text-primary">{selectedBatchIds.length} siswa dipilih</span><select className="h-9 min-w-[180px] flex-1 rounded-[7px] border border-emerald-200 bg-white px-3 text-xs" value={bulkFeeCategoryId} onChange={(event) => setBulkFeeCategoryId(event.target.value)}>{selectedClass.feeCategories.map((category) => <option key={category.id} value={category.id}>{category.name} - {formatRupiah(category.amount)}</option>)}</select><button className="h-9 rounded-[7px] bg-primary px-4 text-xs font-bold text-white disabled:opacity-40" disabled={!selectedBatchIds.length} onClick={assignSelectedFeeCategory}>Assign Kategori</button></div></>}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left">
                <thead className="border-b border-outline-variant/35 bg-[#fbfdfb] text-[10px] uppercase text-on-surface-variant"><tr>{batchMode && <th className="w-12 px-4 py-3"><input type="checkbox" aria-label="Pilih semua siswa" checked={batchRows.filter((student) => !student.markedForDelete).length > 0 && selectedBatchIds.length === batchRows.filter((student) => !student.markedForDelete).length} onChange={(event) => setSelectedBatchIds(event.target.checked ? batchRows.filter((student) => !student.markedForDelete).map((student) => student.id) : [])} /></th>}<th className="px-5 py-3 font-bold">Siswa</th><th className="px-5 py-3 font-bold">Asal Sekolah</th><th className="px-5 py-3 font-bold">Kategori Iuran</th><th className="px-5 py-3 font-bold">Status</th><th className="w-36 px-5 py-3 text-right font-bold">Aksi</th></tr></thead>
                <tbody className="divide-y divide-outline-variant/30">
                  {batchMode ? visibleBatchRows.map((student) => (
                    <tr key={student.id} className={student.markedForDelete ? "bg-red-50/80" : student.isNew ? "bg-blue-50/35" : "bg-white"}>
                      <td className="px-4 py-3"><input type="checkbox" checked={selectedBatchIds.includes(student.id)} disabled={student.markedForDelete} onChange={() => toggleBatchSelection(student.id)} aria-label={`Pilih ${student.name || "siswa baru"}`} /></td>
                      <td className="px-5 py-3"><div className="flex items-center gap-3"><div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${student.markedForDelete ? "bg-red-100 text-red-600" : "bg-emerald-100 text-primary"}`}>{studentInitials(student.name) || "?"}</div><input className={`h-9 min-w-0 w-full rounded-[7px] border px-3 text-xs font-semibold outline-none focus:border-primary ${student.markedForDelete ? "border-red-200 bg-red-50 text-red-500 line-through" : "border-outline-variant/60 bg-white"}`} value={student.name} disabled={student.markedForDelete} onChange={(event) => updateBatchRow(student.id, "name", event.target.value)} placeholder="Nama lengkap siswa" aria-label="Nama siswa" /></div></td>
                      <td className="px-5 py-3"><input list="nganjuk-school-options" className={`h-9 w-full rounded-[7px] border px-3 text-xs outline-none focus:border-primary ${student.markedForDelete ? "border-red-200 bg-red-50 text-red-500 line-through" : "border-outline-variant/60 bg-white"}`} value={student.school} disabled={student.markedForDelete} onChange={(event) => updateBatchRow(student.id, "school", event.target.value)} placeholder="Asal sekolah" aria-label="Asal sekolah" /></td>
                      <td className="px-5 py-3"><select className="h-9 w-full rounded-[7px] border border-outline-variant/60 bg-white px-2 text-xs outline-none focus:border-primary" value={student.feeCategoryId || ""} disabled={student.markedForDelete} onChange={(event) => updateBatchRow(student.id, "feeCategoryId", event.target.value)} aria-label="Kategori iuran"><option value="">Pilih kategori</option>{selectedClass.feeCategories.map((category) => <option key={category.id} value={category.id}>{category.name} - {formatRupiah(category.amount)}</option>)}</select></td>
                      <td className="px-5 py-3"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${student.markedForDelete ? "bg-red-100 text-red-700" : student.isNew ? "bg-blue-50 text-blue-700" : "bg-emerald-50 text-emerald-700"}`}>{student.markedForDelete ? "Akan dihapus" : student.isNew ? "Baru" : "Aktif"}</span></td>
                      <td className="px-5 py-3"><div className="flex justify-end"><button className={`icon-button border ${student.markedForDelete ? "border-outline-variant/60 bg-white text-primary" : "border-red-200 bg-red-50 text-red-600"}`} onClick={() => toggleBatchDelete(student.id)} title={student.markedForDelete ? "Urungkan hapus" : "Tandai untuk dihapus"}><Icon name={student.markedForDelete ? "sync" : "delete"} className="text-base" /></button></div></td>
                    </tr>
                  )) : visibleStudents.map((student) => (
                    <React.Fragment key={student.id}>
                      <tr className={recapTarget?.id === student.id ? "bg-emerald-50/45" : "hover:bg-emerald-50/30"}>
                        <td className="px-5 py-3"><div className="flex items-center gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-primary">{student.initials}</div><p className="text-sm font-bold">{student.name}</p></div></td>
                        <td className="px-5 py-3 text-xs text-on-surface-variant">{student.school || "Belum diisi"}</td>
                        <td className="px-5 py-3">{(() => { const fee = resolveStudentFee(selectedClass, student); return fee ? <div><span className="rounded-full bg-teal-50 px-2.5 py-1 text-[10px] font-bold text-teal-800">{fee.name}</span><p className="mt-1.5 text-[10px] font-semibold text-on-surface-variant">{formatRupiah(fee.amount)}</p></div> : <span className="text-[10px] font-bold text-red-600">Belum dipilih</span>; })()}</td>
                        <td className="px-5 py-3"><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">Aktif</span></td>
                        <td className="px-5 py-3"><div className="flex justify-end gap-1"><button className={`icon-button border border-emerald-200 text-primary ${recapTarget?.id === student.id ? "bg-primary text-white" : "bg-emerald-50"}`} onClick={() => setRecapTarget((current) => current?.id === student.id ? null : student)} title="Rekap Bulanan" aria-expanded={recapTarget?.id === student.id} aria-label={`Rekap bulanan ${student.name}`}><Icon name="receipt_long" className="text-base" /></button>{canEdit && <><button className="icon-button" onClick={() => setStudentDraft({ id: student.id, name: student.name, school: student.school || nganjukSchools[0], feeCategoryId: student.feeCategoryId || "" })} title="Edit siswa"><Icon name="edit" className="text-base" /></button><button className="icon-button text-red-600" onClick={() => deleteStudent(student)} title="Keluarkan siswa"><Icon name="delete" className="text-base" /></button></>}</div></td>
                      </tr>
                      {recapTarget?.id === student.id && <tr><td colSpan="5" className="p-0"><MonthlyRecapPanel target={recapTarget} recap={monthlyRecap} loading={recapLoading} error={recapError} month={currentMonth} onClose={() => setRecapTarget(null)} /></td></tr>}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
              {(batchMode ? visibleBatchRows.length === 0 : visibleStudents.length === 0) && <div className="py-14 text-center"><Icon name="groups" className="mx-auto text-2xl text-outline" /><p className="mt-3 text-sm font-semibold text-on-surface-variant">Belum ada siswa yang sesuai.</p>{batchMode && !studentQuery && <button className="mt-4 inline-flex h-9 items-center gap-2 rounded-[8px] border border-primary px-4 text-xs font-bold text-primary" onClick={addBatchRow}><Icon name="add" className="text-base" /> Tambah baris pertama</button>}</div>}
            </div>
          </> : <div className="flex min-h-[500px] items-center justify-center text-sm text-on-surface-variant">Belum ada rombel.</div>}
        </main>
      </section>

      {classDraft && <MasterDialog title={classDraft.id ? "Edit Rombel" : "Tambah Rombel"} description="Rombel baru otomatis mendapat kategori Anak Lama dan Anak Baru. Tarif dikelola dari panel Kategori Iuran." onClose={() => setClassDraft(null)} onSave={saveClass} saveLabel="Simpan Rombel"><Field label="Nama Rombel"><input value={classDraft.name} onChange={(event) => setClassDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Contoh: Kelas 9 SMP C" autoFocus /></Field><Field label="Jenjang"><select value={classDraft.level} onChange={(event) => setClassDraft((current) => ({ ...current, level: event.target.value }))}>{["SD", "9 SMP", "10 SMA", "11 SMA", "12 SMA"].map((level) => <option key={level}>{level}</option>)}</select></Field></MasterDialog>}
      {studentDraft && <MasterDialog title={studentDraft.id ? "Edit Siswa" : "Tambah Siswa"} description={`Data anggota ${selectedClass?.name || "rombel"}. Kategori iuran wajib dipilih agar tagihan dapat dibuat.`} onClose={() => setStudentDraft(null)} onSave={saveStudent} saveLabel="Simpan Siswa"><Field label="Nama Lengkap"><input value={studentDraft.name} onChange={(event) => setStudentDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Nama siswa" autoFocus /></Field><Field label="Asal Sekolah"><input list="nganjuk-school-options" value={studentDraft.school} onChange={(event) => setStudentDraft((current) => ({ ...current, school: event.target.value }))} placeholder="Sekolah di Nganjuk" /></Field><Field label="Kategori Iuran"><select value={studentDraft.feeCategoryId || ""} onChange={(event) => setStudentDraft((current) => ({ ...current, feeCategoryId: event.target.value }))}><option value="">Pilih kategori</option>{selectedClass?.feeCategories.map((category) => <option key={category.id} value={category.id}>{category.name} - {formatRupiah(category.amount)}</option>)}</select></Field></MasterDialog>}
      <datalist id="nganjuk-school-options">{nganjukSchools.map((school) => <option key={school} value={school} />)}</datalist>
      {notice && <div className="fixed bottom-6 right-6 z-[80] flex max-w-sm items-center gap-3 rounded-[8px] bg-primary px-4 py-3 text-sm font-semibold text-white shadow-lift"><Icon name="info" className="text-base" /> {notice}</div>}
    </div>
  );
}
