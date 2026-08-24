from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import (
    AuditLog,
    ClassGroup,
    Enrollment,
    Payment,
    Schedule,
    SessionRecord,
    Student,
    StudentAttendance,
    Subject,
    TeacherAttendance,
    TeacherProfile,
    User,
)


@admin.register(User)
class AwanTopanUserAdmin(UserAdmin):
    fieldsets = UserAdmin.fieldsets + (("Awan Topan", {"fields": ("role",)}),)
    list_display = ("username", "email", "first_name", "last_name", "role", "is_staff")
    list_filter = ("role", "is_staff", "is_superuser", "is_active")


admin.site.register(TeacherProfile)
admin.site.register(Student)
admin.site.register(Subject)
admin.site.register(ClassGroup)
admin.site.register(Enrollment)
admin.site.register(Schedule)
admin.site.register(SessionRecord)
admin.site.register(TeacherAttendance)
admin.site.register(StudentAttendance)
admin.site.register(Payment)
admin.site.register(AuditLog)
