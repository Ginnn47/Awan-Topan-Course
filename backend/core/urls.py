from django.urls import path

from . import views

urlpatterns = [
    path("health/", views.health, name="health"),
    path("dashboard/", views.dashboard_summary, name="dashboard-summary"),
    path("schedules/", views.schedule_list, name="schedule-list"),
    path("sessions/<int:session_id>/", views.session_detail, name="session-detail"),
    path("payments/", views.payment_list, name="payment-list"),
]
