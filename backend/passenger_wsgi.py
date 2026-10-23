"""
Passenger WSGI entrypoint for cPanel / AnyMHost Python App.
"""
import os
import sys

# Ensure backend root is on Python sys.path
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "awantopan.settings")

from awantopan.wsgi import application  # noqa: E402
