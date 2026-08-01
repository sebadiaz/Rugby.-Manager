// Mode Club : rendu de l'application (dashboard/effectif/composition/tactique/
// transferts/calendrier/finances/médical/bilan) et connexion au modèle de
// données (docs/js/club.js) et au lanceur de match (window.RMMain, cf.
// docs/js/main.js). Aucune règle de jeu ici, uniquement affichage/DOM — même
// séparation que ui.js pour le Match rapide.
(function () {
  'use strict';

  const RMClub = window.RMClub;
  const RMWorld = window.RMWorld;
  const { creerRng } = window.RugbyEngine;

  let saison = RMClub.chargerSaison();
  // Joueur actuellement affiché dans la fiche (#clubJoueurDetail, dépliée sur
  // place dans l'onglet Effectif) — sert au bouton "Libérer ce joueur", qui
  // vit dans l'innerHTML régénéré et est géré par délégation d'événements.
  let joueurAffiche = null;
  // Recommandations tactiques du dernier aperçu de match affiché (cf.
  // rafraichirApercuMatch/RMClub.recommanderTactique) — reprises telles
  // quelles par le bouton "Appliquer les recommandations", plutôt que de
  // les recalculer au clic (même analyse, aucune raison de refaire le calcul).
  let dernieresRecommandationsTactique = [];
  // État des filtres/tri de l'effectif (recherche/poste/disponibilité/tri de
  // colonne) : tenu en mémoire, réappliqué à chaque rendu (pas persisté —
  // ce sont des préférences d'affichage, pas des données de la saison).
  const filtreEffectif = { recherche: '', poste: '', disponible: false, triChamp: 'poste', triSens: 1 };
  // Anti-double-action (audit P1) : resoudreJour() démarre une simulation
  // (moteur réel pour le match du joueur + résolutions Équipe B/autres clubs)
  // via l'état global partagé de docs/js/main.js (un seul `match`/`configMatch`
  // à la fois). Un second déclenchement pendant que le premier tourne encore
  // (double-clic rapide, ou même bouton ré-activé par un clavier/lecteur
  // d'accessibilité) fait démarrer une DEUXIÈME simulation qui se dispute cet
  // état partagé avec la première — reproduit et confirmé : le jeu reste
  // bloqué indéfiniment sur un match Équipe B en arrière-plan, aucune erreur
  // console, aucun moyen de continuer sans recharger la page. Ce verrou
  // bloque toute ré-entrée tant que la journée précédente n'est pas résolue.
  let journeeEnCours = false;

  // Anti-double-action (audit "doubles actions sur les transferts") :
  // gererClicJoueurMarche (Signer/Scouter, marché des transferts) n'a AUCUNE
  // fenêtre de confirmation (contrairement aux offres/renouvellements qui
  // passent par demanderMontant/confirmerAction, déjà protégées) — un clic
  // signe/scoute IMMÉDIATEMENT puis rafraichirMarche() reconstruit toute la
  // liste (innerHTML), ce qui décale chaque ligne suivante d'une position.
  // Reproduit et confirmé (double-clic souris RÉEL à coordonnées fixes, pas
  // un double appel JS sur le même nœud) : le 2e clic atterrit sur le bouton
  // "Signer" de la ligne SUIVANTE (désormais à la même position écran que la
  // ligne signée), signant un second joueur jamais choisi par le joueur. Un
  // verrou à durée fixe (pas juste "tant que la promesse précédente n'est pas
  // résolue", cf. journeeEnCours) car l'action est entièrement synchrone —
  // sans expiration, le verrou se relâcherait avant même que le 2e clic,
  // déjà en file d'attente côté navigateur, soit traité.
  let marcheActionVerrouillee = false;

  function graineAleatoire() {
    return Math.floor(window.RMRng.random() * 0xffffffff);
  }

  // Graine DÉTERMINISTE du jour courant (TODO_AUDIT.md P1-21) : dérivée de la
  // graine de la saison et de la date, jamais d'un tirage libre — rejouer la
  // même date donne le même résultat, y compris après un rechargement de
  // page. `canal` sépare les usages d'un même jour (monde, paliers, match…)
  // pour qu'ils ne consomment pas la même suite.
  let compteurCanal = 0;
  const CANAUX = {};
  function graineDuJour(canal) {
    if (CANAUX[canal] == null) CANAUX[canal] = ++compteurCanal;
    const graine = Number.isFinite(saison.graine) ? saison.graine : 1;
    return RMClub.grainePourJour(graine, RMClub.dateCourante(saison), CANAUX[canal]);
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

  // Accessibilité clavier des fenêtres modales (TODO_AUDIT.md P2-12) : les 3
  // fenêtres intégrées ci-dessous (P1-8) sont des <div> custom qui n'ont, par
  // défaut, ni piège de focus ni restauration du focus à la fermeture —
  // contrairement aux window.confirm/prompt/alert natifs qu'elles
  // remplacent, qui géraient ça automatiquement. Bloc générique partagé
  // plutôt que dupliquer cette logique 3 fois.
  let elementFocusAvantModale = null;
  function elementsFocusables(conteneur) {
    return Array.from(conteneur.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )).filter((el) => !el.disabled && el.offsetParent !== null);
  }
  function ouvrirModaleAccessible(conteneur, focaliserEnPremier) {
    elementFocusAvantModale = document.activeElement;
    conteneur.classList.add('visible');
    requestAnimationFrame(() => {
      if (focaliserEnPremier) { focaliserEnPremier(); return; }
      const focusables = elementsFocusables(conteneur);
      if (focusables[0]) focusables[0].focus();
    });
  }
  function fermerModaleAccessible(conteneur) {
    conteneur.classList.remove('visible');
    if (elementFocusAvantModale && typeof elementFocusAvantModale.focus === 'function') {
      elementFocusAvantModale.focus();
    }
    elementFocusAvantModale = null;
  }
  // Utilisé par le piège Tab du gestionnaire clavier : une seule fenêtre
  // modale peut être ouverte à la fois (cf. commentaires ci-dessous).
  function modaleOuverteActuelle() {
    return ['modalInfo', 'modalMontant', 'modalConfirmation']
      .map((id) => document.getElementById(id))
      .find((el) => el && el.classList.contains('visible')) || null;
  }

  // Fenêtre de confirmation intégrée (TODO_AUDIT.md P1-8) : remplace
  // window.confirm pour les actions à conséquence (libérer/prêter un
  // joueur, promouvoir un espoir, licencier du personnel, effacer la
  // saison...) par une carte cohérente avec le style du jeu. Un seul
  // couple de boutons est réutilisé pour toutes les confirmations (jamais
  // deux ouvertes en même temps) ; Échap et le fond assombri annulent,
  // comme les autres calques du Mode Club (cf. le gestionnaire Échap
  // plus bas).
  let resoudreConfirmation = null;
  function confirmerAction(message) {
    return new Promise((resolve) => {
      resoudreConfirmation = resolve;
      document.getElementById('modalConfirmationTexte').textContent = message;
      ouvrirModaleAccessible(document.getElementById('modalConfirmation'));
    });
  }
  function fermerConfirmation(reponse) {
    const modal = document.getElementById('modalConfirmation');
    if (!modal.classList.contains('visible')) return;
    fermerModaleAccessible(modal);
    const resolve = resoudreConfirmation;
    resoudreConfirmation = null;
    if (resolve) resolve(reponse);
  }

  // Fenêtre de saisie d'un montant (TODO_AUDIT.md P1-8) : remplace
  // window.prompt pour les offres de transfert international et la
  // négociation de salaire. Validation INLINE — contrairement à l'ancien
  // prompt+alert, une valeur invalide affiche une erreur SANS fermer la
  // fenêtre : le contexte (montant déjà saisi) n'est jamais perdu. Résout
  // avec un nombre entier positif valide, ou `null` si annulé.
  let resoudreMontant = null;
  function demanderMontant(texte, valeurDefaut) {
    return new Promise((resolve) => {
      resoudreMontant = resolve;
      document.getElementById('modalMontantTexte').textContent = texte;
      document.getElementById('modalMontantErreur').style.display = 'none';
      const input = document.getElementById('modalMontantInput');
      input.value = valeurDefaut != null ? valeurDefaut : '';
      ouvrirModaleAccessible(document.getElementById('modalMontant'), () => { input.focus(); input.select(); });
    });
  }
  function validerMontant() {
    const input = document.getElementById('modalMontantInput');
    const montant = Math.round(Number(input.value));
    if (!Number.isFinite(montant) || montant <= 0) {
      const erreur = document.getElementById('modalMontantErreur');
      erreur.textContent = 'Indique un montant valide (nombre entier positif).';
      erreur.style.display = '';
      input.focus();
      return;
    }
    fermerMontant(montant);
  }
  function fermerMontant(reponse) {
    const modal = document.getElementById('modalMontant');
    if (!modal.classList.contains('visible')) return;
    fermerModaleAccessible(modal);
    const resolve = resoudreMontant;
    resoudreMontant = null;
    if (resolve) resolve(reponse);
  }

  // Fenêtre d'information intégrée (TODO_AUDIT.md P1-8) : remplace
  // window.alert pour les messages substantiels qui méritent d'être lus
  // posément (bilan de fin de saison, avertissement de sauvegarde
  // corrompue) — les messages d'erreur courts utilisent toast() à la
  // place (non bloquant, cf. plus bas).
  let resoudreInfo = null;
  function afficherInfo(titre, corps) {
    return new Promise((resolve) => {
      resoudreInfo = resolve;
      document.getElementById('modalInfoTitre').textContent = titre;
      document.getElementById('modalInfoTexte').textContent = corps;
      ouvrirModaleAccessible(document.getElementById('modalInfo'));
    });
  }
  function fermerInfo() {
    const modal = document.getElementById('modalInfo');
    if (!modal.classList.contains('visible')) return;
    fermerModaleAccessible(modal);
    const resolve = resoudreInfo;
    resoudreInfo = null;
    if (resolve) resolve();
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

  // Audit P0-3 (TODO_AUDIT.md) : échappement HTML centralisé — le nom du
  // club est la SEULE donnée librement saisie par le joueur (cf.
  // #inputNomClub) qui est ensuite réaffichée. Un nom contenant du HTML
  // (ex. `<img src=x onerror=...>`) exécutait réellement ce code dès
  // l'écran d'accueil, confirmé par reproduction. Toute valeur qui peut
  // provenir du nom d'un club (le club du joueur en particulier — les noms
  // de clubs IA et de joueurs sont, eux, toujours générés par le jeu) doit
  // passer par ici avant d'être interpolée dans un template assigné à
  // innerHTML — jamais réaffichée telle quelle.
  function echapperHTML(texte) {
    return String(texte)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function nomClub(clubId) {
    const c = RMClub.club(saison, clubId);
    return c ? echapperHTML(c.nom) : '?';
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

  // Config moteur (tactique + encadrement + remplacements) pour UNE équipe
  // donnée (TODO_AUDIT.md P1-18) — factorisé pour être utilisé identiquement
  // par le premier XV, l'Équipe B et les Espoirs (`slot` a la même forme
  // pour les 3, cf. RMClub.slotCompositionPourEquipe) : même mécanique,
  // aucune différence de traitement entre les équipes.
  function construireTactiqueCfg(effectif, slot, lettreEquipe) {
    const cfgTactique = RMClub.tactiqueVersConfig(slot.tactique);
    const tactiqueCfg = {};
    if (cfgTactique.attaque) tactiqueCfg['attaque' + lettreEquipe] = cfgTactique.attaque;
    if (cfgTactique.defense) tactiqueCfg['defense' + lettreEquipe] = cfgTactique.defense;
    if (cfgTactique.melee) tactiqueCfg['melee' + lettreEquipe] = cfgTactique.melee;
    if (cfgTactique.touche) tactiqueCfg['touche' + lettreEquipe] = cfgTactique.touche;
    const numeroButeur = RMClub.numeroDuJoueurDansComposition(slot.compositionTitulaires, slot.buteurId);
    if (numeroButeur) tactiqueCfg['buteur' + lettreEquipe] = Number(numeroButeur);
    const numeroLanceur = RMClub.numeroDuJoueurDansComposition(slot.compositionTitulaires, slot.lanceurToucheId);
    if (numeroLanceur) tactiqueCfg['toucheLanceur' + lettreEquipe] = Number(numeroLanceur);
    const remplacements = RMClub.remplacementsVersConfig(effectif, slot.compositionBanc, lettreEquipe);
    if (remplacements.length) tactiqueCfg.remplacements = remplacements;
    return tactiqueCfg;
  }

  // Victoire/Nul/Défaite du point de vue du club du joueur. Un calendrier
  // complet fait aussi jouer les adversaires entre eux (cf. genererCalendrier) :
  // ces matchs-là n'ont pas de "forme" du point de vue du joueur (null).
  // Victoire/Nul/Défaite du point de vue d'UN club donné — généralisé pour
  // que le calendrier affiche la forme de l'équipe SÉLECTIONNÉE, y compris
  // un club adverse (TODO_AUDIT.md P1-19), avec exactement le même composant.
  function formePourClub(f, clubId) {
    if (!f.joue || (f.domicileId !== clubId && f.exterieurId !== clubId)) return null;
    const domicile = f.domicileId === clubId;
    const pour = domicile ? f.score.domicile : f.score.exterieur;
    const contre = domicile ? f.score.exterieur : f.score.domicile;
    if (pour > contre) return 'v';
    if (pour < contre) return 'd';
    return 'n';
  }
  function formeClubJoueur(f) {
    return concerneClubJoueur(f) ? formePourClub(f, saison.clubJoueur.id) : null;
  }
  const LIBELLE_FORME = { v: 'V', n: 'N', d: 'D' };

  // 6 axes INDÉPENDANTS qui se combinent (cf. RMClub.AXES_TACTIQUE) — pas un
  // choix unique parmi des templates figés : le joueur compose sa tactique
  // comme les instructions d'équipe d'un vrai jeu de gestion. La boucle
  // s'adapte automatiquement au nombre d'axes définis côté modèle.
  // Écran UNIQUE de tactique (TODO_AUDIT.md P1-19) : premier XV, Équipe B,
  // Espoirs ou club adverse — mêmes 6 axes, même présentation, mêmes
  // composants. Seule différence pour une équipe non dirigée : les boutons
  // sont désactivés et la tactique affichée est DÉDUITE de ses attributs
  // réels (cf. RMClub.deduireTactiqueAdverse), signalée comme telle plutôt
  // que présentée comme un réglage certain.
  function rafraichirTactique() {
    const ctx = contexte();
    const slot = ctx.slot;
    if (!slot.tactique || typeof slot.tactique !== 'object') {
      const defauts = {};
      for (const axe of Object.keys(RMClub.AXES_TACTIQUE)) defauts[axe] = RMClub.AXES_TACTIQUE[axe].defaut;
      slot.tactique = defauts;
    }
    const actuelle = slot.tactique;
    const inactif = ctx.modifiable ? '' : ' disabled';
    const enTete = ctx.tactiqueDeduite
      ? `<p class="noteLectureSeule">🔍 Tactique <b>déduite</b> des attributs réels de l'effectif de ${echapperHTML(ctx.label)} — un club que tu ne diriges pas ne publie pas ses consignes.</p>`
      : '';
    document.getElementById('clubTactique').innerHTML = enTete + Object.keys(RMClub.AXES_TACTIQUE).map((axe) => {
      const infosAxe = RMClub.AXES_TACTIQUE[axe];
      const valeurActuelle = actuelle[axe] || infosAxe.defaut;
      const boutons = Object.keys(infosAxe.options).map((cle) => {
        const o = infosAxe.options[cle];
        const choisie = cle === valeurActuelle ? ' choisie' : '';
        return `<button class="ligneTactique${choisie}" data-axe="${axe}" data-valeur="${cle}"${inactif}><b>${o.nom}</b><span>${o.description}</span></button>`;
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
  // Écran UNIQUE d'entraînement (TODO_AUDIT.md P1-19), piloté par le même
  // sélecteur d'équipe que les autres. Le staff et le programme collectif
  // appartiennent au CLUB : les 3 équipes du joueur partagent donc le même
  // programme (ce n'est pas une donnée manquante, c'est la réalité du club).
  // Pour un club adverse, le programme n'est honnêtement pas connu : on le
  // dit au lieu d'en fabriquer un.
  function rafraichirEntrainement() {
    const ctx = contexte();
    const zone = document.getElementById('clubEntrainement');
    if (ctx.entrainementFocus == null) {
      zone.innerHTML = `<p class="noteLectureSeule">🔒 Le programme d'entraînement de ${echapperHTML(ctx.label)} n'est pas connu : un club que tu ne diriges pas ne communique pas ses séances. Seule la marge de progression de ses joueurs, ci-dessous, est observable.</p>`;
      return;
    }
    const actuel = ctx.entrainementFocus;
    const inactif = ctx.modifiable ? '' : ' disabled';
    document.getElementById('clubEntrainement').innerHTML = Object.keys(RMClub.ENTRAINEMENTS).map((cle) => {
      const p = RMClub.ENTRAINEMENTS[cle];
      const choisi = cle === actuel ? ' choisie' : '';
      const postes = p.postes ? p.postes.map((x) => POSTE_COMPLET[x] || x).join(', ') : 'Tout l\'effectif';
      return `<button class="ligneTactique${choisi}" data-focus="${cle}"${inactif}><b>${p.label}</b><span>${p.description}</span><span style="display:block;margin-top:4px;color:var(--text-faint);font-size:11px;">Concerne : ${postes}</span></button>`;
    }).join('');
  }

  // Développement des jeunes : joueurs encore loin de leur potentiel (marge
  // réelle > 3 points), triés par marge décroissante — calculé sur l'effectif
  // de l'équipe SÉLECTIONNÉE (y compris un club adverse : sa marge de
  // progression se déduit de ses attributs réels, déjà consultables).
  function rafraichirJeunes() {
    const effectif = contexte().effectif;
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

  // Une seule fonction de ligne de calendrier pour TOUTES les compétitions
  // (championnat principal, Équipe B, espoirs) et toutes les équipes : le
  // club mis en avant est celui du contexte, pas systématiquement celui du
  // joueur. `libelleExterieur` permet à une rencontre sans club adverse réel
  // (académie espoirs, cf. RMClub.calendrierEspoirs) d'utiliser la même ligne.
  function formaterLigneCalendrier(f, clubMisEnAvant) {
    const cible = clubMisEnAvant || saison.clubJoueur.id;
    const domicile = f.libelleDomicile ? echapperHTML(f.libelleDomicile) : lienClub(f.domicileId);
    const exterieur = f.libelleExterieur ? echapperHTML(f.libelleExterieur) : lienClub(f.exterieurId);
    const score = f.joue ? `${f.score.domicile} - ${f.score.exterieur}` : 'à jouer';
    const forme = formePourClub(f, cible);
    const badge = forme ? `<span class="badgeForme ${forme}">${LIBELLE_FORME[forme]}</span>` : '';
    const classe = (f.domicileId === cible || f.exterieurId === cible) ? ' ligneClubJoueur' : '';
    return `<div class="ligneCalendrier${classe}"><span>J${f.journee} — ${domicile} vs ${exterieur}</span><span class="scoreCal">${badge}${score}</span></div>`;
  }

  // Entête d'identité (TODO_AUDIT.md P1-20) : le nom du club ACTUELLEMENT
  // AFFICHÉ, en permanence en haut à gauche — le sien ("Mon club") ou celui
  // qu'il consulte ("Club consulté" + bouton de retour). C'est le seul
  // endroit qui répond à la question « quel club suis-je en train de
  // regarder ? » : il n'existe aucune liste ni menu déroulant de clubs.
  function rafraichirEntete() {
    const nav = RMClub.navigationClub(saison);
    if (nav.clubConsulteId !== saison.clubJoueur.id) {
      const adv = RMClub.club(saison, nav.clubConsulteId);
      const initialeAdv = (adv.nom.match(/\b\w/g) || ['?']).slice(0, 2).join('').toUpperCase();
      document.getElementById('clubEntete').innerHTML =
        `<div class="clubEntete consulte"><span class="pastilleClub" style="background:${adv.couleur}">${initialeAdv}</span>` +
        `<span class="nomClub">${echapperHTML(adv.nom)}<span class="sousLigne">Club consulté</span></span></div>` +
        `<button class="alt btnRetourMonClub" id="btnRetourMonClub">← Retour à mon club</button>`;
      return;
    }
    const c = saison.clubJoueur;
    const initiale = (c.nom.match(/\b\w/g) || ['?']).slice(0, 2).join('').toUpperCase();
    // Palier de la pyramide française (cf. RMClub.nomPalierFrance) : une
    // sauvegarde antérieure à cette fonctionnalité n'a pas encore ce champ
    // tant qu'elle n'a pas traversé un avancerSaison — repli sur le palier
    // le plus haut (même choix rétrocompatible que dans avancerSaison).
    const niveauPalier = c.palierPyramide ? c.palierPyramide.niveau : 1;
    const badgeEuropeen = c.qualificationEuropeenne
      ? `<span class="badgeQualifEuro">🏆 Qualifié ${c.qualificationEuropeenne === 'continentale' ? 'Continentale' : 'Challenge'}</span>` : '';
    document.getElementById('clubEntete').innerHTML =
      `<div class="clubEntete"><span class="pastilleClub" style="background:${c.couleur}">${initiale}</span>` +
      `<span class="nomClub">${echapperHTML(c.nom)}<span class="sousLigne">Mon club · ${RMClub.nomPalierFrance(niveauPalier)}</span></span></div>${badgeEuropeen}`;
  }

  // Barre supérieure persistante (cf. index.html #clubTopBarInfos) : saison,
  // prochain match, position au classement, budget — visibles quel que soit
  // l'onglet actif, sans avoir à retourner au Dashboard pour les consulter.
  // Les repères de la barre du haut suivent le club AFFICHÉ (TODO_AUDIT.md
  // P1-20) : afficher son propre budget et son propre prochain match pendant
  // qu'on consulte un autre club serait trompeur. Pour un club consulté, on
  // n'affiche que ce qui est réellement observable (classement, prochaine
  // rencontre, budget estimé), jamais une donnée de gestion inventée.
  function rafraichirTopBarInfos() {
    const nav = RMClub.navigationClub(saison);
    const club = RMClub.club(saison, nav.clubConsulteId);
    const estMonClub = nav.clubConsulteId === saison.clubJoueur.id;
    const classement = RMClub.classementTrie(saison);
    const position = classement.findIndex((r) => r.clubId === club.id) + 1;
    const prochaine = RMClub.prochainesFixtures(saison);
    const match = prochaine.find((f) => f.domicileId === club.id || f.exterieurId === club.id);
    let texteMatch = 'Saison terminée';
    if (match) {
      const aDomicile = match.domicileId === club.id;
      const adversaireId = aDomicile ? match.exterieurId : match.domicileId;
      texteMatch = `J${match.journee} ${aDomicile ? 'vs' : '@'} ${lienClub(adversaireId)}`;
    }
    const aujourdhui = RMClub.dateCourante(saison);
    document.getElementById('clubTopBarInfos').innerHTML =
      `<span class="chipInfo chipDate">📅 <b>${RMClub.formaterDateLongue(aujourdhui)}</b></span>` +
      `<span class="chipInfo">🗓️ Saison <b>${saison.numero || 1}</b></span>` +
      `<span class="chipInfo">🏉 <b>${texteMatch}</b></span>` +
      `<span class="chipInfo">🏆 <b>${position}${position === 1 ? 'er' : 'e'}</b>/${classement.length}</span>` +
      (estMonClub
        ? `<span class="chipInfo${club.budget < 0 ? ' alerte' : ''}">💰 <b>${club.budget} k€</b></span>`
        : `<span class="chipInfo" title="Estimation de tes recruteurs">💰 <b>${club.budget != null ? club.budget + ' k€' : '—'}</b> (estimé)</span>`);
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
    zone.innerHTML = fixtures.map((f) => formaterLigneCalendrier(f)).join('');
    bouton.disabled = false;
    // Le bouton annonce la PROCHAINE ÉCHÉANCE, pas une journée abstraite
    // (TODO_AUDIT.md P1-21) : « Continuer jusqu'au samedi 7 septembre ».
    // Arrivé le jour même, il propose de jouer plutôt que d'avancer.
    const arret = RMClub.prochainArret(saison);
    const aujourdhui = RMClub.dateCourante(saison);
    let libelleCourt = 'Continuer';
    let libelleLong = 'Continuer';
    if (arret) {
      const memeJour = RMClub.comparerDates(arret.date, aujourdhui) === 0;
      libelleCourt = memeJour ? arret.libelle : `Continuer → ${RMClub.formaterDateCourte(arret.date)}`;
      libelleLong = memeJour
        ? `${arret.libelle} — c'est aujourd'hui`
        : `Continuer jusqu'au ${RMClub.formaterDateLongue(arret.date)}`;
    }
    bouton.textContent = `▶ ${libelleLong}`;
    if (labelFlottant) labelFlottant.textContent = libelleCourt;
  }

  // Agenda des 7 prochains jours (TODO_AUDIT.md P1-22) : ce que le manager a
  // devant lui, jour par jour, dérivé du calendrier RÉEL (cf. RMClub.agenda).
  // Aucune ligne inventée : un jour sans rencontre est affiché comme tel.
  function rafraichirAgenda() {
    const zone = document.getElementById('clubAgenda');
    if (!zone) return;
    const jours = RMClub.agenda(saison, 7);
    const aujourdhui = RMClub.dateCourante(saison);
    const ICONE_AGENDA = { pro: '🏉', b: '🥈', jeunes: '🌱' };
    zone.innerHTML = jours.map((j, i) => {
      const estAujourdhui = i === 0 && RMClub.comparerDates(j.date, aujourdhui) === 0;
      const classe = j.type ? ' jourEvenement' : '';
      const detail = j.type
        ? `${ICONE_AGENDA[j.type]} ${echapperHTML(j.libelle)}`
        : '<span class="jourVide">Rien de prévu</span>';
      return `<div class="ligneAgenda${classe}${estAujourdhui ? ' aujourdhui' : ''}">` +
        `<span class="dateAgenda">${echapperHTML(RMClub.formaterDateCourte(j.date))}${estAujourdhui ? ' · aujourd\'hui' : ''}</span>` +
        `<span class="detailAgenda">${detail}</span></div>`;
    }).join('');
  }

  // Points bonus (offensif : 4 essais marqués ou plus ; défensif : défaite
  // par 7 points ou moins — cf. RMClub.enregistrerResultatDans) affichés à
  // part de "Pts" plutôt que fondus dedans, pour que le joueur comprenne
  // toujours d'où vient chaque point du classement.
  // Écran UNIQUE de classement (TODO_AUDIT.md P1-19) : championnat principal
  // (premier XV ou club adverse — c'est la MÊME division, on met simplement
  // en avant l'équipe sélectionnée), championnat Équipe B, ou bilan des
  // espoirs. Même table, mêmes colonnes, mêmes règles de points — plus un
  // tableau recopié par compétition.
  function rafraichirClassement() {
    const ctx = contexte();
    const titre = document.getElementById('titreClubClassement');
    if (titre) titre.textContent = '🏆 ' + ctx.titreClassement;
    const zone = document.getElementById('clubClassement');
    if (!ctx.classement) {
      zone.innerHTML = `<p>${echapperHTML(ctx.motifIndisponible || 'Aucun classement disponible pour cette équipe.')}</p>`;
      return;
    }
    const lignes = RMClub.classementTrieDe(ctx.classement).map((r, i) => {
      const diff = r.pointsPour - r.pointsContre;
      const classe = r.clubId === ctx.clubId ? ' class="ligneClubJoueur"' : '';
      return `<tr${classe}><td>${i + 1}</td><td>${lienClub(r.clubId)}</td><td>${r.j}</td><td>${r.g}</td><td>${r.n}</td><td>${r.p}</td>` +
        `<td>${r.pointsPour}</td><td>${r.pointsContre}</td><td>${diff >= 0 ? '+' : ''}${diff}</td>` +
        `<td title="Bonus offensif (4 essais ou plus)">${r.bonusOffensifs || 0}</td>` +
        `<td title="Bonus défensif (défaite par 7 points ou moins)">${r.bonusDefensifs || 0}</td>` +
        `<td><b>${r.pts}</b></td></tr>`;
    }).join('');
    const note = ctx.type === 'jeunes'
      ? '<p style="font-size:11.5px;color:var(--text-faint);margin:8px 0 0;">Les espoirs disputent des rencontres amicales contre des académies adverses, pas un championnat à classement — voici donc leur bilan réel.</p>'
      : '';
    zone.innerHTML =
      `<table class="tableauClub"><thead><tr><th></th><th>Club</th><th>J</th><th>G</th><th>N</th><th>P</th><th>Pts+</th><th>Pts-</th><th>Diff</th><th title="Bonus offensif">BO</th><th title="Bonus défensif">BD</th><th>Pts</th></tr></thead><tbody>${lignes}</tbody></table>${note}`;
  }

  function rafraichirMiniClassement() {
    const classement = RMClub.classementTrie(saison);
    document.getElementById('clubMiniClassement').innerHTML = classement.map((r, i) => {
      const classe = estClubJoueur(r.clubId) ? ' ligneClubJoueur' : '';
      return `<div class="miniClassementLigne${classe}"><span>${i + 1}. ${lienClub(r.clubId)}</span><span>${r.j}J · <b>${r.pts}</b> pts</span></div>`;
    }).join('');
  }

  // --- Contexte d'équipe (TODO_AUDIT.md P1-19) -----------------------------
  // TOUS les écrans de gestion d'équipe (composition, effectif, entraînement,
  // tactique, calendrier/classement, personnel) lisent CE contexte et rien
  // d'autre : premier XV, Équipe B, Espoirs ou n'importe quel club adverse
  // passent donc par les mêmes fonctions de rendu, sans aucune branche par
  // type d'équipe dans le corps des écrans (cf. docs/js/club-equipes.js).
  // Une équipe non dirigée par le joueur (`modifiable: false`) utilise le
  // même écran en lecture seule — jamais un écran parallèle.
  function contexte() {
    return RMClub.contexteEquipe(saison);
  }

  // Onglets pilotés par le sélecteur d'équipe commun — c'est la liste qui
  // décide où le SEUL nœud #selecteurEquipe est déplacé (cf. basculerOnglet).
  const ONGLETS_AVEC_EQUIPE = ['effectif', 'composition', 'tactique', 'entrainement', 'calendrier', 'personnel'];
  let ongletActuel = 'dashboard';

  // Le sélecteur est un composant UNIQUE : un seul <select> dans tout le jeu,
  // déplacé dans l'emplacement de l'onglet actif plutôt que dupliqué écran
  // par écran. C'est ce qui garantit mécaniquement que l'équipe choisie est
  // conservée en passant de la composition à la tactique, à l'entraînement,
  // au calendrier ou au personnel : il n'existe pas d'autre état à
  // resynchroniser.
  // Le sélecteur ne répond QU'À une seule question : « quelle équipe DU CLUB
  // ACTUELLEMENT AFFICHÉ consulter ? ». Il ne contient jamais de nom de club
  // (TODO_AUDIT.md P1-20) — un club s'ouvre en cliquant son nom là où il
  // apparaît déjà, jamais depuis une liste. Il ne propose que les équipes
  // réellement présentes dans les données du club affiché : les trois du
  // joueur, l'équipe première seule pour un club qu'il ne dirige pas.
  function rafraichirSelecteurEquipe() {
    const ctx = contexte();
    const nav = RMClub.navigationClub(saison);
    const sel = document.getElementById('selEquipeContexte');
    if (!sel) return;
    const equipes = RMClub.equipesDisponiblesPourClub(saison, nav.clubConsulteId);
    sel.innerHTML = equipes.map((o) =>
      `<option value="${echapperHTML(o.valeur)}"${o.valeur === ctx.type ? ' selected' : ''}>${echapperHTML(o.label)}</option>`).join('');
    sel.value = ctx.type;
    // Une seule équipe disponible (club consulté) : le sélecteur n'a rien à
    // arbitrer, il devient une simple étiquette non interactive.
    sel.disabled = equipes.length < 2;
    const badge = ctx.modifiable
      ? '<span class="badgeEquipeMode dirigee">Équipe dirigée · modifiable</span>'
      : '<span class="badgeEquipeMode lecture">Lecture seule</span>';
    const indispo = ctx.motifIndisponible
      ? `<p class="avertissementEquipe">⚠️ ${echapperHTML(ctx.motifIndisponible)}</p>` : '';
    document.getElementById('contexteEquipeInfo').innerHTML =
      `<p class="sousTitreEquipe">${echapperHTML(ctx.sousTitre)} · ${ctx.effectif.length} joueur(s) ${badge}</p>${indispo}${statutEspoirsHTML(ctx)}`;
  }

  // --- Ouverture d'un club : LA fonction centrale (TODO_AUDIT.md P1-20) ----
  // Tous les noms de clubs cliquables du jeu (calendrier, classement,
  // résultats, prochain match, analyse de l'adversaire, liste des autres
  // clubs, fiche joueur, confrontations...) appellent CETTE fonction — la
  // logique n'est dupliquée dans aucun écran.
  function ouvrirClub(clubId) {
    if (!RMClub.club(saison, clubId)) return;
    const nav = RMClub.navigationClub(saison);
    if (clubId === nav.clubConsulteId) { basculerOnglet('composition'); return; }
    RMClub.ouvrirClubDansNavigation(saison, clubId, ongletActuel);
    fermerFicheJoueur();
    selectionComparaisonEffectif.clear();
    sauvegarder();
    rafraichirEntete();
    rafraichirTopBarInfos();
    rafraichirMenuOnglets();
    rafraichirVueClub();
    rafraichirEcransEquipe();
    // Ouvre directement la composition de l'équipe première du club ouvert :
    // c'est la vue la plus parlante quand on va voir « à quoi ressemble » un
    // club, et c'est le parcours attendu (clic sur un nom → son XV).
    basculerOnglet('composition');
  }

  // Retour à son propre club : restaure le club, l'équipe SUR LAQUELLE il
  // travaillait et l'écran d'où il venait.
  function retourMonClub() {
    const { onglet } = RMClub.retourClubJoueurDansNavigation(saison);
    fermerFicheJoueur();
    selectionComparaisonEffectif.clear();
    sauvegarder();
    rafraichirEntete();
    rafraichirTopBarInfos();
    rafraichirMenuOnglets();
    rafraichirVueClub();
    rafraichirEcransEquipe();
    basculerOnglet(onglet);
  }

  // Nom de club CLIQUABLE — un seul composant, réutilisé partout où un nom de
  // club s'affiche. C'est le seul moyen d'ouvrir un club dans tout le jeu.
  function lienClub(clubId) {
    const c = RMClub.club(saison, clubId);
    if (!c) return '?';
    return `<button type="button" class="lienClub" data-club="${echapperHTML(clubId)}" title="Ouvrir ${echapperHTML(c.nom)}">${echapperHTML(c.nom)}</button>`;
  }

  // Le menu s'adapte au club affiché : pour un club que le joueur ne dirige
  // pas, les écrans de gestion (tactique, entraînement, médical, recrutement,
  // transferts, finances, bilan) sont ABSENTS — pas grisés. Les données
  // correspondantes n'existent tout simplement pas pour un club IA, et rien
  // n'est fabriqué pour remplir un écran.
  const LIBELLE_GROUPE_NAV = {
    monClub: { club: 'Mon club', recrutement: 'Recrutement', competition: 'Compétition', gestion: 'Gestion' },
    clubConsulte: { club: 'Club consulté', recrutement: 'Staff', competition: 'Compétition', gestion: 'Gestion' },
  };

  function rafraichirMenuOnglets() {
    const autorises = RMClub.ongletsDisponibles(saison);
    const libelles = LIBELLE_GROUPE_NAV[RMClub.consulteClubJoueur(saison) ? 'monClub' : 'clubConsulte'];
    document.querySelectorAll('#barreOngletsClub .ongletBtn').forEach((b) => {
      b.style.display = autorises.indexOf(b.dataset.onglet) !== -1 ? '' : 'none';
    });
    // « Mon club » n'a plus de sens quand on regarde le club d'un autre.
    document.querySelectorAll('#barreOngletsClub .groupeNav').forEach((titre) => {
      const libelle = libelles[titre.dataset.cat];
      if (libelle) titre.textContent = libelle;
    });
    // Un intitulé de groupe dont plus aucune entrée n'est visible n'a plus
    // lieu d'être affiché.
    document.querySelectorAll('#barreOngletsClub .groupeNav').forEach((titre) => {
      let visible = false;
      for (let el = titre.nextElementSibling; el && !el.classList.contains('groupeNav'); el = el.nextElementSibling) {
        if (el.classList.contains('ongletBtn') && el.style.display !== 'none') { visible = true; break; }
      }
      titre.style.display = visible ? '' : 'none';
    });
  }

  // Prochain match espoirs : information propre au centre de formation, donc
  // affichée dans le bandeau du contexte quand c'est cette équipe qui est
  // sélectionnée — plus une carte séparée dans l'onglet Effectif.
  function statutEspoirsHTML(ctx) {
    if (ctx.type !== 'jeunes') return '';
    const prochaine = RMClub.prochainesFixtures(saison).find(concerneClubJoueur);
    if (!prochaine) return '';
    if (!RMClub.eligiblePourMatchEspoirs(saison)) {
      return '<p class="avertissementEquipe">⚠️ Effectif espoirs incomplet : pas de match espoirs possible tant que tous les postes ne sont pas couverts.</p>';
    }
    if (RMClub.journeeDeMatchEspoirs(prochaine.journee)) return '<p class="sousTitreEquipe">🏉 Match espoirs cette journée !</p>';
    const journeesAvant = RMClub.PERIODE_JOURNEES_ESPOIRS - (prochaine.journee % RMClub.PERIODE_JOURNEES_ESPOIRS || RMClub.PERIODE_JOURNEES_ESPOIRS);
    return `<p class="sousTitreEquipe">Prochain match espoirs dans ${journeesAvant} journée(s).</p>`;
  }

  // Change l'équipe affichée par TOUS les écrans d'un coup. Aucun écran n'a
  // sa propre notion d'équipe courante : il n'y a qu'ici qu'on en change.
  function changerEquipe(type) {
    RMClub.definirEquipeConsultee(saison, type);
    if (RMClub.consulteClubJoueur(saison)) RMClub.assurerCompositionPourEquipe(saison, type);
    // Une fiche joueur laissée ouverte appartient à l'équipe PRÉCÉDENTE : la
    // laisser affichée montrerait un joueur qui n'est plus dans l'effectif
    // consulté (et masquerait la nouvelle table). On referme, comme au
    // changement d'onglet.
    fermerFicheJoueur();
    // La sélection de comparaison porte sur des joueurs de l'ancienne équipe :
    // elle n'a plus de sens ici (les ids d'un club adverse sont dérivés).
    selectionComparaisonEffectif.clear();
    sauvegarder();
    rafraichirEcransEquipe();
  }

  // Re-rend d'un bloc les 6 écrans pilotés par le sélecteur — appelé au
  // changement d'équipe comme au changement d'onglet, pour que la même
  // équipe soit affichée partout, tout le temps.
  function rafraichirEcransEquipe() {
    rafraichirSelecteurEquipe();
    rafraichirEffectif();
    rafraichirTerrain();
    rafraichirBanc();
    rafraichirEncadrement();
    rafraichirTactique();
    rafraichirEntrainement();
    rafraichirJeunes();
    rafraichirClassement();
    rafraichirCalendrier();
    rafraichirPersonnel();
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
  function badgesRole(id, slot) {
    const s = slot || contexte().slot;
    let out = '';
    if (s.capitaineId === id) out += '<span class="badgeRole capitaine" title="Capitaine">C</span>';
    if (s.buteurId === id) out += '<span class="badgeRole buteur" title="Buteur désigné">BUT</span>';
    if (s.lanceurToucheId === id) out += '<span class="badgeRole lanceur" title="Lanceur en touche">TOU</span>';
    return out;
  }

  function valeurTri(j, champ) {
    if (champ === 'nom') return j.nom;
    return j[champ] || 0;
  }

  // Comparaison de joueurs de l'EFFECTIF (distincte de celle du marché, cf.
  // selectionComparaison) — sélection par cases à cocher dans le tableau.
  const selectionComparaisonEffectif = new Set();

  // Écran UNIQUE d'effectif (TODO_AUDIT.md P1-19) : premier XV, vivier
  // Équipe B, centre de formation ou effectif d'un club adverse — même table,
  // mêmes colonnes, mêmes filtres, même tri, même fiche joueur au clic. Les
  // colonnes qu'un effectif IA n'a pas (fatigue, prêt, temps de jeu) tombent
  // proprement sur "—" : c'est la donnée qui manque, pas l'écran qui change.
  function rafraichirEffectif() {
    const ctx = contexte();
    const f = filtreEffectif;
    let effectif = ctx.effectif.filter((j) => {
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
      const statutBase = j.pret ? `<span class="badgePret" title="Jours restants">📤 Prêté (${j.pret.dureeRestante}j)</span>`
        : j.blessureJournees > 0 ? `<span class="badgeBlessure">🤕 ${j.blessureJournees}j</span>` : '—';
      const statut = j.veutPartir ? `<span class="badgeVeutPartir" title="Veut être transféré">🚩</span> ${statutBase}` : statutBase;
      const contratClasse = j.contrat <= 1 ? ' class="badgeContratCourt"' : '';
      const fatigue = j.fatigue || 0;
      const moral = j.moral != null ? j.moral : 65;
      const enComparaison = selectionComparaisonEffectif.has(j.id) ? ' checked' : '';
      return `<tr data-joueur="${j.id}"><td><input type="checkbox" class="caseComparerEffectif" data-joueur="${j.id}"${enComparaison}></td>` +
        `<td>${echapperHTML(j.nom)}${badgesRole(j.id, ctx.slot)}</td><td>${POSTE_COMPLET[j.poste] || j.poste}</td><td>${j.age}</td><td>${j.vitesse}</td><td>${j.plaquage}</td>` +
        `<td>${j.potentiel != null ? Math.round(j.potentiel) : '—'}</td>` +
        `<td><span class="barreMoral${moral < 45 ? ' bas' : moral >= 80 ? ' haut' : ''}"><span style="width:${moral}%"></span></span></td>` +
        `<td><span class="barreFatigue${fatigue >= 65 ? ' haute' : ''}"><span style="width:${fatigue}%"></span></span></td>` +
        `<td${contratClasse}>${j.contrat != null ? j.contrat + ' an(s)' : '—'}</td><td>${j.salaire != null ? j.salaire + ' k€' : '—'}</td><td>${statut}</td></tr>`;
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
    const effectifCourant = contexte().effectif;
    const joueurs = [...selectionComparaisonEffectif]
      .map((id) => effectifCourant.find((j) => j.id === id))
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
        `<span class="adversaireDash">${domicileEstJoueur ? 'vs' : '@'} ${lienClub(adversaireId)}</span>` +
        `<span class="scoreDash">${scoreJoueur} - ${scoreAdv}</span></div>`;
    }).join('');
  }

  // Objectif de la saison + confiance du président : dérivés du classement
  // RÉEL de la saison précédente (cf. RMClub.determinerObjectifSaison) —
  // masqué sur une ancienne sauvegarde sans objectif défini (jamais planté).
  function rafraichirObjectifSaison() {
    const carte = document.getElementById('carteObjectifSaison');
    const c = saison.clubJoueur;
    if (!c.objectifSaison) { carte.style.display = 'none'; return; }
    carte.style.display = '';
    const classement = RMClub.classementTrie(saison);
    const position = classement.findIndex((r) => r.clubId === c.id) + 1;
    const objectifAtteint = position <= c.objectifSaison.position;
    const confiance = c.confiancePresident != null ? c.confiancePresident : 60;
    document.getElementById('clubObjectifSaison').innerHTML =
      `<div class="ligneJoueur"><span>Ambition du président</span><b>${RMClub.libelleObjectifSaison(c.objectifSaison)}</b></div>` +
      `<div class="ligneJoueur"><span>Position actuelle</span><b class="${objectifAtteint ? '' : 'deltaNegatif'}">${position}e/${classement.length} ${objectifAtteint ? '✓ en ligne avec l\'objectif' : '— en retard sur l\'objectif'}</b></div>` +
      `<div class="ligneJoueur"><span>Confiance du président</span><b><span class="barreMoral${confiance < 35 ? ' bas' : confiance >= 65 ? ' haut' : ''}"><span style="width:${confiance}%"></span></span> ${confiance}%</b></div>`;
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
      `<p style="margin:0 0 8px;font-weight:700;">${lienClub(adversaireId)} <span style="font-weight:400;color:var(--text-dim);font-size:12px;">— ${analyse.position}${analyse.position === 1 ? 'er' : 'e'}/${analyse.totalClubs} au classement</span></p>` +
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
    // Liste de NOMS CLIQUABLES, pas un sélecteur : chaque nom appelle la même
    // fonction centrale ouvrirClub() que partout ailleurs (TODO_AUDIT.md P1-20).
    const lignes = saison.adversaires.map((adv) => {
      const rang = classement.findIndex((r) => r.clubId === adv.id) + 1;
      const etoiles = Math.max(1, Math.min(5, Math.round(adv.niveauClub * 5)));
      return `<tr><td><span class="pointCouleurClub" style="background:${adv.couleur}"></span>${lienClub(adv.id)}</td>` +
        `<td>${'★'.repeat(etoiles)}${'☆'.repeat(5 - etoiles)}</td>` +
        `<td>${rang}${rang === 1 ? 'er' : 'e'}/${classement.length}</td>` +
        `<td>${adv.budget != null ? adv.budget + ' k€' : '—'}</td></tr>`;
    }).join('');
    conteneur.innerHTML = `<table class="tableauClub"><thead><tr><th>Club</th><th>Réputation</th><th>Classement</th><th>Budget (estimé)</th></tr></thead><tbody>${lignes}</tbody></table>`;
    rafraichirAutresPaliersFrance();
  }

  // Les 2 paliers de la pyramide française que le club du joueur n'occupe
  // pas cette saison (cf. docs/js/club-pyramide-france.js) : un classement
  // réel, simulé une journée à la fois — assurerAutresDivisionsFrance crée
  // la structure au premier affichage si une vraie journée n'a pas encore
  // été jouée (carrière toute neuve), sans jamais écraser une progression
  // déjà en cours.
  function rafraichirAutresPaliersFrance() {
    const conteneur = document.getElementById('clubAutresPaliersFrance');
    if (!conteneur) return;
    const niveauActuel = (saison.clubJoueur.palierPyramide || { niveau: 3 }).niveau;
    const existaitDeja = !!saison.autresDivisionsFrance && saison.autresDivisionsFrance.niveauExclu === niveauActuel;
    const autresDivisions = RMClub.assurerAutresDivisionsFrance(creerRng(graineAleatoire()), saison);
    if (!existaitDeja) sauvegarder();
    conteneur.innerHTML = Object.keys(autresDivisions.divisions).sort((a, b) => a - b).map((niveau) => {
      const div = autresDivisions.divisions[niveau];
      const lignes = RMClub.classementTrieDe(div.classement).map((r, i) => {
        const club = div.clubs.find((c) => c.id === r.clubId);
        return `<tr><td>${i + 1}</td><td>${club ? echapperHTML(club.nom) : '—'}</td><td>${r.j}</td><td>${r.g}</td><td>${r.n}</td><td>${r.p}</td><td><b>${r.pts}</b></td></tr>`;
      }).join('');
      return `<h4 style="margin:14px 0 6px;">${div.nom}</h4>` +
        `<table class="tableauClub"><thead><tr><th></th><th>Club</th><th>J</th><th>G</th><th>N</th><th>P</th><th>Pts</th></tr></thead><tbody>${lignes}</tbody></table>`;
    }).join('');
  }

  // Vue d'ensemble d'un club CONSULTÉ (TODO_AUDIT.md P1-20) : ce que le
  // joueur peut réellement observer d'un club qu'il ne dirige pas —
  // identité, forme récente, tactique déduite de ses attributs, comparaison
  // d'effectif et historique RÉEL des confrontations directes. Affichée dans
  // l'onglet "Vue d'ensemble", à la place du tableau de bord de gestion —
  // pas dans un écran séparé.
  function rafraichirVueClub() {
    const nav = RMClub.navigationClub(saison);
    const estMonClub = nav.clubConsulteId === saison.clubJoueur.id;
    const carte = document.getElementById('carteVueClubConsulte');
    document.querySelectorAll('#clubGestion .voletOnglet[data-volet="dashboard"] .carteMonClub')
      .forEach((el) => { el.style.display = estMonClub ? '' : 'none'; });
    const titre = document.getElementById('titreVueDensemble');
    const sousTitre = document.getElementById('sousTitreVueDensemble');
    if (estMonClub) {
      carte.style.display = 'none';
      if (titre) titre.textContent = 'Dashboard';
      if (sousTitre) sousTitre.textContent = "Ta saison en un coup d'œil : prochain match, décisions urgentes et alertes.";
      return;
    }
    const adv = RMClub.club(saison, nav.clubConsulteId);
    carte.style.display = '';
    if (titre) titre.textContent = adv.nom;
    if (sousTitre) sousTitre.textContent = 'Ce que tes recruteurs savent de ce club — consultation seule.';
    const facteurAnalyste = RMClub.effetPersonnel(saison, 'analyste');
    const seuilAnalyste = Math.max(2, Math.round(6 - (facteurAnalyste - 1) * 8));
    const analyse = RMClub.analyserAdversaire(saison, adv.id, seuilAnalyste);
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
    document.getElementById('clubVueConsulteIdentite').innerHTML =
      `<div class="ficheJoueurEntete"><span><span class="nomJoueurFiche">${echapperHTML(adv.nom)}</span>` +
      `<span class="posteJoueurFiche">${analyse.position}${analyse.position === 1 ? 'er' : 'e'}/${analyse.totalClubs} au classement · Budget estimé ${adv.budget != null ? adv.budget + ' k€' : '—'}</span></span></div>` +
      `<p style="font-size:12px;color:var(--text-dim);margin:8px 0;">Forme récente : ${formeTxt}</p>` +
      `<p style="font-size:12px;color:var(--text-dim);margin:0 0 8px;">Tactique habituelle (déduite de l'effectif) : ${deriverTactiqueAdversaire(adv.effectif)}</p>`;
    document.getElementById('clubVueConsulteAnalyse').innerHTML =
      analyse.comparaison.map((c) => {
        const total = Math.max(c.moi, c.eux) + 15;
        const largeurEux = Math.min(100, (c.eux / total) * 100);
        const classeFaible = c.diff < 0 ? ' faible' : '';
        return `<div class="ligneAdversaireAttr"><span class="labelAdvAttr">${c.label}</span>` +
          `<span class="barreComparaison"><span class="${classeFaible.trim()}" style="width:${largeurEux}%"></span></span>` +
          `<span class="valAdv">${c.eux}</span></div>`;
      }).join('') +
      (puces ? `<div class="listeQualitatif">${puces}</div>` : '<p style="font-size:11.5px;color:var(--text-faint);margin:10px 0 0;">Aucun écart marqué avec ton effectif.</p>');
    document.getElementById('clubVueConsulteConfrontations').innerHTML = confrontations;
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
    const postesVides = Object.keys(POSTE_COMPLET).filter((poste) =>
      !c.effectif.some((j) => j.poste === poste && j.blessureJournees <= 0 && !j.pret));
    if (postesVides.length > 0) {
      alertes.push({ icone: '🌱', texte: `Plus aucun ${POSTE_COMPLET[postesVides[0]] || postesVides[0]} disponible — un espoir du centre de formation peut être promu`, onglet: 'effectif' });
    }
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
  const ICONE_MESSAGE = { transfert: '🔁', blessure: '🤕', contrat: '📄', match: '🏉', saison: '🏆', jeunes: '🌱', monde: '🌍' };
  function rafraichirMessages() {
    const messages = saison.clubJoueur.messages || [];
    const nonLus = messages.filter((m) => !m.lu).length;
    const titre = document.querySelector('#carteMessages h3');
    if (titre) titre.textContent = `Boîte de réception${nonLus ? ` (${nonLus} non lu${nonLus > 1 ? 's' : ''})` : ''}`;
    // Décoratif sinon : rien à marquer comme lu tant que la boîte est vide.
    const boutonToutLu = document.getElementById('btnMessagesTousLus');
    if (boutonToutLu) boutonToutLu.style.display = nonLus > 0 ? '' : 'none';
    // Décision réelle (TODO_AUDIT.md P1-15) : un message avec `decision` non
    // résolue propose de vrais boutons d'action (pas juste "marquer comme
    // lu") — cf. RMClub.resoudreDecisionMessage et le handler de clic
    // ci-dessous. Une fois tranchée, le résultat reste visible en texte.
    function decisionHTML(m) {
      if (!m.decision) return '';
      if (m.decision.resolu) return `<span class="decisionMessageResultat">${m.decision.resultat || ''}</span>`;
      return `<span class="decisionMessageActions">${m.decision.options.map((o) =>
        `<button class="alt btnDecisionMessage" data-msg="${m.id}" data-option="${o.id}">${o.libelle}</button>`
      ).join('')}</span>`;
    }
    document.getElementById('clubMessages').innerHTML = messages.length
      ? messages.slice(0, 15).map((m) =>
          `<div class="ligneMessage${m.lu ? '' : ' nonLu'}${m.decision && !m.decision.resolu ? ' decisionEnAttente' : ''}" data-msg="${m.id}"><span class="iconeMessage">${ICONE_MESSAGE[m.categorie] || '📬'}</span>` +
          `<span class="corpsMessage"><b>${m.titre}</b><span>${m.corps}</span>${decisionHTML(m)}<span class="metaMessage">Saison ${m.saisonNumero}</span></span></div>`
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
      `<div class="ligneStatut"><span>Total / journée</span><span class="valeurStatut">${Math.round((masseJoueurs + massePersonnel) / RMClub.nombreJourneesSaison(saison.calendrier))} k€</span></div>`;
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
      ? hist.map((m) => {
          const estEquipeB = m.source === 'equipeB';
          const label = `J${m.journee}${estEquipeB ? ' (Équipe B)' : ''}`;
          const detail = estEquipeB
            ? `recette +${m.recette} k€ (billetterie)`
            : `recette +${m.recette} k€${m.revenuSponsor ? ` (dont sponsor +${m.revenuSponsor} k€)` : ''}, salaires -${m.salaires}${m.salairesPersonnel ? ` -${m.salairesPersonnel} (personnel)` : ''} k€`;
          return `<div class="ligneMouvement"><span>${label}<span class="detailMouvement"> — ${detail}</span></span><span class="soldeMouvement">${m.budgetApres} k€</span></div>`;
        }).join('')
      : '<p>Aucun match joué pour le moment.</p>';
  }

  // --- Médical : vue filtrée de l'effectif (façon Medical Centre FM), plus
  // la charge de fatigue de l'effectif (réellement répercutée en match). ---
  function rafraichirMedical() {
    const blesses = saison.clubJoueur.effectif.filter((j) => j.blessureJournees > 0);
    document.getElementById('clubMedical').innerHTML = blesses.length
      ? blesses.map((j) => `<div class="ligneMedicale"><span><b>${j.nom}</b> — ${POSTE_COMPLET[j.poste] || j.poste}</span><span class="retourMedical">Retour dans ${j.blessureJournees} jour(s) — ${RMClub.formaterDateCourte(RMClub.ajouterJours(RMClub.dateCourante(saison), j.blessureJournees))}</span></div>`).join('')
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
  // Fiche joueur UNIQUE (TODO_AUDIT.md P1-19) : un joueur du premier XV, un
  // réserviste d'Équipe B, un espoir du centre de formation ou un joueur
  // d'un club adverse s'ouvrent tous dans CETTE fiche, au même endroit, avec
  // la même présentation. Seules les ACTIONS proposées en bas dépendent de
  // ce que le joueur a réellement le droit de faire sur cette équipe.
  function ouvrirFicheJoueur(id) {
    const ctx = contexte();
    const j = ctx.effectif.find((x) => x.id === id);
    if (!j) return;
    joueurAffiche = id;
    const c = saison.clubJoueur;
    const slot = ctx.slot;
    const disponibilite = j.pret ? `En prêt — retour dans ${j.pret.dureeRestante} jour(s)`
      : j.blessureJournees > 0 ? `Blessé — ${j.blessureJournees} jour(s) restant(s)` : 'Disponible';
    const titulaire = slot.compositionTitulaires && Object.values(slot.compositionTitulaires).includes(id);
    const banc = slot.compositionBanc && Object.values(slot.compositionBanc).includes(id);
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
    // Négociable à tout moment (pas seulement en dernière année de contrat —
    // audit : le joueur pensait qu'aucune gestion de contrat n'existait,
    // faute de l'avoir jamais rencontrée avant l'expiration). RMClub.
    // negocierRenouvellement/renouvelerContrat n'ont jamais eu de condition
    // sur la durée restante : seul ce bouton en avait une, sans raison de
    // jeu documentée.
    // Actions disponibles selon l'équipe affichée — l'écran est le même pour
    // les 4 types d'équipe, seuls les leviers réellement praticables sont
    // proposés : contrats/prêts sur l'effectif pro (les seuls joueurs à en
    // avoir), promotion pour un espoir, offre de transfert pour un joueur
    // adverse, rien du tout ailleurs.
    const estEffectifPro = c.effectif.some((x) => x.id === id);
    const estEspoir = (c.jeunes || []).some((x) => x.id === id);
    let actions = '';
    if (ctx.modifiable && estEffectifPro) {
      const offre = RMClub.calculerOffreRenouvellement(j);
      actions += `<button class="accent" id="btnRenouveler" style="width:100%;margin-top:8px;">Renouveler ${offre.dureeMax} an(s) · ${offre.salaire} k€/saison</button>`;
      actions += j.pret
        ? `<button class="alt" id="btnRappelerJoueur" style="width:100%;margin-top:8px;">Rappeler de prêt</button>`
        : `<button class="alt" id="btnPreterJoueur" style="width:100%;margin-top:8px;">Prêter ce joueur (3 semaines)</button>`;
    }
    if (ctx.modifiable && estEspoir) {
      actions += `<button class="accent" id="btnPromouvoirEspoir" style="width:100%;margin-top:8px;">⬆️ Promouvoir en équipe première</button>`;
    }
    if (!ctx.modifiable) {
      actions += `<button class="accent" id="btnApprocherJoueurAdverse" style="width:100%;margin-top:14px;">💼 Faire une offre de transfert</button>`;
    }
    const optionsEntrainement = Object.keys(RMClub.ENTRAINEMENTS).map((cle) =>
      `<option value="${cle}"${j.entrainementIndividuel === cle ? ' selected' : ''}>${RMClub.ENTRAINEMENTS[cle].label}</option>`
    ).join('');
    // L'entraînement individuel n'existe que pour les joueurs réellement
    // suivis au jour le jour (effectif pro) : proposé là, masqué ailleurs.
    const blocEntrainementIndividuel = (ctx.modifiable && estEffectifPro)
      ? `<label class="sr-label" for="selEntrainementIndividuel" style="margin-top:10px;">Entraînement individuel</label>` +
        `<select id="selEntrainementIndividuel" style="width:100%;"><option value=""${!j.entrainementIndividuel ? ' selected' : ''}>Suivre le collectif</option>${optionsEntrainement}</select>`
      : '';
    document.getElementById('clubJoueurDetail').innerHTML =
      `<div class="ficheJoueurEntete"><span><span class="nomJoueurFiche">${echapperHTML(j.nom)}${badgesRole(id, slot)}</span><span class="posteJoueurFiche">${POSTE_COMPLET[j.poste] || j.poste} · ${j.age} ans · ${lienClub(ctx.clubId)} <span style="color:var(--text-faint);">(${echapperHTML(ctx.label)})</span></span></span></div>` +
      (ctx.modifiable ? '' : `<p class="noteLectureSeule">🔍 Joueur d'un club que tu ne diriges pas : consultation seule. Les valeurs de contrat et de salaire sont des estimations de tes recruteurs.</p>`) +
      lignesAttributs + lignePotentiel +
      `<div class="ligneJoueur"><span>Moral</span><b><span class="barreMoral${moral < 45 ? ' bas' : moral >= 80 ? ' haut' : ''}"><span style="width:${moral}%"></span></span> ${moral}%</b></div>` +
      `<div class="ligneJoueur"><span>Fatigue</span><b><span class="barreFatigue${fatigue >= 65 ? ' haute' : ''}"><span style="width:${fatigue}%"></span></span> ${fatigue}%</b></div>` +
      ligneProgression +
      `<div class="ligneJoueur"><span>Matchs joués cette saison</span><b>${j.matchsJoues || 0}</b></div>` +
      ligneStatsSaison +
      `<div class="ligneJoueur"><span>Sélection du jour</span><b>${statutCompo}</b></div>` +
      (j.veutPartir ? `<div class="ligneJoueur"><span>Statut</span><b class="texteAlerteJoueur">🚩 Souhaite être transféré (mécontent de son temps de jeu)</b></div>` : '') +
      (j.contrat != null ? `<div class="ligneJoueur"><span>Contrat</span><b>${j.contrat} an(s) restant(s)</b></div>` : '') +
      (j.salaire != null ? `<div class="ligneJoueur"><span>Salaire</span><b>${j.salaire} k€/saison</b></div>` : '') +
      (j.valeurEstimee != null && !ctx.modifiable ? `<div class="ligneJoueur"><span>Valeur de transfert estimée</span><b>${j.valeurEstimee} k€</b></div>` : '') +
      `<div class="ligneJoueur"><span>Disponibilité</span><b>${disponibilite}</b></div>` +
      blocEntrainementIndividuel + actions +
      `<div style="display:flex;gap:8px;margin-top:14px;">` +
      `<button class="alt" id="btnFermerFicheJoueur" style="flex:1;">← Retour à l'effectif</button>` +
      (ctx.modifiable && estEffectifPro ? `<button class="alt warn" id="btnLibererFiche" style="flex:1;">Libérer ce joueur</button>` : '') +
      `</div>`;
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
    // Un écran absent du menu du club affiché ne doit pas non plus être
    // atteignable par un autre chemin (alerte du dashboard, bouton d'un
    // autre écran) : on retombe sur la vue d'ensemble.
    if (RMClub.ongletsDisponibles(saison).indexOf(cle) === -1) cle = 'dashboard';
    ongletActuel = cle;
    document.querySelectorAll('#barreOngletsClub .ongletBtn').forEach((b) => {
      b.classList.toggle('actif', b.dataset.onglet === cle);
    });
    document.querySelectorAll('#clubGestion .voletOnglet').forEach((v) => {
      v.style.display = v.dataset.volet === cle ? '' : 'none';
    });
    // Le sélecteur d'équipe est un composant UNIQUE, déplacé dans l'onglet
    // actif (TODO_AUDIT.md P1-19) — pas une copie par écran. C'est ce qui
    // garantit qu'aucune synchronisation n'est nécessaire entre les écrans :
    // il n'y a littéralement qu'un seul <select> dans le jeu.
    const selecteur = document.getElementById('selecteurEquipe');
    if (selecteur) {
      const volet = document.querySelector(`#clubGestion .voletOnglet[data-volet="${cle}"]`);
      const emplacement = ONGLETS_AVEC_EQUIPE.indexOf(cle) !== -1 && volet
        ? volet.querySelector('.emplacementSelecteurEquipe') : null;
      (emplacement || document.getElementById('porteSelecteurEquipe')).appendChild(selecteur);
      if (emplacement) rafraichirSelecteurEquipe();
    }
    fermerFicheJoueur(); // change d'onglet = referme toute fiche laissée ouverte
    fermerTiroirNav(); // choisir une section referme le tiroir mobile
    document.getElementById('clubMain').scrollTop = 0; // repart en haut de la nouvelle page
  }

  // Groupé par journée (un en-tête toutes les n/2 lignes) : à plat, 30
  // rencontres (championnat complet) étaient impossibles à scanner et
  // noyaient le bouton "Nouvelle saison" tout en bas sous un mur de texte.
  // Écran UNIQUE de calendrier (TODO_AUDIT.md P1-19) : les rencontres de
  // l'équipe sélectionnée, quelle que soit sa compétition (championnat
  // principal, Équipe B, matchs espoirs), avec la même mise en page groupée
  // par journée et la même ligne de résultat.
  function rafraichirCalendrier() {
    const ctx = contexte();
    const zone = document.getElementById('clubCalendrier');
    if (!ctx.calendrier || !ctx.calendrier.length) {
      zone.innerHTML = `<p>${echapperHTML(ctx.motifIndisponible || 'Aucune rencontre programmée pour cette équipe.')}</p>`;
      return;
    }
    const parJournee = {};
    for (const f of ctx.calendrier) (parJournee[f.journee] = parJournee[f.journee] || []).push(f);
    zone.innerHTML = Object.keys(parJournee)
      .sort((a, b) => Number(a) - Number(b))
      .map((j) => {
        const lignes = parJournee[j].map((f) => {
          const attenu = f.joue ? ' style="opacity:.6"' : '';
          return `<div${attenu}>${formaterLigneCalendrier(f, ctx.clubId)}</div>`;
        }).join('');
        return `<div class="blocJournee"><h4>Journée ${j}</h4>${lignes}</div>`;
      }).join('');
  }

  // --- Équipe B : plus d'onglet dédié (TODO_AUDIT.md P1-19). Son effectif,
  // sa composition, sa tactique, son calendrier et son classement passent
  // désormais par les MÊMES écrans que le premier XV, via le sélecteur
  // d'équipe commun — cette fonction n'a plus lieu d'être, son contenu vit
  // dans contexteEquipe() (docs/js/club-equipes.js) et dans les écrans
  // unifiés ci-dessus. ---
  // --- Écosystème mondial (onglet Monde, cf. docs/js/world.js) : 12 pays,
  // leurs pyramides (montées/descentes ou franchises selon le pays) et les
  // compétitions internationales — un module ADDITIF (n'affecte jamais le
  // club du joueur ni ses propres compétitions), avancé automatiquement en
  // même temps que la saison du joueur (cf. resoudreJour/btnSaisonSuivante).
  // Noms fictifs partout, structure inspirée du vrai rugby professionnel. ---
  const SYSTEME_MONDE_LABEL = {
    'promotion-relegation': 'Montées/descentes',
    franchises: 'Franchises (composition fixe)',
    'franchises-provinces': 'Franchises + provinces (composition fixe)',
    provinces: 'Provinces (composition fixe)',
    regions: 'Régions (composition fixe)',
    mixte: 'Mixte',
  };
  let divisionMondeAffichee = null;

  function rafraichirMonde() {
    if (!saison.monde) {
      RMWorld.assurerMonde(creerRng(graineAleatoire()), saison);
      sauvegarder();
    }
    const monde = saison.monde;
    document.getElementById('mondePays').innerHTML = monde.pays.map((pays) => {
      const boutonsDivisions = pays.divisions.map((d) =>
        `<button class="alt btnDivisionMonde" data-ref="${d.ref}" style="flex:0 0 auto;width:auto;padding:6px 10px;font-size:11.5px;">${d.nom}</button>`).join('');
      return `<div class="ligneJeune"><span class="infosJeune"><b>${pays.nom}</b><span>${SYSTEME_MONDE_LABEL[pays.systeme] || pays.systeme}</span></span>` +
        `<span style="display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end;">${boutonsDivisions}</span></div>`;
    }).join('');
    rafraichirInternationalesMonde();
    if (divisionMondeAffichee) ouvrirDivisionMonde(divisionMondeAffichee);
  }

  function ouvrirDivisionMonde(ref) {
    const monde = saison.monde;
    const div = monde && monde.divisions[ref];
    if (!div) return;
    divisionMondeAffichee = ref;
    const classement = RMClub.classementTrieDe(div.classement);
    const zonePromoTexte = (div.promus || div.relegues)
      ? `${div.promus ? `${div.promus} promu(s) (en évidence)` : ''}${div.promus && div.relegues ? ' · ' : ''}${div.relegues ? `${div.relegues} relégué(s) (atténué)` : ''}`
      : 'Composition fixe (pas de montée/descente).';
    const lignes = classement.map((r, i) => {
      const club = div.clubs.find((c) => c.id === r.clubId);
      const zonePromue = div.promus && i < div.promus;
      const zoneRelegable = div.relegues && i >= classement.length - div.relegues;
      const classe = zonePromue ? ' class="ligneClubJoueur"' : zoneRelegable ? ' style="opacity:.6;"' : '';
      const paysClub = club && div.competitionPartagee ? ` <span style="color:var(--text-faint);">(${club.pays})</span>` : '';
      return `<tr${classe}><td>${i + 1}</td><td>${club ? club.nom : '?'}${paysClub}</td><td>${r.j}</td><td>${r.g}</td><td>${r.n}</td><td>${r.p}</td><td><b>${r.pts}</b></td></tr>`;
    }).join('');
    document.getElementById('mondeDivisionTitre').textContent = div.nom;
    document.getElementById('mondeDivisionCorps').innerHTML =
      `<p style="font-size:11.5px;color:var(--text-faint);margin:0 0 8px;">${zonePromoTexte}</p>` +
      `<table class="tableauClub"><thead><tr><th></th><th>Club</th><th>J</th><th>G</th><th>N</th><th>P</th><th>Pts</th></tr></thead><tbody>${lignes}</tbody></table>`;
    document.getElementById('carteMondeDivision').style.display = '';
  }

  function fermerDivisionMonde() {
    divisionMondeAffichee = null;
    document.getElementById('carteMondeDivision').style.display = 'none';
  }

  function rafraichirInternationalesMonde() {
    const monde = saison.monde;
    document.getElementById('mondeInternationales').innerHTML = Object.values(monde.internationales).map((c) => {
      let detail;
      if (c.dernierVainqueur) {
        const paysVainqueur = RMWorld.PAYS.find((p) => p.code === c.dernierVainqueur);
        detail = `Dernier vainqueur : <b>${paysVainqueur ? paysVainqueur.nom : c.dernierVainqueur}</b>`;
      } else if (c.qualifies) {
        detail = `${c.qualifies.length} club(s) qualifié(s) pour la prochaine édition`;
      } else {
        detail = 'Pas encore disputée cette saison mondiale.';
      }
      return `<div class="ligneJeune"><span class="infosJeune"><b>${c.nom}</b><span>${detail}</span></span></div>`;
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

  // N'importe quel joueur peut dépanner à n'importe quel poste (cf.
  // RMClub.meilleurCandidatPourNumero côté données, qui applique la même
  // règle à l'auto-remplissage) — mais les joueurs de ce poste NATUREL
  // apparaissent en premier, les autres regroupés à part (<optgroup>, avec
  // leur poste naturel entre parenthèses pour rester lisible) plutôt que
  // mélangés sans distinction.
  function optionsGroupeesParPoste(candidats, poste, valeurActuelle, etatDe) {
    const naturels = candidats.filter((j) => j.poste === poste);
    const horsPoste = candidats.filter((j) => j.poste !== poste);
    const optionDe = (j, horsPosteFlag) => {
      const selectionne = valeurActuelle === j.id ? ' selected' : '';
      const label = horsPosteFlag ? `${nomCourt(j.nom)} (${j.poste})` : nomCourt(j.nom);
      return `<option value="${j.id}"${selectionne} title="${j.nom}">${label}${etatDe(j)}</option>`;
    };
    const optionsHorsPoste = horsPoste.map((j) => optionDe(j, true)).join('');
    return naturels.map((j) => optionDe(j, false)).join('') +
      (optionsHorsPoste ? `<optgroup label="Autres postes (dépannage)">${optionsHorsPoste}</optgroup>` : '');
  }

  // Écran UNIQUE de composition (TODO_AUDIT.md P1-19) : premier XV, Équipe B,
  // Espoirs ou club adverse — même terrain, mêmes chips, mêmes listes
  // déroulantes. Pour une équipe non dirigée, les MÊMES <select> sont
  // simplement désactivés : le XV affiché est celui qui descend réellement
  // sur le terrain (cf. RMClub.slotAdverse), jamais un écran différent.
  function rafraichirTerrain() {
    const ctx = contexte();
    const effectif = ctx.effectif;
    if (ctx.modifiable) RMClub.assurerCompositionPourEquipe(saison, ctx.type);
    const composition = ctx.slot.compositionTitulaires;
    const inactif = ctx.modifiable ? '' : ' disabled';
    // Un bouton d'action visible sur une équipe non dirigée serait trompeur :
    // masqué plutôt que laissé cliquable sans effet.
    const boutonAuto = document.getElementById('btnCompositionAuto');
    if (boutonAuto) boutonAuto.style.display = ctx.modifiable ? '' : 'none';
    document.getElementById('clubTerrain').innerHTML = Object.keys(RMClub.POSTE_REQUIS).map((numero) => {
      const poste = RMClub.POSTE_REQUIS[numero];
      const pos = POSITIONS_TERRAIN[numero];
      const utiliseAilleurs = new Set(Object.keys(composition)
        .filter((n) => n !== numero).map((n) => composition[n]));
      // Un joueur prêté est une exclusion DURE (comme dans completerComposition/
      // meilleureComposition) — il ne doit pas non plus apparaître dans la
      // liste déroulante manuelle, sinon la sélection interactive contredit
      // l'auto-remplissage et permettrait d'aligner un joueur indisponible.
      const candidats = effectif.filter((j) => !j.pret && !utiliseAilleurs.has(j.id));
      const blesseActuel = effectif.find((j) => j.id === composition[numero] && j.blessureJournees > 0);
      const options = optionsGroupeesParPoste(candidats, poste, composition[numero],
        (j) => j.blessureJournees > 0 ? ` 🤕${j.blessureJournees}j` : ((j.fatigue || 0) >= 65 ? ' ⚡' : ''));
      return `<div class="chipTerrain" style="top:${pos.top}%;left:${pos.left}%;">` +
        `<span class="numChip">N°${numero} ${poste}</span>` +
        `<select data-numero="${numero}"${inactif}${blesseActuel ? ' class="blesseChip"' : ''}>${options}</select></div>`;
    }).join('');
  }

  function rafraichirBanc() {
    const ctx = contexte();
    const effectif = ctx.effectif;
    const slot = ctx.slot;
    const banc = slot.compositionBanc || {};
    const inactif = ctx.modifiable ? '' : ' disabled';
    const titulaireIds = new Set(Object.values(slot.compositionTitulaires || {}));
    // Un club adverse n'a pas de banc modélisé (son effectif fait exactement
    // 15, cf. genererEffectif) : la carte reste le même composant, elle dit
    // simplement que l'information n'existe pas — pas un banc inventé.
    if (!ctx.modifiable) {
      document.getElementById('clubBanc').innerHTML =
        `<p class="noteLectureSeule">🔒 Le banc de ${echapperHTML(ctx.label)} n'est pas connu : seuls les quinze joueurs qui débutent la rencontre sont observables.</p>`;
      return;
    }
    document.getElementById('clubBanc').innerHTML = Object.keys(RMClub.POSTE_REQUIS_BANC).map((numero) => {
      const poste = RMClub.POSTE_REQUIS_BANC[numero];
      const utiliseAilleurs = new Set(Object.keys(banc).filter((n) => n !== numero).map((n) => banc[n]));
      const candidats = effectif.filter((j) => !j.pret && !titulaireIds.has(j.id) && !utiliseAilleurs.has(j.id));
      const options = optionsGroupeesParPoste(candidats, poste, banc[numero],
        (j) => j.blessureJournees > 0 ? ` 🤕${j.blessureJournees}j` : '');
      return `<div class="chipBanc"><span class="numChip">N°${numero} · ${POSTE_COMPLET[poste] || poste}</span>` +
        `<select data-numero="${numero}"${inactif}>${options || '<option value="">—</option>'}</select></div>`;
    }).join('');
  }

  function rafraichirEncadrement() {
    const ctx = contexte();
    const effectif = ctx.effectif;
    const slot = ctx.slot;
    const inactif = ctx.modifiable ? '' : ' disabled';
    const parId = {};
    for (const j of effectif) parId[j.id] = j;
    const titulaires = Object.keys(slot.compositionTitulaires || {})
      .map((n) => ({ numero: n, joueur: parId[slot.compositionTitulaires[n]] }))
      .filter((x) => x.joueur);
    function options(valeurActuelle) {
      return titulaires.map((t) => `<option value="${t.joueur.id}"${t.joueur.id === valeurActuelle ? ' selected' : ''}>N°${t.numero} ${t.joueur.nom}</option>`).join('');
    }
    const noteDeduite = ctx.modifiable ? ''
      : `<p class="noteLectureSeule">🔍 Encadrement <b>déduit</b> de l'effectif de ${echapperHTML(ctx.label)} (meilleur joueur, meilleure adresse au pied, talonneur titulaire) — la désignation réelle de ce club n'est pas publiée.</p>`;
    document.getElementById('clubEncadrement').innerHTML = noteDeduite +
      `<div class="ligneComposition"><span class="numComposition">Capitaine</span><select data-role="capitaineId"${inactif}>${options(slot.capitaineId)}</select></div>` +
      `<div class="ligneComposition"><span class="numComposition">Buteur</span><select data-role="buteurId"${inactif}>${options(slot.buteurId)}</select></div>` +
      `<div class="ligneComposition"><span class="numComposition">Lanceur en touche</span><select data-role="lanceurToucheId"${inactif}>${options(slot.lanceurToucheId)}</select></div>`;
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
  // Écran UNIQUE de personnel (TODO_AUDIT.md P1-19) : l'organigramme
  // appartient au CLUB, donc les 3 équipes du joueur partagent le même staff
  // (un seul médecin, un seul préparateur — c'est la réalité d'un club, pas
  // une donnée manquante). Pour un club adverse, le personnel n'est pas
  // simulé : on le dit clairement au lieu d'inventer un organigramme.
  function rafraichirPersonnel() {
    const ctx = contexte();
    const c = saison.clubJoueur;
    if (!c.personnel) c.personnel = [];
    if (!saison.marchePersonnel) saison.marchePersonnel = [];
    const carteMarche = document.getElementById('cartePersonnelMarche');
    if (carteMarche) carteMarche.style.display = ctx.modifiable ? '' : 'none';
    if (!ctx.personnel) {
      document.getElementById('clubPersonnelActuel').innerHTML =
        `<p class="noteLectureSeule">🔒 L'organigramme de ${echapperHTML(ctx.label)} n'est pas connu : le staff des clubs que tu ne diriges pas n'est pas suivi par tes recruteurs.</p>` +
        Object.keys(RMClub.POSTES_PERSONNEL).map((poste) => {
          const info = RMClub.POSTES_PERSONNEL[poste];
          return `<div class="lignePersonnel"><span class="infosPersonnel"><b class="posteVacant">${info.label} — non connu</b><span>${info.effet}</span></span></div>`;
        }).join('');
      return;
    }
    document.getElementById('clubPersonnelActuel').innerHTML = Object.keys(RMClub.POSTES_PERSONNEL).map((poste) => {
      const info = RMClub.POSTES_PERSONNEL[poste];
      const membre = ctx.personnel.find((p) => p.poste === poste);
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
      `<span class="nomClubAccueil">${echapperHTML(saison.clubJoueur.nom)}</span>` +
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
    // Le centre de formation peut manquer sur une sauvegarde antérieure : il
    // est désormais une équipe à part entière du sélecteur, donc garanti ici
    // (avant, c'était rafraichirCentreFormation qui s'en chargeait).
    // Ces deux structures peuvent manquer sur une sauvegarde antérieure : on
    // les crée ET on persiste immédiatement (avant, c'étaient les écrans
    // dédiés qui s'en chargeaient — ils n'existent plus).
    const aCreeQuelqueChose = !saison.clubJoueur.jeunes || !saison.competitionB;
    if (!saison.clubJoueur.jeunes) RMClub.assurerCentreFormation(creerRng(graineAleatoire()), saison);
    RMClub.assurerCompetitionB(saison);
    if (aCreeQuelqueChose) sauvegarder();
    // Entrer dans le Mode Club ramène toujours sur SON club (l'équipe sur
    // laquelle il travaillait, elle, est conservée) — on ne reprend pas une
    // consultation d'adversaire laissée en cours à la session précédente.
    RMClub.navigationClub(saison).clubConsulteId = saison.clubJoueur.id;
    rafraichirEntete();
    rafraichirMenuOnglets();
    rafraichirVueClub();
    rafraichirTopBarInfos();
    rafraichirProchainMatch();
    rafraichirAgenda();
    rafraichirObjectifSaison();
    rafraichirAdversaire();
    rafraichirMessages();
    rafraichirAutresClubs();
    rafraichirDerniersResultats();
    rafraichirMiniClassement();
    rafraichirAlertes();
    rafraichirStatutEffectif();
    rafraichirMarche();
    rafraichirMonde();
    rafraichirFinancesTab();
    rafraichirMedical();
    rafraichirFatigueTab();
    rafraichirStatsTab();
    rafraichirMarqueurs();
    rafraichirHistoriqueSaisons();
    // Les 6 écrans pilotés par le sélecteur d'équipe commun, d'un bloc
    // (TODO_AUDIT.md P1-19) — ils partagent le même contexte, donc le même
    // rafraîchissement.
    rafraichirEcransEquipe();
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

  // --- Sélecteur d'équipe commun : LE point d'entrée unique pour changer
  // d'équipe affichée, partagé par les 6 écrans (TODO_AUDIT.md P1-19). ---
  document.getElementById('selEquipeContexte').addEventListener('change', (e) => {
    changerEquipe(e.target.value);
  });

  // Nom de club cliquable : UNE seule délégation pour tout le Mode Club
  // (TODO_AUDIT.md P1-20). Tous les noms de clubs, quel que soit l'écran qui
  // les affiche (calendrier, classement, résultats, prochain match, analyse
  // de l'adversaire, liste des autres clubs, fiche joueur, confrontations),
  // passent par ce point unique — la logique n'est dupliquée nulle part.
  document.getElementById('clubGestion').addEventListener('click', (e) => {
    const lien = e.target.closest('.lienClub');
    if (!lien) return;
    e.preventDefault();
    ouvrirClub(lien.dataset.club);
  });
  document.getElementById('clubEntete').addEventListener('click', (e) => {
    if (e.target.closest('#btnRetourMonClub')) retourMonClub();
  });

  // --- Boîte de réception : marquer un message lu au clic, trancher une
  // décision au clic sur un de ses boutons, ou tous marquer lus d'un coup ---
  document.getElementById('clubMessages').addEventListener('click', (e) => {
    const boutonDecision = e.target.closest('.btnDecisionMessage');
    if (boutonDecision) {
      RMClub.resoudreDecisionMessage(saison, boutonDecision.dataset.msg, boutonDecision.dataset.option);
      sauvegarder();
      rafraichirMessages();
      rafraichirEffectif();
      if (joueurAffiche) ouvrirFicheJoueur(joueurAffiche);
      return;
    }
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


  document.getElementById('btnCreerClub').addEventListener('click', () => {
    const nom = document.getElementById('inputNomClub').value.trim();
    const rng = creerRng(graineAleatoire());
    saison = RMClub.nouvelleSaison(rng, nom || null);
    sauvegarder();
    rafraichirTout();
  });

  document.getElementById('btnNouvelleSaisonClub').addEventListener('click', async () => {
    if (!(await confirmerAction('Effacer la saison en cours et repartir de zéro (effectif, budget, historique compris) ?'))) return;
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
  document.getElementById('mondePays').addEventListener('click', (e) => {
    const bouton = e.target.closest('.btnDivisionMonde');
    if (!bouton) return;
    ouvrirDivisionMonde(bouton.dataset.ref);
  });
  document.getElementById('btnFermerMondeDivision').addEventListener('click', fermerDivisionMonde);
  // Fiche joueur : boutons régénérés à chaque ouverture (cf. ouvrirFicheJoueur),
  // délégation sur le conteneur parent plutôt qu'un addEventListener par joueur.
  document.getElementById('clubJoueurDetail').addEventListener('click', async (e) => {
    if (e.target.id === 'btnFermerFicheJoueur') { fermerFicheJoueur(); return; }
    // Offre de transfert sur un joueur d'un club adverse — la fiche est la
    // MÊME que pour ses propres joueurs (TODO_AUDIT.md P1-19), seul ce
    // bouton diffère. L'index attendu par approcherJoueurAdverse est celui
    // du joueur dans l'effectif RÉEL du club adverse (l'id affiché est
    // dérivé, cf. RMClub.effectifAdverseNormalise).
    if (e.target.id === 'btnApprocherJoueurAdverse') {
      const ctx = contexte();
      if (ctx.modifiable || !joueurAffiche) return;
      const adv = ctx.club;
      const index = ctx.effectif.findIndex((x) => x.id === joueurAffiche);
      const joueurCible = adv.effectif[index];
      if (index < 0 || !joueurCible) return;
      const prixDemande = RMClub.calculerPrixDemandeAdverse(joueurCible, adv);
      const montant = await demanderMontant(
        `${joueurCible.nom} (${adv.nom}) — prix demandé estimé : ${prixDemande} k€. Montant de ton offre (k€) :`,
        prixDemande
      );
      if (montant == null) return; // annulé
      const rng = creerRng(graineAleatoire());
      const res = RMClub.approcherJoueurAdverse(rng, saison, adv.id, index, montant);
      if (!res.ok) {
        if (res.motif === 'budget') toast(`Budget insuffisant : il te manque ${montant - saison.clubJoueur.budget} k€.`, 'erreur');
        else if (res.motif === 'refuse') toast(`${adv.nom} refuse ton offre de ${montant} k€ pour ${joueurCible.nom} (prix demandé estimé : ${res.prixDemande} k€). Tente une offre plus généreuse, ou reviens plus tard.`, 'erreur');
        else toast('Transfert impossible.', 'erreur');
        return;
      }
      sauvegarder();
      toast(`✅ ${res.joueur.nom} rejoint le club en provenance de ${adv.nom} (${montant} k€)`);
      fermerFicheJoueur();
      rafraichirEcransEquipe();
      rafraichirStatutEffectif();
      rafraichirTopBarInfos();
      rafraichirAutresClubs();
      return;
    }
    // Promotion d'un espoir : proposée dans la fiche joueur quand c'est le
    // centre de formation qui est affiché — plus une liste "Promouvoir"
    // séparée qui doublonnait l'effectif (TODO_AUDIT.md P1-19).
    if (e.target.id === 'btnPromouvoirEspoir') {
      if (!joueurAffiche) return;
      const jeune = (saison.clubJoueur.jeunes || []).find((x) => x.id === joueurAffiche);
      if (!jeune) return;
      if (!(await confirmerAction(`Promouvoir ${jeune.nom} (${POSTE_COMPLET[jeune.poste] || jeune.poste}, ${jeune.age} ans) en équipe première ? Il quittera définitivement le centre de formation.`))) return;
      RMClub.promouvoirJeune(saison, joueurAffiche);
      sauvegarder();
      toast(`✅ ${jeune.nom} rejoint le groupe professionnel`);
      fermerFicheJoueur();
      rafraichirEcransEquipe();
      rafraichirStatutEffectif();
      return;
    }
    if (e.target.id === 'btnRenouveler') {
      if (!joueurAffiche) return;
      const joueur = saison.clubJoueur.effectif.find((j) => j.id === joueurAffiche);
      if (!joueur) return;
      const offre = RMClub.calculerOffreRenouvellement(joueur);
      const montant = await demanderMontant(
        `Négociation avec ${joueur.nom} — salaire du marché estimé : ${offre.salaire} k€/saison (${offre.dureeMax} an(s)). Salaire annuel proposé (k€) :`,
        offre.salaire
      );
      if (montant == null) return; // annulé
      const rng = creerRng(graineAleatoire());
      const res = RMClub.negocierRenouvellement(rng, saison, joueurAffiche, montant, offre.dureeMax);
      if (!res.ok) {
        toast(`${joueur.nom} refuse ${montant} k€/saison — il vise plutôt autour de ${res.salaireMinimumEstime} k€/saison.`, 'erreur');
        sauvegarder();
        ouvrirFicheJoueur(joueurAffiche);
        return;
      }
      sauvegarder();
      toast(`✅ Contrat renouvelé : ${joueur.nom} (${res.contrat} an(s), ${res.salaire} k€/saison)`);
      ouvrirFicheJoueur(joueurAffiche);
      rafraichirEffectif();
      rafraichirStatutEffectif();
      return;
    }
    if (e.target.id === 'btnPreterJoueur') {
      if (!joueurAffiche) return;
      const joueur = saison.clubJoueur.effectif.find((j) => j.id === joueurAffiche);
      if (!joueur) return;
      if (!(await confirmerAction(`Prêter ${joueur.nom} pour 3 semaines (21 jours) ? Il sera indisponible pour la sélection, contre une indemnité immédiate.`))) return;
      const res = RMClub.preterJoueur(saison, joueurAffiche, 21);
      if (!res.ok) {
        toast(res.motif === 'dernier_du_poste'
          ? "Impossible : c'est le dernier joueur disponible à ce poste — le prêter rendrait la composition impossible à compléter."
          : 'Impossible de prêter ce joueur actuellement.', 'erreur');
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
    if (!joueur || !(await confirmerAction(`Libérer ${joueur.nom} ? Il quittera définitivement l'effectif.`))) return;
    const res = RMClub.libererJoueur(saison, joueurAffiche);
    if (!res.ok) { toast("Impossible : c'est le dernier joueur de ce poste dans l'effectif.", 'erreur'); return; }
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
  // Les deux boutons « Continuer » (celui du tableau de bord et le flottant,
  // toujours visible) avancent la carrière jusqu'à la prochaine échéance —
  // ils ne lancent plus un match directement (TODO_AUDIT.md P1-21).
  document.getElementById('btnJouerMatchClub').addEventListener('click', continuer);
  document.getElementById('btnApercuMatchFlottant').addEventListener('click', continuer);
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
  // Recommandation tactique (TODO_AUDIT.md P1-16) : le bouton vit dans le
  // innerHTML régénéré à chaque ouverture de l'aperçu (cf. rafraichirApercuMatch)
  // — délégation d'événements sur le conteneur, même principe que la boîte
  // de réception (#clubMessages) plus haut.
  document.getElementById('apercuMatchCorps').addEventListener('click', (e) => {
    if (!e.target.closest('#btnAppliquerRecommandations')) return;
    RMClub.appliquerRecommandationsTactique(saison, dernieresRecommandationsTactique);
    sauvegarder();
    rafraichirTactique();
    rafraichirApercuMatch();
    toast('Recommandations tactiques appliquées.');
  });
  document.getElementById('btnApercuLancerMatch').addEventListener('click', () => {
    document.getElementById('panneauApercuMatch').classList.remove('visible');
    document.getElementById('panneauClub').classList.remove('visible');
    resoudreJour('pro');
  });
  // Chaque handler d'édition écrit dans le slot de l'équipe ACTUELLEMENT
  // sélectionnée (TODO_AUDIT.md P1-19) — premier XV, Équipe B ou Espoirs,
  // même code pour les 3 — et ne fait rien du tout sur une équipe que le
  // joueur ne dirige pas (les contrôles sont déjà désactivés côté rendu :
  // c'est la deuxième barrière, pas la seule).
  document.getElementById('btnCompositionAuto').addEventListener('click', () => {
    const ctx = contexte();
    if (!ctx.modifiable) return;
    const effectif = ctx.effectif;
    const slot = ctx.slot;
    slot.compositionTitulaires = RMClub.meilleureComposition(effectif);
    slot.compositionBanc = RMClub.completerCompositionBanc(effectif, slot.compositionTitulaires, {});
    const auto = RMClub.autoDesignerEncadrement(effectif, slot.compositionTitulaires);
    slot.capitaineId = auto.capitaineId; slot.buteurId = auto.buteurId; slot.lanceurToucheId = auto.lanceurToucheId;
    sauvegarder();
    toast('✅ Meilleure équipe possible appliquée');
    rafraichirTerrain(); rafraichirBanc(); rafraichirEncadrement(); rafraichirEffectif();
  });
  document.getElementById('clubTerrain').addEventListener('change', (e) => {
    const numero = e.target.dataset.numero;
    const ctx = contexte();
    if (!numero || !ctx.modifiable) return;
    ctx.slot.compositionTitulaires[numero] = e.target.value;
    sauvegarder();
    rafraichirTerrain(); // ce joueur n'est plus proposé aux autres numéros
    rafraichirBanc(); // peut libérer/consommer un joueur du vivier du banc
    rafraichirEncadrement(); // options dépendantes des titulaires
    rafraichirEffectif(); // badges de rôle et statut de sélection du jour
  });
  document.getElementById('clubBanc').addEventListener('change', (e) => {
    const numero = e.target.dataset.numero;
    const ctx = contexte();
    if (!numero || !ctx.modifiable) return;
    ctx.slot.compositionBanc[numero] = e.target.value;
    sauvegarder();
    rafraichirBanc();
  });
  document.getElementById('clubEncadrement').addEventListener('change', (e) => {
    const role = e.target.dataset.role;
    const ctx = contexte();
    if (!role || !ctx.modifiable) return;
    ctx.slot[role] = e.target.value;
    sauvegarder();
    rafraichirEffectif(); // badges C/BUT/TOU de l'effectif affiché
  });

  // --- Tactique : s'applique à l'équipe actuellement sélectionnée ---
  document.getElementById('clubTactique').addEventListener('click', (e) => {
    const bouton = e.target.closest('[data-axe]');
    const ctx = contexte();
    if (!bouton || !ctx.modifiable) return;
    const slot = ctx.slot;
    if (!slot.tactique || typeof slot.tactique !== 'object') slot.tactique = {};
    slot.tactique[bouton.dataset.axe] = bouton.dataset.valeur;
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
    if (e.target.classList.contains('btnScouter') || e.target.classList.contains('btnSigner')) {
      // cf. commentaire sur `marcheActionVerrouillee` : bloque un 2e clic
      // (Scouter ou Signer, même ligne ou ligne suivante décalée) tant que le
      // court verrou n'a pas expiré — une VRAIE action distincte suivante
      // arrive toujours bien après ce délai.
      if (marcheActionVerrouillee) return;
      marcheActionVerrouillee = true;
      // 1500 ms, pas 800 : sous charge machine réelle (onglet en arrière-plan,
      // portable lent, plusieurs processus concurrents), le setTimeout lui-même
      // peut être retardé bien au-delà de sa durée nominale — observé deux fois
      // dans ce dépôt : une fois sur la vraie infrastructure CI (a bloqué un
      // déploiement, cf. TODO_AUDIT.md P0-12), une fois en local sous charge.
      // Deux actions RÉELLEMENT distinctes du joueur sont, elles, toujours
      // espacées de plusieurs secondes (le temps de regarder la ligne
      // suivante), donc jamais gênées par cette marge plus généreuse.
      setTimeout(() => { marcheActionVerrouillee = false; }, 1500);
    }
    if (e.target.classList.contains('btnScouter')) {
      // Le recruteur (personnel) réduit le coût et augmente le gain de
      // connaissance par action — cf. RMClub.effetPersonnel.
      const res = RMClub.scouterJoueur(saison, id, RMClub.effetPersonnel(saison, 'recruteur'));
      if (!res.ok) { toast('Budget insuffisant pour financer ce repérage.', 'erreur'); return; }
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
    if (!res.ok) { toast('Budget insuffisant pour cette signature.', 'erreur'); return; }
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
    if (!res.ok) { toast(res.motif === 'poste_pourvu' ? 'Ce poste est déjà pourvu : licencie le titulaire pour en recruter un autre.' : 'Recrutement impossible.', 'erreur'); return; }
    sauvegarder();
    toast(`✅ ${candidat ? candidat.nom : 'Recrue'} rejoint le staff`);
    rafraichirPersonnel();
    rafraichirFinancesTab();
  });
  document.getElementById('clubPersonnelActuel').addEventListener('click', async (e) => {
    if (!e.target.classList.contains('btnLicencier')) return;
    if (!(await confirmerAction('Licencier ce membre du personnel ?'))) return;
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
    const ctx = contexte();
    if (!bouton || !ctx.modifiable) return;
    // Le programme est celui du CLUB (un seul staff pour ses 3 équipes) :
    // le modifier depuis n'importe laquelle d'entre elles est cohérent.
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
    // Le monde (12 pays) ne termine sa propre saison que lorsque TOUTES ses
    // divisions ont fini leur calendrier (des tailles très différentes de
    // la ligue du joueur, cf. RMWorld.mondeEstTermine) — sinon il continue
    // simplement à vivre en arrière-plan sur la saison suivante du joueur.
    if (saison.monde && RMWorld.mondeEstTermine(saison.monde)) {
      const resMonde = RMWorld.nouvelleSaisonMonde(rng, saison.monde);
      const lignesMouvements = resMonde.mouvements
        .map((m) => `${m.pays} : ↑ ${m.monte.join(', ') || '—'} · ↓ ${m.descend.join(', ') || '—'}`);
      const lignesNations = resMonde.resultatsNations
        .map((r) => `${r.nom} : ${(RMWorld.PAYS.find((p) => p.code === r.vainqueur) || {}).nom || r.vainqueur} vainqueur`);
      const corpsMonde = [...lignesMouvements, ...lignesNations].join('\n');
      if (corpsMonde) RMClub.ajouterMessage(saison, 'monde', 'Bilan du monde du rugby', corpsMonde);
    }
    sauvegarder();
    rafraichirTout();
    const resume = [
      partis.length ? `Départs (${partis.length}) : ${partis.map((p) => `${p.nom} (${p.motif})`).join(', ')}` : null,
      arrivees.length ? `Arrivées (${arrivees.length}) : ${arrivees.map((a) => a.nom).join(', ')}` : null,
    ].filter(Boolean).join('\n\n');
    afficherInfo(`Saison ${saison.numero} !`, resume || 'Effectif inchangé.');
  });

  // Active/désactive les boutons qui déclenchent une journée pendant
  // qu'une simulation tourne déjà (audit P1, anti-double-action) — en plus
  // du verrou `journeeEnCours` (la protection réelle contre la ré-entrée),
  // demandé explicitement : un bouton visible doit refléter qu'il n'est pas
  // utilisable plutôt que de rester cliquable en apparence.
  function definirBoutonsJourneeActifs(actif) {
    for (const id of ['btnJouerMatchClub', 'btnApercuMatchFlottant', 'btnApercuLancerMatch']) {
      const el = document.getElementById(id);
      if (el) el.disabled = !actif;
    }
  }

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
  // Résout LE JOUR COURANT (TODO_AUDIT.md P1-21). `typeJour` vaut 'pro'
  // (samedi de championnat), 'b' (dimanche d'Équipe B) ou 'jeunes'
  // (mercredi de match espoirs) : chaque jour ne résout QUE ce qui lui
  // revient, au lieu de tout enchaîner en un seul clic. Le calendrier
  // décide, plus le bouton.
  function resoudreJour(typeJour) {
    // Verrou anti-double-action : voir le commentaire sur `journeeEnCours`
    // plus haut. Bloque toute ré-entrée tant que le jour précédent n'est
    // pas résolu (le callback de fin, plus bas, relâche le verrou).
    if (journeeEnCours) return;
    const fixtures = RMClub.prochainesFixtures(saison);
    if (fixtures.length === 0) return;
    const matchJoueur = fixtures.find(concerneClubJoueur);
    // Garde-fou : bloque le lancement (avec une explication précise) si la
    // composition ne peut pas être complétée — par exemple tous les joueurs
    // d'un poste indisponibles (prêtés) — plutôt que d'envoyer une config
    // incomplète au moteur (cf. RMClub.validerComposition).
    if (typeJour === 'pro' && matchJoueur) {
      assurerComposition();
      const manquants = RMClub.validerComposition(saison.clubJoueur.compositionTitulaires);
      if (manquants.length > 0) {
        const libelles = manquants.map((m) => `N°${m.numero} (${POSTE_COMPLET[m.poste] || m.poste})`).join(', ');
        toast(`Impossible de jouer le match : aucun joueur disponible pour ${libelles}. Rappelle un joueur prêté ou ajuste ton effectif.`, 'erreur');
        return;
      }
    }
    journeeEnCours = true;
    definirBoutonsJourneeActifs(false);
    const autresMatchs = fixtures.filter((f) => f !== matchJoueur);
    const duree = Number(document.getElementById('selDureeClub').value) || 4800;
    document.getElementById('panneauClub').classList.remove('visible');

    // Le monde (12 pays, cf. docs/js/world.js) et les 2 autres paliers de la
    // pyramide française avancent d'une journée à chaque journée de
    // CHAMPIONNAT réellement jouée — exactement la même cadence qu'avant le
    // passage au calendrier daté (une journée de championnat par semaine).
    // Ils sont créés ici s'ils n'existent pas encore : leur progression ne
    // dépend PLUS de l'ouverture de l'onglet Monde (limite corrigée en
    // TODO_AUDIT.md P1-21).
    if (typeJour === 'pro') {
      RMWorld.assurerMonde(creerRng(graineDuJour('monde')), saison);
      RMWorld.avancerJourneeMonde(creerRng(graineDuJour('mondeJournee')), saison.monde, null);
      RMClub.avancerJourneeAutresDivisionsFrance(
        creerRng(graineDuJour('paliers')),
        RMClub.assurerAutresDivisionsFrance(creerRng(graineDuJour('paliersCreation')), saison)
      );
    }

    // Forme du club du joueur pour CE match (avant enregistrement du résultat) —
    // sert au calcul des finances (recette boostée en cas de victoire).
    function formeApres(f, scoreA, scoreB) {
      const domicileEstJoueur = estClubJoueur(f.domicileId);
      const pour = domicileEstJoueur ? scoreA : scoreB;
      const contre = domicileEstJoueur ? scoreB : scoreA;
      return pour > contre ? 'v' : pour < contre ? 'd' : 'n';
    }

    function lancerMatchJoueur() {
      // calendrier à nombre pair de clubs : ne devrait pas arriver. Relâche
      // quand même le verrou anti-double-action (sinon la journée suivante
      // resterait bloquée indéfiniment, onResultat n'étant jamais atteint).
      if (!matchJoueur) { journeeEnCours = false; definirBoutonsJourneeActifs(true); return; }
      const clubDomicile = RMClub.club(saison, matchJoueur.domicileId);
      const clubExterieur = RMClub.club(saison, matchJoueur.exterieurId);
      assurerComposition();
      const compositionUtilisee = saison.clubJoueur.compositionTitulaires;
      // La tactique choisie (cf. onglet Tactique) et l'encadrement (buteur,
      // lanceur en touche) ne s'appliquent QU'au club du joueur, jamais à
      // l'IA adverse — d'où le suffixe A/B dynamique selon le côté du joueur
      // pour ce match précis (domicile/extérieur alterne).
      const lettreJoueur = estClubJoueur(matchJoueur.domicileId) ? 'A' : 'B';
      const tactiqueCfg = construireTactiqueCfg(saison.clubJoueur.effectif, saison.clubJoueur, lettreJoueur);
      const remplacements = tactiqueCfg.remplacements || [];
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
            const mouvement = RMClub.appliquerFinancesMatch(saison.clubJoueur, forme, RMClub.nombreJourneesSaison(saison.calendrier));
            RMClub.enregistrerMouvementFinances(saison.clubJoueur, matchJoueur.journee, mouvement);
            RMClub.accumulerStats(saison.clubJoueur, etat.stats[lettreJoueur]);
            // Remplacements RÉELLEMENT survenus (leur minute peut dépasser la
            // durée du match choisie, ex. démo courte — dans ce cas ils ne se
            // sont jamais produits dans le moteur, donc ne comptent pas ici
            // non plus) : le remplaçant compte comme ayant joué (fatigue,
            // moral, temps de jeu) au même titre que les titulaires — le
            // titulaire qu'il a remplacé aussi, il a bien joué une partie du
            // match. Cf. RMClub.remplacementsVersConfig.
            const compositionAvecRemplacants = Object.assign({}, compositionUtilisee);
            for (const r of remplacements) {
              if (r.minute * 60 <= duree) compositionAvecRemplacants[r.numeroBanc] = r.joueurId;
            }
            // Limitation connue (documentée en ROADMAP_FOOTBALL_MANAGER.md) :
            // le moteur indexe ses statistiques par NUMÉRO de maillot, pas par
            // identité de joueur (cf. engine/rugby-engine.js, _statJoueur) —
            // tout le match reste donc attribué au titulaire d'origine, y
            // compris les actions du remplaçant après son entrée. D'où
            // `compositionUtilisee` (pas `compositionAvecRemplacants`) ici :
            // ajouter les entrées banc n'aurait aucun effet (statsJoueursMatch
            // n'a pas de clé 16-23) mais laisserait croire, à tort, que les
            // stats sont bien réparties.
            RMClub.accumulerStatsJoueurs(saison.clubJoueur.effectif, compositionUtilisee, etat.statsJoueurs && etat.statsJoueurs[lettreJoueur]);
            // Effets réels du personnel (cf. RMClub.effetPersonnel) : le
            // médecin/l'entraîneur accélèrent (facteur >=1 direct), le
            // préparateur physique réduit la fatigue (facteur <1, donc
            // l'inverse de effetPersonnel qui exprime une qualité >=1).
            RMClub.faireProgresserBlessures(creerRng(graineAleatoire()), saison.clubJoueur.effectif, compositionAvecRemplacants, RMClub.effetPersonnel(saison, 'medecin'), saison);
            RMClub.appliquerFatigue(saison.clubJoueur.effectif, compositionAvecRemplacants, 1 / RMClub.effetPersonnel(saison, 'preparateur'));
            RMClub.appliquerMoral(saison.clubJoueur.effectif, compositionAvecRemplacants, forme);
            RMClub.appliquerEntrainement(creerRng(graineAleatoire()), saison.clubJoueur.effectif, saison.clubJoueur.entrainementFocus, RMClub.effetPersonnel(saison, 'entraineur'));
            RMClub.appliquerFrustrationTempsDeJeu(saison, compositionUtilisee, saison.clubJoueur.compositionBanc);
            sauvegarder();
            // La journée est résolue : relâche le verrou anti-double-action
            // (cf. `journeeEnCours` plus haut) — la prochaine journée peut
            // être lancée normalement.
            journeeEnCours = false;
            definirBoutonsJourneeActifs(true);
            // NE PAS réinitialiser la config ici : ce callback tourne dès que
            // le résultat est connu, AVANT même que le joueur ait vu l'écran
            // "Match terminé" — effacer joueursA/joueursB/tactique maintenant
            // ferait que "Voir le match" (choix ultérieur du joueur) rejoue
            // avec la config par défaut du moteur au lieu de la composition
            // réellement utilisée, donnant un déroulé différent du résultat
            // déjà annoncé. La remise à zéro se fait uniquement en démarrant
            // un vrai Match rapide (cf. main.js, reinitialiserConfigClub).
          },
          onFermer() {
            rafraichirTout();
            document.getElementById('panneauClub').classList.add('visible');
          },
        }
      );
    }

    // Résout les autres rencontres de la journée (celles qui ne concernent
    // pas le club du joueur) de façon ABSTRAITE — formule statistique
    // dérivée du niveau RÉEL de chaque club (cf. RMWorld.simulerResultatAbstrait,
    // même principe que l'écosystème mondial, docs/js/world.js), pas le
    // moteur physique complet. Une vraie division de championnat (jusqu'à 15
    // adversaires selon le palier, cf. TAILLE_DIVISION_FRANCE) représenterait
    // sinon des dizaines de matchs à simuler par journée avec le moteur
    // complet (~3,5s chacun mesuré) : injouable. SEUL le match du club du
    // joueur reste simulé avec le vrai moteur, exactement comme avant.
    function simulerAutresMatchsAbstrait() {
      const rng = creerRng(graineAleatoire());
      for (const f of autresMatchs) {
        const clubA = RMClub.club(saison, f.domicileId);
        const clubB = RMClub.club(saison, f.exterieurId);
        const r = RMWorld.simulerResultatAbstrait(rng, clubA.niveauClub, clubB.niveauClub);
        RMClub.enregistrerResultat(saison, f.id, r.scoreA, r.scoreB, r.essaisA, r.essaisB);
      }
      sauvegarder();
    }

    // Journée d'Équipe B (championnat réservé aux clubs les plus riches, cf.
    // RMClub.determinerEligiblesEquipeB) : même traitement en arrière-plan
    // que les rencontres IA-IA ci-dessus, avancée automatiquement en même
    // temps que la journée principale. L'équipe B du club du joueur est
    // composée à la volée (réservistes du jour + centre de formation, cf.
    // RMClub.effectifDisponiblePourEquipeB) ; si le vivier ne suffit pas à
    // couvrir les 15 postes ce jour-là (cas rare), la rencontre est passée
    // plutôt que d'envoyer une composition incomplète au moteur.
    function simulerRondeEquipeB(i, suite) {
      const rondeB = RMClub.prochaineRondeEquipeB(saison);
      if (i >= rondeB.length) { suite(); return; }
      const f = rondeB[i];
      const idJoueur = saison.clubJoueur.id;
      const concerneJoueur = f.domicileId === idJoueur || f.exterieurId === idJoueur;
      if (!concerneJoueur) {
        // Rencontre d'équipe B qui ne concerne pas le club du joueur :
        // résolution ABSTRAITE (même principe que simulerAutresMatchsAbstrait
        // ci-dessus) — inutile de payer le coût du moteur complet pour un
        // match que le joueur ne voit jamais.
        const rng = creerRng(graineAleatoire());
        const clubA = RMClub.club(saison, f.domicileId), clubB = RMClub.club(saison, f.exterieurId);
        const r = RMWorld.simulerResultatAbstrait(rng, clubA.niveauClub, clubB.niveauClub);
        RMClub.enregistrerResultatEquipeB(saison, f.id, r.scoreA, r.scoreB, r.essaisA, r.essaisB);
        simulerRondeEquipeB(i + 1, suite);
        return;
      }
      // Équipe gérée (TODO_AUDIT.md P1-18) : même mécanique que le premier XV
      // — composition/tactique/banc RÉELLEMENT choisis par le joueur dans les
      // onglets Composition/Tactique (équipe "b"), auto-complétés s'il n'a
      // rien touché (comportement historique préservé pour qui ne gère pas
      // l'Équipe B en détail).
      const effectifB = RMClub.effectifPourEquipe(saison, 'b');
      const slotB = RMClub.assurerCompositionPourEquipe(saison, 'b');
      const compositionJoueur = slotB.compositionTitulaires;
      if (RMClub.validerComposition(compositionJoueur).length > 0) { simulerRondeEquipeB(i + 1, suite); return; }
      const lettreB = estClubJoueur(f.domicileId) ? 'A' : 'B';
      const tactiqueCfgB = construireTactiqueCfg(effectifB, slotB, lettreB);
      const rng = creerRng(graineAleatoire());
      function cfgDe(clubId) {
        if (clubId === idJoueur) return RMClub.compositionVersJoueursCfg(effectifB, compositionJoueur);
        const clubAdverse = RMClub.club(saison, clubId);
        const niveauB = Math.max(0.1, (clubAdverse.niveauClub != null ? clubAdverse.niveauClub : 0.5) * 0.65);
        return RMClub.effectifVersJoueursCfg({ effectif: RMClub.genererEffectif(rng, niveauB) });
      }
      const clubDomicile = RMClub.club(saison, f.domicileId);
      const clubExterieur = RMClub.club(saison, f.exterieurId);
      window.RMMain.simulerMatchEnArrierePlan(
        graineAleatoire(), duree,
        cfgDe(f.domicileId), cfgDe(f.exterieurId),
        `Équipe B : ${clubDomicile.nom} vs ${clubExterieur.nom}`,
        (etat) => {
          RMClub.enregistrerResultatEquipeB(saison, f.id, etat.score.A, etat.score.B, etat.stats.A.essais, etat.stats.B.essais);
          RMClub.appliquerEffetsMatchEquipeB(saison, compositionJoueur);
          // Recette de billetterie réelle mais modeste (pas de salaires
          // redéduits ici : déjà comptés une fois par journée via le match
          // du premier XV, cf. appliquerFinancesMatchEquipeB).
          const mouvementB = RMClub.appliquerFinancesMatchEquipeB(saison.clubJoueur, formeApres(f, etat.score.A, etat.score.B));
          RMClub.enregistrerMouvementFinances(saison.clubJoueur, f.journee, mouvementB);
          sauvegarder();
          simulerRondeEquipeB(i + 1, suite);
        },
        tactiqueCfgB
      );
    }

    // Match espoirs (audit "pas de tournois junior", cf. club-espoirs.js) :
    // une journée sur RMClub.PERIODE_JOURNEES_ESPOIRS, le centre de
    // formation affronte une académie adverse synthétique — réellement
    // simulé par le moteur complet, jamais un résultat fabriqué. Contrairement
    // à l'Équipe B, aucune compétition à classement multi-clubs (donner un
    // centre de formation à chaque club IA est hors périmètre de cette
    // première tranche) : un match ponctuel, comme un vrai match amical.
    function simulerMatchEspoirs(suite) {
      if (!matchJoueur || !RMClub.journeeDeMatchEspoirs(matchJoueur.journee) || !RMClub.eligiblePourMatchEspoirs(saison)) {
        suite();
        return;
      }
      // Équipe gérée (TODO_AUDIT.md P1-18) : même mécanique que le premier XV
      // et l'Équipe B — composition/tactique/banc réellement choisis dans les
      // onglets Composition/Tactique (équipe "jeunes"), auto-complétés si le
      // joueur n'a rien touché.
      const effectifEspoirs = RMClub.effectifPourEquipe(saison, 'jeunes');
      const slotEspoirs = RMClub.assurerCompositionPourEquipe(saison, 'jeunes');
      const compositionEspoirs = slotEspoirs.compositionTitulaires;
      const tactiqueCfgEspoirs = construireTactiqueCfg(effectifEspoirs, slotEspoirs, 'A');
      const rng = creerRng(graineAleatoire());
      const adversaireId = estClubJoueur(matchJoueur.domicileId) ? matchJoueur.exterieurId : matchJoueur.domicileId;
      const clubAdverse = RMClub.club(saison, adversaireId);
      const niveauAdv = RMClub.niveauAdversaireEspoirs(clubAdverse.niveauClub);
      const cfgJoueur = RMClub.compositionVersJoueursCfg(effectifEspoirs, compositionEspoirs);
      const cfgAdverse = RMClub.effectifVersJoueursCfg({ effectif: RMClub.genererEffectif(rng, niveauAdv) });
      window.RMMain.simulerMatchEnArrierePlan(
        graineAleatoire(), duree,
        cfgJoueur, cfgAdverse,
        `Espoirs : ${saison.clubJoueur.nom} vs Académie ${clubAdverse.nom}`,
        (etat) => {
          RMClub.appliquerEffetsMatchEspoirs(saison, compositionEspoirs);
          // Résultat ARCHIVÉ (TODO_AUDIT.md P1-19) : jusqu'ici il ne vivait
          // que dans un message de la boîte de réception, donc l'écran
          // Calendrier & classement n'avait rien à montrer pour les espoirs.
          // Le score enregistré est celui réellement produit par le moteur.
          RMClub.enregistrerMatchEspoirs(saison, matchJoueur.journee, clubAdverse.nom, etat.score.A, etat.score.B);
          const forme = etat.score.A > etat.score.B ? 'v' : etat.score.A < etat.score.B ? 'd' : 'n';
          const verbe = forme === 'v' ? 'battent' : forme === 'd' ? "s'inclinent face à" : 'font match nul avec';
          RMClub.ajouterMessage(saison, 'jeunes', 'Match espoirs',
            `Tes espoirs ${verbe} l'académie de ${clubAdverse.nom} (${etat.score.A} - ${etat.score.B}).`);
          sauvegarder();
          suite();
        },
        tactiqueCfgEspoirs
      );
    }

    // Fin de jour pour les rencontres résolues en arrière-plan (Équipe B,
    // espoirs) : referme l'écran de génération, relâche le verrou et rend la
    // main au Mode Club — le match du premier XV, lui, passe par l'écran de
    // résultat puis son propre `onFermer`.
    function terminerJourEnArrierePlan() {
      sauvegarder();
      journeeEnCours = false;
      definirBoutonsJourneeActifs(true);
      document.getElementById('panneauGeneration').classList.remove('visible');
      rafraichirTout();
      document.getElementById('panneauClub').classList.add('visible');
    }

    if (typeJour === 'jeunes') { simulerMatchEspoirs(terminerJourEnArrierePlan); return; }
    if (typeJour === 'b') { simulerRondeEquipeB(0, terminerJourEnArrierePlan); return; }
    // Jour de championnat : les autres rencontres de la journée se résolvent
    // en abstrait, puis le match du club du joueur avec le vrai moteur.
    simulerAutresMatchsAbstrait();
    lancerMatchJoueur();
  }

  // Retour visuel après un « Continuer » — strictement limité à ce qui a
  // réellement changé dans la sauvegarde (TODO_AUDIT.md P1-22) : aucun
  // message n'est produit si rien ne s'est passé.
  function annoncerJoursEcoules(resume) {
    if (!resume || !resume.nbJours) return;
    if (resume.retablis.length) {
      toast(`🩹 ${resume.retablis.join(', ')} de retour de blessure`);
    }
    if (resume.retoursDePret.length) {
      toast(`📥 ${resume.retoursDePret.join(', ')} revient de prêt`);
    }
  }

  // --- « Continuer » : LE bouton principal de la carrière (TODO_AUDIT.md
  // P1-21). Un clic avance la date jusqu'à la prochaine échéance qui demande
  // l'attention du manager — jamais au-delà, donc aucun match ne peut être
  // joué avant sa date. Idempotent : recliquer un jour de match rouvre sa
  // préparation au lieu de le sauter (cf. RMClub.prochainArret, qui inclut
  // le jour courant). ---
  function continuer() {
    if (journeeEnCours) return;
    const arret = RMClub.prochainArret(saison);
    if (!arret) {
      // Plus aucune rencontre : la saison sportive est terminée.
      document.getElementById('btnSaisonSuivante').click();
      return;
    }
    // La carrière avance RÉELLEMENT jour par jour jusqu'à l'échéance
    // (TODO_AUDIT.md P1-22) : chaque journée traversée est simulée —
    // récupération, guérison des blessures, retours de prêt — au lieu d'être
    // sautée. Puis le jour d'échéance se résout.
    const journees = RMClub.avancerJusquA(saison, arret.date);
    const resume = RMClub.resumerJournees(journees);
    sauvegarder();
    rafraichirTopBarInfos();
    rafraichirProchainMatch();
    rafraichirAgenda();
    annoncerJoursEcoules(resume);
    if (arret.type === 'pro') { ouvrirApercuMatch(); return; }
    document.getElementById('panneauClub').classList.remove('visible');
    resoudreJour(arret.type);
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

    // Remplacements prévus (TODO_AUDIT.md P1-17) : le banc de 8 était
    // purement cosmétique jusqu'ici, jamais transmis au moteur — visible ici
    // AVANT le coup d'envoi (pas seulement dans le fil d'événements du match),
    // filtré sur la durée réellement choisie (une démo courte peut ne
    // déclencher aucun remplacement, comme un vrai match écourté).
    const dureeChoisie = Number(document.getElementById('selDureeClub').value) || 4800;
    const remplacementsPrevus = RMClub.remplacementsVersConfig(c.effectif, c.compositionBanc, domicile ? 'A' : 'B')
      .filter((r) => r.minute * 60 <= dureeChoisie);
    const remplacementsHTML = remplacementsPrevus.length
      ? `<div class="carteClub"><h3>🔄 Remplacements prévus</h3>` +
        remplacementsPrevus.map((r) => `<div class="ligneJoueur"><span>${r.joueur.nom} (n°${r.numero})</span><b>${r.minute}e minute</b></div>`).join('') +
        `</div>`
      : '';

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

    // Recommandation tactique (TODO_AUDIT.md P1-16) : relie enfin l'analyse
    // ci-dessus à un vrai réglage actionnable des 6 axes tactiques, plutôt
    // que de laisser le joueur interpréter seul les écarts.
    dernieresRecommandationsTactique = RMClub.recommanderTactique(analyse);
    const recommandationsHTML = dernieresRecommandationsTactique.length
      ? `<div class="carteClub"><h3>💡 Recommandation tactique</h3>` +
        dernieresRecommandationsTactique.map((r) => `<p class="raisonRecommandation">${r.raison}</p>`).join('') +
        `<button class="accent" id="btnAppliquerRecommandations" style="width:100%;margin-top:8px;">Appliquer les recommandations</button></div>`
      : '';

    corps.innerHTML =
      `<div class="carteClub"><h3>🆚 ${domicile ? `${echapperHTML(c.nom)} — ${echapperHTML(analyse.nom)}` : `${echapperHTML(analyse.nom)} — ${echapperHTML(c.nom)}`}</h3>` +
      `<p style="font-size:12px;color:var(--text-dim);margin:0 0 10px;">Journée ${matchJoueur.journee} · ${domicile ? 'À domicile' : 'À l\'extérieur'} · ${analyse.position}${analyse.position === 1 ? 'er' : 'e'}/${analyse.totalClubs} au classement</p>` +
      `<div class="ligneJoueur"><span>Ma forme</span><b>${formeTxt(maForme)}</b></div>` +
      `<div class="ligneJoueur"><span>Leur forme</span><b>${formeTxt(analyse.forme)}</b></div></div>` +
      `<div class="carteClub"><h3>📋 Ma composition</h3>` +
      `<div class="ligneJoueur"><span>Capitaine</span><b>${capitaine ? capitaine.nom : '—'}</b></div>` +
      (alertesCompo.length
        ? alertesCompo.map((a) => `<p style="font-size:12px;color:var(--loss);margin:6px 0;">${a}</p>`).join('')
        : '<p style="font-size:12px;color:var(--text-dim);margin:6px 0;">Aucun problème d\'effectif détecté pour ce match.</p>') +
      `</div>` +
      remplacementsHTML +
      `<div class="carteClub"><h3>🎯 Ma tactique</h3>${tactiqueLignes}</div>` +
      `<div class="carteClub"><h3>🔍 Analyse de l'adversaire</h3>` +
      (puces ? `<div class="listeQualitatif">${puces}</div>` : '<p style="font-size:12px;color:var(--text-faint);margin:0;">Aucun écart marqué avec ton effectif.</p>') +
      `</div>` +
      recommandationsHTML;
  }

  function ouvrirApercuMatch() {
    const fixtures = RMClub.prochainesFixtures(saison);
    if (fixtures.length === 0) { document.getElementById('btnSaisonSuivante').click(); return; }
    rafraichirApercuMatch();
    document.getElementById('panneauApercuMatch').classList.add('visible');
  }

  // Échap referme le calque actuellement ouvert (le plus "au-dessus" en
  // premier) — aucun des panneaux du Mode Club n'écoutait le clavier jusqu'ici,
  // seul le clic sur leur bouton dédié fonctionnait.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      const modaleOuverte = modaleOuverteActuelle();
      if (!modaleOuverte) return;
      const focusables = elementsFocusables(modaleOuverte);
      if (!focusables.length) { e.preventDefault(); return; }
      const premier = focusables[0];
      const dernier = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === premier) {
        e.preventDefault();
        dernier.focus();
      } else if (!e.shiftKey && document.activeElement === dernier) {
        e.preventDefault();
        premier.focus();
      }
      return;
    }
    if (e.key !== 'Escape') return;
    if (document.getElementById('modalInfo').classList.contains('visible')) { fermerInfo(); return; }
    if (document.getElementById('modalMontant').classList.contains('visible')) { fermerMontant(null); return; }
    if (document.getElementById('modalConfirmation').classList.contains('visible')) { fermerConfirmation(false); return; }
    const apercu = document.getElementById('panneauApercuMatch');
    if (apercu.classList.contains('visible')) { apercu.classList.remove('visible'); return; }
    if (document.getElementById('barreOngletsClub').classList.contains('ouvert')) { fermerTiroirNav(); return; }
    if (joueurAffiche) { fermerFicheJoueur(); return; }
    // Échap depuis un club consulté ramène à son propre club — même geste
    // que le bouton "← Retour à mon club".
    if (!RMClub.consulteClubJoueur(saison)) { retourMonClub(); return; }
  });

  document.getElementById('modalConfirmationValider').addEventListener('click', () => fermerConfirmation(true));
  document.getElementById('modalConfirmationAnnuler').addEventListener('click', () => fermerConfirmation(false));
  document.getElementById('modalConfirmation').addEventListener('click', (e) => {
    if (e.target.id === 'modalConfirmation') fermerConfirmation(false); // clic sur le fond assombri = annuler
  });

  document.getElementById('modalMontantValider').addEventListener('click', validerMontant);
  document.getElementById('modalMontantAnnuler').addEventListener('click', () => fermerMontant(null));
  document.getElementById('modalMontant').addEventListener('click', (e) => {
    if (e.target.id === 'modalMontant') fermerMontant(null); // clic sur le fond assombri = annuler
  });
  document.getElementById('modalMontantInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); validerMontant(); }
  });

  document.getElementById('modalInfoValider').addEventListener('click', fermerInfo);
  document.getElementById('modalInfo').addEventListener('click', (e) => {
    if (e.target.id === 'modalInfo') fermerInfo(); // clic sur le fond assombri = OK
  });

  rafraichirTout();

  // Audit P0-2 (TODO_AUDIT.md) : si une sauvegarde n'a pas pu être chargée
  // (version sans migration connue, JSON corrompu, schéma invalide), le
  // joueur ne doit jamais croire qu'il n'a simplement jamais eu de carrière
  // — une copie de secours existe (cf. RMClub.consulterAvertissementChargement)
  // et on le dit clairement, une seule fois.
  const RAISON_AVERTISSEMENT_LABEL = {
    version_sans_migration: 'elle vient d\'un format de sauvegarde différent de celui attendu',
    json_invalide: 'les données étaient corrompues',
    schema_invalide: 'les données étaient incomplètes',
    boucle_migration: 'la mise à jour du format a échoué',
    version_incoherente: 'la mise à jour du format a échoué',
  };
  const avertissementChargement = RMClub.consulterAvertissementChargement();
  if (avertissementChargement) {
    RMClub.effacerAvertissementChargement();
    const raison = RAISON_AVERTISSEMENT_LABEL[avertissementChargement.raison] || 'un problème est survenu';
    afficherInfo(
      '⚠️ Ancienne carrière non rechargée',
      `Ton ancienne carrière n'a pas pu être rechargée automatiquement (${raison}).\n\n` +
      'Rien n\'a été supprimé : une copie de secours de tes données a été conservée dans le stockage de ton navigateur. ' +
      'Contacte le support avec le nom de ton club si tu veux la récupérer.'
    );
  }
})();
