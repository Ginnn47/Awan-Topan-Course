import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import { ApiError, apiEnvelope, apiListAll } from "../api/client";
import { queryKeys } from "../api/queryKeys";
import type { ClassGroup, Teacher } from "../api/types";
import DatabaseTabs from "../components/DatabaseTabs";
import { Icon, PageHeader } from "../components/ui";

interface TeacherDraft {
  id?: string;
  is_admin: boolean;
  teacher_code: string;
  full_name: string;
  email: string;
  phone: string;
  specialization: string;
  password: string;
  is_active: boolean;
  class_group_ids: string[];
}

const emptyDraft: TeacherDraft = {
  is_admin: false,
  teacher_code: "",
  full_name: "",
  email: "",
  phone: "",
  specialization: "",
  password: "",
  is_active: true,
  class_group_ids: [],
};

function toDraft(teacher: Teacher): TeacherDraft {
  return {
    id: teacher.id,
    is_admin: teacher.account_role === "ADMIN",
    teacher_code: teacher.teacher_code,
    full_name: teacher.full_name,
    email: teacher.email,
    phone: teacher.phone,
    specialization: teacher.specialization,
    password: "",
    is_active: teacher.is_active,
    class_group_ids: teacher.assigned_classes.map((item) => item.id),
  };
}

export default function TeachersApi() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<TeacherDraft | null>(null);
  const [notice, setNotice] = useState("");
  const teachers = useQuery({
    queryKey: queryKeys.teachers,
    queryFn: ({ signal }) => apiListAll<Teacher>("/api/v1/teachers/", signal),
  });
  const classes = useQuery({
    queryKey: queryKeys.classes,
    queryFn: ({ signal }) =>
      apiListAll<ClassGroup>("/api/v1/class-groups/?is_active=true", signal),
  });
  const saveMutation = useMutation({
    mutationFn: (value: TeacherDraft) => {
      const body = {
        teacher_code: value.teacher_code,
        full_name: value.full_name,
        email: value.email,
        phone: value.phone,
        specialization: value.specialization,
        is_active: value.is_active,
        class_group_ids: value.class_group_ids,
        ...(value.password ? { password: value.password } : {}),
      };
      return apiEnvelope<Teacher>(
        value.id ? `/api/v1/teachers/${value.id}/` : "/api/v1/teachers/",
        { method: value.id ? "PATCH" : "POST", body },
      );
    },
    onSuccess: () => {
      setDraft(null);
      setNotice("Akun dan akses rombel pengajar berhasil disimpan.");
      void queryClient.invalidateQueries({ queryKey: queryKeys.teachers });
      void queryClient.invalidateQueries({ queryKey: queryKeys.classes });
    },
  });
  const visible = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return teachers.data || [];
    return (teachers.data || []).filter((teacher) =>
      [
        teacher.full_name,
        teacher.email,
        teacher.teacher_code,
        teacher.specialization,
        ...teacher.assigned_classes.map((item) => item.name),
      ].some((value) => value.toLowerCase().includes(keyword)),
    );
  }, [query, teachers.data]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    saveMutation.mutate(draft);
  };

  return (
    <div className="space-y-5">
      <DatabaseTabs />
      <PageHeader
        title="Database Teacher"
        description="Kelola akun pengajar, bidang ajar, status akses, dan rombel yang menjadi tanggung jawabnya."
        action={
          <button
            className="primary-button rounded-[8px]"
            onClick={() => setDraft({ ...emptyDraft })}
          >
            <Icon name="add" /> Tambah Pengajar
          </button>
        }
      />
      {notice && (
        <div className="rounded-[8px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-primary">
          {notice}
        </div>
      )}
      {saveMutation.error && (
        <div className="rounded-[8px] border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700">
          {saveMutation.error instanceof ApiError
            ? saveMutation.error.detail.message
            : "Data pengajar gagal disimpan."}
        </div>
      )}
      <section className="overflow-hidden rounded-[8px] border border-emerald-100 bg-white shadow-soft">
        <div className="flex flex-col gap-3 border-b border-emerald-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <h2 className="text-sm font-bold">Daftar Pengajar</h2>
            <p className="mt-1 text-[10px] text-on-surface-variant">
              {teachers.data?.filter((item) => item.is_active).length || 0} akun
              aktif
            </p>
          </div>
          <label className="flex h-11 w-full items-center gap-2 rounded-[8px] border px-3 sm:h-10 sm:max-w-xs">
            <Icon name="search" className="text-base" />
            <input
              className="min-w-0 flex-1 bg-transparent text-xs outline-none"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cari guru, email, atau rombel..."
            />
          </label>
        </div>
        <div className="divide-y divide-emerald-100">
          {visible.map((teacher) => {
            const editing = draft?.id === teacher.id;
            const initials = teacher.full_name
              .split(" ")
              .filter(Boolean)
              .slice(0, 2)
              .map((part) => part[0])
              .join("")
              .toUpperCase();
            return (
              <div key={teacher.id}>
                <article className="grid gap-3 p-4 sm:grid-cols-[48px_minmax(180px,1fr)_minmax(180px,1.2fr)_auto] sm:items-center sm:p-5">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-primary">
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="break-words text-sm font-bold">
                        {teacher.full_name}
                      </h3>
                      {teacher.account_role === "ADMIN" && (
                        <span className="rounded-full bg-primary px-2 py-0.5 text-[9px] font-bold text-white">
                          Super Admin
                        </span>
                      )}
                      <span
                        className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${teacher.is_active ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}
                      >
                        {teacher.is_active ? "Aktif" : "Nonaktif"}
                      </span>
                    </div>
                    <p className="mt-1 break-all text-[10px] text-on-surface-variant">
                      {teacher.email} · {teacher.teacher_code}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-primary">
                      {teacher.specialization || "Belum ada bidang ajar"}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase text-on-surface-variant">
                      Rombel Diampu
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {teacher.assigned_classes.length ? (
                        teacher.assigned_classes.map((item) => (
                          <span
                            key={item.id}
                            className="rounded-full bg-teal-50 px-2.5 py-1 text-[10px] font-bold text-teal-800"
                          >
                            {item.name}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-on-surface-variant">
                          Belum ditugaskan
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    className={`secondary-button h-10 w-full rounded-[8px] px-3 text-xs sm:w-auto ${editing ? "bg-primary text-white" : ""}`}
                    onClick={() => setDraft(editing ? null : toDraft(teacher))}
                  >
                    <Icon
                      name={editing ? "close" : "edit"}
                      className="text-base"
                    />
                    {editing ? "Tutup" : "Kelola"}
                  </button>
                </article>
                {editing && draft && (
                  <TeacherEditor
                    draft={draft}
                    classes={classes.data || []}
                    pending={saveMutation.isPending}
                    onChange={setDraft}
                    onCancel={() => setDraft(null)}
                    onSubmit={submit}
                  />
                )}
              </div>
            );
          })}
          {!teachers.isLoading && visible.length === 0 && (
            <p className="p-10 text-center text-sm text-on-surface-variant">
              Pengajar tidak ditemukan.
            </p>
          )}
        </div>
      </section>
      {draft && !draft.id && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/30 p-0 sm:p-4">
          <div className="h-[100dvh] w-full max-w-3xl overflow-y-auto bg-white p-4 shadow-lift sm:h-auto sm:max-h-[92vh] sm:rounded-[8px] sm:p-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-primary">Akun Baru</p>
                <h2 className="mt-1 text-xl font-bold">Tambah Pengajar</h2>
              </div>
              <button className="icon-button" onClick={() => setDraft(null)}>
                <Icon name="close" />
              </button>
            </div>
            <TeacherEditor
              draft={draft}
              classes={classes.data || []}
              pending={saveMutation.isPending}
              onChange={setDraft}
              onCancel={() => setDraft(null)}
              onSubmit={submit}
              modal
            />
          </div>
        </div>
      )}
    </div>
  );
}

function TeacherEditor({
  draft,
  classes,
  pending,
  onChange,
  onCancel,
  onSubmit,
  modal = false,
}: {
  draft: TeacherDraft;
  classes: ClassGroup[];
  pending: boolean;
  onChange: (draft: TeacherDraft) => void;
  onCancel: () => void;
  onSubmit: (event: FormEvent) => void;
  modal?: boolean;
}) {
  const field = <K extends keyof TeacherDraft>(
    key: K,
    value: TeacherDraft[K],
  ) => onChange({ ...draft, [key]: value });
  return (
    <form
      className={
        modal
          ? ""
          : "session-editor-drawer border-t border-emerald-100 bg-[#f7fcf8] p-4 sm:p-5"
      }
      onSubmit={onSubmit}
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[
          ["Nama lengkap", "full_name", "text"],
          ["Email login", "email", "email"],
          ["Kode pengajar", "teacher_code", "text"],
          ["Nomor telepon", "phone", "tel"],
          ["Bidang ajar", "specialization", "text"],
          [
            draft.id ? "Password baru (opsional)" : "Password awal",
            "password",
            "password",
          ],
        ].map(([label, key, type]) => (
          <label key={key} className="text-xs font-bold">
            {label}
            <input
              className="mt-2 h-11 w-full rounded-[8px] border bg-white px-3 font-normal outline-none focus:border-primary"
              type={type}
              value={String(draft[key as keyof TeacherDraft])}
              onChange={(event) =>
                field(key as keyof TeacherDraft, event.target.value as never)
              }
              required={!draft.id || key !== "password"}
            />
          </label>
        ))}
      </div>
      <section className="mt-5 rounded-[8px] border border-emerald-100 bg-white p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-bold">Akses Rombel</h3>
            <p className="mt-1 text-[10px] text-on-surface-variant">
              Membatasi database siswa dan pencatatan pembayaran yang boleh
              diakses.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-xs font-bold">
            <input
              type="checkbox"
              checked={draft.is_active}
              disabled={draft.is_admin}
              onChange={(event) => field("is_active", event.target.checked)}
            />
            {draft.is_admin ? "Super Admin selalu aktif" : "Akun aktif"}
          </label>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map((classGroup) => {
            const checked = draft.class_group_ids.includes(classGroup.id);
            return (
              <label
                key={classGroup.id}
                className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-[8px] border px-3 py-2 text-xs transition ${checked ? "border-primary bg-emerald-50 text-primary" : "border-outline-variant/50"}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) =>
                    field(
                      "class_group_ids",
                      event.target.checked
                        ? [...draft.class_group_ids, classGroup.id]
                        : draft.class_group_ids.filter(
                            (id) => id !== classGroup.id,
                          ),
                    )
                  }
                />
                <span className="min-w-0">
                  <strong className="block break-words">
                    {classGroup.name}
                  </strong>
                  <span className="text-[9px] text-on-surface-variant">
                    {classGroup.level} · {classGroup.student_count} siswa
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </section>
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          className="secondary-button rounded-[8px]"
          type="button"
          onClick={onCancel}
        >
          Batal
        </button>
        <button className="primary-button rounded-[8px]" disabled={pending}>
          <Icon name="save" /> {pending ? "Menyimpan..." : "Simpan Akses"}
        </button>
      </div>
    </form>
  );
}
