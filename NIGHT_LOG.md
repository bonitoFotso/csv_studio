# Journal de session autonome — NIGHT_RUN

## Résumé (à compléter en fin de session)

_En cours…_

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

