"""Create a small, complete, idempotent dataset for local or empty deployments."""

import secrets
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from core.models import (
    AuditLog,
    BillingPeriod,
    ClassGroup,
    Enrollment,
    FeePlan,
    Payment,
    PaymentTransaction,
    Student,
    Subject,
    TeacherProfile,
)

User = get_user_model()

TEACHERS = (
    ("seed-admin", "seed-admin@awantopan.local", "Admin Demo", User.Role.ADMIN, "Administrasi"),
    ("seed-guru-matematika", "seed-matematika@awantopan.local", "Guru Matematika", User.Role.TEACHER, "Matematika"),
    ("seed-guru-inggris", "seed-inggris@awantopan.local", "Guru Bahasa Inggris", User.Role.TEACHER, "Bahasa Inggris"),
)

CLASSES = (
    ("7A", "Matematika", "Ruang 101", "seed-guru-matematika"),
    ("8A", "Bahasa Inggris", "Ruang 102", "seed-guru-inggris"),
    ("9A", "Matematika", "Ruang 201", "seed-guru-matematika"),
)


class Command(BaseCommand):
    help = "Seed an idempotent demo catalog with teachers, students, classes, invoices, and payments."

    def add_arguments(self, parser):
        parser.add_argument("--database", default="default", help="Database alias to seed into")
        parser.add_argument("--period", help="Billing period in YYYY-MM format; defaults to the local month")
        parser.add_argument(
            "--password",
            help="Password assigned to seeded accounts; a random password is generated when omitted",
        )

    def handle(self, *args, **options):
        db = options["database"]
        period = self._parse_period(options.get("period"))
        password = options["password"] or secrets.token_urlsafe(16)

        with transaction.atomic(using=db):
            users, profiles = self._seed_teachers(db, password)
            classes = self._seed_classes(db, profiles)
            students = self._seed_students(db, classes)
            billing_period = self._seed_billing_period(db, period)
            invoices, transactions = self._seed_payments(db, students, billing_period, users["seed-admin"])

        self.stdout.write(self.style.SUCCESS(
            f"Seed selesai: {len(users)} akun, {len(profiles)} profil guru, {len(classes)} rombel, "
            f"{len(students)} siswa, {invoices} invoice, {transactions} transaksi ({billing_period.period_id})."
        ))
        self.stdout.write(f"Password akun seed: {password}")

    @staticmethod
    def _parse_period(value):
        if not value:
            today = timezone.localdate()
            return today.replace(day=1)
        try:
            year, month = (int(part) for part in value.split("-", 1))
            return date(year, month, 1)
        except (TypeError, ValueError):
            raise CommandError("--period harus berformat YYYY-MM.")

    def _seed_teachers(self, db, password):
        users = {}
        profiles = {}
        for username, email, full_name, role, specialization in TEACHERS:
            first_name, *last_name = full_name.split(" ", 1)
            user, _ = User.objects.using(db).get_or_create(username=username, defaults={"email": email})
            user.email = email
            user.first_name = first_name
            user.last_name = last_name[0] if last_name else ""
            user.role = role
            user.is_active = True
            user.is_staff = False
            user.is_superuser = False
            user.set_password(password)
            user.save(using=db)
            users[username] = user

            if role == User.Role.TEACHER:
                profile, _ = TeacherProfile.objects.using(db).get_or_create(
                    user=user,
                    defaults={"specialization": specialization, "is_active": True},
                )
                profile.specialization = specialization
                profile.is_active = True
                profile.save(using=db)
                profiles[username] = profile

        return users, profiles

    def _seed_classes(self, db, profiles):
        subjects = {}
        for _, subject_name, _, _ in CLASSES:
            subjects[subject_name], _ = Subject.objects.using(db).get_or_create(name=subject_name)

        classes = []
        for name, subject_name, room, teacher_key in CLASSES:
            class_group, _ = ClassGroup.objects.using(db).get_or_create(
                name=name,
                defaults={"subject": subjects[subject_name], "teacher": profiles[teacher_key], "room": room},
            )
            class_group.subject = subjects[subject_name]
            class_group.teacher = profiles[teacher_key]
            class_group.room = room
            class_group.is_active = True
            class_group.save(using=db)
            FeePlan.objects.using(db).get_or_create(
                class_group=class_group,
                name="Reguler",
                defaults={"monthly_amount_rupiah": Decimal("650000.00"), "is_active": True},
            )
            classes.append(class_group)
        return classes

    def _seed_students(self, db, classes):
        students = []
        for class_index, class_group in enumerate(classes, start=1):
            fee_plan = FeePlan.objects.using(db).filter(class_group=class_group, is_active=True).first()
            for student_index in range(1, 5):
                code = f"SEED-2026-{class_index:02d}{student_index:02d}"
                student, _ = Student.objects.using(db).update_or_create(
                    student_id=code,
                    defaults={
                        "full_name": f"Siswa Demo {class_group.name} {student_index}",
                        "school": "Sekolah Demo Awan Topan",
                        "grade": f"{class_group.name[0]} SMP",
                        "parent_name": f"Orang Tua {class_group.name} {student_index}",
                        "parent_phone": f"08120000{class_index:02d}{student_index:02d}",
                        "status": Student.Status.ACTIVE,
                    },
                )
                Enrollment.objects.using(db).update_or_create(
                    student=student,
                    class_group=class_group,
                    defaults={"fee_plan": fee_plan, "joined_at": date(2026, 7, 15), "is_active": True},
                )
                students.append((student, fee_plan))
        return students

    def _seed_billing_period(self, db, period):
        billing_period, _ = BillingPeriod.objects.using(db).get_or_create(
            period_id=period.strftime("%Y-%m"),
            defaults={"month": period, "due_date": period.replace(day=10), "status": BillingPeriod.Status.ACTIVE},
        )
        billing_period.month = period
        billing_period.due_date = period.replace(day=10)
        billing_period.status = BillingPeriod.Status.ACTIVE
        billing_period.save(using=db)
        return billing_period

    def _seed_payments(self, db, students, billing_period, admin):
        invoice_count = 0
        transaction_count = 0
        for index, (student, fee_plan) in enumerate(students):
            payment, _ = Payment.objects.using(db).get_or_create(
                student=student,
                period=billing_period.month,
                defaults={
                    "amount_due": fee_plan.monthly_amount_rupiah if fee_plan else Decimal("650000.00"),
                    "amount_paid": Decimal("0.00"),
                    "due_date": billing_period.due_date,
                    "fee_plan": fee_plan,
                    "status": Payment.Status.PENDING,
                },
            )
            if payment.fee_plan_id != (fee_plan.id if fee_plan else None):
                payment.fee_plan = fee_plan
                payment.due_date = billing_period.due_date
                payment.save(using=db, update_fields=["fee_plan", "due_date", "updated_at"])
            invoice_count += 1

            if index == 0 and not PaymentTransaction.objects.using(db).filter(payment=payment).exists():
                amount = payment.amount_due
                PaymentTransaction.objects.using(db).create(
                    payment=payment,
                    amount_rupiah=amount,
                    paid_on=timezone.localdate(),
                    method="Transfer",
                    reference=f"SEED-{billing_period.period_id}",
                    status=PaymentTransaction.Status.VERIFIED,
                    recorded_by=admin,
                    reviewed_by=admin,
                    verified_at=timezone.now(),
                )
                payment.amount_paid = amount
                payment.paid_at = timezone.localdate()
                payment.method = "Transfer"
                payment.status = Payment.Status.PAID
                payment.save(using=db)
                transaction_count += 1

        AuditLog.objects.using(db).create(
            actor=admin,
            action="SEED_APP_DATA",
            target_type="BillingPeriod",
            target_id=billing_period.period_id,
            new_value={"period": billing_period.period_id, "invoices": invoice_count},
        )
        return invoice_count, transaction_count
