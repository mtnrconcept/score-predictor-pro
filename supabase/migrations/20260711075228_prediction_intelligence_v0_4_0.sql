-- Score Predictor Pro Intelligence v0.4.0
-- Additive migration: no existing table or user data is removed.

CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

DO $$ BEGIN
  CREATE TYPE public.subscription_tier AS ENUM ('free', 'starter', 'pro', 'enterprise');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.prediction_run_status AS ENUM ('queued', 'running', 'completed', 'abstained', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_tier public.subscription_tier NOT NULL DEFAULT 'free';

-- Prevent users from promoting their own account by updating newly added columns.
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (display_name, avatar_url) ON public.profiles TO authenticated;

CREATE TABLE IF NOT EXISTS public.sports_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sport TEXT NOT NULL DEFAULT 'soccer',
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  country TEXT,
  logo_url TEXT,
  current_elo NUMERIC(7,2) NOT NULL DEFAULT 1500,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (sport, normalized_name, country)
);

CREATE TABLE IF NOT EXISTS public.team_provider_mappings (
  provider TEXT NOT NULL,
  provider_team_id TEXT NOT NULL,
  team_id UUID NOT NULL REFERENCES public.sports_teams(id) ON DELETE CASCADE,
  provider_name TEXT NOT NULL,
  resolution_confidence NUMERIC(5,4) NOT NULL DEFAULT 1 CHECK (resolution_confidence BETWEEN 0 AND 1),
  manually_verified BOOLEAN NOT NULL DEFAULT false,
  raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, provider_team_id)
);

CREATE TABLE IF NOT EXISTS public.sports_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES public.sports_teams(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  position TEXT,
  date_of_birth DATE,
  nationality TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS sports_players_identity_idx
  ON public.sports_players(normalized_name, COALESCE(date_of_birth, DATE '1900-01-01'));

CREATE TABLE IF NOT EXISTS public.player_provider_mappings (
  provider TEXT NOT NULL,
  provider_player_id TEXT NOT NULL,
  player_id UUID NOT NULL REFERENCES public.sports_players(id) ON DELETE CASCADE,
  provider_name TEXT NOT NULL,
  raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, provider_player_id)
);

CREATE TABLE IF NOT EXISTS public.sports_fixtures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sport TEXT NOT NULL DEFAULT 'soccer',
  provider TEXT NOT NULL,
  provider_fixture_id TEXT NOT NULL,
  competition_id TEXT,
  competition_name TEXT NOT NULL,
  season TEXT,
  home_team_id UUID NOT NULL REFERENCES public.sports_teams(id),
  away_team_id UUID NOT NULL REFERENCES public.sports_teams(id),
  starts_at TIMESTAMPTZ NOT NULL,
  venue TEXT,
  status TEXT NOT NULL,
  home_score INTEGER,
  away_score INTEGER,
  home_xg NUMERIC(5,2),
  away_xg NUMERIC(5,2),
  raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_fixture_id),
  CHECK (home_team_id <> away_team_id)
);

CREATE INDEX IF NOT EXISTS sports_fixtures_starts_idx ON public.sports_fixtures(starts_at);
CREATE INDEX IF NOT EXISTS sports_fixtures_teams_idx ON public.sports_fixtures(home_team_id, away_team_id, starts_at DESC);

CREATE TABLE IF NOT EXISTS public.fixture_provider_mappings (
  provider TEXT NOT NULL,
  provider_fixture_id TEXT NOT NULL,
  fixture_id UUID NOT NULL REFERENCES public.sports_fixtures(id) ON DELETE CASCADE,
  resolution_confidence NUMERIC(5,4) NOT NULL DEFAULT 1 CHECK (resolution_confidence BETWEEN 0 AND 1),
  manually_verified BOOLEAN NOT NULL DEFAULT false,
  raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, provider_fixture_id)
);

CREATE TABLE IF NOT EXISTS public.team_match_metrics (
  fixture_id UUID NOT NULL REFERENCES public.sports_fixtures(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.sports_teams(id) ON DELETE CASCADE,
  is_home BOOLEAN NOT NULL,
  goals_for INTEGER,
  goals_against INTEGER,
  expected_goals_for NUMERIC(5,2),
  expected_goals_against NUMERIC(5,2),
  possession NUMERIC(5,2),
  shots INTEGER,
  shots_on_target INTEGER,
  corners INTEGER,
  cards INTEGER,
  rest_days NUMERIC(5,2),
  raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (fixture_id, team_id)
);

CREATE TABLE IF NOT EXISTS public.player_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fixture_id UUID REFERENCES public.sports_fixtures(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.sports_teams(id) ON DELETE CASCADE,
  player_id UUID REFERENCES public.sports_players(id) ON DELETE CASCADE,
  player_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('available', 'doubtful', 'out', 'suspended')),
  reason TEXT,
  attack_impact NUMERIC(5,4) NOT NULL DEFAULT 0 CHECK (attack_impact BETWEEN 0 AND 0.2),
  defense_impact NUMERIC(5,4) NOT NULL DEFAULT 0 CHECK (defense_impact BETWEEN 0 AND 0.2),
  source_url TEXT,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS player_availability_fixture_idx ON public.player_availability(fixture_id, team_id);
CREATE UNIQUE INDEX IF NOT EXISTS player_availability_dedupe_idx
  ON public.player_availability(fixture_id, team_id, player_name, status);

CREATE TABLE IF NOT EXISTS public.fixture_lineups (
  fixture_id UUID NOT NULL REFERENCES public.sports_fixtures(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.sports_teams(id) ON DELETE CASCADE,
  confirmed BOOLEAN NOT NULL DEFAULT false,
  confidence NUMERIC(5,4) NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 1),
  formation TEXT,
  players JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_url TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (fixture_id, team_id)
);

CREATE TABLE IF NOT EXISTS public.provider_import_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  resource TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  requested_for DATE,
  records_received INTEGER NOT NULL DEFAULT 0,
  records_written INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.prediction_usage (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
  requests INTEGER NOT NULL DEFAULT 0 CHECK (requests >= 0),
  input_tokens BIGINT NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens BIGINT NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, usage_date)
);

CREATE TABLE IF NOT EXISTS public.prediction_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  match_id TEXT NOT NULL,
  fixture_id UUID REFERENCES public.sports_fixtures(id) ON DELETE SET NULL,
  status public.prediction_run_status NOT NULL DEFAULT 'queued',
  model TEXT NOT NULL DEFAULT 'gpt-5.6-sol',
  engine_version TEXT NOT NULL DEFAULT '0.4.0',
  data_quality NUMERIC(5,2),
  abstention_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  input_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS prediction_runs_user_idx ON public.prediction_runs(user_id, created_at DESC);

ALTER TABLE public.predictions_cache
  ADD COLUMN IF NOT EXISTS model_version TEXT NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS data_quality NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS abstained BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- Vault access is deliberately available only through the service role.
CREATE OR REPLACE FUNCTION public.set_app_secret(
  requested_name TEXT,
  requested_secret TEXT,
  requested_description TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  existing_id UUID;
BEGIN
  IF requested_name IS NULL OR length(requested_name) < 3 THEN
    RAISE EXCEPTION 'invalid secret name';
  END IF;
  IF requested_secret IS NULL OR length(requested_secret) < 20 THEN
    RAISE EXCEPTION 'invalid secret value';
  END IF;
  SELECT id INTO existing_id FROM vault.secrets WHERE name = requested_name;
  IF existing_id IS NULL THEN
    PERFORM vault.create_secret(requested_secret, requested_name, requested_description);
  ELSE
    PERFORM vault.update_secret(existing_id, requested_secret, requested_name, requested_description);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_app_secret(requested_name TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT decrypted_secret
  FROM vault.decrypted_secrets
  WHERE name = requested_name
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.app_secret_exists(requested_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS(SELECT 1 FROM vault.secrets WHERE name = requested_name);
$$;

CREATE OR REPLACE FUNCTION public.delete_app_secret(requested_name TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  DELETE FROM vault.secrets WHERE name = requested_name;
$$;

REVOKE ALL ON FUNCTION public.set_app_secret(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_app_secret(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.app_secret_exists(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_app_secret(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_app_secret(TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_app_secret(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.app_secret_exists(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_app_secret(TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.consume_prediction_quota()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id UUID := auth.uid();
  daily_limit INTEGER;
  used INTEGER;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT CASE subscription_tier
    WHEN 'enterprise' THEN 1000
    WHEN 'pro' THEN 200
    WHEN 'starter' THEN 50
    ELSE 10
  END INTO daily_limit
  FROM public.profiles
  WHERE id = current_user_id;
  daily_limit := COALESCE(daily_limit, 10);

  INSERT INTO public.prediction_usage(user_id, usage_date, requests)
  VALUES (current_user_id, CURRENT_DATE, 1)
  ON CONFLICT (user_id, usage_date) DO UPDATE
    SET requests = public.prediction_usage.requests + 1,
        updated_at = now()
    WHERE public.prediction_usage.requests < daily_limit
  RETURNING requests INTO used;

  IF used IS NULL THEN
    SELECT requests INTO used
    FROM public.prediction_usage
    WHERE user_id = current_user_id AND usage_date = CURRENT_DATE;
    RETURN jsonb_build_object('allowed', false, 'used', used, 'limit', daily_limit, 'remaining', 0);
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'used', used,
    'limit', daily_limit,
    'remaining', GREATEST(0, daily_limit - used)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.consume_prediction_quota() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_prediction_quota() TO authenticated;

-- Public sports data is readable; all writes stay behind service_role.
GRANT SELECT ON public.sports_teams, public.team_provider_mappings, public.sports_players,
  public.player_provider_mappings, public.sports_fixtures, public.fixture_provider_mappings,
  public.team_match_metrics, public.player_availability, public.fixture_lineups TO anon, authenticated;
GRANT ALL ON public.sports_teams, public.team_provider_mappings, public.sports_players,
  public.player_provider_mappings, public.sports_fixtures, public.fixture_provider_mappings,
  public.team_match_metrics, public.player_availability, public.fixture_lineups,
  public.provider_import_runs, public.prediction_usage, public.prediction_runs TO service_role;
GRANT SELECT ON public.prediction_usage, public.prediction_runs TO authenticated;

ALTER TABLE public.sports_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_provider_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sports_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_provider_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sports_fixtures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fixture_provider_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_match_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fixture_lineups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_import_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prediction_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prediction_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sports_teams_read" ON public.sports_teams FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "team_provider_mappings_read" ON public.team_provider_mappings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "sports_players_read" ON public.sports_players FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "player_provider_mappings_read" ON public.player_provider_mappings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "sports_fixtures_read" ON public.sports_fixtures FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "fixture_provider_mappings_read" ON public.fixture_provider_mappings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "team_match_metrics_read" ON public.team_match_metrics FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "player_availability_read" ON public.player_availability FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "fixture_lineups_read" ON public.fixture_lineups FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "prediction_usage_own" ON public.prediction_usage FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "prediction_runs_own" ON public.prediction_runs FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

COMMENT ON FUNCTION public.set_app_secret(TEXT, TEXT, TEXT) IS
  'Stores or rotates an encrypted Vault secret. Service-role only; never expose directly to clients.';
COMMENT ON FUNCTION public.consume_prediction_quota() IS
  'Atomically consumes one authenticated user prediction request and returns remaining daily quota.';
