from django.core.management import call_command
from django.test import TestCase

from core.models import BillingPeriod, ClassGroup, Payment, PaymentTransaction, Student, TeacherProfile, User


class SeedAppDataTestCase(TestCase):
    def test_seed_is_complete_and_idempotent(self):
        call_command("seed_app_data", period="2026-10", password="test-password")
        first_counts = self._counts()

        call_command("seed_app_data", period="2026-10", password="test-password")
        self.assertEqual(first_counts, self._counts())
        self.assertEqual(BillingPeriod.objects.get(period_id="2026-10").month.isoformat(), "2026-10-01")
        self.assertEqual(Payment.objects.filter(period="2026-10-01").count(), 12)
        self.assertEqual(PaymentTransaction.objects.filter(status="VERIFIED").count(), 1)

    @staticmethod
    def _counts():
        return {
            "users": User.objects.count(),
            "teachers": TeacherProfile.objects.count(),
            "classes": ClassGroup.objects.count(),
            "students": Student.objects.count(),
            "payments": Payment.objects.count(),
            "transactions": PaymentTransaction.objects.count(),
        }
