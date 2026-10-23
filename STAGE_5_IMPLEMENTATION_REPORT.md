# LAPORAN IMPLEMENTASI TAHAP 5 — LAMPIRAN MATERI, KONSISTENSI API, DAN PENYEMPURNAAN OPERASIONAL
## Proyek Awan Topan Course

---

### 1. Checkpoint & Penjelasan Perbedaan Jumlah Jadwal (79 vs 211)

Berdasarkan audit read-only pada tabel `core_schedule` dan `core_sessionrecord`:

1. **Jumlah Jadwal Baseline & Target (Total 79 Jadwal)**:
   - **Minggu Aktif (19–24 Oktober 2026)**: 40 jadwal (39 assignment operasional + 1 sesi baseline ID 1).
   - **Minggu Target (26–31 Oktober 2026)**: 39 assignment jadwal terverifikasi sesuai buku kurikulum.
   - Total kedua minggu ini adalah tepat **79 jadwal** sebagaimana dilaporkan pada Tahap 3.

2. **Ekspansi Jadwal Berulang ke Bulan November (Total 211 Jadwal)**:
   - Pada Tahap 3, fitur batch replication minggu (`POST /api/v1/schedule-series/replicate-week/`) dieksekusi untuk mereplikasi jadwal mingguan operasional ke 4 minggu di bulan November 2026:
     - Minggu 2–7 November 2026: 33 sesi
     - Minggu 9–14 November 2026: 33 sesi
     - Minggu 16–21 November 2026: 33 sesi
     - Minggu 23–28 November 2026: 33 sesi
     - Subtotal replikasi November: **132 sesi**.
   - **79 sesi (Oktober) + 132 sesi (November) = 211 sesi**.
3. **Verifikasi Integritas Relasi**:
   - `Schedules without SessionRecord`: **0** (semua 211 schedule memiliki record sesi).
   - `SessionRecords without Schedule`: **0** (tidak ada sesi yatim).
   - `Duplicate Assignments` (class_group, date, start_time): **0** (tidak ada duplikasi jadwal bentrok).
   - Peningkatan record dari 79 menjadi 211 adalah **perilaku yang diharapkan** (*expected behavior*) dari pengujian replikasi jadwal mingguan, bukan indikasi anomali atau data corrupt.

---

### 2. File yang Dibuat / Diubah

1. **`backend/core/models.py`**:
   - Menambahkan helper `session_attachment_path(instance, filename)`.
   - Menambahkan model `SessionAttachment` dengan primary key UUID, relasi ke `SessionRecord`, `FileField` storage, `original_name`, `content_type`, `size_bytes`, `uploaded_by`, dan `created_at`.
2. **`backend/core/migrations/0004_sessionattachment.py`**:
   - Migration baru untuk tabel `core_sessionattachment` beserta index foreign key.
3. **`backend/awantopan/settings.py`**:
   - Menambahkan konfigurasi `MEDIA_URL = "/media/"`, `MEDIA_ROOT = BASE_DIR / "media"`, dan `MAX_UPLOAD_SIZE = 10 * 1024 * 1024` (10 MB).
4. **`backend/awantopan/urls.py`**:
   - Menambahkan static handler `static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)` saat mode development / `DEBUG=True`.
5. **`backend/core/views_scheduling.py`**:
   - Menambahkan helper `serialize_attachment(att, request=None)`.
   - Mengintegrasikan daftar lampiran aktual pada payload `_serialize_teaching_session`.
   - Mengimplementasikan endpoint upload fisik dan daftar lampiran `v1_session_attachments` (`GET` dan `POST`) dengan validasi ukuran file, tipe ekstensi (.pdf, .jpg, .jpeg, .png), validasi MIME, dan izin pengajar/admin.
   - Mengimplementasikan endpoint `v1_session_attachment_detail` (`GET` dan `DELETE`) yang menghapus metadata database dan membersihkan file fisik dari storage secara konsisten.
6. **`backend/core/urls.py`**:
   - Mendaftarkan rute:
     - `/api/v1/sessions/<str:session_id>/attachments/<str:attachment_id>/`
     - `/api/v1/sessions/<str:session_id>/attachments/`
     - `/api/v1/attachments/<str:attachment_id>/`
7. **`frontend/src/api/types.ts`**:
   - Memperbarui interface `TeachingSession.attachments` dengan atribut `file?: string; url?: string; created_at?: string;`.
8. **`frontend/vite.config.ts`**:
   - Menambahkan proxy dev server `/media` ke backend `http://127.0.0.1:8000`.
9. **`frontend/src/pages/SessionDetailApi.tsx`**:
   - Menambahkan daftar berkas lampiran dengan ikon file (PDF vs Gambar), nama file, ukuran file terformat, tombol unduh berkas (`download`), dan tombol hapus berkas (`delete`).
   - Menambahkan mutasi `deleteAttachmentMutation` dan indikator upload progress saat proses berlangsung.
10. **`backend/core/tests/test_session_attachments.py`**:
    - Menambahkan 12 automated unit & integration test untuk upload berkas, validasi keamanan, penghapusan file storage, dan catatan materi.

---

### 3. Konfigurasi Storage & Batasan Keamanan Berkas

- **Storage Backend**: Menggunakan Django `default_storage` abstraction (`FileSystemStorage` lokal pada dev, kompatibel dengan S3/GCS/Cloudflare R2 pada production).
- **Direktori Penyimpanan**: `backend/media/session_attachments/<session_id>/<uuid>.<ext>`.
- **Nama Penyimpanan Unik**: Setiap berkas disimpan menggunakan UUID v4 sehingga nama berkas duplikat tidak akan saling menimpa.
- **Batas Ukuran**: Maksimal 10 MB per berkas (`MAX_UPLOAD_SIZE = 10485760`). File kosong (0 byte) otomatis ditolak dengan kode `EMPTY_FILE`.
- **Format yang Diizinkan**: `.pdf`, `.jpg`, `.jpeg`, `.png` dengan pencocokan ekstensi dan header `Content-Type`. Ekstensi lain (.sh, .exe, .py, dsb) otomatis ditolak dengan kode `INVALID_FILE_TYPE`.
- **Hak Akses**: Hanya Super Admin atau Guru yang ditugaskan pada sesi tersebut yang diizinkan mengunggah dan menghapus lampiran.

---

### 4. Hasil Test & Verifikasi Lengkap

#### A. Test Khusus Lampiran & Lesson Report (`test_session_attachments`)
```
Ran 12 tests in 4.991s
OK
```
- Upload berkas PDF valid: **LULUS**
- Upload gambar PNG valid: **LULUS**
- Tolak berkas kosong (0 byte): **LULUS**
- Tolak ekstensi tidak diizinkan: **LULUS**
- Tolak ukuran berkas melebihi batas 10MB: **LULUS**
- Tolak guru yang tidak bertugas mengajar sesi: **LULUS**
- Uji isolasi penamaan UUID berkas duplikat: **LULUS**
- Uji pembersihan file fisik saat penghapusan: **LULUS**
- Uji daftar lampiran pada detail sesi: **LULUS**
- Simpan & baca ulang catatan materi (lesson report): **LULUS**
- Tolak topik yang melebihi 160 karakter: **LULUS**
- Tolak perubahan catatan pada sesi yang telah dibatalkan: **LULUS**

#### B. Full Backend Regression Suite (`manage.bat test core`)
```
Ran 110 tests in 37.059s
OK
```
Seluruh **110 test** di backend berhasil lulus 100% tanpa ada regresi pada modul Rombel, Keuangan, Jadwal, Absensi, maupun Guru/Siswa.

#### C. Frontend Verification
- TypeScript Typecheck (`npx tsc --noEmit`): **0 errors**.
- Frontend Vitest (`npm run test`): **4 test files passed, 11 tests passed**.
- Production Build (`npm run build`): **Selesai dalam 2.17s** (dist index bundle siap deploy).

---

### 5. Persyaratan Tambahan Sebelum Deployment Produksi

1. **Storage Produksi**: Untuk deployment multi-instance / serverless, ganti `default_storage` ke penyimpanan objek berbasis cloud (seperti Amazon S3, MinIO, atau Cloudflare R2 menggunakan `django-storages`).
2. **Reverse Proxy Nginx / Cloudflare**:
   - Pastikan konfigurasi Nginx menambahkan `client_max_body_size 10M;` agar upload file hingga 10MB tidak diblokir oleh web server sebelum mencapai Django.
3. **Penyajian Media**: Pastikan direktori `/media/` dialihkan langsung oleh web server Nginx / Caddy untuk efisiensi transfer berkas pada mode produksi non-DEBUG.