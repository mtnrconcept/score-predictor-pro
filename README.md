# OddsIQ — Score Predictor Pro Intelligence v0.4.0

Application TanStack Start de pronostics football combinant un moteur statistique déterministe et une analyse éditoriale OpenAI structurée.

## Ce que fait la v0.4.0

- Modèle de buts Poisson corrigé Dixon-Coles.
- Ajustement Elo, avantage du terrain, forme à décroissance temporelle, xG, fatigue et absences.
- Intervalles d'incertitude, qualité des données et abstention automatique.
- Résolution des équipes et matchs entre fournisseurs.
- Import API-Football via une Edge Function protégée.
- Import public gratuit de 30 compétitions via ESPN, dont les 104 matchs de la Coupe du monde 2026.
- OpenAI Responses API avec Structured Outputs Zod stricts et `gpt-5.6-sol` par défaut.
- Clé OpenAI globale côté serveur ou clé personnelle chiffrée dans Supabase Vault.
- Quotas journaliers atomiques selon l'offre utilisateur.
- Historique des exécutions, cache, RLS, tests unitaires et CI GitHub Actions.

## Architecture

1. `import-football` importe les rencontres et, à la demande, les statistiques, xG, compositions et blessures.
   `import-public-football` complète gratuitement le calendrier avec les compétitions ESPN publiques.
   `prediction-ai` exécute la génération OpenAI et les écritures privilégiées dans Supabase : Vercel
   n'a besoin d'aucune clé de rôle service.
2. La résolution d'entités rapproche une rencontre TheSportsDB de son équivalent canonique.
3. `prediction-engine.ts` calcule les probabilités, scores et incertitudes sans IA générative.
4. OpenAI explique les résultats avec un schéma strict. Les valeurs quantitatives sont réinjectées après la réponse afin que le modèle ne puisse pas les modifier.
5. Le moteur s'abstient lorsque les données sont trop faibles ou qu'aucune issue ne se détache.

## Installation locale

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Renseigner les variables Supabase publiques et serveur dans `.env.local`. Ne jamais placer `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `SPORTS_PROVIDER_API_KEY` ou le secret partagé dans une variable `VITE_*`.

## Configuration de la clé OpenAI

Deux modes sont disponibles :

- `OPENAI_API_KEY` dans l'environnement serveur pour une clé commune à l'application ;
- la page `/settings` pour une clé personnelle. La valeur passe par une fonction serveur authentifiée et est chiffrée dans Supabase Vault. Le navigateur ne peut ensuite ni la relire ni l'exporter.

La clé personnelle a priorité sur la clé globale. Le modèle principal peut être changé avec
`OPENAI_MODEL` et le modèle de recherche Edge avec `OPENAI_RESEARCH_MODEL`. Une ancienne valeur
`gpt-5.5` est automatiquement migrée vers `gpt-5.6-sol`.

## Supabase

Inspecter d'abord l'état des migrations :

```bash
npx supabase migration list
npx supabase db lint
```

Valider localement avec Docker disponible :

```bash
npx supabase start
npx supabase db reset
npx supabase db lint --local
```

Avant un déploiement distant, exécuter `npx supabase db push --dry-run --linked`, examiner intégralement la sortie, puis seulement effectuer le push réel. La migration v0.4.0 est additive et ne supprime aucune donnée.

Secrets des Edge Functions :

```bash
npx supabase secrets set OPENAI_API_KEY=... SPORTS_PROVIDER_API_KEY=... PREDICTION_ENGINE_SHARED_SECRET=...
```

Pour le déploiement GitHub Actions, configurer les secrets du dépôt
`OPENAI_API_KEY` et `SUPABASE_ACCESS_TOKEN`. Le workflow
`Deploy Supabase AI` synchronise ensuite la clé vers le runtime Supabase,
déploie les fonctions IA et exécute des contrôles sans afficher la valeur.

Déploiement :

```bash
npx supabase functions deploy import-football
npx supabase functions deploy import-public-football
npx supabase functions deploy settle-predictions
```

Import public de la Coupe du monde 2026 :

```bash
curl -X POST "https://PROJECT_REF.supabase.co/functions/v1/import-public-football" \
  -H "content-type: application/json" \
  -H "x-shared-secret: $PREDICTION_ENGINE_SHARED_SECRET" \
  -d '{"year":2026,"competitions":["fifa.world"]}'
```

Passer `"all":true` importe le catalogue complet. L'import est idempotent : les équipes et matchs
sont mis à jour par leurs identifiants fournisseur sans duplication.

Exemple d'import programmé :

```bash
curl -X POST "https://PROJECT_REF.supabase.co/functions/v1/import-football" \
  -H "content-type: application/json" \
  -H "x-shared-secret: $PREDICTION_ENGINE_SHARED_SECRET" \
  -d '{"date":"2026-07-11"}'
```

Un backfill historique peut importer jusqu'à 31 jours par appel afin de respecter les limites du fournisseur :

```bash
curl -X POST "https://PROJECT_REF.supabase.co/functions/v1/import-football" \
  -H "content-type: application/json" \
  -H "x-shared-secret: $PREDICTION_ENGINE_SHARED_SECRET" \
  -d '{"from":"2026-06-01","to":"2026-06-30"}'
```

## Validation

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Limites responsables

Un pronostic reste une estimation probabiliste. Les sorties ne constituent ni une garantie ni un conseil financier. L'interface affiche la qualité des données, l'incertitude et les raisons d'abstention. Paris réservés aux personnes majeures et soumis à la réglementation locale.
