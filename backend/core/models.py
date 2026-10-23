import os
import uuid
from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone


class User(AbstractUser):
    class Role(models.TextChoices):
        ADMIN = "admin", "Admin / Tata Usaha"
        TEACHER = "teacher", "Guru"

    role = models.CharField(max_length=20, choices=Role.choices, default=Role.TEACHER)
    email = models.EmailField(unique=True)

    def is_admin_role(self):
        return self.role == self.Role.ADMIN or self.is_superuser


class TeacherProfile(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="teacher_profile")
    phone = models.CharField(max_length=30, blank=True)
    specialization = models.CharField(max_length=120)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.user.get_full_name() or self.user.username


class Student(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "active", "Aktif"
        INACTIVE = "inactive", "Nonaktif"
        ARCHIVED = "archived", "Diarsipkan"

    student_id = models.CharField(max_length=30, unique=True)
    full_name = models.CharField(max_length=160)
    birth_date = models.DateField(null=True, blank=True)
    school = models.CharField(max_length=160, blank=True)
    grade = models.CharField(max_length=80)
    parent_name = models.CharField(max_length=160, blank=True)
    parent_phone = models.CharField(max_length=30, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.full_name


class Subject(models.Model):
    name = models.CharField(max_length=120, unique=True)

    def __str__(self):
        return self.name


class ClassGroup(models.Model):
    name = models.CharField(max_length=120)
    subject = models.ForeignKey(Subject, on_delete=models.PROTECT, related_name="class_groups")
    teacher = models.ForeignKey(TeacherProfile, on_delete=models.PROTECT, related_name="class_groups")
    room = models.CharField(max_length=120, blank=True)
    students = models.ManyToManyField(Student, through="Enrollment", related_name="class_groups")
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = ("name", "subject")

    def __str__(self):
        return f"{self.name} - {self.subject.name}"


class FeePlan(models.Model):
    class_group = models.ForeignKey(ClassGroup, on_delete=models.CASCADE, related_name="fee_plans")
    name = models.CharField(max_length=120)
    monthly_amount_rupiah = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    effective_from = models.DateField(default=timezone.localdate)
    effective_until = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-is_active", "name")

    def __str__(self):
        return f"{self.class_group.name} - {self.name}"


class Enrollment(models.Model):
    student = models.ForeignKey(Student, on_delete=models.CASCADE)
    class_group = models.ForeignKey(ClassGroup, on_delete=models.CASCADE)
    fee_plan = models.ForeignKey("FeePlan", on_delete=models.SET_NULL, null=True, blank=True, related_name="enrollments")
    joined_at = models.DateField(default=timezone.localdate)
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = ("student", "class_group")


class Schedule(models.Model):
    class Status(models.TextChoices):
        SCHEDULED = "scheduled", "Scheduled"
        ONGOING = "ongoing", "Ongoing"
        COMPLETED = "completed", "Completed"
        CANCELLED = "cancelled", "Cancelled"

    class_group = models.ForeignKey(ClassGroup, on_delete=models.PROTECT, related_name="schedules")
    teacher = models.ForeignKey(TeacherProfile, on_delete=models.PROTECT, related_name="schedules")
    date = models.DateField()
    start_time = models.TimeField()
    end_time = models.TimeField()
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.SCHEDULED)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("date", "start_time")

    def __str__(self):
        return f"{self.class_group} {self.date} {self.start_time}"


class SessionRecord(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        ACTIVE = "active", "Active"
        COMPLETED = "completed", "Completed"

    schedule = models.OneToOneField(Schedule, on_delete=models.PROTECT, related_name="session")
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    topic = models.CharField(max_length=160, blank=True)
    material_description = models.TextField(blank=True)
    learning_notes = models.TextField(blank=True)
    homework = models.TextField(blank=True)

    def complete(self):
        self.status = self.Status.COMPLETED
        self.completed_at = timezone.now()
        self.save(update_fields=["status", "completed_at"])


def session_attachment_path(instance, filename):
    ext = os.path.splitext(filename)[1].lower()
    return f"session_attachments/{instance.session_id}/{uuid.uuid4().hex}{ext}"


class SessionAttachment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(SessionRecord, on_delete=models.CASCADE, related_name="attachments")
    file = models.FileField(upload_to=session_attachment_path)
    original_name = models.CharField(max_length=255)
    content_type = models.CharField(max_length=100, blank=True)
    size_bytes = models.BigIntegerField(default=0)
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="uploaded_attachments")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.original_name} ({self.size_bytes} bytes)"



class TeacherAttendance(models.Model):
    session = models.OneToOneField(SessionRecord, on_delete=models.CASCADE, related_name="teacher_attendance")
    teacher = models.ForeignKey(TeacherProfile, on_delete=models.PROTECT)
    checked_in_at = models.DateTimeField(default=timezone.now)
    checked_out_at = models.DateTimeField(null=True, blank=True)


class StudentAttendance(models.Model):
    class Status(models.TextChoices):
        UNSET = "unset", "Belum Diisi"
        PRESENT = "present", "Hadir"
        PERMIT = "permit", "Izin"
        SICK = "sick", "Sakit"
        ABSENT = "absent", "Alfa"

    session = models.ForeignKey(SessionRecord, on_delete=models.CASCADE, related_name="student_attendance")
    student = models.ForeignKey(Student, on_delete=models.PROTECT)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.UNSET)
    modified_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    modified_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("session", "student")


class BillingPeriod(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        CLOSED = "CLOSED", "Closed"

    period_id = models.CharField(max_length=20, unique=True)
    month = models.DateField(unique=True)
    due_date = models.DateField()
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    generated_at = models.DateTimeField(auto_now_add=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-month",)

    def __str__(self):
        return f"{self.period_id} ({self.status})"


class Payment(models.Model):
    class Status(models.TextChoices):
        PAID = "paid", "Lunas"
        PARTIAL = "partial", "Sebagian"
        PENDING = "pending", "Belum Bayar"
        OVERDUE = "overdue", "Jatuh Tempo"
        VOID = "void", "Void"

    student = models.ForeignKey(Student, on_delete=models.PROTECT, related_name="payments")
    period = models.DateField(help_text="Use the first date of the billed month.")
    amount_due = models.DecimalField(max_digits=12, decimal_places=2)
    amount_paid = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    paid_at = models.DateField(null=True, blank=True)
    method = models.CharField(max_length=60, blank=True)
    due_date = models.DateField(null=True, blank=True)
    fee_plan = models.ForeignKey("FeePlan", on_delete=models.SET_NULL, null=True, blank=True, related_name="payments")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    notes = models.TextField(blank=True)
    voided_at = models.DateTimeField(null=True, blank=True)
    voided_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("student", "period")


class PaymentTransaction(models.Model):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        VERIFIED = "VERIFIED", "Verified"
        REJECTED = "REJECTED", "Rejected"
        VOID = "VOID", "Void"

    payment = models.ForeignKey(Payment, on_delete=models.CASCADE, related_name="transactions")
    amount_rupiah = models.DecimalField(max_digits=12, decimal_places=2)
    paid_on = models.DateField(default=timezone.localdate)
    method = models.CharField(max_length=60, default="Transfer")
    reference = models.CharField(max_length=120, blank=True)
    note = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    recorded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="recorded_transactions")
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="reviewed_transactions")
    verified_at = models.DateTimeField(null=True, blank=True)
    rejected_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True)
    voided_at = models.DateTimeField(null=True, blank=True)
    void_reason = models.TextField(blank=True)
    version = models.PositiveIntegerField(default=1)
    proof_file = models.FileField(upload_to="payment_proofs/", null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return f"TX-{self.id} | {self.payment.student.full_name} | {self.amount_rupiah} ({self.status})"


class AuditLog(models.Model):
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    action = models.CharField(max_length=80)
    target_type = models.CharField(max_length=80)
    target_id = models.CharField(max_length=80)
    old_value = models.JSONField(null=True, blank=True)
    new_value = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)
