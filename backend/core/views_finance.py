import json
from datetime import datetime, date
from decimal import Decimal
from django.core.exceptions import ValidationError
from django.db import models, transaction
from django.db.models import Q, Sum
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt

from .models import (
    AuditLog,
    BillingPeriod,
    ClassGroup,
    Enrollment,
    FeePlan,
    Payment,
    PaymentTransaction,
    Student,
)
from .views_academics import api_error, api_success


def _parse_payload(request):
    if request.content_type and "multipart/form-data" in request.content_type:
        return request.POST.dict()
    if request.body:
        try:
            return json.loads(request.body.decode("utf-8"))
        except Exception:
            pass
    return request.POST.dict() if request.POST else {}


def serialize_billing_period(bp: BillingPeriod) -> dict:
    count = Payment.objects.filter(period=bp.month).count()
    return {
        "id": bp.period_id,
        "month": bp.month.strftime("%Y-%m-%d"),
        "due_date": bp.due_date.strftime("%Y-%m-%d"),
        "status": bp.status,
        "generated_at": bp.generated_at.isoformat(),
        "invoice_count": count,
    }


def serialize_payment_transaction(tx: PaymentTransaction) -> dict:
    rec_name = (
        tx.recorded_by.get_full_name() or tx.recorded_by.username
        if tx.recorded_by
        else "Admin"
    )
    rev_name = (
        tx.reviewed_by.get_full_name() or tx.reviewed_by.username
        if tx.reviewed_by
        else None
    )
    proof_url = tx.proof_file.url if tx.proof_file else None
    return {
        "id": str(tx.id),
        "invoice": str(tx.payment_id),
        "amount_rupiah": float(tx.amount_rupiah),
        "paid_on": tx.paid_on.isoformat() if tx.paid_on else "",
        "method": tx.method or "Transfer",
        "reference": tx.reference or f"REF-{tx.id:04d}",
        "note": tx.note or "",
        "status": tx.status,
        "recorded_by_name": rec_name,
        "reviewed_by_name": rev_name,
        "verified_at": tx.verified_at.isoformat() if tx.verified_at else None,
        "rejected_at": tx.rejected_at.isoformat() if tx.rejected_at else None,
        "rejection_reason": tx.rejection_reason or "",
        "voided_at": tx.voided_at.isoformat() if tx.voided_at else None,
        "void_reason": tx.void_reason or "",
        "version": tx.version,
        "proof_url": proof_url,
        "created_at": tx.created_at.isoformat(),
    }


def serialize_invoice(p: Payment, reporting_date=None) -> dict:
    st = p.student
    enr = (
        Enrollment.objects.filter(student=st, is_active=True)
        .select_related("class_group", "fee_plan")
        .first()
    )
    cg_id = str(enr.class_group.id) if enr else "1"
    cg_name = enr.class_group.name if enr else "Kelas Reguler"
    fp_id = (
        str(p.fee_plan.id)
        if p.fee_plan
        else (str(enr.fee_plan.id) if enr and enr.fee_plan else "1")
    )
    fp_name = (
        p.fee_plan.name
        if p.fee_plan
        else (enr.fee_plan.name if enr and enr.fee_plan else "Reguler")
    )

    txs = list(p.transactions.all().order_by("-created_at"))
    verified_sum = sum(
        (t.amount_rupiah for t in txs if t.status == "VERIFIED"),
        Decimal("0"),
    )
    pending_sum = sum(
        (t.amount_rupiah for t in txs if t.status == "PENDING"),
        Decimal("0"),
    )

    if not txs and p.amount_paid > 0:
        verified_sum = p.amount_paid

    due = p.amount_due
    outstanding = max(Decimal("0"), due - verified_sum)
    due_date = p.due_date or p.period.replace(day=10)

    ref_date = reporting_date or timezone.localdate()
    if verified_sum >= due and due > 0:
        inv_status = "PAID"
    elif verified_sum > 0:
        inv_status = "PARTIAL"
    else:
        if ref_date > due_date:
            inv_status = "OVERDUE"
        else:
            inv_status = "UNPAID"

    return {
        "id": str(p.id),
        "period": p.period.strftime("%Y-%m"),
        "student": str(st.id),
        "student_name_snapshot": st.full_name,
        "student_code_snapshot": st.student_id,
        "class_group_id_snapshot": cg_id,
        "class_group_name_snapshot": cg_name,
        "fee_plan_id_snapshot": fp_id,
        "fee_plan_name_snapshot": fp_name,
        "amount_due_rupiah": float(due),
        "verified_total_rupiah": float(verified_sum),
        "pending_total_rupiah": float(pending_sum),
        "outstanding_rupiah": float(outstanding),
        "due_date": due_date.isoformat(),
        "status": inv_status,
        "transactions": [serialize_payment_transaction(t) for t in txs],
        "created_at": p.created_at.isoformat(),
    }


# ------------------------------------------------------------------------------
# Billing Periods Endpoints
# ------------------------------------------------------------------------------
@csrf_exempt
def v1_billing_periods(request):
    if request.method == "GET":
        bps = BillingPeriod.objects.all().order_by("-month")
        # Ensure at least current month's period exists
        today = timezone.localdate()
        cur_id = today.strftime("%Y-%m")
        if not bps.filter(period_id=cur_id).exists():
            BillingPeriod.objects.get_or_create(
                period_id=cur_id,
                defaults={
                    "month": today.replace(day=1),
                    "due_date": today.replace(day=10),
                    "status": "ACTIVE",
                },
            )
            bps = BillingPeriod.objects.all().order_by("-month")

        results = [serialize_billing_period(bp) for bp in bps]
        return api_success(results, meta={"total": len(results)})

    elif request.method == "POST":
        if request.user.is_authenticated and not request.user.is_admin_role():
            return api_error("Hanya admin yang dapat membuat periode tagihan.", code="FORBIDDEN", status=403)

        body = _parse_payload(request)
        month_str = body.get("month", "")
        if not month_str:
            return api_error("month wajib diisi.", code="VALIDATION_ERROR", fields={"month": ["Wajib diisi"]})

        try:
            m_date = datetime.strptime(month_str[:7], "%Y-%m").date().replace(day=1)
        except Exception:
            return api_error("Format month tidak valid (harus YYYY-MM atau YYYY-MM-DD).", code="VALIDATION_ERROR")

        period_id = m_date.strftime("%Y-%m")

        due_date_str = body.get("due_date", "")
        if due_date_str:
            try:
                due_date = datetime.strptime(due_date_str[:10], "%Y-%m-%d").date()
            except Exception:
                due_date = m_date.replace(day=10)
        else:
            due_date = m_date.replace(day=10)

        if BillingPeriod.objects.filter(period_id=period_id).exists():
            return api_error(f"Periode tagihan '{period_id}' sudah ada.", code="DUPLICATE_PERIOD", status=400)

        bp = BillingPeriod.objects.create(
            period_id=period_id,
            month=m_date,
            due_date=due_date,
            status="ACTIVE",
        )
        return api_success(serialize_billing_period(bp), status=201)

    return api_error("Metode tidak diizinkan.", code="METHOD_NOT_ALLOWED", status=405)


@csrf_exempt
def v1_billing_period_synchronize(request, period_id):
    if request.method != "POST":
        return api_error("Metode tidak diizinkan.", code="METHOD_NOT_ALLOWED", status=405)

    if request.user.is_authenticated and not request.user.is_admin_role():
        return api_error("Hanya admin yang dapat mensinkronkan periode.", code="FORBIDDEN", status=403)

    bp = BillingPeriod.objects.filter(period_id=period_id).first()
    if not bp:
        try:
            m_date = datetime.strptime(period_id[:7], "%Y-%m").date().replace(day=1)
            bp, _ = BillingPeriod.objects.get_or_create(
                period_id=period_id,
                defaults={"month": m_date, "due_date": m_date.replace(day=10), "status": "ACTIVE"},
            )
        except Exception:
            return api_error(f"Periode '{period_id}' tidak ditemukan.", code="NOT_FOUND", status=404)

    if bp.status == "CLOSED":
        return api_error("Periode tagihan sudah ditutup, tidak dapat disinkronkan.", code="PERIOD_CLOSED", status=400)

    created_count = 0
    updated_count = 0

    with transaction.atomic():
        # Active enrollments
        active_enrollments = (
            Enrollment.objects.filter(is_active=True)
            .select_related("student", "class_group", "fee_plan")
            .order_by("student_id")
        )

        # Map students to their active enrollment(s)
        student_map = {}
        for enr in active_enrollments:
            st = enr.student
            if st.id not in student_map:
                student_map[st.id] = enr

        for st_id, enr in student_map.items():
            st = enr.student
            fp = enr.fee_plan
            plan_amount = fp.monthly_amount_rupiah if fp else Decimal("650000.00")

            existing_payment = Payment.objects.filter(student=st, period=bp.month).first()
            if not existing_payment:
                Payment.objects.create(
                    student=st,
                    period=bp.month,
                    amount_due=plan_amount,
                    amount_paid=Decimal("0.00"),
                    due_date=bp.due_date,
                    fee_plan=fp,
                    status=Payment.Status.PENDING,
                )
                created_count += 1
            else:
                # If existing payment is unpaid and has no transactions, update amount if fee plan changed
                if existing_payment.amount_paid == 0 and not existing_payment.transactions.exists():
                    if existing_payment.amount_due != plan_amount or existing_payment.fee_plan != fp:
                        existing_payment.amount_due = plan_amount
                        existing_payment.fee_plan = fp
                        existing_payment.due_date = bp.due_date
                        existing_payment.save(update_fields=["amount_due", "fee_plan", "due_date"])
                        updated_count += 1

    return api_success({"created_count": created_count, "updated_count": updated_count})


@csrf_exempt
def v1_billing_period_close(request, period_id):
    if request.method != "POST":
        return api_error("Metode tidak diizinkan.", code="METHOD_NOT_ALLOWED", status=405)

    if request.user.is_authenticated and not request.user.is_admin_role():
        return api_error("Hanya admin yang dapat menutup periode tagihan.", code="FORBIDDEN", status=403)

    bp = get_object_or_404(BillingPeriod, period_id=period_id)
    bp.status = "CLOSED"
    bp.save(update_fields=["status"])
    return api_success(serialize_billing_period(bp))


# ------------------------------------------------------------------------------
# Invoices Endpoints
# ------------------------------------------------------------------------------
def v1_invoices(request):
    qs = Payment.objects.select_related("student", "fee_plan").prefetch_related("transactions").all()

    period_param = request.GET.get("period")
    if period_param:
        bp = BillingPeriod.objects.filter(
            Q(period_id=period_param) | Q(id=int(period_param) if str(period_param).isdigit() else -1)
        ).first()
        if bp:
            qs = qs.filter(period=bp.month)
        else:
            try:
                m_date = datetime.strptime(period_param[:7], "%Y-%m").date().replace(day=1)
                qs = qs.filter(period=m_date)
            except Exception:
                qs = qs.none()

    rep_date_param = request.GET.get("reporting_date")
    rep_date = None
    if rep_date_param:
        try:
            rep_date = datetime.strptime(rep_date_param[:10], "%Y-%m-%d").date()
        except Exception:
            pass

    results = [serialize_invoice(p, reporting_date=rep_date) for p in qs]
    return api_success(results, meta={"total": len(results)})


def v1_invoice_detail(request, invoice_id):
    p = get_object_or_404(Payment.objects.select_related("student", "fee_plan").prefetch_related("transactions"), pk=invoice_id)
    return api_success(serialize_invoice(p))


@csrf_exempt
def v1_invoice_reprice(request, invoice_id):
    if request.method != "POST":
        return api_error("Metode tidak diizinkan.", code="METHOD_NOT_ALLOWED", status=405)

    if request.user.is_authenticated and not request.user.is_admin_role():
        return api_error("Hanya admin yang dapat menghitung ulang tagihan.", code="FORBIDDEN", status=403)

    p = get_object_or_404(Payment, pk=invoice_id)

    # Check if period is closed
    period_id = p.period.strftime("%Y-%m")
    bp = BillingPeriod.objects.filter(period_id=period_id).first()
    if bp and bp.status == "CLOSED":
        return api_error("Periode tagihan untuk invoice ini sudah ditutup.", code="PERIOD_CLOSED", status=400)

    body = _parse_payload(request)
    raw_amount = body.get("amount_rupiah")
    if raw_amount is None:
        return api_error("amount_rupiah wajib diisi.", code="VALIDATION_ERROR", fields={"amount_rupiah": ["Wajib diisi"]})

    try:
        new_amount = Decimal(str(raw_amount))
    except Exception:
        return api_error("Format nominal tidak valid.", code="VALIDATION_ERROR")

    if new_amount <= 0:
        return api_error("Nominal tagihan harus lebih besar dari 0.", code="VALIDATION_ERROR")

    with transaction.atomic():
        p = Payment.objects.select_for_update().get(pk=invoice_id)
        old_due = p.amount_due
        p.amount_due = new_amount

        fee_plan_id = body.get("fee_plan")
        if fee_plan_id:
            fp = FeePlan.objects.filter(pk=fee_plan_id).first()
            if fp:
                p.fee_plan = fp

        reason = body.get("reason", "").strip()
        if reason:
            p.notes = f"{p.notes}\n[Reprice] {reason}".strip()

        # Recalculate status based on current verified transactions
        txs = p.transactions.all()
        verified_sum = sum((t.amount_rupiah for t in txs if t.status == "VERIFIED"), Decimal("0"))
        if not txs and p.amount_paid > 0:
            verified_sum = p.amount_paid

        if verified_sum >= new_amount:
            p.status = Payment.Status.PAID
        elif verified_sum > 0:
            p.status = Payment.Status.PARTIAL
        else:
            p.status = Payment.Status.PENDING

        p.save()

        AuditLog.objects.create(
            actor=request.user if request.user.is_authenticated else None,
            action="REPRICE_INVOICE",
            target_type="INVOICE",
            target_id=str(p.id),
            old_value={"amount_due": float(old_due)},
            new_value={"amount_due": float(new_amount), "reason": reason},
        )

    return api_success(serialize_invoice(p))


# ------------------------------------------------------------------------------
# Payment Transactions Endpoints
# ------------------------------------------------------------------------------
@csrf_exempt
def v1_payment_transactions(request):
    if request.method == "GET":
        qs = PaymentTransaction.objects.select_related("payment__student", "recorded_by", "reviewed_by").all()
        invoice_param = request.GET.get("invoice")
        if invoice_param:
            try:
                qs = qs.filter(payment_id=invoice_param)
            except Exception:
                qs = qs.none()

        period_param = request.GET.get("period")
        if period_param:
            bp = BillingPeriod.objects.filter(
                Q(period_id=period_param) | Q(id=int(period_param) if str(period_param).isdigit() else -1)
            ).first()
            if bp:
                qs = qs.filter(payment__period=bp.month)
            else:
                try:
                    m_date = datetime.strptime(period_param[:7], "%Y-%m").date().replace(day=1)
                    qs = qs.filter(payment__period=m_date)
                except Exception:
                    pass

        ordering = request.GET.get("ordering", "-created_at")
        if ordering in ("-created_at", "created_at", "-paid_on", "paid_on"):
            qs = qs.order_by(ordering)

        results = [serialize_payment_transaction(t) for t in qs]
        return api_success(results, meta={"total": len(results)})

    elif request.method == "POST":
        body = _parse_payload(request)
        invoice_id = body.get("invoice") or body.get("invoiceId") or body.get("invoice_id")
        if not invoice_id:
            return api_error("invoice wajib diisi.", code="VALIDATION_ERROR", fields={"invoice": ["Wajib diisi"]})

        invoice = Payment.objects.filter(pk=invoice_id).first()
        if not invoice:
            return api_error(f"Invoice '{invoice_id}' tidak ditemukan.", code="NOT_FOUND", status=404)

        # Check if period is closed
        period_id = invoice.period.strftime("%Y-%m")
        bp = BillingPeriod.objects.filter(period_id=period_id).first()
        if bp and bp.status == "CLOSED":
            return api_error("Periode tagihan untuk invoice ini sudah ditutup.", code="PERIOD_CLOSED", status=400)

        raw_amount = body.get("amount_rupiah") or body.get("amount")
        if raw_amount is None:
            return api_error("amount_rupiah wajib diisi.", code="VALIDATION_ERROR", fields={"amount_rupiah": ["Wajib diisi"]})

        try:
            amount = Decimal(str(raw_amount))
        except Exception:
            return api_error("Format nominal tidak valid.", code="VALIDATION_ERROR")

        if amount <= 0:
            return api_error("Nominal pembayaran harus lebih besar dari 0.", code="VALIDATION_ERROR", fields={"amount_rupiah": ["Harus bernilai positif"]})

        paid_on_str = body.get("paid_on") or body.get("paidOn")
        if paid_on_str:
            try:
                paid_on = datetime.strptime(paid_on_str[:10], "%Y-%m-%d").date()
            except Exception:
                paid_on = timezone.localdate()
        else:
            paid_on = timezone.localdate()

        method = body.get("method") or "Transfer"
        reference = (body.get("reference") or "").strip()
        note = (body.get("note") or "").strip()

        proof_file = request.FILES.get("proof_file") or request.FILES.get("proof")

        with transaction.atomic():
            tx = PaymentTransaction.objects.create(
                payment=invoice,
                amount_rupiah=amount,
                paid_on=paid_on,
                method=method,
                reference=reference,
                note=note,
                status="PENDING",
                recorded_by=request.user if request.user.is_authenticated else None,
                version=1,
            )
            if proof_file:
                tx.proof_file = proof_file
                tx.save(update_fields=["proof_file"])

            AuditLog.objects.create(
                actor=request.user if request.user.is_authenticated else None,
                action="RECORD_PAYMENT",
                target_type="PAYMENT_TRANSACTION",
                target_id=str(tx.id),
                new_value={"amount": float(amount), "invoice": str(invoice.id)},
            )

        return api_success(serialize_payment_transaction(tx), status=201)

    return api_error("Metode tidak diizinkan.", code="METHOD_NOT_ALLOWED", status=405)


def v1_payment_transaction_detail(request, transaction_id):
    tx = get_object_or_404(PaymentTransaction.objects.select_related("payment__student", "recorded_by", "reviewed_by"), pk=transaction_id)
    return api_success(serialize_payment_transaction(tx))


@csrf_exempt
def v1_payment_transaction_verify(request, transaction_id):
    if request.method != "POST":
        return api_error("Metode tidak diizinkan.", code="METHOD_NOT_ALLOWED", status=405)

    if request.user.is_authenticated and not request.user.is_admin_role():
        return api_error("Hanya admin yang dapat memverifikasi pembayaran.", code="FORBIDDEN", status=403)

    body = _parse_payload(request)
    expected_version = body.get("expected_version")

    with transaction.atomic():
        tx = PaymentTransaction.objects.select_for_update().filter(pk=transaction_id).first()
        if not tx:
            return api_error(f"Transaksi '{transaction_id}' tidak ditemukan.", code="NOT_FOUND", status=404)

        if tx.status == "VERIFIED":
            return api_error("Transaksi ini sudah berstatus VERIFIED sebelumnya.", code="ALREADY_VERIFIED", status=400)

        if tx.status in ("REJECTED", "VOID"):
            return api_error(f"Transaksi berstatus {tx.status} tidak dapat diverifikasi.", code="INVALID_STATUS_TRANSITION", status=400)

        if expected_version is not None and int(expected_version) != tx.version:
            return api_error("Versi data tidak cocok (konflik konkurensi).", code="VERSION_CONFLICT", status=409)

        tx.status = "VERIFIED"
        tx.verified_at = timezone.now()
        tx.reviewed_by = request.user if request.user.is_authenticated else None
        tx.version += 1
        tx.save()

        # Update invoice total and status
        invoice = Payment.objects.select_for_update().get(pk=tx.payment_id)
        verified_sum = invoice.transactions.filter(status="VERIFIED").aggregate(total=Sum("amount_rupiah"))["total"] or Decimal("0")
        invoice.amount_paid = verified_sum
        invoice.paid_at = tx.paid_on

        if invoice.amount_paid >= invoice.amount_due:
            invoice.status = Payment.Status.PAID
        elif invoice.amount_paid > 0:
            invoice.status = Payment.Status.PARTIAL
        else:
            invoice.status = Payment.Status.PENDING

        invoice.save()

        AuditLog.objects.create(
            actor=request.user if request.user.is_authenticated else None,
            action="VERIFY_PAYMENT",
            target_type="PAYMENT_TRANSACTION",
            target_id=str(tx.id),
            new_value={"status": "VERIFIED", "invoice_paid": float(invoice.amount_paid)},
        )

    return api_success(serialize_payment_transaction(tx))


@csrf_exempt
def v1_payment_transaction_review_action(request, transaction_id, action):
    if request.method != "POST":
        return api_error("Metode tidak diizinkan.", code="METHOD_NOT_ALLOWED", status=405)

    if request.user.is_authenticated and not request.user.is_admin_role():
        return api_error(f"Hanya admin yang dapat melakukan aksi {action} pembayaran.", code="FORBIDDEN", status=403)

    action_norm = action.lower()
    if action_norm not in ("reject", "void"):
        return api_error(f"Aksi '{action}' tidak dikenal.", code="VALIDATION_ERROR", status=400)

    body = _parse_payload(request)
    expected_version = body.get("expected_version")
    reason = (body.get("reason") or "").strip()

    with transaction.atomic():
        tx = PaymentTransaction.objects.select_for_update().filter(pk=transaction_id).first()
        if not tx:
            return api_error(f"Transaksi '{transaction_id}' tidak ditemukan.", code="NOT_FOUND", status=404)

        if expected_version is not None and int(expected_version) != tx.version:
            return api_error("Versi data tidak cocok (konflik konkurensi).", code="VERSION_CONFLICT", status=409)

        if action_norm == "reject":
            if tx.status != "PENDING":
                return api_error(f"Hanya transaksi berstatus PENDING yang dapat ditolak (status saat ini: {tx.status}).", code="INVALID_STATUS_TRANSITION", status=400)

            tx.status = "REJECTED"
            tx.rejected_at = timezone.now()
            tx.rejection_reason = reason or "Ditolak oleh admin"
            tx.reviewed_by = request.user if request.user.is_authenticated else None
            tx.version += 1
            tx.save()

            AuditLog.objects.create(
                actor=request.user if request.user.is_authenticated else None,
                action="REJECT_PAYMENT",
                target_type="PAYMENT_TRANSACTION",
                target_id=str(tx.id),
                new_value={"status": "REJECTED", "reason": reason},
            )

        elif action_norm == "void":
            if tx.status == "VOID":
                return api_error("Transaksi ini sudah di-void sebelumnya.", code="ALREADY_VOID", status=400)

            if tx.status == "REJECTED":
                return api_error("Transaksi yang sudah ditolak tidak dapat di-void.", code="INVALID_STATUS_TRANSITION", status=400)

            was_verified = (tx.status == "VERIFIED")

            tx.status = "VOID"
            tx.voided_at = timezone.now()
            tx.void_reason = reason or "Dibatalkan oleh admin"
            tx.reviewed_by = request.user if request.user.is_authenticated else None
            tx.version += 1
            tx.save()

            if was_verified:
                invoice = Payment.objects.select_for_update().get(pk=tx.payment_id)
                verified_sum = invoice.transactions.filter(status="VERIFIED").aggregate(total=Sum("amount_rupiah"))["total"] or Decimal("0")
                invoice.amount_paid = verified_sum

                if invoice.amount_paid >= invoice.amount_due:
                    invoice.status = Payment.Status.PAID
                elif invoice.amount_paid > 0:
                    invoice.status = Payment.Status.PARTIAL
                else:
                    invoice.status = Payment.Status.PENDING

                invoice.save()

            AuditLog.objects.create(
                actor=request.user if request.user.is_authenticated else None,
                action="VOID_PAYMENT",
                target_type="PAYMENT_TRANSACTION",
                target_id=str(tx.id),
                new_value={"status": "VOID", "reason": reason},
            )

    return api_success(serialize_payment_transaction(tx))
