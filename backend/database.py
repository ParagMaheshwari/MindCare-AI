import os
import logging
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker

# Load environment variables
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '.env'))
load_dotenv()

logger = logging.getLogger('mindcare-db')

DB_HOST = os.getenv('DB_HOST', '127.0.0.1')
DB_PORT = os.getenv('DB_PORT', '3306')
DB_USER = os.getenv('DB_USER', 'root')
DB_PASSWORD = os.getenv('DB_PASSWORD', 'root')
DB_NAME = os.getenv('DB_NAME', 'mindcare_db')

custom_url = os.getenv('DATABASE_URL')
if custom_url:
    DATABASE_URL = custom_url
else:
    # URL-encode password in case it contains special characters
    from urllib.parse import quote_plus
    encoded_pw = quote_plus(DB_PASSWORD)
    DATABASE_URL = f'mysql+pymysql://{DB_USER}:{encoded_pw}@{DB_HOST}:{DB_PORT}/{DB_NAME}?charset=utf8mb4'

# Base class for SQLAlchemy models
Base = declarative_base()

def get_engine():
    global DATABASE_URL
    try:
        # First attempt to ensure the MySQL database exists
        import pymysql
        try:
            conn = pymysql.connect(
                host=DB_HOST,
                port=int(DB_PORT),
                user=DB_USER,
                password=DB_PASSWORD,
                connect_timeout=3
            )
            with conn.cursor() as cursor:
                cursor.execute(f'CREATE DATABASE IF NOT EXISTS {DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;')
            conn.commit()
            conn.close()
            logger.info(f'MySQL database \"{DB_NAME}\" is verified/ready.')
        except Exception as dbe:
            logger.warning(f'Could not verify/create database \"{DB_NAME}\" via raw connection: {dbe}')

        engine = create_engine(
            DATABASE_URL,
            pool_pre_ping=True,
            pool_recycle=3600,
            connect_args={'connect_timeout': 3},
            echo=False
        )
        # Test connection
        with engine.connect() as conn:
            conn.execute(text('SELECT 1'))
        logger.info(f'Connected to MySQL successfully: {DB_HOST}:{DB_PORT}/{DB_NAME}')
        return engine, False
    except Exception as e:
        logger.error(f'Failed to connect to MySQL database at {DB_HOST}:{DB_PORT}: {e}')
        logger.warning('Initializing local SQLite fallback (mindcare_fallback.db) to ensure application stability.')
        fallback_path = os.path.abspath(os.path.join(os.path.dirname(__file__), 'mindcare_fallback.db')).replace('\\', '/')
        fallback_url = f'sqlite:///{fallback_path}'
        fallback_engine = create_engine(
            fallback_url,
            connect_args={'check_same_thread': False},
            echo=False
        )
        return fallback_engine, True

engine, is_fallback = get_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    from sqlalchemy import inspect
    Base.metadata.create_all(bind=engine)
    
    # Defensive column migration for existing databases
    try:
        inspector = inspect(engine)
        if 'users' in inspector.get_table_names():
            columns = [c['name'] for c in inspector.get_columns('users')]
            with engine.begin() as conn:
                if 'role' not in columns:
                    conn.execute(text("ALTER TABLE users ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'user'"))
                    logger.info("Added missing 'role' column to users table.")
                if 'status' not in columns:
                    conn.execute(text("ALTER TABLE users ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'active'"))
                    logger.info("Added missing 'status' column to users table.")
                if 'updated_at' not in columns:
                    # Support both MySQL and SQLite syntax for DATETIME
                    if is_fallback:
                        conn.execute(text("ALTER TABLE users ADD COLUMN updated_at DATETIME"))
                    else:
                        conn.execute(text("ALTER TABLE users ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"))
                    logger.info("Added missing 'updated_at' column to users table.")
    except Exception as me:
        logger.warning(f"Schema column check notice: {me}")

    logger.info('Database tables and schema migrations verified.')

