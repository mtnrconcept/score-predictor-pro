import { useMutation } from "@tanstack/react-query";
import { BrainCircuit, ExternalLink, Loader2, Search, ShieldAlert } from "lucide-react";
import { useState } from "react";

import { runSportsResearch } from "@/lib/research-agent";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

const EXAMPLES = [
  "Analyse tous les matchs de la Coupe du monde à venir",
  "Analyse les matchs de Ligue des champions de cette semaine",
  "Quels sont les matchs les plus prévisibles de Premier League ce week-end ?",
];

export function SportsResearchAgent() {
  const [request, setRequest] = useState(EXAMPLES[0]);
  const analysis = useMutation({
    mutationFn: () => runSportsResearch(request),
  });
  const result = analysis.data?.research;

  return (
    <section className="border-b border-border bg-primary/5">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
              <BrainCircuit className="h-4 w-4" /> Agent de recherche GPT-5.6 Sol
            </div>
            <h2 className="mt-2 font-display text-2xl font-bold sm:text-3xl">
              Demande une analyse complète, en langage naturel
            </h2>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              L'agent identifie les matchs, recherche les données récentes en ligne, vérifie ses
              sources et mesure l'incertitude avant de présenter ses estimations.
            </p>
            <Textarea
              value={request}
              onChange={(event) => setRequest(event.target.value)}
              rows={4}
              maxLength={1500}
              className="mt-5 bg-background"
              placeholder="Ex. Analyse tous les matchs de la Coupe du monde à venir…"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => setRequest(example)}
                  className="rounded-full border border-border bg-background px-3 py-1.5 text-left text-xs text-muted-foreground hover:text-foreground"
                >
                  {example}
                </button>
              ))}
            </div>
            <Button
              className="mt-4"
              disabled={analysis.isPending || request.trim().length < 10}
              onClick={() => analysis.mutate()}
            >
              {analysis.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Recherche et analyse en cours…
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" /> Lancer l'analyse complète
                </>
              )}
            </Button>
          </div>
          <Card className="bg-background/80">
            <CardHeader>
              <CardTitle className="text-base">Ce que l'agent vérifie</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>Calendrier et statut des rencontres</p>
              <p>Forme et confrontations</p>
              <p>Classement, xG et statistiques</p>
              <p>Blessures, suspensions et compositions</p>
              <p>Fatigue, terrain et contexte</p>
              <p>Sources, qualité et abstention</p>
            </CardContent>
          </Card>
        </div>

        {analysis.isError && (
          <div className="mt-6 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
            <ShieldAlert className="mr-2 inline h-4 w-4" />
            {(analysis.error as Error).message}
          </div>
        )}

        {result && (
          <div className="mt-8 space-y-5">
            <Card>
              <CardHeader>
                <CardTitle>{result.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p>{result.executiveSummary}</p>
                <p className="text-muted-foreground">
                  <strong>Périmètre :</strong> {result.scope}
                </p>
                {result.coverageLimitations.length > 0 && (
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
                    <strong>Limites :</strong> {result.coverageLimitations.join(" · ")}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              {result.matches.map((match, index) => (
                <Card key={`${match.homeTeam}-${match.awayTeam}-${match.kickoff}-${index}`}>
                  <CardHeader>
                    <div className="flex items-center justify-between gap-3">
                      <CardTitle className="text-lg">
                        {match.homeTeam} – {match.awayTeam}
                      </CardTitle>
                      <Badge variant={match.predictedOutcome === "abstain" ? "outline" : "default"}>
                        {match.predictedOutcome === "abstain"
                          ? "Abstention"
                          : (match.predictedScore ?? "Pronostic")}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {match.competition} · {match.kickoff ?? "Date non confirmée"}
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <Probability label="1" value={match.homeWinProbability} />
                      <Probability label="N" value={match.drawProbability} />
                      <Probability label="2" value={match.awayWinProbability} />
                    </div>
                    <p>{match.analysis}</p>
                    <p className="text-xs text-muted-foreground">
                      Confiance {match.confidence}% · Qualité des données {match.dataQuality}%
                    </p>
                    {match.decisiveFactors.length > 0 && (
                      <ul className="list-disc space-y-1 pl-5">
                        {match.decisiveFactors.map((factor) => (
                          <li key={factor}>{factor}</li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Sources consultées ({result.sources.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 sm:grid-cols-2">
                {result.sources.map((source) => (
                  <a
                    key={source.url}
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-start gap-2 rounded-md border p-3 text-sm hover:border-primary"
                  >
                    <ExternalLink className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      <strong>{source.title}</strong>
                      <br />
                      <span className="text-xs text-muted-foreground">{source.publisher}</span>
                    </span>
                  </a>
                ))}
              </CardContent>
            </Card>
            <p className="text-xs text-muted-foreground">{result.responsibleUseNotice}</p>
          </div>
        )}
      </div>
    </section>
  );
}

function Probability({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-muted p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-bold">{value.toFixed(1)}%</div>
    </div>
  );
}
