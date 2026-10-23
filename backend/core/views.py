import json
from datetime import datetime
from django.contrib.auth import authenticate, get_user_model, login, logout
from django.db.models import Count, Sum
from django.http import HttpResponse, JsonResponse
from django.middleware.csrf import get_token
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt, ensure_csrf_cookie

from .models import (
    ClassGroup,
    Enrollment,
    FeePlan,
    Payment,
    Schedule,
    SessionRecord,
    Student,
    StudentAttendance,
    Subject,
    TeacherProfile,
)

User = get_user_model()


def serialize_current_user(user):
    is_admin = user.is_admin_role()
    teacher_id = None
    if hasattr(user, "teacher_profile"):
        teacher_id = str(user.teacher_profile.id)

    return {
        "id": str(user.id),
        "email": user.email,
        "full_name": user.get_full_name() or user.username,
        "role": "ADMIN" if is_admin else "TEACHER",
        "teacher_id": teacher_id,
        "permissions": {
            "manage_academics": is_admin,
            "manage_schedule": is_admin,
            "manage_finance": is_admin,
            "record_assigned_payments": True,
            "execute_assigned_sessions": True,
        },
    }


# ------------------------------------------------------------------------------
# Auth Endpoints (used by frontend /api/v1/auth/*)
# ------------------------------------------------------------------------------
@ensure_csrf_cookie
def auth_csrf(request):
    token = get_token(request)
    return JsonResponse({
        "data": {"csrf": token},
        "meta": {"request_id": request.headers.get("X-Request-ID", "")},
    })


@csrf_exempt
def auth_login(request):
    if request.method != "POST":
        return JsonResponse(
            {"error": {"code": "METHOD_NOT_ALLOWED", "message": "Metode tidak diizinkan.", "fields": {}, "request_id": ""}},
            status=405,
        )

    try:
        payload = json.loads(request.body.decode("utf-8")) if request.body else {}
    except Exception:
        payload = {}

    identifier = (payload.get("email") or payload.get("username") or "").strip()
    password = payload.get("password", "")

    if not identifier or not password:
        return JsonResponse(
            {"error": {"code": "VALIDATION_ERROR", "message": "Email dan kata sandi wajib diisi.", "fields": {}, "request_id": ""}},
            status=400,
        )

    # Search user by email first, then username
    user = None
    try:
        user_obj = User.objects.filter(email__iexact=identifier).first()
        if user_obj:
            user = authenticate(request, username=user_obj.username, password=password)
    except Exception:
        pass

    if user is None:
        user = authenticate(request, username=identifier, password=password)

    if user is None or not user.is_active:
        return JsonResponse(
            {"error": {"code": "VALIDATION_ERROR", "message": "Email atau kata sandi tidak valid.", "fields": {}, "request_id": ""}},
            status=400,
        )

    login(request, user)
    return JsonResponse({
        "data": serialize_current_user(user),
        "meta": {"request_id": request.headers.get("X-Request-ID", "")},
    })


@csrf_exempt
def auth_logout(request):
    logout(request)
    return HttpResponse(status=204)


def auth_me(request):
    if not request.user.is_authenticated:
        return JsonResponse(
            {"error": {"code": "NOT_AUTHENTICATED", "message": "Autentikasi diperlukan.", "fields": {}, "request_id": ""}},
            status=401,
        )
    return JsonResponse({
        "data": serialize_current_user(request.user),
        "meta": {"request_id": request.headers.get("X-Request-ID", "")},
    })


# ------------------------------------------------------------------------------
# Core Endpoints (Health, Dashboard, Notifications)
# ------------------------------------------------------------------------------
def health(request):
    return JsonResponse({"status": "ok", "service": "Awan Topan Course API"})


def dashboard_summary(request):
    """Legacy dashboard endpoint returning raw counts."""
    today = timezone.localdate()
    payment_total = Payment.objects.filter(period__year=today.year, period__month=today.month).aggregate(total=Sum("amount_paid"))["total"] or 0
    return JsonResponse(
        {
            "total_students": Student.objects.filter(status=Student.Status.ACTIVE).count(),
            "active_teachers": TeacherProfile.objects.filter(is_active=True).count(),
            "sessions_today": Schedule.objects.filter(date=today).count(),
            "monthly_payment_total": float(payment_total),
            "attendance_today": _attendance_summary(today),
        }
    )


def v1_dashboard(request):
    """Vite Frontend /api/v1/dashboard/ endpoint."""
    target_date_str = request.GET.get("date")
    if target_date_str:
        try:
            target_date = datetime.strptime(target_date_str, "%Y-%m-%d").date()
        except ValueError:
            target_date = timezone.localdate()
    else:
        target_date = timezone.localdate()

    user = request.user
    role_str = "ADMIN" if (user.is_authenticated and user.is_admin_role()) else "TEACHER"

    schedules = Schedule.objects.select_related("class_group__subject", "teacher__user").filter(date=target_date)
    schedule_data = []
    for s in schedules:
        schedule_data.append({
            "id": str(s.id),
            "class_group": s.class_group.name,
            "subject": s.class_group.subject.name,
            "teacher": s.teacher.user.get_full_name() or s.teacher.user.username,
            "room": s.class_group.room or "Ruang 101",
            "start_at": f"{s.date.isoformat()}T{s.start_time.strftime('%H:%M:%S')}+07:00",
            "end_at": f"{s.date.isoformat()}T{s.end_time.strftime('%H:%M:%S')}+07:00",
            "status": s.status.upper(),
        })

    att_qs = StudentAttendance.objects.filter(session__schedule__date=target_date)
    att_total = att_qs.count()
    by_status = dict(att_qs.values_list("status").annotate(count=Count("id")))
    attendance = {
        "total": att_total,
        "present": by_status.get(StudentAttendance.Status.PRESENT, 0),
        "permit": by_status.get(StudentAttendance.Status.PERMIT, 0),
        "sick": by_status.get(StudentAttendance.Status.SICK, 0),
        "absent": by_status.get(StudentAttendance.Status.ABSENT, 0),
    }

    metrics = {
        "students": Student.objects.filter(status=Student.Status.ACTIVE).count(),
        "teachers": TeacherProfile.objects.filter(is_active=True).count(),
        "class_groups": ClassGroup.objects.filter(is_active=True).count(),
    }

    payments_period = Payment.objects.filter(period__year=target_date.year, period__month=target_date.month)
    total_billed = float(payments_period.aggregate(t=Sum("amount_due"))["t"] or 0)
    total_paid = float(payments_period.aggregate(t=Sum("amount_paid"))["t"] or 0)
    overdue_count = payments_period.filter(status=Payment.Status.OVERDUE).count()
    pending_count = payments_period.filter(status=Payment.Status.PENDING).count()

    finance = {
        "period_id": target_date.strftime("%Y-%m"),
        "total_billed": total_billed,
        "total_paid": total_paid,
        "overdue_count": overdue_count,
        "pending_count": pending_count,
    }

    data = {
        "date": target_date.isoformat(),
        "role": role_str,
        "schedule": schedule_data,
        "attendance": attendance,
        "metrics": metrics,
        "finance": finance,
    }
    return JsonResponse({"data": data, "meta": {}})


def v1_notifications(request):
    overdue = Payment.objects.filter(status=Payment.Status.OVERDUE).count()
    pending = Payment.objects.filter(status=Payment.Status.PENDING).count()
    today = timezone.localdate()
    sessions = Schedule.objects.filter(date=today).count()
    total = overdue + pending

    return JsonResponse({
        "data": {
            "overdue_payments": overdue,
            "pending_verifications": pending,
            "assigned_sessions_today": sessions,
            "total": total,
        },
        "meta": {},
    })


# ------------------------------------------------------------------------------
# Academic & Finance API Endpoints
# ------------------------------------------------------------------------------
def schedule_list(request):
    today = timezone.localdate()
    schedules = Schedule.objects.select_related("class_group__subject", "teacher__user").filter(date__gte=today).order_by("date", "start_time")[:50]
    return JsonResponse({"results": [_serialize_schedule(schedule) for schedule in schedules]})


def session_detail(request, session_id):
    session = SessionRecord.objects.select_related("schedule__class_group__subject", "schedule__teacher__user").get(pk=session_id)
    attendance = session.student_attendance.select_related("student").order_by("student__full_name")
    return JsonResponse(
        {
            "id": session.id,
            "status": session.status,
            "topic": session.topic,
            "material_description": session.material_description,
            "learning_notes": session.learning_notes,
            "schedule": _serialize_schedule(session.schedule),
            "student_attendance": [
                {
                    "student_id": item.student.student_id,
                    "name": item.student.full_name,
                    "status": item.status,
                }
                for item in attendance
            ],
        }
    )


def payment_list(request):
    payments = Payment.objects.select_related("student").order_by("-period", "student__full_name")[:100]
    return JsonResponse(
        {
            "results": [
                {
                    "student": payment.student.full_name,
                    "period": payment.period.isoformat(),
                    "amount_due": float(payment.amount_due),
                    "amount_paid": float(payment.amount_paid),
                    "paid_at": payment.paid_at.isoformat() if payment.paid_at else None,
                    "method": payment.method,
                    "status": payment.status,
                }
                for payment in payments
            ]
        }
    )


# v1_teachers is implemented in views_academics.py


def v1_class_groups(request):
    cgs = ClassGroup.objects.select_related("subject", "teacher__user").filter(is_active=True)
    results = []
    for cg in cgs:
        results.append({
            "id": str(cg.id),
            "name": cg.name,
            "level": cg.name,
            "default_room": cg.room or None,
            "default_room_name": cg.room or "Ruang 101",
            "is_active": cg.is_active,
            "student_count": cg.students.filter(enrollment__is_active=True).count(),
            "fee_plans": [],
        })
    return JsonResponse({"data": results, "meta": {"total": len(results)}})


def v1_rooms(request):
    return JsonResponse({
        "data": [
            {"id": "1", "name": "Ruang Alpha", "capacity": 20, "is_active": True},
            {"id": "2", "name": "Ruang Beta", "capacity": 20, "is_active": True},
            {"id": "3", "name": "Ruang 101", "capacity": 25, "is_active": True},
        ],
        "meta": {"total": 3},
    })


def v1_subjects(request):
    subs = Subject.objects.all()
    results = [
        {"id": str(s.id), "name": s.name, "color_key": "emerald", "is_active": True}
        for s in subs
    ]
    return JsonResponse({"data": results, "meta": {"total": len(results)}})


# v1_students is implemented in views_academics.py


def v1_enrollments(request):
    enrollments = Enrollment.objects.select_related("student", "class_group").filter(is_active=True)
    results = [
        {
            "id": str(e.id),
            "student": str(e.student.id),
            "student_name": e.student.full_name,
            "student_code": e.student.student_id,
            "student_school": e.student.school,
            "class_group": str(e.class_group.id),
            "class_group_name": e.class_group.name,
            "fee_plan": "1",
            "fee_plan_name": "Reguler",
            "monthly_amount_rupiah": 650000,
            "started_on": e.joined_at.isoformat(),
            "ended_on": None,
            "status": "ACTIVE" if e.is_active else "INACTIVE",
        }
        for e in enrollments
    ]
    return JsonResponse({"data": results, "meta": {"total": len(results)}})


# Note: v1_billing_periods, v1_payment_transactions, and v1_invoices are implemented in views_finance.py


def _serialize_schedule(schedule):
    return {
        "id": schedule.id,
        "date": schedule.date.isoformat(),
        "start_time": schedule.start_time.strftime("%H:%M"),
        "end_time": schedule.end_time.strftime("%H:%M"),
        "status": schedule.status,
        "subject": schedule.class_group.subject.name,
        "class_name": schedule.class_group.name,
        "room": schedule.class_group.room,
        "teacher": schedule.teacher.user.get_full_name() or schedule.teacher.user.username,
        "student_count": schedule.class_group.students.filter(enrollment__is_active=True).count(),
    }


def _attendance_summary(today):
    qs = StudentAttendance.objects.filter(session__schedule__date=today)
    total = qs.count()
    by_status = dict(qs.values_list("status").annotate(count=Count("id")))
    return {
        "total": total,
        "present": by_status.get(StudentAttendance.Status.PRESENT, 0),
        "permit": by_status.get(StudentAttendance.Status.PERMIT, 0),
        "sick": by_status.get(StudentAttendance.Status.SICK, 0),
        "absent": by_status.get(StudentAttendance.Status.ABSENT, 0),
    }

from .views_scheduling import *

from .views_academics import *

from .views_finance import *
