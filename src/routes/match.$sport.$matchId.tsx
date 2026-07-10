import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getMatchDetail } from "@/lib/matches.functions";
import { generatePrediction, savePrediction, type Prediction } from "@/lib/predictions.functions";
import { sportFromKey } from "@/lib/sports";
import { ArrowLeft, Loader2, RefreshCw, Save, Sparkles, Trophy, AlertCircle, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/match/$sport/$matchId")({
  component: MatchPage,
  head: ({ params }) => ({
    meta: [
      { title: `Pronostic ${params.sport} — OddsIQ` },
      { name: "description", content: `Pronostic IA détaillé pour ce match : 1N2, score, buteurs, probabilités.` },
    ],
  }),
});

function MatchPage() {
  const { matchId, sport } = Route.useParams();
  const sportMeta = sportFromKey(sport);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["match", matchId],
    queryFn: () => getMatchDetail({ data: { matchId } }),
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <Link to="/" className="mb-4 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> Retour aux matchs
      </Link>

      {isLoading && (
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Chargement…
        </div>
      )}

      {isError && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-6 text-sm">
          {(error as Error).message}
        </div>
      )}

      {data && (
        <>
          <header className="rounded-lg border border-border bg-card p-6">
            <div className="mb-3 flex items-center justify-between text-xs uppercase tracking-widest text-muted-foreground">
              <span>{sportMeta.emoji} {data.match.sportLabel} · {data.match.competition}</span>
              <span>{data.match.status}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <TeamBlock name={data.match.homeTeam} badge={data.match.homeBadge} />
              <div className="text-center">
                <div className="tabular text-4xl font-bold">
                  {data.match.homeScore ?? "—"} <span className="text-muted-foreground">:</span> {data.match.awayScore ?? "—"}
                </div>
                {data.match.startTime && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    {new Date(data.match.startTime).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}
                  </div>
                )}
              </div>
              <TeamBlock name={data.match.awayTeam} badge={data.match.awayBadge} align="right" />
            </div>
            {data.description && (
              <p className="mt-6 border-t border-border pt-4 text-sm leading-relaxed text-muted-foreground">
                {data.description.slice(0, 400)}{data.description.length > 400 ? "…" : ""}
              </p>
            )}
          </header>

          <PredictionSection matchId={matchId} match={data.match} />
        </>
      )}
    </div>
  );
}

function TeamBlock({ name, badge, align = "left" }: { name: string; badge: string | null; align?: "left" | "right" }) {
  return (
    <div className={`flex flex-1 items-center gap-3 ${align === "right" ? "flex-row-reverse text-right" : ""}`}>
      {badge ? (
        <img src={badge} alt="" className="h-14 w-14 object-contain" />
      ) : (
        <div className="h-14 w-14 rounded-full bg-surface-2" />
      )}
      <div className="font-display text-lg font-semibold leading-tight">{name}</div>
    </div>
  );
}

function PredictionSection({ matchId, match }: { matchId: string; match: any }) {
  const qc = useQueryClient();
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setAuthed(!!data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setAuthed(!!session?.user));
    return () => sub.subscription.unsubscribe();
  }, []);

  const gen = useMutation({
    mutationFn: (force?: boolean) => generatePrediction({ data: { matchId, force } }),
  });

  const save = useMutation({
    mutationFn: (p: Prediction) =>
      savePrediction({
        data: {
          matchId,
          sport: match.sport,
          competition: match.competition,
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          matchStart: match.startTime,
          prediction: p,
        },
      }),
    onSuccess: () => {
      toast.success("Pronostic sauvegardé");
      qc.invalidateQueries({ queryKey: ["myPredictions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const prediction = gen.data?.prediction;

  return (
    <section className="mt-6 rounded-lg border border-border bg-card p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-display text-xl font-semibold">
          <Sparkles className="h-5 w-5 text-primary" /> Pronostic IA
        </h2>
        <div className="flex gap-2">
          {prediction && authed && (
            <Button size="sm" variant="secondary" onClick={() => save.mutate(prediction)} disabled={save.isPending}>
              <Save className="mr-1.5 h-4 w-4" /> Sauvegarder
            </Button>
          )}
          {prediction && (
            <Button size="sm" variant="ghost" onClick={() => gen.mutate(true)} disabled={gen.isPending}>
              <RefreshCw className={"mr-1.5 h-4 w-4 " + (gen.isPending ? "animate-spin" : "")} /> Régénérer
            </Button>
          )}
        </div>
      </div>

      {!prediction && !gen.isPending && (
        <div className="rounded-lg border border-dashed border-border bg-background/50 p-8 text-center">
          <p className="mb-4 text-sm text-muted-foreground">
            Lance l'analyse IA pour obtenir un pronostic complet sur ce match.
          </p>
          <Button onClick={() => gen.mutate(undefined)} size="lg">
            <Sparkles className="mr-2 h-4 w-4" /> Générer le pronostic
          </Button>
        </div>
      )}

      {gen.isPending && (
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-sm">L'IA analyse les données du match…</p>
          <p className="text-xs">Forme, blessures, historique, tactique</p>
        </div>
      )}

      {gen.isError && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive-foreground">
          {(gen.error as Error).message}
        </div>
      )}

      {prediction && <PredictionView p={prediction} homeTeam={match.homeTeam} awayTeam={match.awayTeam} />}
      {prediction && gen.data?.cached && (
        <div className="mt-4 text-[11px] text-muted-foreground">Résultat en cache — régénère pour une nouvelle analyse.</div>
      )}
    </section>
  );
}

function PredictionView({ p, homeTeam, awayTeam }: { p: Prediction; homeTeam: string; awayTeam: string }) {
  const outcomeLabel = p.outcome.prediction === "home" ? homeTeam : p.outcome.prediction === "away" ? awayTeam : "Match nul";

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="rounded-lg bg-surface p-4">
        <p className="text-sm leading-relaxed">{p.summary}</p>
        <div className="mt-3 flex items-center gap-2 text-xs">
          <span className="font-semibold uppercase tracking-wider text-muted-foreground">Confiance globale</span>
          <ConfidenceBar value={p.confidence} />
          <span className="tabular font-bold text-primary">{Math.round(p.confidence)}%</span>
        </div>
      </div>

      {/* 1N2 */}
      <Card icon={<Trophy className="h-4 w-4" />} title="Résultat 1N2">
        <div className="mb-3 rounded bg-primary/10 px-3 py-2 text-sm">
          Pronostic : <span className="font-bold text-primary">{outcomeLabel}</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <ProbBox label={homeTeam} value={p.outcome.homeWinProb} highlight={p.outcome.prediction === "home"} />
          <ProbBox label="Nul" value={p.outcome.drawProb} highlight={p.outcome.prediction === "draw"} />
          <ProbBox label={awayTeam} value={p.outcome.awayWinProb} highlight={p.outcome.prediction === "away"} />
        </div>
      </Card>

      {/* Score */}
      <Card icon={<Target className="h-4 w-4" />} title="Score prédit">
        <div className="mb-3 flex items-center justify-center gap-4 rounded bg-surface p-4">
          <span className="truncate text-right text-sm font-medium">{homeTeam}</span>
          <span className="tabular text-3xl font-bold text-primary">
            {p.scorePrediction.home} – {p.scorePrediction.away}
          </span>
          <span className="truncate text-sm font-medium">{awayTeam}</span>
        </div>
        {p.scorePrediction.alternatives.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <span className="text-xs text-muted-foreground">Alternatives :</span>
            {p.scorePrediction.alternatives.map((a, i) => (
              <span key={i} className="tabular rounded bg-surface px-2 py-0.5 text-xs">{a}</span>
            ))}
          </div>
        )}
      </Card>

      {/* Totals */}
      <Card title="Total (Over/Under)">
        <div className="flex items-baseline justify-between rounded bg-surface p-3">
          <div>
            <div className="text-xs uppercase text-muted-foreground">Ligne</div>
            <div className="tabular text-2xl font-bold">{p.totals.line}</div>
          </div>
          <div className={"rounded px-3 py-1 text-sm font-bold uppercase " + (p.totals.recommendation === "over" ? "bg-primary/20 text-primary" : "bg-accent/20 text-accent")}>
            {p.totals.recommendation === "over" ? "OVER" : "UNDER"}
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{p.totals.reasoning}</p>
      </Card>

      {/* Player bets */}
      {p.playerBets.length > 0 && (
        <Card title="Paris joueurs">
          <ul className="divide-y divide-border">
            {p.playerBets.map((b, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-2">
                <div>
                  <div className="text-sm font-medium">{b.label}</div>
                  <div className="text-xs text-muted-foreground">{b.pick}</div>
                </div>
                <span className="tabular text-xs font-bold text-primary">{Math.round(b.confidence)}%</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Other bets */}
      {p.otherBets.length > 0 && (
        <Card title="Autres marchés">
          <div className="space-y-2">
            {p.otherBets.map((b, i) => (
              <div key={i} className="rounded bg-surface p-3">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-sm font-semibold">{b.market}</span>
                  <span className="tabular text-xs font-bold text-primary">{Math.round(b.confidence)}%</span>
                </div>
                <div className="text-xs text-foreground">{b.pick}</div>
                <div className="mt-1 text-[11px] text-muted-foreground">{b.reasoning}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Key players */}
      {p.keyPlayers.length > 0 && (
        <Card title="Joueurs clés">
          <div className="grid gap-2 sm:grid-cols-2">
            {p.keyPlayers.map((k, i) => (
              <div key={i} className="rounded bg-surface p-3">
                <div className="text-sm font-semibold">{k.name}</div>
                <div className="text-xs text-muted-foreground">{k.team} · {k.role}</div>
                <div className="mt-1 text-xs">{k.note}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Injuries */}
      {p.injuriesAndAbsences.length > 0 && (
        <Card icon={<AlertCircle className="h-4 w-4" />} title="Blessures & absences">
          <ul className="space-y-1 text-sm text-muted-foreground">
            {p.injuriesAndAbsences.map((x, i) => <li key={i}>• {x}</li>)}
          </ul>
        </Card>
      )}

      {/* Factors */}
      {p.keyFactors.length > 0 && (
        <Card title="Facteurs clés">
          <ul className="space-y-1 text-sm">
            {p.keyFactors.map((f, i) => <li key={i} className="flex gap-2"><span className="text-primary">▸</span>{f}</li>)}
          </ul>
        </Card>
      )}

      {/* H2H */}
      {p.headToHead && (
        <Card title="Confrontations directes">
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">{p.headToHead.summary}</p>
            {p.headToHead.matchesAnalyzed > 0 && (
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded border border-border bg-surface/40 p-2 text-center">
                  <div className="text-xs text-muted-foreground">Dom. gagne</div>
                  <div className="text-lg font-bold text-primary">{p.headToHead.homeWinRate}%</div>
                </div>
                <div className="rounded border border-border bg-surface/40 p-2 text-center">
                  <div className="text-xs text-muted-foreground">Nul</div>
                  <div className="text-lg font-bold">{p.headToHead.drawRate}%</div>
                </div>
                <div className="rounded border border-border bg-surface/40 p-2 text-center">
                  <div className="text-xs text-muted-foreground">Ext. gagne</div>
                  <div className="text-lg font-bold text-primary">{p.headToHead.awayWinRate}%</div>
                </div>
              </div>
            )}
            {p.headToHead.matchesAnalyzed > 0 && (
              <div className="text-xs text-muted-foreground">Basé sur {p.headToHead.matchesAnalyzed} confrontation(s) passée(s)</div>
            )}
            {p.headToHead.keyPastMatches.length > 0 && (
              <div>
                <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Matchs marquants</div>
                <ul className="space-y-1">
                  {p.headToHead.keyPastMatches.map((m, i) => <li key={i}>• {m}</li>)}
                </ul>
              </div>
            )}
            {p.headToHead.decisivePlayers.length > 0 && (
              <div>
                <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Joueurs décisifs dans ces confrontations</div>
                <ul className="space-y-1">
                  {p.headToHead.decisivePlayers.map((pl, i) => (
                    <li key={i}><span className="font-medium">{pl.name}</span> <span className="text-muted-foreground">({pl.team})</span> — {pl.impact}</li>
                  ))}
                </ul>
              </div>
            )}
            {p.headToHead.strengthsWhenWinning.length > 0 && (
              <div>
                <div className="mb-1 text-xs font-semibold uppercase text-emerald-500">Forces lors des victoires</div>
                <ul className="space-y-1">
                  {p.headToHead.strengthsWhenWinning.map((s, i) => <li key={i}>+ {s}</li>)}
                </ul>
              </div>
            )}
            {p.headToHead.weaknessesWhenLosing.length > 0 && (
              <div>
                <div className="mb-1 text-xs font-semibold uppercase text-red-500">Faiblesses lors des défaites</div>
                <ul className="space-y-1">
                  {p.headToHead.weaknessesWhenLosing.map((w, i) => <li key={i}>− {w}</li>)}
                </ul>
              </div>
            )}
          </div>
        </Card>
      )}

      <div className="rounded border border-border bg-surface/50 p-3 text-[11px] uppercase tracking-wider text-muted-foreground">
        {p.disclaimer}
      </div>
    </div>
  );
}

function Card({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-background/40 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

function ProbBox({ label, value, highlight }: { label: string; value: number; highlight: boolean }) {
  return (
    <div className={"rounded p-3 text-center " + (highlight ? "bg-primary/15 ring-1 ring-primary" : "bg-surface")}>
      <div className="tabular text-xl font-bold">{Math.round(value)}%</div>
      <div className="mt-0.5 truncate text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  return (
    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
      <div className="h-full bg-primary transition-all" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}
