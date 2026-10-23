"""
Management command to seed the complete weekly schedule for Awan Topan Course:
Target Week: Monday, 26 October 2026 to Saturday, 31 October 2026 (39 class assignments)
Current Operational Week: Monday, 19 October 2026 to Saturday, 24 October 2026 (39 class assignments)
Ensures every ClassGroup has between 7 and 12 enrolled students and defined room names.
"""

from datetime import date, time, timedelta
from collections import defaultdict
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import BaseCommand
from django.db import transaction

from core.models import (
    ClassGroup,
    Schedule,
    SessionRecord,
    StudentAttendance,
    Subject,
    TeacherAttendance,
    TeacherProfile,
)

User = get_user_model()

START_DATE = date(2026, 10, 26)
END_DATE = date(2026, 10, 31)

CURRENT_START_DATE = date(2026, 10, 19)
CURRENT_END_DATE = date(2026, 10, 24)

# Master Subject mapping
SUBJECT_MAPPING = {
    "BIG": "Bahasa Inggris",
    "MTK": "Matematika",
    "MAPIL": "Matematika Pilihan",
    "LATSOL": "Latihan Soal",
    "B_INDO": "Bahasa Indonesia",
    "FISIKA": "Fisika",
    "KIMIA": "Kimia",
}

# Room mapping for ClassGroups
ROOM_MAPPING = {
    "6 SD": "Ruang Alpha",
    "7A": "Ruang 101",
    "7B": "Ruang 102",
    "8A": "Ruang 103",
    "8B": "Ruang Beta",
    "9A": "Ruang 201",
    "9B": "Ruang 202",
    "10A": "Ruang 203",
    "10B": "Ruang Gamma",
    "11A": "Ruang 301",
    "11B": "Ruang 302",
    "11": "Ruang Studio",
    "12": "Ruang Audiovisual",
    "11-MAT-A": "Ruang 101",
}

# Master Teacher mapping
TEACHER_MAPPING = {
    "T": {
        "full_name": "Mas Topan",
        "first_name": "Mas",
        "last_name": "Topan",
        "username": "topan",
        "email": "topan@awantopan.local",
        "specialization": "Matematika",
        "role": User.Role.ADMIN,
    },
    "B": {
        "full_name": "Mbak Bella",
        "first_name": "Mbak",
        "last_name": "Bella",
        "username": "bella",
        "email": "bella@awantopan.local",
        "specialization": "Bahasa Inggris",
        "role": User.Role.TEACHER,
    },
    "Ar": {
        "full_name": "Mbak Ardya",
        "first_name": "Mbak",
        "last_name": "Ardya",
        "username": "ardya",
        "email": "ardya@awantopan.local",
        "specialization": "Bahasa Inggris & Sains",
        "role": User.Role.TEACHER,
    },
    "Ni": {
        "full_name": "Mbak Ni'ah",
        "first_name": "Mbak",
        "last_name": "Ni'ah",
        "username": "niah",
        "email": "niah@awantopan.local",
        "specialization": "Matematika Pilihan & Biologi",
        "role": User.Role.TEACHER,
    },
    "J": {
        "full_name": "Mbak Jihan",
        "first_name": "Mbak",
        "last_name": "Jihan",
        "username": "jihan",
        "email": "jihan@awantopan.local",
        "specialization": "Bahasa Indonesia",
        "role": User.Role.TEACHER,
    },
    "Nu": {
        "full_name": "Mbak Nuha",
        "first_name": "Mbak",
        "last_name": "Nuha",
        "username": "nuha",
        "email": "nuha@awantopan.local",
        "specialization": "IPA",
        "role": User.Role.TEACHER,
    },
    "D": {
        "full_name": "Mbak Dian",
        "first_name": "Mbak",
        "last_name": "Dian",
        "username": "dian",
        "email": "dian@awantopan.local",
        "specialization": "Kimia",
        "role": User.Role.TEACHER,
    },
}

# Complete Weekly Dataset: Monday, 26 October 2026 - Saturday, 31 October 2026 (39 items)
WEEKLY_SCHEDULE_DATA = [
    # SENIN, 26 OKTOBER 2026 (7 assignments)
    {
        "date": date(2026, 10, 26),
        "day": "SENIN",
        "start_time": time(15, 30),
        "end_time": time(17, 0),
        "class_name": "9A",
        "subject_code": "MTK",
        "student_count": 12,
        "teacher_code": "T",
    },
    {
        "date": date(2026, 10, 26),
        "day": "SENIN",
        "start_time": time(15, 30),
        "end_time": time(17, 0),
        "class_name": "8A",
        "subject_code": "MAPIL",
        "student_count": 12,
        "teacher_code": "Ni",
    },
    {
        "date": date(2026, 10, 26),
        "day": "SENIN",
        "start_time": time(15, 30),
        "end_time": time(17, 0),
        "class_name": "9B",
        "subject_code": "BIG",
        "student_count": 11,
        "teacher_code": "Ar",
    },
    {
        "date": date(2026, 10, 26),
        "day": "SENIN",
        "start_time": time(15, 30),
        "end_time": time(17, 0),
        "class_name": "7B",
        "subject_code": "BIG",
        "student_count": 10,
        "teacher_code": "B",
    },
    {
        "date": date(2026, 10, 26),
        "day": "SENIN",
        "start_time": time(17, 0),
        "end_time": time(18, 45),
        "class_name": "10A",
        "subject_code": "MTK",
        "student_count": 12,
        "teacher_code": "T",
    },
    {
        "date": date(2026, 10, 26),
        "day": "SENIN",
        "start_time": time(17, 0),
        "end_time": time(18, 45),
        "class_name": "10B",
        "subject_code": "MTK",
        "student_count": 11,
        "teacher_code": "T",
    },
    {
        "date": date(2026, 10, 26),
        "day": "SENIN",
        "start_time": time(17, 0),
        "end_time": time(18, 45),
        "class_name": "11A",
        "subject_code": "BIG",
        "student_count": 11,
        "teacher_code": "Ar",
    },

    # SELASA, 27 OKTOBER 2026 (8 assignments)
    {
        "date": date(2026, 10, 27),
        "day": "SELASA",
        "start_time": time(14, 0),
        "end_time": time(15, 30),
        "class_name": "6 SD",
        "subject_code": "B_INDO",
        "student_count": 10,
        "teacher_code": "J",
    },
    {
        "date": date(2026, 10, 27),
        "day": "SELASA",
        "start_time": time(15, 30),
        "end_time": time(17, 0),
        "class_name": "8A",
        "subject_code": "MTK",
        "student_count": 12,
        "teacher_code": "T",
    },
    {
        "date": date(2026, 10, 27),
        "day": "SELASA",
        "start_time": time(15, 30),
        "end_time": time(17, 0),
        "class_name": "8B",
        "subject_code": "MAPIL",
        "student_count": 11,
        "teacher_code": "Ni",
    },
    {
        "date": date(2026, 10, 27),
        "day": "SELASA",
        "start_time": time(15, 30),
        "end_time": time(17, 0),
        "class_name": "7A",
        "subject_code": "BIG",
        "student_count": 10,
        "teacher_code": "B",
    },
    {
        "date": date(2026, 10, 27),
        "day": "SELASA",
        "start_time": time(15, 30),
        "end_time": time(17, 0),
        "class_name": "7B",
        "subject_code": "MAPIL",
        "student_count": 10,
        "teacher_code": "J",
    },
    {
        "date": date(2026, 10, 27),
        "day": "SELASA",
        "start_time": time(17, 0),
        "end_time": time(18, 45),
        "class_name": "11",
        "subject_code": "FISIKA",
        "student_count": 11,
        "teacher_code": "T",
    },
    {
        "date": date(2026, 10, 27),
        "day": "SELASA",
        "start_time": time(17, 0),
        "end_time": time(18, 45),
        "class_name": "11",
        "subject_code": "BIG",
        "student_count": 11,
        "teacher_code": "Ni",
    },
    {
        "date": date(2026, 10, 27),
        "day": "SELASA",
        "start_time": time(17, 0),
        "end_time": time(18, 45),
        "class_name": "12",
        "subject_code": "BIG",
        "student_count": 12,
        "teacher_code": "D",
    },

    # RABU, 28 OKTOBER 2026 (6 assignments)
    {
        "date": date(2026, 10, 28),
        "day": "RABU",
        "start_time": time(15, 30),
        "end_time": time(17, 0),
        "class_name": "9A",
        "subject_code": "MAPIL",
        "student_count": 12,
        "teacher_code": "Ni",
    },
    {
        "date": date(2026, 10, 28),
        "day": "RABU",
        "start_time": time(15, 30),
        "end_time": time(17, 0),
        "class_name": "7A",
        "subject_code": "MTK",
        "student_count": 10,
        "teacher_code": "T",
    },
    {
        "date": date(2026, 10, 28),
        "day": "RABU",
        "start_time": time(15, 30),
        "end_time": time(17, 0),
        "class_name": "8B",
        "subject_code": "BIG",
        "student_count": 11,
        "teacher_code": "B",
    },
    {
        "date": date(2026, 10, 28),
        "day": "RABU",
        "start_time": time(17, 0),
        "end_time": time(18, 45),
        "class_name": "10A",
        "subject_code": "BIG",
        "student_count": 12,
        "teacher_code": "Ar",
    },
    {
        "date": date(2026, 10, 28),
        "day": "RABU",
        "start_time": time(17, 0),
        "end_time": time(18, 45),
        "class_name": "10B",
        "subject_code": "BIG",
        "student_count": 11,
        "teacher_code": "B",
    },
    {
        "date": date(2026, 10, 28),
        "day": "RABU",
        "start_time": time(17, 0),
        "end_time": time(18, 45),
        "class_name": "11",
        "subject_code": "LATSOL",
        "student_count": 11,
        "teacher_code": "T",
    },

    # KAMIS, 29 OKTOBER 2026 (7 assignments)
    {
        "date": date(2026, 10, 29),
        "day": "KAMIS",
        "start_time": time(14, 0),
        "end_time": time(15, 30),
        "class_name": "6 SD",
        "subject_code": "MTK",
        "student_count": 10,
        "teacher_code": "T",
    },
    {
        "date": date(2026, 10, 29),
        "day": "KAMIS",
        "start_time": time(15, 30),
        "end_time": time(17, 0),
        "class_name": "9B",
        "subject_code": "MAPIL",
        "student_count": 11,
        "teacher_code": "Nu",
    },
    {
        "date": date(2026, 10, 29),
        "day": "KAMIS",
        "start_time": time(15, 30),
        "end_time": time(17, 0),
        "class_name": "8A",
        "subject_code": "BIG",
        "student_count": 12,
        "teacher_code": "Ar",
    },
    {
        "date": date(2026, 10, 29),
        "day": "KAMIS",
        "start_time": time(15, 30),
        "end_time": time(17, 0),
        "class_name": "8B",
        "subject_code": "MTK",
        "student_count": 11,
        "teacher_code": "T",
    },
    {
        "date": date(2026, 10, 29),
        "day": "KAMIS",
        "start_time": time(15, 30),
        "end_time": time(17, 0),
        "class_name": "7B",
        "subject_code": "MTK",
        "student_count": 10,
        "teacher_code": "Ni",
    },
    {
        "date": date(2026, 10, 29),
        "day": "KAMIS",
        "start_time": time(17, 0),
        "end_time": time(18, 45),
        "class_name": "11",
        "subject_code": "KIMIA",
        "student_count": 11,
        "teacher_code": "T",
    },
    {
        "date": date(2026, 10, 29),
        "day": "KAMIS",
        "start_time": time(17, 0),
        "end_time": time(18, 45),
        "class_name": "11B",
        "subject_code": "MTK",
        "student_count": 10,
        "teacher_code": "T",
    },

    # JUMAT, 30 OKTOBER 2026 (7 assignments)
    {
        "date": date(2026, 10, 30),
        "day": "JUMAT",
        "start_time": time(14, 0),
        "end_time": time(15, 30),
        "class_name": "6 SD",
        "subject_code": "LATSOL",
        "student_count": 10,
        "teacher_code": "J",
    },
    {
        "date": date(2026, 10, 30),
        "day": "JUMAT",
        "start_time": time(15, 30),
        "end_time": time(17, 0),
        "class_name": "9A",
        "subject_code": "BIG",
        "student_count": 12,
        "teacher_code": "B",
    },
    {
        "date": date(2026, 10, 30),
        "day": "JUMAT",
        "start_time": time(15, 30),
        "end_time": time(17, 0),
        "class_name": "9B",
        "subject_code": "MTK",
        "student_count": 11,
        "teacher_code": "T",
    },
    {
        "date": date(2026, 10, 30),
        "day": "JUMAT",
        "start_time": time(15, 30),
        "end_time": time(17, 0),
        "class_name": "7A",
        "subject_code": "MAPIL",
        "student_count": 10,
        "teacher_code": "J",
    },
    {
        "date": date(2026, 10, 30),
        "day": "JUMAT",
        "start_time": time(17, 0),
        "end_time": time(18, 45),
        "class_name": "11A",
        "subject_code": "MTK",
        "student_count": 11,
        "teacher_code": "T",
    },
    {
        "date": date(2026, 10, 30),
        "day": "JUMAT",
        "start_time": time(17, 0),
        "end_time": time(18, 45),
        "class_name": "11B",
        "subject_code": "MTK",
        "student_count": 10,
        "teacher_code": "T",
    },
    {
        "date": date(2026, 10, 30),
        "day": "JUMAT",
        "start_time": time(17, 0),
        "end_time": time(18, 45),
        "class_name": "12",
        "subject_code": "MAPIL",
        "student_count": 12,
        "teacher_code": "Nu",
    },

    # SABTU, 31 OKTOBER 2026 (4 assignments)
    {
        "date": date(2026, 10, 31),
        "day": "SABTU",
        "start_time": time(15, 0),
        "end_time": time(16, 30),
        "class_name": "10A",
        "subject_code": "MAPIL",
        "student_count": 12,
        "teacher_code": "T",
    },
    {
        "date": date(2026, 10, 31),
        "day": "SABTU",
        "start_time": time(15, 0),
        "end_time": time(16, 30),
        "class_name": "10B",
        "subject_code": "MAPIL",
        "student_count": 11,
        "teacher_code": "T",
    },
    {
        "date": date(2026, 10, 31),
        "day": "SABTU",
        "start_time": time(16, 30),
        "end_time": time(18, 0),
        "class_name": "12",
        "subject_code": "MTK",
        "student_count": 12,
        "teacher_code": "T",
    },
    {
        "date": date(2026, 10, 31),
        "day": "SABTU",
        "start_time": time(16, 30),
        "end_time": time(18, 0),
        "class_name": "11",
        "subject_code": "MTK",
        "student_count": 11,
        "teacher_code": "T",
    },
]


def _build_schedule_batch(base_dataset, target_start_date):
    """Offsets dates in base_dataset by weeks relative to 2026-10-26."""
    delta = target_start_date - date(2026, 10, 26)
    batch = []
    for item in base_dataset:
        new_item = dict(item)
        new_item["date"] = item["date"] + delta
        batch.append(new_item)
    return batch


class Command(BaseCommand):
    help = "Seed weekly schedule for 26-31 Oct 2026 and current week 19-24 Oct 2026 with enrolled students"

    def add_arguments(self, parser):
        parser.add_argument("--database", default="default", help="Database alias to use (default: 'default')")
        parser.add_argument("--dry-run", action="store_true", help="Simulate execution without committing changes")
        parser.add_argument("--target-only", action="store_true", help="Seed only target week 26-31 Oct")

    def handle(self, *args, **options):
        db = options["database"]
        dry_run = options["dry_run"]
        target_only = options["target_only"]

        self.stdout.write("=" * 80)
        self.stdout.write(" AWAN TOPAN COURSE ? SEED JADWAL MINGGUAN & DATA SISWA LENGKAP")
        self.stdout.write("=" * 80)
        if dry_run:
            self.stdout.write(self.style.WARNING(" [MODE] DRY-RUN AKTIF: Perubahan tidak akan disimpan secara permanen.\n"))

        # Datasets to seed
        batches = [("Target Week (26-31 Oktober 2026)", WEEKLY_SCHEDULE_DATA)]
        if not target_only:
            current_week_data = _build_schedule_batch(WEEKLY_SCHEDULE_DATA, CURRENT_START_DATE)
            batches.insert(0, ("Current Operational Week (19-24 Oktober 2026)", current_week_data))

        # 2. Transaction Execution for schedules
        with transaction.atomic(using=db):
            # A. Ensure Master Subjects
            self.stdout.write("\n[2] Memastikan Master Mata Pelajaran (Subjects)...")
            subjects_cache = {}
            for code, name in SUBJECT_MAPPING.items():
                sub, _ = Subject.objects.using(db).get_or_create(name=name)
                subjects_cache[code] = sub

            # B. Ensure Master Teachers
            self.stdout.write("\n[3] Memastikan Master Pengajar (Teachers)...")
            teachers_cache = {}
            for code, info in TEACHER_MAPPING.items():
                user = User.objects.using(db).filter(username=info["username"]).first()
                if not user:
                    user = User.objects.using(db).filter(first_name=info["first_name"], last_name=info["last_name"]).first()
                if not user:
                    user = User.objects.db_manager(db).create_user(
                        username=info["username"],
                        email=info["email"],
                        first_name=info["first_name"],
                        last_name=info["last_name"],
                        role=info["role"],
                        password="password-test",
                    )
                tp, _ = TeacherProfile.objects.using(db).get_or_create(
                    user=user,
                    defaults={
                        "specialization": info["specialization"],
                        "is_active": True,
                    },
                )
                teachers_cache[code] = tp

            # C. Ensure ClassGroups with Room names
            self.stdout.write("\n[4] Memastikan Master Rombel (ClassGroup) & Ruangan...")
            class_groups_cache = {}
            for item in WEEKLY_SCHEDULE_DATA:
                c_name = item["class_name"]
                s_code = item["subject_code"]
                if (c_name, s_code) in class_groups_cache:
                    continue
                sub = subjects_cache[s_code]
                tp = teachers_cache[item["teacher_code"]]
                room_name = ROOM_MAPPING.get(c_name, "Ruang 101")
                cg, _ = ClassGroup.objects.using(db).get_or_create(
                    name=c_name,
                    subject=sub,
                    defaults={
                        "teacher": tp,
                        "room": room_name,
                        "is_active": True,
                    },
                )
                if cg.room != room_name:
                    cg.room = room_name
                    cg.save(update_fields=["room"])
                class_groups_cache[(c_name, s_code)] = cg

            # D. Insert / Update schedules for each batch
            all_created_schedules = []
            for batch_label, dataset in batches:
                self.stdout.write(f"\n[5] Memproses {len(dataset)} Assignment Jadwal pada {batch_label}...")
                for idx, item in enumerate(dataset, 1):
                    cg = class_groups_cache[(item["class_name"], item["subject_code"])]
                    tp = teachers_cache[item["teacher_code"]]
                    t_date = item["date"]
                    st = item["start_time"]
                    et = item["end_time"]
                    ref_count = item["student_count"]

                    sched, sched_created = Schedule.objects.using(db).update_or_create(
                        class_group=cg,
                        date=t_date,
                        start_time=st,
                        defaults={
                            "end_time": et,
                            "teacher": tp,
                            "status": Schedule.Status.SCHEDULED,
                            "notes": f"Referensi jumlah siswa: {ref_count}",
                        },
                    )

                    # Ensure SessionRecord
                    session, _ = SessionRecord.objects.using(db).get_or_create(
                        schedule=sched,
                        defaults={
                            "status": SessionRecord.Status.DRAFT,
                            "topic": f"{cg.subject.name} Kelas {cg.name}",
                            "material_description": f"Pembahasan materi {cg.subject.name} untuk kelas {cg.name}",
                        },
                    )
                    all_created_schedules.append(sched)

            # Preserve baseline schedule ID 1 (2026-10-22)
            baseline = Schedule.objects.using(db).filter(pk=1).first()
            if baseline:
                self.stdout.write(f"\n[6] Mempertahankan jadwal baseline ID 1 ({baseline.date} {baseline.class_group.name})...")

            if dry_run:
                transaction.set_rollback(True, using=db)
                self.stdout.write(self.style.WARNING("\n[DRY-RUN] Transaksi dibatalkan (rollback)."))

        # 3. Seed students and enrollments into all ClassGroups
        if not dry_run:
            self.stdout.write("\n[7] Menjalankan seeder murid (7-12 anak per kelas)...")
            call_command("seed_students", database=db)

        # 4. Final Verification
        self.stdout.write("\n" + "=" * 80)
        self.stdout.write(" HASIL VALIDASI AKHIR JADWAL")
        self.stdout.write("=" * 80)
        total_target_week = Schedule.objects.using(db).filter(date__gte=START_DATE, date__lte=END_DATE).count()
        total_current_week = Schedule.objects.using(db).filter(date__gte=CURRENT_START_DATE, date__lte=CURRENT_END_DATE).count()
        total_all = Schedule.objects.using(db).count()

        self.stdout.write(f" 1. Jadwal Minggu Target (26-31 Okt 2026) : {total_target_week} sesi (Target: 39)")
        self.stdout.write(f" 2. Jadwal Minggu Aktif  (19-24 Okt 2026) : {total_current_week} sesi (Termasuk baseline)")
        self.stdout.write(f" 3. Total Keseluruhan Jadwal di DB       : {total_all} sesi")

        # Daily breakdown for 26-31 Oct
        self.stdout.write("\n Breakdown Harian Minggu Target (26-31 Oktober 2026):")
        for i in range(6):
            d = START_DATE + timedelta(days=i)
            c = Schedule.objects.using(db).filter(date=d).count()
            self.stdout.write(f"   - {d.strftime('%A, %Y-%m-%d'):28}: {c} sesi")

        # Daily breakdown for 19-24 Oct
        self.stdout.write("\n Breakdown Harian Minggu Aktif (19-24 Oktober 2026):")
        for i in range(6):
            d = CURRENT_START_DATE + timedelta(days=i)
            c = Schedule.objects.using(db).filter(date=d).count()
            self.stdout.write(f"   - {d.strftime('%A, %Y-%m-%d'):28}: {c} sesi")

        self.stdout.write("=" * 80)
        self.stdout.write(self.style.SUCCESS(" SEEDER JADWAL MINGGUAN & SISWA BERHASIL DIJALANKAN DENGAN SUKSES!"))
        self.stdout.write("=" * 80)
