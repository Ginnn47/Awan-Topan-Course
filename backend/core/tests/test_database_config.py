import os
import tempfile
from pathlib import Path
from unittest import TestCase
from awantopan.settings import _load_env_file


class DatabaseConfigTestCase(TestCase):
    def test_env_loader(self):
        with tempfile.NamedTemporaryFile("w+", delete=False, suffix=".env") as f:
            f.write("# Sample env\n")
            f.write("TEST_VAR_ATCOURSE=foobar\n")
            f.write("TEST_QUOTED='hello_world'\n")
            f_path = Path(f.name)

        try:
            _load_env_file(f_path)
            self.assertEqual(os.environ.get("TEST_VAR_ATCOURSE"), "foobar")
            self.assertEqual(os.environ.get("TEST_QUOTED"), "hello_world")
        finally:
            if f_path.exists():
                f_path.unlink()
            os.environ.pop("TEST_VAR_ATCOURSE", None)
            os.environ.pop("TEST_QUOTED", None)

    def test_mysql_driver_registration(self):
        # Ensure either MySQLdb or pymysql is registered
        try:
            import MySQLdb
            self.assertIsNotNone(MySQLdb)
        except ImportError:
            try:
                import pymysql
                self.assertIsNotNone(pymysql)
            except ImportError:
                pass
