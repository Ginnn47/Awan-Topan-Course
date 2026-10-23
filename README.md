# Awan Topan Course

Monorepo website tracking kelas dan keuangan bimbingan belajar Awan Topan Course.

- `frontend/`: React + TypeScript + Tailwind (Target Deployment: **Vercel Free**).
- `backend/`: Django API & Auth (Target Deployment: **AnyMHost Developer Newbie** via Python App / WSGI).
- `database`: **MySQL / MariaDB** pada AnyMHost (sebelumnya dirancang PostgreSQL).

## Arsitektur Deployment

1. **Frontend (Vercel Free)**:
   - Terhubung ke API backend Django di AnyMHost.
   - Konfigurasi environment: `VITE_ENABLE_MOCKS=false`.

2. **Backend (AnyMHost)**:
   - Django 5.x berjalan di atas Python App (WSGI / Passenger).
   - Driver database: `PyMySQL` (kompatibel penuh tanpa C-compiler) / `mysqlclient`.
   - Database target: MySQL / MariaDB AnyMHost.

## Panduan Cepat

### Frontend

```bash
cd frontend
npm install
npm test -- --run
npm run build
npm run dev
```

### Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
python manage.py migrate
python manage.py runserver 127.0.0.1:8000
```

### Migrasi Database (PostgreSQL -> MySQL)

Jika terdapat data historis di PostgreSQL yang ingin dipindahkan ke MySQL AnyMHost:

```bash
cd backend
pip install -r requirements-migration.txt
# Pastikan konfigurasi MySQL target dan PostgreSQL sumber telah diset di .env
python manage.py migrate_pg_to_mysql
python manage.py verify_db_migration
```
