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
  // Verrou court des DEUX boutons d'avance (TODO_AUDIT.md P1-26). Jusqu'ici
  // « Continuer » se protégeait tout seul : il visait toujours la même
  // échéance, donc un second clic ne faisait rien (avance de 0 jour). Depuis
  // qu'une avance s'ARRÊTE sur le premier événement rencontré, ce n'est plus
  // vrai : un double clic enchaînerait deux avances et le joueur ne verrait
  // jamais l'événement qui a interrompu la première. Même mécanique et même
  // délai que `marcheActionVerrouillee` (cf. son commentaire détaillé).
  let avanceVerrouillee = false;
  function verrouillerAvance() {
    if (avanceVerrouillee) return false;
    avanceVerrouillee = true;
    // 350 ms, pas 1500 comme le marché des transferts : ici le joueur a de
    // bonnes raisons de recliquer vite (avancer plusieurs fois d'affilée). On
    // ne bloque donc que le double-déclenchement quasi instantané — celui qui
    // ferait défiler un événement sans jamais l'afficher.
    setTimeout(() => { avanceVerrouillee = false; }, 350);
    return true;
  }

  // LIGNE D'INFORMATION — le composant le plus utilisé de l'interface.
  //
  // Il existait sous DEUX formes incompatibles, construites à la main partout :
  //   `${ligneInfo(`X`, `Y`)}`      (95 fois)
  //   `${ligneInfo(`X`, `Y`, { compact: true })}` (11 fois)
  // Deux classes CSS quasi identiques (flex, space-between, 13 px), deux
  // conventions de balisage pour la même information, et 106 chaînes à
  // maintenir une par une. `opts.etat` remplace les variantes `alerte` /
  // `critique` / `deltaNegatif` éparpillées.
  //
  // `label` et `valeur` sont insérés TELS QUELS : les appelants passent déjà
  // du HTML construit (icônes, badges, texte échappé). Utiliser
  // `echapperHTML()` sur les données brutes reste à leur charge, comme avant.
  function ligneInfo(label, valeur, opts) {
    const o = opts || {};
    const classes = 'ligneInfo' + (o.compact ? ' compact' : '');
    const etat = o.etat ? ` class="${o.etat}"` : '';
    const titre = o.titre ? ` title="${o.titre}"` : '';
    return `<div class="${classes}"${titre}><span>${label}</span><b${etat}>${valeur}</b></div>`;
  }

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
    // Sauteurs désignés (P1-50) : FUSIONNÉS dans la config de touche déjà
    // posée par l'axe tactique « touche/maul » — l'écraser ferait perdre le
    // réglage de maul. `null` quand rien n'est désigné : le moteur garde son
    // pool par défaut (4-8).
    const sauteurs = RMClub.sauteursVersConfigSlot
      ? RMClub.sauteursVersConfigSlot(slot)
      : null;
    if (sauteurs) {
      const cle = 'touche' + lettreEquipe;
      tactiqueCfg[cle] = Object.assign({}, tactiqueCfg[cle] || null, { sauteurs });
    }
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

  // 7 axes INDÉPENDANTS qui se combinent (cf. RMClub.AXES_TACTIQUE) — pas un
  // choix unique parmi des templates figés : le joueur compose sa tactique
  // comme les instructions d'équipe d'un vrai jeu de gestion. La boucle
  // s'adapte automatiquement au nombre d'axes définis côté modèle.
  // Écran UNIQUE de tactique (TODO_AUDIT.md P1-19) : premier XV, Équipe B,
  // Espoirs ou club adverse — mêmes 7 axes, même présentation, mêmes
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
  // Semaine d'entraînement (TODO_AUDIT.md P1-23) : une ligne par jour, avec
  // la séance choisie. Le jour de match du premier XV est signalé comme tel —
  // il n'a pas de séance, le match EST la charge du jour.
  const NOMS_JOURS_SEMAINE = [1, 2, 3, 4, 5, 6, 0]; // affichés du lundi au dimanche
  function rafraichirSemaineEntrainement() {
    const ctx = contexte();
    const carte = document.getElementById('carteSemaineEntrainement');
    const zone = document.getElementById('clubSemaineEntrainement');
    if (!zone) return;
    // Un club qu'on ne dirige pas n'a pas de semaine connue.
    carte.style.display = ctx.modifiable ? '' : 'none';
    if (!ctx.modifiable) return;
    const semaine = RMClub.assurerSemaineEntrainement(saison);
    const aujourdhui = RMClub.jourSemaine(RMClub.dateCourante(saison));
    const options = Object.keys(RMClub.ACTIVITES_ENTRAINEMENT).map((cle) => {
      const a = RMClub.ACTIVITES_ENTRAINEMENT[cle];
      return { cle, libelle: `${a.icone} ${a.label}` };
    });
    zone.innerHTML = NOMS_JOURS_SEMAINE.map((jour) => {
      const activite = RMClub.ACTIVITES_ENTRAINEMENT[semaine[jour]];
      const estAujourdhui = jour === aujourdhui;
      const opts = options.map((o) =>
        `<option value="${o.cle}"${o.cle === semaine[jour] ? ' selected' : ''}>${echapperHTML(o.libelle)}</option>`).join('');
      return `<div class="ligneSeance${estAujourdhui ? ' aujourdhui' : ''}">` +
        `<span class="jourSeance">${echapperHTML(RMClub.NOMS_JOURS[jour])}${estAujourdhui ? ' · aujourd\'hui' : ''}</span>` +
        `<select data-jour="${jour}">${opts}</select>` +
        `<span class="effetSeance">${echapperHTML(activite.description)}</span></div>`;
    }).join('');
  }

  function rafraichirEntrainement() {
    const ctx = contexte();
    const zone = document.getElementById('clubEntrainement');
    if (!ctx.modifiable) {
      zone.innerHTML = `<p class="noteLectureSeule">🔒 Les séances de ${echapperHTML(ctx.label)} ne sont pas connues : un club que tu ne diriges pas ne communique pas son travail de la semaine. Seule la marge de progression de ses joueurs, ci-dessous, est observable.</p>`;
      return;
    }
    // Détail de ce que chaque séance développe RÉELLEMENT — informatif, pas
    // un second sélecteur : c'est la semaine ci-dessus qui décide.
    zone.innerHTML = Object.keys(RMClub.ACTIVITES_ENTRAINEMENT).map((cle) => {
      const a = RMClub.ACTIVITES_ENTRAINEMENT[cle];
      const postes = !a.attributs.length ? 'Aucune progression (récupération)'
        : (a.postes ? a.postes.map((x) => POSTE_COMPLET[x] || x).join(', ') : 'Tout l\'effectif');
      const charge = a.intensite > 0 ? `Charge : +${a.intensite} de fatigue` : `Récupération ×${a.recuperation}`;
      return `<div class="ligneInfo"><span>${a.icone} <b>${echapperHTML(a.label)}</b><span style="display:block;color:var(--text-faint);font-size:11px;">Concerne : ${postes}</span></span>` +
        `<b style="white-space:nowrap;">${charge}</b></div>`;
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
  function formaterLigneCalendrier(f, clubMisEnAvant, options) {
    const opt = options || {};
    const cible = clubMisEnAvant || saison.clubJoueur.id;
    const domicile = f.libelleDomicile ? echapperHTML(f.libelleDomicile) : lienClub(f.domicileId);
    const exterieur = f.libelleExterieur ? echapperHTML(f.libelleExterieur) : lienClub(f.exterieurId);
    const score = f.joue ? `${f.score.domicile} - ${f.score.exterieur}` : 'à jouer';
    const forme = formePourClub(f, cible);
    const badge = forme ? `<span class="badgeForme ${forme}">${LIBELLE_FORME[forme]}</span>` : '';
    const classe = (f.domicileId === cible || f.exterieurId === cible) ? ' ligneClubJoueur' : '';
    // Repère de gauche (TODO_AUDIT.md P1-27) : la DATE réelle quand on la
    // demande — une carrière calendaire doit dire « samedi 21 septembre »,
    // pas seulement « J3 ». Le numéro de journée reste le repère par défaut
    // là où la date est déjà portée par l'entête du groupe.
    const repere = (opt.avecDate && f.date)
      ? RMClub.formaterDateCourte(RMClub.dateDepuisISO(f.date))
      : `J${f.journee}`;
    // Rencontre dont le compte rendu est ARCHIVÉ (cf. club-archives-matchs.js) :
    // elle s'ouvre. Les autres — rencontres entre clubs IA, résolues de façon
    // abstraite, ou jouées avant cette fonctionnalité — n'ont rien à montrer,
    // et ne prétendent donc pas être cliquables.
    const cleFeuille = opt.refCompetition && f.id
      ? RMClub.cleFeuille(opt.refCompetition, f.id) : null;
    const ouvrable = cleFeuille && RMClub.feuilleArchivee(saison, cleFeuille);
    const attrs = ouvrable
      ? ` class="ligneCalendrier${classe} ligneOuvrable" data-feuille="${echapperHTML(cleFeuille)}" title="Voir la feuille de match"`
      : ` class="ligneCalendrier${classe}"`;
    return `<div${attrs}><span>${repere} — ${domicile} vs ${exterieur}</span><span class="scoreCal">${badge}${score}${ouvrable ? ' <span class="chevronFeuille">›</span>' : ''}</span></div>`;
  }

  // Entête d'identité (TODO_AUDIT.md P1-20) : le nom du club ACTUELLEMENT
  // AFFICHÉ, en permanence en haut à gauche — le sien ("Mon club") ou celui
  // qu'il consulte ("Club consulté" + bouton de retour). C'est le seul
  // endroit qui répond à la question « quel club suis-je en train de
  // regarder ? » : il n'existe aucune liste ni menu déroulant de clubs.
  function rafraichirEntete() {
    const nav = RMClub.navigationClub(saison);
    if (nav.clubConsulteId !== saison.clubJoueur.id) {
      const adv = RMClub.clubPartout(saison, nav.clubConsulteId);
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
    const club = RMClub.clubPartout(saison, nav.clubConsulteId);
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
      const boutonJourFin = document.getElementById('btnJourSuivant');
      if (boutonJourFin) boutonJourFin.style.display = 'none';
      if (labelFlottant) labelFlottant.textContent = 'Saison suivante';
      return;
    }
    bouton.style.display = '';
    boutonComposition.style.display = '';
    boutonSaisonSuivante.style.display = 'none';
    // LA prochaine échéance du club, et elle seule (TODO_AUDIT.md P1-35).
    // Avant : les 7 rencontres de la journée de championnat, dont 6 ne
    // concernaient pas le joueur — 469 px qui repoussaient tout le reste du
    // tableau de bord hors écran, et une rencontre annoncée qui n'était même
    // pas celle que le bouton visait. Le calendrier complet de la division
    // reste consultable dans l'écran Calendrier, qui est fait pour ça.
    const arretCarte = RMClub.prochainArret(saison);
    const aujourdhuiCarte = RMClub.dateCourante(saison);
    if (arretCarte) {
      const memeJourCarte = RMClub.comparerDates(arretCarte.date, aujourdhuiCarte) === 0;
      const quand = memeJourCarte
        ? "aujourd'hui"
        : `${RMClub.formaterDateLongue(arretCarte.date)} · dans ${arretCarte.joursRestants} jour(s)`;
      const lieu = arretCarte.domicile ? 'à domicile' : "à l'extérieur";
      const adversaire = arretCarte.adversaireNom
        ? (arretCarte.adversaireId ? lienClub(arretCarte.adversaireId) : echapperHTML(arretCarte.adversaireNom))
        : '<span style="color:var(--text-faint);">adversaire à déterminer</span>';
      const contexte = [arretCarte.equipe, arretCarte.competition, arretCarte.tour]
        .filter(Boolean).map(echapperHTML).join(' · ');
      zone.innerHTML =
        `<div class="echeancePrincipale">` +
        `<span class="echeanceType">${echapperHTML(arretCarte.libelle)}</span>` +
        `<span class="echeanceAdversaire">${adversaire}</span>` +
        `<span class="echeanceDetail">${lieu} · ${echapperHTML(quand)}</span>` +
        (contexte ? `<span class="echeanceContexte">${contexte}</span>` : '') +
        `</div>`;
    } else {
      zone.innerHTML = '<p style="color:var(--text-dim);">Aucune échéance à venir.</p>';
    }
    bouton.disabled = false;
    // Le bouton annonce la PROCHAINE ÉCHÉANCE, pas une journée abstraite
    // (TODO_AUDIT.md P1-21) : « Continuer jusqu'au samedi 7 septembre ».
    // Arrivé le jour même, il propose de jouer plutôt que d'avancer.
    const arret = arretCarte;
    const aujourdhui = aujourdhuiCarte;
    let libelleCourt = 'Continuer';
    let libelleLong = 'Continuer';
    if (arret) {
      const memeJour = RMClub.comparerDates(arret.date, aujourdhui) === 0;
      // Combien de jours ce bouton va-t-il RÉELLEMENT avaler ? Mesuré : 3 en
      // moyenne en cours de saison, mais 21 sur le premier clic d'une
      // carrière neuve. Le joueur doit le savoir AVANT de cliquer — c'est la
      // différence entre avancer et se faire sauter trois semaines.
      const nbJours = RMClub.ecartJours(aujourdhui, arret.date);
      // La barre flottante est l'élément le plus visible de l'écran : elle
      // doit dire elle aussi combien de jours elle saute, sinon elle reste le
      // raccourci qu'on prend sans y penser.
      libelleCourt = memeJour ? arret.libelle : `Continuer · ${nbJours} j → ${RMClub.formaterDateCourte(arret.date)}`;
      libelleLong = memeJour
        ? `${arret.libelle} — c'est aujourd'hui`
        : `Passer ${nbJours} jour(s) — Continuer jusqu'au ${RMClub.formaterDateLongue(arret.date)}`;
    }
    bouton.textContent = `▶ ${libelleLong}`;
    if (labelFlottant) labelFlottant.textContent = libelleCourt;
    // « Jour suivant » annonce la DATE qu'il va atteindre (TODO_AUDIT.md
    // P1-26) — le joueur sait toujours où il met les pieds, comme pour
    // « Continuer ». Masqué le jour d'un match : il reste à jouer, avancer
    // d'un jour le sauterait.
    const boutonJour = document.getElementById('btnJourSuivant');
    if (boutonJour) {
      const surUnMatch = !!RMClub.typeDArret(saison, aujourdhui);
      boutonJour.style.display = surUnMatch ? 'none' : '';
      boutonJour.disabled = false;
      boutonJour.textContent = `→ Jour suivant (${RMClub.formaterDateCourte(RMClub.ajouterJours(aujourdhui, 1))})`;
      boutonJour.title = `Avancer d'un seul jour, jusqu'au ${RMClub.formaterDateLongue(RMClub.ajouterJours(aujourdhui, 1))}`;
    }
  }

  // Préparation progressive de la rencontre (TODO_AUDIT.md P1-24) : ce qui
  // est prêt et ce qui ne l'est pas, dès plusieurs jours avant le match.
  // AUCUN blocage — chaque point est purement informatif, et cliquable pour
  // aller le régler.
  const ONGLET_POUR_POINT = { analyse: 'classement', composition: 'composition', tactique: 'tactique', roles: 'composition', banc: 'composition' };
  const ICONE_STATUT_PREP = { ok: '✅', attention: '⚠️', nonPrepare: '⬜' };
  // TODO_AUDIT.md P1-38 — la nature du point, en toutes lettres. Avant, tout
  // ce qui n'était pas fait portait le même ⬜ : « Analyse de l'adversaire »
  // (17 jours d'attente, rien à faire) était indiscernable de « Tactique »
  // (un clic). Le manager doit voir d'un coup d'œil ce qui l'attend, LUI.
  // Quelle équipe la carte de préparation décrit (TODO_AUDIT.md P1-39).
  const LIBELLE_EQUIPE_PREP = { pro: 'Équipe première', b: 'Équipe B', jeunes: 'Espoirs' };
  const NATURE_PREP = {
    termine: { icone: '✅', libelle: 'Fait' },
    urgent: { icone: '❗', libelle: 'Urgent' },
    recommande: { icone: '⚠️', libelle: 'Recommandé' },
    facultatif: { icone: '⬜', libelle: 'Facultatif' },
    enAttente: { icone: '⏳', libelle: 'En attente' },
  };
  function rafraichirPreparationMatch() {
    // Carte retirée du tableau de bord en P1-41 : la fonction reste, inerte,
    // pour ne rien casser si un autre écran la rappelle.
    const carte = document.getElementById('cartePreparationMatch');
    const zone = document.getElementById('clubPreparationMatch');
    if (!carte || !zone) return;
    if (!RMClub.consulteClubJoueur(saison)) { carte.style.display = 'none'; return; }
    // On prépare LA rencontre que la carte « Prochaine échéance » annonce —
    // même source, donc accord par construction (même principe qu'en P1-35).
    // Avant, le jour d'un match d'Équipe B, l'échéance annonçait l'Équipe B
    // pendant que la préparation décrivait le match de championnat.
    const arretPrep = RMClub.prochainArret(saison);
    const equipePrep = arretPrep ? RMClub.equipePourArret(arretPrep.type) : 'pro';
    const etat = RMClub.etatPreparationMatch(saison, equipePrep);
    if (!etat.rencontre) { carte.style.display = 'none'; return; }
    carte.style.display = '';
    const r = etat.rencontre;
    const quand = r.jours === 0 ? "aujourd'hui" : r.jours === 1 ? 'demain' : `dans ${r.jours} jours`;
    // Le titre dit QUELLE équipe est préparée : sans ça, un match d'Équipe B
    // et un match de championnat se ressemblent trop sur la même carte.
    const titrePrep = carte.querySelector('h3');
    if (titrePrep) {
      titrePrep.textContent = '🧭 Préparation — ' + (LIBELLE_EQUIPE_PREP[etat.equipe] || 'Équipe première');
    }
    zone.innerHTML =
      `<p class="entetePreparation">${lienClub(r.adversaireId)} · ${r.domicile ? 'à domicile' : "à l'extérieur"} · ${echapperHTML(RMClub.formaterDateLongue(r.date))} (${quand})</p>` +
      `<div class="jaugePreparation"><span style="width:${etat.pretPct}%"></span></div>` +
      // Le pourcentage dit sur quoi il porte : sinon « 60 % » se lit comme un
      // reproche alors que tout le réglable était réglé. Ce qui n'est
      // qu'attente est annoncé à part, jamais compté comme un point raté.
      `<p class="pctPreparation">${etat.pretPct} % de ce qui est réglable aujourd'hui ` +
      `(${etat.resume.faits}/${etat.resume.actionnables})` +
      (etat.resume.enAttente ? ` · ${etat.resume.enAttente} point(s) en attente` : '') + `</p>` +
      etat.points.map((p) => {
        const n = NATURE_PREP[p.nature] || NATURE_PREP.facultatif;
        return `<div class="lignePreparation ${p.statut} nature-${p.nature}" data-nature="${p.nature}"` +
          ` data-onglet="${ONGLET_POUR_POINT[p.cle] || 'dashboard'}">` +
          `<span class="statutPreparation">${n.icone}</span>` +
          `<span class="corpsPreparation"><b>${echapperHTML(p.libelle)}</b><span>${echapperHTML(p.detail)}</span></span>` +
          `<span class="badgeNature nature-${p.nature}">${n.libelle}</span></div>`;
      }).join('');
  }

  // --- ÉCRAN UNIQUE « Préparer le match » (TODO_AUDIT.md P1-41) -----------
  // Huit sections dans l'ordre, toutes alimentées par RMClub.dossierPreparation
  // — qui lit lui-même prochainArret(). Aucun écran par équipe : la Première,
  // l'Équipe B, les Espoirs, les coupes et les amicaux passent tous par ici.
  function sectionPreparer(titre, corps, classe) {
    return `<div class="carteClub blocPreparer${classe ? ' ' + classe : ''}"><h3>${titre}</h3>${corps}</div>`;
  }

  function rafraichirPreparerMatch() {
    const zone = document.getElementById('clubPreparer');
    if (!zone) return;
    if (!RMClub.consulteClubJoueur(saison)) { zone.innerHTML = ''; return; }
    const d = RMClub.dossierPreparation(saison);
    if (!d) {
      zone.innerHTML = '<div class="carteClub"><p>Aucune rencontre à préparer pour le moment.</p></div>';
      return;
    }
    const quand = d.joursRestants === 0 ? "aujourd'hui"
      : d.joursRestants === 1 ? 'demain' : `dans ${d.joursRestants} jours`;
    // Le nom, TOUJOURS. `lienClub` renvoie « ? » pour une entité qui n'est
    // pas un club consultable — une académie du championnat espoirs, par
    // exemple : mesuré, le nom de l'adversaire disparaissait purement et
    // simplement de la vue pour un match de jeunes. Le dossier, lui, connaît
    // ce nom : on le montre, cliquable seulement quand ça a un sens.
    const lien = d.adversaireId ? lienClub(d.adversaireId) : '?';
    const adversaire = d.adversaireNom
      ? (lien !== '?' ? lien : echapperHTML(d.adversaireNom))
      : '<span style="color:var(--text-faint);">adversaire à déterminer</span>';

    // 1) La rencontre exacte.
    const html = [];
    html.push(sectionPreparer('🗓️ La rencontre',
      `<div class="echeancePrincipale">` +
      `<span class="echeanceType">${echapperHTML(d.competition)}${d.tour ? ' · ' + echapperHTML(d.tour) : ''}</span>` +
      `<span class="echeanceAdversaire">${adversaire}</span>` +
      `<span class="echeanceDetail">${d.domicile ? 'à domicile' : "à l'extérieur"} · ` +
      `${echapperHTML(RMClub.formaterDateLongue(d.rencontre.date))} · ${echapperHTML(quand)}</span>` +
      `<span class="echeanceContexte">${echapperHTML(d.libelleEquipe)}</span></div>`));

    // 2) Actions urgentes ou recommandées — la MÊME liste que partout
    // ailleurs, avec les natures de P1-38.
    const aRegler = d.etat.points.filter((p) => p.nature === 'urgent' || p.nature === 'recommande');
    const lignes = (pts) => pts.map((p) => {
      const n = NATURE_PREP[p.nature] || NATURE_PREP.facultatif;
      return `<div class="lignePreparation ${p.statut} nature-${p.nature}" data-nature="${p.nature}"` +
        ` data-onglet="${ONGLET_POUR_POINT[p.cle] || 'dashboard'}">` +
        `<span class="statutPreparation">${n.icone}</span>` +
        `<span class="corpsPreparation"><b>${echapperHTML(p.libelle)}</b><span>${echapperHTML(p.detail)}</span></span>` +
        `<span class="badgeNature nature-${p.nature}">${n.libelle}</span></div>`;
    }).join('');
    html.push(sectionPreparer(`✅ À régler (${d.etat.resume.faits}/${d.etat.resume.actionnables})`,
      `<div class="jaugePreparation"><span style="width:${d.etat.pretPct}%"></span></div>` +
      `<p class="pctPreparation">${d.etat.pretPct} % de ce qui est réglable aujourd'hui` +
      (d.etat.resume.enAttente ? ` · ${d.etat.resume.enAttente} point(s) en attente` : '') + `</p>` +
      (aRegler.length ? lignes(aRegler)
        : '<p style="color:var(--text-dim);margin:0;">Rien d\'urgent : tout ce qui pouvait être réglé l\'est.</p>')));

    // 3) et 4) Composition, rôles, banc, puis l'état de l'effectif — le
    // reste des points de préparation, sans les dupliquer.
    const autres = d.etat.points.filter((p) => p.nature !== 'urgent' && p.nature !== 'recommande');
    if (autres.length) {
      html.push(sectionPreparer('📋 Composition, rôles et banc', lignes(autres)));
    }

    // 5) Analyse réelle de l'adversaire et forme récente.
    if (!d.analyse) {
      html.push(sectionPreparer('🔍 L\'adversaire',
        '<p style="color:var(--text-dim);margin:0;">Cet adversaire n\'a pas d\'effectif comparable dans le jeu — aucune analyse à afficher. Rien n\'est inventé ici.</p>'));
    } else if (!d.analyseDisponible) {
      html.push(sectionPreparer('🔍 L\'adversaire',
        `<p style="color:var(--text-dim);margin:0;">Ton analyste a besoin d'encore ${d.joursAvantAnalyse} jour(s) d'observation. Le rapport complet arrivera avant la rencontre.</p>`));
    } else {
      const a = d.analyse;
      const formeTxt = a.forme.length
        ? a.forme.map((f) => `<span class="badgeForme ${f}">${LIBELLE_FORME[f]}</span>`).join('')
        : '<span style="color:var(--text-faint);">Aucun match joué</span>';
      const lignesAttr = a.comparaison.map((c) => {
        const total = Math.max(c.moi, c.eux) + 15;
        const largeurEux = Math.min(100, (c.eux / total) * 100);
        return `<div class="ligneAdversaireAttr"><span class="labelAdvAttr">${c.label}</span>` +
          `<span class="barreComparaison"><span class="${c.diff < 0 ? 'faible' : ''}" style="width:${largeurEux}%"></span></span>` +
          `<span class="valAdv">${c.eux}</span></div>`;
      }).join('');
      const puces = [
        ...a.forces.map((c) => `<span class="puceQualitatif force">⚠️ ${c.label} (+${c.diff})</span>`),
        ...a.faiblesses.map((c) => `<span class="puceQualitatif faiblesse">✓ ${c.label} (${c.diff})</span>`),
      ].join('');
      html.push(sectionPreparer('🔍 L\'adversaire',
        `<p style="font-size:12px;color:var(--text-dim);margin:0 0 10px;">${a.position}${a.position === 1 ? 'er' : 'e'}/${a.totalClubs} au classement · Forme récente : ${formeTxt}</p>` +
        lignesAttr +
        (puces ? `<div class="listeQualitatif">${puces}</div>`
          : '<p style="font-size:11.5px;color:var(--text-faint);margin:10px 0 0;">Aucun écart marqué avec ton effectif.</p>')));
    }

    // 6) Recommandation tactique, applicable en un clic.
    if (d.recommandations && d.recommandations.length) {
      html.push(sectionPreparer('💡 Recommandation tactique',
        // Même forme que dans l'aperçu d'avant-match (cf. recommanderTactique) :
        // `libelle` est l'option recommandée, `raison` l'explique en clair.
        d.recommandations.map((r) =>
          `<div class="ligneRecoTactique"><b>${echapperHTML(RMClub.AXES_TACTIQUE[r.axe].label)} → ${echapperHTML(r.libelle)}</b>` +
          `<span>${echapperHTML(r.raison)}</span></div>`).join('') +
        `<button class="accent" id="btnAppliquerRecoPreparer" style="width:100%;margin-top:10px;">Appliquer les recommandations</button>`));
    }

    // 7) et 8) Les deux écrans de réglage, puis le coup d'envoi.
    html.push(sectionPreparer('🎬 Passer à l\'action',
      `<div class="actionsPreparer">` +
      `<button class="alt" data-vers="composition">📋 Composition</button>` +
      `<button class="alt" data-vers="tactique">🎯 Tactique</button>` +
      `</div>` +
      (d.jouable
        ? `<button class="accent" id="btnLancerDepuisPreparer" style="width:100%;margin-top:10px;">▶ Jouer ce match</button>`
        : `<p class="noteLectureSeule" style="margin:10px 0 0;">Le match se joue ${echapperHTML(quand)} — ${echapperHTML(RMClub.formaterDateLongue(d.rencontre.date))}. Avance les jours depuis le tableau de bord.</p>`)));

    zone.innerHTML = html.join('');
  }

  // Boutons de l'écran « Préparer le match » (P1-41). Une seule délégation :
  // les lignes de préparation, les deux raccourcis de réglage, l'application
  // des recommandations et le coup d'envoi.
  document.getElementById('btnVersPreparer').addEventListener('click', () => basculerOnglet('preparer'));

  // Offres d'emploi (TODO_AUDIT.md P1-42) : accepter change RÉELLEMENT de
  // club — même monde, même saison, même date — refuser retire l'offre.
  document.getElementById('clubOffresManager').addEventListener('click', async (e) => {
    const refus = e.target.closest('[data-refuser]');
    if (refus) {
      RMClub.refuserOffre(saison, refus.dataset.refuser);
      sauvegarder(); rafraichirCarriereManager(); toast('Offre refusée');
      return;
    }
    const accept = e.target.closest('[data-accepter]');
    if (!accept) return;
    const offre = RMClub.offresDisponibles(saison).find((o) => o.id === accept.dataset.accepter);
    if (!offre) return;
    const ok = await confirmerAction(offre.immediat
      ? `Prendre les commandes de ${offre.clubNom} ? Tu quittes ton club actuel — ta carrière ` +
        `personnelle, la saison en cours et le calendrier continuent, mais tu diriges désormais ` +
        `cet effectif et cet objectif.`
      : `Signer à ${offre.clubNom} (${offre.division}) pour la saison prochaine ? Tu termines la ` +
        `saison en cours à ${saison.clubJoueur.nom}, puis tu prends ce poste — dans une autre ` +
        `division, avec un autre effectif. Les autres offres seront closes.`);
    if (!ok) return;
    RMClub.accepterOffre(saison, offre.id);
    sauvegarder();
    rafraichirTout();
    toast(offre.immediat
      ? `Tu diriges désormais ${offre.clubNom}`
      : `Engagé à ${offre.clubNom} pour la saison prochaine`);
  });

  document.getElementById('clubPreparer').addEventListener('click', (e) => {
    const vers = e.target.closest('[data-vers]');
    if (vers) { basculerOnglet(vers.dataset.vers); return; }
    const ligne = e.target.closest('.lignePreparation');
    if (ligne && ligne.dataset.onglet) { basculerOnglet(ligne.dataset.onglet); return; }
    if (e.target.closest('#btnAppliquerRecoPreparer')) {
      const d = RMClub.dossierPreparation(saison);
      if (!d || !d.recommandations) return;
      RMClub.appliquerRecommandationsTactique(saison, d.recommandations);
      sauvegarder();
      rafraichirPreparerMatch();
      rafraichirTactique();
      toast('Recommandations appliquées à ta tactique');
      return;
    }
    if (e.target.closest('#btnLancerDepuisPreparer')) {
      // On réutilise EXACTEMENT le même chemin que le bouton du tableau de
      // bord : pas de second lancement de match dans le jeu.
      const bouton = document.getElementById('btnJouerMatchClub');
      if (bouton) { basculerOnglet('dashboard'); bouton.click(); }
    }
  });

  // Fenêtre de transfert (TODO_AUDIT.md P1-24) : ouverte ou fermée, avec la
  // date de réouverture — jamais un bouton désactivé sans explication.
  function rafraichirFenetreTransfert() {
    const zone = document.getElementById('clubFenetreTransfert');
    if (!zone) return;
    const f = RMClub.etatFenetreTransfert(saison);
    zone.innerHTML = f.ouverte
      ? `<p class="fenetreOuverte">🟢 <b>${echapperHTML(f.nom)} ouvert</b> — les signatures sont possibles jusqu'au ${echapperHTML(RMClub.formaterDateLongue(f.ferme))}.</p>`
      : `<p class="fenetreFermee">🔴 <b>Marché fermé.</b> ${f.ouvre ? `Réouverture le ${echapperHTML(RMClub.formaterDateLongue(f.ouvre))} (${echapperHTML(f.prochaine)}).` : 'Plus de fenêtre de transfert cette saison.'} Le repérage, lui, reste possible toute l'année.</p>`;
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
  // --- rafraichirClassement supprimée (TODO_AUDIT.md P1-33) --------------
  // Le classement n'est plus une carte de l'écran « Calendrier & classement »
  // pilotée par le sélecteur d'équipe : il a sa PROPRE page, alimentée par
  // rafraichirCompetitionChoisie à partir de la compétition choisie dans la
  // navigation partagée. Une seule fonction rend désormais un classement,
  // pour toutes les compétitions du jeu.


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
  // 'calendrier' n'y figure plus (TODO_AUDIT.md P1-33) : le Calendrier suit
  // désormais la COMPÉTITION choisie dans la navigation partagée, pas
  // l'équipe sélectionnée — les compétitions du club (championnat, Équipe B,
  // espoirs) y figurent toutes, au même titre que celles des 12 pays.
  // 'calendrier' réintégré : il avait été retiré en P1-33, quand le
  // calendrier est passé de « les rencontres de l'ÉQUIPE sélectionnée » à
  // « les rencontres de la COMPÉTITION choisie ». Conséquence mesurée : pour
  // voir le calendrier de l'Équipe B ou des Espoirs, il fallait passer par
  // une navigation qui liste douze pays AVANT les championnats — le chemin
  // évident (choisir son équipe) avait disparu. Les deux coexistent
  // désormais : choisir une équipe sélectionne SA compétition, et la
  // navigation par pays reste là pour aller voir ailleurs.
  // 'classement' (l'écran Compétitions) rejoint la liste : mesuré, pour
  // ouvrir le championnat de son Équipe B le manager devait le retrouver dans
  // une liste PLATE de 21 entrées mélangeant 12 pays, 3 paliers français, ses
  // deux championnats de club et 4 coupes — alors que le sélecteur d'équipe
  // existait déjà juste à côté, dans Calendrier. Choisir son équipe montre
  // désormais SES compétitions (cf. RMClub.competitionsDeLEquipe).
  const ONGLETS_AVEC_EQUIPE = ['effectif', 'composition', 'tactique', 'entrainement', 'personnel', 'calendrier', 'classement'];
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
    nommerEquipeDansTitre(equipes, ctx);
  }

  // Le titre de la page nomme l'ÉQUIPE consultée. Sans ça, « Effectif »,
  // « Composition » ou « Calendrier » s'affichaient à l'identique pour
  // l'équipe première, l'Équipe B et les Espoirs : le contenu changeait bien
  // (mesuré — 3940 / 1977 / 1770 caractères sur Composition), mais rien à
  // l'écran ne disait laquelle on regardait, à part un petit menu déroulant.
  // On mémorise le titre d'origine dans un data-attribut pour ne jamais
  // empiler les suffixes au fil des changements d'équipe.
  function nommerEquipeDansTitre(equipes, ctx) {
    const volet = document.querySelector(`#clubGestion .voletOnglet[data-volet="${ongletActuel}"]`);
    const titre = volet ? volet.querySelector('.enTetePage h2') : null;
    if (!titre) return;
    if (!titre.dataset.titreBase) titre.dataset.titreBase = titre.textContent.trim();
    const base = titre.dataset.titreBase;
    // Un club qu'on ne dirige pas n'a qu'une équipe : le suffixe n'apprendrait
    // rien, on garde le titre nu.
    const option = equipes.find((o) => o.valeur === ctx.type);
    titre.textContent = (equipes.length > 1 && option) ? `${base} — ${option.label}` : base;
  }

  // --- Ouverture d'un club : LA fonction centrale (TODO_AUDIT.md P1-20) ----
  // Tous les noms de clubs cliquables du jeu (calendrier, classement,
  // résultats, prochain match, analyse de l'adversaire, liste des autres
  // clubs, fiche joueur, confrontations...) appellent CETTE fonction — la
  // logique n'est dupliquée dans aucun écran.
  function ouvrirClub(clubId) {
    // Recherche LARGE (TODO_AUDIT.md P1-28) : un nom cliquable peut désigner
    // un club d'un autre palier français ou de l'un des 12 pays, pas
    // seulement un adversaire direct.
    if (!RMClub.clubPartout(saison, clubId)) return;
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
    // club, et c'est le parcours attendu (clic sur un nom → son XV). Sauf
    // pour un club dont l'effectif n'est PAS simulé (autre palier, autre
    // pays — TODO_AUDIT.md P1-28) : sa composition serait une page vide, on
    // ouvre alors sa vue d'ensemble, où son classement et son calendrier
    // réels sont visibles.
    basculerOnglet(RMClub.contexteEquipe(saison).disponible ? 'composition' : 'dashboard');
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
    // Recherche LARGE (TODO_AUDIT.md P1-28) : un nom de club doit être
    // cliquable PARTOUT où il apparaît — y compris dans le classement d'un
    // championnat japonais ou d'un autre palier français, pas seulement
    // parmi les adversaires directs. Sans ça, ces écrans affichaient « ? ».
    const c = RMClub.clubPartout(saison, clubId);
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
  // Compétition correspondant à une équipe du club : c'est ce qui relie le
  // sélecteur d'équipe à l'écran Calendrier, sans créer de second état.
  const COMPETITION_POUR_EQUIPE = {
    pro: RMClub.REF_COMPETITION_JOUEUR,
    b: RMClub.REF_COMPETITION_EQUIPE_B,
    jeunes: RMClub.REF_COMPETITION_ESPOIRS,
  };

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
    // Sur l'écran Calendrier, choisir une équipe doit montrer SES rencontres :
    // c'est le geste naturel, et il était devenu impossible. L'ordre compte —
    // rafraichirAutresClubs() réaligne la navigation sur la compétition du
    // club, donc on impose notre choix APRÈS elle, jamais avant.
    // Même geste sur l'écran Compétitions : choisir une équipe montre SES
    // compétitions et ouvre la première (son championnat).
    if (ongletActuel === 'classement') {
      const premiere = RMClub.competitionsDeLEquipe(saison, type)[0];
      if (premiere) choisirCompetition(premiere.ref);
      else rafraichirAutresClubs();
    }
    if (ongletActuel === 'calendrier') {
      const ref = COMPETITION_POUR_EQUIPE[type];
      // Jamais vers une page vide : une Équipe B non éligible n'a pas de
      // championnat, on laisse alors la compétition en cours. On choisit
      // AVANT de redessiner : c'est rafraichirAutresClubs() qui écrit le
      // titre de la page, donc l'assigner après lui laissait le titre en
      // retard d'un cran sur le contenu.
      if (ref && RMClub.competition(saison, ref)) competitionNavChoisie = ref;
      rafraichirAutresClubs();
      rafraichirCalendrier();
    }
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
    rafraichirSemaineEntrainement();
    rafraichirEntrainement();
    rafraichirJeunes();
    rafraichirCalendrier();
    rafraichirPersonnel();
  }

  // Abréviations de poste (cf. moteur, PROFILS[n].label) traduites en toutes
  // lettres pour l'effectif : "P"/"T" n'est parlant que pour qui connaît déjà
  // la numérotation du rugby à XV, or le Mode Club vise aussi les néophytes.
  // Table partagée avec la couche données (cf. club.js) : les modules sans
  // DOM en ont besoin aussi, on ne la duplique donc pas ici.
  const POSTE_COMPLET = RMClub.POSTE_COMPLET;

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
  // Les onglets de l'écran Effectif. Chacun lit l'effectif de l'ÉQUIPE
  // CONSULTÉE (ctx.effectif) : première, B, Espoirs ou club adverse — mêmes
  // composants, seules les données changent.
  function rendreOngletEffectif(ctx) {
    const carte = document.getElementById('carteEffectifOnglet');
    const table = document.getElementById('carteEffectifTable');
    const zone = document.getElementById('clubEffectifOnglet');
    const titre = document.getElementById('titreEffectifOnglet');
    if (!carte || !table || !zone || !titre) return;
    const sous = sousOngletCourant('effectif');
    table.style.display = (sous === 'joueurs' || sous === 'apercu') ? '' : 'none';
    carte.style.display = (sous === 'joueurs' || sous === 'contrats') ? 'none' : '';
    // L'écran Contrats est un sous-onglet à part entière : il ne doit pas
    // s'empiler sous « Vue d'ensemble ». Il n'a de sens que pour une équipe
    // qu'on dirige — on ne négocie pas les contrats d'un club adverse.
    const carteContrats = document.getElementById('carteContrats');
    if (carteContrats) {
      const afficher = sous === 'contrats' && ctx.modifiable;
      carteContrats.style.display = afficher ? '' : 'none';
      if (afficher) rafraichirContrats();
    }
    const eff = ctx.effectif || [];
    if (!eff.length) {
      titre.textContent = 'Effectif';
      zone.innerHTML = `<p style="color:var(--text-dim);">${echapperHTML(ctx.motifIndisponible || 'Aucun effectif simulé pour cette équipe.')}</p>`;
      return;
    }

    if (sous === 'rotation') {
      // Aide à la rotation : profondeur, alertes de charge et SUGGESTION.
      // Le manager garde la décision — rien n'est appliqué ici (cf.
      // club-rotation.js, qui ne modifie jamais une composition).
      titre.textContent = '🔁 Rotation de l\'effectif';
      if (!ctx.modifiable) {
        zone.innerHTML = '<p style="color:var(--text-dim);">L\'aide à la rotation ne concerne que tes propres équipes.</p>';
        return;
      }
      const d = RMClub.dossierRotation(saison, ctx.type);
      const badge = (r) => r === 'titulaire' ? '<b>1</b>' : r === 'doublure' ? '2' : r === 'troisieme' ? '3' : '·';
      const lignesPostes = d.profondeur.postes.map((p) => {
        const noms = p.joueurs.map((j) =>
          `<span style="white-space:nowrap;">${badge(j.role)} ${echapperHTML(j.nom)}` +
          `<span style="color:${j.fatigue >= d.seuilAlerte ? 'var(--loss)' : j.fatigue >= d.seuilRepos ? 'var(--draw)' : 'var(--text-faint)'};"> ${j.fatigue}</span>` +
          `${j.disponible ? '' : ' <span style="color:var(--loss);">✚</span>'}</span>`).join(' · ');
        return `<div class="ligneInfo"><span><b>${echapperHTML(p.poste)}</b> ` +
          `<span style="color:var(--text-faint);">${p.disponibles}/${p.requis} dispo</span>` +
          `${p.fragile ? ' <span class="alerte">⚠️ sans doublure</span>' : ''}</span>` +
          `<span style="font-size:11.5px;text-align:right;">${noms || '—'}</span></div>`;
      }).join('');

      const lignesCharge = d.charge.surcharges.map((x) =>
        `<div class="ligneInfo"><span>${echapperHTML(x.nom)} <span style="color:var(--text-faint);">${echapperHTML(x.poste)}</span></span>` +
        `<span style="font-size:11.5px;text-align:right;color:var(--text-dim);">${echapperHTML(x.motif)}</span></div>`).join('');
      const lignesSous = d.charge.sousUtilises.map((x) =>
        `<div class="ligneInfo"><span>${echapperHTML(x.nom)} <span style="color:var(--text-faint);">${echapperHTML(x.poste)}</span></span>` +
        `<span style="font-size:11.5px;color:var(--text-dim);">${echapperHTML(x.motif)}</span></div>`).join('');

      const sug = d.suggestion;
      const lignesChangements = sug.changements.map((c) =>
        `<div class="ligneInfo"><span>N°${echapperHTML(c.numero)} ${echapperHTML(c.sort.nom)} → <b>${echapperHTML(c.entre.nom)}</b></span>` +
        `<span style="font-size:11.5px;text-align:right;color:var(--text-dim);">${echapperHTML(c.raison)}</span></div>`).join('');

      zone.innerHTML =
        ligneInfo('Matchs joués en moyenne', `${d.charge.moyenneMatchs}`) +
        (d.profondeur.postesFragiles.length
          ? ligneInfo('Postes sans doublure', d.profondeur.postesFragiles.join(', '), { etat: 'alerte' })
          : ligneInfo('Postes sans doublure', 'aucun')) +
        `<h4 class="sousTitreMedical">Profondeur par poste</h4>${lignesPostes}` +
        (lignesCharge ? `<h4 class="sousTitreMedical">Surcharge</h4>${lignesCharge}` : '') +
        (lignesSous ? `<h4 class="sousTitreMedical">Trop peu utilisés</h4>${lignesSous}` : '') +
        `<h4 class="sousTitreMedical">Suggestion de rotation</h4>` +
        ligneInfo('Fatigue moyenne du XV', `${sug.fatigueMoyenneActuelle} → ${sug.fatigueMoyenneProposee}`,
          { etat: sug.fatigueMoyenneProposee < sug.fatigueMoyenneActuelle ? 'deltaPositif' : '' }) +
        (lignesChangements || '<p style="color:var(--text-dim);font-size:12px;">Ton XV est déjà le plus frais possible.</p>') +
        (sug.changements.length
          ? `<button class="alt" id="btnAppliquerRotation" style="width:100%;margin-top:10px;">Appliquer cette rotation</button>`
          + `<p class="noteFacultatif">Suggestion seulement : tant que tu ne cliques pas, ta composition ne change pas.</p>`
          : '');
      return;
    }

    if (sous === 'inscriptions') {
      // Inscriptions aux compétitions : la décision d'effectif du début de
      // saison. Un joueur non inscrit ne peut pas être aligné, et la liste se
      // fige à la date limite (cf. club-inscriptions.js).
      titre.textContent = '📝 Inscriptions aux compétitions';
      if (!ctx.modifiable) {
        zone.innerHTML = '<p style="color:var(--text-dim);">Les listes d\'inscription ne concernent que tes propres équipes.</p>';
        return;
      }
      const refs = (RMClub.competitionsDeLEquipe(saison, ctx.type) || []).map((c) => c.ref);
      if (!refs.length) {
        zone.innerHTML = '<p style="color:var(--text-dim);">Cette équipe ne dispute aucune compétition cette saison.</p>';
        return;
      }
      zone.innerHTML = refs.map((ref) => {
        const d = RMClub.dossierInscriptions(saison, ref);
        if (!d) return '';
        const comp = RMClub.competition(saison, ref);
        const limite = RMClub.formaterDateLongue(RMClub.dateDepuisISO(d.dateLimite));
        const etat = d.ouverte
          ? `<b class="deltaPositif">ouverte jusqu'au ${echapperHTML(limite)}</b>`
          : `<b class="alerte">fermée depuis le ${echapperHTML(limite)}</b>`;
        const lignes = d.candidats.map((c) => {
          const action = !d.ouverte
            ? ''
            : c.inscrit
              ? `<button class="alt btnInscription" data-ref="${echapperHTML(ref)}" data-joueur="${echapperHTML(c.id)}" data-action="retirer" style="width:auto;padding:3px 8px;font-size:11px;">Retirer</button>`
              : c.eligible
                ? `<button class="alt btnInscription" data-ref="${echapperHTML(ref)}" data-joueur="${echapperHTML(c.id)}" data-action="inscrire" style="width:auto;padding:3px 8px;font-size:11px;">Inscrire</button>`
                : '';
          const statut = c.inscrit
            ? '<b class="deltaPositif">inscrit</b>'
            : c.eligible ? '<b style="color:var(--text-faint);">non inscrit</b>'
              : `<b class="alerte" title="${echapperHTML(c.message || '')}">inéligible</b>`;
          return `<div class="ligneInfo"><span>${echapperHTML(c.nom)} ` +
            `<span style="color:var(--text-faint);">${echapperHTML(c.poste)} · ${c.age} ans</span></span>` +
            `<span style="display:flex;gap:8px;align-items:center;">${statut}${action}</span></div>`;
        }).join('');
        return `<h4 class="sousTitreMedical">${echapperHTML(comp ? comp.nom : d.nom)}</h4>` +
          ligneInfo('Fenêtre d\'inscription', etat) +
          ligneInfo('Inscrits', `${d.inscrits.length} / ${d.maxJoueurs}` +
            (d.placesRestantes ? ` (${d.placesRestantes} place(s) libre(s))` : ' — liste complète')) +
          (d.ageMax ? ligneInfo('Limite d\'âge', `${d.ageMax} ans`) : '') +
          (d.nonEligibles ? ligneInfo('Inéligibles', `${d.nonEligibles}`, { etat: 'alerte' }) : '') +
          lignes;
      }).join('');
      return;
    }

    if (sous === 'apercu') {
      const age = eff.reduce((t, j) => t + (j.age || 0), 0) / eff.length;
      const salaires = eff.reduce((t, j) => t + (j.salaire || 0), 0);
      const parPoste = {};
      for (const j of eff) parPoste[j.poste] = (parPoste[j.poste] || 0) + 1;
      const cible = {};
      for (const p of (RMClub.GABARIT_EFFECTIF || [])) cible[p] = (cible[p] || 0) + 1;
      const lignesPostes = Object.keys(cible).map((p) => {
        const n = parPoste[p] || 0;
        const manque = n < cible[p];
        return `<div class="ligneInfo"><span>${echapperHTML(p)}</span>` +
          `<b class="${manque ? 'deltaNegatif' : ''}">${n} / ${cible[p]}${manque ? ' ⚠️' : ''}</b></div>`;
      }).join('');
      const finContrat = eff.filter((j) => (j.contrat || 0) <= 1).length;
      titre.textContent = '📊 Forme du groupe';
      zone.innerHTML =
        `${ligneInfo(`Joueurs`, `${eff.length}`)}` +
        `${ligneInfo(`Âge moyen`, `${Math.round(age * 10) / 10} ans`)}` +
        `${ligneInfo(`Masse salariale`, `${salaires} k€/saison`)}` +
        `${ligneInfo(`Contrats expirant`, `${finContrat}`, { etat: `${finContrat ? 'deltaNegatif' : ''}` })}` +
        `<h4 class="sousTitreMedical">Profondeur par poste</h4>${lignesPostes}`;
    } else if (sous === 'selection') {
      const slot = ctx.estClubJoueur && RMClub.assurerCompositionPourEquipe
        ? RMClub.assurerCompositionPourEquipe(saison, ctx.type) : null;
      const compo = slot ? slot.compositionTitulaires : null;
      const banc = slot ? slot.compositionBanc : null;
      if (!compo) {
        titre.textContent = '📋 Sélection';
        zone.innerHTML = '<p style="color:var(--text-dim);">Aucune sélection : cette équipe n\'est pas dirigée par toi.</p>';
        return;
      }
      const parId = {};
      for (const j of eff) parId[j.id] = j;
      const lignes = Object.keys(RMClub.POSTE_REQUIS).map((n) => {
        const j = parId[compo[n]];
        const poste = RMClub.POSTE_REQUIS[n];
        if (!j) return `${ligneInfo(`n°${n} · ${poste}`, `à pourvoir`, { etat: `deltaNegatif` })}`;
        const note = RMClub.noteAuPoste ? RMClub.noteAuPoste(j, poste) : null;
        const horsPoste = j.poste !== poste ? ' ⚠️ hors poste' : '';
        return `<div class="ligneInfo"><span>n°${n} · ${poste}</span>` +
          `<b>${echapperHTML(j.nom)}${horsPoste}${note != null ? ` <span style="color:var(--text-dim);font-weight:400;">${note}</span>` : ''}</b></div>`;
      }).join('');
      const lignesBanc = banc ? Object.keys(banc).map((n) => {
        const j = parId[banc[n]];
        return j ? `${ligneInfo(`n°${n}`, `${echapperHTML(j.nom)} <span style="color:var(--text-dim);font-weight:400;">${echapperHTML(j.poste)}</span>`)}` : '';
      }).join('') : '';
      titre.textContent = '📋 Sélection retenue';
      zone.innerHTML = lignes + (lignesBanc ? `<h4 class="sousTitreMedical">Banc</h4>${lignesBanc}` : '');
    } else if (sous === 'disponibilite') {
      const blesses = [], reprise = [], pretes = [], fatigues = [], dispo = [];
      for (const j of eff) {
        if (j.pret) pretes.push(j);
        else if (RMClub.joursIndisponible(j) > 0) blesses.push(j);
        else if (j.reprise) reprise.push(j);
        else if ((j.fatigue || 0) >= 70) fatigues.push(j);
        else dispo.push(j);
      }
      const bloc = (titreBloc, liste, detail) => liste.length
        ? `<h4 class="sousTitreMedical">${titreBloc} (${liste.length})</h4>` + liste.map((j) =>
          `<div class="ligneInfo"><span>${echapperHTML(j.nom)} <span style="color:var(--text-faint);">${echapperHTML(j.poste)}</span></span>` +
          `<b>${detail(j)}</b></div>`).join('')
        : '';
      titre.textContent = '✅ Disponibilité';
      zone.innerHTML =
        bloc('Indisponibles', blesses, (j) => `${RMClub.joursIndisponible(j)} jour(s)`) +
        bloc('En reprise', reprise, (j) => {
          const e = RMClub.etapeReprise ? RMClub.etapeReprise(j) : null;
          return e ? echapperHTML(String(e)) : 'reprise';
        }) +
        bloc('Prêtés', pretes, (j) => `${(j.pret && j.pret.dureeRestante) || 0} jour(s)`) +
        bloc('Très fatigués', fatigues, (j) => `${Math.round(j.fatigue)} %`) +
        `<h4 class="sousTitreMedical">Disponibles (${dispo.length})</h4>` +
        `<p style="color:var(--text-dim);font-size:12px;margin:0;">${dispo.length} joueur(s) prêts à jouer sans réserve.</p>`;
    } else if (sous === 'dynamique') {
      titre.textContent = '🤝 Dynamique du vestiaire';
      // Même écran pour toutes les équipes, mais pas les mêmes données : un
      // club que le joueur ne dirige pas n'a AUCUN statut promis à afficher.
      // On le dit, plutôt que d'inventer une hiérarchie plausible.
      if (!ctx.estClubJoueur || ctx.type !== 'pro') {
        zone.innerHTML =
          `<p style="color:var(--text-dim);">Les statuts promis n'existent que pour l'effectif professionnel du club que tu diriges : ` +
          `c'est un engagement que TU prends devant tes joueurs. Ce que le vestiaire d'un autre club se promet n'est pas connu.</p>`;
        return;
      }
      const dossier = RMClub.dossierDynamique(saison);
      const rangDe = (l) => (l.statut ? RMClub.STATUTS[l.statut].rang : 0);
      const lignes = dossier.lignes.slice().sort((a, b) =>
        (rangDe(b) - rangDe(a)) || (b.moral - a.moral) || a.nom.localeCompare(b.nom));
      const etat = (l) => {
        if (l.veutPartir) return '<b class="texteAlerteJoueur">🚩 veut partir</b>';
        if (l.demandeEnAttente) return '<b class="texteAlerteJoueur">❗ te demande des comptes</b>';
        if (l.demandeTempsDeJeu) return '<b class="texteAlerteJoueur">❗ réclame du temps de jeu</b>';
        if (!l.statut) return '<b style="color:var(--text-faint);">aucune promesse</b>';
        if (l.promesseTenue === null) {
          return `<b style="color:var(--text-dim);">pas encore jugeable (${l.matchsDepuisPromesse}/${RMClub.MATCHS_MINIMUM_EVALUATION} matchs)</b>`;
        }
        const pct = Math.round((l.partTempsDeJeu || 0) * 100);
        return l.promesseTenue
          ? `<b class="deltaPositif">promesse tenue · ${pct} %</b>`
          : `<b class="deltaNegatif">promesse rompue · ${pct} % (attendu ${Math.round(l.tauxAttendu * 100)} %)</b>`;
      };
      const corps = lignes.map((l) =>
        `<tr><td>${echapperHTML(l.nom)}</td><td>${echapperHTML(l.poste)}</td>` +
        `<td>${echapperHTML(l.libelleStatut)}</td>` +
        `<td>${l.matchsDepuisPromesse != null ? `${l.titularisationsDepuisPromesse}+${l.bancDepuisPromesse} / ${l.matchsDepuisPromesse}` : '—'}</td>` +
        `<td>${l.moral} %</td><td>${etat(l)}</td></tr>`).join('');
      const resumeStatuts = RMClub.CLES_STATUT.map((cle) =>
        `${ligneInfo(`${echapperHTML(RMClub.STATUTS[cle].libelle)}`, `${dossier.parStatut[cle]}`)}`).join('');
      zone.innerHTML =
        `<p class="noteLectureSeule" style="margin:0 0 8px;">Un statut se promet depuis la fiche d'un joueur. ` +
        `Il ne change PAS la sélection automatique : c'est un engagement que tu dois tenir toi-même, ` +
        `mesuré sur les feuilles de match de l'équipe première.</p>` +
        resumeStatuts +
        `${ligneInfo(`Sans statut promis`, `${dossier.sansStatut}`)}` +
        `${ligneInfo(`Promesses rompues`, `${dossier.promessesRompues}`, { etat: `${dossier.promessesRompues ? 'deltaNegatif' : ''}` })}` +
        `${ligneInfo(`Joueurs mécontents`, `${dossier.mecontents}`, { etat: `${dossier.mecontents ? 'deltaNegatif' : ''}` })}` +
        `${ligneInfo(`Moral moyen`, `${dossier.moralMoyen != null ? dossier.moralMoyen + ' %' : 'non connu'}`)}` +
        `<h4 class="sousTitreMedical">Effectif et engagements</h4>` +
        `<table class="tableauClub tableauFiche"><thead><tr><th>Joueur</th><th>Poste</th><th>Statut promis</th>` +
        `<th title="Titularisations + entrées en jeu sur les matchs où il était disponible">XV+banc / matchs</th>` +
        `<th>Moral</th><th>État</th></tr></thead><tbody>${corps}</tbody></table>`;
    }
  }

  // --- Centre de développement --------------------------------------------
  // Réunit ce qui existait déjà mais était éparpillé : réserve, centre de
  // formation, prêts, progression. Toutes les sources sont existantes — rien
  // n'est fabriqué pour remplir l'écran.
  function ligneJeuneDev(j) {
    const pot = j.potentiel != null ? j.potentiel : null;
    const niveau = Math.round(((j.vitesse || 0) + (j.plaquage || 0)) / 2);
    const marge = pot != null ? pot - niveau : null;
    return `<div class="ligneJeune"><span class="infosJeune"><b>${echapperHTML(j.nom)}</b>` +
      `<span>${echapperHTML(j.poste)} · ${j.age} ans · niveau ${niveau}` +
      `${pot != null ? ` · potentiel ${pot}` : ''}</span></span>` +
      `<span style="flex:0 0 auto;">${marge != null && marge > 0 ? `+${marge}` : '—'}</span></div>`;
  }

  // --- Statistiques (onglet « stats ») -------------------------------------------------------------
  // Tout vient des statistiques RÉELLEMENT accumulées par les matchs joués
  // (accumulerStats pour le club, accumulerStatsJoueurs pour chaque joueur,
  // historiqueSaisons pour l'évolution). Aucun chiffre recalculé après coup.
  const LIBELLE_STAT_CLUB = {
    essais: 'Essais', passes: 'Passes réussies', passesTentees: 'Passes tentées',
    metresGagnes: 'Mètres gagnés', tacklesMade: 'Plaquages réussis',
    tacklesAttempted: 'Plaquages tentés', turnovers: 'Turnovers',
    penalitesConcedees: 'Pénalités concédées', kicks: 'Coups de pied',
  };

  function rafraichirStatistiques() {
    const zone = document.getElementById('clubStatistiques');
    const titre = document.getElementById('titreStatistiques');
    if (!zone || !titre) return;
    rafraichirSousOnglets('stats');
    const sous = sousOngletCourant('stats');
    const carte = document.getElementById('carteStatistiques');
    if (carte) carte.style.display = sous === 'apercu' ? 'none' : '';
    const c = saison.clubJoueur;
    const st = c.statsCumulees;
    const joues = st ? (st.matchsJoues || 0) : 0;

    if (sous === 'equipe') {
      titre.textContent = '🏉 Production du collectif';
      if (!joues) { zone.innerHTML = '<p style="color:var(--text-dim);">Aucun match joué : rien à mesurer pour l\'instant.</p>'; return; }
      zone.innerHTML = `${ligneInfo(`Matchs joués`, `${joues}`)}` +
        Object.keys(LIBELLE_STAT_CLUB).filter((k) => st[k] != null).map((k) =>
          `<div class="ligneInfo"><span>${LIBELLE_STAT_CLUB[k]}</span>` +
          `<b>${st[k]} <span style="color:var(--text-dim);font-weight:400;">${Math.round((st[k] / joues) * 10) / 10}/match</span></b></div>`).join('');
    } else if (sous === 'joueurs') {
      titre.textContent = '⭐ Meilleurs de la saison';
      const tous = (c.effectif || []).concat(c.jeunes || []).filter((j) => j.statsSaison && j.statsSaison.matchsJoues);
      if (!tous.length) { zone.innerHTML = '<p style="color:var(--text-dim);">Aucune statistique individuelle enregistrée.</p>'; return; }
      const top = (champ, libelle) => {
        const l = tous.slice().sort((a2, b2) => (b2.statsSaison[champ] || 0) - (a2.statsSaison[champ] || 0));
        return l[0] && l[0].statsSaison[champ]
          ? `${ligneInfo(`${libelle}`, `${echapperHTML(l[0].nom)} · ${l[0].statsSaison[champ]}`)}` : '';
      };
      zone.innerHTML =
        top('essais', 'Meilleur marqueur') + top('metresGagnes', 'Plus de mètres gagnés') +
        top('tacklesMade', 'Plus de plaquages') + top('passes', 'Plus de passes') +
        top('matchsJoues', 'Plus de matchs joués') +
        `<h4 class="sousTitreMedical">Temps de jeu (${tous.length} joueurs utilisés)</h4>` +
        tous.slice().sort((a2, b2) => (b2.statsSaison.matchsJoues || 0) - (a2.statsSaison.matchsJoues || 0))
          .slice(0, 10).map((j) =>
            `<div class="ligneInfo"><span>${echapperHTML(j.nom)} <span style="color:var(--text-faint);">${echapperHTML(j.poste)}</span></span>` +
            `<b>${j.statsSaison.matchsJoues} match(s)</b></div>`).join('');
    } else if (sous === 'matchs') {
      titre.textContent = '📋 Rencontres jouées';
      const id = c.id;
      const miens = (saison.calendrier || []).filter((f) => f.joue && (f.domicileId === id || f.exterieurId === id));
      if (!miens.length) { zone.innerHTML = '<p style="color:var(--text-dim);">Aucune rencontre jouée.</p>'; return; }
      zone.innerHTML = miens.map((f) => {
        const dom = f.domicileId === id;
        const pour = dom ? f.score.domicile : f.score.exterieur;
        const contre = dom ? f.score.exterieur : f.score.domicile;
        const forme = pour > contre ? 'v' : pour < contre ? 'd' : 'n';
        return `<div class="ligneResultatDash"><span class="badgeForme ${forme}">${LIBELLE_FORME[forme]}</span>` +
          `<span class="adversaireDash">${dom ? 'vs' : '@'} ${lienClub(dom ? f.exterieurId : f.domicileId)}</span>` +
          `<span class="scoreDash">${pour} - ${contre}</span></div>`;
      }).join('');
    } else if (sous === 'saisons') {
      titre.textContent = '📚 Évolution du club';
      // MÊME bloc que sur la fiche d'un club consulté (G16) : titres,
      // montées, descentes, divisions fréquentées, saison par saison. Une
      // seule fonction, donc aucun risque que les deux écrans racontent deux
      // histoires différentes du même club.
      zone.innerHTML = blocPalmaresClub(c.id);
    }
  }

  // --- Infrastructures (P1-44) ---------------------------------------------
  // Le budget servait UNIQUEMENT à acheter des joueurs. Ici, chaque ligne dit
  // ce que l'infrastructure apporte aujourd'hui, ce que coûterait le niveau
  // suivant, combien de temps il prendrait, et POURQUOI c'est possible ou non.
  const MOTIF_BLOCAGE = {
    niveauMax: 'Niveau maximum atteint',
    chantierEnCours: 'Un autre chantier est déjà en cours',
    budget: 'Budget insuffisant',
  };

  function rafraichirInfrastructures() {
    const zone = document.getElementById('clubInfrastructures');
    const carteCh = document.getElementById('carteChantier');
    const zoneCh = document.getElementById('clubChantier');
    if (!zone) return;
    const d = RMClub.dossierInfrastructures(saison);
    if (carteCh && zoneCh) {
      if (d.chantier) {
        carteCh.style.display = '';
        const fait = d.chantier.joursTotal - d.chantier.joursRestants;
        const pct = Math.round((fait / d.chantier.joursTotal) * 100);
        zoneCh.innerHTML =
          `<p style="margin:0 0 8px;"><b>${echapperHTML(d.chantier.label)}</b> → niveau ${d.chantier.niveauVise}</p>` +
          `<span class="barreMoral"><span style="width:${pct}%"></span></span> ` +
          `<span style="font-size:12px;color:var(--text-dim);">${d.chantier.joursRestants} jour(s) restant(s) sur ${d.chantier.joursTotal}</span>`;
      } else carteCh.style.display = 'none';
    }
    zone.innerHTML =
      `<p style="margin:0 0 10px;font-size:12px;color:var(--text-dim);">Budget disponible : <b>${d.budget} k€</b>. ` +
      `Un seul chantier à la fois — investir ici, c'est renoncer à recruter maintenant.</p>` +
      d.lignes.map((l) => {
        const action = l.blocage
          ? `<span class="badgeNiveau niveau-info">${MOTIF_BLOCAGE[l.blocage]}${l.blocage === 'budget' ? ` (−${l.manque} k€)` : ''}</span>`
          : `<button class="alt btnTravaux" data-cle="${echapperHTML(l.cle)}" style="flex:0 0 auto;width:auto;padding:7px 12px;font-size:12px;">Lancer · ${l.cout} k€ · ${l.duree} j</button>`;
        return `<div class="ligneJeune"><span class="infosJeune"><b>${l.icone} ${echapperHTML(l.label)} — niveau ${l.niveau}/${l.niveauMax}</b>` +
          `<span>${echapperHTML(l.effet)}${l.gainActuel ? ` · +${l.gainActuel} % aujourd'hui` : ''}` +
          `${l.gainSuivant ? ` · le niveau suivant ajoute +${l.gainSuivant} %` : ''}</span></span>` +
          `<span style="flex:0 0 auto;">${action}</span></div>`;
      }).join('');
  }

  document.getElementById('clubGestion').addEventListener('click', (e) => {
    const btn = e.target.closest('.btnTravaux');
    if (!btn) return;
    const res = RMClub.lancerTravaux(saison, btn.dataset.cle);
    if (!res.ok) {
      toast(res.motif === 'budget'
        ? `Budget insuffisant : il manque ${res.manque} k€`
        : 'Impossible de lancer ces travaux maintenant', 'erreur');
      return;
    }
    sauvegarder();
    rafraichirInfrastructures();
    rafraichirTopBarInfos();
    toast(`🚧 Travaux lancés — livraison dans ${res.duree} jour(s), ${res.cout} k€ engagés`);
  });

  function rafraichirDeveloppement() {
    const zone = document.getElementById('clubDeveloppement');
    const titre = document.getElementById('titreDeveloppement');
    if (!zone || !titre) return;
    rafraichirSousOnglets('developpement');
    const sous = sousOngletCourant('developpement');
    const c = saison.clubJoueur;
    const jeunes = c.jeunes || [];
    const pro = c.effectif || [];
    const pretes = pro.filter((j) => j.pret);
    const effB = RMClub.effectifPourEquipe ? (RMClub.effectifPourEquipe(saison, 'b') || []) : [];

    if (sous === 'apercu') {
      const progressent = pro.concat(jeunes)
        .filter((j) => (RMClub.calculerProgression(j) || []).some((p) => p.delta > 0)).length;
      titre.textContent = '🌱 Ce que le club produit';
      zone.innerHTML =
        `${ligneInfo(`Vivier Équipe B`, `${effB.length} joueur(s)`)}` +
        `${ligneInfo(`Centre de formation`, `${jeunes.length} jeune(s)`)}` +
        `${ligneInfo(`Joueurs prêtés`, `${pretes.length}`)}` +
        `${ligneInfo(`Joueurs en progression`, `${progressent}`)}`;
    } else if (sous === 'b') {
      titre.textContent = '🥈 Vivier de l\'Équipe B';
      zone.innerHTML = effB.length
        ? effB.slice().sort((a, b2) => (a.age || 0) - (b2.age || 0)).map(ligneJeuneDev).join('')
        : '<p style="color:var(--text-dim);">Aucun joueur disponible pour l\'Équipe B aujourd\'hui.</p>';
    } else if (sous === 'jeunes') {
      titre.textContent = '🌱 Centre de formation';
      zone.innerHTML = jeunes.length
        ? jeunes.slice().sort((a, b2) => (b2.potentiel || 0) - (a.potentiel || 0)).map(ligneJeuneDev).join('')
        : '<p style="color:var(--text-dim);">Aucun jeune au centre de formation.</p>';
    } else if (sous === 'prets') {
      titre.textContent = '📤 Joueurs prêtés';
      zone.innerHTML = pretes.length
        ? pretes.map((j) => `<div class="ligneJeune"><span class="infosJeune"><b>${echapperHTML(j.nom)}</b>` +
          `<span>${echapperHTML(j.poste)} · ${j.age} ans</span></span>` +
          `<span style="flex:0 0 auto;">${(j.pret && j.pret.dureeRestante) || 0} jour(s)</span></div>`).join('')
        : '<p style="color:var(--text-dim);">Aucun joueur prêté actuellement.</p>';
    } else if (sous === 'progression') {
      const avec = pro.concat(jeunes)
        .map((j) => ({ j, p: (RMClub.calculerProgression(j) || []).filter((x) => x.delta > 0) }))
        .filter((x) => x.p.length)
        .sort((a, b2) => b2.p.reduce((t, x) => t + x.delta, 0) - a.p.reduce((t, x) => t + x.delta, 0));
      titre.textContent = '📈 Progression depuis le début de saison';
      zone.innerHTML = avec.length
        ? avec.slice(0, 15).map((e2) => {
          const total = e2.p.reduce((t, x) => t + x.delta, 0);
          const detail = e2.p.slice(0, 3).map((x) => `${echapperHTML(x.attr)} +${x.delta}`).join(', ');
          return `<div class="ligneJeune"><span class="infosJeune"><b>${echapperHTML(e2.j.nom)}</b>` +
            `<span>${echapperHTML(e2.j.poste)} · ${e2.j.age} ans · ${detail}</span></span>` +
            `<span style="flex:0 0 auto;color:#6fd39b;">+${total}</span></div>`;
        }).join('')
        : '<p style="color:var(--text-dim);">Aucune progression mesurée pour l\'instant.</p>';
    }
  }

  // --- CONTRATS (TODO_AUDIT.md G4) ---------------------------------------
  // Même effectif que le tableau ci-dessus, lu par l'échéance : salaire,
  // valeur, fin de contrat, satisfaction, volonté de prolonger. Un clic ouvre
  // la MÊME fiche joueur — aucune seconde interface.
  const filtreContrats = { expirants: false, risque: false, triChamp: 'contrat', triSens: 1 };
  const LIBELLE_VOLONTE_COURT = { souhaite: 'Veut rester', ouvert: 'Ouvert', reticent: 'Réticent', refuse: 'Veut partir' };

  function rafraichirContrats() {
    const zone = document.getElementById('clubContrats');
    if (!zone || !RMClub.dossierContrats) return;
    const d = RMClub.dossierContrats(saison);
    let lignes = d.lignes.slice();
    if (filtreContrats.expirants) lignes = lignes.filter((l) => l.expire);
    if (filtreContrats.risque) lignes = lignes.filter((l) => l.expire && (l.volonte === 'refuse' || l.volonte === 'reticent'));
    const f = filtreContrats;
    const valeurTri = (l) => {
      if (f.triChamp === 'nom' || f.triChamp === 'poste' || f.triChamp === 'volonte') return String(l[f.triChamp]);
      return Number(l[f.triChamp]) || 0;
    };
    lignes.sort((a2, b2) => {
      const va = valeurTri(a2), vb = valeurTri(b2);
      let cmp = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
      if (cmp === 0) cmp = b2.niveau - a2.niveau;
      return cmp * f.triSens;
    });
    document.getElementById('clubContratsResume').textContent =
      `${d.lignes.length} contrats · masse ${d.masseSalariale} k€/saison · ` +
      `${d.expirants} expirant(s)` + (d.aRisque ? ` · ${d.aRisque} à risque` : '') +
      (d.negociationsEnCours ? ` · ${d.negociationsEnCours} négociation(s) en cours` : '');
    const colonnes = [
      ['nom', 'Nom'], ['poste', 'Poste'], ['age', 'Âge'], ['niveau', 'Niveau'],
      ['salaire', 'Salaire'], ['valeur', 'Valeur'], ['saisonFin', 'Fin'],
      ['moral', 'Moral'], ['satisfaction', 'Satisf.'], ['volonte', 'Avenir'],
    ];
    const entetes = colonnes.map(([champ, label]) => {
      const fleche = f.triChamp === champ ? (f.triSens === 1 ? '▲' : '▼') : '';
      return `<th class="triableContrat" data-champ="${champ}">${label}<span class="flecheTri">${fleche}</span></th>`;
    }).join('') + '<th>Statut</th>';
    const corps = lignes.map((l) => {
      const alerte = l.expire ? ' class="badgeContratCourt"' : '';
      const etat = l.negociationEnCours ? '💬 en négociation'
        : l.rompue ? '⛔ discussions rompues'
        : l.nonRenouvele ? '🚪 non renouvelé'
        : l.surListeTransfert ? '📤 sur la liste'
        : l.veutPartir ? '🚩 veut partir' : '—';
      return `<tr data-joueur="${echapperHTML(l.id)}">` +
        `<td>${echapperHTML(l.nom)}</td><td>${POSTE_COMPLET[l.poste] || l.poste}</td>` +
        `<td>${l.age}</td><td>${l.niveau}</td><td>${l.salaire} k€</td><td>${l.valeur} k€</td>` +
        `<td${alerte}>S${l.saisonFin}${l.expire ? ' ⚠️' : ''}</td>` +
        `<td><span class="barreMoral${l.moral < 45 ? ' bas' : l.moral >= 80 ? ' haut' : ''}"><span style="width:${l.moral}%"></span></span></td>` +
        `<td><span class="barreMoral${l.satisfaction < 45 ? ' bas' : l.satisfaction >= 80 ? ' haut' : ''}"><span style="width:${l.satisfaction}%"></span></span></td>` +
        `<td>${l.volonteIcone} ${LIBELLE_VOLONTE_COURT[l.volonte] || l.volonteLibelle}</td>` +
        `<td>${etat}</td></tr>`;
    }).join('');
    zone.innerHTML = lignes.length
      ? `<table class="tableauClub effectifCliquable"><thead><tr>${entetes}</tr></thead><tbody>${corps}</tbody></table>`
      : '<p>Aucun contrat ne correspond à ces filtres.</p>';
  }

  // --- JOUEURS DES CLUBS DE LA DIVISION ----------------------------------
  const filtreCibles = { poste: '' };
  function rafraichirCibles() {
    const zone = document.getElementById('clubCibles');
    if (!zone || !RMClub.joueursDesClubsAdverses) return;
    const cibles = RMClub.joueursDesClubsAdverses(saison, { poste: filtreCibles.poste, limite: 25 });
    const enCours = (saison.offresSortantes || []).length;
    document.getElementById('clubCiblesResume').textContent =
      `Budget ${saison.clubJoueur.budget} k€` + (enCours ? ` · ${enCours} offre(s) en cours` : '');
    const corps = cibles.map((c2) => {
      const offre = (saison.offresSortantes || []).find((o) => o.joueurId === c2.joueurId);
      const action = offre
        ? `<span class="detailMouvement">offre de ${offre.montant} k€ en cours</span>`
        : `<button class="alt btnOffreCible" data-joueur="${echapperHTML(c2.joueurId)}" data-club="${echapperHTML(c2.clubId)}" ` +
          `style="width:auto;padding:4px 8px;font-size:11px;">Faire une offre</button>`;
      return `<tr><td>${echapperHTML(c2.nom)}</td><td>${POSTE_COMPLET[c2.poste] || c2.poste}</td>` +
        `<td>${c2.age}</td><td>${Math.round((c2.vitesse + c2.plaquage) / 2)}</td>` +
        `<td>${echapperHTML(c2.clubNom)}</td><td>${c2.prixDemande} k€</td><td>${action}</td></tr>`;
    }).join('');
    zone.innerHTML = cibles.length
      ? `<table class="tableauClub"><thead><tr><th>Nom</th><th>Poste</th><th>Âge</th><th>Niveau</th>` +
        `<th>Club</th><th>Prix demandé</th><th></th></tr></thead><tbody>${corps}</tbody></table>`
      : '<p>Aucun joueur ne correspond à ce filtre.</p>';
  }

  function rafraichirEffectif() {
    rafraichirSousOnglets('effectif');
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
    // rendreOngletEffectif décide quel sous-onglet est visible, Contrats
    // compris : un seul endroit gère cet affichage.
    rendreOngletEffectif(ctx);
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
    const carte = document.getElementById('carteDerniersResultats');
    // Rien de joué : la carte disparaît au lieu d'occuper un écran pour dire
    // qu'elle n'a rien à dire. Elle revient d'elle-même au premier résultat.
    if (derniers.length === 0) { carte.style.display = 'none'; zone.innerHTML = ''; return; }
    carte.style.display = '';
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
    // Ultimatum en cours (TODO_AUDIT.md P1-42a) : un pourcentage seul ne dit
    // ni pourquoi il est bas, ni ce qu'il faut faire, ni ce qu'on risque. Ici
    // le manager lit les trois d'un coup, avec le compte à rebours réel.
    const ultimatum = RMClub.ultimatumEnCours(saison);
    const blocUltimatum = ultimatum
      ? `<div class="encartUltimatum"><b>⏳ Ultimatum de la direction — ${ultimatum.matchsRestants} match(s) restant(s)</b>` +
        `<p>${ultimatum.explication}</p></div>`
      : '';
    // Feuille de route (TODO_AUDIT.md P1-46) : le classement n'est plus la
    // seule chose que le président regarde, il faut donc que le manager voie
    // les autres axes ET son avancement réel dessus. L'axe « résultats » est
    // déjà détaillé par les deux lignes au-dessus : on n'affiche ici que ce
    // qui n'était visible nulle part.
    const dossierRoute = RMClub.dossierFeuilleDeRoute ? RMClub.dossierFeuilleDeRoute(saison) : null;
    const axesGestion = dossierRoute ? dossierRoute.axes.filter((a) => a.cle !== 'resultats') : [];
    const blocRoute = axesGestion.length
      ? `<h4 class="sousTitreMedical">Feuille de route de la direction</h4>` +
        axesGestion.map((a) =>
          `<div class="ligneInfo"><span>${echapperHTML(a.libelle)}<br>` +
          `<span style="color:var(--text-faint);font-size:11px;">${echapperHTML(a.description)}</span></span>` +
          `<b class="${a.atteint ? 'deltaPositif' : 'deltaNegatif'}">${a.mesure} / ${a.cible} ${echapperHTML(a.unite)} ${a.atteint ? '✓' : '✗'}</b></div>`).join('')
      : '';
    document.getElementById('clubObjectifSaison').innerHTML =
      `${ligneInfo(`Ambition du président`, `${RMClub.libelleObjectifSaison(c.objectifSaison)}`)}` +
      `${ligneInfo(`Position actuelle`, `${position}e/${classement.length} ${objectifAtteint ? '✓ en ligne avec l\'objectif' : '— en retard sur l\'objectif'}`, { etat: `${objectifAtteint ? '' : 'deltaNegatif'}` })}` +
      `${ligneInfo(`Confiance du président`, `<span class="barreMoral${confiance < 35 ? ' bas' : confiance >= 65 ? ' haut' : ''}"><span style="width:${confiance}%"></span></span> ${confiance}%`)}` +
      blocUltimatum + blocRoute;
  }

  // Analyse du prochain adversaire : moyennes d'attributs RÉELLES de son
  // effectif comparées aux tiennes (cf. RMClub.analyserAdversaire), plus sa
  // forme récente réelle — jamais une note fabriquée.
  function rafraichirAdversaire() {
    // Carte retirée du tableau de bord en P1-41 (toute l'analyse vit dans
    // « Préparer le match », qui la tire de prochainArret — cette fonction
    // résolvait la rencontre par prochainesFixtures et pouvait donc décrire
    // un AUTRE match que les autres cartes).
    const carte = document.getElementById('carteAdversaire');
    if (!carte) return;
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

  // --- Navigation PAYS -> CHAMPIONNAT (TODO_AUDIT.md P1-28) ---------------
  // Un seul écran pour les trois sources de compétitions (championnat du
  // joueur, autres paliers français, 12 pays du monde), toutes présentées
  // par RMClub.competitionsParPays sous la MÊME forme. Chaque championnat
  // affiche son classement ET son calendrier, et TOUS les noms de clubs sont
  // cliquables — c'est le point de la demande : il faut bien un endroit où
  // les noms apparaissent pour qu'on puisse les ouvrir.
  //
  // Choisir un pays ou un championnat n'est PAS choisir un club (règle
  // P1-20) : on se déplace entre compétitions, on ouvre toujours un club en
  // cliquant son nom.
  let paysNavChoisi = 'FRA';
  let competitionNavChoisie = null;

  function rafraichirAutresClubs() {
    const conteneurPays = document.getElementById('clubNavPays');
    if (!conteneurPays) return;
    // Le monde et les autres paliers sont créés au besoin : consulter une
    // compétition ne doit pas dépendre d'avoir ouvert un autre onglet avant.
    let creation = false;
    if (!saison.monde) { RMWorld.assurerMonde(creerRng(graineAleatoire()), saison); creation = true; }
    const niveauActuel = (saison.clubJoueur.palierPyramide || { niveau: 3 }).niveau;
    if (!saison.autresDivisionsFrance || saison.autresDivisionsFrance.niveauExclu !== niveauActuel) {
      RMClub.assurerAutresDivisionsFrance(creerRng(graineAleatoire()), saison);
      creation = true;
    }
    if (!saison.coupes || !Object.keys(saison.coupes).length) { RMClub.assurerCoupes(saison); creation = true; }
    // Listes d'inscription : complétées tant que la fenêtre est ouverte, pour
    // qu'une recrue arrivée AVANT la date limite soit inscrite d'office. Après
    // la limite, cet appel ne change plus rien (cf. club-inscriptions.js).
    if (RMClub.assurerInscriptions) RMClub.assurerInscriptions(saison);
    if (creation) sauvegarder();

    const pays = RMClub.competitionsParPays(saison);
    if (!pays.some((p) => p.code === paysNavChoisi)) paysNavChoisi = pays[0].code;
    const paysActif = pays.find((p) => p.code === paysNavChoisi);
    if (!paysActif.championnats.some((ch) => ch.ref === competitionNavChoisie)) {
      // Par défaut : le championnat du joueur s'il est dans ce pays, sinon
      // l'élite du pays choisi.
      const sien = paysActif.championnats.find((ch) => ch.estCelleDuJoueur);
      competitionNavChoisie = (sien || paysActif.championnats[0]).ref;
    }

    conteneurPays.innerHTML = pays.map((p) => {
      const actif = p.code === paysNavChoisi ? ' ligneClubJoueur' : '';
      const marque = p.championnats.some((ch) => ch.estCelleDuJoueur) ? ' ⭐' : '';
      return `<button class="alt btnPaysNav${actif}" data-pays="${echapperHTML(p.code)}" ` +
        `style="flex:0 0 auto;width:auto;padding:6px 10px;font-size:11.5px;margin:0 6px 6px 0;">` +
        `${echapperHTML(p.nom)}${marque}</button>`;
    }).join('');

    document.getElementById('clubNavChampionnats').innerHTML = paysActif.championnats.map((ch) => {
      const actif = ch.ref === competitionNavChoisie ? ' ligneClubJoueur' : '';
      return `<button class="alt btnChampionnatNav${actif}" data-ref="${echapperHTML(ch.ref)}" ` +
        `style="flex:0 0 auto;width:auto;padding:6px 10px;font-size:11.5px;">${echapperHTML(ch.nom)}` +
        `${ch.estCelleDuJoueur ? ' ⭐' : ''}</button>`;
    }).join('');

    rafraichirCompetitionChoisie();
  }

  // Le résumé du CLUB CONSULTÉ dans la compétition affichée. Une seule
  // fonction pour un championnat et pour une coupe : c'est
  // `RMClub.resumeCompetition` qui décide de ce qui est renseigné, et un
  // champ absent ne produit aucune ligne — jamais un zéro inventé.
  function blocResumeClub(comp) {
    const nav = RMClub.navigationClub(saison);
    const r = RMClub.resumeCompetition(saison, comp.ref, nav.clubConsulteId);
    if (!r || !r.engage) return '';
    const club = RMClub.clubPartout(saison, nav.clubConsulteId);
    const nom = club ? club.nom : 'Ce club';
    const l = [];
    if (r.estCoupe) {
      if (r.vainqueur) l.push(ligneInfo('Vainqueur', echapperHTML(r.vainqueur)));
      else if (r.elimine) l.push(ligneInfo(`Parcours de ${echapperHTML(nom)}`, `éliminé en ${echapperHTML((r.tourActuel || '').toLowerCase())}`));
      else if (r.tourActuel) l.push(ligneInfo(`Parcours de ${echapperHTML(nom)}`, `${echapperHTML(r.tourActuel)}`));
      if (r.encoreQualifies) l.push(ligneInfo('Clubs encore en lice', `${r.encoreQualifies}`));
    } else if (r.rang != null) {
      l.push(ligneInfo(`Position de ${echapperHTML(nom)}`,
        `${r.rang}<sup>${r.rang === 1 ? 'er' : 'e'}</sup> sur ${r.nbClubs}`));
      l.push(ligneInfo('Points', `${r.pts}`));
      l.push(ligneInfo('Bilan', `${r.g} V · ${r.n} N · ${r.p} D sur ${r.j} match(s)`));
      l.push(ligneInfo('Points marqués / encaissés',
        `${r.pointsPour} / ${r.pointsContre} (${r.difference >= 0 ? '+' : ''}${r.difference})`));
      if (r.bonusOffensifs || r.bonusDefensifs) {
        l.push(ligneInfo('Bonus', `${r.bonusOffensifs} offensif(s) · ${r.bonusDefensifs} défensif(s)`));
      }
      // La zone où l'on se trouve, déduite du RÈGLEMENT réel de la
      // compétition (cf. placesPyramideFrance) — jamais de positions codées
      // dans l'interface.
      const zone = zoneClassement(r.rang, r.nbClubs, comp);
      if (zone) l.push(ligneInfo('Situation', zone));
      if (r.journeesRestantes != null) {
        l.push(ligneInfo('Journées restantes', `${r.journeesRestantes} sur ${r.journees}`));
      }
    }
    if (r.forme.length) {
      l.push(ligneInfo('Forme (5 derniers)', r.forme.map(pastilleForme).join(' ')));
    }
    if (r.dernier) {
      l.push(ligneInfo('Dernier résultat',
        `${r.dernier.pour} - ${r.dernier.contre} ${r.dernier.domicile ? 'contre' : 'à'} ` +
        `${echapperHTML(r.dernier.adversaire || '?')}`));
    }
    if (r.prochain) {
      l.push(ligneInfo('Prochain match',
        `${r.prochain.domicile ? 'reçoit' : 'se déplace à'} ${echapperHTML(r.prochain.adversaire || '?')}` +
        (r.prochain.tour ? ` — ${echapperHTML(r.prochain.tour)}` : '')));
    }
    return l.length ? l.join('') + '<hr style="border:none;border-top:1px solid var(--border);margin:10px 0;">' : '';
  }

  // Une lettre de forme, colorée comme le reste du jeu (victoire / nul /
  // défaite) — pas un simple « V D N V V » illisible.
  function pastilleForme(lettre) {
    const couleur = lettre === 'V' ? 'var(--win)' : lettre === 'D' ? 'var(--loss)' : 'var(--draw)';
    return `<span style="color:${couleur};font-weight:700;">${lettre}</span>`;
  }

  // La zone du classement où tombe un rang, d'après le RÈGLEMENT réel de la
  // compétition. Renvoie null quand la compétition n'a ni montée ni descente
  // (Équipe B, espoirs) : on n'invente pas de zone là où il n'y en a pas.
  function zoneClassement(rang, total, comp) {
    if (comp.promus && rang <= comp.promus) return 'zone de montée';
    if (comp.relegues && rang > total - comp.relegues) return 'zone de relégation';
    if (comp.promus || comp.relegues) return 'maintien';
    return null;
  }

  // Les réserves de portée, affichées au lieu d'être tues : un classement des
  // buteurs qui ne couvre qu'un club doit le DIRE.
  function noteLimites(st) {
    if (!st || !st.limites || !st.limites.length) return '';
    return `<p style="font-size:11.5px;color:var(--text-dim);margin:12px 0 0;">`
      + st.limites.map((l) => echapperHTML(l)).join('<br>') + `</p>`;
  }

  // Onglets de l'écran Compétitions. Chacun lit la compétition CHOISIE dans la
  // navigation — championnat du joueur, autre palier français, ou l'un des 12
  // pays : mêmes composants, seules les données changent.
  function rendreOngletCompetition(comp) {
    const carte = document.getElementById('carteCompetitionOnglet');
    const zone = document.getElementById('clubCompetitionOnglet');
    const titre = document.getElementById('titreCompetitionOnglet');
    const carteClassement = document.getElementById('carteCompetitionChoisie');
    if (!carte || !zone || !titre) return;
    const sous = sousOngletCourant('classement');
    if (carteClassement) carteClassement.style.display = (sous === 'classement' || sous === 'apercu') ? '' : 'none';
    carte.style.display = sous === 'classement' ? 'none' : '';
    if (!comp) { zone.innerHTML = '<p style="color:var(--text-dim);">Championnat indisponible.</p>'; titre.textContent = 'Compétition'; return; }
    const rangs = RMClub.classementTrieDe ? RMClub.classementTrieDe(comp.classementBrut || comp.classement) : [];
    const lignes = rangs.length ? rangs : [];
    const nomDe = (id) => {
      const cl = (comp.clubs || []).find((c) => c.id === id);
      return cl ? cl.nom : id;
    };

    if (sous === 'apercu') {
      const joues = (comp.calendrier || []).filter((f) => f.joue).length;
      const leader = lignes[0];
      titre.textContent = `🏆 ${comp.nom}`;
      // Le résumé parle d'abord du CLUB CONSULTÉ dans cette compétition —
      // sa position, sa forme, son prochain match — avant de parler de la
      // compétition en général. Avant, il ne disait que « clubs engagés,
      // rencontres jouées, en tête, ta compétition ? oui » : quatre lignes
      // dont aucune ne concernait l'équipe du manager.
      zone.innerHTML = blocResumeClub(comp) +
        `${ligneInfo(`Clubs engagés`, `${(comp.clubs || []).length}`)}` +
        `${ligneInfo(`Rencontres jouées`, `${joues} / ${(comp.calendrier || []).length}`)}` +
        (leader ? `${ligneInfo(`En tête`, `${echapperHTML(nomDe(leader.clubId))} · ${leader.pts} pt(s)`)}` : '') +
        `${ligneInfo(`Ta compétition ?`, `${comp.estCelleDuJoueur ? 'oui' : 'non'}`)}`;
    } else if (sous === 'equipes') {
      titre.textContent = '🏟️ Clubs engagés';
      zone.innerHTML = (comp.clubs || []).length
        ? (comp.clubs || []).map((c) =>
          `<div class="ligneInfo"><span>${lienClub(c.id)}</span>` +
          `<b>${c.id === saison.clubJoueur.id ? 'ton club' : ''}</b></div>`).join('')
        : '<p style="color:var(--text-dim);">Aucun club listé pour cette compétition.</p>';
    } else if (sous === 'stats') {
      titre.textContent = '📊 Statistiques de la compétition';
      // Deux portées DIFFÉRENTES, et on le dit (cf. statistiquesCompetition) :
      // les équipes couvrent toute la compétition, les joueurs seulement le
      // club du joueur — les rencontres entre clubs IA n'ont pas de
      // statistiques individuelles à montrer.
      const st = RMClub.statistiquesCompetition(saison, comp.ref);
      if (!st || (!st.equipes && !st.joueurs)) {
        zone.innerHTML = '<p style="color:var(--text-dim);">Aucun résultat enregistré pour l\'instant.</p>'
          + noteLimites(st);
        return;
      }
      const palmares = (titreBloc, entrees, suffixe) => {
        if (!entrees || !entrees.length) return '';
        return `<h4 class="sousTitreFeuille">${echapperHTML(titreBloc)}</h4>` + entrees.map((e, i) =>
          `<div class="ligneInfo compact"><span>${i + 1}. ${e.clubId ? lienClub(e.clubId) : echapperHTML(e.nom || '?')}` +
          `${e.poste ? ` <span style="color:var(--text-faint);">${echapperHTML(e.poste)}</span>` : ''}</span>` +
          `<b>${e.valeur}${suffixe ? ' ' + suffixe : ''}</b></div>`).join('');
      };
      let html = '';
      if (st.equipes) {
        html += ligneInfo('Rencontres jouées', `${st.equipes.rencontresJouees}`)
          + ligneInfo('Points par rencontre', `${st.equipes.pointsParRencontre}`)
          + palmares('Meilleures attaques', st.equipes.meilleureAttaque, 'pts')
          + palmares('Meilleures défenses', st.equipes.meilleureDefense, 'encaissés')
          + palmares('Plus d\'essais marqués', st.equipes.plusDEssais, 'essais')
          + palmares('Meilleures différences', st.equipes.meilleureDifference, 'pts')
          + palmares('Bonus offensifs', st.equipes.plusDeBonusOffensifs, 'bonus');
      }
      if (st.joueurs) {
        html += `<h3 style="margin:16px 0 4px;font-size:12px;color:var(--text-faint);">JOUEURS — TON CLUB</h3>`
          + palmares('Meilleurs marqueurs', st.joueurs.marqueurs, 'essai(s)')
          + palmares('Meilleurs plaqueurs', st.joueurs.plaqueurs, 'plaquages')
          + palmares('Plus de mètres gagnés', st.joueurs.metres, 'm')
          + palmares('Plus de passes', st.joueurs.passeurs, 'passes');
      }
      zone.innerHTML = html + noteLimites(st);
    } else if (sous === 'regles') {
      titre.textContent = '📜 Format et règles';
      const promus = comp.promus || 0, relegues = comp.relegues || 0;
      zone.innerHTML =
        `${ligneInfo(`Format`, `${comp.estCoupe ? 'élimination directe' : 'championnat aller-retour'}`)}` +
        `${ligneInfo(`Clubs`, `${(comp.clubs || []).length}`)}` +
        `${ligneInfo(`Montées`, `${promus || 'aucune'}`)}` +
        `${ligneInfo(`Descentes`, `${relegues || 'aucune'}`)}` +
        (comp.partagee ? '<p style="font-size:12px;color:var(--text-dim);margin:8px 0 0;">Compétition partagée entre plusieurs pays.</p>' : '');
    } else if (sous === 'historique') {
      titre.textContent = '🕓 Historique';
      const h = RMClub.historiqueCompetition(saison, comp.ref);
      if (!h || !h.lignes.length) {
        zone.innerHTML = '<p style="color:var(--text-dim);">Aucune saison archivée pour cette compétition.</p>'
          + noteLimites(h);
        return;
      }
      const entete = h.type === 'coupe'
        ? '<tr><th>Saison</th><th>Parcours</th><th>Vainqueur</th></tr>'
        : '<tr><th>Saison</th><th>Palier</th><th>Pos.</th><th>Bilan</th><th>Pts</th><th>Champion</th></tr>';
      const corps = h.lignes.map((l) => h.type === 'coupe'
        ? `<tr${l.gagnee ? ' class="ligneClubJoueur"' : ''}><td>S${l.numero}</td>` +
          `<td>${l.gagnee ? '🏆 Vainqueur' : echapperHTML(l.tourAtteint || '—')}</td>` +
          `<td>${echapperHTML(l.vainqueur || '—')}</td></tr>`
        : `<tr${l.titre ? ' class="ligneClubJoueur"' : ''}><td>S${l.numero}</td>` +
          `<td>${echapperHTML(l.palier || '—')}</td>` +
          `<td>${l.titre ? '🏆 ' : ''}${l.position}<sup>${l.position === 1 ? 'er' : 'e'}</sup>/${l.totalClubs}</td>` +
          `<td>${echapperHTML(l.bilan)}</td><td><b>${l.points}</b></td>` +
          `<td>${echapperHTML(l.champion || '—')}</td></tr>`).join('');
      zone.innerHTML = ligneInfo('Saisons archivées', `${h.lignes.length}`)
        + ligneInfo('Titres', `${h.titres}`)
        + `<table class="tableauClub"><thead>${entete}</thead><tbody>${corps}</tbody></table>`
        + noteLimites(h);
    }
  }

  // --- Les compétitions de l'ÉQUIPE sélectionnée ---------------------------
  //
  // Le point d'entrée du parcours « Compétitions → Première/B/Espoirs →
  // compétition ». Chaque ligne porte un vrai résumé tiré des données
  // réelles (rang, points, forme, prochain adversaire / tour de coupe) — rien
  // n'est fabriqué, et un champ absent ne s'affiche pas.
  //
  // Une seule fonction pour les trois équipes et pour les deux formats
  // (championnat, coupe) : c'est `RMClub.resumeCompetition` qui décide de ce
  // qui est renseigné, pas une branche par équipe ici.
  function resumeCourtCompetition(r) {
    if (r.estCoupe) {
      if (r.vainqueur) return `Vainqueur : ${echapperHTML(r.vainqueur)}`;
      if (r.elimine) return 'Éliminé';
      if (r.tourActuel) return `${echapperHTML(r.tourActuel)} · ${r.encoreQualifies || 0} clubs en lice`;
      return 'Tableau à venir';
    }
    if (r.rang == null) return 'Pas encore engagé';
    return `${r.rang}<sup>${r.rang === 1 ? 'er' : 'e'}</sup> / ${r.nbClubs} · ${r.pts} pt(s) · ${r.j} match(s)`;
  }
  function detailCompetition(r) {
    const bouts = [];
    if (r.forme.length) bouts.push(`Forme ${r.forme.join(' ')}`);
    if (r.dernier) {
      bouts.push(`Dernier : ${r.dernier.pour}-${r.dernier.contre} ` +
        `${r.dernier.domicile ? 'contre' : 'à'} ${echapperHTML(r.dernier.adversaire || '?')}`);
    }
    if (r.prochain) {
      bouts.push(`Prochain : ${r.prochain.domicile ? 'reçoit' : 'se déplace à'} ` +
        `${echapperHTML(r.prochain.adversaire || '?')}` +
        (r.prochain.tour ? ` (${echapperHTML(r.prochain.tour)})` : ''));
    }
    if (!r.estCoupe && r.journeesRestantes != null) {
      bouts.push(`${r.journeesRestantes} journée(s) restante(s)`);
    }
    return bouts.join(' · ');
  }

  // Ouvre une compétition en la DÉSIGNANT par sa référence. Le pays suit :
  // sans ça, rafraichirAutresClubs() remettait la compétition du pays
  // actuellement affiché (mesuré en cliquant une compétition de son club
  // après avoir consulté le Japon).
  function choisirCompetition(ref) {
    if (!ref) return;
    for (const p of RMClub.competitionsParPays(saison)) {
      if (p.championnats.some((ch) => ch.ref === ref)) { paysNavChoisi = p.code; break; }
    }
    competitionNavChoisie = ref;
    rafraichirAutresClubs();
  }

  function rafraichirCompetitionsEquipe() {
    const zone = document.getElementById('clubCompetitionsEquipe');
    const titre = document.getElementById('titreCompetitionsEquipe');
    if (!zone) return;
    const ctx = contexte();
    const nav = RMClub.navigationClub(saison);
    const carte = document.getElementById('carteCompetitionsEquipe');
    // Un club qu'on ne dirige pas n'a pas d'Équipe B ni d'espoirs simulés :
    // cette carte n'aurait rien de vrai à montrer, on la retire plutôt que
    // d'afficher une liste vide.
    if (carte) carte.style.display = RMClub.consulteClubJoueur(saison) ? '' : 'none';
    if (!RMClub.consulteClubJoueur(saison)) return;
    if (titre) titre.textContent = `🏆 Compétitions — ${ctx.label || 'équipe'}`;
    const liste = RMClub.competitionsDeLEquipe(saison, ctx.type);
    if (!liste.length) {
      zone.innerHTML = '<p style="color:var(--text-dim);">Cette équipe ne dispute aucune compétition cette saison.</p>';
      return;
    }
    zone.innerHTML = liste.map((c) => {
      const r = RMClub.resumeCompetition(saison, c.ref, nav.clubConsulteId);
      if (!r) return '';
      const actif = c.ref === competitionNavChoisie ? ' ligneClubJoueur' : '';
      const detail = detailCompetition(r);
      return `<button class="alt btnCompetitionEquipe${actif}" data-ref="${echapperHTML(c.ref)}" ` +
        `style="width:100%;text-align:left;margin-bottom:6px;padding:9px 11px;">` +
        `<span style="display:flex;justify-content:space-between;gap:10px;align-items:baseline;">` +
        `<b>${c.estCoupe ? '🏆' : '📊'} ${echapperHTML(c.nom)}</b>` +
        `<span style="font-size:12px;">${resumeCourtCompetition(r)}</span></span>` +
        (detail ? `<span style="display:block;font-size:11.5px;color:var(--text-dim);margin-top:3px;">${detail}</span>` : '') +
        `</button>`;
    }).join('');
  }

  function rafraichirCompetitionChoisie() {
    rafraichirSousOnglets('classement');
    rafraichirCompetitionsEquipe();
    const comp = RMClub.competition(saison, competitionNavChoisie);
    rendreOngletCompetition(comp);
    const zoneClassement = document.getElementById('clubCompetitionClassement');
    const titre = document.getElementById('titreCompetitionChoisie');
    const titreCal = document.getElementById('titreCalendrierCompetition');
    if (!comp) {
      if (titre) titre.textContent = '🏆 Championnat';
      if (titreCal) titreCal.textContent = '📅 Calendrier';
      if (zoneClassement) zoneClassement.innerHTML = '<p style="color:var(--text-dim);">Championnat indisponible.</p>';
      rafraichirCalendrier();
      return;
    }
    const suffixe = comp.estCelleDuJoueur ? ' — ta compétition' : '';
    if (titre) titre.textContent = `🏆 ${comp.nom}${suffixe}`;
    if (titreCal) titreCal.textContent = `📅 ${comp.nom}${suffixe}`;

    // Les académies du championnat espoirs (P1-31) n'ont pas de fiche à
    // ouvrir : leur nom est affiché EN TEXTE, jamais un lien mort.
    const nomsCompetition = {};
    for (const cl of comp.clubs) {
      if (cl.id !== saison.clubJoueur.id && !RMClub.clubPartout(saison, cl.id)) nomsCompetition[cl.id] = cl.nom;
    }
    // Forme de CHAQUE club de la compétition, lue une seule fois depuis son
    // calendrier réel — la colonne manquait, alors que la donnée existait.
    const formeParClub = {};
    for (const f of (comp.calendrier || [])) {
      if (!f.joue || !f.score) continue;
      const dom = f.score.domicile, ext = f.score.exterieur;
      (formeParClub[f.domicileId] = formeParClub[f.domicileId] || [])
        .push(dom > ext ? 'V' : dom < ext ? 'D' : 'N');
      (formeParClub[f.exterieurId] = formeParClub[f.exterieurId] || [])
        .push(ext > dom ? 'V' : ext < dom ? 'D' : 'N');
    }
    const lignes = comp.classement.map((r) => {
      // Zones lues au RÈGLEMENT réel de la compétition (comp.promus /
      // comp.relegues, cf. placesPyramideFrance). Avant, « zone de montée »
      // et « mon club » portaient la MÊME classe : impossible de distinguer
      // le club du joueur d'un promu — et comme le championnat du joueur
      // annonçait 0 montée et 0 descente, aucune zone n'apparaissait jamais.
      const zonePromue = comp.promus && r.rang <= comp.promus;
      const zoneRelegable = comp.relegues && r.rang > comp.classement.length - comp.relegues;
      const estJoueur = r.clubId === saison.clubJoueur.id;
      const classes = ['ligneCompetition'];
      if (estJoueur) classes.push('ligneClubJoueur');
      if (zonePromue) classes.push('zoneMontee');
      else if (zoneRelegable) classes.push('zoneRelegation');
      const classe = ` class="${classes.join(' ')}"`;
      const paysClub = comp.partagee && r.club && r.club.pays ? ` <span style="color:var(--text-faint);">(${echapperHTML(r.club.pays)})</span>` : '';
      const nom = nomsCompetition[r.clubId] ? echapperHTML(nomsCompetition[r.clubId]) : lienClub(r.clubId);
      const diff = r.pointsPour - r.pointsContre;
      return `<tr${classe}><td>${r.rang}</td><td>${nom}${paysClub}</td>` +
        `<td>${r.j}</td><td>${r.g}</td><td>${r.n}</td><td>${r.p}</td>` +
        `<td>${r.pointsPour}</td><td>${r.pointsContre}</td><td>${diff >= 0 ? '+' : ''}${diff}</td>` +
        `<td title="Bonus offensif (4 essais ou plus)">${r.bonusOffensifs || 0}</td>` +
        `<td title="Bonus défensif (défaite par 7 points ou moins)">${r.bonusDefensifs || 0}</td>` +
        `<td><b>${r.pts}</b></td>` +
        `<td style="white-space:nowrap;">${(formeParClub[r.clubId] || []).slice(-5).map(pastilleForme).join(' ')}</td></tr>`;
    }).join('');
    if (comp.estCoupe && zoneClassement) {
      // Une coupe n'a pas de classement : c'est un tableau. On le dit, et on
      // annonce le vainqueur dès que la finale est jouée — jamais une table
      // de points fabriquée pour remplir l'écran.
      const nomsCoupe = {};
      for (const cl of comp.clubs) nomsCoupe[cl.id] = cl.nom;
      const vainqueur = comp.vainqueurId ? (nomsCoupe[comp.vainqueurId] || '') : null;
      zoneClassement.innerHTML =
        `<p style="font-size:12.5px;color:var(--text-dim);margin:0 0 10px;">Compétition à élimination directe : pas de classement, un tableau. ${comp.clubs.length} clubs engagés — le calendrier montre chaque tour.</p>` +
        (vainqueur
          ? `<p class="noteLectureSeule">🏆 Vainqueur : <b>${echapperHTML(vainqueur)}</b></p>`
          : '<p class="noteLectureSeule">La compétition est en cours : aucun vainqueur pour l\'instant.</p>');
      rafraichirCalendrier();
      return;
    }
    if (zoneClassement) {
      // Légende : les zones ne veulent rien dire sans elle, et elles doivent
      // annoncer le nombre RÉEL de places (cf. règlement de la compétition).
      const legende = (comp.promus || comp.relegues)
        ? `<div class="legendeZones">` +
          (comp.promus ? `<span class="zMontee">${comp.promus} place(s) de montée</span>` : '') +
          (comp.relegues ? `<span class="zRelegation">${comp.relegues} place(s) de relégation</span>` : '') +
          `</div>`
        : '';
      zoneClassement.innerHTML = '<table class="tableauClub"><thead><tr><th></th><th>Club</th><th>J</th><th>G</th><th>N</th><th>P</th>' +
        '<th>Pts+</th><th>Pts-</th><th>Diff</th><th title="Bonus offensifs">BO</th><th title="Bonus défensifs">BD</th><th>Pts</th>' +
        '<th title="Les 5 derniers résultats">Forme</th></tr></thead>' +
        `<tbody>${lignes}</tbody></table>${legende}`;
    }
    rafraichirCalendrier();
  }


  // Vue d'ensemble d'un club CONSULTÉ (TODO_AUDIT.md P1-20) : ce que le
  // joueur peut réellement observer d'un club qu'il ne dirige pas —
  // identité, forme récente, tactique déduite de ses attributs, comparaison
  // d'effectif et historique RÉEL des confrontations directes. Affichée dans
  // l'onglet "Vue d'ensemble", à la place du tableau de bord de gestion —
  // pas dans un écran séparé.
  // --- Palmarès et parcours d'un club (G16) --------------------------------
  // UNE seule fonction pour le club du joueur et pour un club consulté : la
  // fiche d'un adversaire ne doit pas être une version pauvre de la sienne.
  // Tout vient de RMClub.palmaresClub / historiqueClub, dérivés de
  // l'historique réellement enregistré — un club sans passé le DIT.
  function blocPalmaresClub(clubId) {
    if (!RMClub.palmaresClub) return '';
    const p = RMClub.palmaresClub(saison, clubId);
    if (!p || !p.saisons) {
      return '<p class="noteLectureSeule" style="margin:0;">Aucune saison enregistrée pour ce club : ' +
        'son histoire commencera à la fin de la saison en cours.</p>';
    }
    const paliers = (p.paliers || []).map((n2) => RMClub.nomPalierFrance(n2)).join(', ');
    const lignes = RMClub.historiqueClub(saison, clubId).slice().reverse().map((h) =>
      `<div class="ligneInfo"><span>Saison ${h.numero}${h.palierNiveau != null
        ? ` · ${echapperHTML(RMClub.nomPalierFrance(h.palierNiveau))}` : ''}</span>` +
      `<b>${h.position}e/${h.totalClubs}${h.titre ? ' 🏆' : ''}` +
      (h.victoires != null ? ` <span style="color:var(--text-dim);font-weight:400;">${h.victoires}V ${h.nuls}N ${h.defaites}D</span>` : '') +
      `</b></div>`).join('');
    return `${ligneInfo('Saisons suivies', `${p.saisons}`)}` +
      `${ligneInfo('Titres', `${p.titres}${p.titres ? ' 🏆' : ''}`)}` +
      `${ligneInfo('Montées · Descentes', `${p.montees} · ${p.descentes}`)}` +
      (p.meilleurePosition != null ? `${ligneInfo('Meilleure place', `${p.meilleurePosition}e`)}` : '') +
      (paliers ? `${ligneInfo('Divisions fréquentées', echapperHTML(paliers))}` : '') +
      lignes;
  }

  // Marché des entraîneurs (G24) : qui est sur le banc d'en face, depuis
  // combien de temps, et si sa place est menacée. Le « menacé » n'est pas un
  // second barème : c'est RMClub.enDanger, soit la règle de limogeage de fin
  // de saison appliquée au classement provisoire.
  function blocEntraineurClub(clubId) {
    if (!RMClub.entraineurDuClub) return '';
    const e = RMClub.entraineurDuClub(saison, clubId);
    if (!e) return '';
    const poste = RMClub.posteOuvert ? RMClub.posteOuvert(saison, clubId) : null;
    const comp = RMClub.competitionDuClub ? RMClub.competitionDuClub(saison, clubId) : null;
    const ligne = comp ? (comp.classement || []).find((r) => r.clubId === clubId) : null;
    const position = ligne ? (comp.classement.indexOf(ligne) + 1) : null;
    const total = comp ? comp.classement.length : 0;
    // Sur un classement à ZÉRO journée jouée, les positions ne sont qu'un
    // ordre arbitraire : afficher « sur la sellette » au coup d'envoi de la
    // saison serait un verdict fabriqué. Même garde que côté règle
    // (club-carriere-manager.js, postesAPrendre).
    const journeesJouees = (saison.calendrier || []).filter((f) => f.joue).length;
    const menace = journeesJouees && position && total && RMClub.enDanger && !e.interim
      ? RMClub.enDanger(position, total, e) : false;
    const anciennete = e.saisonsAuClub === 0
      ? (e.interim ? 'intérimaire' : 'première saison')
      : `${e.saisonsAuClub} saison${e.saisonsAuClub > 1 ? 's' : ''} au club`;
    // `niveau-urgent` et `niveau-info` existent réellement dans la feuille de
    // style ; `niveau-alerte`, utilisé d'abord ici, n'y est PAS défini — le
    // badge serait sorti sans couleur ni bordure.
    const etat = poste
      ? '<span class="badgeNiveau niveau-urgent">Poste à pourvoir</span>'
      : (menace ? '<span class="badgeNiveau niveau-urgent">Sur la sellette</span>' : '');
    return `<div class="offreManager">` +
      `<div class="offreTitre"><b>Entraîneur : ${echapperHTML(e.nom)}</b> ${etat}</div>` +
      `<div class="offreLigne">Réputation ${e.reputation} · ${echapperHTML(anciennete)}</div>` +
      (poste ? `<div class="offreLigne" style="opacity:.85">${echapperHTML(poste.raison)}</div>` : '') +
      `</div>`;
  }

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
    const adv = RMClub.clubPartout(saison, nav.clubConsulteId);
    carte.style.display = '';
    if (titre) titre.textContent = adv.nom;
    if (sousTitre) sousTitre.textContent = 'Ce que tes recruteurs savent de ce club — consultation seule.';
    // Palmarès et parcours (G16) : le MÊME bloc que sur sa propre fiche.
    const zonePalmares = document.getElementById('clubVueConsultePalmares');
    if (zonePalmares) zonePalmares.innerHTML = blocPalmaresClub(adv.id);
    const zoneEntraineur = document.getElementById('clubVueConsulteEntraineur');
    if (zoneEntraineur) zoneEntraineur.innerHTML = blocEntraineurClub(adv.id);
    const facteurAnalyste = RMClub.effetPersonnel(saison, 'analyste');
    const seuilAnalyste = Math.max(2, Math.round(6 - (facteurAnalyste - 1) * 8));
    const analyse = RMClub.analyserAdversaire(saison, adv.id, seuilAnalyste);
    // Club dont l'effectif n'est PAS simulé (autre palier français, autre
    // pays — TODO_AUDIT.md P1-28) : aucune analyse comparative n'est
    // possible, et on n'en fabrique pas. On montre ce qui est réellement
    // connu — son identité, sa compétition, son rang et sa réputation — et
    // on dit clairement ce qui ne l'est pas. Son classement et son
    // calendrier complets restent consultables dans leurs écrans.
    if (!analyse) {
      const comp = RMClub.competitionDuClub(saison, adv.id);
      const ligne = comp ? comp.classement.find((r) => r.clubId === adv.id) : null;
      const etoiles = Math.max(1, Math.min(5, Math.round((adv.niveauClub != null ? adv.niveauClub : 0.5) * 5)));
      document.getElementById('clubVueConsulteIdentite').innerHTML =
        `<div class="ficheJoueurEntete"><span><span class="nomJoueurFiche">${echapperHTML(adv.nom)}</span>` +
        `<span class="posteJoueurFiche">${comp ? echapperHTML(comp.nom) : 'Compétition inconnue'}` +
        `${ligne ? ` · ${ligne.rang}${ligne.rang === 1 ? 'er' : 'e'}/${comp.classement.length}` : ''}` +
        ` · Réputation ${'★'.repeat(etoiles)}${'☆'.repeat(5 - etoiles)}</span></span></div>` +
        (ligne ? `<p style="font-size:12px;color:var(--text-dim);margin:8px 0;">Bilan : ${ligne.j} joué(s), ${ligne.g} gagné(s), ${ligne.n} nul(s), ${ligne.p} perdu(s) — ${ligne.pts} pts.</p>` : '');
      document.getElementById('clubVueConsulteAnalyse').innerHTML =
        '<p style="font-size:12px;color:var(--text-dim);margin:0;">Ce club évolue hors de ton championnat : ses résultats et son classement sont réels et suivis, mais son effectif n\'est pas simulé — il n\'y a donc aucune analyse joueur par joueur à te montrer, et rien ne sera inventé.</p>';
      document.getElementById('clubVueConsulteConfrontations').innerHTML =
        '<p style="font-size:12px;color:var(--text-faint);margin:0;">Aucune confrontation possible : vous ne jouez pas la même compétition.</p>';
      return;
    }
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
    rafraichirPropositionAmical(adv);
  }

  // --- Proposer un match amical (TODO_AUDIT.md P1-32) ---------------------
  // Sur la page du club consulté : les prochaines dates RÉELLEMENT libres de
  // son calendrier, et rien d'autre. Aucune date n'est proposée si elle
  // entre en conflit avec une rencontre officielle — l'impossibilité vient
  // du calendrier, pas d'une règle inventée.
  function rafraichirPropositionAmical(adversaire) {
    const zone = document.getElementById('clubVueConsulteAmical');
    if (!zone) return;
    if (!adversaire || !RMClub.aUnEffectifSimule(adversaire)) {
      zone.innerHTML = '';
      return;
    }
    const dejaPrevu = (saison.amicaux || []).find((a) => !a.joue && a.adversaireId === adversaire.id);
    if (dejaPrevu) {
      zone.innerHTML = `<h4 style="margin:14px 0 6px;">🤝 Match amical</h4>` +
        `<p class="noteLectureSeule">Rencontre déjà convenue le ${echapperHTML(RMClub.formaterDateLongue(RMClub.dateDepuisISO(dejaPrevu.date)))}.</p>` +
        `<button class="alt" id="btnAnnulerAmical" data-amical="${echapperHTML(dejaPrevu.id)}" style="width:100%;margin-top:8px;">Annuler cette rencontre</button>`;
      return;
    }
    const libres = RMClub.datesLibresPourAmical(saison, 45);
    if (!libres.length) {
      zone.innerHTML = `<h4 style="margin:14px 0 6px;">🤝 Match amical</h4>` +
        `<p class="noteLectureSeule">Aucune date libre dans les six prochaines semaines : ton calendrier est plein.</p>`;
      return;
    }
    const options = libres.slice(0, 20).map((d) =>
      `<option value="${echapperHTML(d.iso)}">${echapperHTML(d.libelle)} (dans ${d.joursRestants} j)</option>`).join('');
    zone.innerHTML = `<h4 style="margin:14px 0 6px;">🤝 Match amical</h4>` +
      `<p style="font-size:12px;color:var(--text-dim);margin:0 0 8px;">Propose une rencontre à ${echapperHTML(adversaire.nom)} sur une date libre de ton calendrier. Un amical ne rapporte aucun point, mais il fatigue, use et fait jouer.</p>` +
      `<label class="sr-label" for="selDateAmical">Date de la rencontre</label>` +
      `<select id="selDateAmical" style="width:100%;">${options}</select>` +
      `<button class="accent" id="btnProposerAmical" data-club="${echapperHTML(adversaire.id)}" style="width:100%;margin-top:8px;">Proposer cette rencontre</button>`;
  }

  // --- rafraichirMiniClassement / rafraichirStatutEffectif supprimées
  // (TODO_AUDIT.md P1-37) : leurs cartes doublaient la page Classement, la
  // barre du haut et la zone « À traiter ». Aucune donnée n'est perdue —
  // elle est simplement affichée une seule fois, là où elle a du sens.

  // --- Zone « À traiter » (TODO_AUDIT.md P1-36) ---------------------------
  // Remplace l'ancienne carte « Décisions & alertes », qui ignorait les
  // décisions réellement en attente et laissait les messages non lus
  // invisibles jusqu'à 1586 px de défilement sur mobile. La liste vient
  // entièrement de RMClub.elementsATraiter : aucune règle d'affichage ne
  // décide ici de ce qui est urgent — c'est l'état de la carrière qui le dit.
  const LIBELLE_NIVEAU = {
    decision: 'À décider', urgent: 'Urgent', recommande: 'Recommandé', info: 'Bon à savoir',
  };

  function rafraichirAlertes() {
    const carte = document.getElementById('carteAlertes');
    const zone = document.getElementById('clubAlertes');
    if (!carte || !zone) return;
    const elements = RMClub.elementsATraiter(saison);
    // Rien à traiter = pas de carte. Une carte « tout va bien » serait
    // décorative : elle occuperait de la place sans rien apprendre.
    if (elements.length === 0) { carte.style.display = 'none'; return; }
    carte.style.display = '';
    const resume = RMClub.resumeATraiter(saison);
    const titre = carte.querySelector('h3');
    if (titre) {
      const parts = [];
      if (resume.decisions) parts.push(`${resume.decisions} à décider`);
      if (resume.urgents) parts.push(`${resume.urgents} urgent${resume.urgents > 1 ? 's' : ''}`);
      titre.textContent = `📋 À traiter${parts.length ? ` — ${parts.join(', ')}` : ` (${resume.total})`}`;
    }
    zone.innerHTML = elements.map((e) =>
      `<div class="ligneAlerte niveau-${e.niveau}" data-onglet="${echapperHTML(e.onglet)}"` +
      (e.messageId ? ` data-message="${echapperHTML(e.messageId)}"` : '') + '>' +
      `<span class="iconeAlerte">${e.icone}</span>` +
      `<span class="texteAlerte">${echapperHTML(e.texte)}</span>` +
      `<span class="badgeNiveau niveau-${e.niveau}">${LIBELLE_NIVEAU[e.niveau] || e.niveau}</span>` +
      '</div>'
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
      // Décision DATÉE (TODO_AUDIT.md P1-23) : le joueur n'attend pas
      // indéfiniment — passée l'échéance, le silence vaut refus.
      const limite = m.decision.dateLimite ? RMClub.dateDepuisISO(m.decision.dateLimite) : null;
      const echeance = limite
        ? `<span class="echeanceDecision">⏳ Réponse attendue avant le ${echapperHTML(RMClub.formaterDateCourte(limite))}</span>` : '';
      return echeance + `<span class="decisionMessageActions">${m.decision.options.map((o) =>
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
      (c.sponsor ? `<div class="ligneInfo compact" style="margin-top:8px;"><span>Sponsor</span><b>${c.sponsor.nom} · +${c.sponsor.revenuParMatch} k€/match</b></div>` : '');
    const masseJoueurs = RMClub.masseSalariale(c.effectif);
    const massePersonnel = RMClub.masseSalarialePersonnel(c);
    document.getElementById('clubMasseSalariale').innerHTML =
      `${ligneInfo(`Salaires joueurs (saison)`, `${masseJoueurs} k€`, { compact: true })}` +
      `${ligneInfo(`Salaires personnel (saison)`, `${massePersonnel} k€`, { compact: true })}` +
      `${ligneInfo(`Total / journée`, `${Math.round((masseJoueurs + massePersonnel) / RMClub.nombreJourneesSaison(saison.calendrier))} k€`, { compact: true })}`;
    // Prévisionnel : previsionTresorerie (P1-47) remplace prevoirFinances —
    // il tient compte du chantier engagé, ce que l'ancien extrapolateur
    // ignorait alors que c'est la plus grosse dépense du jeu.
    const prevision = RMClub.previsionTresorerie(saison, 5);
    const cartePrevisions = document.getElementById('cartePrevisions');
    if (prevision) {
      cartePrevisions.style.display = '';
      document.getElementById('clubPrevisions').innerHTML =
        `${ligneInfo(`Solde net moyen / journée`, `${prevision.soldeNetMoyen >= 0 ? '+' : ''}${prevision.soldeNetMoyen} k€`, { compact: true, etat: `${prevision.soldeNetMoyen < 0 ? ' alerte' : ''}` })}` +
        (prevision.chantier
          ? `${ligneInfo(`Chantier en cours (déjà payé)`, `${prevision.chantier.cout} k€ · livraison dans ${prevision.chantier.joursRestants} j`, { compact: true })}`
          : '') +
        (prevision.engagements ? `${ligneInfo(`Reste à décaisser`, `${prevision.engagements} k€`, { compact: true, etat: `alerte` })}` : '') +
        `${ligneInfo(`Budget projeté dans ${prevision.nJournees} journées`, `${prevision.projection} k€`, { compact: true, etat: `${prevision.projection < 0 ? ' critique' : ''}` })}`;
    } else {
      cartePrevisions.style.display = 'none';
    }
    // Grand livre (P1-47) : d'abord OÙ va l'argent (ventilation par poste sur
    // la saison), puis le détail opération par opération. Avant, cet écran ne
    // montrait que les mouvements de jour de match — transferts et travaux,
    // pourtant les plus gros postes, n'y figuraient nulle part.
    const dossier = RMClub.dossierComptes(saison);
    const ventilation = dossier.categories.length
      ? dossier.categories.map((cat) =>
          `<div class="ligneInfo compact" title="${echapperHTML(cat.description)}">` +
          `<span>${echapperHTML(cat.libelle)}</span>` +
          `<b class="${cat.montant < 0 ? 'alerte' : ''}">${cat.montant > 0 ? '+' : ''}${cat.montant} k€</b></div>`).join('') +
        `<div class="ligneInfo compact" style="border-top:1px solid var(--bordure);margin-top:6px;padding-top:6px;">` +
        `<span><b>Solde de la saison</b></span>` +
        `<b class="${dossier.solde < 0 ? 'alerte' : ''}">${dossier.solde > 0 ? '+' : ''}${dossier.solde} k€</b></div>`
      : '<p>Aucun mouvement enregistré cette saison.</p>';
    const lignes = dossier.lignes.length
      ? dossier.lignes.map((l) =>
          `<div class="ligneMouvement"><span>${echapperHTML(RMClub.CATEGORIES_COMPTE[l.categorie].libelle)}` +
          `<span class="detailMouvement"> — ${echapperHTML(l.libelle)}</span></span>` +
          `<span class="soldeMouvement">${l.montant > 0 ? '+' : ''}${l.montant} k€ → ${l.budgetApres} k€</span></div>`).join('')
      : '<p>Aucun mouvement enregistré pour le moment.</p>';
    // Comparaison d'un exercice à l'autre — uniquement des saisons réellement
    // archivées, jamais une projection présentée comme un historique.
    const exercices = (dossier.historique || []).slice().reverse();
    const blocExercices = exercices.length
      ? `<h4 class="sousTitreMedical">Exercices précédents</h4>` +
        exercices.map((e) => {
          const solde = RMClub.CLES_CATEGORIE_COMPTE.reduce((t, cle) => t + (e[cle] || 0), 0);
          return `<div class="ligneInfo compact"><span>Saison ${e.saisonNumero}</span>` +
            `<b class="${solde < 0 ? 'alerte' : ''}">solde ${solde > 0 ? '+' : ''}${solde} k€ · clôture ${e.budgetFin} k€</b></div>`;
        }).join('')
      : '';
    document.getElementById('clubHistoriqueFinances').innerHTML =
      `<h4 class="sousTitreMedical">Où va l'argent (saison ${dossier.saisonNumero || 1})</h4>` +
      ventilation + blocExercices +
      `<h4 class="sousTitreMedical">Dernières opérations</h4>` + lignes;
  }

  // --- Médical : vue filtrée de l'effectif (façon Medical Centre FM), plus
  // la charge de fatigue de l'effectif (réellement répercutée en match). ---
  // Infirmerie + reprise (TODO_AUDIT.md P1-40). Tout vient du dossier
  // médical réel (club-medical.js) : rien n'est recalculé ici, et la
  // fourchette affichée est le DIAGNOSTIC du staff, pas la durée cachée.
  // Les jeunes du centre de formation figurent au même endroit : un blessé
  // est un blessé, quelle que soit l'équipe où il joue.
  function groupesMedicaux() {
    return [
      { cle: 'pro', libelle: 'Effectif professionnel', joueurs: saison.clubJoueur.effectif || [] },
      { cle: 'jeunes', libelle: 'Centre de formation', joueurs: saison.clubJoueur.jeunes || [] },
    ];
  }

  function ligneBlesse(j) {
    const d = RMClub.descriptionBlessure(j);
    if (!d) return '';
    const retourMin = RMClub.formaterDateCourte(RMClub.ajouterJours(RMClub.dateCourante(saison), d.joursMin));
    const retourMax = RMClub.formaterDateCourte(RMClub.ajouterJours(RMClub.dateCourante(saison), d.joursMax));
    const fourchette = d.joursMin === d.joursMax
      ? `${d.joursMin} jour(s) — ${retourMin}`
      : `entre ${d.joursMin} et ${d.joursMax} jour(s) — ${retourMin} à ${retourMax}`;
    const rechute = Math.round(d.risqueRechute * 100);
    return `<div class="ligneMedicale blessure gravite-${d.gravite}">` +
      `<div class="medicalTitre"><b>${echapperHTML(j.nom)}</b> — ${POSTE_COMPLET[j.poste] || j.poste}` +
      `<span class="badgeGravite g${d.gravite}">${echapperHTML(d.graviteLibelle)}</span></div>` +
      `<div class="medicalDiag">${echapperHTML(d.libelle)} · ${echapperHTML(d.zone)} · ${echapperHTML(d.causeLibelle)}</div>` +
      `<div class="medicalRetour">Retour estimé ${echapperHTML(fourchette)}</div>` +
      `<div class="medicalRechute">Risque de rechute : ${rechute} %` +
      (d.reprisePrecipitee ? ' <b>(retour précipité)</b>' : '') + `</div>` +
      `<button class="alt btnAccelerer" data-joueur="${echapperHTML(j.id)}">⏩ Accélérer le retour</button>` +
      `</div>`;
  }

  // Tous les joueurs suivis médicalement, groupe par groupe.
  function tousJoueursMedicaux() {
    const liste = [];
    for (const g of groupesMedicaux()) for (const j of g.joueurs) liste.push({ joueur: j, groupe: g.libelle });
    return liste;
  }

  // Une ligne « risque » : le chiffre RÉEL issu de risqueBlessure(), avec ce
  // qui le fait monter — poste, âge, fatigue, antécédents. Le manager doit
  // comprendre POURQUOI ce joueur est exposé, pas seulement le voir en rouge.
  function ligneRisque(entree) {
    const j = entree.joueur;
    const risque = RMClub.risqueBlessure(j, { intensite: 1, saison });
    const pct = Math.round(risque * 1000) / 10;
    const causes = [];
    if ((j.fatigue || 0) >= 60) causes.push(`fatigue ${Math.round(j.fatigue)} %`);
    if ((j.age || 0) >= 31) causes.push(`${j.age} ans`);
    const ant = (j.historiqueBlessures || []).length;
    if (ant) causes.push(`${ant} antécédent(s)`);
    const niveau = pct >= 6 ? 'urgent' : pct >= 3.5 ? 'recommande' : 'info';
    return `<div class="ligneAlerte niveau-${niveau}"><span class="texteAlerte"><b>${echapperHTML(j.nom)}</b> ` +
      `<span style="color:var(--text-dim);">${echapperHTML(j.poste)}${causes.length ? ' · ' + causes.join(' · ') : ''}</span></span>` +
      `<span class="badgeNiveau niveau-${niveau}">${pct} %</span></div>`;
  }

  function ligneAntecedent(entree) {
    const j = entree.joueur;
    const h = j.historiqueBlessures || [];
    if (!h.length) return '';
    const detail = h.slice(0, 4).map((b) =>
      `${echapperHTML(b.type || 'blessure')}${b.zone ? ' (' + echapperHTML(b.zone) + ')' : ''}`).join(', ');
    return `<div class="ligneJeune"><span class="infosJeune"><b>${echapperHTML(j.nom)}</b>` +
      `<span>${detail}${h.length > 4 ? ` …et ${h.length - 4} autre(s)` : ''}</span></span>` +
      `<span style="flex:0 0 auto;">${h.length}</span></div>`;
  }

  function rafraichirMedical() {
    const zone = document.getElementById('clubMedical');
    if (!zone) return;
    rafraichirSousOnglets('medical');
    const sous = sousOngletCourant('medical');
    const carte = document.getElementById('carteMedicalOnglet');
    const zoneOnglet = document.getElementById('clubMedicalOnglet');
    const titre = document.getElementById('titreMedicalOnglet');
    // L'infirmerie historique reste l'onglet « Blessures en cours » : on ne
    // crée pas un second écran médical, on range celui qui existe.
    const carteInfirmerie = zone.closest('.carteClub');
    const montrerInfirmerie = sous === 'blessures' || sous === 'apercu';
    if (carteInfirmerie) carteInfirmerie.style.display = montrerInfirmerie ? '' : 'none';

    let html = '';
    for (const g of groupesMedicaux()) {
      const blesses = g.joueurs.filter((j) => RMClub.joursIndisponible(j) > 0);
      if (!blesses.length) continue;
      html += `<h4 class="sousTitreMedical">${g.libelle} (${blesses.length})</h4>` +
        blesses.map(ligneBlesse).join('');
    }
    zone.innerHTML = html || '<p>Aucun joueur blessé actuellement — effectif au complet.</p>';
    rafraichirReprise(sous === 'blessures' || sous === 'apercu');

    if (!carte || !zoneOnglet || !titre) return;
    const tous = tousJoueursMedicaux();
    if (sous === 'apercu') {
      const blesses = tous.filter((e) => RMClub.joursIndisponible(e.joueur) > 0).length;
      const enReprise = tous.filter((e) => e.joueur.reprise).length;
      const fatigues = tous.filter((e) => (e.joueur.fatigue || 0) >= 60).length;
      const risqueMoyen = tous.length
        ? tous.reduce((t, e) => t + RMClub.risqueBlessure(e.joueur, { intensite: 1, saison }), 0) / tous.length : 0;
      titre.textContent = '🩺 État de santé du groupe';
      zoneOnglet.innerHTML =
        `${ligneInfo(`Joueurs suivis`, `${tous.length}`)}` +
        `${ligneInfo(`Indisponibles`, `${blesses}`, { etat: `${blesses ? 'deltaNegatif' : ''}` })}` +
        `${ligneInfo(`En reprise progressive`, `${enReprise}`)}` +
        `${ligneInfo(`Au-dessus de 60 % de fatigue`, `${fatigues}`, { etat: `${fatigues ? 'deltaNegatif' : ''}` })}` +
        `${ligneInfo(`Risque moyen par séance`, `${Math.round(risqueMoyen * 1000) / 10} %`)}`;
    } else if (sous === 'risques') {
      const tries = tous.slice().sort((a, b) =>
        RMClub.risqueBlessure(b.joueur, { intensite: 1, saison }) - RMClub.risqueBlessure(a.joueur, { intensite: 1, saison }));
      titre.textContent = '⚠️ Joueurs les plus exposés';
      zoneOnglet.innerHTML = tries.slice(0, 12).map(ligneRisque).join('')
        || '<p style="color:var(--text-dim);">Aucun joueur suivi.</p>';
    } else if (sous === 'historique') {
      const avecHistorique = tous.filter((e) => (e.joueur.historiqueBlessures || []).length);
      titre.textContent = '📚 Antécédents';
      zoneOnglet.innerHTML = avecHistorique.length
        ? avecHistorique.sort((a, b) => (b.joueur.historiqueBlessures || []).length - (a.joueur.historiqueBlessures || []).length)
          .map(ligneAntecedent).join('')
        : '<p style="color:var(--text-dim);">Aucun antécédent enregistré : personne ne s\'est encore blessé.</p>';
    } else if (sous === 'bilan') {
      // Bilan RÉEL : on compte les antécédents datés de la saison en cours.
      const saisonNum = saison.numero || 1;
      let nb = 0, jours = 0;
      const parType = {};
      for (const e of tous) {
        for (const b of (e.joueur.historiqueBlessures || [])) {
          if (b.saison != null && b.saison !== saisonNum) continue;
          nb++; jours += b.jours || 0;
          parType[b.type || 'autre'] = (parType[b.type || 'autre'] || 0) + 1;
        }
      }
      titre.textContent = '📉 Bilan de la saison';
      const types = Object.keys(parType).sort((a, b) => parType[b] - parType[a])
        .map((t) => `${ligneInfo(`${echapperHTML(t)}`, `${parType[t]}`)}`).join('');
      zoneOnglet.innerHTML = nb
        ? `${ligneInfo(`Blessures cette saison`, `${nb}`)}` +
          `${ligneInfo(`Jours d'indisponibilité cumulés`, `${jours}`)}` + types
        : '<p style="color:var(--text-dim);">Aucune blessure enregistrée cette saison.</p>';
    }
    carte.style.display = sous === 'blessures' ? 'none' : '';
  }

  // Les joueurs SORTIS de l'infirmerie mais pas encore à 100 % : c'est la
  // partie que le jeu ignorait totalement avant P1-40 (retour instantané et
  // à pleine puissance). Le malus affiché est celui réellement transmis au
  // moteur (cf. compositionVersJoueursCfg).
  // `visible` : la reprise appartient à l'onglet « Blessures en cours » (et à
  // la vue d'ensemble). Sur les autres onglets médicaux, on la range plutôt
  // que de la répéter partout.
  function rafraichirReprise(visible) {
    const carte = document.getElementById('carteReprise');
    const zone = document.getElementById('clubReprise');
    if (!carte || !zone) return;
    if (visible === false) { carte.style.display = 'none'; return; }
    const lignes = [];
    for (const g of groupesMedicaux()) {
      for (const j of g.joueurs) {
        const etape = RMClub.etapeReprise(j);
        if (!etape || etape === 'soins') continue;
        const coef = RMClub.coefficientReprise(j);
        const malus = Math.round((1 - coef) * 100);
        const dispo = RMClub.peutJouer(j, 'pro')
          ? 'Sélectionnable partout'
          : (RMClub.peutJouer(j, 'b') ? 'Équipe B ou Espoirs seulement' : 'Pas encore sélectionnable');
        lignes.push(`<div class="ligneMedicale reprise">` +
          `<div class="medicalTitre"><b>${echapperHTML(j.nom)}</b> — ${POSTE_COMPLET[j.poste] || j.poste}` +
          `<span class="badgeEtape">${echapperHTML(RMClub.LIBELLE_ETAPE[etape] || etape)}</span></div>` +
          `<div class="medicalDiag">${echapperHTML(dispo)} · ${j.reprise.joursRestants} jour(s) à ce palier</div>` +
          `<div class="medicalRechute">Rendement : ${Math.round(coef * 100)} % de son niveau` +
          (malus > 0 ? ` <b>(−${malus} % transmis au moteur)</b>` : '') + `</div></div>`);
      }
    }
    if (!lignes.length) { carte.style.display = 'none'; return; }
    carte.style.display = '';
    zone.innerHTML = lignes.join('');
  }

  function rafraichirFatigueTab() {
    const fatigues = saison.clubJoueur.effectif.filter((j) => (j.fatigue || 0) > 0).sort((a, b) => (b.fatigue || 0) - (a.fatigue || 0));
    document.getElementById('clubFatigue').innerHTML = fatigues.length
      ? fatigues.map((j) => `<div class="ligneMedicale"><span><b>${j.nom}</b> — ${POSTE_COMPLET[j.poste] || j.poste}</span>` +
        `<span class="barreFatigue${(j.fatigue || 0) >= 65 ? ' haute' : ''}"><span style="width:${j.fatigue}%"></span></span></div>`).join('')
      : '<p>Aucune fatigue notable dans l\'effectif actuellement.</p>';
  }

  // --- Carrière du manager (TODO_AUDIT.md P1-42) --------------------------
  // Tout vient de `saison.manager`, la source unique — jamais du club.
  const LIBELLE_SECURITE = {
    satisfaite: '🟢', sousPression: '🟡', avertissement: '🟠',
    licenciement: '🔴', sansClub: '⚪',
  };

  function rafraichirCarriereManager() {
    const zone = document.getElementById('clubCarriereManager');
    if (!zone) return;
    // Les deux autres divisions françaises sont créées à la demande (cf.
    // onglet Compétitions). Le marché des entraîneurs les lit désormais
    // (G14) : sans cet appel, ouvrir l'écran Carrière AVANT d'avoir ouvert
    // une compétition ne montrait que des offres de sa propre division,
    // silencieusement. Graine déterministe, la même que l'autre point de
    // création — deux carrières identiques ont le même monde.
    if (RMClub.assurerAutresDivisionsFrance) {
      RMClub.assurerAutresDivisionsFrance(creerRng(graineDuJour('paliersCreation')), saison);
    }
    const m = RMClub.assurerManager(saison);
    const s = RMClub.securiteEmploi(saison);
    const engagement = RMClub.engagementProchaineSaison
      ? RMClub.engagementProchaineSaison(saison) : null;
    const clubActuel = m.statut === 'enPoste' ? saison.clubJoueur.nom : 'Sans club';
    const bilanTotal = m.saisons.reduce((acc, x) => {
      acc.n++; if (x.objectifAtteint === true) acc.reussies++;
      return acc;
    }, { n: 0, reussies: 0 });

    const historique = m.historiqueClubs.map((h) => {
      const periode = h.jusquaSaison ? `saisons ${h.depuisSaison}–${h.jusquaSaison}` : `depuis la saison ${h.depuisSaison}`;
      return `${ligneInfo(`${echapperHTML(h.clubNom || h.clubId)}`, `${echapperHTML(periode)}`)}`;
    }).join('');

    const parSaison = m.saisons.slice(-8).reverse().map((x) => {
      const verdict = x.objectifAtteint === true ? '✅' : x.objectifAtteint === false ? '❌' : '—';
      const mvt = x.mouvement === 'promotion' ? ' ⬆️' : x.mouvement === 'relegation' ? ' ⬇️' : '';
      return `<div class="ligneInfo"><span>S${x.numeroSaison} · ${echapperHTML(x.clubNom || '?')}</span>` +
        `<b>${x.position}e/${x.totalClubs} ${verdict}${mvt}</b></div>`;
    }).join('');

    zone.innerHTML =
      `${ligneInfo(`Manager`, `${echapperHTML(m.nom)}`)}` +
      `${ligneInfo(`Club actuel`, `${echapperHTML(clubActuel)}`)}` +
      // Engagement déjà signé ailleurs (G14) : le manager doit s'en souvenir
      // pendant toute la fin de saison, pas seulement au moment de signer.
      (engagement
        ? `<div class="ligneInfo"><span>Saison prochaine</span>` +
          `<b>${echapperHTML(engagement.clubNom)} · ${echapperHTML(engagement.division)}</b></div>`
        : '') +
      `${ligneInfo(`Réputation`, `${m.reputation} / 100`)}` +
      `<div class="ligneInfo"><span>Sécurité de l'emploi</span>` +
      `<b>${LIBELLE_SECURITE[s.niveau] || ''} ${echapperHTML(s.libelle)}</b></div>` +
      `<p class="noteLectureSeule" style="margin:4px 0 10px;">${echapperHTML(s.explication)}</p>` +
      `${ligneInfo(`Saisons dirigées`, `${m.saisonsDirigees}`)}` +
      `${ligneInfo(`Objectifs atteints`, `${bilanTotal.reussies} / ${bilanTotal.n}`)}` +
      `${ligneInfo(`Promotions · Relégations`, `${m.promotions} · ${m.relegations}`)}` +
      (historique ? `<h4 class="titreBlocFiche">Clubs dirigés</h4>${historique}` : '') +
      (parSaison ? `<h4 class="titreBlocFiche">Saison par saison</h4>${parSaison}` : '');
    rafraichirOffresManager();
  }

  // Les offres : présentées comme des DÉCISIONS, avec ce qu'il faut pour
  // trancher. Empilées verticalement — pas de tableau horizontal, pour rester
  // lisible sur un téléphone.
  function rafraichirOffresManager() {
    const carte = document.getElementById('carteOffresManager');
    const zone = document.getElementById('clubOffresManager');
    if (!carte || !zone) return;
    const offres = RMClub.offresDisponibles(saison);
    // On VIDE aussi la zone : masquer la carte sans effacer son contenu
    // laissait les anciennes offres dans le DOM. Invisibles pour l'œil, mais
    // toujours là — donc toujours cliquables au clavier et trompeuses pour
    // tout ce qui lit la page. Constaté en pilotant le navigateur après une
    // signature : la carte était bien masquée, les six offres toujours
    // présentes dans le document.
    if (!offres.length) { carte.style.display = 'none'; zone.innerHTML = ''; return; }
    carte.style.display = '';
    const m = RMClub.assurerManager(saison);
    const entete = m.statut === 'sansClub'
      ? '<p class="noteLectureSeule" style="margin:0 0 10px;">Tu es libre : ces clubs sont prêts à te confier leur équipe.</p>'
      : '<p class="noteLectureSeule" style="margin:0 0 10px;">Ces clubs s\'intéressent à toi. Un club de ta division te prend '
        + 'tout de suite ; un club d\'une autre division t\'engage pour la saison prochaine — tu termines celle-ci là où tu es.</p>';
    zone.innerHTML = entete + offres.map((o) =>
      `<div class="offreManager">` +
      `<div class="offreTitre"><b>${echapperHTML(o.clubNom)}</b>` +
      `<span class="badgeNiveau niveau-info">${echapperHTML(o.division)}</span></div>` +
      `<div class="offreLigne">Classement actuel : ${o.position != null ? o.position + 'e/' + o.totalClubs : 'non connu'}</div>` +
      `<div class="offreLigne">Objectif proposé : ${echapperHTML(o.objectif)}</div>` +
      `<div class="offreLigne">Prise de poste : <b>${o.immediat ? 'immédiate' : 'la saison prochaine'}</b></div>` +
      `<div class="offreLigne">Budget : ${o.budget != null ? o.budget + ' k€' : 'non communiqué'} · Confiance initiale : ${o.confianceInitiale} %</div>` +
      // POURQUOI ce poste est libre (G24). Sans cette ligne, l'offre reste un
      // coup de chance : c'est elle qui la rattache à un limogeage réel.
      (o.raisonPosteLibre
        ? `<div class="offreLigne" style="opacity:.85">Poste libre : ${echapperHTML(o.raisonPosteLibre)}</div>`
        : '') +
      `<div class="offreRaison">${echapperHTML(o.raison)}</div>` +
      `<div class="actionsOffre">` +
      `<button class="accent" data-accepter="${echapperHTML(o.id)}">${o.immediat ? 'Accepter ce poste' : 'Signer pour la saison prochaine'}</button>` +
      `<button class="alt" data-refuser="${echapperHTML(o.id)}">Refuser</button>` +
      `</div></div>`).join('');
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
    // Disponibilité tirée du dossier médical réel (TODO_AUDIT.md P1-40) :
    // le diagnostic et l'étape de reprise, pas un compteur nu.
    const dMed = RMClub.descriptionBlessure(j);
    const etapeMed = RMClub.etapeReprise(j);
    const disponibilite = j.pret ? `En prêt — retour dans ${j.pret.dureeRestante} jour(s)`
      : dMed ? `Blessé — ${dMed.libelle} (${dMed.zone}), retour estimé ` +
        (dMed.joursMin === dMed.joursMax ? `dans ${dMed.joursMin} jour(s)` : `entre ${dMed.joursMin} et ${dMed.joursMax} jour(s)`)
      : (etapeMed && etapeMed !== 'complet')
        ? `En reprise — ${RMClub.LIBELLE_ETAPE[etapeMed]} (${Math.round(RMClub.coefficientReprise(j) * 100)} % de son niveau)`
        : etapeMed === 'complet' ? `Retour complet — ${Math.round(RMClub.coefficientReprise(j) * 100)} % de son niveau`
        : 'Disponible';
    // Antécédents (TODO_AUDIT.md P1-40) : ils ne sont PAS décoratifs — ils
    // pèsent réellement sur le risque de blessure futur (cf.
    // facteurAntecedents), le manager doit donc pouvoir les consulter avant
    // d'aligner un joueur fragile.
    const antecedents = j.historiqueBlessures || [];
    const blocAntecedents = antecedents.length
      ? `<h4 class="titreBlocFiche">Antécédents médicaux (${antecedents.length})</h4>` +
        `<p class="noteLectureSeule" style="margin:0 0 6px;">Un passé chargé augmente réellement le risque de nouvelle blessure.</p>` +
        antecedents.slice(0, 6).map((b) =>
          `<div class="ligneInfo"><span>${echapperHTML(b.libelle || 'Blessure')} · ${echapperHTML(b.zone || '?')}</span>` +
          `<b>${echapperHTML(RMClub.LIBELLE_GRAVITE[b.gravite] || '')} · ${b.joursReels || '?'} j` +
          (b.reprisePrecipitee ? ' · retour précipité' : '') + `</b></div>`).join('')
      : '';
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
      j[champ] != null ? `${ligneInfo(`${label}`, `${j[champ]}`)}` : ''
    ).join('');
    const lignePotentiel = j.potentiel != null
      ? `${ligneInfo(`Potentiel`, `${Math.round(j.potentiel)} <span class="jaugePotentiel"><span style="width:${Math.round((j.vitesse + j.plaquage) / 2)}%"></span></span>`)}` : '';
    // Progression RÉELLE depuis le début de la saison (cf. RMClub.calculerProgression) —
    // vide si rien n'a bougé ou si aucun instantané n'existe (ancienne sauvegarde).
    const ATTR_LABEL_COURT = { vitesse: 'Vitesse', plaquage: 'Plaquage', melee: 'Mêlée', touche: 'Touche', puissance: 'Puissance', endurance: 'Endurance', passe: 'Passe', jeuPied: 'Jeu au pied', decision: 'Décision' };
    const progression = RMClub.calculerProgression(j);
    const ligneProgression = progression.length
      ? `${ligneInfo(`Progression cette saison`, ``)}` +
        progression.map((p) => `<div class="ligneProgression"><span>${ATTR_LABEL_COURT[p.attr] || p.attr}</span><span class="${p.delta > 0 ? 'deltaPositif' : 'deltaNegatif'}">${p.delta > 0 ? '+' : ''}${p.delta} (${p.avant}→${p.apres})</span></div>`).join('')
      : '';
    const ligneStatsSaison = s
      ? `${ligneInfo(`Cette saison`, `${s.essais} essai(s) · ${s.passes} passe(s) · ${s.tacklesMade}/${s.tacklesAttempted} plaquages`)}`
      : '';

    // --- Statistiques PAR COMPÉTITION, historique et carrière (P1-30) ------
    // Trois blocs entièrement dérivés de données RÉELLES : une compétition
    // n'apparaît que si le joueur y a joué, une saison n'est listée que si
    // elle a été archivée, et la carrière est la somme des deux. Rien n'est
    // affiché quand il n'y a rien à dire — pas de tableau vide décoratif.
    const parCompetition = (s && s.parCompetition) || {};
    const clesCompetition = Object.keys(parCompetition).filter((k) => parCompetition[k].matchsJoues > 0);
    const blocCompetitions = clesCompetition.length
      ? `<h4 class="titreBlocFiche">📊 Par compétition (cette saison)</h4>` +
        `<table class="tableauClub tableauFiche"><thead><tr><th>Compétition</th><th>M</th><th>Essais</th><th>Passes</th><th>Plaq.</th><th>Mètres</th></tr></thead><tbody>` +
        clesCompetition.map((k) => {
          const d = parCompetition[k];
          return `<tr><td>${echapperHTML(RMClub.LIBELLE_COMPETITION[k] || k)}</td><td>${d.matchsJoues}</td>` +
            `<td>${d.essais}</td><td>${d.passes}</td><td>${d.tacklesMade}/${d.tacklesAttempted}</td><td>${Math.round(d.metresGagnes)}</td></tr>`;
        }).join('') + `</tbody></table>`
      : '';

    const historique = (j.historiqueSaisons || []).slice().reverse();
    const blocHistorique = historique.length
      ? `<h4 class="titreBlocFiche">🕓 Historique des saisons</h4>` +
        `<table class="tableauClub tableauFiche"><thead><tr><th>Saison</th><th>Club</th><th>Âge</th><th>M</th><th>Essais</th><th>Plaq.</th></tr></thead><tbody>` +
        historique.map((h) => `<tr><td>${h.saisonNumero}</td><td>${echapperHTML(h.club || '—')}</td><td>${h.age != null ? h.age : '—'}</td>` +
          `<td>${h.matchsJoues}</td><td>${h.essais}</td><td>${h.tacklesMade}/${h.tacklesAttempted}</td></tr>`).join('') +
        `</tbody></table>`
      : '';

    const carriere = RMClub.carriereJoueur(j);
    const blocCarriere = carriere.saisons > 0
      ? `<h4 class="titreBlocFiche">🏆 Carrière</h4>` +
        `${ligneInfo(`Saisons jouées`, `${carriere.saisons}`)}` +
        `${ligneInfo(`Matchs`, `${carriere.matchsJoues}`)}` +
        `${ligneInfo(`Essais`, `${carriere.essais}`)}` +
        `${ligneInfo(`Passes`, `${carriere.passes}`)}` +
        `${ligneInfo(`Plaquages réussis`, `${carriere.tacklesMade}/${carriere.tacklesAttempted}`)}` +
        `${ligneInfo(`Mètres gagnés`, `${Math.round(carriere.metresGagnes)}`)}`
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
      const negociation = RMClub.negociationEnCours(saison, id);
      // Ce que le joueur pense de sa situation, et ce qu'il demanderait —
      // deux chiffres RÉELS (cf. club-negociations.js), pour que le manager
      // ne négocie pas à l'aveugle.
      const satisfaction = RMClub.satisfactionContrat ? RMClub.satisfactionContrat(saison, j) : null;
      const volonte = RMClub.volonteProlonger ? RMClub.volonteProlonger(saison, j) : null;
      const exigence = RMClub.exigenceSalariale ? RMClub.exigenceSalariale(saison, j, { duree: offre.dureeMax }) : null;
      const interet = RMClub.interetExterieur ? RMClub.interetExterieur(saison, j) : 0;
      if (satisfaction != null) {
        actions += `<div class="ligneInfo" style="margin-top:10px;"><span>Fin de contrat</span>` +
          `<b>saison ${RMClub.saisonFinContrat(saison, j)} (${j.contrat} an(s))</b></div>` +
          `${ligneInfo(`Satisfaction contractuelle`, `${satisfaction}/100`)}` +
          `${ligneInfo(`Avenir`, `${RMClub.VOLONTES[volonte].icone} ${echapperHTML(RMClub.VOLONTES[volonte].libelle)}`)}` +
          `${ligneInfo(`Prétentions estimées`, `${exigence} k€/saison`)}` +
          (interet ? `${ligneInfo(`Clubs intéressés`, `${interet}`, { etat: `deltaNegatif` })}` : '');
      }
      if (j.negociationRompue) {
        actions += `<p class="noteLectureSeule" style="margin-top:8px;">⛔ Son agent a mis fin aux discussions : plus aucune proposition possible cette saison.</p>`;
      } else if (negociation) {
        actions += `<p class="noteLectureSeule" style="margin-top:8px;">📄 Proposition de ${negociation.salaire} k€/saison transmise — réponse attendue le ${echapperHTML(RMClub.formaterDateCourte(RMClub.dateDepuisISO(negociation.dateReponse)))}.</p>`;
      } else {
        actions += `<button class="accent" id="btnRenouveler" style="width:100%;margin-top:8px;">Renouveler ${offre.dureeMax} an(s) · ${offre.salaire} k€/saison</button>` +
          `<button class="alt" id="btnNegocierContrat" style="width:100%;margin-top:8px;">💬 Négocier (salaire, durée, prime)</button>`;
      }
      // Ne pas renouveler / rompre : les deux façons de se séparer d'un joueur,
      // avec leur coût annoncé AVANT le clic.
      actions += j.nonRenouvele
        ? `<button class="alt" id="btnNonRenouvellement" style="width:100%;margin-top:8px;">Revenir sur le non-renouvellement</button>`
        : `<button class="alt" id="btnNonRenouvellement" style="width:100%;margin-top:8px;">🚪 Ne pas renouveler</button>`;
      if (RMClub.indemniteRupture) {
        actions += `<button class="alt" id="btnRompreContrat" style="width:100%;margin-top:8px;">✂️ Rompre le contrat (${RMClub.indemniteRupture(j)} k€)</button>`;
      }
      actions += j.pret
        ? `<button class="alt" id="btnRappelerJoueur" style="width:100%;margin-top:8px;">Rappeler de prêt</button>`
        : `<button class="alt" id="btnPreterJoueur" style="width:100%;margin-top:8px;">Prêter ce joueur (3 semaines)</button>`;
      // Liste des transferts (P1-48) : vendre est enfin une option, à côté du
      // départ libre qui, lui, ne rapporte toujours rien.
      const motifVente = RMClub.motifIncessible(saison, j);
      if (motifVente) {
        actions += `<p class="noteLectureSeule" style="margin-top:8px;">` +
          (motifVente === 'pret' ? 'Joueur prêté : impossible à vendre tant qu\'il est ailleurs.'
            : 'Dernier joueur de son poste : le vendre laisserait le club à découvert.') + `</p>`;
      } else {
        const valeur = RMClub.valeurMarchande(saison, j);
        actions += j.surListeTransfert
          ? `<button class="alt" id="btnListeTransfertFiche" style="width:100%;margin-top:8px;">Retirer de la liste des transferts</button>` +
            `<p class="noteLectureSeule" style="margin:4px 0 0;">En vente · valeur estimée ${valeur} k€ (rabais de vendeur inclus).</p>`
          : `<button class="alt" id="btnListeTransfertFiche" style="width:100%;margin-top:8px;">📤 Mettre sur la liste des transferts</button>` +
            `<p class="noteLectureSeule" style="margin:4px 0 0;">Valeur estimée ${valeur} k€. Le mettre en vente attire les offres mais fait baisser son prix.</p>`;
      }
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
    // Statut promis (club-statuts.js) : le seul endroit du jeu où le manager
    // s'ENGAGE devant un joueur. Le bilan affiché juste en dessous vient des
    // feuilles de match réelles, jamais d'une estimation.
    const bilanStatut = (RMClub.bilanPromesse && estEffectifPro) ? RMClub.bilanPromesse(j) : null;
    const optionsStatut = RMClub.CLES_STATUT.map((cle) =>
      `<option value="${cle}"${j.statutPromis === cle ? ' selected' : ''}>` +
      `${echapperHTML(RMClub.STATUTS[cle].libelle)}</option>`).join('');
    const detailStatut = (bilanStatut && bilanStatut.statut)
      ? (bilanStatut.part == null
        ? `<p class="noteLectureSeule" style="margin:4px 0 0;">${echapperHTML(RMClub.STATUTS[bilanStatut.statut].description)} Aucun match joué depuis cette promesse.</p>`
        : `<p class="noteLectureSeule" style="margin:4px 0 0;">${echapperHTML(RMClub.STATUTS[bilanStatut.statut].description)} ` +
          `Depuis cette promesse : ${bilanStatut.titulaire} titularisation(s) et ${bilanStatut.banc} entrée(s) en jeu sur ${bilanStatut.matchs} match(s) où il était disponible ` +
          `— soit ${Math.round(bilanStatut.part * 100)} % du temps de jeu attendu ${Math.round(bilanStatut.attendu * 100)} %. ` +
          (bilanStatut.jugeable
            ? (bilanStatut.tenue ? '<b class="deltaPositif">Promesse tenue.</b>' : '<b class="deltaNegatif">Promesse rompue.</b>')
            : 'Trop tôt pour juger.') + `</p>`)
      : '';
    const blocStatutPromis = (ctx.modifiable && estEffectifPro)
      ? `<label class="sr-label" for="selStatutPromis" style="margin-top:10px;">Statut promis</label>` +
        `<select id="selStatutPromis" style="width:100%;"><option value=""${!j.statutPromis ? ' selected' : ''}>Ne rien promettre</option>${optionsStatut}</select>` +
        detailStatut
      : '';
    document.getElementById('clubJoueurDetail').innerHTML =
      `<div class="ficheJoueurEntete"><span><span class="nomJoueurFiche">${echapperHTML(j.nom)}${badgesRole(id, slot)}</span><span class="posteJoueurFiche">${POSTE_COMPLET[j.poste] || j.poste} · ${j.age} ans · ${lienClub(ctx.clubId)} <span style="color:var(--text-faint);">(${echapperHTML(ctx.label)})</span></span></span></div>` +
      (ctx.modifiable ? '' : `<p class="noteLectureSeule">🔍 Joueur d'un club que tu ne diriges pas : consultation seule. Les valeurs de contrat et de salaire sont des estimations de tes recruteurs.</p>`) +
      lignesAttributs + lignePotentiel +
      `${ligneInfo(`Moral`, `<span class="barreMoral${moral < 45 ? ' bas' : moral >= 80 ? ' haut' : ''}"><span style="width:${moral}%"></span></span> ${moral}%`)}` +
      `${ligneInfo(`Fatigue`, `<span class="barreFatigue${fatigue >= 65 ? ' haute' : ''}"><span style="width:${fatigue}%"></span></span> ${fatigue}%`)}` +
      ligneProgression +
      `${ligneInfo(`Matchs joués cette saison`, `${j.matchsJoues || 0}`)}` +
      ligneStatsSaison +
      `${ligneInfo(`Sélection du jour`, `${statutCompo}`)}` +
      (j.veutPartir ? `${ligneInfo(`Statut`, `🚩 Souhaite être transféré (mécontent de son temps de jeu)`, { etat: `texteAlerteJoueur` })}` : '') +
      (j.contrat != null ? `${ligneInfo(`Contrat`, `${j.contrat} an(s) restant(s)`)}` : '') +
      (j.salaire != null ? `${ligneInfo(`Salaire`, `${j.salaire} k€/saison`)}` : '') +
      (j.valeurEstimee != null && !ctx.modifiable ? `${ligneInfo(`Valeur de transfert estimée`, `${j.valeurEstimee} k€`)}` : '') +
      `${ligneInfo(`Disponibilité`, `${disponibilite}`)}` +
      blocAntecedents + blocCompetitions + blocHistorique + blocCarriere +
      blocStatutPromis + blocEntrainementIndividuel + actions +
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
    // Même principe pour la navigation par pays/championnat (TODO_AUDIT.md
    // P1-33) : un SEUL composant, partagé par les écrans Classement et
    // Calendrier — qui sont désormais deux pages distinctes, mais parlent de
    // la même compétition choisie.
    const navCompetition = document.getElementById('navigationCompetition');
    if (navCompetition) {
      const volet = document.querySelector(`#clubGestion .voletOnglet[data-volet="${cle}"]`);
      const emplacementNav = volet ? volet.querySelector('.emplacementNavigationCompetition') : null;
      (emplacementNav || document.getElementById('porteSelecteurEquipe')).appendChild(navCompetition);
      // L'écran Compétitions n'affiche plus cette navigation, mais il a
      // TOUJOURS besoin du travail qu'elle déclenche : création du monde, des
      // autres paliers et des coupes au besoin, puis rendu de la compétition
      // choisie. Sans cet appel, ouvrir Compétitions laissait un écran figé
      // sur l'état précédent.
      if (emplacementNav || cle === 'classement') rafraichirAutresClubs();
    }
    // La préparation du prochain match et l'agenda dépendent d'écrans qu'on
    // vient peut-être de quitter (composition, tactique) : on les recalcule
    // en revenant sur la vue d'ensemble, sinon ils afficheraient un état
    // périmé (TODO_AUDIT.md P1-24).
    if (cle === 'dashboard') { rafraichirPreparationMatch(); rafraichirAgenda(); }
    // « Préparer le match » se recalcule à chaque ouverture : c'est ce qui
    // garantit qu'un réglage fait dans Composition ou Tactique est visible
    // en revenant, sans qu'aucun état ne soit conservé de son côté.
    if (cle === 'preparer') rafraichirPreparerMatch();
    if (cle === 'stats') rafraichirCarriereManager();
    if (cle === 'developpement') rafraichirDeveloppement();
    if (cle === 'stats') rafraichirStatistiques();
    if (cle === 'club') rafraichirInfrastructures();
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
  // --- Sous-onglets : la PROFONDEUR de navigation --------------------------
  //
  // Audit mesuré : 14 menus, tous cliquables, mais ZÉRO sous-onglet dans tout
  // le jeu — le Calendrier empilait 10 595 caractères en un seul bloc.
  //
  // Ce composant est GÉNÉRIQUE : chaque menu déclare ses sous-onglets ici, la
  // barre se dessine toute seule, et l'onglet actif est mémorisé par menu.
  // Aucun sous-onglet n'est déclaré tant qu'il n'a pas de VRAIES données à
  // montrer — pas de route vide, pas de placeholder.
  const SOUS_ONGLETS = {
    stats: [
      { cle: 'apercu', label: 'Vue d\'ensemble', aide: 'Le bilan de la saison en cours.' },
      { cle: 'equipe', label: 'Équipe', aide: 'Ce que le collectif a produit, par match.' },
      { cle: 'joueurs', label: 'Joueurs', aide: 'Les meilleurs de la saison, chiffres réels.' },
      { cle: 'matchs', label: 'Matchs', aide: 'Les rencontres jouées et leur résultat.' },
      { cle: 'saisons', label: 'Saisons', aide: 'L\'évolution du club d\'une saison à l\'autre.' },
    ],
    classement: [
      { cle: 'apercu', label: 'Vue d\'ensemble', aide: 'La compétition en un coup d\'œil.' },
      { cle: 'classement', label: 'Classement', aide: 'Le classement complet.' },
      { cle: 'equipes', label: 'Équipes', aide: 'Les clubs engagés.' },
      { cle: 'stats', label: 'Statistiques', aide: 'Meilleure attaque, meilleure défense, écarts.' },
      { cle: 'regles', label: 'Règles', aide: 'Montées, descentes, format.' },
      { cle: 'historique', label: 'Historique', aide: 'Les saisons précédentes du club dans cette compétition.' },
    ],
    developpement: [
      { cle: 'apercu', label: 'Vue d\'ensemble', aide: 'Ce que le club produit et fait progresser.' },
      { cle: 'b', label: 'Équipe B', aide: 'Le vivier de la réserve.' },
      { cle: 'jeunes', label: 'Jeunes', aide: 'Le centre de formation et ses potentiels.' },
      { cle: 'prets', label: 'Joueurs prêtés', aide: 'Qui est parti, et pour combien de temps.' },
      { cle: 'progression', label: 'Progression', aide: 'Qui a réellement progressé depuis le début de saison.' },
    ],
    effectif: [
      { cle: 'apercu', label: 'Vue d\'ensemble', aide: 'La forme du groupe : âge, postes, salaires.' },
      { cle: 'joueurs', label: 'Joueurs', aide: 'La liste complète, filtrable.' },
      { cle: 'selection', label: 'Sélection', aide: 'Le XV et le banc retenus pour cette équipe.' },
      { cle: 'disponibilite', label: 'Disponibilité', aide: 'Qui peut jouer, qui ne peut pas, et pourquoi.' },
      { cle: 'dynamique', label: 'Dynamique', aide: 'Statuts promis, promesses tenues ou rompues, mécontents.' },
      { cle: 'contrats', label: 'Contrats', aide: 'Échéances, salaires, valeur, satisfaction et volonté de prolonger.' },
      { cle: 'inscriptions', label: 'Inscriptions', aide: 'Qui est inscrit à quelle compétition, et jusqu\'à quand.' },
      { cle: 'rotation', label: 'Rotation', aide: 'Profondeur par poste, surcharge, et une suggestion de repos.' },
    ],
    medical: [
      { cle: 'apercu', label: 'Vue d\'ensemble', aide: 'L\'état de santé du groupe en un coup d\'œil.' },
      { cle: 'risques', label: 'Risques', aide: 'Qui risque le plus de se blesser, et pourquoi.' },
      { cle: 'blessures', label: 'Blessures en cours', aide: 'L\'infirmerie et la reprise.' },
      { cle: 'historique', label: 'Historique', aide: 'Les antécédents de chaque joueur.' },
      { cle: 'bilan', label: 'Bilan saison', aide: 'Ce que les blessures ont coûté cette saison.' },
    ],
    calendrier: [
      { cle: 'matchs', label: 'Matchs', aide: 'Les rencontres à venir de cette équipe.' },
      { cle: 'calendrier', label: 'Calendrier', aide: 'Toute la compétition, journée par journée.' },
      { cle: 'resultats', label: 'Résultats', aide: 'Les rencontres déjà jouées.' },
      { cle: 'amicaux', label: 'Amicaux', aide: 'Les matchs amicaux programmés ou joués.' },
    ],
  };
  // Onglet actif par menu. Vit en mémoire d'écran : c'est une position de
  // navigation, pas un état de carrière — rien à sauvegarder.
  const sousOngletActif = {};

  function sousOngletCourant(menu) {
    const liste = SOUS_ONGLETS[menu];
    if (!liste || !liste.length) return null;
    if (!sousOngletActif[menu]) sousOngletActif[menu] = liste[0].cle;
    return sousOngletActif[menu];
  }

  function rafraichirSousOnglets(menu) {
    const barre = document.querySelector(`.barreSousOnglets[data-sousonglets="${menu}"]`);
    if (!barre) return;
    const liste = SOUS_ONGLETS[menu] || [];
    const actif = sousOngletCourant(menu);
    barre.innerHTML = liste.map((o) =>
      `<button class="alt btnSousOnglet${o.cle === actif ? ' actif' : ''}" data-menu="${menu}" ` +
      `data-sous="${echapperHTML(o.cle)}" title="${echapperHTML(o.aide)}">${echapperHTML(o.label)}</button>`).join('');
  }

  // Un seul écouteur pour toutes les barres de sous-onglets du jeu.
  document.getElementById('clubGestion').addEventListener('click', (e) => {
    const btn = e.target.closest('.btnSousOnglet');
    if (!btn) return;
    const menu = btn.dataset.menu;
    sousOngletActif[menu] = btn.dataset.sous;
    rafraichirSousOnglets(menu);
    if (menu === 'calendrier') rafraichirCalendrier();
    if (menu === 'medical') rafraichirMedical();
    if (menu === 'effectif') rafraichirEffectif();
    if (menu === 'developpement') rafraichirDeveloppement();
    if (menu === 'classement') rafraichirCompetitionChoisie();
    if (menu === 'stats') rafraichirStatistiques();
  });

  // Amicaux (saison.amicaux) : source distincte du championnat, donc rendu
  // distinct. On n'affiche que ce qui existe réellement — jamais un tableau
  // vide déguisé en écran.
  function rendreAmicaux(zone) {
    const amicaux = saison.amicaux || [];
    if (!amicaux.length) {
      zone.innerHTML = '<p style="color:var(--text-dim);">Aucun match amical programmé. '
        + 'Tu peux en proposer un depuis la fiche d\'un club adverse.</p>';
      return;
    }
    zone.innerHTML = amicaux.slice().sort((a, b) => (a.date < b.date ? -1 : 1)).map((a) => {
      const adv = RMClub.club(saison, a.adversaireId);
      const nom = adv ? lienClub(a.adversaireId) : 'Adversaire';
      const date = a.date ? RMClub.formaterDateCourte(RMClub.dateDepuisISO(a.date)) : 'date à définir';
      const score = a.joue && a.score
        ? `<b>${a.score.pour} - ${a.score.contre}</b>`
        : '<span style="color:var(--text-faint);">à jouer</span>';
      return `<div class="ligneJeune"><span class="infosJeune"><b>${nom}</b>`
        + `<span>${date}${a.domicile ? ' · à domicile' : ' · à l\'extérieur'}</span></span>`
        + `<span style="flex:0 0 auto;">${score}</span></div>`;
    }).join('');
  }

  // Journée choisie, PAR compétition : passer d'un championnat à l'autre ne
  // doit pas conserver le numéro de journée du précédent. Réinitialisé quand
  // la compétition affichée change.
  let journeeAffichee = { ref: null, numero: null };

  function rendreJourneeCalendrier(zone, comp, nomsCompetition) {
    const journees = RMClub.journeesDe(comp);
    if (!journees.length) {
      zone.innerHTML = '<p style="color:var(--text-dim);">Aucune rencontre programmée pour cette compétition.</p>';
      return;
    }
    // Ouvre là où en est la compétition, pas sur la journée 1.
    if (journeeAffichee.ref !== comp.ref || journeeAffichee.numero == null
        || !journees.some((j) => j.numero === journeeAffichee.numero)) {
      journeeAffichee = { ref: comp.ref, numero: RMClub.journeeCouranteDe(comp) };
    }
    const index = journees.findIndex((j) => j.numero === journeeAffichee.numero);
    const journee = journees[index];
    const precedente = journees[index - 1] || null;
    const suivante = journees[index + 1] || null;
    const dateTitre = journee.date
      ? `<span class="dateJournee">${echapperHTML(RMClub.formaterDateLongue(RMClub.dateDepuisISO(journee.date)))}</span>`
      : '';
    const lignes = journee.rencontres.map((f) => {
      const attenu = f.joue ? ' style="opacity:.6"' : '';
      const enrichie = Object.assign({}, f, {
        libelleDomicile: f.libelleDomicile || nomsCompetition[f.domicileId],
        libelleExterieur: f.libelleExterieur || nomsCompetition[f.exterieurId],
      });
      return `<div${attenu}>${formaterLigneCalendrier(enrichie, saison.clubJoueur.id, { refCompetition: comp.ref })}</div>`;
    }).join('');
    zone.innerHTML =
      `<div class="navJournee">` +
      `<button class="alt btnJournee" data-sens="-1"${precedente ? '' : ' disabled'} ` +
      `title="${precedente ? echapperHTML(precedente.nom) : 'Première journée'}">←</button>` +
      `<span class="titreJournee"><b>${echapperHTML(journee.nom)}</b>${dateTitre}` +
      `<span class="etatJournee">${journee.terminee ? 'terminée'
        : journee.commencee ? `${journee.jouees} / ${journee.total} jouée(s)` : 'à venir'}</span></span>` +
      `<button class="alt btnJournee" data-sens="1"${suivante ? '' : ' disabled'} ` +
      `title="${suivante ? echapperHTML(suivante.nom) : 'Dernière journée'}">→</button>` +
      `</div>` +
      `<div class="blocJournee">${lignes}</div>` +
      `<p class="noteFacultatif">${index + 1} / ${journees.length}</p>`;
  }

  function rafraichirCalendrier() {
    const zone = document.getElementById('clubCalendrier');
    if (!zone) return;
    rafraichirSousOnglets('calendrier');
    const sous = sousOngletCourant('calendrier');
    // « Amicaux » ne vit pas dans une compétition : il a sa propre source
    // (saison.amicaux), donc son propre rendu.
    if (sous === 'amicaux') { rendreAmicaux(zone); return; }
    // Le calendrier suit la compétition choisie dans la navigation partagée
    // (TODO_AUDIT.md P1-33), exactement comme le classement — mais sur SA
    // propre page : ce sont deux choses distinctes.
    const comp = RMClub.competition(saison, competitionNavChoisie);
    if (!comp || !comp.calendrier.length) {
      zone.innerHTML = '<p style="color:var(--text-dim);">Aucune rencontre programmée pour cette compétition.</p>';
      return;
    }
    const nomsCompetition = {};
    for (const cl of comp.clubs) {
      if (cl.id !== saison.clubJoueur.id && !RMClub.clubPartout(saison, cl.id)) nomsCompetition[cl.id] = cl.nom;
    }
    // Filtrage RÉEL selon le sous-onglet — pas trois fois la même liste.
    //   Matchs     : ce qui reste à jouer, et seulement les rencontres de
    //                l'équipe consultée (c'est SON programme) ;
    //   Calendrier : toute la compétition, journée par journée ;
    //   Résultats  : ce qui a déjà été joué.
    const idJoueur = saison.clubJoueur.id;
    const concerneMonClub = (f) => f.domicileId === idJoueur || f.exterieurId === idJoueur;
    // Sur une compétition où le club du joueur ne joue PAS (championnat
    // étranger, autre palier), « Matchs » n'aurait aucun sens filtré sur lui :
    // on montre alors les rencontres à venir de toute la compétition. Sans ce
    // repli, consulter un championnat étranger donnait un écran vide.
    const jyJoue = comp.calendrier.some(concerneMonClub);
    let rencontres = comp.calendrier;
    if (sous === 'matchs') {
      rencontres = rencontres.filter((f) => !f.joue && (!jyJoue || concerneMonClub(f)));
    } else if (sous === 'resultats') rencontres = rencontres.filter((f) => f.joue);
    if (!rencontres.length) {
      const vide = sous === 'matchs'
        ? 'Aucune rencontre à venir pour cette équipe dans cette compétition.'
        : 'Aucune rencontre déjà jouée dans cette compétition.';
      zone.innerHTML = `<p style="color:var(--text-dim);">${vide}</p>`;
      return;
    }
    // Sous-onglet « Calendrier » : UNE journée à la fois, avec sa navigation.
    // Avant, les 182 rencontres d'un championnat à 14 clubs en aller-retour
    // étaient empilées d'un bloc — impossible à parcourir, et rien ne disait
    // où en était la compétition.
    if (sous === 'calendrier') { rendreJourneeCalendrier(zone, comp, nomsCompetition); return; }
    const parJournee = {};
    for (const f of rencontres) (parJournee[f.journee] = parJournee[f.journee] || []).push(f);
    zone.innerHTML = Object.keys(parJournee)
      .sort((a, b) => Number(a) - Number(b))
      .map((j) => {
        // Toutes les rencontres d'une même journée partagent leur date : on
        // l'affiche une fois en clair. Si elles divergeaient (compétition
        // simulée de façon abstraite, sans dates), on n'affiche rien plutôt
        // qu'une date fausse (TODO_AUDIT.md P1-27).
        const datesGroupe = new Set(parJournee[j].map((f) => f.date).filter(Boolean));
        const dateTitre = datesGroupe.size === 1
          ? ` <span class="dateJournee">${echapperHTML(RMClub.formaterDateLongue(RMClub.dateDepuisISO(parJournee[j][0].date)))}</span>`
          : '';
        const lignes = parJournee[j].map((f) => {
          const attenu = f.joue ? ' style="opacity:.6"' : '';
          const enrichie = Object.assign({}, f, {
            libelleDomicile: f.libelleDomicile || nomsCompetition[f.domicileId],
            libelleExterieur: f.libelleExterieur || nomsCompetition[f.exterieurId],
          });
          return `<div${attenu}>${formaterLigneCalendrier(enrichie, saison.clubJoueur.id, { refCompetition: comp.ref })}</div>`;
        }).join('');
        // Une coupe nomme ses tours (« Quarts de finale ») plutôt que de les
        // numéroter — c'est ainsi qu'on en parle (TODO_AUDIT.md P1-34).
        const titreGroupe = parJournee[j][0].nomTour || `Journée ${j}`;
        return `<div class="blocJournee"><h4>${echapperHTML(titreGroupe)}${dateTitre}</h4>${lignes}</div>`;
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
    // Club consulté : son banc est désormais RÉEL (TODO_AUDIT.md P1-29) — il
    // vient de son groupe de 24, comme le sien. On l'affiche donc en lecture
    // seule, avec la même carte, au lieu de l'ancien message « pas connu »
    // qui n'avait de sens que tant que les adversaires n'avaient que 15
    // joueurs. Un club dont l'effectif n'est pas simulé du tout (autre
    // palier, autre pays — P1-28) garde bien un message honnête.
    if (!ctx.modifiable) {
      const zoneBanc = document.getElementById('clubBanc');
      const numerosBanc = Object.keys(banc);
      if (!numerosBanc.length) {
        zoneBanc.innerHTML = `<p class="noteLectureSeule">🔒 Le banc de ${echapperHTML(ctx.nomClub || ctx.label)} n'est pas connu : ce club évolue hors de ton championnat, où seuls les résultats sont suivis.</p>`;
        return;
      }
      const parIdBanc = {};
      for (const j of effectif) parIdBanc[j.id] = j;
      zoneBanc.innerHTML = numerosBanc.sort((a, b) => Number(a) - Number(b)).map((numero) => {
        const j = parIdBanc[banc[numero]];
        const poste = RMClub.POSTE_REQUIS_BANC[numero];
        const blesse = j && j.blessureJournees > 0 ? ` 🤕${j.blessureJournees}j` : '';
        return `<div class="chipBanc"><span class="numChip">N°${numero} · ${POSTE_COMPLET[poste] || poste}</span>` +
          `<b>${j ? echapperHTML(j.nom) + blesse : '—'}</b></div>`;
      }).join('');
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
      `<div class="ligneComposition"><span class="numComposition">Lanceur en touche</span><select data-role="lanceurToucheId"${inactif}>${options(slot.lanceurToucheId)}</select></div>` +
      blocSauteurs(ctx);
  }

  // Sauteurs en touche (TODO_AUDIT.md P1-50) : le manager restreint le pool
  // que le moteur vise. Sans désignation, le moteur garde les n°4 à 8 —
  // pondérés par leur attribut `touche`, donc le meilleur sort déjà le plus
  // souvent. Désigner sert à FORCER un choix, pas à réparer un défaut.
  function blocSauteurs(ctx) {
    if (!ctx.estClubJoueur || !RMClub.dossierSauteurs) return '';
    const d = RMClub.dossierSauteurs(saison, ctx.type);
    if (!d.candidats.length) return '';
    const lignes = d.candidats.map((c) =>
      `<div class="ligneInfo"><span>n°${c.numero} · ${echapperHTML(c.nom)} ` +
      `<span style="color:var(--text-faint);">${echapperHTML(c.poste)}</span></span>` +
      `<b>Touche ${c.touche} ` +
      (ctx.modifiable
        ? `<button class="alt btnSauteur${c.designe ? ' actif' : ''}" data-joueur="${echapperHTML(c.id)}" ` +
          `style="width:auto;padding:4px 10px;font-size:11px;margin-left:8px;">${c.designe ? '✓ sauteur' : 'Désigner'}</button>`
        : (c.designe ? '· sauteur désigné' : '')) +
      `</b></div>`).join('');
    // Le compromis est CHIFFRÉ, pas suggéré : le surcroît de risque affiché
    // est exactement celui que le moteur applique (P1-50b).
    const note = d.designes.length
      ? `<p class="noteLectureSeule" style="margin:4px 0 0;">Le lancer visera ${d.designes.map((c) => 'n°' + c.numero).join(' et ')}. ` +
        `Alignement plus fiable si tes sauteurs sont meilleurs que les autres — mais aussi plus lisible : ` +
        `<b class="deltaNegatif">+${d.risqueVolSupplementaire} point(s) de risque de ballon volé</b> par l'adversaire.</p>`
      : `<p class="noteLectureSeule" style="margin:4px 0 0;">Aucun sauteur imposé : le lancer vise les n°4 à 8, en ciblant plus souvent les meilleurs, et reste imprévisible. Maximum ${d.max} désignations — chacune rend la touche plus lisible.</p>`;
    return `<h4 class="sousTitreMedical">Sauteurs en touche</h4>${lignes}${note}`;
  }

  // Rapport de scout, pas fiche technique parfaite : tant qu'un joueur du
  // marché n'est pas assez CONNU (cf. RMClub.scouterJoueur), on affiche une
  // estimation en étoiles plutôt que ses vraies statistiques — un manager ne
  // sait jamais tout d'un joueur qu'il n'a jamais vraiment observé.
  // Marque d'où vient un joueur ramené par une mission (G12) : le manager a
  // payé pour le voir, il doit pouvoir le distinguer du marché national que
  // tous les clubs consultent gratuitement.
  function badgeZoneDecouverte(j) {
    if (!j.zoneDecouverte) return '';
    const z = (RMClub.ZONES_SCOUTING || {})[j.zoneDecouverte];
    if (!z) return '';
    return ` <span class="badgeNiveau niveau-info" title="Repéré par ton réseau — ce joueur n'apparaît que pour ton club">🌍 ${echapperHTML(z.nom)}</span>`;
  }
  function ligneJoueurMarche(j, c, favori) {
    const fenetreOuverte = RMClub.etatFenetreTransfert(saison).ouverte;
    const primeSignature = RMClub.calculerPrimeSignature(j);
    const abordable = c.budget >= (j.prixTransfert + primeSignature);
    // Rapport de scout AU POSTE (TODO_AUDIT.md P1-49) : avant, cette ligne
    // n'affichait que vitesse et plaquage. Mesuré : les cinq piliers d'un
    // même marché portaient la même note (2★) alors que leur mêlée allait de
    // 77 à 86 — l'attribut qui décide seul s'ils joueront. On affiche
    // maintenant la note au poste et les attributs qui comptent VRAIMENT
    // à ce poste (cf. attributsClesDuPoste).
    const rapport = RMClub.rapportScouting(saison, j.id);
    const stats = RMClub.statsApparentes(j);
    const nbEtoiles = rapport ? rapport.etoiles : RMClub.estimationEtoiles(j);
    const etoiles = '★'.repeat(nbEtoiles) + '☆'.repeat(5 - nbEtoiles);
    const clesTexte = rapport
      ? rapport.attributsCles.slice(0, 3)
        .filter((a) => a.valeur != null)
        .map((a) => `${echapperHTML(a.libelle)} ${a.valeur}`).join(' · ')
      : '';
    const comparaison = rapport && rapport.meilleurActuel != null
      ? ` <span class="${rapport.ameliore ? 'deltaPositif' : 'deltaNegatif'}" ` +
        `title="Note au poste comparée à ton meilleur joueur actuel à ce poste">` +
        `${rapport.ameliore ? '↑' : '↓'} ton meilleur ${echapperHTML(j.poste)} : ${rapport.meilleurActuel}</span>`
      : '';
    const ligneStats = `${etoiles} <b title="Note au poste, même grille que la composition">${rapport ? rapport.note : '?'}</b>` +
      (clesTexte ? ` · ${clesTexte}` : '') + comparaison +
      (stats.complet ? '' : ` <span title="Rapport de scout incomplet : ${Math.round((stats.fiabilite || 0) * 100)} % de fiabilité">(estimation)</span>`);
    const rapportEnCours = RMClub.rapportScoutingEnCours(saison, j.id);
    const boutonScout = stats.complet
      ? ''
      : rapportEnCours
        ? `<span class="rapportEnCours" title="Rapport commandé, en cours de rédaction">🔍 Rapport le ${echapperHTML(RMClub.formaterDateCourte(RMClub.dateDepuisISO(rapportEnCours.dateRemise)))}</span>`
        : `<button class="alt btnScouter" data-joueur="${j.id}"${c.budget >= RMClub.COUT_SCOUTING ? '' : ' disabled'}>🔍 Scouter (${RMClub.COUT_SCOUTING} k€)</button>`;
    const enComparaison = selectionComparaison.has(j.id) ? ' checked' : '';
    return `<div class="ligneMarche"><label class="caseComparaison" title="Ajouter à la comparaison"><input type="checkbox" class="caseComparerJoueur" data-joueur="${j.id}"${enComparaison}></label>` +
      `<span class="infosJoueur"><b>${j.nom}</b>${badgeZoneDecouverte(j)}<span>${POSTE_COMPLET[j.poste] || j.poste} · ${j.age} ans · ${ligneStats}</span></span>` +
      `<span class="actionMarche"><button class="btnFavori${favori ? ' actif' : ''}" data-joueur="${j.id}" title="Favori">${favori ? '★' : '☆'}</button>` +
      `<span class="prixMarche" title="Indemnité de transfert + prime de signature">${j.prixTransfert}<span style="color:var(--text-faint);font-weight:400;"> +${primeSignature} k€</span></span>${boutonScout}` +
      `<button class="accent btnSigner" data-joueur="${j.id}"${abordable && fenetreOuverte ? '' : ' disabled'}` +
      `${fenetreOuverte ? '' : ' title="Marché des transferts fermé"'}>Signer</button></span></div>`;
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
  // Mercato de la division (TODO_AUDIT.md P1-43a) : ce que les clubs rivaux
  // ont RÉELLEMENT fait pendant l'intersaison. Chaque ligne correspond à un
  // mouvement enregistré dans la sauvegarde (saison.mercato) — jamais un
  // texte d'ambiance. Ces joueurs existent toujours : le manager peut les
  // repérer et tenter de les recruter (cf. approcherJoueurAdverse).
  function rafraichirMercatoDivision() {
    const carte = document.getElementById('carteMercatoDivision');
    if (!carte) return;
    const m = saison.mercato;
    if (!m || (!m.mouvements || !m.mouvements.length)) { carte.style.display = 'none'; return; }
    carte.style.display = '';
    const lignes = m.mouvements.map((t) => {
      const prix = t.montant > 0
        ? `<b>${t.montant} k€</b>`
        : '<span style="color:var(--text-faint);">libre</span>';
      return `<div class="ligneJeune"><span class="infosJeune"><b>${t.joueurNom}</b>` +
        `<span>${t.poste} · ${t.age} ans · ${t.deClubNom} → ${t.versClubNom}</span></span>` +
        `<span style="flex:0 0 auto;">${prix}</span></div>`;
    }).join('');
    const retraites = m.retraites && m.retraites.length
      ? `<p style="margin:10px 0 0;font-size:11.5px;color:var(--text-faint);">${m.retraites.length} joueur(s) ont pris leur retraite dans la division.</p>`
      : '';
    document.getElementById('clubMercatoDivision').innerHTML =
      `<p style="margin:0 0 8px;font-size:12px;color:var(--text-dim);">Intersaison ${m.saison} → ${m.saison + 1} : ${m.mouvements.length} changement(s) de club chez tes rivaux.</p>`
      + lignes + retraites;
  }

  function rafraichirMarche() {
    rafraichirCibles();
    const c = saison.clubJoueur;
    document.getElementById('transfertsBudget').innerHTML =
      `<div class="ligneFinances"><span>Budget disponible</span><span class="budgetValeur${c.budget < 0 ? ' negatif' : ''}">${c.budget} k€</span></div>`;
    document.getElementById('clubMarche').innerHTML = saison.marche.map((j) => ligneJoueurMarche(j, c, false)).join('')
      || '<p>Aucun joueur libre pour le moment.</p>';
    rafraichirMercatoDivision();
    rafraichirDeparts();
    rafraichirFavoris();
    rafraichirReseauScouting();
  }

  // --- Réseau de recrutement (G12) : la seule décision de repérage qui
  // engage vraiment le club. Un recruteur, une zone, une durée, un coût payé
  // d'avance — et des joueurs que le marché national n'aurait jamais montrés.
  // Tout vient de RMClub.dossierReseau : aucune règle n'est réécrite ici. ---
  function rafraichirReseauScouting() {
    const zoneMission = document.getElementById('clubMissionScouting');
    const zoneZones = document.getElementById('clubZonesScouting');
    const zoneRapports = document.getElementById('clubRapportsReseau');
    const selDuree = document.getElementById('dureeMissionScouting');
    if (!zoneMission || !zoneZones || !RMClub.dossierReseau) return;

    // Durée choisie par le manager, conservée entre deux rafraîchissements :
    // c'est elle qui pilote les coûts affichés sur chaque zone.
    if (selDuree && !selDuree.options.length) {
      selDuree.innerHTML = (RMClub.DUREES_MISSION || [15, 30, 60, 90])
        .map((j) => `<option value="${j}"${j === 30 ? ' selected' : ''}>Mission de ${j} jours</option>`).join('');
    }
    const jours = selDuree ? Number(selDuree.value) || 30 : 30;
    const d = RMClub.dossierReseau(saison, jours);

    if (d.mission) {
      const fait = d.mission.duree - d.mission.joursRestants;
      const pct = Math.round((fait / d.mission.duree) * 100);
      zoneMission.innerHTML =
        `<p style="margin:0 0 8px;">Ton recruteur est en mission en <b>${echapperHTML(d.mission.nomZone)}</b> ` +
        `(${d.mission.cout} k€ engagés).</p>` +
        `<span class="barreMoral"><span style="width:${pct}%"></span></span> ` +
        `<span style="font-size:12px;color:var(--text-dim);">${d.mission.joursRestants} jour(s) restant(s) sur ${d.mission.duree}</span>` +
        `<div style="margin-top:8px;"><button id="btnRappelerRecruteur" class="alt" ` +
        `style="width:auto;padding:7px 12px;font-size:12px;">Rappeler le recruteur</button> ` +
        `<span style="font-size:11.5px;color:var(--text-faint);">La mission déjà payée n'est pas remboursée.</span></div>`;
      zoneZones.innerHTML = '';
    } else {
      zoneMission.innerHTML =
        `<p style="margin:0 0 10px;font-size:12px;color:var(--text-dim);">Un seul recruteur : l'envoyer quelque part, ` +
        `c'est renoncer à toutes les autres zones pendant ce temps. Ce qu'il ramène n'existe que pour ton club.` +
        (d.recruteur ? '' : ' <b>Aucun recruteur au staff</b> — les missions coûtent plus cher et rapportent moins.') +
        `</p>`;
      zoneZones.innerHTML = d.zones.map((z) => {
        const postes = z.postes.length ? z.postes.join(' · ') : 'tous postes';
        return `<div class="ligneJeune"><span class="infosJeune">` +
          `<b>${echapperHTML(z.nom)} — connue à ${z.connaissance} %</b>` +
          `<span>${echapperHTML(z.reputation)}<br>Profils typiques : ${echapperHTML(postes)} · ${z.coutParJour} k€/jour</span></span>` +
          `<span style="flex:0 0 auto;"><button class="alt btnMissionScouting" data-zone="${echapperHTML(z.code)}" ` +
          `style="width:auto;padding:7px 12px;font-size:12px;">Envoyer · ${z.coutMission} k€</button></span></div>`;
      }).join('');
    }

    if (zoneRapports) {
      zoneRapports.innerHTML = d.rapports.length
        ? `<h4 class="sousTitreMedical">Rapports du réseau (${d.rapports.length})</h4>` +
          d.rapports.map((r) =>
            `<div class="ligneInfo" style="align-items:flex-start;"><span style="flex:1 1 auto;">` +
            `<b>${echapperHTML(r.nomZone)}</b> <span style="color:var(--text-faint);">${echapperHTML(r.date || '')} · ${r.duree} j · ${r.cout} k€</span><br>` +
            `<span style="font-size:12px;color:var(--text-dim);">${echapperHTML(r.texte)}</span></span></div>`).join('')
        : `<p class="noteLectureSeule" style="margin:0;">Aucune mission menée pour l'instant. Le marché national est le même pour tous les clubs — le réseau est ce qui te donne des joueurs que les autres ne voient pas.</p>`;
    }
  }

  // --- Départs (TODO_AUDIT.md P1-48) : vendre est enfin possible. Tout vient
  // de RMClub.dossierVentes — valeurs calculées sur les attributs réels,
  // offres réellement reçues de clubs qui ont réellement le budget. ---
  function rafraichirDeparts() {
    const zone = document.getElementById('clubDeparts');
    if (!zone) return;
    const d = RMClub.dossierVentes(saison);
    const blocOffres = d.offres.length
      ? `<h4 class="sousTitreMedical">Offres reçues (${d.offres.length})</h4>` +
        d.offres.map((o) =>
          `<div class="ligneInfo"><span>${echapperHTML(o.joueurNom)} <span style="color:var(--text-faint);">${echapperHTML(o.clubNom)}</span></span>` +
          `<b>${o.montant} k€ · <span style="color:var(--text-dim);font-weight:400;">à traiter dans la boîte de réception</span></b></div>`).join('')
      : '';
    const blocListe = d.surListe.length
      ? `<h4 class="sousTitreMedical">Sur la liste des transferts (${d.surListe.length})</h4>` +
        d.surListe.map((j) =>
          `<div class="ligneInfo"><span>${echapperHTML(j.nom)} <span style="color:var(--text-faint);">${echapperHTML(j.poste)} · ${j.age} ans</span>` +
          (j.veutPartir ? ' <span class="texteAlerteJoueur">🚩 veut partir</span>' : '') + `</span>` +
          `<b>${j.valeur} k€ <button class="alt btnListeTransfert" data-joueur="${echapperHTML(j.id)}" ` +
          `style="width:auto;padding:4px 8px;font-size:11px;margin-left:8px;">Retirer</button></b></div>`).join('')
      : `<p class="noteLectureSeule" style="margin:0 0 6px;">Aucun joueur sur la liste. Mettre un joueur en vente depuis sa fiche multiplie les offres, mais fait baisser son prix : le marché sait que tu es vendeur.</p>`;
    const cessiblesHorsListe = d.cessibles.filter((j) => !j.surListe).slice(0, 8);
    const blocCessibles = cessiblesHorsListe.length
      ? `<h4 class="sousTitreMedical">Ce que vaut ton effectif</h4>` +
        cessiblesHorsListe.map((j) =>
          `<div class="ligneInfo"><span>${echapperHTML(j.nom)} <span style="color:var(--text-faint);">${echapperHTML(j.poste)}</span>` +
          (j.veutPartir ? ' <span class="texteAlerteJoueur">🚩</span>' : '') + `</span><b>${j.valeur} k€</b></div>`).join('')
      : '';
    zone.innerHTML =
      `${ligneInfo(`Valeur totale de l'effectif`, `${d.valeurEffectif} k€`)}` +
      `${ligneInfo(`Demandes de transfert en cours`, `${d.demandesDepart}`, { etat: `${d.demandesDepart ? 'deltaNegatif' : ''}` })}` +
      blocOffres + blocListe + blocCessibles;
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
    // Comparer deux joueurs sur vitesse et plaquage ne servait à rien pour un
    // pilier (P1-49). On compare maintenant la NOTE AU POSTE, puis les
    // attributs qui comptent réellement — ceux du poste du premier joueur
    // sélectionné, puisque c'est le poste qu'on cherche à pourvoir.
    const posteVise = joueurs[0].poste;
    const clesPoste = RMClub.attributsClesDuPoste(posteVise, 4);
    const CRITERES = [
      ['poste', 'Poste', (j) => POSTE_COMPLET[j.poste] || j.poste, false],
      ['age', 'Âge', (j) => j.age, false],
      ['note', `Note au poste (${posteVise})`, (j) => RMClub.noteApparenteAuPoste(j, posteVise), true],
    ].concat(clesPoste.map((a) => [a.attr, a.libelle,
      (j) => { const v = RMClub.statsApparentes(j)[a.attr]; return v == null ? '—' : v; }, true]))
      .concat([['prixTransfert', 'Prix', (j) => `${j.prixTransfert} k€`, false]]);
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
    rafraichirPreparationMatch();
    rafraichirAgenda();
    rafraichirFenetreTransfert();
    rafraichirObjectifSaison();
    rafraichirAdversaire();
    rafraichirMessages();
    rafraichirAutresClubs();
    rafraichirCarriereManager();
    rafraichirDerniersResultats();
    rafraichirAlertes();
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
  // Accélérer un retour (TODO_AUDIT.md P1-40) : VRAIE décision, avec une
  // conséquence réelle et annoncée AVANT de la prendre — on gagne des jours,
  // on paie en risque de rechute, et la rechute est ensuite réellement plus
  // probable (cf. risqueBlessure, facteur `rechute`).
  document.getElementById('clubMedical').addEventListener('click', async (e) => {
    const bouton = e.target.closest('.btnAccelerer');
    if (!bouton) return;
    const id = bouton.dataset.joueur;
    const joueur = [].concat(saison.clubJoueur.effectif || [], saison.clubJoueur.jeunes || [])
      .find((j) => j.id === id);
    if (!joueur || !joueur.blessure) return;
    const restant = RMClub.joursIndisponible(joueur);
    const gagne = Math.max(1, Math.round(restant * 0.35));
    const avant = Math.round(joueur.blessure.risqueRechute * 100);
    const apres = Math.min(95, Math.round(joueur.blessure.risqueRechute * 2.2 * 100));
    const ok = await confirmerAction(
      `Accélérer le retour de ${joueur.nom} ? Il reviendrait ${gagne} jour(s) plus tôt ` +
      `(${restant} → ${restant - gagne} jour(s)). En contrepartie, son risque de rechute ` +
      `passerait de ${avant} % à ${apres} %, et une rechute le renverrait à l'infirmerie ` +
      `pour une nouvelle blessure complète.`);
    if (!ok) return;
    RMClub.accelererRetour(saison, joueur);
    RMClub.ajouterMessage(saison, 'blessure', 'Retour accéléré',
      `${joueur.nom} reprend plus tôt que prévu, contre l'avis du staff médical. ` +
      `Risque de rechute porté à ${Math.round(joueur.blessure.risqueRechute * 100)} %.`);
    sauvegarder();
    rafraichirMedical();
    rafraichirAlertes();
    rafraichirEffectif();
    toast(`${joueur.nom} : retour avancé de ${gagne} jour(s)`);
  });

  // La carte « Préparation du prochain match » a quitté le tableau de bord
  // (TODO_AUDIT.md P1-41) : ses lignes cliquables vivent désormais dans
  // l'onglet « Préparer le match », qui a sa propre délégation ci-dessus.
  // On garde une garde défensive pour une ancienne page en cache.
  const zonePrepDash = document.getElementById('clubPreparationMatch');
  if (zonePrepDash) {
    zonePrepDash.addEventListener('click', (e) => {
      const ligne = e.target.closest('.lignePreparation');
      if (ligne && ligne.dataset.onglet) basculerOnglet(ligne.dataset.onglet);
    });
  }
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
      // Rafraîchissement COMPLET, pas seulement messages + effectif : une
      // décision peut désormais déplacer de l'argent et retirer un joueur du
      // groupe (accepter une offre, cf. club-ventes.js). Mesuré en pilotant
      // le jeu : après une vente à 270 k€, l'onglet Finances affichait encore
      // le budget et le grand livre d'AVANT, et la composition gardait un
      // titulaire qui venait de partir.
      rafraichirTout();
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
    const champManager = document.getElementById('inputNomManager');
    const nomManager = champManager ? champManager.value.trim() : '';
    const rng = creerRng(graineAleatoire());
    saison = RMClub.nouvelleSaison(rng, nom || null, nomManager || null);
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
  // --- Écran Contrats : filtres, tri, ouverture de la fiche --------------
  const caseExpirants = document.getElementById('filtreContratsExpirants');
  if (caseExpirants) {
    caseExpirants.addEventListener('change', (e) => {
      filtreContrats.expirants = e.target.checked; rafraichirContrats();
    });
  }
  const caseRisque = document.getElementById('filtreContratsRisque');
  if (caseRisque) {
    caseRisque.addEventListener('change', (e) => {
      filtreContrats.risque = e.target.checked; rafraichirContrats();
    });
  }
  const zoneContrats = document.getElementById('clubContrats');
  if (zoneContrats) {
    zoneContrats.addEventListener('click', (e) => {
      const entete = e.target.closest('.triableContrat');
      if (entete) {
        const champ = entete.dataset.champ;
        if (filtreContrats.triChamp === champ) filtreContrats.triSens *= -1;
        else { filtreContrats.triChamp = champ; filtreContrats.triSens = 1; }
        rafraichirContrats();
        return;
      }
      // Un clic sur une ligne ouvre la MÊME fiche joueur que l'effectif.
      const ligne = e.target.closest('tr[data-joueur]');
      if (ligne) ouvrirFicheJoueur(ligne.dataset.joueur);
    });
  }
  // --- Joueurs des clubs de la division : filtre et offre ----------------
  const selCibles = document.getElementById('filtreCiblesPoste');
  if (selCibles) {
    for (const cle of Object.keys(POSTE_COMPLET)) {
      const opt = document.createElement('option');
      opt.value = cle; opt.textContent = POSTE_COMPLET[cle];
      selCibles.appendChild(opt);
    }
    selCibles.addEventListener('change', (e) => {
      filtreCibles.poste = e.target.value; rafraichirCibles();
    });
  }
  const zoneCibles = document.getElementById('clubCibles');
  if (zoneCibles) {
    zoneCibles.addEventListener('click', async (e) => {
      const bouton = e.target.closest('.btnOffreCible');
      if (!bouton) return;
      const cible = RMClub.joueursDesClubsAdverses(saison, {})
        .find((x) => x.joueurId === bouton.dataset.joueur);
      if (!cible) return;
      const montant = await demanderMontant(
        `${cible.nom} (${cible.clubNom}) — prix demandé ${cible.prixDemande} k€. ` +
        `Montant de ton offre (k€), budget disponible ${saison.clubJoueur.budget} k€ :`,
        cible.prixDemande);
      if (montant == null) return;
      const res = RMClub.proposerOffreTransfert(saison, bouton.dataset.club, bouton.dataset.joueur, montant);
      if (!res.ok) {
        // Chaque refus est EXPLIQUÉ : le manager doit savoir pourquoi.
        const texte = res.motif === 'budget'
          ? `Budget insuffisant : il te manque ${res.manque} k€ pour offrir ${res.prix} k€.`
          : res.motif === 'deja_en_cours' ? 'Une offre est déjà en cours pour ce joueur.'
          : res.motif === 'fenetreFermee' ? 'Le marché des transferts est fermé.'
          : 'Offre impossible.';
        toast(texte, 'erreur');
        return;
      }
      toast(`Offre de ${res.prix} k€ transmise. Réponse sous ${RMClub.DELAI_REPONSE_TRANSFERT_JOURS} jours.`, 'succes');
      rafraichirTout();
    });
  }

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
      // La fiche passe désormais par le MÊME flux que la liste des joueurs de
      // la division (proposerOffreTransfert) : le club répond sous quelques
      // jours, peut contre-proposer, et le vendeur encaisse réellement.
      // L'ancien chemin instantané (`approcherJoueurAdverse`) reste exporté,
      // mais il ne créditait PAS le club vendeur et remplaçait aussitôt le
      // joueur par un clone du même numéro : l'adversaire ne perdait
      // personne, et l'argent disparaissait.
      const res = RMClub.proposerOffreTransfert(saison, adv.id, joueurCible.id, montant);
      if (!res.ok) {
        if (res.motif === 'budget') toast(`Budget insuffisant : il te manque ${res.manque} k€.`, 'erreur');
        else if (res.motif === 'deja_en_cours') toast('Une offre est déjà en cours pour ce joueur.', 'erreur');
        else if (res.motif === 'fenetreFermee') toast('Le marché des transferts est fermé.', 'erreur');
        else toast('Transfert impossible.', 'erreur');
        return;
      }
      sauvegarder();
      toast(`💼 Offre de ${res.prix} k€ transmise à ${adv.nom} — réponse sous ${RMClub.DELAI_REPONSE_TRANSFERT_JOURS} jours`, 'succes');
      rafraichirTout();
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
      return;
    }
    if (e.target.id === 'btnListeTransfertFiche') {
      if (!joueurAffiche) return;
      const res = RMClub.basculerListeTransfert(saison, joueurAffiche);
      if (!res.ok) { toast('Action impossible.', 'erreur'); return; }
      sauvegarder();
      toast(res.surListe
        ? `✅ ${res.joueur.nom} est sur la liste des transferts (${RMClub.valeurMarchande(saison, res.joueur)} k€)`
        : `✅ ${res.joueur.nom} n'est plus en vente`);
      ouvrirFicheJoueur(joueurAffiche);
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
      // Négociation ASYNCHRONE (TODO_AUDIT.md P1-24) : le joueur consulte son
      // agent et répond quelques jours plus tard, pendant que le temps
      // avance. La décision elle-même reste celle de negocierRenouvellement.
      const res = RMClub.proposerContrat(saison, joueurAffiche, montant, offre.dureeMax);
      if (!res.ok) {
        toast('Une proposition est déjà en cours pour ce joueur.', 'erreur');
        return;
      }
      sauvegarder();
      toast(`📄 Proposition transmise à ${joueur.nom} — réponse attendue le ${RMClub.formaterDateCourte(res.dateReponse)}`);
      ouvrirFicheJoueur(joueurAffiche);
      return;
    }
    // Négociation détaillée : salaire, durée ET prime. La prime peut emporter
    // une décision que le salaire seul ne suffit pas à emporter (cf.
    // evaluerOffreContrat) — c'est un vrai levier, pas un champ décoratif.
    if (e.target.id === 'btnNegocierContrat') {
      if (!joueurAffiche) return;
      const joueur = saison.clubJoueur.effectif.find((j) => j.id === joueurAffiche);
      if (!joueur) return;
      const exigence = RMClub.exigenceSalariale(saison, joueur, { duree: 2 });
      const montant = await demanderMontant(
        `${joueur.nom} — ses prétentions sont estimées à ${exigence} k€/saison. Salaire annuel proposé (k€) :`,
        exigence);
      if (montant == null) return;
      const duree = await demanderMontant(
        `Durée du contrat proposée à ${joueur.nom}, en saisons (1 à 5) :`, 3);
      if (duree == null) return;
      const prime = await demanderMontant(
        `Prime de signature pour ${joueur.nom} (k€, 0 pour aucune). Budget disponible : ${saison.clubJoueur.budget} k€.`, 0);
      if (prime == null) return;
      const res = RMClub.ouvrirNegociation(saison, joueurAffiche,
        { salaire: montant, duree, prime });
      if (!res.ok) {
        toast(res.motif === 'rompue'
          ? `${joueur.nom} a mis fin aux discussions : plus de proposition possible cette saison.`
          : 'Une proposition est déjà en cours pour ce joueur.', 'erreur');
        return;
      }
      sauvegarder();
      toast(`📄 Proposition transmise à ${joueur.nom} (${res.salaire} k€ × ${res.duree} an(s)` +
        `${res.prime ? `, prime ${res.prime} k€` : ''}) — réponse le ${RMClub.formaterDateCourte(res.dateReponse)}`);
      ouvrirFicheJoueur(joueurAffiche);
      return;
    }
    if (e.target.id === 'btnNonRenouvellement') {
      if (!joueurAffiche) return;
      const joueur = saison.clubJoueur.effectif.find((j) => j.id === joueurAffiche);
      if (!joueur) return;
      if (!joueur.nonRenouvele && !(await confirmerAction(
        `Annoncer à ${joueur.nom} qu'il ne sera pas prolongé ? Il partira libre à la fin de son ` +
        `contrat (saison ${RMClub.saisonFinContrat(saison, joueur)}) et le prendra mal.`))) return;
      const res = RMClub.basculerNonRenouvellement(saison, joueurAffiche);
      if (!res.ok) { toast('Action impossible.', 'erreur'); return; }
      sauvegarder();
      toast(res.nonRenouvele
        ? `🚪 ${joueur.nom} ne sera pas prolongé`
        : `↩️ ${joueur.nom} peut de nouveau être prolongé`);
      rafraichirTout();
      ouvrirFicheJoueur(joueurAffiche);
      return;
    }
    if (e.target.id === 'btnRompreContrat') {
      if (!joueurAffiche) return;
      const joueur = saison.clubJoueur.effectif.find((j) => j.id === joueurAffiche);
      if (!joueur) return;
      const indemnite = RMClub.indemniteRupture(joueur);
      if (!(await confirmerAction(
        `Rompre le contrat de ${joueur.nom} ? Il quitte le club immédiatement et l'indemnité ` +
        `de ${indemnite} k€ est décaissée (budget actuel ${saison.clubJoueur.budget} k€). ` +
        `Le vestiaire le remarquera.`))) return;
      const res = RMClub.rompreContrat(saison, joueurAffiche);
      if (!res.ok) {
        // Refus EXPLIQUÉ, jamais un bouton qui ne fait rien.
        toast(res.motif === 'budget'
          ? `Budget insuffisant : il te manque ${res.manque} k€ pour l'indemnité de ${res.indemnite} k€.`
          : res.motif === 'dernierAuPoste'
            ? 'Dernier joueur de son poste : le club se retrouverait à découvert.'
            : 'Rupture impossible.', 'erreur');
        return;
      }
      sauvegarder();
      toast(`✂️ ${res.joueur.nom} quitte le club (${res.indemnite} k€ d'indemnité)`, 'succes');
      document.getElementById('clubJoueurDetail').style.display = 'none';
      joueurAffiche = null;
      rafraichirTout();
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
    rafraichirTerrain();
    rafraichirBanc();
    rafraichirEncadrement();
  });
  document.getElementById('clubJoueurDetail').addEventListener('change', (e) => {
    if (!joueurAffiche) return;
    const joueur = saison.clubJoueur.effectif.find((j) => j.id === joueurAffiche);
    if (!joueur) return;
    if (e.target.id === 'selEntrainementIndividuel') {
      joueur.entrainementIndividuel = e.target.value || null;
      sauvegarder();
      toast(joueur.entrainementIndividuel
        ? `✅ ${joueur.nom} suit un entraînement individuel dédié`
        : `✅ ${joueur.nom} suit de nouveau le programme collectif`);
      return;
    }
    // Statut promis : l'annonce a un effet immédiat sur le moral — on le
    // MONTRE, sinon le manager ne saurait pas qu'il vient d'engager le club.
    if (e.target.id === 'selStatutPromis') {
      const res = RMClub.definirStatutPromis(saison, joueur.id, e.target.value || null);
      if (!res.ok) { toast('❌ Statut impossible à promettre'); return; }
      sauvegarder();
      const signe = res.effetMoral > 0 ? `+${res.effetMoral}` : `${res.effetMoral}`;
      toast(res.statut
        ? `✅ ${joueur.nom} est annoncé ${RMClub.STATUTS[res.statut].libelle.toLowerCase()}` +
          (res.effetMoral ? ` · moral ${signe}` : '')
        : `✅ ${joueur.nom} n'a plus de statut promis` + (res.effetMoral ? ` · moral ${signe}` : ''));
      ouvrirFicheJoueur(joueur.id);
      rafraichirEffectif();
    }
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
  // Navigation pays/championnat (TODO_AUDIT.md P1-28) : deux écouteurs
  // délégués, comme le clic sur un nom de club — jamais un écouteur par
  // bouton régénéré à chaque rafraîchissement.
  document.getElementById('clubNavPays').addEventListener('click', (e) => {
    const bouton = e.target.closest('.btnPaysNav');
    if (!bouton) return;
    paysNavChoisi = bouton.dataset.pays;
    competitionNavChoisie = null;
    rafraichirAutresClubs();
  });
  document.getElementById('clubNavChampionnats').addEventListener('click', (e) => {
    const bouton = e.target.closest('.btnChampionnatNav');
    if (!bouton) return;
    competitionNavChoisie = bouton.dataset.ref;
    rafraichirAutresClubs();
  });
  // La suggestion de rotation ne s'applique QUE sur un clic explicite : le
  // module qui la calcule ne modifie jamais rien lui-même.
  document.getElementById('clubGestion').addEventListener('click', (e) => {
    if (!e.target.closest('#btnAppliquerRotation')) return;
    const ctx = contexte();
    const sug = RMClub.suggestionRotation(saison, ctx.type);
    const slot = RMClub.slotCompositionPourEquipe(saison, ctx.type);
    slot.compositionTitulaires = Object.assign({}, sug.composition);
    slot.compositionBanc = RMClub.completerCompositionBanc(
      RMClub.effectifPourEquipe(saison, ctx.type), slot.compositionTitulaires, {});
    sauvegarder();
    toast(`Rotation appliquée : ${sug.changements.length} changement(s).`);
    rafraichirEcransEquipe();
    rafraichirEffectif();
  });

  // Inscription / retrait d'un joueur : écouteur délégué, comme partout.
  document.getElementById('clubGestion').addEventListener('click', (e) => {
    const b = e.target.closest('.btnInscription');
    if (!b) return;
    const r = b.dataset.action === 'inscrire'
      ? RMClub.inscrireJoueur(saison, b.dataset.ref, b.dataset.joueur)
      : RMClub.desinscrireJoueur(saison, b.dataset.ref, b.dataset.joueur);
    toast(r.message, r.ok ? 'succes' : 'erreur');
    if (r.ok) { sauvegarder(); rafraichirEffectif(); }
  });

  // Feuille de match d'une rencontre PASSÉE. Le compte rendu ne vivait
  // jusqu'ici que sur l'écran de fin de match, et disparaissait à sa
  // fermeture : il est désormais archivé (club-archives-matchs.js) et se
  // rouvre depuis le calendrier, avec le MÊME rendu.
  function ouvrirFeuilleArchivee(cle) {
    const f = RMClub.feuilleDeMatchArchivee(saison, cle);
    const panneau = document.getElementById('panneauFeuilleMatch');
    const corps = document.getElementById('corpsFeuilleMatch');
    const titre = document.getElementById('titreFeuilleMatch');
    if (!panneau || !corps) return;
    if (!f) {
      corps.innerHTML = '<p style="color:var(--text-dim);">Aucun compte rendu enregistré pour cette rencontre.</p>';
    } else {
      const sousTitre = [f.libelle, f.date ? RMClub.formaterDateLongue(RMClub.dateDepuisISO(f.date)) : null]
        .filter(Boolean).join(' — ');
      if (titre) titre.textContent = `${f.nomA} ${f.score.A} - ${f.score.B} ${f.nomB}`;
      corps.innerHTML = (sousTitre ? `<p class="noteFacultatif">${echapperHTML(sousTitre)}</p>` : '')
        + RMClub.htmlFeuilleDeMatch(f);
    }
    panneau.classList.add('visible');
  }

  document.getElementById('clubGestion').addEventListener('click', (e) => {
    const ligne = e.target.closest('.ligneOuvrable');
    // Un nom de club reste cliquable DANS la ligne : son propre écouteur a la
    // priorité, on ne veut pas ouvrir la feuille en visant le club.
    if (!ligne || e.target.closest('.lienClub')) return;
    ouvrirFeuilleArchivee(ligne.dataset.feuille);
  });
  document.getElementById('fermerFeuilleMatch').addEventListener('click', () => {
    document.getElementById('panneauFeuilleMatch').classList.remove('visible');
  });

  // Navigation par journée : écouteur délégué, comme partout ailleurs — les
  // deux boutons sont régénérés à chaque rendu.
  document.getElementById('clubCalendrier').addEventListener('click', (e) => {
    const bouton = e.target.closest('.btnJournee');
    if (!bouton || bouton.disabled) return;
    const comp = RMClub.competition(saison, competitionNavChoisie);
    if (!comp) return;
    const journees = RMClub.journeesDe(comp);
    const index = journees.findIndex((j) => j.numero === journeeAffichee.numero);
    const cible = journees[index + Number(bouton.dataset.sens)];
    if (!cible) return;
    journeeAffichee = { ref: comp.ref, numero: cible.numero };
    rafraichirCalendrier();
  });

  // Les compétitions de l'équipe sélectionnée : même mécanique déléguée, et
  // surtout la MÊME cible (`competitionNavChoisie`) que la navigation par
  // pays — il n'existe qu'un seul état de compétition choisie dans le jeu.
  document.getElementById('clubCompetitionsEquipe').addEventListener('click', (e) => {
    const bouton = e.target.closest('.btnCompetitionEquipe');
    if (!bouton) return;
    choisirCompetition(bouton.dataset.ref);
  });
  document.getElementById('btnJouerMatchClub').addEventListener('click', continuer);
  document.getElementById('btnJourSuivant').addEventListener('click', jourSuivant);
  // Proposition / annulation d'un amical (TODO_AUDIT.md P1-32) : écouteur
  // délégué sur la vue du club consulté, comme partout ailleurs.
  document.getElementById('clubVueConsulteAmical').addEventListener('click', (e) => {
    const proposer = e.target.closest('#btnProposerAmical');
    if (proposer) {
      const dateISO = document.getElementById('selDateAmical').value;
      const r = RMClub.proposerAmical(saison, proposer.dataset.club, dateISO);
      toast(r.message, r.accepte ? 'succes' : 'erreur');
      if (r.accepte) { sauvegarder(); rafraichirVueClub(); rafraichirProchainMatch(); rafraichirAgenda(); }
      return;
    }
    const annuler = e.target.closest('#btnAnnulerAmical');
    if (annuler) {
      if (RMClub.annulerAmical(saison, annuler.dataset.amical)) {
        toast('Rencontre amicale annulée.');
        sauvegarder(); rafraichirVueClub(); rafraichirProchainMatch(); rafraichirAgenda();
      }
    }
  });
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
  // Match JOUÉ (P0-match) : le résultat n'est PAS calculé d'avance. Le manager
  // suit la rencontre et décide à la mi-temps ; ses consignes et ses
  // remplacements changent réellement la seconde période. « Simuler » reste
  // le chemin par défaut (jouer un match prend le temps d'un match).
  let matchJoueEnDirect = false;
  document.getElementById('btnApercuLancerMatch').addEventListener('click', () => {
    matchJoueEnDirect = false;
    document.getElementById('panneauApercuMatch').classList.remove('visible');
    document.getElementById('panneauClub').classList.remove('visible');
    resoudreJour('pro');
  });
  document.getElementById('btnApercuJouerMatch').addEventListener('click', () => {
    matchJoueEnDirect = true;
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
  // Retirer un joueur de la liste des transferts depuis l'écran Départs.
  document.getElementById('clubDeparts').addEventListener('click', (e) => {
    const btn = e.target.closest('.btnListeTransfert');
    if (!btn) return;
    const res = RMClub.basculerListeTransfert(saison, btn.dataset.joueur);
    if (!res.ok) return;
    sauvegarder();
    toast(`✅ ${res.joueur.nom} n'est plus en vente`);
    rafraichirDeparts();
  });
  document.getElementById('clubEncadrement').addEventListener('click', (e) => {
    const btn = e.target.closest('.btnSauteur');
    if (!btn) return;
    const ctx = contexte();
    if (!ctx.modifiable) return;
    const res = RMClub.basculerSauteur(saison, btn.dataset.joueur, ctx.type);
    if (!res.ok) return;
    sauvegarder();
    toast(res.designe ? '✅ Sauteur désigné pour la touche' : '✅ Sauteur retiré de l\'alignement');
    rafraichirEncadrement();
  });
  // Réseau de recrutement (G12) : délégation sur la carte entière — la liste
  // des zones est reconstruite à chaque rafraîchissement, un écouteur par
  // bouton serait perdu au premier rendu.
  document.getElementById('carteReseauScouting').addEventListener('click', (e) => {
    const btnZone = e.target.closest('.btnMissionScouting');
    if (btnZone) {
      const sel = document.getElementById('dureeMissionScouting');
      const jours = sel ? Number(sel.value) || 30 : 30;
      const res = RMClub.lancerMissionScouting(saison, btnZone.dataset.zone, jours);
      if (!res.ok) { toast(res.message || 'Mission impossible', 'erreur'); return; }
      sauvegarder();
      rafraichirMarche();
      rafraichirTopBarInfos();
      toast(`🌍 Recruteur envoyé pour ${res.duree} jour(s) — ${res.cout} k€ engagés`);
      return;
    }
    if (e.target.id === 'btnRappelerRecruteur') {
      const res = RMClub.rappelerRecruteur(saison);
      if (!res.ok) return;
      sauvegarder();
      rafraichirMarche();
      toast(`↩️ Recruteur rappelé après ${res.joursEffectues} jour(s) — la mission n'est pas remboursée`);
    }
  });
  document.getElementById('dureeMissionScouting').addEventListener('change', rafraichirReseauScouting);

  document.getElementById('btnRafraichirMarche').addEventListener('click', () => {
    // TODO_AUDIT.md P1-43b : prospecter reste possible, mais plus en boucle.
    // Sans délai, perdre une cible au profit d'un rival se rattrapait d'un
    // clic — la concurrence n'aurait alors eu aucune conséquence réelle.
    const res = RMClub.rafraichirMarcheManuel(saison);
    if (!res.ok) {
      toast(`🔍 Tes recruteurs sont déjà sur le terrain — nouvelle prospection dans ${res.jours} jour(s)`, 'erreur');
      return;
    }
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
      // Rapport DIFFÉRÉ (TODO_AUDIT.md P1-23) : le recruteur part observer le
      // joueur et rend son rapport quelques jours plus tard. Le budget est
      // engagé tout de suite, la connaissance n'augmente qu'à la remise.
      const res = RMClub.commanderRapportScouting(saison, id, RMClub.effetPersonnel(saison, 'recruteur'));
      if (!res.ok) {
        toast(res.motif === 'deja_commande'
          ? 'Un rapport est déjà en cours sur ce joueur.'
          : 'Budget insuffisant pour financer ce repérage.', 'erreur');
        return;
      }
      sauvegarder();
      toast(`🔍 Recruteur envoyé — rapport attendu le ${RMClub.formaterDateCourte(res.dateRemise)} (${res.cout} k€)`);
      rafraichirMarche();
      rafraichirTopBarInfos();
      return;
    }
    if (!e.target.classList.contains('btnSigner')) return;
    const joueurSigne = pool.find((j) => j.id === id);
    const res = RMClub.signerJoueur(saison, id);
    if (!res.ok) {
      if (res.motif === 'fenetre_fermee') {
        toast(res.fenetre.ouvre
          ? `Marché fermé : les signatures rouvrent le ${RMClub.formaterDateCourte(res.fenetre.ouvre)}.`
          : 'Marché fermé : plus de fenêtre de transfert cette saison.', 'erreur');
      } else {
        toast('Budget insuffisant pour cette signature.', 'erreur');
      }
      return;
    }
    selectionComparaison.delete(id);
    sauvegarder();
    toast(`✅ ${joueurSigne ? joueurSigne.nom : 'Joueur'} rejoint le club (${res.coutTotal} k€)`);
    rafraichirMarche();
    rafraichirEffectif();
    rafraichirTopBarInfos();
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
  // Semaine d'entraînement : le programme est celui du CLUB (un seul staff
  // pour ses 3 équipes), modifiable jusqu'au début de la journée concernée.
  document.getElementById('clubSemaineEntrainement').addEventListener('change', (e) => {
    const jour = e.target.dataset.jour;
    const ctx = contexte();
    if (jour == null || !ctx.modifiable) return;
    RMClub.definirSeance(saison, Number(jour), e.target.value);
    sauvegarder();
    const a = RMClub.ACTIVITES_ENTRAINEMENT[e.target.value];
    toast(`✅ ${RMClub.NOMS_JOURS[Number(jour)]} : ${a.icone} ${a.label}`);
    rafraichirSemaineEntrainement();
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
    for (const id of ['btnJouerMatchClub', 'btnJourSuivant', 'btnApercuMatchFlottant', 'btnApercuLancerMatch']) {
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
  // Sans ce rappel, fermer l'écran de résultat laissait le joueur sur un écran
  // VIDE : le panneau du club avait été masqué au coup d'envoi et personne ne
  // le remontrait. Les trois matchs joués avec le moteur complet (championnat,
  // coupe, amical) partagent exactement le même retour.
  function revenirAuPanneauClub() {
    rafraichirTout();
    document.getElementById('panneauClub').classList.add('visible');
  }

  // Inscription : un joueur non inscrit à la compétition ne peut pas être
  // aligné. On le dit AVANT le coup d'envoi, en nommant les joueurs — jamais
  // un refus muet. Renvoie true si la rencontre peut se jouer.
  function verifierInscriptions(refCompetition, composition) {
    if (!RMClub.joueursNonInscrits) return true;
    const manquants = RMClub.joueursNonInscrits(saison, refCompetition, composition);
    if (!manquants.length) return true;
    const noms = manquants.map((m) => m.nom).join(', ');
    toast(`Composition impossible : ${noms} ${manquants.length > 1 ? 'ne sont pas inscrits' : "n'est pas inscrit"} à cette compétition.`, 'erreur');
    return false;
  }

  // Le club ne peut pas aligner l'équipe que cette coupe réclame : la
  // rencontre se résout sans lui plutôt que de bloquer la journée
  // (cf. RMClub.resoudreCoupeSansEquipe).
  function forfaitCoupe(info, adversaire, date) {
    const r = RMClub.resoudreCoupeSansEquipe(saison, {
      coupe: info.coupe, rencontre: info.rencontre, adversaire, date,
      rng: creerRng(graineDuJour('coupeForfait')),
      rngCoupes: creerRng(graineDuJour('coupes')),
    });
    toast(r.message, 'erreur');
    sauvegarder();
    rafraichirTout();
  }

  // --- Match amical : joué à SA date, avec le moteur complet, exactement
  // comme un match officiel (TODO_AUDIT.md P1-32). Ses conséquences sont
  // réelles — fatigue, blessures, temps de jeu, moral — mais il ne rapporte
  // AUCUN point au championnat et n'entre dans aucun classement.
  // --- Match de coupe (TODO_AUDIT.md P1-34) : joué à la date de son tour,
  // avec le moteur complet. Un seul résultat possible — il n'y a pas de nul
  // en élimination directe : gagner ou sortir. Les autres rencontres du même
  // tour sont résolues de façon abstraite, comme partout ailleurs.
  function resoudreCoupeDuJour() {
    if (journeeEnCours) return;
    const date = RMClub.dateCourante(saison);
    const info = RMClub.rencontreCoupeDuJoueur(saison, date);
    if (!info) return;
    const adversaireId = info.rencontre.domicileId === saison.clubJoueur.id
      ? info.rencontre.exterieurId : info.rencontre.domicileId;
    const adversaire = RMClub.clubPartout(saison, adversaireId)
      || info.coupe.clubs.find((c) => c.id === adversaireId);
    if (!adversaire) return;
    // Une coupe se dispute avec l'équipe à laquelle elle s'adresse : la Coupe
    // des Espoirs oppose des ACADÉMIES, elle ne se joue donc pas avec le
    // premier XV (cf. RMClub.equipePourCoupe).
    const equipe = RMClub.equipePourCoupe(info.cle);
    if (equipe === 'pro') assurerComposition();
    const slot = RMClub.assurerCompositionPourEquipe(saison, equipe);
    const effectifEnLice = RMClub.effectifPourEquipe(saison, equipe);
    if (RMClub.validerComposition(slot.compositionTitulaires).length > 0) {
      // Sans XV alignable, le tableau ne doit pas rester bloqué : la rencontre
      // se résout comme les autres du tour, et le manager est prévenu.
      if (equipe !== 'pro') {
        forfaitCoupe(info, adversaire, date);
        return;
      }
      toast('Impossible de disputer ce match de coupe : ta composition est incomplète.', 'erreur');
      return;
    }
    if (!verifierInscriptions('coupe:' + info.cle, slot.compositionTitulaires)) return;
    journeeEnCours = true;
    definirBoutonsJourneeActifs(false);
    const duree = Number(document.getElementById('selDureeClub').value) || 4800;
    document.getElementById('panneauClub').classList.remove('visible');
    const c = saison.clubJoueur;
    const compositionUtilisee = Object.assign({}, slot.compositionTitulaires);
    const nomAffiche = equipe === 'jeunes' ? `${c.nom} (espoirs)`
      : equipe === 'b' ? `${c.nom} (B)` : c.nom;
    const domicileEstJoueur = info.rencontre.domicileId === c.id;
    const lettre = domicileEstJoueur ? 'A' : 'B';
    const tactiqueCfg = construireTactiqueCfg(effectifEnLice, slot, lettre);
    // L'adversaire peut être un club sans effectif simulé (autre palier,
    // club étranger, académie) : on dérive alors un XV de son NIVEAU réel,
    // jamais un effectif inventé et conservé.
    const cfgAdverse = RMClub.aUnEffectifSimule(adversaire)
      ? RMClub.effectifVersJoueursCfg(adversaire)
      : RMClub.effectifVersJoueursCfg({
        effectif: RMClub.genererEffectif(creerRng(graineAleatoire()), adversaire.niveauClub || 0.5),
      });
    const cfgJoueur = RMClub.compositionVersJoueursCfg(effectifEnLice, compositionUtilisee);
    window.RMMain.demarrerMatchClub(
      graineAleatoire(), duree,
      domicileEstJoueur ? cfgJoueur : cfgAdverse,
      domicileEstJoueur ? cfgAdverse : cfgJoueur,
      tactiqueCfg,
      {
        // Le nom affiché au tableau d'affichage doit dire QUI joue : sans ça,
        // une demi-finale d'espoirs s'annonçait sous le nom du club, comme un
        // match de l'équipe première.
        noms: domicileEstJoueur ? { A: nomAffiche, B: adversaire.nom } : { A: adversaire.nom, B: nomAffiche },
        equipeJoueur: lettre,
        onResultat(etat) {
          // Toute la règle métier vit dans club-coupes.js : résultat, reste du
          // tour, fatigue, moral, statistiques, message. L'interface ne garde
          // que ce qui la concerne — sauvegarde, verrou et rafraîchissement.
          RMClub.appliquerConsequencesMatchCoupe(saison, {
            coupe: info.coupe, rencontre: info.rencontre, adversaire, date, etat,
            lettreJoueur: lettre, compositionUtilisee, equipe,
            rng: creerRng(graineAleatoire()),
            rngCoupes: creerRng(graineDuJour('coupes')),
          });
          sauvegarder();
          journeeEnCours = false;
          definirBoutonsJourneeActifs(true);
          rafraichirTout();
        },
        onFermer: revenirAuPanneauClub,
      }
    );
  }

  function resoudreAmicalDuJour() {
    const amical = RMClub.amicalDuJour(saison, RMClub.dateCourante(saison));
    if (!amical || journeeEnCours) return;
    const adversaire = RMClub.club(saison, amical.adversaireId);
    if (!adversaire) { RMClub.annulerAmical(saison, amical.id); sauvegarder(); return; }
    assurerComposition();
    const manquants = RMClub.validerComposition(saison.clubJoueur.compositionTitulaires);
    if (manquants.length > 0) {
      toast('Impossible de disputer ce match amical : ta composition est incomplète.', 'erreur');
      return;
    }
    journeeEnCours = true;
    definirBoutonsJourneeActifs(false);
    const duree = Number(document.getElementById('selDureeClub').value) || 4800;
    document.getElementById('panneauClub').classList.remove('visible');
    const c = saison.clubJoueur;
    const slot = RMClub.slotCompositionPourEquipe(saison, 'pro');
    const tactiqueCfg = construireTactiqueCfg(c.effectif, slot, 'A');
    const compositionUtilisee = Object.assign({}, c.compositionTitulaires);
    window.RMMain.demarrerMatchClub(
      graineAleatoire(), duree,
      RMClub.compositionVersJoueursCfg(c.effectif, compositionUtilisee),
      RMClub.effectifVersJoueursCfg(adversaire),
      tactiqueCfg,
      {
        noms: { A: c.nom, B: adversaire.nom },
        equipeJoueur: 'A',
        onResultat(etat) {
          // Toute la règle métier vit dans club-amicaux.js.
          RMClub.appliquerConsequencesMatchAmical(saison, {
            amical, adversaire, etat, compositionUtilisee,
            rng: creerRng(graineAleatoire()),
            rngAdverse: creerRng(graineAleatoire()),
          });
          sauvegarder();
          journeeEnCours = false;
          definirBoutonsJourneeActifs(true);
          rafraichirTout();
        },
        onFermer: revenirAuPanneauClub,
      }
    );
  }

  function resoudreJour(typeJour) {
    // Verrou anti-double-action : voir le commentaire sur `journeeEnCours`
    // plus haut. Bloque toute ré-entrée tant que le jour précédent n'est
    // pas résolu (le callback de fin, plus bas, relâche le verrou).
    if (journeeEnCours) return;
    // Le jour d'une journée de CHAMPIONNAT, ce sont les rencontres DATÉES
    // d'aujourd'hui qui se jouent, pas « celles de la prochaine journée »
    // (TODO_AUDIT.md P1-27) : c'est la date qui décide, une journée sautée ne
    // se rejoue pas un autre jour.
    //
    // Les jours d'Équipe B (dimanche) et d'espoirs (mercredi) n'ont AUCUNE
    // rencontre de championnat à leur date : ces deux compétitions se
    // rattachent à la journée de championnat À VENIR (l'adversaire des
    // espoirs en est déduit, cf. simulerMatchEspoirs), donc elles gardent
    // `prochainesFixtures` comme contexte de journée. Leurs propres
    // rencontres sont, elles, choisies par leur propre calendrier
    // (prochaineRondeEquipeB / journeeDeMatchEspoirs).
    // Un match AMICAL (TODO_AUDIT.md P1-32) ne dépend d'aucune journée de
    // championnat : il a sa propre date et son propre adversaire. Il est donc
    // résolu par son propre chemin, plus bas.
    if (typeJour === 'amical') { resoudreAmicalDuJour(); return; }
    if (typeJour === 'coupe') { resoudreCoupeDuJour(); return; }
    const fixtures = typeJour === 'pro'
      ? RMClub.fixturesDuJour(saison, RMClub.dateCourante(saison))
      : RMClub.prochainesFixtures(saison);
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
      // Inscription à la compétition : un joueur non inscrit ne peut pas
      // jouer, quelle que soit sa forme.
      if (!verifierInscriptions(RMClub.REF_COMPETITION_JOUEUR,
        saison.clubJoueur.compositionTitulaires)) return;
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
      // Les clubs adverses subissent RÉELLEMENT leur journée (TODO_AUDIT.md
      // P1-29) : fatigue des joueurs alignés, blessures tirées sur leurs
      // titulaires, puis rotation de leur XV pour la journée suivante. Sans
      // ça, ils alignaient les mêmes quinze hommes, jamais fatigués, toute
      // la saison — pendant que le joueur gère 24 hommes et leurs
      // contraintes.
      const rngAdverses = creerRng(graineDuJour('adversaires'));
      for (const adverse of saison.adversaires) {
        if (!RMClub.aUnEffectifSimule(adverse)) continue;
        const slotAdv = RMClub.slotAdverse(adverse, RMClub.effectifAdverseNormalise(adverse));
        RMClub.appliquerEffetsMatchAdverse(saison, adverse, slotAdv, rngAdverses);
      }
      RMClub.rotationClubsAdverses(saison);
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
          // Match JOUÉ (P0-match) : rien n'est calculé d'avance, onResultat
          // n'arrive qu'au coup de sifflet final.
          live: matchJoueEnDirect,
          // Le banc RÉEL du joueur, proposé à la mi-temps. Mêmes objets que
          // les remplacements planifiés (remplacementsVersConfig) : aucune
          // seconde source, et le remplaçant entre avec ses vrais attributs,
          // fatigue et moral compris.
          remplacants: remplacements.map((r) => {
            const j = saison.clubJoueur.effectif.find((x) => x.id === r.joueurId);
            return {
              nom: j ? j.nom : 'Remplaçant', poste: j ? j.poste : '',
              numeroSortant: r.numero, numeroBanc: r.numeroBanc,
              joueurId: r.joueurId, joueur: r.joueur,
            };
          }),
          onResultat(etat) {
            // Toutes les conséquences métier d'un match du club vivent dans
            // club-jour-match.js (`appliquerConsequencesMatchJoueur`) : ordre
            // des opérations, finances, statistiques, fatigue, moral,
            // promesses de statut. L'interface ne garde que ce qui la
            // regarde — annoncer, relâcher le verrou, sauvegarder.
            const compositionAvecRemplacants = Object.assign({}, compositionUtilisee);
            for (const r of remplacements) {
              if (r.minute * 60 <= duree) compositionAvecRemplacants[r.numeroBanc] = r.joueurId;
            }
            const suite = RMClub.appliquerConsequencesMatchJoueur(saison, {
              fixture: matchJoueur, etat, lettreJoueur,
              forme: formeApres(matchJoueur, etat.score.A, etat.score.B),
              compositionUtilisee, compositionAvecRemplacants,
              // Noms réels des deux camps : la feuille de match archivée doit
              // pouvoir se relire sans le contexte du jour du match.
              nomA: clubDomicile.nom, nomB: clubExterieur.nom,
              rng: creerRng(graineAleatoire()),
            });
            const suiteUltimatum = suite.ultimatum;
            if (suiteUltimatum) {
              if (suiteUltimatum.issue === 'reussi') {
                toast('🏛️ Ultimatum levé — la direction te renouvelle sa confiance', 'succes');
              } else if (suiteUltimatum.issue === 'echoue') {
                toast('🏛️ La direction met fin à ta mission', 'erreur');
              } else {
                toast(`⏳ Ultimatum : ${suiteUltimatum.ultimatum.matchsRestants} match(s) restant(s)`, 'erreur');
              }
            }
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
          onFermer: revenirAuPanneauClub,
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
    // Les autres rencontres de la journée (G18) : la règle vit dans
    // club-effectif-adverse.js, pas ici. Le résultat dépend du groupe
    // réellement disponible de chaque club, et le match LAISSE UNE TRACE —
    // fatigue, blessures, temps de jeu. Mesuré avant : 156 matchs IA par
    // saison ne touchaient aucun des 312 joueurs concernés.
    function simulerAutresMatchsAbstrait() {
      const rng = creerRng(graineAleatoire());
      if (RMClub.resoudreMatchsAdverses) {
        RMClub.resoudreMatchsAdverses(rng, saison, autresMatchs);
      } else {
        for (const f of autresMatchs) {
          const clubA = RMClub.club(saison, f.domicileId);
          const clubB = RMClub.club(saison, f.exterieurId);
          const r = RMWorld.simulerResultatAbstrait(rng, clubA.niveauClub, clubB.niveauClub);
          RMClub.enregistrerResultat(saison, f.id, r.scoreA, r.scoreB, r.essaisA, r.essaisB);
        }
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
          // Statistiques individuelles de l'Équipe B (TODO_AUDIT.md P1-30) :
          // jusqu'ici un joueur pouvait disputer toute la saison avec la
          // réserve sans qu'AUCUN chiffre ne soit enregistré à son nom. Le
          // vivier de l'Équipe B mêle réservistes pro et espoirs : on
          // alimente les deux effectifs, chacun ne retenant que les siens.
          const lettreB = f.domicileId === saison.clubJoueur.id ? 'A' : 'B';
          const statsB = etat.statsJoueurs && etat.statsJoueurs[lettreB];
          RMClub.accumulerStatsJoueurs(saison.clubJoueur.effectif, compositionJoueur, statsB, 'b');
          RMClub.accumulerStatsJoueurs(saison.clubJoueur.jeunes || [], compositionJoueur, statsB, 'b');
          // Fatigue et blessures RÉELLES (TODO_AUDIT.md P1-40) : jusqu'ici un
          // match d'Équipe B n'en produisait AUCUNE, donc un joueur pouvait
          // enchaîner toute la saison avec la réserve sans jamais s'user ni
          // se blesser. Le vivier mêle réservistes pro et espoirs : les deux
          // effectifs passent par le même point d'entrée, chacun ne retenant
          // que les siens (la composition ne cite que les joueurs alignés).
          RMClub.appliquerEffetsMatch(saison, saison.clubJoueur.effectif, compositionJoueur,
            creerRng(graineAleatoire()), { equipe: 'b' });
          RMClub.appliquerEffetsMatch(saison, saison.clubJoueur.jeunes || [], compositionJoueur,
            creerRng(graineAleatoire()), { equipe: 'b' });
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
      // Rencontre du club du joueur dans SON championnat espoirs, à SA date
      // (TODO_AUDIT.md P1-31) — plus un match ponctuel déduit du calendrier
      // pro contre une académie jetable.
      const evenements = RMClub.evenementsDuJour(saison, RMClub.dateCourante(saison));
      const fixtureEspoirs = evenements.fixtureEspoirs;
      if (!fixtureEspoirs || !RMClub.eligiblePourMatchEspoirs(saison)) {
        suite();
        return;
      }
      // Les autres rencontres de la même journée sont résolues de façon
      // ABSTRAITE (même principe que l'Équipe B et le championnat principal) :
      // le classement du championnat espoirs vit réellement, sans payer le
      // coût du moteur complet pour des matchs que le joueur ne voit pas.
      const compEspoirs = RMClub.assurerCompetitionEspoirs(saison);
      const parIdAcademie = {};
      for (const cl of compEspoirs.clubs) parIdAcademie[cl.id] = cl;
      const rngAutres = creerRng(graineDuJour('espoirsAutres'));
      for (const f of compEspoirs.calendrier) {
        if (f.joue || f.journee !== fixtureEspoirs.journee || f === fixtureEspoirs) continue;
        const a = parIdAcademie[f.domicileId], bClub = parIdAcademie[f.exterieurId];
        if (!a || !bClub) continue;
        const r = RMWorld.simulerResultatAbstrait(rngAutres, a.niveauClub, bClub.niveauClub);
        RMClub.enregistrerResultatEspoirs(saison, f.id, r.scoreA, r.scoreB, r.essaisA, r.essaisB);
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
      // L'adversaire est l'ACADÉMIE réellement programmée ce jour-là par le
      // calendrier du championnat espoirs — un club qui revient d'une saison
      // à l'autre, avec son propre niveau.
      const idAcademieAdverse = fixtureEspoirs.domicileId === saison.clubJoueur.id
        ? fixtureEspoirs.exterieurId : fixtureEspoirs.domicileId;
      const clubAdverse = parIdAcademie[idAcademieAdverse] || { nom: 'Académie', niveauClub: 0.2 };
      const cfgJoueur = RMClub.compositionVersJoueursCfg(effectifEspoirs, compositionEspoirs);
      const cfgAdverse = RMClub.effectifVersJoueursCfg({ effectif: RMClub.genererEffectif(rng, clubAdverse.niveauClub) });
      window.RMMain.simulerMatchEnArrierePlan(
        graineAleatoire(), duree,
        cfgJoueur, cfgAdverse,
        `Espoirs : ${saison.clubJoueur.nom} vs ${clubAdverse.nom}`,
        (etat) => {
          RMClub.appliquerEffetsMatchEspoirs(saison, compositionEspoirs, creerRng(graineAleatoire()));
          // Idem pour les espoirs (TODO_AUDIT.md P1-30) : le club du joueur
          // est toujours l'équipe A dans un match d'académie (cf. cfgJoueur
          // passé en premier).
          RMClub.accumulerStatsJoueurs(saison.clubJoueur.jeunes || [], compositionEspoirs,
            etat.statsJoueurs && etat.statsJoueurs.A, 'jeunes');
          // Résultat ARCHIVÉ (TODO_AUDIT.md P1-19) : jusqu'ici il ne vivait
          // que dans un message de la boîte de réception, donc l'écran
          // Calendrier & classement n'avait rien à montrer pour les espoirs.
          // Le score enregistré est celui réellement produit par le moteur.
          RMClub.enregistrerMatchEspoirs(saison, fixtureEspoirs.journeeChampionnat, clubAdverse.nom, etat.score.A, etat.score.B);
          const forme = etat.score.A > etat.score.B ? 'v' : etat.score.A < etat.score.B ? 'd' : 'n';
          const verbe = forme === 'v' ? 'battent' : forme === 'd' ? "s'inclinent face à" : 'font match nul avec';
          RMClub.ajouterMessage(saison, 'jeunes', 'Match espoirs',
            `Tes espoirs ${verbe} ${clubAdverse.nom} (${etat.score.A} - ${etat.score.B}).`);
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
    for (const r of resume.rapports || []) {
      toast(`🔍 Rapport de scouting : ${r.nom} (connaissance ${r.connaissance} %)`);
    }
    for (const m of resume.missionsReseau || []) {
      toast(`🌍 Ton recruteur rentre de ${m.nomZone} avec ${m.joueurs.length} profil(s)`);
    }
    for (const r of resume.reponsesContrat || []) {
      toast(r.accepte
        ? `📄 ${r.nom} accepte ta proposition (${r.salaire} k€/saison)`
        : `📄 ${r.nom} décline ta proposition`, r.accepte ? 'succes' : 'erreur');
    }
    if (resume.pointEtape) {
      toast(`🏛️ Point d'étape de la direction — confiance ${resume.pointEtape.confiance} %`,
        resume.pointEtape.reussi ? 'succes' : 'erreur');
    }
    // Cible perdue au profit d'un rival (TODO_AUDIT.md P1-43b) : on ne le
    // signale que pour un joueur RÉELLEMENT suivi (un message a été produit),
    // sinon chaque signature d'un rival deviendrait une notification de plus.
    for (const sig of resume.signaturesRivales || []) {
      toast(`🤝 ${sig.joueurNom} signe à ${sig.clubNom} (${sig.montant} k€) — tu le suivais`, 'erreur');
    }
    if (resume.reunionVestiaire) {
      toast(`💬 Le vestiaire va mal (moral ${resume.reunionVestiaire.moral} %) — une décision t'attend`, 'erreur');
    }
    for (const libelle of resume.decisionsExpirees || []) {
      toast(`⏳ ${libelle} — sans réponse de ta part`, 'erreur');
    }
    // Blessure survenue À L'ENTRAÎNEMENT (TODO_AUDIT.md P1-26) : le manager
    // doit l'apprendre au moment où elle arrive, pas la découvrir en ouvrant
    // sa composition la veille du match.
    for (const b of resume.blessures || []) {
      toast(`🤕 ${b.nom} s'est blessé à l'entraînement — ${b.jours} jour(s)`, 'erreur');
    }
  }

  // Après une avance de plusieurs jours : rafraîchit tout ce que la date
  // influence. Factorisé pour que « Jour suivant » et « Continuer » montrent
  // exactement le même état — aucune différence de traitement entre les deux.
  function rafraichirApresAvance(resume) {
    // Listes d'inscription : complétées à chaque jour écoulé tant que la
    // fenêtre est ouverte, pour qu'une recrue arrivée avant la date limite
    // soit inscrite d'office. Après la limite, cet appel ne change plus rien
    // — et c'est précisément ce qui donne du poids au choix (club-inscriptions.js).
    if (RMClub.assurerInscriptions) RMClub.assurerInscriptions(saison);
    sauvegarder();
    rafraichirTopBarInfos();
    rafraichirProchainMatch();
    rafraichirPreparationMatch();
    rafraichirAgenda();
    rafraichirFenetreTransfert();
    rafraichirMessages();
    rafraichirVueClub();
    // Le marché change TOUS LES JOURS (arrivées, signatures rivales, retour
    // de mission du recruteur) : sans ce rafraîchissement, l'écran
    // Recrutement restait figé sur l'état du chargement — mesuré avec le
    // réseau de recrutement (G12), dont les joueurs ramenés n'apparaissaient
    // qu'après un rechargement complet de la page.
    rafraichirMarche();
    annoncerJoursEcoules(resume);
  }

  // --- « Jour suivant » (TODO_AUDIT.md P1-26) : avance d'EXACTEMENT un jour.
  // Sert à suivre une semaine d'entraînement pas à pas, à voir la fatigue
  // redescendre, à attendre un retour de blessure. Ne joue jamais un match :
  // arriver le jour d'une rencontre ouvre sa préparation, comme « Continuer ».
  function jourSuivant() {
    if (journeeEnCours) return;
    if (!verrouillerAvance()) return;
    if (!RMClub.prochainArret(saison)) {
      document.getElementById('btnSaisonSuivante').click();
      return;
    }
    const r = RMClub.avancerUnJour(saison);
    const resume = RMClub.resumerJournees([r.journee]);
    rafraichirApresAvance(resume);
    const type = RMClub.typeDArret(saison, RMClub.dateCourante(saison));
    toast(`📅 ${RMClub.formaterDateLongue(RMClub.dateCourante(saison))}`);
    if (type === 'pro') { ouvrirApercuMatch(); return; }
    if (type) {
      // Match Équipe B ou espoirs : résolu en arrière-plan, comme depuis
      // toujours — mais seulement le jour venu.
      document.getElementById('panneauClub').classList.remove('visible');
      resoudreJour(type);
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
    if (!RMClub.prochainArret(saison)) {
      // Plus aucune rencontre : la saison sportive est terminée.
      document.getElementById('btnSaisonSuivante').click();
      return;
    }
    // Déjà sur un jour de match : on ne fait que rouvrir sa préparation —
    // AUCUNE avance, donc aucun verrou. Rouvrir l'aperçu après l'avoir
    // fermé (Échap, aller-retour composition/tactique) doit rester
    // instantané ; le verrou ne protège que ce qui fait passer des jours.
    const typeAujourdhui = RMClub.typeDArret(saison, RMClub.dateCourante(saison));
    if (typeAujourdhui) {
      if (typeAujourdhui === 'pro') { ouvrirApercuMatch(); return; }
      document.getElementById('panneauClub').classList.remove('visible');
      resoudreJour(typeAujourdhui);
      return;
    }
    if (!verrouillerAvance()) return;
    // Avance jour par jour, mais S'ARRÊTE dès qu'il se passe quelque chose
    // (TODO_AUDIT.md P1-26) : blessure, réponse à une proposition de contrat,
    // rapport de repérage, décision à trancher, événement de direction. Sans
    // ça, une blessure et une décision pouvaient survenir puis passer
    // inaperçues au milieu d'une avance de trois semaines.
    const r = RMClub.avancerJusquAuProchainMatch(saison);
    const resume = RMClub.resumerJournees(r.journees);
    rafraichirApresAvance(resume);

    if (r.raison === 'saison') { document.getElementById('btnSaisonSuivante').click(); return; }
    if (r.raison !== 'match') {
      // Arrêt AVANT le match : on dit pourquoi, et combien de jours restent.
      // La CAUSE vient déjà d'être annoncée en détail par
      // annoncerJoursEcoules (blessure, rapport, réponse de contrat…) : ce
      // message-ci dit seulement que l'avance s'est arrêtée et ce qu'il reste
      // à parcourir, sans répéter mot pour mot le message précédent.
      const reste = r.arret ? r.arret.joursRestants : null;
      const combien = r.interruptions.length > 1 ? ` (${r.interruptions.length} événements)` : '';
      toast(`⏸️ Avance interrompue${combien}${reste != null ? ` — encore ${reste} jour(s) avant le match` : ''}`, 'erreur');
      return;
    }
    const type = RMClub.typeDArret(saison, RMClub.dateCourante(saison));
    if (type === 'pro') { ouvrirApercuMatch(); return; }
    document.getElementById('panneauClub').classList.remove('visible');
    resoudreJour(type || 'pro');
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
        remplacementsPrevus.map((r) => `${ligneInfo(`${r.joueur.nom} (n°${r.numero})`, `${r.minute}e minute`)}`).join('') +
        `</div>`
      : '';

    const tactiqueActuelle = (c.tactique && typeof c.tactique === 'object') ? c.tactique : {};
    const tactiqueLignes = Object.keys(RMClub.AXES_TACTIQUE).map((axe) => {
      const info = RMClub.AXES_TACTIQUE[axe];
      const valeur = tactiqueActuelle[axe] || info.defaut;
      const option = info.options[valeur];
      return `${ligneInfo(`${info.label}`, `${option ? option.nom : valeur}`)}`;
    }).join('');

    const puces = [
      ...analyse.forces.map((cc) => `<span class="puceQualitatif force">⚠️ Leur ${cc.label.toLowerCase()} (+${cc.diff})</span>`),
      ...analyse.faiblesses.map((cc) => `<span class="puceQualitatif faiblesse">✓ Leur ${cc.label.toLowerCase()} (${cc.diff})</span>`),
    ].join('');

    // Recommandation tactique (TODO_AUDIT.md P1-16) : relie enfin l'analyse
    // ci-dessus à un vrai réglage actionnable des 7 axes tactiques, plutôt
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
      `${ligneInfo(`Ma forme`, `${formeTxt(maForme)}`)}` +
      `${ligneInfo(`Leur forme`, `${formeTxt(analyse.forme)}`)}</div>` +
      `<div class="carteClub"><h3>📋 Ma composition</h3>` +
      `${ligneInfo(`Capitaine`, `${capitaine ? capitaine.nom : '—'}`)}` +
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
