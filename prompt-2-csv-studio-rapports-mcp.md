# Prompt Claude Code n°2 — CSV Studio : rapports, monorepo, MCP, performance

> À coller dans le dépôt CSV Studio existant. Suppose le `README.md` actuel à jour.

---

Le projet CSV Studio est fonctionnel : moteur d'opérations, recettes remappables, doublons, rapprochement exact et flou avec validation manuelle, persistance IndexedDB, Web Worker. Cette phase ajoute quatre choses, dans cet ordre : une capacité d'agrégation dans le moteur, une fonctionnalité de rapport avec graphiques et export PDF, une réorganisation en monorepo avec un serveur MCP, et un lot d'optimisations.

Lis le `README.md` et le code de `src/engine/` avant de proposer quoi que ce soit. Ne réécris pas l'existant : tout ce qui suit s'ajoute au moteur en place et en respecte les invariants (pipeline sérialisable, table source jamais mutée, colonnes référencées par `ColumnId` en interne et par nom dans les formats portables, aucune requête réseau).

---

## Phase 1 — Agrégation dans le moteur

Avant les rapports, le moteur doit savoir regrouper. Ajoute une opération `summarize` qui produit une **table dérivée** (granularité différente de la table d'entrée), traitée comme n'importe quelle autre étape du pipeline : rejouable, désactivable, annulable, calculée dans le worker, testée.

- `groupBy` : une ou plusieurs colonnes. Chacune avec son mode de normalisation, comme les clés de rapprochement (`raw` / `text` / `date`) — sinon « Douala » et « douala » comptent pour deux groupes.
- `aggregates` : liste de `{ column, fn, asName }` avec `count`, `countDistinct`, `countNonEmpty`, `sum`, `avg`, `min`, `max`, `median`, `first`, `concat`. `count` accepte l'absence de colonne (compte les lignes du groupe).
- **Binning** : une colonne numérique peut être découpée en tranches avant regroupement — largeur fixe, nombre de tranches, ou bornes explicites (`[0, 10, 12, 14, 16, 20]`). Les tranches produisent une étiquette lisible et **conservent leur ordre naturel**, y compris les tranches vides, qui doivent apparaître avec un compte de zéro. Un histogramme de notes avec un trou au milieu est un histogramme faux.
- Sortie : une table normale, consultable dans la grille. C'est aussi ton mode tableau croisé — expose-le dans l'UI, pas seulement au service des rapports.

Les valeurs restent des `string` en sortie, comme partout ailleurs, mais l'agrégation doit parser les nombres de façon tolérante (virgule décimale française, espaces insécables comme séparateur de milliers, champs vides ignorés et non comptés comme zéro). Une moyenne qui traite les absents comme des zéros est le bug le plus coûteux de cette phase — teste-le explicitement.

---

## Phase 2 — Rapports

### Le format `ReportSpec`

Un rapport est un JSON portable, **sœur de `Recipe`, pas un système parallèle**. Il réutilise le même mécanisme de portabilité : `formatVersion`, colonnes référencées **par nom**, et passage obligatoire par l'écran de remappage au chargement — pré-rempli par similarité, jamais deviné silencieusement. Factorise ce mécanisme au lieu de le dupliquer.

Structure attendue :

```jsonc
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
        { "label": "Taux de présence moyen", "agg": { "fn": "avg", "column": "nb_presences" }, "format": "percent" }
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
      "series": [{ "column": "effectif", "label": "Candidats" }],
      "caption": "Commentaire libre affiché sous le graphique."
    },
    {
      "type": "table",
      "title": "Candidats non appariés",
      "columns": ["nom", "prenom", "date_naissance"],
      "filter": { /* même format que les filtres du moteur */ },
      "maxRows": 200
    },
    { "type": "page_break" }
  ]
}
```

Points non négociables :

- Un bloc `chart` **ne recalcule rien lui-même** : son champ `summarize` est passé tel quel à l'opération de la phase 1. Une seule implémentation de l'agrégation dans tout le projet.
- Types de graphiques : barres (verticales et horizontales), barres empilées, lignes, secteurs/anneau, et histogramme (barres + binning). Rien d'autre pour l'instant — pas de nuage de points, pas de radar, ils ne servent pas ici.
- Le rapport est une **étape non destructive** : il lit l'état courant du pipeline, il ne le modifie jamais.
- Un `ReportSpec` invalide ou d'une version future doit produire un message d'erreur précis (quel bloc, quel champ, quelle valeur attendue), pas un écran blanc. Ce fichier sera souvent généré par un assistant : suppose qu'il arrivera parfois mal formé.

### L'éditeur de rapport

Nouvel onglet « Rapport » à côté de la grille. Deux panneaux : la liste des blocs à gauche, l'aperçu paginé à droite.

**Tout est éditable dans l'app**, sans repasser par le JSON : réordonner les blocs par glisser-déposer, dupliquer, supprimer, éditer les textes en place, changer le type d'un graphique, ses couleurs, son titre, son commentaire — et surtout **modifier les agrégations** : changer la colonne de regroupement, ajouter un agrégat, ajuster les bornes des tranches. Ajouter un graphique de zéro depuis un bouton, avec un formulaire qui liste les colonnes disponibles et propose les regroupements plausibles à partir du profil de colonnes (une colonne à faible cardinalité est une candidate au regroupement, une colonne numérique est une candidate à l'agrégation).

L'aperçu affiche les **pages réelles**, à la bonne largeur, avec les sauts au bon endroit — pas une version écran qu'on découvre différente une fois exportée. Toute modification est immédiatement réenregistrable en `.json` : l'aller-retour assistant → app → assistant doit rester ouvert dans les deux sens.

### Les deux modes de sortie

**Brouillon** — pour se relire soi-même. Filigrane « BROUILLON », date et heure de génération, et surtout le **bloc de traçabilité complet** : fichiers sources avec leur nombre de lignes, recette appliquée, liste des étapes du pipeline avec les comptes d'entrée/sortie, nombre d'appariements automatiques et manuels, nombre de lignes non appariées. C'est le document qui te permet de répondre à « d'où sort ce chiffre ».

**Officiel** — pour un partenaire ou un bailleur. En-tête avec logo importable (stocké localement) et nom de la structure, pied de page avec numérotation « page X sur Y », pas de filigrane, traçabilité condensée en une ligne discrète (date de génération, nombre de sources, empreinte courte du pipeline). La mise en page doit tolérer un titre long sans casser.

Le mode change la présentation, **jamais les chiffres**. Un même `ReportSpec` sur les mêmes données produit les mêmes valeurs dans les deux modes ; s'il y a une divergence, c'est un bug.

### Export PDF

**@react-pdf/renderer**, chargé en `import()` dynamique au clic sur « Exporter », jamais dans le bundle principal.

- Vrai PDF vectoriel, texte sélectionnable. **Pas de capture d'écran du DOM** : ni html2canvas, ni html2canvas-pro, ni jsPDF-en-mode-image. Le projet utilise Tailwind v4 et ses couleurs `oklch`, que ces outils ne savent pas parser, et la pagination des tableaux longs y est ingérable.
- **Les graphiques du PDF sont dessinés en vectoriel** avec les primitives `Svg` / `Path` / `Rect` / `Line` / `Text` de @react-pdf, à partir de `d3-scale` et `d3-shape`. Ne sérialise pas le SVG de l'écran pour le réinjecter.
- Écran et PDF partagent la **couche de calcul** — échelles, positions des barres, points des lignes, placement des étiquettes — dans un module commun sans dépendance au DOM. Deux rendus, une seule géométrie. Un écart entre l'aperçu et le PDF exporté est un bug de cette couche.
- Tableaux longs : en-tête répété sur chaque page (`fixed`), jamais de ligne coupée en deux.
- Police embarquée gérant les accents français. Vérifie l'export avec des noms contenant é, è, ô, ç et une apostrophe typographique.
- Les séries doivent rester distinguables **imprimées en noir et blanc** : joue sur la valeur et sur un motif de remplissage, pas seulement sur la teinte.

---

## Phase 3 — Monorepo et serveur MCP

### Découpage

Workspaces Bun :

```
packages/core     — le moteur, TypeScript pur, aucune dépendance React/DOM/navigateur
apps/web          — l'app actuelle, consomme @csv-studio/core
apps/mcp          — serveur MCP stdio, consomme @csv-studio/core
```

Déplace le moteur existant dans `packages/core` **sans en changer le comportement** : les tests actuels doivent passer sans modification. Si un import de `core` tire du DOM, c'est que la frontière est mal placée — corrige-la plutôt que de contourner. `core` exporte les types, le registre d'opérations, le rejeu, le profilage, l'agrégation, la validation de `Recipe` et de `ReportSpec`, et les parseurs CSV.

### Le serveur MCP

Serveur **stdio local uniquement**. Il lit les fichiers sur le disque de la machine et n'ouvre aucune connexion sortante. Pas de version distante : elle annulerait la garantie centrale du projet.

Expose un **petit jeu d'outils cohérent**, pas une fonction par opération — un modèle qui voit trente outils les confond :

| Outil | Rôle |
|---|---|
| `profile_csv` | Profil d'un fichier : colonnes, types détectés, taux de remplissage, cardinalité, valeurs fréquentes, quelques lignes d'exemple |
| `preview_pipeline` | Applique un pipeline JSON et renvoie un résumé + un échantillon, sans rien écrire |
| `apply_pipeline` | Applique et écrit le résultat dans un fichier de sortie |
| `match_files` | Rapproche deux fichiers, renvoie les compteurs (appariés, non appariés, ambigus) et le chemin des non-appariés |
| `find_duplicates` | Groupes de doublons sur des clés données, avec compteurs et échantillon |
| `build_report` | Valide un `ReportSpec` contre un fichier et renvoie les agrégats calculés |

**Règle absolue sur les volumes** : aucun outil ne renvoie jamais une table entière. Toujours un résumé structuré, un échantillon borné (30 lignes par défaut, plafond configurable), et des chemins de fichiers pour le reste. Chaque réponse annonce le nombre total de lignes concernées et le fait qu'elle est tronquée. C'est la façon la plus courante de rendre un serveur MCP de données inutilisable — ne la reproduis pas.

Les outils qui écrivent (`apply_pipeline`, export) n'écrasent jamais un fichier existant sans un paramètre explicite, et n'écrivent que dans un répertoire de travail passé au démarrage.

### Le pont avec l'app

Ajoute dans l'app un bouton **« Copier le profil pour un assistant »** : il copie dans le presse-papiers le profil de colonnes de la table active — noms, types, remplissage, cardinalité, valeurs fréquentes — **sans aucune donnée personnelle identifiable**, et sans lignes brutes. Ce contenu est exactement ce que `profile_csv` renvoie : le même contrat, avec ou sans MCP.

Documente dans le README le cycle complet : profil copié ou lu par MCP → l'assistant produit un `ReportSpec` → import dans l'app → remappage → édition dans l'aperçu → export PDF.

---

## Phase 4 — Performance

Ces optimisations ne changent aucun comportement observable. Mesure avant et après, sur un fichier de 50 000 lignes et 25 colonnes généré pour l'occasion, et note les chiffres dans le README.

1. **La table vit dans le worker.** Aujourd'hui chaque aller-retour sérialise la table entière. Garde l'état des tables côté worker et ne transmets au thread principal que la tranche visible de la grille plus les métadonnées. C'est le gain le plus important, et de loin.
2. **Stockage colonnaire** dans `core` : un tableau par colonne plutôt qu'un tableau d'objets par ligne. Moins de mémoire, itérations bien plus rapides sur les filtres et agrégats. L'API publique de `Table` ne doit pas changer.
3. **Chargement paresseux** en `import()` dynamique : @react-pdf, la couche graphique, le moteur de rapprochement flou, l'export. Le bundle initial ne doit contenir que l'import, la grille et les opérations de base.
4. **Écritures Dexie débouncées** et différentielles — ne réécris pas l'espace de travail entier à chaque frappe.
5. Parsing CSV en **streaming** avec avancement réel, pour que l'ouverture d'un gros fichier n'apparaisse jamais comme un blocage.

**Ne migre pas vers TanStack Start.** C'est un framework à rendu serveur ; le projet n'a pas de serveur, par choix, et le rendu serveur n'a aucune prise sur les coûts réels listés ci-dessus. Si un routeur devient nécessaire pour l'état d'URL, utilise TanStack Router en mode client seul.

---

## Règles de travail

- Livre phase par phase, en t'arrêtant après chacune pour que je teste avec mes vrais fichiers. L'ordre compte : la phase 2 dépend de la 1, la 3 suppose les deux premières stabilisées.
- Tests en même temps que le code, pas après : agrégation et binning, validation d'un `ReportSpec` malformé, égalité des chiffres entre mode brouillon et mode officiel, égalité de la géométrie entre l'aperçu écran et le rendu PDF, réponses MCP bornées en taille.
- Aucun nom de colonne codé en dur, nulle part, y compris dans les gabarits de rapport.
- Aucune requête réseau ajoutée. La CSP de production interdit `connect-src` — si une dépendance en a besoin, ne l'ajoute pas.
- Mets à jour le `README.md` et le `CLAUDE.md` à la fin de chaque phase.
- Demande-moi plutôt que de deviner sur : le contenu par défaut du bloc de traçabilité, la structure d'un `ReportSpec` que tu voudrais faire évoluer, l'ajout d'une dépendance non citée ici.

Commence par me proposer les types `SummarizeParams`, `ReportSpec` et `ReportBlock`, plus la liste des outils MCP avec leurs schémas d'entrée et de sortie. N'écris aucune UI avant que j'aie validé ces contrats.
