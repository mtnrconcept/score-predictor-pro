import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { listMatches } from "@/lib/matches.functions";
import { MatchCard } from "@/components/MatchCard";
import { SPORTS } from "@/lib/sports";
import { Loader2, Search, TrendingUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { SportsResearchAgent } from "@/components/SportsResearchAgent";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const [sport, setSport] = useState<string>("all");
  const [q, setQ] = useState("");
  const navigate = useNavigate();

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["matches", sport],
    queryFn: () => listMatches({ data: { sport: sport === "all" ? undefined : sport, days: 2 } }),
    staleTime: 60_000,
  });

  const matches = (data?.matches ?? []).filter((m) => {
    if (!q) return true;
    const s = q.toLowerCase();
    return (
      m.homeTeam.toLowerCase().includes(s) ||
      m.awayTeam.toLowerCase().includes(s) ||
      m.competition.toLowerCase().includes(s)
    );
  });

  // Group by competition
  const groups = matches.reduce<Record<string, typeof matches>>((acc, m) => {
    const key = `${m.sportLabel} · ${m.competition}`;
    (acc[key] ??= []).push(m);
    return acc;
  }, {});

  return (
    <div className="grid-bg">
      <SportsResearchAgent />
      <section className="border-b border-border">
        <div className="mx-auto max-w-7xl px-4 py-10">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
            <TrendingUp className="h-3.5 w-3.5" /> Terminal de pronostics IA
          </div>
          <h1 className="mt-3 max-w-3xl font-display text-3xl font-bold leading-tight sm:text-5xl">
            Tous les matchs. Tous les paris. <span className="text-primary">Analysés par IA.</span>
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
            Sélectionne un match : OddsIQ agrège la forme des équipes, les blessures, l'historique
            des confrontations et te propose un pronostic complet — 1N2, score, buteurs, over/under
            et probabilités.
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1 sm:max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Rechercher une équipe, un joueur, une compétition…"
                className="pl-9"
              />
            </div>
            {isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-background/50">
        <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 py-3">
          <SportChip
            label="Tous"
            active={sport === "all"}
            onClick={() => setSport("all")}
            emoji="🏟️"
          />
          {SPORTS.map((s) => (
            <SportChip
              key={s.key}
              label={s.label}
              emoji={s.emoji}
              active={sport === s.key}
              onClick={() => setSport(s.key)}
            />
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Chargement des matchs…
          </div>
        ) : isError ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-6 text-sm text-destructive-foreground">
            Erreur : {(error as Error).message}
            <button onClick={() => refetch()} className="ml-3 underline">
              Réessayer
            </button>
          </div>
        ) : matches.length === 0 ? (
          <div className="py-24 text-center text-muted-foreground">
            Aucun match trouvé. Change de sport ou ajuste ta recherche.
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(groups).map(([groupKey, items]) => (
              <div key={groupKey}>
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  {groupKey} <span className="text-foreground">· {items.length}</span>
                </h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((m) => (
                    <MatchCard key={m.id} match={m} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SportChip({
  label,
  emoji,
  active,
  onClick,
}: {
  label: string;
  emoji: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors " +
        (active
          ? "border-primary bg-primary/15 text-primary"
          : "border-border bg-surface text-muted-foreground hover:text-foreground")
      }
    >
      <span>{emoji}</span>
      {label}
    </button>
  );
}
