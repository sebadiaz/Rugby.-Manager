// Mode Club : rendu du panneau (effectif/calendrier/classement) et connexion
// au modèle de données (docs/js/club.js) et au lanceur de match (window.RMMain,
// cf. docs/js/main.js). Aucune règle de jeu ici, uniquement affichage/DOM —
// même séparation que ui.js pour le Match rapide.
(function () {
  'use strict';

  const RMClub = window.RMClub;
  const { creerRng } = window.RugbyEngine;

  let saison = RMClub.chargerSaison();
  // Composition du jour (numéro -> id joueur) pour le club du joueur : tenue
  // en mémoire, recalculée en "meilleure équipe possible" à chaque ouverture
  // du panneau Club (donc après blessures/transferts) sauf si le joueur l'a
  // lui-même ajustée entre-temps via #panneauComposition.
  let compositionActuelle = null;

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

  // Config moteur pour un club donné : composition du jour (choisie ou
  // meilleure équipe automatique) pour le club du joueur, effectif direct
  // (15, un par numéro) pour un adversaire IA — cf. docs/js/club.js.
  function cfgPour(c) {
    if (c.id === saison.clubJoueur.id) {
      if (!compositionActuelle) compositionActuelle = RMClub.meilleureComposition(c.effectif);
      return RMClub.compositionVersJoueursCfg(c.effectif, compositionActuelle);
    }
    return RMClub.effectifVersJoueursCfg(c);
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

  function rafraichirTactique() {
    const actuelle = saison.clubJoueur.tactique || 'equilibre';
    document.getElementById('clubTactique').innerHTML = Object.keys(RMClub.TACTIQUES).map((cle) => {
      const t = RMClub.TACTIQUES[cle];
      const choisie = cle === actuelle ? ' choisie' : '';
      return `<button class="ligneTactique${choisie}" data-tactique="${cle}"><b>${t.nom}</b><span>${t.description}</span></button>`;
    }).join('');
  }

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
      `<div class="clubEntete"><span class="pastilleClub" style="background:${c.couleur}">${initiale}</span>` +
      `<span><span class="nomClub">${c.nom}</span><span class="sousLigne">Saison ${saison.numero || 1} · 💰 ${c.budget} k€</span></span></div>`;
  }

  // La journée fait jouer TOUS les clubs à la fois (n/2 matchs simultanés,
  // cf. RMClub.genererCalendrier) : on affiche donc toute la liste, pas un
  // seul match — le match du joueur y est repéré par la marque ligneClubJoueur.
  function rafraichirProchainMatch() {
    const fixtures = RMClub.prochainesFixtures(saison);
    const zone = document.getElementById('clubProchainMatch');
    const bouton = document.getElementById('btnJouerMatchClub');
    const boutonComposition = document.getElementById('btnComposition');
    const boutonSaisonSuivante = document.getElementById('btnSaisonSuivante');
    if (fixtures.length === 0) {
      zone.innerHTML = '<p>Saison terminée — toutes les journées ont été jouées.</p>';
      bouton.style.display = 'none';
      boutonComposition.style.display = 'none';
      boutonSaisonSuivante.style.display = '';
      return;
    }
    bouton.style.display = '';
    boutonComposition.style.display = '';
    boutonSaisonSuivante.style.display = 'none';
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

  // Abréviations de poste (cf. moteur, PROFILS[n].label) traduites en toutes
  // lettres pour l'effectif : "P"/"T" n'est parlant que pour qui connaît déjà
  // la numérotation du rugby à XV, or le Mode Club vise aussi les néophytes.
  const POSTE_COMPLET = {
    P: 'Pilier', T: 'Talonneur', '2L': 'Deuxième ligne', '3L': 'Troisième ligne',
    DM: 'Demi de mêlée', OV: 'Ouverture', AI: 'Ailier', CE: 'Centre', AR: 'Arrière',
  };

  // Effectif ÉTENDU du club du joueur (24 avec profondeur, contrats, salaires,
  // blessures) — bien plus détaillé que celui, purement sportif, des
  // adversaires IA, puisque c'est le seul club réellement géré ici.
  function rafraichirEffectif() {
    const effectif = saison.clubJoueur.effectif.slice().sort((a, b) => a.poste.localeCompare(b.poste) || (b.vitesse + b.plaquage) - (a.vitesse + a.plaquage));
    const lignes = effectif.map((j) => {
      const blessure = j.blessureJournees > 0 ? `<span class="badgeBlessure">🤕 ${j.blessureJournees}j</span>` : '—';
      const contratClasse = j.contrat <= 1 ? ' class="badgeContratCourt"' : '';
      return `<tr><td>${j.nom}</td><td>${POSTE_COMPLET[j.poste] || j.poste}</td><td>${j.age}</td><td>${j.vitesse}</td><td>${j.plaquage}</td>` +
        `<td${contratClasse}>${j.contrat} an(s)</td><td>${j.salaire} k€</td><td>${blessure}</td>` +
        `<td><button class="btnLiberer" data-joueur="${j.id}">Libérer</button></td></tr>`;
    }).join('');
    document.getElementById('clubEffectif').innerHTML =
      `<table class="tableauClub"><thead><tr><th>Nom</th><th>Poste</th><th>Âge</th><th>Vit.</th><th>Plaq.</th><th>Contrat</th><th>Salaire</th><th>Forme</th><th></th></tr></thead><tbody>${lignes}</tbody></table>`;
  }

  // Groupé par journée (un en-tête toutes les n/2 lignes) : à plat, 30
  // rencontres (championnat complet) étaient impossibles à scanner et
  // noyaient le bouton "Nouvelle saison" tout en bas sous un mur de texte.
  function rafraichirCalendrier() {
    const parJournee = {};
    for (const f of saison.calendrier) (parJournee[f.journee] = parJournee[f.journee] || []).push(f);
    document.getElementById('clubCalendrier').innerHTML = Object.keys(parJournee)
      .sort((a, b) => Number(a) - Number(b))
      .map((j) => {
        const lignes = parJournee[j].map((f) => {
          const attenu = f.joue ? ' style="opacity:.6"' : '';
          return `<div${attenu}>${formaterLigneCalendrier(f)}</div>`;
        }).join('');
        return `<div class="blocJournee"><h4>Journée ${j}</h4>${lignes}</div>`;
      }).join('');
  }

  // Composition du jour : un <select> par numéro de maillot (1-15), limité
  // aux joueurs du bon poste NON déjà titularisés à un autre numéro (évite
  // les doublons sans logique d'échange à gérer). Un joueur blessé reste
  // sélectionnable (mieux vaut jouer diminué que laisser un trou) mais
  // signalé par 🤕 dans son libellé.
  function rafraichirComposition() {
    const effectif = saison.clubJoueur.effectif;
    if (!compositionActuelle) compositionActuelle = RMClub.meilleureComposition(effectif);
    const parId = {};
    for (const j of effectif) parId[j.id] = j;
    const lignes = Object.keys(RMClub.POSTE_REQUIS).map((numero) => {
      const poste = RMClub.POSTE_REQUIS[numero];
      const utiliseAilleurs = new Set(Object.keys(compositionActuelle)
        .filter((n) => n !== numero).map((n) => compositionActuelle[n]));
      const candidats = effectif.filter((j) => j.poste === poste && !utiliseAilleurs.has(j.id));
      const options = candidats.map((j) => {
        const etat = j.blessureJournees > 0 ? ` 🤕${j.blessureJournees}j` : '';
        const selectionne = compositionActuelle[numero] === j.id ? ' selected' : '';
        return `<option value="${j.id}"${selectionne}>${j.nom} (${j.vitesse}/${j.plaquage})${etat}</option>`;
      }).join('');
      return `<div class="ligneComposition"><span class="numComposition">N°${numero} <em>${POSTE_COMPLET[poste] || poste}</em></span>` +
        `<select data-numero="${numero}">${options}</select></div>`;
    }).join('');
    document.getElementById('clubComposition').innerHTML = lignes;
  }

  function rafraichirMarche() {
    const c = saison.clubJoueur;
    document.getElementById('transfertsBudget').innerHTML =
      `<div class="ligneFinances"><span>Budget disponible</span><span class="budgetValeur${c.budget < 0 ? ' negatif' : ''}">${c.budget} k€</span></div>`;
    document.getElementById('clubMarche').innerHTML = saison.marche.map((j) => {
      const abordable = c.budget >= j.prixTransfert;
      return `<div class="ligneMarche"><span class="infosJoueur"><b>${j.nom}</b><span>${POSTE_COMPLET[j.poste] || j.poste} · ${j.age} ans · Vit.${j.vitesse}/Plaq.${j.plaquage}</span></span>` +
        `<span class="actionMarche"><span class="prixMarche">${j.prixTransfert} k€</span>` +
        `<button class="accent btnSigner" data-joueur="${j.id}"${abordable ? '' : ' disabled'}>Signer</button></span></div>`;
    }).join('') || '<p>Aucun joueur libre pour le moment.</p>';
  }

  function rafraichirTout() {
    const enCreation = !saison;
    document.getElementById('clubCreation').style.display = enCreation ? 'block' : 'none';
    document.getElementById('clubGestion').style.display = enCreation ? 'none' : 'block';
    if (enCreation) return;
    rafraichirEntete();
    rafraichirProchainMatch();
    rafraichirTactique();
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
    compositionActuelle = null;
    RMClub.sauvegarderSaison(saison);
    rafraichirTout();
  });

  document.getElementById('btnNouvelleSaisonClub').addEventListener('click', () => {
    if (!window.confirm('Effacer la saison en cours et repartir de zéro (effectif, budget, historique compris) ?')) return;
    RMClub.effacerSaison();
    saison = null;
    compositionActuelle = null;
    document.getElementById('inputNomClub').value = '';
    rafraichirTout();
  });

  // --- Composition du jour ---
  document.getElementById('btnComposition').addEventListener('click', () => {
    rafraichirComposition();
    document.getElementById('panneauComposition').classList.add('visible');
  });
  document.getElementById('fermerComposition').addEventListener('click', () => {
    document.getElementById('panneauComposition').classList.remove('visible');
  });
  document.getElementById('btnCompositionAuto').addEventListener('click', () => {
    compositionActuelle = RMClub.meilleureComposition(saison.clubJoueur.effectif);
    rafraichirComposition();
  });
  document.getElementById('clubComposition').addEventListener('change', (e) => {
    const numero = e.target.dataset.numero;
    if (!numero) return;
    compositionActuelle[numero] = e.target.value;
    rafraichirComposition(); // ce joueur n'est plus proposé aux autres numéros
  });

  // --- Tactique : n'affecte QUE le club du joueur (cf. lancerMatchJoueur) ---
  document.getElementById('clubTactique').addEventListener('click', (e) => {
    const cle = e.target.closest('[data-tactique]');
    if (!cle) return;
    saison.clubJoueur.tactique = cle.dataset.tactique;
    RMClub.sauvegarderSaison(saison);
    rafraichirTactique();
  });

  // --- Marché des transferts ---
  document.getElementById('btnTransferts').addEventListener('click', () => {
    rafraichirMarche();
    document.getElementById('panneauTransferts').classList.add('visible');
  });
  document.getElementById('fermerTransferts').addEventListener('click', () => {
    document.getElementById('panneauTransferts').classList.remove('visible');
    rafraichirEffectif(); // reflète les signatures/libérations faites pendant la visite
    rafraichirEntete(); // reflète le budget dépensé
  });
  document.getElementById('btnRafraichirMarche').addEventListener('click', () => {
    const rng = creerRng(graineAleatoire());
    saison.marche = RMClub.genererMarcheTransferts(rng, saison.clubJoueur.niveauClub, 6);
    RMClub.sauvegarderSaison(saison);
    rafraichirMarche();
  });
  document.getElementById('clubMarche').addEventListener('click', (e) => {
    const id = e.target.dataset.joueur;
    if (!id || !e.target.classList.contains('btnSigner')) return;
    const res = RMClub.signerJoueur(saison, id);
    if (!res.ok) { window.alert('Budget insuffisant pour cette signature.'); return; }
    compositionActuelle = null; // nouveau joueur potentiellement meilleur : ré-évalue la composition
    RMClub.sauvegarderSaison(saison);
    rafraichirMarche();
  });
  document.getElementById('clubEffectif').addEventListener('click', (e) => {
    const id = e.target.dataset.joueur;
    if (!id || !e.target.classList.contains('btnLiberer')) return;
    const joueur = saison.clubJoueur.effectif.find((j) => j.id === id);
    if (!joueur || !window.confirm(`Libérer ${joueur.nom} ? Il quittera définitivement l'effectif.`)) return;
    const res = RMClub.libererJoueur(saison, id);
    if (!res.ok) { window.alert("Impossible : c'est le dernier joueur de ce poste dans l'effectif."); return; }
    compositionActuelle = null;
    RMClub.sauvegarderSaison(saison);
    rafraichirEffectif();
  });

  // --- Fin de saison : vieillissement, fin de contrats, retraites, recrues,
  // nouveau calendrier — le club (nom, budget) et son identité persistent. ---
  document.getElementById('btnSaisonSuivante').addEventListener('click', () => {
    const rng = creerRng(graineAleatoire());
    const { partis, arrivees } = RMClub.avancerSaison(rng, saison);
    compositionActuelle = null;
    RMClub.sauvegarderSaison(saison);
    rafraichirTout();
    const resume = [
      `Saison ${saison.numero} !`,
      partis.length ? `Départs (${partis.length}) : ${partis.map((p) => `${p.nom} (${p.motif})`).join(', ')}` : null,
      arrivees.length ? `Arrivées (${arrivees.length}) : ${arrivees.map((a) => a.nom).join(', ')}` : null,
    ].filter(Boolean).join('\n\n');
    window.alert(resume);
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

    // Forme du club du joueur pour CE match (avant enregistrement du résultat) —
    // sert au calcul des finances (recette boostée en cas de victoire).
    function formeApres(f, scoreA, scoreB) {
      const domicileEstJoueur = estClubJoueur(f.domicileId);
      const pour = domicileEstJoueur ? scoreA : scoreB;
      const contre = domicileEstJoueur ? scoreB : scoreA;
      return pour > contre ? 'v' : pour < contre ? 'd' : 'n';
    }

    function lancerMatchJoueur() {
      if (!matchJoueur) return; // calendrier à nombre pair de clubs : ne devrait pas arriver
      const clubDomicile = RMClub.club(saison, matchJoueur.domicileId);
      const clubExterieur = RMClub.club(saison, matchJoueur.exterieurId);
      const compositionUtilisee = compositionActuelle;
      // La tactique choisie (cf. panneau Club) ne s'applique QU'au club du
      // joueur, jamais à l'IA adverse — d'où le suffixe A/B dynamique selon
      // le côté du joueur pour ce match précis (domicile/extérieur alterne).
      const lettreJoueur = estClubJoueur(matchJoueur.domicileId) ? 'A' : 'B';
      const cfgTactique = RMClub.tactiqueVersConfig(saison.clubJoueur.tactique || 'equilibre');
      const tactiqueCfg = {};
      if (cfgTactique.attaque) tactiqueCfg['attaque' + lettreJoueur] = cfgTactique.attaque;
      if (cfgTactique.defense) tactiqueCfg['defense' + lettreJoueur] = cfgTactique.defense;
      window.RMMain.demarrerMatchClub(
        graineAleatoire(), duree,
        cfgPour(clubDomicile),
        cfgPour(clubExterieur),
        tactiqueCfg,
        {
          noms: { A: clubDomicile.nom, B: clubExterieur.nom },
          equipeJoueur: estClubJoueur(matchJoueur.domicileId) ? 'A' : 'B',
          onResultat(etat) {
            RMClub.enregistrerResultat(saison, matchJoueur.id, etat.score.A, etat.score.B, etat.stats.A.essais, etat.stats.B.essais);
            const forme = formeApres(matchJoueur, etat.score.A, etat.score.B);
            RMClub.appliquerFinancesMatch(saison.clubJoueur, forme);
            RMClub.faireProgresserBlessures(creerRng(graineAleatoire()), saison.clubJoueur.effectif, compositionUtilisee);
            compositionActuelle = null; // recalculée à la prochaine ouverture (blessures ont pu changer la donne)
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
        cfgPour(clubA),
        cfgPour(clubB),
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
