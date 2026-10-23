import json
from datetime import date, time
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.test import Client, TestCase

from core.models import (
    BillingPeriod,
    ClassGroup,
    Enrollment,
    FeePlan,
    Payment,
    PaymentTransaction,
    Schedule,
    SessionRecord,
    Student,
    StudentAttendance,
    Subject,
    TeacherProfile,
)

User = get_user_model()


class TeachersStudentsCrudTestCase(TestCase):
    def setUp(self):
        self.client = Client()
        self.admin_user = User.objects.create_user(
            username="admin_master",
            email="admin_master@example.com",
            password="password123",
            role=User.Role.ADMIN,
        )
        self.teacher_user = User.objects.create_user(
            username="guru_master",
            email="guru_master@example.com",
            password="password123",
            role=User.Role.TEACHER,
            first_name="Guru",
            last_name="Master",
        )
        self.teacher = TeacherProfile.objects.create(
            user=self.teacher_user,
            phone="08123456789",
            specialization="Matematika SMA",
            is_active=True,
        )
        self.subject = Subject.objects.create(name="Matematika")
        self.class_group = ClassGroup.objects.create(
            name="10A",
            subject=self.subject,
            teacher=self.teacher,
            room="Ruang 203",
        )
        self.fee_plan = FeePlan.objects.create(
            class_group=self.class_group,
            name="Reguler",
            monthly_amount_rupiah=Decimal("650000.00"),
        )
        self.student = Student.objects.create(
            student_id="STD-TEST-001",
            full_name="Budi Santoso",
            school="SMA Negeri 1",
            grade="10 SMA",
            parent_name="Santoso",
            parent_phone="081999888777",
            status=Student.Status.ACTIVE,
        )
        self.enrollment = Enrollment.objects.create(
            student=self.student,
            class_group=self.class_group,
            fee_plan=self.fee_plan,
            is_active=True,
        )

    # --------------------------------------------------------------------------
    # 1. Teachers CRUD
    # --------------------------------------------------------------------------
    def test_list_teachers_with_filters(self):
        # Inactive teacher
        inactive_user = User.objects.create_user(
            username="guru_pensiun",
            email="pensiun@example.com",
            password="password123",
            role=User.Role.TEACHER,
            first_name="Pak",
            last_name="Pensiun",
        )
        TeacherProfile.objects.create(
            user=inactive_user,
            specialization="Fisika",
            is_active=False,
        )

        # All teachers
        res = self.client.get("/api/v1/teachers/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.json()["data"]), 2)

        # Filter is_active=true
        res_act = self.client.get("/api/v1/teachers/?is_active=true")
        self.assertEqual(res_act.status_code, 200)
        self.assertEqual(len(res_act.json()["data"]), 1)
        self.assertEqual(res_act.json()["data"][0]["id"], str(self.teacher.id))

        # Filter search
        res_srch = self.client.get("/api/v1/teachers/?search=Pensiun")
        self.assertEqual(res_srch.status_code, 200)
        self.assertEqual(len(res_srch.json()["data"]), 1)
        self.assertEqual(res_srch.json()["data"][0]["email"], "pensiun@example.com")

    def test_create_teacher_valid(self):
        self.client.force_login(self.admin_user)
        payload = {
            "full_name": "Ibu Ratna Dewi",
            "email": "ratna@example.com",
            "teacher_code": "TCH-RATNA",
            "phone": "0811223344",
            "specialization": "Bahasa Inggris",
            "password": "securepassword123",
            "class_group_ids": [str(self.class_group.id)],
        }
        res = self.client.post(
            "/api/v1/teachers/",
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 201)
        data = res.json()["data"]
        self.assertEqual(data["full_name"], "Ibu Ratna Dewi")
        self.assertEqual(data["email"], "ratna@example.com")
        self.assertEqual(data["teacher_code"], "TCH-RATNA")
        self.assertEqual(data["account_role"], "TEACHER")
        self.assertEqual(len(data["assigned_classes"]), 1)

        # Check DB
        t_id = int(data["id"])
        tp = TeacherProfile.objects.get(pk=t_id)
        self.assertEqual(tp.user.email, "ratna@example.com")
        self.assertTrue(tp.user.check_password("securepassword123"))
        self.assertFalse(tp.user.is_admin_role())

    def test_create_teacher_validation(self):
        self.client.force_login(self.admin_user)
        # Missing full_name
        res1 = self.client.post(
            "/api/v1/teachers/",
            data=json.dumps({"email": "test@example.com"}),
            content_type="application/json",
        )
        self.assertEqual(res1.status_code, 400)

        # Duplicate email
        res2 = self.client.post(
            "/api/v1/teachers/",
            data=json.dumps({"full_name": "Guru Duplikat", "email": self.teacher_user.email}),
            content_type="application/json",
        )
        self.assertEqual(res2.status_code, 400)
        self.assertEqual(res2.json()["error"]["code"], "DUPLICATE_EMAIL")

    def test_update_teacher_profile(self):
        self.client.force_login(self.admin_user)
        payload = {
            "full_name": "Guru Master Updated",
            "specialization": "Matematika & Kalkulus",
            "phone": "0899887766",
        }
        res = self.client.patch(
            f"/api/v1/teachers/{self.teacher.id}/",
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 200)
        self.teacher.refresh_from_db()
        self.assertEqual(self.teacher.specialization, "Matematika & Kalkulus")
        self.assertEqual(self.teacher.phone, "0899887766")
        self.assertEqual(self.teacher.user.get_full_name(), "Guru Master Updated")

    def test_teacher_not_found(self):
        res = self.client.get("/api/v1/teachers/999999/")
        self.assertEqual(res.status_code, 404)
        self.assertEqual(res.json()["error"]["code"], "NOT_FOUND")

    def test_teacher_write_permissions(self):
        self.client.force_login(self.teacher_user)
        # Teacher trying to create another teacher
        res = self.client.post(
            "/api/v1/teachers/",
            data=json.dumps({"full_name": "Guru Ilegal", "email": "ilegal@example.com"}),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 403)
        self.assertEqual(res.json()["error"]["code"], "FORBIDDEN")

    def test_archive_teacher_preserves_history(self):
        self.client.force_login(self.admin_user)
        res = self.client.delete(f"/api/v1/teachers/{self.teacher.id}/")
        self.assertEqual(res.status_code, 200)
        self.teacher.refresh_from_db()
        self.assertFalse(self.teacher.is_active)
        self.assertFalse(self.teacher.user.is_active)

        # Assigned class group is NOT destroyed
        self.assertTrue(ClassGroup.objects.filter(pk=self.class_group.pk).exists())

    # --------------------------------------------------------------------------
    # 2. Students CRUD
    # --------------------------------------------------------------------------
    def test_list_students_with_filters(self):
        st2 = Student.objects.create(
            student_id="STD-TEST-002",
            full_name="Dewi Lestari",
            school="SMP Negeri 1",
            grade="7 SMP",
            status=Student.Status.ACTIVE,
        )

        # List all
        res = self.client.get("/api/v1/students/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.json()["data"]), 2)

        # Filter by search
        res_srch = self.client.get("/api/v1/students/?search=Dewi")
        self.assertEqual(res_srch.status_code, 200)
        self.assertEqual(len(res_srch.json()["data"]), 1)
        self.assertEqual(res_srch.json()["data"][0]["student_code"], "STD-TEST-002")

        # Filter by class_group
        res_cg = self.client.get(f"/api/v1/students/?class_group={self.class_group.id}")
        self.assertEqual(res_cg.status_code, 200)
        self.assertEqual(len(res_cg.json()["data"]), 1)
        self.assertEqual(res_cg.json()["data"][0]["student_code"], "STD-TEST-001")

    def test_get_student_detail(self):
        res = self.client.get(f"/api/v1/students/{self.student.id}/")
        self.assertEqual(res.status_code, 200)
        data = res.json()["data"]
        self.assertEqual(data["student_code"], "STD-TEST-001")
        self.assertEqual(data["full_name"], "Budi Santoso")

    def test_create_student_valid(self):
        self.client.force_login(self.admin_user)
        payload = {
            "full_name": "Rian Ardiansyah",
            "student_code": "STD-RIAN-001",
            "school": "SMA Negeri 2 Nganjuk",
            "grade_level": "11 SMA",
            "birth_date": "2009-05-15",
            "parent_name": "Ardi",
            "parent_phone": "0812344321",
            "class_group_id": str(self.class_group.id),
        }
        res = self.client.post(
            "/api/v1/students/",
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 201)
        data = res.json()["data"]
        self.assertEqual(data["full_name"], "Rian Ardiansyah")
        self.assertEqual(data["student_code"], "STD-RIAN-001")
        self.assertEqual(data["birth_date"], "2009-05-15")

        # Enrolled automatically
        st_id = int(data["id"])
        self.assertTrue(Enrollment.objects.filter(student_id=st_id, class_group=self.class_group, is_active=True).exists())

    def test_create_student_validation(self):
        self.client.force_login(self.admin_user)
        # Missing full_name
        res1 = self.client.post(
            "/api/v1/students/",
            data=json.dumps({"school": "SMA 1"}),
            content_type="application/json",
        )
        self.assertEqual(res1.status_code, 400)

        # Duplicate student_code
        res2 = self.client.post(
            "/api/v1/students/",
            data=json.dumps({"full_name": "Anak Kembar", "student_code": self.student.student_id}),
            content_type="application/json",
        )
        self.assertEqual(res2.status_code, 400)
        self.assertEqual(res2.json()["error"]["code"], "DUPLICATE_STUDENT_CODE")

    def test_update_student_profile(self):
        self.client.force_login(self.admin_user)
        payload = {
            "full_name": "Budi Santoso S.T.",
            "school": "SMA Negeri 1 Unggulan",
            "parent_phone": "08555666777",
        }
        res = self.client.patch(
            f"/api/v1/students/{self.student.id}/",
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 200)
        self.student.refresh_from_db()
        self.assertEqual(self.student.full_name, "Budi Santoso S.T.")
        self.assertEqual(self.student.school, "SMA Negeri 1 Unggulan")
        self.assertEqual(self.student.parent_phone, "08555666777")

    def test_archive_student_preserves_history(self):
        self.client.force_login(self.admin_user)
        res = self.client.delete(f"/api/v1/students/{self.student.id}/")
        self.assertEqual(res.status_code, 200)
        self.student.refresh_from_db()
        self.assertEqual(self.student.status, Student.Status.ARCHIVED)

        # Enrollment is set to inactive, NOT deleted
        enr = Enrollment.objects.get(pk=self.enrollment.pk)
        self.assertFalse(enr.is_active)

    def test_student_not_found(self):
        res = self.client.get("/api/v1/students/999999/")
        self.assertEqual(res.status_code, 404)
        self.assertEqual(res.json()["error"]["code"], "NOT_FOUND")

    def test_student_write_permissions(self):
        self.client.force_login(self.teacher_user)
        res = self.client.post(
            "/api/v1/students/",
            data=json.dumps({"full_name": "Siswa Ilegal"}),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 403)
        self.assertEqual(res.json()["error"]["code"], "FORBIDDEN")

    # --------------------------------------------------------------------------
    # 3. Monthly Recap
    # --------------------------------------------------------------------------
    def test_student_monthly_recap(self):
        # Create schedule and session in October 2026
        sched = Schedule.objects.create(
            class_group=self.class_group,
            teacher=self.teacher,
            date=date(2026, 10, 26),
            start_time=time(15, 30),
            end_time=time(17, 0),
            status=Schedule.Status.COMPLETED,
        )
        sess = SessionRecord.objects.create(
            schedule=sched,
            status=SessionRecord.Status.COMPLETED,
            topic="Matematika Lanjut",
            material_description="Integral tak tentu",
        )
        StudentAttendance.objects.create(
            session=sess,
            student=self.student,
            status=StudentAttendance.Status.PRESENT,
        )

        # Create billing period and invoice for 2026-10
        period = BillingPeriod.objects.create(
            period_id="2026-10",
            month=date(2026, 10, 1),
            due_date=date(2026, 10, 10),
            status=BillingPeriod.Status.ACTIVE,
        )
        payment = Payment.objects.create(
            student=self.student,
            period=date(2026, 10, 1),
            fee_plan=self.fee_plan,
            amount_due=Decimal("650000.00"),
            due_date=date(2026, 10, 10),
            status=Payment.Status.PARTIAL,
        )
        PaymentTransaction.objects.create(
            payment=payment,
            amount_rupiah=Decimal("300000.00"),
            status="VERIFIED",
        )

        res = self.client.get(f"/api/v1/students/{self.student.id}/monthly-recap/?month=2026-10")
        self.assertEqual(res.status_code, 200)
        data = res.json()["data"]
        self.assertEqual(data["student"]["full_name"], "Budi Santoso")
        self.assertEqual(data["class_group"]["name"], "10A")
        self.assertEqual(data["month"], "2026-10")

        # Attendance check
        att = data["attendance"]
        self.assertEqual(att["total_sessions"], 1)
        self.assertEqual(att["present"], 1)
        self.assertEqual(att["attendance_rate"], 100.0)

        # Payment check
        p = data["payment"]
        self.assertEqual(p["status"], "PARTIAL")
        self.assertEqual(p["amount_due_rupiah"], 650000.0)
        self.assertEqual(p["paid_rupiah"], 300000.0)
        self.assertEqual(p["outstanding_rupiah"], 350000.0)
