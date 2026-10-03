# Sportspace database

PostgreSQL now stores players, teams, matches, awards, communities, posts, stories,
and preferences in `public.sportspace_state`, row 1, as a JSONB document.
The original `/users` table is independent; it is not the player directory.
Requests lock the state row so concurrent app workers cannot lose updates.
This shared demo account is not authenticated multi-user account management.

The normal runtime uses `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and
`DB_PASSWORD` (see `db.py`). An explicit `SPORTSPACE_SOCIAL_DB` path selects
SQLite for tests/offline development. Do not set it when using PostgreSQL.

Import an existing SQLite file once before starting the updated app:

```bash
cd app
venv/bin/python migrate_sportspace.py /tmp/sportspace-social.sqlite3
```

Existing PostgreSQL state is preserved; the SQLite file is left untouched.
New databases are seeded on first access. The local PostgreSQL container uses
the persistent Docker volume `byte-devops-local-pgdata`.

Open http://localhost:8080/sportspace#player/demo-user and select **Edit profile**.
Name, city, and sport persist in PostgreSQL. Feed author names use player identity.
Reload the browser after direct SQL edits; the UI does not poll for changes.
Some legacy screens (such as ground bookings and tournament registrations) still
use browser demo data; this change covers the social and arena APIs.

Connect locally:

```bash
docker exec -it byte-devops-local-db psql -U postgres -d devopsdb
```

List players:

```sql
SELECT p->>'id' AS id, p->>'name' AS name, p->>'city' AS city,
       p->>'sport' AS sport, p->'awards' AS awards
FROM sportspace_state s,
     LATERAL jsonb_array_elements(s.payload #> '{arena,players}') p;
```

List feed posts (joining the current author name):

```sql
SELECT post->>'id' AS post_id, player->>'name' AS author,
       post->>'text' AS text, post->>'sport' AS sport
FROM sportspace_state s
CROSS JOIN LATERAL jsonb_array_elements(s.payload->'posts') post
LEFT JOIN LATERAL jsonb_array_elements(s.payload #> '{arena,players}') player
  ON player->>'id' = post->>'authorId';
```

Update a player's name, city, sport and initials directly (replace the example
values and ID). Prefer the profile form/API because it also updates preferences
and existing story names. Back up before manual database changes.

```sql
BEGIN;
SELECT id FROM sportspace_state WHERE id = 1 FOR UPDATE;
UPDATE sportspace_state
SET payload = jsonb_set(payload, '{arena,players}', (
    SELECT jsonb_agg(CASE WHEN p->>'id' = 'demo-user'
      THEN p || '{"name":"Alex Kumar","initials":"AK","city":"Delhi","sport":"Tennis"}'::jsonb
      ELSE p END ORDER BY position)
    FROM jsonb_array_elements(payload #> '{arena,players}') WITH ORDINALITY AS players(p, position)
)), updated_at = now()
WHERE id = 1;
COMMIT;
```

View teams, matches, or stored preferences:

```sql
SELECT jsonb_pretty(payload #> '{arena,teams}') FROM sportspace_state;
SELECT jsonb_pretty(payload #> '{arena,matches}') FROM sportspace_state;
SELECT jsonb_pretty(payload->'preferences') FROM sportspace_state;
```
