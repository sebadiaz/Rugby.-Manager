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

  function concerneClubJoueur(f) {
    return estClubJoueur(f.domicileId) || estClubJoueur(f.exterieurId);
  }

  // Victoire/Nul/Défaite du point de vue du club du joueur. Un calendrier
  // complet fait aussi jouer les adversaires entre eux (cf. genererCalendrier) :
  // ces matchs-là n'ont pas de "forme" du point de vue du joueur (null).
  function formeClubJoueur(f) {
    if (!f.joue || !concerneClubJoueur(f)) return null;
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
    const classe = concerneClubJoueur(f) ? ' ligneClubJoueur' : '';
    return `<div class="ligneCalendrier${classe}"><span>J${f.journee} — ${domicile} vs ${exterieur}</span><span class="scoreCal">${badge}${score}</span></div>`;
  }

  function rafraichirEntete() {
    const c = saison.clubJoueur;
    const initiale = (c.nom.match(/\b\w/g) || ['?']).slice(0, 2).join('').toUpperCase();
    document.getElementById('clubEntete').innerHTML =
      `<div class="clubEntete"><span class="pastilleClub" style="background:${c.couleur}">${initiale}</span><span><span class="nomClub">${c.nom}</span></span></div>`;
  }

  // La journée fait jouer TOUS les clubs à la fois (n/2 matchs simultanés,
  // cf. RMClub.genererCalendrier) : on affiche donc toute la liste, pas un
  // seul match — le match du joueur y est repéré par la marque ligneClubJoueur.
  function rafraichirProchainMatch() {
    const fixtures = RMClub.prochainesFixtures(saison);
    const zone = document.getElementById('clubProchainMatch');
    const bouton = document.getElementById('btnJouerMatchClub');
    if (fixtures.length === 0) {
      zone.innerHTML = '<p>Saison terminée — toutes les journées ont été jouées.</p>';
      bouton.disabled = true;
      return;
    }
    zone.innerHTML = fixtures.map(formaterLigneCalendrier).join('');
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

  // Joue la journée ENTIÈRE : tous les clubs jouent en même temps (cf.
  // RMClub.genererCalendrier), pas seulement le club du joueur. Les autres
  // rencontres (IA contre IA) sont simulées en arrière-plan (invisibles, pas
  // d'option "voir" : personne ne les regarde) et leur résultat enregistré
  // aussitôt ; le match du joueur suit ensuite le parcours habituel (génération
  // → résultat → « voir le match » optionnel), sur le MÊME canvas/boucle de
  // rendu que le Match rapide (cf. window.RMMain.demarrerMatchClub).
  document.getElementById('btnJouerMatchClub').addEventListener('click', () => {
    const fixtures = RMClub.prochainesFixtures(saison);
    if (fixtures.length === 0) return;
    const matchJoueur = fixtures.find(concerneClubJoueur);
    const autresMatchs = fixtures.filter((f) => f !== matchJoueur);
    const duree = Number(document.getElementById('selDureeClub').value) || 4800;
    document.getElementById('panneauClub').classList.remove('visible');

    function lancerMatchJoueur() {
      if (!matchJoueur) return; // calendrier à nombre pair de clubs : ne devrait pas arriver
      const clubDomicile = RMClub.club(saison, matchJoueur.domicileId);
      const clubExterieur = RMClub.club(saison, matchJoueur.exterieurId);
      window.RMMain.demarrerMatchClub(
        graineAleatoire(), duree,
        RMClub.effectifVersJoueursCfg(clubDomicile),
        RMClub.effectifVersJoueursCfg(clubExterieur),
        {
          noms: { A: clubDomicile.nom, B: clubExterieur.nom },
          equipeJoueur: estClubJoueur(matchJoueur.domicileId) ? 'A' : 'B',
          onResultat(etat) {
            RMClub.enregistrerResultat(saison, matchJoueur.id, etat.score.A, etat.score.B, etat.stats.A.essais, etat.stats.B.essais);
            RMClub.sauvegarderSaison(saison);
            window.RMMain.reinitialiserConfigClub();
          },
          onFermer() {
            rafraichirTout();
            document.getElementById('panneauClub').classList.add('visible');
          },
        }
      );
    }

    // Simule les autres rencontres une par une (même écran de génération,
    // titre différent), puis enchaîne sur le match du joueur.
    function simulerAutre(i) {
      if (i >= autresMatchs.length) { lancerMatchJoueur(); return; }
      const f = autresMatchs[i];
      const clubA = RMClub.club(saison, f.domicileId);
      const clubB = RMClub.club(saison, f.exterieurId);
      window.RMMain.simulerMatchEnArrierePlan(
        graineAleatoire(), duree,
        RMClub.effectifVersJoueursCfg(clubA),
        RMClub.effectifVersJoueursCfg(clubB),
        `Simulation : ${clubA.nom} vs ${clubB.nom} (${i + 1}/${autresMatchs.length})`,
        (etat) => {
          RMClub.enregistrerResultat(saison, f.id, etat.score.A, etat.score.B, etat.stats.A.essais, etat.stats.B.essais);
          RMClub.sauvegarderSaison(saison);
          simulerAutre(i + 1);
        }
      );
    }

    simulerAutre(0);
  });

  rafraichirTout();
})();
