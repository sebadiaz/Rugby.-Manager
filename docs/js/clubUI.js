// Mode Club : rendu du panneau (effectif/calendrier/classement) et connexion
// au modèle de données (docs/js/club.js) et au lanceur de match (window.RMMain,
// cf. docs/js/main.js). Aucune règle de jeu ici, uniquement affichage/DOM —
// même séparation que ui.js pour le Match rapide.
(function () {
  'use strict';

  const RMClub = window.RMClub;
  const { creerRng } = window.RugbyEngine;

  let saison = RMClub.chargerSaison();

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

  // Victoire/Nul/Défaite du point de vue du club du joueur — le calendrier
  // n'affronte QUE le club du joueur (jamais deux adversaires IA entre eux,
  // cf. RMClub.genererCalendrier), donc chaque match joué en a un.
  function formeClubJoueur(f) {
    if (!f.joue) return null;
    const domicileEstJoueur = estClubJoueur(f.domicileId);
    const pour = domicileEstJoueur ? f.score.domicile : f.score.exterieur;
    const contre = domicileEstJoueur ? f.score.exterieur : f.score.domicile;
    if (pour > contre) return 'v';
    if (pour < contre) return 'd';
    return 'n';
  }
  const LIBELLE_FORME = { v: 'V', n: 'N', d: 'D' };

  function formaterLigneCalendrier(f) {
    const domicile = nomClub(f.domicileId);
    const exterieur = nomClub(f.exterieurId);
    const score = f.joue ? `${f.score.domicile} - ${f.score.exterieur}` : 'à jouer';
    const forme = formeClubJoueur(f);
    const badge = forme ? `<span class="badgeForme ${forme}">${LIBELLE_FORME[forme]}</span>` : '';
    return `<div class="ligneCalendrier"><span>J${f.journee} — ${domicile} vs ${exterieur}</span><span class="scoreCal">${badge}${score}</span></div>`;
  }

  function rafraichirEntete() {
    const c = saison.clubJoueur;
    const initiale = (c.nom.match(/\b\w/g) || ['?']).slice(0, 2).join('').toUpperCase();
    document.getElementById('clubEntete').innerHTML =
      `<div class="clubEntete"><span class="pastilleClub" style="background:${c.couleur}">${initiale}</span><span><span class="nomClub">${c.nom}</span></span></div>`;
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
  // du terrain modélisé dans cette 1re version). Le résultat est enregistré
  // dans la saison dès que le match est généré (onResultat) — regarder le
  // match est ensuite juste une option proposée au joueur, pas une condition
  // pour que le résultat compte.
  document.getElementById('btnJouerMatchClub').addEventListener('click', () => {
    const f = RMClub.prochaineJourneeNonJouee(saison);
    if (!f) return;
    const clubDomicile = RMClub.club(saison, f.domicileId);
    const clubExterieur = RMClub.club(saison, f.exterieurId);
    const seed = graineAleatoire();
    const duree = Number(document.getElementById('selDureeClub').value) || 4800;
    document.getElementById('panneauClub').classList.remove('visible');
    window.RMMain.demarrerMatchClub(
      seed, duree,
      RMClub.effectifVersJoueursCfg(clubDomicile),
      RMClub.effectifVersJoueursCfg(clubExterieur),
      {
        noms: { A: clubDomicile.nom, B: clubExterieur.nom },
        // Le calendrier alterne domicile/extérieur pour le club du joueur
        // (aller-retour, cf. RMClub.genererCalendrier) : ce n'est PAS toujours
        // l'équipe A, il faut vérifier laquelle des deux c'est à chaque match.
        equipeJoueur: estClubJoueur(f.domicileId) ? 'A' : 'B',
        onResultat(etat) {
          RMClub.enregistrerResultat(saison, f.id, etat.score.A, etat.score.B, etat.stats.A.essais, etat.stats.B.essais);
          RMClub.sauvegarderSaison(saison);
          window.RMMain.reinitialiserConfigClub();
        },
        onFermer() {
          rafraichirTout();
          document.getElementById('panneauClub').classList.add('visible');
        },
      }
    );
  });

  rafraichirTout();
})();
