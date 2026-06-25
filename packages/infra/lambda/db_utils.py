"""Document + run metadata management using DuckDB + S3 Parquet.

Data model: one document (uploaded file) has N runs (one OCR result per model).
Stored as a single table `documents.parquet` per user, with the runs embedded
as a JSON-string column (run count per document is small — capped by the
number of models — so normalisation isn't worth a second parquet round-trip).

S3 is the source of truth for run results; this parquet is the metadata cache
that drives the document sidebar.
"""
import duckdb
import json
import os
import tempfile
import boto3
from datetime import datetime

BUCKET_NAME = os.environ.get("BUCKET_NAME", "")
REGION = os.environ.get("REGION") or os.environ.get("AWS_DEFAULT_REGION", "us-east-1")

s3 = boto3.client("s3", region_name=REGION)


def _now() -> str:
    return datetime.utcnow().isoformat() + "Z"


def _get_parquet_key(user_id: str) -> str:
    return f"{user_id}/documents.parquet"


def _download_parquet(user_id: str, local_path: str) -> bool:
    """Download user's documents.parquet from S3. Returns False if not found."""
    try:
        s3.download_file(BUCKET_NAME, _get_parquet_key(user_id), local_path)
        return True
    except s3.exceptions.ClientError as e:
        if e.response["Error"]["Code"] == "404":
            return False
        raise
    except Exception:
        return False


def _upload_parquet(user_id: str, local_path: str):
    s3.upload_file(local_path, BUCKET_NAME, _get_parquet_key(user_id))


def _create_table(con):
    con.execute(
        """
        CREATE TABLE documents (
            id VARCHAR,
            filename VARCHAR,
            s3_key VARCHAR,
            runs VARCHAR,
            created_at TIMESTAMP,
            updated_at TIMESTAMP
        )
        """
    )


def _load_or_create(con, parquet_path: str, exists: bool):
    if exists:
        con.execute(
            f"CREATE TABLE documents AS SELECT * FROM read_parquet('{parquet_path}')"
        )
    else:
        _create_table(con)


def _get_runs(con, document_id: str) -> list:
    """Return the runs list for a document (empty if not found)."""
    rows = con.execute(
        "SELECT runs FROM documents WHERE id = ?", [document_id]
    ).fetchall()
    if not rows or not rows[0][0]:
        return []
    try:
        return json.loads(rows[0][0])
    except (ValueError, TypeError):
        return []


def add_document(user_id: str, document_id: str, filename: str, s3_key: str):
    """Create a document row with no runs yet (idempotent on id)."""
    with tempfile.TemporaryDirectory() as tmpdir:
        parquet_path = os.path.join(tmpdir, "documents.parquet")
        exists = _download_parquet(user_id, parquet_path)

        con = duckdb.connect()
        _load_or_create(con, parquet_path, exists)

        already = con.execute(
            "SELECT COUNT(*) FROM documents WHERE id = ?", [document_id]
        ).fetchone()[0]
        if not already:
            now = _now()
            con.execute(
                "INSERT INTO documents VALUES (?, ?, ?, ?, ?, ?)",
                [document_id, filename, s3_key, json.dumps([]), now, now],
            )
            con.execute(f"COPY documents TO '{parquet_path}' (FORMAT PARQUET)")
            con.close()
            _upload_parquet(user_id, parquet_path)
        else:
            con.close()


def upsert_run(
    user_id: str,
    document_id: str,
    filename: str,
    s3_key: str,
    model: str,
    family: str,
    model_options: dict,
):
    """Add or replace a run (by model) on a document, creating the document
    row if it doesn't exist yet (avoids ghost documents from upload-only)."""
    with tempfile.TemporaryDirectory() as tmpdir:
        parquet_path = os.path.join(tmpdir, "documents.parquet")
        exists = _download_parquet(user_id, parquet_path)

        con = duckdb.connect()
        _load_or_create(con, parquet_path, exists)

        now = _now()
        present = con.execute(
            "SELECT COUNT(*) FROM documents WHERE id = ?", [document_id]
        ).fetchone()[0]
        if not present:
            con.execute(
                "INSERT INTO documents VALUES (?, ?, ?, ?, ?, ?)",
                [document_id, filename, s3_key, json.dumps([]), now, now],
            )

        runs = _get_runs(con, document_id)
        run = {
            "model": model,
            "family": family,
            "model_options": model_options,
            "status": "processing",
            "created_at": now,
            "updated_at": now,
            "processing_time_ms": None,
        }
        # Replace existing run for this model, else append.
        runs = [r for r in runs if r.get("model") != model]
        runs.append(run)

        con.execute(
            "UPDATE documents SET runs = ?, updated_at = ? WHERE id = ?",
            [json.dumps(runs), now, document_id],
        )
        con.execute(f"COPY documents TO '{parquet_path}' (FORMAT PARQUET)")
        con.close()
        _upload_parquet(user_id, parquet_path)


def update_run_status(
    user_id: str,
    document_id: str,
    model: str,
    status: str,
    processing_time_ms: int = None,
):
    """Update a single run's status (+ optional timing)."""
    with tempfile.TemporaryDirectory() as tmpdir:
        parquet_path = os.path.join(tmpdir, "documents.parquet")
        if not _download_parquet(user_id, parquet_path):
            return

        con = duckdb.connect()
        con.execute(
            f"CREATE TABLE documents AS SELECT * FROM read_parquet('{parquet_path}')"
        )
        runs = _get_runs(con, document_id)
        if not runs:
            con.close()
            return

        now = _now()
        changed = False
        for r in runs:
            if r.get("model") == model:
                r["status"] = status
                r["updated_at"] = now
                if processing_time_ms is not None:
                    r["processing_time_ms"] = processing_time_ms
                changed = True
        if not changed:
            con.close()
            return

        con.execute(
            "UPDATE documents SET runs = ?, updated_at = ? WHERE id = ?",
            [json.dumps(runs), now, document_id],
        )
        con.execute(f"COPY documents TO '{parquet_path}' (FORMAT PARQUET)")
        con.close()
        _upload_parquet(user_id, parquet_path)


def list_documents(user_id: str) -> list:
    """List all documents for a user, newest first, with their runs."""
    with tempfile.TemporaryDirectory() as tmpdir:
        parquet_path = os.path.join(tmpdir, "documents.parquet")
        if not _download_parquet(user_id, parquet_path):
            return []

        con = duckdb.connect()
        result = con.execute(
            f"""
            SELECT id, filename, s3_key, runs, created_at
            FROM read_parquet('{parquet_path}')
            ORDER BY created_at DESC
            """
        ).fetchall()
        con.close()

        documents = []
        for row in result:
            created_at = row[4]
            if hasattr(created_at, "isoformat"):
                created_at = created_at.isoformat() + "Z"
            try:
                runs = json.loads(row[3]) if row[3] else []
            except (ValueError, TypeError):
                runs = []
            documents.append(
                {
                    "id": row[0],
                    "filename": row[1],
                    "s3Key": row[2],
                    "runs": runs,
                    "createdAt": str(created_at),
                }
            )
        return documents


def delete_document(user_id: str, document_id: str):
    """Delete a document (and all its run metadata)."""
    with tempfile.TemporaryDirectory() as tmpdir:
        parquet_path = os.path.join(tmpdir, "documents.parquet")
        if not _download_parquet(user_id, parquet_path):
            return

        con = duckdb.connect()
        con.execute(
            f"CREATE TABLE documents AS SELECT * FROM read_parquet('{parquet_path}')"
        )
        con.execute("DELETE FROM documents WHERE id = ?", [document_id])
        con.execute(f"COPY documents TO '{parquet_path}' (FORMAT PARQUET)")
        con.close()
        _upload_parquet(user_id, parquet_path)


def delete_run(user_id: str, document_id: str, model: str):
    """Remove a single run (by model) from a document, keeping the document."""
    with tempfile.TemporaryDirectory() as tmpdir:
        parquet_path = os.path.join(tmpdir, "documents.parquet")
        if not _download_parquet(user_id, parquet_path):
            return

        con = duckdb.connect()
        con.execute(
            f"CREATE TABLE documents AS SELECT * FROM read_parquet('{parquet_path}')"
        )
        runs = _get_runs(con, document_id)
        runs = [r for r in runs if r.get("model") != model]
        con.execute(
            "UPDATE documents SET runs = ?, updated_at = ? WHERE id = ?",
            [json.dumps(runs), _now(), document_id],
        )
        con.execute(f"COPY documents TO '{parquet_path}' (FORMAT PARQUET)")
        con.close()
        _upload_parquet(user_id, parquet_path)
