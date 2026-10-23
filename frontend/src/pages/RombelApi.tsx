import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useEffect, useMemo, useState } from "react";
import {
  ApiError,
  apiEnvelope,
  apiGet,
  apiListAll,
  queryString,
} from "../api/client";
import { queryKeys } from "../api/queryKeys";
import type {
  ClassGroup,
  Enrollment,
  FeePlan,
  Occurrence,
  Room,
} from "../api/types";
import { useAuth } from "../auth/AuthProvider";
import DatabaseTabs from "../components/DatabaseTabs";
import { Icon, PageHeader } from "../components/ui";
import useOperationalDate from "../hooks/useOperationalDate.js";

interface RecapRow {
  student: {
    id: string;
    student_code: string;
    full_name: string;
    school: string;
  };
  payment: {
    status: string;
    fee_plan_name: string;
    amount_due_rupiah?: number;
    paid_rupiah?: number;
    outstanding_rupiah?: number;
  };
  attendance: {
    total_sessions: number;
    present: number;
    permit: number;
    sick: number;
    absent: number;
    attendance_rate: number;
  };
}
interface ClassRecap {
  class_group: { id: string; name: string };
  month: string;
  students: RecapRow[];
  count: number;
}
interface BatchRow {
  key: string;
  student_id?: string;
  full_name: string;
  school: string;
  fee_plan_id: string;
  action: "upsert" | "archive";
}

const rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});
const day = new Intl.DateTimeFormat("id-ID", { weekday: "long" });
const clock = new Intl.DateTimeFormat("id-ID", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const schools = [
  "SDN 1 Nganjuk",
  "SDN Mangundikaran 1",
  "SMP Negeri 1 Nganjuk",
  "SMP Negeri 2 Nganjuk",
  "SMP Negeri 3 Nganjuk",
  "SMA Negeri 1 Nganjuk",
  "SMA Negeri 2 Nganjuk",
  "SMAN 1 Kertosono",
  "SMAN 1 Tanjunganom",
  "MAN 2 Nganjuk",
];
function shift(value: string, amount: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function RombelApi() {
  const { user } = useAuth();
  const operational = useOperationalDate();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [batchMode, setBatchMode] = useState(false);
  const [batchRows, setBatchRows] = useState<BatchRow[]>([]);
  const [recapStudent, setRecapStudent] = useState<string | undefined>("");
  const [feeOpen, setFeeOpen] = useState(false);
  const [feeDrafts, setFeeDrafts] = useState<
    Array<Partial<FeePlan> & { tempId: string }>
  >([]);
  const [feeRemoval, setFeeRemoval] = useState<FeePlan | null>(null);
  const [replacementPlan, setReplacementPlan] = useState("");
  const [classDraft, setClassDraft] = useState<Partial<ClassGroup> | null>(
    null,
  );
  const [notice, setNotice] = useState("");
  const classes = useQuery({
    queryKey: queryKeys.classes,
    queryFn: ({ signal }) =>
      apiListAll<ClassGroup>("/api/v1/class-groups/?is_active=true", signal),
  });
  const rooms = useQuery({
    queryKey: queryKeys.rooms,
    queryFn: ({ signal }) =>
      apiListAll<Room>("/api/v1/rooms/?is_active=true", signal),
  });
  useEffect(() => {
    if (!selectedId && classes.data?.length) setSelectedId(classes.data[0].id);
  }, [classes.data, selectedId]);
  const selected = classes.data?.find((item) => item.id === selectedId) || null;
  const enrollments = useQuery({
    queryKey: queryKeys.enrollments(selectedId),
    queryFn: ({ signal }) =>
      apiListAll<Enrollment>(
        `/api/v1/enrollments/${queryString({ class_group: selectedId, status: "ACTIVE" })}`,
        signal,
      ),
    enabled: Boolean(selectedId),
  });
  const schedules = useQuery({
    queryKey: ["rombel", "schedule", selectedId, operational.date],
    queryFn: ({ signal }) =>
      apiListAll<Occurrence>(
        `/api/v1/schedule-occurrences/${queryString({ from: `${shift(operational.date, -45)}T00:00:00+07:00`, to: `${shift(operational.date, 46)}T00:00:00+07:00`, class_group: selectedId })}`,
        signal,
      ),
    enabled: Boolean(selectedId),
  });
  const month = operational.date.slice(0, 7);
  const recap = useQuery({
    queryKey: ["rombel", "recap", selectedId, month],
    queryFn: ({ signal }) =>
      apiGet<ClassRecap>(
        `/api/v1/class-groups/${selectedId}/monthly-recap/${queryString({ month })}`,
        signal,
      ),
    enabled: Boolean(selectedId),
  });

  useEffect(() => {
    if (!enrollments.data || batchMode) return;
    setBatchRows(
      enrollments.data.map((item) => ({
        key: item.student,
        student_id: item.student,
        full_name: item.student_name,
        school: item.student_school,
        fee_plan_id: item.fee_plan,
        action: "upsert",
      })),
    );
  }, [enrollments.data, batchMode]);
  useEffect(() => {
    if (selected)
      setFeeDrafts(
        selected.fee_plans.map((item) => ({ ...item, tempId: item.id })),
      );
  }, [selected]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.classes });
    void queryClient.invalidateQueries({
      queryKey: ["academics", "enrollments"],
    });
    void queryClient.invalidateQueries({ queryKey: ["rombel"] });
  };
  const rosterMutation = useMutation({
    mutationFn: () =>
      apiEnvelope<Enrollment[]>("/api/v1/enrollments/roster-batch/", {
        method: "POST",
        body: {
          class_group_id: selectedId,
          items: batchRows.map((item) =>
            item.action === "archive"
              ? { student_id: item.student_id, action: "archive" }
              : {
                  student_id: item.student_id,
                  full_name: item.full_name,
                  school: item.school,
                  grade_level: selected?.level,
                  fee_plan_id: item.fee_plan_id,
                  started_on: operational.date,
                  action: "upsert",
                },
          ),
        },
      }),
    onSuccess: () => {
      setBatchMode(false);
      setNotice("Perubahan anggota rombel tersimpan dan siap dibaca Finance.");
      invalidate();
    },
  });
  const classMutation = useMutation({
    mutationFn: async (draft: Partial<ClassGroup>) => {
      const body = {
        name: draft.name,
        level: draft.level,
        default_room: draft.default_room || null,
        is_active: true,
      };
      if (draft.id)
        return apiEnvelope<ClassGroup>(`/api/v1/class-groups/${draft.id}/`, {
          method: "PATCH",
          body,
        });
      return apiEnvelope<ClassGroup>("/api/v1/class-groups/", {
        method: "POST",
        body,
      });
    },
    onSuccess: (response) => {
      setClassDraft(null);
      setSelectedId(response.data.id);
      setNotice("Rombel berhasil disimpan.");
      invalidate();
    },
  });
  const feeMutation = useMutation({
    mutationFn: async () => {
      if (!selected) return;
      for (const item of feeDrafts) {
        const body = {
          class_group: selected.id,
          name: item.name,
          monthly_amount_rupiah: Number(item.monthly_amount_rupiah),
          effective_from: item.effective_from || `${month}-01`,
          effective_until: item.effective_until || null,
          is_active: true,
        };
        if (item.id)
          await apiEnvelope(`/api/v1/fee-plans/${item.id}/`, {
            method: "PATCH",
            body,
          });
        else await apiEnvelope("/api/v1/fee-plans/", { method: "POST", body });
      }
    },
    onSuccess: () => {
      setFeeOpen(false);
      setNotice(
        "Kategori iuran berhasil disimpan. Invoice lama hanya berubah melalui repricing eksplisit di Finance.",
      );
      invalidate();
    },
  });
  const archiveFeeMutation = useMutation({
    mutationFn: () =>
      apiEnvelope<{ moved_count: number }>(
        `/api/v1/fee-plans/${feeRemoval?.id}/replace-and-archive/`,
        {
          method: "POST",
          body: { replacement: replacementPlan || null },
        },
      ),
    onSuccess: (response) => {
      setNotice(
        response.data.moved_count
          ? `${response.data.moved_count} siswa dipindahkan dan kategori berhasil diarsipkan.`
          : "Kategori iuran berhasil diarsipkan.",
      );
      setFeeRemoval(null);
      setReplacementPlan("");
      invalidate();
    },
  });

  const patterns = useMemo(() => {
    const seen = new Set<string>();
    return (schedules.data || []).filter((item) => {
      const start = new Date(item.start_at);
      const key = `${item.subject}|${start.getDay()}|${clock.format(start)}|${item.teacher}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [schedules.data]);
  const rows = batchMode
    ? batchRows
    : (enrollments.data || []).filter(
        (item) =>
          item.student_name.toLowerCase().includes(search.toLowerCase()) ||
          item.student_school.toLowerCase().includes(search.toLowerCase()),
      );
  const mutationError =
    rosterMutation.error ||
    classMutation.error ||
    feeMutation.error ||
    archiveFeeMutation.error;

  return (
    <div className="space-y-5">
      <DatabaseTabs />
      <PageHeader
        title="Database Siswa"
        description="Kelola anggota kelas, kategori iuran, jadwal ter-assign, dan rekap bulanan."
        action={
          user?.permissions.manage_academics && (
            <button
              className="primary-button rounded-[8px]"
              onClick={() =>
                setClassDraft({
                  name: "",
                  level: "9 SMP",
                  default_room: rooms.data?.[0]?.id,
                })
              }
            >
              <Icon name="add" />
              Tambah Rombel
            </button>
          )
        }
      />
      {notice && (
        <div className="rounded-[8px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-primary">
          {notice}
        </div>
      )}
      {mutationError && (
        <div className="rounded-[8px] border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700">
          {mutationError instanceof ApiError
            ? mutationError.detail.message
            : "Perubahan gagal disimpan."}
        </div>
      )}
      <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="min-w-0 self-start overflow-hidden rounded-[8px] border border-emerald-100 bg-white p-3 shadow-soft lg:sticky lg:top-0">
          <div className="px-2 py-3">
            <h2 className="text-sm font-bold">Daftar Rombel</h2>
            <p className="mt-1 text-[10px] text-on-surface-variant">
              {classes.data?.length || 0} rombel aktif
            </p>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 lg:block lg:space-y-2 lg:overflow-visible lg:pb-0">
            {classes.data?.map((item) => (
              <button
                key={item.id}
                className={`w-[220px] shrink-0 rounded-[8px] border p-3 text-left transition lg:w-full ${selectedId === item.id ? "border-primary bg-primary text-white shadow-sm" : "border-emerald-100 bg-[#fbfefc] hover:border-primary/30"}`}
                onClick={() => {
                  setSelectedId(item.id);
                  setBatchMode(false);
                  setRecapStudent("");
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-bold leading-5">
                      {item.name}
                    </p>
                    <span
                      className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[9px] font-bold ${selectedId === item.id ? "bg-white/20 text-white" : "bg-emerald-100 text-primary"}`}
                    >
                      {item.level}
                    </span>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-bold ${selectedId === item.id ? "bg-white text-primary" : "bg-surface-container-low"}`}
                  >
                    {item.student_count} siswa
                  </span>
                </div>
              </button>
            ))}
          </div>
        </aside>
        <main className="min-w-0 space-y-4">
          {!selected ? (
            <div className="rounded-[8px] border bg-white p-10 text-center text-sm">
              Pilih rombel untuk melihat detail.
            </div>
          ) : (
            <>
              <section className="rounded-[8px] border border-emerald-100 bg-white p-4 shadow-soft sm:p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold text-primary">
                      Rombongan Belajar
                    </p>
                    <h2 className="mt-1 text-2xl font-bold">{selected.name}</h2>
                    <p className="mt-2 text-xs text-on-surface-variant">
                      {selected.level} ·{" "}
                      {selected.default_room_name || "Ruang fleksibel"} ·{" "}
                      {selected.student_count} siswa aktif
                    </p>
                  </div>
                  {user?.permissions.manage_academics && (
                    <div className="flex w-full gap-2 sm:w-auto">
                      <button
                        className="secondary-button min-w-0 flex-1 rounded-[8px] px-3 text-xs sm:flex-none"
                        onClick={() => setFeeOpen((value) => !value)}
                      >
                        <Icon name="payments" />
                        Kelola Kategori
                      </button>
                      <button
                        className="icon-button border"
                        onClick={() => setClassDraft(selected)}
                        title="Edit rombel"
                      >
                        <Icon name="edit" />
                      </button>
                    </div>
                  )}
                </div>
                <div className="mt-5 border-t border-emerald-100 pt-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase text-on-surface-variant">
                      Kategori Iuran
                    </h3>
                    <span className="text-[10px] text-on-surface-variant">
                      Tarif per siswa
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {selected.fee_plans.map((plan) => (
                      <div
                        key={plan.id}
                        className="rounded-[8px] border border-emerald-100 bg-emerald-50/50 p-3"
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-bold text-primary">
                            {plan.name}
                          </p>
                          <span className="rounded-full bg-white px-2 py-1 text-[9px] font-bold">
                            {plan.assigned_students} siswa
                          </span>
                        </div>
                        {plan.monthly_amount_rupiah !== undefined && (
                          <p className="mt-2 text-sm font-bold">
                            {rupiah.format(plan.monthly_amount_rupiah)}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                {feeOpen && (
                  <div className="session-editor-drawer mt-4 border-t border-emerald-100 pt-4">
                    <div className="space-y-2">
                      {feeDrafts.map((plan, index) => (
                        <div
                          key={plan.tempId}
                          className="grid gap-2 rounded-[8px] border bg-[#fbfefc] p-3 sm:grid-cols-[1fr_180px_40px]"
                        >
                          <input
                            className="h-10 rounded-[7px] border px-3 text-xs font-semibold"
                            value={plan.name || ""}
                            onChange={(event) =>
                              setFeeDrafts((items) =>
                                items.map((item, itemIndex) =>
                                  itemIndex === index
                                    ? { ...item, name: event.target.value }
                                    : item,
                                ),
                              )
                            }
                          />
                          <input
                            className="h-10 rounded-[7px] border px-3 text-xs"
                            type="number"
                            min="1"
                            value={plan.monthly_amount_rupiah || ""}
                            onChange={(event) =>
                              setFeeDrafts((items) =>
                                items.map((item, itemIndex) =>
                                  itemIndex === index
                                    ? {
                                        ...item,
                                        monthly_amount_rupiah: Number(
                                          event.target.value,
                                        ),
                                      }
                                    : item,
                                ),
                              )
                            }
                          />
                          <button
                            className="icon-button h-10 w-10 rounded-[7px] border border-red-100 text-red-600"
                            type="button"
                            title={
                              plan.id
                                ? "Arsipkan kategori"
                                : "Hapus draft kategori"
                            }
                            disabled={feeDrafts.length <= 1}
                            onClick={() => {
                              if (!plan.id) {
                                setFeeDrafts((items) =>
                                  items.filter(
                                    (item) => item.tempId !== plan.tempId,
                                  ),
                                );
                                return;
                              }
                              const stored = selected.fee_plans.find(
                                (item) => item.id === plan.id,
                              );
                              if (!stored) return;
                              setFeeRemoval(stored);
                              setReplacementPlan(
                                selected.fee_plans.find(
                                  (item) => item.id !== stored.id,
                                )?.id || "",
                              );
                            }}
                          >
                            <Icon name="delete" className="text-base" />
                          </button>
                        </div>
                      ))}
                    </div>
                    {feeRemoval && (
                      <div className="session-editor-drawer mt-3 rounded-[8px] border border-amber-200 bg-amber-50 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-bold text-amber-950">
                              Arsipkan {feeRemoval.name}?
                            </p>
                            <p className="mt-1 text-[10px] leading-5 text-amber-900">
                              {feeRemoval.assigned_students
                                ? `${feeRemoval.assigned_students} siswa aktif harus dipindahkan ke kategori pengganti.`
                                : "Kategori ini tidak sedang dipakai siswa aktif."}
                            </p>
                          </div>
                          <button
                            className="icon-button h-8 w-8"
                            onClick={() => setFeeRemoval(null)}
                          >
                            <Icon name="close" className="text-base" />
                          </button>
                        </div>
                        {feeRemoval.assigned_students > 0 && (
                          <label className="mt-3 block text-[10px] font-bold text-amber-950">
                            Kategori Pengganti
                            <select
                              className="mt-2 h-10 w-full rounded-[7px] border border-amber-200 bg-white px-3 text-xs font-normal"
                              value={replacementPlan}
                              onChange={(event) =>
                                setReplacementPlan(event.target.value)
                              }
                            >
                              {selected.fee_plans
                                .filter((item) => item.id !== feeRemoval.id)
                                .map((item) => (
                                  <option key={item.id} value={item.id}>
                                    {item.name} ·{" "}
                                    {rupiah.format(
                                      item.monthly_amount_rupiah || 0,
                                    )}
                                  </option>
                                ))}
                            </select>
                          </label>
                        )}
                        <div className="mt-3 flex justify-end">
                          <button
                            className="inline-flex h-9 items-center gap-2 rounded-[7px] bg-red-600 px-4 text-[10px] font-bold text-white"
                            disabled={
                              archiveFeeMutation.isPending ||
                              (feeRemoval.assigned_students > 0 &&
                                !replacementPlan)
                            }
                            onClick={() => archiveFeeMutation.mutate()}
                          >
                            <Icon name="delete" className="text-base" />
                            Pindahkan & Arsipkan
                          </button>
                        </div>
                      </div>
                    )}
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:justify-between">
                      <button
                        className="secondary-button h-10 rounded-[8px] px-3 text-xs"
                        onClick={() =>
                          setFeeDrafts((items) => [
                            ...items,
                            {
                              tempId: crypto.randomUUID(),
                              name: "Kategori Baru",
                              monthly_amount_rupiah: 150000,
                              effective_from: `${month}-01`,
                              is_active: true,
                            },
                          ])
                        }
                      >
                        <Icon name="add" className="text-base" />
                        Tambah Kategori
                      </button>
                      <button
                        className="primary-button h-10 rounded-[8px] text-xs"
                        disabled={feeMutation.isPending}
                        onClick={() => feeMutation.mutate()}
                      >
                        <Icon name="save" className="text-base" />
                        Simpan Kategori
                      </button>
                    </div>
                  </div>
                )}
              </section>

              <section className="rounded-[8px] border border-emerald-100 bg-white p-4 shadow-soft sm:p-5">
                <h3 className="flex items-center gap-2 text-sm font-bold">
                  <Icon name="calendar_today" className="text-primary" />
                  Jadwal Ter-assign
                </h3>
                {patterns.length === 0 ? (
                  <p className="mt-4 rounded-[8px] border border-dashed p-5 text-center text-xs text-on-surface-variant">
                    Rombel belum memiliki pola jadwal aktif.
                  </p>
                ) : (
                  <div className="mt-4 grid gap-2 xl:grid-cols-2">
                    {patterns.map((item) => (
                      <div
                        key={`${item.subject}-${item.start_at}-${item.teacher}`}
                        className="grid gap-1 rounded-[8px] border border-emerald-100 bg-[#fbfefc] px-3 py-2.5 text-xs sm:grid-cols-[minmax(100px,1fr)_minmax(130px,1fr)_minmax(100px,1fr)] sm:items-center sm:gap-3"
                      >
                        <span className="font-bold text-primary">
                          {item.subject_name}
                        </span>
                        <span>
                          {day.format(new Date(item.start_at))},{" "}
                          {clock.format(new Date(item.start_at))}-
                          {clock.format(new Date(item.end_at))}
                        </span>
                        <span className="break-words text-on-surface-variant sm:truncate">
                          {item.teacher_name}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="overflow-hidden rounded-[8px] border border-emerald-100 bg-white shadow-soft">
                <div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-sm font-bold">Anggota Rombel</h3>
                    <p className="mt-1 text-[10px] text-on-surface-variant">
                      Nama, asal sekolah, kategori iuran, dan rekap bulanan
                    </p>
                  </div>
                  <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap">
                    <div className="flex h-11 w-full items-center gap-2 rounded-[8px] border px-3 sm:h-10 sm:w-auto">
                      <Icon name="search" className="text-base" />
                      <input
                        className="min-w-0 flex-1 bg-transparent text-xs outline-none sm:w-40 sm:flex-none"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Cari siswa..."
                      />
                    </div>
                    {user?.permissions.manage_academics && (
                      <button
                        className={`secondary-button h-11 w-full rounded-[8px] text-xs sm:h-10 sm:w-auto ${batchMode ? "bg-amber-100 text-amber-900" : ""}`}
                        onClick={() => setBatchMode((value) => !value)}
                      >
                        <Icon name="edit" className="text-base" />
                        {batchMode ? "Batal Batch" : "Kelola Batch"}
                      </button>
                    )}
                  </div>
                </div>
                <div className="student-list-responsive overflow-x-auto">
                  <table className="w-full min-w-[760px] border-collapse text-left">
                    <thead className="bg-surface-container-low text-[10px] uppercase text-on-surface-variant">
                      <tr>
                        <th className="px-5 py-3">Siswa</th>
                        <th className="px-5 py-3">Asal Sekolah</th>
                        <th className="px-5 py-3">Kategori Iuran</th>
                        <th className="px-5 py-3 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {rows.map((raw) => {
                        const item = raw as BatchRow & Enrollment;
                        const studentId = batchMode
                          ? item.student_id
                          : item.student;
                        const name = batchMode
                          ? item.full_name
                          : item.student_name;
                        const school = batchMode
                          ? item.school
                          : item.student_school;
                        const planId = batchMode
                          ? item.fee_plan_id
                          : item.fee_plan;
                        const archived = batchMode && item.action === "archive";
                        const isExpanded = !batchMode && recapStudent === studentId;
                        return (
                          <Fragment key={item.key || item.id}>
                            <tr
                              className={`student-list-row ${
                                archived
                                  ? "bg-red-50 opacity-60"
                                  : isExpanded
                                    ? "bg-emerald-50/70 border-b-0"
                                    : "hover:bg-emerald-50/40"
                              }`}
                            >
                            <td className="px-5 py-3" data-label="Siswa">
                              {batchMode ? (
                                <input
                                  className="h-9 w-full rounded-[7px] border px-3 text-xs font-semibold"
                                  value={name}
                                  disabled={archived}
                                  onChange={(event) =>
                                    setBatchRows((items) =>
                                      items.map((row) =>
                                        row.key === item.key
                                          ? {
                                              ...row,
                                              full_name: event.target.value,
                                            }
                                          : row,
                                      ),
                                    )
                                  }
                                />
                              ) : (
                                <div className="min-w-0">
                                  <p className="break-words text-xs font-bold">
                                    {name}
                                  </p>
                                  <p className="text-[9px] text-on-surface-variant">
                                    {item.student_code}
                                  </p>
                                </div>
                              )}
                            </td>
                            <td className="px-5 py-3" data-label="Asal Sekolah">
                              {batchMode ? (
                                <input
                                  list="school-options"
                                  className="h-9 w-full rounded-[7px] border px-3 text-xs"
                                  value={school}
                                  disabled={archived}
                                  onChange={(event) =>
                                    setBatchRows((items) =>
                                      items.map((row) =>
                                        row.key === item.key
                                          ? {
                                              ...row,
                                              school: event.target.value,
                                            }
                                          : row,
                                      ),
                                    )
                                  }
                                />
                              ) : (
                                <span className="text-xs text-on-surface-variant">
                                  {school}
                                </span>
                              )}
                            </td>
                            <td
                              className="px-5 py-3"
                              data-label="Kategori Iuran"
                            >
                              {batchMode ? (
                                <select
                                  className="h-9 w-full rounded-[7px] border bg-white px-2 text-xs"
                                  value={planId}
                                  disabled={archived}
                                  onChange={(event) =>
                                    setBatchRows((items) =>
                                      items.map((row) =>
                                        row.key === item.key
                                          ? {
                                              ...row,
                                              fee_plan_id: event.target.value,
                                            }
                                          : row,
                                      ),
                                    )
                                  }
                                >
                                  {selected.fee_plans.map((plan) => (
                                    <option key={plan.id} value={plan.id}>
                                      {plan.name} -{" "}
                                      {plan.monthly_amount_rupiah
                                        ? rupiah.format(
                                            plan.monthly_amount_rupiah,
                                          )
                                        : ""}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold text-primary">
                                  {item.fee_plan_name}
                                </span>
                              )}
                            </td>
                            <td
                              className="student-list-actions px-5 py-3 text-right"
                              data-label="Aksi"
                            >
                              {batchMode ? (
                                <button
                                  className={`icon-button ml-auto h-8 w-8 ${archived ? "text-primary" : "text-red-600"}`}
                                  onClick={() =>
                                    setBatchRows((items) =>
                                      items.map((row) =>
                                        row.key === item.key
                                          ? {
                                              ...row,
                                              action:
                                                row.action === "archive"
                                                  ? "upsert"
                                                  : "archive",
                                            }
                                          : row,
                                      ),
                                    )
                                  }
                                >
                                  <Icon
                                    name={archived ? "restart_alt" : "delete"}
                                    className="text-base"
                                  />
                                </button>
                              ) : (
                                <button
                                  className={`icon-button ml-auto h-8 w-8 border border-emerald-200 transition ${isExpanded ? "bg-primary text-white shadow-sm" : "bg-emerald-50 text-primary hover:bg-emerald-100"}`}
                                  onClick={() =>
                                    setRecapStudent((value) =>
                                      value === studentId ? "" : studentId,
                                    )
                                  }
                                  title={isExpanded ? "Tutup Rekap" : "Rekap Bulanan"}
                                >
                                  <Icon
                                    name={isExpanded ? "expand_less" : "receipt_long"}
                                    className="text-base"
                                  />
                                </button>
                              )}
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr className="student-recap-row">
                              <td colSpan={4} className="p-0 border-b border-emerald-100">
                                <div className="session-editor-drawer border-l-4 border-l-primary bg-[#f8fcf9] p-4 sm:p-5 shadow-inner">
                                  {(() => {
                                    const detail = recap.data?.students.find(
                                      (s) => s.student.id === studentId,
                                    );
                                    if (!detail)
                                      return (
                                        <div className="flex items-center gap-2 py-2 text-xs text-on-surface-variant">
                                          <Icon
                                            name="progress_activity"
                                            className="animate-spin text-base text-primary"
                                          />
                                          Memuat rekap bulanan siswa...
                                        </div>
                                      );
                                    return (
                                      <div>
                                        <div className="flex items-center justify-between">
                                          <div>
                                            <p className="text-[10px] font-bold uppercase tracking-wider text-primary">
                                              Rekap Bulanan · {month}
                                            </p>
                                            <h4 className="mt-0.5 text-base font-bold text-on-surface">
                                              {detail.student.full_name}
                                            </h4>
                                            <p className="mt-0.5 text-xs text-on-surface-variant">
                                              {detail.student.school || "Sekolah"} ·{" "}
                                              <span className="font-semibold text-primary">
                                                {detail.payment?.fee_plan_name || "Reguler"}
                                              </span>
                                            </p>
                                          </div>
                                          <button
                                            className="icon-button h-8 w-8 rounded-full border border-emerald-200 bg-white text-on-surface hover:bg-emerald-50"
                                            onClick={() => setRecapStudent("")}
                                            title="Tutup Rekap"
                                          >
                                            <Icon name="close" className="text-base" />
                                          </button>
                                        </div>
                                        <div className="mt-4 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
                                          <div className="rounded-[8px] border border-emerald-100 bg-white p-3 shadow-xs">
                                            <p className="text-[10px] font-bold uppercase text-on-surface-variant">
                                              Status Pembayaran
                                            </p>
                                            <p className="mt-2 text-sm font-bold text-primary">
                                              {detail.payment?.status || "UNPAID"}
                                            </p>
                                            {user?.role === "ADMIN" && (
                                              <p className="mt-1 text-[10px] text-on-surface-variant">
                                                Sisa:{" "}
                                                <span className="font-semibold text-primary">
                                                  {rupiah.format(
                                                    detail.payment?.outstanding_rupiah ??
                                                      (detail.payment?.amount_due_rupiah ?? 0),
                                                )}
                                                </span>
                                              </p>
                                            )}
                                          </div>
                                          {[
                                            ["Hadir", detail.attendance?.present ?? 0],
                                            [
                                              "Izin + Sakit",
                                              (detail.attendance?.permit ?? 0) +
                                                (detail.attendance?.sick ?? 0),
                                            ],
                                            ["Alfa", detail.attendance?.absent ?? 0],
                                          ].map(([label, value]) => (
                                            <div
                                              key={label as string}
                                              className="rounded-[8px] border border-emerald-100 bg-white p-3 shadow-xs"
                                            >
                                              <p className="text-[10px] font-bold uppercase text-on-surface-variant">
                                                {label}
                                              </p>
                                              <p className="mt-2 text-xl font-bold">{value}</p>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    );
                                  })()}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
                {batchMode && (
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-surface-container-low p-4">
                    <button
                      className="secondary-button h-10 rounded-[8px] text-xs"
                      onClick={() =>
                        setBatchRows((items) => [
                          ...items,
                          {
                            key: crypto.randomUUID(),
                            full_name: "",
                            school: schools[0],
                            fee_plan_id: selected.fee_plans[0]?.id || "",
                            action: "upsert",
                          },
                        ])
                      }
                    >
                      <Icon name="add" className="text-base" />
                      Tambah Baris
                    </button>
                    <button
                      className="primary-button h-10 rounded-[8px] text-xs"
                      disabled={
                        rosterMutation.isPending ||
                        batchRows.some(
                          (item) =>
                            item.action === "upsert" &&
                            (!item.full_name.trim() ||
                              !item.school.trim() ||
                              !item.fee_plan_id),
                        )
                      }
                      onClick={() => rosterMutation.mutate()}
                    >
                      <Icon name="save" className="text-base" />
                      Simpan Batch
                    </button>
                  </div>
                )}
              </section>
            </>
          )}
        </main>
      </div>
      <datalist id="school-options">
        {schools.map((school) => (
          <option key={school}>{school}</option>
        ))}
      </datalist>
      {classDraft && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-0 sm:p-4">
          <form
            className="h-[100dvh] w-full max-w-lg overflow-y-auto border bg-white p-4 shadow-lift sm:h-auto sm:max-h-[90vh] sm:rounded-[8px] sm:p-6"
            onSubmit={(event) => {
              event.preventDefault();
              classMutation.mutate(classDraft);
            }}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">
                {classDraft.id ? "Edit Rombel" : "Tambah Rombel"}
              </h2>
              <button
                className="icon-button"
                type="button"
                onClick={() => setClassDraft(null)}
              >
                <Icon name="close" />
              </button>
            </div>
            <div className="mt-5 space-y-4">
              <label className="block text-xs font-bold">
                Nama Rombel
                <input
                  className="mt-2 h-11 w-full rounded-[8px] border px-3 font-normal"
                  value={classDraft.name || ""}
                  onChange={(event) =>
                    setClassDraft((item) => ({
                      ...item,
                      name: event.target.value,
                    }))
                  }
                  required
                />
              </label>
              <label className="block text-xs font-bold">
                Jenjang
                <select
                  className="mt-2 h-11 w-full rounded-[8px] border bg-white px-3 font-normal"
                  value={classDraft.level || ""}
                  onChange={(event) =>
                    setClassDraft((item) => ({
                      ...item,
                      level: event.target.value,
                    }))
                  }
                >
                  {["SD", "9 SMP", "10 SMA", "11 SMA", "12 SMA"].map(
                    (level) => (
                      <option key={level}>{level}</option>
                    ),
                  )}
                </select>
              </label>
              <label className="block text-xs font-bold">
                Ruang Default
                <select
                  className="mt-2 h-11 w-full rounded-[8px] border bg-white px-3 font-normal"
                  value={classDraft.default_room || ""}
                  onChange={(event) =>
                    setClassDraft((item) => ({
                      ...item,
                      default_room: event.target.value,
                    }))
                  }
                >
                  <option value="">Tanpa ruang default</option>
                  {rooms.data?.map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-6 flex justify-end">
              <button
                className="primary-button rounded-[8px]"
                disabled={classMutation.isPending}
              >
                <Icon name="save" />
                Simpan Rombel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
