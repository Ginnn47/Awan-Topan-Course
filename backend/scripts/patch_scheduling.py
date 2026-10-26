with open('backend/core/views_scheduling.py', 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Update imports
old_imp = """from .models import (
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
)"""
new_imp = """from .models import (
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
)"""
assert old_imp in text, 'old_imp not found'
text = text.replace(old_imp, new_imp, 1)

# 2. Update _serialize_teaching_session
old_ser = """    return {
        "id": str(session.id),
        "occurrence_id": str(schedule.id),
        "occurrence_status": STATUS_TO_FRONTEND.get(schedule.status, "SCHEDULED"),"""

new_ser = """    ta = getattr(session, "teacher_attendance", None)
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
        "teacher_attendance": teacher_attendance_data,"""
assert old_ser in text, 'old_ser not found'
text = text.replace(old_ser, new_ser, 1)

# 3. Update v1_schedule_occurrence_start
old_start = """        if not created and session.status == SessionRecord.Status.DRAFT:
            session.status = SessionRecord.Status.ACTIVE
            session.started_at = timezone.now()
            session.topic = topic
            session.save(update_fields=["status", "started_at", "topic"])

    return api_success(_serialize_teaching_session(session))"""

new_start = """        if not created and session.status == SessionRecord.Status.DRAFT:
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

    return api_success(_serialize_teaching_session(session))"""
assert old_start in text, 'old_start not found'
text = text.replace(old_start, new_start, 1)

# 4. Update v1_session_attendance
old_att = """                elif sa:
                    sa.status = status_reverse[st_status]
                    sa.modified_by = request.user if request.user.is_authenticated else None
                    sa.save(update_fields=["status", "modified_by", "modified_at"])

        return api_success(_serialize_teaching_session(session))"""

new_att = """                elif sa:
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

        return api_success(_serialize_teaching_session(session))"""
assert old_att in text, 'old_att not found'
text = text.replace(old_att, new_att, 1)

# 5. Update v1_session_complete
old_comp = """    with transaction.atomic():
        session.complete()
        session.schedule.status = Schedule.Status.COMPLETED
        session.schedule.save(update_fields=["status"])

    return api_success(_serialize_teaching_session(session))"""

new_comp = """    with transaction.atomic():
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

    return api_success(_serialize_teaching_session(session))"""
assert old_comp in text, 'old_comp not found'
text = text.replace(old_comp, new_comp, 1)

# 6. Update v1_session_reopen
old_reopen = """        session.schedule.status = Schedule.Status.ONGOING
        session.schedule.save(update_fields=["status"])

    return api_success(_serialize_teaching_session(session))"""

new_reopen = """        session.schedule.status = Schedule.Status.ONGOING
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

    return api_success(_serialize_teaching_session(session))"""
assert old_reopen in text, 'old_reopen not found'
text = text.replace(old_reopen, new_reopen, 1)

with open('backend/core/views_scheduling.py', 'w', encoding='utf-8') as f:
    f.write(text)

print('views_scheduling.py updated successfully!')
