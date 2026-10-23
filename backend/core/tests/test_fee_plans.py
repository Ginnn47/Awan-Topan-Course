import json
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from django.urls import reverse

from core.models import ClassGroup, Enrollment, FeePlan, Student, Subject, TeacherProfile

User = get_user_model()


class FeePlansTestCase(TestCase):
    def setUp(self):
        self.client = Client()
        self.admin_user = User.objects.create_user(
            username="admin_fee",
            email="admin_fee@example.com",
            password="password123",
            role=User.Role.ADMIN,
        )
        self.teacher_user = User.objects.create_user(
            username="guru_fee",
            email="guru_fee@example.com",
            password="password123",
            role=User.Role.TEACHER,
        )
        self.teacher = TeacherProfile.objects.create(
            user=self.teacher_user,
            specialization="IPA",
        )
        self.subject = Subject.objects.create(name="IPA Terpadu")
        self.class_group = ClassGroup.objects.create(
            name="9B",
            subject=self.subject,
            teacher=self.teacher,
            room="Ruang 202",
        )
        self.plan_reguler = FeePlan.objects.create(
            class_group=self.class_group,
            name="Reguler",
            monthly_amount_rupiah=Decimal("650000.00"),
        )
        self.student = Student.objects.create(
            student_id="STD-FEE-001",
            full_name="Eko Prasetyo",
            grade="9",
        )
        self.enrollment = Enrollment.objects.create(
            student=self.student,
            class_group=self.class_group,
            fee_plan=self.plan_reguler,
        )

    def test_list_fee_plans(self):
        response = self.client.get(reverse("v1-fee-plans"))
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("data", data)
        self.assertGreaterEqual(len(data["data"]), 1)
        plan = data["data"][0]
        self.assertEqual(plan["name"], "Reguler")
        self.assertEqual(plan["monthly_amount_rupiah"], 650000.0)
        self.assertEqual(plan["assigned_students"], 1)

    def test_create_fee_plan_valid(self):
        payload = {
            "class_group": self.class_group.id,
            "name": "Beasiswa Prestasi",
            "monthly_amount_rupiah": 350000,
        }
        response = self.client.post(
            reverse("v1-fee-plans"),
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertEqual(data["data"]["name"], "Beasiswa Prestasi")
        self.assertEqual(data["data"]["monthly_amount_rupiah"], 350000.0)
        self.assertTrue(FeePlan.objects.filter(name="Beasiswa Prestasi").exists())

    def test_create_fee_plan_negative_amount_rejected(self):
        payload = {
            "class_group": self.class_group.id,
            "name": "Diskon Invalid",
            "monthly_amount_rupiah": -50000,
        }
        response = self.client.post(
            reverse("v1-fee-plans"),
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        data = response.json()
        self.assertEqual(data["error"]["code"], "VALIDATION_ERROR")
        self.assertIn("negatif", data["error"]["message"].lower())

    def test_create_fee_plan_missing_required_fields(self):
        payload = {
            "class_group": self.class_group.id,
            "name": "",
        }
        response = self.client.post(
            reverse("v1-fee-plans"),
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        data = response.json()
        self.assertEqual(data["error"]["code"], "VALIDATION_ERROR")

    def test_update_fee_plan_valid(self):
        url = reverse("v1-fee-plan-detail", kwargs={"fee_plan_id": self.plan_reguler.id})
        payload = {
            "name": "Reguler Penyesuaian",
            "monthly_amount_rupiah": 700000,
        }
        response = self.client.patch(
            url,
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.plan_reguler.refresh_from_db()
        self.assertEqual(self.plan_reguler.name, "Reguler Penyesuaian")
        self.assertEqual(self.plan_reguler.monthly_amount_rupiah, Decimal("700000.00"))

    def test_update_fee_plan_not_found(self):
        url = reverse("v1-fee-plan-detail", kwargs={"fee_plan_id": 999999})
        response = self.client.patch(
            url,
            data=json.dumps({"name": "Ghost"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 404)

    def test_replace_and_archive_fee_plan(self):
        # Create replacement plan
        new_plan = FeePlan.objects.create(
            class_group=self.class_group,
            name="Reguler Baru",
            monthly_amount_rupiah=Decimal("700000.00"),
        )
        url = reverse("v1-fee-plan-replace-and-archive", kwargs={"fee_plan_id": self.plan_reguler.id})
        payload = {"replacement": new_plan.id}
        response = self.client.post(
            url,
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["data"]["moved_count"], 1)

        # Verify old plan is archived
        self.plan_reguler.refresh_from_db()
        self.assertFalse(self.plan_reguler.is_active)
        self.assertIsNotNone(self.plan_reguler.effective_until)

        # Verify student enrollment was transferred to new plan
        self.enrollment.refresh_from_db()
        self.assertEqual(self.enrollment.fee_plan, new_plan)

    def test_fee_plan_write_permission_blocked_for_teacher_role(self):
        self.client.force_login(self.teacher_user)
        payload = {
            "class_group": self.class_group.id,
            "name": "Fee Guru Coba",
            "monthly_amount_rupiah": 500000,
        }
        response = self.client.post(
            reverse("v1-fee-plans"),
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["error"]["code"], "FORBIDDEN")
