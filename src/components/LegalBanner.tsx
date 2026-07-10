import { AlertTriangle } from "lucide-react";

export function LegalBanner() {
  return (
    <div className="border-t border-border bg-surface/50 px-4 py-2 text-center text-[11px] uppercase tracking-wider text-muted-foreground">
      <div className="mx-auto flex max-w-7xl items-center justify-center gap-2">
        <AlertTriangle className="h-3 w-3" />
        Pronostics à titre informatif — les paris comportent des risques — Interdit aux moins de 18 ans
      </div>
    </div>
  );
}
