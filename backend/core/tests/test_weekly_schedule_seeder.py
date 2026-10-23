from datetime import date, time
from django.core.management import call_command
from django.test import TestCase, RequestFactory
import json

from core.models import (
    ClassGroup,
    Schedule,
    SessionRecord,
    Subject,
    TeacherProfile,
    User,
    Student,
)
from core.views import v1_schedule_occurrences


class WeeklyScheduleSeederTestCase(TestCase):
    def setUp(self):
        self.rf = RequestFactory()
        # Create an existing baseline schedule outside target week
        self.teacher_user = User.objects.create_user(
            username="guru_baseline",
            email="guru_baseline@test.local",
            role=User.Role.TEACHER,
            password="test-password",
        )
        self.tp = TeacherProfile.objects.create(
            user=self.teacher_user,
            specialization="Umum",
            is_active=True,
        )
        self.subject = Subject.objects.create(name="Matematika Dasar")
        self.cg = ClassGroup.objects.create(
            name="10-BASELINE",
            subject=self.subject,
            teacher=self.tp,
        )
        self.baseline_schedule = Schedule.objects.create(
            class_group=self.cg,
            teacher=self.tp,
            date=date(2026, 10, 22),
            start_time=time(15, 30),
            end_time=time(17, 0),
            status=Schedule.Status.SCHEDULED,
        )

    def test_dry_run_leaves_database_untouched(self):
        call_command("seed_weekly_schedule_2026_10_26", dry_run=True)
        # Should have 0 schedules in target week
        week_schedules = Schedule.objects.filter(
            date__gte=date(2026, 10, 26),
            date__lte=date(2026, 10, 31),
        )
        self.assertEqual(week_schedules.count(), 0)
        # Baseline schedule should still exist
        self.assertTrue(Schedule.objects.filter(pk=self.baseline_schedule.pk).exists())

    def test_live_seeder_creates_assignments_and_students(self):
        call_command("seed_weekly_schedule_2026_10_26")

        # Target week: 26-31 Oct
        target_week_schedules = Schedule.objects.filter(
            date__gte=date(2026, 10, 26),
            date__lte=date(2026, 10, 31),
        )
        self.assertEqual(target_week_schedules.count(), 39)

        # Current operational week: 19-24 Oct
        current_week_schedules = Schedule.objects.filter(
            date__gte=date(2026, 10, 19),
            date__lte=date(2026, 10, 24),
        )
        self.assertEqual(current_week_schedules.count(), 40)  # 39 + baseline

        # Daily breakdown for target week
        expected_breakdown = {
            date(2026, 10, 26): 7,
            date(2026, 10, 27): 8,
            date(2026, 10, 28): 6,
            date(2026, 10, 29): 7,
            date(2026, 10, 30): 7,
            date(2026, 10, 31): 4,
        }
        for d, expected_count in expected_breakdown.items():
            self.assertEqual(
                target_week_schedules.filter(date=d).count(),
                expected_count,
                f"Count mismatch on date {d}",
            )

        # Baseline schedule preserved
        self.assertTrue(Schedule.objects.filter(pk=self.baseline_schedule.pk).exists())
        self.assertEqual(Schedule.objects.count(), 79)

        # Verify students count per class is between 7 and 12
        for cg in ClassGroup.objects.filter(is_active=True):
            cnt = cg.students.filter(enrollment__is_active=True).count()
            self.assertTrue(7 <= cnt <= 12, f"ClassGroup {cg.name} has {cnt} students, not in 7-12")

        # Verify API occurrences endpoint
        req = self.rf.get("/api/v1/schedule-occurrences/?from=2026-10-26T00:00:00+07:00&to=2026-11-02T00:00:00+07:00")
        res = v1_schedule_occurrences(req)
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.content)
        self.assertEqual(len(data["data"]), 39)
        sample = data["data"][0]
        self.assertIn("class_name", sample)
        self.assertIn("teacher_name", sample)
        self.assertIn("room_name", sample)
        self.assertTrue(7 <= sample["student_count"] <= 12)

    def test_idempotence(self):
        call_command("seed_weekly_schedule_2026_10_26")
        call_command("seed_weekly_schedule_2026_10_26")
        week_schedules = Schedule.objects.filter(
            date__gte=date(2026, 10, 26),
            date__lte=date(2026, 10, 31),
        )
        self.assertEqual(week_schedules.count(), 39)
        self.assertEqual(Schedule.objects.count(), 79)
