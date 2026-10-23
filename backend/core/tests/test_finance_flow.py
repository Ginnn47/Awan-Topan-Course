import json
from datetime import date
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from django.urls import reverse

from core.models import (
    AuditLog,
    BillingPeriod,
    ClassGroup,
    Enrollment,
    FeePlan,
    Payment,
    PaymentTransaction,
    Student,
    Subject,
    TeacherProfile,
)

User = get_user_model()


class FinanceFlowTestCase(TestCase):
    def setUp(self):
        self.client = Client()
        self.admin_user = User.objects.create_user(
            username="admin_fin",
            email="admin_fin@example.com",
            password="password123",
            role=User.Role.ADMIN,
        )
        self.teacher_user = User.objects.create_user(
            username="guru_fin",
            email="guru_fin@example.com",
            password="password123",
            role=User.Role.TEACHER,
        )
        self.teacher = TeacherProfile.objects.create(
            user=self.teacher_user,
            specialization="Akuntansi",
        )
        self.subject = Subject.objects.create(name="Ekonomi")
        self.class_group = ClassGroup.objects.create(
            name="12-IPS",
            subject=self.subject,
            teacher=self.teacher,
            room="Ruang 203",
        )
        self.fee_plan = FeePlan.objects.create(
            class_group=self.class_group,
            name="Reguler 12",
            monthly_amount_rupiah=Decimal("650000.00"),
        )
        self.student = Student.objects.create(
            student_id="STD-FIN-001",
            full_name="Fajar Ramadhan",
            grade="12",
            school="SMA 1",
        )
        self.enrollment = Enrollment.objects.create(
            student=self.student,
            class_group=self.class_group,
            fee_plan=self.fee_plan,
        )
        self.billing_period = BillingPeriod.objects.create(
            period_id="2026-10",
            month=date(2026, 10, 1),
            due_date=date(2026, 10, 10),
            status="ACTIVE",
        )
        self.invoice = Payment.objects.create(
            student=self.student,
            period=date(2026, 10, 1),
            amount_due=Decimal("650000.00"),
            amount_paid=Decimal("0.00"),
            due_date=date(2026, 10, 10),
            fee_plan=self.fee_plan,
            status=Payment.Status.PENDING,
        )

    # 1. Pencatatan transaksi dengan data valid
    def test_01_record_payment_valid_data(self):
        payload = {
            "invoice": self.invoice.id,
            "amount_rupiah": 300000,
            "paid_on": "2026-10-05",
            "method": "Transfer BCA",
            "reference": "TRX-001",
            "note": "Cicilan 1",
        }
        response = self.client.post(
            reverse("v1-payment-transactions"),
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertEqual(data["data"]["status"], "PENDING")
        self.assertEqual(data["data"]["amount_rupiah"], 300000.0)
        self.assertEqual(data["data"]["reference"], "TRX-001")
        # Ensure invoice is NOT yet updated before verification
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.amount_paid, Decimal("0.00"))
        self.assertEqual(self.invoice.status, Payment.Status.PENDING)

    # 2. Penolakan nominal tidak valid dan invoice tidak ditemukan
    def test_02_record_payment_invalid_amount_and_invoice_not_found(self):
        # Zero amount
        res_zero = self.client.post(
            reverse("v1-payment-transactions"),
            data=json.dumps({"invoice": self.invoice.id, "amount_rupiah": 0}),
            content_type="application/json",
        )
        self.assertEqual(res_zero.status_code, 400)

        # Negative amount
        res_neg = self.client.post(
            reverse("v1-payment-transactions"),
            data=json.dumps({"invoice": self.invoice.id, "amount_rupiah": -50000}),
            content_type="application/json",
        )
        self.assertEqual(res_neg.status_code, 400)

        # Invoice not found
        res_404 = self.client.post(
            reverse("v1-payment-transactions"),
            data=json.dumps({"invoice": 999999, "amount_rupiah": 100000}),
            content_type="application/json",
        )
        self.assertEqual(res_404.status_code, 404)

    # 3 & 4. Verifikasi transaksi pembayaran sebagian menghasilkan saldo tersisa yang benar
    def test_03_04_verify_partial_payment(self):
        tx = PaymentTransaction.objects.create(
            payment=self.invoice,
            amount_rupiah=Decimal("300000.00"),
            status="PENDING",
        )
        self.client.force_login(self.admin_user)
        url = reverse("v1-payment-transaction-verify", kwargs={"transaction_id": tx.id})
        response = self.client.post(url, data=json.dumps({}), content_type="application/json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["data"]["status"], "VERIFIED")

        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.amount_paid, Decimal("300000.00"))
        self.assertEqual(self.invoice.status, Payment.Status.PARTIAL)

        # Verify invoice detail endpoint calculates outstanding correctly
        res_inv = self.client.get(reverse("v1-invoice-detail", kwargs={"invoice_id": self.invoice.id}))
        self.assertEqual(res_inv.status_code, 200)
        inv_data = res_inv.json()["data"]
        self.assertEqual(inv_data["verified_total_rupiah"], 300000.0)
        self.assertEqual(inv_data["outstanding_rupiah"], 350000.0)
        self.assertEqual(inv_data["status"], "PARTIAL")

    # 5. Pembayaran penuh menghasilkan status lunas (PAID)
    def test_05_verify_full_payment(self):
        # Create 2 transactions totaling 650000
        tx1 = PaymentTransaction.objects.create(
            payment=self.invoice,
            amount_rupiah=Decimal("300000.00"),
            status="PENDING",
        )
        tx2 = PaymentTransaction.objects.create(
            payment=self.invoice,
            amount_rupiah=Decimal("350000.00"),
            status="PENDING",
        )
        self.client.force_login(self.admin_user)
        self.client.post(
            reverse("v1-payment-transaction-verify", kwargs={"transaction_id": tx1.id}),
            data=json.dumps({}),
            content_type="application/json",
        )
        self.client.post(
            reverse("v1-payment-transaction-verify", kwargs={"transaction_id": tx2.id}),
            data=json.dumps({}),
            content_type="application/json",
        )

        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.amount_paid, Decimal("650000.00"))
        self.assertEqual(self.invoice.status, Payment.Status.PAID)

        res_inv = self.client.get(reverse("v1-invoice-detail", kwargs={"invoice_id": self.invoice.id}))
        inv_data = res_inv.json()["data"]
        self.assertEqual(inv_data["outstanding_rupiah"], 0.0)
        self.assertEqual(inv_data["status"], "PAID")

    # 6. Verifikasi berulang tidak menghitung transaksi dua kali
    def test_06_repeated_verification_rejected(self):
        tx = PaymentTransaction.objects.create(
            payment=self.invoice,
            amount_rupiah=Decimal("200000.00"),
            status="PENDING",
        )
        self.client.force_login(self.admin_user)
        url = reverse("v1-payment-transaction-verify", kwargs={"transaction_id": tx.id})
        res1 = self.client.post(url, data=json.dumps({}), content_type="application/json")
        self.assertEqual(res1.status_code, 200)

        # Second verification attempt
        res2 = self.client.post(url, data=json.dumps({}), content_type="application/json")
        self.assertEqual(res2.status_code, 400)
        self.assertEqual(res2.json()["error"]["code"], "ALREADY_VERIFIED")

        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.amount_paid, Decimal("200000.00"))

    # 7. Transaksi ditolak tidak dihitung sebagai pembayaran sah
    def test_07_rejected_transaction_not_counted(self):
        tx = PaymentTransaction.objects.create(
            payment=self.invoice,
            amount_rupiah=Decimal("150000.00"),
            status="PENDING",
        )
        self.client.force_login(self.admin_user)
        url = reverse("v1-payment-transaction-review-action", kwargs={"transaction_id": tx.id, "action": "reject"})
        payload = {"reason": "Bukti transfer tidak terbaca"}
        response = self.client.post(url, data=json.dumps(payload), content_type="application/json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["data"]["status"], "REJECTED")

        tx.refresh_from_db()
        self.assertEqual(tx.status, "REJECTED")
        self.assertEqual(tx.rejection_reason, "Bukti transfer tidak terbaca")

        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.amount_paid, Decimal("0.00"))

    # 8. Void transaksi yang belum diverifikasi ditangani sesuai aturan
    def test_08_void_pending_transaction(self):
        tx = PaymentTransaction.objects.create(
            payment=self.invoice,
            amount_rupiah=Decimal("100000.00"),
            status="PENDING",
        )
        self.client.force_login(self.admin_user)
        url = reverse("v1-payment-transaction-review-action", kwargs={"transaction_id": tx.id, "action": "void"})
        payload = {"reason": "Salah input nominal"}
        response = self.client.post(url, data=json.dumps(payload), content_type="application/json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["data"]["status"], "VOID")

        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.amount_paid, Decimal("0.00"))

    # 9. Void transaksi terverifikasi membalik perhitungan dengan benar
    def test_09_void_verified_transaction_reverses_balance(self):
        tx = PaymentTransaction.objects.create(
            payment=self.invoice,
            amount_rupiah=Decimal("650000.00"),
            status="PENDING",
        )
        self.client.force_login(self.admin_user)
        # Verify first
        self.client.post(
            reverse("v1-payment-transaction-verify", kwargs={"transaction_id": tx.id}),
            data=json.dumps({}),
            content_type="application/json",
        )
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.status, Payment.Status.PAID)

        # Void the verified transaction
        url = reverse("v1-payment-transaction-review-action", kwargs={"transaction_id": tx.id, "action": "void"})
        response = self.client.post(url, data=json.dumps({"reason": "Cek kosong"}), content_type="application/json")
        self.assertEqual(response.status_code, 200)

        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.amount_paid, Decimal("0.00"))
        self.assertEqual(self.invoice.status, Payment.Status.PENDING)

    # 10. Void berulang tidak mengurangi saldo dua kali
    def test_10_repeated_void_rejected(self):
        tx = PaymentTransaction.objects.create(
            payment=self.invoice,
            amount_rupiah=Decimal("200000.00"),
            status="VERIFIED",
        )
        self.invoice.amount_paid = Decimal("200000.00")
        self.invoice.save()

        self.client.force_login(self.admin_user)
        url = reverse("v1-payment-transaction-review-action", kwargs={"transaction_id": tx.id, "action": "void"})
        res1 = self.client.post(url, data=json.dumps({}), content_type="application/json")
        self.assertEqual(res1.status_code, 200)

        # Second void attempt
        res2 = self.client.post(url, data=json.dumps({}), content_type="application/json")
        self.assertEqual(res2.status_code, 400)
        self.assertEqual(res2.json()["error"]["code"], "ALREADY_VOID")

        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.amount_paid, Decimal("0.00"))

    # 11. Request dengan status transisi tidak valid ditolak
    def test_11_invalid_status_transition_rejected(self):
        tx = PaymentTransaction.objects.create(
            payment=self.invoice,
            amount_rupiah=Decimal("100000.00"),
            status="REJECTED",
        )
        self.client.force_login(self.admin_user)
        # Cannot verify a rejected transaction
        res = self.client.post(
            reverse("v1-payment-transaction-verify", kwargs={"transaction_id": tx.id}),
            data=json.dumps({}),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 400)

        # Cannot void a rejected transaction
        res_void = self.client.post(
            reverse("v1-payment-transaction-review-action", kwargs={"transaction_id": tx.id, "action": "void"}),
            data=json.dumps({}),
            content_type="application/json",
        )
        self.assertEqual(res_void.status_code, 400)

    # 12. Pembuatan billing period tidak menghasilkan periode duplikat
    def test_12_duplicate_billing_period_prevented(self):
        self.client.force_login(self.admin_user)
        payload = {"month": "2026-10-01", "due_date": "2026-10-10"}
        response = self.client.post(
            reverse("v1-billing-periods"),
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"]["code"], "DUPLICATE_PERIOD")

    # 13 & 14. Sinkronisasi berulang tidak menghasilkan invoice duplikat & menjaga historis
    def test_13_14_synchronize_idempotent_preserves_history(self):
        # Student 2 enrolled
        s2 = Student.objects.create(student_id="STD-FIN-002", full_name="Gita Gutawa", grade="12")
        Enrollment.objects.create(student=s2, class_group=self.class_group, fee_plan=self.fee_plan)

        self.client.force_login(self.admin_user)
        url = reverse("v1-billing-period-synchronize", kwargs={"period_id": self.billing_period.period_id})

        # First sync: should create invoice for student 2
        res1 = self.client.post(url, data=json.dumps({}), content_type="application/json")
        self.assertEqual(res1.status_code, 200)
        self.assertEqual(res1.json()["data"]["created_count"], 1)

        # Verify student 2 invoice was created
        self.assertTrue(Payment.objects.filter(student=s2, period=self.billing_period.month).exists())

        # Second sync: should be idempotent (0 created)
        res2 = self.client.post(url, data=json.dumps({}), content_type="application/json")
        self.assertEqual(res2.status_code, 200)
        self.assertEqual(res2.json()["data"]["created_count"], 0)

        # Existing invoice for student 1 still intact
        self.assertTrue(Payment.objects.filter(id=self.invoice.id).exists())

    # 15. Reprice tidak merusak nominal yang sudah dibayar
    def test_15_reprice_invoice_preserves_paid_amount(self):
        # Partially paid invoice: due=650000, paid=300000
        self.invoice.amount_paid = Decimal("300000.00")
        self.invoice.status = Payment.Status.PARTIAL
        self.invoice.save()
        PaymentTransaction.objects.create(
            payment=self.invoice,
            amount_rupiah=Decimal("300000.00"),
            status="VERIFIED",
        )

        self.client.force_login(self.admin_user)
        url = reverse("v1-invoice-reprice", kwargs={"invoice_id": self.invoice.id})
        payload = {
            "amount_rupiah": 500000,
            "reason": "Penyesuaian beasiswa pertengahan bulan",
        }
        response = self.client.post(url, data=json.dumps(payload), content_type="application/json")
        self.assertEqual(response.status_code, 200)
        data = response.json()["data"]
        self.assertEqual(data["amount_due_rupiah"], 500000.0)
        self.assertEqual(data["verified_total_rupiah"], 300000.0)
        self.assertEqual(data["outstanding_rupiah"], 200000.0)
        self.assertEqual(data["status"], "PARTIAL")

    # 16. Permission operasi keuangan diuji untuk setiap peran relevan
    def test_16_finance_permissions_enforced(self):
        self.client.force_login(self.teacher_user)
        tx = PaymentTransaction.objects.create(
            payment=self.invoice,
            amount_rupiah=Decimal("100000.00"),
            status="PENDING",
        )

        # Teacher is blocked from verify
        res_v = self.client.post(
            reverse("v1-payment-transaction-verify", kwargs={"transaction_id": tx.id}),
            data=json.dumps({}),
            content_type="application/json",
        )
        self.assertEqual(res_v.status_code, 403)

        # Teacher is blocked from reject
        res_r = self.client.post(
            reverse("v1-payment-transaction-review-action", kwargs={"transaction_id": tx.id, "action": "reject"}),
            data=json.dumps({}),
            content_type="application/json",
        )
        self.assertEqual(res_r.status_code, 403)

        # Teacher is blocked from reprice
        res_p = self.client.post(
            reverse("v1-invoice-reprice", kwargs={"invoice_id": self.invoice.id}),
            data=json.dumps({"amount_rupiah": 400000}),
            content_type="application/json",
        )
        self.assertEqual(res_p.status_code, 403)

        # Teacher is blocked from synchronize
        res_s = self.client.post(
            reverse("v1-billing-period-synchronize", kwargs={"period_id": self.billing_period.period_id}),
            data=json.dumps({}),
            content_type="application/json",
        )
        self.assertEqual(res_s.status_code, 403)
