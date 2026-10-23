from django.core.management.base import BaseCommand
from scripts import migrate_pg_to_mysql


class Command(BaseCommand):
    help = "Migrates all business data from PostgreSQL source to MySQL target database."

    def add_arguments(self, parser):
        parser.add_argument(
            "--force",
            action="store_true",
            help="Force overwrite/clean target tables before migration if data exists",
        )
        parser.add_argument(
            "--verify-only",
            action="store_true",
            help="Run verification only without transferring data",
        )

    def handle(self, *args, **options):
        if not migrate_pg_to_mysql.check_connections():
            self.stderr.write(self.style.ERROR("Database connections check failed. Aborting."))
            return

        if options["verify_only"]:
            initial_counts = {
                m._meta.label: m.objects.using(migrate_pg_to_mysql.SOURCE_ALIAS).count()
                for m in migrate_pg_to_mysql.MODELS_TO_MIGRATE
            }
            migrate_pg_to_mysql.verify_migration_results(initial_counts)
            return

        if not migrate_pg_to_mysql.check_target_readiness(force=options["force"]):
            self.stderr.write(self.style.ERROR("Target readiness check failed. Aborting."))
            return

        backup_file, initial_counts = migrate_pg_to_mysql.create_source_backup()
        try:
            migrate_pg_to_mysql.run_data_migration(force=options["force"])
            success = migrate_pg_to_mysql.verify_migration_results(initial_counts)
            if success:
                self.stdout.write(self.style.SUCCESS("Data migration completed successfully!"))
            else:
                self.stderr.write(self.style.WARNING("Migration completed with differences. Please review log."))
        except Exception as e:
            self.stderr.write(self.style.ERROR(f"Migration error: {e}"))
            self.stderr.write(f"Backup file is safely located at: {backup_file}")
            raise
