#!/usr/bin/env python3
"""Generate the schema-only SQL baseline from the checked-in catalog snapshot."""

import argparse
import json
import sys
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--check", action="store_true", help="Fail if baseline.sql differs from deterministic output.")
parser.add_argument("--section", help="Print one named transactional section without writing files.")
args = parser.parse_args()
ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "supabase/baseline/20261022-live-catalog.json"
OUTPUT = ROOT / "supabase/baseline/baseline.sql"
OPERATOR_OUTPUT = ROOT / "supabase/baseline/operator-only.sql"
DATA = json.loads(MANIFEST.read_text())
PUBLIC = DATA["public"]
STORAGE = DATA["storage"]
if PUBLIC["views"] or PUBLIC["types"]:
    raise SystemExit("This snapshot generator requires the captured empty public views/types inventories.")
lines = []
baseline_sections = {}
operator_sections = {}


def add(text=""):
    lines.append(text)


def section(name, operator=False):
    global lines
    sections = operator_sections if operator else baseline_sections
    if name in sections:
        lines = sections[name]
        return
    sections[name] = []
    lines = sections[name]
    add(f"-- BEGIN SECTION: {name}")
    add("BEGIN;")
    # pg_catalog remains implicitly first, avoiding pgcrypto/core UUID binding drift.
    add("SET LOCAL search_path = public, extensions, storage, auth;")


def comment_origin(origin):
    if any(marker in origin.lower() for marker in ("unknown", "not established", "no repo migration")):
        return f"-- ORIGIN: MANUAL/UNKNOWN — {origin}"
    if origin.startswith("supabase/migrations/"):
        return f"-- ORIGIN: {origin}"
    return f"-- ORIGIN: {origin}"


def ident(value):
    return '"' + value.replace('"', '""') + '"'


def literal(value):
    return "'" + value.replace("'", "''") + "'"


def grantee(name):
    return "PUBLIC" if name == "PUBLIC" else ident(name)


def grant_option(grantable):
    return " WITH GRANT OPTION" if grantable else ""


def privilege_sql(privilege, object_sql, roles, grantable=False, revoke=False):
    """MAINTAIN was introduced in PostgreSQL 17; guard it with dynamic SQL."""
    if privilege == "MAINTAIN":
        statement = (
            f"REVOKE MAINTAIN ON {object_sql} FROM {roles};"
            if revoke
            else f"GRANT MAINTAIN ON {object_sql} TO {roles}{grant_option(grantable)};"
        )
        add(
            "DO $baseline$\n"
            "BEGIN\n"
            "  IF current_setting('server_version_num')::integer >= 170000 THEN\n"
            f"    EXECUTE {literal(statement)};\n"
            "  END IF;\n"
            "END\n"
            "$baseline$;"
        )
    else:
        statement = (
            f"REVOKE {privilege} ON {object_sql} FROM {roles};"
            if revoke
            else f"GRANT {privilege} ON {object_sql} TO {roles}{grant_option(grantable)};"
        )
        add(statement)


def acl_lines(entries, key, object_sql, principals, privilege_key="privilege_type"):
    grouped = {}
    for row in entries:
        if row[key] not in principals:
            continue
        grouped.setdefault((row[key], row.get("grantable", row.get("is_grantable", False))), []).extend(
            privilege.strip() for privilege in row[privilege_key].split(",")
        )
    for role in principals:
        add(f"REVOKE ALL PRIVILEGES ON {object_sql} FROM {grantee(role)};")
    for (role, is_grantable), privileges in sorted(grouped.items()):
        for privilege in sorted(set(privileges)):
            privilege_sql(
                privilege,
                object_sql,
                grantee(role),
                grantable=is_grantable,
            )


def policy_sql(policy, table_sql, origin):
    add(comment_origin(origin))
    roles = ", ".join(
        "PUBLIC" if role.strip() == "public" else ident(role.strip())
        for role in policy["roles"].strip("{}").split(",")
    )
    sql = (
        f"CREATE POLICY {ident(policy['policyname'])} ON {table_sql}\n"
        f"  AS {policy['permissive']}\n"
        f"  FOR {policy['cmd']}\n"
        f"  TO {roles}"
    )
    if policy.get("qual"):
        sql += f"\n  USING ({policy['qual']})"
    if policy.get("with_check"):
        sql += f"\n  WITH CHECK ({policy['with_check']})"
    add(sql + ";")


meta = DATA["meta"]
add("-- GENERATED FILE: do not edit; run python3 scripts/generate-supabase-baseline.py")
add("-- Generated from a captured snapshot; schema only; NEVER APPLY TO PRODUCTION.")
add(f"-- Snapshot date: {meta['captured_on']}; exact catalog query time was not recorded.")
add(f"-- Snapshot artifact mtime (UTC, not query time): {meta.get('snapshot_artifact_timestamp_utc', 'not recorded')}")
add(f"-- Source PostgreSQL version: {meta['postgres_version']}; MAINTAIN is emitted conditionally for PG17+.")
add("-- Requires a Supabase-initialized target with platform roles, auth.uid(), storage schema/tables,")
add("-- and any platform-managed extensions already provisioned. This is not a Supabase bootstrap.")
add("-- Captured ACL scope is the principals stored in the manifest; it does not reconstruct role memberships.")
add("-- Apply sections in numeric order, each on its own connection with ON_ERROR_STOP=1.")
add("-- Each section is atomic; earlier successful sections remain if a later section fails.")
add("-- Keep the project unused until all required sections and verification complete.")
add("-- Extract one section: python3 scripts/generate-supabase-baseline.py --section 01-tables")
add("-- Hosted Storage permissions are NOT verified: 06-storage is isolated and optional pending operator review.")
add("-- Privileged snapshot restoration is separate in operator-only.sql, never an automatic prerequisite.")
header = "\n".join(lines) + "\n\n"
add("")
section("01-tables")
add(
    "DO $baseline$\nBEGIN\n"
    "  IF EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n "
    "ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')) THEN\n"
    "    RAISE EXCEPTION 'Baseline requires an EMPTY public application schema; never use on production';\n"
    "  END IF;\nEND\n$baseline$;"
)
add("")

add("-- Extensions: manual/unknown provenance is retained as comments. Platform-managed extensions are skipped.")
add("CREATE SCHEMA IF NOT EXISTS extensions;")
managed_extensions = []
for ext in sorted(PUBLIC["extensions"], key=lambda row: row["name"]):
    origin = ext["origin"]
    if ext["name"] in {"plpgsql", "supabase_vault"}:
        add(comment_origin(origin))
        add(f"-- SKIPPED platform-managed extension: {ext['name']} (captured version {ext['version']})")
        managed_extensions.append(ext)
        continue
    add(comment_origin(origin))
    add(f"-- Captured extension version {ext['version']}; install the target PostgreSQL distribution's available version.")
    add(f"CREATE EXTENSION IF NOT EXISTS {ident(ext['name'])} WITH SCHEMA {ident(ext['schema'])};")
add("-- Skipped Supabase/platform-managed extensions: " + ", ".join(
    f"{item['name']} ({item['version']})" for item in managed_extensions
))
add("")

add("-- Tables and columns")
for table in sorted(PUBLIC["tables"], key=lambda row: row["name"]):
    add(comment_origin(table["origin"]))
    column_sql = []
    sequences = {
        (seq["owned_table"], seq["owned_column"]): seq
        for seq in PUBLIC["sequences"]
        if seq.get("owned_table")
    }
    for column in sorted(table["columns"], key=lambda row: row["position"]):
        name = ident(column["column_name"])
        definition = f"{name} {column['data_type']}"
        if column["identity_kind"]:
            sequence = sequences.get((table["name"], column["column_name"]))
            mode = "ALWAYS" if column["identity_kind"] == "a" else "BY DEFAULT"
            options = ""
            if sequence:
                cycle = "CYCLE" if sequence["cycle"] else "NO CYCLE"
                options = (
                    f" (START WITH {sequence['start_value']} INCREMENT BY {sequence['increment_by']}"
                    f" MINVALUE {sequence['min_value']} MAXVALUE {sequence['max_value']}"
                    f" CACHE {sequence['cache_size']} {cycle})"
                )
            definition += f" GENERATED {mode} AS IDENTITY{options}"
        elif column["generated_kind"] and column["default_expr"]:
            definition += f" GENERATED ALWAYS AS ({column['default_expr']}) STORED"
        elif column["default_expr"] is not None:
            definition += f" DEFAULT {column['default_expr']}"
        if column["not_null"]:
            definition += " NOT NULL"
        column_sql.append("  " + definition)
    add(f"CREATE TABLE public.{ident(table['name'])} (\n" + ",\n".join(column_sql) + "\n);")
    add(f"ALTER TABLE public.{ident(table['name'])} OWNER TO {ident(table['owner'])};")
    # Fail closed across section boundaries, regardless of the target's inherited defaults.
    add(f"ALTER TABLE public.{ident(table['name'])} ENABLE ROW LEVEL SECURITY;")
    add(f"REVOKE ALL PRIVILEGES ON TABLE public.{ident(table['name'])} FROM PUBLIC, anon, authenticated, service_role;")
for sequence in PUBLIC["sequences"]:
    add(f"REVOKE ALL PRIVILEGES ON SEQUENCE public.{ident(sequence['sequence_name'])} FROM PUBLIC, anon, authenticated, service_role;")
add("")

section("02-functions")
add("-- Public functions; full captured CREATE definitions, ownership, security mode and search_path.")
for function in sorted(PUBLIC["functions"], key=lambda row: row["identity"]):
    add(comment_origin(function["origin"]))
    definition = function["definition"].rstrip()
    add(definition if definition.endswith(";") else definition + ";")
    add(
        f"ALTER FUNCTION public.{function['identity']} OWNER TO {ident(function['owner'])};"
    )
    add(f"REVOKE ALL PRIVILEGES ON FUNCTION public.{function['identity']} FROM PUBLIC, anon, authenticated, service_role;")
add("")

section("03-constraints")
add("-- Primary, unique and check constraints")
for table in sorted(PUBLIC["tables"], key=lambda row: row["name"]):
    for constraint in sorted(table["constraints"], key=lambda row: row["constraint_name"]):
        if constraint["kind"] == "f":
            continue
        add(comment_origin(constraint["origin"]))
        suffix = ""
        if constraint["deferrable"]:
            suffix = " DEFERRABLE"
            if constraint["initially_deferred"]:
                suffix += " INITIALLY DEFERRED"
            else:
                suffix += " INITIALLY IMMEDIATE"
        if not constraint["validated"] and constraint["kind"] == "c":
            suffix += " NOT VALID"
        add(
            f"ALTER TABLE public.{ident(table['name'])} ADD CONSTRAINT "
            f"{ident(constraint['constraint_name'])} {constraint['definition']}{suffix};"
        )
add("")

add("-- Standalone indexes; constraint-backed indexes are created with their constraints.")
for table in sorted(PUBLIC["tables"], key=lambda row: row["name"]):
    constraint_indexes = {
        constraint["constraint_name"]
        for constraint in table["constraints"]
        if constraint["kind"] in {"p", "u"}
    }
    for index in sorted(table["indexes"], key=lambda row: row["index_name"]):
        if index["index_name"] in constraint_indexes:
            add(comment_origin(index["origin"]))
            add(f"-- Implicit constraint-backed index: public.{index['index_name']}")
            continue
        add(comment_origin(index["origin"]))
        add(index["definition"] + ";")
add("")

add("-- Foreign keys are created after standalone unique indexes they may reference.")
for table in sorted(PUBLIC["tables"], key=lambda row: row["name"]):
    for constraint in sorted(table["constraints"], key=lambda row: row["constraint_name"]):
        if constraint["kind"] != "f":
            continue
        add(comment_origin(constraint["origin"]))
        suffix = ""
        if constraint["deferrable"]:
            suffix = " DEFERRABLE"
            suffix += " INITIALLY DEFERRED" if constraint["initially_deferred"] else " INITIALLY IMMEDIATE"
        add(
            f"ALTER TABLE public.{ident(table['name'])} ADD CONSTRAINT "
            f"{ident(constraint['constraint_name'])} {constraint['definition']}{suffix};"
        )
add("")

section("04-policies")
add("-- Final RLS flags, public policies and table triggers")
for table in sorted(PUBLIC["tables"], key=lambda row: row["name"]):
    if table["rls"]:
        add(f"ALTER TABLE public.{ident(table['name'])} ENABLE ROW LEVEL SECURITY;")
    if table["force"]:
        add(f"ALTER TABLE public.{ident(table['name'])} FORCE ROW LEVEL SECURITY;")
    else:
        add(f"ALTER TABLE public.{ident(table['name'])} NO FORCE ROW LEVEL SECURITY;")
    for policy in sorted(table["policies"], key=lambda row: row["policyname"]):
        policy_sql(policy, f"public.{ident(table['name'])}", policy["origin"])
for trigger in sorted(PUBLIC["triggers"], key=lambda row: (row["table_name"], row["trigger_name"])):
    add(comment_origin(trigger["origin"]))
    add(trigger["definition"] + ";")
add("")

section("05-acls")
add("-- Public table and column ACLs. Revoke captured-principal grants first, then restore captured grants.")
acl_roles = ["PUBLIC", "anon", "authenticated", "service_role"]
table_acl_by_name = {}
for entry in PUBLIC["table_acl"]:
    table_acl_by_name.setdefault(entry["table_name"], []).append(entry)
for table in sorted(PUBLIC["tables"], key=lambda row: row["name"]):
    table_sql = f"TABLE public.{ident(table['name'])}"
    add(comment_origin("live ACL state; exact source migration not established"))
    acl_lines(table_acl_by_name.get(table["name"], []), "grantee", table_sql, acl_roles, "privileges")
    columns = {}
    for entry in PUBLIC["column_acl"]:
        if entry["table_name"] == table["name"]:
            columns.setdefault(entry["column_name"], []).append(entry)
    for column, entries in sorted(columns.items()):
        object_sql = f"({ident(column)}) ON TABLE public.{ident(table['name'])}"
        for role in acl_roles:
            add(f"REVOKE ALL PRIVILEGES {object_sql} FROM {grantee(role)};")
        grouped = {}
        for entry in entries:
            grouped.setdefault((entry["grantee"], entry["grantable"]), []).append(entry["privilege_type"])
        for (role, is_grantable), privileges in sorted(grouped.items()):
            for privilege in sorted(set(privileges)):
                add(
                    f"GRANT {privilege} {object_sql} TO {grantee(role)}"
                    f"{grant_option(is_grantable)};"
                )
add("")

add("-- Public function ACLs; default PUBLIC EXECUTE is removed unless it was captured.")
for function in sorted(PUBLIC["functions"], key=lambda row: row["identity"]):
    add(comment_origin("live ACL state; exact source migration not established"))
    entries = [
        row for row in PUBLIC["function_acl"]
        if row["function_identity"] == function["identity"]
    ]
    acl_lines(entries, "grantee", f"FUNCTION public.{function['identity']}", acl_roles, "privileges")
add("")

add("-- Public sequence settings and ACLs (identity sequences are created by their IDENTITY columns).")
for sequence in sorted(PUBLIC["sequences"], key=lambda row: row["sequence_name"]):
    add(comment_origin(sequence["origin"]))
    add(
        f"ALTER SEQUENCE public.{ident(sequence['sequence_name'])} OWNER TO "
        f"{ident(sequence['owner'])};"
    )
    entries = [row for row in PUBLIC["sequence_acl"] if row["sequence_name"] == sequence["sequence_name"]]
    acl_lines(
        entries,
        "grantee",
        f"SEQUENCE public.{ident(sequence['sequence_name'])}",
        acl_roles,
    )
add("")

section("operator-02-public-schema-acls", operator=True)
add("-- Public schema ACL: snapshot grantor is pg_database_owner; hosted authority is unverified.")
schema_roles = sorted({row["grantee"] for row in PUBLIC["schema_acl"]} | {"PUBLIC", "anon", "authenticated", "service_role"})
for role in schema_roles:
    add(f"REVOKE ALL PRIVILEGES ON SCHEMA public FROM {grantee(role)};")
for row in sorted(PUBLIC["schema_acl"], key=lambda item: (item["grantee"], item["privilege_type"])):
    add(comment_origin(row["origin"]))
    add(
        f"GRANT {row['privilege_type']} ON SCHEMA public TO {grantee(row['grantee'])}"
        f"{grant_option(row['grantable'])};"
    )
add("")

section("05-acls")
add("-- Schema-scoped default ACLs for captured creator roles.")
default_roles = sorted({row["creator_role"] for row in PUBLIC["default_acl"]})
for creator in default_roles:
    if creator == "supabase_admin":
        section("operator-01-admin-defaults", operator=True)
    add(f"-- Captured defaults for creator role {creator}.")
    add("-- ORIGIN: MANUAL/UNKNOWN — platform or role-level default configuration; no repo migration source.")
    for code, target in [("r", "TABLES"), ("S", "SEQUENCES"), ("f", "FUNCTIONS")]:
        rows = [
            row for row in PUBLIC["default_acl"]
            if row["creator_role"] == creator and row["object_kind"] == code
        ]
        roles = sorted({row["grantee"] for row in rows} | {"PUBLIC", "anon", "authenticated", "service_role", "postgres"})
        add(
            f"ALTER DEFAULT PRIVILEGES FOR ROLE {ident(creator)} IN SCHEMA public "
            f"REVOKE ALL ON {target} FROM " + ", ".join(grantee(role) for role in roles) + ";"
        )
        grouped = {}
        for row in rows:
            grouped.setdefault((row["grantee"], row["grantable"]), []).append(row["privilege_type"])
        for (role, is_grantable), privileges in sorted(grouped.items()):
            for privilege in sorted(set(privileges)):
                if privilege == "MAINTAIN":
                    statement = (
                        f"ALTER DEFAULT PRIVILEGES FOR ROLE {ident(creator)} IN SCHEMA public "
                        f"GRANT MAINTAIN ON TABLES TO {grantee(role)}{grant_option(is_grantable)};"
                    )
                    add(
                        "DO $baseline$\nBEGIN\n"
                        "  IF current_setting('server_version_num')::integer >= 170000 THEN\n"
                        f"    EXECUTE {literal(statement)};\n"
                        "  END IF;\nEND\n$baseline$;"
                    )
                else:
                    add(
                        f"ALTER DEFAULT PRIVILEGES FOR ROLE {ident(creator)} IN SCHEMA public "
                        f"GRANT {privilege} ON {target} TO {grantee(role)}"
                        f"{grant_option(is_grantable)};"
                    )
add("")

section("06-storage")
add("-- HOSTED PERMISSIONS UNVERIFIED: apply this section independently only after operator verification.")
add("-- Supabase Storage prerequisite: storage schema, storage.objects and storage.buckets are platform-managed.")
add("-- Bucket rows are captured app configuration and are inserted/upserted here.")
add("-- ORIGIN: MANUAL/UNKNOWN — bucket configuration was not found in reviewed repo migrations.")
for bucket in sorted(STORAGE["buckets"], key=lambda row: row["id"]):
    add(
        "INSERT INTO storage.buckets "
        "(id, name, public, avif_autodetection, file_size_limit, allowed_mime_types, type, "
        "versioning_status, lifecycle_configuration) VALUES ("
        + ", ".join([
            literal(bucket["id"]),
            literal(bucket["name"]),
            str(bucket["public"]).lower(),
            str(bucket["avif_autodetection"]).lower(),
            "NULL" if bucket["file_size_limit"] is None else str(bucket["file_size_limit"]),
            "NULL" if bucket["allowed_mime_types"] is None else literal(bucket["allowed_mime_types"]),
            "storage.buckettype" + literal(bucket["type"]),
            literal(bucket["versioning_status"]),
            "NULL" if bucket["lifecycle_configuration"] is None else literal(json.dumps(bucket["lifecycle_configuration"])),
        ])
        + ") ON CONFLICT (id) DO UPDATE SET "
        "name = EXCLUDED.name, public = EXCLUDED.public, "
        "avif_autodetection = EXCLUDED.avif_autodetection, "
        "file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types, "
        "type = EXCLUDED.type, versioning_status = EXCLUDED.versioning_status, "
        "lifecycle_configuration = EXCLUDED.lifecycle_configuration;"
    )
add("")

section("operator-03-storage-acls", operator=True)
add("-- Requires platform object ownership/authorised grant authority; not verified for hosted postgres.")
add("-- Storage schema ACL and storage.objects ACL (platform-managed relations are not created here).")
storage_roles = ["PUBLIC", "anon", "authenticated", "service_role"]
for role in storage_roles:
    add(f"REVOKE ALL PRIVILEGES ON SCHEMA storage FROM {grantee(role)};")
for row in sorted(STORAGE["schema_acl"], key=lambda item: (item["grantee"], item["privilege_type"])):
    add(comment_origin(row["origin"]))
    add(f"GRANT {row['privilege_type']} ON SCHEMA storage TO {grantee(row['grantee'])};")
acl_lines(
    STORAGE["objects_acl"],
    "grantee",
    "TABLE storage.objects",
    storage_roles,
    "privilege_type",
)
add("")

section("06-storage")
add("-- Storage object policies; storage.objects and auth.uid() must already exist.")
for policy in sorted(STORAGE["objects_policies"], key=lambda row: row["policyname"]):
    policy_sql(policy, "storage.objects", policy["origin"])
add("")

section("operator-04-event-trigger", operator=True)
add("-- CREATE EVENT TRIGGER requires superuser or equivalent platform-authorised capability; hosted execution unverified.")
add("-- Manual/unknown event trigger; Supabase-managed event triggers are listed but not recreated.")
managed_events = []
for trigger in PUBLIC["event_triggers"]:
    if trigger["origin"] == "Supabase-managed":
        managed_events.append(trigger["trigger_name"])
        continue
    add(comment_origin(trigger["origin"]))
    tags = ", ".join(literal(tag) for tag in (trigger["tags"] or []))
    sql = (
        f"CREATE EVENT TRIGGER {ident(trigger['trigger_name'])} ON {trigger['event']}"
    )
    if tags:
        sql += f" WHEN TAG IN ({tags})"
    sql += f" EXECUTE FUNCTION public.{trigger['function_identity']}"
    add(sql + ";")
    add(f"ALTER EVENT TRIGGER {ident(trigger['trigger_name'])} OWNER TO {ident(trigger['owner'])};")
    if trigger["enabled"] != "O":
        add(f"ALTER EVENT TRIGGER {ident(trigger['trigger_name'])} DISABLE;")
add("-- Skipped Supabase-managed event triggers: " + ", ".join(managed_events))
add("")

add("-- Other skipped Supabase-managed objects recorded in the snapshot:")
add("-- auth.users, storage.objects, storage.buckets relation definitions and storage.objects triggers.")
for trigger in STORAGE["objects_triggers"]:
    add(f"-- SKIPPED Supabase-managed trigger: storage.objects.{trigger['trigger_name']} -> {trigger['function_identity']}")
for trigger in PUBLIC["event_triggers"]:
    if trigger["origin"] == "Supabase-managed":
        add(f"-- SKIPPED platform function implementation referenced by {trigger['trigger_name']}: {trigger['function_identity']}")
add("-- Non-public Supabase-managed function definitions and platform schema internals are not in this baseline.")
add("-- Public views/materialized views and public custom types: none captured.")

def render_section(body):
    return "\n".join(body) + "\nCOMMIT;\n-- END SECTION\n"


operator_header = (
    "-- GENERATED OPERATOR-ONLY SNAPSHOT RESTORATION; schema only; NEVER APPLY TO PRODUCTION.\n"
    "-- Manual review only. NOT automatically required for a new Supabase project, which has its own defaults.\n"
    "-- Only a Supabase-authorised administrator with authority over supabase_admin defaults,\n"
    "-- public/Storage schema ownership, Storage object grants and event triggers can run corresponding sections.\n"
    "-- Ordinary hosted postgres authority is NOT established; never bypass this role boundary.\n"
    "-- Broad captured grants are reproduced as historical evidence, not recommended new defaults.\n"
    "-- Each named section is independently transactional. Use ON_ERROR_STOP=1 and explicit approval.\n\n"
)
outputs = {
    OUTPUT: header + "\n".join(render_section(baseline_sections[name]) for name in sorted(baseline_sections)),
    OPERATOR_OUTPUT: operator_header + "\n".join(render_section(operator_sections[name]) for name in sorted(operator_sections)),
}
if args.section:
    body = baseline_sections.get(args.section) or operator_sections.get(args.section)
    if body is None:
        raise SystemExit("Unknown section. Choose: " + ", ".join([*baseline_sections, *operator_sections]))
    sys.stdout.write((operator_header if args.section in operator_sections else header) + render_section(body))
else:
    for path, generated in outputs.items():
        if args.check:
            if not path.exists() or path.read_text() != generated:
                raise SystemExit(f"{path.name} is stale; run the generator without --check")
            print(f"{path.name} matches deterministic generator output")
        else:
            path.write_text(generated)
            print(f"Wrote {path.relative_to(ROOT)}")
