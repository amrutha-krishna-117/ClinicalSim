"""
Auto-migration: runs on backend startup.
Adds missing columns to existing PostgreSQL tables without dropping data.
"""
from sqlalchemy import text, inspect
from app.core.database import engine
import logging

logger = logging.getLogger(__name__)

def run_migrations():
    """Add any missing columns to existing tables."""
    try:
        with engine.connect() as conn:
            inspector = inspect(engine)

            # ── simulation_sessions ──────────────────────────────
            existing = [c['name'] for c in inspector.get_columns('simulation_sessions')]

            migrations = [
                ("patient_position",    "ALTER TABLE simulation_sessions ADD COLUMN patient_position VARCHAR(50) DEFAULT 'supine'"),
                ("student_reasoning",   "ALTER TABLE simulation_sessions ADD COLUMN student_reasoning TEXT"),
                ("ai_feedback",         "ALTER TABLE simulation_sessions ADD COLUMN ai_feedback TEXT"),
                ("debriefing",          "ALTER TABLE simulation_sessions ADD COLUMN debriefing JSON DEFAULT '{}'"),
                ("score_breakdown",     "ALTER TABLE simulation_sessions ADD COLUMN score_breakdown JSON DEFAULT '{}'"),
            ]

            for col, sql in migrations:
                if col not in existing:
                    conn.execute(text(sql))
                    conn.commit()
                    logger.info(f"Migration: added column '{col}' to simulation_sessions")

            # ── scenarios ────────────────────────────────────────
            sc_existing = [c['name'] for c in inspector.get_columns('scenarios')]
            sc_migrations = [
                ("estimated_duration",  "ALTER TABLE scenarios ADD COLUMN estimated_duration INTEGER DEFAULT 20"),
                ("learning_objectives", "ALTER TABLE scenarios ADD COLUMN learning_objectives JSON DEFAULT '[]'"),
                ("patient_position",    "ALTER TABLE scenarios ADD COLUMN patient_position VARCHAR(50) DEFAULT 'supine'"),
                ("description",         "ALTER TABLE scenarios ADD COLUMN description TEXT"),
                ("specialty",           "ALTER TABLE scenarios ADD COLUMN specialty VARCHAR(100)"),
                ("patient_name",        "ALTER TABLE scenarios ADD COLUMN patient_name VARCHAR(100)"),
            ]
            for col, sql in sc_migrations:
                if col not in sc_existing:
                    conn.execute(text(sql))
                    conn.commit()
                    logger.info(f"Migration: added column '{col}' to scenarios")

            logger.info("Auto-migrations complete.")
    except Exception as e:
        logger.error(f"Migration error: {e}")
