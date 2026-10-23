from unittest import TestCase
from scripts.migrate_pg_to_mysql import MODELS_TO_MIGRATE


class MigrationToolTestCase(TestCase):
    def test_topological_models_order(self):
        labels = [m._meta.label for m in MODELS_TO_MIGRATE]
        # User must come before TeacherProfile, Schedule, Attendance, Payment, AuditLog
        self.assertLess(labels.index("core.User"), labels.index("core.TeacherProfile"))
        self.assertLess(labels.index("core.TeacherProfile"), labels.index("core.ClassGroup"))
        self.assertLess(labels.index("core.Student"), labels.index("core.Enrollment"))
        self.assertLess(labels.index("core.ClassGroup"), labels.index("core.Schedule"))
        self.assertLess(labels.index("core.Schedule"), labels.index("core.SessionRecord"))
        self.assertLess(labels.index("core.SessionRecord"), labels.index("core.TeacherAttendance"))
        self.assertLess(labels.index("core.SessionRecord"), labels.index("core.StudentAttendance"))
        self.assertLess(labels.index("core.Student"), labels.index("core.Payment"))

    def test_all_core_models_included(self):
        labels = set(m._meta.label for m in MODELS_TO_MIGRATE)
        expected = {
            "auth.Group",
            "core.User",
            "core.TeacherProfile",
            "core.Student",
            "core.Subject",
            "core.ClassGroup",
            "core.Enrollment",
            "core.Schedule",
            "core.SessionRecord",
            "core.TeacherAttendance",
            "core.StudentAttendance",
            "core.Payment",
            "core.AuditLog",
        }
        self.assertEqual(labels, expected)
