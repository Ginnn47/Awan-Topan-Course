from django.conf import settings
import os
import json
from datetime import datetime, timedelta, time
from django.core.exceptions import ValidationError
from django.db import models, transaction
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt

from .models import (
    AuditLog,
    ClassGroup,
    Enrollment,
    Schedule,
    SessionAttachment,
    SessionRecord,
    Student,
    StudentAttendance,
    Subject,
    TeacherAttendance,
    TeacherProfile,
)
from .views_academics import api_error, api_success

STATUS_TO_FRONTEND = {
    Schedule.Status.SCHEDULED: "SCHEDULED",
    Schedule.Status.ONGOING: "IN_PROGRESS",
    Schedule.Status.COMPLETED: "COMPLETED",
    Schedule.Status.CANCELLED: "CANCELLED",
}


def _get_subject_color(subject_name):
    lower = subject_name.lower()
    if "matematika pilihan" in lower:
        return "teal"
    elif "matematika" in lower:
        return "blue"
    elif "inggris" in lower:
        return "purple"
    elif "indonesia" in lower:
        return "orange"
    elif "fisika" in lower:
        return "red"
    elif "kimia" in lower:
        return "green"
    elif "soal" in lower:
        return "amber"
    return "teal"


def _serialize_occurrence(schedule):
    cg = schedule.class_group
    sub = schedule.subject or (cg.subject if cg else None)
    teacher_user = schedule.teacher.user
    teacher_name = teacher_user.get_full_name() or teacher_user.username
    room_name = (cg.room if cg else "") or "Ruang 101"
    student_count = cg.students.filter(enrollment__is_active=True).count() if cg else 0
    session_id = str(schedule.session.id) if hasattr(schedule, "session") and schedule.session else None

    start_at = f"{schedule.date.isoformat()}T{schedule.start_time.strftime('%H:%M:%S')}+07:00"
    end_at = f"{schedule.date.isoformat()}T{schedule.end_time.strftime('%H:%M:%S')}+07:00"

    sub_id = str(sub.id) if sub else ""
    sub_name = sub.name if sub else "-"
    sub_color = _get_subject_color(sub_name) if sub else "teal"

    return {
        "id": str(schedule.id),
        "series": None,
        "sequence": 1,
        "class_group": str(cg.id) if cg else "",
        "class_name": cg.name if cg else "",
        "subject": sub_id,
        "subject_name": sub_name,
        "subject_color": sub_color,
        "teacher": str(schedule.teacher.id),
        "teacher_name": teacher_name,
        "room": cg.room or "1",
        "room_name": room_name,
        "start_at": start_at,
        "end_at": end_at,
        "status": STATUS_TO_FRONTEND.get(schedule.status, "SCHEDULED"),
        "cancellation_reason": schedule.notes if schedule.status == Schedule.Status.CANCELLED else "",
        "version": 1,
        "student_count": student_count,
        "session_id": session_id,
        "permissions": {
            "can_edit": schedule.status not in (Schedule.Status.COMPLETED, Schedule.Status.CANCELLED),
            "can_start": schedule.status not in (Schedule.Status.COMPLETED, Schedule.Status.CANCELLED),
        },
    }


def serialize_attachment(att, request=None) -> dict:
    file_url = att.file.url if att.file else ""
    if request and file_url and not file_url.startswith("http"):
        file_url = request.build_absolute_uri(file_url)
    return {
        "id": str(att.id),
        "original_name": att.original_name,
        "content_type": att.content_type,
        "size_bytes": att.size_bytes,
        "file": file_url,
        "url": file_url,
        "created_at": att.created_at.isoformat() if att.created_at else "",
    }


def _serialize_teaching_session(session):
    schedule = session.schedule
    cg = schedule.class_group
    sub = cg.subject
    teacher_user = schedule.teacher.user
    teacher_name = teacher_user.get_full_name() or teacher_user.username
    room_name = cg.room or "Ruang 101"

    existing_att = list(session.student_attendance.select_related("student").order_by("student__full_name"))
    existing_student_ids = {item.student_id for item in existing_att}

    active_students = cg.students.filter(enrollment__is_active=True).order_by("full_name")
    new_to_create = []
    for st in active_students:
        if st.id not in existing_student_ids:
            new_to_create.append(
                StudentAttendance(
                    session=session,
                    student=st,
                    status=StudentAttendance.Status.UNSET,
                )
            )

    if new_to_create:
        StudentAttendance.objects.bulk_create(new_to_create, ignore_conflicts=True)
        existing_att = list(session.student_attendance.select_related("student").order_by("student__full_name"))

    att_rows = [
        {
            "id": str(item.id),
            "student_id": str(item.student.id),
            "student_code": item.student.student_id,
            "student_code_snapshot": item.student.student_id,
            "student_name": item.student.full_name,
            "student_name_snapshot": item.student.full_name,
            "status": item.status.upper() if item.status in ["present", "permit", "sick", "absent"] else "UNSET",
            "note": "",
            "modified_at": item.modified_at.isoformat() if getattr(item, "modified_at", None) else timezone.now().isoformat(),
        }
        for item in existing_att
    ]

    start_at = f"{schedule.date.isoformat()}T{schedule.start_time.strftime('%H:%M:%S')}+07:00"
    end_at = f"{schedule.date.isoformat()}T{schedule.end_time.strftime('%H:%M:%S')}+07:00"
    started_at = session.started_at.isoformat() if session.started_at else start_at
    completed_at = session.completed_at.isoformat() if session.completed_at else None

    ta = getattr(session, "teacher_attendance", None)
    if not ta:
        ta = TeacherAttendance.objects.filter(session=session).first()
    teacher_attendance_data = {
        "id": str(ta.id),
        "teacher_id": str(ta.teacher_id),
        "checked_in_at": ta.checked_in_at.isoformat() if ta and ta.checked_in_at else None,
        "checked_out_at": ta.checked_out_at.isoformat() if ta and ta.checked_out_at else None,
    } if ta else None

    return {
        "id": str(session.id),
        "occurrence_id": str(schedule.id),
        "occurrence_status": STATUS_TO_FRONTEND.get(schedule.status, "SCHEDULED"),
        "teacher_attendance": teacher_attendance_data,
        "class_group": str(cg.id),
        "class_name": cg.name,
        "subject_name": sub.name,
        "teacher_name": teacher_name,
        "room_name": room_name,
        "start_at": start_at,
        "end_at": end_at,
        "started_at": started_at,
        "completed_at": completed_at,
        "topic": session.topic or f"Materi {sub.name} Kelas {cg.name}",
        "material_description": session.material_description or "",
        "learning_notes": session.learning_notes or "",
        "homework": session.homework or "",
        "version": 1,
        "student_attendance": att_rows,
        "attachments": [serialize_attachment(a) for a in session.attachments.all()],
        "permissions": {
            "can_edit": schedule.status != Schedule.Status.CANCELLED,
            "can_complete": session.status != SessionRecord.Status.COMPLETED and schedule.status != Schedule.Status.CANCELLED,
            "can_reopen": session.status == SessionRecord.Status.COMPLETED,
        },
    }


def check_schedule_conflicts(
    target_date,
    start_time,
    end_time,
    class_group,
    teacher,
    room=None,
    exclude_schedule_id=None,
    subject=None,
):
    """
    Validates overlapping schedules on target_date.
    Interval overlap occurs if: existing.start_time < new_end and existing.end_time > new_start.
    Adjacent intervals (e.g. 15:30-17:00 and 17:00-18:45) are valid and do not conflict.
    """
    conflicts = []
    overlapping = Schedule.objects.filter(
        date=target_date,
        start_time__lt=end_time,
        end_time__gt=start_time,
    ).exclude(status=Schedule.Status.CANCELLED)

    if exclude_schedule_id:
        overlapping = overlapping.exclude(pk=exclude_schedule_id)

    target_sub_id = subject.id if subject else (class_group.subject_id if class_group else None)

    # 1. ClassGroup conflict: A class group cannot have two overlapping sessions
    cg_overlap = overlapping.filter(class_group=class_group).first()
    if cg_overlap:
        conflicts.append(
            f"Rombel '{class_group.name}' sudah memiliki jadwal aktif pada jam {cg_overlap.start_time.strftime('%H:%M')}-{cg_overlap.end_time.strftime('%H:%M')}."
        )

    # 2. Room conflict: Another class using the same room
    target_room = (room if room is not None else (class_group.room if class_group else "")) or ""
    if target_room:
        room_overlap = overlapping.filter(class_group__room=target_room).exclude(class_group=class_group)
        room_hit = room_overlap.first()
        if room_hit:
            hit_sub_id = room_hit.subject_id or (room_hit.class_group.subject_id if room_hit.class_group else None)
            if room_hit.teacher_id != teacher.id or hit_sub_id != target_sub_id:
                conflicts.append(
                    f"Ruangan '{target_room}' sudah digunakan oleh rombel lain ({room_hit.class_group.name}) pada jam {room_hit.start_time.strftime('%H:%M')}-{room_hit.end_time.strftime('%H:%M')}."
                )

    # 3. Teacher conflict: Teacher scheduled for a different subject/class simultaneously
    if teacher:
        t_user = teacher.user
        t_name = t_user.get_full_name() or t_user.username
        teacher_overlap = overlapping.filter(teacher=teacher).exclude(class_group=class_group)
        for t_hit in teacher_overlap:
            hit_sub_id = t_hit.subject_id or (t_hit.class_group.subject_id if t_hit.class_group else None)
            if hit_sub_id != target_sub_id:
                hit_sub_name = t_hit.subject.name if t_hit.subject else (t_hit.class_group.subject.name if t_hit.class_group and t_hit.class_group.subject else "mata pelajaran lain")
                conflicts.append(
                    f"Pengajar '{t_name}' sudah memiliki jadwal mengajar mata pelajaran lain ({t_hit.class_group.name} - {hit_sub_name}) pada jam {t_hit.start_time.strftime('%H:%M')}-{t_hit.end_time.strftime('%H:%M')}."
                )
            elif target_room and t_hit.class_group.room and target_room != t_hit.class_group.room:
                conflicts.append(
                    f"Pengajar '{t_name}' sudah memiliki jadwal mengajar di ruangan lain ({t_hit.class_group.room}) pada jam {t_hit.start_time.strftime('%H:%M')}-{t_hit.end_time.strftime('%H:%M')}."
                )

    return conflicts


# ------------------------------------------------------------------------------
# Schedule Occurrences Endpoints
# ------------------------------------------------------------------------------
@csrf_exempt
def v1_schedule_occurrences(request):
    if request.method == "GET":
        qs = Schedule.objects.select_related(
            "class_group__subject",
            "class_group",
            "teacher__user",
            "session",
        ).all()

        from_str = request.GET.get("from")
        to_str = request.GET.get("to")
        from_date = None
        if from_str:
            try:
                from_date = datetime.strptime(from_str[:10], "%Y-%m-%d").date()
                qs = qs.filter(date__gte=from_date)
            except ValueError:
                pass
        if to_str:
            try:
                to_date = datetime.strptime(to_str[:10], "%Y-%m-%d").date()
                if len(to_str) >= 19 and to_str[11:19] == "00:00:00" and from_date and to_date > from_date:
                    qs = qs.filter(date__lt=to_date)
                else:
                    qs = qs.filter(date__lte=to_date)
            except ValueError:
                pass

        teacher_id = request.GET.get("teacher")
        if teacher_id:
            qs = qs.filter(teacher_id=teacher_id)
        room = request.GET.get("room")
        if room:
            qs = qs.filter(class_group__room=room)
        subject_id = request.GET.get("subject")
        if subject_id:
            qs = qs.filter(class_group__subject_id=subject_id)
        cg_id = request.GET.get("class_group")
        if cg_id:
            qs = qs.filter(class_group_id=cg_id)

        status_param = request.GET.get("status")
        if status_param:
            st_norm = status_param.upper().strip()
            status_map = {
                "SCHEDULED": Schedule.Status.SCHEDULED,
                "IN_PROGRESS": Schedule.Status.ONGOING,
                "ONGOING": Schedule.Status.ONGOING,
                "COMPLETED": Schedule.Status.COMPLETED,
                "CANCELLED": Schedule.Status.CANCELLED,
            }
            if st_norm in status_map:
                qs = qs.filter(status=status_map[st_norm])
            else:
                qs = qs.none()

        qs = qs.order_by("date", "start_time")
        data = [_serialize_occurrence(s) for s in qs]
        return api_success(data, meta={"total": len(data), "page": 1, "page_size": 100})

    elif request.method == "POST":
        if request.user.is_authenticated and not request.user.is_admin_role():
            return api_error("Hanya admin yang dapat membuat jadwal.", code="FORBIDDEN", status=403)

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

        teacher_id = body.get("teacher")
        tp = TeacherProfile.objects.filter(pk=teacher_id).first() if teacher_id else cg.teacher
        if not tp:
            return api_error("Teacher tidak ditemukan.", code="NOT_FOUND", status=404)

        start_at_str = body.get("start_at")
        end_at_str = body.get("end_at")
        if not start_at_str or not end_at_str:
            return api_error("start_at dan end_at wajib diisi.", code="VALIDATION_ERROR")

        try:
            start_date = datetime.strptime(start_at_str[:10], "%Y-%m-%d").date()
            start_time = datetime.strptime(start_at_str[11:19], "%H:%M:%S").time()
            end_time = datetime.strptime(end_at_str[11:19], "%H:%M:%S").time()
        except Exception:
            return api_error("Format start_at atau end_at tidak valid.", code="VALIDATION_ERROR")

        if end_time <= start_time:
            return api_error("Waktu selesai harus lebih akhir daripada waktu mulai.", code="VALIDATION_ERROR")

        room = body.get("room") or cg.room

        subject_id = body.get("subject") or body.get("subject_id")
        subject = Subject.objects.filter(pk=subject_id).first() if subject_id else cg.subject

        conflicts = check_schedule_conflicts(start_date, start_time, end_time, cg, tp, room=room, subject=subject)
        if conflicts:
            return api_error(f"Benturan jadwal: {'; '.join(conflicts)}", code="SCHEDULE_CONFLICT", status=400)

        with transaction.atomic():
            sched = Schedule.objects.create(
                class_group=cg,
                subject=subject,
                teacher=tp,
                date=start_date,
                start_time=start_time,
                end_time=end_time,
                status=Schedule.Status.SCHEDULED,
            )
            sub_name = subject.name if subject else cg.name
            SessionRecord.objects.create(
                schedule=sched,
                status=SessionRecord.Status.DRAFT,
                topic=body.get("topic") or f"{sub_name} Kelas {cg.name}",
            )

        return api_success(_serialize_occurrence(sched), status=201)

    return api_error("Metode tidak diizinkan.", code="METHOD_NOT_ALLOWED", status=405)


@csrf_exempt
def v1_schedule_occurrence_detail(request, occurrence_id):
    schedule = Schedule.objects.filter(pk=occurrence_id).select_related(
        "class_group__subject", "teacher__user", "session"
    ).first()
    if not schedule:
        return api_error(f"Schedule '{occurrence_id}' tidak ditemukan.", code="NOT_FOUND", status=404)

    if request.method == "GET":
        return api_success(_serialize_occurrence(schedule))

    elif request.method in ("PATCH", "PUT"):
        if request.user.is_authenticated and not request.user.is_admin_role():
            return api_error("Hanya admin yang dapat mengedit jadwal.", code="FORBIDDEN", status=403)

        if schedule.status in (Schedule.Status.COMPLETED, Schedule.Status.CANCELLED):
            return api_error("Jadwal yang sudah selesai atau dibatalkan tidak dapat diedit.", code="INVALID_STATUS", status=400)

        try:
            body = json.loads(request.body.decode("utf-8")) if request.body else {}
        except Exception:
            return api_error("Format JSON tidak valid.", code="VALIDATION_ERROR")

        target_date = schedule.date
        target_start = schedule.start_time
        target_end = schedule.end_time

        if "start_at" in body and "end_at" in body:
            try:
                target_date = datetime.strptime(body["start_at"][:10], "%Y-%m-%d").date()
                target_start = datetime.strptime(body["start_at"][11:19], "%H:%M:%S").time()
                target_end = datetime.strptime(body["end_at"][11:19], "%H:%M:%S").time()
            except Exception:
                return api_error("Format start_at atau end_at tidak valid.", code="VALIDATION_ERROR")

            if target_end <= target_start:
                return api_error("Waktu selesai harus lebih akhir daripada waktu mulai.", code="VALIDATION_ERROR")

        target_class_group = schedule.class_group
        if "class_group" in body and body["class_group"]:
            cg = ClassGroup.objects.filter(pk=body["class_group"]).first()
            if not cg:
                return api_error(f"ClassGroup '{body['class_group']}' tidak ditemukan.", code="NOT_FOUND", status=404)
            target_class_group = cg

        target_teacher = schedule.teacher
        if "teacher" in body and body["teacher"]:
            tp = TeacherProfile.objects.filter(pk=body["teacher"]).first()
            if not tp:
                return api_error(f"Teacher '{body['teacher']}' tidak ditemukan.", code="NOT_FOUND", status=404)
            target_teacher = tp

        target_room = target_class_group.room
        if "room" in body:
            target_room = body.get("room") or ""

        target_subject = schedule.subject
        if "subject" in body and body["subject"]:
            sub = Subject.objects.filter(pk=body["subject"]).first()
            if sub:
                target_subject = sub

        conflicts = check_schedule_conflicts(
            target_date, target_start, target_end, target_class_group, target_teacher,
            room=target_room, exclude_schedule_id=schedule.id, subject=target_subject,
        )
        if conflicts:
            return api_error(f"Benturan jadwal: {'; '.join(conflicts)}", code="SCHEDULE_CONFLICT", status=400)

        schedule.date = target_date
        schedule.start_time = target_start
        schedule.end_time = target_end
        schedule.class_group = target_class_group
        schedule.teacher = target_teacher
        schedule.subject = target_subject
        schedule.save()
        return api_success(_serialize_occurrence(schedule))

    elif request.method == "DELETE":
        if request.user.is_authenticated and not request.user.is_admin_role():
            return api_error("Hanya admin yang dapat membatalkan jadwal.", code="FORBIDDEN", status=403)

        if schedule.status == Schedule.Status.COMPLETED:
            return api_error("Jadwal yang sudah selesai tidak dapat dihapus atau dibatalkan.", code="INVALID_STATUS", status=400)

        # Soft-cancel schedule to preserve session and attendance history
        schedule.status = Schedule.Status.CANCELLED
        schedule.notes = "Dihapus oleh pengguna"
        schedule.save(update_fields=["status", "notes"])
        return api_success(_serialize_occurrence(schedule))

    return api_error("Metode tidak diizinkan.", code="METHOD_NOT_ALLOWED", status=405)


@csrf_exempt
def v1_schedule_occurrence_reschedule(request, occurrence_id):
    if request.method != "POST":
        return api_error("Metode tidak diizinkan.", code="METHOD_NOT_ALLOWED", status=405)

    schedule = Schedule.objects.filter(pk=occurrence_id).select_related("class_group", "teacher").first()
    if not schedule:
        return api_error(f"Schedule '{occurrence_id}' tidak ditemukan.", code="NOT_FOUND", status=404)

    if schedule.status in (Schedule.Status.COMPLETED, Schedule.Status.CANCELLED):
        return api_error("Jadwal yang sudah selesai atau dibatalkan tidak dapat dijadwalkan ulang.", code="INVALID_STATUS", status=400)

    try:
        body = json.loads(request.body.decode("utf-8")) if request.body else {}
    except Exception:
        body = {}

    start_at_str = body.get("start_at")
    end_at_str = body.get("end_at")
    if not start_at_str or not end_at_str:
        return api_error("start_at dan end_at wajib diisi.", code="VALIDATION_ERROR")

    try:
        new_date = datetime.strptime(start_at_str[:10], "%Y-%m-%d").date()
        new_start = datetime.strptime(start_at_str[11:19], "%H:%M:%S").time()
        new_end = datetime.strptime(end_at_str[11:19], "%H:%M:%S").time()
    except Exception:
        return api_error("Format start_at atau end_at tidak valid.", code="VALIDATION_ERROR")

    if new_end <= new_start:
        return api_error("Waktu selesai harus lebih akhir daripada waktu mulai.", code="VALIDATION_ERROR")

    target_room = body.get("room") if body.get("room") is not None else schedule.class_group.room
    conflicts = check_schedule_conflicts(
        new_date, new_start, new_end, schedule.class_group, schedule.teacher,
        room=target_room, exclude_schedule_id=schedule.id, subject=schedule.subject,
    )
    if conflicts:
        return api_error(f"Benturan jadwal: {'; '.join(conflicts)}", code="SCHEDULE_CONFLICT", status=400)

    if body.get("room") and body.get("room") != schedule.class_group.room:
        schedule.class_group.room = body["room"]
        schedule.class_group.save(update_fields=["room"])

    schedule.date = new_date
    schedule.start_time = new_start
    schedule.end_time = new_end
    schedule.save(update_fields=["date", "start_time", "end_time"])

    scope = body.get("scope", "this")
    if scope == "this_and_future":
        day_diff = (new_date - schedule.date).days
        future_schedules = Schedule.objects.filter(
            class_group=schedule.class_group,
            date__gt=schedule.date,
            start_time=schedule.start_time,
        ).exclude(status=Schedule.Status.CANCELLED)

        for f_sched in future_schedules:
            f_target_date = f_sched.date + timedelta(days=day_diff)
            f_conflicts = check_schedule_conflicts(
                f_target_date, new_start, new_end, f_sched.class_group, f_sched.teacher,
                room=f_sched.class_group.room, exclude_schedule_id=f_sched.id, subject=f_sched.subject,
            )
            if not f_conflicts:
                f_sched.date = f_target_date
                f_sched.start_time = new_start
                f_sched.end_time = new_end
                f_sched.save(update_fields=["date", "start_time", "end_time"])

    return api_success(_serialize_occurrence(schedule))


@csrf_exempt
def v1_schedule_occurrence_cancel(request, occurrence_id):
    if request.method != "POST":
        return api_error("Metode tidak diizinkan.", code="METHOD_NOT_ALLOWED", status=405)

    schedule = Schedule.objects.filter(pk=occurrence_id).first()
    if not schedule:
        return api_error(f"Schedule '{occurrence_id}' tidak ditemukan.", code="NOT_FOUND", status=404)

    if schedule.status == Schedule.Status.COMPLETED:
        return api_error("Jadwal yang sudah selesai tidak dapat dibatalkan.", code="INVALID_STATUS", status=400)

    if schedule.status == Schedule.Status.CANCELLED:
        return api_error("Jadwal sudah berstatus dibatalkan.", code="INVALID_STATUS", status=400)

    try:
        body = json.loads(request.body.decode("utf-8")) if request.body else {}
    except Exception:
        body = {}

    reason = body.get("reason", "Dibatalkan oleh pengguna")
    schedule.status = Schedule.Status.CANCELLED
    schedule.notes = f"Dibatalkan: {reason}"
    schedule.save(update_fields=["status", "notes"])

    return api_success(_serialize_occurrence(schedule))


@csrf_exempt
def v1_schedule_occurrence_start(request, occurrence_id):
    if request.method != "POST":
        return api_error("Metode tidak diizinkan.", code="METHOD_NOT_ALLOWED", status=405)

    schedule = Schedule.objects.filter(pk=occurrence_id).select_related("class_group__subject", "teacher__user").first()
    if not schedule:
        return api_error(f"Schedule '{occurrence_id}' tidak ditemukan.", code="NOT_FOUND", status=404)

    if schedule.status == Schedule.Status.CANCELLED:
        return api_error("Jadwal yang telah dibatalkan tidak dapat dimulai.", code="INVALID_STATUS", status=400)

    if schedule.status == Schedule.Status.COMPLETED:
        return api_error("Jadwal yang sudah selesai tidak dapat dimulai kembali secara langsung.", code="INVALID_STATUS", status=400)

    try:
        body = json.loads(request.body.decode("utf-8")) if request.body else {}
    except Exception:
        body = {}

    topic = body.get("topic") or f"{schedule.class_group.subject.name} Kelas {schedule.class_group.name}"

    with transaction.atomic():
        schedule.status = Schedule.Status.ONGOING
        schedule.save(update_fields=["status"])

        session, created = SessionRecord.objects.get_or_create(
            schedule=schedule,
            defaults={
                "status": SessionRecord.Status.ACTIVE,
                "topic": topic,
                "started_at": timezone.now(),
            },
        )
        if not created and session.status == SessionRecord.Status.DRAFT:
            session.status = SessionRecord.Status.ACTIVE
            session.started_at = timezone.now()
            session.topic = topic
            session.save(update_fields=["status", "started_at", "topic"])

        TeacherAttendance.objects.get_or_create(
            session=session,
            defaults={
                "teacher": schedule.teacher,
                "checked_in_at": session.started_at or timezone.now(),
            },
        )

        AuditLog.objects.create(
            actor=request.user if request.user.is_authenticated else None,
            action="START_SESSION",
            target_type="SESSION",
            target_id=str(session.id),
            new_value={"occurrence_id": str(schedule.id), "started_at": timezone.now().isoformat()},
        )

    return api_success(_serialize_teaching_session(session))


@csrf_exempt
def v1_schedule_series_create(request):
    if request.method != "POST":
        return api_error("Metode tidak diizinkan.", code="METHOD_NOT_ALLOWED", status=405)

    try:
        body = json.loads(request.body.decode("utf-8")) if request.body else {}
    except Exception:
        body = {}

    cg_id = body.get("class_group")
    if not cg_id:
        return api_error("class_group wajib diisi.", code="VALIDATION_ERROR", fields={"class_group": ["Wajib diisi"]})

    cg = ClassGroup.objects.filter(pk=cg_id).first()
    if not cg:
        return api_error(f"ClassGroup '{cg_id}' tidak ditemukan.", code="NOT_FOUND", status=404)

    teacher_id = body.get("teacher")
    tp = TeacherProfile.objects.filter(pk=teacher_id).first() if teacher_id else cg.teacher
    if not tp:
        return api_error("Teacher tidak ditemukan.", code="NOT_FOUND", status=404)

    start_at_str = body.get("start_at")
    end_at_str = body.get("end_at")
    if not start_at_str or not end_at_str:
        return api_error("start_at dan end_at wajib diisi.", code="VALIDATION_ERROR")

    try:
        start_date = datetime.strptime(start_at_str[:10], "%Y-%m-%d").date()
        start_time = datetime.strptime(start_at_str[11:19], "%H:%M:%S").time()
        end_time = datetime.strptime(end_at_str[11:19], "%H:%M:%S").time()
    except Exception:
        return api_error("Format datetime start_at atau end_at tidak valid.", code="VALIDATION_ERROR")

    if end_time <= start_time:
        return api_error("Waktu selesai harus lebih akhir daripada waktu mulai.", code="VALIDATION_ERROR")

    occurrence_count = int(body.get("occurrence_count") or 1)
    interval_weeks = int(body.get("interval_weeks") or 1)
    room = body.get("room") or cg.room

    # Pre-validate conflicts for every occurrence
    for i in range(occurrence_count):
        cur_date = start_date + timedelta(weeks=i * interval_weeks)
        conflicts = check_schedule_conflicts(cur_date, start_time, end_time, cg, tp, room=room)
        if conflicts:
            return api_error(
                f"Benturan jadwal pada tanggal {cur_date}: {'; '.join(conflicts)}",
                code="SCHEDULE_CONFLICT",
                status=400,
            )

    created_ids = []
    with transaction.atomic():
        for i in range(occurrence_count):
            cur_date = start_date + timedelta(weeks=i * interval_weeks)
            sched = Schedule.objects.create(
                class_group=cg,
                teacher=tp,
                date=cur_date,
                start_time=start_time,
                end_time=end_time,
                status=Schedule.Status.SCHEDULED,
            )
            SessionRecord.objects.create(
                schedule=sched,
                status=SessionRecord.Status.DRAFT,
                topic=f"{cg.subject.name} Kelas {cg.name}",
            )
            created_ids.append(sched.id)

    return api_success({"created_count": len(created_ids), "ids": created_ids}, status=201)

@csrf_exempt
def v1_schedule_replicate_week(request):
    if request.method != "POST":
        return api_error("Metode tidak diizinkan.", code="METHOD_NOT_ALLOWED", status=405)

    if request.user.is_authenticated and not request.user.is_admin_role():
        return api_error("Hanya admin yang dapat menduplikasi jadwal mingguan.", code="FORBIDDEN", status=403)

    try:
        body = json.loads(request.body.decode("utf-8")) if request.body else {}
    except Exception:
        return api_error("Format JSON tidak valid.", code="VALIDATION_ERROR")

    source_from_str = body.get("source_from")
    source_to_str = body.get("source_to")
    if not source_from_str or not source_to_str:
        return api_error("source_from dan source_to wajib diisi.", code="VALIDATION_ERROR")

    try:
        src_from = datetime.strptime(source_from_str[:10], "%Y-%m-%d").date()
        src_to = datetime.strptime(source_to_str[:10], "%Y-%m-%d").date()
    except Exception:
        return api_error("Format tanggal tidak valid. Gunakan format YYYY-MM-DD.", code="VALIDATION_ERROR")

    if src_to < src_from:
        return api_error("source_to tidak boleh lebih awal dari source_from.", code="VALIDATION_ERROR")

    try:
        repeat_weeks = int(body.get("repeat_weeks") or 1)
    except (ValueError, TypeError):
        repeat_weeks = 1

    if repeat_weeks < 1 or repeat_weeks > 12:
        return api_error("repeat_weeks harus bernilai antara 1 sampai 12 minggu.", code="VALIDATION_ERROR")

    skip_conflicts = bool(body.get("skip_conflicts", True))

    source_schedules = list(
        Schedule.objects.filter(
            date__gte=src_from,
            date__lte=src_to,
        ).exclude(status=Schedule.Status.CANCELLED).select_related("class_group__subject", "teacher")
    )

    if not source_schedules:
        return api_error("Tidak ada jadwal aktif pada rentang tanggal sumber yang dipilih.", code="EMPTY_SOURCE", status=400)

    created_ids = []
    skipped_count = 0

    with transaction.atomic():
        for w in range(1, repeat_weeks + 1):
            offset_days = w * 7
            for src in source_schedules:
                target_date = src.date + timedelta(days=offset_days)
                conflicts = check_schedule_conflicts(
                    target_date,
                    src.start_time,
                    src.end_time,
                    src.class_group,
                    src.teacher,
                    room=src.class_group.room,
                    subject=src.subject,
                )
                if conflicts:
                    if skip_conflicts:
                        skipped_count += 1
                        continue
                    else:
                        return api_error(
                            f"Benturan jadwal pada {target_date} ({src.class_group.name}): {'; '.join(conflicts)}",
                            code="SCHEDULE_CONFLICT",
                            status=400,
                        )

                sched = Schedule.objects.create(
                    class_group=src.class_group,
                    subject=src.subject,
                    teacher=src.teacher,
                    date=target_date,
                    start_time=src.start_time,
                    end_time=src.end_time,
                    status=Schedule.Status.SCHEDULED,
                )
                src_sub_name = src.subject.name if src.subject else (src.class_group.subject.name if src.class_group and src.class_group.subject else src.class_group.name)
                SessionRecord.objects.create(
                    schedule=sched,
                    status=SessionRecord.Status.DRAFT,
                    topic=f"{src_sub_name} Kelas {src.class_group.name}",
                )
                created_ids.append(sched.id)

    target_start = (src_from + timedelta(days=7)).isoformat()
    target_end = (src_to + timedelta(days=repeat_weeks * 7)).isoformat()

    return api_success(
        {
            "created_count": len(created_ids),
            "skipped_count": skipped_count,
            "repeat_weeks": repeat_weeks,
            "source_schedule_count": len(source_schedules),
            "target_start_date": target_start,
            "target_end_date": target_end,
            "created_ids": created_ids,
        },
        meta={"total": len(created_ids)},
        status=201,
    )



# ------------------------------------------------------------------------------
# Teaching Session & Attendance Endpoints
# ------------------------------------------------------------------------------
@csrf_exempt
def v1_session_detail(request, session_id):
    session = SessionRecord.objects.filter(pk=session_id).select_related(
        "schedule__class_group__subject", "schedule__teacher__user"
    ).first()
    if not session:
        return api_error(f"Session '{session_id}' tidak ditemukan.", code="NOT_FOUND", status=404)

    if request.method == "GET":
        return api_success(_serialize_teaching_session(session))

    if request.method in ["POST", "PUT", "PATCH"]:
        if session.schedule.status == Schedule.Status.CANCELLED:
            return api_error("Sesi yang telah dibatalkan tidak dapat diedit.", code="INVALID_STATUS", status=400)

        try:
            body = json.loads(request.body.decode("utf-8")) if request.body else {}
        except Exception:
            body = {}

        if "topic" in body and len(str(body["topic"])) > 160:
            return api_error("Topik maksimal 160 karakter.", code="VALIDATION_ERROR")

        for field in ["topic", "material_description", "learning_notes", "homework"]:
            if field in body:
                setattr(session, field, body[field])
        session.save()
        return api_success(_serialize_teaching_session(session))

    return api_error("Metode tidak diizinkan.", code="METHOD_NOT_ALLOWED", status=405)


@csrf_exempt
def v1_session_attendance(request, session_id):
    session = SessionRecord.objects.filter(pk=session_id).select_related("schedule__class_group").first()
    if not session:
        return api_error(f"Session '{session_id}' tidak ditemukan.", code="NOT_FOUND", status=404)

    if request.method == "GET":
        return api_success(_serialize_teaching_session(session))

    if request.method in ["POST", "PUT"]:
        if session.schedule.status == Schedule.Status.CANCELLED:
            return api_error("Tidak dapat mengubah absensi pada sesi yang telah dibatalkan.", code="INVALID_STATUS", status=400)

        try:
            body = json.loads(request.body.decode("utf-8")) if request.body else {}
        except Exception:
            body = {}

        items = body.get("attendance", [])
        status_reverse = {
            "PRESENT": StudentAttendance.Status.PRESENT,
            "PERMIT": StudentAttendance.Status.PERMIT,
            "SICK": StudentAttendance.Status.SICK,
            "ABSENT": StudentAttendance.Status.ABSENT,
            "UNSET": StudentAttendance.Status.UNSET,
        }

        cg = session.schedule.class_group
        valid_student_ids = {str(pk) for pk in cg.students.values_list("id", flat=True)}

        with transaction.atomic():
            for item in items:
                att_id = item.get("id")
                st_id = str(item.get("student_id") or "").strip()
                st_status = (item.get("status") or "").upper().strip()

                if st_status not in status_reverse:
                    continue

                sa = None
                if att_id:
                    sa = StudentAttendance.objects.filter(pk=att_id, session=session).first()
                    if not sa:
                        return api_error(f"Catatan absensi '{att_id}' tidak ditemukan pada sesi ini.", code="NOT_FOUND", status=404)

                if not sa and st_id:
                    sa = StudentAttendance.objects.filter(student_id=st_id, session=session).first()

                if not sa and st_id:
                    if st_id not in valid_student_ids:
                        return api_error(f"Siswa '{st_id}' tidak terdaftar pada rombel sesi ini.", code="INVALID_STUDENT", status=400)
                    sa = StudentAttendance.objects.create(
                        session=session,
                        student_id=st_id,
                        status=status_reverse[st_status],
                        modified_by=request.user if request.user.is_authenticated else None,
                    )
                elif sa:
                    sa.status = status_reverse[st_status]
                    sa.modified_by = request.user if request.user.is_authenticated else None
                    sa.save(update_fields=["status", "modified_by", "modified_at"])

            AuditLog.objects.create(
                actor=request.user if request.user.is_authenticated else None,
                action="UPDATE_ATTENDANCE",
                target_type="SESSION",
                target_id=str(session.id),
                new_value={"attendance_items_count": len(items)},
            )

        return api_success(_serialize_teaching_session(session))

    return api_error("Metode tidak diizinkan.", code="METHOD_NOT_ALLOWED", status=405)


@csrf_exempt
def v1_session_complete(request, session_id):
    if request.method != "POST":
        return api_error("Metode tidak diizinkan.", code="METHOD_NOT_ALLOWED", status=405)

    session = SessionRecord.objects.filter(pk=session_id).select_related("schedule").first()
    if not session:
        return api_error(f"Session '{session_id}' tidak ditemukan.", code="NOT_FOUND", status=404)

    if session.schedule.status == Schedule.Status.CANCELLED:
        return api_error("Sesi yang telah dibatalkan tidak dapat diselesaikan.", code="INVALID_STATUS", status=400)

    if session.status == SessionRecord.Status.COMPLETED:
        return api_error("Sesi ini sudah berstatus selesai.", code="INVALID_STATUS", status=400)

    # Validasi kewajiban guru: deskripsi materi (wajib)
    if not (session.material_description or "").strip():
        return api_error(
            "Deskripsi materi pembelajaran wajib diisi sebelum menyelesaikan sesi.",
            code="INCOMPLETE_MATERIAL",
            status=400,
        )

    # Validasi kewajiban guru: topik pembelajaran
    if not (session.topic or "").strip():
        return api_error(
            "Topik pembelajaran wajib diisi sebelum menyelesaikan sesi.",
            code="INCOMPLETE_TOPIC",
            status=400,
        )

    # Validasi kewajiban guru: seluruh absensi siswa harus terisi (tidak boleh UNSET)
    unset_count = session.student_attendance.filter(status=StudentAttendance.Status.UNSET).count()
    if unset_count > 0:
        return api_error(
            f"Seluruh absensi siswa wajib diisi ({unset_count} siswa belum diabsen).",
            code="INCOMPLETE_ATTENDANCE",
            status=400,
            fields={"unset_count": [str(unset_count)]},
        )

    with transaction.atomic():
        session.complete()
        session.schedule.status = Schedule.Status.COMPLETED
        session.schedule.save(update_fields=["status"])

        TeacherAttendance.objects.update_or_create(
            session=session,
            defaults={
                "teacher": session.schedule.teacher,
                "checked_in_at": session.started_at or timezone.now(),
                "checked_out_at": session.completed_at or timezone.now(),
            },
        )

        AuditLog.objects.create(
            actor=request.user if request.user.is_authenticated else None,
            action="COMPLETE_SESSION",
            target_type="SESSION",
            target_id=str(session.id),
            new_value={"completed_at": timezone.now().isoformat()},
        )

    return api_success(_serialize_teaching_session(session))


@csrf_exempt
def v1_session_reopen(request, session_id):
    if request.method != "POST":
        return api_error("Metode tidak diizinkan.", code="METHOD_NOT_ALLOWED", status=405)

    session = SessionRecord.objects.filter(pk=session_id).select_related("schedule").first()
    if not session:
        return api_error(f"Session '{session_id}' tidak ditemukan.", code="NOT_FOUND", status=404)

    if session.status != SessionRecord.Status.COMPLETED:
        return api_error("Hanya sesi yang sudah selesai yang dapat dibuka kembali.", code="INVALID_STATUS", status=400)

    try:
        body = json.loads(request.body.decode("utf-8")) if request.body else {}
    except Exception:
        body = {}

    reason = body.get("reason", "").strip()

    with transaction.atomic():
        session.status = SessionRecord.Status.ACTIVE
        session.completed_at = None
        if reason:
            session.learning_notes = (session.learning_notes + "\n[Reopen] " + reason).strip()
        session.save(update_fields=["status", "completed_at", "learning_notes"])

        session.schedule.status = Schedule.Status.ONGOING
        session.schedule.save(update_fields=["status"])

        ta = TeacherAttendance.objects.filter(session=session).first()
        if ta:
            ta.checked_out_at = None
            ta.save(update_fields=["checked_out_at"])

        AuditLog.objects.create(
            actor=request.user if request.user.is_authenticated else None,
            action="REOPEN_SESSION",
            target_type="SESSION",
            target_id=str(session.id),
            new_value={"reason": reason},
        )

    return api_success(_serialize_teaching_session(session))


@csrf_exempt
def v1_session_lesson_report(request, session_id):
    session = SessionRecord.objects.filter(pk=session_id).select_related("schedule").first()
    if not session:
        return api_error(f"Session '{session_id}' tidak ditemukan.", code="NOT_FOUND", status=404)

    if request.method == "GET":
        return api_success(_serialize_teaching_session(session))

    if request.method in ["POST", "PUT"]:
        if session.schedule.status == Schedule.Status.CANCELLED:
            return api_error("Tidak dapat mengubah catatan materi pada sesi yang telah dibatalkan.", code="INVALID_STATUS", status=400)

        try:
            body = json.loads(request.body.decode("utf-8")) if request.body else {}
        except Exception:
            body = {}

        if "topic" in body and len(str(body["topic"])) > 160:
            return api_error("Topik maksimal 160 karakter.", code="VALIDATION_ERROR")

        for field in ["topic", "material_description", "learning_notes", "homework"]:
            if field in body:
                setattr(session, field, body[field])
        session.save()

        return api_success(_serialize_teaching_session(session))

    return api_error("Metode tidak diizinkan.", code="METHOD_NOT_ALLOWED", status=405)


@csrf_exempt
def v1_session_attachments(request, session_id):
    session = SessionRecord.objects.filter(pk=session_id).select_related("schedule__teacher").first()
    if not session:
        return api_error(f"Session '{session_id}' tidak ditemukan.", code="NOT_FOUND", status=404)

    if request.method == "GET":
        results = [serialize_attachment(a, request) for a in session.attachments.all()]
        return api_success(results, meta={"total": len(results)})

    elif request.method == "POST":
        if session.schedule.status == Schedule.Status.CANCELLED:
            return api_error("Tidak dapat mengunggah lampiran pada sesi yang telah dibatalkan.", code="INVALID_STATUS", status=400)

        if request.user.is_authenticated and not request.user.is_admin_role():
            if hasattr(request.user, "teacher_profile"):
                if session.schedule.teacher_id != request.user.teacher_profile.id:
                    return api_error("Hanya guru pengampu atau admin yang dapat mengunggah lampiran sesi ini.", code="FORBIDDEN", status=403)
            else:
                return api_error("Akses ditolak.", code="FORBIDDEN", status=403)

        uploaded_file = request.FILES.get("file")
        if not uploaded_file:
            return api_error("Berkas lampiran wajib diunggah.", code="VALIDATION_ERROR", fields={"file": ["Wajib diunggah"]})

        if uploaded_file.size == 0:
            return api_error("Berkas tidak boleh kosong.", code="EMPTY_FILE", status=400, fields={"file": ["Ukuran file 0 byte"]})

        max_size = getattr(settings, "MAX_UPLOAD_SIZE", 10 * 1024 * 1024)
        if uploaded_file.size > max_size:
            return api_error(f"Ukuran berkas melebihi batas maksimal {max_size // (1024 * 1024)}MB.", code="FILE_TOO_LARGE", status=400)

        name = uploaded_file.name or "lampiran"
        ext = os.path.splitext(name)[1].lower()
        allowed_extensions = [".pdf", ".jpg", ".jpeg", ".png"]
        if ext not in allowed_extensions:
            return api_error("Tipe berkas tidak diizinkan. Hanya format PDF, JPG, dan PNG yang didukung.", code="INVALID_FILE_TYPE", status=400)

        content_type = (uploaded_file.content_type or "").lower()
        allowed_mimes = ["application/pdf", "image/jpeg", "image/png", "image/pjpeg"]
        if content_type and content_type not in allowed_mimes and not any(ext.replace(".", "") in content_type for ext in allowed_extensions):
            return api_error("Format konten berkas tidak valid.", code="INVALID_FILE_TYPE", status=400)

        with transaction.atomic():
            att = SessionAttachment.objects.create(
                session=session,
                file=uploaded_file,
                original_name=name,
                content_type=content_type or ("application/pdf" if ext == ".pdf" else f"image/{ext.replace('.', '')}"),
                size_bytes=uploaded_file.size,
                uploaded_by=request.user if request.user.is_authenticated else None,
            )

        return api_success(serialize_attachment(att, request), status=201)

    return api_error("Metode tidak diizinkan.", code="METHOD_NOT_ALLOWED", status=405)


@csrf_exempt
def v1_session_attachment_detail(request, attachment_id, session_id=None):
    att = SessionAttachment.objects.filter(pk=attachment_id).select_related("session__schedule__teacher").first()
    if not att:
        return api_error(f"Lampiran '{attachment_id}' tidak ditemukan.", code="NOT_FOUND", status=404)

    if session_id and str(att.session_id) != str(session_id):
        return api_error(f"Lampiran tidak sesuai dengan sesi '{session_id}'.", code="NOT_FOUND", status=404)

    if request.method == "GET":
        return api_success(serialize_attachment(att, request))

    elif request.method == "DELETE":
        if request.user.is_authenticated and not request.user.is_admin_role():
            if hasattr(request.user, "teacher_profile"):
                if att.session.schedule.teacher_id != request.user.teacher_profile.id:
                    return api_error("Anda tidak memiliki izin menghapus lampiran sesi ini.", code="FORBIDDEN", status=403)
            else:
                return api_error("Akses ditolak.", code="FORBIDDEN", status=403)

        payload = serialize_attachment(att, request)
        try:
            if att.file:
                att.file.delete(save=False)
        except Exception:
            pass

        att.delete()
        return api_success(payload)

    return api_error("Metode tidak diizinkan.", code="METHOD_NOT_ALLOWED", status=405)
