import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import {
  ApiError,
  apiEnvelope,
  apiListAll,
  idempotencyKey,
  queryString,
} from "../api/client";
import { queryKeys } from "../api/queryKeys";
import type { BillingPeriod, Invoice, PaymentTransaction } from "../api/types";
import { Icon, PageHeader } from "../components/ui";
import useOperationalDate from "../hooks/useOperationalDate.js";

const rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

const statusLabel: Record<string, string> = {
  UNPAID: "Belum Bayar",
  PARTIAL: "Sebagian",
  PAID: "Lunas",
  OVERDUE: "Jatuh Tempo",
};

interface PaymentDraft {
  invoice: string;
  amount_rupiah: number;
  paid_on: string;
  method: string;
  reference: string;
  note: string;
}

export default function PaymentsApi() {
  const operational = useOperationalDate();
  const queryClient = useQueryClient();
  const month = operational.date.slice(0, 7);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<PaymentDraft | null>(null);
  const [notice, setNotice] = useState("");
  const periods = useQuery({
    queryKey: queryKeys.periods,
    queryFn: ({ signal }) =>
      apiListAll<BillingPeriod>("/api/v1/billing-periods/", signal),
  });
  const period = periods.data?.find((item) => item.month.startsWith(month));
  const invoices = useQuery({
    queryKey: queryKeys.invoices(period?.id || month),
    queryFn: ({ signal }) =>
      apiListAll<Invoice>(
        `/api/v1/invoices/${queryString({ period: period?.id, reporting_date: operational.date })}`,
        signal,
      ),
    enabled: Boolean(period),
  });
  const paymentMutation = useMutation({
    mutationFn: (value: PaymentDraft) =>
      apiEnvelope<PaymentTransaction>("/api/v1/payment-transactions/", {
        method: "POST",
        idempotencyKey: idempotencyKey(),
        body: value,
      }),
    onSuccess: () => {
      setDraft(null);
      setNotice(
        "Pembayaran berhasil diajukan dan menunggu persetujuan Mas Topan.",
      );
      void queryClient.invalidateQueries({ queryKey: ["billing"] });
    },
  });
  const visible = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return (invoices.data || []).filter((invoice) => {
      if (!keyword) return true;
      return [
        invoice.student_name_snapshot,
        invoice.student_code_snapshot,
        invoice.class_group_name_snapshot,
        invoice.fee_plan_name_snapshot,
      ].some((value) => value.toLowerCase().includes(keyword));
    });
  }, [invoices.data, query]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (draft) paymentMutation.mutate(draft);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Pencatatan Pembayaran"
        description="Catat setoran siswa dari rombel yang Anda ampu. Semua pencatatan masuk sebagai pending dan baru mengurangi tagihan setelah disetujui Super Admin."
      />
      {notice && (
        <div className="rounded-[8px] border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-950">
          {notice}
        </div>
      )}
      {paymentMutation.error && (
        <div className="rounded-[8px] border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700">
          {paymentMutation.error instanceof ApiError
            ? paymentMutation.error.detail.message
            : "Pembayaran gagal diajukan."}
        </div>
      )}
      {!period && !periods.isLoading ? (
        <section className="rounded-[8px] border border-dashed border-amber-300 bg-amber-50 p-8 text-center">
          <Icon
            name="pending_actions"
            className="mx-auto text-2xl text-amber-700"
          />
          <h2 className="mt-3 text-base font-bold text-amber-900">
            Periode {month} belum dibuat
          </h2>
          <p className="mt-2 text-xs leading-5 text-amber-800">
            Hubungi Super Admin untuk membuat periode tagihan terlebih dahulu.
          </p>
        </section>
      ) : (
        <section className="overflow-hidden rounded-[8px] border border-stone-200 bg-white shadow-soft">
          <div className="flex flex-col gap-3 border-b border-stone-200 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div>
              <h2 className="text-sm font-bold">Tagihan Rombel Saya</h2>
              <p className="mt-1 text-[10px] text-on-surface-variant">
                Periode {month} · {visible.length} siswa
              </p>
            </div>
            <label className="flex h-11 w-full items-center gap-2 rounded-[8px] border px-3 sm:h-10 sm:max-w-xs">
              <Icon name="search" className="text-base" />
              <input
                className="min-w-0 flex-1 bg-transparent text-xs outline-none"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Cari siswa atau rombel..."
              />
            </label>
          </div>
          <div className="divide-y divide-stone-200">
            {visible.map((invoice) => {
              const open = draft?.invoice === invoice.id;
              const available = Math.max(
                invoice.outstanding_rupiah - invoice.pending_total_rupiah,
                0,
              );
              return (
                <div key={invoice.id}>
                  <article className="grid gap-3 p-4 sm:grid-cols-[minmax(180px,1.3fr)_minmax(150px,1fr)_minmax(140px,0.8fr)_auto] sm:items-center sm:p-5">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-bold">
                        {invoice.student_name_snapshot}
                      </p>
                      <p className="mt-1 text-[10px] text-on-surface-variant">
                        {invoice.student_code_snapshot} ·{" "}
                        {invoice.class_group_name_snapshot}
                      </p>
                    </div>
                    <div>
                      <span className="rounded-full bg-stone-100 border border-stone-200 px-2.5 py-1 text-[10px] font-bold text-stone-700">
                        {invoice.fee_plan_name_snapshot}
                      </span>
                      <p className="mt-2 text-xs font-bold">
                        Sisa {rupiah.format(invoice.outstanding_rupiah)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${invoice.status === "PAID" ? "bg-amber-100 text-amber-950 border border-amber-300 font-bold" : invoice.status === "OVERDUE" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"}`}
                      >
                        {statusLabel[invoice.status] || invoice.status}
                      </span>
                      {invoice.pending_total_rupiah > 0 && (
                        <span className="text-[10px] font-semibold text-amber-700">
                          Pending {rupiah.format(invoice.pending_total_rupiah)}
                        </span>
                      )}
                    </div>
                    <button
                      className={`secondary-button h-10 w-full rounded-[8px] px-3 text-xs sm:w-auto ${open ? "bg-[#18191B] text-amber-400 border-brand-dark font-bold" : ""}`}
                      disabled={available <= 0}
                      onClick={() =>
                        setDraft(
                          open
                            ? null
                            : {
                                invoice: invoice.id,
                                amount_rupiah: available,
                                paid_on: operational.date,
                                method: "Tunai",
                                reference: "",
                                note: "",
                              },
                        )
                      }
                    >
                      <Icon
                        name={open ? "close" : "add_card"}
                        className="text-base"
                      />
                      {open ? "Tutup" : "Catat Bayar"}
                    </button>
                  </article>
                  {open && draft && (
                    <form
                      className="session-editor-drawer border-t border-stone-200 bg-[#FAFAF7] p-4 sm:p-5"
                      onSubmit={submit}
                    >
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <label className="text-xs font-bold">
                          Nominal
                          <input
                            className="mt-2 h-11 w-full rounded-[8px] border bg-white px-3 font-normal"
                            type="number"
                            min="1"
                            max={available}
                            value={draft.amount_rupiah}
                            onChange={(event) =>
                              setDraft({
                                ...draft,
                                amount_rupiah: Number(event.target.value),
                              })
                            }
                            required
                          />
                        </label>
                        <label className="text-xs font-bold">
                          Tanggal Bayar
                          <input
                            className="mt-2 h-11 w-full rounded-[8px] border bg-white px-3 font-normal"
                            type="date"
                            value={draft.paid_on}
                            onChange={(event) =>
                              setDraft({
                                ...draft,
                                paid_on: event.target.value,
                              })
                            }
                            required
                          />
                        </label>
                        <label className="text-xs font-bold">
                          Metode
                          <select
                            className="mt-2 h-11 w-full rounded-[8px] border bg-white px-3 font-normal"
                            value={draft.method}
                            onChange={(event) =>
                              setDraft({ ...draft, method: event.target.value })
                            }
                          >
                            <option>Tunai</option>
                            <option>Transfer Bank</option>
                            <option>QRIS</option>
                          </select>
                        </label>
                        <label className="text-xs font-bold">
                          Referensi
                          <input
                            className="mt-2 h-11 w-full rounded-[8px] border bg-white px-3 font-normal"
                            value={draft.reference}
                            onChange={(event) =>
                              setDraft({
                                ...draft,
                                reference: event.target.value,
                              })
                            }
                            placeholder="Opsional"
                          />
                        </label>
                      </div>
                      <label className="mt-4 block text-xs font-bold">
                        Catatan
                        <textarea
                          className="mt-2 min-h-20 w-full rounded-[8px] border bg-white p-3 font-normal"
                          value={draft.note}
                          onChange={(event) =>
                            setDraft({ ...draft, note: event.target.value })
                          }
                          placeholder="Contoh: pembayaran diterima langsung setelah kelas."
                        />
                      </label>
                      <div className="mt-4 flex justify-end">
                        <button
                          className="primary-button rounded-[8px]"
                          disabled={
                            paymentMutation.isPending ||
                            draft.amount_rupiah <= 0
                          }
                        >
                          <Icon name="save" />
                          {paymentMutation.isPending
                            ? "Mengajukan..."
                            : "Ajukan Pembayaran"}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              );
            })}
            {!invoices.isLoading && visible.length === 0 && (
              <p className="p-10 text-center text-sm text-on-surface-variant">
                Tidak ada tagihan dari rombel yang Anda ampu pada periode ini.
              </p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
