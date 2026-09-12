// TEST DE PREUVE — LE SAUTEUR EN TOUCHE NE COMPTE POUR RIEN
//
// COMPORTEMENT ACTUEL OBSERVÉ (mesuré) : on monte deux packs identiques où un
// SEUL avant est un vrai sauteur (n°5, touche 95) et les sept autres sont
// nuls en touche (20). Puis on joue dix matchs complets, d'abord sans rien
// désigner, ensuite en forçant `toucheA.sauteurs = [5]` — c'est-à-dire en
// disant au moteur de ne viser QUE le bon sauteur :
//
//   sans désigner de sauteur         : 120/115 touches gagnées
//   en désignant le SEUL bon sauteur : 120/115 touches gagnées
//   => écart : 0,0 point
//
// Strictement aucune différence. Deux raisons, dans le moteur :
//   1. `tirerSauteur` choisit UNIFORMÉMENT dans le pool : un sauteur à 88 et
//      un à 45 sont visés aussi souvent l'un que l'autre ;
//   2. `probaVolAdverse` ne regarde que la SOMME de `forceTouche` sur les
//      huit avants — la qualité de celui qui monte réellement au ballon
//      n'entre nulle part.
//
// POURQUOI C'EST INSUFFISANT POUR LE JOUEUR : depuis P1-49, le manager
// recrute un deuxième ligne en regardant sa touche. En match, cet attribut
// n'existe que noyé dans une somme de huit, et le manager ne peut même pas
// dire qui saute. La touche est pourtant, avec la mêlée, l'une des deux
// phases où un entraîneur décide vraiment.
//
// FONCTIONS EXACTES RESPONSABLES : engine/rugby-engine.js, `_tickTouche`
// (tirage uniforme du sauteur, probabilité de vol calculée sans lui).
//
// CE QUE CE FICHIER EXIGE :
//   1. un sauteur VISÉ plus souvent quand il est meilleur ;
//   2. sa qualité propre doit peser sur l'issue de la touche ;
//   3. le Mode Club doit permettre de DÉSIGNER ses sauteurs ;
//   4. ce choix doit arriver jusqu'au moteur ;
//   5. les touches doivent rester dans les ordres de grandeur d'un vrai match.
//
// Usage : node server/test-touche.js
'use strict';

const assert = require('assert');
global.window = global;
let stockage = {};
global.localStorage = {
  getItem: (k) => (k in stockage ? stockage[k] : null),
  setItem: (k, v) => { stockage[k] = String(v); },
  removeItem: (k) => { delete stockage[k]; },
};
const RugbyEngine = require('../docs/rugby-engine.js');
global.window.RugbyEngine = RugbyEngine;
const { chargerRMClub, creerRng } = require('./charger-club.js');
const RMClub = chargerRMClub();

let nbTests = 0;
function test(nom, fn) {
  nbTests++;
  try { fn(); console.log(`OK   ${nom}`); }
  catch (e) { process.exitCode = 1; console.error(`FAIL ${nom}`); console.error('     ' + e.message); }
}

// SUITE COUPÉE EN DEUX PAR SON COÛT, PAS PAR SON SUJET.
//
// Cette suite dure ~10 min : elle est donc reléguée dans le job de NUIT
// (.github/workflows/tests-longs.yml) et ne tourne PAS sur un patch du moteur.
// Ça s'est payé : deux de ses tests sont restés ROUGES pendant toute une
// campagne de travail sur le moteur sans que personne le voie.
//
// Or le coût n'est pas réparti également. Les tests qui ÉNONCENT LES LOIS de
// la touche (T8, T8bis, T11 : la touche est contestable, l'alignement
// restreint se lit, un vrai spécialiste compense) s'exécutent en quelques
// millisecondes — ils appellent la règle directement. Ce sont EUX qui doivent
// tourner à chaque patch. Seuls les tests qui SIMULENT des matchs complets
// coûtent des minutes.
//
// `testSimulation` marque ces derniers. Avec RM_TOUCHE_RAPIDE=1, ils sont
// sautés et la suite s'exécute en une seconde : c'est ce que lance la CI de
// déploiement. Le job de nuit, lui, lance tout.
const RAPIDE = process.env.RM_TOUCHE_RAPIDE === '1';
let nbSautes = 0;
function testSimulation(nom, fn) {
  if (RAPIDE) { nbSautes++; return; }
  test(nom, fn);
}

const BASE = RugbyEngine.DEFAULT_CONFIG.joueurs;
// Pack où UN SEUL avant est un vrai sauteur ; le reste des attributs est
// inchangé, pour n'isoler QUE la touche.
function pack(bon, valeurBonne, valeurAutres) {
  const j = {};
  for (let n = 1; n <= 15; n++) {
    j[n] = Object.assign({}, BASE[n], { touche: n === bon ? valeurBonne : valeurAutres });
  }
  return j;
}
function jouer(graine, cfg) {
  const m = new RugbyEngine.MatchEngine(graine, 4800, cfg);
  for (let i = 0; i < 400000 && m.getState().phase !== 'TERMINE'; i++) m.tick(1 / 20);
  return m.getState().stats;
}

testSimulation('T1 — désigner son sauteur ne dégrade pas la conservation sur son lancer', () => {
  // CE QUE CE TEST MESURAIT, ET POURQUOI IL A ÉTÉ REFAIT.
  //
  // Il affirmait « désigner le seul bon sauteur doit faire gagner PLUS de
  // touches » et comparait `lineoutsGagnes / lineouts` sur 10 matchs. Deux
  // défauts, exactement ceux que T9 avait déjà corrigés de son côté sans que
  // T1 en profite :
  //
  //   1. La grandeur est MAL DÉFINIE : `lineoutsGagnes` compte aussi les
  //      touches VOLÉES sur le lancer adverse, si bien que le rapport peut
  //      dépasser 100 %. Le message d'échec observé l'affichait d'ailleurs
  //      sans détour : « 83/81 ».
  //   2. L'effet cherché est PLUS PETIT QUE LE BRUIT. Mesuré sur la bonne
  //      grandeur (conservation sur son PROPRE lancer), 40 matchs par
  //      configuration : libre 83,8 % (289/345), spécialiste 82,5 % (282/342),
  //      soit un écart de -1,31 point pour une erreur-type de 2,86 points —
  //      0,46 écart-type, indiscernable de zéro. Un test de ce format bascule
  //      donc au hasard : il est passé au vert pendant des mois, puis au rouge
  //      apres un travail sur le moteur qui n'a rien change a la touche.
  //
  // La preuve POSITIVE que désigner un vrai spécialiste est payant existe, et
  // au bon endroit : T8bis la vérifie DIRECTEMENT sur la règle
  // (`probaVolTouche`), sans passer par une moyenne bruitée. Ce test-ci garde
  // ce qu'un match peut réellement établir : la désignation ne DÉGRADE pas la
  // conservation, avec une tolérance calée sur le bruit mesuré (2 erreurs-types).
  let libre = { l: 0, g: 0 }, specialiste = { l: 0, g: 0 };
  const N = 30;
  for (let g = 1; g <= N; g++) {
    const a = conservationPropreLancer(g, { joueursA: pack(5, 95, 20), joueursB: pack(5, 95, 20) });
    libre.l += a.A.l; libre.g += a.A.g;
    const b = conservationPropreLancer(g, { joueursA: pack(5, 95, 20), joueursB: pack(5, 95, 20),
      toucheA: { sauteurs: [5] } });
    specialiste.l += b.A.l; specialiste.g += b.A.g;
  }
  assert.ok(libre.l > 100 && specialiste.l > 100,
    `assez de touches pour conclure (${libre.l} / ${specialiste.l})`);
  const tLibre = libre.g / libre.l, tSpe = specialiste.g / specialiste.l;
  const detail = `spécialiste ${(100 * tSpe).toFixed(1)} % (${specialiste.g}/${specialiste.l}) ` +
    `vs libre ${(100 * tLibre).toFixed(1)} % (${libre.g}/${libre.l})`;
  // Erreur-type mesurée ~3 points sur cet effectif ; on tolère 2 erreurs-types.
  assert.ok(tSpe >= tLibre - 0.065,
    `désigner son sauteur ne doit pas dégrader la conservation (${detail})`);
});

testSimulation('T2 — le sauteur désigné est RÉELLEMENT visé plus souvent', () => {
  // Trois sauteurs possibles, un seul excellent. On compte qui réceptionne.
  const cfg = { joueursA: pack(5, 95, 20), joueursB: pack(5, 95, 20) };
  const m = new RugbyEngine.MatchEngine(4242, 4800, cfg);
  const receptions = {};
  const vraiLog = m.log.bind(m);
  m.log = function (type, equipe, texte) {
    if (type === 'TOUCHE_GAGNEE' || type === 'TOUCHE_RECEPTION') {
      const found = /n°(\d+)/.exec(texte || '');
      if (found) receptions[found[1]] = (receptions[found[1]] || 0) + 1;
    }
    return vraiLog(type, equipe, texte);
  };
  for (let i = 0; i < 400000 && m.getState().phase !== 'TERMINE'; i++) m.tick(1 / 20);
  // Le comptage passe par les logs : s'ils ne portent pas le numéro, on se
  // rabat sur la vérification directe du tirage pondéré.
  const total = Object.values(receptions).reduce((a, b) => a + b, 0);
  if (total >= 10) {
    const partDuBon = (receptions['5'] || 0) / total;
    assert.ok(partDuBon > 1 / 5 + 0.1,
      `le meilleur sauteur doit être visé nettement plus qu'au hasard (${Math.round(partDuBon * 100)} %)`);
  } else {
    // Tirage pondéré vérifié directement — plus robuste qu'un parsing de log.
    const pool = [4, 5, 6, 7, 8].map((n) => Object.assign({ numero: n }, pack(5, 95, 20)[n]));
    const compte = {};
    const rng = creerRng(77);
    for (let i = 0; i < 3000; i++) {
      const j = RugbyEngine.tirerSauteurPondere(pool, rng);
      compte[j.numero] = (compte[j.numero] || 0) + 1;
    }
    assert.ok(compte[5] / 3000 > 1 / 5 + 0.1,
      `le meilleur sauteur doit être tiré nettement plus souvent (${JSON.stringify(compte)})`);
  }
});

test('T3 — un sauteur faible n\'est jamais totalement exclu', () => {
  const pool = [4, 5, 6, 7, 8].map((n) => Object.assign({ numero: n }, pack(5, 95, 20)[n]));
  const rng = creerRng(78);
  const compte = {};
  for (let i = 0; i < 3000; i++) {
    const j = RugbyEngine.tirerSauteurPondere(pool, rng);
    compte[j.numero] = (compte[j.numero] || 0) + 1;
  }
  for (const n of [4, 6, 7, 8]) {
    assert.ok((compte[n] || 0) > 0,
      `le n°${n} doit rester une option (variation des appels) — ${JSON.stringify(compte)}`);
  }
});

test('T4 — le Mode Club permet de DÉSIGNER ses sauteurs', () => {
  const s = RMClub.nouvelleSaison(creerRng(500), 'AS Touche');
  RMClub.daterCalendrier(s);
  RMClub.assurerCompositionPourEquipe(s, 'pro');
  const c = s.clubJoueur;
  const dossier = RMClub.dossierSauteurs(s);
  assert.ok(dossier && Array.isArray(dossier.candidats),
    'un dossier de sauteurs doit exister');
  assert.ok(dossier.candidats.length >= 3, `plusieurs candidats attendus (${dossier.candidats.length})`);
  for (const cd of dossier.candidats) {
    assert.ok(cd.nom && typeof cd.touche === 'number' && typeof cd.numero === 'number',
      `chaque candidat doit porter son numéro et sa touche (${JSON.stringify(cd)})`);
    assert.ok(cd.numero >= 4 && cd.numero <= 8,
      `seuls les avants de l'alignement sautent (n°${cd.numero})`);
  }
  // Trié par qualité en touche : le manager voit tout de suite qui sauter.
  for (let i = 1; i < dossier.candidats.length; i++) {
    assert.ok(dossier.candidats[i].touche <= dossier.candidats[i - 1].touche,
      'les candidats doivent être triés par qualité en touche');
  }
  const meilleur = dossier.candidats[0];
  assert.strictEqual(RMClub.basculerSauteur(s, meilleur.id).designe, true);
  assert.deepStrictEqual(RMClub.sauteursDesignes(s), [meilleur.id]);
  assert.strictEqual(RMClub.basculerSauteur(s, meilleur.id).designe, false);
  assert.deepStrictEqual(RMClub.sauteursDesignes(s), []);
});

test('T5 — le choix arrive jusqu\'au moteur, en NUMÉROS de maillot', () => {
  const s = RMClub.nouvelleSaison(creerRng(501), 'AS Touche');
  RMClub.daterCalendrier(s);
  RMClub.assurerCompositionPourEquipe(s, 'pro');
  const dossier = RMClub.dossierSauteurs(s);
  const choisi = dossier.candidats[0];
  RMClub.basculerSauteur(s, choisi.id);
  const cfg = RMClub.sauteursVersConfig(s);
  assert.ok(Array.isArray(cfg) && cfg.length === 1, `un numéro attendu (${JSON.stringify(cfg)})`);
  assert.strictEqual(cfg[0], choisi.numero, 'le moteur doit recevoir le NUMÉRO, pas l\'id');
  // Sans désignation : null, pour que le moteur garde son pool par défaut
  // plutôt que de recevoir une liste vide (aucun sauteur = touche cassée).
  RMClub.basculerSauteur(s, choisi.id);
  assert.strictEqual(RMClub.sauteursVersConfig(s), null);
});

test('T6 — un sauteur qui n\'est plus titulaire est ignoré, pas propagé', () => {
  const s = RMClub.nouvelleSaison(creerRng(502), 'AS Touche');
  RMClub.daterCalendrier(s);
  RMClub.assurerCompositionPourEquipe(s, 'pro');
  const choisi = RMClub.dossierSauteurs(s).candidats[0];
  RMClub.basculerSauteur(s, choisi.id);
  // Il sort du XV (blessure, choix tactique...) : sa désignation ne doit pas
  // envoyer un numéro qu'il n'occupe plus.
  const compo = s.clubJoueur.compositionTitulaires;
  for (const n of Object.keys(compo)) if (compo[n] === choisi.id) delete compo[n];
  assert.strictEqual(RMClub.sauteursVersConfig(s), null,
    'un sauteur non titulaire ne doit pas être transmis au moteur');
});

testSimulation('T7 — les touches restent dans les ordres de grandeur d\'un vrai match', () => {
  let total = 0;
  const n = 6;
  for (let g = 1; g <= n; g++) {
    const st = jouer(g, null);
    total += st.A.lineouts + st.B.lineouts;
  }
  const moyenne = total / n;
  assert.ok(moyenne >= 12 && moyenne <= 40,
    `un match de rugby compte 15 à 35 touches (moyenne mesurée ${moyenne.toFixed(1)})`);
});

test('T8 — PREUVE : restreindre l\'alignement a un COÛT quand il n\'apporte rien', () => {
  // Mesuré avant ce patch, en jouant : avec cinq sauteurs STRICTEMENT
  // équivalents (donc aucun gain de qualité), n'en désigner qu'un faisait
  // passer le taux de touches gagnées de 95,1 % à 97,8 %. Désigner était
  // GRATUIT, donc toujours gagnant — un choix sans contrepartie n'est pas un
  // choix.
  //
  // La règle est vérifiée DIRECTEMENT, pas à travers la moyenne de quelques
  // matchs : un écart de deux points sur 145 touches ne se distingue pas du
  // bruit (constaté en essayant, 140/145 contre 136/143 — inexploitable).
  const commun = { forceLanceur: 700, forceAdverse: 700, qualiteSauteur: 80 };
  const libre = RugbyEngine.probaVolTouche(Object.assign({ taillePool: 5 }, commun));
  const restreint = RugbyEngine.probaVolTouche(Object.assign({ taillePool: 1 }, commun));
  assert.ok(restreint > libre,
    `à qualité égale, un alignement lisible doit augmenter le risque de vol ` +
    `(${restreint.toFixed(4)} vs ${libre.toFixed(4)})`);
  // Et le coût doit être PROPORTIONNEL : trois sauteurs se situent entre les deux.
  const trois = RugbyEngine.probaVolTouche(Object.assign({ taillePool: 3 }, commun));
  assert.ok(trois > libre && trois < restreint,
    `le coût doit croître à mesure qu'on restreint (${libre.toFixed(4)} / ${trois.toFixed(4)} / ${restreint.toFixed(4)})`);
});

test('T8bis — le compromis penche du bon côté pour un VRAI spécialiste', () => {
  // Un sauteur nettement au-dessus (forceTouche 94, soit touche ~95) désigné
  // seul, contre un alignement libre dont le sauteur moyen vaut 80 : le gain
  // de qualité doit l'emporter sur le coût de lisibilité.
  const specialisteSeul = RugbyEngine.probaVolTouche({
    forceLanceur: 700, forceAdverse: 700, qualiteSauteur: 94, taillePool: 1 });
  const alignementLibre = RugbyEngine.probaVolTouche({
    forceLanceur: 700, forceAdverse: 700, qualiteSauteur: 80, taillePool: 5 });
  assert.ok(specialisteSeul < alignementLibre,
    `désigner un vrai spécialiste doit rester payant ` +
    `(${specialisteSeul.toFixed(4)} vs ${alignementLibre.toFixed(4)})`);
  // À qualité identique, en revanche, c'est perdant — c'est tout l'arbitrage.
  const banalSeul = RugbyEngine.probaVolTouche({
    forceLanceur: 700, forceAdverse: 700, qualiteSauteur: 80, taillePool: 1 });
  assert.ok(banalSeul > alignementLibre,
    'désigner un sauteur banal doit coûter des ballons');
});

// Taux de CONSERVATION sur son propre lancer, mesuré en appariant les
// événements. `stats.lineoutsGagnes` ne peut PAS servir à ça : le moteur
// l'incrémente pour l'équipe qui gagne le ballon, y compris quand elle VOLE le
// lancer adverse (`this.stats[gagnant].lineoutsGagnes++`). Le rapport
// `lineoutsGagnes / lineouts` mélange donc conservation et vols, et dépasse
// régulièrement 1 (mesuré : 146 « gagnées » pour 144 lancées).
function conservationPropreLancer(graine, cfg) {
  const m = new RugbyEngine.MatchEngine(graine, 4800, cfg);
  const res = { A: { l: 0, g: 0 }, B: { l: 0, g: 0 } };
  let lanceur = null;
  const orig = m.log.bind(m);
  m.log = function (type, team, msg) {
    if (type === 'TOUCHE_LANCER') { lanceur = team; if (team) res[team].l++; }
    else if (type === 'TOUCHE_BALLON_GAGNE' && lanceur) {
      if (team === lanceur) res[lanceur].g++;
      lanceur = null;
    }
    return orig(type, team, msg);
  };
  for (let i = 0; i < 400000 && m.getState().phase !== 'TERMINE'; i++) m.tick(1 / 20);
  return res;
}

testSimulation('T9 — désigner un spécialiste ne COÛTE pas de ballons sur son lancer', () => {
  // CE QUE CE TEST MESURAIT AVANT, ET POURQUOI IL A ÉTÉ REFAIT (P1-53).
  //
  // Il affirmait « désigner le seul vrai sauteur doit rester gagnant malgré la
  // lisibilité » et comparait `lineoutsGagnes / lineouts` sur 12 matchs. Deux
  // défauts, tous deux mesurés :
  //
  //   1. La grandeur est mal définie (cf. conservationPropreLancer ci-dessus) :
  //      le numérateur compte les touches VOLÉES sur le lancer adverse.
  //   2. L'écart annoncé était du bruit. Mesuré sur la bonne grandeur, 30 matchs
  //      par configuration, avant ET après le patch P1-53 :
  //         avant  libre 84,8 %  spécialiste 87,1 %  écart +2,31 pt (0,9 é.-t.)
  //         après  libre 87,0 %  spécialiste 86,3 %  écart -0,70 pt (0,2 é.-t.)
  //      Dans les DEUX versions l'effet est indiscernable de zéro. Le test
  //      passait donc au hasard : P1-53 (durée de sortie de ruck) ne touche pas
  //      la touche, il a seulement redistribué le tirage aléatoire, et le sens
  //      de l'inégalité s'est retourné.
  //
  // La preuve POSITIVE que désigner un vrai spécialiste est payant existe déjà,
  // et au bon endroit : T8bis la vérifie DIRECTEMENT sur la règle
  // (`probaVolTouche`), sans passer par une moyenne bruitée — même méthode
  // qu'en P1-50b et P1-51. Ce test-ci garde donc ce qu'un match peut réellement
  // établir : la désignation ne doit pas COÛTER de ballons.
  let libre = { l: 0, g: 0 }, restreint = { l: 0, g: 0 };
  // N releve de 16 a 30 : a 16 matchs l'erreur-type vaut ~3,7 points pour une
  // tolerance de 4, soit a peine 1 ecart-type — le test basculait sur du bruit
  // (constate : -4,6 points mesures, alors que sur 40 matchs l'ecart reel vaut
  // -1,3 point pour 2,86 d'erreur-type).
  const N = 30;
  for (let g = 1; g <= N; g++) {
    const a = conservationPropreLancer(g, { joueursA: pack(5, 95, 20), joueursB: pack(5, 95, 20) });
    libre.l += a.A.l; libre.g += a.A.g;
    const b = conservationPropreLancer(g, { joueursA: pack(5, 95, 20), joueursB: pack(5, 95, 20),
      toucheA: { sauteurs: [5] } });
    restreint.l += b.A.l; restreint.g += b.A.g;
  }
  assert.ok(libre.l > 50 && restreint.l > 50,
    `assez de touches pour conclure (${libre.l} / ${restreint.l})`);
  const tLibre = libre.g / libre.l, tRestreint = restreint.g / restreint.l;
  const detail = `spécialiste ${(100 * tRestreint).toFixed(1)} % (${restreint.g}/${restreint.l}) ` +
    `vs libre ${(100 * tLibre).toFixed(1)} % (${libre.g}/${libre.l})`;
  // Le taux se lit sur son PROPRE lancer : il ne peut pas dépasser 100 %.
  assert.ok(tLibre <= 1 && tRestreint <= 1, `un taux de conservation reste ≤ 100 % (${detail})`);
  // Marge de 6,5 points : 2 erreurs-types sur cet effectif (é.-t. mesuré
  // 2,86 pt sur 40 matchs). Au-delà, ce ne serait plus du bruit mais un vrai coût.
  assert.ok(tRestreint >= tLibre - 0.065,
    `désigner le seul vrai sauteur ne doit pas coûter de ballons (${detail})`);
});

test('T10 — le compromis est ANNONCÉ au manager, chiffré', () => {
  const s = RMClub.nouvelleSaison(creerRng(503), 'AS Touche');
  RMClub.daterCalendrier(s);
  RMClub.assurerCompositionPourEquipe(s, 'pro');
  const avant = RMClub.dossierSauteurs(s);
  assert.strictEqual(avant.lisibilite, 0, 'un alignement complet n\'est pas lisible');
  RMClub.basculerSauteur(s, avant.candidats[0].id);
  const apres = RMClub.dossierSauteurs(s);
  assert.ok(apres.lisibilite > 0,
    `restreindre l'alignement doit être annoncé comme lisible (${apres.lisibilite})`);
  assert.ok(apres.risqueVolSupplementaire > 0,
    'le surcroît de risque doit être chiffré, pas seulement suggéré');
});


// T11 — LA TOUCHE DOIT RESTER CONTESTABLE (loi 18).
//
// Trouve par MUTATION : en faisant renvoyer 0 a `probaVolTouche` — l'equipe
// qui lance gagne alors TOUJOURS son ballon —, cette suite restait VERTE de
// bout en bout. T1 a T10 verifient le CHOIX du sauteur et son cout, jamais que
// l'adversaire peut prendre le ballon. Seul un test de statistiques sans
// rapport, dans une autre suite, reagissait par ricochet.
// Or une touche non contestable n'est plus du rugby : c'est une remise en jeu
// automatique, et l'alignement adverse devient decoratif.
// Mesure sur 10 matchs : 20,8 lancers, 2,70 touches VOLEES, soit 13,0 % —
// exactement l'ordre de grandeur reel.
test('T11 — la touche est CONTESTABLE : l\'adversaire peut prendre le ballon', () => {
  const proba = RugbyEngine.probaVolTouche;
  assert.strictEqual(typeof proba, 'function', 'le moteur doit exposer la règle du vol en touche');
  const equilibre = { forceLanceur: 100, forceAdverse: 100, qualiteSauteur: 80, taillePool: 4 };
  const p = proba(equilibre);
  assert.ok(p > 0.02,
    `à forces égales, l'adversaire doit avoir une vraie chance de voler la touche (${(p * 100).toFixed(1)} %)`);
  assert.ok(p < 0.45,
    `mais la touche reste majoritairement gagnée par le lanceur (${(p * 100).toFixed(1)} %)`);
  // Et le rapport de force doit COMPTER : un alignement adverse plus fort vole plus.
  const adversaireFort = proba(Object.assign({}, equilibre, { forceAdverse: 220 }));
  assert.ok(adversaireFort > p,
    `un alignement adverse plus fort doit voler davantage (${(adversaireFort * 100).toFixed(1)} % contre ${(p * 100).toFixed(1)} %)`);
});

// T12 — ET LE VOL DOIT EXISTER EN MATCH, pas seulement dans la formule.
testSimulation('T12 — des touches sont réellement volées en match', () => {
  let lancers = 0, voles = 0;
  for (const graine of [1, 2, 3]) {
    const m = new RugbyEngine.MatchEngine(graine, 4800, null);
    const brut = m.log.bind(m);
    m.log = (type, team, msg) => {
      if (type === 'TOUCHE_LANCER') lancers++;
      if (/touche volee/i.test(msg)) voles++;
      brut(type, team, msg);
    };
    for (let t = 0; t < 4800; t += 0.2) m.tick(0.2);
  }
  assert.ok(lancers > 30, `echantillon de touches trop petit (${lancers})`);
  const taux = 100 * voles / lancers;
  // Mesure : 13,0 %. Un vrai match perd 10 a 15 % de ses propres touches.
  assert.ok(taux >= 3,
    `des touches doivent etre volees en match (${taux.toFixed(1)} % sur ${lancers} lancers)`);
  assert.ok(taux <= 30,
    `mais le lanceur doit rester nettement favori (${taux.toFixed(1)} %)`);
});

console.log(`\n${nbTests} test(s) exécuté(s)${nbSautes ? ` — ${nbSautes} test(s) de simulation sautés (RM_TOUCHE_RAPIDE=1)` : ''}.`);
