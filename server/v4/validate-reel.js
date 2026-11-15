// Repères World Rugby (Tournoi des Six Nations 2023). Les résultats reposent
// sur les actions effectivement jouées jusqu'au coup de sifflet final.
// Usage : node server/v4/validate-reel.js [nombre=10] [dt=0.1] [premièreGraine=1]
'use strict';
const { MatchEngine } = require('../../engine/rugby-engine.js');
const { configGOAP } = require('../../engine/ai/goap-mode.js');

const [nombre = 10, pas = 0.1, premiere = 1] = process.argv.slice(2).map(Number);
if (!Number.isSafeInteger(nombre) || nombre < 1 || !Number.isSafeInteger(premiere) || premiere < 1
  || !Number.isFinite(pas) || pas <= 0) throw new RangeError('Nombre, pas ou graine invalide');

const reperes = { passes: 314, rucks: 185, kicks: 55, lineouts: 26, scrums: 11 };
const compteurs = [
  'essais', 'transformationsReussies', 'penalitesButReussies', 'passesTentees', 'passes', 'carries', 'metresGagnes',
  'kicks', 'lineouts', 'lineoutsGagnes', 'scrums', 'scrumsGagnes', 'rucks', 'rucksConserves', 'mauls',
  'tacklesAttempted', 'tacklesMade', 'turnovers', 'knockOns', 'penalitesConcedees', 'cartonsJaunes',
];
const total = {};
for (let graine = premiere; graine < premiere + nombre; graine++) {
  const m = new MatchEngine(graine, 4800, configGOAP());
  let passesIA = 0, degagementsEnTouche = 0, touchesVolontaires = 0, essaisLongsSansRuck = 0;
  let penalitesRuck = 0, penalitesRuckIsolement = 0, penalitesTapeesEnTouche = 0;
  const log = m.log.bind(m);
  m.log = (type, equipe, message, data) => {
    if (type === 'PASSE' && data?.ia) passesIA++;
    if (type === 'PENALITE_RUCK') penalitesRuck++;
    if (type === 'PENALITE_RUCK_ISOLE') penalitesRuckIsolement++;
    if (type === 'PENALITE_TOUCHE_FRAPPE') penalitesTapeesEnTouche++;
    if (type === 'ESSAI' && data?.depuis >= 40 && !data?.rucks) essaisLongsSansRuck++;
    if (type === 'TOUCHE' && m.phase === 'COUP_DE_PIED_JEU') {
      if (m.typeCoupDePiedJeu === 'DEGAGEMENT') degagementsEnTouche++;
      if (m.typeCoupDePiedJeu === 'TOUCHE') touchesVolontaires++;
    }
    return log(type, equipe, message, data);
  };
  m.jouerJusquAuSifflet(pas);
  const s = m.getState();
  const match = Object.fromEntries(compteurs.map(k => [k, s.stats.A[k] + s.stats.B[k]]));
  const erreurs = m._pilote.agents.reduce((som, a) => som + (a.errors || 0), 0);
  if (erreurs) throw new Error(`graine ${graine} : ${erreurs} erreur(s) IA`);
  match.points = s.score.A + s.score.B;
  match.passesIA = passesIA;
  match.penalitesRuck = penalitesRuck;
  match.penalitesRuckIsolement = penalitesRuckIsolement;
  match.penalitesTapeesEnTouche = penalitesTapeesEnTouche;
  match.degagementsEnTouche = degagementsEnTouche;
  match.touchesVolontaires = touchesVolontaires;
  match.essaisLongsSansRuck = essaisLongsSansRuck;
  match.possessionA = s.possessionPct.A;
  match.occupationA = s.occupationPct.A;
  console.log(JSON.stringify({ graine, score: s.score, essaisParEquipe: { A: s.stats.A.essais, B: s.stats.B.essais }, ...match }));
  for (const [k, v] of Object.entries(match)) total[k] = (total[k] || 0) + v;
}
console.log(`\nGOAP : moyenne sur ${nombre} match(s) complet(s), pas de ${pas} s`);
for (const [k, v] of Object.entries(total)) console.log(k.padEnd(24), (v / nombre).toFixed(1), reperes[k] ? `  repère réel ~${reperes[k]}` : '');
