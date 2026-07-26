// Calendrier et classement (Mode Club) — domaine extrait de docs/js/club.js
// (TODO_AUDIT.md P2-10, tranche 14) : génération du calendrier aller-retour
// (méthode du cercle, un adversaire fixe + rotation des autres), classement
// initial, enregistrement d'un résultat réel (points classiques 4/2/0 +
// bonus offensif/défensif rugby), tri et prochaines fixtures. Domaine
// autonome : aucun état de module (pas de compteur), comportement
// strictement inchangé. `enregistrerResultat`/`classementTrie` (championnat
// principal) délèguent à la version générique `...Dans`/`...De` — même
// principe que dans club.js, juste déplacé là où vivent maintenant les deux
// versions.
(function (global) {
  'use strict';

  function genererCalendrier(clubs) {
    const n = clubs.length;
    const ids = clubs.map((c) => c.id);
    const fixe = ids[0];
    const tournant = ids.slice(1);
    const rondesAller = [];
    for (let r = 0; r < n - 1; r++) {
      const ordre = [fixe, ...tournant];
      const ronde = [];
      for (let i = 0; i < n / 2; i++) {
        const a = ordre[i], b = ordre[n - 1 - i];
        ronde.push(r % 2 === 0 ? [a, b] : [b, a]);
      }
      rondesAller.push(ronde);
      tournant.push(tournant.shift());
    }
    const fixtures = [];
    let id = 0;
    rondesAller.forEach((ronde, r) => {
      for (const [domicileId, exterieurId] of ronde) {
        fixtures.push({ id: 'f' + id++, journee: r + 1, domicileId, exterieurId, joue: false, score: null });
      }
    });
    const decalage = rondesAller.length;
    rondesAller.forEach((ronde, r) => {
      for (const [domicileId, exterieurId] of ronde) {
        fixtures.push({ id: 'f' + id++, journee: decalage + r + 1, domicileId: exterieurId, exterieurId: domicileId, joue: false, score: null });
      }
    });
    return fixtures;
  }

  function classementInitial(clubs) {
    const table = {};
    for (const c of clubs) table[c.id] = {
      clubId: c.id, j: 0, g: 0, n: 0, p: 0, pts: 0, essaisPour: 0, essaisContre: 0, pointsPour: 0, pointsContre: 0,
      // Points de bonus RÉELLEMENT comptés séparément (cf. enregistrerResultatDans) —
      // affichables dans le classement pour que le joueur comprenne d'où vient
      // chaque point, jamais fondus silencieusement dans `pts`.
      bonusOffensifs: 0, bonusDefensifs: 0,
    };
    return table;
  }

  // Points de classement RUGBY (pas juste victoire/nul/défaite) : victoire 4,
  // nul 2, défaite 0, + bonus offensif (+1, 4 essais marqués ou plus, quel
  // que soit le résultat) + bonus défensif (+1, défaite par 7 points ou
  // moins) — la règle standard du rugby à XV professionnel (Top 14, Six
  // Nations, Coupe du monde...), pas une invention. Les essais nécessaires
  // au bonus offensif sont déjà transmis par l'appelant (résultat RÉEL du
  // match simulé), jamais fabriqués ici.
  function enregistrerResultatDans(calendrier, classement, fixtureId, scoreDomicile, scoreExterieur, essaisDomicile, essaisExterieur) {
    const f = calendrier.find((x) => x.id === fixtureId);
    if (!f || f.joue) return;
    f.joue = true;
    f.score = { domicile: scoreDomicile, exterieur: scoreExterieur };
    const td = classement[f.domicileId];
    const te = classement[f.exterieurId];
    // Rétrocompat : une sauvegarde antérieure au bonus de classement n'a pas
    // ces deux champs sur ses lignes existantes — les initialise plutôt que
    // de les corrompre en NaN au premier += sur `undefined`.
    if (td.bonusOffensifs == null) td.bonusOffensifs = 0;
    if (td.bonusDefensifs == null) td.bonusDefensifs = 0;
    if (te.bonusOffensifs == null) te.bonusOffensifs = 0;
    if (te.bonusDefensifs == null) te.bonusDefensifs = 0;
    td.j++; te.j++;
    td.pointsPour += scoreDomicile; td.pointsContre += scoreExterieur;
    te.pointsPour += scoreExterieur; te.pointsContre += scoreDomicile;
    td.essaisPour += essaisDomicile || 0; td.essaisContre += essaisExterieur || 0;
    te.essaisPour += essaisExterieur || 0; te.essaisContre += essaisDomicile || 0;
    const ecart = Math.abs(scoreDomicile - scoreExterieur);
    const bonusOffDom = (essaisDomicile || 0) >= 4 ? 1 : 0;
    const bonusOffExt = (essaisExterieur || 0) >= 4 ? 1 : 0;
    td.bonusOffensifs += bonusOffDom; te.bonusOffensifs += bonusOffExt;
    if (scoreDomicile > scoreExterieur) {
      td.g++; td.pts += 4 + bonusOffDom; te.p++;
      const bonusDefExt = ecart <= 7 ? 1 : 0;
      te.bonusDefensifs += bonusDefExt;
      te.pts += bonusOffExt + bonusDefExt;
    } else if (scoreDomicile < scoreExterieur) {
      te.g++; te.pts += 4 + bonusOffExt; td.p++;
      const bonusDefDom = ecart <= 7 ? 1 : 0;
      td.bonusDefensifs += bonusDefDom;
      td.pts += bonusOffDom + bonusDefDom;
    } else {
      td.n++; te.n++; td.pts += 2 + bonusOffDom; te.pts += 2 + bonusOffExt;
    }
  }
  function enregistrerResultat(saison, fixtureId, scoreDomicile, scoreExterieur, essaisDomicile, essaisExterieur) {
    enregistrerResultatDans(saison.calendrier, saison.classement, fixtureId, scoreDomicile, scoreExterieur, essaisDomicile, essaisExterieur);
  }

  function classementTrieDe(classement) {
    return Object.values(classement).sort((a, b) =>
      b.pts - a.pts || (b.pointsPour - b.pointsContre) - (a.pointsPour - a.pointsContre) || b.pointsPour - a.pointsPour);
  }
  function classementTrie(saison) {
    return classementTrieDe(saison.classement);
  }

  function prochainesFixtures(saison) {
    const prochaine = saison.calendrier.find((f) => !f.joue);
    if (!prochaine) return [];
    return saison.calendrier.filter((f) => f.journee === prochaine.journee);
  }

  function club(saison, clubId) {
    if (saison.clubJoueur.id === clubId) return saison.clubJoueur;
    return saison.adversaires.find((c) => c.id === clubId) || null;
  }

  global.RMClub = Object.assign(global.RMClub || {}, {
    genererCalendrier, classementInitial, enregistrerResultatDans, enregistrerResultat,
    classementTrieDe, classementTrie, prochainesFixtures, club,
  });
})(window);
