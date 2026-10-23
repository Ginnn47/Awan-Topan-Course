import json
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from django.urls import reverse

from core.models import ClassGroup, Enrollment, FeePlan, Student, Subject, TeacherProfile

User = get_user_model()


class RosterBatchTestCase(TestCase):
    def setUp(self):
        self.client = Client()
        self.admin_user = User.objects.create_user(
            username="admin2",
            email="admin2@example.com",
            password="password123",
            role=User.Role.ADMIN,
        )
        self.teacher_user = User.objects.create_user(
            username="guru2",
            email="guru2@example.com",
            password="password123",
            role=User.Role.TEACHER,
        )
        self.teacher = TeacherProfile.objects.create(
            user=self.teacher_user,
            specialization="Bahasa Inggris",
        )
        self.subject = Subject.objects.create(name="Bahasa Inggris")
        self.class_group = ClassGroup.objects.create(
            name="8A",
            subject=self.subject,
            teacher=self.teacher,
            room="Ruang 103",
        )
        self.fee_plan = FeePlan.objects.create(
            class_group=self.class_group,
            name="Reguler",
            monthly_amount_rupiah=Decimal("650000.00"),
        )
        self.student1 = Student.objects.create(
            student_id="STD-TEST-001",
            full_name="Citra Lestari",
            grade="8",
            school="SMP 1",
        )
        self.enrollment1 = Enrollment.objects.create(
            student=self.student1,
            class_group=self.class_group,
            fee_plan=self.fee_plan,
        )

    def test_roster_batch_add_existing_and_new_student(self):
        payload = {
            "class_group_id": self.class_group.id,
            "items": [
                {
                    "student_id": self.student1.student_id,
                    "full_name": "Citra Lestari Update",
                    "school": "SMP 1 Jakarta",
                    "action": "upsert",
                },
                {
                    "full_name": "Dedi Kurniawan",
                    "school": "SMP 2 Jakarta",
                    "action": "upsert",
                },
            ],
        }
        response = self.client.post(
            reverse("v1-enrollments-roster-batch"),
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data["data"]), 2)

        # Check existing student was updated
        self.student1.refresh_from_db()
        self.assertEqual(self.student1.full_name, "Citra Lestari Update")
        self.assertEqual(self.student1.school, "SMP 1 Jakarta")

        # Check new student was created
        dedi = Student.objects.filter(full_name="Dedi Kurniawan").first()
        self.assertIsNotNone(dedi)
        self.assertTrue(Enrollment.objects.filter(student=dedi, class_group=self.class_group).exists())

    def test_roster_batch_invalid_class_group(self):
        payload = {
            "class_group_id": 999999,
            "items": [{"full_name": "Ghost", "action": "upsert"}],
        }
        response = self.client.post(
            reverse("v1-enrollments-roster-batch"),
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 404)
        data = response.json()
        self.assertEqual(data["error"]["code"], "NOT_FOUND")

    def test_roster_batch_prevents_duplicate_enrollments(self):
        payload = {
            "class_group_id": self.class_group.id,
            "items": [
                {"student_id": self.student1.id, "action": "upsert"},
                {"student_id": self.student1.id, "action": "upsert"},
            ],
        }
        response = self.client.post(
            reverse("v1-enrollments-roster-batch"),
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        # Verify enrollment is not duplicated in DB
        count = Enrollment.objects.filter(student=self.student1, class_group=self.class_group).count()
        self.assertEqual(count, 1)

    def test_roster_batch_archive_student_action(self):
        payload = {
            "class_group_id": self.class_group.id,
            "items": [
                {"student_id": self.student1.id, "action": "archive"},
            ],
        }
        response = self.client.post(
            reverse("v1-enrollments-roster-batch"),
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        # Enrollment should still exist but is_active = False
        self.enrollment1.refresh_from_db()
        self.assertFalse(self.enrollment1.is_active)
        # Active enrollments returned in response should be 0
        self.assertEqual(len(response.json()["data"]), 0)

    def test_roster_batch_rollback_on_invalid_data(self):
        initial_student_count = Student.objects.count()
        payload = {
            "class_group_id": self.class_group.id,
            "items": [
                {"full_name": "Valid Student", "action": "upsert"},
                {"student_id": "NON-EXISTENT-ID-9999", "action": "archive"},
            ],
        }
        response = self.client.post(
            reverse("v1-enrollments-roster-batch"),
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        # Ensure Valid Student was rolled back and not persisted
        self.assertEqual(Student.objects.count(), initial_student_count)
