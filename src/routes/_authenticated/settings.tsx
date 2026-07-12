import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CheckCircle2, Eye, EyeOff, KeyRound, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  deleteOpenAiApiKey,
  getAiSettings,
  saveOpenAiApiKey,
  testOpenAiConnection,
} from "@/lib/settings.functions";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
  head: () => ({ meta: [{ title: "Configuration IA — OddsIQ" }] }),
});

function SettingsPage() {
  const queryClient = useQueryClient();
  const [apiKey, setApiKey] = useState("");
  const [visible, setVisible] = useState(false);
  const settings = useQuery({ queryKey: ["ai-settings"], queryFn: () => getAiSettings() });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["ai-settings"] });

  const save = useMutation({
    mutationFn: () => saveOpenAiApiKey({ data: { apiKey } }),
    onSuccess: () => {
      setApiKey("");
      setVisible(false);
      toast.success("Clé OpenAI chiffrée et enregistrée.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: () => deleteOpenAiApiKey(),
    onSuccess: () => {
      toast.success("Clé personnelle supprimée.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const test = useMutation({
    mutationFn: () => testOpenAiConnection(),
    onSuccess: (result) => {
      toast.success(
        `Connexion OpenAI validée avec ${result.model} (${result.source === "personal" ? "clé personnelle" : "clé serveur"}).`,
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const configured = settings.data?.personalKeyConfigured ?? false;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
          <ShieldCheck className="h-4 w-4" /> Configuration serveur sécurisée
        </div>
        <h1 className="font-display text-3xl font-bold">Configuration IA</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Ta clé personnelle est transmise au serveur puis chiffrée dans Supabase Vault. Elle n'est
          jamais renvoyée à ton navigateur, affichée dans les logs ou enregistrée dans le dépôt
          GitHub.
        </p>
      </div>

      <section className="rounded-xl border border-border bg-card p-6 shadow-lg">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
              <KeyRound className="h-5 w-5 text-primary" /> Clé API OpenAI
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Modèle actif :{" "}
              <span className="font-mono text-foreground">{settings.data?.model ?? "gpt-5.5"}</span>
            </p>
          </div>
          {settings.isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                configured ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-300"
              }`}
            >
              {configured
                ? "Clé personnelle configurée"
                : settings.data?.applicationKeyConfigured
                  ? "Clé serveur active"
                  : "Non configurée"}
            </span>
          )}
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
          className="space-y-4"
        >
          <div>
            <Label htmlFor="openai-api-key">
              {configured ? "Remplacer la clé" : "Renseigner la clé"}
            </Label>
            <div className="relative mt-1.5">
              <Input
                id="openai-api-key"
                type={visible ? "text" : "password"}
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="sk-proj-…"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                minLength={20}
                maxLength={300}
                required
                className="pr-11 font-mono"
              />
              <button
                type="button"
                onClick={() => setVisible((current) => !current)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={visible ? "Masquer la clé" : "Afficher la clé"}
              >
                {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              La valeur ne sera plus consultable après l'enregistrement. Tu pourras uniquement la
              remplacer ou la supprimer.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={save.isPending || apiKey.trim().length < 20}>
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {configured ? "Remplacer la clé" : "Enregistrer la clé"}
            </Button>
            {configured && (
              <Button
                type="button"
                variant="destructive"
                onClick={() => remove.mutate()}
                disabled={remove.isPending}
              >
                <Trash2 className="mr-2 h-4 w-4" /> Supprimer
              </Button>
            )}
            <Button
              type="button"
              variant="secondary"
              onClick={() => test.mutate()}
              disabled={test.isPending || settings.isLoading}
            >
              {test.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              )}
              Tester la clé et le service IA
            </Button>
          </div>
        </form>
      </section>
    </main>
  );
}
