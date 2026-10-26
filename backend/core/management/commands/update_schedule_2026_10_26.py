"""
Management command to update and seed Awan Topan Course schedules for Monday, 26 October 2026.
"""

from datetime import date, time
from django.contrib.auth import get_user_model
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

TARGET_DATE = date(2026, 10, 26)

# Source of truth dataset from specification:
# tanggal,hari,jam_mulai,jam_selesai,kelas,mapel,jumlah_siswa,kode_pengajar
RAW_SCHEDULE_DATA = [
    {
        "date": TARGET_DATE,
        "day": "SENIN",
        "start_time": time(15, 30),
        "end_time": time(17, 0),
        "class_name": "9A",
        "subject_code": "MTK",
        "student_count": 13,
        "teacher_code": "T",
    },
    {
        "date": TARGET_DATE,
        "day": "SENIN",
        "start_time": time(15, 30),
        "end_time": time(17, 0),
        "class_name": "8A",
        "subject_code": "MAPIL",
        "student_count": 12,
        "teacher_code": "Ni",
    },
    {
        "date": TARGET_DATE,
        "day": "SENIN",
        "start_time": time(15, 30),
        "end_time": time(17, 0),
        "class_name": "9B",
        "subject_code": "BIG",
        "student_count": 15,
        "teacher_code": "Ar",
    },
    {
        "date": TARGET_DATE,
        "day": "SENIN",
        "start_time": time(15, 30),
        "end_time": time(17, 0),
        "class_name": "7B",
        "subject_code": "BIG",
        "student_count": 10,
        "teacher_code": "B",
    },
    {
        "date": TARGET_DATE,
        "day": "SENIN",
        "start_time": time(17, 0),
        "end_time": time(18, 45),
        "class_name": "10A",
        "subject_code": "MTK",
        "student_count": 13,
        "teacher_code": "T",
    },
    {
        "date": TARGET_DATE,
        "day": "SENIN",
        "start_time": time(17, 0),
        "end_time": time(18, 45),
        "class_name": "10B",
        "subject_code": "MTK",
        "student_count": 13,
        "teacher_code": "T",
    },
    {
        "date": TARGET_DATE,
        "day": "SENIN",
        "start_time": time(17, 0),
        "end_time": time(18, 45),
        "class_name": "11A",
        "subject_code": "BIG",
        "student_count": 11,
        "teacher_code": "Ar",
    },
]

# Section 4 Master Subject mapping
SUBJECT_MAPPING = {
    "BIG": "Bahasa Inggris",
    "MTK": "Matematika",
    "MAPIL": "Matematika Pilihan",
    "LATSOL": "Latihan Soal",
    "B_INDO": "Bahasa Indonesia",
    "FISIKA": "Fisika",
    "KIMIA": "Kimia",
}

# Section 5 Master Teacher mapping
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


class Command(BaseCommand):
    help = "Update and seed schedule for Monday, 26 October 2026 (7 assignments)"

    def add_arguments(self, parser):
        parser.add_argument("--database", default="default", help="Database alias to use")
        parser.add_argument("--dry-run", action="store_true", help="Simulate without committing changes")

    def handle(self, *args, **options):
        db = options["database"]
        dry_run = options["dry_run"]

        self.stdout.write("=" * 80)
        self.stdout.write(" AWAN TOPAN COURSE ? UPDATE JADWAL SENIN, 26 OKTOBER 2026")
        self.stdout.write("=" * 80)
        if dry_run:
            self.stdout.write(self.style.WARNING(" [MODE] DRY-RUN AKTIF: Perubahan tidak akan disimpan secara permanen."))

        # 1. Audit existing schedules on 2026-10-26
        existing_schedules = Schedule.objects.using(db).filter(date=TARGET_DATE)
        self.stdout.write(f"\n[1] Audit Jadwal Terdaftar pada {TARGET_DATE}: {existing_schedules.count()} record ditemukan.")
        for s in existing_schedules:
            has_att = StudentAttendance.objects.using(db).filter(session__schedule=s).exists() or \
                      TeacherAttendance.objects.using(db).filter(session__schedule=s).exists()
            self.stdout.write(f"   - ID: {s.id} | {s.start_time}-{s.end_time} | {s.class_group.name} - {s.class_group.subject.name} | Guru: {s.teacher} | Ada Absensi: {has_att}")

        # 2. Check other dates to ensure isolation
        other_dates_count = Schedule.objects.using(db).exclude(date=TARGET_DATE).count()
        self.stdout.write(f"[2] Jadwal pada tanggal lain yang harus dipertahankan: {other_dates_count} record.")

        # 3. Perform execution in atomic transaction
        with transaction.atomic(using=db):
            # A. Ensure Master Subjects
            self.stdout.write("\n[3] Memastikan Master Mata Pelajaran...")
            subjects_cache = {}
            for code, name in SUBJECT_MAPPING.items():
                sub, sub_created = Subject.objects.using(db).get_or_create(name=name)
                subjects_cache[code] = sub
                if sub_created:
                    self.stdout.write(f"   + Subject baru dibuat: {code} -> {name}")
                else:
                    self.stdout.write(f"   * Subject sudah ada: {code} -> {name}")

            # B. Ensure Master Teachers
            self.stdout.write("\n[4] Memastikan Master Pengajar...")
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
                    self.stdout.write(f"   + User pengajar baru dibuat: {info['username']} ({info['full_name']})")
                else:
                    self.stdout.write(f"   * User pengajar sudah ada: {user.username} ({user.get_full_name()})")

                tp, tp_created = TeacherProfile.objects.using(db).get_or_create(
                    user=user,
                    defaults={
                        "specialization": info["specialization"],
                        "is_active": True,
                    },
                )
                teachers_cache[code] = tp
                if tp_created:
                    self.stdout.write(f"   + TeacherProfile baru dibuat untuk {info['full_name']}")

            # C. Ensure ClassGroups (room='' / unassigned as per spec)
            self.stdout.write("\n[5] Memastikan Master Rombel (ClassGroup)...")
            class_groups_cache = {}
            for item in RAW_SCHEDULE_DATA:
                c_name = item["class_name"]
                sub = subjects_cache[item["subject_code"]]
                tp = teachers_cache[item["teacher_code"]]

                cg, cg_created = ClassGroup.objects.using(db).get_or_create(
                    name=c_name,
                    defaults={
                        "subject": sub,
                        "teacher": tp,
                        "room": "",  # Unassigned / belum ditentukan sesuai spesifikasi
                        "is_active": True,
                    },
                )
                class_groups_cache[c_name] = cg
                if cg_created:
                    self.stdout.write(f"   + Rombel baru dibuat: {c_name} - {sub.name} (Wali: {tp})")
                else:
                    self.stdout.write(f"   * Rombel sudah ada: {c_name} - {sub.name}")

            # D. Update/Create the 7 Schedule & SessionRecord assignments
            self.stdout.write("\n[6] Menerapkan 7 Assignment Jadwal pada 26 Oktober 2026...")
            created_schedules = []
            for item in RAW_SCHEDULE_DATA:
                cg = class_groups_cache[item["class_name"]]
                sub = subjects_cache[item["subject_code"]]
                tp = teachers_cache[item["teacher_code"]]
                st = item["start_time"]
                et = item["end_time"]
                ref_count = item["student_count"]

                sched, sched_created = Schedule.objects.using(db).update_or_create(
                    class_group=cg,
                    date=TARGET_DATE,
                    start_time=st,
                    defaults={
                        "subject": sub,
                        "end_time": et,
                        "teacher": tp,
                        "status": Schedule.Status.SCHEDULED,
                        "notes": f"Referensi jumlah siswa: {ref_count}",
                    },
                )

                # Ensure 1-to-1 SessionRecord in draft status
                session, session_created = SessionRecord.objects.using(db).get_or_create(
                    schedule=sched,
                    defaults={
                        "status": SessionRecord.Status.DRAFT,
                        "topic": f"{cg.subject.name} Kelas {cg.name}",
                        "material_description": f"Pembahasan materi {cg.subject.name}",
                    },
                )

                action = "DIBUAT" if sched_created else "DIPERBARUI"
                created_schedules.append(sched)
                self.stdout.write(
                    f"   [{action}] {TARGET_DATE} | {st.strftime('%H:%M')}-{et.strftime('%H:%M')} | "
                    f"Kelas {cg.name:3} | Mapel: {cg.subject.name:18} | Pengajar: {tp.user.get_full_name():12} | "
                    f"Ref Siswa: {ref_count:2} | Sesi ID: {session.id}"
                )

            # E. Check if any obsolete schedules on 2026-10-26 should be cleaned up
            target_pks = {s.pk for s in created_schedules}
            obsolete_schedules = Schedule.objects.using(db).filter(date=TARGET_DATE).exclude(pk__in=target_pks)
            for obs in obsolete_schedules:
                has_important_data = StudentAttendance.objects.using(db).filter(session__schedule=obs).exists() or \
                                     TeacherAttendance.objects.using(db).filter(session__schedule=obs).exists()
                if has_important_data:
                    self.stdout.write(self.style.WARNING(f"   [PERINGATAN] Jadwal usang ID {obs.id} memiliki data absensi; dipertahankan."))
                else:
                    self.stdout.write(f"   [HAPUS] Menghapus jadwal usang tanpa relasi: ID {obs.id} ({obs.class_group.name})")
                    if hasattr(obs, "session"):
                        obs.session.delete()
                    obs.delete()

            if dry_run:
                transaction.set_rollback(True, using=db)
                self.stdout.write(self.style.WARNING("\n[DRY-RUN] Transaksi dibatalkan (rollback). Tidak ada data yang tersimpan."))

        # 4. Validasi Akhir dan Pemeriksaan Konflik
        self.stdout.write("\n" + "=" * 80)
        self.stdout.write(" HASIL VALIDASI AKHIR ? SENIN, 26 OKTOBER 2026")
        self.stdout.write("=" * 80)

        # Verification 1 & 2 & 3: Total assignments & breakdown by timeslot
        current_26 = Schedule.objects.using(db).filter(date=TARGET_DATE)
        total_26 = current_26.count()
        slot1_count = current_26.filter(start_time=time(15, 30), end_time=time(17, 0)).count()
        slot2_count = current_26.filter(start_time=time(17, 0), end_time=time(18, 45)).count()

        self.stdout.write(f" 1. Total Assignment pada {TARGET_DATE} : {total_26} (Target: 7) -> {'SESUAI' if total_26 == 7 else 'TIDAK SESUAI'}")
        self.stdout.write(f" 2. Slot 15:30?17:00 (4 paralel)         : {slot1_count} (Target: 4) -> {'SESUAI' if slot1_count == 4 else 'TIDAK SESUAI'}")
        self.stdout.write(f" 3. Slot 17:00?18:45 (3 paralel)         : {slot2_count} (Target: 3) -> {'SESUAI' if slot2_count == 3 else 'TIDAK SESUAI'}")

        # Verification 4: Isolation to 26 October
        remaining_other_dates = Schedule.objects.using(db).exclude(date=TARGET_DATE).count()
        self.stdout.write(f" 4. Jadwal tanggal lain tidak berubah    : {remaining_other_dates} record (Sebelumnya: {other_dates_count}) -> {'SESUAI' if remaining_other_dates == other_dates_count else 'BERUBAH'}")

        # Conflict Checks (Section 8)
        self.stdout.write("\n" + "-" * 80)
        self.stdout.write(" PEMERIKSAAN KONFLIK JADWAL (SOURCE OF TRUTH AUDIT)")
        self.stdout.write("-" * 80)

        # A. Teacher overlap
        teacher_schedules = {}
        for s in current_26.select_related("teacher__user", "class_group"):
            t_name = s.teacher.user.get_full_name()
            teacher_schedules.setdefault(t_name, []).append(s)

        for t_name, scheds in teacher_schedules.items():
            if len(scheds) > 1:
                # Check for same timeslot overlap
                timeslots = {}
                for s in scheds:
                    slot_key = (s.start_time, s.end_time)
                    timeslots.setdefault(slot_key, []).append(s.class_group.name)

                for slot_key, c_names in timeslots.items():
                    if len(c_names) > 1:
                        self.stdout.write(
                            self.style.WARNING(
                                f" [!] KONFLIK PENGAJAR PARALEL: {t_name} mengajar {len(c_names)} kelas sekaligus "
                                f"({', '.join(c_names)}) pada jam {slot_key[0].strftime('%H:%M')}?{slot_key[1].strftime('%H:%M')}. "
                                f"(Dipertahankan sesuai source of truth)."
                            )
                        )
                    else:
                        self.stdout.write(
                            f" [i] JADWAL BERURUTAN: {t_name} mengajar kelas {c_names[0]} pada jam {slot_key[0].strftime('%H:%M')}?{slot_key[1].strftime('%H:%M')}."
                        )

        # B. Room mapping report (Section 7)
        self.stdout.write("\n" + "-" * 80)
        self.stdout.write(" STATUS RUANGAN & ENROLLMENT (METADATA REPORT)")
        self.stdout.write("-" * 80)
        self.stdout.write(" [i] Ruangan: Dataset sumber tidak menyertakan data ruangan.")
        self.stdout.write("     Seluruh 7 kelas diset dengan room='' (belum ditentukan) tanpa asumsi acak.")
        self.stdout.write(" [i] Siswa & Enrollment: Tidak ada siswa/enrollment fiktif yang dibuat.")
        self.stdout.write("     Jumlah siswa referensi dicatat pada field notes masing-masing jadwal.")
        self.stdout.write("=" * 80)
        self.stdout.write(self.style.SUCCESS(" EKSEKUSI SEEDER JADWAL 26 OKTOBER 2026 SELESAI DENGAN SUKSES!"))
        self.stdout.write("=" * 80)
