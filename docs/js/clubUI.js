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
  // lui-même ajustée entre-temps via #blocComposition (dépliée sur place
  // dans l'onglet Aperçu, plus un panneau à part).
  let compositionActuelle = null;
  // Joueur actuellement affiché dans la fiche (#clubJoueurDetail, dépliée sur
  // place dans l'onglet Effectif) — sert au bouton "Libérer ce joueur", qui
  // vit dans l'innerHTML régénéré et est géré par délégation d'événements.
  let joueurAffiche = null;

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

  // 3 axes INDÉPENDANTS qui se combinent (cf. RMClub.AXES_TACTIQUE) — pas un
  // choix unique parmi des templates figés : le joueur compose sa tactique
  // comme les instructions d'équipe d'un vrai jeu de gestion.
  function rafraichirTactique() {
    if (!saison.clubJoueur.tactique || typeof saison.clubJoueur.tactique !== 'object') {
      saison.clubJoueur.tactique = { style: 'equilibre', pied: 'normal', ligneDef: 'normale' };
    }
    const actuelle = saison.clubJoueur.tactique;
    document.getElementById('clubTactique').innerHTML = Object.keys(RMClub.AXES_TACTIQUE).map((axe) => {
      const infosAxe = RMClub.AXES_TACTIQUE[axe];
      const valeurActuelle = actuelle[axe] || infosAxe.defaut;
      const boutons = Object.keys(infosAxe.options).map((cle) => {
        const o = infosAxe.options[cle];
        const choisie = cle === valeurActuelle ? ' choisie' : '';
        return `<button class="ligneTactique${choisie}" data-axe="${axe}" data-valeur="${cle}"><b>${o.nom}</b><span>${o.description}</span></button>`;
      }).join('');
      return `<h4 class="titreAxeTactique">${infosAxe.label}</h4>${boutons}`;
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
  // adversaires IA, puisque c'est le seul club réellement géré ici. Chaque
  // ligne ouvre la fiche joueur (cf. ouvrirFicheJoueur) : table dense, actions
  // (libérer) déportées dans la fiche plutôt qu'un bouton sur chaque ligne.
  function rafraichirEffectif() {
    const effectif = saison.clubJoueur.effectif.slice().sort((a, b) => a.poste.localeCompare(b.poste) || (b.vitesse + b.plaquage) - (a.vitesse + a.plaquage));
    const lignes = effectif.map((j) => {
      const blessure = j.blessureJournees > 0 ? `<span class="badgeBlessure">🤕 ${j.blessureJournees}j</span>` : '—';
      const contratClasse = j.contrat <= 1 ? ' class="badgeContratCourt"' : '';
      return `<tr data-joueur="${j.id}"><td>${j.nom}</td><td>${POSTE_COMPLET[j.poste] || j.poste}</td><td>${j.age}</td><td>${j.vitesse}</td><td>${j.plaquage}</td>` +
        `<td${contratClasse}>${j.contrat} an(s)</td><td>${j.salaire} k€</td><td>${blessure}</td></tr>`;
    }).join('');
    document.getElementById('clubEffectif').innerHTML =
      `<table class="tableauClub effectifCliquable"><thead><tr><th>Nom</th><th>Poste</th><th>Âge</th><th>Vit.</th><th>Plaq.</th><th>Contrat</th><th>Salaire</th><th>Forme</th></tr></thead><tbody>${lignes}</tbody></table>`;
  }

  // --- Aperçu (Home) : forme récente, statut de l'effectif — façon widgets
  // FM (cf. guide "Home Screen" : Squad Status, Team Stats, Finance). ---
  function rafraichirForme() {
    const joues = saison.calendrier.filter((f) => f.joue && concerneClubJoueur(f));
    const derniers = joues.slice(-5);
    const zone = document.getElementById('clubForme');
    if (derniers.length === 0) { zone.innerHTML = '<p>Aucun match joué pour le moment.</p>'; return; }
    const compte = { v: 0, n: 0, d: 0 };
    const badges = derniers.map((f) => {
      const forme = formeClubJoueur(f);
      compte[forme]++;
      return `<span class="badgeForme ${forme}">${LIBELLE_FORME[forme]}</span>`;
    }).join('');
    zone.innerHTML = `<div class="rangeeForme">${badges}<span class="resumeForme">${compte.v}V ${compte.n}N ${compte.d}D sur les ${derniers.length} derniers</span></div>`;
  }

  function rafraichirStatutEffectif() {
    const effectif = saison.clubJoueur.effectif;
    const blesses = effectif.filter((j) => j.blessureJournees > 0).length;
    const contratsCourts = effectif.filter((j) => j.contrat <= 1).length;
    document.getElementById('clubStatutEffectif').innerHTML = `<div class="grilleStatut">` +
      `<div class="ligneStatut"><span>Effectif</span><span class="valeurStatut">${effectif.length} joueurs</span></div>` +
      `<div class="ligneStatut"><span>Blessés</span><span class="valeurStatut${blesses > 0 ? ' alerte' : ''}">${blesses}</span></div>` +
      `<div class="ligneStatut"><span>Contrats expirant fin de saison</span><span class="valeurStatut${contratsCourts > 0 ? ' alerte' : ''}">${contratsCourts}</span></div>` +
      `<div class="ligneStatut"><span>Budget</span><span class="valeurStatut${saison.clubJoueur.budget < 0 ? ' critique' : ''}">${saison.clubJoueur.budget} k€</span></div></div>`;
  }

  // --- Finances : budget + journal des derniers mouvements (recette/salaires
  // de chaque journée jouée, cf. RMClub.enregistrerMouvementFinances). ---
  function rafraichirFinancesTab() {
    const c = saison.clubJoueur;
    document.getElementById('clubBudgetDetail').innerHTML =
      `<div class="ligneFinances"><span>Budget actuel</span><span class="budgetValeur${c.budget < 0 ? ' negatif' : ''}">${c.budget} k€</span></div>`;
    const hist = (c.historiqueFinances || []).slice().reverse();
    document.getElementById('clubHistoriqueFinances').innerHTML = hist.length
      ? hist.map((m) => `<div class="ligneMouvement"><span>J${m.journee}<span class="detailMouvement"> — recette +${m.recette} k€, salaires -${m.salaires} k€</span></span><span class="soldeMouvement">${m.budgetApres} k€</span></div>`).join('')
      : '<p>Aucun match joué pour le moment.</p>';
  }

  // --- Médical : vue filtrée de l'effectif (façon Medical Centre FM). ---
  function rafraichirMedical() {
    const blesses = saison.clubJoueur.effectif.filter((j) => j.blessureJournees > 0);
    document.getElementById('clubMedical').innerHTML = blesses.length
      ? blesses.map((j) => `<div class="ligneMedicale"><span><b>${j.nom}</b> — ${POSTE_COMPLET[j.poste] || j.poste}</span><span class="retourMedical">Retour dans ${j.blessureJournees} journée(s)</span></div>`).join('')
      : '<p>Aucun joueur blessé actuellement — effectif au complet.</p>';
  }

  // --- Statistiques : cumul RÉEL des actions produites en match cette saison
  // (cf. RMClub.accumulerStats) — jamais inventé, uniquement les matchs du
  // club du joueur, pas ceux simulés entre adversaires IA. ---
  function rafraichirStatsTab() {
    const s = saison.clubJoueur.statsCumulees;
    const zone = document.getElementById('clubStats');
    if (!s || !s.matchsJoues) { zone.innerHTML = '<p>Aucun match joué cette saison pour le moment.</p>'; return; }
    // Pas de "% de passes réussies" : `passes` inclut les offloads (comptés
    // sans "tentative" dédiée côté moteur, cf. engine/rugby-engine.js), donc
    // le ratio passe/tentées peut dépasser 100 % — un compte simple reste
    // honnête là où un pourcentage serait trompeur.
    const pctPlaquages = s.tacklesAttempted ? Math.round((s.tacklesMade / s.tacklesAttempted) * 100) : 0;
    zone.innerHTML = `<p style="margin-bottom:12px;">Sur ${s.matchsJoues} match(s) joué(s) cette saison :</p><div class="grilleStats">` +
      `<div class="caseStat"><span class="valeurCaseStat">${s.essais}</span><span class="labelCaseStat">Essais</span></div>` +
      `<div class="caseStat"><span class="valeurCaseStat">${s.passes}</span><span class="labelCaseStat">Passes réussies</span></div>` +
      `<div class="caseStat"><span class="valeurCaseStat">${Math.round(s.metresGagnes)}</span><span class="labelCaseStat">Mètres gagnés</span></div>` +
      `<div class="caseStat"><span class="valeurCaseStat">${pctPlaquages}%</span><span class="labelCaseStat">Plaquages réussis</span></div>` +
      `<div class="caseStat"><span class="valeurCaseStat">${s.turnovers}</span><span class="labelCaseStat">Turnovers gagnés</span></div>` +
      `<div class="caseStat"><span class="valeurCaseStat">${s.penalitesConcedees}</span><span class="labelCaseStat">Pénalités concédées</span></div>` +
      `<div class="caseStat"><span class="valeurCaseStat">${s.kicks}</span><span class="labelCaseStat">Coups de pied</span></div>` +
      `<div class="caseStat"><span class="valeurCaseStat">${(s.essais / s.matchsJoues).toFixed(1)}</span><span class="labelCaseStat">Essais / match</span></div></div>`;
  }

  // --- Fiche joueur : dépliée sur place dans l'onglet Effectif (#clubJoueurDetail),
  // en remplacement de la table le temps de la consultation — pas une fenêtre
  // empilée par-dessus l'onglet. ---
  function ouvrirFicheJoueur(id) {
    const j = saison.clubJoueur.effectif.find((x) => x.id === id);
    if (!j) return;
    joueurAffiche = id;
    const blessure = j.blessureJournees > 0 ? `${j.blessureJournees} journée(s) restantes` : 'Aucune';
    document.getElementById('clubJoueurDetail').innerHTML =
      `<div class="ficheJoueurEntete"><span><span class="nomJoueurFiche">${j.nom}</span><span class="posteJoueurFiche">${POSTE_COMPLET[j.poste] || j.poste} · ${j.age} ans</span></span></div>` +
      `<div class="ligneJoueur"><span>Vitesse</span><b>${j.vitesse}</b></div>` +
      `<div class="ligneJoueur"><span>Plaquage</span><b>${j.plaquage}</b></div>` +
      `<div class="ligneJoueur"><span>Contrat</span><b>${j.contrat} an(s) restant(s)</b></div>` +
      `<div class="ligneJoueur"><span>Salaire</span><b>${j.salaire} k€/saison</b></div>` +
      `<div class="ligneJoueur"><span>Blessure</span><b>${blessure}</b></div>` +
      `<div style="display:flex;gap:8px;margin-top:14px;">` +
      `<button class="alt" id="btnFermerFicheJoueur" style="flex:1;">← Retour à l'effectif</button>` +
      `<button class="alt warn" id="btnLibererFiche" style="flex:1;">Libérer ce joueur</button></div>`;
    document.getElementById('clubJoueurDetail').style.display = '';
    document.getElementById('clubEffectif').style.display = 'none';
  }

  function fermerFicheJoueur() {
    joueurAffiche = null;
    document.getElementById('clubJoueurDetail').style.display = 'none';
    document.getElementById('clubEffectif').style.display = '';
  }

  // --- Barre d'onglets : un seul volet visible à la fois (Aperçu par défaut
  // à l'ouverture, cf. rafraichirTout). ---
  function basculerOnglet(cle) {
    document.querySelectorAll('#barreOngletsClub .ongletBtn').forEach((b) => {
      b.classList.toggle('actif', b.dataset.onglet === cle);
    });
    document.querySelectorAll('#clubGestion .voletOnglet').forEach((v) => {
      v.style.display = v.dataset.volet === cle ? '' : 'none';
    });
    fermerFicheJoueur(); // change d'onglet = referme toute fiche laissée ouverte
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

  // Rapport de scout, pas fiche technique parfaite : tant qu'un joueur du
  // marché n'est pas assez CONNU (cf. RMClub.scouterJoueur), on affiche une
  // estimation en étoiles plutôt que ses vraies statistiques — un manager ne
  // sait jamais tout d'un joueur qu'il n'a jamais vraiment observé.
  function rafraichirMarche() {
    const c = saison.clubJoueur;
    document.getElementById('transfertsBudget').innerHTML =
      `<div class="ligneFinances"><span>Budget disponible</span><span class="budgetValeur${c.budget < 0 ? ' negatif' : ''}">${c.budget} k€</span></div>`;
    document.getElementById('clubMarche').innerHTML = saison.marche.map((j) => {
      const abordable = c.budget >= j.prixTransfert;
      const stats = RMClub.statsApparentes(j);
      const etoiles = '★'.repeat(RMClub.estimationEtoiles(j)) + '☆'.repeat(5 - RMClub.estimationEtoiles(j));
      const ligneStats = stats.complet
        ? `Vit.${stats.vitesse}/Plaq.${stats.plaquage}`
        : `${etoiles} <span title="Rapport de scout incomplet, chiffres approximatifs">(estimation)</span>`;
      const boutonScout = stats.complet
        ? ''
        : `<button class="alt btnScouter" data-joueur="${j.id}"${c.budget >= RMClub.COUT_SCOUTING ? '' : ' disabled'}>🔍 Scouter (${RMClub.COUT_SCOUTING} k€)</button>`;
      return `<div class="ligneMarche"><span class="infosJoueur"><b>${j.nom}</b><span>${POSTE_COMPLET[j.poste] || j.poste} · ${j.age} ans · ${ligneStats}</span></span>` +
        `<span class="actionMarche"><span class="prixMarche">${j.prixTransfert} k€</span>${boutonScout}` +
        `<button class="accent btnSigner" data-joueur="${j.id}"${abordable ? '' : ' disabled'}>Signer</button></span></div>`;
    }).join('') || '<p>Aucun joueur libre pour le moment.</p>';
  }

  // Carte "Continuer ma saison" sur la page d'accueil (cf. index.html) :
  // l'accueil doit refléter ce que le joueur fait réellement — s'il a déjà
  // une saison de club en cours, ce n'est plus "Match rapide" qui devrait
  // primer à chaque visite, mais la reprise de sa carrière.
  function rafraichirCarteAccueil() {
    const carte = document.getElementById('carteContinuerClub');
    if (!carte) return;
    if (!saison) { carte.style.display = 'none'; return; }
    const prochaine = RMClub.prochainesFixtures(saison);
    const statut = prochaine.length ? `Journée ${prochaine[0].journee} à jouer` : 'Saison terminée — prête à être avancée';
    document.getElementById('continuerClubInfos').innerHTML =
      `<span class="nomClubAccueil">${saison.clubJoueur.nom}</span>` +
      `<span class="detailClubAccueil">Saison ${saison.numero || 1} · 💰 ${saison.clubJoueur.budget} k€ · ${statut}</span>`;
    carte.style.display = 'block';
  }

  function rafraichirTout() {
    rafraichirCarteAccueil();
    const enCreation = !saison;
    document.getElementById('clubCreation').style.display = enCreation ? 'block' : 'none';
    document.getElementById('clubGestion').style.display = enCreation ? 'none' : 'block';
    if (enCreation) return;
    rafraichirEntete();
    rafraichirProchainMatch();
    rafraichirForme();
    rafraichirStatutEffectif();
    rafraichirTactique();
    rafraichirMarche();
    rafraichirClassement();
    rafraichirEffectif();
    rafraichirCalendrier();
    rafraichirFinancesTab();
    rafraichirMedical();
    rafraichirStatsTab();
    basculerOnglet('apercu'); // toujours l'Aperçu en entrant dans le club, comme un vrai écran d'accueil
  }

  document.getElementById('btnModeClub').addEventListener('click', () => {
    rafraichirTout();
    document.getElementById('panneauClub').classList.add('visible');
  });
  document.getElementById('btnContinuerClub').addEventListener('click', () => {
    document.getElementById('btnModeClub').click();
  });
  document.getElementById('barreOngletsClub').addEventListener('click', (e) => {
    const bouton = e.target.closest('.ongletBtn');
    if (!bouton) return;
    basculerOnglet(bouton.dataset.onglet);
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

  // --- Composition du jour : dépliée/repliée sur place dans l'onglet Aperçu
  // (#blocComposition), plus un panneau à part empilé par-dessus. ---
  document.getElementById('btnComposition').addEventListener('click', () => {
    const bloc = document.getElementById('blocComposition');
    const ouvrir = bloc.style.display === 'none';
    if (ouvrir) rafraichirComposition();
    bloc.style.display = ouvrir ? '' : 'none';
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
    const bouton = e.target.closest('[data-axe]');
    if (!bouton) return;
    if (!saison.clubJoueur.tactique || typeof saison.clubJoueur.tactique !== 'object') saison.clubJoueur.tactique = {};
    saison.clubJoueur.tactique[bouton.dataset.axe] = bouton.dataset.valeur;
    RMClub.sauvegarderSaison(saison);
    rafraichirTactique();
  });

  // --- Marché des transferts (onglet Transferts, plus une fenêtre à part) ---
  document.getElementById('btnRafraichirMarche').addEventListener('click', () => {
    const rng = creerRng(graineAleatoire());
    saison.marche = RMClub.genererMarcheTransferts(rng, saison.clubJoueur.niveauClub, 6);
    RMClub.sauvegarderSaison(saison);
    rafraichirMarche();
  });
  document.getElementById('clubMarche').addEventListener('click', (e) => {
    const id = e.target.dataset.joueur;
    if (!id) return;
    if (e.target.classList.contains('btnScouter')) {
      const res = RMClub.scouterJoueur(saison, id);
      if (!res.ok) { window.alert('Budget insuffisant pour financer ce repérage.'); return; }
      RMClub.sauvegarderSaison(saison);
      rafraichirMarche();
      rafraichirEntete();
      rafraichirStatutEffectif();
      return;
    }
    if (!e.target.classList.contains('btnSigner')) return;
    const res = RMClub.signerJoueur(saison, id);
    if (!res.ok) { window.alert('Budget insuffisant pour cette signature.'); return; }
    compositionActuelle = null; // nouveau joueur potentiellement meilleur : ré-évalue la composition
    RMClub.sauvegarderSaison(saison);
    rafraichirMarche();
    rafraichirEffectif();
    rafraichirEntete();
    rafraichirStatutEffectif();
  });

  // --- Effectif : chaque ligne ouvre la fiche joueur sur place ---
  document.getElementById('clubEffectif').addEventListener('click', (e) => {
    const ligne = e.target.closest('tr[data-joueur]');
    if (!ligne) return;
    ouvrirFicheJoueur(ligne.dataset.joueur);
  });
  // Fiche joueur : boutons régénérés à chaque ouverture (cf. ouvrirFicheJoueur),
  // délégation sur le conteneur parent plutôt qu'un addEventListener par joueur.
  document.getElementById('clubJoueurDetail').addEventListener('click', (e) => {
    if (e.target.id === 'btnFermerFicheJoueur') { fermerFicheJoueur(); return; }
    if (e.target.id !== 'btnLibererFiche') return;
    if (!joueurAffiche) return;
    const joueur = saison.clubJoueur.effectif.find((j) => j.id === joueurAffiche);
    if (!joueur || !window.confirm(`Libérer ${joueur.nom} ? Il quittera définitivement l'effectif.`)) return;
    const res = RMClub.libererJoueur(saison, joueurAffiche);
    if (!res.ok) { window.alert("Impossible : c'est le dernier joueur de ce poste dans l'effectif."); return; }
    compositionActuelle = null;
    RMClub.sauvegarderSaison(saison);
    fermerFicheJoueur();
    rafraichirEffectif();
    rafraichirStatutEffectif();
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
      const cfgTactique = RMClub.tactiqueVersConfig(saison.clubJoueur.tactique);
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
            const mouvement = RMClub.appliquerFinancesMatch(saison.clubJoueur, forme);
            RMClub.enregistrerMouvementFinances(saison.clubJoueur, matchJoueur.journee, mouvement);
            RMClub.accumulerStats(saison.clubJoueur, etat.stats[lettreJoueur]);
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
