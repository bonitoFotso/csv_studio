# CLAUDE.md

Guide pour les sessions Claude Code futures sur ce dépôt. Le `README.md` documente le produit ;
ce fichier documente les conventions et pièges pour qui modifie le code.

## Commandes

```bash
bun run dev     # serveur de dev Vite (port 5173)
bun run test    # Vitest, tout le moteur (aucun test UI pour l'instant)
bun run build   # tsc -b && vite build
bun run lint    # oxlint
```

Toujours lancer `bun run test && npx tsc --noEmit -p tsconfig.app.json` avant de considérer un
changement terminé — le projet n'a pas de CI, ces deux commandes en tiennent lieu.

## Invariants du moteur — ne jamais les casser

- La table source d'un pipeline n'est **jamais mutée**. Toute étape produit une nouvelle `Table`.
- Une `Operation` référence ses colonnes par `ColumnId` **en interne**, jamais par nom. Les noms
  ne sont utilisés que dans les formats portables (`Recipe`, `ReportSpec`) via `toPortable`/`rebind`.
- Toute valeur de cellule est une `string`. Pas d'inférence de type destructive (pas de perte de
  zéro initial, pas de reformatage de date silencieux). Le typage détecté (`profile.ts`) sert
  uniquement à proposer les bons opérateurs, jamais à convertir la donnée.
- Aucun nom de colonne codé en dur, nulle part — y compris dans les gabarits de rapport à venir.
- Aucune requête réseau vers un tiers dans le code de l'app. La CSP de prod (`apps/web/public/_headers`)
  pose `connect-src 'self'`, pas `'none'` : le bouton d'export PDF charge sa police embarquée par
  `fetch()` (voir section Export PDF), mais strictement depuis l'origine de l'app elle-même (son
  propre asset bundlé) — jamais vers un domaine externe. Toute nouvelle requête `fetch`/XHR vers un
  domaine qui n'est pas celui de l'app romprait cet invariant.
- Le `Pipeline` est rejouable/désactivable/annulable étape par étape via `replay()`, qui tourne
  dans le Worker (`apps/web/src/worker/engine.worker.ts`) — jamais sur le thread principal pour une table
  de taille réelle.

## Ajouter une opération au moteur

Chaque opération vit dans `packages/core/src/engine/operations/<nom>.ts` et exporte un `OperationDefinition`
avec quatre membres : `type`, `apply(table, params, ctx)`, `toPortable(params, tableBeforeStep, ctx)`,
`rebind(portableParams, nameToId, ctx?)`. L'enregistrer dans `packages/core/src/engine/operations/index.ts`
(`registerAllOperations`) et ajouter son type à `OperationType` dans `packages/core/src/engine/types.ts`.

Si l'opération référence un second fichier (comme `enrich_join` ou `append_rows`), utiliser le
mécanisme `secondary` de `PortableParams`/`RebindContext` plutôt que d'en inventer un nouveau —
l'écran de remappage (`LoadRecipeDialog.tsx`) le gère déjà de façon générique pour toute étape
qui pose un champ `secondary`.

Écrire les tests dans le même fichier `<nom>.test.ts`, en même temps que le code, jamais après.
Un test qui échoue ne se contourne jamais en le désactivant ou en assouplissant son assertion.

## Pièges déjà rencontrés

- **Closures dans une boucle avec `let` muté** : dans `summarize.ts` (binning à largeur fixe), un
  premier essai capturait une variable `lo` mutée à chaque itération dans les fonctions `test` des
  tranches — toutes les tranches finissaient par tester avec les bornes de la *dernière* itération.
  Toujours créer un `const` frais par itération quand une closure doit capturer une valeur de boucle.
- **`toEqual` sur des `undefined`** : Vitest traite une propriété absente et une propriété valant
  `undefined` comme égales dans `toEqual` — utile pour les round-trips `toPortable`/`rebind` où un
  champ optionnel n'est pas toujours présent.
- **`import()` dynamique inefficace si le module est déjà importé statiquement ailleurs dans le
  même graphe** : tenter de charger `fuzzyJoin.ts` à la demande dans `engine.worker.ts` n'a rien
  changé à la taille du chunk — Vite l'a signalé lui-même (`INEFFECTIVE_DYNAMIC_IMPORT`) parce que
  `enrichJoin.ts` (une opération toujours enregistrée par `registerAllOperations()`) l'importe déjà
  de façon statique. Un `import()` ne déplace un module dans un chunk séparé que si **aucun** autre
  point d'entrée du même bundle ne l'importe statiquement — vérifier l'ensemble du graphe
  d'imports, pas seulement le site qu'on modifie, avant de croire qu'un `import()` réduit quoi que
  ce soit. Voir la section Performance du README pour le détail de cette tentative (phase 7).
- **Un import Node (`node:url`, `fileURLToPath`) au sommet d'un fichier casse le bundle navigateur
  même si le binding importé n'est jamais utilisé par l'appelant.** `fonts.ts` important `node:url`
  et `ReportDocument.tsx`/`charts.tsx` n'important de `fonts.ts` que la constante
  `REPORT_FONT_FAMILY` (pas `fileURLToPath`) n'empêche pas Vite de devoir résoudre `node:url` pour
  tout le module dès qu'un composant navigateur importe `fonts.ts` — la résolution de module
  précède l'élimination de code mort. Fix : extraire toute constante/donnée pure partagée entre un
  module Node-only et du code navigateur dans un fichier séparé sans aucun import (`fontFamily.ts`)
  plutôt que de compter sur le tree-shaking pour éliminer un import inutilisé.

## ReportSpec — format de rapport (moteur en place, pas encore d'UI)

`packages/core/src/engine/reportSpec.ts` (types), `reportSpecValidate.ts` (validation stricte, erreurs avec
chemin JSON précis), `reportSpecCompute.ts` (calcul des blocs contre une table + un remappage).
C'est une **sœur de `Recipe`**, pas un système parallèle : même mécanisme de remappage par nom
(`suggestColumnMapping`/`mappingIsComplete`/`buildNameToId`, exportées de `recipe.ts` et
réutilisées telles quelles, jamais dupliquées). Le vocabulaire JSON du `ReportSpec` utilise
volontairement `column` (au lieu du `name` interne à `Recipe`) et `normalization: "raw"` (au lieu
du `"none"` interne) — il colle à l'exemple donné dans `prompt-2-csv-studio-rapports-mcp.md`,
puisque ce fichier sera souvent généré par un assistant qui aura vu cet exemple précis. La
traduction vers les types moteur (`SummarizeParams`, `ColumnId`) se fait dans
`reportSpecCompute.ts`, jamais en dupliquant la logique d'agrégation elle-même.

Un bloc `chart` ne recalcule jamais rien : son champ `summarize` est résolu (noms -> `ColumnId`)
puis passé directement à `computeSummarizeTable` — l'unique implémentation de l'agrégation dans
tout le projet, partagée avec l'opération `summarize` du pipeline et l'export PDF.

## Export PDF (`apps/web/src/pdf/`)

- `reportGeometry.ts` : la seule couche qui calcule des positions de barres/points de ligne/parts
  de camembert (via `d3-scale`/`d3-shape`), **sans aucune dépendance au DOM**. Le futur aperçu
  écran devra consommer cette même couche plutôt que recalculer sa propre géométrie — un écart
  entre l'aperçu et le PDF exporté serait un bug ici, nulle part ailleurs.
- `charts.tsx` : traduit cette géométrie en primitives `@react-pdf/renderer` (`Svg`/`Path`/`Rect`/`Line`).
- `fontFamily.ts` : uniquement la constante `REPORT_FONT_FAMILY`, aucun import — `ReportDocument.tsx`/
  `charts.tsx` l'importent d'ici, pas de `fonts.ts`, pour rester bundleables côté navigateur sans
  tirer `node:url` dans leur graphe.
- `fonts.ts` : police Liberation Sans embarquée depuis `apps/web/src/pdf/fonts/*.ttf` (copiée du paquet
  système `fonts-liberation`, licence SIL OFL, voir `LICENSE-liberation-fonts.txt`) — jamais une
  URL distante. Résolution par chemin de fichier (`fileURLToPath`, Node uniquement) : utilisé
  seulement par les scripts (`generateSamples.ts`) et les tests (`exportReportPdf.test.ts`) qui
  tournent sous Bun/Node, jamais importé depuis un composant React.
- `fontsBrowser.ts` : même police, résolue en URL d'asset Vite (`new URL('./fonts/x.ttf',
  import.meta.url).href`, sans `fileURLToPath`) — utilisé par le bouton d'export PDF de l'app.
  `@react-pdf/renderer` charge la police par `fetch()` côté navigateur (il lui faut les octets
  bruts pour les incorporer au PDF) : voir `apps/web/public/_headers` pour la CSP correspondante
  (`connect-src 'self'`, un fetch same-origin de l'asset du bundle, jamais un appel réseau externe).
- `traceability.ts` : lit les décomptes `matchedAuto`/`matchedManual` structurés sur
  `OperationReport` (ajoutés cette nuit) plutôt que de reconstruire ces nombres depuis le texte
  libre de `notes` — si un futur champ de traçabilité manque sur `OperationReport`, l'ajouter
  structuré plutôt que parser un message.
- `exportReportPdf.tsx` : `renderReportPdfToBuffer`/`renderReportPdfToFile` (Node uniquement,
  `renderToBuffer`/`renderToFile` de `@react-pdf/renderer` n'existent pas côté navigateur) —
  utilisé par les tests et par le script qui génère `samples/*.pdf`, jamais par l'app.
- `exportReportPdfBrowser.tsx` : `renderReportPdfToBlob`, utilise `pdf(...).toBlob()` (API
  navigateur du même paquet) — chargé en `import()` dynamique par `ReportExportDialog.tsx`
  (`apps/web/src/components/report/`), jamais importé statiquement ailleurs dans l'app, pour que
  `@react-pdf/renderer` (~1,5 Mo) reste hors du bundle initial.

## Livrables de démonstration (`apps/web/scripts/`, `samples/`)

- `apps/web/scripts/generateSyntheticDataset.ts` : `generateSyntheticCandidates(count, seed)` —
  jeu de données reproductible (mulberry32) à graine fixe, avec accents, valeurs manquantes,
  virgule décimale française, et doublons volontaires exacts/quasi-exacts. `CandidateRow` a une
  signature d'index (`[key: string]: string`) en plus de ses champs nommés, pour rester assignable
  partout où le code générique attend un `Record<string, string>` (écriture CSV, construction de
  `Table`) sans cast à chaque site d'appel.
- `apps/web/scripts/generateSamples.ts` : orchestration bout en bout — génère le jeu de données,
  l'écrit en CSV, le fait passer par un vrai pipeline (`replay`), calcule un `ReportSpec` de
  démonstration dessus, et écrit les 4 fichiers dans `samples/` (à la racine du dépôt, deux niveaux
  au-dessus du script). Exécuter avec `bun run samples` (racine) après toute modification du moteur
  d'agrégation/rapport/PDF pour vérifier que les livrables restent cohérents. Les deux PDF
  contiennent un horodatage réel (`generatedAt: new Date().toISOString()` dans `traceability.ts`) :
  les régénérer produit un diff binaire attendu même sans changement de comportement, le CSV et le
  JSON eux restent strictement identiques d'une régénération à l'autre (jeu de données à graine fixe).
- `apps/web/tsconfig.scripts.json` : config Node dédiée (`types: ["node"]`, `include: ["scripts"]`
  seulement) pour typechecker `apps/web/scripts/` — `tsconfig.app.json` ne le couvre pas
  (`include: ["src"]`), et lui ajouter `src` en entier ferait remonter de fausses erreurs sur des
  fichiers navigateur (`main.tsx` et son import CSS) qui ont besoin des types `vite/client` que
  cette config n'a pas.
- `vitest.config.ts` (racine) inclut `apps/*/scripts/**/*.test.ts` en plus des tests de `packages/*/src`
  et `apps/*/src`.

## Monorepo (workspaces Bun)

```
packages/core/    @csv-studio/core — le moteur, TypeScript pur, aucune dépendance React/DOM/navigateur
apps/web/         @csv-studio/web — l'app actuelle, consomme @csv-studio/core
apps/mcp/         @csv-studio/mcp — serveur MCP stdio, six outils (voir section dédiée ci-dessous)
```

Mis en place à la phase 5 de la session NIGHT_RUN (voir `NIGHT_LOG.md`) : le moteur a été déplacé
tel quel dans `packages/core/src/engine/` (aucun fichier de test moteur modifié — seuls les chemins
d'import des *consommateurs* dans `apps/web` ont changé, de `@/engine/...` vers
`@csv-studio/core/engine/...`). `packages/core` expose aussi `csv.ts` (parsing/génération CSV sans
DOM — `parseCsvFile`, qui a besoin de l'objet `File` du navigateur, reste côté `apps/web/src/lib/csv.ts`
en fine enveloppe autour de `parseCsvText` du core) et `report.ts` (texte de rapport de pipeline).
`apps/web/src/pdf/` (export PDF) reste côté web : rien dans `apps/mcp` n'a besoin de générer un PDF
(`build_report` renverra des agrégats calculés, pas un fichier). Résolution entre workspaces via les
symlinks `node_modules/@csv-studio/*` posés par `bun install` et la carte `exports` de
`packages/core/package.json` (`"./*": "./src/*"`, imports profonds avec extension `.ts` explicite —
mêmes conventions `moduleResolution: bundler` partout).

## Serveur MCP (`apps/mcp/`)

Implémenté à la phase 6 de la session NIGHT_RUN. Stdio local uniquement, aucune connexion
sortante. Aucun SDK MCP n'est nommé dans `prompt-2-csv-studio-rapports-mcp.md` (règle absolue de
la nuit : jamais de dépendance non nommée) → le transport JSON-RPC 2.0 est écrit à la main plutôt
que de sauter la phase, le protocole stdio de MCP étant simple (un message JSON par ligne).

- `jsonrpc.ts` : types JSON-RPC 2.0 + `LineMessageParser` (reconstitue les lignes coupées entre
  deux chunks de stdin — cas explicitement testé).
- `server.ts` : `handleMessage(msg, ctx)` — dispatch `initialize`/`notifications/initialized`/
  `ping`/`tools/list`/`tools/call`. Distinction importante : une méthode inconnue ou une requête
  malformée devient une erreur JSON-RPC (`error.code`) ; un échec **d'outil** (fichier manquant,
  colonne introuvable, chemin hors du répertoire de travail) devient un résultat
  `{ content: [...], isError: true }` — convention MCP pour qu'un modèle voie l'échec comme une
  sortie d'outil normale, pas une exception qui casse la connexion.
- `workdir.ts` : confine tout accès disque au répertoire de travail passé en `argv[2]` au
  démarrage — comparaison sur le chemin résolu (`path.relative`), jamais un test de préfixe
  textuel (`/work-evil` ne doit pas passer pour un sous-dossier de `/work`).
- `bounded.ts` : plafond de réponse (30 lignes par défaut, 200 au plafond) — règle absolue du
  prompt : aucun outil ne renvoie jamais une table entière.
- `pipelineRun.ts` : réutilise `instantiateRecipe`/`replay` du core pour exécuter un pipeline JSON
  (même vocabulaire qu'une `Recipe`, colonnes par nom) — résolution de colonnes **strictement
  exacte**, contrairement à `suggestColumnMapping` côté app (pas d'écran de remappage possible
  dans un contexte non interactif pour confirmer une suggestion floue). Refuse explicitement les
  étapes `enrich_join`/`append_rows` (pas de champ `secondary` dans ce format de pipeline) — c'est
  `match_files` qui couvre le rapprochement à deux fichiers côté MCP.
- `tools/` : un fichier par outil (`profile_csv`, `preview_pipeline`, `apply_pipeline`,
  `match_files`, `find_duplicates`, `build_report`), chacun réutilisant directement les fonctions
  déjà testées du core plutôt que de dupliquer une logique parallèle.
- Vérifié avec un vrai processus (`bun run apps/mcp/src/index.ts <workdir>` piloté par de vraies
  lignes JSON-RPC sur stdin), pas seulement les tests unitaires du dispatcher — y compris une
  tentative de sortie du répertoire de travail, bien bloquée.
- Le pont app ↔ MCP (« Copier le profil pour un assistant ») est construit — voir
  `anonymize.ts`/`assistantExport.ts` ci-dessous, pas dans `apps/mcp` : c'est une fonctionnalité
  `apps/web`, le contrat n'est pas identique à `profile_csv` (échantillon anonymisé en plus, pas de
  `topValues`).

## Anonymisation et export « profil pour un assistant » (`packages/core/src/engine/`)

- `anonymize.ts` : `anonymizeValue(value, detectedType)` — jamais le contenu réel, seulement sa
  forme (longueur, séparateur décimal, format de date, casse). **Piège corrigé** : une colonne
  `decimal` a des valeurs individuelles qui ne matchent pas toujours `DECIMAL_RE` (ex. `"16"` sans
  séparateur) et retombent sur l'anonymisation texte — si ce repli ne touchait que les lettres
  (version initiale), un chiffre réel fuitait tel quel. Trouvé en vérifiant réellement dans un
  navigateur (presse-papiers relu après clic), pas seulement par les tests unitaires — le repli
  texte randomise maintenant aussi les chiffres. `buildAnonymizedSample(table, n)` anonymise les
  `n` premières lignes sans jamais muter `table`.
- `reportSpec.ts` : `REPORT_SPEC_FORMAT_GUIDE`, rappel condensé (pas la doc complète du README) du
  format `ReportSpec` — collé dans l'export pour qu'un assistant puisse écrire un document valide
  sans accès au dépôt.
- `assistantExport.ts` : `buildAssistantProfileExport(table)` assemble profil de colonnes (sans
  `topValues` ni exemples d'anomalie — ce sont de vraies valeurs de la donnée) + échantillon
  anonymisé + rappel `ReportSpec`, en Markdown. Bouton « Copier pour un assistant » dans
  `apps/web/src/App.tsx` (toolbar), copie via `navigator.clipboard.writeText`.

## Structure

```
packages/core/src/engine/          moteur pur — types, registre, replay, opérations
packages/core/src/engine/operations/  une opération = un fichier
packages/core/src/csv.ts, report.ts   parsing CSV et texte de rapport, sans DOM
apps/web/src/worker/           protocole + client + Worker (replay, doublons, rapprochement tournent ici)
apps/web/src/pdf/              export PDF (géométrie, polices, traçabilité, rendu react-pdf)
apps/web/src/components/       UI React, un dossier par fonctionnalité (columns/, filters/, join/, duplicates/, recipes/, append/, summarize/, report/)
apps/web/src/state/workspace.tsx  état global (React context + reducer), persistance Dexie débouncée/différentielle
apps/web/src/state/persistWorkspace.ts  logique pure de synchronisation Dexie (testée), extraite de workspace.tsx
apps/web/src/persistence/db.ts    schéma Dexie
apps/mcp/src/                  serveur MCP (jsonrpc.ts, server.ts, workdir.ts, tools/*)
apps/web/wrangler.toml         config Cloudflare Workers (assets statiques) — jamais exécutée
apps/web/public/_headers       cache + CSP pour le déploiement — jamais appliqué
```

## Déploiement

Déployé sur Cloudflare Workers (assets statiques) : **https://csv-studio.bonitofotso55.workers.dev**.
`apps/web/wrangler.toml` (`[assets]` → `./dist`, mode SPA) ; redéployer avec `bun run build` (depuis
la racine) puis `npx wrangler deploy` (depuis `apps/web/`, nécessite `wrangler whoami` authentifié).

`apps/web/public/_headers` (cache immuable sur `/assets/*`, `no-cache` sur `index.html`, CSP
stricte). Points à retenir si tu modifies la CSP : `worker-src 'self'` est nécessaire (le Web
Worker est au cœur de l'app), `style-src 'unsafe-inline'` aussi (largeurs en style React inline
dans `DataGrid.tsx`/`ColumnProfilePanel.tsx`/`busy-indicator.tsx`), `connect-src 'self'` pour le
fetch same-origin de la police embarquée du bouton d'export PDF. `script-src` a besoin de
`'self' 'wasm-unsafe-eval'` — **pas** `'unsafe-eval'` (aucun `eval()`/`new Function` nulle part
dans le projet, vérifié par recherche exhaustive) : `'wasm-unsafe-eval'` autorise spécifiquement
`WebAssembly.instantiate()` sans autoriser l'évaluation de chaînes JS arbitraires. Voir « Export
PDF » ci-dessus pour pourquoi WebAssembly est nécessaire (fontkit, dans `@react-pdf/renderer`).

**Piège découvert en production, invisible en local** : le serveur de dev Vite n'applique
**aucune** CSP — un problème de CSP (comme l'oubli initial de `'wasm-unsafe-eval'`, qui cassait la
génération PDF avec `WebAssembly.instantiate() blocked by CSP`) ne peut être détecté qu'après un
vrai déploiement, jamais par un test en local aussi poussé soit-il (même un test réel dans un
navigateur headless piloté par CDP ne l'aurait pas vu, puisqu'il ciblait le serveur de dev). Après
toute modification de la CSP touchant à une fonctionnalité réseau/WebAssembly/Worker, redéployer et
retester contre l'URL réelle, pas seulement `bun run dev`.

## Session NIGHT_RUN (agrégation, rapports PDF, monorepo, MCP)

Une session autonome a démarré le 2026-07-30 pour implémenter `prompt-2-csv-studio-rapports-mcp.md`.
Voir `NIGHT_LOG.md` pour l'état détaillé phase par phase et les décisions prises sans pouvoir
demander confirmation. Chaque phase vit sur sa propre branche `night/<n>-<nom>`, non fusionnée —
**mais quand une phase dépend du code d'une phase précédente** (ex. phase 2 a besoin de
`summarize.ts` de la phase 1), sa branche part de la branche de cette phase précédente, pas de
`main` (qui ne reçoit jamais aucun merge de travail de nuit). Relire les branches dans l'ordre des
phases pour cette raison.
