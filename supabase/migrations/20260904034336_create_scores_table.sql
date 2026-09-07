/*
# Create scores table for "소머리 피했어유" leaderboard

1. New Tables
- `scores`
  - `id` (uuid, primary key)
  - `player_name` (text, not null, max 12 chars) — the name the player enters
  - `score` (integer, not null) — the score achieved
  - `created_at` (timestamptz, default now())
2. Security
- Enable RLS on `scores`.
- Allow anon + authenticated to read all scores (public leaderboard).
- Allow anon + authenticated to insert new scores.
- No update or delete needed (scores are immutable once submitted).
3. Notes
- This is a single-tenant, no-auth app — the leaderboard is intentionally public.
- An index on score DESC speeds up the top-10 query.
*/

CREATE TABLE IF NOT EXISTS scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_name text NOT NULL CHECK (char_length(player_name) <= 12 AND char_length(player_name) >= 1),
  score integer NOT NULL CHECK (score >= 0),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_scores" ON scores;
CREATE POLICY "anon_select_scores" ON scores FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_scores" ON scores;
CREATE POLICY "anon_insert_scores" ON scores FOR INSERT
  TO anon, authenticated WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_scores_score_desc ON scores (score DESC);
