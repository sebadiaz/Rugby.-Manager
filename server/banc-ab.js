// Banc de mesure A/B du moteur — outil de développement, jamais chargé par le
// jeu (aucune référence depuis docs/index.html).
//
// POURQUOI CET OUTIL EXISTE
// Toutes les décisions de calibrage du moteur reposent sur une question : « cet
// écart est-il réel, ou est-ce du bruit ? » Mesuré (TODO_AUDIT.md P2-15),
// l'écart-type du nombre d'essais est de 2,51 PAR MATCH. À 80 matchs par
// variante, l'intervalle à 95 % vaut donc ±0,55 essai : tout effet plus petit
// est invisible, et une session entière a été passée à naviguer juste
// au-dessus de cette limite sans le savoir. Pour trancher un écart de 0,2
// essai il faut environ 750 matchs par variante — impossible à la main, trivial
// une fois les matchs répartis sur les cœurs disponibles.
//
// DEUX RÈGLES DE MÉTHODE, APPRISES À LA DURE
//   1. Comparer le candidat à un TÉMOIN QUI SUIT LE MÊME CHEMIN DE CODE (même
//      nombre d'appels au générateur aléatoire). Pour un taux, comparer X à 0
//      plutôt qu'au moteur d'avant : les deux trajectoires restent alors
//      identiques tant que la mécanique ne se déclenche pas, le pairage par
//      graine fonctionne réellement et les intervalles se resserrent d'un
//      facteur 2 à 3.
//   2. Ne jamais conclure d'un seul tirage limite, dans un sens comme dans
//      l'autre. Un témoin à effet NUL a déjà rendu « +0,575 ± 0,513, établi » :
//      c'est un faux positif ordinaire, ~5 % des tirages.
//   3. CORRIGER LA MULTIPLICITÉ. Ce banc compare ONZE métriques d'un coup. À 5 %
//      de risque chacune, la probabilité qu'au moins une sorte « établie » alors
//      qu'il ne se passe rien est de 1 - 0,95^11 = 43 % — une fois sur deux.
//      C'est exactement ce qui s'est produit en validant l'outil sur un témoin à
//      effet nul : « Points +1,615 ± 1,589, ÉTABLI » sur 400 matchs, là où
//      l'effet vrai était rigoureusement zéro. Les intervalles affichés sont
//      donc élargis par la correction de Bonferroni (z = 2,79 au lieu de 1,96),
//      ce qui ramène le risque global à 5 % pour l'ensemble du tableau.
//
// USAGE
//   node server/banc-ab.js <moteurA.js> <moteurB.js> [nbGraines] [graineDepart]
// Les deux chemins sont relatifs au dossier courant. Exemple :
//   node server/banc-ab.js /tmp/temoin.js engine/rugby-engine.js 300
'use strict';

const path = require('path');
const os = require('os');
const { fork } = require('child_process');

const METRIQUES = ['essais', 'points', 'passes', 'carries', 'rucks', 'tacklesAttempted',
  'lineouts', 'scrums', 'turnovers', 'gain', 'rucks22'];
// Bonferroni : risque global de 5 % réparti sur toutes les métriques du
// tableau. z tel que P(|Z| > z) = 0,05 / nombre de métriques.
function zBonferroni(nbTests) {
  // Inverse de la loi normale centrée réduite (approximation d'Acklam),
  // suffisante ici : on cherche z pour une probabilité bilatérale 0,05/n.
  const p = 1 - (0.05 / nbTests) / 2;
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
    1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
    6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
    -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00,
    3.754408661907416e+00];
  const pBas = 0.02425;
  let q, r;
  if (p < pBas) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5])
      / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p <= 1 - pBas) {
    q = p - 0.5; r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q
      / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5])
    / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}
const Z = zBonferroni(METRIQUES.length);
const LIBELLES = {
  essais: 'Essais', points: 'Points', passes: 'Passes', carries: 'Courses',
  rucks: 'Rucks', tacklesAttempted: 'Plaquages', lineouts: 'Touches', scrums: 'Mêlées',
  turnovers: 'Turnovers', gain: 'Gain/temps de jeu (m)', rucks22: 'Rucks dans les 22 (%)',
};

// --- Travailleur : simule une tranche de graines pour les deux moteurs -------
if (process.env.RM_BANC_ENFANT === '1') {
  const [cheminA, cheminB] = process.argv.slice(2);
  const A = require(cheminA);
  const B = require(cheminB);
  function mesurer(Moteur, graine) {
    const m = new Moteur(graine, 4800);
    let phaseAvant = m.phase, xPrec = null, possPrec = null, gains = 0, nGains = 0, rucks = 0, r22 = 0;
    for (let t = 0; t < 4800; t += 0.2) {
      m.tick(0.2);
      const sens = m.possession === 'A' ? 1 : -1;
      const pt = m.ruckPoint || m.porteur;
      const dist = pt ? (sens > 0 ? 100 - pt.x : pt.x) : 99;
      if (m.phase === 'RUCK' && phaseAvant !== 'RUCK' && m.ruckPoint) {
        rucks++; if (dist < 22) r22++;
        if (xPrec !== null && possPrec === m.possession) {
          const g = (m.ruckPoint.x - xPrec) * sens;
          if (Math.abs(g) < 40) { gains += g; nGains++; }
        }
        xPrec = m.ruckPoint.x; possPrec = m.possession;
      }
      phaseAvant = m.phase;
    }
    const s = m.getState(), a = s.stats.A, b = s.stats.B;
    return {
      essais: a.essais + b.essais, points: s.score.A + s.score.B,
      passes: a.passes + b.passes, carries: a.carries + b.carries,
      rucks: a.rucks + b.rucks, tacklesAttempted: a.tacklesAttempted + b.tacklesAttempted,
      lineouts: a.lineouts + b.lineouts, scrums: a.scrums + b.scrums,
      turnovers: a.turnovers + b.turnovers,
      gain: nGains ? gains / nGains : 0,
      rucks22: rucks ? (100 * r22) / rucks : 0,
    };
  }
  process.on('message', ({ graines }) => {
    const resultats = graines.map((g) => ({ graine: g, a: mesurer(A.MatchEngine, g), b: mesurer(B.MatchEngine, g) }));
    process.send(resultats);
    process.exit(0);
  });
  return;
}

// --- Chef d'orchestre --------------------------------------------------------
const [argA, argB, argN, argDebut] = process.argv.slice(2);
if (!argA || !argB) {
  console.error('Usage : node server/banc-ab.js <moteurA.js> <moteurB.js> [nbGraines] [graineDepart]');
  process.exit(2);
}
const cheminA = path.resolve(argA), cheminB = path.resolve(argB);
const N = Number(argN) || 120;
const DEBUT = Number(argDebut) || 1;
const nbTravailleurs = Math.max(1, Math.min(os.cpus().length, N));

const graines = [];
for (let i = 0; i < N; i++) graines.push(DEBUT + i);
// Répartition en ROND (graine i au travailleur i % n) plutôt qu'en blocs : si
// une plage de graines produit des matchs plus longs, la charge reste répartie.
const tranches = Array.from({ length: nbTravailleurs }, () => []);
graines.forEach((g, i) => tranches[i % nbTravailleurs].push(g));

const debut = Date.now();
console.log(`Banc A/B — ${N} match(s) par variante (graines ${DEBUT} à ${DEBUT + N - 1}), `
  + `${nbTravailleurs} travailleur(s) en parallèle`);
console.log(`  A = ${cheminA}`);
console.log(`  B = ${cheminB}\n`);

let restants = nbTravailleurs;
const toutes = [];
for (const tranche of tranches) {
  const enfant = fork(__filename, [cheminA, cheminB], { env: Object.assign({}, process.env, { RM_BANC_ENFANT: '1' }) });
  enfant.on('message', (res) => { toutes.push(...res); });
  enfant.on('exit', () => { if (--restants === 0) rapporter(); });
  enfant.send({ graines: tranche });
}

function moyenne(x) { return x.reduce((a, b) => a + b, 0) / x.length; }

function rapporter() {
  toutes.sort((x, y) => x.graine - y.graine);
  const duree = (Date.now() - debut) / 1000;
  console.log(`${'métrique'.padEnd(24)}${'A'.padStart(9)}${'B'.padStart(9)}${'B-A'.padStart(9)}   IC 95 % global  verdict`);
  for (const cle of METRIQUES) {
    const va = toutes.map((r) => r.a[cle]), vb = toutes.map((r) => r.b[cle]);
    const diff = toutes.map((r) => r.b[cle] - r.a[cle]);
    const md = moyenne(diff);
    const sd = Math.sqrt(diff.reduce((a, x) => a + (x - md) ** 2, 0) / (diff.length - 1));
    const ic = Z * sd / Math.sqrt(diff.length);
    const etabli = Math.abs(md) > ic;
    console.log(`${LIBELLES[cle].padEnd(24)}${moyenne(va).toFixed(2).padStart(9)}${moyenne(vb).toFixed(2).padStart(9)}`
      + `${md.toFixed(3).padStart(9)}   ±${ic.toFixed(3).padEnd(8)}  ${etabli ? 'ÉTABLI' : 'non établi'}`);
  }
  // Résolution réellement atteinte sur les essais : la seule chose qui dise si
  // un « non établi » veut dire « pas d'effet » ou « mesure trop faible ».
  const diffEssais = toutes.map((r) => r.b.essais - r.a.essais);
  const mdE = moyenne(diffEssais);
  const sdE = Math.sqrt(diffEssais.reduce((a, x) => a + (x - mdE) ** 2, 0) / (diffEssais.length - 1));
  console.log(`\nRésolution atteinte sur les essais : ±${(Z * sdE / Math.sqrt(N)).toFixed(3)} `
    + `(écart-type ${sdE.toFixed(2)} par match). Un effet plus petit que cet intervalle est INVISIBLE, pas nul.`);
  console.log(`Intervalles élargis par Bonferroni sur ${METRIQUES.length} métriques (z = ${Z.toFixed(2)}) : `
    + `le risque de 5 % vaut pour TOUT le tableau, pas par ligne.`);
  console.log(`Calcul : ${duree.toFixed(0)} s pour ${2 * N} matchs.`);
}
