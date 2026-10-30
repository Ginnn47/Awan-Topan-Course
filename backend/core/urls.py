from django.urls import path
from . import views

urlpatterns = [
    # Auth endpoints
    path("auth/csrf/", views.auth_csrf, name="auth-csrf"),
    path("auth/login/", views.auth_login, name="auth-login"),
    path("auth/logout/", views.auth_logout, name="auth-logout"),
    path("auth/me/", views.auth_me, name="auth-me"),

    # Dashboard & Notifications
    path("dashboard/", views.v1_dashboard, name="v1-dashboard"),
    path("dashboard/summary/", views.dashboard_summary, name="dashboard-summary"),
    path("notifications/", views.v1_notifications, name="v1-notifications"),

    # Scheduling & Sessions
    path("schedule-occurrences/", views.v1_schedule_occurrences, name="v1-schedule-occurrences"),
    path("schedule-occurrences/<str:occurrence_id>/", views.v1_schedule_occurrence_detail, name="v1-schedule-occurrence-detail"),
    path("schedule-occurrences/<str:occurrence_id>/reschedule/", views.v1_schedule_occurrence_reschedule, name="v1-schedule-occurrence-reschedule"),
    path("schedule-occurrences/<str:occurrence_id>/cancel/", views.v1_schedule_occurrence_cancel, name="v1-schedule-occurrence-cancel"),
    path("schedule-occurrences/<str:occurrence_id>/start/", views.v1_schedule_occurrence_start, name="v1-schedule-occurrence-start"),
    path("schedule-series/replicate-week/", views.v1_schedule_replicate_week, name="v1-schedule-replicate-week"),
    path("schedule-series/", views.v1_schedule_series_create, name="v1-schedule-series-create"),

    path("sessions/<str:session_id>/", views.v1_session_detail, name="v1-session-detail"),
    path("sessions/<str:session_id>/attendance/", views.v1_session_attendance, name="v1-session-attendance"),
    path("sessions/<str:session_id>/complete/", views.v1_session_complete, name="v1-session-complete"),
    path("sessions/<str:session_id>/reopen/", views.v1_session_reopen, name="v1-session-reopen"),
    path("sessions/<str:session_id>/lesson-report/", views.v1_session_lesson_report, name="v1-session-lesson-report"),
    path("sessions/<str:session_id>/attachments/<str:attachment_id>/", views.v1_session_attachment_detail, name="v1-session-attachment-detail"),
    path("sessions/<str:session_id>/attachments/", views.v1_session_attachments, name="v1-session-attachments"),
    path("attachments/<str:attachment_id>/", views.v1_session_attachment_detail, name="v1-attachment-detail"),

    # Academics: Class Groups (Rombel) CRUD & Recap
    path("class-groups/", views.v1_class_groups, name="v1-class-groups"),
    path("class-groups/<str:class_group_id>/", views.v1_class_group_detail, name="v1-class-group-detail"),
    path("class-groups/<str:class_group_id>/monthly-recap/", views.v1_class_group_monthly_recap, name="v1-class-group-monthly-recap"),

    # Academics: Enrollments & Roster Batch
    path("enrollments/roster-batch/", views.v1_enrollments_roster_batch, name="v1-enrollments-roster-batch"),
    path("enrollments/", views.v1_enrollments, name="v1-enrollments"),

    # Academics: Fee Plans
    path("fee-plans/", views.v1_fee_plans, name="v1-fee-plans"),
    path("fee-plans/<str:fee_plan_id>/", views.v1_fee_plan_detail, name="v1-fee-plan-detail"),
    path("fee-plans/<str:fee_plan_id>/replace-and-archive/", views.v1_fee_plan_replace_and_archive, name="v1-fee-plan-replace-and-archive"),

    # Teachers CRUD
    path("teachers/", views.v1_teachers, name="v1-teachers"),
    path("teachers/<str:teacher_id>/", views.v1_teacher_detail, name="v1-teacher-detail"),

    # Academic & Room lists
    path("rooms/", views.v1_rooms, name="v1-rooms"),
    path("subjects/", views.v1_subjects, name="v1-subjects"),

    # Students CRUD & Monthly Recap
    path("students/", views.v1_students, name="v1-students"),
    path("students/<str:student_id>/monthly-recap/", views.v1_student_monthly_recap, name="v1-student-monthly-recap"),
    path("students/<str:student_id>/", views.v1_student_detail, name="v1-student-detail"),

    # Finance: Billing Periods
    path("billing-periods/", views.v1_billing_periods, name="v1-billing-periods"),
    path("billing-periods/<str:period_id>/synchronize/", views.v1_billing_period_synchronize, name="v1-billing-period-synchronize"),
    path("billing-periods/<str:period_id>/close/", views.v1_billing_period_close, name="v1-billing-period-close"),

    # Finance: Invoices
    path("invoices/", views.v1_invoices, name="v1-invoices"),
    path("invoices/<str:invoice_id>/reprice/", views.v1_invoice_reprice, name="v1-invoice-reprice"),
    path("invoices/<str:invoice_id>/", views.v1_invoice_detail, name="v1-invoice-detail"),

    # Finance: Payment Transactions
    path("payment-transactions/", views.v1_payment_transactions, name="v1-payment-transactions"),
    path("payment-transactions/<str:transaction_id>/verify/", views.v1_payment_transaction_verify, name="v1-payment-transaction-verify"),
    path("payment-transactions/<str:transaction_id>/<str:action>/", views.v1_payment_transaction_review_action, name="v1-payment-transaction-review-action"),
    path("payment-transactions/<str:transaction_id>/", views.v1_payment_transaction_detail, name="v1-payment-transaction-detail"),

    # Legacy endpoints
    path("health/", views.health, name="health"),
    path("health/ready/", views.health_ready, name="health-ready"),
    path("schedules/", views.schedule_list, name="schedule-list"),
    path("payments/", views.payment_list, name="payment-list"),
]
