# Plan — App de pronostics sportifs IA

## Vision
Une app qui liste les matchs en cours (multi-sports), et pour chaque match/compétition sélectionné, agrège automatiquement les infos joueurs (blessures, forme, confrontations, forces/faiblesses) puis génère des pronostics IA détaillés avec probabilités.

## Sports couverts (v1)
Football, Basket (NBA/Euroleague), Tennis (ATP/WTA), Rugby, MMA/UFC.

## Écrans

1. **Accueil / Matchs en direct** — Grille de matchs regroupés par sport et compétition, filtres (sport, ligue, date, live/à venir), recherche.
2. **Détail Match** — Composition, cotes indicatives, forme récente des équipes, historique H2H, blessures/suspensions, puis section **Pronostic IA** générée à la demande.
3. **Détail Compétition** — Classement, matchs à venir, pronostic global de la journée.
4. **Détail Joueur** — Stats saison, blessures, forme, forces/faiblesses (analyse IA).
5. **Mes pronostics** — Historique perso des pronostics consultés/suivis, avec statut (gagné/perdu/en attente) et taux de réussite.
6. **Auth** — Email/mot de passe + Google.

## Types de pronostics générés par l'IA
Pour chaque match, l'IA produit un rapport structuré :
- Résultat 1N2 (victoire / nul / défaite) + probabilités
- Score exact le plus probable + alternatives
- Nombre total de buts / points (over-under)
- Buteurs probables (foot) / meilleur marqueur (basket) / sets (tennis) / KO round (MMA)
- Handicap
- Paris combinés suggérés
- Niveau de confiance global + facteurs clés (blessures, forme, terrain, motivation)
- Justification en langage naturel

## Architecture technique

### Backend (Lovable Cloud)
- **Auth** : email/password + Google, table `profiles` liée à `auth.users`
- **Tables** :
  - `profiles` (id, display_name, avatar_url)
  - `saved_predictions` (id, user_id, match_id, sport, prediction_json, created_at, actual_outcome, status)
  - `matches_cache` (id, sport, competition, home, away, start_time, raw_data jsonb, cached_at) — cache des données API
  - `predictions_cache` (match_id, prediction_json, generated_at) — évite re-générer l'IA
- RLS : chaque user lit/écrit uniquement ses `saved_predictions`; caches en lecture publique.

### Données sportives (hybride)
- **API sportive** pour la liste des matchs live et stats de base : nécessite une clé API (**API-Football** via RapidAPI recommandé, couvre foot + autres sports; ou **TheSportsDB** gratuit en fallback). L'utilisateur devra fournir la clé.
- **Firecrawl** (connecteur Lovable) pour scraper contextuellement : news blessures, previews de match, forme récente sur sites spécialisés.
- Résultats mis en cache dans `matches_cache` (TTL 5 min pour live, 1h pour à venir).

### IA (Lovable AI Gateway)
- Modèle : `openai/gpt-5.5` (défaut)
- Server function `generatePrediction(matchId)` :
  1. Récupère les données brutes du match depuis le cache/API
  2. Lance en parallèle : recherches Firecrawl (blessures, forme, H2H, previews)
  3. Assemble un contexte structuré
  4. Appelle l'IA avec un prompt de pronostiqueur expert + `Output.object` schéma structuré (résultat, score, marqueurs, confiance, justification)
  5. Cache le résultat 30 min

### Server functions (TanStack `createServerFn`)
- `listLiveMatches({ sport?, date? })` — public
- `getMatchDetails(matchId)` — public
- `generatePrediction(matchId)` — public (avec rate-limit par IP/user)
- `savePrediction(matchId)` — auth requise
- `listMyPredictions()` — auth requise (`requireSupabaseAuth`)
- `getPlayerProfile(playerId, sport)` — public

### Routes
- `/` — matchs en direct
- `/sport/$sport` — matchs par sport
- `/match/$sport/$matchId` — détail + pronostic
- `/competition/$sport/$competitionId`
- `/player/$sport/$playerId`
- `/auth` — login/signup (public)
- `/_authenticated/my-predictions` — historique perso

## Secrets nécessaires
- `LOVABLE_API_KEY` (auto)
- `SPORTS_API_KEY` (API-Football via RapidAPI — l'utilisateur devra en créer une, ~gratuit 100 req/j)
- `FIRECRAWL_API_KEY` (via connecteur)

## Design
Sombre sport-tech : fond noir/anthracite, accents vert néon (win) et rouge pour les côtes, typographie condensée (Inter + JetBrains Mono pour chiffres/cotes), cartes de match denses type terminal de trading sportif, avec live indicators animés.

## Étapes d'implémentation
1. Activer Lovable Cloud + configurer auth (email + Google)
2. Créer schéma DB (profiles, saved_predictions, caches) + RLS + trigger profile auto
3. Connecter Firecrawl + demander clé API sportive à l'utilisateur
4. Écrire server functions (matchs, détails, pronostic IA, favoris)
5. Créer design system dark sport + composants (MatchCard, PredictionPanel, ConfidenceGauge, TeamStats)
6. Implémenter routes et pages
7. Route `/auth` + layout `_authenticated`
8. Head/SEO par route

## Avertissement légal
Bandeau permanent : "Pronostics à titre informatif. Les paris comportent des risques. 18+."

Prêt à construire ?