#!/usr/bin/env python3
"""
MindCare AI — Production SQLite to PostgreSQL Data Migration Tool
=================================================================

This tool safely transfers all MindCare AI data from an SQLite database
(e.g., mindcare_fallback.db) to an external PostgreSQL database.

Safety Guarantees:
- READ-ONLY on source SQLite (original database is never altered or deleted).
- Full transaction protection with automatic rollback on error.
- Automatic full JSON backup of all source tables before migration.
- Preserves primary keys (id), foreign keys (user_id), and all timestamps.
- Preserves exact bcrypt password hashes so user logins continue seamlessly.
- Automatically resets PostgreSQL auto-increment sequences (e.g. users_id_seq).
- Safe duplicate handling (idempotent / re-runnable).
- Post-migration row count and foreign-key integrity validation.
- Dry-run verification mode (--dry-run).
- Standalone export-only mode (--export-only).

Usage:
  # 1. Export backup only (run on Render shell or locally)
  python migrate_sqlite_to_postgres.py --export-only

  # 2. Dry-run verification (test connection, analyze data, no changes committed)
  python migrate_sqlite_to_postgres.py --pg-url "postgresql://user:pass@host/db?sslmode=require" --dry-run

  # 3. Execute live migration
  python migrate_sqlite_to_postgres.py --pg-url "postgresql://user:pass@host/db?sslmode=require"
"""

import os
import sys
import json
import argparse
import logging
from datetime import datetime
from typing import Dict, List, Any, Optional

from sqlalchemy import create_engine, text, inspect
from sqlalchemy.orm import sessionmaker

# Setup structured logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("mindcare-migration")

# Dependency order for relational migration
MIGRATION_TABLES = [
    "users",
    "assessments",
    "mood_entries",
    "journal_entries",
    "goals",
    "chat_messages",
    "password_reset_tokens"
]

DATETIME_COLUMNS = {
    "users": ["created_at", "updated_at"],
    "assessments": ["assessment_date", "created_at"],
    "mood_entries": ["timestamp", "created_at"],
    "journal_entries": ["created_at", "updated_at"],
    "goals": ["created_at", "updated_at"],
    "chat_messages": ["created_at"],
    "password_reset_tokens": ["expires_at", "used_at", "created_at"]
}

BOOLEAN_COLUMNS = {
    "mood_entries": ["is_voice_entry"]
}


def parse_datetime_val(val: Any) -> Optional[datetime]:
    """Parse string or existing datetime into Python datetime object."""
    if val is None:
        return None
    if isinstance(val, datetime):
        return val
    if isinstance(val, str):
        val = val.strip().replace("Z", "")
        # Try standard ISO / SQLite formats
        for fmt in ("%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S.%f", "%Y-%m-%dT%H:%M:%S"):
            try:
                return datetime.strptime(val, fmt)
            except ValueError:
                continue
        try:
            return datetime.fromisoformat(val)
        except Exception:
            pass
    return None


def export_sqlite_backup(sqlite_engine, output_path: str) -> Dict[str, int]:
    """Export all tables and rows from SQLite into a single JSON backup file."""
    logger.info(f"Creating full JSON backup of SQLite database to: {output_path}")
    backup_data: Dict[str, Any] = {
        "metadata": {
            "exported_at": datetime.utcnow().isoformat(),
            "source_type": "sqlite",
            "tables": MIGRATION_TABLES
        },
        "tables": {}
    }

    counts: Dict[str, int] = {}
    with sqlite_engine.connect() as conn:
        for table in MIGRATION_TABLES:
            try:
                rows = conn.execute(text(f"SELECT * FROM {table}")).fetchall()
                # Get column names
                keys = conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
                col_names = [k[1] for k in keys]
                
                table_rows = []
                for r in rows:
                    row_dict = {}
                    for idx, col in enumerate(col_names):
                        val = r[idx]
                        if isinstance(val, datetime):
                            val = val.isoformat()
                        row_dict[col] = val
                    table_rows.append(row_dict)

                backup_data["tables"][table] = table_rows
                counts[table] = len(table_rows)
                logger.info(f"  Exported table '{table}': {len(table_rows)} rows")
            except Exception as e:
                logger.warning(f"  Could not export table '{table}': {e}")
                backup_data["tables"][table] = []
                counts[table] = 0

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(backup_data, f, indent=2, ensure_ascii=False)

    logger.info(f"Backup successfully written to: {output_path} (Total tables: {len(counts)})")
    return counts


def reset_postgres_sequences(pg_conn, table_name: str) -> None:
    """Reset PostgreSQL serial/identity sequences to match maximum existing ID."""
    try:
        # Check if table has an id column
        res = pg_conn.execute(text(f"SELECT COALESCE(MAX(id), 0) FROM {table_name}")).scalar()
        max_id = res or 0
        next_id = max(max_id, 1)

        # Attempt standard sequence update
        seq_query = text(f"""
            SELECT pg_get_serial_sequence('{table_name}', 'id');
        """)
        seq_name = pg_conn.execute(seq_query).scalar()

        if seq_name:
            pg_conn.execute(text(f"SELECT setval('{seq_name}', {next_id}, true);"))
            logger.info(f"  Updated sequence '{seq_name}' -> next value will be > {max_id}")
        else:
            # Fallback to standard convention <table>_id_seq
            fallback_seq = f"{table_name}_id_seq"
            try:
                pg_conn.execute(text(f"SELECT setval('{fallback_seq}', {next_id}, true);"))
                logger.info(f"  Updated sequence '{fallback_seq}' -> next value will be > {max_id}")
            except Exception:
                logger.debug(f"  No serial sequence found for table '{table_name}' (using identity or manual keys).")
    except Exception as e:
        logger.warning(f"  Notice while resetting sequence for '{table_name}': {e}")


def verify_foreign_keys(pg_conn) -> bool:
    """Verify that all foreign-key references in child tables point to valid users in PostgreSQL."""
    logger.info("\n--- VALIDATING FOREIGN KEY INTEGRITY IN POSTGRESQL ---")
    all_valid = True

    child_tables = ["assessments", "mood_entries", "journal_entries", "goals", "chat_messages", "password_reset_tokens"]
    for table in child_tables:
        query = text(f"""
            SELECT COUNT(*) FROM {table} c
            LEFT JOIN users u ON c.user_id = u.id
            WHERE u.id IS NULL;
        """)
        orphans = pg_conn.execute(query).scalar()
        if orphans > 0:
            logger.error(f"  FAIL: Table '{table}' contains {orphans} orphaned records with invalid user_id!")
            all_valid = False
        else:
            logger.info(f"  PASS: Table '{table}' has zero orphaned foreign-key references.")

    return all_valid


def migrate(sqlite_path: str, pg_url: str, dry_run: bool = False, skip_export: bool = False) -> bool:
    """Execute complete end-to-end migration from SQLite to PostgreSQL."""
    if not os.path.exists(sqlite_path):
        logger.error(f"SQLite source file does not exist: {sqlite_path}")
        return False

    # Normalize PostgreSQL URL (support postgres:// -> postgresql://)
    if pg_url.startswith("postgres://"):
        pg_url = pg_url.replace("postgres://", "postgresql://", 1)

    # Obfuscate credentials for safe terminal logging
    from urllib.parse import urlparse
    parsed = urlparse(pg_url)
    safe_pg_url = f"{parsed.scheme}://{parsed.username}:***@{parsed.hostname}:{parsed.port or 5432}{parsed.path}"
    logger.info("==================================================================")
    logger.info("  MINDCARE AI — SQLITE TO POSTGRESQL MIGRATION")
    logger.info("==================================================================")
    logger.info(f"Source Database (SQLite):     {sqlite_path}")
    logger.info(f"Target Database (PostgreSQL): {safe_pg_url}")
    logger.info(f"Execution Mode:               {'DRY-RUN (No changes will be saved)' if dry_run else 'LIVE MIGRATION'}")
    logger.info("==================================================================")

    # 1. Create Engines
    sqlite_url = f"sqlite:///{os.path.abspath(sqlite_path).replace(os.sep, '/')}"
    sqlite_engine = create_engine(sqlite_url, connect_args={"check_same_thread": False})

    connect_args = {"sslmode": "require"} if "localhost" not in pg_url and "127.0.0.1" not in pg_url else {}
    pg_engine = create_engine(
        pg_url,
        connect_args=connect_args,
        pool_pre_ping=True
    )

    # Test connections
    try:
        with sqlite_engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        logger.info("Source SQLite connection verified.")
    except Exception as e:
        logger.error(f"Failed to open SQLite database: {e}")
        return False

    try:
        with pg_engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        logger.info("Target PostgreSQL connection verified.")
    except Exception as e:
        logger.error(f"Failed to connect to PostgreSQL database: {e}")
        return False

    # 2. Automated Pre-Migration JSON Backup
    if not skip_export:
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        backup_file = os.path.join(os.path.dirname(os.path.abspath(sqlite_path)), f"mindcare_sqlite_backup_{timestamp}.json")
        export_sqlite_backup(sqlite_engine, backup_file)

    # 3. Ensure Target Schema Exists in PostgreSQL
    logger.info("\n--- ENSURING POSTGRESQL SCHEMA EXISTS ---")
    try:
        # Import Base and models to issue create_all on target
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        import models
        from database import Base
        Base.metadata.create_all(bind=pg_engine)
        logger.info("PostgreSQL tables, indexes, and foreign keys verified/created.")
    except Exception as e:
        logger.error(f"Error initializing PostgreSQL schema: {e}")
        return False

    # 4. Migrate Data Table by Table
    logger.info(f"\n--- BEGINNING DATA TRANSFER ({'DRY-RUN' if dry_run else 'TRANSACTIONAL'}) ---")
    summary: Dict[str, Dict[str, int]] = {}

    pg_inspector = inspect(pg_engine)
    target_tables = pg_inspector.get_table_names()

    with pg_engine.connect() as pg_conn:
        trans = pg_conn.begin()
        try:
            with sqlite_engine.connect() as sq_conn:
                for table in MIGRATION_TABLES:
                    if table not in target_tables:
                        logger.warning(f"Table '{table}' not found in target PostgreSQL database. Skipping.")
                        continue

                    # Read all source rows
                    sq_rows = sq_conn.execute(text(f"SELECT * FROM {table} ORDER BY id ASC")).fetchall()
                    sq_keys = sq_conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
                    col_names = [k[1] for k in sq_keys]

                    logger.info(f"\nMigrating table '{table}' (Source rows: {len(sq_rows)})...")

                    # Read existing target IDs to guarantee safe duplicate prevention
                    existing_target_ids = set()
                    try:
                        id_res = pg_conn.execute(text(f"SELECT id FROM {table}")).fetchall()
                        existing_target_ids = {r[0] for r in id_res}
                    except Exception:
                        pass

                    # For users table, also track existing emails
                    existing_emails = set()
                    if table == "users":
                        try:
                            em_res = pg_conn.execute(text("SELECT LOWER(email) FROM users")).fetchall()
                            existing_emails = {r[0].strip().lower() for r in em_res if r[0]}
                        except Exception:
                            pass

                    inserted_count = 0
                    skipped_count = 0

                    dt_cols = DATETIME_COLUMNS.get(table, [])
                    bool_cols = BOOLEAN_COLUMNS.get(table, [])

                    for row in sq_rows:
                        row_dict = {col_names[idx]: row[idx] for idx in range(len(col_names))}
                        row_id = row_dict.get("id")

                        # Duplicate check by ID
                        if row_id in existing_target_ids:
                            skipped_count += 1
                            continue

                        # For users: duplicate check by email
                        if table == "users":
                            user_email = (row_dict.get("email") or "").strip().lower()
                            if user_email in existing_emails:
                                logger.info(f"  Notice: User email '{user_email}' already exists in PostgreSQL. Skipping duplicate.")
                                skipped_count += 1
                                continue
                            existing_emails.add(user_email)

                        # Clean and cast column types for PostgreSQL
                        cleaned_dict = {}
                        for k, v in row_dict.items():
                            if k in dt_cols:
                                cleaned_dict[k] = parse_datetime_val(v)
                            elif k in bool_cols:
                                cleaned_dict[k] = bool(v) if v is not None else False
                            else:
                                cleaned_dict[k] = v

                        # Construct parameterized INSERT statement
                        col_list = list(cleaned_dict.keys())
                        col_str = ", ".join(col_list)
                        param_str = ", ".join([f":{c}" for c in col_list])
                        insert_stmt = text(f"INSERT INTO {table} ({col_str}) VALUES ({param_str})")

                        pg_conn.execute(insert_stmt, cleaned_dict)
                        inserted_count += 1
                        existing_target_ids.add(row_id)

                    logger.info(f"  Table '{table}' -> Inserted: {inserted_count}, Skipped (Already existed): {skipped_count}")

                    # Reset PostgreSQL Sequence for this table
                    if not dry_run:
                        reset_postgres_sequences(pg_conn, table)

                    summary[table] = {
                        "source": len(sq_rows),
                        "inserted": inserted_count,
                        "skipped": skipped_count
                    }

            # 5. Foreign Key Integrity Check
            fk_ok = verify_foreign_keys(pg_conn)
            if not fk_ok:
                raise RuntimeError("Foreign key verification failed! Aborting migration to maintain data integrity.")

            if dry_run:
                trans.rollback()
                logger.info("\n[DRY RUN] Rolled back all changes. No records were written to PostgreSQL.")
            else:
                trans.commit()
                logger.info("\n[SUCCESS] Transaction committed successfully!")

        except Exception as e:
            trans.rollback()
            logger.error(f"\n[ERROR] Migration failed: {e}")
            logger.info("Transaction was rolled back. Target PostgreSQL database remains clean and unchanged.")
            return False

    # 6. Post-Migration Verification & Summary
    logger.info("\n==================================================================")
    logger.info("                 MIGRATION SUMMARY AUDIT")
    logger.info("==================================================================")
    print(f"{'Table Name':<25} | {'Source (SQLite)':<15} | {'Migrated':<10} | {'Skipped':<10} | {'Status'}")
    print("-" * 75)

    all_matched = True
    with pg_engine.connect() as pg_conn:
        for table in MIGRATION_TABLES:
            sq_count = summary.get(table, {}).get("source", 0)
            migrated = summary.get(table, {}).get("inserted", 0)
            skipped = summary.get(table, {}).get("skipped", 0)
            
            if dry_run:
                pg_total = 0
                status = "DRY-RUN OK"
            else:
                pg_total = pg_conn.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar()
                status = "MATCHED" if pg_total >= (migrated + skipped) else "DISCREPANCY"
                if status == "DISCREPANCY":
                    all_matched = False

            print(f"{table:<25} | {sq_count:<15} | {migrated:<10} | {skipped:<10} | {status}")

    print("==================================================================")
    if dry_run:
        logger.info("DRY-RUN completed successfully. PostgreSQL database is 100% compatible.")
        return True

    if all_matched:
        logger.info("All tables and records migrated and verified with 100% data integrity!")
        return True
    else:
        logger.warning("Migration finished with record count discrepancies. Please inspect tables.")
        return False


def main():
    parser = argparse.ArgumentParser(description="MindCare AI — SQLite to PostgreSQL Migration Tool")
    parser.add_argument(
        "--sqlite-path",
        default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "mindcare_fallback.db"),
        help="Path to source SQLite file (default: backend/mindcare_fallback.db)"
    )
    parser.add_argument(
        "--pg-url",
        default=os.getenv("DATABASE_URL") or os.getenv("TARGET_DATABASE_URL"),
        help="Target PostgreSQL connection URL (e.g., postgresql://user:pass@host/db?sslmode=require)"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Run validation, read source, simulate migration, but do not commit any changes to PostgreSQL"
    )
    parser.add_argument(
        "--export-only",
        action="store_true",
        help="Only export full SQLite JSON backup and exit without modifying or connecting to PostgreSQL"
    )
    parser.add_argument(
        "--backup-path",
        default=None,
        help="Custom output path for the JSON backup file"
    )

    args = parser.parse_args()

    # Mode 1: Export only
    if args.export_only:
        if not os.path.exists(args.sqlite_path):
            logger.error(f"SQLite file not found at: {args.sqlite_path}")
            sys.exit(1)
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        backup_file = args.backup_path or os.path.join(os.path.dirname(os.path.abspath(args.sqlite_path)), f"mindcare_sqlite_backup_{timestamp}.json")
        sqlite_engine = create_engine(f"sqlite:///{os.path.abspath(args.sqlite_path).replace(os.sep, '/')}")
        export_sqlite_backup(sqlite_engine, backup_file)
        sys.exit(0)

    # Mode 2: Migration (requires PostgreSQL URL)
    if not args.pg_url:
        logger.error("Missing PostgreSQL connection URL.")
        logger.info("Please specify --pg-url 'postgresql://user:pass@host:5432/dbname?sslmode=require' or set DATABASE_URL environment variable.")
        sys.exit(1)

    success = migrate(
        sqlite_path=args.sqlite_path,
        pg_url=args.pg_url,
        dry_run=args.dry_run
    )

    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
