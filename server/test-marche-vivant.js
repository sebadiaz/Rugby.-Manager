// TEST DE PREUVE — LE MARCHÉ S'ARRÊTE ENTRE DEUX INTERSAISONS
//
// COMPORTEMENT ACTUEL OBSERVÉ (mesuré, 300 jours simulés, graine 777) :
//
//   joueurs ayant changé de club IA en cours de saison : 0
//   clubs IA dont le budget a bougé                     : 3 / 13
//
//   Les clubs adverses savent signer un joueur LIBRE en cours de saison
//   (`signatureRivaleDuJour`) et s'échangent des joueurs À L'INTERSAION
//   (`mercatoClubsIA`). Entre les deux, plus rien : pendant les neuf mois de
//   la saison, aucun joueur ne passe d'un club à l'autre.
//
// POURQUOI C'EST INSUFFISANT POUR LE JOUEUR : le monde est figé pendant qu'il
// joue. Une cible repérée chez un rival y sera encore dans six mois, quoi qu'il
// arrive ; un club en difficulté ne se renforce jamais ; la concurrence ne
// coûte rien. Le manager est le seul à agir dans un décor immobile — et le
// nouvel écran de transferts (G4), qui lui permet enfin d'acheter chez un
// rival, n'a aucune contrepartie : personne d'autre ne bouge.
//
// FONCTION EXACTE RESPONSABLE : docs/js/club-mercato.js, `avancerJourMercato`
// — elle appelle `signatureRivaleDuJour` (joueurs libres) et
// `reapprovisionnerMarche`, jamais d'échange entre clubs.
//
// SCÉNARIO DE REPRODUCTION : noter à quel club appartient chaque joueur IA,
// simuler 300 jours, comparer.
//
// CE QUE CE FICHIER EXIGE :
//   1. des transferts entre clubs IA EN COURS DE SAISON ;
//   2. la MÊME règle qu'à l'intersaison, jamais un second barème ;
//   3. joueur ET argent qui bougent réellement des deux côtés ;
//   4. la fenêtre de transfert respectée, comme pour le manager ;
//   5. une de mes offres en cours sur ce joueur devient caduque, et on me le
//      dit ;
//   6. des volumes crédibles — un marché vivant, pas un chaos ;
//   7. la direction réagit à une rupture de contrat coûteuse.
//
// Usage : node server/test-marche-vivant.js
'use strict';

const assert = require('assert');
global.window = global;
let stockage = {};
global.localStorage = {
  getItem: (k) => (k in stockage ? stockage[k] : null),
  setItem: (k, v) => { stockage[k] = String(v); },
  removeItem: (k) => { delete stockage[k]; },
};
global.window.RugbyEngine = require('../docs/rugby-engine.js');
const { chargerRMClub, creerRng } = require('./charger-club.js');
const RMClub = chargerRMClub();

let nbTests = 0;
function test(nom, fn) {
  nbTests++;
  try { fn(); console.log(`OK   ${nom}`); }
  catch (e) { process.exitCode = 1; console.error(`FAIL ${nom}`); console.error('     ' + e.message); }
}

let graine = 7000;
function nouvelleSaison(nom) {
  const s = RMClub.nouvelleSaison(creerRng(graine++), nom || 'AS Marché');
  RMClub.daterCalendrier(s);
  RMClub.assurerCompositionPourEquipe(s, 'pro');
  return s;
}
function empreinte(s) {
  const m = new Map();
  for (const c of s.adversaires || []) {
    for (const j of (c.groupe || c.effectif || [])) m.set(j.id, c.id);
  }
  return m;
}
function mouvements(s, avant) {
  let n = 0;
  for (const c of s.adversaires || []) {
    for (const j of (c.groupe || c.effectif || [])) {
      const ancien = avant.get(j.id);
      if (ancien && ancien !== c.id) n++;
    }
  }
  return n;
}

// UNE seule saison simulée jour par jour pour toute la suite.
const SAISON = nouvelleSaison();
const AVANT = empreinte(SAISON);
const BUDGETS = new Map((SAISON.adversaires || []).map((c) => [c.id, c.budget]));
for (let i = 0; i < 300; i++) RMClub.avancerUnJour(SAISON);
const MOUVEMENTS = mouvements(SAISON, AVANT);

test('V1 — PREUVE : des joueurs changent de club IA EN COURS DE SAISON', () => {
  assert.ok(MOUVEMENTS > 0,
    `sur 300 jours, des transferts entre clubs adverses doivent avoir lieu (${MOUVEMENTS})`);
});

test('V2 — la règle est PARTAGÉE avec l\'intersaison, pas dupliquée', () => {
  assert.strictEqual(typeof RMClub.tenterTransfertRival, 'function',
    'le pas élémentaire d\'un transfert entre clubs doit être une fonction unique');
  assert.strictEqual(typeof RMClub.transfertRivalDuJour, 'function',
    'et être appelé chaque jour par le marché');
  // Le mercato d'intersaison doit s'appuyer sur CE pas, sinon deux barèmes.
  const s = nouvelleSaison();
  const avant = empreinte(s);
  const transferts = RMClub.mercatoClubsIA(creerRng(3), s);
  assert.ok(Array.isArray(transferts), 'l\'intersaison doit continuer de fonctionner');
  const apres = mouvements(s, avant);
  assert.strictEqual(apres, transferts.length,
    `chaque transfert annoncé doit correspondre à un joueur réellement déplacé ` +
    `(${transferts.length} annoncés, ${apres} constatés)`);
});

test('V3 — joueur ET argent bougent réellement des deux côtés', () => {
  const s = nouvelleSaison();
  for (const c of s.adversaires) c.budget = 4000;
  // On force le pas élémentaire jusqu'à obtenir un transfert.
  let t = null;
  for (let i = 0; i < 60 && !t; i++) {
    t = RMClub.tenterTransfertRival(creerRng(500 + i), s);
  }
  assert.ok(t, 'un transfert doit pouvoir se conclure entre deux clubs adverses');
  const acheteur = s.adversaires.find((c) => c.id === t.versClubId);
  const vendeur = s.adversaires.find((c) => c.id === t.deClubId);
  assert.ok(acheteur && vendeur && acheteur.id !== vendeur.id, 'deux clubs distincts');
  assert.ok((acheteur.groupe || acheteur.effectif).some((j) => j.id === t.joueurId),
    'le joueur doit être dans son nouveau club');
  assert.ok(!(vendeur.groupe || vendeur.effectif).some((j) => j.id === t.joueurId),
    'et avoir quitté l\'ancien');
  assert.strictEqual(acheteur.budget, t.budgetAcheteurApres, 'l\'acheteur a payé');
  assert.strictEqual(vendeur.budget, t.budgetVendeurApres, 'le vendeur a encaissé');
  assert.strictEqual(t.budgetAcheteurAvant - acheteur.budget, t.montant, 'du montant exact');
  assert.strictEqual(vendeur.budget - t.budgetVendeurAvant, t.montant, 'et réciproquement');
});

test('V4 — la fenêtre de transfert est respectée, comme pour le manager', () => {
  const s = nouvelleSaison();
  for (const c of s.adversaires) c.budget = 4000;
  const date = RMClub.dateCourante(s);
  const fenetre = RMClub.etatFenetreTransfert(s, date);
  if (fenetre.ouverte) {
    // Fenêtre ouverte : le marché peut bouger.
    let vu = false;
    for (let i = 0; i < 200 && !vu; i++) {
      if (RMClub.transfertRivalDuJour(creerRng(900 + i), s, date)) vu = true;
    }
    assert.ok(vu, 'fenêtre ouverte : des transferts doivent pouvoir se produire');
  }
  // Fenêtre fermée : rien, jamais.
  const fermee = RMClub.fenetresTransfert(s);
  assert.ok(fermee, 'les fenêtres doivent être définies');
  const s2 = nouvelleSaison();
  for (const c of s2.adversaires) c.budget = 4000;
  const dateFermee = RMClub.ajouterJours(RMClub.dateCourante(s2), 120);
  if (!RMClub.etatFenetreTransfert(s2, dateFermee).ouverte) {
    for (let i = 0; i < 200; i++) {
      assert.strictEqual(RMClub.transfertRivalDuJour(creerRng(i), s2, dateFermee), null,
        'aucun transfert ne doit passer hors fenêtre');
    }
  }
});

test('V5 — une de mes offres sur ce joueur devient caduque, et on me le dit', () => {
  const s = nouvelleSaison();
  const cible = RMClub.joueursDesClubsAdverses(s, { limite: 1 })[0];
  s.clubJoueur.budget = cible.prixDemande * 4;
  const res = RMClub.proposerOffreTransfert(s, cible.clubId, cible.joueurId, cible.prixDemande);
  assert.strictEqual(res.ok, true, `l'offre doit partir (${res.motif})`);
  // Le joueur part ailleurs entre-temps.
  const club = s.adversaires.find((c) => c.id === cible.clubId);
  club.groupe = (club.groupe || club.effectif).filter((j) => j.id !== cible.joueurId);
  club.effectif = (club.effectif || []).filter((j) => j.id !== cible.joueurId);
  RMClub.avancerJusquA(s, RMClub.dateDepuisISO(s.offresSortantes[0].dateReponse));
  assert.strictEqual((s.offresSortantes || []).length, 0, 'l\'offre doit être close');
  assert.ok((s.clubJoueur.messages || []).some((m) => m.titre === 'Offre caduque'),
    'et le manager doit être prévenu');
});

test('V6 — les volumes restent crédibles', () => {
  // Un marché vivant, pas un chaos : sur une saison, le nombre de joueurs
  // passés d'un club adverse à un autre doit rester modeste devant les ~325
  // joueurs suivis.
  assert.ok(MOUVEMENTS <= 40,
    `un marché de saison ne doit pas tout mélanger (${MOUVEMENTS} mouvements)`);
  // Et les clubs ne doivent pas se ruiner.
  for (const c of SAISON.adversaires) {
    assert.ok(c.budget >= 0, `${c.nom} ne doit pas être à découvert (${c.budget} k€)`);
  }
  // Les effectifs restent jouables.
  for (const c of SAISON.adversaires) {
    const groupe = c.groupe || c.effectif || [];
    assert.ok(groupe.length >= 15,
      `${c.nom} doit garder de quoi aligner une équipe (${groupe.length})`);
  }
});

test('V7 — la DIRECTION réagit à une rupture de contrat coûteuse', () => {
  const s = nouvelleSaison();
  const parPoste = {};
  for (const j of s.clubJoueur.effectif) (parPoste[j.poste] = parPoste[j.poste] || []).push(j);
  const poste = Object.keys(parPoste).find((p) => parPoste[p].length >= 3);
  const j = parPoste[poste][0];
  j.contrat = 3; j.salaire = 40; // rupture chère
  s.clubJoueur.budget = 2000;
  s.clubJoueur.confiancePresident = 60;
  const indemnite = RMClub.indemniteRupture(j);
  assert.ok(indemnite >= 50, `l'indemnité doit être significative (${indemnite} k€)`);
  const res = RMClub.rompreContrat(s, j.id);
  assert.strictEqual(res.ok, true, `la rupture doit passer (${res.motif})`);
  assert.ok(s.clubJoueur.confiancePresident < 60,
    `la direction doit sanctionner une rupture coûteuse ` +
    `(${s.clubJoueur.confiancePresident} %)`);
  // Une rupture BON MARCHÉ ne doit pas déclencher la même réaction.
  const s2 = nouvelleSaison();
  const parPoste2 = {};
  for (const x of s2.clubJoueur.effectif) (parPoste2[x.poste] = parPoste2[x.poste] || []).push(x);
  const poste2 = Object.keys(parPoste2).find((p) => parPoste2[p].length >= 3);
  const j2 = parPoste2[poste2][0];
  j2.contrat = 1; j2.salaire = 5;
  s2.clubJoueur.budget = 2000;
  s2.clubJoueur.confiancePresident = 60;
  RMClub.rompreContrat(s2, j2.id);
  assert.strictEqual(s2.clubJoueur.confiancePresident, 60,
    'une rupture anodine ne doit pas émouvoir le président');
});

console.log(`\n${nbTests} test(s) exécuté(s).`);
