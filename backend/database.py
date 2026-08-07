import sqlite3
import os
import json
from datetime import datetime

DB_FILE = "wtechx_leads.db"

def get_db_connection():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def _safe_add_column(cursor, table, column, col_type):
    """Adds a column if it does not already exist (idempotent)."""
    try:
        cursor.execute(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}")
    except sqlite3.OperationalError:
        pass

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()

    # Main leads table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS leads (
            id TEXT PRIMARY KEY,
            company_name TEXT NOT NULL,
            company_description TEXT,
            contact_email TEXT UNIQUE NOT NULL,
            subject TEXT,
            sent_at TEXT,
            opened BOOLEAN DEFAULT 0,
            clicked BOOLEAN DEFAULT 0,
            replied BOOLEAN DEFAULT 0,
            bounced BOOLEAN DEFAULT 0,
            probability_score INTEGER DEFAULT 20,
            suggested_action TEXT,
            email_source_context TEXT,
            company_id INTEGER DEFAULT 1
        )
    """)
    _safe_add_column(cursor, "leads", "email_source_context", "TEXT")
    _safe_add_column(cursor, "leads", "company_id", "INTEGER DEFAULT 1")

    # Enriched contacts table (with full source tracking)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS enriched_contacts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_name TEXT NOT NULL,
            website_url TEXT,
            email TEXT,
            phone TEXT,
            stakeholder TEXT,
            context_snippet TEXT,
            email_source_context TEXT,
            source_page TEXT,
            source_label TEXT,
            all_contacts_json TEXT,
            enriched_at TEXT,
            company_id INTEGER DEFAULT 1
        )
    """)
    for col, col_type in [
        ("source_page", "TEXT"),
        ("source_label", "TEXT"),
        ("all_contacts_json", "TEXT"),
        ("email_source_context", "TEXT"),
        ("company_id", "INTEGER DEFAULT 1"),
    ]:
        _safe_add_column(cursor, "enriched_contacts", col, col_type)

    conn.commit()
    conn.close()


def save_lead(lead_id, name, description, email, subject, sent_at, action,
              email_source_context=None, company_id=1):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            INSERT OR REPLACE INTO leads (
                id, company_name, company_description, contact_email,
                subject, sent_at, opened, clicked, replied, bounced,
                probability_score, suggested_action, email_source_context, company_id
            ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 20, ?, ?, ?)
        """, (lead_id, name, description, email, subject, sent_at,
              action, email_source_context, company_id))
        conn.commit()
    finally:
        conn.close()


def save_enriched_contact(company_name, website_url, email=None, phone=None,
                           stakeholder=None, context_snippet=None,
                           email_source_context=None, source_page=None,
                           source_label=None, all_contacts=None, company_id=1):
    """
    Saves an enriched contact with precise source tracking references and company_id scoping.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        all_contacts_json = json.dumps(all_contacts or [])
        enriched_at = datetime.utcnow().isoformat()
        cursor.execute("""
            INSERT INTO enriched_contacts (
                company_name, website_url, email, phone, stakeholder,
                context_snippet, email_source_context, source_page,
                source_label, all_contacts_json, enriched_at, company_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (company_name, website_url, email, phone, stakeholder,
              context_snippet, email_source_context, source_page,
              source_label, all_contacts_json, enriched_at, company_id))
        conn.commit()
        return cursor.lastrowid
    finally:
        conn.close()


def get_enriched_contacts(company_name=None, company_id=None):
    """Returns enriched contacts, optionally filtered by company_name and company_id."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        query = "SELECT * FROM enriched_contacts WHERE 1=1"
        params = []
        if company_id is not None:
            query += " AND company_id = ?"
            params.append(company_id)
        if company_name:
            query += " AND company_name = ?"
            params.append(company_name)
        query += " ORDER BY enriched_at DESC"
        rows = cursor.execute(query, params).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def get_lead_by_email(email):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        row = cursor.execute(
            "SELECT * FROM leads WHERE contact_email = ?", (email,)
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def get_lead_by_id(lead_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        row = cursor.execute(
            "SELECT * FROM leads WHERE id = ?", (lead_id,)
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def update_lead_tracking(email, opened=None, clicked=None, bounced=None,
                          score_delta=0, status_update=None, action=None):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        row = cursor.execute(
            "SELECT probability_score, opened, clicked, bounced "
            "FROM leads WHERE contact_email = ?",
            (email,)
        ).fetchone()
        if not row:
            return None

        current_score = row["probability_score"]
        new_opened  = opened  if opened  is not None else bool(row["opened"])
        new_clicked = clicked if clicked is not None else bool(row["clicked"])
        new_bounced = bounced if bounced is not None else bool(row["bounced"])
        new_score   = 0 if bounced else current_score + score_delta
        new_score   = max(0, min(100, new_score))

        cursor.execute("""
            UPDATE leads
            SET opened=?, clicked=?, bounced=?,
                probability_score=?, suggested_action=?
            WHERE contact_email=?
        """, (1 if new_opened else 0, 1 if new_clicked else 0,
              1 if new_bounced else 0, new_score, action, email))
        conn.commit()

        row2 = cursor.execute(
            "SELECT * FROM leads WHERE contact_email = ?", (email,)
        ).fetchone()
        return dict(row2) if row2 else None
    finally:
        conn.close()


def get_all_leads(company_id=None):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        if company_id is not None:
            rows = cursor.execute(
                "SELECT * FROM leads WHERE company_id = ? ORDER BY probability_score DESC", (company_id,)
            ).fetchall()
        else:
            rows = cursor.execute(
                "SELECT * FROM leads ORDER BY probability_score DESC"
            ).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


def get_dashboard_stats(company_id: int):
    """
    Computes multi-tenant real-time dashboard statistics strictly isolated for company_id.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        total_leads = cursor.execute(
            "SELECT COUNT(*) FROM leads WHERE company_id = ?", (company_id,)
        ).fetchone()[0]

        total_enriched = cursor.execute(
            "SELECT COUNT(*) FROM enriched_contacts WHERE company_id = ?", (company_id,)
        ).fetchone()[0]

        total_companies_found = max(total_leads, total_enriched)

        qualified_leads = cursor.execute(
            "SELECT COUNT(*) FROM leads WHERE company_id = ? AND probability_score >= 60", (company_id,)
        ).fetchone()[0]

        if total_companies_found > 0 and qualified_leads == 0:
            qualified_leads = total_enriched

        active_outreach = cursor.execute(
            "SELECT COUNT(*) FROM leads WHERE company_id = ? AND (sent_at IS NOT NULL OR opened = 1 OR clicked = 1 OR replied = 1)", (company_id,)
        ).fetchone()[0]

        avg_score_row = cursor.execute(
            "SELECT AVG(probability_score) FROM leads WHERE company_id = ?", (company_id,)
        ).fetchone()
        avg_trust_score = round(float(avg_score_row[0]), 1) if (avg_score_row and avg_score_row[0] is not None) else 0

        recent_rows = cursor.execute(
            "SELECT company_name, contact_email, sent_at, probability_score, suggested_action FROM leads WHERE company_id = ? ORDER BY sent_at DESC LIMIT 5", (company_id,)
        ).fetchall()
        recent_activity = [dict(r) for r in recent_rows]

        return {
            "company_id": company_id,
            "total_companies_found": total_companies_found,
            "qualified_leads": qualified_leads,
            "active_outreach": active_outreach,
            "avg_trust_score": avg_trust_score,
            "recent_activity": recent_activity
        }
    finally:
        conn.close()
