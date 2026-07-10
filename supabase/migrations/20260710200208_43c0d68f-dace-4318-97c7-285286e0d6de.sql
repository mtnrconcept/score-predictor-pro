
-- profiles
CREATE TABLE public.profiles (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- saved_predictions
CREATE TABLE public.saved_predictions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  match_id TEXT NOT NULL,
  sport TEXT NOT NULL,
  competition TEXT,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  match_start TIMESTAMPTZ,
  prediction JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX saved_predictions_user_idx ON public.saved_predictions(user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_predictions TO authenticated;
GRANT ALL ON public.saved_predictions TO service_role;
ALTER TABLE public.saved_predictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "saved_predictions_all_own" ON public.saved_predictions FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- predictions_cache (public read)
CREATE TABLE public.predictions_cache (
  match_id TEXT NOT NULL PRIMARY KEY,
  sport TEXT NOT NULL,
  prediction JSONB NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.predictions_cache TO anon, authenticated;
GRANT ALL ON public.predictions_cache TO service_role;
ALTER TABLE public.predictions_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "predictions_cache_public_read" ON public.predictions_cache FOR SELECT TO anon, authenticated USING (true);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
