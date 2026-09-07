-- Allow anyone to delete scores (for leaderboard reset)
DROP POLICY IF EXISTS "anon_delete_scores" ON scores;
CREATE POLICY "anon_delete_scores" ON scores FOR DELETE
  TO anon, authenticated USING (true);
