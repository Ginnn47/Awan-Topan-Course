from django.db.models import Count, Sum
from django.http import JsonResponse
from django.utils import timezone

from .models import Payment, Schedule, SessionRecord, Student, StudentAttendance, TeacherProfile


def health(request):
    return JsonResponse({"status": "ok", "service": "Awan Topan Course API"})


def dashboard_summary(request):
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
