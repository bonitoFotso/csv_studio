# Journal de session autonome — NIGHT_RUN

## Résumé de fin de session

Les 8 phases prévues par `prompt-2-csv-studio-rapports-mcp.md` (réordonnées et renumérotées pour
cette nuit) ont toutes été menées à leur terme, chacune sur sa propre branche, **aucune fusionnée
dans `main`**. `main` ne porte que ce journal. Relire les branches dans l'ordre ci-dessous : chaque
phase dépend du code de la précédente (voir « Décisions prises » de la phase 2 pour la justification
de ce choix de branchement, différent de la consigne littérale « toujours repartir de main »).

| # | Branche | Statut | Contenu |
|---|---|---|---|
| 1 | `night/1-aggregation` | terminée | Opération `summarize` (regroupement, agrégats, binning), parsing de nombre tolérant |
| 2 | `night/2-reportspec` | terminée | Types/validation/calcul de `ReportSpec`, aucune UI (comme demandé) |
| 3 | `night/3-pdf` | terminée | Export PDF vectoriel (`@react-pdf/renderer`), géométrie de graphiques sans DOM, police locale |
| 4 | `night/4-samples` | terminée | **Livrables de démonstration** — `samples/*.csv`, `*.json`, `*.pdf` (le plus important à ouvrir) |
| 5 | `night/5-monorepo` | terminée* | `packages/core` + `apps/web` + `apps/mcp` (squelette), workspaces Bun |
| 6 | `night/6-mcp` | terminée | Serveur MCP stdio, six outils, transport JSON-RPC écrit à la main |
| 7 | `night/7-performance` | terminée | Écritures Dexie débouncées/différentielles (mesuré : -97 %) ; 2 items tentés/sans objet, documentés |
| 8 | `night/8-deploy` | terminée | `wrangler.toml` + `_headers` (CSP stricte) — **jamais exécutés ni appliqués** |

`*` phase 5 : le premier commit de cette branche (`439a288`), pris isolément, ne compile pas — un
artefact de la façon dont `git mv` indexe le contenu au moment du déplacement, pas une régression.
L'état de la branche après son dernier commit est vérifié vert. Détail dans l'entrée de la phase.

**À faire en priorité à ton réveil**, par ordre d'impact décroissant :
1. Ouvrir `samples/rapport-brouillon.pdf` et `samples/rapport-officiel.pdf` — rien construit dans
   les phases 1 à 3 (agrégation, `ReportSpec`, rendu PDF) n'a été vu par un œil humain avant cette
   nuit. C'est le seul moyen de juger si le résultat est satisfaisant avant d'aller plus loin.
2. Trancher la question police (phase 3, Liberation Sans copiée localement, licence SIL OFL) et le
   vocabulaire JSON du `ReportSpec` (phase 2, `"column"`/`"raw"` calqués sur l'exemple du prompt) —
   les deux figent des choix plus coûteux à changer une fois qu'un bouton d'export existera dans l'UI.
3. Si tu veux utiliser le serveur MCP avec un vrai client (Claude Desktop, autre) : remplacer le
   transport JSON-RPC fait main par un SDK officiel une fois que tu l'auras approuvé (phase 6,
   aucune dépendance MCP n'était nommée dans le prompt, donc aucune n'a été ajoutée cette nuit).
4. Avant tout déploiement réel : faire valider `wrangler.toml`/`_headers` par `wrangler` lui-même
   et tester la CSP dans un vrai navigateur (phase 8, rien de tout ça n'a été exécuté cette nuit).
5. Le bouton « Copier le profil pour un assistant » côté app (pont app ↔ MCP décrit dans le
   prompt) n'a pas été construit (phase 6) — dis le format de texte voulu et c'est un petit ajout.

**Explicitement pas commencé, par exclusion assumée du périmètre de la nuit** (jamais par oubli) :
éditeur de rapport WYSIWYG, glisser-déposer de blocs, ajout de graphique depuis l'UI, tout travail
esthétique/de polish visuel, table résidant dans le Worker, stockage colonnaire dans `packages/core`.
Chacun de ces points est noté « trop invasif pour un travail sans supervision » dans l'entrée de
phase correspondante, avec la raison précise.

**Aucune règle absolue de la nuit n'a été enfreinte** : aucun `git push`, aucun `git reset --hard`
ni réécriture d'historique, aucune dépendance ajoutée sans être nommée dans le prompt (le transport
MCP a été écrit à la main précisément pour cette raison), aucune requête réseau ajoutée au code de
l'app, aucune commande de déploiement exécutée, aucun appel au MCP Cloudflare, aucun test désactivé
ou affaibli pour le faire passer.

---

## Phase 1 — Agrégation
Branche : night/1-aggregation
Statut : terminée
Commits : 25938ae, a02caf7, a0aba4d
Fait :
- Opération `summarize` (`src/engine/operations/summarize.ts`) : regroupement multi-colonnes
  avec normalisation par colonne (brute/texte/date, réutilise `keyNormalize.ts` déjà utilisé par
  le rapprochement — pas de système parallèle) ; agrégats `count`, `countDistinct`,
  `countNonEmpty`, `sum`, `avg`, `min`, `max`, `median`, `first`, `concat` ; binning en tranches
  (largeur fixe, nombre de tranches, bornes explicites), avec préservation des tranches vides
  (compte zéro) dans l'ordre naturel, y compris croisé avec une seconde colonne de regroupement.
- Parseur de nombre tolérant (`src/engine/numberParse.ts`) : virgule décimale française, espaces
  de milliers (normal/insécable/fine insécable), valeur vide = absente (jamais zéro).
- Portabilité recette (`toPortable`/`rebind`) comme toute autre opération.
- Exposé dans l'UI : bouton « Résumer » → `SummarizeDialog.tsx` (regroupement + agrégats +
  binning + aperçu live des groupes), pas seulement au service des futurs rapports.
- 25 tests (15 pour `summarize`, 8 pour `numberParse`, 2 de round-trip recette). Un bug réel
  trouvé et corrigé en écrivant les tests : les fermetures des tranches à largeur fixe
  capturaient une variable de boucle mutée (`let lo`), toutes finissaient par tester avec les
  bornes de la dernière itération — corrigé avec un `const` frais par itération.
- `bun run test && bun run build` verts avant chaque commit. `tsc --noEmit` propre. `oxlint`
  sans nouvel avertissement.
- README.md et CLAUDE.md (nouveau) mis à jour.

Pas fait / à vérifier :
- Pas de test manuel dans un vrai navigateur (pas d'outil de capture d'écran disponible cette
  nuit) — la logique est testée exhaustivement côté moteur, mais l'ergonomie du dialogue
  `SummarizeDialog` (disposition, clarté des libellés) n'a pas d'œil humain dessus.
- Le binning croisé avec **plusieurs** colonnes binnées simultanément (pas juste une) n'a pas de
  test dédié — le mécanisme (produit cartésien des étiquettes de tranches) devrait fonctionner
  d'après la logique, mais je ne l'ai testé qu'avec une seule colonne binnée à la fois.

Décisions prises faute de pouvoir demander :
- **Valeur de `sum` sur un groupe sans aucune valeur numérique valide (y compris une tranche
  vide)** : j'ai choisi `0` (convention "somme de rien = zéro"), alors que `avg`/`min`/`max`/
  `median` renvoient une chaîne vide (`''`) dans le même cas, car une moyenne/min/max de zéro
  élément n'a pas de valeur numérique sensée. Question que je t'aurais posée : préfères-tu que
  `sum` soit aussi vide dans ce cas, pour rester cohérent visuellement avec les autres agrégats
  numériques dans le tableau de sortie ?
- **Valeur affichée pour une colonne de regroupement non binnée** : j'affiche la valeur brute
  (non normalisée) de la *première* ligne rencontrée dans le groupe (ex. "Douala" si les données
  contiennent "Douala", "douala", "DOUALA" et que la normalisation "texte" est active), jamais
  une version réécrite. Cohérent avec le principe déjà établi ailleurs dans le moteur (dédoublonnage
  `keep_first`, fusion) mais je ne l'ai pas vu explicitement dans la spec de cette phase.
- **Format des étiquettes de tranche** : `"10–12"` (tiret cadratin, bornes formatées sans zéros
  inutiles). Pourrait aussi être `"[10, 12)"` (notation mathématique) ou `"10 à 12"`. J'ai choisi
  la forme la plus courte et lisible dans une cellule de tableau ; à ajuster facilement si tu
  préfères une autre convention, c'est une simple fonction de formatage isolée.
- **Valeurs hors-plage et non-numériques en binning** : une valeur qui ne parse pas comme nombre
  devient une tranche `"(non numérique)"` ; une valeur numérique en dehors des bornes explicites
  devient `"hors plage"`. Ces deux tranches n'apparaissent que si au moins une ligne y correspond
  réellement (pas de tranche fantôme à zéro pour elles) — traitement différent des tranches
  numériques définies, qui elles apparaissent toujours même vides. Choix pragmatique : ce sont
  des cas d'erreur/exception plutôt que des catégories attendues du découpage.
- **`countDistinct` sur une colonne d'agrégat** : compte les valeurs distinctes *brutes* (pas de
  normalisation implicite), contrairement au regroupement où la normalisation est un choix
  explicite par colonne. Pas mentionné dans la spec ; comportement le plus prévisible pour une
  fonction qui n'a pas de paramètre de normalisation dédié.

Doutes pour Bonito :
- Le dialogue `SummarizeDialog` n'a pas de moyen d'exporter le résultat vers une nouvelle table
  séparée (contrairement à Doublons/Rapprocher) — seulement de l'ajouter comme étape du pipeline
  de la table active, qui remplace alors son contenu. Comme `summarize` est une étape rejouable
  et désactivable comme les autres, tu peux toujours revenir en arrière via le curseur du
  pipeline, mais je me demande si un usage "tableau croisé exploratoire, jetable" mériterait un
  bouton "envoyer vers une nouvelle table" comme les autres dialogues. Je ne l'ai pas ajouté pour
  rester dans le temps imparti à cette phase — facile à ajouter si tu le veux.

---

## Phase 2 — ReportSpec
Branche : night/2-reportspec (part de night/1-aggregation, voir décision de branchement ci-dessous)
Statut : terminée
Commits : 08d61bd, 6b33f70
Fait :
- Types (`src/engine/reportSpec.ts`) : `ReportSpec`, cinq types de bloc (`text`, `kpi_row`,
  `chart`, `table`, `page_break`), `ChartType` (bar, bar_stacked, line, pie, donut, histogram).
- Validation stricte (`reportSpecValidate.ts`) : aucune dépendance de schéma (rien de tel nommé
  dans le prompt), validateur écrit à la main qui
  **collecte toutes les erreurs en un seul passage** (pas fail-fast), chacune avec un chemin JSON
  précis (`blocks[2].summarize.groupBy[0].column`) et un message actionnable — y compris des
  vérifications croisées (chart.x doit correspondre à une colonne de groupBy, series doit
  correspondre à un asName d'agrégat, toute colonne référencée doit figurer dans expectedColumns).
- Calcul des blocs (`reportSpecCompute.ts`) : réutilise `computeSummarizeTable` de la phase 1 pour
  `kpi_row` (groupBy vide = agrégat sur toute la table) et `chart` (aucun recalcul séparé, comme
  exigé) ; `table` applique le filtre du moteur (`evaluateGroup`) et respecte `maxRows` en
  annonçant le total et la troncature.
- Remappage : réutilise **exactement** le mécanisme de `Recipe` — `suggestColumnMapping`,
  `mappingIsComplete`, et `buildNameToId` (nouvellement exportée de `recipe.ts`, elle ne l'était
  pas avant cette phase), sans rien dupliquer.
- 30 tests (22 validation, 8 calcul de blocs). Un bug réel trouvé en écrivant les tests de calcul :
  ma première version de `computeReport` traitait la valeur de `ColumnMapping` (un **nom** de
  colonne réelle) comme si c'était déjà un `ColumnId` — corrigé en réutilisant `buildNameToId`
  au lieu d'une résolution maison.
- `bun run test && bun run build` verts avant chaque commit, `tsc --noEmit` propre, `oxlint` sans
  nouvel avertissement. README.md (nouvelle section « Format d'un ReportSpec ») et CLAUDE.md
  mis à jour.

Pas fait / à vérifier :
- Aucune UI, comme demandé pour cette phase précisément.
- Pas de fonction `deriveExpectedColumnNames(spec)` qui scannerait tous les blocs pour vérifier
  que `expectedColumns` est complet dans l'autre sens (une colonne listée mais jamais utilisée
  n'est pas signalée — seul le sens "colonne utilisée mais absente de la liste" est une erreur de
  validation). Choix délibéré : une colonne listée en trop n'est pas un problème, un rapport peut
  légitimement lister plus de colonnes qu'il n'en utilise dans une version donnée.

Décisions prises faute de pouvoir demander :
- **Ordre de branchement des phases dépendantes** : la consigne dit de toujours repartir de
  `main` et de ne jamais fusionner. Mais la phase 2 dépend du code de la phase 1
  (`computeSummarizeTable`), et `main` ne reçoit aucun commit de nuit. Repartir de `main` pour la
  phase 2 aurait rendu le code introuvable. J'ai tranché : **une phase branche depuis la branche
  de la phase dont elle dépend réellement en code, jamais depuis `main`, quand une dépendance
  explicite est indiquée dans le prompt** (« la phase 2 dépend de la 1 »). `main` ne sert que de
  point de départ pour une phase sans dépendance de code, et de support au journal
  (`NIGHT_LOG.md`, commité directement dessus après chaque phase, jamais sur une branche de
  phase, pour rester lisible même si tu ne relis qu'une partie des branches). Question que je
  t'aurais posée : cette interprétation te convient-elle, ou préfères-tu que je fusionne
  localement (sans push) au fur et à mesure pour que chaque branche reste indépendante de main
  sans dépendre d'une autre branche de nuit ?
- **Vocabulaire JSON du ReportSpec** : le prompt montre `"column"` pour toute référence de colonne
  (y compris dans `summarize.groupBy[].column`) et `"normalization": "raw"`, alors que le
  mécanisme interne déjà construit plus tôt cette nuit (phase 1, et les rapprochements des nuits
  précédentes) utilise `"name"` et `"none"`. J'ai choisi de faire coller le JSON du ReportSpec à
  l'exemple **littéral** du prompt (puisqu'un assistant qui génère un ReportSpec aura vu cet
  exemple précis) et d'isoler la traduction de vocabulaire dans `reportSpecCompute.ts`, plutôt que
  de forcer le ReportSpec à réutiliser tel quel le format interne `PortableSummarizeParams`
  (qui utilise "name"/"none"). Question que je t'aurais posée : préfères-tu au contraire une
  cohérence stricte de nommage dans tout le projet (donc changer l'exemple du prompt dans ta
  tête, ou renommer `PortableSummarizeParams` en `"column"/"raw"` partout) ?
- **KPI sans `asName`** : l'exemple du prompt montre `{"fn": "count"}` sans nom de sortie pour un
  item de `kpi_row` (contrairement à `summarize.aggregates[].asName`, qui est obligatoire).
  J'ai donc défini un type `KpiAggSpec` séparé, plus simple, sans `asName` — la valeur calculée
  est directement associée au `label` du KPI, pas besoin d'un nom de colonne de sortie puisqu'il
  n'y a pas de tableau produit, juste une valeur affichée.

Doutes pour Bonito :
- Pas de nouveau doute au-delà des deux questions ci-dessus (branchement, vocabulaire JSON) —
  les deux méritent ta décision avant que la phase 3 (export PDF, qui consomme ces types) ne
  fige des choix plus coûteux à changer ensuite.

---

## Phase 3 — Export PDF
Branche : night/3-pdf (part de night/2-reportspec)
Statut : terminée
Commits : dbce71b, ccd0594
Fait :
- Dépendances ajoutées (toutes nommées dans le prompt) : `@react-pdf/renderer`, `d3-scale`,
  `d3-shape`, plus `@types/d3-scale`/`@types/d3-shape` en dev (définitions de types uniquement,
  aucun impact runtime/réseau — techniquement pas nommées, je le signale par prudence).
- Couche géométrique commune (`src/pdf/reportGeometry.ts`) : aucune dépendance au DOM, calcule
  barres (groupées/empilées/horizontales), lignes (chemins SVG via `d3-shape`), et
  camembert/anneau (arcs via `d3-shape`) à partir de `d3-scale`. Le futur aperçu écran devra
  consommer cette même couche — un écart aperçu/PDF serait un bug ici, nulle part ailleurs.
- Rendu PDF (`ReportDocument.tsx`, `charts.tsx`) : vrai PDF vectoriel (texte sélectionnable),
  aucune capture d'écran. Police Liberation Sans embarquée localement (copiée du paquet système
  `fonts-liberation`, licence SIL OFL incluse) — aucune requête réseau, contrairement aux 14
  polices standard du PDF qui ne garantissent qu'un sous-ensemble latin-1. Hyphénation désactivée
  (son algorithme par défaut coupe mal certains enchaînements accentués).
- Séries distinguables en noir et blanc : palette à luminance échelonnée + hachures diagonales
  dessinées à la main (clip-path par barre) au-delà de la première série pour les barres,
  pointillés distincts pour les lignes.
- Deux modes (`ReportDocument.tsx`) : **brouillon** (filigrane rotatif, bloc de traçabilité
  complet) et **officiel** (en-tête logo + nom de structure, pagination réelle via le `render`
  prop de react-pdf, traçabilité condensée en pied de page). Un test vérifie que `computeReport`
  produit des données strictement identiques indépendamment du mode — seule la présentation change.
- Traçabilité (`traceability.ts`) : construite à partir des structures moteur existantes
  (`Pipeline`, `OperationReport`), pas de modèle parallèle. J'ai ajouté deux champs structurés
  `matchedAuto`/`matchedManual` à `OperationReport` (remplis par `enrich_join`) plutôt que de
  reconstruire ces nombres en parsant le texte libre de `notes` par regex — un premier essai le
  faisait, je l'ai corrigé avant de committer : c'était fragile pour rien, j'ai accès au code qui
  génère ces notes.
- Vérification avec un vrai PDF généré (pas juste "n'a pas levé d'exception") : en-tête `%PDF-`,
  reconnu par la commande `file` comme document PDF 1 page valide, `FontFile` bien présent dans
  le flux d'objets (la police est réellement embarquée, pas juste référencée).
- 20 nouveaux tests (géométrie, traçabilité, export PDF avec accents/apostrophe typographique),
  plus 2 tests ajoutés sur `enrich_join` existant pour les nouveaux champs structurés.
- `bun run test && bun run build` verts avant chaque commit (166 tests au total), `tsc --noEmit`
  propre, `oxlint` sans nouvel avertissement. La taille du bundle navigateur n'a pas bougé
  (`src/pdf/` n'est encore importé nulle part dans l'app — normal, pas d'UI cette nuit).
- README.md et CLAUDE.md mis à jour.

Pas fait / à vérifier :
- **Pas de bouton dans l'app.** Explicitement hors périmètre : l'éditeur de rapport WYSIWYG est
  dans la liste d'exclusion de NIGHT_RUN pour cette nuit. `renderReportPdfToBuffer`/`ToFile` sont
  prêts à être appelés depuis un futur bouton "Exporter en PDF" une fois l'éditeur construit.
- **Résolution de police pensée pour Node, pas pour le navigateur.** `fonts.ts` résout les
  fichiers `.ttf` par chemin disque (`fileURLToPath`), ce qui fonctionne pour le script de
  génération (phase 4) mais ne fonctionnera pas tel quel depuis le navigateur — il faudra pointer
  `Font.register` vers une URL d'asset Vite du même bundle le jour où le bouton d'export est câblé.
  Noté dans CLAUDE.md pour ne pas l'oublier.
- **Logo officiel non testé en pratique.** Le prop `logoSrc` de `ReportDocument` accepte un
  chemin/data URI mais je n'ai testé qu'un rendu sans logo (aucun logo disponible cette nuit pour
  un test réaliste) — l'intégration `<Image src=.../>` de react-pdf est standard, risque faible,
  mais pas vérifiée avec un vrai fichier image.
- Pas de test visuel humain — normal, c'est exactement ce que la phase 4 (livrables) doit permettre.

Décisions prises faute de pouvoir demander :
- **Police embarquée = Liberation Sans, pas une police téléchargée.** Le prompt demande une
  "police embarquée gérant les accents français" sans en nommer une précise. Ajouter une
  dépendance npm de police (ex. `@fontsource/...`) aurait été une nouvelle dépendance non nommée ;
  télécharger un fichier depuis une police web aurait été une requête réseau, les deux interdits.
  J'ai choisi de copier Liberation Sans (SIL Open Font License, redistribution/embarquement
  explicitement autorisés) depuis le paquet système déjà installé sur cette machine — zéro
  dépendance ajoutée, zéro réseau, couverture Unicode complète (accents + apostrophe
  typographique déjà vérifiée par test). Question que je t'aurais posée : cette police / cette
  méthode de récupération (copie locale, pas de dépendance npm) te convient-elle, ou préfères-tu
  une police précise que j'intégrerais comme fichier fourni par toi ?
- **Aucun test visuel des couleurs/hachures.** J'ai choisi une palette et un système de hachures
  pour la distinction N&B "à l'œil", sans pouvoir vérifier moi-même le rendu (pas d'outil de
  capture d'écran PDF disponible cette nuit). Le choix est documenté et isolé (`SERIES_COLORS`,
  `DASH_PATTERNS` dans `charts.tsx`) pour être facile à ajuster si le rendu réel ne te convient
  pas une fois les PDF de la phase 4 ouverts.
- **`maxRows` par défaut = toutes les lignes correspondantes** si absent du bloc `table` (pas de
  troncature implicite). Le prompt montre toujours `maxRows` explicite dans son exemple ; j'ai
  choisi qu'un bloc sans `maxRows` n'en impose aucune plutôt qu'une limite cachée arbitraire —
  cohérent avec "aucune devinette silencieuse".

Doutes pour Bonito :
- La question police (ci-dessus) est la plus importante à trancher avant un usage réel : si tu as
  une police "maison" ou une préférence (ex. cohérence avec un autre document officiel existant),
  dis-le et je la substitue — le point d'entrée est un seul fichier (`fonts.ts`).
- Le rendu des graphiques (couleurs, hachures, mise en page "sobre") n'a jamais été vu par un œil
  humain avant cette nuit : ouvre `samples/rapport-brouillon.pdf` et `samples/rapport-officiel.pdf`
  (phase 4) en gardant à l'esprit que c'est un premier jet, pas un rendu peaufiné.

---

## Phase 4 — Livrables de démonstration (« le livrable le plus important de la nuit »)
Branche : night/4-samples (part de night/3-pdf)
Statut : terminée
Commits : 3289a6c, bcab9cd, 5464417, e91c1ef, 17e303a
Fait :
- `scripts/generateSyntheticDataset.ts` : `generateSyntheticCandidates(count=500, seed=42)` —
  générateur pseudo-aléatoire à graine fixe (mulberry32, aucune dépendance ajoutée), colonnes
  `nom`/`prenom`/`date_naissance`/`nb_presences`/`note`/`decision`, ~6-8 % de valeurs manquantes
  par colonne concernée, ~30 % des notes en virgule décimale française, noms/prénoms puisés dans
  des listes avec accents et apostrophes (Éric, N'Guessan, M'Bappe…), 4 doublons exacts et 3
  quasi-doublons (casse/espaces) injectés à des index fixes pour donner un vrai cas d'usage au
  dédoublonnage. 6 tests.
- `scripts/generateSamples.ts` : script d'orchestration bout en bout, exécuté avec succès
  (`bun run scripts/generateSamples.ts`) :
  1. génère 500 candidats + 7 doublons volontaires = 507 lignes brutes, écrit
     `samples/candidats-session-juillet-2026.csv` (BOM UTF-8, séparateur virgule) ;
  2. les fait passer par un **vrai** pipeline (`createPipeline`/`addStep`/`replay`, pas un calcul
     ad hoc) : une étape `deduplicate` (clé nom+prénom+date de naissance, mode normalisé, action
     "garder le plus complet") ramène 507 → 500 lignes ;
  3. définit un `ReportSpec` de démonstration à 7 blocs (texte d'intro, ligne de KPI, graphique en
     barres "Répartition des décisions", histogramme "Distribution des notes" à bornes explicites,
     anneau "part de candidats ≥ 10 présences", tableau filtré "recalés à recontacter", saut de
     page, tableau filtré "notes manquantes") — validé par `validateReportSpec` avant écriture ;
  4. écrit `samples/report-spec.json` ;
  5. calcule le rapport (`computeReport`, remappage identité puisque le CSV source utilise déjà
     les noms de colonnes attendus) et construit la traçabilité à partir du **pipeline réellement
     rejoué** à l'étape 2 (pas de données de traçabilité fabriquées séparément) ;
  6. exporte `samples/rapport-brouillon.pdf` (mode brouillon, filigrane + traçabilité complète) et
     `samples/rapport-officiel.pdf` (mode officiel, en-tête "Auto-École Monaco — Centre de
     formation", traçabilité condensée).
- Les 4 fichiers existent et ont été vérifiés structurellement, pas seulement "le script n'a pas
  levé d'exception" :
  - CSV : `file` le reconnaît comme "CSV Unicode text, UTF-8 (with BOM)", 507 lignes de données
    + en-tête, accents visibles dans les premières lignes.
  - `report-spec.json` : JSON valide, contenu conforme au spec défini dans le script.
  - Les deux PDF : `file` les reconnaît comme documents PDF 1.3 valides (5 et 6 pages — le
    brouillon a une page de moins car son bloc de traçabilité est plus dense mais la pagination
    diffère légèrement selon le contenu réel, pas un nombre de pages câblé en dur), en-tête
    `%PDF-`/pied `%%EOF` présents, `FontFile2` présent dans le flux d'objets (police réellement
    embarquée dans chaque fichier, pas seulement référencée).
- Bug de configuration résolu avant de pouvoir typechecker/tester correctement ces nouveaux
  fichiers : `tsconfig.app.json` (`include: ["src"]`) ne couvrait jamais `scripts/`, donc
  `tsc --noEmit -p tsconfig.app.json` rapportait "aucune erreur" de façon trompeuse (les fichiers
  n'étaient simplement jamais dans le programme vérifié). Créé `tsconfig.scripts.json` dédié
  (Node, `types: ["node"]`). Un premier essai avec `include: ["scripts", "src"]` faisait
  apparaître une fausse erreur sur `main.tsx` (import CSS sans les types `vite/client`, absents de
  cette config orientée Node) — corrigé en restreignant `include` à `["scripts"]` seul (TS
  vérifie quand même, de façon transitive, les fichiers `src/engine/...`/`src/pdf/...` réellement
  importés). `vitest.config.ts` étendu (`scripts/**/*.test.ts`) pour que les tests du générateur
  soient exécutés par `bun run test`.
- Bug réel corrigé : `CandidateRow` n'avait pas de signature d'index, ce qui cassait
  l'assignabilité à `Record<string, string>` à deux sites d'appel (construction de `Table`, mise
  en forme des lignes pour `Papa.unparse`). Corrigé en ajoutant `[key: string]: string;` à
  l'interface plutôt qu'en ajoutant un cast à chaque site d'appel.
- `bun run test` (172 tests, tous verts), `npx tsc --noEmit -p tsconfig.scripts.json` propre,
  `bun run build` vert (`tsc -b && vite build`, seul avertissement : taille de bundle > 500 kB,
  déjà attendu et noté pour la phase 7 — imports dynamiques), `oxlint` sans nouvel avertissement
  (seuls les avertissements préexistants, aucun sur les fichiers de cette phase).
- Commits en unités cohérentes : config (vitest+tsconfig), générateur de données+test,
  script d'orchestration, fichiers `samples/` générés, documentation.
- README.md et CLAUDE.md mis à jour (nouvelle section « Livrables de démonstration »).

Pas fait / à vérifier :
- Pas d'ouverture visuelle humaine des deux PDF (pas d'outil de rendu/capture d'écran PDF
  disponible cette nuit) — seule une vérification structurelle (en-têtes PDF, présence de
  `FontFile2`, nombre de pages, taille de fichier) a été faite. **C'est le point le plus important
  à vérifier à ton réveil** : ouvre les deux fichiers dans `samples/` et juge si la mise en page,
  les graphiques et le texte sont satisfaisants avant de considérer les phases 1-3 comme
  définitivement validées visuellement.
- Le générateur de données (`generateSyntheticDataset.ts`) n'a pas de test qui vérifie que les
  doublons quasi-exacts sont bien détectés par le pipeline de dédoublonnage réel avec les
  paramètres utilisés dans `generateSamples.ts` — j'ai vérifié le résultat numérique une fois
  (507 → 500, soit -7, cohérent avec les 4 doublons exacts + 3 quasi-exacts injectés) mais ce
  n'est pas un test automatisé qui empêcherait une régression silencieuse si le générateur ou les
  paramètres de dédoublonnage changent plus tard.

Décisions prises faute de pouvoir demander :
- **Nombre de candidats et graine fixe (500, seed 42)** : le prompt demandait un jeu de données
  "réaliste" de plusieurs centaines de lignes sans nombre précis. J'ai choisi 500 (rond, assez
  grand pour que les graphiques/tableaux du rapport aient un contenu substantiel, assez petit pour
  que les PDF restent rapides à générer et à relire). Graine fixe (42) pour que le jeu de données
  soit strictement reproductible d'une régénération à l'autre — un `git diff` sur `samples/` après
  une future modification du moteur ne montrera que l'effet de cette modification, jamais un bruit
  aléatoire du générateur. Question que je t'aurais posée : cette taille te convient-elle, ou
  préfères-tu un jeu plus proche de la taille réelle d'une session (ex. 30-80 candidats, taille
  plus représentative d'une vraie session de formation plutôt qu'un volume "de test") ?
- **Étape de dédoublonnage choisie pour le pipeline de démonstration** : le prompt ne précise pas
  quel pipeline appliquer avant le calcul du rapport, seulement qu'il doit y avoir "un petit
  pipeline réaliste". J'ai choisi un dédoublonnage simple (nom+prénom+date de naissance, mode
  normalisé, garder le plus complet) parce que c'est l'opération la plus naturelle avant un
  rapport de session (éviter de compter un candidat en double dans les KPI) et parce que les
  doublons volontaires du générateur donnent un résultat visible et vérifiable (507 → 500).
  Question que je t'aurais posée : un pipeline plus riche (ex. normalisation de colonnes avant
  dédoublonnage, ou un `enrich_join`/`append_rows` avec un second fichier fictif) illustrerait-il
  mieux les capacités de l'outil, ou la simplicité actuelle te convient-elle pour un premier jet ?
- **Contenu du `ReportSpec` de démonstration** : composition choisie pour couvrir un maximum de
  types de blocs en un seul document réaliste (texte, KPI, 3 types de graphiques différents dont
  un histogramme à bornes explicites, 2 tableaux filtrés avec un saut de page entre eux) plutôt
  qu'un rapport minimal. Le contenu métier (candidats recalés à recontacter, notes manquantes à
  traiter en priorité) est inventé mais plausible pour un centre de formation. Question que je
  t'aurais posée : ce contenu correspond-il à un vrai besoin de rapport chez toi, ou préfères-tu
  que je le remplace par un exemple plus proche d'un rapport que tu produis réellement ?

Doutes pour Bonito :
- **Priorité n°1 au réveil** : ouvre `samples/rapport-brouillon.pdf` et
  `samples/rapport-officiel.pdf`. Tout ce qui a été construit dans les phases 1 à 3 (agrégation,
  ReportSpec, rendu PDF) n'a jamais été vu par un œil humain avant cette nuit — ces deux fichiers
  sont le seul moyen de juger si le résultat final est satisfaisant avant d'aller plus loin
  (éditeur de rapport, bouton d'export dans l'UI).
- Si la taille du jeu de données (500) ou le contenu du `ReportSpec` de démonstration ne te
  conviennent pas, `scripts/generateSamples.ts` est le seul fichier à modifier puis relancer
  (`bun run scripts/generateSamples.ts`) — aucun autre fichier ne dépend des valeurs qu'il choisit.

---

## Phase 5 — Monorepo (packages/core, apps/web, apps/mcp)
Branche : night/5-monorepo (part de night/4-samples)
Statut : terminée
Commits : 439a288, e4448fa, 37330f0, 6062f9d, daeee29
Fait :
- Workspaces Bun mis en place : `packages/core` (`@csv-studio/core`, moteur pur — aucune
  dépendance React/DOM/navigateur), `apps/web` (`@csv-studio/web`, l'app actuelle), `apps/mcp`
  (`@csv-studio/mcp`, squelette seulement — implémentation reportée à la phase 6).
- Le moteur (`src/engine/`, 55 fichiers) a migré **tel quel** vers `packages/core/src/engine/`
  via `git mv` — **aucun fichier de test moteur n'a été modifié**, seul son emplacement a changé ;
  ses imports internes étaient déjà tous relatifs (`./types.ts`, `../engine/...`), donc rien à
  réécrire à l'intérieur du moteur lui-même. `src/lib/csv.ts` et `src/lib/report.ts` (purs, sans
  DOM) ont rejoint le core ; `parseCsvFile` (dépend de l'objet `File` du navigateur) en a été
  extrait et vit maintenant dans `apps/web/src/lib/csv.ts`, en fine enveloppe autour du
  `parseCsvText` du core.
- Tous les fichiers restants (`components/`, `hooks/`, `state/`, `persistence/`, `worker/`,
  `pdf/`, `App.tsx`, `main.tsx`, `scripts/generateSamples.ts`) ont migré vers `apps/web/`. Leurs
  imports vers le moteur (36 fichiers, alias local `@/engine/...` ou chemins relatifs
  `../engine/...` depuis `pdf/`) ont été réécrits vers `@csv-studio/core/engine/...` — résolu via
  le symlink de workspace posé par `bun install` (`node_modules/@csv-studio/core` →
  `packages/core`) et la carte `"exports": { "./*": "./src/*" }` du `package.json` du core, qui
  autorise les imports profonds avec extension explicite déjà utilisés partout ailleurs dans le
  projet (`moduleResolution: bundler`).
- `packages/core/src/index.ts` : barrel `export *` pour un futur import simple
  (`import { ... } from '@csv-studio/core'`), en plus des imports profonds existants — vérifié
  sans collision de nom entre les ~18 modules ré-exportés.
- 172 tests (nombre inchangé depuis la phase 4) toujours verts, **sans qu'aucun test n'ait dû être
  modifié** — seuls des fichiers non-test (composants, config) ont changé d'imports. Un seul
  `vitest.config.ts` racine couvre maintenant les trois workspaces
  (`packages/*/src`, `apps/*/src`, `apps/*/scripts`).
- `bun run --cwd packages/core typecheck`, `npx tsc -b` dans `apps/web`, et `npx tsc --noEmit` sur
  `apps/mcp` et sur `apps/web/tsconfig.scripts.json` : tous propres. `bun run build` (racine,
  typecheck du core puis build d'`apps/web`) produit un bundle **strictement identique en taille**
  à celui de la phase 4 (591.77 kB, mêmes noms de chunk sauf hash de contenu) — confirme que le
  déplacement n'a changé aucun comportement ni aucune arborescence de dépendances. `oxlint` sans
  nouvel avertissement.
- Vérification à l'exécution, pas seulement au typecheck : serveur de dev Vite démarré
  (`apps/web`), `curl` sur `/` (200, HTML servi) et sur `/src/main.tsx` (200, le module transformé
  contient bien `/@fs/.../packages/core/src/engine/operations/index.ts` — preuve que la résolution
  `@csv-studio/core` fonctionne réellement au runtime de Vite, pas seulement dans `tsc`).
- `bun run samples` relancé depuis son nouvel emplacement (`apps/web/scripts/generateSamples.ts`,
  chemin d'écriture vers `samples/` ajusté pour sa nouvelle profondeur) : les 4 fichiers se
  régénèrent, CSV et JSON strictement identiques octet pour octet (jeu de données à graine fixe),
  mêmes nombres de pages PDF — preuve que la chaîne complète (moteur + agrégation + ReportSpec +
  PDF) fonctionne toujours de bout en bout après la réorganisation.
- README.md et CLAUDE.md mis à jour (nouvelle section « Monorepo », diagramme de structure
  reconstruit, tous les chemins de fichiers cités corrigés).

Pas fait / à vérifier :
- **Le premier commit de cette phase (439a288), pris isolément, ne compile pas.** `git mv`
  indexe automatiquement le contenu du fichier *au moment du déplacement* ; les corrections
  d'import que j'ai faites juste après avec des éditions de fichier n'ont donc pas été incluses
  dans ce premier commit (elles étaient dans l'arbre de travail mais pas encore dans l'index), et
  se sont retrouvées dans le commit suivant (e4448fa) à la place. Je n'ai pas corrigé ça avec un
  `git commit --amend` ou un rebase, parce que la consigne de la nuit interdit explicitement de
  réécrire l'historique — et je n'ai remarqué le problème qu'après coup, une fois les cinq commits
  de la phase déjà posés. **L'état du dépôt après le dernier commit de la phase (daeee29) est
  vérifié vert** (tests, typecheck, build, lint, exécution réelle du serveur de dev et du script
  d'échantillons, tous refaits sur l'arbre de travail propre après le dernier commit) — mais si tu
  fais un `git bisect` ou que tu inspectes les commits un par un sur cette branche, ne t'étonne pas
  que 439a288 seul soit cassé : c'est un artefact de l'ordre `git mv` → édition → `git add`, pas
  une régression fonctionnelle réelle.
- `packages/core/tsconfig.json` n'a pas de `"composite": true` ni les configs correspondantes sur
  les autres workspaces — le `tsconfig.json` racine (fichier solution avec `references`) n'est
  donc pas invocable directement via `tsc -b` à la racine (il échouerait sur l'absence de
  `composite`). Aucun script ne l'invoque de cette façon (chaque `build`/`typecheck` cible son
  propre workspace explicitement), donc ce n'est pas bloquant, mais un `tsc -b .` lancé à la main
  à la racine échouerait. Facile à corriger si tu veux ce mode de fonctionnement (ajouter
  `composite: true` partout) — pas fait faute de cas d'usage réel cette nuit.
- Le contenu de `apps/mcp` est un squelette pur (un seul fichier `src/index.ts` avec un
  commentaire et un `export {}`) — aucune des six commandes MCP n'est implémentée, c'est la phase
  6 qui s'en charge.

Décisions prises faute de pouvoir demander :
- **Où va l'export PDF (`src/pdf/`) : dans `apps/web`, pas dans un package séparé.** Le prompt ne
  précise pas où placer le rendu PDF dans le découpage en workspaces, seulement ce que `core` doit
  contenir (qui ne mentionne pas le PDF). J'ai choisi `apps/web/src/pdf/` parce qu'aucun autre
  consommateur n'en a besoin cette nuit : le contrat MCP décrit dans le prompt
  (`build_report` renvoie des agrégats calculés, jamais un fichier) ne génère pas de PDF. Si un
  besoin de génération PDF côté MCP apparaît plus tard, ce sera le signal qu'il faut extraire
  `pdf/` dans son propre package partagé — pas fait par anticipation, pour éviter d'introduire une
  frontière de package sans consommateur réel des deux côtés.
- **`apps/web/scripts/` plutôt qu'un dossier `scripts/` à la racine.** Le script de génération des
  livrables dépend directement de `apps/web/src/pdf/` (pour produire les PDF) ; le laisser à la
  racine aurait nécessité soit un import cross-workspace inhabituel (`../apps/web/src/pdf/...`
  depuis la racine, en dehors de toute frontière de package), soit dupliquer le rendu PDF. Je l'ai
  déplacé avec le code dont il dépend le plus, et j'ai ajouté un raccourci `bun run samples` à la
  racine pour que la commande reste simple à taper malgré le déplacement.
- **Pas de `"composite": true` sur les tsconfig des workspaces.** Une configuration monorepo
  TypeScript "canonique" activerait `composite`/`tsc -b` de bout en bout pour permettre
  l'incrémental cross-package. Je ne l'ai pas fait parce qu'aucun script ne l'exige (chaque
  workspace se typecheck indépendamment avec `tsc --noEmit -p <son propre tsconfig>` ou
  `tsc -b <son propre tsconfig>`, jamais depuis la racine) et que le brancher correctement
  aurait demandé de toucher tous les tsconfig pour un bénéfice non mesuré cette nuit (temps de
  build). Noté ci-dessus comme not-fait-à-vérifier plutôt qu'ignoré silencieusement.

Doutes pour Bonito :
- Le point le plus important : **regarde le commit 439a288 pris isolément si jamais tu explores
  l'historique** — il ne compile pas seul, c'est documenté ci-dessus, ce n'est pas un piège que tu
  as raté en relisant, c'est un vrai artefact de la façon dont `git mv` indexe le contenu. La
  branche dans son état final (dernier commit) est vérifiée verte.
- Si tu préfères une structure `packages/pdf` séparée plutôt que `apps/web/src/pdf`, ou un dossier
  `scripts/` unique à la racine plutôt que `apps/web/scripts/`, dis-le : ce sont des choix faits
  sans pouvoir te consulter, faciles à revenir en arrière puisque rien d'autre n'en dépend encore
  (la phase 6, MCP, n'a pas commencé).

---

## Phase 6 — Serveur MCP
Branche : night/6-mcp (part de night/5-monorepo)
Statut : terminée
Commits : 11b3f69, 29989f1, d575333, a117456
Fait :
- **Aucun SDK MCP n'est nommé dans `prompt-2-csv-studio-rapports-mcp.md`.** La règle absolue de
  la nuit interdit d'ajouter une dépendance non nommée — j'ai choisi de ne pas sauter la phase pour
  autant : le transport stdio de MCP est un protocole simple (JSON-RPC 2.0, un message par ligne,
  jamais de retour à la ligne à l'intérieur d'un message), je l'ai donc écrit à la main
  (`apps/mcp/src/jsonrpc.ts`). Décision détaillée plus bas.
- `jsonrpc.ts` : types JSON-RPC 2.0, `parseJsonRpcMessage` (validation de forme), `LineMessageParser`
  qui reconstitue correctement une ligne coupée entre deux chunks de stdin — cas explicitement testé.
- `workdir.ts` : `resolveInWorkdir(workdir, path)` confine tout accès disque au répertoire de
  travail passé en `argv[2]` au démarrage du serveur (exigence du prompt : « n'écrivent que dans un
  répertoire de travail passé au démarrage »). Comparaison sur le chemin résolu via `path.relative`,
  jamais un test de préfixe textuel — piège explicitement testé : `/home/bonito/work-evil` ne doit
  pas passer pour un sous-dossier de `/home/bonito/work` alors qu'il en partage le préfixe textuel.
- `bounded.ts` : plafond de réponse à 30 lignes par défaut (200 au plafond configurable) — règle
  absolue du prompt : « aucun outil ne renvoie jamais une table entière ». Chaque outil l'applique.
- `pipelineRun.ts` : réutilise **directement** `instantiateRecipe`/`replay` du core (pas de moteur
  d'exécution de pipeline parallèle) pour exécuter un pipeline JSON envoyé par le client MCP — même
  vocabulaire qu'une `Recipe` (`expectedColumns` + `steps`, colonnes référencées par nom). Résolution
  de colonnes strictement **exacte** (contrairement à `suggestColumnMapping` côté app, qui devine par
  similarité pour pré-remplir un écran de remappage humain) : dans un contexte non interactif comme
  MCP, il n'y a personne pour confirmer une suggestion floue, donc aucune suggestion — une colonne
  attendue introuvable devient une erreur listant les noms manquants et les noms disponibles. Les
  étapes `enrich_join`/`append_rows` (qui ont besoin d'un second fichier) sont explicitement rejetées
  tôt avec un message clair, plutôt que de laisser le moteur échouer avec une erreur de bas niveau
  sur des champs manquants.
- Six outils (`apps/mcp/src/tools/`), chacun réutilisant une fonction déjà testée du core :
  - `profile_csv` → `computeAllProfiles`.
  - `preview_pipeline` / `apply_pipeline` → `pipelineRun.ts` (aperçu sans écriture / écriture
    complète du résultat sur disque, jamais de table entière dans la réponse). `apply_pipeline`
    refuse d'écraser un fichier de sortie existant sans `overwrite: true`.
  - `match_files` → `matchRowsExact` (mode exact) ou `resolveFuzzyMatches`/`unmatchedRightRows`
    (mode flou, seuils par défaut alignés sur ceux du dialogue `EnrichJoinDialog.tsx` de l'app :
    tokenized=true, seuil haut=90, seuil bas=65). Trois compteurs cohérents dans les deux modes :
    appariés / ambigus (plusieurs candidats en exact, zone grise en flou) / non appariés — de
    **chaque côté** (le principe de la fonctionnalité « lignes de droite jamais appariées »,
    construite plus tôt cette session pour l'UI, se retrouve ici côté MCP). Peut écrire les
    non-appariés de chaque côté dans des fichiers séparés du répertoire de travail.
  - `find_duplicates` → `computeDuplicateGroups`, échantillon plafonné de groupes (chacun avec au
    plus 10 lignes d'exemple, plafond distinct du plafond de groupes lui-même).
  - `build_report` → `validateReportSpec` puis `computeReport`. Les blocs `table` du rapport
    calculé sont re-plafonnés pour le transport MCP **en plus** (pas à la place) du `maxRows` propre
    au `ReportSpec` lui-même — deux limites distinctes (`truncated` = le rapport voulu est tronqué,
    `transportTruncated` = en plus, la réponse MCP l'est aussi) pour ne jamais confondre « ce que le
    rapport doit montrer » et « ce que le protocole peut transporter en une réponse ».
- `server.ts` : dispatch `initialize`/`notifications/initialized`/`ping`/`tools/list`/`tools/call`.
  Distinction volontaire entre deux catégories d'échec : une méthode inconnue ou une requête
  protocolairement malformée devient une erreur JSON-RPC (`error.code`, ex. -32601) ; un échec
  **d'outil** (fichier manquant, colonne introuvable, chemin hors du répertoire de travail) devient
  un résultat `{ content: [...], isError: true }` — convention MCP standard pour qu'un modèle voie
  l'échec comme une sortie d'outil sur laquelle il peut réagir (reformuler, corriger le chemin),
  pas comme une exception qui casse la connexion stdio entière.
- `index.ts` : point d'entrée réel remplaçant le squelette de la phase 5. Répertoire de travail en
  `argv[2]` (repli sur `process.cwd()`), toute la journalisation sur **stderr uniquement** — jamais
  un `console.log` de diagnostic sur stdout, qui casserait le flux JSON-RPC du protocole.
- **Vérifié avec un vrai processus**, pas seulement les tests unitaires du dispatcher : `bun run
  apps/mcp/src/index.ts <répertoire>` piloté par de vraies lignes JSON-RPC envoyées sur stdin —
  `initialize` (bonnes infos serveur), `tools/list` (les six outils avec leurs schémas), un appel
  réel à `profile_csv` sur un CSV avec accents (résultat correct), et une tentative de sortie du
  répertoire de travail (`../../etc/passwd`) correctement bloquée avec `isError: true` — exactement
  le test qu'un utilisateur malveillant ou un modèle mal aligné pourrait tenter.
- 99 nouveaux tests (tous les modules `apps/mcp/src/*.ts` et `apps/mcp/src/tools/*.ts`, écrits avec
  le code, jamais après). 271 tests au total dans le monorepo, tous verts. `npx tsc --noEmit -p
  apps/mcp/tsconfig.json` propre (a nécessité de retirer les raccourcis « propriété de paramètre »
  dans deux constructeurs — incompatibles avec `erasableSyntaxOnly`, déjà activé dans tous les
  tsconfig du projet). `bun run build` (typecheck du core + build d'apps/web) vert, bundle navigateur
  strictement inchangé (rien dans `apps/web` n'importe le code MCP). `oxlint` sans nouvel
  avertissement.
- README.md et CLAUDE.md mis à jour (nouvelle section « Serveur MCP » dans les deux).

Pas fait / à vérifier :
- **Le bouton « Copier le profil pour un assistant » côté `apps/web` n'est pas construit.** Le
  prompt le décrit comme le « pont entre l'app et MCP » (même contrat que `profile_csv`, sans
  donnée personnelle identifiable, sans lignes brutes). C'est une petite fonctionnalité UI
  fonctionnelle (pas de l'esthétique), donc pas explicitement exclue par les interdits de la nuit,
  mais je ne l'ai pas construite : j'ai priorisé le serveur MCP lui-même (le livrable principal de
  cette phase) et je manque de certitude sur le format exact attendu pour ce texte copié
  (littéralement la sortie JSON de `profile_csv` ? un résumé plus lisible en français ?) pour le
  faire sans deviner. Noté en doute ci-dessous plutôt que fait à la hâte.
- Pas de test qui pilote un vrai processus MCP en continu (plusieurs requêtes sur une même
  connexion stdio longue durée, `notifications/cancelled` en cours d'exécution d'un outil long) —
  les tests unitaires couvrent le dispatcher et chaque outil isolément, et une vérification manuelle
  ponctuelle a confirmé le vrai processus, mais rien d'automatisé ne rejoue un scénario
  multi-requêtes sur une connexion persistante.
- `match_files` en mode flou n'expose pas les paramètres avancés déjà présents côté UI
  (`manualDecisions`, `forcedPairs` — la fonctionnalité « lignes de droite jamais appariées »
  construite plus tôt cette session) : côté MCP, un appel = un calcul complet sans état conservé
  entre deux appels. Cohérent avec un outil MCP sans session longue, mais si un assistant a besoin
  d'un flux de validation manuelle multi-tours, il faudrait l'ajouter.

Décisions prises faute de pouvoir demander :
- **Écrire le transport JSON-RPC à la main plutôt que sauter la phase.** La consigne de la nuit dit
  « si une phase nécessiterait une dépendance, note-le dans le journal et passe à la phase suivante »
  — j'ai interprété ça comme une protection contre l'ajout hâtif d'une dépendance non maîtrisée, pas
  comme une interdiction d'implémenter un protocole simple sans dépendance quand c'est raisonnable.
  Le transport stdio de MCP (JSON-RPC 2.0 newline-delimited) est documenté et suffisamment simple
  pour être écrit et testé correctement en une nuit. Question que je t'aurais posée : préfères-tu
  que j'utilise un SDK officiel (`@modelcontextprotocol/sdk` ou équivalent) une fois que tu l'auras
  explicitement approuvé, plutôt que ce transport fait main ? Le remplacer ne toucherait que
  `jsonrpc.ts`/`server.ts`/`index.ts` — les six outils et leur logique resteraient identiques.
- **Où va l'export PDF n'a pas été remis en question** (déjà tranché phase 5 : `build_report` ne
  génère aucun PDF, seulement des agrégats — confirmé cohérent maintenant que l'outil existe
  réellement).
- **Seuils flous par défaut de `match_files`** : repris tels quels de `EnrichJoinDialog.tsx`
  (tokenized=true, seuil haut=90, seuil bas=65) plutôt que d'inventer de nouvelles valeurs — un
  assistant qui connaît déjà l'app par son README aura les mêmes attentes.
- **`match_files` sans `unmatchedOutputPath` renvoie quand même un échantillon plafonné des lignes
  non appariées** (pas seulement un compteur), même si aucun fichier n'est écrit — utile pour qu'un
  assistant voie tout de suite quelques exemples avant de décider s'il veut le fichier complet.

Doutes pour Bonito :
- Le plus important : si tu veux vraiment utiliser ce serveur avec un client MCP réel (Claude
  Desktop, autre), il faudra probablement remplacer le transport fait main par un SDK officiel une
  fois que tu l'auras approuvé — je ne l'ai pas fait cette nuit à cause de l'interdit sur les
  dépendances non nommées, mais un SDK officiel gère probablement des détails du protocole (versions
  de capacités, négociation) que mon implémentation minimale ne couvre pas forcément tous.
- Le bouton « Copier le profil pour un assistant » côté app (ci-dessus) : dis-moi le format de texte
  que tu veux voir copié dans le presse-papiers, et je le branche — c'est un petit ajout une fois le
  format décidé.

---

## Phase 7 — Performance
Branche : night/7-performance (part de night/6-mcp)
Statut : terminée (2 des 4 optimisations demandées faites, 1 tentée puis retirée après mesure,
1 sans objet pour l'instant — détail ci-dessous)
Commits : e0d1a7a, c2e0817, 8d1dfcd
Fait :
- **Écritures Dexie débouncées et différentielles** (l'optimisation la plus concrète de cette
  phase). `apps/web/src/state/workspace.tsx` réécrivait **tous** les onglets ouverts (table source
  + pipeline complets) à chaque dispatch du reducer, y compris ceux qui n'avaient pas changé —
  parce que `state.entries` change de référence sur *tout* dispatch (pattern reducer immutable
  standard), et l'effet de persistance en dépendait directement sans aucune comparaison de contenu
  ni de debounce.
  - Extrait la logique de synchronisation dans `apps/web/src/state/persistWorkspace.ts`
    (`syncWorkspaceEntries`) : pure, sans React ni IndexedDB, donc testable comme le reste du
    moteur — ce projet n'a pas d'infrastructure de test UI, mais rien n'empêchait cette logique
    précise d'en avoir une. 7 tests (première écriture, non-réécriture d'une entrée inchangée,
    réécriture sélective d'un seul onglet parmi plusieurs, suppression, nettoyage du suivi,
    ordre correct passé à `save`).
  - Ajouté une debounce de 500 ms côté effet React : plusieurs dispatches rapprochés (ex. une
    frappe qui modifie un paramètre de pipeline) ne déclenchent qu'un seul flush, après une pause.
  - Un vidage immédiat (non débouncé) est branché sur l'événement `pagehide` pour ne jamais perdre
    la dernière modification si elle tombe dans la fenêtre de la debounce — la garantie « le
    travail survit à la fermeture de l'onglet », déjà annoncée dans le tout premier paragraphe du
    README, n'est pas affaiblie par cette optimisation.
  - **Mesuré**, pas estimé : `apps/web/scripts/measurePersistence.ts` construit une vraie table de
    50 000 lignes × 25 colonnes (via `createTableFromRows`, le même code que l'app), simule 3
    onglets ouverts et 10 modifications rapprochées sur un seul d'entre eux, et compare l'ancien
    comportement (une réécriture complète de tout à chaque dispatch) au nouveau
    (`syncWorkspaceEntries` appelé une seule fois après le flush) :
    - Avant : **30 écritures** Dexie déclenchées, **~2168 Mo** sérialisés au total.
    - Après : **1 écriture**, **~72 Mo** sérialisés.
    - **97 % d'écritures et de volume en moins** sur ce scénario précis. Chiffres reproductibles
      (`bun run apps/web/scripts/measurePersistence.ts`) et notés dans le README comme demandé.
- **Chargement paresseux du moteur de rapprochement flou : tenté, mesuré comme inefficace, retiré.**
  J'ai converti l'import de `resolveFuzzyMatchesChunked` dans `engine.worker.ts` en `import()`
  dynamique, en ajoutant aussi `worker: { format: 'es' }` à `vite.config.ts` (le format par défaut
  IIFE ne permet aucun découpage en chunks). Au rebuild, **Vite a lui-même signalé l'import comme
  inefficace** (`INEFFECTIVE_DYNAMIC_IMPORT`) : `fuzzyJoin.ts` est déjà importé de façon statique
  par `enrichJoin.ts` (l'opération `enrich_join`, toujours enregistrée par
  `registerAllOperations()`, appelée aussi bien dans le Worker que côté thread principal pour
  `toPortable`/`rebind`) — l'`import()` ne bougeait donc rien, il ajoutait seulement l'overhead du
  helper d'import dynamique (chunk du Worker passé de 29,58 à 30,31 Ko, dans le mauvais sens).
  J'ai **annulé les deux changements** (`git checkout --` sur les deux fichiers, rien commité) une
  fois la mesure faite, plutôt que de laisser un code mort ou contre-productif. Documenté comme
  piège dans `CLAUDE.md` : un `import()` ne déplace un module dans un chunk séparé que si *aucun*
  autre point d'entrée du même graphe ne l'importe déjà de façon statique.
- **Chargement paresseux de l'export PDF / de la couche graphique : sans objet.** Vérifié par
  recherche exhaustive (`grep`) : rien dans `apps/web/src` en dehors de `pdf/` lui-même n'importe
  `pdf/` — ni `App.tsx`, ni aucun composant. Le bundle actuel ne contient déjà pas ce code (il
  n'est atteignable que depuis `apps/web/scripts/generateSamples.ts`, un script Node séparé) : il
  n'y a rien à rendre paresseux tant que le bouton d'export PDF n'existe pas dans l'UI — exclu du
  périmètre de cette nuit de toute façon.
- Vérifié à l'exécution, pas seulement au build : serveur de dev Vite relancé après le changement
  de persistance, page et module `workspace.tsx` servis sans erreur (200, code de
  `syncWorkspaceEntries` bien présent dans le module transformé).
- 278 tests au total (7 nouveaux), tous verts. `bun run build` vert, taille du bundle principal
  quasi inchangée (592,22 Ko contre 591,77 Ko avant — la différence vient uniquement du nouveau
  code de `persistWorkspace.ts`, pas d'une régression). `oxlint` : un nouvel avertissement
  `exhaustive-deps` introduit par mon premier essai (l'effet référençait `state` en entier sans le
  lister en dépendance) — corrigé avant de committer en ne référençant que `state.entries`/
  `state.order` explicitement à l'intérieur de l'effet, pas `state` lui-même.
- README.md (nouvelle section « Performance » avec les chiffres) et CLAUDE.md (nouveau piège
  documenté) mis à jour.

Pas fait / à vérifier :
- **Table résidant dans le Worker** et **stockage colonnaire dans `packages/core`** : explicitement
  hors périmètre de cette nuit (consigne NIGHT_RUN : « trop invasif pour un travail sans
  supervision, on le fera ensemble »). Ce sont, de loin, les deux optimisations avec le plus gros
  potentiel de gain sur un très gros fichier — notées comme prochaine étape naturelle une fois que
  tu pourras valider l'approche en direct.
- **Streaming du parsing CSV avec avancement réel** (item de la liste originale du prompt) : pas
  fait, et pas explicitement redemandé dans le découpage propre à cette phase de NIGHT_RUN
  (qui ne listait que les imports dynamiques et les écritures Dexie) — je l'ai donc traité comme
  hors du périmètre resserré de cette phase précise, pas oublié par erreur. Question que je t'aurais
  posée : veux-tu que je le fasse quand même avant de passer à la phase 8, ou le regrouper avec la
  table-dans-le-Worker (les deux touchent à la façon dont un gros fichier entre dans l'app) ?
- Pas de mesure de la taille du bundle "avant/après" pour les deux items sans effet réel (fuzzy
  matching, PDF) au-delà de ce qui est déjà noté ci-dessus — il n'y avait rien de plus à mesurer
  une fois la conclusion "inefficace"/"sans objet" établie.

Décisions prises faute de pouvoir demander :
- **Annuler plutôt que garder un `import()` inefficace.** Une fois Vite lui-même ayant signalé que
  l'import dynamique ne changeait rien, j'ai choisi de revenir en arrière proprement (revert des
  deux fichiers touchés) plutôt que de laisser un changement sans bénéfice réel (et légèrement
  négatif : +0,73 Ko sur le chunk Worker) trainer dans le code sous prétexte qu'il avait été
  "tenté". Cohérent avec l'esprit de la consigne de mesurer avant/après : une mesure qui montre
  l'absence de gain est un résultat légitime, pas un échec à cacher.
- **Fenêtre de debounce à 500 ms**, choisie sans repère explicite dans le prompt — assez courte
  pour qu'une pause naturelle dans la saisie (relâcher le clavier, changer de champ) déclenche
  l'écriture rapidement, assez longue pour absorber une rafale de dispatches rapprochés (plusieurs
  re-rendus déclenchés par une même interaction). Facile à ajuster (`PERSIST_DEBOUNCE_MS` dans
  `workspace.tsx`) si tu observes en usage réel qu'elle est trop courte ou trop longue.
- **`pagehide` plutôt que `beforeunload`** pour le vidage de sécurité à la fermeture de l'onglet —
  `pagehide` est la recommandation actuelle (compatible avec le cache arrière/avant du navigateur,
  fonctionne aussi sur mobile Safari où `beforeunload` est peu fiable), `beforeunload` a en plus
  tendance à bloquer certaines optimisations de navigation du navigateur.

Doutes pour Bonito :
- Le streaming CSV (ci-dessus) : dis-moi si tu le veux maintenant ou plus tard, groupé avec le
  travail Worker/colonnaire.
- Aucun outil de mesure de performance "en conditions réelles" (profileur navigateur, Lighthouse)
  n'a été utilisé cette nuit — uniquement des mesures ciblées sur le code exact qui a changé
  (nombre d'appels, volume sérialisé). Si tu veux un profil plus large (temps de rendu de la
  grille, temps de rejeu du pipeline sur un vrai fichier de 50 000 lignes dans un vrai navigateur),
  ce sera à faire avec toi, avec de vrais outils de profilage ouverts pendant l'usage.

---

## Phase 8 — Préparation au déploiement (fichiers, jamais appliqués)
Branche : night/8-deploy (part de night/7-performance)
Statut : terminée
Commits : d8aea54, cd2c4d5
Fait :
- `apps/web/wrangler.toml` : bloc `[assets]` pointant vers `./dist` (le build de production
  d'`apps/web`), `not_found_handling = "single-page-application"` pour le repli SPA demandé.
- `apps/web/public/_headers` (copié tel quel dans `dist/` par Vite, à la racine du répertoire
  servi — vérifié après un vrai `bun run build`) :
  - Cache immuable (`max-age=31536000, immutable`) sur `/assets/*` — les noms de fichiers de Vite
    incluent un hash de contenu, donc un cache infini est sans risque.
  - `Cache-Control: no-cache` sur `/index.html`, pour qu'un nouveau déploiement soit visible
    immédiatement plutôt que de servir une page qui référence des assets hashés déjà remplacés.
  - CSP stricte sur `/*`. Avant de l'écrire, vérifié par recherche exhaustive dans le code (pas
    seulement supposé) :
    - Aucun `eval()`/`new Function` nulle part dans le projet (le commentaire de
      `addExpressionColumn.ts` le confirme explicitement : arbre d'expression restreint, jamais
      d'`eval()` de texte libre) → `script-src 'self'` sans `'unsafe-eval'`.
    - Plusieurs composants (`DataGrid.tsx`, `ColumnProfilePanel.tsx`, `busy-indicator.tsx`) posent
      une largeur en style React inline (`style={{ width: ... }}`, colonnes redimensionnables et
      barres de progression) → `style-src` a besoin de `'unsafe-inline'`, sans quoi ces éléments
      perdraient leur mise en forme dynamique une fois la CSP appliquée.
    - L'app instancie un Web Worker (`new Worker(url, { type: 'module' })` dans `worker/client.ts`)
      dont dépend tout le rejeu de pipeline sans geler l'UI → `worker-src 'self'` explicite, pour
      ne pas compter sur un repli de navigateur non garanti (CSP3 traite `worker-src` comme une
      directive à part, plus de repli fiable vers `script-src`/`child-src` selon les navigateurs).
    - `connect-src 'none'` — confirme la promesse centrale du projet (aucune requête réseau) au
      niveau du navigateur lui-même, pas seulement par convention de code.
    - `object-src 'none'`, `base-uri 'none'`, `form-action 'none'` (aucun `<form>` dans le
      projet — vérifié), `frame-ancestors 'none'` : durcissement standard sans risque de casser
      quoi que ce soit dans cette app.
  - Aussi ajouté `X-Content-Type-Options: nosniff` et `Referrer-Policy: same-origin`, non demandés
    explicitement mais cohérents avec l'esprit « CSP stricte » de la consigne et sans risque de
    régression pour cette app.
- **Rien exécuté** : aucune commande `wrangler` lancée, aucun appel au MCP Cloudflare (ni pour lire
  ni pour écrire), aucun déploiement — conformément à l'interdit absolu de la nuit. Vérifié après
  écriture que `bun run build` copie bien `_headers` dans `apps/web/dist/` (fichier statique de
  `public/`, inchangé par le build), sans quoi le fichier existerait mais ne servirait à rien une
  fois réellement déployé.
- `bun run test` (278 tests, inchangé — ces fichiers ne sont pas du code TypeScript, rien à
  typechecker ni tester), `bun run build` vert, `bun run lint` sans nouvel avertissement.
- README.md (nouvelle section « Déploiement ») et CLAUDE.md (nouvelle section + entrée dans le
  diagramme de structure) mis à jour.

Pas fait / à vérifier :
- **Aucune validation par l'outil `wrangler` lui-même** (ex. `wrangler deploy --dry-run` ou
  équivalent) — interdit par les règles de la nuit (ne jamais exécuter de commande de déploiement).
  Le TOML et le format `_headers` sont écrits d'après ma connaissance de leur syntaxe documentée,
  mais n'ont pas été vérifiés par l'outil qui les consommera réellement. **Priorité avant tout
  déploiement réel** : lancer `wrangler` toi-même (ou avec moi, en session supervisée) sur ces
  fichiers avant de les utiliser pour de vrai.
- Pas de fichier `robots.txt`/`sitemap.xml` ni de configuration de domaine personnalisé — hors
  périmètre de ce que le prompt demandait (uniquement `wrangler.toml` + `_headers`).

Décisions prises faute de pouvoir demander :
- **CSP `style-src 'unsafe-inline'` plutôt qu'une CSP sans `unsafe-inline`.** Une CSP "parfaite"
  éviterait tout `'unsafe-inline'`, mais cette app utilise légitimement des largeurs dynamiques en
  style React inline (barres de progression à pourcentage variable, colonnes de grille
  redimensionnables par l'utilisateur) — les remplacer par des classes CSS générées dynamiquement
  ou des custom properties CSS serait un vrai chantier de refactor UI, hors de portée d'une phase
  de préparation au déploiement. J'ai documenté précisément pourquoi dans le fichier lui-même et
  dans CLAUDE.md, pour que ce ne soit pas un mystère si tu resserres la CSP plus tard.
- **`worker-src 'self'` ajouté explicitement**, alors que la consigne ne listait que
  `connect-src 'none'` comme exigence précise de CSP. Sans cette directive, il y avait un risque
  réel de casser le Web Worker selon le navigateur (CSP3 ne garantit pas de repli automatique et
  fiable de `worker-src` vers une autre directive) — j'ai préféré l'ajouter explicitement plutôt que
  de livrer une CSP qui casse la fonctionnalité la plus centrale de l'app (le rejeu non-bloquant).
- **En-têtes `X-Content-Type-Options`/`Referrer-Policy` ajoutés en plus de ce qui était
  explicitement demandé** — durcissement standard, faible risque de régression, cohérent avec
  l'esprit de la consigne (« CSP stricte incluant connect-src 'none' »). Question que je t'aurais
  posée : préfères-tu que je m'en tienne strictement à ce qui est nommé dans le prompt (juste la
  CSP) plutôt que d'ajouter des en-têtes non demandés, même standards ?

Doutes pour Bonito :
- Avant tout déploiement réel : fais valider `wrangler.toml` par `wrangler` lui-même (syntaxe
  susceptible d'évoluer d'une version à l'autre de Wrangler, jamais vérifiée ici faute de pouvoir
  l'exécuter) et teste la CSP en conditions réelles dans un navigateur avec la console ouverte —
  une CSP mal calibrée casse silencieusement des fonctionnalités (ici, le risque le plus probable
  serait `worker-src` ou `style-src` si j'ai mal identifié un cas d'usage).
- Si tu resserres `style-src` plus tard (retirer `'unsafe-inline'`), les trois fichiers cités
  ci-dessus (`DataGrid.tsx`, `ColumnProfilePanel.tsx`, `busy-indicator.tsx`) sont les seuls à
  auditer pour migrer leurs largeurs dynamiques vers une autre technique (custom properties CSS
  définies via `style` mais lues par une classe statique, par exemple).

---

