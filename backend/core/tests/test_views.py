from datetime import date, time
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from django.urls import reverse
from django.utils import timezone

from core.models import (
    ClassGroup,
    Payment,
    Schedule,
    SessionRecord,
    Student,
    StudentAttendance,
    Subject,
    TeacherProfile,
)

User = get_user_model()


class ViewTestCase(TestCase):
    def setUp(self):
        self.client = Client()
        self.teacher_user = User.objects.create_user(
            username="guru1",
            email="guru1@example.com",
            password="password123",
            role=User.Role.TEACHER,
        )
        self.teacher = TeacherProfile.objects.create(
            user=self.teacher_user,
            specialization="Fisika",
        )
        self.student = Student.objects.create(
            student_id="S001",
            full_name="Ani Wijaya",
            grade="11 SMA",
        )
        self.subject = Subject.objects.create(name="Fisika Lanjut")
        self.class_group = ClassGroup.objects.create(
            name="11-Fisika-1",
            subject=self.subject,
            teacher=self.teacher,
        )

    def test_health_view(self):
        response = self.client.get(reverse("health"))
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "ok")

    def test_dashboard_summary(self):
        today = timezone.localdate()
        Payment.objects.create(
            student=self.student,
            period=today.replace(day=1),
            amount_due=Decimal("600000.00"),
            amount_paid=Decimal("600000.00"),
            status=Payment.Status.PAID,
        )
        response = self.client.get(reverse("dashboard-summary"))
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["total_students"], 1)
        self.assertEqual(data["active_teachers"], 1)
        self.assertEqual(data["monthly_payment_total"], 600000.0)

    def test_schedule_list(self):
        today = timezone.localdate()
        Schedule.objects.create(
            class_group=self.class_group,
            teacher=self.teacher,
            date=today,
            start_time=time(10, 0),
            end_time=time(12, 0),
        )
        response = self.client.get(reverse("schedule-list"))
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data["results"]), 1)
        self.assertEqual(data["results"][0]["subject"], "Fisika Lanjut")

    def test_payment_list(self):
        today = timezone.localdate()
        Payment.objects.create(
            student=self.student,
            period=today.replace(day=1),
            amount_due=Decimal("450000.00"),
            amount_paid=Decimal("450000.00"),
            status=Payment.Status.PAID,
        )
        response = self.client.get(reverse("payment-list"))
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data["results"]), 1)
        self.assertEqual(data["results"][0]["student"], "Ani Wijaya")
