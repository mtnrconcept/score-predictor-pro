import { createFileRoute, useNavigate, useSearch, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Activity, Loader2 } from "lucide-react";
import { toast } from "sonner";

const SearchSchema = z.object({ next: z.string().optional() });

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  validateSearch: SearchSchema,
  head: () => ({ meta: [{ title: "Connexion — OddsIQ" }] }),
});

function AuthPage() {
  const navigate = useNavigate();
  const { next } = useSearch({ from: "/auth" });
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const safeNext = next?.startsWith("/") && !next.startsWith("//") ? next : "/";

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: safeNext as any, replace: true });
    });
  }, [navigate, safeNext]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session) {
          toast.success("Compte créé. Vérifie l'e-mail de confirmation avant de te connecter.");
          setMode("signin");
          return;
        }
        toast.success("Compte créé — tu es connecté.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate({ to: safeNext as any, replace: true });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error(result.error.message);
      setLoading(false);
      return;
    }
    if (result.redirected) return;
    navigate({ to: safeNext as any, replace: true });
  }

  return (
    <div className="grid-bg flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 shadow-xl">
        <div className="mb-6 flex items-center gap-2">
          <Activity className="h-6 w-6 text-primary" />
          <span className="font-display text-xl font-bold">
            ODDS<span className="text-primary">IQ</span>
          </span>
        </div>
        <h1 className="mb-1 font-display text-2xl font-bold">
          {mode === "signup" ? "Créer un compte" : "Connexion"}
        </h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Sauvegarde tes pronostics et suis leur performance.
        </p>

        <Button
          variant="secondary"
          className="mb-4 w-full"
          onClick={handleGoogle}
          disabled={loading}
        >
          <svg viewBox="0 0 24 24" className="mr-2 h-4 w-4">
            <path
              fill="#EA4335"
              d="M12 5c1.6 0 3 .5 4.1 1.6l3-3C17.2 1.9 14.8 1 12 1 7.4 1 3.4 3.6 1.4 7.4l3.5 2.7C5.9 7.1 8.7 5 12 5z"
            />
            <path
              fill="#4285F4"
              d="M23 12c0-.8-.1-1.6-.2-2.3H12v4.5h6.2c-.3 1.5-1.1 2.7-2.4 3.5l3.6 2.8C21.7 18.4 23 15.5 23 12z"
            />
            <path
              fill="#FBBC05"
              d="M4.9 14.3c-.2-.7-.4-1.5-.4-2.3s.1-1.6.4-2.3L1.4 7C.5 8.5 0 10.2 0 12s.5 3.5 1.4 5l3.5-2.7z"
            />
            <path
              fill="#34A853"
              d="M12 23c3.2 0 5.9-1.1 7.9-2.9l-3.6-2.8c-1 .7-2.3 1.1-4.2 1.1-3.3 0-6.1-2.1-7.1-5.1L1.4 16C3.4 20.4 7.4 23 12 23z"
            />
          </svg>
          Continuer avec Google
        </Button>

        <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" /> ou <div className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div>
            <Label htmlFor="password">Mot de passe</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === "signup" ? "Créer mon compte" : "Se connecter"}
          </Button>
        </form>

        <button
          type="button"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="mt-4 w-full text-center text-xs text-muted-foreground hover:text-foreground"
        >
          {mode === "signin"
            ? "Pas encore de compte ? Créer un compte"
            : "Déjà inscrit ? Se connecter"}
        </button>

        <Link
          to="/"
          className="mt-2 block text-center text-xs text-muted-foreground hover:text-foreground"
        >
          Continuer sans compte
        </Link>
      </div>
    </div>
  );
}
