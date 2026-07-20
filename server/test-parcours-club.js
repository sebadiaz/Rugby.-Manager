// Tests du parcours principal du Mode Club (couche données, sans navigateur),
// même esprit que server/test-invariants.js — assertions ciblées, pas un
// framework de test. Couvre le minimum demandé pour un vrai parcours de
// gestion : création/chargement d'une carrière, sauvegarde/rechargement,
// composition valide, recrutement, progression d'une journée, consultation
// d'un club adverse, fin de saison. Usage : node server/test-parcours-club.js
'use strict';

const assert = require('assert');

global.window = global;
global.localStorage = (() => {
  let store = {};
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
})();

global.window.RugbyEngine = require('../docs/rugby-engine.js');
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club.js'), 'utf8'))(global.window);
const RMClub = global.window.RMClub;

function creerRng(graine) {
  let s = graine >>> 0 || 1;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

let nbTests = 0;
function test(nom, fn) {
  nbTests++;
  try {
    fn();
    console.log(`OK   ${nom}`);
  } catch (e) {
    console.error(`FAIL ${nom}`);
    console.error(e);
    process.exitCode = 1;
  }
}

// --- 1) Création et chargement d'une carrière ---
let saison;
test('création de carrière : club du joueur + 5 adversaires + calendrier complet', () => {
  const rng = creerRng(1);
  saison = RMClub.nouvelleSaison(rng, 'Club de Test');
  assert.strictEqual(saison.clubJoueur.nom, 'Club de Test');
  assert.strictEqual(saison.adversaires.length, 5);
  assert.strictEqual(saison.clubJoueur.effectif.length, RMClub.TAILLE_EFFECTIF_CIBLE);
  assert.ok(saison.calendrier.length > 0);
  assert.deepStrictEqual(saison.clubJoueur.messages, []);
});

// --- 2) Sauvegarde et rechargement ---
test('sauvegarde puis rechargement : la carrière survit à un rechargement de page', () => {
  const ok = RMClub.sauvegarderSaison(saison);
  assert.strictEqual(ok, true);
  const rechargee = RMClub.chargerSaison();
  assert.ok(rechargee);
  assert.strictEqual(rechargee.clubJoueur.nom, saison.clubJoueur.nom);
  assert.strictEqual(rechargee.clubJoueur.effectif.length, saison.clubJoueur.effectif.length);
});

// --- 3) Composition valide ---
test('composition : auto-remplissage produit toujours une équipe complète et valide', () => {
  const c = saison.clubJoueur;
  c.compositionTitulaires = RMClub.completerComposition(c.effectif, {});
  c.compositionBanc = RMClub.completerCompositionBanc(c.effectif, c.compositionTitulaires, {});
  const manquants = RMClub.validerComposition(c.compositionTitulaires);
  assert.strictEqual(manquants.length, 0, `postes manquants : ${JSON.stringify(manquants)}`);
  assert.strictEqual(Object.keys(c.compositionTitulaires).length, 15);
  const idsUniques = new Set(Object.values(c.compositionTitulaires));
  assert.strictEqual(idsUniques.size, 15, 'un même joueur ne doit jamais occuper deux numéros à la fois');
});

test('composition : prêter le dernier joueur disponible à un poste est refusé (rendrait la composition invalide)', () => {
  const c = saison.clubJoueur;
  const piliers = c.effectif.filter((j) => j.poste === 'P' && !j.pret);
  // Prête tous les piliers sauf un.
  for (let i = 0; i < piliers.length - 1; i++) {
    const r = RMClub.preterJoueur(saison, piliers[i].id, 3);
    assert.strictEqual(r.ok, true);
  }
  const dernier = piliers[piliers.length - 1];
  const refus = RMClub.preterJoueur(saison, dernier.id, 3);
  assert.strictEqual(refus.ok, false);
  assert.strictEqual(refus.motif, 'dernier_du_poste');
  // Rappelle tout pour ne pas fausser les tests suivants.
  for (const p of piliers) RMClub.rappelerJoueur(saison, p.id);
  c.compositionTitulaires = RMClub.completerComposition(c.effectif, {});
  assert.strictEqual(RMClub.validerComposition(c.compositionTitulaires).length, 0);
});

// --- 4) Recrutement ---
test('recrutement : signer un joueur du marché débite le budget et l\'ajoute à l\'effectif', () => {
  const c = saison.clubJoueur;
  const avantEffectif = c.effectif.length;
  const avantBudget = c.budget;
  const cible = saison.marche.slice().sort((a, b) => a.prixTransfert - b.prixTransfert)[0];
  const res = RMClub.signerJoueur(saison, cible.id);
  assert.strictEqual(res.ok, true);
  assert.strictEqual(c.effectif.length, avantEffectif + 1);
  assert.strictEqual(c.budget, avantBudget - res.coutTotal);
  assert.ok(c.effectif.some((j) => j.id === cible.id));
});

// --- 5) Progression d'une journée (le match du club du joueur) ---
test('progression d\'une journée : résultat enregistré, finances/fatigue/moral/entraînement appliqués', () => {
  const c = saison.clubJoueur;
  c.compositionTitulaires = RMClub.completerComposition(c.effectif, c.compositionTitulaires);
  c.compositionBanc = RMClub.completerCompositionBanc(c.effectif, c.compositionTitulaires, {});
  const fixture = saison.calendrier.find((f) => f.domicileId === c.id || f.exterieurId === c.id);
  assert.ok(fixture);
  const budgetAvant = c.budget;
  RMClub.enregistrerResultat(saison, fixture.id, 24, 10, 3, 1);
  assert.strictEqual(fixture.joue, true);
  const mouvement = RMClub.appliquerFinancesMatch(c, 'v');
  RMClub.enregistrerMouvementFinances(c, fixture.journee, mouvement);
  assert.notStrictEqual(c.budget, budgetAvant);
  const rng = creerRng(2);
  RMClub.faireProgresserBlessures(rng, c.effectif, c.compositionTitulaires, 1, saison);
  RMClub.appliquerFatigue(c.effectif, c.compositionTitulaires, 1);
  RMClub.appliquerMoral(c.effectif, c.compositionTitulaires, 'v');
  RMClub.progresserPrets(c.effectif);
  RMClub.appliquerEntrainement(rng, c.effectif, c.entrainementFocus, 1);
  const titulaireId = Object.values(c.compositionTitulaires)[0];
  const titulaire = c.effectif.find((j) => j.id === titulaireId);
  assert.ok(titulaire.fatigue > 0, 'un titulaire ayant joué doit avoir accumulé de la fatigue');
  const adversaireId = fixture.domicileId === c.id ? fixture.exterieurId : fixture.domicileId;
  RMClub.enregistrerResultatClubJoueur(saison, adversaireId, 24, 10, fixture.journee);
  assert.strictEqual(c.messages[0].categorie, 'match');
  assert.strictEqual(c.historiqueConfrontations[adversaireId].length, 1);
});

// --- 6) Affichage d'un club adverse ---
test('club adverse : identité, effectif complet et analyse comparative disponibles', () => {
  const adversaireId = saison.adversaires[0].id;
  const adv = RMClub.club(saison, adversaireId);
  assert.ok(adv);
  assert.strictEqual(adv.effectif.length, 15);
  assert.ok(adv.budget != null);
  const analyse = RMClub.analyserAdversaire(saison, adversaireId, 6);
  assert.ok(analyse);
  assert.strictEqual(analyse.comparaison.length, 7);
  assert.ok(Array.isArray(analyse.confrontations));
});

// --- 7) Fin de saison ---
test('fin de saison : vieillissement/renouvellement d\'effectif, archive et remise à zéro de la composition', () => {
  const c = saison.clubJoueur;
  const numeroAvant = saison.numero;
  const rng = creerRng(3);
  const { partis, arrivees } = RMClub.avancerSaison(rng, saison);
  assert.strictEqual(saison.numero, numeroAvant + 1);
  assert.strictEqual(c.effectif.length, RMClub.TAILLE_EFFECTIF_CIBLE);
  assert.strictEqual(c.compositionTitulaires, null, 'la composition doit être remise à zéro (effectif renouvelé)');
  assert.ok(c.historiqueSaisons.length >= 1);
  assert.ok(Array.isArray(partis) && Array.isArray(arrivees));
  assert.strictEqual(saison.adversaires.length, 5, 'identité des 5 adversaires conservée (pas régénérée de zéro)');
  assert.ok(saison.adversaires.every((a) => a.budget != null && a.effectif.length === 15));
  // La saison suivante doit rester jouable derechef.
  const compo = RMClub.completerComposition(c.effectif, {});
  assert.strictEqual(RMClub.validerComposition(compo).length, 0);
});

console.log(`\n${nbTests} test(s) exécuté(s).`);
if (process.exitCode) {
  console.error('ECHEC : au moins un test du parcours club a échoué.');
} else {
  console.log('OK : le parcours principal du Mode Club fonctionne de bout en bout.');
}
