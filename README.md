# Awan Topan Course

Monorepo MVP untuk website tracking kelas dan keuangan bimbingan belajar.

- `frontend/`: React + TypeScript + Tailwind, mengikuti visual Stitch Awan Topan.
- `backend/`: Django foundation untuk role, siswa, guru, kelas, jadwal, session, absensi, pembayaran, dan audit log.

## Frontend

```bash
cd frontend
cmd /c npm install
cmd /c npm run dev
```

Login demo tersedia lewat pilihan role di layar login: `Admin` atau `Guru`.

## Backend

```bash
cd backend
python manage.py check
python manage.py makemigrations
python manage.py migrate
python manage.py runserver 127.0.0.1:8000
```
