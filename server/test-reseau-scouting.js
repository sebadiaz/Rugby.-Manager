// COUVERTURE — le RÉSEAU DE RECRUTEMENT : zones, missions, découvertes.
//
// Audit mesuré avant cette tranche :
//
//   - « zone de recrutement », « mission », « réseau » : zéro occurrence
//     dans tout docs/js (hors zones de BLESSURE, sans rapport) ;
//   - le marché des transferts compte 6 joueurs, VISIBLES DÈS LE PREMIER
//     JOUR, gratuitement, par tout le monde. Le scouting existant
//     (club-transferts.js, COUT_SCOUTING = 8 k€) ne fait que PRÉCISER un
//     rapport sur un joueur DÉJÀ affiché : il n'a jamais fait découvrir
//     personne ;
//   - le poste « Recruteur » du personnel promet « Réduit le coût du
//     scouting et affine plus vite les rapports » — un effet réel mais
//     minuscule, sur une action à 8 k€ ;
//   - conséquence : aucune décision de réseau à prendre. Le manager voit
//     tout, tout de suite, sans rien dépenser.
//
// Le cahier des charges demandait : zones géographiques, affectation d'un
// recruteur à une zone, durée de mission, coût, niveau de connaissance
// progressif, découverte progressive des joueurs, rapports qualitatifs,
// historique des rapports, et « aucune information parfaite instantanément ».
//
// Usage : node server/test-reseau-scouting.js
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

let graine = 205000;
function carriere(budget) {
  const s = RMClub.nouvelleSaison(creerRng(graine++), 'AS Réseau');
  RMClub.daterCalendrier(s);
  RMClub.assurerCompositionPourEquipe(s, 'pro');
  RMClub.assurerInfrastructures(s);
  if (budget != null) s.clubJoueur.budget = budget;
  return s;
}
// Fait passer `jours` journées de carrière comme le fait le jeu : par
// avancerUnJour, pas en appelant la mécanique du réseau à la main.
function vivre(s, jours) {
  for (let i = 0; i < jours; i++) RMClub.avancerUnJour(s);
}
// Une zone lointaine et une zone proche, choisies dans le catalogue réel.
function zones(s) { return RMClub.zonesScouting(s); }

test('N1 — des ZONES de recrutement existent, décrites et chiffrées', () => {
  const s = carriere();
  const liste = zones(s);
  assert.ok(Array.isArray(liste) && liste.length >= 6,
    `il faut plusieurs zones à choisir (${liste && liste.length})`);
  for (const z of liste) {
    assert.ok(z.code && z.nom, 'chaque zone a un code et un nom lisible');
    assert.ok(typeof z.connaissance === 'number' && z.connaissance >= 0 && z.connaissance <= 100,
      `connaissance de ${z.nom} hors bornes (${z.connaissance})`);
    assert.ok(z.coutParJour > 0, `envoyer un recruteur en ${z.nom} doit coûter quelque chose`);
    assert.ok(z.reputation, `${z.nom} doit dire ce qu'on y trouve`);
  }
  // Les zones ne sont pas des clones : le coût dépend de l'éloignement.
  const couts = new Set(liste.map((z) => z.coutParJour));
  assert.ok(couts.size >= 3, 'toutes les zones ne peuvent pas coûter pareil');
  // Au départ, le club connaît son propre pays mieux que le bout du monde.
  const fra = liste.find((z) => z.code === 'FRA');
  assert.ok(fra, 'la France doit être une zone');
  const lointaine = liste.find((z) => z.code === 'NZL');
  assert.ok(lointaine && fra.connaissance > lointaine.connaissance,
    'un club français connaît mieux la France que la Nouvelle-Zélande');
});

test('N2 — envoyer un recruteur COÛTE, au grand livre, catégorie recrutement', () => {
  const s = carriere(600);
  const budgetAvant = s.clubJoueur.budget;
  const r = RMClub.lancerMissionScouting(s, 'NZL', 30);
  assert.strictEqual(r.ok, true, `la mission doit partir (${r.motif || ''})`);
  assert.ok(r.cout > 0, 'la mission a un coût annoncé');
  assert.strictEqual(Math.round(s.clubJoueur.budget), Math.round(budgetAvant - r.cout),
    'le budget doit être débité du montant exact');
  const t = RMClub.totauxComptes(s);
  assert.strictEqual(Math.round(t.scouting), -Math.round(r.cout),
    `la dépense doit apparaître au grand livre (${JSON.stringify(t.scouting)})`);
});

test('N3 — un seul recruteur : une deuxième mission est refusée, avec un motif', () => {
  const s = carriere(900);
  assert.strictEqual(RMClub.lancerMissionScouting(s, 'NZL', 30).ok, true);
  const r = RMClub.lancerMissionScouting(s, 'ARG', 30);
  assert.strictEqual(r.ok, false, 'on ne peut pas être à deux endroits à la fois');
  assert.strictEqual(r.motif, 'mission_en_cours');
  assert.ok(r.message && r.message.length > 10, 'et le manager doit savoir pourquoi');
  const m = RMClub.missionScoutingEnCours(s);
  assert.ok(m && m.zone === 'NZL', 'la mission en cours reste celle de départ');
  assert.ok(m.joursRestants > 0, 'et il lui reste des jours');
});

test('N4 — une mission au-dessus des moyens est refusée, sans découvert', () => {
  const s = carriere(12);
  const budgetAvant = s.clubJoueur.budget;
  const r = RMClub.lancerMissionScouting(s, 'NZL', 90);
  assert.strictEqual(r.ok, false, 'un club sans trésorerie ne peut pas se le payer');
  assert.strictEqual(r.motif, 'budget');
  assert.strictEqual(s.clubJoueur.budget, budgetAvant, 'et rien ne doit être débité');
  assert.strictEqual(RMClub.missionScoutingEnCours(s), null, 'aucune mission ne part');
});

test('N5 — la mission avance et se termine SEULE au fil des jours', () => {
  const s = carriere(600);
  RMClub.lancerMissionScouting(s, 'ITA', 20);
  vivre(s, 5);
  const m = RMClub.missionScoutingEnCours(s);
  assert.ok(m, 'la mission court toujours après 5 jours');
  assert.ok(m.joursRestants < 20 && m.joursRestants > 0,
    `elle doit avoir avancé (${m.joursRestants} j restants)`);
  vivre(s, 20);
  assert.strictEqual(RMClub.missionScoutingEnCours(s), null,
    'après sa durée, la mission est terminée sans intervention');
});

test('N6 — PREUVE : la mission fait DÉCOUVRIR des joueurs, sinon elle ne sert à rien', () => {
  // Le point central de la tranche. Avant : le marché comptait 6 joueurs,
  // visibles gratuitement par tout le monde dès le premier jour.
  const temoin = carriere(600);
  vivre(temoin, 40);
  const sansMission = (temoin.marche || []).length;

  const s = carriere(600);
  RMClub.lancerMissionScouting(s, 'NZL', 30);
  vivre(s, 35);
  const decouverts = (s.marche || []).filter((j) => j.zoneDecouverte === 'NZL');
  assert.ok(decouverts.length > 0,
    `la mission doit ramener des joueurs (marché ${(s.marche || []).length}, témoin ${sansMission})`);
  for (const j of decouverts) {
    assert.ok(j.nom && j.poste, 'un joueur découvert est un vrai joueur du marché');
    assert.ok(RMClub.rapportScouting(s, j.id), 'et il est consultable comme les autres');
  }
});

test('N7 — aucune information parfaite : un joueur découvert reste à préciser', () => {
  const s = carriere(600);
  RMClub.lancerMissionScouting(s, 'NZL', 30);
  vivre(s, 35);
  const decouverts = (s.marche || []).filter((j) => j.zoneDecouverte === 'NZL');
  assert.ok(decouverts.length > 0, 'il faut au moins un joueur découvert pour ce test');
  for (const j of decouverts) {
    const apparent = RMClub.statsApparentes(j);
    assert.strictEqual(apparent.complet, false,
      `${j.nom} ne doit pas arriver avec un rapport complet`);
    assert.ok(j.connaissance < 100, `${j.nom} : connaissance ${j.connaissance}`);
  }
});

test('N8 — la CONNAISSANCE d\'une zone progresse et sert vraiment', () => {
  const s = carriere(2000);
  const avant = zones(s).find((z) => z.code === 'NZL').connaissance;
  RMClub.lancerMissionScouting(s, 'NZL', 40);
  vivre(s, 45);
  const apres = zones(s).find((z) => z.code === 'NZL').connaissance;
  assert.ok(apres > avant, `la zone doit être mieux connue (${avant} -> ${apres})`);

  // Et cette connaissance a un EFFET : une deuxième mission au même endroit
  // ramène des rapports mieux dégrossis qu'une première ailleurs.
  // Comparaison par IDENTIFIANT, pas par position : un rival peut signer un
  // joueur du marché entre les deux missions, et se fier à l'ordre de la
  // liste rendrait ce test faussement vert (ou faussement rouge).
  const idsPremiers = new Set((s.marche || [])
    .filter((j) => j.zoneDecouverte === 'NZL').map((j) => j.id));
  const premiers = (s.marche || []).filter((j) => idsPremiers.has(j.id))
    .map((j) => j.connaissance);
  RMClub.lancerMissionScouting(s, 'NZL', 40);
  vivre(s, 45);
  const seconds = (s.marche || [])
    .filter((j) => j.zoneDecouverte === 'NZL' && !idsPremiers.has(j.id))
    .map((j) => j.connaissance);
  assert.ok(seconds.length > 0, 'la deuxième mission doit aussi ramener du monde');
  const moy = (l) => l.reduce((a, b) => a + b, 0) / l.length;
  assert.ok(moy(seconds) > moy(premiers),
    `mieux connaître la zone doit donner de meilleurs rapports (${Math.round(moy(premiers))} -> ${Math.round(moy(seconds))})`);
});

test('N9 — chaque mission laisse un RAPPORT qualitatif, historisé', () => {
  const s = carriere(1200);
  RMClub.lancerMissionScouting(s, 'ARG', 30);
  vivre(s, 35);
  const rapports = RMClub.rapportsReseau(s);
  assert.ok(Array.isArray(rapports) && rapports.length >= 1,
    'la mission doit laisser une trace consultable');
  const r = rapports[0];
  assert.strictEqual(r.zone, 'ARG');
  assert.ok(r.date, 'daté');
  assert.ok(r.texte && r.texte.length > 20, `et rédigé (${JSON.stringify(r.texte)})`);
  assert.ok(Array.isArray(r.joueurs), 'avec les joueurs ramenés');

  // Une deuxième mission ne remplace pas la première : c'est un HISTORIQUE.
  RMClub.lancerMissionScouting(s, 'ITA', 25);
  vivre(s, 30);
  const apres = RMClub.rapportsReseau(s);
  assert.ok(apres.length >= 2, `l'historique doit s'empiler (${apres.length})`);
  assert.ok(apres.some((x) => x.zone === 'ARG') && apres.some((x) => x.zone === 'ITA'),
    'les deux missions doivent y figurer');

  // Et le manager est prévenu, il ne doit pas deviner que c'est rentré.
  const msg = (s.clubJoueur.messages || []).find((m) => /recrut|réseau|reseau|scout/i.test(m.titre));
  assert.ok(msg, 'un message doit annoncer le retour de mission');
});

test('N10 — le RECRUTEUR du club sert enfin à quelque chose de visible', () => {
  const sans = carriere(2000);
  sans.clubJoueur.personnel = (sans.clubJoueur.personnel || []).filter((p) => p.poste !== 'recruteur');
  const avec = carriere(2000);
  avec.clubJoueur.personnel = (avec.clubJoueur.personnel || []).filter((p) => p.poste !== 'recruteur');
  avec.clubJoueur.personnel.push({ id: 'staffTest', nom: 'Recruteur test', poste: 'recruteur', niveau: 95, salaire: 40 });

  const rSans = RMClub.lancerMissionScouting(sans, 'NZL', 30);
  const rAvec = RMClub.lancerMissionScouting(avec, 'NZL', 30);
  assert.ok(rSans.ok && rAvec.ok, 'les deux missions doivent partir');
  assert.ok(rAvec.cout < rSans.cout,
    `un recruteur doit faire baisser la note (${rAvec.cout} vs ${rSans.cout})`);
  vivre(sans, 35);
  vivre(avec, 35);
  const nbSans = (sans.marche || []).filter((j) => j.zoneDecouverte === 'NZL').length;
  const nbAvec = (avec.marche || []).filter((j) => j.zoneDecouverte === 'NZL').length;
  assert.ok(nbAvec >= nbSans,
    `et ne doit jamais ramener moins de monde (${nbAvec} vs ${nbSans})`);
});

test('N11 — mission et connaissance survivent à une sauvegarde/rechargement', () => {
  const s = carriere(1500);
  RMClub.lancerMissionScouting(s, 'RSA', 40);
  vivre(s, 10);
  const mAvant = RMClub.missionScoutingEnCours(s);
  RMClub.sauvegarderSaison(s);
  const rechargee = RMClub.chargerSaison();
  assert.ok(rechargee, 'la sauvegarde doit se recharger');
  const mApres = RMClub.missionScoutingEnCours(rechargee);
  assert.ok(mApres, 'la mission en cours doit survivre');
  assert.strictEqual(mApres.zone, mAvant.zone);
  assert.strictEqual(mApres.joursRestants, mAvant.joursRestants);
  // Et elle se termine normalement après rechargement.
  vivre(rechargee, 35);
  assert.strictEqual(RMClub.missionScoutingEnCours(rechargee), null,
    'une mission rechargée doit pouvoir aboutir');
  assert.ok(RMClub.rapportsReseau(rechargee).length >= 1,
    'et livrer son rapport');
});

test('N12 — une sauvegarde ANTÉRIEURE se charge et hérite d\'un réseau vierge', () => {
  const s = carriere();
  const ancienne = JSON.parse(JSON.stringify(s));
  delete ancienne.reseauScouting;
  ancienne.version = 10;
  RMClub.sauvegarderSaison(ancienne);
  const rechargee = RMClub.chargerSaison();
  assert.ok(rechargee, 'une carrière commencée avant la tranche doit rester jouable');
  assert.strictEqual(rechargee.version, RMClub.VERSION_SAUVEGARDE);
  const liste = RMClub.zonesScouting(rechargee);
  assert.ok(liste.length >= 6, 'et voir le catalogue de zones');
  assert.strictEqual(RMClub.missionScoutingEnCours(rechargee), null,
    'sans mission fantôme en cours');
  assert.deepStrictEqual(RMClub.rapportsReseau(rechargee), [],
    'et sans rapport inventé rétroactivement');
});

test('N15 — PREUVE : un joueur ramené est EXCLUSIF, un rival ne le signe pas', () => {
  // Trouvé en écrivant N14, pas déduit : sans filtre, un profil ramené de
  // Nouvelle-Zélande pour 135 k€ était signé par un club rival TROIS JOURS
  // plus tard. L'exclusivité annoncée au manager était fausse — il payait
  // pour repérer, un autre encaissait.
  const s = carriere(2000);
  RMClub.lancerMissionScouting(s, 'NZL', 30);
  vivre(s, 32);
  const ids = (s.marche || []).filter((j) => j.zoneDecouverte === 'NZL').map((j) => j.id);
  assert.ok(ids.length > 0, 'la mission doit avoir ramené du monde');
  // Une longue exposition au marché : les rivaux signent réellement pendant
  // ce temps (c'est P1-43b), mais jamais ces joueurs-là.
  const nationauxAvant = (s.marche || []).filter((j) => !j.zoneDecouverte).map((j) => j.id);
  vivre(s, 90);
  const restants = (s.marche || []).filter((j) => ids.indexOf(j.id) !== -1).map((j) => j.id);
  assert.deepStrictEqual(restants.sort(), ids.slice().sort(),
    'aucun joueur ramené par le réseau ne doit être signé par un rival');
  // Contre-preuve indispensable : si les rivaux ne signaient plus RIEN, ce
  // test serait vert par accident. Il faut qu'au moins un joueur du marché
  // NATIONAL, lui, ait bien été pris pendant les mêmes 90 jours.
  const idsApres = new Set((s.marche || []).map((j) => j.id));
  const partis = nationauxAvant.filter((id) => !idsApres.has(id));
  assert.ok(partis.length > 0,
    `les rivaux doivent rester actifs sur le marché national (${partis.length} départ(s))`);
});

test('N14 — un joueur ramené PORTE la marque de sa zone', () => {
  // Mesuré avant ce correctif : une mission en Nouvelle-Zélande revenait avec
  // « Paul Dubois » et « Louis Guerin ». Le mécanisme était juste, mais rien
  // à l'écran ne disait qu'on avait payé 135 k€ pour aller à l'autre bout du
  // monde — et le manager n'avait aucune raison de croire à sa zone.
  const s = carriere(2500);
  const noms = {};
  for (const code of ['NZL', 'ITA', 'RSA']) {
    RMClub.lancerMissionScouting(s, code, 30);
    vivre(s, 35);
    noms[code] = (s.marche || []).filter((j) => j.zoneDecouverte === code).map((j) => j.nom);
    assert.ok(noms[code].length > 0, `la mission en ${code} doit ramener quelqu'un`);
  }
  // Les trois zones ne peuvent pas produire les mêmes noms.
  const tous = [].concat(noms.NZL, noms.ITA, noms.RSA);
  assert.strictEqual(new Set(tous).size, tous.length,
    `aucun doublon de nom entre zones (${tous.join(', ')})`);
  // Et le joueur retient sa nationalité, pas seulement son lieu de découverte.
  for (const j of (s.marche || []).filter((x) => x.zoneDecouverte)) {
    assert.strictEqual(j.nationalite, j.zoneDecouverte,
      `${j.nom} doit porter la nationalité de sa zone`);
  }
});

test('N13 — ne rien envoyer ne casse rien : le marché vit comme avant', () => {
  // Garde-fou de non-régression : un manager qui ignore le réseau doit
  // retrouver exactement le jeu d'avant la tranche.
  const s = carriere();
  const avant = (s.marche || []).length;
  vivre(s, 60);
  assert.ok((s.marche || []).length > 0,
    'le marché national doit continuer d\'exister sans aucune mission');
  assert.strictEqual((s.marche || []).filter((j) => j.zoneDecouverte).length, 0,
    'et aucun joueur ne doit apparaître de nulle part');
  assert.strictEqual(Math.round(RMClub.totauxComptes(s).scouting || 0), 0,
    'ni aucune dépense de réseau');
  assert.ok(avant >= 0);
});

console.log(`\n${nbTests} test(s) exécuté(s).`);
