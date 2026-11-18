/*
# Dispatch event log for the Autonomous Railway Intelligence Platform

1. Purpose
   Persists every significant dispatcher / AI action taken in the platform:
   obstruction injections, automatic reroutes, maintenance window bookings,
   surge simulations and optimizer runs, so the operations history survives
   page reloads and is shared across sessions.

2. New Tables
   - `dispatch_events`
     - `id` (uuid, primary key)
     - `kind` (text, not null) — event category, e.g. 'obstruction', 'reroute', 'maintenance', 'surge', 'optimizer'
     - `severity` (text, not null, default 'info') — 'info' | 'warning' | 'critical'
     - `message` (text, not null) — human-readable event description
     - `detail` (jsonb, nullable) — structured payload (corridor ids, train ids, KPIs)
     - `created_at` (timestamptz, default now())

3. Security
   - RLS enabled on `dispatch_events`.
   - This is a single-tenant, no-sign-in operational console: the event feed is
     intentionally shared, so policies allow anonymous + authenticated read and
     insert (no update/delete — events are append-only).
   - Grants: SELECT + INSERT to `anon` and `authenticated`; SELECT + INSERT to
     `service_role` is not required (no edge function writes).

4. Notes
   - Append-only by design: no UPDATE/DELETE grants, so the audit trail is
     immutable through the Data API.
*/

CREATE TABLE IF NOT EXISTS dispatch_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  message text NOT NULL,
  detail jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE dispatch_events ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON dispatch_events TO anon, authenticated;

DROP POLICY IF EXISTS "anon_read_dispatch_events" ON dispatch_events;
CREATE POLICY "anon_read_dispatch_events"
ON dispatch_events FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "anon_insert_dispatch_events" ON dispatch_events;
CREATE POLICY "anon_insert_dispatch_events"
ON dispatch_events FOR INSERT
TO anon, authenticated
WITH CHECK (true);
