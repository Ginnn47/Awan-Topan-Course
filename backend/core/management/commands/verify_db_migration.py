from django.core.management.base import BaseCommand
from scripts import verify_migration


class Command(BaseCommand):
    help = "Verifies data integrity and consistency between source and MySQL target database."

    def handle(self, *args, **options):
        success = verify_migration.run_verification()
        if success:
            self.stdout.write(self.style.SUCCESS("Verification audit PASSED successfully!"))
        else:
            self.stderr.write(self.style.WARNING("Verification audit finished with warnings or issues."))
