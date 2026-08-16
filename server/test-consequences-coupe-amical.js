// COUVERTURE — les conséquences d'un match de COUPE et d'un match AMICAL.
//
// Même problème que pour le championnat (cf. test-consequences-match.js, N6) :
// ces deux chaînes vivaient dans `clubUI.js`, à l'intérieur des callbacks
// `onResultat` de `resoudreCoupeDuJour` et `resoudreAmicalDuJour` — 16 appels
// métier chacune, sur des chemins que le joueur emprunte réellement, et
// AUCUN test direct. Elles n'étaient exercées qu'en pilotant un navigateur.
//
// Extraites dans `club-coupes.js` et `club-amicaux.js` (N7), elles deviennent
// testables ici.
//
// Usage : node server/test-consequences-coupe-amical.js
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

let graine = 31000;

// --- Contexte COUPE : une carrière, ses coupes, et la première rencontre du
// tableau qui concerne réellement le club du joueur.
function contexteCoupe(scoreA, scoreB) {
  const s = RMClub.nouvelleSaison(creerRng(graine++), 'AS Coupe');
  RMClub.daterCalendrier(s);
  const slot = RMClub.assurerCompositionPourEquipe(s, 'pro');
  RMClub.assurerCoupes(s);
  const c = s.clubJoueur;
  let coupe = null, rencontre = null;
  for (const cle of Object.keys(s.coupes || {})) {
    const co = s.coupes[cle];
    for (const tour of (co.tours || [])) {
      const r = (tour.rencontres || []).find(
        (x) => !x.joue && (x.domicileId === c.id || x.exterieurId === c.id));
      if (r) { coupe = co; rencontre = r; break; }
    }
    if (rencontre) break;
  }
  assert.ok(rencontre, 'le club du joueur doit être engagé dans au moins une coupe');
  const domicile = rencontre.domicileId === c.id;
  const adversaireId = domicile ? rencontre.exterieurId : rencontre.domicileId;
  const adversaire = RMClub.clubPartout(s, adversaireId)
    || coupe.clubs.find((x) => x.id === adversaireId);
  const lettre = domicile ? 'A' : 'B';
  const etat = {
    score: { A: scoreA == null ? 24 : scoreA, B: scoreB == null ? 12 : scoreB },
    statsJoueurs: { A: {}, B: {} },
  };
  // La date d'une rencontre de coupe vit sur son TOUR, pas sur la rencontre.
  const iso = coupe.tours[rencontre.tour].date;
  return { s, c, coupe, rencontre, adversaire, lettre, etat, iso,
           compo: slot.compositionTitulaires, date: RMClub.dateDepuisISO(iso) };
}
function appliquerCoupe(ctx) {
  return RMClub.appliquerConsequencesMatchCoupe(ctx.s, {
    coupe: ctx.coupe, rencontre: ctx.rencontre, adversaire: ctx.adversaire,
    date: ctx.date, etat: ctx.etat, lettreJoueur: ctx.lettre,
    compositionUtilisee: ctx.compo,
    rng: creerRng(11), rngCoupes: creerRng(13),
  });
}

// --- Contexte AMICAL : une rencontre programmée à une date libre contre un
// club de la division, celui-là même que l'interface propose.
function contexteAmical(scoreA, scoreB) {
  const s = RMClub.nouvelleSaison(creerRng(graine++), 'AS Amicale');
  RMClub.daterCalendrier(s);
  const slot = RMClub.assurerCompositionPourEquipe(s, 'pro');
  const c = s.clubJoueur;
  const adversaire = (s.adversaires || []).find((x) => RMClub.aUnEffectifSimule(x));
  assert.ok(adversaire, 'il faut un adversaire dans la division');
  const libres = RMClub.datesLibresPourAmical(s, 60);
  assert.ok(libres.length > 0, 'il doit exister au moins une date libre');
  const res = RMClub.proposerAmical(s, adversaire.id, libres[0].iso);
  assert.ok(res.accepte, `l'amical doit être accepté (${res.message})`);
  const etat = {
    score: { A: scoreA == null ? 31 : scoreA, B: scoreB == null ? 17 : scoreB },
    statsJoueurs: { A: {}, B: {} },
  };
  return { s, c, adversaire, amical: res.amical, etat, compo: slot.compositionTitulaires };
}
function appliquerAmical(ctx) {
  return RMClub.appliquerConsequencesMatchAmical(ctx.s, {
    amical: ctx.amical, adversaire: ctx.adversaire, etat: ctx.etat,
    compositionUtilisee: ctx.compo,
    rng: creerRng(17), rngAdverse: creerRng(19),
  });
}

// ---------------------------------------------------------------- COUPE ---

test('K1 — le résultat de coupe est enregistré et désigne un vainqueur', () => {
  const ctx = contexteCoupe(24, 12);
  assert.ok(!ctx.rencontre.joue, 'la rencontre ne doit pas être déjà jouée');
  appliquerCoupe(ctx);
  assert.ok(ctx.rencontre.joue, 'la rencontre doit être marquée jouée');
  assert.strictEqual(ctx.rencontre.score.domicile, 24);
  assert.strictEqual(ctx.rencontre.score.exterieur, 12);
  assert.ok(ctx.rencontre.vainqueurId, 'un vainqueur doit être désigné');
});

test('K2 — le moral suit le VAINQUEUR réel, pas le score brut', () => {
  // Le club du joueur peut être à l'extérieur : gagner 12-24 est une
  // qualification. Une lecture naïve de `score.A > score.B` se tromperait.
  const ctx = contexteCoupe(10, 30);
  const r = appliquerCoupe(ctx);
  const gagneAttendu = ctx.rencontre.vainqueurId === ctx.c.id;
  assert.strictEqual(r.gagne, gagneAttendu,
    'le verdict doit venir de vainqueurId, pas de la comparaison A/B');
  assert.ok(r.message.includes(gagneAttendu ? 'Qualifié' : 'Éliminé'),
    `le message doit correspondre au verdict (${r.message})`);
});

test('K3 — fatigue et matchs joués appliqués aux titulaires', () => {
  const ctx = contexteCoupe();
  const ids = Object.values(ctx.compo);
  const avant = ids.map((id) => {
    const j = ctx.c.effectif.find((x) => x.id === id);
    return { id, fatigue: j.fatigue || 0, matchs: j.matchsJoues || 0 };
  });
  appliquerCoupe(ctx);
  let fatigues = 0, joues = 0;
  for (const a of avant) {
    const j = ctx.c.effectif.find((x) => x.id === a.id);
    if ((j.fatigue || 0) > a.fatigue) fatigues++;
    if ((j.matchsJoues || 0) > a.matchs) joues++;
  }
  assert.ok(fatigues >= 12, `un match de coupe fatigue vraiment (${fatigues}/15)`);
  assert.ok(joues >= 12, `et compte comme un match joué (${joues}/15)`);
  const hors = ctx.c.effectif.find((j) => !ids.includes(j.id));
  assert.strictEqual(hors.matchsJoues || 0, 0, 'un non-sélectionné ne joue pas');
});

test('K4 — la coupe ne touche NI le championnat NI les finances', () => {
  const ctx = contexteCoupe();
  const budgetAvant = ctx.c.budget;
  const jouesAvant = (ctx.s.calendrier || []).filter((f) => f.joue).length;
  const essaisAvant = (ctx.c.statsCumulees && ctx.c.statsCumulees.essais) || 0;
  appliquerCoupe(ctx);
  assert.strictEqual(ctx.c.budget, budgetAvant,
    'un match de coupe ne produit aucune recette ici (pas de billetterie de coupe)');
  assert.strictEqual((ctx.s.calendrier || []).filter((f) => f.joue).length, jouesAvant,
    'aucune rencontre de championnat ne doit passer à « jouée »');
  assert.strictEqual((ctx.c.statsCumulees && ctx.c.statsCumulees.essais) || 0, essaisAvant,
    'les statistiques de championnat ne bougent pas');
});

test('K5 — le reste du tour est résolu en arrière-plan, sauf le match du joueur', () => {
  const ctx = contexteCoupe();
  const memeJour = [];
  for (const cle of Object.keys(ctx.s.coupes)) {
    for (const tour of ctx.s.coupes[cle].tours || []) {
      if (tour.date !== ctx.iso) continue;
      for (const r of tour.rencontres || []) memeJour.push(r);
    }
  }
  assert.ok(memeJour.length > 1, 'le tour doit comporter plusieurs rencontres le même jour');
  appliquerCoupe(ctx);
  const restantes = memeJour.filter((r) => !r.joue);
  assert.strictEqual(restantes.length, 0,
    `toutes les rencontres du jour doivent être résolues (${restantes.length} en attente)`);
});

test('K6 — un message de coupe est publié au fil d\'actualité', () => {
  const ctx = contexteCoupe();
  const avant = (ctx.c.messages || []).length;
  const r = appliquerCoupe(ctx);
  const messages = ctx.c.messages || [];
  // Le match peut aussi publier des blessures : on cherche LE message de
  // résultat, pas « le dernier ajouté ».
  assert.ok(messages.length > avant, 'au moins un message ajouté');
  const msg = messages.find((m) => m.titre === ctx.coupe.nom);
  assert.ok(msg, `un message doit porter le nom de la coupe (${ctx.coupe.nom})`);
  assert.strictEqual(msg.corps, r.message);
  assert.ok(r.tourNom && msg.corps.includes(r.tourNom.toLowerCase()),
    `le tour doit être nommé dans le message (${msg.corps})`);
});

// --------------------------------------------------------------- AMICAL ---

test('A1 — le résultat de l\'amical est enregistré sur l\'amical lui-même', () => {
  const ctx = contexteAmical(31, 17);
  assert.ok(!ctx.amical.joue, 'l\'amical ne doit pas être déjà joué');
  appliquerAmical(ctx);
  assert.ok(ctx.amical.joue, 'l\'amical doit être marqué joué');
  assert.strictEqual(ctx.amical.score.pour, 31);
  assert.strictEqual(ctx.amical.score.contre, 17);
});

test('A2 — un amical ne rapporte AUCUN point au championnat', () => {
  const ctx = contexteAmical();
  const c = ctx.c;
  const avant = { v: c.victoires, n: c.nuls, d: c.defaites, pts: c.points, budget: c.budget };
  appliquerAmical(ctx);
  assert.strictEqual(c.victoires, avant.v, 'aucune victoire de championnat');
  assert.strictEqual(c.nuls, avant.n, 'aucun nul de championnat');
  assert.strictEqual(c.defaites, avant.d, 'aucune défaite de championnat');
  assert.strictEqual(c.points, avant.pts, 'aucun point');
  assert.strictEqual(c.budget, avant.budget, 'aucune recette');
});

test('A3 — les conséquences physiques sont RÉELLES (c\'est ce qui en fait une décision)', () => {
  const ctx = contexteAmical();
  const ids = Object.values(ctx.compo);
  const avant = ids.map((id) => {
    const j = ctx.c.effectif.find((x) => x.id === id);
    return { id, fatigue: j.fatigue || 0, matchs: j.matchsJoues || 0 };
  });
  appliquerAmical(ctx);
  let fatigues = 0, joues = 0;
  for (const a of avant) {
    const j = ctx.c.effectif.find((x) => x.id === a.id);
    if ((j.fatigue || 0) > a.fatigue) fatigues++;
    if ((j.matchsJoues || 0) > a.matchs) joues++;
  }
  assert.ok(fatigues >= 12, `un amical fatigue vraiment (${fatigues}/15)`);
  assert.ok(joues >= 12, `et compte comme un match joué (${joues}/15)`);
});

test('A4 — l\'adversaire encaisse lui aussi sa rencontre (P1-29)', () => {
  const ctx = contexteAmical();
  // La fatigue vit sur le groupe PERSISTANT du club adverse, pas sur la vue
  // normalisée que reconstruit `effectifAdverseNormalise`.
  const fatigue = () => RMClub.groupeAdverse(ctx.s, ctx.adversaire)
    .reduce((t, j) => t + (j.fatigue || 0), 0);
  const avant = fatigue();
  appliquerAmical(ctx);
  const apres = fatigue();
  assert.ok(apres > avant, `l'adversaire doit fatiguer aussi (${avant} → ${apres})`);
});

test('A5 — les trois issues produisent le bon verbe', () => {
  const gagne = contexteAmical(30, 10);
  assert.strictEqual(appliquerAmical(gagne).forme, 'v');
  const perdu = contexteAmical(10, 30);
  assert.strictEqual(appliquerAmical(perdu).forme, 'd');
  const nul = contexteAmical(20, 20);
  const r = appliquerAmical(nul);
  assert.strictEqual(r.forme, 'n', 'un amical PEUT finir sur un nul (pas de prolongation)');
  assert.ok(r.message.includes('match nul'), `le message doit le dire (${r.message})`);
});

test('A6 — le message rappelle explicitement l\'absence d\'enjeu', () => {
  const ctx = contexteAmical();
  const avant = (ctx.c.messages || []).length;
  const r = appliquerAmical(ctx);
  const messages = ctx.c.messages || [];
  assert.ok(messages.length > avant, 'au moins un message ajouté');
  const msg = messages.find((m) => m.titre === 'Match amical');
  assert.ok(msg, 'un message « Match amical » doit exister');
  assert.strictEqual(msg.corps, r.message);
  assert.ok(r.message.includes('Aucun point au championnat'),
    `le joueur doit lire que ce match ne compte pas (${r.message})`);
});

// ------------------------------------------------- PLACE DE LA RÈGLE ------

test('N7 — la règle métier n\'est plus dans le fichier d\'interface', () => {
  const fs = require('fs');
  const ui = fs.readFileSync(__dirname + '/../docs/js/clubUI.js', 'utf8');
  const coupes = fs.readFileSync(__dirname + '/../docs/js/club-coupes.js', 'utf8');
  const amicaux = fs.readFileSync(__dirname + '/../docs/js/club-amicaux.js', 'utf8');
  // `appliquerEffetsMatchAdverse` reste appelé dans clubUI.js pour la journée
  // de CHAMPIONNAT (tous les rivaux, P1-29) : ce n'est pas la même règle.
  for (const appel of ['enregistrerResultatCoupe(', 'resoudreCoupesAbstraites(',
                       'enregistrerResultatAmical(']) {
    assert.ok(ui.indexOf(appel) === -1,
      `\`${appel}\` ne doit plus être appelé depuis clubUI.js`);
  }
  assert.ok(coupes.indexOf('function appliquerConsequencesMatchCoupe') !== -1,
    'la règle de coupe vit dans club-coupes.js');
  assert.ok(amicaux.indexOf('function appliquerConsequencesMatchAmical') !== -1,
    'la règle d\'amical vit dans club-amicaux.js');
  // Et le retour au panneau, recopié à l'identique dans les trois matchs
  // joués avec le moteur complet, n'existe plus qu'une fois.
  const retours = ui.split('function revenirAuPanneauClub').length - 1;
  assert.strictEqual(retours, 1, 'un seul retour au panneau, partagé');
  const reutilisations = ui.split('onFermer: revenirAuPanneauClub').length - 1;
  assert.strictEqual(reutilisations, 3,
    `les trois matchs doivent le réutiliser (${reutilisations})`);
});

console.log(`\n${nbTests} test(s) exécuté(s).`);
