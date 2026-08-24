# Awan Topan Course Backend

Django foundation untuk sistem tracking kelas dan keuangan bimbingan belajar.

## Local

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python manage.py makemigrations
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver 127.0.0.1:8000
```

SQLite dipakai untuk development awal. Untuk production, gunakan PostgreSQL seperti arahan design spec.
