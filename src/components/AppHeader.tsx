import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Activity, LogOut, Settings, User } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AppHeader() {
  const [email, setEmail] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        setEmail(session?.user?.email ?? null);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
        <Link to="/" className="flex items-center gap-2 font-display font-bold tracking-tight">
          <Activity className="h-5 w-5 text-primary" />
          <span className="text-lg">
            ODDS<span className="text-primary">IQ</span>
          </span>
        </Link>
        <nav className="ml-4 hidden gap-1 text-sm text-muted-foreground md:flex">
          <Link
            to="/"
            className="rounded px-3 py-1.5 hover:bg-surface hover:text-foreground [&.active]:bg-surface [&.active]:text-foreground"
            activeOptions={{ exact: true }}
          >
            Matchs
          </Link>
          {email && (
            <>
              <Link
                to="/my-predictions"
                className="rounded px-3 py-1.5 hover:bg-surface hover:text-foreground [&.active]:bg-surface [&.active]:text-foreground"
              >
                Mes pronostics
              </Link>
              <Link
                to="/settings"
                className="rounded px-3 py-1.5 hover:bg-surface hover:text-foreground [&.active]:bg-surface [&.active]:text-foreground"
              >
                Configuration IA
              </Link>
            </>
          )}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {email ? (
            <>
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="md:hidden"
                aria-label="Configuration IA"
              >
                <Link to="/settings">
                  <Settings className="h-4 w-4" />
                </Link>
              </Button>
              <span className="hidden items-center gap-2 rounded-md bg-surface px-3 py-1.5 text-xs text-muted-foreground sm:flex">
                <User className="h-3.5 w-3.5" />
                {email}
              </span>
              <Button variant="ghost" size="sm" onClick={signOut} aria-label="Se déconnecter">
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <Button asChild size="sm" variant="secondary">
              <Link to="/auth">Se connecter</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
