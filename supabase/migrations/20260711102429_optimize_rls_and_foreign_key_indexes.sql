-- Resolve Supabase performance advisor findings after the v0.4.0 schema rollout.

CREATE INDEX IF NOT EXISTS fixture_lineups_team_idx
  ON public.fixture_lineups(team_id);
CREATE INDEX IF NOT EXISTS fixture_provider_mappings_fixture_idx
  ON public.fixture_provider_mappings(fixture_id);
CREATE INDEX IF NOT EXISTS player_availability_player_idx
  ON public.player_availability(player_id)
  WHERE player_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS player_availability_team_idx
  ON public.player_availability(team_id);
CREATE INDEX IF NOT EXISTS player_provider_mappings_player_idx
  ON public.player_provider_mappings(player_id);
CREATE INDEX IF NOT EXISTS prediction_runs_fixture_idx
  ON public.prediction_runs(fixture_id)
  WHERE fixture_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS sports_fixtures_away_team_idx
  ON public.sports_fixtures(away_team_id, starts_at DESC);
CREATE INDEX IF NOT EXISTS sports_players_team_idx
  ON public.sports_players(team_id);
CREATE INDEX IF NOT EXISTS team_match_metrics_team_idx
  ON public.team_match_metrics(team_id);
CREATE INDEX IF NOT EXISTS team_provider_mappings_team_idx
  ON public.team_provider_mappings(team_id);

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = id);

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = id);

DROP POLICY IF EXISTS "saved_predictions_all_own" ON public.saved_predictions;
CREATE POLICY "saved_predictions_all_own"
  ON public.saved_predictions FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
