with open("backend/core/views.py", "r", encoding="utf-8") as f:
    text = f.read()

old_block = """    finance = {
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
    }"""

new_block = """    if total_billed == 0:
        latest_bp = BillingPeriod.objects.filter(status="ACTIVE").order_by("-month").first()
        if latest_bp:
            payments_latest = Payment.objects.filter(period=latest_bp.month)
            t_billed = float(payments_latest.aggregate(t=Sum("amount_due"))["t"] or 0)
            if t_billed > 0:
                total_billed = t_billed
                total_paid = float(payments_latest.aggregate(t=Sum("amount_paid"))["t"] or 0)
                overdue_count = payments_latest.filter(status=Payment.Status.OVERDUE).count()
                pending_count = payments_latest.filter(status=Payment.Status.PENDING).count()

    finance = {
        "period_id": target_date.strftime("%Y-%m"),
        "total_billed": total_billed,
        "total_paid": total_paid,
        "overdue_count": overdue_count,
        "pending_count": pending_count,
    }

    active_students = Student.objects.filter(status=Student.Status.ACTIVE)
    sd_count = active_students.filter(grade__icontains="SD").count()
    smp_count = active_students.filter(grade__icontains="SMP").count()
    sma_count = active_students.filter(grade__icontains="SMA").count() + active_students.filter(grade__icontains="IPA").count()

    sd_rombel = ClassGroup.objects.filter(is_active=True, name__icontains="SD").count()
    smp_rombel = (
        ClassGroup.objects.filter(is_active=True, name__startswith="7").count()
        + ClassGroup.objects.filter(is_active=True, name__startswith="8").count()
        + ClassGroup.objects.filter(is_active=True, name__startswith="9").count()
    )
    sma_rombel = (
        ClassGroup.objects.filter(is_active=True, name__startswith="10").count()
        + ClassGroup.objects.filter(is_active=True, name__startswith="11").count()
        + ClassGroup.objects.filter(is_active=True, name__startswith="12").count()
    )

    levels = {
        "sd": {"students": sd_count, "rombel": sd_rombel, "target": 12},
        "smp": {"students": smp_count, "rombel": smp_rombel, "target": 72},
        "sma": {"students": sma_count, "rombel": sma_rombel, "target": 60},
    }

    session_status = {
        "scheduled": sum(1 for s in schedule_data if s["status"] == "SCHEDULED"),
        "ongoing": sum(1 for s in schedule_data if s["status"] in ("ONGOING", "IN_PROGRESS")),
        "completed": sum(1 for s in schedule_data if s["status"] == "COMPLETED"),
    }

    data = {
        "date": target_date.isoformat(),
        "role": role_str,
        "schedule": schedule_data,
        "attendance": attendance,
        "metrics": metrics,
        "finance": finance,
        "levels": levels,
        "session_status": session_status,
    }"""

assert old_block in text, "old_block not found in views.py"
text = text.replace(old_block, new_block, 1)

with open("backend/core/views.py", "w", encoding="utf-8") as f:
    f.write(text)

print("views.py updated successfully!")
