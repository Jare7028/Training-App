"""Narrow, transactional migration using the existing GitHub runner secret."""
import json
import os
from pathlib import Path
import sys
import urllib.error
import urllib.request

PROJECT = 'nzoumetzzfvxavxdmjis'
VERSION = '20261003201000'
NAME = 'candidate_hiring'
FILE = Path(__file__).resolve().parents[1] / 'supabase/migrations/20261003201000_candidate_hiring.sql'


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
            print('Candidate hiring migration already recorded; no SQL replayed.')
        else:
            if before['column_ready'] or before['constraint_ready']:
                sys.exit('Unrecorded hiring schema exists; inspect before repair.')
            sql = FILE.read_text().strip()
            if not sql.startswith('begin;') or not sql.endswith('commit;'):
                sys.exit('Migration must have explicit transaction boundaries.')
            body = sql[len('begin;'):-len('commit;')]
            quoted_sql = sql.replace("'", "''")
            transaction = f"""begin;
                select pg_advisory_xact_lock(hashtext('Training-App candidate_hiring'));
                {body}
                insert into supabase_migrations.schema_migrations(version,name,statements)
                values ('{VERSION}','{NAME}',array['{quoted_sql}']);
                commit;"""
            query(transaction)
            print('Candidate hiring metadata migration applied transactionally.')
    after = inspect()
    print(json.dumps(after, sort_keys=True))
    if operation == 'apply' and not all(after.values()):
        sys.exit('Candidate hiring schema verification failed.')


if __name__ == '__main__':
    main()
