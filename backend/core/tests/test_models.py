from decimal import Decimal
from datetime import date, time
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError
from django.test import TestCase
from django.utils import timezone

from core.models import (
    AuditLog,
    ClassGroup,
    Enrollment,
    Payment,
    Schedule,
    SessionRecord,
    Student,
    StudentAttendance,
    Subject,
    TeacherAttendance,
    TeacherProfile,
)

User = get_user_model()


class ModelTestCase(TestCase):
    def setUp(self):
        self.admin_user = User.objects.create_user(
            username="admin_test",
            email="admin@example.com",
            password="securepassword123",
            role=User.Role.ADMIN,
        )
        self.teacher_user = User.objects.create_user(
            username="teacher_test",
            email="teacher@example.com",
            password="securepassword123",
            role=User.Role.TEACHER,
        )
        self.teacher_profile = TeacherProfile.objects.create(
            user=self.teacher_user,
            phone="081234567890",
            specialization="Matematika",
        )
        self.student = Student.objects.create(
            student_id="STD-001",
            full_name="Budi Santoso",
            grade="10 SMA",
        )
        self.subject = Subject.objects.create(name="Matematika Wajib")
        self.class_group = ClassGroup.objects.create(
            name="Kelas 10-A",
            subject=self.subject,
            teacher=self.teacher_profile,
            room="Ruang 101",
        )

    def test_user_roles(self):
        self.assertTrue(self.admin_user.is_admin_role())
        self.assertFalse(self.teacher_user.is_admin_role())

    def test_teacher_profile_str(self):
        self.assertEqual(str(self.teacher_profile), "teacher_test")

    def test_student_unique_id(self):
        with self.assertRaises(IntegrityError):
            Student.objects.create(
                student_id="STD-001",
                full_name="Duplikat Budi",
                grade="10 SMA",
            )

    def test_enrollment_and_m2m(self):
        enrollment = Enrollment.objects.create(
            student=self.student,
            class_group=self.class_group,
        )
        self.assertIn(self.student, self.class_group.students.all())
        with self.assertRaises(IntegrityError):
            Enrollment.objects.create(
                student=self.student,
                class_group=self.class_group,
            )

    def test_schedule_and_session(self):
        schedule = Schedule.objects.create(
            class_group=self.class_group,
            teacher=self.teacher_profile,
            date=date(2026, 9, 1),
            start_time=time(14, 0),
            end_time=time(16, 0),
        )
        session = SessionRecord.objects.create(
            schedule=schedule,
            topic="Aljabar Linier",
        )
        self.assertEqual(session.status, SessionRecord.Status.DRAFT)
        session.complete()
        self.assertEqual(session.status, SessionRecord.Status.COMPLETED)
        self.assertIsNotNone(session.completed_at)

    def test_attendance(self):
        schedule = Schedule.objects.create(
            class_group=self.class_group,
            teacher=self.teacher_profile,
            date=date(2026, 9, 1),
            start_time=time(14, 0),
            end_time=time(16, 0),
        )
        session = SessionRecord.objects.create(schedule=schedule)
        teacher_att = TeacherAttendance.objects.create(
            session=session,
            teacher=self.teacher_profile,
        )
        self.assertIsNotNone(teacher_att.checked_in_at)

        student_att = StudentAttendance.objects.create(
            session=session,
            student=self.student,
            status=StudentAttendance.Status.PRESENT,
        )
        self.assertEqual(student_att.status, "present")

        with self.assertRaises(IntegrityError):
            StudentAttendance.objects.create(
                session=session,
                student=self.student,
            )

    def test_payment_decimals_and_unique(self):
        payment = Payment.objects.create(
            student=self.student,
            period=date(2026, 9, 1),
            amount_due=Decimal("500000.00"),
            amount_paid=Decimal("250000.00"),
            status=Payment.Status.PARTIAL,
        )
        self.assertEqual(payment.amount_due, Decimal("500000.00"))
        self.assertEqual(payment.amount_paid, Decimal("250000.00"))

        with self.assertRaises(IntegrityError):
            Payment.objects.create(
                student=self.student,
                period=date(2026, 9, 1),
                amount_due=Decimal("500000.00"),
            )

    def test_audit_log_json_field(self):
        log = AuditLog.objects.create(
            actor=self.admin_user,
            action="UPDATE_PAYMENT",
            target_type="Payment",
            target_id="1",
            old_value={"status": "pending", "amount_paid": 0},
            new_value={"status": "paid", "amount_paid": 500000},
        )
        self.assertEqual(log.new_value["amount_paid"], 500000)
