import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Icon, PageHeader } from "../components/ui.jsx";
import { loadCourseClasses } from "../datadummy.js";
import useDataRevision from "../hooks/useDataRevision.js";
import useOperationalDate from "../hooks/useOperationalDate.js";
import {
  createBillingPeriod,
  getBillingPeriods,
  getFinanceOverview,
  getInvoiceDetail,
  getInvoices,
  getTransactions,
  recordPayment,
  rejectPayment,
  syncBillingPeriod,
  verifyPayment,
} from "../services/financeService.js";

const rupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const monthLabel = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" });
const dateLabel = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" });
const invoiceTone = {
  Lunas: "bg-emerald-100 text-emerald-800",
  Sebagian: "bg-amber-100 text-amber-800",
  "Belum Bayar": "bg-slate-100 text-slate-700",
  "Jatuh Tempo": "bg-red-100 text-red-700",
};
const transactionTone = {
  pending: "bg-amber-100 text-amber-800",
  verified: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-700",
};

function formatMonth(month) {
  return month ? monthLabel.format(new Date(`${month}-01T12:00:00`)) : "-";
}

function formatDate(date) {
  return date ? dateLabel.format(new Date(`${date}T12:00:00`)) : "-";
}

function Status({ type = "invoice", value, children }) {
  const styles = type === "transaction" ? transactionTone : invoiceTone;
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-bold ${styles[value] || "bg-slate-100 text-slate-700"}`}>{children || value}</span>;
}

function MetricCard({ icon, label, value, note, tone }) {
  const tones = {
    green: "border-emerald-200 bg-[#eef8f1] text-primary",
    blue: "border-cyan-200 bg-[#edf8f8] text-[#00646f]",
    red: "border-red-200 bg-[#fff3f2] text-red-700",
    amber: "border-amber-200 bg-[#fff8e9] text-amber-800",
  };
  return (
    <article className={`rounded-[8px] border p-4 ${tones[tone]}`}>
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-[11px] font-semibold text-on-surface-variant">{label}</p><p className="mt-2 text-[22px] font-bold leading-7">{value}</p></div>
        <div className="flex h-9 w-9 items-center justify-center rounded-[7px] bg-white/80"><Icon name={icon} className="text-base" /></div>
      </div>
      <p className="mt-2 text-[10px] font-medium text-on-surface-variant">{note}</p>
    </article>
  );
}

function EmptyState({ icon, title, description }) {
  return (
    <div className="flex min-h-44 flex-col items-center justify-center px-5 py-10 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-emerald-50 text-primary"><Icon name={icon} /></div>
      <p className="mt-3 text-sm font-bold">{title}</p>
      <p className="mt-1 max-w-xs text-xs leading-5 text-on-surface-variant">{description}</p>
    </div>
  );
}

function FinanceDialog({ title, description, onClose, children, footer }) {
  useEffect(() => {
    const closeOnEscape = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <button className="absolute inset-0 cursor-default bg-black/35 backdrop-blur-[1px]" onClick={onClose} aria-label="Tutup dialog" />
      <section className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[8px] border border-outline-variant/50 bg-white shadow-lift">
        <header className="flex items-start justify-between gap-4 border-b border-outline-variant/35 px-5 py-4">
          <div><h2 className="text-lg font-bold text-on-surface">{title}</h2><p className="mt-1 text-xs leading-5 text-on-surface-variant">{description}</p></div>
          <button className="icon-button" onClick={onClose} aria-label="Tutup"><Icon name="close" /></button>
        </header>
        <div className="space-y-4 bg-[#fbfdfb] p-5">{children}</div>
        <footer className="flex justify-end gap-2 border-t border-outline-variant/35 px-5 py-4">{footer}</footer>
      </section>
    </div>
  );
}

function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-bold text-on-surface-variant">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-[10px] leading-4 text-on-surface-variant">{hint}</span>}
    </label>
  );
}

function InvoiceInlineDetail({ invoiceId, revision, onClose, onRecord, onVerify, onReject }) {
  const invoice = useMemo(() => invoiceId ? getInvoiceDetail(invoiceId) : null, [invoiceId, revision]);

  useEffect(() => {
    if (!invoiceId) return undefined;
    const closeOnEscape = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [invoiceId, onClose]);

  if (!invoice) return null;
  return (
    <section className="session-editor-drawer border-y border-emerald-200 bg-[#f3faf5] p-4" aria-label={`Detail tagihan ${invoice.studentNameSnapshot}`}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">{invoice.studentInitialsSnapshot}</div><div className="min-w-0"><p className="text-[9px] font-bold uppercase text-primary">Detail Tagihan - {formatMonth(invoice.period?.month)}</p><h3 className="mt-1 truncate text-sm font-bold">{invoice.studentNameSnapshot}</h3><p className="mt-1 truncate text-[10px] text-on-surface-variant">{invoice.classNameSnapshot} - {invoice.schoolSnapshot}</p></div></div>
        <button className="icon-button h-8 w-8 rounded-[7px] border border-emerald-200 bg-white" onClick={onClose} aria-label="Tutup detail"><Icon name="close" className="text-base" /></button>
      </div>
      <div className="grid gap-3 lg:grid-cols-[0.85fr_1.15fr]">
        <section className="rounded-[8px] border border-outline-variant/45 bg-white p-4">
          <div className="flex items-center justify-between gap-3"><h3 className="text-xs font-bold">Ringkasan Tagihan</h3><Status value={invoice.status} /></div>
          <div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-2 text-[10px]"><span className="text-on-surface-variant">Kategori tarif</span><strong className="text-right text-primary">{invoice.feeCategoryNameSnapshot || "Tarif Legacy"}</strong><span className="text-on-surface-variant">Nominal</span><strong className="text-right">{rupiah.format(invoice.amount)}</strong><span className="text-on-surface-variant">Terverifikasi</span><strong className="text-right text-primary">{rupiah.format(invoice.verifiedTotal)}</strong><span className="text-on-surface-variant">Sisa tagihan</span><strong className={`text-right ${invoice.outstanding ? "text-red-700" : "text-primary"}`}>{rupiah.format(invoice.outstanding)}</strong><span className="text-on-surface-variant">Jatuh tempo</span><strong className="text-right">{formatDate(invoice.dueDate)}</strong></div>
          {invoice.outstanding > 0 && <button className="mt-4 flex h-9 w-full items-center justify-center gap-2 rounded-[7px] bg-primary px-4 text-[10px] font-bold text-white" onClick={() => onRecord(invoice)}><Icon name="add_card" className="text-base" /> Catat Pembayaran</button>}
        </section>
        <section className="overflow-hidden rounded-[8px] border border-outline-variant/45 bg-white">
          <div className="border-b border-outline-variant/35 px-4 py-3"><h3 className="text-xs font-bold">Histori Pembayaran</h3><p className="mt-1 text-[9px] text-on-surface-variant">Saldo berubah setelah transaksi diverifikasi.</p></div>
          {invoice.transactions.length === 0 ? <div className="px-4 py-7 text-center text-[10px] text-on-surface-variant">Belum ada pembayaran pada periode ini.</div> : <div className="divide-y divide-outline-variant/30">{invoice.transactions.map((transaction) => <div key={transaction.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="text-xs font-bold">{rupiah.format(transaction.amount)}</p><p className="mt-1 text-[9px] text-on-surface-variant">{formatDate(transaction.paidAt)} - {transaction.method}{transaction.reference ? ` - ${transaction.reference}` : ""}</p></div><Status type="transaction" value={transaction.status}>{transaction.status === "verified" ? "Terverifikasi" : transaction.status === "rejected" ? "Ditolak" : "Menunggu"}</Status>{transaction.status === "pending" && <div className="flex gap-1"><button className="icon-button h-8 w-8 rounded-[7px] bg-emerald-50 text-primary" onClick={() => onVerify(transaction.id)} title="Verifikasi"><Icon name="check_circle" className="text-base" /></button><button className="icon-button h-8 w-8 rounded-[7px] bg-red-50 text-red-700" onClick={() => onReject(transaction)} title="Tolak"><Icon name="close" className="text-base" /></button></div>}</div>)}</div>}
        </section>
      </div>
    </section>
  );
}

export default function Finance() {
  const [searchParams] = useSearchParams();
  const operational = useOperationalDate();
  const operationalMonth = operational.date.slice(0, 7);
  const appliedOperationalMonth = useRef(operationalMonth);
  const pendingOperationalMonth = useRef("");
  const queryView = searchParams.get("view");
  const queryTab = searchParams.get("tab");
  const queryStatus = searchParams.get("status") || "";
  const [viewMode, setViewMode] = useState(queryView === "list" ? "list" : "overview");
  const [activeTab, setActiveTab] = useState(queryTab === "transactions" ? "transactions" : "invoices");
  const [selectedPeriodId, setSelectedPeriodId] = useState(() => getBillingPeriods().find((period) => period.month === operationalMonth)?.id || "");
  const [filters, setFilters] = useState(() => ({ query: "", classId: "", status: queryStatus }));
  const [revision, setRevision] = useState(0);
  const [periodDialog, setPeriodDialog] = useState(false);
  const [periodDraft, setPeriodDraft] = useState({ month: "", dueDate: "" });
  const [paymentDialog, setPaymentDialog] = useState(false);
  const [paymentDraft, setPaymentDraft] = useState({ invoiceId: "", amount: "", paidAt: operational.date, method: "Transfer", reference: "", note: "" });
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [drawerInvoiceId, setDrawerInvoiceId] = useState("");
  const [notice, setNotice] = useState(null);
  const dataRevision = useDataRevision(["finance", "roster"]);

  const periods = useMemo(() => getBillingPeriods(), [revision, dataRevision]);
  const classes = useMemo(() => loadCourseClasses(), [revision, dataRevision]);
  const overview = useMemo(() => selectedPeriodId ? getFinanceOverview(selectedPeriodId) : null, [selectedPeriodId, revision, dataRevision]);
  const allInvoices = useMemo(() => getInvoices({ periodId: selectedPeriodId }), [selectedPeriodId, revision, dataRevision]);
  const invoices = useMemo(() => getInvoices({
    periodId: selectedPeriodId,
    classId: filters.classId,
    query: filters.query,
    status: activeTab === "invoices" ? filters.status : "",
  }), [selectedPeriodId, filters, activeTab, revision, dataRevision]);
  const transactions = useMemo(() => getTransactions({
    periodId: selectedPeriodId,
    classId: filters.classId,
    query: filters.query,
    status: activeTab === "transactions" ? filters.status : "",
  }), [selectedPeriodId, filters, activeTab, revision, dataRevision]);

  useEffect(() => {
    if (operationalMonth === appliedOperationalMonth.current && !pendingOperationalMonth.current) return;
    if (periodDialog || paymentDialog || rejectTarget) {
      pendingOperationalMonth.current = operationalMonth;
      return;
    }
    const targetMonth = pendingOperationalMonth.current || operationalMonth;
    const matchingPeriod = periods.find((period) => period.month === targetMonth);
    setSelectedPeriodId(matchingPeriod?.id || "");
    setDrawerInvoiceId("");
    appliedOperationalMonth.current = targetMonth;
    pendingOperationalMonth.current = "";
  }, [operationalMonth, periods, periodDialog, paymentDialog, rejectTarget]);

  useEffect(() => {
    if (queryView === "list") setViewMode("list");
    if (queryTab === "transactions") setActiveTab("transactions");
    else if (queryTab === "invoices") setActiveTab("invoices");
    if (queryStatus) setFilters((current) => ({ ...current, status: queryStatus }));
  }, [queryView, queryTab, queryStatus]);

  const refresh = () => setRevision((current) => current + 1);
  const flash = (message, type = "success") => {
    setNotice({ message, type });
    window.setTimeout(() => setNotice(null), 3200);
  };
  const runAction = (action, successMessage) => {
    try {
      action();
      refresh();
      flash(successMessage);
      return true;
    } catch (error) {
      flash(error.message, "error");
      return false;
    }
  };

  const openPayment = (invoice) => {
    const target = invoice || allInvoices.find((item) => item.outstanding > 0) || null;
    setPaymentDraft({ invoiceId: target?.id || "", amount: "", paidAt: operational.date, method: "Transfer", reference: "", note: "" });
    setPaymentDialog(true);
  };

  const submitPeriod = () => {
    let created;
    const ok = runAction(() => { created = createBillingPeriod(periodDraft); }, "Periode tagihan berhasil dibuat.");
    if (ok) {
      setSelectedPeriodId(created.period.id);
      setPeriodDialog(false);
      setPeriodDraft({ month: "", dueDate: "" });
    }
  };

  const submitPayment = () => {
    const ok = runAction(() => recordPayment(paymentDraft.invoiceId, paymentDraft), "Pembayaran dicatat dan menunggu verifikasi.");
    if (ok) setPaymentDialog(false);
  };

  const handleVerify = (transactionId) => {
    runAction(() => verifyPayment(transactionId), "Pembayaran berhasil diverifikasi.");
  };

  const submitReject = () => {
    const ok = runAction(() => rejectPayment(rejectTarget.id, rejectReason), "Transaksi ditolak.");
    if (ok) { setRejectTarget(null); setRejectReason(""); }
  };

  const showAll = (tab, status) => {
    setActiveTab(tab);
    setFilters((current) => ({ ...current, status }));
    setViewMode("list");
  };
  const synchronizeRoster = () => {
    try {
      const result = syncBillingPeriod(selectedPeriodId);
      refresh();
      const changes = [];
      if (result.added) changes.push(`${result.added} siswa ditambahkan`);
      if (result.updated) changes.push(`${result.updated} data siswa diperbarui`);
      if (result.removed) changes.push(`${result.removed} tagihan kosong dihapus`);
      if (result.retained) changes.push(`${result.retained} histori pembayaran dipertahankan`);
      flash(changes.length > 0 ? `Sinkronisasi selesai: ${changes.join(", ")}.` : "Semua data Rombel sudah tersinkron.");
    } catch (error) {
      flash(error.message, "error");
    }
  };
  const toggleInvoiceDetail = (invoiceId) => setDrawerInvoiceId((current) => current === invoiceId ? "" : invoiceId);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Finance"
        description="Pantau tagihan bulanan, cicilan, dan verifikasi pembayaran siswa."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex h-11 rounded-[8px] border border-outline-variant/55 bg-white p-1" aria-label="Mode tampilan">
              <button className={`flex items-center gap-2 rounded-[6px] px-3 text-xs font-bold ${viewMode === "overview" ? "bg-primary text-white" : "text-on-surface-variant"}`} onClick={() => setViewMode("overview")} title="Overview"><Icon name="dashboard" className="text-base" /><span className="hidden sm:inline">Overview</span></button>
              <button className={`flex items-center gap-2 rounded-[6px] px-3 text-xs font-bold ${viewMode === "list" ? "bg-primary text-white" : "text-on-surface-variant"}`} onClick={() => setViewMode("list")} title="List"><Icon name="format_list_bulleted" className="text-base" /><span className="hidden sm:inline">List</span></button>
            </div>
            <button className="inline-flex h-11 items-center gap-2 rounded-[8px] border border-primary bg-white px-4 text-xs font-bold text-primary" onClick={() => { setPeriodDraft({ month: operationalMonth, dueDate: `${operationalMonth}-10` }); setPeriodDialog(true); }}><Icon name="calendar_month" className="text-base" /> Buat Periode</button>
            <button className="inline-flex h-11 items-center gap-2 rounded-[8px] bg-primary px-4 text-xs font-bold text-white disabled:opacity-50" onClick={() => openPayment()} disabled={!allInvoices.length}><Icon name="add_card" className="text-base" /> Catat Pembayaran</button>
          </div>
        }
      />

      <section className="flex flex-col gap-3 rounded-[8px] border border-outline-variant/45 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-[7px] bg-emerald-50 text-primary"><Icon name="calendar_month" className="text-base" /></div><div><p className="text-[10px] font-semibold text-on-surface-variant">Periode aktif</p><select className="mt-0.5 bg-transparent text-sm font-bold text-on-surface outline-none" value={selectedPeriodId} onChange={(event) => { setSelectedPeriodId(event.target.value); setFilters((current) => ({ ...current, status: "" })); }}><option value="">{`Belum ada periode ${formatMonth(operationalMonth)}`}</option>{periods.map((period) => <option key={period.id} value={period.id}>{formatMonth(period.month)}</option>)}</select></div></div>
        <button className="inline-flex h-9 items-center justify-center gap-2 rounded-[7px] border border-outline-variant/55 px-3 text-[11px] font-bold text-primary hover:bg-emerald-50 disabled:opacity-50" onClick={synchronizeRoster} disabled={!selectedPeriodId}><Icon name="sync" className="text-base" /> Sinkronkan Rombel</button>
      </section>

      {!selectedPeriodId ? (
        <section className="rounded-[8px] border border-dashed border-emerald-300 bg-white px-6 py-14 text-center"><span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-primary"><Icon name="event_busy" /></span><h2 className="mt-4 text-lg font-bold">Periode {formatMonth(operationalMonth)} belum dibuat</h2><p className="mx-auto mt-2 max-w-xl text-xs leading-5 text-on-surface-variant">Tanggal operasional sudah berpindah, tetapi tagihan tidak dibuat otomatis agar histori dan jumlah invoice tetap aman.</p><button className="mt-5 inline-flex h-10 items-center gap-2 rounded-[8px] bg-primary px-4 text-xs font-bold text-white" onClick={() => { setPeriodDraft({ month: operationalMonth, dueDate: `${operationalMonth}-10` }); setPeriodDialog(true); }}><Icon name="add" className="text-base" /> Buat Periode</button></section>
      ) : viewMode === "overview" ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard icon="receipt_long" label="Total Tagihan" value={rupiah.format(overview?.totalBilled || 0)} note={`${overview?.invoiceCount || 0} invoice pada periode ini`} tone="green" />
            <MetricCard icon="task_alt" label="Sudah Dibayar" value={rupiah.format(overview?.totalPaid || 0)} note={`${overview?.paidInvoiceCount || 0} siswa sudah lunas`} tone="blue" />
            <MetricCard icon="warning" label="Sisa Tagihan" value={rupiah.format(overview?.outstanding || 0)} note={`${overview?.overdue.length || 0} siswa melewati jatuh tempo`} tone="red" />
            <MetricCard icon="pending_actions" label="Menunggu Verifikasi" value={`${overview?.pendingCount || 0} transaksi`} note="Tidak dihitung sebagai pemasukan" tone="amber" />
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <article className="overflow-hidden rounded-[8px] border border-outline-variant/45 bg-white">
              <header className="flex items-center justify-between gap-3 border-b border-outline-variant/35 px-4 py-3.5"><div><div className="flex items-center gap-2"><Icon name="warning" className="text-base text-red-600" /><h2 className="text-sm font-bold">Tagihan Belum Dibayar</h2></div><p className="mt-1 text-[10px] text-on-surface-variant">Prioritas siswa yang sudah melewati jatuh tempo.</p></div><button className="text-[10px] font-bold text-primary" onClick={() => showAll("invoices", "Jatuh Tempo")}>Lihat Semua</button></header>
              {overview?.overdue.length ? <div className="divide-y divide-outline-variant/30">{overview.overdue.slice(0, 6).map((invoice) => <React.Fragment key={invoice.id}><button className={`flex w-full items-center gap-3 px-4 py-3 text-left ${drawerInvoiceId === invoice.id ? "bg-red-50/50" : "hover:bg-red-50/40"}`} onClick={() => toggleInvoiceDetail(invoice.id)} aria-expanded={drawerInvoiceId === invoice.id}><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-50 text-[10px] font-bold text-red-700">{invoice.studentInitialsSnapshot}</div><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold">{invoice.studentNameSnapshot}</p><p className="mt-1 truncate text-[10px] text-on-surface-variant">{invoice.classNameSnapshot} - Jatuh tempo {formatDate(invoice.dueDate)}</p></div><strong className="shrink-0 text-[11px] text-red-700">{rupiah.format(invoice.outstanding)}</strong><Icon name="expand_more" className={`text-base text-outline transition ${drawerInvoiceId === invoice.id ? "rotate-180" : ""}`} /></button>{drawerInvoiceId === invoice.id && <InvoiceInlineDetail invoiceId={invoice.id} revision={revision + dataRevision} onClose={() => setDrawerInvoiceId("")} onRecord={openPayment} onVerify={handleVerify} onReject={setRejectTarget} />}</React.Fragment>)}</div> : <EmptyState icon="task_alt" title="Tidak ada tunggakan" description="Semua tagihan yang jatuh tempo sudah terselesaikan." />}
            </article>

            <article className="overflow-hidden rounded-[8px] border border-outline-variant/45 bg-white">
              <header className="flex items-center justify-between gap-3 border-b border-outline-variant/35 px-4 py-3.5"><div><div className="flex items-center gap-2"><Icon name="pending_actions" className="text-base text-amber-700" /><h2 className="text-sm font-bold">Menunggu Verifikasi</h2></div><p className="mt-1 text-[10px] text-on-surface-variant">Setoran terbaru yang belum memengaruhi saldo tagihan.</p></div><button className="text-[10px] font-bold text-primary" onClick={() => showAll("transactions", "pending")}>Lihat Semua</button></header>
              {overview?.pendingTransactions.length ? <div className="divide-y divide-outline-variant/30">{overview.pendingTransactions.slice(0, 6).map((transaction) => <React.Fragment key={transaction.id}><div className={`flex items-center gap-3 px-4 py-3 ${drawerInvoiceId === transaction.invoiceId ? "bg-amber-50/45" : ""}`}><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-50 text-[10px] font-bold text-amber-800">{transaction.invoice?.studentInitialsSnapshot}</div><button className="min-w-0 flex-1 text-left" onClick={() => toggleInvoiceDetail(transaction.invoiceId)} aria-expanded={drawerInvoiceId === transaction.invoiceId}><p className="truncate text-xs font-bold">{transaction.studentName}</p><p className="mt-1 truncate text-[10px] text-on-surface-variant">{transaction.method} - {formatDate(transaction.paidAt)} - {rupiah.format(transaction.amount)}</p></button><div className="flex shrink-0 gap-1"><button className="icon-button h-8 w-8 rounded-[7px] bg-emerald-50 text-primary" onClick={() => handleVerify(transaction.id)} title="Verifikasi"><Icon name="check_circle" className="text-base" /></button><button className="icon-button h-8 w-8 rounded-[7px] bg-red-50 text-red-700" onClick={() => setRejectTarget(transaction)} title="Tolak"><Icon name="close" className="text-base" /></button></div></div>{drawerInvoiceId === transaction.invoiceId && <InvoiceInlineDetail invoiceId={transaction.invoiceId} revision={revision + dataRevision} onClose={() => setDrawerInvoiceId("")} onRecord={openPayment} onVerify={handleVerify} onReject={setRejectTarget} />}</React.Fragment>)}</div> : <EmptyState icon="task_alt" title="Tidak ada antrean" description="Semua pembayaran sudah selesai ditinjau." />}
            </article>
          </section>
        </>
      ) : (
        <section className="overflow-hidden rounded-[8px] border border-outline-variant/45 bg-white">
          <div className="flex border-b border-outline-variant/35 bg-[#fbfdfb] px-4 pt-3">
            <button className={`border-b-2 px-4 py-3 text-xs font-bold ${activeTab === "invoices" ? "border-primary text-primary" : "border-transparent text-on-surface-variant"}`} onClick={() => { setActiveTab("invoices"); setFilters((current) => ({ ...current, status: "" })); }}>Tagihan</button>
            <button className={`border-b-2 px-4 py-3 text-xs font-bold ${activeTab === "transactions" ? "border-primary text-primary" : "border-transparent text-on-surface-variant"}`} onClick={() => { setActiveTab("transactions"); setFilters((current) => ({ ...current, status: "" })); }}>Transaksi</button>
          </div>

          <div className="grid gap-2 border-b border-outline-variant/35 p-4 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_190px_190px_auto]">
            <div className="relative"><Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-base text-on-surface-variant" /><input className="h-10 w-full rounded-[8px] border border-outline-variant/50 bg-white pl-10 pr-3 text-xs outline-none focus:border-primary" placeholder="Cari siswa, rombel, atau referensi..." value={filters.query} onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))} /></div>
            <select className="h-10 rounded-[8px] border border-outline-variant/50 bg-white px-3 text-xs outline-none focus:border-primary" value={filters.classId} onChange={(event) => setFilters((current) => ({ ...current, classId: event.target.value }))}><option value="">Semua Rombel</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
            <select className="h-10 rounded-[8px] border border-outline-variant/50 bg-white px-3 text-xs outline-none focus:border-primary" value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
              <option value="">Semua Status</option>
              {activeTab === "invoices" ? ["Belum Bayar", "Sebagian", "Lunas", "Jatuh Tempo"].map((status) => <option key={status}>{status}</option>) : <><option value="pending">Menunggu Verifikasi</option><option value="verified">Terverifikasi</option><option value="rejected">Ditolak</option></>}
            </select>
            <button className="inline-flex h-10 items-center justify-center gap-2 rounded-[8px] border border-outline-variant/50 px-3 text-xs font-bold text-on-surface-variant" onClick={() => setFilters({ query: "", classId: "", status: "" })}><Icon name="sync" className="text-base" /> Reset</button>
          </div>

          {activeTab === "invoices" ? (
            invoices.length ? (
              <>
                <div className="hidden overflow-x-auto lg:block">
                  <table className="w-full min-w-[940px] text-left">
                    <thead className="bg-[#f6faf6] text-[10px] uppercase text-on-surface-variant"><tr><th className="px-4 py-3">Siswa</th><th className="px-4 py-3">Kategori</th><th className="px-4 py-3">Nominal</th><th className="px-4 py-3">Terverifikasi</th><th className="px-4 py-3">Sisa</th><th className="px-4 py-3">Jatuh Tempo</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Aksi</th></tr></thead>
                    <tbody className="divide-y divide-outline-variant/30">
                      {invoices.map((invoice) => (
                        <React.Fragment key={invoice.id}>
                          <tr className={drawerInvoiceId === invoice.id ? "bg-emerald-50/45" : "hover:bg-emerald-50/25"}>
                            <td className="px-4 py-3"><p className="text-xs font-bold">{invoice.studentNameSnapshot}</p><p className="mt-1 text-[10px] text-on-surface-variant">{invoice.classNameSnapshot}</p></td>
                            <td className="px-4 py-3"><span className="rounded-full bg-teal-50 px-2.5 py-1 text-[10px] font-bold text-teal-800">{invoice.feeCategoryNameSnapshot || "Tarif Legacy"}</span></td>
                            <td className="px-4 py-3 text-xs font-semibold">{rupiah.format(invoice.amount)}</td>
                            <td className="px-4 py-3 text-xs text-primary">{rupiah.format(invoice.verifiedTotal)}</td>
                            <td className="px-4 py-3 text-xs font-bold">{rupiah.format(invoice.outstanding)}</td>
                            <td className="px-4 py-3 text-xs text-on-surface-variant">{formatDate(invoice.dueDate)}</td>
                            <td className="px-4 py-3"><div className="flex flex-wrap gap-1"><Status value={invoice.status} />{invoice.hasPending && <Status type="transaction" value="pending">Ada pending</Status>}</div></td>
                            <td className="px-4 py-3"><div className="flex justify-end gap-1"><button className={`icon-button h-8 w-8 rounded-[7px] ${drawerInvoiceId === invoice.id ? "bg-primary text-white" : ""}`} onClick={() => toggleInvoiceDetail(invoice.id)} title="Detail tagihan" aria-expanded={drawerInvoiceId === invoice.id}><Icon name="visibility" className="text-base" /></button>{invoice.outstanding > 0 && <button className="icon-button h-8 w-8 rounded-[7px] text-primary" onClick={() => openPayment(invoice)} title="Catat pembayaran"><Icon name="add_card" className="text-base" /></button>}</div></td>
                          </tr>
                          {drawerInvoiceId === invoice.id && <tr><td colSpan="8" className="p-0"><InvoiceInlineDetail invoiceId={invoice.id} revision={revision + dataRevision} onClose={() => setDrawerInvoiceId("")} onRecord={openPayment} onVerify={handleVerify} onReject={setRejectTarget} /></td></tr>}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="divide-y divide-outline-variant/30 lg:hidden">
                  {invoices.map((invoice) => <div key={invoice.id}><button className={`w-full p-4 text-left ${drawerInvoiceId === invoice.id ? "bg-emerald-50/45" : ""}`} onClick={() => toggleInvoiceDetail(invoice.id)} aria-expanded={drawerInvoiceId === invoice.id}><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-bold">{invoice.studentNameSnapshot}</p><p className="mt-1 text-[10px] text-on-surface-variant">{invoice.classNameSnapshot} - {invoice.feeCategoryNameSnapshot || "Tarif Legacy"}</p></div><Status value={invoice.status} /></div><div className="mt-3 grid grid-cols-2 gap-3 text-[10px]"><div><span className="text-on-surface-variant">Sisa</span><p className="mt-1 font-bold">{rupiah.format(invoice.outstanding)}</p></div><div><span className="text-on-surface-variant">Jatuh tempo</span><p className="mt-1 font-bold">{formatDate(invoice.dueDate)}</p></div></div></button>{drawerInvoiceId === invoice.id && <InvoiceInlineDetail invoiceId={invoice.id} revision={revision + dataRevision} onClose={() => setDrawerInvoiceId("")} onRecord={openPayment} onVerify={handleVerify} onReject={setRejectTarget} />}</div>)}
                </div>
              </>
            ) : <EmptyState icon="receipt_long" title="Tagihan tidak ditemukan" description="Coba ubah filter atau sinkronkan anggota Rombel pada periode ini." />
          ) : (
            transactions.length ? (
              <>
                <div className="hidden overflow-x-auto lg:block">
                  <table className="w-full min-w-[900px] text-left">
                    <thead className="bg-[#f6faf6] text-[10px] uppercase text-on-surface-variant"><tr><th className="px-4 py-3">Tanggal</th><th className="px-4 py-3">Siswa</th><th className="px-4 py-3">Metode</th><th className="px-4 py-3">Nominal</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Aksi</th></tr></thead>
                    <tbody className="divide-y divide-outline-variant/30">
                      {transactions.map((transaction) => (
                        <React.Fragment key={transaction.id}>
                          <tr className={drawerInvoiceId === transaction.invoiceId ? "bg-emerald-50/45" : "hover:bg-emerald-50/25"}>
                            <td className="px-4 py-3 text-xs text-on-surface-variant">{formatDate(transaction.paidAt)}</td>
                            <td className="px-4 py-3"><button className="text-left" onClick={() => toggleInvoiceDetail(transaction.invoiceId)}><p className="text-xs font-bold">{transaction.studentName}</p><p className="mt-1 text-[10px] text-on-surface-variant">{transaction.className}</p></button></td>
                            <td className="px-4 py-3 text-xs"><p>{transaction.method}</p><p className="mt-1 text-[10px] text-on-surface-variant">{transaction.reference || "Tanpa referensi"}</p></td>
                            <td className="px-4 py-3 text-xs font-bold">{rupiah.format(transaction.amount)}</td>
                            <td className="px-4 py-3"><Status type="transaction" value={transaction.status}>{transaction.statusLabel}</Status></td>
                            <td className="px-4 py-3"><div className="flex justify-end gap-1"><button className={`icon-button h-8 w-8 rounded-[7px] ${drawerInvoiceId === transaction.invoiceId ? "bg-primary text-white" : ""}`} onClick={() => toggleInvoiceDetail(transaction.invoiceId)} title="Detail" aria-expanded={drawerInvoiceId === transaction.invoiceId}><Icon name="visibility" className="text-base" /></button>{transaction.status === "pending" && <><button className="icon-button h-8 w-8 rounded-[7px] text-primary" onClick={() => handleVerify(transaction.id)} title="Verifikasi"><Icon name="check_circle" className="text-base" /></button><button className="icon-button h-8 w-8 rounded-[7px] text-red-700" onClick={() => setRejectTarget(transaction)} title="Tolak"><Icon name="close" className="text-base" /></button></>}</div></td>
                          </tr>
                          {drawerInvoiceId === transaction.invoiceId && <tr><td colSpan="6" className="p-0"><InvoiceInlineDetail invoiceId={transaction.invoiceId} revision={revision + dataRevision} onClose={() => setDrawerInvoiceId("")} onRecord={openPayment} onVerify={handleVerify} onReject={setRejectTarget} /></td></tr>}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="divide-y divide-outline-variant/30 lg:hidden">
                  {transactions.map((transaction) => <div key={transaction.id}><div className={`p-4 ${drawerInvoiceId === transaction.invoiceId ? "bg-emerald-50/45" : ""}`}><div className="flex items-start justify-between gap-3"><button className="text-left" onClick={() => toggleInvoiceDetail(transaction.invoiceId)} aria-expanded={drawerInvoiceId === transaction.invoiceId}><p className="text-sm font-bold">{transaction.studentName}</p><p className="mt-1 text-[10px] text-on-surface-variant">{transaction.className} - {formatDate(transaction.paidAt)}</p></button><Status type="transaction" value={transaction.status}>{transaction.statusLabel}</Status></div><p className="mt-3 text-sm font-bold">{rupiah.format(transaction.amount)}</p>{transaction.status === "pending" && <div className="mt-3 flex gap-2"><button className="flex h-8 flex-1 items-center justify-center rounded-[7px] bg-primary text-[10px] font-bold text-white" onClick={() => handleVerify(transaction.id)}>Verifikasi</button><button className="flex h-8 flex-1 items-center justify-center rounded-[7px] border border-red-200 text-[10px] font-bold text-red-700" onClick={() => setRejectTarget(transaction)}>Tolak</button></div>}</div>{drawerInvoiceId === transaction.invoiceId && <InvoiceInlineDetail invoiceId={transaction.invoiceId} revision={revision + dataRevision} onClose={() => setDrawerInvoiceId("")} onRecord={openPayment} onVerify={handleVerify} onReject={setRejectTarget} />}</div>)}
                </div>
              </>
            ) : <EmptyState icon="pending_actions" title="Transaksi tidak ditemukan" description="Belum ada setoran yang sesuai dengan filter ini." />
          )}
        </section>
      )}

      {periodDialog && (
        <FinanceDialog title="Buat Periode Tagihan" description="Satu invoice dibuat untuk setiap siswa aktif memakai kategori iuran yang ditetapkan pada Rombel." onClose={() => setPeriodDialog(false)} footer={<><button className="h-10 rounded-[8px] border border-outline-variant/55 px-4 text-xs font-bold" onClick={() => setPeriodDialog(false)}>Batal</button><button className="h-10 rounded-[8px] bg-primary px-4 text-xs font-bold text-white" onClick={submitPeriod}>Buat Periode</button></>}>
          <Field label="Bulan Periode"><input className="h-11 w-full rounded-[8px] border border-outline-variant/55 bg-white px-3 text-sm outline-none focus:border-primary" type="month" value={periodDraft.month} onChange={(event) => { const month = event.target.value; setPeriodDraft({ month, dueDate: month ? `${month}-10` : "" }); }} /></Field>
          <Field label="Tanggal Jatuh Tempo" hint="Berlaku sama untuk seluruh invoice pada periode ini."><input className="h-11 w-full rounded-[8px] border border-outline-variant/55 bg-white px-3 text-sm outline-none focus:border-primary" type="date" min={periodDraft.month ? `${periodDraft.month}-01` : undefined} max={periodDraft.month ? `${periodDraft.month}-31` : undefined} value={periodDraft.dueDate} onChange={(event) => setPeriodDraft((current) => ({ ...current, dueDate: event.target.value }))} /></Field>
        </FinanceDialog>
      )}

      {paymentDialog && (
        <FinanceDialog title="Catat Pembayaran" description="Pembayaran masuk ke antrean verifikasi dan belum langsung mengurangi tagihan." onClose={() => setPaymentDialog(false)} footer={<><button className="h-10 rounded-[8px] border border-outline-variant/55 px-4 text-xs font-bold" onClick={() => setPaymentDialog(false)}>Batal</button><button className="h-10 rounded-[8px] bg-primary px-4 text-xs font-bold text-white" onClick={submitPayment}>Simpan Pembayaran</button></>}>
          <Field label="Tagihan Siswa"><select className="h-11 w-full rounded-[8px] border border-outline-variant/55 bg-white px-3 text-sm outline-none focus:border-primary" value={paymentDraft.invoiceId} onChange={(event) => setPaymentDraft((current) => ({ ...current, invoiceId: event.target.value, amount: "" }))}><option value="">Pilih tagihan</option>{allInvoices.filter((invoice) => invoice.outstanding > 0).map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.studentNameSnapshot} - {invoice.classNameSnapshot} - sisa {rupiah.format(invoice.outstanding)}</option>)}</select></Field>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Nominal"><input className="h-11 w-full rounded-[8px] border border-outline-variant/55 bg-white px-3 text-sm outline-none focus:border-primary" type="number" min="1" value={paymentDraft.amount} onChange={(event) => setPaymentDraft((current) => ({ ...current, amount: event.target.value }))} placeholder="Rp0" /></Field><Field label="Tanggal Bayar"><input className="h-11 w-full rounded-[8px] border border-outline-variant/55 bg-white px-3 text-sm outline-none focus:border-primary" type="date" value={paymentDraft.paidAt} onChange={(event) => setPaymentDraft((current) => ({ ...current, paidAt: event.target.value }))} /></Field></div>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Metode"><select className="h-11 w-full rounded-[8px] border border-outline-variant/55 bg-white px-3 text-sm outline-none focus:border-primary" value={paymentDraft.method} onChange={(event) => setPaymentDraft((current) => ({ ...current, method: event.target.value }))}><option>Transfer</option><option>Tunai</option></select></Field><Field label="Referensi"><input className="h-11 w-full rounded-[8px] border border-outline-variant/55 bg-white px-3 text-sm outline-none focus:border-primary" value={paymentDraft.reference} onChange={(event) => setPaymentDraft((current) => ({ ...current, reference: event.target.value }))} placeholder="Opsional" /></Field></div>
          <Field label="Catatan"><textarea className="min-h-20 w-full resize-none rounded-[8px] border border-outline-variant/55 bg-white p-3 text-sm outline-none focus:border-primary" value={paymentDraft.note} onChange={(event) => setPaymentDraft((current) => ({ ...current, note: event.target.value }))} placeholder="Catatan pembayaran (opsional)" /></Field>
        </FinanceDialog>
      )}

      {rejectTarget && (
        <FinanceDialog title="Tolak Transaksi" description={`Pembayaran ${rupiah.format(rejectTarget.amount)} milik ${rejectTarget.studentName || "siswa"} tidak akan mengubah saldo tagihan.`} onClose={() => { setRejectTarget(null); setRejectReason(""); }} footer={<><button className="h-10 rounded-[8px] border border-outline-variant/55 px-4 text-xs font-bold" onClick={() => { setRejectTarget(null); setRejectReason(""); }}>Batal</button><button className="h-10 rounded-[8px] bg-red-600 px-4 text-xs font-bold text-white" onClick={submitReject}>Tolak Transaksi</button></>}>
          <Field label="Alasan Penolakan"><textarea className="min-h-24 w-full resize-none rounded-[8px] border border-outline-variant/55 bg-white p-3 text-sm outline-none focus:border-red-500" value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} placeholder="C