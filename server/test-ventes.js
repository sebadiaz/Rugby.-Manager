// TEST DE PREUVE — ON NE PEUT PAS VENDRE UN JOUEUR
//
// COMPORTEMENT ACTUEL OBSERVÉ (mesuré) : sur une carrière neuve, marquer un
// joueur `veutPartir` puis appeler la seule fonction de départ existante,
// `libererJoueur`, donne : budget 439 -> 439. Gain 0 k€. Et
// `Object.keys(RMClub).filter(k => /vend|ceder/i.test(k))` ne renvoie RIEN.
//
// Le club peut ACHETER (signerJoueur, approcherJoueurAdverse) mais jamais
// VENDRE. Le grand livre (P1-47) déclare une catégorie « Ventes de joueurs »
// qui n'a aucun producteur.
//
// POURQUOI C'EST INSUFFISANT POUR LE JOUEUR :
//   - la direction impose un plancher de trésorerie (P1-46), et le seul
//     levier pour rentrer de l'argent est la billetterie ;
//   - les statuts promis (P1-45) produisent des joueurs qui demandent leur
//     transfert, et la seule issue est de les libérer POUR RIEN ;
//   - un effectif ne se pilote pas qu'en achetant : arbitrer entre garder un
//     cadre et encaisser son prix est la moitié du travail d'un manager.
//
// FONCTION EXACTE RESPONSABLE : club-transferts.js, libererJoueur — retire le
// joueur de l'effectif sans la moindre contrepartie financière, et rien
// d'autre n'existe.
//
// SCÉNARIO DE REPRODUCTION : voir V1, qui reproduit exactement la mesure.
//
// CE QUE CE FICHIER EXIGE :
//   1. une valeur marchande calculée sur les attributs RÉELS du joueur ;
//   2. des offres qui viennent de clubs qui ont RÉELLEMENT le budget et le
//      besoin — jamais un acheteur fabriqué ;
//   3. une vraie décision, avec au moins une contre-proposition ;
//   4. de l'argent RÉELLEMENT encaissé, tracé au grand livre ;
//   5. le joueur qui part rejoint RÉELLEMENT le club acheteur ;
//   6. des garde-fous : fenêtre de transfert, dernier du poste, prêt ;
//   7. refuser un joueur qui veut partir a un coût ;
//   8. un état qui survit à une sauvegarde.
//
// Usage : node server/test-ventes.js
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

function carriere(graine) {
  const s = RMClub.nouvelleSaison(creerRng(graine), 'AS Ventes');
  RMClub.daterCalendrier(s);
  return s;
}

// Fabrique une offre en partant de l'état RÉEL du jeu : un club adverse qui a
// le budget, un joueur vendable. C'est la même porte d'entrée que celle
// qu'emprunte la boucle quotidienne.
function offrePour(saison, joueur, club, montant, tirageContre) {
  return RMClub.enregistrerOffreAchat(saison, {
    joueurId: joueur.id, clubId: club.id, montant, tirageContre,
  });
}

// Le club le plus riche capable de payer ce prix — c'est exactement le filtre
// que la boucle quotidienne applique. Prendre `adversaires[0]` au hasard
// donnerait un refus « budgetAcheteur » sans rapport avec ce qu'on teste.
function acheteurSolvable(saison, prix) {
  return (saison.adversaires || [])
    .slice()
    .sort((a, b) => (b.budget || 0) - (a.budget || 0))
    .find((club) => RMClub.peutPayer(club, prix)) || null;
}

// Un joueur qu'on peut vendre : pas le dernier de son poste, et le MOINS
// cher — tous les joueurs ne sont pas dans les moyens de la division au
// palier de départ, et ce n'est pas ce qu'on teste ici.
function joueurVendable(saison) {
  const eff = saison.clubJoueur.effectif;
  return eff
    .filter((x) => eff.filter((y) => y.poste === x.poste).length >= 2)
    .sort((a, b) => RMClub.valeurMarchande(saison, a) - RMClub.valeurMarchande(saison, b))[0];
}

test('V1 — PREUVE : libérer un joueur ne rapporte rien, et rien d\'autre n\'existait', () => {
  const s = carriere(777);
  const c = s.clubJoueur;
  const j = c.effectif[0];
  j.veutPartir = true;
  const budgetAvant = c.budget;
  assert.strictEqual(RMClub.libererJoueur(s, j.id).ok, true);
  assert.strictEqual(c.budget, budgetAvant, 'libérer reste bien un départ libre, sans indemnité');
  // Ce que ce patch ajoute : une VOIE payante, à côté (jamais à la place).
  assert.strictEqual(typeof RMClub.vendreJoueur, 'function',
    'une vente doit exister comme alternative au départ libre');
});

test('V2 — la valeur marchande vient des attributs réels du joueur', () => {
  const s = carriere(801);
  const c = s.clubJoueur;
  const tri = c.effectif.slice().sort((a, b) =>
    (b.vitesse + b.plaquage) - (a.vitesse + a.plaquage));
  const meilleur = tri[0], moinsBon = tri[tri.length - 1];
  assert.ok(RMClub.valeurMarchande(s, meilleur) > RMClub.valeurMarchande(s, moinsBon),
    'le meilleur joueur doit valoir plus cher');
  // Un joueur sur la liste des transferts se négocie moins cher : le club est
  // vendeur, et ça se sait.
  const referenceLibre = RMClub.valeurMarchande(s, meilleur);
  meilleur.surListeTransfert = true;
  assert.ok(RMClub.valeurMarchande(s, meilleur) < referenceLibre,
    'un vendeur pressé n\'obtient pas le plein tarif');
});

test('V3 — mettre un joueur sur la liste des transferts est une décision persistée', () => {
  const s = carriere(802);
  const j = s.clubJoueur.effectif[0];
  assert.strictEqual(RMClub.basculerListeTransfert(s, j.id).surListe, true);
  assert.strictEqual(j.surListeTransfert, true);
  assert.strictEqual(RMClub.basculerListeTransfert(s, j.id).surListe, false);
  assert.strictEqual(!!j.surListeTransfert, false);
});

test('V4 — une offre est une VRAIE décision, avec une contre-proposition', () => {
  const s = carriere(803);
  const c = s.clubJoueur;
  const j = joueurVendable(s);
  const montant = RMClub.valeurMarchande(s, j);
  const club = acheteurSolvable(s, montant);
  assert.ok(club, 'au moins un club doit pouvoir se l\'offrir');
  const offre = offrePour(s, j, club, montant);
  assert.ok(offre && offre.ok, `l'offre doit être enregistrée (${offre && offre.motif})`);
  const msg = (c.messages || []).find((m) => m.decision && m.decision.type === 'offreAchat');
  assert.ok(msg, 'le manager doit recevoir l\'offre');
  assert.ok(msg.corps.includes(j.nom) && msg.corps.includes(club.nom),
    `l'offre doit nommer le joueur et le club (« ${msg.corps} »)`);
  const ids = msg.decision.options.map((o) => o.id).sort();
  assert.deepStrictEqual(ids, ['accepter', 'exiger', 'refuser']);
  assert.ok(msg.decision.dateLimite, 'une offre a une échéance');
});

test('V5 — accepter encaisse RÉELLEMENT, et le joueur change de club', () => {
  const s = carriere(804);
  const c = s.clubJoueur;
  const j = joueurVendable(s);
  const montant = RMClub.valeurMarchande(s, j);
  const club = acheteurSolvable(s, montant);
  assert.ok(club, 'au moins un club doit pouvoir se l\'offrir');
  offrePour(s, j, club, montant);
  const msg = (c.messages || []).find((m) => m.decision && m.decision.type === 'offreAchat');
  const budgetAvant = c.budget;
  const totalAvant = RMClub.totauxComptes(s).transfertVente;

  assert.strictEqual(RMClub.resoudreDecisionMessage(s, msg.id, 'accepter'), true);
  assert.strictEqual(c.budget, budgetAvant + montant, 'l\'argent doit vraiment entrer');
  assert.strictEqual(RMClub.totauxComptes(s).transfertVente, totalAvant + montant,
    'la vente doit apparaître au grand livre');
  assert.ok(!c.effectif.some((x) => x.id === j.id), 'le joueur quitte l\'effectif');
  const groupeAcheteur = club.groupe || club.effectif || [];
  assert.ok(groupeAcheteur.some((x) => x.nom === j.nom),
    'le joueur doit REJOINDRE le club acheteur, pas s\'évaporer');
  assert.ok(msg.decision.resultat, 'un compte rendu lisible');
});

test('V6 — exiger plus : soit le club paie plus, soit il s\'en va', () => {
  function scenario(graine) {
    const s = carriere(graine);
    const c = s.clubJoueur;
    const j = joueurVendable(s);
    const club = s.adversaires[0];
    club.budget = 100000; // il a les moyens : on teste l'envie, pas la caisse
    const montant = RMClub.valeurMarchande(s, j);
    // Tirage explicite et VARIÉ : c'est lui qui décide si le club monte au
    // prix exigé. Le figer donnerait toujours la même issue.
    offrePour(s, j, club, montant, ((graine * 37) % 100) / 100);
    const msg = (c.messages || []).find((m) => m.decision && m.decision.type === 'offreAchat');
    const budgetAvant = c.budget;
    const contre = msg.decision.montantExige;
    assert.ok(contre > montant, `la contre-proposition doit être plus chère (${contre} vs ${montant})`);
    RMClub.resoudreDecisionMessage(s, msg.id, 'exiger');
    return { encaisse: c.budget - budgetAvant, contre, joueurParti: !c.effectif.some((x) => x.id === j.id) };
  }
  // Deux issues doivent exister dans le jeu ; on vérifie la cohérence de
  // chacune plutôt que d'exiger un tirage précis.
  const resultats = [];
  for (let g = 900; g < 916; g++) resultats.push(scenario(g));
  const acceptes = resultats.filter((r) => r.joueurParti);
  const refuses = resultats.filter((r) => !r.joueurParti);
  assert.ok(acceptes.length > 0, 'un club doit parfois payer le prix exigé');
  assert.ok(refuses.length > 0, 'et parfois renoncer');
  for (const r of acceptes) assert.strictEqual(r.encaisse, r.contre, 'payé au prix exigé');
  for (const r of refuses) assert.strictEqual(r.encaisse, 0, 'aucun argent si le club renonce');
});

test('V7 — refuser un joueur qui veut partir a un coût', () => {
  const s = carriere(806);
  const c = s.clubJoueur;
  const j = joueurVendable(s);
  j.veutPartir = true;
  j.moral = 60;
  const prix = RMClub.valeurMarchande(s, j);
  offrePour(s, j, acheteurSolvable(s, prix), prix);
  const msg = (c.messages || []).find((m) => m.decision && m.decision.type === 'offreAchat');
  RMClub.resoudreDecisionMessage(s, msg.id, 'refuser');
  assert.ok(c.effectif.some((x) => x.id === j.id), 'il reste au club');
  assert.ok(j.moral < 60, `refuser sa porte de sortie le démoralise (${j.moral})`);
});

test('V8 — refuser un joueur qui NE veut PAS partir ne coûte rien', () => {
  const s = carriere(807);
  const c = s.clubJoueur;
  const j = joueurVendable(s);
  j.moral = 60;
  const prix = RMClub.valeurMarchande(s, j);
  offrePour(s, j, acheteurSolvable(s, prix), prix);
  const msg = (c.messages || []).find((m) => m.decision && m.decision.type === 'offreAchat');
  RMClub.resoudreDecisionMessage(s, msg.id, 'refuser');
  assert.strictEqual(j.moral, 60, 'un joueur heureux ne se vexe pas qu\'on le garde');
});

test('V9 — les garde-fous : dernier du poste, joueur prêté, hors fenêtre', () => {
  const s = carriere(808);
  const c = s.clubJoueur;
  // Dernier du poste : intouchable, comme pour libererJoueur.
  const postes = {};
  for (const j of c.effectif) postes[j.poste] = (postes[j.poste] || 0) + 1;
  const seul = c.effectif.find((j) => postes[j.poste] === 1);
  if (seul) {
    assert.strictEqual(RMClub.vendreJoueur(s, seul.id, s.adversaires[0].id, 500).motif,
      'dernier_du_poste');
  }
  const vendable = c.effectif.find((j) => postes[j.poste] >= 2);
  vendable.pret = { dureeRestante: 10 };
  assert.strictEqual(RMClub.vendreJoueur(s, vendable.id, s.adversaires[0].id, 500).motif, 'pret');
  delete vendable.pret;
  // Un club sans les moyens ne peut pas acheter.
  const pauvre = s.adversaires[0];
  pauvre.budget = 1;
  assert.strictEqual(RMClub.vendreJoueur(s, vendable.id, pauvre.id, 500).motif, 'budgetAcheteur');
});

test('V10 — les offres spontanées ciblent des joueurs et des clubs RÉELS', () => {
  let recues = 0, verifiees = 0;
  for (let g = 1000; g < 1030; g++) {
    const s = carriere(g);
    const c = s.clubJoueur;
    // Deux joueurs sur la liste : c'est le signal envoyé au marché.
    c.effectif[0].surListeTransfert = true;
    c.effectif[1].surListeTransfert = true;
    let date = RMClub.dateCourante(s);
    for (let i = 0; i < 120; i++) {
      date = RMClub.ajouterJours(date, 1);
      RMClub.avancerJourVentes(s, date);
    }
    const offres = (c.messages || []).filter((m) => m.decision && m.decision.type === 'offreAchat');
    if (!offres.length) continue;
    recues++;
    for (const o of offres) {
      const club = s.adversaires.find((a) => a.id === o.decision.clubId);
      assert.ok(club, 'le club acheteur doit exister');
      assert.ok(club.budget >= o.decision.montant,
        `${club.nom} doit avoir les moyens (${club.budget} pour ${o.decision.montant})`);
      assert.ok(c.effectif.some((x) => x.id === o.decision.joueurId),
        'le joueur visé doit être dans l\'effectif');
      verifiees++;
    }
  }
  assert.ok(recues >= 5, `des offres doivent arriver spontanément (${recues}/30 carrières)`);
  console.log(`     (${recues}/30 carrières reçoivent une offre, ${verifiees} offres vérifiées)`);
});

test('V11 — la liste des transferts et les offres survivent à une sauvegarde', () => {
  stockage = {};
  const s = carriere(1200);
  const c = s.clubJoueur;
  const j = joueurVendable(s);
  RMClub.basculerListeTransfert(s, j.id);
  const prix = RMClub.valeurMarchande(s, j);
  offrePour(s, j, acheteurSolvable(s, prix), prix);
  assert.strictEqual(RMClub.sauvegarderSaison(s), true);
  const r = RMClub.chargerSaison();
  assert.ok(r, 'rechargement attendu');
  assert.strictEqual(r.clubJoueur.effectif.find((x) => x.id === j.id).surListeTransfert, true);
  assert.ok((r.clubJoueur.messages || []).some((m) => m.decision && m.decision.type === 'offreAchat'),
    'l\'offre en cours doit être retrouvée');
});

test('V12 — le dossier d\'écran liste ce qui est en vente et ce qui est proposé', () => {
  const s = carriere(1300);
  const c = s.clubJoueur;
  const j = joueurVendable(s);
  RMClub.basculerListeTransfert(s, j.id);
  const prix = RMClub.valeurMarchande(s, j);
  offrePour(s, j, acheteurSolvable(s, prix), prix);
  const d = RMClub.dossierVentes(s);
  assert.strictEqual(d.surListe.length, 1);
  assert.strictEqual(d.surListe[0].id, j.id);
  assert.ok(typeof d.surListe[0].valeur === 'number' && d.surListe[0].valeur > 0);
  assert.strictEqual(d.offres.length, 1);
  assert.ok(d.offres[0].clubNom && d.offres[0].joueurNom);
  assert.ok(d.valeurEffectif > 0, 'la valeur totale de l\'effectif doit être chiffrée');
});

console.log(`\n${nbTests} test(s) exécuté(s).`);
