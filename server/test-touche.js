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

test('T1 — PREUVE : DÉSIGNER le bon sauteur change l\'issue des touches', () => {
  // Le pack est STRICTEMENT le même dans les deux cas — mêmes attributs, donc
  // même force collective. Seule la DÉSIGNATION change : d'un côté le moteur
  // vise n'importe lequel des cinq sauteurs, de l'autre on lui dit de viser
  // le seul qui sait sauter. Mesuré avant ce patch : 0,0 point d'écart.
  let sansChoix = { l: 0, g: 0 }, avecChoix = { l: 0, g: 0 };
  for (let g = 1; g <= 10; g++) {
    const a = jouer(g, { joueursA: pack(5, 95, 20), joueursB: pack(5, 95, 20) });
    sansChoix.l += a.A.lineouts; sansChoix.g += a.A.lineoutsGagnes;
    const b = jouer(g, { joueursA: pack(5, 95, 20), joueursB: pack(5, 95, 20),
      toucheA: { sauteurs: [5] } });
    avecChoix.l += b.A.lineouts; avecChoix.g += b.A.lineoutsGagnes;
  }
  const part = (x) => (x.l ? x.g / x.l : 0);
  assert.ok(part(avecChoix) > part(sansChoix),
    `désigner le seul bon sauteur doit faire gagner plus de touches ` +
    `(${avecChoix.g}/${avecChoix.l} vs ${sansChoix.g}/${sansChoix.l})`);
});

test('T2 — le sauteur désigné est RÉELLEMENT visé plus souvent', () => {
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

test('T7 — les touches restent dans les ordres de grandeur d\'un vrai match', () => {
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

test('T9 — désigner un spécialiste ne COÛTE pas de ballons sur son lancer', () => {
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
  const N = 16;
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
  // Marge de 4 points : ~2 erreurs-types sur cet effectif (é.-t. mesuré 2,7 pt
  // sur 30 matchs). Au-delà, ce ne serait plus du bruit mais un vrai coût.
  assert.ok(tRestreint >= tLibre - 0.04,
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

console.log(`\n${nbTests} test(s) exécuté(s).`);
