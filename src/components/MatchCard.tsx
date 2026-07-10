import { Link } from "@tanstack/react-router";
import type { MatchSummary } from "@/lib/matches.functions";
import { sportFromKey } from "@/lib/sports";
import { Clock, MapPin } from "lucide-react";

function formatTime(iso: string | null) {
  if (!iso) return "TBD";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const opts: Intl.DateTimeFormatOptions = sameDay
    ? { hour: "2-digit", minute: "2-digit" }
    : { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" };
  return d.toLocaleString("fr-FR", opts);
}

function isLive(status: string) {
  const s = status.toLowerCase();
  return /live|1st|2nd|half|inplay|in progress|q\d|set \d/i.test(s) && !s.includes("full time");
}

export function MatchCard({ match }: { match: MatchSummary }) {
  const sport = sportFromKey(match.sport);
  const live = isLive(match.status);
  const finished = /ft|finished|full time|final/i.test(match.status);

  return (
    <Link
      to="/match/$sport/$matchId"
      params={{ sport: match.sport, matchId: match.id }}
      className="group block rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/60 hover:bg-surface-2"
    >
      <div className="mb-3 flex items-center justify-between text-[11px] uppercase tracking-wider text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="text-base">{sport.emoji}</span>
          <span className="truncate max-w-[180px]">{match.competition}</span>
        </span>
        {live ? (
          <span className="flex items-center gap-1.5 rounded bg-live/15 px-2 py-0.5 font-semibold text-live">
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-live" />
            LIVE
          </span>
        ) : finished ? (
          <span className="rounded bg-muted px-2 py-0.5">Terminé</span>
        ) : (
          <span className="flex items-center gap-1 tabular"><Clock className="h-3 w-3" />{formatTime(match.startTime)}</span>
        )}
      </div>

      <div className="space-y-2">
        <TeamRow name={match.homeTeam} badge={match.homeBadge} score={match.homeScore} />
        <TeamRow name={match.awayTeam} badge={match.awayBadge} score={match.awayScore} />
      </div>

      {match.venue && (
        <div className="mt-3 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
          <MapPin className="h-3 w-3" />
          {match.venue}
        </div>
      )}
    </Link>
  );
}

function TeamRow({ name, badge, score }: { name: string; badge: string | null; score: string | null }) {
  return (
    <div className="flex items-center gap-3">
      {badge ? (
        <img src={badge} alt="" className="h-6 w-6 shrink-0 object-contain" loading="lazy" />
      ) : (
        <div className="h-6 w-6 shrink-0 rounded-full bg-surface-2" />
      )}
      <span className="flex-1 truncate text-sm font-medium">{name}</span>
      <span className="tabular text-sm font-bold text-foreground">{score ?? "—"}</span>
    </div>
  );
}
