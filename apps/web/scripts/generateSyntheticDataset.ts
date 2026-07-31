// Génère un jeu de données synthétique réaliste pour les livrables de la phase 4 : 500 candidats
// (nom, prénom, date de naissance, nombre de présences, note, décision), avec des accents, des
// valeurs manquantes, et des doublons volontaires (exacts et quasi-exacts — casse/espaces
// différents) pour que le rapport de démonstration montre un vrai cas d'usage, pas un jeu de
// données propre par construction.

export interface CandidateRow {
  [key: string]: string;
  nom: string;
  prenom: string;
  date_naissance: string;
  nb_presences: string;
  note: string;
  decision: string;
}

// Petit générateur pseudo-aléatoire à graine fixe (mulberry32) : le jeu de données est
// reproductible d'une exécution à l'autre, pas un tirage différent à chaque fois.
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NOMS = [
  'Fotso', 'Kamga', 'Ngo', 'Mballa', 'Njoya', 'Talla', 'Sadjo', "N'Guessan", 'Biya', 'Essomba',
  'Tchoumi', 'Abena', 'Owona', 'Zang', 'Ateba', 'Ekani', 'Nkolo', "M'Bappe", 'Fouda', 'Assomo',
];

const PRENOMS = [
  'Bonito', 'Alice', 'Éric', 'Julie', "M'Barka", 'François', 'Céline', 'André', 'Noëlle', 'Régis',
  'Amélie', 'Rémy', 'Chloé', 'Désiré', 'Léa', 'Joël', 'Aïcha', 'Björn', 'Estelle', 'Théo',
];

const DECISIONS = ['Admis', 'Recalé', 'En attente'];

function pick<T>(arr: T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)];
}

function randomDate(rand: () => number): string {
  const year = 1980 + Math.floor(rand() * 25); // 1980-2004
  const month = 1 + Math.floor(rand() * 12);
  const day = 1 + Math.floor(rand() * 28);
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
}

function randomNote(rand: () => number): string {
  const value = rand() * 20;
  // Une note sur trois environ avec une décimale à virgule française, pour exercer le parsing
  // tolérant du moteur (12,5) plutôt que systématiquement un entier.
  if (rand() < 0.3) return value.toFixed(1).replace('.', ',');
  return String(Math.round(value));
}

export function generateSyntheticCandidates(count = 500, seed = 42): CandidateRow[] {
  const rand = mulberry32(seed);
  const rows: CandidateRow[] = [];

  for (let i = 0; i < count; i++) {
    const nom = pick(NOMS, rand);
    const prenom = pick(PRENOMS, rand);
    const hasPresence = rand() > 0.06; // ~6% d'absences totales non renseignées
    const hasNote = rand() > 0.08; // ~8% de notes manquantes (candidat non évalué)
    const hasDecision = rand() > 0.05; // ~5% de décisions en attente non renseignées

    rows.push({
      nom,
      prenom,
      date_naissance: randomDate(rand),
      nb_presences: hasPresence ? String(Math.floor(rand() * 21)) : '',
      note: hasNote ? randomNote(rand) : '',
      decision: hasDecision ? pick(DECISIONS, rand) : '',
    });
  }

  // Doublons volontaires : quelques exacts, quelques quasi-exacts (casse/espaces différents)
  // pour donner un vrai cas d'usage au dédoublonnage dans le pipeline de démonstration.
  const exactDupIndices = [12, 87, 233, 410];
  for (const idx of exactDupIndices) {
    rows.push({ ...rows[idx] });
  }
  const fuzzyDupIndices = [45, 190, 355];
  for (const idx of fuzzyDupIndices) {
    const original = rows[idx];
    rows.push({
      ...original,
      nom: `  ${original.nom.toUpperCase()}  `,
      prenom: original.prenom.toLowerCase(),
    });
  }

  return rows;
}
