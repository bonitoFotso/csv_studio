# CSV Studio

Application 100 % côté navigateur pour dédoublonner, rapprocher et nettoyer des CSV. Aucun backend, aucune donnée n'est envoyée sur le réseau. Fonctionne hors ligne après le premier chargement ; le travail en cours est persisté localement (IndexedDB) et retrouvé à la réouverture de l'onglet.

## Lancer le projet

```bash
bun install       # ou npm install
bun run dev       # serveur de dev Vite
bun run test      # tests du moteur (Vitest)
bun run build     # build de production
```

## État actuel

- **Moteur** (`src/engine/`) : types, registre d'opérations, rejeu, undo/redo, édition en place du pipeline, profil de colonnes, recette + remappage par nom (y compris pour un rapprochement à deux fichiers). Testé (Vitest).
- **Colonnes / normalisation / filtres** : renommer, réordonner (glisser l'en-tête), supprimer (avec confirmation), masquer/afficher, dupliquer ; ajout de colonne (constante, concaténation, extraction, numérotation, expression simple) ; normalisation (trim, espaces, casse, accents, ponctuation, chiffres seuls, écraser ou nouvelle colonne) ; filtres avec groupes ET/OU, opérateurs selon le type détecté, aperçu du nombre de lignes concernées avant d'appliquer.
- **Doublons** : détection par groupe (clés libres, comparaison exacte ou normalisée), bloc par groupe avec cellules divergentes surlignées, action par défaut ou par groupe, export des doublons vers une nouvelle table.
- **Rapprochement exact et flou** (bouton « Rapprocher ») : import d'un second fichier, paires de colonnes-clés, collisions de noms, jointure gauche/interne, cas 1→N (première/agrégation/signalement). En mode flou : normalisation + comparaison par jetons non ordonnés, score Jaro-Winkler/Levenshtein, blocage obligatoire, deux seuils, écran de validation manuelle pair-à-pair (Valider/Rejeter/Passer au clavier). Les décisions manuelles sont indexées par valeurs de clé normalisées et voyagent avec la recette. Le résumé indique aussi combien de lignes du **fichier de droite** n'ont jamais été retenues par personne (utile quand le fichier de droite est plus petit que le fichier de gauche) : un écran dédié liste ces lignes, permet de les exporter, ou d'apparier manuellement l'une d'elles à une ligne de gauche précise — même si le blocage les avait exclues de toute comparaison automatique.
- **Normalisation des clés avant comparaison** : chaque paire de colonnes-clés (rapprochement exact) et chaque critère de blocage (rapprochement flou) a son propre mode — *brute* (comparaison telle quelle), *texte* (casse, accents, ponctuation, espaces ignorés) ou *date* (« 19/07/2026 », « 19-07-2026 », « 9/7/2026 » et « 2026-07-19 » sont reconnus comme la même date, quel que soit le séparateur ou le zéro-padding). Par défaut « texte » pour toute nouvelle paire — s'ajuste par colonne, pas globalement, puisqu'une clé composite mélange souvent un champ texte et un champ date.
- **Ajouter des lignes depuis un fichier** (bouton « Ajouter des lignes ») : importe un second fichier et, pour chaque colonne de la table active, permet de choisir la colonne correspondante à copier (pré-rempli par similarité de nom) ; les lignes du fichier importé sont ajoutées à la fin, les colonnes non mappées restent vides sur ces nouvelles lignes. Distinct du rapprochement : celui-ci ajoute des *colonnes*, celui-là ajoute des *lignes*.
- **Persistance & recettes** : l'espace de travail (tables, pipelines, fichiers de droite) est sauvegardé dans IndexedDB (Dexie) à chaque changement et restauré au chargement. Une recette (pipeline sans données) peut être enregistrée (Dexie + export `.json`) et rechargée sur un autre fichier via un écran de remappage — colonnes principales et, le cas échéant, colonnes du second fichier d'un rapprochement ou d'un ajout de lignes, chacune pré-remplie par similarité de nom mais jamais devinée silencieusement.
- **Web Worker** (`src/worker/`) : le rejeu du pipeline, le calcul des groupes de doublons et le rapprochement (exact et flou) tournent hors du thread principal, jamais l'UI ne gèle. Barre de progression (réelle pour le rapprochement flou — le calcul le plus coûteux — indéterminée ailleurs), affichée seulement au-delà de 150 ms. Annulation de l'aperçu flou en cours dès que la config change. Détail de la conception dans `WEB_WORKER.md`.
- **Pas encore fait** : export XLSX (CSV uniquement pour l'instant, par choix explicite).

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

## Stack

React + TypeScript + Vite, Tailwind v4 (primitives façon shadcn/ui écrites à la main : cva + tailwind-merge, pas de CLI), PapaParse (import/export CSV), Dexie (persistance IndexedDB), TanStack Table + react-virtual (grille virtualisée), Web Worker natif (rejeu/doublons/rapprochement), Vitest (tests moteur).
