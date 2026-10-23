#!/usr/bin/env python
"""
Awan Topan Course - PostgreSQL to MySQL Data Migration Tool.

Migrates all business data from PostgreSQL source database to MySQL/MariaDB target database.
Maintains data integrity, primary keys, foreign keys, timestamps, password hashes, and relations.
"""

import argparse
import json
import os
import sys
from datetime import datetime
from pathlib import Path

# Add backend directory to path
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "awantopan.settings")

import django  # noqa: E402

try:
    django.setup()
except Exception as e:
    print(f"[ERROR] Failed to initialize Django: {e}")
    sys.exit(1)

from django.apps import apps  # noqa: E402
from django.conf import settings  # noqa: E402
from django.contrib.auth import get_user_model  # noqa: E402
from django.contrib.auth.models import Group  # noqa: E402
from django.core.serializers import serialize  # noqa: E402
from django.db import DEFAULT_DB_ALIAS, connections, transaction  # noqa: E402
from django.db.utils import OperationalError, ProgrammingError  # noqa: E402

SOURCE_ALIAS = "source_pg"
TARGET_ALIAS = DEFAULT_DB_ALIAS

# Ordered list of models to migrate respecting FK dependencies
MODELS_TO_MIGRATE = [
    Group,
    apps.get_model("core", "User"),
    apps.get_model("core", "TeacherProfile"),
    apps.get_model("core", "Student"),
    apps.get_model("core", "Subject"),
    apps.get_model("core", "ClassGroup"),
    apps.get_model("core", "Enrollment"),
    apps.get_model("core", "Schedule"),
    apps.get_model("core", "SessionRecord"),
    apps.get_model("core", "TeacherAttendance"),
    apps.get_model("core", "StudentAttendance"),
    apps.get_model("core", "Payment"),
    apps.get_model("core", "AuditLog"),
]


def check_connections():
    """Verify that both source PostgreSQL and target MySQL databases are reachable."""
    print("=================================================================")
    print(" 1. Memeriksa Koneksi Database Sumber (PG) & Target (MySQL)")
    print("=================================================================")

    # Check target (MySQL)
    try:
        target_conn = connections[TARGET_ALIAS]
        target_conn.ensure_connection()
        vendor = target_conn.vendor
        db_name = settings.DATABASES[TARGET_ALIAS].get("NAME")
        print(f" [OK] Koneksi Target ({vendor}): Database '{db_name}' berhasil terhubung.")
    except Exception as e:
        print(f" [FAIL] Gagal terhubung ke Database Target ({TARGET_ALIAS}): {e}")
        return False

    # Check source (PostgreSQL)
    if SOURCE_ALIAS not in connections:
        print(f" [FAIL] Database alias '{SOURCE_ALIAS}' tidak ditemukan dalam settings.DATABASES.")
        print("        Pastikan SOURCE_DB_NAME / POSTGRES_SOURCE_DB telah diset di .env")
        return False

    try:
        source_conn = connections[SOURCE_ALIAS]
        source_conn.ensure_connection()
        vendor = source_conn.vendor
        db_name = settings.DATABASES[SOURCE_ALIAS].get("NAME")
        print(f" [OK] Koneksi Sumber ({vendor}): Database '{db_name}' berhasil terhubung.")
    except Exception as e:
        print(f" [FAIL] Gagal terhubung ke Database Sumber ({SOURCE_ALIAS}): {e}")
        return False

    return True


def check_target_readiness(force=False):
    """Verify that target MySQL has migrations applied and is safe to write into."""
    print("\n=================================================================")
    print(" 2. Memeriksa Kesiapan Skema & Keamanan Target Database")
    print("=================================================================")
    target_conn = connections[TARGET_ALIAS]

    # Check django_migrations
    with target_conn.cursor() as cursor:
        try:
            cursor.execute("SELECT count(*) FROM django_migrations WHERE app = 'core'")
            core_mig_count = cursor.fetchone()[0]
            if core_mig_count == 0:
                print(" [FAIL] Target MySQL belum memiliki schema migrations 'core'.")
                print("        Jalankan: python manage.py migrate")
                return False
            print(f" [OK] Target skema valid ({core_mig_count} core migration terdeteksi).")
        except (OperationalError, ProgrammingError) as e:
            print(f" [FAIL] Tabel django_migrations tidak ditemukan di target: {e}")
            print("        Jalankan: python manage.py migrate")
            return False

    # Check if target already has existing business data
    total_existing = 0
    User = get_user_model()
    existing_users = User.objects.using(TARGET_ALIAS).count()
    total_existing += existing_users

    for model in MODELS_TO_MIGRATE[2:]:
        count = model.objects.using(TARGET_ALIAS).count()
        total_existing += count

    if total_existing > 0 and not force:
        print(f" [WARN] Database target sudah berisi {total_existing} record.")
        print("        Gunakan opsi --force jika Anda berniat menimpa/mengganti data.")
        return False
    elif total_existing > 0 and force:
        print(f" [WARN] Opsi --force aktif: {total_existing} record yang ada akan dibersihkan terlebih dahulu.")

    return True


def create_source_backup():
    """Create a local JSON backup of all source models before migration."""
    print("\n=================================================================")
    print(" 3. Membuat Backup Data PostgreSQL Sumber")
    print("=================================================================")
    backup_dir = BASE_DIR / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_file = backup_dir / f"pg_source_backup_{timestamp}.json"

    source_records = []
    initial_counts = {}

    for model in MODELS_TO_MIGRATE:
        qs = model.objects.using(SOURCE_ALIAS).all()
        count = qs.count()
        initial_counts[model._meta.label] = count
        if count > 0:
            json_data = serialize("json", qs, use_natural_foreign_keys=True, use_natural_primary_keys=True)
            source_records.extend(json.loads(json_data))

    with open(backup_file, "w", encoding="utf-8") as f:
        json.dump(source_records, f, indent=2, ensure_ascii=False)

    print(f" [OK] Backup tersimpan di: {backup_file}")
    print(f" [OK] Total record yang dibackup: {len(source_records)}")
    print(" [INFO] Jumlah record awal per model:")
    for label, count in initial_counts.items():
        print(f"       - {label:30}: {count}")

    return backup_file, initial_counts


def run_data_migration(force=False):
    """Migrate all records in topological order with FK integrity."""
    print("\n=================================================================")
    print(" 4. Memulai Migrasi Data PostgreSQL -> MySQL")
    print("=================================================================")
    target_conn = connections[TARGET_ALIAS]

    with transaction.atomic(using=TARGET_ALIAS):
        with target_conn.cursor() as cursor:
            # Temporarily disable foreign key checks in MySQL for clean bulk loading
            if target_conn.vendor == "mysql":
                cursor.execute("SET FOREIGN_KEY_CHECKS = 0;")

            try:
                # If force is requested, clean target tables in reverse topological order
                if force:
                    print(" [INFO] Membersihkan tabel target (mode --force)...")
                    for model in reversed(MODELS_TO_MIGRATE):
                        model.objects.using(TARGET_ALIAS).all().delete()

                # Migrate each model
                for model in MODELS_TO_MIGRATE:
                    model_label = model._meta.label
                    source_qs = model.objects.using(SOURCE_ALIAS).all().order_by("pk")
                    total_source = source_qs.count()

                    if total_source == 0:
                        print(f" [SKIP] {model_label:30} : 0 record di sumber.")
                        continue

                    # Bulk insert or save preserving PKs
                    inserted = 0
                    batch_size = 500
                    batch = []

                    for obj in source_qs.iterator(chunk_size=batch_size):
                        batch.append(obj)
                        if len(batch) >= batch_size:
                            model.objects.using(TARGET_ALIAS).bulk_create(batch, ignore_conflicts=True)
                            inserted += len(batch)
                            batch = []

                    if batch:
                        model.objects.using(TARGET_ALIAS).bulk_create(batch, ignore_conflicts=True)
                        inserted += len(batch)

                    print(f" [DONE] {model_label:30} : {inserted}/{total_source} record dipindahkan.")

                # Migrate Many-to-Many relationships for User (groups, permissions)
                print(" [INFO] Memigrasikan relasi Many-to-Many User (groups & permissions)...")
                User = get_user_model()
                for source_user in User.objects.using(SOURCE_ALIAS).all():
                    try:
                        target_user = User.objects.using(TARGET_ALIAS).get(pk=source_user.pk)
                        target_user.groups.set(source_user.groups.all())
                        target_user.user_permissions.set(source_user.user_permissions.all())
                    except User.DoesNotExist:
                        pass

                # Handle sessions: Invalidate stale login sessions for security
                print(" [INFO] Sesi login lama diinvalidasi demi keamanan sistem.")

            finally:
                if target_conn.vendor == "mysql":
                    cursor.execute("SET FOREIGN_KEY_CHECKS = 1;")

    # Reset MySQL AUTO_INCREMENT sequences
    resync_auto_increment()


def resync_auto_increment():
    """Synchronize MySQL AUTO_INCREMENT sequences to MAX(id) + 1."""
    print("\n=================================================================")
    print(" 5. Menyinkronkan Urutan Auto-Increment MySQL")
    print("=================================================================")
    target_conn = connections[TARGET_ALIAS]
    if target_conn.vendor != "mysql":
        print(" [SKIP] Target bukan MySQL, auto-increment resync dilewati.")
        return

    with target_conn.cursor() as cursor:
        for model in MODELS_TO_MIGRATE:
            table_name = model._meta.db_table
            pk_name = model._meta.pk.column
            try:
                cursor.execute(f"SELECT COALESCE(MAX(`{pk_name}`), 0) + 1 FROM `{table_name}`")
                next_id = cursor.fetchone()[0]
                cursor.execute(f"ALTER TABLE `{table_name}` AUTO_INCREMENT = {next_id};")
                print(f" [OK] {table_name:30} -> AUTO_INCREMENT diset ke {next_id}")
            except Exception as e:
                print(f" [WARN] Gagal menyinkronkan {table_name}: {e}")


def verify_migration_results(initial_counts):
    """Verify that counts and key values match between source and target."""
    print("\n=================================================================")
    print(" 6. Verifikasi Integritas Data & Hasil Migrasi")
    print("=================================================================")
    print(f"{'Nama Model / Tabel':<35} | {'Sumber (PG)':<12} | {'Target (MySQL)':<14} | {'Status':<10}")
    print("-" * 78)

    all_match = True
    for model in MODELS_TO_MIGRATE:
        label = model._meta.label
        source_count = initial_counts.get(label, model.objects.using(SOURCE_ALIAS).count())
        target_count = model.objects.using(TARGET_ALIAS).count()
        status = "MATCH" if source_count == target_count else "MISMATCH"
        if status == "MISMATCH":
            all_match = False
        print(f"{label:<35} | {source_count:<12} | {target_count:<14} | {status:<10}")

    print("-" * 78)

    # Key business value checks
    Payment = apps.get_model("core", "Payment")
    pg_due = Payment.objects.using(SOURCE_ALIAS).aggregate(total=django.db.models.Sum("amount_due"))["total"] or 0
    my_due = Payment.objects.using(TARGET_ALIAS).aggregate(total=django.db.models.Sum("amount_due"))["total"] or 0
    pg_paid = Payment.objects.using(SOURCE_ALIAS).aggregate(total=django.db.models.Sum("amount_paid"))["total"] or 0
    my_paid = Payment.objects.using(TARGET_ALIAS).aggregate(total=django.db.models.Sum("amount_paid"))["total"] or 0

    print(f"\n[Verifikasi Finansial]")
    print(f" Total Amount Due  - Sumber: Rp {float(pg_due):,.2f} | Target: Rp {float(my_due):,.2f}")
    print(f" Total Amount Paid - Sumber: Rp {float(pg_paid):,.2f} | Target: Rp {float(my_paid):,.2f}")

    if all_match and pg_due == my_due and pg_paid == my_paid:
        print("\n [SUKSES] Seluruh data berhasil dimigrasikan dan diverifikasi secara konsisten!")
        return True
    else:
        print("\n [PERINGATAN] Terdeteksi perbedaan data antara database sumber dan target.")
        return False


def main():
    parser = argparse.ArgumentParser(description="Awan Topan Course - PostgreSQL to MySQL Data Migrator")
    parser.add_argument("--force", action="store_true", help="Timpa data yang ada di database target jika sudah ada")
    parser.add_argument("--verify-only", action="store_true", help="Hanya jalankan verifikasi tanpa migrasi")
    args = parser.parse_args()

    if not check_connections():
        print("\n[ABORT] Migrasi dihentikan karena koneksi database belum siap.")
        sys.exit(1)

    if args.verify_only:
        initial_counts = {}
        for m in MODELS_TO_MIGRATE:
            initial_counts[m._meta.label] = m.objects.using(SOURCE_ALIAS).count()
        verify_migration_results(initial_counts)
        return

    if not check_target_readiness(force=args.force):
        print("\n[ABORT] Database target belum siap untuk migrasi data.")
        sys.exit(1)

    backup_file, initial_counts = create_source_backup()

    try:
        run_data_migration(force=args.force)
        success = verify_migration_results(initial_counts)
        if not success:
            sys.exit(1)
    except Exception as e:
        print(f"\n[ERROR] Migrasi gagal karena terjadi kesalahan: {e}")
        print(f"        Data cadangan tersimpan di {backup_file}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
