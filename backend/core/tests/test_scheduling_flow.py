import json
from datetime import date, time, timedelta
from django.contrib.auth import get_user_model
from django.test import Client, TestCase

from core.models import (
    ClassGroup,
    Enrollment,
    Schedule,
    SessionRecord,
    Student,
    StudentAttendance,
    Subject,
    TeacherProfile,
)

User = get_user_model()


class SchedulingFlowTestCase(TestCase):
    def setUp(self):
        self.client = Client()
        self.admin_user = User.objects.create_user(
            username="admin_sched",
            email="admin_sched@example.com",
            password="password123",
            role=User.Role.ADMIN,
        )
        self.teacher_user = User.objects.create_user(
            username="guru_sched",
            email="guru_sched@example.com",
            password="password123",
            role=User.Role.TEACHER,
        )
        self.teacher2_user = User.objects.create_user(
            username="guru2_sched",
            email="guru2_sched@example.com",
            password="password123",
            role=User.Role.TEACHER,
        )
        self.teacher = TeacherProfile.objects.create(
            user=self.teacher_user,
            specialization="Matematika",
        )
        self.teacher2 = TeacherProfile.objects.create(
            user=self.teacher2_user,
            specialization="Bahasa Inggris",
        )
        self.subject_mtk = Subject.objects.create(name="Matematika")
        self.subject_big = Subject.objects.create(name="Bahasa Inggris")

        self.class_7a = ClassGroup.objects.create(
            name="7A",
            subject=self.subject_mtk,
            teacher=self.teacher,
            room="Ruang 101",
        )
        self.class_7b = ClassGroup.objects.create(
            name="7B",
            subject=self.subject_big,
            teacher=self.teacher2,
            room="Ruang 102",
        )

        # Create students and enroll them
        self.students_7a = []
        for i in range(1, 4):
            st = Student.objects.create(
                student_id=f"STD-7A-{i:03d}",
                full_name=f"Siswa 7A {i}",
                grade="7",
            )
            Enrollment.objects.create(student=st, class_group=self.class_7a, is_active=True)
            self.students_7a.append(st)

        self.students_7b = []
        for i in range(1, 4):
            st = Student.objects.create(
                student_id=f"STD-7B-{i:03d}",
                full_name=f"Siswa 7B {i}",
                grade="7",
            )
            Enrollment.objects.create(student=st, class_group=self.class_7b, is_active=True)
            self.students_7b.append(st)

        # Baseline schedule
        self.schedule = Schedule.objects.create(
            class_group=self.class_7a,
            teacher=self.teacher,
            date=date(2026, 10, 26),
            start_time=time(15, 30),
            end_time=time(17, 0),
            status=Schedule.Status.SCHEDULED,
        )
        self.session = SessionRecord.objects.create(
            schedule=self.schedule,
            status=SessionRecord.Status.DRAFT,
            topic="Aljabar Dasar",
        )

    # --------------------------------------------------------------------------
    # 1. CRUD Jadwal
    # --------------------------------------------------------------------------
    def test_list_schedules_with_filters(self):
        # Additional schedule on another date
        s2 = Schedule.objects.create(
            class_group=self.class_7b,
            teacher=self.teacher2,
            date=date(2026, 10, 27),
            start_time=time(14, 0),
            end_time=time(15, 30),
            status=Schedule.Status.SCHEDULED,
        )

        res = self.client.get("/api/v1/schedule-occurrences/?from=2026-10-26T00:00:00+07:00&to=2026-11-02T00:00:00+07:00")
        self.assertEqual(res.status_code, 200)
        data = res.json()["data"]
        self.assertEqual(len(data), 2)

        # Test filtering by teacher
        res_t = self.client.get(f"/api/v1/schedule-occurrences/?teacher={self.teacher.id}")
        self.assertEqual(res_t.status_code, 200)
        self.assertEqual(len(res_t.json()["data"]), 1)
        self.assertEqual(res_t.json()["data"][0]["id"], str(self.schedule.id))

        # Test filtering by class_group
        res_cg = self.client.get(f"/api/v1/schedule-occurrences/?class_group={self.class_7b.id}")
        self.assertEqual(res_cg.status_code, 200)
        self.assertEqual(len(res_cg.json()["data"]), 1)
        self.assertEqual(res_cg.json()["data"][0]["id"], str(s2.id))

    def test_create_schedule_occurrence_valid(self):
        self.client.force_login(self.admin_user)
        payload = {
            "class_group": self.class_7b.id,
            "teacher": self.teacher2.id,
            "start_at": "2026-10-28T14:00:00+07:00",
            "end_at": "2026-10-28T15:30:00+07:00",
            "room": "Ruang 102",
        }
        res = self.client.post(
            "/api/v1/schedule-occurrences/",
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 201)
        res_data = res.json()["data"]
        self.assertEqual(res_data["class_name"], "7B")
        self.assertEqual(res_data["status"], "SCHEDULED")

        sched_id = int(res_data["id"])
        sched = Schedule.objects.get(pk=sched_id)
        self.assertEqual(sched.date, date(2026, 10, 28))
        self.assertTrue(hasattr(sched, "session"))

    def test_create_schedule_validation_errors(self):
        self.client.force_login(self.admin_user)
        # Missing class_group
        res = self.client.post(
            "/api/v1/schedule-occurrences/",
            data=json.dumps({"start_at": "2026-10-28T14:00:00+07:00", "end_at": "2026-10-28T15:30:00+07:00"}),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("error", res.json())

        # End time before start time
        res2 = self.client.post(
            "/api/v1/schedule-occurrences/",
            data=json.dumps({
                "class_group": self.class_7a.id,
                "start_at": "2026-10-28T15:30:00+07:00",
                "end_at": "2026-10-28T14:00:00+07:00",
            }),
            content_type="application/json",
        )
        self.assertEqual(res2.status_code, 400)

    def test_create_schedule_series(self):
        payload = {
            "class_group": self.class_7b.id,
            "teacher": self.teacher2.id,
            "start_at": "2026-11-03T15:30:00+07:00",
            "end_at": "2026-11-03T17:00:00+07:00",
            "occurrence_count": 3,
            "interval_weeks": 1,
        }
        res = self.client.post(
            "/api/v1/schedule-series/",
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 201)
        data = res.json()["data"]
        self.assertEqual(data["created_count"], 3)
        self.assertEqual(len(data["ids"]), 3)

        dates = list(Schedule.objects.filter(pk__in=data["ids"]).values_list("date", flat=True))
        self.assertEqual(dates, [date(2026, 11, 3), date(2026, 11, 10), date(2026, 11, 17)])

    def test_update_schedule_occurrence(self):
        self.client.force_login(self.admin_user)
        payload = {
            "start_at": "2026-10-26T16:00:00+07:00",
            "end_at": "2026-10-26T17:30:00+07:00",
            "teacher": self.teacher2.id,
        }
        res = self.client.patch(
            f"/api/v1/schedule-occurrences/{self.schedule.id}/",
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 200)
        self.schedule.refresh_from_db()
        self.assertEqual(self.schedule.start_time, time(16, 0))
        self.assertEqual(self.schedule.end_time, time(17, 30))
        self.assertEqual(self.schedule.teacher_id, self.teacher2.id)

    def test_schedule_not_found(self):
        res = self.client.get("/api/v1/schedule-occurrences/999999/")
        self.assertEqual(res.status_code, 404)
        self.assertEqual(res.json()["error"]["code"], "NOT_FOUND")

    def test_delete_schedule_soft_cancels_and_preserves_history(self):
        self.client.force_login(self.admin_user)
        res = self.client.delete(f"/api/v1/schedule-occurrences/{self.schedule.id}/")
        self.assertEqual(res.status_code, 200)
        self.schedule.refresh_from_db()
        self.assertEqual(self.schedule.status, Schedule.Status.CANCELLED)

        # SessionRecord is preserved!
        self.assertTrue(SessionRecord.objects.filter(schedule=self.schedule).exists())
    # --------------------------------------------------------------------------
    # 2. Benturan Jadwal (Conflict Detection)
    # --------------------------------------------------------------------------
    def test_conflict_teacher_collision(self):
        self.client.force_login(self.admin_user)
        # Teacher 'self.teacher' is already scheduled 15:30-17:00 on 2026-10-26
        # Try to schedule the same teacher for 7B at 16:00-17:30 (overlap)
        payload = {
            "class_group": self.class_7b.id,
            "teacher": self.teacher.id,
            "start_at": "2026-10-26T16:00:00+07:00",
            "end_at": "2026-10-26T17:30:00+07:00",
        }
        res = self.client.post(
            "/api/v1/schedule-occurrences/",
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()["error"]["code"], "SCHEDULE_CONFLICT")
        self.assertIn("Pengajar", res.json()["error"]["message"])

    def test_conflict_room_collision(self):
        self.client.force_login(self.admin_user)
        # Room 'Ruang 101' is booked for 7A 15:30-17:00 on 2026-10-26
        # Try to schedule 7B in Ruang 101 at the same time with teacher2
        payload = {
            "class_group": self.class_7b.id,
            "teacher": self.teacher2.id,
            "room": "Ruang 101",
            "start_at": "2026-10-26T15:30:00+07:00",
            "end_at": "2026-10-26T17:00:00+07:00",
        }
        res = self.client.post(
            "/api/v1/schedule-occurrences/",
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()["error"]["code"], "SCHEDULE_CONFLICT")
        self.assertIn("Ruangan", res.json()["error"]["message"])

    def test_conflict_class_group_collision(self):
        self.client.force_login(self.admin_user)
        # Class 7A already has a session 15:30-17:00
        # Try to create another session for 7A overlapping 16:00-17:30
        payload = {
            "class_group": self.class_7a.id,
            "teacher": self.teacher2.id,
            "start_at": "2026-10-26T16:00:00+07:00",
            "end_at": "2026-10-26T17:30:00+07:00",
        }
        res = self.client.post(
            "/api/v1/schedule-occurrences/",
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()["error"]["code"], "SCHEDULE_CONFLICT")
        self.assertIn("Rombel", res.json()["error"]["message"])

    def test_no_conflict_adjacent_intervals(self):
        self.client.force_login(self.admin_user)
        # 15:30-17:00 is occupied. 17:00-18:30 is immediately adjacent with NO overlap
        payload = {
            "class_group": self.class_7a.id,
            "teacher": self.teacher.id,
            "start_at": "2026-10-26T17:00:00+07:00",
            "end_at": "2026-10-26T18:30:00+07:00",
        }
        res = self.client.post(
            "/api/v1/schedule-occurrences/",
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 201)

    def test_update_self_no_conflict(self):
        self.client.force_login(self.admin_user)
        # Rescheduling self to slightly shifted time on the same day does not conflict with self
        payload = {
            "start_at": "2026-10-26T15:45:00+07:00",
            "end_at": "2026-10-26T17:15:00+07:00",
        }
        res = self.client.post(
            f"/api/v1/schedule-occurrences/{self.schedule.id}/reschedule/",
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 200)
        self.schedule.refresh_from_db()
        self.assertEqual(self.schedule.start_time, time(15, 45))

    # --------------------------------------------------------------------------
    # 3. Sesi Mengajar
    # --------------------------------------------------------------------------
    def test_session_detail_and_start(self):
        # Open session detail
        res = self.client.get(f"/api/v1/sessions/{self.session.id}/")
        self.assertEqual(res.status_code, 200)
        data = res.json()["data"]
        self.assertEqual(data["topic"], "Aljabar Dasar")
        self.assertEqual(data["occurrence_status"], "SCHEDULED")

        # Start the session
        res_start = self.client.post(
            f"/api/v1/schedule-occurrences/{self.schedule.id}/start/",
            data=json.dumps({"topic": "Sistem Persamaan Linier"}),
            content_type="application/json",
        )
        self.assertEqual(res_start.status_code, 200)
        session_data = res_start.json()["data"]
        self.assertEqual(session_data["occurrence_status"], "IN_PROGRESS")
        self.assertEqual(session_data["topic"], "Sistem Persamaan Linier")

        self.schedule.refresh_from_db()
        self.session.refresh_from_db()
        self.assertEqual(self.schedule.status, Schedule.Status.ONGOING)
        self.assertEqual(self.session.status, SessionRecord.Status.ACTIVE)

        # Idempotent: starting again returns success without creating a duplicate session
        res_replay = self.client.post(
            f"/api/v1/schedule-occurrences/{self.schedule.id}/start/",
            data=json.dumps({"topic": "Sistem Persamaan Linier"}),
            content_type="application/json",
        )
        self.assertEqual(res_replay.status_code, 200)
        self.assertEqual(SessionRecord.objects.filter(schedule=self.schedule).count(), 1)

    def test_session_complete_and_reopen_lifecycle(self):
        # Start session first
        self.schedule.status = Schedule.Status.ONGOING
        self.schedule.save()
        self.session.status = SessionRecord.Status.ACTIVE
        self.session.topic = "Aljabar Dasar"
        self.session.material_description = "Pengenalan konsep variabel x dan y"
        self.session.save()

        # Ensure all attendances are populated and marked (not UNSET)
        self.client.get(f"/api/v1/sessions/{self.session.id}/")
        StudentAttendance.objects.filter(session=self.session).update(status=StudentAttendance.Status.PRESENT)

        # Complete session
        res_comp = self.client.post(f"/api/v1/sessions/{self.session.id}/complete/")
        self.assertEqual(res_comp.status_code, 200)
        self.assertEqual(res_comp.json()["data"]["occurrence_status"], "COMPLETED")
        self.schedule.refresh_from_db()
        self.session.refresh_from_db()
        self.assertEqual(self.schedule.status, Schedule.Status.COMPLETED)
        self.assertEqual(self.session.status, SessionRecord.Status.COMPLETED)
        self.assertIsNotNone(self.session.completed_at)

        # Re-completing already completed session is rejected
        res_comp_again = self.client.post(f"/api/v1/sessions/{self.session.id}/complete/")
        self.assertEqual(res_comp_again.status_code, 400)
        self.assertEqual(res_comp_again.json()["error"]["code"], "INVALID_STATUS")

        # Reopen session with reason
        res_reopen = self.client.post(
            f"/api/v1/sessions/{self.session.id}/reopen/",
            data=json.dumps({"reason": "Koreksi absensi siswa"}),
            content_type="application/json",
        )
        self.assertEqual(res_reopen.status_code, 200)
        self.assertEqual(res_reopen.json()["data"]["occurrence_status"], "IN_PROGRESS")
        self.schedule.refresh_from_db()
        self.session.refresh_from_db()
        self.assertEqual(self.schedule.status, Schedule.Status.ONGOING)
        self.assertEqual(self.session.status, SessionRecord.Status.ACTIVE)
        self.assertIn("Koreksi absensi siswa", self.session.learning_notes)

    def test_cancel_session_and_prevent_invalid_transitions(self):
        res_cancel = self.client.post(
            f"/api/v1/schedule-occurrences/{self.schedule.id}/cancel/",
            data=json.dumps({"reason": "Guru berhalangan"}),
            content_type="application/json",
        )
        self.assertEqual(res_cancel.status_code, 200)
        self.schedule.refresh_from_db()
        self.assertEqual(self.schedule.status, Schedule.Status.CANCELLED)

        # Cannot start a cancelled session
        res_start = self.client.post(f"/api/v1/schedule-occurrences/{self.schedule.id}/start/")
        self.assertEqual(res_start.status_code, 400)
        self.assertEqual(res_start.json()["error"]["code"], "INVALID_STATUS")

        # Cannot reschedule a cancelled session
        res_resched = self.client.post(
            f"/api/v1/schedule-occurrences/{self.schedule.id}/reschedule/",
            data=json.dumps({"start_at": "2026-10-27T15:30:00+07:00", "end_at": "2026-10-27T17:00:00+07:00"}),
            content_type="application/json",
        )
        self.assertEqual(res_resched.status_code, 400)
    # --------------------------------------------------------------------------
    # 4. Absensi Siswa
    # --------------------------------------------------------------------------
    def test_attendance_auto_populated_and_persisted(self):
        # Fetching session detail auto-populates attendance for all 3 enrolled students
        res = self.client.get(f"/api/v1/sessions/{self.session.id}/")
        self.assertEqual(res.status_code, 200)
        att = res.json()["data"]["student_attendance"]
        self.assertEqual(len(att), 3)

        # Check snapshot fields for frontend compatibility
        for row in att:
            self.assertIn("student_name_snapshot", row)
            self.assertIn("student_code_snapshot", row)
            self.assertEqual(row["status"], "UNSET")

        # Database rows exist
        self.assertEqual(StudentAttendance.objects.filter(session=self.session).count(), 3)

    def test_save_attendance_valid(self):
        # Populate initial rows
        self.client.get(f"/api/v1/sessions/{self.session.id}/")
        att_rows = list(StudentAttendance.objects.filter(session=self.session).order_by("student__id"))

        payload = {
            "attendance": [
                {"id": att_rows[0].id, "student_id": str(att_rows[0].student_id), "status": "PRESENT"},
                {"id": att_rows[1].id, "student_id": str(att_rows[1].student_id), "status": "SICK"},
                {"id": att_rows[2].id, "student_id": str(att_rows[2].student_id), "status": "PERMIT"},
            ]
        }
        res = self.client.put(
            f"/api/v1/sessions/{self.session.id}/attendance/",
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 200)

        # Re-fetch and verify updated statuses
        res_check = self.client.get(f"/api/v1/sessions/{self.session.id}/")
        updated_att = {row["student_id"]: row["status"] for row in res_check.json()["data"]["student_attendance"]}
        self.assertEqual(updated_att[str(att_rows[0].student_id)], "PRESENT")
        self.assertEqual(updated_att[str(att_rows[1].student_id)], "SICK")
        self.assertEqual(updated_att[str(att_rows[2].student_id)], "PERMIT")

    def test_reject_non_enrolled_student_and_rollback(self):
        # Try to record attendance for a student enrolled in 7B, not 7A
        non_enrolled_student = self.students_7b[0]

        payload = {
            "attendance": [
                {"student_id": str(non_enrolled_student.id), "status": "PRESENT"}
            ]
        }
        res = self.client.put(
            f"/api/v1/sessions/{self.session.id}/attendance/",
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()["error"]["code"], "INVALID_STUDENT")
        self.assertFalse(StudentAttendance.objects.filter(session=self.session, student=non_enrolled_student).exists())

    def test_prevent_duplicate_attendance(self):
        st = self.students_7a[0]
        # Calling attendance update twice for the same student
        payload1 = {"attendance": [{"student_id": str(st.id), "status": "PRESENT"}]}
        self.client.put(
            f"/api/v1/sessions/{self.session.id}/attendance/",
            data=json.dumps(payload1),
            content_type="application/json",
        )
        payload2 = {"attendance": [{"student_id": str(st.id), "status": "ABSENT"}]}
        self.client.put(
            f"/api/v1/sessions/{self.session.id}/attendance/",
            data=json.dumps(payload2),
            content_type="application/json",
        )

        # Count of attendance rows for this student in this session is still exactly 1
        self.assertEqual(StudentAttendance.objects.filter(session=self.session, student=st).count(), 1)
        sa = StudentAttendance.objects.get(session=self.session, student=st)
        self.assertEqual(sa.status, StudentAttendance.Status.ABSENT)

    # --------------------------------------------------------------------------
    # 5. Catatan Materi
    # --------------------------------------------------------------------------
    def test_lesson_report_save_and_reload(self):
        payload = {
            "topic": "Trigonometri Dasar",
            "material_description": "Sinus, Cosinus, dan Tangen sudut istimewa",
            "learning_notes": "Siswa aktif mengerjakan soal latihan halaman 45",
            "homework": "PR Nomor 1 sampai 10 di buku cetak",
        }
        res = self.client.put(
            f"/api/v1/sessions/{self.session.id}/lesson-report/",
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 200)

        # Reload detail and verify
        res_get = self.client.get(f"/api/v1/sessions/{self.session.id}/")
        data = res_get.json()["data"]
        self.assertEqual(data["topic"], "Trigonometri Dasar")
        self.assertEqual(data["material_description"], "Sinus, Cosinus, dan Tangen sudut istimewa")
        self.assertEqual(data["learning_notes"], "Siswa aktif mengerjakan soal latihan halaman 45")
        self.assertEqual(data["homework"], "PR Nomor 1 sampai 10 di buku cetak")

    def test_lesson_report_validation(self):
        # Topic exceeds 160 chars
        payload = {"topic": "A" * 161}
        res = self.client.put(
            f"/api/v1/sessions/{self.session.id}/lesson-report/",
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()["error"]["code"], "VALIDATION_ERROR")

    def test_session_complete_validation_material_and_attendance(self):
        self.schedule.status = Schedule.Status.ONGOING
        self.schedule.save()
        self.session.status = SessionRecord.Status.ACTIVE
        self.session.topic = "Aljabar"
        self.session.material_description = ""
        self.session.save()

        # 1. Rejects if material_description is empty
        res1 = self.client.post(f"/api/v1/sessions/{self.session.id}/complete/")
        self.assertEqual(res1.status_code, 400)
        self.assertEqual(res1.json()["error"]["code"], "INCOMPLETE_MATERIAL")

        # Set material_description
        self.session.material_description = "Pembahasan bentuk aljabar dasar"
        self.session.save()

        # Populate attendance with UNSET
        self.client.get(f"/api/v1/sessions/{self.session.id}/")

        # 2. Rejects if student attendance has UNSET rows
        res2 = self.client.post(f"/api/v1/sessions/{self.session.id}/complete/")
        self.assertEqual(res2.status_code, 400)
        self.assertEqual(res2.json()["error"]["code"], "INCOMPLETE_ATTENDANCE")

        # Mark all as PRESENT
        for sa in StudentAttendance.objects.filter(session=self.session):
            sa.status = StudentAttendance.Status.PRESENT
            sa.save()

        # 3. Now succeeds
        res3 = self.client.post(f"/api/v1/sessions/{self.session.id}/complete/")
        self.assertEqual(res3.status_code, 200)
        self.assertEqual(res3.json()["data"]["occurrence_status"], "COMPLETED")

    def test_replicate_week_schedules_flow(self):
        self.client.force_login(self.admin_user)
        # Baseline has self.schedule on 2026-10-26
        payload = {
            "source_from": "2026-10-26",
            "source_to": "2026-10-31",
            "repeat_weeks": 2,
            "skip_conflicts": True,
        }
        res = self.client.post(
            "/api/v1/schedule-series/replicate-week/",
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 201)
        data = res.json()["data"]
        self.assertEqual(data["repeat_weeks"], 2)
        self.assertGreaterEqual(data["created_count"], 2)

        # Verify new schedules exist on week 1 (+7 days) and week 2 (+14 days)
        w1_exists = Schedule.objects.filter(class_group=self.class_7a, date=date(2026, 11, 2)).exists()
        w2_exists = Schedule.objects.filter(class_group=self.class_7a, date=date(2026, 11, 9)).exists()
        self.assertTrue(w1_exists)
        self.assertTrue(w2_exists)
