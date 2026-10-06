"""Narrow, transactional migration using the existing GitHub runner secret."""
import json
import os
from pathlib import Path
import sys
import urllib.error
import urllib.request

PROJECT = 'nzoumetzzfvxavxdmjis'
MIGRATIONS = {'candidate_hiring': '20261003201000', 'unsaved_previews': '20261003220000', 'account_usernames': '20261005090000', 'general_links': '20261005120000', 'ai_scoring': '20261006120000'}
NAME = os.environ.get('MIGRATION', 'candidate_hiring')
if NAME not in MIGRATIONS:
    sys.exit('Unsupported migration target.')
VERSION = MIGRATIONS[NAME]
FILE = Path(__file__).resolve().parents[1] / f'supabase/migrations/{VERSION}_{NAME}.sql'


def query(sql):
    token = os.environ.get('SUPABASE_ACCESS_TOKEN')
    if not token:
        sys.exit('The repository Supabase management credential is unavailable.')
    request = urllib.request.Request(
        f'https://api.supabase.com/v1/projects/{PROJECT}/database/query',
        data=json.dumps({'query': sql}).encode(),
        headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'},
        method='POST',
    )
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        # Responses may contain SQL or sensitive configuration. Never log them.
        sys.exit('Supabase database management failed: HTTP ' + str(error.code))
    except urllib.error.URLError:
        sys.exit('Supabase database management could not be reached.')


def inspect():
    if NAME == 'ai_scoring':
        return query(f"""select
            exists(select 1 from supabase_migrations.schema_migrations where version='{VERSION}' and name='{NAME}') as recorded,
            exists(select 1 from information_schema.columns where table_schema='public' and table_name='attempts' and column_name='ai_scoring' and data_type='jsonb' and is_nullable='NO') as column_ready,
            exists(select 1 from pg_constraint where conrelid='public.attempts'::regclass and conname='attempts_ai_scoring_valid') as constraint_ready,
            case when exists(select 1 from information_schema.columns where table_schema='public' and table_name='attempts' and column_name='ai_scoring') then
            not has_column_privilege('authenticated','public.attempts','ai_scoring','UPDATE') and
            not has_column_privilege('anon','public.attempts','ai_scoring','UPDATE') else false end as grants_ready
            """)[0]
    if NAME == 'general_links':
        return query(f"""select
            exists(select 1 from supabase_migrations.schema_migrations where version='{VERSION}' and name='{NAME}') as recorded,
            exists(select 1 from pg_class where oid=to_regclass('public.general_links') and relrowsecurity) as isolation_ready,
            exists(select 1 from information_schema.columns where table_schema='public' and table_name='attempts' and column_name='general_link_id') as column_ready,
            to_regprocedure('public.register_general_candidate(text,text,text)') is not null as function_ready,
            case when to_regprocedure('public.register_general_candidate(text,text,text)') is not null then
              not has_function_privilege('anon','public.register_general_candidate(text,text,text)','execute') and
              not has_function_privilege('authenticated','public.register_general_candidate(text,text,text)','execute') and
              has_function_privilege('service_role','public.register_general_candidate(text,text,text)','execute') else false end as grants_ready
            """)[0]
    if NAME == 'account_usernames':
        return query(f"""select
            exists(select 1 from supabase_migrations.schema_migrations where version='{VERSION}' and name='{NAME}') as recorded,
            exists(select 1 from information_schema.columns where table_schema='public' and table_name='workspace_members' and column_name='username' and data_type='text') as username_ready,
            exists(select 1 from pg_index where indexrelid=to_regclass('public.workspace_username_unique') and indisunique and indisvalid) as unique_ready,
            exists(select 1 from pg_constraint where conrelid='public.workspace_members'::regclass and conname='workspace_username_valid') as constraint_ready
            """)[0]
    if NAME == 'unsaved_previews':
        return query(f"""select
            exists(select 1 from supabase_migrations.schema_migrations where version='{VERSION}' and name='{NAME}') as recorded,
            exists(select 1 from information_schema.columns where table_schema='public' and table_name='preview_attempts' and column_name='assessment_id' and is_nullable='YES') as nullable_ready,
            exists(select 1 from pg_class where oid='public.preview_attempts'::regclass and relrowsecurity) as isolation_ready
            """)[0]
    return query(f"""select
        exists(select 1 from supabase_migrations.schema_migrations where version='{VERSION}' and name='{NAME}') as recorded,
        exists(select 1 from information_schema.columns where table_schema='public' and table_name='attempts' and column_name='hiring' and data_type='jsonb' and is_nullable='NO') as column_ready,
        exists(select 1 from pg_constraint where conrelid='public.attempts'::regclass and conname='attempts_hiring_valid') as constraint_ready,
        exists(select 1 from information_schema.column_privileges where table_schema='public' and table_name='attempts' and column_name='hiring' and grantee='authenticated' and privilege_type='UPDATE') as update_granted
        """)[0]


def main():
    operation = os.environ.get('OPERATION', 'verify')
    if operation not in ('verify', 'apply'):
        sys.exit('Unsupported migration operation.')
    before = inspect()
    if operation == 'apply':
        if before['recorded']:
            if not all(before.values()):
                sys.exit('Recorded migration has incomplete schema; inspect before repair.')
            print(NAME + ' migration already recorded; no SQL replayed.')
        else:
            if (NAME == 'general_links' and (before['isolation_ready'] or before['column_ready'] or before['function_ready'])) or (NAME in ('candidate_hiring', 'ai_scoring') and (before['column_ready'] or before['constraint_ready'])) or (NAME == 'unsaved_previews' and before['nullable_ready']) or (NAME == 'account_usernames' and (before['username_ready'] or before['unique_ready'] or before['constraint_ready'])):
                sys.exit('Unrecorded migration schema exists; inspect before repair.')
            sql = FILE.read_text().strip()
            if not sql.startswith('begin;') or not sql.endswith('commit;'):
                sys.exit('Migration must have explicit transaction boundaries.')
            body = sql[len('begin;'):-len('commit;')]
            quoted_sql = sql.replace("'", "''")
            transaction = f"""begin;
                select pg_advisory_xact_lock(hashtext('Training-App {NAME}'));
                {body}
                insert into supabase_migrations.schema_migrations(version,name,statements)
                values ('{VERSION}','{NAME}',array['{quoted_sql}']);
                commit;"""
            query(transaction)
            print(NAME + ' migration applied transactionally.')
    after = inspect()
    print(json.dumps(after, sort_keys=True))
    if operation == 'apply' and not all(after.values()):
        sys.exit('Schema verification failed.')


if __name__ == '__main__':
    main()
