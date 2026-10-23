import json
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from django.urls import reverse

from core.models import ClassGroup, Subject, TeacherProfile, Student, Enrollment, FeePlan

User = get_user_model()


class RombelCrudTestCase(TestCase):
    def setUp(self):
        self.client = Client()
        self.admin_user = User.objects.create_user(
            username="admin1",
            email="admin1@example.com",
            password="password123",
            role=User.Role.ADMIN,
        )
        self.teacher_user = User.objects.create_user(
            username="guru1",
            email="guru1@example.com",
            password="password123",
            role=User.Role.TEACHER,
        )
        self.teacher = TeacherProfile.objects.create(
            user=self.teacher_user,
            specialization="Matematika",
        )
        self.subject = Subject.objects.create(name="Matematika")
        self.class_group = ClassGroup.objects.create(
            name="7A",
            subject=self.subject,
            teacher=self.teacher,
            room="Ruang 101",
        )
        self.fee_plan = FeePlan.objects.create(
            class_group=self.class_group,
            name="Reguler",
            monthly_amount_rupiah=Decimal("650000.00"),
        )
        self.student = Student.objects.create(
            student_id="STD-TEST-001",
            full_name="Budi Santoso",
            grade="7",
        )
        self.enrollment = Enrollment.objects.create(
            student=self.student,
            class_group=self.class_group,
            fee_plan=self.fee_plan,
        )

    def test_list_class_groups(self):
        response = self.client.get(reverse("v1-class-groups"))
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("data", data)
        self.assertGreaterEqual(len(data["data"]), 1)
        first = data["data"][0]
        self.assertEqual(first["name"], "7A")
        self.assertEqual(first["student_count"], 1)
        self.assertEqual(len(first["fee_plans"]), 1)

    def test_create_class_group_valid(self):
        payload = {
            "name": "7B",
            "level": "7B",
            "default_room": "Ruang 102",
            "subject": self.subject.id,
            "teacher": self.teacher.id,
        }
        response = self.client.post(
            reverse("v1-class-groups"),
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertEqual(data["data"]["name"], "7B")
        self.assertEqual(data["data"]["default_room_name"], "Ruang 102")
        self.assertTrue(ClassGroup.objects.filter(name="7B").exists())
        # Ensure default fee plan was generated
        cg_new = ClassGroup.objects.get(name="7B")
        self.assertTrue(cg_new.fee_plans.filter(name="Reguler").exists())

    def test_create_class_group_missing_name(self):
        payload = {
            "name": "",
            "default_room": "Ruang 102",
        }
        response = self.client.post(
            reverse("v1-class-groups"),
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        data = response.json()
        self.assertEqual(data["error"]["code"], "VALIDATION_ERROR")

    def test_create_class_group_invalid_relation(self):
        payload = {
            "name": "7C",
            "subject": 99999,
        }
        response = self.client.post(
            reverse("v1-class-groups"),
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 404)
        data = response.json()
        self.assertEqual(data["error"]["code"], "NOT_FOUND")

    def test_update_class_group_valid(self):
        payload = {
            "name": "7A-Unggulan",
            "default_room": "Ruang Alpha",
        }
        url = reverse("v1-class-group-detail", kwargs={"class_group_id": self.class_group.id})
        response = self.client.patch(
            url,
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["data"]["name"], "7A-Unggulan")
        self.assertEqual(data["data"]["default_room_name"], "Ruang Alpha")
        self.class_group.refresh_from_db()
        self.assertEqual(self.class_group.name, "7A-Unggulan")
        self.assertEqual(self.class_group.room, "Ruang Alpha")

    def test_update_class_group_not_found(self):
        url = reverse("v1-class-group-detail", kwargs={"class_group_id": 999999})
        response = self.client.patch(
            url,
            data=json.dumps({"name": "Ghost"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 404)
        data = response.json()
        self.assertEqual(data["error"]["code"], "NOT_FOUND")

    def test_delete_class_group_soft_archive_protects_relations(self):
        url = reverse("v1-class-group-detail", kwargs={"class_group_id": self.class_group.id})
        response = self.client.delete(url)
        self.assertEqual(response.status_code, 200)
        self.class_group.refresh_from_db()
        self.assertFalse(self.class_group.is_active)
        # Verify related student and enrollment records still exist
        self.assertTrue(Student.objects.filter(id=self.student.id).exists())
        self.assertTrue(Enrollment.objects.filter(id=self.enrollment.id).exists())

    def test_class_group_monthly_recap(self):
        url = reverse("v1-class-group-monthly-recap", kwargs={"class_group_id": self.class_group.id})
        response = self.client.get(url + "?month=2026-10")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["data"]["class_group"]["id"], str(self.class_group.id))
        self.assertEqual(data["data"]["count"], 1)
        student_recap = data["data"]["students"][0]
        self.assertEqual(student_recap["student"]["full_name"], "Budi Santoso")
        self.assertEqual(student_recap["finance"]["billed_rupiah"], 650000.0)
