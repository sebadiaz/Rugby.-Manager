// Mode Club : rendu du panneau (effectif/calendrier/classement) et connexion
// au modèle de données (docs/js/club.js) et au lanceur de match (window.RMMain,
// cf. docs/js/main.js). Aucune règle de jeu ici, uniquement affichage/DOM —
// même séparation que ui.js pour le Match rapide.
(function () {
  'use strict';

  const RMClub = window.RMClub;
  const { creerRng } = window.RugbyEngine;

  let saison = RMClub.chargerSaison();
  let intervalleSuivi = null;

  function graineAleatoire() {
    return Math.floor(window.RMRng.random() * 0xffffffff);
  }

  function nomClub(clubId) {
    const c = RMClub.club(saison, clubId);
    return c ? c.nom : '?';
  }

  function estClubJoueur(clubId) {
    return saison.clubJoueur.id === clubId;
  }

  function formaterLigneCalendrier(f) {
    const domicile = nomClub(f.domicileId);
    const exterieur = nomClub(f.exterieurId);
    const score = f.joue ? `${f.score.domicile} - ${f.score.exterieur}` : 'à jouer';
    return `<div class="ligneCalendrier"><span>J${f.journee} — ${domicile} vs ${exterieur}</span><span class="scoreCal">${score}</span></div>`;
  }

  function rafraichirEntete() {
    const c = saison.clubJoueur;
    document.getElementById('clubEntete').innerHTML =
      `<div class="clubEntete"><span class="pastilleClub" style="background:${c.couleur}"></span><span class="nomClub">${c.nom}</span></div>`;
  }

  function rafraichirProchainMatch() {
    const f = RMClub.prochaineJourneeNonJouee(saison);
    const zone = document.getElementById('clubProchainMatch');
    const bouton = document.getElementById('btnJouerMatchClub');
    if (!f) {
      zone.innerHTML = '<p>Saison terminée — toutes les journées ont été jouées.</p>';
      bouton.disabled = true;
      return;
    }
    zone.innerHTML = formaterLigneCalendrier(f);
    bouton.disabled = false;
  }

  function rafraichirClassement() {
    const lignes = RMClub.classementTrie(saison).map((r, i) => {
      const diff = r.pointsPour - r.pointsContre;
      const classe = estClubJoueur(r.clubId) ? ' class="ligneClubJoueur"' : '';
      return `<tr${classe}><td>${i + 1}</td><td>${nomClub(r.clubId)}</td><td>${r.j}</td><td>${r.g}</td><td>${r.n}</td><td>${r.p}</td>` +
        `<td>${r.pointsPour}</td><td>${r.pointsContre}</td><td>${diff >= 0 ? '+' : ''}${diff}</td><td><b>${r.pts}</b></td></tr>`;
    }).join('');
    document.getElementById('clubClassement').innerHTML =
      `<table class="tableauClub"><thead><tr><th></th><th>Club</th><th>J</th><th>G</th><th>N</th><th>P</th><th>Pts+</th><th>Pts-</th><th>Diff</th><th>Pts</th></tr></thead><tbody>${lignes}</tbody></table>`;
  }

  function rafraichirEffectif() {
    const lignes = saison.clubJoueur.effectif.map((j) =>
      `<tr><td>${j.numero}</td><td>${j.nom}</td><td>${j.poste}</td><td>${j.age}</td><td>${j.vitesse}</td><td>${j.plaquage}</td></tr>`
    ).join('');
    document.getElementById('clubEffectif').innerHTML =
      `<table class="tableauClub"><thead><tr><th>#</th><th>Nom</th><th>Poste</th><th>Âge</th><th>Vitesse</th><th>Plaquage</th></tr></thead><tbody>${lignes}</tbody></table>`;
  }

  function rafraichirCalendrier() {
    document.getElementById('clubCalendrier').innerHTML =
      saison.calendrier.map((f) => {
        const attenu = f.joue ? ' style="opacity:.6"' : '';
        return `<div${attenu}>${formaterLigneCalendrier(f)}</div>`;
      }).join('');
  }

  function rafraichirTout() {
    const enCreation = !saison;
    document.getElementById('clubCreation').style.display = enCreation ? 'block' : 'none';
    document.getElementById('clubGestion').style.display = enCreation ? 'none' : 'block';
    if (enCreation) return;
    rafraichirEntete();
    rafraichirProchainMatch();
    rafraichirClassement();
    rafraichirEffectif();
    rafraichirCalendrier();
  }

  document.getElementById('btnModeClub').addEventListener('click', () => {
    rafraichirTout();
    document.getElementById('panneauClub').classList.add('visible');
  });
  document.getElementById('fermerClub').addEventListener('click', () => {
    document.getElementById('panneauClub').classList.remove('visible');
  });

  document.getElementById('btnCreerClub').addEventListener('click', () => {
    const nom = document.getElementById('inputNomClub').value.trim();
    const rng = creerRng(graineAleatoire());
    saison = RMClub.nouvelleSaison(rng, nom || null);
    RMClub.sauvegarderSaison(saison);
    rafraichirTout();
  });

  document.getElementById('btnNouvelleSaisonClub').addEventListener('click', () => {
    if (!window.confirm('Effacer la saison en cours et repartir de zéro ?')) return;
    RMClub.effacerSaison();
    saison = null;
    document.getElementById('inputNomClub').value = '';
    rafraichirTout();
  });

  // Lance le prochain match de la saison sur le MÊME canvas/boucle de rendu
  // que le Match rapide (cf. window.RMMain.demarrerMatchClub, docs/js/main.js) :
  // le club à domicile est l'équipe A, l'extérieur l'équipe B (pas d'avantage
  // du terrain modélisé dans cette 1re version). Un suivi léger (poll 1x/s)
  // détecte la fin de match (phase TERMINE) pour enregistrer le résultat dans
  // la saison automatiquement, sans action supplémentaire du joueur.
  document.getElementById('btnJouerMatchClub').addEventListener('click', () => {
    const f = RMClub.prochaineJourneeNonJouee(saison);
    if (!f) return;
    const clubDomicile = RMClub.club(saison, f.domicileId);
    const clubExterieur = RMClub.club(saison, f.exterieurId);
    const seed = graineAleatoire();
    const duree = Number(document.getElementById('selDureeClub').value) || 4800;
    document.getElementById('panneauClub').classList.remove('visible');
    if (intervalleSuivi) { clearInterval(intervalleSuivi); intervalleSuivi = null; }
    window.RMMain.demarrerMatchClub(
      seed, duree,
      RMClub.effectifVersJoueursCfg(clubDomicile),
      RMClub.effectifVersJoueursCfg(clubExterieur),
      // Appelé seulement une fois le match généré et la vraie lecture lancée
      // (cf. docs/js/main.js) : on ne surveille la fin qu'à partir de là, pour
      // ne jamais lire par erreur l'état encore affiché d'un match précédent.
      () => {
        intervalleSuivi = setInterval(() => {
          const etat = window.RMMain.etatActuel();
          if (!etat || etat.phase !== 'TERMINE') return;
          clearInterval(intervalleSuivi);
          intervalleSuivi = null;
          RMClub.enregistrerResultat(saison, f.id, etat.score.A, etat.score.B, etat.stats.A.essais, etat.stats.B.essais);
          RMClub.sauvegarderSaison(saison);
          window.RMMain.reinitialiserConfigClub();
        }, 1000);
      }
    );
  });

  rafraichirTout();
})();
