# Passage au Web Worker — note d'architecture

> **Statut : implémenté** selon les propositions ci-dessous (portée replay + doublons + rapprochement, seuil de 150 ms, annulation limitée au rapprochement flou). Voir `src/worker/`.

Ce document explique ce qui doit bouger, pourquoi, et ce que ça change concrètement dans le comportement de l'app, avant l'implémentation. Écrit pour qu'on tranche ensemble les points ouverts en bas de page.

## Pourquoi maintenant

Trois traitements tournent aujourd'hui en synchrone sur le thread principal :

- `replay()` — rejoue tout le pipeline depuis la table source, appelé à **chaque rendu** de la table active (`useActiveTable` dans `state/workspace.tsx`).
- `computeDuplicateGroups()` — recalculé à chaque changement de colonne-clé/mode dans le dialogue Doublons.
- `matchRowsExact()` / `resolveFuzzyMatches()` — recalculés à chaque changement de config dans le dialogue Rapprocher, pour l'aperçu en direct.

Sur 500 à quelques milliers de lignes, tout ça est instantané. Le risque apparaît à 50 000 lignes, et surtout avec l'appariement flou : chaque paire comparée dans un bloc coûte un Jaro-Winkler + un Levenshtein (coût quadratique en longueur de chaîne), donc un bloc mal choisi (blocage trop large, ex. juste l'année de naissance sur une promo nombreuse) peut faire exploser le nombre de comparaisons et geler l'onglet plusieurs secondes.

Le point important à comprendre : **`replay()` ne met rien en cache**. Si un pipeline contient une étape `deduplicate` ou `enrich_join` (flou ou exact) coûteuse, cette étape est **recalculée depuis zéro à chaque fois** qu'on rejoue le pipeline — pas seulement au moment où on la configure dans son dialogue, mais aussi plus tard, dès qu'on ajoute une étape suivante, qu'on clique sur une autre étape dans la colonne latérale, ou qu'on rouvre l'onglet. C'est le vrai scénario de gel, pas juste l'aperçu interactif.

## Ce qu'un Worker change réellement

### 1. La limite de sérialisation

`postMessage` clone les données (structured clone). Une `Table` (lignes + colonnes, tout en string) se clone sans problème technique, mais **le clonage a un coût** : pour une table de 50 000 lignes × 15 colonnes, on parle de plusieurs Mo copiés vers le worker, puis le résultat copié en sens inverse. Pour une opération triviale (renommer une colonne), ce coût de copie peut dépasser le coût du calcul lui-même — le Worker peut donc *ralentir* les petites opérations tout en accélérant les grosses.

Deux implications :

- Il ne faut **pas** envoyer tout au Worker par principe. Les opérations bon marché (renommer, filtrer, normaliser) n'ont aucun intérêt à y passer.
- Pour les opérations qui y passent, il faut éviter les allers-retours répétés : envoyer la table une fois, faire tourner plusieurs étapes si besoin, ne récupérer que le résultat final.

### 2. Le modèle de rendu de `useActiveTable`

Aujourd'hui :

```ts
const displayResult = useMemo(() => replay(...), [entry]);
```

C'est **synchrone** : le composant a le résultat dans le même rendu. Si `replay` devient asynchrone (Worker), ce hook doit renvoyer un état qui distingue :

- le dernier résultat connu (affiché tout de suite, même s'il est un peu périmé),
- un indicateur "recalcul en cours",
- le nouveau résultat quand il arrive (le composant se re-rend alors).

C'est un changement de nature, pas juste un détail d'implémentation : `useActiveTable` passe d'un calcul pur à un état asynchrone avec effet de bord. Tous les endroits qui lisent `active.displayTable` continuent de fonctionner (ils lisent juste le dernier résultat connu), mais on doit décider où afficher l'indicateur de recalcul (barre de progression demandée par le brief).

### 3. Barre de progression et annulation

Un Worker mono-thread qui tourne une boucle serrée bloque **son propre** event-loop, mais peut quand même émettre des `postMessage` de progression pendant qu'il tourne — le thread principal les reçoit dès qu'il est libre. Donc une barre de progression simple (ex. "12 400 / 50 000 lignes comparées") ne demande qu'à découper la boucle chaude et poster un message tous les N éléments.

L'**annulation** (bouton "Annuler" pendant un calcul long) demande plus : le Worker doit céder la main périodiquement (`await` sur un `setTimeout(0)` toutes les quelques milliers d'itérations) pour pouvoir vérifier un signal d'arrêt entre deux tranches. Sans ça, un clic sur "Annuler" ne sera traité qu'une fois le calcul terminé — ce qui annule l'intérêt de l'annulation. Je compte l'implémenter dès le départ (le découpage en tranches est presque gratuit une fois qu'on l'a fait pour la progression).

### 4. Ce qui bouge vs ce qui reste sur le thread principal

Je propose de faire tourner dans le Worker :

- `replay()` dans son intégralité (donc toutes les opérations, mais le coût marginal des opérations bon marché reste négligeable une fois la table déjà copiée) ;
- le calcul des groupes de doublons (`computeDuplicateGroups`) pour l'aperçu du dialogue Doublons ;
- le calcul des correspondances exactes/floues (`matchRowsExact`, `resolveFuzzyMatches`) pour l'aperçu du dialogue Rapprocher.

Restent sur le thread principal (jamais assez coûteux pour justifier l'aller-retour) :

- le profil de colonnes (déjà un simple passage par colonne) ;
- le parsing CSV (PapaParse a son propre mode worker interne si besoin, indépendant de celui-ci) ;
- l'export CSV.

### 5. Un seul Worker, réutilisé

Un unique Worker partagé (créé une fois, gardé en vie) plutôt qu'un Worker par appel — créer un Worker a un coût de démarrage non négligeable. Le client (thread principal) lui envoie des messages `{ requestId, type, payload }` et route les réponses par `requestId`, via une petite API promise-based (`workerClient.replay(table, steps, cursor, options)` qui renvoie une Promise). Si un nouvel appel arrive alors qu'un ancien n'est pas terminé (l'utilisateur tape vite dans un filtre), l'ancien est annulé côté client (on ignore sa réponse, ou on envoie un signal d'annulation).

## Risques et compromis assumés

- **Complexité de débogage accrue** : une erreur dans le Worker n'apparaît plus dans la pile d'appels React habituelle ; il faut soigner les messages d'erreur remontés (le Worker doit renvoyer `{error: message}` plutôt que de crasher silencieusement).
- **Latence ajoutée sur les petites opérations** : même minime (quelques millisecondes de sérialisation + trajet), elle est mesurable. Sur ce projet (500 à 50 000 lignes, usage interne), ce n'est pas gênant, mais ce n'est pas gratuit non plus.
- **État transitoire à afficher** : entre le moment où le pipeline change et celui où le nouveau résultat arrive, on affiche l'ancien état + un indicateur. Il faut un endroit clair pour cet indicateur (probablement une fine barre en haut de la grille, cohérente avec "le pipeline est visible en permanence").
- **Vitest et le Worker** : Vitest tourne en Node, pas dans un vrai navigateur — les tests du moteur (`replay`, `computeDuplicateGroups`, etc.) continuent de tester les fonctions pures directement, **sans** passer par le Worker. Le Worker n'est qu'un transport ; sa logique interne se limite à "appeler la fonction pure, découper en tranches, poster la progression". Je testerai ce découpage séparément (fonctions pures testables : `chunkedReplay`, etc.), pas le fil d'exécution du Worker lui-même (peu de valeur à le mocker).

## Plan d'implémentation

1. `src/worker/protocol.ts` — types des messages (requêtes/réponses/progression/erreur/annulation).
2. `src/worker/engine.worker.ts` — le Worker lui-même : reçoit une requête, appelle la fonction pure du moteur, découpe les boucles chaudes en tranches pour la progression/annulation.
3. `src/worker/client.ts` — wrapper thread principal : API promise-based, gestion des `requestId`, annulation de la requête précédente si une nouvelle arrive.
4. Adapter `useActiveTable` (dernier résultat connu + indicateur de recalcul), et les dialogues Doublons/Rapprocher (aperçu asynchrone au lieu de `useMemo` synchrone).
5. Fine barre de progression dans l'UI (composant partagé), affichée dès qu'un calcul dépasse un seuil (ex. 150 ms) pour ne pas clignoter sur les calculs rapides.
6. Tests : découpage en tranches testé comme fonction pure ; pas de test d'intégration du vrai Worker (peu de valeur, beaucoup de friction en CI).

## Points à trancher avant de coder

1. **Portée du passage au Worker** : je propose *replay + doublons + rapprochement* (voir §4). Une portée plus étroite (seulement doublons/rapprochement, `replay` reste synchrone) est plus simple mais laisse le vrai scénario de gel décrit en intro (rejeu d'un pipeline contenant une étape flou coûteuse) non résolu.
2. **Seuil d'affichage de la barre de progression** : je propose de ne l'afficher que si le calcul dépasse ~150 ms, pour ne pas faire clignoter l'UI sur les cas rapides. Un seuil différent te convient mieux ?
3. **Annulation** : je compte l'implémenter dès le départ pour le rapprochement flou (le cas le plus susceptible d'être long). Pour `replay`, une annulation a moins de sens (on veut le résultat, pas juste "voir passer" le calcul) — je ne prévois pas de bouton Annuler là, juste la barre de progression.
