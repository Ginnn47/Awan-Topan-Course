from datetime import date, time
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
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


class Command(BaseCommand):
    help = "Seed initial demo data for Awan Topan Course"

    def add_arguments(self, parser):
        parser.add_argument("--database", default="default", help="Database alias to seed into")

    def handle(self, *args, **options):
        db = options["database"]
        self.stdout.write(f"Seeding demo data into database '{db}'...")

        # 1. Users (both admin and demo accounts)
        accounts = [
            ("admin", "admin@awantopan.com", "Mas", "Topan", User.Role.ADMIN, True, True, "admin123"),
            ("topan", "topan@awantopan.local", "Mas", "Topan", User.Role.ADMIN, True, True, "password-test"),
            ("guru1", "guru1@awantopan.com", "Mbak", "Layla", User.Role.TEACHER, False, False, "guru123"),
            ("layla", "layla@awantopan.local", "Mbak", "Layla", User.Role.TEACHER, False, False, "password-test"),
        ]

        created_users = {}
        for username, email, first, last, role, staff, superuser, pwd in accounts:
            u, _ = User.objects.using(db).get_or_create(
                username=username,
                defaults={
                    "email": email,
                    "first_name": first,
                    "last_name": last,
                    "role": role,
                    "is_staff": staff,
                    "is_superuser": superuser,
                },
            )
            u.email = email
            u.set_password(pwd)
            u.save(using=db)
            created_users[username] = u

        # 2. Teacher Profiles
        tp1, _ = TeacherProfile.objects.using(db).get_or_create(
            user=created_users["guru1"],
            defaults={"phone": "08123456789", "specialization": "Matematika & Fisika", "is_active": True},
        )
        tp2, _ = TeacherProfile.objects.using(db).get_or_create(
            user=created_users["layla"],
            defaults={"phone": "08129876543", "specialization": "Bahasa Inggris & Biologi", "is_active": True},
        )

        # 3. Subjects
        sub_math, _ = Subject.objects.using(db).get_or_create(name="Matematika SMA")
        sub_phys, _ = Subject.objects.using(db).get_or_create(name="Fisika SMA")

        # 4. Students
        s1, _ = Student.objects.using(db).get_or_create(
            student_id="STD-2026-001",
            defaults={"full_name": "Ahmad Dani", "school": "SMA Negeri 1", "grade": "11 IPA", "status": Student.Status.ACTIVE},
        )
        s2, _ = Student.objects.using(db).get_or_create(
            student_id="STD-2026-002",
            defaults={"full_name": "Citra Lestari", "school": "SMA Negeri 3", "grade": "11 IPA", "status": Student.Status.ACTIVE},
        )
        s3, _ = Student.objects.using(db).get_or_create(
            student_id="STD-2026-003",
            defaults={"full_name": "Dimas Anggara", "school": "SMA Harapan Bangsa", "grade": "10 SMA", "status": Student.Status.ACTIVE},
        )

        # 5. ClassGroup & Enrollment
        cg_math, _ = ClassGroup.objects.using(db).get_or_create(
            name="11-MAT-A",
            subject=sub_math,
            defaults={"teacher": tp1, "room": "Ruang Alpha"},
        )
        Enrollment.objects.using(db).get_or_create(student=s1, class_group=cg_math)
        Enrollment.objects.using(db).get_or_create(student=s2, class_group=cg_math)

        # 6. Schedule & Session
        today = timezone.localdate()
        sched, _ = Schedule.objects.using(db).get_or_create(
            class_group=cg_math,
            teacher=tp1,
            date=today,
            defaults={
                "start_time": time(15, 30),
                "end_time": time(17, 0),
                "status": Schedule.Status.COMPLETED,
                "notes": "Pertemuan materi Trigonometri",
            },
        )
        session, _ = SessionRecord.objects.using(db).get_or_create(
            schedule=sched,
            defaults={
                "topic": "Rumus Jumlah & Selisih Sinus Cosinus",
                "material_description": "Pembahasan buku bab 3 halaman 45-52",
                "learning_notes": "Siswa sudah memahami konsep dasar dengan baik",
                "homework": "Latihan 3.2 nomor 1 sampai 10",
                "status": SessionRecord.Status.COMPLETED,
                "started_at": timezone.now(),
                "completed_at": timezone.now(),
            },
        )

        # 7. Attendances
        TeacherAttendance.objects.using(db).get_or_create(
            session=session,
            defaults={"teacher": tp1, "checked_in_at": timezone.now()},
        )
        StudentAttendance.objects.using(db).get_or_create(
            session=session,
            student=s1,
            defaults={"status": StudentAttendance.Status.PRESENT, "modified_by": created_users["admin"]},
        )
        StudentAttendance.objects.using(db).get_or_create(
            session=session,
            student=s2,
            defaults={"status": StudentAttendance.Status.PERMIT, "modified_by": created_users["admin"]},
        )

        # 8. Payments
        period_date = today.replace(day=1)
        Payment.objects.using(db).get_or_create(
            student=s1,
            period=period_date,
            defaults={
                "amount_due": Decimal("650000.00"),
                "amount_paid": Decimal("650000.00"),
                "status": Payment.Status.PAID,
                "method": "Transfer BCA",
                "paid_at": today,
            },
        )
        Payment.objects.using(db).get_or_create(
            student=s2,
            period=period_date,
            defaults={
                "amount_due": Decimal("650000.00"),
                "amount_paid": Decimal("300000.00"),
                "status": Payment.Status.PARTIAL,
                "method": "Tunai",
                "paid_at": today,
            },
        )
        Payment.objects.using(db).get_or_create(
            student=s3,
            period=period_date,
            defaults={
                "amount_due": Decimal("550000.00"),
                "amount_paid": Decimal("0.00"),
                "status": Payment.Status.PENDING,
            },
        )

        # 9. AuditLog
        AuditLog.objects.using(db).create(
            actor=created_users["admin"],
            action="CREATE_PAYMENT",
            target_type="Payment",
            target_id="1",
            new_value={"student": "Ahmad Dani", "amount": 650000, "status": "paid"},
        )

        self.stdout.write(self.style.SUCCESS("Demo data seeded successfully!"))
