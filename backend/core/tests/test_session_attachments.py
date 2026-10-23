import json
import os
import shutil
import tempfile
from datetime import date, time
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client, TestCase, override_settings

from core.models import (
    ClassGroup,
    Schedule,
    SessionAttachment,
    SessionRecord,
    Subject,
    TeacherProfile,
)

User = get_user_model()
TEMP_MEDIA_ROOT = tempfile.mkdtemp()


@override_settings(MEDIA_ROOT=TEMP_MEDIA_ROOT)
class SessionAttachmentsTestCase(TestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        if os.path.exists(TEMP_MEDIA_ROOT):
            shutil.rmtree(TEMP_MEDIA_ROOT, ignore_errors=True)

    def setUp(self):
        self.client = Client()
        self.admin_user = User.objects.create_user(
            username="admin_stage5",
            email="admin_stage5@example.com",
            password="password123",
            role=User.Role.ADMIN,
        )
        self.teacher_user = User.objects.create_user(
            username="guru_stage5",
            email="guru_stage5@example.com",
            password="password123",
            role=User.Role.TEACHER,
            first_name="Guru",
            last_name="Sesi",
        )
        self.other_teacher_user = User.objects.create_user(
            username="guru_lain",
            email="guru_lain@example.com",
            password="password123",
            role=User.Role.TEACHER,
            first_name="Guru",
            last_name="Lain",
        )
        self.teacher = TeacherProfile.objects.create(
            user=self.teacher_user,
            phone="08123456789",
            specialization="Matematika SMA",
            is_active=True,
        )
        self.other_teacher = TeacherProfile.objects.create(
            user=self.other_teacher_user,
            phone="08199988877",
            specialization="Fisika SMA",
            is_active=True,
        )
        self.subject = Subject.objects.create(name="Matematika")
        self.class_group = ClassGroup.objects.create(
            name="10A",
            subject=self.subject,
            teacher=self.teacher,
            room="Ruang 203",
        )
        self.schedule = Schedule.objects.create(
            class_group=self.class_group,
            teacher=self.teacher,
            date=date(2026, 10, 26),
            start_time=time(15, 30),
            end_time=time(17, 0),
            status=Schedule.Status.SCHEDULED,
        )
        self.session = SessionRecord.objects.create(
            schedule=self.schedule,
            status=SessionRecord.Status.ACTIVE,
            topic="Persamaan Kuadrat",
            material_description="Materi diskriminan dan akar kuadrat",
        )

    # --------------------------------------------------------------------------
    # 1. Attachment Upload Tests
    # --------------------------------------------------------------------------
    def test_upload_valid_pdf_attachment(self):
        self.client.force_login(self.admin_user)
        pdf_content = b"%PDF-1.4 Mock PDF Content for Lesson Materials"
        file = SimpleUploadedFile("Modul_Aljabar.pdf", pdf_content, content_type="application/pdf")

        res = self.client.post(
            f"/api/v1/sessions/{self.session.id}/attachments/",
            {"file": file},
            format="multipart",
        )
        self.assertEqual(res.status_code, 201)
        data = res.json()["data"]
        self.assertEqual(data["original_name"], "Modul_Aljabar.pdf")
        self.assertEqual(data["content_type"], "application/pdf")
        self.assertEqual(data["size_bytes"], len(pdf_content))
        self.assertTrue(data["file"].endswith(".pdf"))

        # Verify database record
        att = SessionAttachment.objects.get(pk=data["id"])
        self.assertEqual(att.session, self.session)
        self.assertTrue(os.path.exists(att.file.path))

    def test_upload_valid_image_attachment(self):
        self.client.force_login(self.teacher_user)
        img_content = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR Mock PNG Image"
        file = SimpleUploadedFile("grafik_fungsi.png", img_content, content_type="image/png")

        res = self.client.post(
            f"/api/v1/sessions/{self.session.id}/attachments/",
            {"file": file},
            format="multipart",
        )
        self.assertEqual(res.status_code, 201)
        data = res.json()["data"]
        self.assertEqual(data["original_name"], "grafik_fungsi.png")
        self.assertEqual(data["content_type"], "image/png")

    def test_upload_empty_file_rejected(self):
        self.client.force_login(self.admin_user)
        empty_file = SimpleUploadedFile("kosong.pdf", b"", content_type="application/pdf")

        res = self.client.post(
            f"/api/v1/sessions/{self.session.id}/attachments/",
            {"file": empty_file},
            format="multipart",
        )
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()["error"]["code"], "EMPTY_FILE")

    def test_upload_disallowed_extension_rejected(self):
        self.client.force_login(self.admin_user)
        script_file = SimpleUploadedFile("script.sh", b"echo 'hack'", content_type="text/x-sh")

        res = self.client.post(
            f"/api/v1/sessions/{self.session.id}/attachments/",
            {"file": script_file},
            format="multipart",
        )
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()["error"]["code"], "INVALID_FILE_TYPE")

    def test_upload_file_too_large_rejected(self):
        self.client.force_login(self.admin_user)
        # 11 MB payload
        large_content = b"0" * (11 * 1024 * 1024)
        large_file = SimpleUploadedFile("besar.pdf", large_content, content_type="application/pdf")

        res = self.client.post(
            f"/api/v1/sessions/{self.session.id}/attachments/",
            {"file": large_file},
            format="multipart",
        )
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()["error"]["code"], "FILE_TOO_LARGE")

    def test_upload_unauthorized_teacher_rejected(self):
        # Teacher from another class/subject attempting to upload
        self.client.force_login(self.other_teacher_user)
        file = SimpleUploadedFile("catatan.pdf", b"%PDF-1.4 Content", content_type="application/pdf")

        res = self.client.post(
            f"/api/v1/sessions/{self.session.id}/attachments/",
            {"file": file},
            format="multipart",
        )
        self.assertEqual(res.status_code, 403)
        self.assertEqual(res.json()["error"]["code"], "FORBIDDEN")

    def test_duplicate_filename_preserves_unique_paths(self):
        self.client.force_login(self.admin_user)
        file1 = SimpleUploadedFile("catatan.pdf", b"%PDF-1.4 Content 1", content_type="application/pdf")
        file2 = SimpleUploadedFile("catatan.pdf", b"%PDF-1.4 Content 2", content_type="application/pdf")

        res1 = self.client.post(
            f"/api/v1/sessions/{self.session.id}/attachments/",
            {"file": file1},
            format="multipart",
        )
        res2 = self.client.post(
            f"/api/v1/sessions/{self.session.id}/attachments/",
            {"file": file2},
            format="multipart",
        )
        self.assertEqual(res1.status_code, 201)
        self.assertEqual(res2.status_code, 201)

        att1 = SessionAttachment.objects.get(pk=res1.json()["data"]["id"])
        att2 = SessionAttachment.objects.get(pk=res2.json()["data"]["id"])
        self.assertNotEqual(att1.file.name, att2.file.name)
        self.assertTrue(os.path.exists(att1.file.path))
        self.assertTrue(os.path.exists(att2.file.path))

    def test_delete_attachment_cleans_up_storage(self):
        self.client.force_login(self.admin_user)
        file = SimpleUploadedFile("hapus_saya.pdf", b"%PDF-1.4 Delete Me", content_type="application/pdf")
        res = self.client.post(
            f"/api/v1/sessions/{self.session.id}/attachments/",
            {"file": file},
            format="multipart",
        )
        att_id = res.json()["data"]["id"]
        att = SessionAttachment.objects.get(pk=att_id)
        file_path = att.file.path
        self.assertTrue(os.path.exists(file_path))

        # Delete attachment
        del_res = self.client.delete(f"/api/v1/sessions/{self.session.id}/attachments/{att_id}/")
        self.assertEqual(del_res.status_code, 200)

        # Database record deleted
        self.assertFalse(SessionAttachment.objects.filter(pk=att_id).exists())
        # File on disk removed
        self.assertFalse(os.path.exists(file_path))

    def test_session_detail_includes_attachments_list(self):
        self.client.force_login(self.admin_user)
        file = SimpleUploadedFile("ringkasan.pdf", b"%PDF-1.4 Ringkasan", content_type="application/pdf")
        self.client.post(
            f"/api/v1/sessions/{self.session.id}/attachments/",
            {"file": file},
            format="multipart",
        )

        res = self.client.get(f"/api/v1/sessions/{self.session.id}/")
        self.assertEqual(res.status_code, 200)
        data = res.json()["data"]
        self.assertEqual(len(data["attachments"]), 1)
        self.assertEqual(data["attachments"][0]["original_name"], "ringkasan.pdf")

    # --------------------------------------------------------------------------
    # 2. Lesson Report Tests
    # --------------------------------------------------------------------------
    def test_update_lesson_report_success(self):
        self.client.force_login(self.admin_user)
        payload = {
            "topic": "Trigonometri Dasar",
            "material_description": "Sinus, Cosinus, dan Tangen sudut istimewa",
            "learning_notes": "Seluruh siswa aktif bertanya",
            "homework": "Latihan soal hal. 45 no 1-10",
        }
        res = self.client.put(
            f"/api/v1/sessions/{self.session.id}/lesson-report/",
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 200)
        self.session.refresh_from_db()
        self.assertEqual(self.session.topic, "Trigonometri Dasar")
        self.assertEqual(self.session.material_description, "Sinus, Cosinus, dan Tangen sudut istimewa")
        self.assertEqual(self.session.homework, "Latihan soal hal. 45 no 1-10")

    def test_lesson_report_topic_too_long(self):
        self.client.force_login(self.admin_user)
        payload = {"topic": "A" * 165}
        res = self.client.put(
            f"/api/v1/sessions/{self.session.id}/lesson-report/",
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()["error"]["code"], "VALIDATION_ERROR")

    def test_lesson_report_on_cancelled_session_rejected(self):
        self.client.force_login(self.admin_user)
        self.schedule.status = Schedule.Status.CANCELLED
        self.schedule.save()

        res = self.client.put(
            f"/api/v1/sessions/{self.session.id}/lesson-report/",
            data=json.dumps({"topic": "Materi Batal"}),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()["error"]["code"], "INVALID_STATUS")