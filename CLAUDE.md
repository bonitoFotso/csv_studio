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
- Aucune requête réseau dans le code de l'app (la CSP de prod interdira `connect-src`).
- Le `Pipeline` est rejouable/désactivable/annulable étape par étape via `replay()`, qui tourne
  dans le Worker (`src/worker/engine.worker.ts`) — jamais sur le thread principal pour une table
  de taille réelle.

## Ajouter une opération au moteur

Chaque opération vit dans `src/engine/operations/<nom>.ts` et exporte un `OperationDefinition`
avec quatre membres : `type`, `apply(table, params, ctx)`, `toPortable(params, tableBeforeStep, ctx)`,
`rebind(portableParams, nameToId, ctx?)`. L'enregistrer dans `src/engine/operations/index.ts`
(`registerAllOperations`) et ajouter son type à `OperationType` dans `src/engine/types.ts`.

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

## Structure

```
src/engine/          moteur pur (TypeScript, pas de DOM/React) — types, registre, replay, opérations
src/engine/operations/  une opération = un fichier
src/worker/           protocole + client + Worker (replay, doublons, rapprochement tournent ici)
src/components/       UI React, un dossier par fonctionnalité (columns/, filters/, join/, duplicates/, recipes/, append/, summarize/)
src/state/workspace.tsx  état global (React context + reducer), persistance Dexie
src/persistence/db.ts    schéma Dexie
```

## Session NIGHT_RUN (agrégation, rapports PDF, monorepo, MCP)

Une session autonome a démarré le 2026-07-30 pour implémenter `prompt-2-csv-studio-rapports-mcp.md`.
Voir `NIGHT_LOG.md` pour l'état détaillé phase par phase et les décisions prises sans pouvoir
demander confirmation. Chaque phase vit sur sa propre branche `night/<n>-<nom>`, non fusionnée.
