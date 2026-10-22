#!/usr/bin/env python3
"""Replay baseline.sql in an isolated local PostgreSQL cluster; never uses a remote URL."""

import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "supabase/baseline"
SNAPSHOT = json.loads((BASE / "20261022-live-catalog.json").read_text())
OUTPUT = BASE / "20261022-local-parity-result.json"
ENV = {key: value for key, value in os.environ.items() if not key.startswith("PG")}
ENV["PGCONNECT_TIMEOUT"] = "5"

# These stubs support catalog reconstruction only, not Supabase runtime/auth/storage testing.
STUB_SQL = """
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE ROLE supabase_admin;
CREATE ROLE supabase_storage_admin;
CREATE SCHEMA auth;
CREATE SCHEMA storage AUTHORIZATION supabase_admin;
CREATE TYPE storage.buckettype AS ENUM ('STANDARD', 'ANALYTICS', 'VECTOR');
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT parts[1:array_length(parts, 1)-1]
  FROM (SELECT string_to_array($1, '/') AS parts) split
$$;
CREATE TABLE storage.buckets (
  id text PRIMARY KEY, name text NOT NULL, owner uuid,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
  public boolean DEFAULT false, avif_autodetection boolean DEFAULT false,
  file_size_limit bigint, allowed_mime_types text[], owner_id text,
  type storage.buckettype NOT NULL DEFAULT 'STANDARD',
  versioning_status text NOT NULL DEFAULT 'DISABLED',
  lifecycle_configuration jsonb, lifecycle_configuration_generation uuid
);
CREATE TABLE storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text
);
ALTER TABLE storage.buckets OWNER TO supabase_storage_admin;
ALTER TABLE storage.objects OWNER TO supabase_storage_admin;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
"""


def run(command, **kwargs):
    return subprocess.run(
        command, cwd=ROOT, env=ENV, text=True, capture_output=True, check=True, **kwargs
    ).stdout.strip()


def canonical(rows):
    return sorted(json.dumps(row, sort_keys=True, separators=(",", ":")) for row in rows)


def acl_rows(rows, object_key, output_key, privilege_key="privilege_type"):
    result = []
    for row in rows:
        for privilege in row[privilege_key].split(","):
            result.append({
                output_key: row[object_key],
                "grantee": row["grantee"],
                "grantor": row["grantor"],
                "privilege": privilege.strip(),
                "grantable": row.get("grantable", row.get("is_grantable", False)),
            })
    return result


def expected_difference(name, major, operator=False):
    """Only normalize explicit platform omissions and the known PG16/17 differences."""
    public = SNAPSHOT["public"]
    storage = SNAPSHOT["storage"]
    if name == "public_table_acl":
        raw = acl_rows(public["table_acl"], "table_name", "table", "privileges")
        return raw, [row for row in raw if major >= 17 or row["privilege"] != "MAINTAIN"], (
            "PostgreSQL 16 has no MAINTAIN privilege: the 17 captured MAINTAIN grants are conditionally omitted."
        )
    if name == "storage_objects_acl":
        raw = acl_rows(storage["objects_acl"], "table_name", "table")
        if not operator:
            return raw, [], "Platform-owned storage.objects ACL restoration is operator-only; the minimal local stub has no captured-principal grants."
        return raw, [row for row in raw if major >= 17 or row["privilege"] != "MAINTAIN"], (
            "PostgreSQL 16 has no MAINTAIN privilege: the one captured MAINTAIN grant is conditionally omitted."
        )
    if name == "public_default_acl":
        raw = [{
            "creator": row["creator_role"], "schema": row["schema_name"],
            "object_kind": row["object_kind"], "grantee": row["grantee"],
            "privilege": row["privilege_type"], "grantable": row["grantable"],
        } for row in public["default_acl"]]
        return raw, [
            row for row in raw
            if (operator or row["creator"] == "postgres") and (major >= 17 or row["privilege"] != "MAINTAIN")
        ], (
            "supabase_admin defaults are operator-only; baseline retains postgres defaults. "
            + ("PostgreSQL 16 also omits MAINTAIN (two postgres default grants; six with operator restoration)."
               if major == 16 else "PostgreSQL 17 preserves the captured MAINTAIN grants.")
        )
    if name in ("public_schema_acl", "storage_schema_acl"):
        entries = public["schema_acl"] if name == "public_schema_acl" else storage["schema_acl"]
        raw = [{
            "grantee": row["grantee"], "grantor": row["grantor"],
            "privilege": row["privilege_type"], "grantable": row.get("grantable", row.get("is_grantable", False)),
        } for row in entries]
        assert not operator, "Operator schema ACLs should match exactly"
        expected = [row for row in raw if row["grantee"] == "PUBLIC"] if name == "public_schema_acl" else []
        return raw, expected, (
            "Schema ACL restoration is operator-only. Local public retains its PostgreSQL default PUBLIC USAGE; "
            "the minimal Storage schema stub has no captured-principal grants. Real hosted defaults are not inferred."
        )
    if name == "event_triggers":
        def convert(row):
            return {
                "name": row["trigger_name"], "event": row["event"], "tags": row["tags"],
                "enabled": row["enabled"], "function": row["function_identity"], "owner": row["owner"],
            }
        raw = [convert(row) for row in public["event_triggers"]]
        expected = [convert(row) for row in public["event_triggers"] if row["origin"] != "Supabase-managed"] if operator else []
        return raw, expected, (
            "Six Supabase-managed event triggers are not recreated. ensure_rls creation is operator-only "
            "because hosted event-trigger authority is unverified."
        )
    if name == "extensions":
        raw = [{key: row[key] for key in ("name", "version", "schema")} for row in public["extensions"]]
        expected = []
        for row in raw:
            if row["name"] == "supabase_vault":
                continue
            copy = dict(row)
            if major == 16 and row["name"] == "pg_stat_statements":
                copy["version"] = "1.10"
            expected.append(copy)
        return raw, expected, (
            "supabase_vault 0.3.1 is Supabase-managed and omitted. "
            + ("Local PostgreSQL 16 supplies pg_stat_statements 1.10 rather than live PostgreSQL 17's 1.11."
               if major == 16 else "All remaining extension versions match on PostgreSQL 17.")
        )
    if name == "storage_objects_triggers":
        raw = [{
            "table": "objects", "name": row["trigger_name"], "enabled": row["enabled_state"],
            "definition": row["definition"], "function": row["function_identity"],
        } for row in storage["objects_triggers"]]
        return raw, [], "The two Supabase-managed storage.objects triggers and their platform functions are deliberately omitted."
    raise AssertionError(f"Unexplained fingerprint difference in {name}")


run(["python3", "scripts/generate-supabase-baseline.py", "--check"])
baseline_text = (BASE / "baseline.sql").read_text()
assert SNAPSHOT["meta"]["project_ref"] not in baseline_text
assert 'ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin"' not in baseline_text
assert not re.search(r"(?:GRANT|REVOKE).* ON (?:SCHEMA storage|TABLE storage\.objects)", baseline_text)
fingerprint_sql = (BASE / "fingerprint.sql").read_text()
queries = re.findall(r"-- CLASS: (\w+)\n(.*?)(?=\n-- CLASS:|\Z)", fingerprint_sql, re.S)
assert len(queries) == len(SNAPSHOT["fingerprints"]) == 24
live = {row["class"]: row for row in SNAPSHOT["fingerprints"]}
results = []
atomic_sections = []
with tempfile.TemporaryDirectory(prefix="amodka-baseline-") as directory:
    directory = Path(directory)
    data = directory / "data"
    port = "55439"
    run(["initdb", "-D", str(data), "--username=postgres", "--auth=trust", "--no-sync", "--locale=C"])
    started = False
    try:
        # A separate log is essential: the daemon must not inherit captured child-process pipes.
        run(["pg_ctl", "-D", str(data), "-o", f"-k {directory} -p {port} -c listen_addresses=''",
             "-l", str(directory / "postgres.log"), "-w", "start"])
        started = True
        command = ["psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-h", str(directory),
                   "-p", port, "-U", "postgres", "-d", "postgres"]
        run(command + ["-c", STUB_SQL])
        version = run(command + ["-c", "SELECT current_setting('server_version');"])
        major = int(version.split(".")[0])
        assert major in (16, 17), f"Only the documented PostgreSQL 16/17 comparison is supported, got {version}"

        def all_fingerprints():
            return [json.loads(line) for line in run(command + ["-f", str(BASE / "fingerprint.sql")]).splitlines()]

        sections = re.findall(
            r"-- BEGIN SECTION: ([\w-]+)\n(.*?)-- END SECTION",
            (BASE / "baseline.sql").read_text(), re.S,
        )
        assert [name for name, _ in sections] == [
            "01-tables", "02-functions", "03-constraints", "04-policies", "05-acls", "06-storage",
        ]
        for name, sql in sections:
            extracted = run(["python3", "scripts/generate-supabase-baseline.py", "--section", name])
            assert extracted.split(f"-- BEGIN SECTION: {name}\n", 1)[1].split("-- END SECTION")[0] == sql
            before = all_fingerprints()
            assert sql.rstrip().endswith("COMMIT;")
            failure_sql = sql.rstrip()[:-len("COMMIT;")] + "SELECT 1 / 0;\nCOMMIT;"
            failed = subprocess.run(command + ["-f", "-"], input=failure_sql, cwd=ROOT, env=ENV,
                                    text=True, capture_output=True)
            assert failed.returncode != 0 and "division by zero" in failed.stderr, failed.stderr
            assert all_fingerprints() == before, f"Section {name} did not roll back atomically"
            run(command + ["-f", "-"], input=sql)
            if name in ("01-tables", "02-functions", "03-constraints", "04-policies"):
                current = {row["class"]: row["count"] for row in all_fingerprints()}
                assert current["public_table_acl"] == 0
                assert current["public_sequence_acl"] == 0
                assert current["public_function_acl"] == 0
            atomic_sections.append({"section": name, "rollback_fault_injection": "passed", "standalone_apply": "passed"})

        def compare(operator=False):
            compared = []
            for name, sql in queries:
                local = json.loads(run(command + ["-c", sql.strip()]))
                expected = live[name]
                matches = local == expected
                result = {"class": name, "live": expected, "local": local, "exact_match": matches}
                if not matches:
                    raw, normalized, reason = expected_difference(name, major, operator)
                    row_sql = sql.split(", agg AS (", 1)[0] + (
                        ' SELECT coalesce(jsonb_agg(obj ORDER BY obj::text COLLATE "C"), \'[]\'::jsonb) FROM rows;'
                    )
                    actual_rows = json.loads(run(command + ["-c", row_sql]))
                    assert canonical(normalized) == canonical(actual_rows), f"Unexplained rows in {name}"
                    result["explanation"] = reason
                    result["documented_normalization_matches"] = True
                    result["missing_live_rows"] = [row for row in raw if row not in actual_rows]
                    result["local_only_rows"] = [row for row in actual_rows if row not in raw]
                compared.append(result)
                print(f"{'operator-inclusive' if operator else 'baseline-only'} {name}: "
                      f"{'EXACT' if matches else 'EXPLAINED DIFFERENCE'} ({local['count']}/{expected['count']})")
            return compared

        results = compare()
        # Operator SQL is validated only in this disposable local superuser environment.
        run(command + ["-f", str(BASE / "operator-only.sql")])
        operator_results = compare(operator=True)

        # The file must refuse a non-empty application schema rather than overwrite it.
        rerun = subprocess.run(command + ["-f", str(BASE / "baseline.sql")], cwd=ROOT, env=ENV,
                               text=True, capture_output=True)
        assert rerun.returncode != 0 and "Baseline requires an EMPTY" in rerun.stderr
        assert len(results) == 24
    finally:
        if started:
            run(["pg_ctl", "-D", str(data), "-m", "immediate", "-w", "stop"])

result = {
    "tested_at_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "source_project_ref": SNAPSHOT["meta"]["project_ref"],
    "source_postgres_version": SNAPSHOT["meta"]["postgres_version"],
    "local_postgres_version": version,
    "connection": "disposable local Unix socket only; TCP disabled; no remote URL accepted",
    "bootstrap": "Minimal local Supabase roles, auth.uid/auth.users and storage tables/functions; no customer rows.",
    "baseline_sha256": hashlib.sha256((BASE / "baseline.sql").read_bytes()).hexdigest(),
    "operator_only_sha256": hashlib.sha256((BASE / "operator-only.sql").read_bytes()).hexdigest(),
    "manifest_sha256": hashlib.sha256((BASE / "20261022-live-catalog.json").read_bytes()).hexdigest(),
    "fingerprint_sql_sha256": hashlib.sha256((BASE / "fingerprint.sql").read_bytes()).hexdigest(),
    "exact_classes": sum(row["exact_match"] for row in results),
    "explained_difference_classes": sum(not row["exact_match"] for row in results),
    "unexplained_difference_classes": 0,
    "nonempty_target_guard": "passed",
    "section_atomicity_tests": atomic_sections,
    "fail_closed_table_sequence_function_boundaries": "passed",
    "operator_only_local_verification": {
        "scope": "Disposable local superuser only; NOT evidence of hosted permission or approval to apply.",
        "exact_classes": sum(row["exact_match"] for row in operator_results),
        "explained_difference_classes": sum(not row["exact_match"] for row in operator_results),
        "unexplained_difference_classes": 0,
        "classes": operator_results,
    },
    "temporary_cluster": "stopped and removed",
    "classes": results,
}
OUTPUT.write_text(json.dumps(result, indent=2) + "\n")
print(f"Wrote {OUTPUT.relative_to(ROOT)}; no live Supabase connection was used.")
