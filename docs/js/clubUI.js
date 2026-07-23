// Mode Club : rendu de l'application (dashboard/effectif/composition/tactique/
// transferts/calendrier/finances/médical/bilan) et connexion au modèle de
// données (docs/js/club.js) et au lanceur de match (window.RMMain, cf.
// docs/js/main.js). Aucune règle de jeu ici, uniquement affichage/DOM — même
// séparation que ui.js pour le Match rapide.
(function () {
  'use strict';

  const RMClub = window.RMClub;
  const { creerRng } = window.RugbyEngine;

  let saison = RMClub.chargerSaison();
  // Joueur actuellement affiché dans la fiche (#clubJoueurDetail, dépliée sur
  // place dans l'onglet Effectif) — sert au bouton "Libérer ce joueur", qui
  // vit dans l'innerHTML régénéré et est géré par délégation d'événements.
  let joueurAffiche = null;
  // Club adverse actuellement affiché en détail (onglet Autres clubs) — null
  // tant qu'on est sur la liste. Indépendant de joueurAffiche (fiche joueur
  // de SON club) : une fiche joueur adverse se consulte à l'intérieur de ce
  // même onglet, sur un joueur repéré par son INDEX dans l'effectif adverse
  // (pas d'id stable requis pour un effectif IA non géré au jour le jour).
  let clubAdversaireAffiche = null;
  // État des filtres/tri de l'effectif (recherche/poste/disponibilité/tri de
  // colonne) : tenu en mémoire, réappliqué à chaque rendu (pas persisté —
  // ce sont des préférences d'affichage, pas des données de la saison).
  const filtreEffectif = { recherche: '', poste: '', disponible: false, triChamp: 'poste', triSens: 1 };

  function graineAleatoire() {
    return Math.floor(window.RMRng.random() * 0xffffffff);
  }

  // Confirmation visuelle brève après une action (entraînement, transfert,
  // tactique, composition...) — sans ça, une action réussie n'a aucun retour
  // visible en dehors du re-rendu de sa propre carte (facile à manquer si on
  // a déjà l'œil ailleurs). Se referme seule, n'importe combien peuvent
  // s'empiler. `type` : 'succes' (défaut) ou 'erreur'.
  function toast(message, type) {
    const conteneur = document.getElementById('toastContainer');
    if (!conteneur) return;
    const el = document.createElement('div');
    el.className = `toast ${type || 'succes'}`;
    el.textContent = message;
    conteneur.appendChild(el);
    requestAnimationFrame(() => el.classList.add('visible'));
    setTimeout(() => {
      el.classList.remove('visible');
      setTimeout(() => el.remove(), 250);
    }, 2600);
  }

  // Sauvegarde + toast d'échec UNE SEULE FOIS par session si le stockage est
  // indisponible (navigation privée, quota dépassé) — sinon la progression se
  // perd silencieusement sans que le joueur ne comprenne pourquoi à la
  // prochaine visite (cf. RMClub.sauvegarderSaison, qui renvoie maintenant
  // un booléen plutôt que d'avaler l'erreur).
  let alerteSauvegardeAffichee = false;
  function sauvegarder() {
    const ok = RMClub.sauvegarderSaison(saison);
    if (!ok && !alerteSauvegardeAffichee) {
      alerteSauvegardeAffichee = true;
      toast('⚠️ Sauvegarde impossible (stockage indisponible) — la progression restera en mémoire pour cette session.', 'erreur');
    }
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

  // Garantit une composition (titulaires + banc + encadrement) toujours
  // complète et valide, sans écraser les choix déjà faits par le joueur :
  // comble seulement les trous (joueur libéré, jamais choisi, etc.) — cf.
  // RMClub.completerComposition/completerCompositionBanc/autoDesignerEncadrement.
  // Appelée à l'ouverture de l'écran Composition ET juste avant de lancer un
  // match, pour ne jamais transmettre une composition invalide au moteur.
  function assurerComposition() {
    const c = saison.clubJoueur;
    c.compositionTitulaires = RMClub.completerComposition(c.effectif, c.compositionTitulaires);
    c.compositionBanc = RMClub.completerCompositionBanc(c.effectif, c.compositionTitulaires, c.compositionBanc);
    const titulaireIds = new Set(Object.values(c.compositionTitulaires));
    const auto = RMClub.autoDesignerEncadrement(c.effectif, c.compositionTitulaires);
    if (!c.capitaineId || !titulaireIds.has(c.capitaineId)) c.capitaineId = auto.capitaineId;
    if (!c.buteurId || !titulaireIds.has(c.buteurId)) c.buteurId = auto.buteurId;
    if (!c.lanceurToucheId || !titulaireIds.has(c.lanceurToucheId)) c.lanceurToucheId = auto.lanceurToucheId;
    return c.compositionTitulaires;
  }

  // Config moteur pour un club donné : composition du jour (persistée dans la
  // saison) pour le club du joueur, effectif direct (15, un par numéro) pour
  // un adversaire IA — cf. docs/js/club.js.
  function cfgPour(c) {
    if (c.id === saison.clubJoueur.id) {
      assurerComposition();
      return RMClub.compositionVersJoueursCfg(c.effectif, c.compositionTitulaires);
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

  // 6 axes INDÉPENDANTS qui se combinent (cf. RMClub.AXES_TACTIQUE) — pas un
  // choix unique parmi des templates figés : le joueur compose sa tactique
  // comme les instructions d'équipe d'un vrai jeu de gestion. La boucle
  // s'adapte automatiquement au nombre d'axes définis côté modèle.
  function rafraichirTactique() {
    if (!saison.clubJoueur.tactique || typeof saison.clubJoueur.tactique !== 'object') {
      const defauts = {};
      for (const axe of Object.keys(RMClub.AXES_TACTIQUE)) defauts[axe] = RMClub.AXES_TACTIQUE[axe].defaut;
      saison.clubJoueur.tactique = defauts;
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
      const optionActuelle = infosAxe.options[valeurActuelle];
      const compromisActuel = optionActuelle && optionActuelle.compromis
        ? `<p class="effetTactique">⚖️ ${optionActuelle.compromis}</p>` : '';
      return `<h4 class="titreAxeTactique">${infosAxe.label}</h4>${boutons}${compromisActuel}`;
    }).join('');
  }

  // --- Entraînement : un programme choisi (cf. RMClub.ENTRAINEMENTS) nudge
  // RÉELLEMENT les attributs concernés à chaque journée jouée (cf.
  // RMClub.appliquerEntrainement, appelé depuis onResultat) — même mécanique
  // de sélection que la tactique (boutons ligneTactique). ---
  function rafraichirEntrainement() {
    const actuel = saison.clubJoueur.entrainementFocus || 'physique';
    document.getElementById('clubEntrainement').innerHTML = Object.keys(RMClub.ENTRAINEMENTS).map((cle) => {
      const p = RMClub.ENTRAINEMENTS[cle];
      const choisi = cle === actuel ? ' choisie' : '';
      const postes = p.postes ? p.postes.map((x) => POSTE_COMPLET[x] || x).join(', ') : 'Tout l\'effectif';
      return `<button class="ligneTactique${choisi}" data-focus="${cle}"><b>${p.label}</b><span>${p.description}</span><span style="display:block;margin-top:4px;color:var(--text-faint);font-size:11px;">Concerne : ${postes}</span></button>`;
    }).join('');
  }

  // Développement des jeunes : joueurs encore loin de leur potentiel (marge
  // réelle > 8 points), triés par marge décroissante — priorité visible du
  // programme d'entraînement en cours.
  function rafraichirJeunes() {
    const effectif = saison.clubJoueur.effectif;
    const jeunes = effectif
      .filter((j) => j.age <= 24 && j.potentiel != null)
      .map((j) => ({ j, niveau: Math.round((j.vitesse + j.plaquage) / 2), marge: (j.potentiel || 0) - Math.round((j.vitesse + j.plaquage) / 2) }))
      .filter((x) => x.marge > 3)
      .sort((a, b) => b.marge - a.marge)
      .slice(0, 10);
    document.getElementById('clubJeunes').innerHTML = jeunes.length
      ? jeunes.map(({ j, niveau }) => `<div class="ligneJeune"><span class="infosJeune"><b>${j.nom}</b><span>${POSTE_COMPLET[j.poste] || j.poste} · ${j.age} ans</span></span>` +
        `<span>Niveau ${niveau} <span class="jaugePotentiel"><span style="width:${Math.min(100, niveau)}%"></span></span> Potentiel ${Math.round(j.potentiel)}</span></div>`).join('')
      : '<p>Aucun jeune joueur avec une marge de progression notable actuellement.</p>';
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
      `<span class="nomClub">${c.nom}</span></div>`;
  }

  // Barre supérieure persistante (cf. index.html #clubTopBarInfos) : saison,
  // prochain match, position au classement, budget — visibles quel que soit
  // l'onglet actif, sans avoir à retourner au Dashboard pour les consulter.
  function rafraichirTopBarInfos() {
    const c = saison.clubJoueur;
    const classement = RMClub.classementTrie(saison);
    const position = classement.findIndex((r) => r.clubId === c.id) + 1;
    const prochaine = RMClub.prochainesFixtures(saison);
    const matchJoueur = prochaine.find(concerneClubJoueur);
    let texteMatch = 'Saison terminée';
    if (matchJoueur) {
      const domicileEstJoueur = estClubJoueur(matchJoueur.domicileId);
      const adversaireId = domicileEstJoueur ? matchJoueur.exterieurId : matchJoueur.domicileId;
      texteMatch = `J${matchJoueur.journee} ${domicileEstJoueur ? 'vs' : '@'} ${nomClub(adversaireId)}`;
    }
    document.getElementById('clubTopBarInfos').innerHTML =
      `<span class="chipInfo">📅 Saison <b>${saison.numero || 1}</b></span>` +
      `<span class="chipInfo">🏉 <b>${texteMatch}</b></span>` +
      `<span class="chipInfo">🏆 <b>${position}${position === 1 ? 'er' : 'e'}</b>/${classement.length}</span>` +
      `<span class="chipInfo${c.budget < 0 ? ' alerte' : ''}">💰 <b>${c.budget} k€</b></span>`;
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
    const labelFlottant = document.getElementById('btnApercuMatchLabel');
    if (fixtures.length === 0) {
      zone.innerHTML = '<p>Saison terminée — toutes les journées ont été jouées.</p>';
      bouton.style.display = 'none';
      boutonComposition.style.display = 'none';
      boutonSaisonSuivante.style.display = '';
      if (labelFlottant) labelFlottant.textContent = 'Saison suivante';
      return;
    }
    bouton.style.display = '';
    boutonComposition.style.display = '';
    boutonSaisonSuivante.style.display = 'none';
    zone.innerHTML = fixtures.map(formaterLigneCalendrier).join('');
    bouton.disabled = false;
    const matchJoueur = fixtures.find(concerneClubJoueur);
    if (labelFlottant) labelFlottant.textContent = matchJoueur ? `Journée ${matchJoueur.journee}` : 'Prochaine journée';
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

  function rafraichirMiniClassement() {
    const classement = RMClub.classementTrie(saison);
    document.getElementById('clubMiniClassement').innerHTML = classement.map((r, i) => {
      const classe = estClubJoueur(r.clubId) ? ' ligneClubJoueur' : '';
      return `<div class="miniClassementLigne${classe}"><span>${i + 1}. ${nomClub(r.clubId)}</span><span>${r.j}J · <b>${r.pts}</b> pts</span></div>`;
    }).join('');
  }

  // Abréviations de poste (cf. moteur, PROFILS[n].label) traduites en toutes
  // lettres pour l'effectif : "P"/"T" n'est parlant que pour qui connaît déjà
  // la numérotation du rugby à XV, or le Mode Club vise aussi les néophytes.
  const POSTE_COMPLET = {
    P: 'Pilier', T: 'Talonneur', '2L': 'Deuxième ligne', '3L': 'Troisième ligne',
    DM: 'Demi de mêlée', OV: 'Ouverture', AI: 'Ailier', CE: 'Centre', AR: 'Arrière',
  };

  // Badges de rôle (capitaine/buteur/lanceur en touche) affichés à la fois
  // dans le tableau de l'effectif et dans la fiche joueur — la même info,
  // jamais recalculée différemment à deux endroits.
  function badgesRole(id) {
    const c = saison.clubJoueur;
    let out = '';
    if (c.capitaineId === id) out += '<span class="badgeRole capitaine" title="Capitaine">C</span>';
    if (c.buteurId === id) out += '<span class="badgeRole buteur" title="Buteur désigné">BUT</span>';
    if (c.lanceurToucheId === id) out += '<span class="badgeRole lanceur" title="Lanceur en touche">TOU</span>';
    return out;
  }

  function valeurTri(j, champ) {
    if (champ === 'nom') return j.nom;
    return j[champ] || 0;
  }

  // Comparaison de joueurs de l'EFFECTIF (distincte de celle du marché, cf.
  // selectionComparaison) — sélection par cases à cocher dans le tableau.
  const selectionComparaisonEffectif = new Set();

  // Effectif ÉTENDU du club du joueur (24 avec profondeur, contrats, salaires,
  // blessures, fatigue, moral) — recherche/tri/filtres (cf. filtreEffectif),
  // bien plus détaillé que celui, purement sportif, des adversaires IA,
  // puisque c'est le seul club réellement géré ici. Chaque ligne ouvre la
  // fiche joueur (cf. ouvrirFicheJoueur) : table dense, actions (libérer)
  // déportées dans la fiche plutôt qu'un bouton sur chaque ligne.
  function rafraichirEffectif() {
    const f = filtreEffectif;
    let effectif = saison.clubJoueur.effectif.filter((j) => {
      if (f.recherche && !j.nom.toLowerCase().includes(f.recherche)) return false;
      if (f.poste && j.poste !== f.poste) return false;
      if (f.disponible && (j.blessureJournees > 0 || j.pret)) return false;
      return true;
    });
    effectif.sort((a, b) => {
      const va = valeurTri(a, f.triChamp), vb = valeurTri(b, f.triChamp);
      let cmp = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
      if (cmp === 0) cmp = (b.vitesse + b.plaquage) - (a.vitesse + a.plaquage);
      return cmp * f.triSens;
    });
    const colonnes = [
      ['nom', 'Nom'], ['poste', 'Poste'], ['age', 'Âge'], ['vitesse', 'Vit.'], ['plaquage', 'Plaq.'],
      ['potentiel', 'Potentiel'], ['moral', 'Moral'], ['fatigue', 'Fatigue'], ['contrat', 'Contrat'], ['salaire', 'Salaire'],
    ];
    const entetes = '<th></th>' + colonnes.map(([champ, label]) => {
      const fleche = f.triChamp === champ ? (f.triSens === 1 ? '▲' : '▼') : '';
      return `<th class="triable" data-champ="${champ}">${label}<span class="flecheTri">${fleche}</span></th>`;
    }).join('') + '<th>Statut</th>';
    const lignes = effectif.map((j) => {
      const statut = j.pret ? `<span class="badgePret">📤 Prêté (${j.pret.dureeRestante}j)</span>`
        : j.blessureJournees > 0 ? `<span class="badgeBlessure">🤕 ${j.blessureJournees}j</span>` : '—';
      const contratClasse = j.contrat <= 1 ? ' class="badgeContratCourt"' : '';
      const fatigue = j.fatigue || 0;
      const moral = j.moral != null ? j.moral : 65;
      const enComparaison = selectionComparaisonEffectif.has(j.id) ? ' checked' : '';
      return `<tr data-joueur="${j.id}"><td><input type="checkbox" class="caseComparerEffectif" data-joueur="${j.id}"${enComparaison}></td>` +
        `<td>${j.nom}${badgesRole(j.id)}</td><td>${POSTE_COMPLET[j.poste] || j.poste}</td><td>${j.age}</td><td>${j.vitesse}</td><td>${j.plaquage}</td>` +
        `<td>${j.potentiel != null ? Math.round(j.potentiel) : '—'}</td>` +
        `<td><span class="barreMoral${moral < 45 ? ' bas' : moral >= 80 ? ' haut' : ''}"><span style="width:${moral}%"></span></span></td>` +
        `<td><span class="barreFatigue${fatigue >= 65 ? ' haute' : ''}"><span style="width:${fatigue}%"></span></span></td>` +
        `<td${contratClasse}>${j.contrat} an(s)</td><td>${j.salaire} k€</td><td>${statut}</td></tr>`;
    }).join('');
    document.getElementById('clubEffectif').innerHTML = effectif.length
      ? `<table class="tableauClub effectifCliquable"><thead><tr>${entetes}</tr></thead><tbody>${lignes}</tbody></table>`
      : '<p>Aucun joueur ne correspond à ces filtres.</p>';
    rafraichirComparaisonEffectif();
  }

  // Comparaison côte à côte de joueurs de L'EFFECTIF sélectionnés (cases à
  // cocher) — données réelles (attributs/contrat/salaire), jamais fabriquées.
  function rafraichirComparaisonEffectif() {
    const bouton = document.getElementById('btnComparerEffectif');
    bouton.style.display = selectionComparaisonEffectif.size >= 2 ? '' : 'none';
    const zone = document.getElementById('clubComparaisonEffectif');
    if (selectionComparaisonEffectif.size < 2) { zone.innerHTML = ''; return; }
    const joueurs = [...selectionComparaisonEffectif]
      .map((id) => saison.clubJoueur.effectif.find((j) => j.id === id))
      .filter(Boolean);
    if (joueurs.length < 2) { zone.innerHTML = ''; return; }
    const CRITERES = [
      ['poste', 'Poste', (j) => POSTE_COMPLET[j.poste] || j.poste, false],
      ['age', 'Âge', (j) => j.age, false],
      ['vitesse', 'Vitesse', (j) => j.vitesse, true],
      ['plaquage', 'Plaquage', (j) => j.plaquage, true],
      ['potentiel', 'Potentiel', (j) => (j.potentiel != null ? Math.round(j.potentiel) : 0), true],
      ['moral', 'Moral', (j) => (j.moral != null ? j.moral : 65), true],
      ['fatigue', 'Fatigue', (j) => j.fatigue || 0, false],
      ['contrat', 'Contrat', (j) => `${j.contrat} an(s)`, false],
      ['salaire', 'Salaire', (j) => `${j.salaire} k€`, false],
    ];
    const entetes = joueurs.map((j) => `<th>${j.nom}</th>`).join('');
    const lignes = CRITERES.map(([cle, label, get, meilleurHaut]) => {
      const valeurs = joueurs.map((j) => get(j));
      const numeriques = valeurs.every((v) => typeof v === 'number');
      let meilleur = null;
      if (numeriques) meilleur = meilleurHaut ? Math.max(...valeurs) : Math.min(...valeurs);
      const cellules = valeurs.map((v) => `<td${numeriques && v === meilleur ? ' class="meilleur"' : ''}>${v}</td>`).join('');
      return `<tr><th>${label}</th>${cellules}</tr>`;
    }).join('');
    zone.innerHTML = `<h4 style="margin:14px 0 6px;font-size:12px;color:var(--text-faint);text-transform:uppercase;letter-spacing:0.05em;">Comparaison</h4>` +
      `<div style="overflow-x:auto;"><table class="tableComparaison"><thead><tr><th></th>${entetes}</tr></thead><tbody>${lignes}</tbody></table></div>`;
  }

  // --- Dashboard (Home) : 5 derniers résultats, classement, statut de
  // l'effectif, finances, alertes/décisions urgentes — façon écran d'accueil
  // FM, entièrement dérivé de données RÉELLEMENT produites par la simulation. ---
  function rafraichirDerniersResultats() {
    const joues = saison.calendrier.filter((f) => f.joue && concerneClubJoueur(f));
    const derniers = joues.slice(-5).reverse();
    const zone = document.getElementById('clubDerniersResultats');
    if (derniers.length === 0) { zone.innerHTML = '<p>Aucun match joué pour le moment.</p>'; return; }
    zone.innerHTML = derniers.map((f) => {
      const domicileEstJoueur = estClubJoueur(f.domicileId);
      const adversaireId = domicileEstJoueur ? f.exterieurId : f.domicileId;
      const scoreJoueur = domicileEstJoueur ? f.score.domicile : f.score.exterieur;
      const scoreAdv = domicileEstJoueur ? f.score.exterieur : f.score.domicile;
      const forme = formeClubJoueur(f);
      return `<div class="ligneResultatDash"><span class="badgeForme ${forme}">${LIBELLE_FORME[forme]}</span>` +
        `<span class="adversaireDash">${domicileEstJoueur ? 'vs' : '@'} ${nomClub(adversaireId)}</span>` +
        `<span class="scoreDash">${scoreJoueur} - ${scoreAdv}</span></div>`;
    }).join('');
  }

  // Analyse du prochain adversaire : moyennes d'attributs RÉELLES de son
  // effectif comparées aux tiennes (cf. RMClub.analyserAdversaire), plus sa
  // forme récente réelle — jamais une note fabriquée.
  function rafraichirAdversaire() {
    const carte = document.getElementById('carteAdversaire');
    const prochaine = RMClub.prochainesFixtures(saison);
    const matchJoueur = prochaine.find(concerneClubJoueur);
    if (!matchJoueur) { carte.style.display = 'none'; return; }
    const adversaireId = estClubJoueur(matchJoueur.domicileId) ? matchJoueur.exterieurId : matchJoueur.domicileId;
    // L'analyste vidéo (personnel) abaisse le seuil de détection : il repère
    // des écarts plus fins qu'un manager sans analyste (seuil par défaut 6).
    const facteurAnalyste = RMClub.effetPersonnel(saison, 'analyste');
    const seuilAnalyste = Math.max(2, Math.round(6 - (facteurAnalyste - 1) * 8));
    const analyse = RMClub.analyserAdversaire(saison, adversaireId, seuilAnalyste);
    if (!analyse) { carte.style.display = 'none'; return; }
    carte.style.display = '';
    const formeTxt = analyse.forme.length
      ? analyse.forme.map((f) => `<span class="badgeForme ${f}">${LIBELLE_FORME[f]}</span>`).join('')
      : '<span style="color:var(--text-faint);">Aucun match joué</span>';
    const lignesAttr = analyse.comparaison.map((c) => {
      const total = Math.max(c.moi, c.eux) + 15;
      const largeurEux = Math.min(100, (c.eux / total) * 100);
      const classeFaible = c.diff < 0 ? ' faible' : '';
      return `<div class="ligneAdversaireAttr"><span class="labelAdvAttr">${c.label}</span>` +
        `<span class="barreComparaison"><span class="${classeFaible.trim()}" style="width:${largeurEux}%"></span></span>` +
        `<span class="valAdv">${c.eux}</span></div>`;
    }).join('');
    const puces = [
      ...analyse.forces.map((c) => `<span class="puceQualitatif force">⚠️ ${c.label} (+${c.diff})</span>`),
      ...analyse.faiblesses.map((c) => `<span class="puceQualitatif faiblesse">✓ ${c.label} (${c.diff})</span>`),
    ].join('');
    document.getElementById('clubAdversaire').innerHTML =
      `<p style="margin:0 0 8px;font-weight:700;">${analyse.nom} <span style="font-weight:400;color:var(--text-dim);font-size:12px;">— ${analyse.position}${analyse.position === 1 ? 'er' : 'e'}/${analyse.totalClubs} au classement</span></p>` +
      `<p style="font-size:12px;color:var(--text-dim);margin:0 0 10px;">Forme récente : ${formeTxt}</p>` +
      lignesAttr +
      (puces ? `<div class="listeQualitatif">${puces}</div>` : '<p style="font-size:11.5px;color:var(--text-faint);margin:10px 0 0;">Aucun écart marqué avec ton effectif.</p>');
  }

  // --- Autres clubs (Mode Club) : consulter N'IMPORTE quel adversaire, pas
  // seulement le prochain — identité, effectif complet (fiche joueur en
  // lecture seule), classement/forme, tactique dérivée de ses attributs
  // réels, forces/faiblesses (cf. RMClub.analyserAdversaire) et historique
  // RÉEL des confrontations directes contre ce club. ---
  function deriverTactiqueAdversaire(effectif) {
    const moyenne = (attr) => effectif.reduce((s, j) => s + (j[attr] || 0), 0) / effectif.length;
    const jeuPied = moyenne('jeuPied'), passe = moyenne('passe'), puissance = moyenne('puissance'), vitesse = moyenne('vitesse');
    const traits = [];
    if (jeuPied >= 55) traits.push('Jeu au pied fréquent');
    if (passe >= 60 && vitesse >= 58) traits.push('Jeu de mouvement, ballon porté au large');
    if (puissance >= 60) traits.push('Domination recherchée en contact');
    if (!traits.length) traits.push('Jeu équilibré, sans trait dominant marqué');
    return traits.join(' · ');
  }

  function rafraichirAutresClubs() {
    const conteneur = document.getElementById('clubAutresClubsListe');
    if (!conteneur) return;
    const classement = RMClub.classementTrie(saison);
    const lignes = saison.adversaires.map((adv) => {
      const rang = classement.findIndex((r) => r.clubId === adv.id) + 1;
      const etoiles = Math.max(1, Math.min(5, Math.round(adv.niveauClub * 5)));
      return `<tr data-club="${adv.id}"><td><span class="pointCouleurClub" style="background:${adv.couleur}"></span>${adv.nom}</td>` +
        `<td>${'★'.repeat(etoiles)}${'☆'.repeat(5 - etoiles)}</td>` +
        `<td>${rang}${rang === 1 ? 'er' : 'e'}/${classement.length}</td>` +
        `<td>${adv.budget != null ? adv.budget + ' k€' : '—'}</td></tr>`;
    }).join('');
    conteneur.innerHTML = `<table class="tableauClub effectifCliquable"><thead><tr><th>Club</th><th>Réputation</th><th>Classement</th><th>Budget (estimé)</th></tr></thead><tbody>${lignes}</tbody></table>`;
  }

  function fermerFicheJoueurAdversaire() {
    const detail = document.getElementById('clubJoueurAdversaireDetail');
    if (detail) detail.style.display = 'none';
    const corps = document.getElementById('clubAutresClubCorps');
    if (corps) corps.style.display = '';
  }

  function fermerClubAdversaire() {
    clubAdversaireAffiche = null;
    const detail = document.getElementById('clubAutresClubDetail');
    if (detail) detail.style.display = 'none';
    const liste = document.getElementById('clubAutresClubsListe');
    if (liste) liste.style.display = '';
    fermerFicheJoueurAdversaire();
  }

  function ouvrirClubAdversaire(clubId) {
    const adv = RMClub.club(saison, clubId);
    if (!adv) return;
    clubAdversaireAffiche = clubId;
    document.getElementById('clubAutresClubsListe').style.display = 'none';
    document.getElementById('clubAutresClubDetail').style.display = '';
    const facteurAnalyste = RMClub.effetPersonnel(saison, 'analyste');
    const seuilAnalyste = Math.max(2, Math.round(6 - (facteurAnalyste - 1) * 8));
    const analyse = RMClub.analyserAdversaire(saison, clubId, seuilAnalyste);
    const formeTxt = analyse.forme.length
      ? analyse.forme.map((f) => `<span class="badgeForme ${f}">${LIBELLE_FORME[f]}</span>`).join('')
      : '<span style="color:var(--text-faint);">Aucun match joué</span>';
    const puces = [
      ...analyse.forces.map((c) => `<span class="puceQualitatif force">⚠️ ${c.label} (+${c.diff})</span>`),
      ...analyse.faiblesses.map((c) => `<span class="puceQualitatif faiblesse">✓ ${c.label} (${c.diff})</span>`),
    ].join('');
    const confrontations = analyse.confrontations.length
      ? analyse.confrontations.slice().reverse().map((c) =>
          `<div class="ligneCalendrier"><span>Saison ${c.saisonNumero}, J${c.journee}</span><span class="scoreCal"><span class="badgeForme ${c.resultat}">${LIBELLE_FORME[c.resultat]}</span> ${c.scorePour} - ${c.scoreContre}</span></div>`
        ).join('')
      : '<p style="font-size:12px;color:var(--text-faint);">Aucune confrontation directe pour le moment.</p>';
    const effectifLignes = adv.effectif.map((j, index) =>
      `<tr data-index="${index}"><td>${j.nom}</td><td>${POSTE_COMPLET[j.poste] || j.poste}</td><td>${j.age}</td>` +
      `<td>${j.vitesse}</td><td>${j.plaquage}</td><td>${j.potentiel != null ? Math.round(j.potentiel) : '—'}</td></tr>`
    ).join('');
    document.getElementById('clubAutresClubIdentite').innerHTML =
      `<div class="ficheJoueurEntete"><span><span class="nomJoueurFiche">${adv.nom}</span>` +
      `<span class="posteJoueurFiche">${analyse.position}${analyse.position === 1 ? 'er' : 'e'}/${analyse.totalClubs} au classement · Budget estimé ${adv.budget != null ? adv.budget + ' k€' : '—'}</span></span></div>` +
      `<p style="font-size:12px;color:var(--text-dim);margin:8px 0;">Forme récente : ${formeTxt}</p>` +
      `<p style="font-size:12px;color:var(--text-dim);margin:0 0 8px;">Tactique habituelle (déduite de l'effectif) : ${deriverTactiqueAdversaire(adv.effectif)}</p>`;
    document.getElementById('clubAutresClubAnalyse').innerHTML =
      analyse.comparaison.map((c) => {
        const total = Math.max(c.moi, c.eux) + 15;
        const largeurEux = Math.min(100, (c.eux / total) * 100);
        const classeFaible = c.diff < 0 ? ' faible' : '';
        return `<div class="ligneAdversaireAttr"><span class="labelAdvAttr">${c.label}</span>` +
          `<span class="barreComparaison"><span class="${classeFaible.trim()}" style="width:${largeurEux}%"></span></span>` +
          `<span class="valAdv">${c.eux}</span></div>`;
      }).join('') +
      (puces ? `<div class="listeQualitatif">${puces}</div>` : '<p style="font-size:11.5px;color:var(--text-faint);margin:10px 0 0;">Aucun écart marqué avec ton effectif.</p>');
    document.getElementById('clubAutresClubEffectif').innerHTML =
      `<table class="tableauClub effectifCliquable"><thead><tr><th>Nom</th><th>Poste</th><th>Âge</th><th>Vit.</th><th>Plaq.</th><th>Potentiel</th></tr></thead><tbody>${effectifLignes}</tbody></table>`;
    document.getElementById('clubAutresClubConfrontations').innerHTML = confrontations;
    fermerFicheJoueurAdversaire();
  }

  function ouvrirFicheJoueurAdversaire(clubId, index) {
    const adv = RMClub.club(saison, clubId);
    if (!adv) return;
    const j = adv.effectif[index];
    if (!j) return;
    const moral = j.moral != null ? j.moral : 65;
    const ATTRIBUTS_FICHE = [
      ['vitesse', 'Vitesse'], ['plaquage', 'Plaquage'], ['adresse', 'Adresse au pied'],
      ['melee', 'Mêlée'], ['touche', 'Touche'], ['puissance', 'Puissance'],
      ['endurance', 'Endurance'], ['passe', 'Passe'], ['jeuPied', 'Jeu au pied (courant)'],
      ['decision', 'Décision'], ['discipline', 'Discipline'],
    ];
    const lignesAttributs = ATTRIBUTS_FICHE.map(([champ, label]) =>
      j[champ] != null ? `<div class="ligneJoueur"><span>${label}</span><b>${j[champ]}</b></div>` : ''
    ).join('');
    document.getElementById('clubJoueurAdversaireDetail').innerHTML =
      `<div class="ficheJoueurEntete"><span><span class="nomJoueurFiche">${j.nom}</span>` +
      `<span class="posteJoueurFiche">${POSTE_COMPLET[j.poste] || j.poste} · ${j.age} ans · ${adv.nom}</span></span></div>` +
      lignesAttributs +
      (j.potentiel != null ? `<div class="ligneJoueur"><span>Potentiel estimé</span><b>${Math.round(j.potentiel)}</b></div>` : '') +
      (j.moral != null ? `<div class="ligneJoueur"><span>Moral</span><b><span class="barreMoral${moral < 45 ? ' bas' : moral >= 80 ? ' haut' : ''}"><span style="width:${moral}%"></span></span> ${moral}%</b></div>` : '') +
      (j.contrat != null ? `<div class="ligneJoueur"><span>Contrat</span><b>${j.contrat} an(s) restant(s) (estimation)</b></div>` : '') +
      (j.salaire != null ? `<div class="ligneJoueur"><span>Salaire</span><b>${j.salaire} k€/saison (estimation)</b></div>` : '') +
      (j.valeurEstimee != null ? `<div class="ligneJoueur"><span>Valeur de transfert estimée</span><b>${j.valeurEstimee} k€</b></div>` : '') +
      (j.blessureJournees > 0 ? `<div class="ligneJoueur"><span>Blessure</span><b>${j.blessureJournees} journée(s)</b></div>` : '') +
      `<button class="alt" id="btnFermerFicheJoueurAdversaire" style="width:100%;margin-top:14px;">← Retour à l'effectif du club</button>`;
    document.getElementById('clubJoueurAdversaireDetail').style.display = '';
    document.getElementById('clubAutresClubCorps').style.display = 'none';
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

  // Alertes/décisions urgentes : dérivées UNIQUEMENT de l'état réel du club
  // (jamais fabriquées) — blessures, fatigue, contrats, budget. Cliquer une
  // alerte ouvre directement l'onglet concerné.
  function genererAlertes() {
    const c = saison.clubJoueur;
    const alertes = [];
    const blesses = c.effectif.filter((j) => j.blessureJournees > 0).length;
    if (blesses > 0) alertes.push({ icone: '🤕', texte: `${blesses} joueur(s) blessé(s)`, onglet: 'medical' });
    const fatigues = c.effectif.filter((j) => (j.fatigue || 0) >= 70).length;
    if (fatigues > 0) alertes.push({ icone: '⚡', texte: `${fatigues} joueur(s) très fatigué(s) — pense à les laisser au repos`, onglet: 'composition' });
    const contratsCourts = c.effectif.filter((j) => j.contrat <= 1).length;
    if (contratsCourts > 0) alertes.push({ icone: '📄', texte: `${contratsCourts} contrat(s) expirant en fin de saison`, onglet: 'effectif' });
    if (c.budget < 0) alertes.push({ icone: '💸', texte: `Budget négatif (${c.budget} k€)`, onglet: 'finances' });
    return alertes;
  }

  function rafraichirAlertes() {
    const alertes = genererAlertes();
    const carte = document.getElementById('carteAlertes');
    if (alertes.length === 0) { carte.style.display = 'none'; return; }
    carte.style.display = '';
    document.getElementById('clubAlertes').innerHTML = alertes.map((a) =>
      `<div class="ligneAlerte" data-onglet="${a.onglet}"><span class="iconeAlerte">${a.icone}</span><span>${a.texte}</span></div>`
    ).join('');
  }

  // --- Boîte de réception (Mode Club) : messages RÉELS générés par les
  // événements déjà produits par la simulation (cf. RMClub.ajouterMessage,
  // appelé depuis club.js à chaque transfert/prêt/contrat/blessure/résultat/
  // saison) — jamais un texte fabriqué uniquement pour l'affichage. ---
  const ICONE_MESSAGE = { transfert: '🔁', blessure: '🤕', contrat: '📄', match: '🏉', saison: '🏆' };
  function rafraichirMessages() {
    const messages = saison.clubJoueur.messages || [];
    const nonLus = messages.filter((m) => !m.lu).length;
    const titre = document.querySelector('#carteMessages h3');
    if (titre) titre.textContent = `Boîte de réception${nonLus ? ` (${nonLus} non lu${nonLus > 1 ? 's' : ''})` : ''}`;
    // Décoratif sinon : rien à marquer comme lu tant que la boîte est vide.
    const boutonToutLu = document.getElementById('btnMessagesTousLus');
    if (boutonToutLu) boutonToutLu.style.display = nonLus > 0 ? '' : 'none';
    document.getElementById('clubMessages').innerHTML = messages.length
      ? messages.slice(0, 15).map((m) =>
          `<div class="ligneMessage${m.lu ? '' : ' nonLu'}" data-msg="${m.id}"><span class="iconeMessage">${ICONE_MESSAGE[m.categorie] || '📬'}</span>` +
          `<span class="corpsMessage"><b>${m.titre}</b><span>${m.corps}</span><span class="metaMessage">Saison ${m.saisonNumero}</span></span></div>`
        ).join('')
      : '<p style="font-size:12px;color:var(--text-faint);">Aucun message pour le moment.</p>';
  }

  // --- Finances : budget + journal des derniers mouvements (recette/salaires
  // de chaque journée jouée, cf. RMClub.enregistrerMouvementFinances). ---
  function rafraichirFinancesTab() {
    const c = saison.clubJoueur;
    document.getElementById('clubBudgetDetail').innerHTML =
      `<div class="ligneFinances"><span>Budget actuel</span><span class="budgetValeur${c.budget < 0 ? ' negatif' : ''}">${c.budget} k€</span></div>` +
      (c.sponsor ? `<div class="ligneStatut" style="margin-top:8px;"><span>Sponsor</span><span class="valeurStatut">${c.sponsor.nom} · +${c.sponsor.revenuParMatch} k€/match</span></div>` : '');
    const masseJoueurs = RMClub.masseSalariale(c.effectif);
    const massePersonnel = RMClub.masseSalarialePersonnel(c);
    document.getElementById('clubMasseSalariale').innerHTML =
      `<div class="ligneStatut"><span>Salaires joueurs (saison)</span><span class="valeurStatut">${masseJoueurs} k€</span></div>` +
      `<div class="ligneStatut"><span>Salaires personnel (saison)</span><span class="valeurStatut">${massePersonnel} k€</span></div>` +
      `<div class="ligneStatut"><span>Total / journée</span><span class="valeurStatut">${Math.round((masseJoueurs + massePersonnel) / 10)} k€</span></div>`;
    const prevision = RMClub.prevoirFinances(c, 5);
    const cartePrevisions = document.getElementById('cartePrevisions');
    if (prevision) {
      cartePrevisions.style.display = '';
      document.getElementById('clubPrevisions').innerHTML =
        `<div class="ligneStatut"><span>Solde net moyen / journée</span><span class="valeurStatut${prevision.soldeNetMoyen < 0 ? ' alerte' : ''}">${prevision.soldeNetMoyen >= 0 ? '+' : ''}${prevision.soldeNetMoyen} k€</span></div>` +
        `<div class="ligneStatut"><span>Budget projeté dans ${prevision.nJournees} journées</span><span class="valeurStatut${prevision.projection < 0 ? ' critique' : ''}">${prevision.projection} k€</span></div>`;
    } else {
      cartePrevisions.style.display = 'none';
    }
    const hist = (c.historiqueFinances || []).slice().reverse();
    document.getElementById('clubHistoriqueFinances').innerHTML = hist.length
      ? hist.map((m) => `<div class="ligneMouvement"><span>J${m.journee}<span class="detailMouvement"> — recette +${m.recette} k€${m.revenuSponsor ? ` (dont sponsor +${m.revenuSponsor} k€)` : ''}, salaires -${m.salaires}${m.salairesPersonnel ? ` -${m.salairesPersonnel} (personnel)` : ''} k€</span></span><span class="soldeMouvement">${m.budgetApres} k€</span></div>`).join('')
      : '<p>Aucun match joué pour le moment.</p>';
  }

  // --- Médical : vue filtrée de l'effectif (façon Medical Centre FM), plus
  // la charge de fatigue de l'effectif (réellement répercutée en match). ---
  function rafraichirMedical() {
    const blesses = saison.clubJoueur.effectif.filter((j) => j.blessureJournees > 0);
    document.getElementById('clubMedical').innerHTML = blesses.length
      ? blesses.map((j) => `<div class="ligneMedicale"><span><b>${j.nom}</b> — ${POSTE_COMPLET[j.poste] || j.poste}</span><span class="retourMedical">Retour dans ${j.blessureJournees} journée(s)</span></div>`).join('')
      : '<p>Aucun joueur blessé actuellement — effectif au complet.</p>';
  }

  function rafraichirFatigueTab() {
    const fatigues = saison.clubJoueur.effectif.filter((j) => (j.fatigue || 0) > 0).sort((a, b) => (b.fatigue || 0) - (a.fatigue || 0));
    document.getElementById('clubFatigue').innerHTML = fatigues.length
      ? fatigues.map((j) => `<div class="ligneMedicale"><span><b>${j.nom}</b> — ${POSTE_COMPLET[j.poste] || j.poste}</span>` +
        `<span class="barreFatigue${(j.fatigue || 0) >= 65 ? ' haute' : ''}"><span style="width:${j.fatigue}%"></span></span></div>`).join('')
      : '<p>Aucune fatigue notable dans l\'effectif actuellement.</p>';
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

  // Classement des marqueurs de la saison en cours — trié directement depuis
  // statsSaison (cf. RMClub.classementMarqueurs), jamais une liste inventée.
  function rafraichirMarqueurs() {
    const top = RMClub.classementMarqueurs(saison.clubJoueur.effectif, 8);
    const carte = document.getElementById('carteMarqueurs');
    if (top.length === 0) { carte.style.display = 'none'; return; }
    carte.style.display = '';
    document.getElementById('clubMarqueurs').innerHTML = top.map((j, i) =>
      `<div class="ligneMarqueur"><span class="rangMarqueur">${i + 1}</span>` +
      `<span class="nomMarqueur">${j.nom} <span style="color:var(--text-faint);font-size:11px;">${POSTE_COMPLET[j.poste] || j.poste}</span></span>` +
      `<span class="totalMarqueur">${j.statsSaison.essais} essai(s)</span></div>`
    ).join('');
  }

  // Évolution sur plusieurs saisons — archivée RÉELLEMENT à chaque
  // avancerSaison (cf. RMClub.historiqueSaisons), jamais recalculée après coup.
  function rafraichirHistoriqueSaisons() {
    const hist = saison.clubJoueur.historiqueSaisons || [];
    const carte = document.getElementById('carteHistoriqueSaisons');
    if (hist.length === 0) { carte.style.display = 'none'; return; }
    carte.style.display = '';
    const lignes = hist.slice().reverse().map((h) =>
      `<tr><td>Saison ${h.numero}</td><td>${h.position}${h.position === 1 ? 'er' : 'e'}/${h.totalClubs}</td>` +
      `<td>${h.victoires}V ${h.nuls}N ${h.defaites}D</td><td>${h.essais}</td><td>${h.budget} k€</td></tr>`
    ).join('');
    document.getElementById('clubHistoriqueSaisons').innerHTML =
      `<table class="tableauClub"><thead><tr><th>Saison</th><th>Classement</th><th>Bilan</th><th>Essais</th><th>Budget fin</th></tr></thead><tbody>${lignes}</tbody></table>`;
  }

  // --- Fiche joueur : dépliée sur place dans l'onglet Effectif (#clubJoueurDetail),
  // en remplacement de la table le temps de la consultation — pas une fenêtre
  // empilée par-dessus l'onglet. Attributs rugby, forme/fatigue, historique
  // (matchs joués cette saison), contrat, disponibilité et rôle du jour. ---
  function ouvrirFicheJoueur(id) {
    const j = saison.clubJoueur.effectif.find((x) => x.id === id);
    if (!j) return;
    joueurAffiche = id;
    const c = saison.clubJoueur;
    const disponibilite = j.pret ? `En prêt — retour dans ${j.pret.dureeRestante} journée(s)`
      : j.blessureJournees > 0 ? `Blessé — ${j.blessureJournees} journée(s) restantes` : 'Disponible';
    const titulaire = c.compositionTitulaires && Object.values(c.compositionTitulaires).includes(id);
    const banc = c.compositionBanc && Object.values(c.compositionBanc).includes(id);
    const statutCompo = titulaire ? 'Titulaire ce jour' : banc ? 'Remplaçant ce jour' : 'Non retenu ce jour';
    const fatigue = j.fatigue || 0;
    const moral = j.moral != null ? j.moral : 65;
    const s = j.statsSaison;
    const ATTRIBUTS_FICHE = [
      ['vitesse', 'Vitesse'], ['plaquage', 'Plaquage'], ['adresse', 'Adresse au pied'],
      ['melee', 'Mêlée'], ['touche', 'Touche'], ['puissance', 'Puissance'],
      ['endurance', 'Endurance'], ['passe', 'Passe'], ['jeuPied', 'Jeu au pied (courant)'],
      ['decision', 'Décision'], ['discipline', 'Discipline'],
    ];
    const lignesAttributs = ATTRIBUTS_FICHE.map(([champ, label]) =>
      j[champ] != null ? `<div class="ligneJoueur"><span>${label}</span><b>${j[champ]}</b></div>` : ''
    ).join('');
    const lignePotentiel = j.potentiel != null
      ? `<div class="ligneJoueur"><span>Potentiel</span><b>${Math.round(j.potentiel)} <span class="jaugePotentiel"><span style="width:${Math.round((j.vitesse + j.plaquage) / 2)}%"></span></span></b></div>` : '';
    // Progression RÉELLE depuis le début de la saison (cf. RMClub.calculerProgression) —
    // vide si rien n'a bougé ou si aucun instantané n'existe (ancienne sauvegarde).
    const ATTR_LABEL_COURT = { vitesse: 'Vitesse', plaquage: 'Plaquage', melee: 'Mêlée', touche: 'Touche', puissance: 'Puissance', endurance: 'Endurance', passe: 'Passe', jeuPied: 'Jeu au pied', decision: 'Décision' };
    const progression = RMClub.calculerProgression(j);
    const ligneProgression = progression.length
      ? `<div class="ligneJoueur"><span>Progression cette saison</span><b></b></div>` +
        progression.map((p) => `<div class="ligneProgression"><span>${ATTR_LABEL_COURT[p.attr] || p.attr}</span><span class="${p.delta > 0 ? 'deltaPositif' : 'deltaNegatif'}">${p.delta > 0 ? '+' : ''}${p.delta} (${p.avant}→${p.apres})</span></div>`).join('')
      : '';
    const ligneStatsSaison = s
      ? `<div class="ligneJoueur"><span>Cette saison</span><b>${s.essais} essai(s) · ${s.passes} passe(s) · ${s.tacklesMade}/${s.tacklesAttempted} plaquages</b></div>`
      : '';
    const offre = RMClub.calculerOffreRenouvellement(j);
    const boutonRenouveler = j.contrat <= 1
      ? `<button class="accent" id="btnRenouveler" style="width:100%;margin-top:8px;">Renouveler ${offre.dureeMax} an(s) · ${offre.salaire} k€/saison</button>`
      : '';
    const boutonPret = j.pret
      ? `<button class="alt" id="btnRappelerJoueur" style="width:100%;margin-top:8px;">Rappeler de prêt</button>`
      : `<button class="alt" id="btnPreterJoueur" style="width:100%;margin-top:8px;">Prêter ce joueur (3 journées)</button>`;
    const optionsEntrainement = Object.keys(RMClub.ENTRAINEMENTS).map((cle) =>
      `<option value="${cle}"${j.entrainementIndividuel === cle ? ' selected' : ''}>${RMClub.ENTRAINEMENTS[cle].label}</option>`
    ).join('');
    document.getElementById('clubJoueurDetail').innerHTML =
      `<div class="ficheJoueurEntete"><span><span class="nomJoueurFiche">${j.nom}${badgesRole(id)}</span><span class="posteJoueurFiche">${POSTE_COMPLET[j.poste] || j.poste} · ${j.age} ans</span></span></div>` +
      lignesAttributs + lignePotentiel +
      `<div class="ligneJoueur"><span>Moral</span><b><span class="barreMoral${moral < 45 ? ' bas' : moral >= 80 ? ' haut' : ''}"><span style="width:${moral}%"></span></span> ${moral}%</b></div>` +
      `<div class="ligneJoueur"><span>Fatigue</span><b><span class="barreFatigue${fatigue >= 65 ? ' haute' : ''}"><span style="width:${fatigue}%"></span></span> ${fatigue}%</b></div>` +
      ligneProgression +
      `<div class="ligneJoueur"><span>Matchs joués cette saison</span><b>${j.matchsJoues || 0}</b></div>` +
      ligneStatsSaison +
      `<div class="ligneJoueur"><span>Sélection du jour</span><b>${statutCompo}</b></div>` +
      `<div class="ligneJoueur"><span>Contrat</span><b>${j.contrat} an(s) restant(s)</b></div>` +
      `<div class="ligneJoueur"><span>Salaire</span><b>${j.salaire} k€/saison</b></div>` +
      `<div class="ligneJoueur"><span>Disponibilité</span><b>${disponibilite}</b></div>` +
      `<label class="sr-label" for="selEntrainementIndividuel" style="margin-top:10px;">Entraînement individuel</label>` +
      `<select id="selEntrainementIndividuel" style="width:100%;"><option value=""${!j.entrainementIndividuel ? ' selected' : ''}>Suivre le collectif</option>${optionsEntrainement}</select>` +
      boutonRenouveler + boutonPret +
      `<div style="display:flex;gap:8px;margin-top:14px;">` +
      `<button class="alt" id="btnFermerFicheJoueur" style="flex:1;">← Retour à l'effectif</button>` +
      `<button class="alt warn" id="btnLibererFiche" style="flex:1;">Libérer ce joueur</button></div>`;
    document.getElementById('clubJoueurDetail').style.display = '';
    document.getElementById('clubEffectif').style.display = 'none';
    document.getElementById('clubEffectifFiltres').style.display = 'none';
    // Le tableau de comparaison reste un contenu de l'onglet Effectif, pas de
    // la fiche : le cacher pendant la consultation évite un empilement confus.
    document.getElementById('clubComparaisonEffectif').style.display = 'none';
  }

  function fermerFicheJoueur() {
    joueurAffiche = null;
    const detail = document.getElementById('clubJoueurDetail');
    if (detail) detail.style.display = 'none';
    const eff = document.getElementById('clubEffectif');
    if (eff) eff.style.display = '';
    const filtres = document.getElementById('clubEffectifFiltres');
    if (filtres) filtres.style.display = '';
    const comparaison = document.getElementById('clubComparaisonEffectif');
    if (comparaison) comparaison.style.display = '';
  }

  // --- Navigation : bandeau horizontal (mobile) / menu latéral (desktop, cf.
  // style.css), un seul volet visible à la fois. ---
  // Tiroir de navigation (mobile uniquement — sans effet sur le menu latéral
  // fixe à partir de 900px, cf. style.css) : ouvert/fermé via #btnMenuClub,
  // toujours refermé après avoir choisi une section.
  function fermerTiroirNav() {
    document.getElementById('barreOngletsClub').classList.remove('ouvert');
    document.getElementById('navBackdrop').classList.remove('visible');
  }
  function basculerTiroirNav() {
    document.getElementById('barreOngletsClub').classList.toggle('ouvert');
    document.getElementById('navBackdrop').classList.toggle('visible');
  }

  function basculerOnglet(cle) {
    document.querySelectorAll('#barreOngletsClub .ongletBtn').forEach((b) => {
      b.classList.toggle('actif', b.dataset.onglet === cle);
    });
    document.querySelectorAll('#clubGestion .voletOnglet').forEach((v) => {
      v.style.display = v.dataset.volet === cle ? '' : 'none';
    });
    fermerFicheJoueur(); // change d'onglet = referme toute fiche laissée ouverte
    fermerClubAdversaire(); // idem pour la fiche d'un club adverse ouverte dans l'onglet Autres clubs
    fermerTiroirNav(); // choisir une section referme le tiroir mobile
    document.getElementById('clubMain').scrollTop = 0; // repart en haut de la nouvelle page
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

  // --- Composition sur le terrain : 15 postes positionnés selon un vrai plan
  // de jeu (cf. POSITIONS_TERRAIN), banc de 8 remplaçants, encadrement
  // (capitaine/buteur/lanceur en touche). Un joueur blessé reste
  // sélectionnable (mieux vaut jouer diminué que laisser un trou) mais
  // signalé par 🤕 ; la fatigue (⚡) est aussi affichée. ---
  const POSITIONS_TERRAIN = {
    1: { top: 14, left: 28 }, 2: { top: 8, left: 50 }, 3: { top: 14, left: 72 },
    4: { top: 24, left: 38 }, 5: { top: 24, left: 62 },
    6: { top: 32, left: 18 }, 7: { top: 32, left: 82 }, 8: { top: 34, left: 50 },
    9: { top: 46, left: 50 },
    10: { top: 56, left: 35 },
    12: { top: 68, left: 42 }, 13: { top: 68, left: 66 },
    11: { top: 80, left: 10 }, 14: { top: 80, left: 90 },
    15: { top: 92, left: 50 },
  };

  // "Thomas Girard" -> "T. Girard" : uniquement pour l'AFFICHAGE compact des
  // chips terrain/banc (largeur fixe) — un nom complet s'y tronquait de façon
  // ambiguë (deux joueurs de même prénom devenaient indiscernables une fois
  // coupés). La liste déroulante ouverte et la fiche joueur gardent le nom complet.
  function nomCourt(nom) {
    const parts = nom.split(' ');
    return parts.length > 1 ? `${parts[0][0]}. ${parts.slice(1).join(' ')}` : nom;
  }

  function rafraichirTerrain() {
    const effectif = saison.clubJoueur.effectif;
    const composition = assurerComposition();
    document.getElementById('clubTerrain').innerHTML = Object.keys(RMClub.POSTE_REQUIS).map((numero) => {
      const poste = RMClub.POSTE_REQUIS[numero];
      const pos = POSITIONS_TERRAIN[numero];
      const utiliseAilleurs = new Set(Object.keys(composition)
        .filter((n) => n !== numero).map((n) => composition[n]));
      // Un joueur prêté est une exclusion DURE (comme dans completerComposition/
      // meilleureComposition) — il ne doit pas non plus apparaître dans la
      // liste déroulante manuelle, sinon la sélection interactive contredit
      // l'auto-remplissage et permettrait d'aligner un joueur indisponible.
      const candidats = effectif.filter((j) => j.poste === poste && !j.pret && !utiliseAilleurs.has(j.id));
      const blesseActuel = effectif.find((j) => j.id === composition[numero] && j.blessureJournees > 0);
      const options = candidats.map((j) => {
        const etat = j.blessureJournees > 0 ? ` 🤕${j.blessureJournees}j` : ((j.fatigue || 0) >= 65 ? ' ⚡' : '');
        const selectionne = composition[numero] === j.id ? ' selected' : '';
        return `<option value="${j.id}"${selectionne} title="${j.nom}">${nomCourt(j.nom)}${etat}</option>`;
      }).join('');
      return `<div class="chipTerrain" style="top:${pos.top}%;left:${pos.left}%;">` +
        `<span class="numChip">N°${numero} ${poste}</span>` +
        `<select data-numero="${numero}"${blesseActuel ? ' class="blesseChip"' : ''}>${options}</select></div>`;
    }).join('');
  }

  function rafraichirBanc() {
    const effectif = saison.clubJoueur.effectif;
    const c = saison.clubJoueur;
    const banc = c.compositionBanc || {};
    const titulaireIds = new Set(Object.values(c.compositionTitulaires || {}));
    document.getElementById('clubBanc').innerHTML = Object.keys(RMClub.POSTE_REQUIS_BANC).map((numero) => {
      const poste = RMClub.POSTE_REQUIS_BANC[numero];
      const utiliseAilleurs = new Set(Object.keys(banc).filter((n) => n !== numero).map((n) => banc[n]));
      const candidats = effectif.filter((j) => j.poste === poste && !j.pret && !titulaireIds.has(j.id) && !utiliseAilleurs.has(j.id));
      const options = candidats.map((j) => {
        const etat = j.blessureJournees > 0 ? ` 🤕${j.blessureJournees}j` : '';
        const selectionne = banc[numero] === j.id ? ' selected' : '';
        return `<option value="${j.id}"${selectionne} title="${j.nom}">${nomCourt(j.nom)}${etat}</option>`;
      }).join('');
      return `<div class="chipBanc"><span class="numChip">N°${numero} · ${POSTE_COMPLET[poste] || poste}</span>` +
        `<select data-numero="${numero}">${options || '<option value="">—</option>'}</select></div>`;
    }).join('');
  }

  function rafraichirEncadrement() {
    const c = saison.clubJoueur;
    const parId = {};
    for (const j of c.effectif) parId[j.id] = j;
    const titulaires = Object.keys(c.compositionTitulaires || {})
      .map((n) => ({ numero: n, joueur: parId[c.compositionTitulaires[n]] }))
      .filter((x) => x.joueur);
    function options(valeurActuelle) {
      return titulaires.map((t) => `<option value="${t.joueur.id}"${t.joueur.id === valeurActuelle ? ' selected' : ''}>N°${t.numero} ${t.joueur.nom}</option>`).join('');
    }
    document.getElementById('clubEncadrement').innerHTML =
      `<div class="ligneComposition"><span class="numComposition">Capitaine</span><select data-role="capitaineId">${options(c.capitaineId)}</select></div>` +
      `<div class="ligneComposition"><span class="numComposition">Buteur</span><select data-role="buteurId">${options(c.buteurId)}</select></div>` +
      `<div class="ligneComposition"><span class="numComposition">Lanceur en touche</span><select data-role="lanceurToucheId">${options(c.lanceurToucheId)}</select></div>`;
  }

  // Rapport de scout, pas fiche technique parfaite : tant qu'un joueur du
  // marché n'est pas assez CONNU (cf. RMClub.scouterJoueur), on affiche une
  // estimation en étoiles plutôt que ses vraies statistiques — un manager ne
  // sait jamais tout d'un joueur qu'il n'a jamais vraiment observé.
  function ligneJoueurMarche(j, c, favori) {
    const primeSignature = RMClub.calculerPrimeSignature(j);
    const abordable = c.budget >= (j.prixTransfert + primeSignature);
    const stats = RMClub.statsApparentes(j);
    const etoiles = '★'.repeat(RMClub.estimationEtoiles(j)) + '☆'.repeat(5 - RMClub.estimationEtoiles(j));
    const ligneStats = stats.complet
      ? `Vit.${stats.vitesse}/Plaq.${stats.plaquage}`
      : `${etoiles} <span title="Rapport de scout incomplet, chiffres approximatifs">(estimation)</span>`;
    const boutonScout = stats.complet
      ? ''
      : `<button class="alt btnScouter" data-joueur="${j.id}"${c.budget >= RMClub.COUT_SCOUTING ? '' : ' disabled'}>🔍 Scouter (${RMClub.COUT_SCOUTING} k€)</button>`;
    const enComparaison = selectionComparaison.has(j.id) ? ' checked' : '';
    return `<div class="ligneMarche"><label class="caseComparaison" title="Ajouter à la comparaison"><input type="checkbox" class="caseComparerJoueur" data-joueur="${j.id}"${enComparaison}></label>` +
      `<span class="infosJoueur"><b>${j.nom}</b><span>${POSTE_COMPLET[j.poste] || j.poste} · ${j.age} ans · ${ligneStats}</span></span>` +
      `<span class="actionMarche"><button class="btnFavori${favori ? ' actif' : ''}" data-joueur="${j.id}" title="Favori">${favori ? '★' : '☆'}</button>` +
      `<span class="prixMarche" title="Indemnité de transfert + prime de signature">${j.prixTransfert}<span style="color:var(--text-faint);font-weight:400;"> +${primeSignature} k€</span></span>${boutonScout}` +
      `<button class="accent btnSigner" data-joueur="${j.id}"${abordable ? '' : ' disabled'}>Signer</button></span></div>`;
  }
  function rafraichirPersonnel() {
    const c = saison.clubJoueur;
    if (!c.personnel) c.personnel = [];
    if (!saison.marchePersonnel) saison.marchePersonnel = [];
    document.getElementById('clubPersonnelActuel').innerHTML = Object.keys(RMClub.POSTES_PERSONNEL).map((poste) => {
      const info = RMClub.POSTES_PERSONNEL[poste];
      const membre = c.personnel.find((p) => p.poste === poste);
      if (membre) {
        return `<div class="lignePersonnel"><span class="infosPersonnel"><b>${info.label} — ${membre.nom}</b><span>Niveau ${membre.niveau} · ${info.effet}</span></span>` +
          `<span class="actionPersonnel"><span>${membre.salaire} k€/saison</span><button class="alt warn btnLicencier" data-staff="${membre.id}">Licencier</button></span></div>`;
      }
      return `<div class="lignePersonnel"><span class="infosPersonnel"><b class="posteVacant">${info.label} — poste vacant</b><span>${info.effet}</span></span></div>`;
    }).join('');
    document.getElementById('clubPersonnelMarche').innerHTML = saison.marchePersonnel.map((p) => {
      const info = RMClub.POSTES_PERSONNEL[p.poste];
      const pourvu = c.personnel.some((m) => m.poste === p.poste);
      return `<div class="lignePersonnel"><span class="infosPersonnel"><b>${p.nom}</b><span>${info.label} · niveau ${p.niveau}</span></span>` +
        `<span class="actionPersonnel"><span>${p.salaire} k€/saison</span><button class="accent btnEmbaucher" data-staff="${p.id}"${pourvu ? ' disabled title="Licencie d\'abord le titulaire de ce poste"' : ''}>Embaucher</button></span></div>`;
    }).join('') || '<p>Aucun candidat disponible pour le moment.</p>';
  }
  function rafraichirMarche() {
    const c = saison.clubJoueur;
    document.getElementById('transfertsBudget').innerHTML =
      `<div class="ligneFinances"><span>Budget disponible</span><span class="budgetValeur${c.budget < 0 ? ' negatif' : ''}">${c.budget} k€</span></div>`;
    document.getElementById('clubMarche').innerHTML = saison.marche.map((j) => ligneJoueurMarche(j, c, false)).join('')
      || '<p>Aucun joueur libre pour le moment.</p>';
    rafraichirFavoris();
  }

  // --- Centre de scouting : favoris (persistés, survivent au rafraîchissement
  // du marché) + comparaison de joueurs sélectionnés (cases à cocher). ---
  const selectionComparaison = new Set();
  function rafraichirFavoris() {
    const c = saison.clubJoueur;
    const favoris = saison.favoris || [];
    const carte = document.getElementById('carteFavoris');
    if (favoris.length === 0) { carte.style.display = 'none'; rafraichirComparaison(); return; }
    carte.style.display = '';
    document.getElementById('clubFavoris').innerHTML = favoris.map((j) => ligneJoueurMarche(j, c, true)).join('');
    document.getElementById('btnComparerFavoris').style.display = selectionComparaison.size >= 2 ? '' : 'none';
    rafraichirComparaison();
  }

  // Comparaison côte à côte des joueurs cochés (marché + favoris) — données
  // réelles (statsApparentes/vraies stats une fois connu), jamais fabriquées.
  function rafraichirComparaison() {
    const zone = document.getElementById('clubComparaison');
    if (selectionComparaison.size < 2) { zone.innerHTML = ''; return; }
    const pool = [...saison.marche, ...(saison.favoris || [])];
    const parId = {};
    for (const j of pool) parId[j.id] = j;
    const joueurs = [...selectionComparaison].map((id) => parId[id]).filter(Boolean);
    if (joueurs.length < 2) { zone.innerHTML = ''; return; }
    const CRITERES = [
      ['poste', 'Poste', (j) => POSTE_COMPLET[j.poste] || j.poste, false],
      ['age', 'Âge', (j) => j.age, false],
      ['vitesse', 'Vitesse', (j) => RMClub.statsApparentes(j).vitesse, true],
      ['plaquage', 'Plaquage', (j) => RMClub.statsApparentes(j).plaquage, true],
      ['prixTransfert', 'Prix', (j) => `${j.prixTransfert} k€`, false],
    ];
    const entetes = joueurs.map((j) => `<th>${j.nom}</th>`).join('');
    const lignes = CRITERES.map(([cle, label, get, meilleurHaut]) => {
      const valeurs = joueurs.map((j) => get(j));
      const numeriques = valeurs.every((v) => typeof v === 'number');
      let meilleur = null;
      if (numeriques) meilleur = meilleurHaut ? Math.max(...valeurs) : Math.min(...valeurs);
      const cellules = valeurs.map((v) => `<td${numeriques && v === meilleur ? ' class="meilleur"' : ''}>${v}</td>`).join('');
      return `<tr><th>${label}</th>${cellules}</tr>`;
    }).join('');
    zone.innerHTML = `<div style="overflow-x:auto;"><table class="tableComparaison"><thead><tr><th></th>${entetes}</tr></thead><tbody>${lignes}</tbody></table></div>`;
  }

  // Carte "Continuer ma saison" sur la page d'accueil (cf. index.html) :
  // l'accueil doit refléter ce que le joueur fait réellement — s'il a déjà
  // une saison de club en cours, ce n'est plus "Match rapide" qui devrait
  // primer à chaque visite, mais la reprise de sa carrière.
  function rafraichirCarteAccueil() {
    const carte = document.getElementById('carteContinuerClub');
    const carteNouveau = document.getElementById('carteNouveauClub');
    if (!carte) return;
    if (!saison) {
      carte.style.display = 'none';
      if (carteNouveau) carteNouveau.style.display = ''; // pas encore de carrière : "Créer mon club" reste l'action mise en avant
      return;
    }
    const prochaine = RMClub.prochainesFixtures(saison);
    const statut = prochaine.length ? `Journée ${prochaine[0].journee} à jouer` : 'Saison terminée — prête à être avancée';
    document.getElementById('continuerClubInfos').innerHTML =
      `<span class="nomClubAccueil">${saison.clubJoueur.nom}</span>` +
      `<span class="detailClubAccueil">Saison ${saison.numero || 1} · 💰 ${saison.clubJoueur.budget} k€ · ${statut}</span>`;
    carte.style.display = 'block';
    // Une carrière existe déjà : "Continuer ma saison" ci-dessus suffit,
    // pas besoin d'une deuxième carte "Créer mon club" à côté.
    if (carteNouveau) carteNouveau.style.display = 'none';
  }

  function rafraichirTout() {
    rafraichirCarteAccueil();
    const enCreation = !saison;
    document.getElementById('clubCreation').style.display = enCreation ? 'block' : 'none';
    document.getElementById('clubGestion').style.display = enCreation ? 'none' : 'flex';
    if (enCreation) return;
    assurerComposition();
    rafraichirEntete();
    rafraichirTopBarInfos();
    rafraichirProchainMatch();
    rafraichirAdversaire();
    rafraichirMessages();
    rafraichirAutresClubs();
    rafraichirDerniersResultats();
    rafraichirMiniClassement();
    rafraichirAlertes();
    rafraichirStatutEffectif();
    rafraichirTactique();
    rafraichirEntrainement();
    rafraichirJeunes();
    rafraichirMarche();
    rafraichirPersonnel();
    rafraichirClassement();
    rafraichirEffectif();
    rafraichirCalendrier();
    rafraichirFinancesTab();
    rafraichirMedical();
    rafraichirFatigueTab();
    rafraichirStatsTab();
    rafraichirMarqueurs();
    rafraichirHistoriqueSaisons();
    rafraichirTerrain();
    rafraichirBanc();
    rafraichirEncadrement();
    basculerOnglet('dashboard'); // toujours le Dashboard en entrant dans le club, comme un vrai écran d'accueil
  }

  function fermerPanneauClub() {
    document.getElementById('panneauClub').classList.remove('visible');
    fermerTiroirNav();
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
  document.getElementById('fermerClub').addEventListener('click', fermerPanneauClub);
  document.getElementById('fermerClubCreation').addEventListener('click', fermerPanneauClub);
  document.getElementById('btnMenuClub').addEventListener('click', basculerTiroirNav);
  document.getElementById('navBackdrop').addEventListener('click', fermerTiroirNav);

  // --- Alertes du dashboard : cliquer une alerte ouvre l'onglet concerné ---
  document.getElementById('clubAlertes').addEventListener('click', (e) => {
    const ligne = e.target.closest('.ligneAlerte');
    if (!ligne) return;
    basculerOnglet(ligne.dataset.onglet);
  });

  // --- Boîte de réception : marquer un message lu au clic, ou tous d'un coup ---
  document.getElementById('clubMessages').addEventListener('click', (e) => {
    const ligne = e.target.closest('.ligneMessage');
    if (!ligne) return;
    RMClub.marquerMessageLu(saison, ligne.dataset.msg);
    sauvegarder();
    rafraichirMessages();
  });
  document.getElementById('btnMessagesTousLus').addEventListener('click', () => {
    RMClub.marquerTousMessagesLus(saison);
    sauvegarder();
    rafraichirMessages();
  });

  // --- Autres clubs : liste cliquable → détail d'un club → fiche joueur
  // adverse en lecture seule (cf. ouvrirClubAdversaire/ouvrirFicheJoueurAdversaire) ---
  document.getElementById('clubAutresClubsListe').addEventListener('click', (e) => {
    const ligne = e.target.closest('tr[data-club]');
    if (!ligne) return;
    ouvrirClubAdversaire(ligne.dataset.club);
  });
  document.getElementById('btnFermerClubAdversaire').addEventListener('click', fermerClubAdversaire);
  document.getElementById('clubAutresClubEffectif').addEventListener('click', (e) => {
    const ligne = e.target.closest('tr[data-index]');
    if (!ligne || !clubAdversaireAffiche) return;
    ouvrirFicheJoueurAdversaire(clubAdversaireAffiche, Number(ligne.dataset.index));
  });
  document.getElementById('clubJoueurAdversaireDetail').addEventListener('click', (e) => {
    if (e.target.id === 'btnFermerFicheJoueurAdversaire') fermerFicheJoueurAdversaire();
  });

  document.getElementById('btnCreerClub').addEventListener('click', () => {
    const nom = document.getElementById('inputNomClub').value.trim();
    const rng = creerRng(graineAleatoire());
    saison = RMClub.nouvelleSaison(rng, nom || null);
    sauvegarder();
    rafraichirTout();
  });

  document.getElementById('btnNouvelleSaisonClub').addEventListener('click', () => {
    if (!window.confirm('Effacer la saison en cours et repartir de zéro (effectif, budget, historique compris) ?')) return;
    RMClub.effacerSaison();
    saison = null;
    document.getElementById('inputNomClub').value = '';
    rafraichirTout();
  });

  // --- Effectif : recherche/tri/filtres ---
  document.getElementById('filtreEffectifRecherche').addEventListener('input', (e) => {
    filtreEffectif.recherche = e.target.value.trim().toLowerCase();
    rafraichirEffectif();
  });
  document.getElementById('filtreEffectifPoste').addEventListener('change', (e) => {
    filtreEffectif.poste = e.target.value;
    rafraichirEffectif();
  });
  document.getElementById('filtreEffectifDisponible').addEventListener('change', (e) => {
    filtreEffectif.disponible = e.target.checked;
    rafraichirEffectif();
  });
  document.getElementById('clubEffectif').addEventListener('click', (e) => {
    if (e.target.classList.contains('caseComparerEffectif')) return; // géré par le listener "change" ci-dessous
    const th = e.target.closest('th.triable');
    if (th) {
      const champ = th.dataset.champ;
      if (filtreEffectif.triChamp === champ) filtreEffectif.triSens *= -1;
      else { filtreEffectif.triChamp = champ; filtreEffectif.triSens = 1; }
      rafraichirEffectif();
      return;
    }
    const ligne = e.target.closest('tr[data-joueur]');
    if (!ligne) return;
    ouvrirFicheJoueur(ligne.dataset.joueur);
  });
  document.getElementById('clubEffectif').addEventListener('change', (e) => {
    if (!e.target.classList.contains('caseComparerEffectif')) return;
    const id = e.target.dataset.joueur;
    if (e.target.checked) selectionComparaisonEffectif.add(id); else selectionComparaisonEffectif.delete(id);
    rafraichirComparaisonEffectif();
  });
  document.getElementById('btnComparerEffectif').addEventListener('click', () => {
    selectionComparaisonEffectif.clear();
    document.querySelectorAll('.caseComparerEffectif').forEach((c) => { c.checked = false; });
    rafraichirComparaisonEffectif();
  });
  // Fiche joueur : boutons régénérés à chaque ouverture (cf. ouvrirFicheJoueur),
  // délégation sur le conteneur parent plutôt qu'un addEventListener par joueur.
  document.getElementById('clubJoueurDetail').addEventListener('click', (e) => {
    if (e.target.id === 'btnFermerFicheJoueur') { fermerFicheJoueur(); return; }
    if (e.target.id === 'btnRenouveler') {
      if (!joueurAffiche) return;
      const joueur = saison.clubJoueur.effectif.find((j) => j.id === joueurAffiche);
      if (!joueur) return;
      const offre = RMClub.calculerOffreRenouvellement(joueur);
      if (!window.confirm(`Renouveler ${joueur.nom} pour ${offre.dureeMax} an(s) à ${offre.salaire} k€/saison ?`)) return;
      RMClub.renouvelerContrat(saison, joueurAffiche, offre.dureeMax);
      sauvegarder();
      toast(`✅ Contrat renouvelé : ${joueur.nom} (${offre.dureeMax} an(s), ${offre.salaire} k€/saison)`);
      ouvrirFicheJoueur(joueurAffiche);
      rafraichirEffectif();
      rafraichirStatutEffectif();
      return;
    }
    if (e.target.id === 'btnPreterJoueur') {
      if (!joueurAffiche) return;
      const joueur = saison.clubJoueur.effectif.find((j) => j.id === joueurAffiche);
      if (!joueur) return;
      if (!window.confirm(`Prêter ${joueur.nom} pour 3 journées ? Il sera indisponible pour la sélection, contre une indemnité immédiate.`)) return;
      const res = RMClub.preterJoueur(saison, joueurAffiche, 3);
      if (!res.ok) {
        window.alert(res.motif === 'dernier_du_poste'
          ? "Impossible : c'est le dernier joueur disponible à ce poste — le prêter rendrait la composition impossible à compléter."
          : 'Impossible de prêter ce joueur actuellement.');
        return;
      }
      assurerComposition(); // rebouche les trous laissés par le départ en prêt
      sauvegarder();
      toast(`✅ ${joueur.nom} part en prêt (indemnité ${res.indemnite} k€)`);
      ouvrirFicheJoueur(joueurAffiche);
      rafraichirEffectif();
      rafraichirStatutEffectif();
      rafraichirTopBarInfos();
      rafraichirTerrain();
      rafraichirBanc();
      rafraichirEncadrement();
      return;
    }
    if (e.target.id === 'btnRappelerJoueur') {
      if (!joueurAffiche) return;
      const joueurRappele = saison.clubJoueur.effectif.find((j) => j.id === joueurAffiche);
      RMClub.rappelerJoueur(saison, joueurAffiche);
      sauvegarder();
      if (joueurRappele) toast(`✅ ${joueurRappele.nom} est rappelé de prêt`);
      ouvrirFicheJoueur(joueurAffiche);
      rafraichirEffectif();
      rafraichirStatutEffectif();
      return;
    }
    if (e.target.id !== 'btnLibererFiche') return;
    if (!joueurAffiche) return;
    const joueur = saison.clubJoueur.effectif.find((j) => j.id === joueurAffiche);
    if (!joueur || !window.confirm(`Libérer ${joueur.nom} ? Il quittera définitivement l'effectif.`)) return;
    const res = RMClub.libererJoueur(saison, joueurAffiche);
    if (!res.ok) { window.alert("Impossible : c'est le dernier joueur de ce poste dans l'effectif."); return; }
    assurerComposition(); // rebouche les trous laissés par le départ (cf. club.js)
    sauvegarder();
    toast(`✅ ${joueur.nom} a quitté le club`);
    fermerFicheJoueur();
    rafraichirEffectif();
    rafraichirStatutEffectif();
    rafraichirTerrain();
    rafraichirBanc();
    rafraichirEncadrement();
  });
  document.getElementById('clubJoueurDetail').addEventListener('change', (e) => {
    if (e.target.id !== 'selEntrainementIndividuel') return;
    if (!joueurAffiche) return;
    const joueur = saison.clubJoueur.effectif.find((j) => j.id === joueurAffiche);
    if (!joueur) return;
    joueur.entrainementIndividuel = e.target.value || null;
    sauvegarder();
    toast(joueur.entrainementIndividuel
      ? `✅ ${joueur.nom} suit un entraînement individuel dédié`
      : `✅ ${joueur.nom} suit de nouveau le programme collectif`);
  });

  // --- Composition : navigation depuis le Dashboard vers l'onglet dédié
  // (terrain + banc), plus une simple liste dépliée sur place. ---
  document.getElementById('btnComposition').addEventListener('click', () => basculerOnglet('composition'));
  // --- Aperçu du prochain match : bouton du Dashboard ET bouton flottant
  // (toujours visible, façon "New Day") ouvrent tous les deux la même
  // préparation d'avant-match avant de lancer réellement la simulation. ---
  document.getElementById('btnJouerMatchClub').addEventListener('click', ouvrirApercuMatch);
  document.getElementById('btnApercuMatchFlottant').addEventListener('click', ouvrirApercuMatch);
  document.getElementById('fermerApercuMatch').addEventListener('click', () => {
    document.getElementById('panneauApercuMatch').classList.remove('visible');
  });
  document.getElementById('btnApercuModifierCompo').addEventListener('click', () => {
    document.getElementById('panneauApercuMatch').classList.remove('visible');
    basculerOnglet('composition');
  });
  document.getElementById('btnApercuModifierTactique').addEventListener('click', () => {
    document.getElementById('panneauApercuMatch').classList.remove('visible');
    basculerOnglet('tactique');
  });
  document.getElementById('btnApercuLancerMatch').addEventListener('click', () => {
    document.getElementById('panneauApercuMatch').classList.remove('visible');
    lancerLaJournee();
  });
  document.getElementById('btnCompositionAuto').addEventListener('click', () => {
    const c = saison.clubJoueur;
    c.compositionTitulaires = RMClub.meilleureComposition(c.effectif);
    c.compositionBanc = RMClub.completerCompositionBanc(c.effectif, c.compositionTitulaires, {});
    const auto = RMClub.autoDesignerEncadrement(c.effectif, c.compositionTitulaires);
    c.capitaineId = auto.capitaineId; c.buteurId = auto.buteurId; c.lanceurToucheId = auto.lanceurToucheId;
    sauvegarder();
    toast('✅ Meilleure équipe possible appliquée');
    rafraichirTerrain(); rafraichirBanc(); rafraichirEncadrement();
  });
  document.getElementById('clubTerrain').addEventListener('change', (e) => {
    const numero = e.target.dataset.numero;
    if (!numero) return;
    saison.clubJoueur.compositionTitulaires[numero] = e.target.value;
    sauvegarder();
    rafraichirTerrain(); // ce joueur n'est plus proposé aux autres numéros
    rafraichirBanc(); // peut libérer/consommer un joueur du vivier du banc
    rafraichirEncadrement(); // options dépendantes des titulaires
  });
  document.getElementById('clubBanc').addEventListener('change', (e) => {
    const numero = e.target.dataset.numero;
    if (!numero) return;
    saison.clubJoueur.compositionBanc[numero] = e.target.value;
    sauvegarder();
    rafraichirBanc();
  });
  document.getElementById('clubEncadrement').addEventListener('change', (e) => {
    const role = e.target.dataset.role;
    if (!role) return;
    saison.clubJoueur[role] = e.target.value;
    sauvegarder();
  });

  // --- Tactique : n'affecte QUE le club du joueur (cf. lancerMatchJoueur) ---
  document.getElementById('clubTactique').addEventListener('click', (e) => {
    const bouton = e.target.closest('[data-axe]');
    if (!bouton) return;
    if (!saison.clubJoueur.tactique || typeof saison.clubJoueur.tactique !== 'object') saison.clubJoueur.tactique = {};
    saison.clubJoueur.tactique[bouton.dataset.axe] = bouton.dataset.valeur;
    sauvegarder();
    toast(`✅ Tactique mise à jour : ${bouton.querySelector('b') ? bouton.querySelector('b').textContent : bouton.dataset.valeur}`);
    rafraichirTactique();
  });

  // --- Marché des transferts (onglet Recrutement) : signer/scouter/favoris,
  // même délégation d'événements pour le marché ET la liste de favoris (les
  // deux affichent des lignes identiques, cf. ligneJoueurMarche). ---
  document.getElementById('btnRafraichirMarche').addEventListener('click', () => {
    const rng = creerRng(graineAleatoire());
    saison.marche = RMClub.genererMarcheTransferts(rng, saison.clubJoueur.niveauClub, 6);
    sauvegarder();
    rafraichirMarche();
  });
  function gererClicJoueurMarche(e, pool) {
    const id = e.target.dataset.joueur;
    if (e.target.classList.contains('btnFavori')) {
      const joueur = pool.find((j) => j.id === id) || (saison.favoris || []).find((j) => j.id === id);
      if (!joueur) return;
      const res = RMClub.basculerFavori(saison, joueur);
      sauvegarder();
      toast(res.favori ? `☆ ${joueur.nom} ajouté aux favoris` : `☆ ${joueur.nom} retiré des favoris`);
      rafraichirMarche();
      return;
    }
    if (!id) return;
    if (e.target.classList.contains('btnScouter')) {
      // Le recruteur (personnel) réduit le coût et augmente le gain de
      // connaissance par action — cf. RMClub.effetPersonnel.
      const res = RMClub.scouterJoueur(saison, id, RMClub.effetPersonnel(saison, 'recruteur'));
      if (!res.ok) { window.alert('Budget insuffisant pour financer ce repérage.'); return; }
      sauvegarder();
      toast(`🔍 Rapport de scouting affiné (connaissance ${res.connaissance}%)`);
      rafraichirMarche();
      rafraichirTopBarInfos();
      rafraichirStatutEffectif();
      return;
    }
    if (!e.target.classList.contains('btnSigner')) return;
    const joueurSigne = pool.find((j) => j.id === id);
    const res = RMClub.signerJoueur(saison, id);
    if (!res.ok) { window.alert('Budget insuffisant pour cette signature.'); return; }
    selectionComparaison.delete(id);
    sauvegarder();
    toast(`✅ ${joueurSigne ? joueurSigne.nom : 'Joueur'} rejoint le club (${res.coutTotal} k€)`);
    rafraichirMarche();
    rafraichirEffectif();
    rafraichirTopBarInfos();
    rafraichirStatutEffectif();
  }
  document.getElementById('clubMarche').addEventListener('click', (e) => gererClicJoueurMarche(e, saison.marche));
  document.getElementById('clubFavoris').addEventListener('click', (e) => gererClicJoueurMarche(e, saison.favoris || []));

  // Comparaison : cocher/décocher un joueur (marché ou favoris) met à jour la
  // sélection et le tableau comparatif en direct.
  function gererComparaisonChange(e) {
    if (!e.target.classList.contains('caseComparerJoueur')) return;
    const id = e.target.dataset.joueur;
    if (e.target.checked) selectionComparaison.add(id); else selectionComparaison.delete(id);
    document.getElementById('btnComparerFavoris').style.display = selectionComparaison.size >= 2 ? '' : 'none';
    rafraichirComparaison();
  }
  document.getElementById('clubMarche').addEventListener('change', gererComparaisonChange);
  document.getElementById('clubFavoris').addEventListener('change', gererComparaisonChange);
  document.getElementById('btnComparerFavoris').addEventListener('click', () => {
    selectionComparaison.clear();
    document.querySelectorAll('.caseComparerJoueur').forEach((c) => { c.checked = false; });
    document.getElementById('btnComparerFavoris').style.display = 'none';
    rafraichirComparaison();
  });

  // --- Personnel : embauche/licenciement, un seul membre par poste ---
  document.getElementById('btnRafraichirPersonnel').addEventListener('click', () => {
    const rng = creerRng(graineAleatoire());
    saison.marchePersonnel = RMClub.genererMarchePersonnel(rng, 5);
    sauvegarder();
    rafraichirPersonnel();
  });
  document.getElementById('clubPersonnelMarche').addEventListener('click', (e) => {
    if (!e.target.classList.contains('btnEmbaucher')) return;
    const candidat = (saison.marchePersonnel || []).find((p) => p.id === e.target.dataset.staff);
    const res = RMClub.embaucherPersonnel(saison, e.target.dataset.staff);
    if (!res.ok) { window.alert(res.motif === 'poste_pourvu' ? 'Ce poste est déjà pourvu : licencie le titulaire pour en recruter un autre.' : 'Recrutement impossible.'); return; }
    sauvegarder();
    toast(`✅ ${candidat ? candidat.nom : 'Recrue'} rejoint le staff`);
    rafraichirPersonnel();
    rafraichirFinancesTab();
  });
  document.getElementById('clubPersonnelActuel').addEventListener('click', (e) => {
    if (!e.target.classList.contains('btnLicencier')) return;
    if (!window.confirm('Licencier ce membre du personnel ?')) return;
    RMClub.licencierPersonnel(saison, e.target.dataset.staff);
    sauvegarder();
    toast('✅ Membre du personnel licencié');
    rafraichirPersonnel();
    rafraichirFinancesTab();
  });

  // --- Entraînement : programme choisi, appliqué à chaque journée jouée
  // (cf. onResultat) ---
  document.getElementById('clubEntrainement').addEventListener('click', (e) => {
    const bouton = e.target.closest('[data-focus]');
    if (!bouton) return;
    saison.clubJoueur.entrainementFocus = bouton.dataset.focus;
    sauvegarder();
    toast(`✅ Programme d'entraînement mis à jour : ${bouton.querySelector('b') ? bouton.querySelector('b').textContent : bouton.dataset.focus}`);
    rafraichirEntrainement();
  });

  // --- Fin de saison : vieillissement, fin de contrats, retraites, recrues,
  // nouveau calendrier — le club (nom, budget) et son identité persistent. ---
  document.getElementById('btnSaisonSuivante').addEventListener('click', () => {
    const rng = creerRng(graineAleatoire());
    const { partis, arrivees } = RMClub.avancerSaison(rng, saison);
    sauvegarder();
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
  // rendu que le Match rapide (cf. window.RMMain.demarrerMatchClub). Appelée
  // depuis le bouton "Lancer le match" de l'aperçu d'avant-match, jamais
  // directement — la préparation (forme/composition/tactique/adversaire)
  // passe toujours par là d'abord (cf. rafraichirApercuMatch).
  function lancerLaJournee() {
    const fixtures = RMClub.prochainesFixtures(saison);
    if (fixtures.length === 0) return;
    const matchJoueur = fixtures.find(concerneClubJoueur);
    // Garde-fou : bloque le lancement (avec une explication précise) si la
    // composition ne peut pas être complétée — par exemple tous les joueurs
    // d'un poste indisponibles (prêtés) — plutôt que d'envoyer une config
    // incomplète au moteur (cf. RMClub.validerComposition).
    if (matchJoueur) {
      assurerComposition();
      const manquants = RMClub.validerComposition(saison.clubJoueur.compositionTitulaires);
      if (manquants.length > 0) {
        const libelles = manquants.map((m) => `N°${m.numero} (${POSTE_COMPLET[m.poste] || m.poste})`).join(', ');
        window.alert(`Impossible de jouer la journée : aucun joueur disponible pour ${libelles}. Rappelle un joueur prêté ou ajuste ton effectif avant de continuer.`);
        return;
      }
    }
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
      assurerComposition();
      const compositionUtilisee = saison.clubJoueur.compositionTitulaires;
      // La tactique choisie (cf. onglet Tactique) et l'encadrement (buteur,
      // lanceur en touche) ne s'appliquent QU'au club du joueur, jamais à
      // l'IA adverse — d'où le suffixe A/B dynamique selon le côté du joueur
      // pour ce match précis (domicile/extérieur alterne).
      const lettreJoueur = estClubJoueur(matchJoueur.domicileId) ? 'A' : 'B';
      const cfgTactique = RMClub.tactiqueVersConfig(saison.clubJoueur.tactique);
      const tactiqueCfg = {};
      if (cfgTactique.attaque) tactiqueCfg['attaque' + lettreJoueur] = cfgTactique.attaque;
      if (cfgTactique.defense) tactiqueCfg['defense' + lettreJoueur] = cfgTactique.defense;
      if (cfgTactique.melee) tactiqueCfg['melee' + lettreJoueur] = cfgTactique.melee;
      if (cfgTactique.touche) tactiqueCfg['touche' + lettreJoueur] = cfgTactique.touche;
      const numeroButeur = RMClub.numeroDuJoueurDansComposition(compositionUtilisee, saison.clubJoueur.buteurId);
      if (numeroButeur) tactiqueCfg['buteur' + lettreJoueur] = Number(numeroButeur);
      const numeroLanceur = RMClub.numeroDuJoueurDansComposition(compositionUtilisee, saison.clubJoueur.lanceurToucheId);
      if (numeroLanceur) tactiqueCfg['toucheLanceur' + lettreJoueur] = Number(numeroLanceur);
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
            // Historique des confrontations + message de résultat RÉEL (cf.
            // RMClub.enregistrerResultatClubJoueur) — uniquement pour le match
            // du club du joueur, pas les rencontres IA-IA simulées à côté.
            const adversaireId = estClubJoueur(matchJoueur.domicileId) ? matchJoueur.exterieurId : matchJoueur.domicileId;
            const scorePour = lettreJoueur === 'A' ? etat.score.A : etat.score.B;
            const scoreContre = lettreJoueur === 'A' ? etat.score.B : etat.score.A;
            RMClub.enregistrerResultatClubJoueur(saison, adversaireId, scorePour, scoreContre, matchJoueur.journee);
            const mouvement = RMClub.appliquerFinancesMatch(saison.clubJoueur, forme);
            RMClub.enregistrerMouvementFinances(saison.clubJoueur, matchJoueur.journee, mouvement);
            RMClub.accumulerStats(saison.clubJoueur, etat.stats[lettreJoueur]);
            RMClub.accumulerStatsJoueurs(saison.clubJoueur.effectif, compositionUtilisee, etat.statsJoueurs && etat.statsJoueurs[lettreJoueur]);
            // Effets réels du personnel (cf. RMClub.effetPersonnel) : le
            // médecin/l'entraîneur accélèrent (facteur >=1 direct), le
            // préparateur physique réduit la fatigue (facteur <1, donc
            // l'inverse de effetPersonnel qui exprime une qualité >=1).
            RMClub.faireProgresserBlessures(creerRng(graineAleatoire()), saison.clubJoueur.effectif, compositionUtilisee, RMClub.effetPersonnel(saison, 'medecin'), saison);
            RMClub.appliquerFatigue(saison.clubJoueur.effectif, compositionUtilisee, 1 / RMClub.effetPersonnel(saison, 'preparateur'));
            RMClub.appliquerMoral(saison.clubJoueur.effectif, compositionUtilisee, forme);
            RMClub.progresserPrets(saison.clubJoueur.effectif);
            RMClub.appliquerEntrainement(creerRng(graineAleatoire()), saison.clubJoueur.effectif, saison.clubJoueur.entrainementFocus, RMClub.effetPersonnel(saison, 'entraineur'));
            sauvegarder();
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
          sauvegarder();
          simulerAutre(i + 1);
        }
      );
    }

    simulerAutre(0);
  }

  // --- Aperçu du prochain match, façon écran de préparation d'avant-match
  // (forme, composition, tactique, analyse de l'adversaire) — cf.
  // panneauApercuMatch dans index.html. Jamais de note fabriquée : tout vient
  // de RMClub.analyserAdversaire/calendrier/composition réels. ---
  function rafraichirApercuMatch() {
    const corps = document.getElementById('apercuMatchCorps');
    const fixtures = RMClub.prochainesFixtures(saison);
    const matchJoueur = fixtures.find(concerneClubJoueur);
    if (!matchJoueur) {
      corps.innerHTML = '<p style="color:var(--text-dim);">Aucun match à venir — la saison est terminée.</p>';
      return;
    }
    assurerComposition();
    const c = saison.clubJoueur;
    const domicile = estClubJoueur(matchJoueur.domicileId);
    const adversaireId = domicile ? matchJoueur.exterieurId : matchJoueur.domicileId;
    const facteurAnalyste = RMClub.effetPersonnel(saison, 'analyste');
    const seuilAnalyste = Math.max(2, Math.round(6 - (facteurAnalyste - 1) * 8));
    const analyse = RMClub.analyserAdversaire(saison, adversaireId, seuilAnalyste);

    const mesJoues = saison.calendrier.filter((f) => f.joue && concerneClubJoueur(f));
    const maForme = mesJoues.slice(-5).map(formeClubJoueur);
    const formeTxt = (forme) => forme.length
      ? forme.map((f) => `<span class="badgeForme ${f}">${LIBELLE_FORME[f]}</span>`).join('')
      : '<span style="color:var(--text-faint);">Aucun match joué</span>';

    const titulairesIds = Object.values(c.compositionTitulaires || {});
    const joueursTitulaires = titulairesIds.map((id) => c.effectif.find((j) => j.id === id)).filter(Boolean);
    const blesses = joueursTitulaires.filter((j) => j.blessureJournees > 0);
    const fatigues = joueursTitulaires.filter((j) => !( j.blessureJournees > 0) && (j.fatigue || 0) >= 65);
    const capitaine = c.effectif.find((j) => j.id === c.capitaineId);
    const alertesCompo = [
      ...blesses.map((j) => `🤕 ${j.nom} joue diminué (blessé)`),
      ...fatigues.map((j) => `⚡ ${j.nom} est très fatigué`),
    ];

    const tactiqueActuelle = (c.tactique && typeof c.tactique === 'object') ? c.tactique : {};
    const tactiqueLignes = Object.keys(RMClub.AXES_TACTIQUE).map((axe) => {
      const info = RMClub.AXES_TACTIQUE[axe];
      const valeur = tactiqueActuelle[axe] || info.defaut;
      const option = info.options[valeur];
      return `<div class="ligneJoueur"><span>${info.label}</span><b>${option ? option.nom : valeur}</b></div>`;
    }).join('');

    const puces = [
      ...analyse.forces.map((cc) => `<span class="puceQualitatif force">⚠️ Leur ${cc.label.toLowerCase()} (+${cc.diff})</span>`),
      ...analyse.faiblesses.map((cc) => `<span class="puceQualitatif faiblesse">✓ Leur ${cc.label.toLowerCase()} (${cc.diff})</span>`),
    ].join('');

    corps.innerHTML =
      `<div class="carteClub"><h3>🆚 ${domicile ? `${c.nom} — ${analyse.nom}` : `${analyse.nom} — ${c.nom}`}</h3>` +
      `<p style="font-size:12px;color:var(--text-dim);margin:0 0 10px;">Journée ${matchJoueur.journee} · ${domicile ? 'À domicile' : 'À l\'extérieur'} · ${analyse.position}${analyse.position === 1 ? 'er' : 'e'}/${analyse.totalClubs} au classement</p>` +
      `<div class="ligneJoueur"><span>Ma forme</span><b>${formeTxt(maForme)}</b></div>` +
      `<div class="ligneJoueur"><span>Leur forme</span><b>${formeTxt(analyse.forme)}</b></div></div>` +
      `<div class="carteClub"><h3>📋 Ma composition</h3>` +
      `<div class="ligneJoueur"><span>Capitaine</span><b>${capitaine ? capitaine.nom : '—'}</b></div>` +
      (alertesCompo.length
        ? alertesCompo.map((a) => `<p style="font-size:12px;color:var(--loss);margin:6px 0;">${a}</p>`).join('')
        : '<p style="font-size:12px;color:var(--text-dim);margin:6px 0;">Aucun problème d\'effectif détecté pour ce match.</p>') +
      `</div>` +
      `<div class="carteClub"><h3>🎯 Ma tactique</h3>${tactiqueLignes}</div>` +
      `<div class="carteClub"><h3>🔍 Analyse de l'adversaire</h3>` +
      (puces ? `<div class="listeQualitatif">${puces}</div>` : '<p style="font-size:12px;color:var(--text-faint);margin:0;">Aucun écart marqué avec ton effectif.</p>') +
      `</div>`;
  }

  function ouvrirApercuMatch() {
    const fixtures = RMClub.prochainesFixtures(saison);
    if (fixtures.length === 0) { document.getElementById('btnSaisonSuivante').click(); return; }
    rafraichirApercuMatch();
    document.getElementById('panneauApercuMatch').classList.add('visible');
  }

  rafraichirTout();
})();
