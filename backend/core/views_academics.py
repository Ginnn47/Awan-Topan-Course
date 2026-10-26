
def _find_student(st_id):
    if not st_id:
        return None
    st_str = str(st_id).strip()
    if st_str.isdigit():
        return Student.objects.filter(models.Q(pk=int(st_str)) | models.Q(student_id=st_str)).first()
    return Student.objects.filter(student_id=st_str).first()
import json
import uuid
from datetime import datetime
from decimal import Decimal
from django.core.exceptions import ValidationError
from django.db import models, transaction
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt

from django.contrib.auth import get_user_model
from .models import (
    ClassGroup,
    Enrollment,
    FeePlan,
    Payment,
    Student,
    StudentAttendance,
    Subject,
    TeacherProfile,
)

User = get_user_model()


def api_error(message: str, code: str = "VALIDATION_ERROR", status: int = 400, fields: dict = None, request_id: str = ""):
    return JsonResponse(
        {
            "error": {
                "code": code,
                "message": message,
                "fields": fields or {},
                "request_id": request_id,
            }
        },
        status=status,
    )


def api_success(data, meta=None, status: int = 200):
    payload = {"data": data, "meta": meta if meta is not None else {}}
    return JsonResponse(payload, status=status)


def serialize_fee_plan(plan: FeePlan) -> dict:
    assigned_count = plan.enrollments.filter(is_active=True).count()
    return {
        "id": str(plan.id),
        "class_group": str(plan.class_group_id),
        "name": plan.name,
        "monthly_amount_rupiah": float(plan.monthly_amount_rupiah),
        "is_active": plan.is_active,
        "effective_from": plan.effective_from.isoformat() if plan.effective_from else "",
        "effective_until": plan.effective_until.isoformat() if plan.effective_until else None,
        "assigned_students": assigned_count,
    }


def _infer_class_level(name: str) -> str:
    n = name.upper().strip()
    if "SD" in n or n.startswith("6"):
        return "SD"
    if n.startswith("7"):
        return "7 SMP"
    if n.startswith("8"):
        return "8 SMP"
    if n.startswith("9"):
        return "9 SMP"
    if n.startswith("10"):
        return "10 SMA"
    if n.startswith("11"):
        return "11 SMA"
    if n.startswith("12"):
        return "12 SMA"
    return "Umum"


def serialize_class_group(cg: ClassGroup) -> dict:
    active_plans = [
        serialize_fee_plan(fp)
        for fp in cg.fee_plans.filter(is_active=True).order_by("name")
    ]
    student_count = cg.students.filter(enrollment__is_active=True).count()
    teacher_name = None
    if getattr(cg, "teacher", None) and getattr(cg.teacher, "user", None):
        teacher_name = cg.teacher.user.get_full_name() or cg.teacher.user.username
    subject_name = cg.subject.name if getattr(cg, "subject", None) else None

    return {
        "id": str(cg.id),
        "name": cg.name,
        "level": _infer_class_level(cg.name),
        "academic_year": "2026/2027",
        "subject_id": str(cg.subject_id) if cg.subject_id else None,
        "subject_name": subject_name,
        "teacher_id": str(cg.teacher_id) if cg.teacher_id else None,
        "teacher_name": teacher_name,
        "default_room": cg.room or None,
        "default_room_name": cg.room or "Ruang 101",
        "is_active": cg.is_active,
        "student_count": student_count,
        "fee_plans": active_plans,
    }


def serialize_enrollment(e: Enrollment) -> dict:
    fee_plan_id = str(e.fee_plan.id) if e.fee_plan else "1"
    fee_plan_name = e.fee_plan.name if e.fee_plan else "Reguler"
    monthly_amount = float(e.fee_plan.monthly_amount_rupiah) if e.fee_plan else 650000.0

    return {
        "id": str(e.id),
        "student": str(e.student.id),
        "student_name": e.student.full_name,
        "student_code": e.student.student_id,
        "student_school": e.student.school,
        "class_group": str(e.class_group.id),
        "class_group_name": e.class_group.name,
        "fee_plan": fee_plan_id,
        "fee_plan_name": fee_plan_name,
        "monthly_amount_rupiah": monthly_amount,
        "started_on": e.joined_at.isoformat() if e.joined_at else "",
        "ended_on": None if e.is_active else (e.joined_at.isoformat() if e.joined_at else None),
        "status": "ACTIVE" if e.is_active else "INACTIVE",
    }


# ------------------------------------------------------------------------------
# Class Groups (Rombel) CRUD
# ------------------------------------------------------------------------------
@csrf_exempt
def v1_class_groups(request):
    if request.method == "GET":
        qs = ClassGroup.objects.select_related("subject", "teacher__user").prefetch_related("fee_plans", "students").all()
        is_active_param = request.GET.get("is_active")
        if is_active_param is not None:
            if is_active_param.lower() in ("true", "1"):
                qs = qs.filter(is_active=True)
            elif is_active_param.lower() in ("false", "0"):
                qs = qs.filter(is_active=False)

        results = [serialize_class_group(cg) for cg in qs]
        return api_success(results, meta={"total": len(results)})

    elif request.method == "POST":
        if request.user.is_authenticated and not request.user.is_admin_role():
            return api_error("Hanya admin yang dapat membuat rombel baru.", code="FORBIDDEN", status=403)

        try:
            body = json.loads(request.body.decode("utf-8")) if request.body else {}
        except Exception:
            return api_error("Format JSON tidak valid.", code="VALIDATION_ERROR")

        name = (body.get("name") or "").strip()
        if not name:
            return api_error("Nama rombel wajib diisi.", code="VALIDATION_ERROR", fields={"name": ["Wajib diisi"]})

        room = body.get("default_room") or body.get("room") or ""
        subject_id = body.get("subject") or body.get("subject_id")
        teacher_id = body.get("teacher") or body.get("teacher_id")

        if subject_id:
            subject = Subject.objects.filter(pk=subject_id).first()
            if not subject:
                return api_error(f"Subject '{subject_id}' tidak ditemukan.", code="NOT_FOUND", status=404)
        else:
            subject = Subject.objects.first()

        if teacher_id:
            teacher = TeacherProfile.objects.filter(pk=teacher_id).first()
            if not teacher:
                return api_error(f"Teacher '{teacher_id}' tidak ditemukan.", code="NOT_FOUND", status=404)
        else:
            teacher = TeacherProfile.objects.first()

        # Check existing class group with same name
        existing = ClassGroup.objects.filter(name__iexact=name).first()
        if existing:
            if existing.is_active:
                return api_error(f"Rombel dengan nama '{name}' sudah ada.", code="DUPLICATE_NAME", status=400)
            else:
                existing.is_active = True
                if room:
                    existing.room = room
                if subject:
                    existing.subject = subject
                if teacher:
                    existing.teacher = teacher
                existing.save()
                return api_success(serialize_class_group(existing), status=201)

        cg = ClassGroup.objects.create(
            name=name,
            subject=subject,
            teacher=teacher,
            room=room,
            is_active=True,
        )
        # Create standard baseline FeePlan for the new class group
        FeePlan.objects.create(
            class_group=cg,
            name="Reguler",
            monthly_amount_rupiah=Decimal("650000.00"),
            is_active=True,
        )
        return api_success(serialize_class_group(cg), status=201)

    return api_error("Metode tidak diizinkan.", code="METHOD_NOT_ALLOWED", status=405)


@csrf_exempt
def v1_class_group_detail(request, class_group_id):
    cg = ClassGroup.objects.filter(pk=class_group_id).prefetch_related("fee_plans", "students").first()
    if not cg:
        return api_error(f"ClassGroup '{class_group_id}' tidak ditemukan.", code="NOT_FOUND", status=404)

    if request.method == "GET":
        return api_success(serialize_class_group(cg))

    elif request.method in ("PATCH", "PUT"):
        if request.user.is_authenticated and not request.user.is_admin_role():
            return api_error("Hanya admin yang dapat mengedit rombel.", code="FORBIDDEN", status=403)

        try:
            body = json.loads(request.body.decode("utf-8")) if request.body else {}
        except Exception:
            return api_error("Format JSON tidak valid.", code="VALIDATION_ERROR")

        if "name" in body:
            new_name = (body.get("name") or "").strip()
            if not new_name:
                return api_error("Nama rombel tidak boleh kosong.", code="VALIDATION_ERROR", fields={"name": ["Wajib diisi"]})
            if ClassGroup.objects.filter(name__iexact=new_name, subject=cg.subject).exclude(pk=cg.id).exists():
                return api_error(f"Rombel dengan nama '{new_name}' sudah ada.", code="DUPLICATE_NAME", status=400)
            cg.name = new_name

        if "default_room" in body:
            cg.room = body.get("default_room") or ""
        elif "room" in body:
            cg.room = body.get("room") or ""

        if "teacher" in body or "teacher_id" in body:
            t_id = body.get("teacher") or body.get("teacher_id")
            if t_id:
                tp = TeacherProfile.objects.filter(pk=t_id).first()
                if tp:
                    cg.teacher = tp

        if "is_active" in body:
            cg.is_active = bool(body["is_active"])

        cg.save()
        return api_success(serialize_class_group(cg))

    elif request.method == "DELETE":
        if request.user.is_authenticated and not request.user.is_admin_role():
            return api_error("Hanya admin yang dapat mengarsipkan rombel.", code="FORBIDDEN", status=403)

        # Soft-archive rombel to preserve historical schedule, attendance, and finance data
        cg.is_active = False
        cg.save(update_fields=["is_active"])
        return api_success(serialize_class_group(cg))

    return api_error("Metode tidak diizinkan.", code="METHOD_NOT_ALLOWED", status=405)


@csrf_exempt
def v1_class_group_monthly_recap(request, class_group_id):
    cg = ClassGroup.objects.filter(pk=class_group_id).first()
    if not cg:
        return api_error(f"ClassGroup '{class_group_id}' tidak ditemukan.", code="NOT_FOUND", status=404)

    month_param = request.GET.get("month") or timezone.localdate().strftime("%Y-%m")
    try:
        parts = month_param.split("-")
        year = int(parts[0])
        month = int(parts[1])
    except Exception:
        today = timezone.localdate()
        year, month = today.year, today.month

    enrollments = Enrollment.objects.filter(class_group=cg, is_active=True).select_related("student", "fee_plan")
    students_recap = []
    for e in enrollments:
        st = e.student
        att_qs = StudentAttendance.objects.filter(
            student=st,
            session__schedule__class_group=cg,
            session__schedule__date__year=year,
            session__schedule__date__month=month,
        )
        total_sess = att_qs.count()
        present = att_qs.filter(status=StudentAttendance.Status.PRESENT).count()
        permit = att_qs.filter(status=StudentAttendance.Status.PERMIT).count()
        sick = att_qs.filter(status=StudentAttendance.Status.SICK).count()
        absent = att_qs.filter(status=StudentAttendance.Status.ABSENT).count()
        rate = round((present / total_sess * 100), 1) if total_sess > 0 else (100.0 if present > 0 else 0.0)

        fee_plan_name = e.fee_plan.name if e.fee_plan else "Reguler"
        fee_amount = float(e.fee_plan.monthly_amount_rupiah) if e.fee_plan else 650000.0

        payment_obj = Payment.objects.filter(
            student=st,
            period__year=year,
            period__month=month,
        ).first()

        if payment_obj:
            txs = list(payment_obj.transactions.all())
            paid = sum((t.amount_rupiah for t in txs if t.status == "VERIFIED"), Decimal("0"))
            amount_due = payment_obj.amount_due
            outstanding = max(Decimal("0"), amount_due - paid)
            if payment_obj.fee_plan:
                fee_plan_name = payment_obj.fee_plan.name
            if paid >= amount_due and amount_due > 0:
                p_status = "PAID"
            elif paid > 0:
                p_status = "PARTIAL"
            elif payment_obj.due_date and payment_obj.due_date < timezone.localdate():
                p_status = "OVERDUE"
            else:
                p_status = "UNPAID"
            amount_due_num = float(amount_due)
            paid_num = float(paid)
            outstanding_num = float(outstanding)
        else:
            p_status = "UNPAID"
            amount_due_num = fee_amount
            paid_num = 0.0
            outstanding_num = fee_amount

        students_recap.append({
            "student": {
                "id": str(st.id),
                "student_code": st.student_id,
                "full_name": st.full_name,
                "school": st.school or "",
            },
            "payment": {
                "status": p_status,
                "fee_plan_name": fee_plan_name,
                "amount_due_rupiah": amount_due_num,
                "paid_rupiah": paid_num,
                "outstanding_rupiah": outstanding_num,
            },
            "finance": {
                "billed_rupiah": amount_due_num,
                "paid_rupiah": paid_num,
                "outstanding_rupiah": outstanding_num,
            },
            "attendance": {
                "total_sessions": total_sess,
                "present": present,
                "permit": permit,
                "sick": sick,
                "absent": absent,
                "attendance_rate": rate,
            },
        })

    return api_success({
        "class_group": {"id": str(cg.id), "name": cg.name},
        "month": month_param,
        "students": students_recap,
        "count": len(students_recap),
    })


# ------------------------------------------------------------------------------
# Enrollments & Roster Batch
# ------------------------------------------------------------------------------
@csrf_exempt
def v1_enrollments(request):
    qs = Enrollment.objects.select_related("student", "class_group", "fee_plan").all()

    cg_id = request.GET.get("class_group")
    if cg_id:
        try:
            qs = qs.filter(class_group_id=cg_id)
        except Exception:
            qs = qs.none()

    status_param = request.GET.get("status")
    if status_param:
        st_norm = status_param.strip().upper()
        if st_norm == "ACTIVE":
            qs = qs.filter(is_active=True)
        elif st_norm in ("INACTIVE", "ARCHIVED"):
            qs = qs.filter(is_active=False)
        else:
            qs = qs.none()
    else:
        # Default behavior: active enrollments
        qs = qs.filter(is_active=True)

    results = [serialize_enrollment(e) for e in qs]
    return api_success(results, meta={"total": len(results)})


@csrf_exempt
def v1_enrollments_roster_batch(request):
    if request.method != "POST":
        return api_error("Metode tidak diizinkan.", code="METHOD_NOT_ALLOWED", status=405)

    if request.user.is_authenticated and not request.user.is_admin_role():
        return api_error("Hanya admin yang dapat mengubah roster siswa.", code="FORBIDDEN", status=403)

    try:
        body = json.loads(request.body.decode("utf-8")) if request.body else {}
    except Exception:
        return api_error("Format JSON tidak valid.", code="VALIDATION_ERROR")

    cg_id = body.get("class_group_id")
    if not cg_id:
        return api_error("class_group_id wajib diisi.", code="VALIDATION_ERROR", fields={"class_group_id": ["Wajib diisi"]})

    cg = ClassGroup.objects.filter(pk=cg_id).first()
    if not cg:
        return api_error(f"ClassGroup '{cg_id}' tidak ditemukan.", code="NOT_FOUND", status=404)

    items = body.get("items", [])
    if not isinstance(items, list):
        return api_error("items harus berupa daftar array.", code="VALIDATION_ERROR")

    # Pre-validate items before any database write
    for idx, item in enumerate(items):
        action = item.get("action", "upsert")
        if action == "archive":
            if not item.get("student_id"):
                return api_error(f"Item #{idx}: student_id wajib diisi untuk aksi archive.", code="VALIDATION_ERROR")
        elif action == "upsert":
            if not item.get("student_id") and not (item.get("full_name") or "").strip():
                return api_error(f"Item #{idx}: full_name wajib diisi untuk siswa baru.", code="VALIDATION_ERROR")
        else:
            return api_error(f"Item #{idx}: aksi '{action}' tidak dikenal.", code="VALIDATION_ERROR")

    # Atomic transaction: all changes succeed or all rollback
    try:
        with transaction.atomic():
            for item in items:
                action = item.get("action", "upsert")
                st_id = item.get("student_id")

                if action == "archive":
                    st = _find_student(st_id)
                    if not st:
                        raise ValidationError(f"Siswa '{st_id}' tidak ditemukan.")
                    Enrollment.objects.filter(student=st, class_group=cg).update(is_active=False)

                elif action == "upsert":
                    st = None
                    if st_id:
                        st = _find_student(st_id)

                    if not st:
                        full_name = item.get("full_name", "").strip()
                        grade = item.get("grade_level") or cg.name
                        school = item.get("school") or ""
                        st_code = f"STD-{datetime.now().strftime('%y%m%d%H%M%S')}-{uuid.uuid4().hex[:4].upper()}"
                        st = Student.objects.create(
                            student_id=st_code,
                            full_name=full_name,
                            school=school,
                            grade=grade,
                            status=Student.Status.ACTIVE,
                        )
                    else:
                        if item.get("full_name"):
                            st.full_name = item["full_name"].strip()
                        if item.get("school"):
                            st.school = item["school"].strip()
                        st.save()

                    # Fee plan assignment
                    fp = None
                    fp_id = item.get("fee_plan_id")
                    if fp_id:
                        fp = FeePlan.objects.filter(pk=fp_id).first()
                    if not fp:
                        fp = FeePlan.objects.filter(class_group=cg, is_active=True).first()

                    # Ensure enrollment exists without duplicating
                    enr, _ = Enrollment.objects.get_or_create(student=st, class_group=cg)
                    enr.is_active = True
                    enr.fee_plan = fp
                    if item.get("started_on"):
                        try:
                            enr.joined_at = datetime.strptime(item["started_on"][:10], "%Y-%m-%d").date()
                        except Exception:
                            pass
                    enr.save()
    except ValidationError as e:
        return api_error(str(e.message if hasattr(e, "message") else e), code="VALIDATION_ERROR", status=400)
    except Exception as e:
        return api_error(f"Gagal memproses batch: {str(e)}", code="BATCH_ERROR", status=400)

    active_enrollments = Enrollment.objects.filter(class_group=cg, is_active=True).select_related("student", "class_group", "fee_plan")
    results = [serialize_enrollment(e) for e in active_enrollments]
    return api_success(results, meta={"total": len(results)})


# ------------------------------------------------------------------------------
# Fee Plans CRUD
# ------------------------------------------------------------------------------
@csrf_exempt
def v1_fee_plans(request):
    if request.method == "GET":
        qs = FeePlan.objects.select_related("class_group").prefetch_related("enrollments").all()
        cg_id = request.GET.get("class_group")
        if cg_id:
            try:
                qs = qs.filter(class_group_id=cg_id)
            except Exception:
                qs = qs.none()

        is_active = request.GET.get("is_active")
        if is_active is not None:
            if is_active.lower() in ("true", "1"):
                qs = qs.filter(is_active=True)
            elif is_active.lower() in ("false", "0"):
                qs = qs.filter(is_active=False)

        results = [serialize_fee_plan(p) for p in qs]
        return api_success(results, meta={"total": len(results)})

    elif request.method == "POST":
        if request.user.is_authenticated and not request.user.is_admin_role():
            return api_error("Hanya admin yang dapat membuat kategori iuran.", code="FORBIDDEN", status=403)

        try:
            body = json.loads(request.body.decode("utf-8")) if request.body else {}
        except Exception:
            return api_error("Format JSON tidak valid.", code="VALIDATION_ERROR")

        cg_id = body.get("class_group")
        if not cg_id:
            return api_error("class_group wajib diisi.", code="VALIDATION_ERROR", fields={"class_group": ["Wajib diisi"]})

        cg = ClassGroup.objects.filter(pk=cg_id).first()
        if not cg:
            return api_error(f"ClassGroup '{cg_id}' tidak ditemukan.", code="NOT_FOUND", status=404)

        name = (body.get("name") or "").strip()
        if not name:
            return api_error("Nama kategori iuran wajib diisi.", code="VALIDATION_ERROR", fields={"name": ["Wajib diisi"]})

        try:
            raw_amount = body.get("monthly_amount_rupiah")
            amount = Decimal(str(raw_amount if raw_amount is not None else 0))
        except Exception:
            return api_error("Nominal iuran tidak valid.", code="VALIDATION_ERROR", fields={"monthly_amount_rupiah": ["Format angka tidak valid"]})

        if amount < 0:
            return api_error("Nominal iuran tidak boleh negatif.", code="VALIDATION_ERROR", fields={"monthly_amount_rupiah": ["Harus bernilai positif atau nol"]})

        eff_from = timezone.localdate()
        if body.get("effective_from"):
            try:
                eff_from = datetime.strptime(body["effective_from"][:10], "%Y-%m-%d").date()
            except Exception:
                pass

        eff_until = None
        if body.get("effective_until"):
            try:
                eff_until = datetime.strptime(body["effective_until"][:10], "%Y-%m-%d").date()
            except Exception:
                pass

        plan = FeePlan.objects.create(
            class_group=cg,
            name=name,
            monthly_amount_rupiah=amount,
            effective_from=eff_from,
            effective_until=eff_until,
            is_active=bool(body.get("is_active", True)),
        )
        return api_success(serialize_fee_plan(plan), status=201)

    return api_error("Metode tidak diizinkan.", code="METHOD_NOT_ALLOWED", status=405)


@csrf_exempt
def v1_fee_plan_detail(request, fee_plan_id):
    plan = FeePlan.objects.filter(pk=fee_plan_id).first()
    if not plan:
        return api_error(f"FeePlan '{fee_plan_id}' tidak ditemukan.", code="NOT_FOUND", status=404)

    if request.method == "GET":
        return api_success(serialize_fee_plan(plan))

    elif request.method in ("PATCH", "PUT"):
        if request.user.is_authenticated and not request.user.is_admin_role():
            return api_error("Hanya admin yang dapat mengedit fee plan.", code="FORBIDDEN", status=403)

        try:
            body = json.loads(request.body.decode("utf-8")) if request.body else {}
        except Exception:
            return api_error("Format JSON tidak valid.", code="VALIDATION_ERROR")

        if "name" in body:
            new_name = (body.get("name") or "").strip()
            if not new_name:
                return api_error("Nama kategori iuran tidak boleh kosong.", code="VALIDATION_ERROR", fields={"name": ["Wajib diisi"]})
            plan.name = new_name

        if "monthly_amount_rupiah" in body:
            try:
                amount = Decimal(str(body["monthly_amount_rupiah"]))
                if amount < 0:
                    return api_error("Nominal iuran tidak boleh negatif.", code="VALIDATION_ERROR", fields={"monthly_amount_rupiah": ["Harus bernilai positif atau nol"]})
                plan.monthly_amount_rupiah = amount
            except Exception:
                return api_error("Nominal iuran tidak valid.", code="VALIDATION_ERROR", fields={"monthly_amount_rupiah": ["Format angka tidak valid"]})

        if "is_active" in body:
            plan.is_active = bool(body["is_active"])

        if "effective_until" in body:
            if body["effective_until"]:
                try:
                    plan.effective_until = datetime.strptime(body["effective_until"][:10], "%Y-%m-%d").date()
                except Exception:
                    pass
            else:
                plan.effective_until = None

        plan.save()
        return api_success(serialize_fee_plan(plan))

    elif request.method == "DELETE":
        if request.user.is_authenticated and not request.user.is_admin_role():
            return api_error("Hanya admin yang dapat mengarsipkan fee plan.", code="FORBIDDEN", status=403)

        plan.is_active = False
        plan.effective_until = timezone.localdate()
        plan.save(update_fields=["is_active", "effective_until"])
        return api_success(serialize_fee_plan(plan))

    return api_error("Metode tidak diizinkan.", code="METHOD_NOT_ALLOWED", status=405)


@csrf_exempt
def v1_fee_plan_replace_and_archive(request, fee_plan_id):
    if request.method != "POST":
        return api_error("Metode tidak diizinkan.", code="METHOD_NOT_ALLOWED", status=405)

    if request.user.is_authenticated and not request.user.is_admin_role():
        return api_error("Hanya admin yang dapat mengarsipkan kategori iuran.", code="FORBIDDEN", status=403)

    plan = FeePlan.objects.filter(pk=fee_plan_id).first()
    if not plan:
        return api_error(f"FeePlan '{fee_plan_id}' tidak ditemukan.", code="NOT_FOUND", status=404)

    try:
        body = json.loads(request.body.decode("utf-8")) if request.body else {}
    except Exception:
        body = {}

    replacement_id = body.get("replacement")
    moved_count = 0

    with transaction.atomic():
        if replacement_id:
            rep = FeePlan.objects.filter(pk=replacement_id).first()
            if not rep:
                return api_error(f"Replacement FeePlan '{replacement_id}' tidak ditemukan.", code="NOT_FOUND", status=404)
            moved_count = Enrollment.objects.filter(fee_plan=plan).update(fee_plan=rep)
        else:
            moved_count = Enrollment.objects.filter(fee_plan=plan).update(fee_plan=None)

        plan.is_active = False
        plan.effective_until = timezone.localdate()
        plan.save(update_fields=["is_active", "effective_until"])

    return api_success({"moved_count": moved_count})


# ------------------------------------------------------------------------------
# Dynamic Rooms
# ------------------------------------------------------------------------------
def v1_rooms(request):
    cg_rooms = set(ClassGroup.objects.exclude(room="").values_list("room", flat=True))
    default_rooms = [
        "Ruang 101", "Ruang 102", "Ruang 103",
        "Ruang 201", "Ruang 202", "Ruang 203",
        "Ruang 301", "Ruang 302",
        "Ruang Alpha", "Ruang Beta", "Ruang Gamma",
        "Ruang Studio", "Ruang Audiovisual",
    ]
    all_rooms = sorted(list(cg_rooms.union(default_rooms)))
    results = [
        {"id": str(i + 1), "name": r, "capacity": 20, "is_active": True}
        for i, r in enumerate(all_rooms)
    ]
    return api_success(results, meta={"total": len(results)})


# ------------------------------------------------------------------------------
# Teachers CRUD
# ------------------------------------------------------------------------------
def serialize_teacher(t: TeacherProfile) -> dict:
    u = t.user
    name = u.get_full_name() or u.username
    teacher_code = u.username if u.username else f"TCH-{t.id:03d}"
    assigned = [
        {"id": str(cg.id), "name": cg.name, "level": cg.name}
        for cg in t.class_groups.filter(is_active=True).order_by("name")
    ]
    return {
        "id": str(t.id),
        "user_id": str(u.id),
        "email": u.email,
        "full_name": name,
        "teacher_code": teacher_code,
        "phone": t.phone or "",
        "specialization": t.specialization or "",
        "is_active": t.is_active,
        "account_role": "ADMIN" if u.is_admin_role() else "TEACHER",
        "assigned_classes": assigned,
    }


@csrf_exempt
def v1_teachers(request):
    if request.method == "GET":
        qs = TeacherProfile.objects.select_related("user").prefetch_related("class_groups").all()

        is_active_param = request.GET.get("is_active")
        if is_active_param is not None:
            if is_active_param.lower() in ("true", "1"):
                qs = qs.filter(is_active=True)
            elif is_active_param.lower() in ("false", "0"):
                qs = qs.filter(is_active=False)

        search = request.GET.get("search")
        if search:
            search = search.strip()
            qs = qs.filter(
                models.Q(user__first_name__icontains=search)
                | models.Q(user__last_name__icontains=search)
                | models.Q(user__username__icontains=search)
                | models.Q(user__email__icontains=search)
                | models.Q(specialization__icontains=search)
                | models.Q(phone__icontains=search)
            )

        results = [serialize_teacher(t) for t in qs.order_by("id")]
        return api_success(results, meta={"total": len(results)})

    elif request.method == "POST":
        if request.user.is_authenticated and not request.user.is_admin_role():
            return api_error("Hanya admin yang dapat membuat akun pengajar.", code="FORBIDDEN", status=403)

        try:
            body = json.loads(request.body.decode("utf-8")) if request.body else {}
        except Exception:
            return api_error("Format JSON tidak valid.", code="VALIDATION_ERROR")

        full_name = (body.get("full_name") or "").strip()
        if not full_name:
            return api_error("Nama lengkap pengajar wajib diisi.", code="VALIDATION_ERROR", fields={"full_name": ["Wajib diisi"]})

        email = (body.get("email") or "").strip().lower()
        if not email:
            return api_error("Email pengajar wajib diisi.", code="VALIDATION_ERROR", fields={"email": ["Wajib diisi"]})

        if User.objects.filter(email__iexact=email).exists():
            return api_error("Email ini sudah digunakan oleh akun lain.", code="DUPLICATE_EMAIL", status=400, fields={"email": ["Email sudah terdaftar"]})

        teacher_code = (body.get("teacher_code") or "").strip()
        if not teacher_code:
            teacher_code = email.split("@")[0]

        username = teacher_code
        if User.objects.filter(username__iexact=username).exists():
            username = f"{teacher_code}_{uuid.uuid4().hex[:4]}"

        password = body.get("password")
        if not password:
            from django.utils.crypto import get_random_string
            password = get_random_string(12)

        phone = (body.get("phone") or "").strip()
        specialization = (body.get("specialization") or "").strip()
        is_active = bool(body.get("is_active", True))

        parts = full_name.split(" ", 1)
        first_name = parts[0]
        last_name = parts[1] if len(parts) > 1 else ""

        with transaction.atomic():
            user = User.objects.create_user(
                username=username,
                email=email,
                password=password,
                first_name=first_name,
                last_name=last_name,
                role=User.Role.TEACHER,
                is_active=is_active,
            )
            tp = TeacherProfile.objects.create(
                user=user,
                phone=phone,
                specialization=specialization,
                is_active=is_active,
            )

            class_group_ids = body.get("class_group_ids", [])
            if class_group_ids:
                ClassGroup.objects.filter(pk__in=class_group_ids).update(teacher=tp)

        return api_success(serialize_teacher(tp), status=201)

    return api_error("Metode tidak diizinkan.", code="METHOD_NOT_ALLOWED", status=405)


@csrf_exempt
def v1_teacher_detail(request, teacher_id):
    tp = TeacherProfile.objects.filter(pk=teacher_id).select_related("user").prefetch_related("class_groups").first()
    if not tp:
        return api_error(f"Teacher '{teacher_id}' tidak ditemukan.", code="NOT_FOUND", status=404)

    if request.method == "GET":
        return api_success(serialize_teacher(tp))

    elif request.method in ("PATCH", "PUT"):
        if request.user.is_authenticated and not request.user.is_admin_role():
            return api_error("Hanya admin yang dapat mengedit profil pengajar.", code="FORBIDDEN", status=403)

        try:
            body = json.loads(request.body.decode("utf-8")) if request.body else {}
        except Exception:
            return api_error("Format JSON tidak valid.", code="VALIDATION_ERROR")

        if "email" in body:
            new_email = (body.get("email") or "").strip().lower()
            if not new_email:
                return api_error("Email tidak boleh kosong.", code="VALIDATION_ERROR", fields={"email": ["Wajib diisi"]})
            if new_email != tp.user.email.lower():
                if User.objects.filter(email__iexact=new_email).exclude(pk=tp.user.pk).exists():
                    return api_error("Email ini sudah digunakan oleh akun lain.", code="DUPLICATE_EMAIL", status=400, fields={"email": ["Email sudah terdaftar"]})
                tp.user.email = new_email

        if "full_name" in body:
            new_name = (body.get("full_name") or "").strip()
            if new_name:
                parts = new_name.split(" ", 1)
                tp.user.first_name = parts[0]
                tp.user.last_name = parts[1] if len(parts) > 1 else ""

        if "password" in body and body["password"]:
            pwd = str(body["password"]).strip()
            if pwd:
                tp.user.set_password(pwd)

        if "teacher_code" in body:
            code = (body.get("teacher_code") or "").strip()
            if code and code != tp.user.username:
                if User.objects.filter(username__iexact=code).exclude(pk=tp.user.pk).exists():
                    return api_error("Kode pengajar / username ini sudah digunakan.", code="DUPLICATE_USERNAME", status=400)
                tp.user.username = code

        if "phone" in body:
            tp.phone = (body.get("phone") or "").strip()

        if "specialization" in body:
            tp.specialization = (body.get("specialization") or "").strip()

        if "is_active" in body:
            new_active = bool(body["is_active"])
            tp.is_active = new_active
            tp.user.is_active = new_active

        with transaction.atomic():
            tp.user.save()
            tp.save()
            if "class_group_ids" in body:
                cg_ids = body.get("class_group_ids") or []
                ClassGroup.objects.filter(pk__in=cg_ids).update(teacher=tp)

        return api_success(serialize_teacher(tp))

    elif request.method == "DELETE":
        if request.user.is_authenticated and not request.user.is_admin_role():
            return api_error("Hanya admin yang dapat menonaktifkan pengajar.", code="FORBIDDEN", status=403)

        with transaction.atomic():
            tp.is_active = False
            tp.user.is_active = False
            tp.user.save(update_fields=["is_active"])
            tp.save(update_fields=["is_active"])

        return api_success(serialize_teacher(tp))

    return api_error("Metode tidak diizinkan.", code="METHOD_NOT_ALLOWED", status=405)


# ------------------------------------------------------------------------------
# Students CRUD & Monthly Recap
# ------------------------------------------------------------------------------
def serialize_student(s: Student) -> dict:
    return {
        "id": str(s.id),
        "student_code": s.student_id,
        "full_name": s.full_name,
        "birth_date": s.birth_date.isoformat() if s.birth_date else None,
        "school": s.school or "",
        "grade_level": s.grade or "",
        "parent_name": s.parent_name or "",
        "parent_phone": s.parent_phone or "",
        "status": s.status.upper() if s.status else "ACTIVE",
        "created_at": s.created_at.isoformat() if s.created_at else "",
        "updated_at": s.updated_at.isoformat() if s.updated_at else "",
    }


@csrf_exempt
def v1_students(request):
    if request.method == "GET":
        qs = Student.objects.all()

        status_param = request.GET.get("status")
        if status_param:
            st_norm = status_param.lower().strip()
            if st_norm in ("active", "inactive", "archived"):
                qs = qs.filter(status=st_norm)

        search = request.GET.get("search")
        if search:
            search = search.strip()
            qs = qs.filter(
                models.Q(full_name__icontains=search)
                | models.Q(student_id__icontains=search)
                | models.Q(school__icontains=search)
                | models.Q(grade__icontains=search)
                | models.Q(parent_name__icontains=search)
            )

        grade = request.GET.get("grade") or request.GET.get("grade_level")
        if grade:
            qs = qs.filter(grade__iexact=grade.strip())

        cg_id = request.GET.get("class_group")
        if cg_id:
            qs = qs.filter(enrollment__class_group_id=cg_id, enrollment__is_active=True)

        results = [serialize_student(s) for s in qs.order_by("full_name")]
        return api_success(results, meta={"total": len(results)})

    elif request.method == "POST":
        if request.user.is_authenticated and not request.user.is_admin_role():
            return api_error("Hanya admin yang dapat mendaftarkan siswa baru.", code="FORBIDDEN", status=403)

        try:
            body = json.loads(request.body.decode("utf-8")) if request.body else {}
        except Exception:
            return api_error("Format JSON tidak valid.", code="VALIDATION_ERROR")

        full_name = (body.get("full_name") or "").strip()
        if not full_name:
            return api_error("Nama lengkap siswa wajib diisi.", code="VALIDATION_ERROR", fields={"full_name": ["Wajib diisi"]})

        code = (body.get("student_code") or body.get("student_id") or "").strip()
        if code:
            if Student.objects.filter(student_id__iexact=code).exists():
                return api_error(f"Kode siswa '{code}' sudah terdaftar.", code="DUPLICATE_STUDENT_CODE", status=400, fields={"student_code": ["Kode siswa sudah terdaftar"]})
        else:
            code = f"STD-{timezone.localdate().strftime('%y%m%d')}-{uuid.uuid4().hex[:4].upper()}"

        school = (body.get("school") or "").strip()
        grade = (body.get("grade_level") or body.get("grade") or "").strip()
        parent_name = (body.get("parent_name") or "").strip()
        parent_phone = (body.get("parent_phone") or "").strip()

        birth_date = None
        if body.get("birth_date"):
            try:
                birth_date = datetime.strptime(body["birth_date"][:10], "%Y-%m-%d").date()
            except Exception:
                return api_error("Format tanggal lahir tidak valid. Gunakan YYYY-MM-DD.", code="VALIDATION_ERROR", fields={"birth_date": ["Format tanggal tidak valid"]})

        raw_status = (body.get("status") or "ACTIVE").lower().strip()
        st_status = raw_status if raw_status in ("active", "inactive", "archived") else Student.Status.ACTIVE

        with transaction.atomic():
            student = Student.objects.create(
                student_id=code,
                full_name=full_name,
                school=school,
                grade=grade,
                birth_date=birth_date,
                parent_name=parent_name,
                parent_phone=parent_phone,
                status=st_status,
            )

            cg_id = body.get("class_group_id") or body.get("class_group")
            if cg_id:
                cg = ClassGroup.objects.filter(pk=cg_id).first()
                if cg:
                    fp = None
                    fp_id = body.get("fee_plan_id")
                    if fp_id:
                        fp = FeePlan.objects.filter(pk=fp_id).first()
                    if not fp:
                        fp = FeePlan.objects.filter(class_group=cg, is_active=True).first()
                    Enrollment.objects.get_or_create(
                        student=student,
                        class_group=cg,
                        defaults={"fee_plan": fp, "is_active": True},
                    )

        return api_success(serialize_student(student), status=201)

    return api_error("Metode tidak diizinkan.", code="METHOD_NOT_ALLOWED", status=405)


@csrf_exempt
def v1_student_detail(request, student_id):
    student = _find_student(student_id)
    if not student:
        return api_error(f"Siswa '{student_id}' tidak ditemukan.", code="NOT_FOUND", status=404)

    if request.method == "GET":
        return api_success(serialize_student(student))

    elif request.method in ("PATCH", "PUT"):
        if request.user.is_authenticated and not request.user.is_admin_role():
            return api_error("Hanya admin yang dapat mengedit data siswa.", code="FORBIDDEN", status=403)

        try:
            body = json.loads(request.body.decode("utf-8")) if request.body else {}
        except Exception:
            return api_error("Format JSON tidak valid.", code="VALIDATION_ERROR")

        if "full_name" in body:
            name = (body.get("full_name") or "").strip()
            if not name:
                return api_error("Nama lengkap siswa tidak boleh kosong.", code="VALIDATION_ERROR", fields={"full_name": ["Wajib diisi"]})
            student.full_name = name

        if "student_code" in body or "student_id" in body:
            new_code = (body.get("student_code") or body.get("student_id") or "").strip()
            if new_code and new_code != student.student_id:
                if Student.objects.filter(student_id__iexact=new_code).exclude(pk=student.pk).exists():
                    return api_error(f"Kode siswa '{new_code}' sudah terdaftar.", code="DUPLICATE_STUDENT_CODE", status=400, fields={"student_code": ["Kode siswa sudah terdaftar"]})
                student.student_id = new_code

        if "school" in body:
            student.school = (body.get("school") or "").strip()

        if "grade_level" in body or "grade" in body:
            student.grade = (body.get("grade_level") or body.get("grade") or "").strip()

        if "birth_date" in body:
            if body["birth_date"]:
                try:
                    student.birth_date = datetime.strptime(body["birth_date"][:10], "%Y-%m-%d").date()
                except Exception:
                    return api_error("Format tanggal lahir tidak valid. Gunakan YYYY-MM-DD.", code="VALIDATION_ERROR", fields={"birth_date": ["Format tanggal tidak valid"]})
            else:
                student.birth_date = None

        if "parent_name" in body:
            student.parent_name = (body.get("parent_name") or "").strip()

        if "parent_phone" in body:
            student.parent_phone = (body.get("parent_phone") or "").strip()

        if "status" in body:
            raw_status = (body.get("status") or "").lower().strip()
            if raw_status in ("active", "inactive", "archived"):
                student.status = raw_status

        student.save()
        return api_success(serialize_student(student))

    elif request.method == "DELETE":
        if request.user.is_authenticated and not request.user.is_admin_role():
            return api_error("Hanya admin yang dapat mengarsipkan siswa.", code="FORBIDDEN", status=403)

        with transaction.atomic():
            student.status = Student.Status.ARCHIVED
            student.save(update_fields=["status", "updated_at"])
            Enrollment.objects.filter(student=student, is_active=True).update(is_active=False)

        return api_success(serialize_student(student))

    return api_error("Metode tidak diizinkan.", code="METHOD_NOT_ALLOWED", status=405)


@csrf_exempt
def v1_student_monthly_recap(request, student_id):
    student = _find_student(student_id)
    if not student:
        return api_error(f"Siswa '{student_id}' tidak ditemukan.", code="NOT_FOUND", status=404)

    month_param = request.GET.get("month") or timezone.localdate().strftime("%Y-%m")
    try:
        parts = month_param.split("-")
        year = int(parts[0])
        month_num = int(parts[1])
    except Exception:
        today = timezone.localdate()
        year, month_num = today.year, today.month

    # Class group and fee plan from recent/active enrollment
    enr = (
        Enrollment.objects.filter(student=student)
        .select_related("class_group", "fee_plan")
        .order_by("-is_active", "-joined_at")
        .first()
    )
    cg = enr.class_group if enr else None

    # Attendance calculations
    att_qs = StudentAttendance.objects.filter(
        student=student,
        session__schedule__date__year=year,
        session__schedule__date__month=month_num,
    )
    total_sess = att_qs.count()
    present = att_qs.filter(status=StudentAttendance.Status.PRESENT).count()
    permit = att_qs.filter(status=StudentAttendance.Status.PERMIT).count()
    sick = att_qs.filter(status=StudentAttendance.Status.SICK).count()
    absent = att_qs.filter(status=StudentAttendance.Status.ABSENT).count()
    rate = round((present / total_sess * 100), 1) if total_sess > 0 else (100.0 if present > 0 else 0.0)

    # Payment calculations
    payment_obj = Payment.objects.filter(
        student=student,
        period__year=year,
        period__month=month_num,
    ).first()

    if payment_obj:
        txs = list(payment_obj.transactions.all())
        paid = sum((t.amount_rupiah for t in txs if t.status == "VERIFIED"), Decimal("0"))
        amount_due = payment_obj.amount_due
        outstanding = max(Decimal("0"), amount_due - paid)
        fee_plan_name = (
            payment_obj.fee_plan.name
            if payment_obj.fee_plan
            else (enr.fee_plan.name if enr and enr.fee_plan else "Reguler")
        )
        if paid >= amount_due and amount_due > 0:
            p_status = "PAID"
        elif paid > 0:
            p_status = "PARTIAL"
        elif payment_obj.due_date and payment_obj.due_date < timezone.localdate():
            p_status = "OVERDUE"
        else:
            p_status = "UNPAID"
    else:
        fee_plan_name = enr.fee_plan.name if enr and enr.fee_plan else "Reguler"
        amount_due = enr.fee_plan.monthly_amount_rupiah if enr and enr.fee_plan else Decimal("650000.00")
        paid = Decimal("0")
        outstanding = amount_due
        p_status = "UNPAID"

    return api_success({
        "student": {
            "id": str(student.id),
            "student_code": student.student_id,
            "full_name": student.full_name,
            "school": student.school or "",
        },
        "class_group": {"id": str(cg.id), "name": cg.name} if cg else None,
        "month": f"{year:04d}-{month_num:02d}",
        "payment": {
            "status": p_status,
            "fee_plan_name": fee_plan_name,
            "amount_due_rupiah": float(amount_due),
            "paid_rupiah": float(paid),
            "outstanding_rupiah": float(outstanding),
        },
        "attendance": {
            "total_sessions": total_sess,
            "present": present,
            "permit": permit,
            "sick": sick,
            "absent": absent,
            "attendance_rate": rate,
        },
    })
