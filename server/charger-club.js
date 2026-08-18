// Chargeur commun des modules Mode Club pour les outils/tests Node.
// Les modules de docs/js/ sont des IIFE `(function (global) {...})(window)` :
// ils ne sont pas des modules CommonJS. Chaque test les chargeait jusqu'ici en
// recopiant la même longue liste de `new Function('window', ...)`, ce qui
// obligeait à modifier tous les fichiers à chaque nouveau domaine. Ce
// chargeur centralise l'opération SANS changer le comportement : même ordre,
// même fusion via Object.assign sur window.RMClub.
'use strict';

const fs = require('fs');
const path = require('path');

// Ordre indifférent (fusion par Object.assign), sauf club.js qui doit venir
// en premier : les autres domaines lisent ses constantes au chargement.
const MODULES = [
  'club.js',
  'club-personnel.js',
  'club-objectif.js',
  'club-analyse.js',
  'club-prets.js',
  'club-contrats.js',
  'club-negociations.js',
  'club-equipe-b.js',
  'club-transferts.js',
  'club-transferts-internationaux.js',
  'club-mercato.js',
  'club-infrastructures.js',
  'club-generation-joueurs.js',
  'club-centre-formation.js',
  'club-espoirs.js',
  'club-composition.js',
  'club-temps.js',
  'club-agenda.js',
  'club-semaine-entrainement.js',
  'club-jour-match.js',
  'club-direction.js',
  'club-evenements.js',
  'club-equipes.js',
  'club-condition-joueurs.js',
  'club-decisions.js',
  'club-statuts.js',
  'club-feuille-de-route.js',
  'club-comptes.js',
  'club-ventes.js',
  'club-feuille-de-match.js',
  'club-archives-matchs.js',
  'club-inscriptions.js',
  'club-rotation.js',
  'club-pyramide.js',
  'club-pyramide-france.js',
  'club-calendrier.js',
  'club-competitions.js',
  'club-effectif-adverse.js',
  'club-amicaux.js',
  'club-coupes.js',
  'club-a-traiter.js',
  'club-medical.js',
  'club-carriere-manager.js',
  'club-sauvegarde.js',
];

// Prépare le faux environnement navigateur minimal (window + localStorage)
// et charge tous les domaines. Renvoie RMClub.
function chargerRMClub() {
  if (!global.window) global.window = global;
  if (!global.localStorage) {
    let store = {};
    global.localStorage = {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    };
  }
  if (!global.window.RugbyEngine) global.window.RugbyEngine = require('../docs/rugby-engine.js');
  for (const nom of MODULES) {
    const code = fs.readFileSync(path.join(__dirname, '../docs/js/', nom), 'utf8');
    new Function('window', code)(global.window);
  }
  // world.js n'est pas un domaine RMClub mais RMWorld, et il CAPTURE RMClub
  // à son chargement (`const RMClub = global.RMClub`) : il doit donc venir
  // APRÈS tous les domaines club. Les coupes continentales et la résolution
  // abstraite en dépendent.
  if (!global.window.RMWorld) {
    const codeMonde = fs.readFileSync(path.join(__dirname, '../docs/js/world.js'), 'utf8');
    new Function('window', codeMonde)(global.window);
  }
  return global.window.RMClub;
}

// Générateur pseudo-aléatoire déterministe identique à celui des tests
// existants (LCG) — aucune dépendance à Math.random.
function creerRng(graine) {
  let s = graine >>> 0 || 1;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

module.exports = { chargerRMClub, creerRng, MODULES };
