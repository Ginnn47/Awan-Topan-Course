import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useMemo, useState, type ReactNode } from "react";
import {
  ApiError,
  apiEnvelope,
  apiListAll,
  idempotencyKey,
  queryString,
} from "../api/client";
import { queryKeys } from "../api/queryKeys";
import type {
  BillingPeriod,
  ClassGroup,
  Invoice,
  PaymentTransaction,
} from "../api/types";
import { Badge, Icon, PageHeader } from "../components/ui";
import useOperationalDate from "../hooks/useOperationalDate.js";

type ViewMode = "overview" | "list";
type ListTab = "invoices" | "transactions";
type ReviewAction = "reject" | "void";

interface PaymentDraft {
  invoiceId: string;
  amount: string;
  paidOn: string;
  method: string;
  reference: string;
  note: string;
  proof: File | null;
}

interface RepriceDraft {
  invoiceId: string;
  feePlanId: string;
  amount: string;
  reason: string;
}

interface ReviewDraft {
  transaction: PaymentTransaction;
  action: ReviewAction;
  reason: string;
}

const rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});
const longDate = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const invoiceLabels: Record<Invoice["status"], string> = {
  UNPAID: "Belum Bayar",
  PARTIAL: "Sebagian",
  PAID: "Lunas",
  OVERDUE: "Jatuh Tempo",
};
const transactionLabels: Record<PaymentTransaction["status"], string> = {
  PENDING: "Menunggu Verifikasi",
  VERIFIED: "Terverifikasi",
  REJECTED: "Ditolak",
  VOID: "Void",
};

function formatMonth(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    month: "long",
    year: "numeric",
  }).format(new Date(`${value.slice(0, 7)}-01T12:00:00`));
}

function defaultDueDate(month: string) {
  return `${month}-10`;
}

function statusClass(status: Invoice["status"] | PaymentTransaction["status"]) {
  if (status === "PAID" || status === "VERIFIED") return "success";
  if (status === "PARTIAL" || status === "PENDING") return "warning";
  if (status === "OVERDUE" || status === "REJECTED") return "danger";
  return "neutral";
}

export default function FinanceApi() {
  const operational = useOperationalDate();
  const queryClient = useQueryClient();
  const activeMonth = operational.date.slice(0, 7);
  const [mode, setMode] = useState<ViewMode>("overview");
  const [tab, setTab] = useState<ListTab>("invoices");
  const [selectedInvoice, setSelectedInvoice] = useState("");
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [periodModal, setPeriodModal] = useState(false);
  const [periodMonth, setPeriodMonth] = useState(activeMonth);
  const [dueDate, setDueDate] = useState(defaultDueDate(activeMonth));
  const [paymentDraft, setPaymentDraft] = useState<PaymentDraft | null>(null);
  const [repriceDraft, setRepriceDraft] = useState<RepriceDraft | null>(null);
  const [reviewDraft, setReviewDraft] = useState<ReviewDraft | null>(null);
  const [notice, setNotice] = useState("");

  const periods = useQuery({
    queryKey: queryKeys.periods,
    queryFn: ({ signal }) =>
      apiListAll<BillingPeriod>("/api/v1/billing-periods/", signal),
  });
  const classes = useQuery({
    queryKey: queryKeys.classes,
    queryFn: ({ signal }) =>
      apiListAll<ClassGroup>("/api/v1/class-groups/?is_active=true", signal),
  });
  const activePeriod =
    periods.data?.find((item) => item.month.slice(0, 7) === activeMonth) ||
    null;
  const invoices = useQuery({
    queryKey: queryKeys.invoices(activePeriod?.id || activeMonth),
    queryFn: ({ signal }) =>
      apiListAll<Invoice>(
        `/api/v1/invoices/${queryString({
          period: activePeriod?.id,
          reporting_date: operational.date,
        })}`,
        signal,
      ),
    enabled: Boolean(activePeriod),
  });
  const transactions = useQuery({
    queryKey: queryKeys.transactions(activePeriod?.id || activeMonth),
    queryFn: ({ signal }) =>
      apiListAll<PaymentTransaction>(
        "/api/v1/payment-transactions/?ordering=-created_at",
        signal,
      ),
    enabled: Boolean(activePeriod),
  });

  const invoiceIds = useMemo(
    () => new Set((invoices.data || []).map((item) => item.id)),
    [invoices.data],
  );
  const periodTransactions = useMemo(
    () =>
      (transactions.data || []).filter((item) => invoiceIds.has(item.invoice)),
    [invoiceIds, transactions.data],
  );
  const invoiceById = useMemo(
    () => new Map((invoices.data || []).map((item) => [item.id, item])),
    [invoices.data],
  );

  const metrics = useMemo(() => {
    const rows = invoices.data || [];
    return {
      billed: rows.reduce((sum, item) => sum + item.amount_due_rupiah, 0),
      paid: rows.reduce((sum, item) => sum + item.verified_total_rupiah, 0),
      outstanding: rows.reduce((sum, item) => sum + item.outstanding_rupiah, 0),
      pending: periodTransactions
        .filter((item) => item.status === "PENDING")
        .reduce((sum, item) => sum + item.amount_rupiah, 0),
      pendingCount: periodTransactions.filter(
        (item) => item.status === "PENDING",
      ).length,
    };
  }, [invoices.data, periodTransactions]);

  const filteredInvoices = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (invoices.data || []).filter(
      (item) =>
        (!needle ||
          item.student_name_snapshot.toLowerCase().includes(needle) ||
          item.student_code_snapshot.toLowerCase().includes(needle)) &&
        (!classFilter || item.class_group_id_snapshot === classFilter) &&
        (!statusFilter || item.status === statusFilter),
    );
  }, [classFilter, invoices.data, search, statusFilter]);

  const filteredTransactions = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return periodTransactions.filter((item) => {
      const invoice = invoiceById.get(item.invoice);
      return (
        invoice &&
        (!needle ||
          invoice.student_name_snapshot.toLowerCase().includes(needle)) &&
        (!classFilter || invoice.class_group_id_snapshot === classFilter) &&
        (!statusFilter || item.status === statusFilter)
      );
    });
  }, [classFilter, invoiceById, periodTransactions, search, statusFilter]);

  const invalidateFinance = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.periods }),
      queryClient.invalidateQueries({ queryKey: ["billing"] }),
      queryClient.invalidateQueries({ queryKey: ["rombel"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      queryClient.invalidateQueries({ queryKey: ["notifications"] }),
    ]);
  };

  const createPeriod = useMutation({
    mutationFn: () =>
      apiEnvelope<BillingPeriod>("/api/v1/billing-periods/", {
        method: "POST",
        idempotencyKey: idempotencyKey(),
        body: { month: `${periodMonth}-01`, due_date: dueDate },
      }),
    onSuccess: async () => {
      setPeriodModal(false);
      setNotice(`Periode ${formatMonth(periodMonth)} berhasil dibuat.`);
      await invalidateFinance();
    },
  });

  const synchronize = useMutation({
    mutationFn: () =>
      apiEnvelope<{ created_count: number; updated_count: number }>(
        `/api/v1/billing-periods/${activePeriod?.id}/synchronize/`,
        { method: "POST", body: {} },
      ),
    onSuccess: async (response) => {
      const changes = [
        response.data.created_count
          ? `${response.data.created_count} tagihan baru`
          : "",
        response.data.updated_count
          ? `${response.data.updated_count} tagihan diperbarui`
          : "",
      ].filter(Boolean);
      setNotice(
        changes.length
          ? `${changes.join(" dan ")} berhasil disinkronkan.`
          : "Periode sudah sinkron dengan anggota Rombel aktif.",
      );
      await invalidateFinance();
    },
  });

  const recordPayment = useMutation({
    mutationFn: async (draft: PaymentDraft) => {
      const body = new FormData();
      body.set("invoice", draft.invoiceId);
      body.set("amount_rupiah", draft.amount);
      body.set("paid_on", draft.paidOn);
      body.set("method", draft.method);
      body.set("reference", draft.reference);
      body.set("note", draft.note);
      if (draft.proof) body.set("proof_file", draft.proof);
      return apiEnvelope<PaymentTransaction>("/api/v1/payment-transactions/", {
        method: "POST",
        idempotencyKey: idempotencyKey(),
        body,
      });
    },
    onSuccess: async () => {
      setPaymentDraft(null);
      setNotice("Pembayaran tercatat dan menunggu verifikasi.");
      await invalidateFinance();
    },
  });

  const verifyPayment = useMutation({
    mutationFn: (payment: PaymentTransaction) =>
      apiEnvelope<PaymentTransaction>(
        `/api/v1/payment-transactions/${payment.id}/verify/`,
        {
          method: "POST",
          idempotencyKey: idempotencyKey(),
          body: { expected_version: payment.version },
        },
      ),
    onSuccess: async () => {
      setNotice("Pembayaran berhasil diverifikasi.");
      await invalidateFinance();
    },
  });

  const reviewPayment = useMutation({
    mutationFn: (draft: ReviewDraft) =>
      apiEnvelope<PaymentTransaction>(
        `/api/v1/payment-transactions/${draft.transaction.id}/${draft.action}/`,
        {
          method: "POST",
          idempotencyKey: idempotencyKey(),
          body: {
            expected_version: draft.transaction.version,
            reason: draft.reason,
          },
        },
      ),
    onSuccess: async (_, draft) => {
      setReviewDraft(null);
      setNotice(
        draft.action === "reject"
          ? "Pembayaran ditolak dengan alasan tercatat."
          : "Pembayaran terverifikasi telah di-void.",
      );
      await invalidateFinance();
    },
  });

  const repriceInvoice = useMutation({
    mutationFn: (draft: RepriceDraft) =>
      apiEnvelope<Invoice>(`/api/v1/invoices/${draft.invoiceId}/reprice/`, {
        method: "POST",
        body: {
          amount_rupiah: Number(draft.amount),
          fee_plan: draft.feePlanId,
          reason: draft.reason,
        },
      }),
    onSuccess: async () => {
      setRepriceDraft(null);
      setNotice("Nominal dan kategori snapshot invoice berhasil diperbarui.");
      await invalidateFinance();
    },
  });

  const errors = [
    createPeriod.error,
    synchronize.error,
    recordPayment.error,
    verifyPayment.error,
    reviewPayment.error,
    repriceInvoice.error,
  ].filter(Boolean);
  const error = errors.at(-1);
  const overdue = (invoices.data || []).filter(
    (item) => item.status === "OVERDUE",
  );
  const pending = periodTransactions.filter(
    (item) => item.status === "PENDING",
  );
  const busy =
    createPeriod.isPending ||
    synchronize.isPending ||
    recordPayment.isPending ||
    verifyPayment.isPending ||
    reviewPayment.isPending ||
    repriceInvoice.isPending;

  const openPayment = (invoice: Invoice) =>
    setPaymentDraft({
      invoiceId: invoice.id,
      amount: String(
        Math.max(invoice.outstanding_rupiah - invoice.pending_total_rupiah, 0),
      ),
      paidOn: operational.date,
      method: "Tunai",
      reference: "",
      note: "",
      proof: null,
    });

  const openReprice = (invoice: Invoice) =>
    setRepriceDraft({
      invoiceId: invoice.id,
      feePlanId: invoice.fee_plan_id_snapshot,
      amount: String(invoice.amount_due_rupiah),
      reason: "",
    });

  const selected = invoiceById.get(selectedInvoice);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Finance"
        description={`Pantau tagihan, cicilan, dan verifikasi pembayaran periode ${formatMonth(activeMonth)}.`}
        action={
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
            <div className="col-span-2 flex h-11 w-full rounded-[8px] border border-emerald-100 bg-white p-1 shadow-sm sm:col-auto sm:w-auto">
              <button
                className={`flex flex-1 items-center justify-center gap-2 rounded-[6px] px-3 text-xs font-bold transition sm:flex-none ${mode === "overview" ? "bg-primary text-white" : "text-on-surface-variant"}`}
                onClick={() => setMode("overview")}
              >
                <Icon name="dashboard" className="text-base" />
                Overview
              </button>
              <button
                className={`flex flex-1 items-center justify-center gap-2 rounded-[6px] px-3 text-xs font-bold transition sm:flex-none ${mode === "list" ? "bg-primary text-white" : "text-on-surface-variant"}`}
                onClick={() => setMode("list")}
              >
                <Icon name="format_list_bulleted" className="text-base" />
                List
              </button>
            </div>
            <button
              className="secondary-button h-11 min-w-0 rounded-[8px] px-3 text-xs sm:px-4"
              onClick={() => {
                setPeriodMonth(activeMonth);
                setDueDate(defaultDueDate(activeMonth));
                setPeriodModal(true);
              }}
            >
              <Icon name="calendar_month" className="text-base" />
              Buat Periode
            </button>
            {activePeriod && (
              <button
                className="primary-button h-11 min-w-0 rounded-[8px] px-3 text-xs sm:px-4"
                onClick={() => {
                  const first = (invoices.data || []).find(
                    (item) =>
                      item.outstanding_rupiah - item.pending_total_rupiah > 0,
                  );
                  if (first) openPayment(first);
                }}
                disabled={
                  !invoices.data?.some(
                    (item) =>
                      item.outstanding_rupiah - item.pending_total_rupiah > 0,
                  )
                }
              >
                <Icon name="add_card" className="text-base" />
                Catat Pembayaran
              </button>
            )}
          </div>
        }
      />

      {operational.isOverridden && (
        <div className="rounded-[8px] border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          <strong>Mode Simulasi:</strong> status jatuh tempo dan periode Finance
          dihitung pada{" "}
          {longDate.format(new Date(`${operational.date}T12:00:00`))}.
        </div>
      )}
      {notice && (
        <div className="rounded-[8px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-primary">
          {notice}
        </div>
      )}
      {error && (
        <div className="rounded-[8px] border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700">
          {error instanceof ApiError
            ? error.detail.message
            : "Aksi Finance gagal diproses."}
        </div>
      )}

      {periods.isLoading ? (
        <div className="rounded-[8px] border bg-white p-12 text-center text-sm text-on-surface-variant">
          Memuat periode tagihan...
        </div>
      ) : !activePeriod ? (
        <section className="rounded-[8px] border border-dashed border-emerald-300 bg-white px-6 py-16 text-center shadow-soft">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-primary">
            <Icon name="receipt_long" className="text-2xl" />
          </span>
          <h2 className="mt-5 text-xl font-bold">
            Periode {formatMonth(activeMonth)} belum dibuat
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-xs leading-5 text-on-surface-variant">
            Sistem tidak membuat invoice otomatis saat tanggal operasional
            berubah. Buat periode untuk mengambil snapshot anggota dan kategori
            iuran aktif dari Rombel.
          </p>
          <button
            className="primary-button mt-5 rounded-[8px]"
            onClick={() => {
              setPeriodMonth(activeMonth);
              setDueDate(defaultDueDate(activeMonth));
              setPeriodModal(true);
            }}
          >
            <Icon name="add" />
            Buat Periode Ini
          </button>
        </section>
      ) : (
        <>
          <section className="flex flex-col gap-3 rounded-[8px] border border-emerald-100 bg-white px-4 py-3 shadow-soft sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-white">
                {formatMonth(activePeriod.month)}
              </span>
              <span className="text-xs text-on-surface-variant">
                Jatuh tempo{" "}
                {longDate.format(new Date(`${activePeriod.due_date}T12:00:00`))}
              </span>
              <Badge
                tone={activePeriod.status === "OPEN" ? "success" : "neutral"}
              >
                {activePeriod.status === "OPEN" ? "Periode Aktif" : "Ditutup"}
              </Badge>
            </div>
            <button
              className="secondary-button w-full rounded-[8px] px-3 text-[11px] sm:h-9 sm:w-auto"
              disabled={synchronize.isPending || activePeriod.status !== "OPEN"}
              onClick={() => synchronize.mutate()}
            >
              <Icon name="sync" className="text-base" />
              Sinkronkan Rombel
            </button>
          </section>

          {mode === "overview" ? (
            <>
              <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  [
                    "receipt_long",
                    "Total Tagihan",
                    rupiah.format(metrics.billed),
                    `${invoices.data?.length || 0} invoice siswa`,
                    "from-emerald-700 to-emerald-500",
                    "text-white",
                  ],
                  [
                    "check_circle",
                    "Sudah Dibayar",
                    rupiah.format(metrics.paid),
                    "Transaksi terverifikasi",
                    "from-emerald-50 to-teal-50",
                    "text-primary",
                  ],
                  [
                    "warning",
                    "Sisa Tagihan",
                    rupiah.format(metrics.outstanding),
                    `${overdue.length} siswa jatuh tempo`,
                    "from-rose-50 to-orange-50",
                    "text-red-700",
                  ],
                  [
                    "pending_actions",
                    "Menunggu Verifikasi",
                    rupiah.format(metrics.pending),
                    `${metrics.pendingCount} transaksi perlu ditinjau`,
                    "from-cyan-50 to-emerald-50",
                    "text-[#00646f]",
                  ],
                ].map(([icon, label, value, note, gradient, tone]) => (
                  <article
                    key={label}
                    className={`min-h-[144px] rounded-[8px] border border-emerald-100 bg-gradient-to-br ${gradient} p-5 shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift ${tone}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-bold opacity-80">
                          {label}
                        </p>
                        <p className="mt-3 text-xl font-bold">{value}</p>
                        <p className="mt-3 text-[10px] opacity-75">{note}</p>
                      </div>
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/80 shadow-sm">
                        <Icon name={icon} />
                      </span>
                    </div>
                  </article>
                ))}
              </section>

              <section className="grid gap-4 xl:grid-cols-2">
                <OverviewPanel
                  title="Tagihan Belum Dibayar"
                  icon="warning"
                  action={() => {
                    setStatusFilter("OVERDUE");
                    setTab("invoices");
                    setMode("list");
                  }}
                >
                  {overdue.length ? (
                    overdue.slice(0, 6).map((invoice) => (
                      <button
                        key={invoice.id}
                        className="grid w-full gap-2 border-t border-emerald-100 px-4 py-3 text-left first:border-t-0 hover:bg-emerald-50/50 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-3"
                        onClick={() => {
                          setSelectedInvoice(invoice.id);
                          setMode("list");
                          setTab("invoices");
                        }}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-xs font-bold">
                            {invoice.student_name_snapshot}
                          </p>
                          <p className="mt-1 truncate text-[10px] text-on-surface-variant">
                            {invoice.class_group_name_snapshot} ·{" "}
                            {invoice.fee_plan_name_snapshot}
                          </p>
                        </div>
                        <div className="text-left sm:text-right">
                          <p className="text-xs font-bold text-red-700">
                            {rupiah.format(invoice.outstanding_rupiah)}
                          </p>
                          <p className="mt-1 text-[9px] text-on-surface-variant">
                            Jatuh tempo{" "}
                            {longDate.format(
                              new Date(`${invoice.due_date}T12:00:00`),
                            )}
                          </p>
                        </div>
                      </button>
                    ))
                  ) : (
                    <EmptyPanel text="Tidak ada tagihan jatuh tempo pada tanggal operasional ini." />
                  )}
                </OverviewPanel>
                <OverviewPanel
                  title="Menunggu Verifikasi"
                  icon="pending_actions"
                  action={() => {
                    setStatusFilter("PENDING");
                    setTab("transactions");
                    setMode("list");
                  }}
                >
                  {pending.length ? (
                    pending.slice(0, 6).map((payment) => {
                      const invoice = invoiceById.get(payment.invoice);
                      return (
                        <div
                          key={payment.id}
                          className="grid gap-3 border-t border-emerald-100 px-4 py-3 first:border-t-0 sm:grid-cols-[1fr_auto] sm:items-center"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-xs font-bold">
                              {invoice?.student_name_snapshot || "Siswa"}
                            </p>
                            <p className="mt-1 text-[10px] text-on-surface-variant">
                              {longDate.format(
                                new Date(`${payment.paid_on}T12:00:00`),
                              )}{" "}
                              · {payment.method} ·{" "}
                              {rupiah.format(payment.amount_rupiah)}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            <button
                              className="h-8 rounded-[7px] bg-primary px-3 text-[10px] font-bold text-white"
                              disabled={busy}
                              onClick={() => verifyPayment.mutate(payment)}
                            >
                              Verifikasi
                            </button>
                            <button
                              className="h-8 rounded-[7px] border border-red-200 px-3 text-[10px] font-bold text-red-700"
                              disabled={busy}
                              onClick={() =>
                                setReviewDraft({
                                  transaction: payment,
                                  action: "reject",
                                  reason: "",
                                })
                              }
                            >
                              Tolak
                            </button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <EmptyPanel text="Tidak ada transaksi yang menunggu verifikasi." />
                  )}
                </OverviewPanel>
              </section>
            </>
          ) : (
            <section className="overflow-hidden rounded-[8px] border border-emerald-100 bg-white shadow-soft">
              <div className="flex flex-col gap-3 border-b border-emerald-100 p-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex h-10 w-full rounded-[8px] bg-surface-container-low p-1 sm:w-fit">
                  <button
                    className={`flex-1 rounded-[6px] px-4 text-xs font-bold sm:flex-none ${tab === "invoices" ? "bg-white text-primary shadow-sm" : "text-on-surface-variant"}`}
                    onClick={() => {
                      setTab("invoices");
                      setStatusFilter("");
                    }}
                  >
                    Tagihan
                  </button>
                  <button
                    className={`flex-1 rounded-[6px] px-4 text-xs font-bold sm:flex-none ${tab === "transactions" ? "bg-white text-primary shadow-sm" : "text-on-surface-variant"}`}
                    onClick={() => {
                      setTab("transactions");
                      setStatusFilter("");
                    }}
                  >
                    Transaksi
                  </button>
                </div>
                <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
                  <label className="col-span-2 flex h-11 min-w-0 flex-1 items-center gap-2 rounded-[8px] border px-3 sm:h-10 sm:min-w-[210px]">
                    <Icon name="search" className="text-base" />
                    <input
                      className="min-w-0 flex-1 bg-transparent text-xs outline-none"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Cari siswa..."
                    />
                  </label>
                  <select
                    className="h-11 min-w-0 rounded-[8px] border bg-white px-2 text-xs sm:h-10 sm:px-3"
                    value={classFilter}
                    onChange={(event) => setClassFilter(event.target.value)}
                  >
                    <option value="">Semua Rombel</option>
                    {classes.data?.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                  <select
                    className="h-11 min-w-0 rounded-[8px] border bg-white px-2 text-xs sm:h-10 sm:px-3"
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value)}
                  >
                    <option value="">Semua Status</option>
                    {tab === "invoices"
                      ? Object.entries(invoiceLabels).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))
                      : Object.entries(transactionLabels).map(
                          ([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ),
                        )}
                  </select>
                </div>
              </div>

              {tab === "invoices" ? (
                <div className="mobile-data-scroll overflow-x-auto">
                  <table className="w-full min-w-[980px] border-collapse text-left">
                    <thead className="bg-surface-container-low text-[10px] uppercase text-on-surface-variant">
                      <tr>
                        <th className="px-4 py-3">Siswa</th>
                        <th className="px-4 py-3">Rombel & Kategori</th>
                        <th className="px-4 py-3 text-right">Tagihan</th>
                        <th className="px-4 py-3 text-right">Dibayar</th>
                        <th className="px-4 py-3 text-right">Sisa</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-emerald-100">
                      {filteredInvoices.map((invoice) => (
                        <Fragment key={invoice.id}>
                          <tr
                            className={
                              selectedInvoice === invoice.id
                                ? "bg-emerald-50/70"
                                : "hover:bg-emerald-50/35"
                            }
                          >
                            <td className="px-4 py-3">
                              <p className="text-xs font-bold">
                                {invoice.student_name_snapshot}
                              </p>
                              <p className="mt-1 text-[9px] text-on-surface-variant">
                                {invoice.student_code_snapshot}
                              </p>
                            </td>
                            <td className="px-4 py-3">
                              <p className="text-xs">
                                {invoice.class_group_name_snapshot}
                              </p>
                              <p className="mt-1 text-[9px] font-semibold text-primary">
                                {invoice.fee_plan_name_snapshot}
                              </p>
                            </td>
                            <td className="px-4 py-3 text-right text-xs font-bold">
                              {rupiah.format(invoice.amount_due_rupiah)}
                            </td>
                            <td className="px-4 py-3 text-right text-xs text-primary">
                              {rupiah.format(invoice.verified_total_rupiah)}
                            </td>
                            <td className="px-4 py-3 text-right text-xs font-bold">
                              {rupiah.format(invoice.outstanding_rupiah)}
                            </td>
                            <td className="px-4 py-3">
                              <Badge tone={statusClass(invoice.status)}>
                                {invoiceLabels[invoice.status]}
                              </Badge>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex justify-end gap-1">
                                <button
                                  className="icon-button h-8 w-8 border border-emerald-100"
                                  title="Lihat detail tagihan"
                                  onClick={() =>
                                    setSelectedInvoice((value) =>
                                      value === invoice.id ? "" : invoice.id,
                                    )
                                  }
                                >
                                  <Icon
                                    name={
                                      selectedInvoice === invoice.id
                                        ? "expand_more"
                                        : "receipt_long"
                                    }
                                    className="text-base"
                                  />
                                </button>
                                <button
                                  className="icon-button h-8 w-8 border border-emerald-100 text-primary"
                                  title="Catat pembayaran"
                                  disabled={
                                    invoice.outstanding_rupiah -
                                      invoice.pending_total_rupiah <=
                                    0
                                  }
                                  onClick={() => openPayment(invoice)}
                                >
                                  <Icon name="add_card" className="text-base" />
                                </button>
                              </div>
                            </td>
                          </tr>
                          {selectedInvoice === invoice.id && (
                            <tr>
                              <td colSpan={7} className="p-0">
                                <InvoiceDetail
                                  invoice={invoice}
                                  onClose={() => setSelectedInvoice("")}
                                  onPayment={() => openPayment(invoice)}
                                  onReprice={() => openReprice(invoice)}
                                  onVerify={(item) =>
                                    verifyPayment.mutate(item)
                                  }
                                  onReview={(item, action) =>
                                    setReviewDraft({
                                      transaction: item,
                                      action,
                                      reason: "",
                                    })
                                  }
                                  busy={busy}
                                />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                  {!filteredInvoices.length && (
                    <EmptyPanel text="Tidak ada tagihan yang sesuai filter." />
                  )}
                </div>
              ) : (
                <div className="mobile-data-scroll overflow-x-auto">
                  <table className="w-full min-w-[900px] border-collapse text-left">
                    <thead className="bg-surface-container-low text-[10px] uppercase text-on-surface-variant">
                      <tr>
                        <th className="px-4 py-3">Tanggal</th>
                        <th className="px-4 py-3">Siswa</th>
                        <th className="px-4 py-3">Metode</th>
                        <th className="px-4 py-3">Referensi</th>
                        <th className="px-4 py-3 text-right">Nominal</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-emerald-100">
                      {filteredTransactions.map((payment) => {
                        const invoice = invoiceById.get(payment.invoice);
                        return (
                          <tr
                            key={payment.id}
                            className="hover:bg-emerald-50/35"
                          >
                            <td className="px-4 py-3 text-xs">
                              {longDate.format(
                                new Date(`${payment.paid_on}T12:00:00`),
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <p className="text-xs font-bold">
                                {invoice?.student_name_snapshot}
                              </p>
                              <p className="mt-1 text-[9px] text-on-surface-variant">
                                {invoice?.class_group_name_snapshot}
                              </p>
                            </td>
                            <td className="px-4 py-3 text-xs">
                              {payment.method}
                            </td>
                            <td className="px-4 py-3 text-xs text-on-surface-variant">
                              {payment.reference || "-"}
                            </td>
                            <td className="px-4 py-3 text-right text-xs font-bold">
                              {rupiah.format(payment.amount_rupiah)}
                            </td>
                            <td className="px-4 py-3">
                              <Badge tone={statusClass(payment.status)}>
                                {transactionLabels[payment.status]}
                              </Badge>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex justify-end gap-1">
                                {payment.proof_url && (
                                  <a
                                    className="icon-button h-8 w-8 border border-emerald-100"
                                    href={payment.proof_url}
                                    title="Unduh bukti"
                                  >
                                    <Icon
                                      name="open_in_new"
                                      className="text-base"
                                    />
                                  </a>
                                )}
                                {payment.status === "PENDING" && (
                                  <>
                                    <button
                                      className="h-8 rounded-[7px] bg-primary px-3 text-[10px] font-bold text-white"
                                      disabled={busy}
                                      onClick={() =>
                                        verifyPayment.mutate(payment)
                                      }
                                    >
                                      Verifikasi
                                    </button>
                                    <button
                                      className="h-8 rounded-[7px] border border-red-200 px-3 text-[10px] font-bold text-red-700"
                                      disabled={busy}
                                      onClick={() =>
                                        setReviewDraft({
                                          transaction: payment,
                                          action: "reject",
                                          reason: "",
                                        })
                                      }
                                    >
                                      Tolak
                                    </button>
                                  </>
                                )}
                                {payment.status === "VERIFIED" && (
                                  <button
                                    className="h-8 rounded-[7px] border border-amber-300 px-3 text-[10px] font-bold text-amber-800"
                                    disabled={busy}
                                    onClick={() =>
                                      setReviewDraft({
                                        transaction: payment,
                                        action: "void",
                                        reason: "",
                                      })
                                    }
                                  >
                                    Void
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {!filteredTransactions.length && (
                    <EmptyPanel text="Tidak ada transaksi yang sesuai filter." />
                  )}
                </div>
              )}
            </section>
          )}
        </>
      )}

      {periodModal && (
        <Modal
          title="Buat Periode Tagihan"
          onClose={() => setPeriodModal(false)}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              createPeriod.mutate();
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-xs font-bold">
                Bulan
                <input
                  className="mt-2 h-11 w-full rounded-[8px] border px-3 font-normal"
                  type="month"
                  value={periodMonth}
                  onChange={(event) => {
                    setPeriodMonth(event.target.value);
                    setDueDate(defaultDueDate(event.target.value));
                  }}
                  required
                />
              </label>
              <label className="text-xs font-bold">
                Tanggal Jatuh Tempo
                <input
                  className="mt-2 h-11 w-full rounded-[8px] border px-3 font-normal"
                  type="date"
                  min={`${periodMonth}-01`}
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                  required
                />
              </label>
            </div>
            <p className="mt-4 rounded-[8px] bg-emerald-50 p-3 text-[11px] leading-5 text-on-surface-variant">
              Invoice dibuat satu kali untuk setiap siswa aktif menggunakan
              snapshot nama, rombel, kategori iuran, dan nominal saat ini.
            </p>
            <div className="mt-5 flex justify-end">
              <button
                className="primary-button rounded-[8px]"
                disabled={createPeriod.isPending}
              >
                <Icon name="add" />
                Generate Invoice
              </button>
            </div>
          </form>
        </Modal>
      )}

      {paymentDraft && (
        <Modal title="Catat Pembayaran" onClose={() => setPaymentDraft(null)}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              recordPayment.mutate(paymentDraft);
            }}
          >
            <div className="space-y-4">
              <label className="block text-xs font-bold">
                Invoice
                <select
                  className="mt-2 h-11 w-full rounded-[8px] border bg-white px-3 font-normal"
                  value={paymentDraft.invoiceId}
                  onChange={(event) => {
                    const invoice = invoiceById.get(event.target.value);
                    setPaymentDraft(
                      (draft) =>
                        draft && {
                          ...draft,
                          invoiceId: event.target.value,
                          amount: String(
                            Math.max(
                              (invoice?.outstanding_rupiah || 0) -
                                (invoice?.pending_total_rupiah || 0),
                              0,
                            ),
                          ),
                        },
                    );
                  }}
                >
                  {(invoices.data || [])
                    .filter(
                      (item) =>
                        item.outstanding_rupiah - item.pending_total_rupiah > 0,
                    )
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.student_name_snapshot} ·{" "}
                        {rupiah.format(
                          item.outstanding_rupiah - item.pending_total_rupiah,
                        )}
                      </option>
                    ))}
                </select>
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-xs font-bold">
                  Nominal
                  <input
                    className="mt-2 h-11 w-full rounded-[8px] border px-3 font-normal"
                    type="number"
                    min="1"
                    max={Math.max(
                      (invoiceById.get(paymentDraft.invoiceId)
                        ?.outstanding_rupiah || 0) -
                        (invoiceById.get(paymentDraft.invoiceId)
                          ?.pending_total_rupiah || 0),
                      1,
                    )}
                    value={paymentDraft.amount}
                    onChange={(event) =>
                      setPaymentDraft(
                        (draft) =>
                          draft && { ...draft, amount: event.target.value },
                      )
                    }
                    required
                  />
                </label>
                <label className="text-xs font-bold">
                  Tanggal Bayar
                  <input
                    className="mt-2 h-11 w-full rounded-[8px] border px-3 font-normal"
                    type="date"
                    value={paymentDraft.paidOn}
                    onChange={(event) =>
                      setPaymentDraft(
                        (draft) =>
                          draft && { ...draft, paidOn: event.target.value },
                      )
                    }
                    required
                  />
                </label>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-xs font-bold">
                  Metode
                  <select
                    className="mt-2 h-11 w-full rounded-[8px] border bg-white px-3 font-normal"
                    value={paymentDraft.method}
                    onChange={(event) =>
                      setPaymentDraft(
                        (draft) =>
                          draft && { ...draft, method: event.target.value },
                      )
                    }
                  >
                    {["Tunai", "Transfer Bank", "QRIS"].map((method) => (
                      <option key={method}>{method}</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-bold">
                  Referensi
                  <input
                    className="mt-2 h-11 w-full rounded-[8px] border px-3 font-normal"
                    maxLength={120}
                    value={paymentDraft.reference}
                    onChange={(event) =>
                      setPaymentDraft(
                        (draft) =>
                          draft && { ...draft, reference: event.target.value },
                      )
                    }
                    placeholder="Opsional"
                  />
                </label>
              </div>
              <label className="block text-xs font-bold">
                Catatan
                <textarea
                  className="mt-2 min-h-20 w-full resize-y rounded-[8px] border p-3 font-normal"
                  value={paymentDraft.note}
                  onChange={(event) =>
                    setPaymentDraft(
                      (draft) =>
                        draft && { ...draft, note: event.target.value },
                    )
                  }
                />
              </label>
              <label className="block text-xs font-bold">
                Bukti Pembayaran{" "}
                <span className="font-normal text-on-surface-variant">
                  (JPG, PNG, PDF · maks. 5 MB)
                </span>
                <input
                  className="mt-2 block w-full rounded-[8px] border p-2 text-xs font-normal"
                  type="file"
                  accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
                  onChange={(event) =>
                    setPaymentDraft(
                      (draft) =>
                        draft && {
                          ...draft,
                          proof: event.target.files?.[0] || null,
                        },
                    )
                  }
                />
              </label>
            </div>
            <div className="mt-5 flex justify-end">
              <button
                className="primary-button rounded-[8px]"
                disabled={recordPayment.isPending || !paymentDraft.amount}
              >
                <Icon name="save" />
                Simpan Pembayaran
              </button>
            </div>
          </form>
        </Modal>
      )}

      {repriceDraft && selected && (
        <Modal
          title="Ubah Kategori & Nominal Invoice"
          onClose={() => setRepriceDraft(null)}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              repriceInvoice.mutate(repriceDraft);
            }}
          >
            <p className="mb-4 rounded-[8px] bg-amber-50 p-3 text-[11px] leading-5 text-amber-900">
              Perubahan hanya berlaku pada invoice ini. Invoice lunas tidak
              dapat diubah dan nominal tidak boleh lebih kecil dari pembayaran
              aktif.
            </p>
            <div className="space-y-4">
              <label className="block text-xs font-bold">
                Kategori Iuran
                <select
                  className="mt-2 h-11 w-full rounded-[8px] border bg-white px-3 font-normal"
                  value={repriceDraft.feePlanId}
                  onChange={(event) => {
                    const plan = classes.data
                      ?.find(
                        (item) => item.id === selected.class_group_id_snapshot,
                      )
                      ?.fee_plans.find(
                        (item) => item.id === event.target.value,
                      );
                    setRepriceDraft(
                      (draft) =>
                        draft && {
                          ...draft,
                          feePlanId: event.target.value,
                          amount: plan?.monthly_amount_rupiah
                            ? String(plan.monthly_amount_rupiah)
                            : draft.amount,
                        },
                    );
                  }}
                >
                  {classes.data
                    ?.find(
                      (item) => item.id === selected.class_group_id_snapshot,
                    )
                    ?.fee_plans.map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.name} ·{" "}
                        {plan.monthly_amount_rupiah
                          ? rupiah.format(plan.monthly_amount_rupiah)
                          : ""}
                      </option>
                    ))}
                </select>
              </label>
              <label className="block text-xs font-bold">
                Nominal Baru
                <input
                  className="mt-2 h-11 w-full rounded-[8px] border px-3 font-normal"
                  type="number"
                  min={
                    selected.verified_total_rupiah +
                    selected.pending_total_rupiah
                  }
                  value={repriceDraft.amount}
                  onChange={(event) =>
                    setRepriceDraft(
                      (draft) =>
                        draft && { ...draft, amount: event.target.value },
                    )
                  }
                  required
                />
              </label>
              <label className="block text-xs font-bold">
                Alasan
                <textarea
                  className="mt-2 min-h-24 w-full rounded-[8px] border p-3 font-normal"
                  value={repriceDraft.reason}
                  onChange={(event) =>
                    setRepriceDraft(
                      (draft) =>
                        draft && { ...draft, reason: event.target.value },
                    )
                  }
                  required
                />
              </label>
            </div>
            <div className="mt-5 flex justify-end">
              <button
                className="primary-button rounded-[8px]"
                disabled={
                  repriceInvoice.isPending || !repriceDraft.reason.trim()
                }
              >
                <Icon name="save" />
                Simpan Perubahan
              </button>
            </div>
          </form>
        </Modal>
      )}

      {reviewDraft && (
        <Modal
          title={
            reviewDraft.action === "reject"
              ? "Tolak Pembayaran"
              : "Void Pembayaran"
          }
          onClose={() => setReviewDraft(null)}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              reviewPayment.mutate(reviewDraft);
            }}
          >
            <p className="text-xs leading-5 text-on-surface-variant">
              Tindakan ini tidak menghapus histori transaksi. Alasan akan
              disimpan pada audit trail.
            </p>
            <label className="mt-4 block text-xs font-bold">
              Alasan
              <textarea
                className="mt-2 min-h-24 w-full rounded-[8px] border p-3 font-normal"
                autoFocus
                value={reviewDraft.reason}
                onChange={(event) =>
                  setReviewDraft(
                    (draft) =>
                      draft && { ...draft, reason: event.target.value },
                  )
                }
                required
              />
            </label>
            <div className="mt-5 flex justify-end">
              <button
                className="inline-flex h-11 items-center gap-2 rounded-[8px] bg-red-600 px-5 text-xs font-bold text-white"
                disabled={reviewPayment.isPending || !reviewDraft.reason.trim()}
              >
                <Icon name="warning" className="text-base" />
                Konfirmasi
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function OverviewPanel({
  title,
  icon,
  action,
  children,
}: {
  title: string;
  icon: string;
  action: () => void;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[8px] border border-emerald-100 bg-white shadow-soft">
      <header className="flex items-center justify-between border-b border-emerald-100 px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <Icon name={icon} className="text-primary" />
          {title}
        </h2>
        <button className="text-[10px] font-bold text-primary" onClick={action}>
          Lihat Semua
        </button>
      </header>
      {children}
    </section>
  );
}

function EmptyPanel({ text }: { text: string }) {
  return (
    <div className="px-5 py-10 text-center text-xs text-on-surface-variant">
      {text}
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-black/35 p-0 sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="h-[100dvh] w-full max-w-xl overflow-y-auto border border-emerald-100 bg-white p-4 shadow-lift sm:h-auto sm:max-h-[90vh] sm:rounded-[8px] sm:p-6">
        <header className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-bold text-primary">{title}</h2>
          <button className="icon-button" onClick={onClose} type="button">
            <Icon name="close" />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

function InvoiceDetail({
  invoice,
  onClose,
  onPayment,
  onReprice,
  onVerify,
  onReview,
  busy,
}: {
  invoice: Invoice;
  onClose: () => void;
  onPayment: () => void;
  onReprice: () => void;
  onVerify: (payment: PaymentTransaction) => void;
  onReview: (payment: PaymentTransaction, action: ReviewAction) => void;
  busy: boolean;
}) {
  return (
    <div className="session-editor-drawer border-y border-emerald-200 bg-[#f5fbf7] p-3 sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase text-primary">
            Detail Tagihan
          </p>
          <h3 className="mt-1 text-lg font-bold">
            {invoice.student_name_snapshot}
          </h3>
          <p className="mt-1 text-xs text-on-surface-variant">
            {invoice.class_group_name_snapshot} ·{" "}
            {invoice.fee_plan_name_snapshot}
          </p>
        </div>
        <div className="grid grid-cols-[1fr_1fr_auto] gap-2 sm:flex sm:flex-wrap">
          <button
            className="secondary-button h-9 rounded-[8px] px-3 text-[10px]"
            onClick={onReprice}
            disabled={invoice.status === "PAID"}
          >
            <Icon name="edit" className="text-base" />
            Ubah Tagihan
          </button>
          <button
            className="primary-button h-9 rounded-[8px] px-3 text-[10px]"
            onClick={onPayment}
            disabled={
              invoice.outstanding_rupiah - invoice.pending_total_rupiah <= 0
            }
          >
            <Icon name="add_card" className="text-base" />
            Catat Pembayaran
          </button>
          <button className="icon-button h-9 w-9" onClick={onClose}>
            <Icon name="close" className="text-base" />
          </button>
        </div>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Tagihan", invoice.amount_due_rupiah],
          ["Terverifikasi", invoice.verified_total_rupiah],
          ["Pending", invoice.pending_total_rupiah],
          ["Sisa", invoice.outstanding_rupiah],
        ].map(([label, amount]) => (
          <div
            key={label}
            className="rounded-[8px] border border-emerald-100 bg-white p-3"
          >
            <p className="text-[9px] text-on-surface-variant">{label}</p>
            <p className="mt-1 text-sm font-bold">
              {rupiah.format(Number(amount))}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-4 overflow-hidden rounded-[8px] border border-emerald-100 bg-white">
        <div className="border-b px-4 py-3 text-xs font-bold">
          Histori Cicilan
        </div>
        {invoice.transactions.length ? (
          invoice.transactions.map((payment) => (
            <div
              key={payment.id}
              className="grid gap-3 border-t border-emerald-100 px-4 py-3 first:border-t-0 sm:grid-cols-[1fr_auto_auto] sm:items-center"
            >
              <div>
                <p className="text-xs font-bold">
                  {rupiah.format(payment.amount_rupiah)} · {payment.method}
                </p>
                <p className="mt-1 text-[9px] text-on-surface-variant">
                  {longDate.format(new Date(`${payment.paid_on}T12:00:00`))}{" "}
                  {payment.reference ? `· ${payment.reference}` : ""}
                </p>
              </div>
              <Badge tone={statusClass(payment.status)}>
                {transactionLabels[payment.status]}
              </Badge>
              <div className="flex gap-1">
                {payment.status === "PENDING" && (
                  <>
                    <button
                      className="h-8 rounded-[7px] bg-primary px-3 text-[10px] font-bold text-white"
                      disabled={busy}
                      onClick={() => onVerify(payment)}
                    >
                      Verifikasi
                    </button>
                    <button
                      className="h-8 rounded-[7px] border border-red-200 px-3 text-[10px] font-bold text-red-700"
                      disabled={busy}
                      onClick={() => onReview(payment, "reject")}
                    >
                      Tolak
                    </button>
                  </>
                )}
                {payment.status === "VERIFIED" && (
                  <button
                    className="h-8 rounded-[7px] border border-amber-300 px-3 text-[10px] font-bold text-amber-800"
                    disabled={busy}
                    onClick={() => onReview(payment, "void")}
                  >
                    Void
                  </button>
                )}
              </div>
            </div>
          ))
        ) : (
          <EmptyPanel text="Belum ada pembayaran untuk invoice ini." />
        )}
      </div>
    </div>
  );
}
