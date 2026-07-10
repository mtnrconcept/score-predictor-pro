import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listMyPredictions, deleteSavedPrediction } from "@/lib/predictions.functions";
import { Loader2, Trash2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/my-predictions")({
  component: MyPredictionsPage,
  head: () => ({ meta: [{ title: "Mes pronostics — OddsIQ" }] }),
});

function MyPredictionsPage() {
  const qc = useQueryClient();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["myPredictions"],
    queryFn: () => listMyPredictions(),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteSavedPrediction({ data: { id } }),
    onSuccess: () => {
      toast.success("Supprimé");
      qc.invalidateQueries({ queryKey: ["myPredictions"] });
    },
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-6 font-display text-2xl font-bold">Mes pronostics</h1>

      {isLoading && (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Chargement…
        </div>
      )}

      {isError && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
          {(error as Error).message}
        </div>
      )}

      {data && data.predictions.length === 0 && (
        <div className="rounded-lg border border-dashed border-border bg-card p-12 text-center">
          <p className="text-muted-foreground">Tu n'as pas encore sauvegardé de pronostic.</p>
          <Button asChild className="mt-4">
            <Link to="/">Parcourir les matchs</Link>
          </Button>
        </div>
      )}

      {data && data.predictions.length > 0 && (
        <div className="space-y-3">
          {data.predictions.map((p: any) => {
            const pred = p.prediction ?? {};
            const outcome = pred.outcome?.prediction;
            const pickLabel = outcome === "home" ? p.home_team : outcome === "away" ? p.away_team : "Nul";
            return (
              <div key={p.id} className="rounded-lg border border-border bg-card p-4">
                <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-widest text-muted-foreground">
                  <span>{p.competition ?? p.sport}</span>
                  <span className="tabular">{p.match_start ? new Date(p.match_start).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—"}</span>
                </div>
                <div className="mb-3 font-display font-semibold">{p.home_team} <span className="text-muted-foreground">vs</span> {p.away_team}</div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded bg-primary/15 px-2 py-1 font-semibold text-primary">Pick : {pickLabel}</span>
                  {pred.scorePrediction && (
                    <span className="tabular rounded bg-surface px-2 py-1">Score : {pred.scorePrediction.home}-{pred.scorePrediction.away}</span>
                  )}
                  {pred.confidence != null && (
                    <span className="tabular rounded bg-surface px-2 py-1">Confiance {Math.round(pred.confidence)}%</span>
                  )}
                  <span className="rounded bg-surface px-2 py-1 capitalize">{p.status}</span>
                  <div className="ml-auto flex gap-1">
                    <Button asChild size="sm" variant="ghost">
                      <Link to="/match/$sport/$matchId" params={{ sport: p.sport, matchId: p.match_id }}>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => del.mutate(p.id)} disabled={del.isPending}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
