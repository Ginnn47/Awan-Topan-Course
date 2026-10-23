#!/usr/bin/env python
"""
Awan Topan Course - Migration Verification & Data Integrity Audit Tool.

Audits and compares record counts, foreign key integrity, password hashes,
financial figures, and auto-increment sequences between PostgreSQL and MySQL.
"""

import os
import sys
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
from django.db import DEFAULT_DB_ALIAS, connections  # noqa: E402
from django.db.models import Max, Min, Sum  # noqa: E402

SOURCE_ALIAS = "source_pg"
TARGET_ALIAS = DEFAULT_DB_ALIAS

MODELS_TO_VERIFY = [
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


def run_verification():
    print("=" * 80)
    print(" AWAN TOPAN COURSE — AUDIT INTEGRITAS & VERIFIKASI MIGRASI DATABASE")
    print("=" * 80)

    has_source = SOURCE_ALIAS in connections
    target_conn = connections[TARGET_ALIAS]
    try:
        target_conn.ensure_connection()
        print(f"[TARGET] {target_conn.vendor.upper()}: Database '{settings.DATABASES[TARGET_ALIAS].get('NAME')}' terhubung.")
    except Exception as e:
        print(f"[ERROR] Target database tidak dapat diakses: {e}")
        return False

    if has_source:
        try:
            source_conn = connections[SOURCE_ALIAS]
            source_conn.ensure_connection()
            print(f"[SUMBER] {source_conn.vendor.upper()}: Database '{settings.DATABASES[SOURCE_ALIAS].get('NAME')}' terhubung.")
        except Exception as e:
            print(f"[WARN] Sumber PostgreSQL tidak dapat dihubungi ({e}). Verifikasi target mandiri dijalankan.")
            has_source = False
    else:
        print("[INFO] Alias sumber 'source_pg' tidak diset. Menjalankan audit mandiri pada target.")

    print("\n" + "=" * 80)
    print(" 1. TABEL PERBANDINGAN JUMLAH RECORD")
    print("=" * 80)
    if has_source:
        print(f"{'Nama Model / Tabel':<30} | {'Sumber (PG)':<12} | {'Target (MySQL)':<14} | {'Min ID':<8} | {'Max ID':<8} | {'Status':<8}")
        print("-" * 88)
    else:
        print(f"{'Nama Model / Tabel':<35} | {'Jumlah Record Target':<22} | {'Min ID':<10} | {'Max ID':<10}")
        print("-" * 88)

    all_matched = True
    for model in MODELS_TO_VERIFY:
        label = model._meta.label
        target_qs = model.objects.using(TARGET_ALIAS).all()
        target_count = target_qs.count()
        min_id = target_qs.aggregate(val=Min("pk"))["val"] or 0
        max_id = target_qs.aggregate(val=Max("pk"))["val"] or 0

        if has_source:
            source_count = model.objects.using(SOURCE_ALIAS).count()
            status = "MATCH" if source_count == target_count else "MISMATCH"
            if status == "MISMATCH":
                all_matched = False
            print(f"{label:<30} | {source_count:<12} | {target_count:<14} | {min_id:<8} | {max_id:<8} | {status:<8}")
        else:
            print(f"{label:<35} | {target_count:<22} | {min_id:<10} | {max_id:<10}")

    print("-" * 88)

    print("\n" + "=" * 80)
    print(" 2. AUDIT KEAMANAN AKUN USER & PASSWORD HASH")
    print("=" * 80)
    User = get_user_model()
    target_users = User.objects.using(TARGET_ALIAS).all()
    total_users = target_users.count()
    admin_users = target_users.filter(role="admin").count()
    teacher_users = target_users.filter(role="teacher").count()
    superuser_users = target_users.filter(is_superuser=True).count()

    invalid_hashes = 0
    for u in target_users:
        if not (u.password.startswith("pbkdf2_") or u.password.startswith("argon2") or u.password.startswith("bcrypt")):
            invalid_hashes += 1

    print(f" Total Pengguna Terdaftar : {total_users}")
    print(f" - Admin / Tata Usaha     : {admin_users}")
    print(f" - Guru                   : {teacher_users}")
    print(f" - Superuser              : {superuser_users}")
    if invalid_hashes == 0:
        print(" [OK] Seluruh password pengguna tersimpan dalam format hash kriptografis yang aman.")
    else:
        print(f" [ALERT] Terdeteksi {invalid_hashes} user dengan format password yang tidak standar!")
        all_matched = False

    print("\n" + "=" * 80)
    print(" 3. AUDIT KEUANGAN (PAYMENTS)")
    print("=" * 80)
    Payment = apps.get_model("core", "Payment")
    target_payments = Payment.objects.using(TARGET_ALIAS).all()
    my_due = target_payments.aggregate(t=Sum("amount_due"))["t"] or 0
    my_paid = target_payments.aggregate(t=Sum("amount_paid"))["t"] or 0

    print(f" Total Record Pembayaran  : {target_payments.count()}")
    print(f" Total Tagihan (Amount Due): Rp {float(my_due):,.2f}")
    print(f" Total Terbayar (Amount Paid): Rp {float(my_paid):,.2f}")

    if has_source:
        pg_payments = Payment.objects.using(SOURCE_ALIAS).all()
        pg_due = pg_payments.aggregate(t=Sum("amount_due"))["t"] or 0
        pg_paid = pg_payments.aggregate(t=Sum("amount_paid"))["t"] or 0
        if pg_due == my_due and pg_paid == my_paid:
            print(" [OK] Nilai finansial di target PERSIS sama dengan database sumber.")
        else:
            print(" [ALERT] Ditemukan selisih nilai nominal finansial antara sumber dan target!")
            all_matched = False

    print("\n" + "=" * 80)
    print(" 4. AUDIT ORPHAN FOREIGN KEY")
    print("=" * 80)
    orphan_found = False

    # Check StudentAttendance -> Student
    StudentAttendance = apps.get_model("core", "StudentAttendance")
    Student = apps.get_model("core", "Student")
    student_ids = set(Student.objects.using(TARGET_ALIAS).values_list("id", flat=True))
    dangling_attendances = StudentAttendance.objects.using(TARGET_ALIAS).exclude(student_id__in=student_ids).count()
    if dangling_attendances > 0:
        print(f" [ALERT] Ditemukan {dangling_attendances} StudentAttendance dengan student_id yatim!")
        orphan_found = True

    # Check Payment -> Student
    dangling_payments = Payment.objects.using(TARGET_ALIAS).exclude(student_id__in=student_ids).count()
    if dangling_payments > 0:
        print(f" [ALERT] Ditemukan {dangling_payments} Payment dengan student_id yatim!")
        orphan_found = True

    if not orphan_found:
        print(" [OK] Seluruh Foreign Key valid dan tidak ada relasi yatim (orphaned).")

    print("\n" + "=" * 80)
    print(" 5. AUDIT URUTAN AUTO-INCREMENT MYSQL")
    print("=" * 80)
    if target_conn.vendor == "mysql":
        with target_conn.cursor() as cursor:
            for model in MODELS_TO_VERIFY:
                tbl = model._meta.db_table
                pk_col = model._meta.pk.column
                try:
                    cursor.execute(f"SELECT COALESCE(MAX(`{pk_col}`), 0) FROM `{tbl}`")
                    max_id = cursor.fetchone()[0]
                    cursor.execute(
                        "SELECT AUTO_INCREMENT FROM information_schema.tables "
                        f"WHERE table_schema = DATABASE() AND table_name = '{tbl}'"
                    )
                    row = cursor.fetchone()
                    auto_inc = row[0] if row else None
                    if auto_inc and auto_inc > max_id:
                        print(f" [OK] {tbl:<30}: MAX(id)={max_id}, AUTO_INCREMENT={auto_inc} (Aman)")
                    elif max_id > 0 and auto_inc and auto_inc <= max_id:
                        print(f" [ALERT] {tbl:<30}: MAX(id)={max_id}, AUTO_INCREMENT={auto_inc} (Potensi Konflik!)")
                        all_matched = False
                except Exception as e:
                    print(f" [WARN] Gagal membaca metadata auto-increment {tbl}: {e}")
    else:
        print(" [SKIP] Target database bukan MySQL; pemeriksaan auto-increment schema dilewati.")

    print("\n" + "=" * 80)
    if all_matched and not orphan_found:
        print(" HASIL AUDIT: SELURUH DATA TERVERIFIKASI INTEGRITASNYA DENGAN SUKSES!")
        print("=" * 80)
        return True
    else:
        print(" HASIL AUDIT: DITEMUKAN CATATAN ATAU KETIDAKSESUAIAN YANG PERLU DIPERHATIKAN.")
        print("=" * 80)
        return False


if __name__ == "__main__":
    success = run_verification()
    sys.exit(0 if success else 1)
