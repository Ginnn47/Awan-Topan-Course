import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


def _load_env_file(path: Path) -> None:
    """Load key-value pairs from an env file without overriding existing environment variables."""
    if not path.is_file():
        return
    try:
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, val = line.split("=", 1)
                key = key.strip()
                val = val.strip().strip("'\"")
                if key and key not in os.environ:
                    os.environ[key] = val
    except Exception:
        pass


# Load .env from backend/ or project root if present
_load_env_file(BASE_DIR / ".env")
_load_env_file(BASE_DIR.parent / ".env")

# PyMySQL fallback registration for MySQLdb
try:
    import MySQLdb  # noqa: F401
except ImportError:
    try:
        import pymysql

        pymysql.install_as_MySQLdb()
    except ImportError:
        pass

# ------------------------------------------------------------------------------
# Core Security & Debug
# ------------------------------------------------------------------------------
SECRET_KEY = os.getenv("DJANGO_SECRET_KEY") or os.getenv("SECRET_KEY", "dev-only-awantopan-change-me")
DEBUG = os.getenv("DJANGO_DEBUG", "True").lower() in ("true", "1", "yes")

_allowed_hosts_raw = os.getenv("ALLOWED_HOSTS", "127.0.0.1,localhost,testserver")
ALLOWED_HOSTS = [h.strip() for h in _allowed_hosts_raw.split(",") if h.strip()]

# ------------------------------------------------------------------------------
# Application Definition
# ------------------------------------------------------------------------------
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "corsheaders",
    "rest_framework",
    "core",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "awantopan.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "awantopan.wsgi.application"

# ------------------------------------------------------------------------------
# Database Configuration
# Target: MySQL / MariaDB (e.g. AnyMHost Developer Newbie)
# Supports environment variables:
#   DB_ENGINE=mysql
#   MYSQL_DATABASE / DB_NAME
#   MYSQL_USER / DB_USER
#   MYSQL_PASSWORD / DB_PASSWORD
#   MYSQL_HOST / DB_HOST (default: localhost)
#   MYSQL_PORT / DB_PORT (default: 3306)
# Also allows temporary PostgreSQL source connection during data migration.
# ------------------------------------------------------------------------------
DB_ENGINE = os.getenv("DB_ENGINE", "").lower().strip()

mysql_database = os.getenv("MYSQL_DATABASE") or os.getenv("DB_NAME")
mysql_user = os.getenv("MYSQL_USER") or os.getenv("DB_USER")
mysql_password = os.getenv("MYSQL_PASSWORD") or os.getenv("DB_PASSWORD", "")
mysql_host = os.getenv("MYSQL_HOST") or os.getenv("DB_HOST", "localhost")
mysql_port = os.getenv("MYSQL_PORT") or os.getenv("DB_PORT", "3306")

if DB_ENGINE in ("mysql", "mariadb") or (not DB_ENGINE and mysql_database):
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.mysql",
            "NAME": mysql_database or "awantopan_db",
            "USER": mysql_user or "root",
            "PASSWORD": mysql_password,
            "HOST": mysql_host,
            "PORT": mysql_port,
            "OPTIONS": {
                "charset": "utf8mb4",
                "init_command": "SET sql_mode='STRICT_TRANS_TABLES',default_storage_engine=INNODB",
            },
        }
    }
elif DB_ENGINE in ("postgres", "postgresql", "pgsql"):
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": os.getenv("POSTGRES_DB") or os.getenv("DB_NAME", "awantopan_db"),
            "USER": os.getenv("POSTGRES_USER") or os.getenv("DB_USER", "postgres"),
            "PASSWORD": os.getenv("POSTGRES_PASSWORD") or os.getenv("DB_PASSWORD", ""),
            "HOST": os.getenv("POSTGRES_HOST") or os.getenv("DB_HOST", "localhost"),
            "PORT": os.getenv("POSTGRES_PORT") or os.getenv("DB_PORT", "5432"),
        }
    }
else:
    # Local fallback for development/testing when no external DB is specified
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }

# Secondary database alias for PostgreSQL source during data migration
source_pg_name = os.getenv("SOURCE_DB_NAME") or os.getenv("POSTGRES_SOURCE_DB")
if source_pg_name:
    DATABASES["source_pg"] = {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": source_pg_name,
        "USER": os.getenv("SOURCE_DB_USER", "postgres"),
        "PASSWORD": os.getenv("SOURCE_DB_PASSWORD", ""),
        "HOST": os.getenv("SOURCE_DB_HOST", "localhost"),
        "PORT": os.getenv("SOURCE_DB_PORT", "5432"),
    }

# ------------------------------------------------------------------------------
# Authentication & Custom User Model
# ------------------------------------------------------------------------------
AUTH_USER_MODEL = "core.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# ------------------------------------------------------------------------------
# Internationalization & Timezone
# ------------------------------------------------------------------------------
LANGUAGE_CODE = "id-id"
TIME_ZONE = "Asia/Jakarta"
USE_I18N = True
USE_TZ = True

# ------------------------------------------------------------------------------
# Static files (CSS, JavaScript, Images)
# ------------------------------------------------------------------------------
STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

# ------------------------------------------------------------------------------
# Media files (Uploaded files & Attachments)
# ------------------------------------------------------------------------------
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"
MAX_UPLOAD_SIZE = 10 * 1024 * 1024  # 10 MB

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ------------------------------------------------------------------------------
# CORS & CSRF Settings for Vercel Frontend & AnyMHost
# ------------------------------------------------------------------------------
_csrf_origins = os.getenv("CSRF_TRUSTED_ORIGINS", "")
if _csrf_origins:
    CSRF_TRUSTED_ORIGINS = [item.strip() for item in _csrf_origins.split(",") if item.strip()]

_cors_origins = os.getenv("CORS_ALLOWED_ORIGINS", "")
if _cors_origins:
    CORS_ALLOWED_ORIGINS = [item.strip() for item in _cors_origins.split(",") if item.strip()]

CORS_ALLOW_ALL_ORIGINS = os.getenv("CORS_ALLOW_ALL_ORIGINS", "False").lower() in ("true", "1")
CORS_ALLOW_CREDENTIALS = True

# Production security hardening
if not DEBUG:
    SECURE_BROWSER_XSS_FILTER = True
    X_FRAME_OPTIONS = "DENY"
    SECURE_CONTENT_TYPE_NOSNIFF = True
    SESSION_COOKIE_SECURE = os.getenv("SESSION_COOKIE_SECURE", "True").lower() in ("true", "1")
    CSRF_COOKIE_SECURE = os.getenv("CSRF_COOKIE_SECURE", "True").lower() in ("true", "1")
    if os.getenv("SECURE_SSL_REDIRECT", "False").lower() in ("true", "1"):
        SECURE_SSL_REDIRECT = True
    _hsts = os.getenv("SECURE_HSTS_SECONDS")
    if _hsts:
        try:
            SECURE_HSTS_SECONDS = int(_hsts)
            SECURE_HSTS_INCLUDE_SUBDOMAINS = True
            SECURE_HSTS_PRELOAD = True
        except ValueError:
            pass
