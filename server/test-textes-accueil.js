// P1 (audit) : le texte d'introduction du Mode Club (docs/index.html, carte
// #clubCreation) décrivait un « championnat complet à 6 clubs » — obsolète
// depuis l'introduction de la pyramide française (Ligue Régionale/Nationale/
// Excellence, 14 ou 16 clubs par division, cf. docs/js/club-pyramide.js) et
// de l'Équipe B/Monde. Ce test vérifie le texte réellement affiché AVANT que
// le joueur crée un club, pas seulement le code qui gère la pyramide une
// fois la carrière commencée (déjà correct, cf. RMClub.nomPalierFrance
// affiché dans l'entête du club).
//
// Usage : node server/test-textes-accueil.js
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '../docs/index.html'), 'utf8');

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

const debutClubCreation = html.indexOf('id="clubCreation"');
assert.ok(debutClubCreation >= 0, 'scénario de test : #clubCreation introuvable dans docs/index.html');
const finClubCreation = html.indexOf('id="fermerClubCreation"');
const introClubCreation = html.slice(debutClubCreation, finClubCreation);

test('le texte d\'intro du Mode Club ne mentionne plus le championnat obsolète "à 6 clubs"', () => {
  assert.ok(!/\b6\s*clubs\b/i.test(introClubCreation),
    'texte obsolète "6 clubs" encore présent dans la carte de création de club');
});

test('le texte d\'intro du Mode Club présente la vraie division de départ (Ligue Régionale)', () => {
  assert.ok(introClubCreation.includes('Ligue Régionale'), '"Ligue Régionale" absent du texte d\'introduction');
});

test('le texte d\'intro du Mode Club mentionne la progression vers les autres paliers', () => {
  assert.ok(introClubCreation.includes('Ligue Nationale') && introClubCreation.includes("Ligue d'Excellence"),
    'progression vers Ligue Nationale / Ligue d\'Excellence absente du texte d\'introduction');
});

test('le texte d\'intro du Mode Club mentionne les compétitions mondiales et l\'Équipe B', () => {
  assert.ok(/compétitions mondiales/i.test(introClubCreation), 'compétitions mondiales absentes du texte d\'introduction');
  assert.ok(/Équipe B/i.test(introClubCreation), 'Équipe B absente du texte d\'introduction');
});

console.log(`\n${nbTests} test(s) exécuté(s).`);
if (process.exitCode) {
  console.error('ECHEC : le texte d\'accueil du Mode Club ne correspond plus à la structure réelle de la pyramide.');
} else {
  console.log('OK : le texte d\'accueil du Mode Club présente correctement la pyramide (Ligue Régionale/Nationale/Excellence, Monde, Équipe B).');
}
