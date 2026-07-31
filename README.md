# CSV Studio

Application 100 % côté navigateur pour dédoublonner, rapprocher et nettoyer des CSV. Aucun backend, aucune donnée n'est envoyée sur le réseau. Fonctionne hors ligne après le premier chargement ; le travail en cours est persisté localement (IndexedDB) et retrouvé à la réouverture de l'onglet.

## Lancer le projet

```bash
bun install       # installe les 3 workspaces (packages/core, apps/web, apps/mcp)
bun run dev       # serveur de dev Vite (apps/web)
bun run test      # tests du moteur et du script de livrables (Vitest, tous workspaces)
bun run build     # typecheck de packages/core puis build de production d'apps/web
bun run samples   # régénère samples/ (CSV, ReportSpec, PDF brouillon/officiel de démonstration)
```

## Monorepo

Workspaces Bun : `packages/core` (moteur pur, aucune dépendance React/DOM/navigateur — types,
opérations, agrégation, validation de `Recipe`/`ReportSpec`, parseurs CSV), `apps/web` (l'app,
consomme `@csv-studio/core`), `apps/mcp` (serveur MCP stdio — voir ci-dessous et `CLAUDE.md` pour
le détail de la répartition).

## Serveur MCP (`apps/mcp/`)

Serveur MCP **stdio local uniquement** : lit des fichiers CSV sur le disque, n'ouvre aucune
connexion sortante. Transport JSON-RPC 2.0 écrit à la main (aucun SDK MCP ajouté). Six outils —
`profile_csv`, `preview_pipeline`, `apply_pipeline`, `match_files`, `find_duplicates`,
`build_report` — chacun réutilisant directement les fonctions déjà testées de `@csv-studio/core`.
Toute réponse est bornée : jamais une table entière, toujours un résumé, un échantillon plafonné
(30 lignes par défaut, 200 au plafond configurable) et le total réel annoncé avec un indicateur de
troncature. Les écritures (`apply_pipeline`, `match_files` avec un chemin de sortie) n'écrasent
jamais un fichier existant sans `overwrite: true`, et restent confinées au répertoire de travail
passé au démarrage.

```bash
bun run apps/mcp/src/index.ts /chemin/vers/le/répertoire/de/travail
```

Pas encore fait : le bouton « Copier le profil pour un assistant » dans l'app (pont app ↔ MCP
décrit dans le prompt de conception) n'est pas construit — voir `NIGHT_LOG.md`, phase 6.

## État actuel

- **Moteur** (`packages/core/src/engine/`) : types, registre d'opérations, rejeu, undo/redo, édition en place du pipeline, profil de colonnes, recette + remappage par nom (y compris pour un rapprochement à deux fichiers). Testé (Vitest).
- **Colonnes / normalisation / filtres** : renommer, réordonner (glisser l'en-tête), supprimer (avec confirmation), masquer/afficher, dupliquer ; ajout de colonne (constante, concaténation, extraction, numérotation, expression simple) ; normalisation (trim, espaces, casse, accents, ponctuation, chiffres seuls, écraser ou nouvelle colonne) ; filtres avec groupes ET/OU, opérateurs selon le type détecté, aperçu du nombre de lignes concernées avant d'appliquer.
- **Doublons** : détection par groupe (clés libres, comparaison exacte ou normalisée), bloc par groupe avec cellules divergentes surlignées, action par défaut ou par groupe, export des doublons vers une nouvelle table.
- **Rapprochement exact et flou** (bouton « Rapprocher ») : import d'un second fichier, paires de colonnes-clés, collisions de noms, jointure gauche/interne, cas 1→N (première/agrégation/signalement). En mode flou : normalisation + comparaison par jetons non ordonnés, score Jaro-Winkler/Levenshtein, blocage obligatoire, deux seuils, écran de validation manuelle pair-à-pair (Valider/Rejeter/Passer au clavier). Les décisions manuelles sont indexées par valeurs de clé normalisées et voyagent avec la recette. Le résumé indique aussi combien de lignes du **fichier de droite** n'ont jamais été retenues par personne (utile quand le fichier de droite est plus petit que le fichier de gauche) : un écran dédié liste ces lignes, permet de les exporter, ou d'apparier manuellement l'une d'elles à une ligne de gauche précise — même si le blocage les avait exclues de toute comparaison automatique.
- **Normalisation des clés avant comparaison** : chaque paire de colonnes-clés (rapprochement exact) et chaque critère de blocage (rapprochement flou) a son propre mode — *brute* (comparaison telle quelle), *texte* (casse, accents, ponctuation, espaces ignorés) ou *date* (« 19/07/2026 », « 19-07-2026 », « 9/7/2026 » et « 2026-07-19 » sont reconnus comme la même date, quel que soit le séparateur ou le zéro-padding). Par défaut « texte » pour toute nouvelle paire — s'ajuste par colonne, pas globalement, puisqu'une clé composite mélange souvent un champ texte et un champ date.
- **Ajouter des lignes depuis un fichier** (bouton « Ajouter des lignes ») : importe un second fichier et, pour chaque colonne de la table active, permet de choisir la colonne correspondante à copier (pré-rempli par similarité de nom) ; les lignes du fichier importé sont ajoutées à la fin, les colonnes non mappées restent vides sur ces nouvelles lignes. Distinct du rapprochement : celui-ci ajoute des *colonnes*, celui-là ajoute des *lignes*.
- **Persistance & recettes** : l'espace de travail (tables, pipelines, fichiers de droite) est sauvegardé dans IndexedDB (Dexie) à chaque changement et restauré au chargement. Une recette (pipeline sans données) peut être enregistrée (Dexie + export `.json`) et rechargée sur un autre fichier via un écran de remappage — colonnes principales et, le cas échéant, colonnes du second fichier d'un rapprochement ou d'un ajout de lignes, chacune pré-remplie par similarité de nom mais jamais devinée silencieusement.
- **Web Worker** (`apps/web/src/worker/`) : le rejeu du pipeline, le calcul des groupes de doublons et le rapprochement (exact et flou) tournent hors du thread principal, jamais l'UI ne gèle. Barre de progression (réelle pour le rapprochement flou — le calcul le plus coûteux — indéterminée ailleurs), affichée seulement au-delà de 150 ms. Annulation de l'aperçu flou en cours dès que la config change. Détail de la conception dans `WEB_WORKER.md`.
- **Résumer (agrégation / tableau croisé)** (bouton « Résumer ») : opération `summarize` qui produit une table dérivée à une granularité différente — regroupement sur une ou plusieurs colonnes (chacune avec sa propre normalisation brute/texte/date), agrégats (`count`, `countDistinct`, `countNonEmpty`, `sum`, `avg`, `min`, `max`, `median`, `first`, `concat`), et binning numérique en tranches (largeur fixe, nombre de tranches, ou bornes explicites) — les tranches vides restent visibles avec un compte de zéro et gardent leur ordre naturel. Parsing de nombre tolérant à la virgule décimale française et aux espaces de milliers (normal, insécable, fine insécable) ; une cellule vide est exclue d'une moyenne, jamais comptée comme zéro. Comme toute autre étape, c'est rejouable/désactivable/annulable et calculé dans le Worker.
- **Format `ReportSpec` (moteur seulement, pas encore d'UI)** : `packages/core/src/engine/reportSpec.ts` définit un format de rapport JSON portable, sœur de `Recipe` — mêmes principes (colonnes référencées par nom, `expectedColumns`, remappage obligatoire pré-rempli par similarité). Cinq types de blocs : `text`, `kpi_row`, `chart` (barres verticales/horizontales, barres empilées, lignes, secteurs/anneau, histogramme — le champ `summarize` d'un bloc `chart` est passé tel quel à l'opération `summarize`, aucun recalcul séparé), `table` (avec filtre et troncature `maxRows`), `page_break`. `validateReportSpec` collecte toutes les erreurs d'un document malformé en un seul passage, avec un chemin JSON précis par erreur (ex. `blocks[2].summarize.groupBy[0].column`) plutôt qu'un échec silencieux.
- **Export PDF (`apps/web/src/pdf/`, moteur prêt, pas encore de bouton dans l'app)** : rendu vectoriel réel (texte sélectionnable, pas de capture d'écran) via `@react-pdf/renderer`, graphiques dessinés avec `d3-scale`/`d3-shape` dans une couche géométrique commune sans DOM (`reportGeometry.ts`) — le futur aperçu écran et le PDF partageront exactement les mêmes calculs. Police Liberation Sans embarquée en local (aucune requête réseau), séries de graphique distinguables imprimées en noir et blanc (palette à luminance échelonnée + hachures/pointillés selon le type). Deux modes : **brouillon** (filigrane, bloc de traçabilité complet — fichiers sources, recette, étapes du pipeline avec comptes d'entrée/sortie, appariements auto/manuels, non-appariés) et **officiel** (en-tête avec logo et nom de structure, pagination réelle, traçabilité condensée en pied de page). Les deux modes produisent strictement les mêmes chiffres, seule la présentation change. L'éditeur de rapport (glisser-déposer des blocs, etc.) n'est volontairement pas construit cette nuit.
- **Livrables de démonstration (`samples/`)** : générés par `bun run samples` (`apps/web/scripts/generateSamples.ts`) — un jeu de données synthétique reproductible de 500 candidats (`candidats-session-juillet-2026.csv`, avec accents, valeurs manquantes, doublons volontaires exacts et quasi-exacts), passé par un vrai pipeline de dédoublonnage puis résumé par un `ReportSpec` de démonstration à 7 blocs (`report-spec.json`), exporté en `rapport-brouillon.pdf` et `rapport-officiel.pdf`. Ces fichiers illustrent bout en bout la chaîne CSV → pipeline → ReportSpec → PDF sur un cas réaliste, pas un exemple jouet. Les deux PDF embarquent un horodatage réel, donc les régénérer change toujours leurs octets même sans changement de comportement ; le CSV et le JSON, eux, sont strictement reproductibles (graine fixe).
- **Pas encore fait** : export XLSX (CSV uniquement pour l'instant, par choix explicite), éditeur de rapport WYSIWYG et bouton d'export PDF dans l'interface (moteur et rendu prêts, UI à venir).

## Modèle du moteur

- `Table` : colonnes (`ColumnId` stable) + lignes (toutes les valeurs en `string`). La table source n'est jamais mutée.
- `Operation` : `{ id, type, enabled, params }`, params référencent toujours les colonnes par `ColumnId`, jamais par nom.
- `Pipeline` : liste ordonnée de `PipelineStep` + un `cursor`. Undo/redo = déplacer `cursor`. Désactiver/modifier/supprimer une étape au milieu recalcule tout depuis la table source (`replay`).
- `Recipe` : le pipeline exporté en JSON, sans données. Les colonnes y sont référencées **par nom** (portable d'un fichier à l'autre) ; le rejeu passe par un écran de remappage nom → colonne réelle. Une étape `enrich_join` ou `append_rows` porte en plus un bloc `secondary` (nom et colonnes attendues du second fichier), remappé séparément au rejeu.

## Format d'une recette (JSON)

```json
{
  "id": "…",
  "name": "Rapprochement présence + notes",
  "formatVersion": 1,
  "createdAt": "2026-07-30T10:00:00.000Z",
  "expectedColumns": ["nom", "prenom", "date_naissance"],
  "steps": [
    {
      "type": "normalize_columns",
      "enabled": true,
      "params": { "columnNames": ["nom"], "steps": ["trim", "upper"], "mode": "overwrite" }
    },
    {
      "type": "enrich_join",
      "enabled": true,
      "params": {
        "matchStrategy": "exact",
        "keyPairs": [{ "leftName": "nom", "rightName": "nom_complet", "normalization": "text" }],
        "copyColumns": [{ "rightName": "nb_presences", "asName": "nb_presences" }],
        "collision": "suffix",
        "joinType": "left",
        "multiMatch": "first"
      },
      "secondary": { "tableName": "presence", "expectedColumns": ["nom_complet", "nb_presences"] }
    }
  ]
}
```

Au chargement sur un nouveau fichier, chaque nom dans `expectedColumns` (et, pour une étape `enrich_join` ou `append_rows`, chaque nom dans `steps[i].secondary.expectedColumns` une fois le second fichier réimporté) est proposé au remappage — pré-rempli par similarité, jamais deviné silencieusement — avant que le pipeline ne soit reconstruit et exécutable.

## Format d'un ReportSpec (JSON)

```json
{
  "formatVersion": 1,
  "kind": "report",
  "title": "Rapport de session — Formation mototaxi",
  "subtitle": "Session de juillet 2026",
  "expectedColumns": ["nom", "prenom", "nb_presences", "note", "decision"],
  "blocks": [
    { "type": "text", "content": "Contexte de la session…" },
    {
      "type": "kpi_row",
      "items": [
        { "label": "Candidats", "agg": { "fn": "count" } },
        { "label": "Moyenne", "agg": { "fn": "avg", "column": "note" } }
      ]
    },
    {
      "type": "chart",
      "chartType": "bar",
      "title": "Répartition des décisions",
      "summarize": {
        "groupBy": [{ "column": "decision", "normalization": "text" }],
        "aggregates": [{ "fn": "count", "asName": "effectif" }]
      },
      "x": "decision",
      "series": [{ "column": "effectif", "label": "Candidats" }]
    },
    {
      "type": "table",
      "title": "Candidats non appariés",
      "columns": ["nom", "prenom"],
      "maxRows": 200
    },
    { "type": "page_break" }
  ]
}
```

`normalization` accepte `"raw"` (comparaison brute — équivalent JSON du `"none"` interne du moteur), `"text"`, ou `"date"`, exactement comme le rapprochement. Le champ `summarize` d'un bloc `chart` est passé tel quel à l'opération `summarize` du moteur (`packages/core/src/engine/operations/summarize.ts`) une fois ses noms de colonnes résolus — un graphique ne recalcule jamais rien lui-même. `validateReportSpec` (`packages/core/src/engine/reportSpecValidate.ts`) rejette un document malformé avec une liste d'erreurs précises (chemin JSON + message actionnable) plutôt qu'un échec silencieux ; `computeReport` (`packages/core/src/engine/reportSpecCompute.ts`) calcule les données de chaque bloc contre une table et un remappage confirmés, sans jamais modifier la table.

## Stack

React + TypeScript + Vite, Tailwind v4 (primitives façon shadcn/ui écrites à la main : cva + tailwind-merge, pas de CLI), PapaParse (import/export CSV), Dexie (persistance IndexedDB), TanStack Table + react-virtual (grille virtualisée), Web Worker natif (rejeu/doublons/rapprochement), Vitest (tests moteur).
