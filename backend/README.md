# Awan Topan Course Backend

Django backend untuk sistem tracking kelas, absensi, dan keuangan bimbingan belajar Awan Topan Course.
Target runtime database produksi menggunakan **MySQL / MariaDB** (AnyMHost Developer Newbie / cPanel Python App).

## 1. Persiapan Lingkungan (Lokal)

```bash
python -m venv .venv
# Windows:
.venv\Scripts\activate
# Linux/macOS:
# source .venv/bin/activate

pip install -r requirements.txt
cp .env.example .env
```

Sesuaikan variabel di `.env` (secara default, jika tidak diisi variabel MySQL, sistem akan menggunakan SQLite untuk kenyamanan pengembangan lokal).

Jalankan server:
```bash
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver 127.0.0.1:8000
```

Jika database target masih kosong, isi dataset awal tanpa menghapus data yang sudah ada:
```bash
python manage.py seed_app_data --period 2026-10 --password "ganti-password-ini"
```
Seeder ini idempoten dan mengisi akun aplikasi, guru, rombel, siswa, enrollment,
periode tagihan, invoice, serta satu transaksi pembayaran terverifikasi.

## 2. Konfigurasi Database Produksi (MySQL/MariaDB AnyMHost)

Di cPanel AnyMHost:
1. Buat database MySQL baru (misal: `cpaneluser_awantopan`).
2. Buat user MySQL baru dan berikan ALL PRIVILEGES ke database tersebut.
3. Atur environment variables di `.env` atau cPanel "Setup Python App":
   ```ini
   DB_ENGINE=mysql
   MYSQL_DATABASE=cpaneluser_awantopan
   MYSQL_USER=cpaneluser_dbuser
   MYSQL_PASSWORD=rahasia_password
   MYSQL_HOST=localhost
   MYSQL_PORT=3306
   DJANGO_SECRET_KEY=kunci-rahasia-panjang-dan-unik
   DJANGO_DEBUG=False
   ALLOWED_HOSTS=domainanda.com,www.domainanda.com,127.0.0.1
   CSRF_TRUSTED_ORIGINS=https://frontend-anda.vercel.app,https://domainanda.com
   CORS_ALLOWED_ORIGINS=https://frontend-anda.vercel.app
   ```

Terapkan skema Django ke database target MySQL:
```bash
python manage.py migrate
```

## 3. Migrasi Data dari PostgreSQL ke MySQL

Jika Anda memiliki data yang sebelumnya tersimpan di PostgreSQL dan perlu dipindahkan secara penuh dan aman ke MySQL:

1. Pasang dependensi migrasi sementara:
   ```bash
   pip install -r requirements-migration.txt
   ```
2. Tambahkan kredensial database sumber PostgreSQL ke `.env`:
   ```ini
   SOURCE_DB_NAME=awantopan_pg_source
   SOURCE_DB_USER=postgres
   SOURCE_DB_PASSWORD=password_pg
   SOURCE_DB_HOST=localhost
   SOURCE_DB_PORT=5432
   ```
3. Jalankan skrip migrasi data terpadu:
   ```bash
   python manage.py migrate_pg_to_mysql
   # Atau langsung via script:
   # python scripts/migrate_pg_to_mysql.py
   ```
   *Skrip ini otomatis mencadangkan data sumber ke `backend/backups/`, memvalidasi foreign key, memindahkan data secara topological order, menyinkronkan urutan AUTO_INCREMENT MySQL, dan menginvalidasi session lama demi keamanan.*

4. Verifikasi integritas data:
   ```bash
   python manage.py verify_db_migration
   # Atau langsung via script:
   # python scripts/verify_migration.py
   ```

## 4. Pengujian (Tests)

Jalankan regression test:
```bash
python manage.py test
python manage.py check --deploy
```
