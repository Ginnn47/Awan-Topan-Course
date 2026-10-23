from decimal import Decimal
from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from django.urls import reverse

from core.models import ClassGroup, Enrollment, FeePlan, Student, Subject, TeacherProfile

User = get_user_model()


class EnrollmentFilterTestCase(TestCase):
    def setUp(self):
        self.client = Client()
        self.teacher_user = User.objects.create_user(
            username="guru_enr",
            email="guru_enr@example.com",
            password="password123",
            role=User.Role.TEACHER,
        )
        self.teacher = TeacherProfile.objects.create(
            user=self.teacher_user,
            specialization="Kimia",
        )
        self.subject = Subject.objects.create(name="Kimia")

        self.cg1 = ClassGroup.objects.create(name="10A", subject=self.subject, teacher=self.teacher)
        self.cg2 = ClassGroup.objects.create(name="10B", subject=self.subject, teacher=self.teacher)

        self.fp1 = FeePlan.objects.create(class_group=self.cg1, name="Reguler 10A", monthly_amount_rupiah=Decimal("650000"))
        self.fp2 = FeePlan.objects.create(class_group=self.cg2, name="Reguler 10B", monthly_amount_rupiah=Decimal("650000"))

        self.s1 = Student.objects.create(student_id="ST1", full_name="Siswa Satu", grade="10")
        self.s2 = Student.objects.create(student_id="ST2", full_name="Siswa Dua", grade="10")
        self.s3 = Student.objects.create(student_id="ST3", full_name="Siswa Tiga", grade="10")

        # cg1: 1 active, 1 inactive
        self.e1_active = Enrollment.objects.create(student=self.s1, class_group=self.cg1, fee_plan=self.fp1, is_active=True)
        self.e2_inactive = Enrollment.objects.create(student=self.s2, class_group=self.cg1, fee_plan=self.fp1, is_active=False)

        # cg2: 1 active
        self.e3_active = Enrollment.objects.create(student=self.s3, class_group=self.cg2, fee_plan=self.fp2, is_active=True)

    def test_filter_no_params_returns_all_active_enrollments(self):
        response = self.client.get(reverse("v1-enrollments"))
        self.assertEqual(response.status_code, 200)
        data = response.json()
        # Should return 2 active enrollments (e1 and e3)
        self.assertEqual(len(data["data"]), 2)
        returned_ids = [item["id"] for item in data["data"]]
        self.assertIn(str(self.e1_active.id), returned_ids)
        self.assertIn(str(self.e3_active.id), returned_ids)
        self.assertNotIn(str(self.e2_inactive.id), returned_ids)

    def test_filter_by_class_group(self):
        url = reverse("v1-enrollments") + f"?class_group={self.cg1.id}"
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        # Should only return active enrollment of cg1
        self.assertEqual(len(data["data"]), 1)
        self.assertEqual(data["data"][0]["id"], str(self.e1_active.id))
        self.assertEqual(data["data"][0]["class_group"], str(self.cg1.id))

    def test_filter_by_status_inactive(self):
        url = reverse("v1-enrollments") + "?status=INACTIVE"
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data["data"]), 1)
        self.assertEqual(data["data"][0]["id"], str(self.e2_inactive.id))
        self.assertEqual(data["data"][0]["status"], "INACTIVE")

    def test_filter_combined_class_group_and_status(self):
        # cg1 + INACTIVE
        url = reverse("v1-enrollments") + f"?class_group={self.cg1.id}&status=INACTIVE"
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data["data"]), 1)
        self.assertEqual(data["data"][0]["id"], str(self.e2_inactive.id))

        # cg2 + INACTIVE (no inactive in cg2)
        url2 = reverse("v1-enrollments") + f"?class_group={self.cg2.id}&status=INACTIVE"
        response2 = self.client.get(url2)
        self.assertEqual(response2.status_code, 200)
        self.assertEqual(len(response2.json()["data"]), 0)

    def test_filter_invalid_parameters_handled_gracefully(self):
        # Invalid class_group ID
        url = reverse("v1-enrollments") + "?class_group=abc-invalid-id"
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()["data"]), 0)

        # Invalid status string
        url2 = reverse("v1-enrollments") + "?status=UNKNOWN_STATUS_XYZ"
        response2 = self.client.get(url2)
        self.assertEqual(response2.status_code, 200)
        self.assertEqual(len(response2.json()["data"]), 0)
