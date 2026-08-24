import { DEFAULT_MONTHLY_FEE, loadCourseClasses } from "../datadummy.js";
import { commitStorageJSON, readStorageJSON, writeStorageJSON } from "./dataStore.js";
import { getOperationalDate } from "./operationalDateService.js";
import { resolveStudentFee, validateFeeConfiguration } from "./feeCategoryService.js";

const PERIOD_STORAGE_KEY = "awan-topan-billing-periods-v3";
const INVOICE_STORAGE_KEY = "awan-topan-finance-invoices-v3";
const TRANSACTION_STORAGE_KEY = "awan-topan-finance-transactions-v3";

const pad = (value) => String(value).padStart(2, "0");
const todayISO = () => getOperationalDate();

export const getCurrentMonth = () => todayISO().slice(0, 7);

function readStorage(key) {
  const value = readStorageJSON(key, []);
  return Array.isArray(value) ? value : [];
}

function writeStorage(key, records, notify = true, change = {}) {
  writeStorageJSON(key, records, { domain: "finance", action: "replace", notify, ...change });
  return records;
}

function makeId(prefix) {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now()}-${random}`;
}

function parseDate(value) {
  return new Date(`${value}T12:00:00`);
}

function getActiveRoster(classes = loadCourseClasses()) {
  return classes.flatMap((classGroup) => (
    (classGroup.members || [])
      .filter((student) => student.status !== "Nonaktif")
      .map((student) => {
        const fee = resolveStudentFee(classGroup, student);
        return ({
        studentId: student.id,
        classId: classGroup.id,
        studentNameSnapshot: student.name,
        studentInitialsSnapshot: student.initials || student.name.split(" ").filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
        schoolSnapshot: student.school || "Belum diisi",
        classNameSnapshot: classGroup.name,
        feeCategoryIdSnapshot: fee?.id || "legacy",
        feeCategoryNameSnapshot: fee?.name || "Tarif Legacy",
        amount: fee?.amount || Number(classGroup.monthlyFee) || DEFAULT_MONTHLY_FEE,
      }); })
  ));
}

function snapshotInvoices(period, existingInvoices = []) {
  const existingStudents = new Set(
    existingInvoices
      .filter((invoice) => invoice.periodId === period.id)
      .map((invoice) => invoice.studentId),
  );

  return getActiveRoster()
    .filter((student) => !existingStudents.has(student.studentId))
    .map((student, index) => ({
        id: `invoice-${period.id}-${student.studentId}-${index}`,
        periodId: period.id,
        studentId: student.studentId,
        classId: student.classId,
        studentNameSnapshot: student.studentNameSnapshot,
        studentInitialsSnapshot: student.studentInitialsSnapshot,
        schoolSnapshot: student.schoolSnapshot,
        classNameSnapshot: student.classNameSnapshot,
        feeCategoryIdSnapshot: student.feeCategoryIdSnapshot,
        feeCategoryNameSnapshot: student.feeCategoryNameSnapshot,
        amount: student.amount,
        dueDate: period.dueDate,
        createdAt: period.generatedAt,
      }));
}

function deriveInvoice(invoice, transactions) {
  const related = transactions.filter((transaction) => transaction.invoiceId === invoice.id);
  const verifiedTotal = related
    .filter((transaction) => transaction.status === "verified")
    .reduce((total, transaction) => total + Number(transaction.amount || 0), 0);
  const pendingTotal = related
    .filter((transaction) => transaction.status === "pending")
    .reduce((total, transaction) => total + Number(transaction.amount || 0), 0);
  const outstanding = Math.max(Number(invoice.amount) - verifiedTotal, 0);
  const status = outstanding <= 0
    ? "Lunas"
    : parseDate(todayISO()) > parseDate(invoice.dueDate)
      ? "Jatuh Tempo"
      : verifiedTotal > 0
        ? "Sebagian"
        : "Belum Bayar";

  return {
    ...invoice,
    verifiedTotal,
    pendingTotal,
    outstanding,
    status,
    hasPending: pendingTotal > 0,
    transactions: related.sort((left, right) => right.paidAt.localeCompare(left.paidAt)),
  };
}

function transactionLabel(status) {
  return status === "verified" ? "Terverifikasi" : status === "rejected" ? "Ditolak" : "Menunggu Verifikasi";
}

function ensureFinanceSeed() {
  const periods = readStorage(PERIOD_STORAGE_KEY);
  if (periods.length > 0) return;

  const month = "2026-08";
  const period = {
    id: `period-${month}`,
    month,
    dueDate: `${month}-10`,
    status: "active",
    generatedAt: `${month}-01T08:00:00.000Z`,
  };
  const invoices = snapshotInvoices(period);
  const methods = ["Transfer", "Tunai"];
  const transactions = [];

  invoices.forEach((invoice, index) => {
    // Exactly three of every four August invoices are paid and verified.
    if (index % 4 !== 3) {
      const paidDay = 2 + (index % 8);
      transactions.push({
        id: `transaction-seed-full-${index}`,
        invoiceId: invoice.id,
        amount: invoice.amount,
        paidAt: `${month}-${pad(paidDay)}`,
        method: methods[index % methods.length],
        reference: index % 2 === 0 ? `TRF-${month.replace("-", "")}-${pad(index + 1)}` : "",
        note: "Pembayaran iuran bulanan.",
        status: "verified",
        createdAt: `${month}-${pad(paidDay)}T09:00:00.000Z`,
        verifiedAt: `${month}-${pad(paidDay)}T10:00:00.000Z`,
        rejectedAt: null,
        rejectionReason: "",
      });
    }
  });

  commitStorageJSON([
    { key: PERIOD_STORAGE_KEY, value: [period] },
    { key: INVOICE_STORAGE_KEY, value: invoices },
    { key: TRANSACTION_STORAGE_KEY, value: transactions },
  ], { domain: "finance", action: "seed", notify: false });
}

function getRawData() {
  ensureFinanceSeed();
  return {
    periods: readStorage(PERIOD_STORAGE_KEY),
    invoices: readStorage(INVOICE_STORAGE_KEY),
    transactions: readStorage(TRANSACTION_STORAGE_KEY),
  };
}

function paymentTotals(invoiceId, transactions) {
  return transactions.reduce((totals, transaction) => {
    if (transaction.invoiceId !== invoiceId) return totals;
    if (transaction.status === "verified") totals.verified += Number(transaction.amount || 0);
    if (transaction.status === "pending") totals.pending += Number(transaction.amount || 0);
    return totals;
  }, { verified: 0, pending: 0 });
}

function feeRepricingPreview(classes, invoices, transactions, classId = "") {
  const validationErrors = classes.flatMap((classGroup) => validateFeeConfiguration(classGroup).errors.map((message) => ({ classId: classGroup.id, className: classGroup.name, message })));
  if (validationErrors.length) return { changes: [], conflicts: validationErrors, validationErrors };
  const roster = getActiveRoster(classes);
  const rosterByStudent = new Map(roster.map((student) => [student.studentId, student]));
  const changes = [];
  const conflicts = [];

  invoices.forEach((invoice) => {
    const activeStudent = rosterByStudent.get(invoice.studentId);
    if (!activeStudent || (classId && activeStudent.classId !== classId)) return;
    const totals = paymentTotals(invoice.id, transactions);
    const isPaid = totals.verified >= Number(invoice.amount || 0);
    if (isPaid) return;
    const targetAmount = Number(activeStudent.amount);
    const committedTotal = totals.verified + totals.pending;
    if (targetAmount < committedTotal) {
      conflicts.push({
        invoiceId: invoice.id,
        studentId: invoice.studentId,
        studentName: activeStudent.studentNameSnapshot,
        className: activeStudent.classNameSnapshot,
        currentAmount: Number(invoice.amount || 0),
        targetAmount,
        verifiedTotal: totals.verified,
        pendingTotal: totals.pending,
        totalPayments: committedTotal,
        message: `${activeStudent.studentNameSnapshot}: tarif tujuan tidak boleh lebih kecil dari pembayaran terverifikasi + pending.`,
      });
      return;
    }
    const fieldsChanged = Number(invoice.amount) !== targetAmount
      || invoice.feeCategoryIdSnapshot !== activeStudent.feeCategoryIdSnapshot
      || invoice.feeCategoryNameSnapshot !== activeStudent.feeCategoryNameSnapshot;
    if (fieldsChanged) changes.push({
      invoiceId: invoice.id,
      studentId: invoice.studentId,
      studentName: activeStudent.studentNameSnapshot,
      className: activeStudent.classNameSnapshot,
      fromAmount: Number(invoice.amount || 0),
      toAmount: targetAmount,
      feeCategoryIdSnapshot: activeStudent.feeCategoryIdSnapshot,
      feeCategoryNameSnapshot: activeStudent.feeCategoryNameSnapshot,
    });
  });
  return { changes, conflicts, validationErrors: [] };
}

export function previewOutstandingInvoiceRepricing(nextClasses) {
  ensureFinanceSeed();
  const invoices = readStorage(INVOICE_STORAGE_KEY);
  const transactions = readStorage(TRANSACTION_STORAGE_KEY);
  return feeRepricingPreview(nextClasses, invoices, transactions);
}

export function synchronizeOutstandingInvoiceFees({ classId = "" } = {}) {
  ensureFinanceSeed();
  const classes = loadCourseClasses();
  const invoices = readStorage(INVOICE_STORAGE_KEY);
  const transactions = readStorage(TRANSACTION_STORAGE_KEY);
  const preview = feeRepricingPreview(classes, invoices, transactions, classId);
  if (preview.conflicts.length) {
    const error = new Error(preview.conflicts[0].message || "Sinkronisasi tarif diblokir oleh transaksi yang masih aktif.");
    error.conflicts = preview.conflicts;
    throw error;
  }
  if (!preview.changes.length) return { updated: 0, conflicts: [] };
  const changeByInvoice = new Map(preview.changes.map((change) => [change.invoiceId, change]));
  const nextInvoices = invoices.map((invoice) => {
    const change = changeByInvoice.get(invoice.id);
    return change ? {
      ...invoice,
      amount: change.toAmount,
      feeCategoryIdSnapshot: change.feeCategoryIdSnapshot,
      feeCategoryNameSnapshot: change.feeCategoryNameSnapshot,
    } : invoice;
  });
  writeStorage(INVOICE_STORAGE_KEY, nextInvoices, true, { action: "reprice-outstanding", origin: "system-reconcile", entityIds: preview.changes.map((change) => change.invoiceId) });
  return { updated: preview.changes.length, conflicts: [] };
}

export function getBillingPeriods() {
  return getRawData().periods.sort((left, right) => right.month.localeCompare(left.month));
}

export function getInvoices(filters = {}) {
  const { invoices, transactions } = getRawData();
  const query = (filters.query || "").trim().toLowerCase();
  return invoices
    .map((invoice) => deriveInvoice(invoice, transactions))
    .filter((invoice) => !filters.periodId || invoice.periodId === filters.periodId)
    .filter((invoice) => !filters.classId || invoice.classId === filters.classId)
    .filter((invoice) => !filters.status || invoice.status === filters.status)
    .filter((invoice) => !query || `${invoice.studentNameSnapshot} ${invoice.classNameSnapshot} ${invoice.schoolSnapshot}`.toLowerCase().includes(query))
    .sort((left, right) => left.studentNameSnapshot.localeCompare(right.studentNameSnapshot));
}

export function getTransactions(filters = {}) {
  const { invoices, transactions } = getRawData();
  const invoiceMap = new Map(invoices.map((invoice) => [invoice.id, invoice]));
  const query = (filters.query || "").trim().toLowerCase();
  return transactions
    .map((transaction) => {
      const invoice = invoiceMap.get(transaction.invoiceId);
      return {
        ...transaction,
        statusLabel: transactionLabel(transaction.status),
        invoice,
        studentName: invoice?.studentNameSnapshot || "Siswa tidak ditemukan",
        className: invoice?.classNameSnapshot || "-",
        periodId: invoice?.periodId,
        classId: invoice?.classId,
      };
    })
    .filter((transaction) => !filters.periodId || transaction.periodId === filters.periodId)
    .filter((transaction) => !filters.classId || transaction.classId === filters.classId)
    .filter((transaction) => !filters.status || transaction.status === filters.status)
    .filter((transaction) => !query || `${transaction.studentName} ${transaction.className} ${transaction.reference || ""}`.toLowerCase().includes(query))
    .sort((left, right) => `${right.paidAt}-${right.createdAt}`.localeCompare(`${left.paidAt}-${left.createdAt}`));
}

export function getInvoiceDetail(invoiceId) {
  const { invoices, transactions, periods } = getRawData();
  const invoice = invoices.find((item) => item.id === invoiceId);
  if (!invoice) throw new Error("Tagihan tidak ditemukan.");
  return {
    ...deriveInvoice(invoice, transactions),
    period: periods.find((period) => period.id === invoice.periodId) || null,
  };
}

export function getFinanceOverview(periodId) {
  const invoices = getInvoices({ periodId });
  const transactions = getTransactions({ periodId });
  const totalBilled = invoices.reduce((total, invoice) => total + invoice.amount, 0);
  const totalPaid = invoices.reduce((total, invoice) => total + invoice.verifiedTotal, 0);
  const outstanding = invoices.reduce((total, invoice) => total + invoice.outstanding, 0);
  const pendingTransactions = transactions.filter((transaction) => transaction.status === "pending");
  return {
    totalBilled,
    totalPaid,
    outstanding,
    pendingCount: pendingTransactions.length,
    invoiceCount: invoices.length,
    paidInvoiceCount: invoices.filter((invoice) => invoice.status === "Lunas").length,
    overdue: invoices.filter((invoice) => invoice.status === "Jatuh Tempo"),
    pendingTransactions,
  };
}

export function createBillingPeriod({ month, dueDate }) {
  if (!/^\d{4}-\d{2}$/.test(month || "")) throw new Error("Bulan periode wajib dipilih.");
  if (!dueDate || !dueDate.startsWith(month)) throw new Error("Tanggal jatuh tempo harus berada pada periode yang dipilih.");
  const data = getRawData();
  if (data.periods.some((period) => period.month === month)) throw new Error("Periode tersebut sudah pernah dibuat.");
  const period = { id: `period-${month}`, month, dueDate, status: "active", generatedAt: new Date().toISOString() };
  const additions = snapshotInvoices(period, data.invoices);
  commitStorageJSON([
    { key: PERIOD_STORAGE_KEY, value: [...data.periods, period] },
    { key: INVOICE_STORAGE_KEY, value: [...data.invoices, ...additions] },
  ], { domain: "finance", action: "create-period", entityIds: [period.id] });
  return { period, added: additions.length };
}

export function syncBillingPeriod(periodId, options = {}) {
  const data = getRawData();
  const period = data.periods.find((item) => item.id === periodId);
  if (!period) throw new Error("Periode tagihan tidak ditemukan.");
  const reconcileMembership = options.reconcileMembership !== false;
  const classes = loadCourseClasses();
  const roster = getActiveRoster(classes);
  const rosterByStudent = new Map(roster.map((student) => [student.studentId, student]));
  const feePreview = feeRepricingPreview(classes, data.invoices.filter((invoice) => invoice.periodId === period.id), data.transactions);
  if (feePreview.conflicts.length) {
    return { period, added: 0, updated: 0, removed: 0, retained: 0, conflicts: feePreview.conflicts };
  }
  const feeChanges = new Map(feePreview.changes.map((change) => [change.invoiceId, change]));
  const invoiceIdsWithTransactions = new Set(data.transactions.map((transaction) => transaction.invoiceId));
  const synchronizedFields = [
    "studentNameSnapshot",
    "studentInitialsSnapshot",
    "schoolSnapshot",
    "classId",
    "classNameSnapshot",
    "feeCategoryIdSnapshot",
    "feeCategoryNameSnapshot",
    "amount",
  ];
  let updated = 0;
  let removed = 0;
  let retained = 0;

  const reconciledInvoices = data.invoices.flatMap((invoice) => {
    if (invoice.periodId !== period.id) return [invoice];
    const activeStudent = rosterByStudent.get(invoice.studentId);
    if (activeStudent) {
      const { rosterStatus, ...currentInvoice } = invoice;
      const feeChange = feeChanges.get(invoice.id);
      const totals = paymentTotals(invoice.id, data.transactions);
      const paidBeforeSync = totals.verified >= Number(invoice.amount || 0);
      const nextInvoice = {
        ...currentInvoice,
        studentNameSnapshot: activeStudent.studentNameSnapshot,
        studentInitialsSnapshot: activeStudent.studentInitialsSnapshot,
        schoolSnapshot: activeStudent.schoolSnapshot,
        classId: activeStudent.classId,
        classNameSnapshot: activeStudent.classNameSnapshot,
        feeCategoryIdSnapshot: feeChange?.feeCategoryIdSnapshot || invoice.feeCategoryIdSnapshot || (paidBeforeSync ? "legacy" : activeStudent.feeCategoryIdSnapshot),
        feeCategoryNameSnapshot: feeChange?.feeCategoryNameSnapshot || invoice.feeCategoryNameSnapshot || (paidBeforeSync ? "Tarif Legacy" : activeStudent.feeCategoryNameSnapshot),
        amount: feeChange?.toAmount ?? invoice.amount,
      };
      if (rosterStatus || synchronizedFields.some((field) => invoice[field] !== nextInvoice[field])) updated += 1;
      return [nextInvoice];
    }
    if (!reconcileMembership) return [invoice];
    if (invoiceIdsWithTransactions.has(invoice.id)) {
      retained += 1;
      return [{ ...invoice, rosterStatus: "removed" }];
    }
    removed += 1;
    return [];
  });

  const additions = reconcileMembership ? snapshotInvoices(period, reconciledInvoices) : [];
  if (additions.length > 0 || updated > 0 || removed > 0 || retained > 0) {
    writeStorage(INVOICE_STORAGE_KEY, [...reconciledInvoices, ...additions], true, { action: "reconcile", origin: options.origin || "user" });
  }
  return { period, added: additions.length, updated, removed, retained, conflicts: [] };
}

export function synchronizeFinanceWithRoster() {
  const periods = getBillingPeriods();
  const latestMonth = periods[0]?.month || "";
  const results = periods.map((period) => syncBillingPeriod(period.id, {
    reconcileMembership: period.month === latestMonth,
    origin: "system-reconcile",
  }));
  return results.reduce((summary, result) => ({
    periods: summary.periods + 1,
    added: summary.added + result.added,
    updated: summary.updated + result.updated,
    removed: summary.removed + result.removed,
    retained: summary.retained + result.retained,
    conflicts: [...summary.conflicts, ...(result.conflicts || [])],
  }), { periods: 0, added: 0, updated: 0, removed: 0, retained: 0, conflicts: [] });
}

export function recordPayment(invoiceId, payload) {
  const detail = getInvoiceDetail(invoiceId);
  const amount = Number(payload.amount);
  if (!amount || amount <= 0) throw new Error("Nominal pembayaran harus lebih dari nol.");
  if (amount > detail.outstanding) throw new Error("Nominal melebihi sisa tagihan.");
  if (!payload.paidAt) throw new Error("Tanggal pembayaran wajib diisi.");
  if (!payload.method) throw new Error("Metode pembayaran wajib dipilih.");

  const transaction = {
    id: makeId("transaction"),
    invoiceId,
    amount,
    paidAt: payload.paidAt,
    method: payload.method,
    reference: (payload.reference || "").trim(),
    note: (payload.note || "").trim(),
    status: "pending",
    createdAt: new Date().toISOString(),
    verifiedAt: null,
    rejectedAt: null,
    rejectionReason: "",
  };
  const transactions = readStorage(TRANSACTION_STORAGE_KEY);
  writeStorage(TRANSACTION_STORAGE_KEY, [...transactions, transaction]);
  return transaction;
}

export function verifyPayment(transactionId) {
  const data = getRawData();
  const target = data.transactions.find((transaction) => transaction.id === transactionId);
  if (!target) throw new Error("Transaksi tidak ditemukan.");
  if (target.status !== "pending") throw new Error("Transaksi ini sudah diproses.");
  const invoice = data.invoices.find((item) => item.id === target.invoiceId);
  if (!invoice) throw new Error("Tagihan transaksi tidak ditemukan.");
  const verifiedTotal = data.transactions
    .filter((transaction) => transaction.invoiceId === invoice.id && transaction.status === "verified")
    .reduce((total, transaction) => total + Number(transaction.amount || 0), 0);
  if (verifiedTotal + Number(target.amount) > Number(invoice.amount)) throw new Error("Verifikasi ditolak karena total pembayaran melebihi tagihan.");

  const next = data.transactions.map((transaction) => transaction.id === transactionId
    ? { ...transaction, status: "verified", verifiedAt: new Date().toISOString(), rejectedAt: null, rejectionReason: "" }
    : transaction);
  writeStorage(TRANSACTION_STORAGE_KEY, next);
  return next.find((transaction) => transaction.id === transactionId);
}

export function rejectPayment(transactionId, reason) {
  if (!(reason || "").trim()) throw new Error("Alasan penolakan wajib diisi.");
  const data = getRawData();
  const target = data.transactions.find((transaction) => transaction.id === transactionId);
  if (!target) throw new Error("Transaksi tidak ditemukan.");
  if (target.status !== "pending") throw new Error("Transaksi ini sudah diproses.");
  const next = data.transactions.map((transaction) => transaction.id === transactionId
    ? { ...transaction, status: "rejected", rejectedAt: new Date().toISOString(), verifiedAt: null, rejectionReason: reason.trim() }
    : transaction);
  writeStorage(TRANSACTION_STORAGE_KEY, next);
  return next.find((transaction) => transaction.id === transactionId);
}

export function getStudentFinanceSummary(studentId, month) {
  const period = getBillingPeriods().find((item) => item.month === month);
  const classGroup = loadCourseClasses().find((item) => item.members?.some((student) => student.id === studentId));
  const student = classGroup?.members?.find((item) => item.id === studentId);
  const fee = classGroup && student ? resolveStudentFee(classGroup, student) : null;
  if (!period) {
    return {
      status: "Belum Ditagih",
      feeCategoryId: fee?.id || null,
      feeCategoryName: fee?.name || "Tarif belum ditentukan",
      amount: fee?.amount || classGroup?.monthlyFee || DEFAULT_MONTHLY_FEE,
      paidAmount: 0,
      paidAt: null,
      method: null,
      note: "Periode tagihan bulan ini belum dibuat.",
    };
  }
  const invoice = getInvoices({ periodId: period.id }).find((item) => item.studentId === studentId);
  if (!invoice) {
    return {
      status: "Belum Ditagih",
      feeCategoryId: fee?.id || null,
      feeCategoryName: fee?.name || "Tarif belum ditentukan",
      amount: fee?.amount || classGroup?.monthlyFee || DEFAULT_MONTHLY_FEE,
      paidAmount: 0,
      paidAt: null,
      method: null,
      note: "Siswa belum disinkronkan ke periode tagihan ini.",
    };
  }
  const latestVerified = invoice.transactions.find((transaction) => transaction.status === "verified");
  return {
    status: invoice.status,
    invoiceStatus: invoice.status,
    feeCategoryId: invoice.feeCategoryIdSnapshot || fee?.id || null,
    feeCategoryName: invoice.feeCategoryNameSnapshot || fee?.name || "Tarif Legacy",
    amount: invoice.amount,
    paidAmount: invoice.verifiedTotal,
    paidAt: latestVerified?.paidAt || null,
    method: latestVerified?.method || null,
    note: invoice.status === "Lunas"
      ? "Iuran bulan ini sudah terverifikasi."
      : invoice.hasPending
        ? "Ada pembayaran yang menunggu verifikasi admin."
        : invoice.status === "Sebagian"
          ? "Pembayaran belum lunas."
          : "Belum ada pembayaran terverifikasi.",
  };
}

export function getFinanceNotifications() {
  const currentMonth = getCurrentMonth();
  const period = getBillingPeriods().find((item) => item.month === currentMonth);
  if (!period) return { overdueCount: 0, pendingCount: 0, total: 0 };
  const overview = getFinanceOverview(period.id);
  return {
    overdueCount: overview.overdue.length,
    pendingCount: overview.pendingCount,
    total: overview.overdue.length + overview.pendingCount,
  };
}
