"""
Awan Topan Course - Django Package Initialization.
Registers PyMySQL as the MySQLdb driver when mysqlclient is unavailable.
"""

try:
    import MySQLdb  # noqa: F401
except ImportError:
    try:
        import pymysql

        pymysql.install_as_MySQLdb()
    except ImportError:
        pass
