// Moteur de simulation de match, en JavaScript pur (aucune dépendance DOM).
// Même fichier utilisé côté serveur (Node, via require) et côté client
// (navigateur, via <script src="...">) grâce à l'enveloppe UMD ci-dessous.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.RugbyEngine = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const LONGUEUR = 100; // m, en-but à en-but

  // Facteur de rattrapage du jeu au pied, cf. son unique usage dans
  // choisirActionPorteur : les taux de base ont ete balayes a 0,2 s, le jeu
  // tourne a 0,1 s.
  // RYTHME DES PASSES « par seconde » (ligne, avant contact, jeu au large).
  // Le moteur passait 45 % de trop par minute de jeu (14,4 contre 9,9 dans le
  // match réel de référence, P2-45) ; retirer ces passes seules faisait
  // exploser les essais, car la circulation latérale freinait une attaque trop
  // productive. Avec la défense de face qui monte et la défense lancée après
  // un coup de pied (P2-49), et les offloads rendus au contact, le frein n'est
  // plus nécessaire : passes 422 -> 386 (réel 347), courses 219 -> 255 (réel
  // 255), essais inchangés (7,2 -> 6,7 ; réel 7). Cf. TODO_AUDIT.md P2-52.
  // Facteur unique : les réglages tactiques (jeuLargeTaux) gardent leur effet
  // relatif.
  const RYTHME_PASSES = 0.7;
  // TEMPS DE VOL D'UN COUP DE PIED SELON SON TYPE. Tous les coups de pied
  // volaient a 16 m/s, plafonnes a 2,2 s : une chandelle de 15 m retombait
  // en 0,97 s, le chasseur le plus proche encore a 10,5 m — elle n'etait
  // jamais disputee (9 % regagnees). Or la chandelle (box kick du n°9,
  // up-and-under) se joue sur son TEMPS DE SUSPENSION, ~4 s, le temps que la
  // ligne de chasse arrive sous le ballon. Un long degagement reste ~3-4 s en
  // l'air, une touche directe ~2-3 s, un petit coup de pied a suivre ~1-1,5 s.
  // Cf. TODO_AUDIT.md P2-55.
  function dureeVolCoupDePied(type, dist) {
    if (type === 'CHANDELLE') return Math.max(3.6, Math.min(4.6, 3.2 + dist / 20));
    if (type === 'CHIP') return Math.max(1.0, Math.min(1.6, dist / 8));
    if (type === 'OCCUPATION') return Math.max(1.8, Math.min(3.0, dist / 11));
    return Math.max(1.8, Math.min(3.8, dist / 14)); // DEGAGEMENT, TOUCHE
  }
  const RECALAGE_PIED_PAS_REEL = 1.15;

  const LARGEUR = 70;   // m, touche à touche

  // --- RNG seedé (mulberry32) pour des matchs reproductibles ---
  function creerRng(seed) {
    let etat = seed >>> 0;
    return function alea() {
      etat |= 0; etat = (etat + 0x6D2B79F5) | 0;
      let t = Math.imul(etat ^ (etat >>> 15), 1 | etat);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  // Probabilité de réussite d'un coup de pied au but (transformation ou pénalité),
  // fonction de la distance perpendiculaire aux poteaux et de l'angle d'attaque :
  // un tir long ou très excentré est nettement moins fiable, conformément à la réalité.
  function probaReussiteTir(distanceM, offsetLateralM, adresse) {
    const distanceReelle = Math.hypot(distanceM, offsetLateralM);
    const angleDeg = Math.abs(Math.atan2(offsetLateralM, Math.max(distanceM, 0.01))) * 180 / Math.PI;
    // Taux de réussite calibrés sur les BUTEURS PROFESSIONNELS (cf. données
    // réelles transientlunatic/Rugby-Data : ~48,5 pts/match, dont une grande part
    // au pied). L'ancienne formule (base 0.97, dist/90, angle/110) donnait ~27 %
    // de réussite en moyenne — bien trop sévère : la sim marquait ~32 pts/match
    // au lieu de ~48. Un vrai buteur réussit ~90 % d'un tir central court, ~72 %
    // à 40 m dans l'axe, ~45 % d'une transformation grand large.
    const base = 1.05 - distanceReelle / 150 - angleDeg / 160;
    // Adresse au pied (0-100, cf. PROFILS/adresse) : calibrée autour de ~70
    // (buteur pro moyen, la base ci-dessus est déjà calée sur ce niveau), avec
    // un écart borné pour qu'un très bon buteur (90+) marque sensiblement plus
    // et qu'un avant peu habitué au tir (25) rate nettement plus, sans casser
    // la calibration issue de vraies données de match.
    const skill = typeof adresse === 'number' ? Math.max(-0.22, Math.min(0.1, (adresse - 70) * 0.004)) : 0;
    return Math.max(0.12, Math.min(0.97, base + skill));
  }

  // RECUL DU BUTEUR À LA TRANSFORMATION (P2-97). La loi laisse le buteur poser
  // son tee n'importe où sur la ligne parallèle à la touche qui passe par le
  // point de l'essai. Sur un essai excentré, reculer OUVRE l'angle : un vrai
  // buteur recule de 20-30 m depuis le bord. Le moteur posait toujours le tee
  // à 10 m : 49 % de réussite dès 10 m d'écart latéral, 56 % au total pour
  // ~75 % en réel. On prend la distance (10 à 40 m) qui maximise la réussite.
  function reculTransformation(offsetLateralM, adresse) {
    let meilleur = 10, pMax = -1;
    for (let d = 10; d <= 40; d++) {
      const p = probaReussiteTir(d, offsetLateralM, adresse);
      if (p > pMax + 1e-9) { pMax = p; meilleur = d; }
    }
    return meilleur;
  }

  // --- Profils d'attributs par numéro de maillot (1-15) ---
  // tendance : tendance de proximité au ballon (suiveur de jeu vs tenant de station).
  // adresse : précision au pied sur coup de but (0-100), cf. probaReussiteTir —
  // reflète qui, en match réel, prend les tirs (ouvreur/arrière/centre).
  // Attributs de profondeur (0-100, neutre 60 si absent d'une config) :
  // melee (technique de poussée, cf. forceMelee), touche (contestation de
  // lancer, cf. forceTouche), puissance (poussée au maul, cf. forceMaul),
  // endurance (gestion de fatigue, cf. Mode Club), passe (réussite de passe/
  // offload), jeuPied (portée en jeu courant, distincte de l'adresse au but),
  // decision (sécurité du ballon au contact), discipline (fréquence de fautes
  // de mêlée/maul, cf. facteurDiscipline).
  const PROFILS = {
    1: { vitesse: 45, plaquage: 70, tendance: 85, adresse: 25, melee: 80, touche: 15, puissance: 80, endurance: 55, passe: 25, jeuPied: 10, decision: 40, discipline: 45, label: 'P' },
    2: { vitesse: 48, plaquage: 70, tendance: 85, adresse: 25, melee: 85, touche: 55, puissance: 70, endurance: 60, passe: 35, jeuPied: 10, decision: 50, discipline: 50, label: 'T' },
    3: { vitesse: 45, plaquage: 70, tendance: 85, adresse: 25, melee: 80, touche: 15, puissance: 80, endurance: 55, passe: 25, jeuPied: 10, decision: 40, discipline: 45, label: 'P' },
    4: { vitesse: 50, plaquage: 65, tendance: 80, adresse: 20, melee: 65, touche: 75, puissance: 75, endurance: 60, passe: 30, jeuPied: 10, decision: 45, discipline: 50, label: '2L' },
    5: { vitesse: 50, plaquage: 65, tendance: 80, adresse: 20, melee: 65, touche: 80, puissance: 78, endurance: 60, passe: 30, jeuPied: 10, decision: 45, discipline: 50, label: '2L' },
    6: { vitesse: 60, plaquage: 75, tendance: 75, adresse: 25, melee: 45, touche: 55, puissance: 70, endurance: 70, passe: 45, jeuPied: 15, decision: 55, discipline: 55, label: '3L' },
    7: { vitesse: 62, plaquage: 78, tendance: 75, adresse: 25, melee: 40, touche: 45, puissance: 65, endurance: 75, passe: 50, jeuPied: 15, decision: 60, discipline: 55, label: '3L' },
    8: { vitesse: 60, plaquage: 72, tendance: 75, adresse: 30, melee: 55, touche: 60, puissance: 78, endurance: 70, passe: 50, jeuPied: 20, decision: 60, discipline: 55, label: '3L' },
    9: { vitesse: 65, plaquage: 55, tendance: 90, adresse: 45, melee: 20, touche: 15, puissance: 40, endurance: 75, passe: 85, jeuPied: 55, decision: 75, discipline: 60, label: 'DM' },
    10: { vitesse: 70, plaquage: 50, tendance: 55, adresse: 75, melee: 10, touche: 10, puissance: 35, endurance: 65, passe: 80, jeuPied: 85, decision: 80, discipline: 60, label: 'OV' },
    11: { vitesse: 90, plaquage: 45, tendance: 15, adresse: 35, melee: 5, touche: 10, puissance: 35, endurance: 70, passe: 50, jeuPied: 35, decision: 55, discipline: 55, label: 'AI' },
    12: { vitesse: 72, plaquage: 65, tendance: 45, adresse: 45, melee: 10, touche: 15, puissance: 60, endurance: 70, passe: 65, jeuPied: 45, decision: 65, discipline: 55, label: 'CE' },
    13: { vitesse: 74, plaquage: 60, tendance: 45, adresse: 45, melee: 10, touche: 15, puissance: 55, endurance: 70, passe: 65, jeuPied: 45, decision: 65, discipline: 55, label: 'CE' },
    14: { vitesse: 90, plaquage: 45, tendance: 15, adresse: 35, melee: 5, touche: 10, puissance: 35, endurance: 70, passe: 50, jeuPied: 35, decision: 55, discipline: 55, label: 'AI' },
    15: { vitesse: 80, plaquage: 50, tendance: 20, adresse: 65, melee: 5, touche: 20, puissance: 45, endurance: 65, passe: 60, jeuPied: 75, decision: 70, discipline: 55, label: 'AR' },
  };

  // Couloir latéral "au repos" par numéro de maillot : forme un vrai plan de
  // jeu (avants groupés au centre, 9/8 au cœur du ballon, 10 légèrement
  // excentré, centres écartés de part et d'autre, ailiers sur les couloirs,
  // arrière au centre en couverture) plutôt qu'une répartition linéaire par
  // numéro (qui plaçait à tort le n°1 et le n°15 près des touches).
  const COULOIR_BASE = {
    1: 26, 2: 32, 3: 38, 4: 24, 5: 42, 6: 20, 7: 48, 8: 35,
    9: 35, 10: 31, 11: 7, 12: 26, 13: 44, 14: 63, 15: 35,
  };

  // === Configuration paramétrable avant le match ============================
  // Toutes les valeurs réglables (caractéristiques des joueurs, combinaisons de
  // touche, sorties de mêlée, organisation attaque/défense) sont regroupées ici
  // sous forme d'objet simple. Le moteur lit CETTE config (this.cfg), pas des
  // constantes en dur : on peut donc la surcharger avant le match via
  // `new MatchEngine(seed, duree, config)` (cf. docs/rugby-config.json chargé par
  // l'interface). Les valeurs par défaut ci-dessous reproduisent exactement le
  // comportement historique.
  const DEFAULT_CONFIG = {
    // Caractéristiques de chaque joueur (par numéro de maillot) : poste, vitesse,
    // plaquage (proxy de puissance), tendance (proximité au ballon), couloir
    // latéral au repos (0-70). Dérivées des profils/couloirs historiques.
    // `joueurs` s'applique aux DEUX équipes si `joueursA`/`joueursB` ne sont pas
    // fournis (comportement historique inchangé) — utile pour le mode club
    // (deux effectifs différents, cf. constructeur MatchEngine) sans rien
    // casser des usages existants (démo, harnais serveur) qui ne passent qu'une
    // config partagée ou aucune config.
    joueurs: (() => {
      const j = {};
      for (let n = 1; n <= 15; n++) {
        j[n] = {
          poste: PROFILS[n].label,
          vitesse: PROFILS[n].vitesse,
          plaquage: PROFILS[n].plaquage,
          tendance: PROFILS[n].tendance,
          adresse: PROFILS[n].adresse,
          melee: PROFILS[n].melee,
          touche: PROFILS[n].touche,
          puissance: PROFILS[n].puissance,
          endurance: PROFILS[n].endurance,
          passe: PROFILS[n].passe,
          jeuPied: PROFILS[n].jeuPied,
          decision: PROFILS[n].decision,
          discipline: PROFILS[n].discipline,
          couloir: COULOIR_BASE[n],
        };
      }
      return j;
    })(),
    // Touche (loi 18) : qui lance, quels sauteurs sont dans les appels possibles,
    // espacement de l'alignement, recul du receveur (n°9), et probabilité de
    // former un maul (catch-and-drive) selon la zone.
    touche: {
      lanceur: 2,
      sauteurs: [4, 5, 6, 7, 8],
      espacementSauteurs: 1.4,
      reculReceveur: 4,
      offsideNonParticipants: 10,
      tauxMaul: { proche: 0.45, loin: 0.08 },
    },
    // Mêlée (loi 19) : recul réglementaire des trois-quarts, et probabilité que
    // le n°8 sorte le ballon au pied (pick-and-go) plutôt que le 9, selon la
    // domination de la poussée.
    melee: {
      reculTroisQuarts: 7.5,
      pickAndGoHuit: { dominant: 0.35, normal: 0.12 },
      // P2-64 : le 8 peut aussi ramasser à la base et PASSER (au 10 s'il est
      // derrière lui, sinon au 9) — troisième sortie, en plus du 9 et du 8 qui part.
      passeHuit: { dominant: 0.15, normal: 0.10 },
      // Qualité du ballon gagné sur introduction, lue sur le différentiel de
      // contestation. Les anciens seuils (25 / 8) étaient sous le 10e centile
      // de ce différentiel, qui vaut ~33 en médiane à packs égaux (avantage
      // d'introduction 18 + piliers + talonneur) : 92 % des mêlées étaient
      // annoncées « dominées ». Mesuré (10 matchs, 88 mêlées) : p10 26, p25 29,
      // p75 36, p90 42 -> ~10 % de dominées, ~10 % sous pression à packs égaux,
      // la grande majorité gagnée proprement ; un pack nettement plus fort
      // domine, lui, presque toujours.
      seuilsQualite: { dominant: 39, pression: 27 },
      // Probabilité qu'un lâcher du 9 soit jugé non droit (loi 19, coup franc).
      // Valait 0,18 en dur (repris de l'ancien taux par seconde) : ~1,7 coup
      // franc par match, 40 % des arrêts de mêlée, et une mêlée sur six coupée
      // au lâcher. Depuis les consignes d'arbitrage de 2018, l'introduction
      // vers son propre côté est tolérée : la faute n'est presque plus sifflée.
      introductionNonDroite: 0.04,
      // Consigne de poussée (P1-51), réglable par équipe via meleeA/meleeB :
      // 'dominer', 'equilibre' (défaut, comportement historique), 'sortirVite'.
      poussee: 'equilibre',
      // Séquence physique du ballon (P2-64), en secondes de jeu : le ballon
      // vole des mains du 9 au milieu du tunnel (introduction), roule sous le
      // pack jusqu'aux pieds du 8 (talonnage + acheminement, tiré entre min et
      // max selon la qualité du ballon), puis attend à la base que le 9 le
      // joue (sortie).
      durees: { introduction: 0.8, acheminementMin: 2.0, acheminementMax: 4.0, sortie: 1.0 },
    },
    // Organisation d'attaque : taux de jeu au large (écarter vers le centre en
    // espace) sous pression / au calme. Cadence ~1 passe/s max : un receveur
    // LANCÉ (cf. placement profond + élan) fait d'abord 3-5 foulées ballon en
    // main (~1 s, 5-6 m) avant de servir le suivant — à 2,5/s il lâchait le
    // ballon en ~0,4 s sans jamais manger sa piste d'élan, et la ligne reculait.
    attaque: {
      // Cadence relevée (1,4/1,0 -> 1,7/1,3) pour SOUTENIR LA CHAÎNE de passes
      // courtes le long de la ligne : mesuré, seulement 29 % des séquences
      // atteignaient 3 passes (le ballon n'était « jamais écarté ») — la
      // diagonale d'attaque donne la profondeur, la cadence fait circuler.
      // Cadence ABAISSEE (1,7/1,3 -> 0,7/0,55). Le moteur jouait 600 passes par
      // match, soit 3,02 par temps de jeu et 2,80 par course, la ou un vrai
      // match en compte ~1,6 et ~1,1 : le ballon etait relache dans la foulee,
      // personne ne le PORTAIT. Ce reglage avait ete tente plus tot et refuse —
      // il coutait alors des essais et faisait exploser les rucks, parce que
      // l'attaque n'avancait pas et que raccourcir la chaine revenait a mourir
      // sur place plus vite. Depuis que la ligne d'avantage est positive
      // (loi 15 appliquee au plaqueur) le meme reglage ne coute plus rien :
      // comparaison APPARIEE sur 80 matchs, passes 600 -> 510 (-89 +/- 15,
      // etabli), essais/points/gain de terrain inchanges dans le bruit.
      jeuLargeTaux: { pression: 0.7, calme: 0.55 },
      // Une équipe réelle botte toutes les ~3 courses (France-Irlande 2026 :
      // 78 coups de pied / 255 courses) — c'est le régulateur n°1 de la
      // longueur des possessions. Le x2 avait été retenu quand une possession
      // pouvait enchaîner dix temps de jeu sans jamais avancer (579 rucks par
      // match) : il fallait alors ce régulateur brutal. Maintenant que
      // l'attaque franchit la ligne d'avantage et qu'un franchissement paie,
      // les possessions se terminent d'elles-mêmes ; x2 sur-bottait (88 coups
      // de pied par match, réel 35-70). x1,5 ramène à ~67.
      tauxJeuAuPied: 1.5,
      // SORTIE DE REGROUPEMENT HORS DES 22 : part des sorties jouees AU PRES
      // (passe a plat du n°9 a un avant lance) la ou `jeuAuPresLigne` ci-dessous
      // ne s'applique pas encore. Meme principe — reglage d'equipe, pilotable
      // par attaqueA/attaqueB (Mode Club), module par l'effectif aligne
      // (profilJeuAuPres). Defaut 0,34, soit environ un tiers, le repere reel.
      // Valait 0,18 EN DUR, identique pour tous les clubs et toutes les zones.
      sortieAvant: 0.34,
      // JEU AU PRES DANS LES CINQ DERNIERS METRES : probabilité que le n°9
      // serve un avant lancé plutôt que d'envoyer le ballon à l'ouvreur. Ce
      // n'est PAS une constante de simulation mais un RÉGLAGE D'ÉQUIPE : deux
      // clubs ne jouent pas la même chose au même endroit du terrain, et le
      // Mode Club peut le piloter comme il pilote déjà le jeu au large ou le
      // jeu au pied. La valeur retenue est en outre modulée par l'effectif
      // RÉELLEMENT aligné (cf. profilJeuAuPres) : un pack puissant joue le
      // ballon porté, une ligne rapide écarte même à 3 m de la ligne.
      jeuAuPresLigne: 0.90,
    },
    // Organisation de défense : profondeur de couverture de l'arrière (n°15) en
    // jeu courant et à la mêlée, recul de la ligne au ruck. rampeMontee =
    // secondes de mise en route de la montée défensive à chaque temps de jeu
    // (la ligne se réorganise après chaque regroupement avant de monter à
    // pleine vitesse) ; 0 = montée immédiate. Calibré par balayage de
    // simulations face au France-Irlande 2026 (cf. docs/ANALYSE_MATCH_REEL.md).
    defense: {
      profondeurArriereJeu: 18,
      profondeurArriereMelee: 20,
      reculRuck: 3,
      // 6,5 s. Le réglage précédent (2,5 s) datait d'un moteur où les joueurs
      // atteignaient leur vitesse maximale instantanément : la ligne était déjà
      // relancée avant même que le ballon ne sorte. Avec l'inertie de course
      // (cf. ACCELERATION), une ligne qui se relève d'un regroupement, se
      // recompte et se réaligne met réellement plusieurs secondes à repartir à
      // pleine vitesse — et c'est ce temps qui donne au porteur lancé l'espace
      // de courir avant le contact.
      rampeMontee: 6.5,
    },
    // Profil des durées de recyclage de ruck : liste de paliers
    // [part, minimum(s), étendue(s)] — la part est la fraction des rucks tirée
    // dans ce palier, la durée = minimum + alea*étendue. Référence réelle
    // (France-Irlande 2026) : ~52-63 % des rucks en moins de 3 s, ~21-33 % en
    // 3-6 s, le reste au-delà. Calibré par balayage (cf. ANALYSE_MATCH_REEL.md).
    ruck: {
      // Profil RÉEL retenu par balayage : ~55 % des rucks en 1,5-3 s (ballon
      // rapide), ~33 % en 3-6 s, ~12 % en 6-8 s — exactement la distribution
      // mesurée au France-Irlande 2026 (52-63 % / 21-33 % / reste). Le profil
      // « éclair » précédent (70 % sous 1,6 s, 91 % sous 3 s) n'existe dans
      // aucun vrai match, même chez la France, l'équipe la plus rapide au monde
      // à ce poste. La transmission du 9 reste immédiate (0,2 s) une fois le
      // ballon sorti : c'est le regroupement qui respire, pas la passe.
      profil: [[0.55, 1.5, 1.5], [0.33, 3.0, 3.0], [0.12, 6.0, 2.0]],
    },
    // COMBINAISONS (playbook) : mouvements scriptés joués sur une sortie de
    // regroupement (mêlée / touche). Chaque combinaison est une SUITE D'ÉTAPES,
    // chaque étape = une passe d'un joueur (numéro) à un autre, avec un type de
    // ligne du RECEVEUR :
    //   - "droit"  : le receveur continue tout droit ;
    //   - "croise" : le receveur CHANGE de direction et croise en sens inverse
    //                (mouvement de "une-deux" croisé, ex. le 12 revient à
    //                l'intérieur derrière l'ouvreur) ;
    //   - "saute"  : passe sautée (on saute un joueur pour aller plus au large).
    // `proba` = probabilité qu'une combinaison soit jouée à la sortie (sinon jeu
    // libre) ; chaque combinaison a un `poids` pour le tirage pondéré.
    combinaisons: {
      proba: 0.5,
      // Listes PARTAGÉES (défaut pour les deux équipes). On peut aussi définir
      // un playbook propre à une équipe via une clé "A" / "B" (cf. exemple A
      // ci-dessous) : { A: { melee: [...], touche: [...] } }.
      melee: [
        {
          nom: '9-10-croise-12',
          poids: 1,
          etapes: [
            { action: 'passe', de: 9, vers: 10 },
            { action: 'passe', de: 10, vers: 12, ligne: 'croise' },
          ],
        },
        {
          nom: '9-10-large-13',
          poids: 1,
          etapes: [
            { action: 'passe', de: 9, vers: 10 },
            { action: 'passe', de: 10, vers: 12 },
            { action: 'passe', de: 12, vers: 13 },
          ],
        },
        {
          // Combinaison de ZONE : seulement dans les 22 m adverses. Le 10 tape une
          // chandelle par-dessus la défense (à récupérer par les chasseurs).
          nom: '9-10-chandelle-22',
          poids: 1,
          zone: ['OPP_22', 'CINQ_M'],
          etapes: [
            { action: 'passe', de: 9, vers: 10 },
            { action: 'pied', de: 10, type: 'CHANDELLE' },
          ],
        },
      ],
      touche: [
        {
          nom: '9-10-saute-13',
          poids: 1,
          etapes: [
            { action: 'passe', de: 9, vers: 10 },
            { action: 'passe', de: 10, vers: 13, ligne: 'saute' },
          ],
        },
        {
          // Boucle : le 10 donne au 12 qui repart à l'extérieur (le 10 boucle).
          nom: '9-10-boucle-12',
          poids: 1,
          etapes: [
            { action: 'passe', de: 9, vers: 10 },
            { action: 'passe', de: 10, vers: 12, ligne: 'boucle' },
          ],
        },
      ],
      // Playbook SPÉCIFIQUE à l'équipe A (exemple) : à la mêlée, A privilégie une
      // sortie 8->9->10->13 sautée. Si une clé d'équipe existe pour un type, elle
      // REMPLACE la liste partagée pour cette équipe.
      A: {
        melee: [
          {
            nom: 'A-9-10-saute-13',
            poids: 1,
            etapes: [
              { action: 'passe', de: 9, vers: 10 },
              { action: 'passe', de: 10, vers: 13, ligne: 'saute' },
            ],
          },
        ],
      },
    },
  };

  // Fusion profonde d'une config partielle par-dessus les valeurs par défaut :
  // l'utilisateur ne fournit que ce qu'il veut changer, le reste garde le défaut.
  function fusionnerConfig(base, surcharge) {
    const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
    if (!surcharge || typeof surcharge !== 'object') return out;
    for (const k of Object.keys(surcharge)) {
      const v = surcharge[k];
      out[k] = (v && typeof v === 'object' && !Array.isArray(v) && base && typeof base[k] === 'object' && !Array.isArray(base[k]))
        ? fusionnerConfig(base[k], v)
        : v;
    }
    return out;
  }

  // Point d'INTERCEPTION d'un coureur : l'endroit ou le chasseur doit courir
  // pour le COUPER, et non l'endroit ou le coureur se trouve maintenant. Un
  // defenseur qui vise en permanence la position courante d'un coureur plus
  // rapide que lui court derriere lui jusqu'a l'en-but sans jamais le toucher ;
  // un vrai dernier defenseur, lui, vise le point de rencontre (« courir au
  // drapeau de coin »). On resout |R + v.t| = s.t, R etant le vecteur du
  // chasseur vers le coureur, v la vitesse du coureur et s celle du chasseur.
  // S'il n'existe aucune solution (le coureur est trop rapide), le chasseur
  // vise le point ou le coureur franchira la ligne : c'est le mieux qu'il
  // puisse faire, et c'est exactement ce que fait un arriere debarde.
  function pointInterception(chasseur, cible, vCible, vChasseur, ligneX) {
    const rx = cible.x - chasseur.x, ry = cible.y - chasseur.y;
    const vx = cible.sensAttaque * vCible;
    const a = vx * vx - vChasseur * vChasseur;
    const b = 2 * rx * vx;
    const c = rx * rx + ry * ry;
    let t = null;
    if (Math.abs(a) < 1e-6) {
      if (Math.abs(b) > 1e-6) { const t0 = -c / b; if (t0 > 0) t = t0; }
    } else {
      const disc = b * b - 4 * a * c;
      if (disc >= 0) {
        const r = Math.sqrt(disc);
        for (const cand of [(-b - r) / (2 * a), (-b + r) / (2 * a)]) {
          if (cand > 0 && (t === null || cand < t)) t = cand;
        }
      }
    }
    if (t === null) t = vCible > 0.1 ? Math.abs(ligneX - cible.x) / vCible : 2;
    t = Math.max(0, Math.min(6, t));
    return { x: cible.x + vx * t, y: cible.y };
  }

  function creerJoueur(numero, team, sensAttaque, rng, joueursCfg) {
    const c = (joueursCfg && joueursCfg[numero]) || {};
    const p = PROFILS[numero];
    const couloir = c.couloir != null ? c.couloir : COULOIR_BASE[numero];
    const channelY = couloir * (LARGEUR / 70);
    return {
      team, numero, label: c.poste || p.label,
      vitesse: (c.vitesse != null ? c.vitesse : p.vitesse) + (rng() * 10 - 5),
      plaquage: (c.plaquage != null ? c.plaquage : p.plaquage) + (rng() * 10 - 5),
      tendance: c.tendance != null ? c.tendance : p.tendance,
      adresse: c.adresse != null ? c.adresse : p.adresse,
      melee: c.melee != null ? c.melee : p.melee,
      touche: c.touche != null ? c.touche : p.touche,
      puissance: c.puissance != null ? c.puissance : p.puissance,
      endurance: c.endurance != null ? c.endurance : p.endurance,
      passe: c.passe != null ? c.passe : p.passe,
      jeuPied: c.jeuPied != null ? c.jeuPied : p.jeuPied,
      decision: c.decision != null ? c.decision : p.decision,
      discipline: c.discipline != null ? c.discipline : p.discipline,
      channelY,
      x: 0, y: channelY,
      auSol: 0,
      // Délai pendant lequel un défenseur qui vient de rater un plaquage ne
      // peut pas retenter immédiatement (sinon le même contact serait rejoué
      // à chaque tick jusqu'à réussite, ce qui annule statistiquement tout
      // raté de plaquage). Décrémenté dans tick(), comme auSol.
      missCooldown: 0,
      // Délai de récupération après avoir été lié dans un regroupement (ruck/maul/
      // mêlée/touche) : représente le temps pour se relever et rejoindre l'aligne-
      // ment, pendant lequel ce joueur ne peut pas être le prochain plaqueur — sans
      // quoi le défenseur qui vient de sortir du ruck, resté au même endroit, plaque
      // le porteur suivant dès la première fraction de seconde de jeu courant.
      ruckRecovery: 0,
      // Hors-jeu de coup de pied (loi 10) : secondes restantes, et ligne du coup
      // de pied a repasser pour etre remis en jeu (cf. _replierHorsJeuKick).
      horsJeuKick: 0,
      horsJeuKickX: null,
      // Temps restant au "bin" après un carton jaune : tant qu'il est > 0, ce
      // joueur est exclu de attaquants()/defenseurs() (son équipe joue à 14),
      // conformément à la sanction réelle plutôt qu'un carton purement
      // cosmétique sans effet sur le jeu.
      sinBin: 0,
      sensAttaque,
    };
  }

  function creerEquipe(team, sensAttaque, rng, joueursCfg) {
    const joueurs = [];
    for (let n = 1; n <= 15; n++) joueurs.push(creerJoueur(n, team, sensAttaque, rng, joueursCfg));
    return joueurs;
  }

  // Avancement du match (0 au coup d'envoi, 1 a la 80e) : positionne en debut
  // de tick(). Sert a la fatigue, qui fait baisser le RYTHME en fin de match et
  // ouvre le jeu, comme en vrai.
  let _fatCourant = 0;
  // Perte de vitesse a la 80e minute pour un joueur d'endurance MOYENNE.
  const PERTE_VITESSE_FATIGUE = 0.10;
  // Endurance de reference : MOYENNE des quinze profils par defaut (66). C'est
  // le point neutre — un XV standard fatigue donc exactement comme avant, et le
  // correctif REPARTIT la fatigue sans changer le rythme moyen du match.
  const ENDURANCE_REF = 66;

  // La fatigue etait GLOBALE : un seul multiplicateur, le meme chiffre pour les
  // trente joueurs (1 au coup d'envoi, 0,90 a la 80e). L'attribut `endurance`
  // n'etait donc JAMAIS lu par le moteur — verifie par balayage (+20 a une
  // equipe, -20 a l'autre, 24 graines appariees) : l'ecart de score reproduisait
  // le temoin AU CHIFFRE PRES (-3,0 points, -0,29 essai, 38 % de victoires dans
  // les deux cas), et un controle a deux equipes identiques sauf l'endurance
  // (90 contre 30) donnait exactement le meme resultat que sans configuration.
  //
  // Or l'ecran de composition PONDERE l'endurance : 10 % de la note d'un pilier,
  // 12 % d'une deuxieme ligne, 18 % d'une troisieme ligne (cf.
  // docs/js/club-composition.js, POIDS_PAR_POSTE). Le manager recrutait et
  // alignait donc sur un attribut qui ne jouait jamais. En rugby, l'endurance
  // decide au contraire des vingt dernieres minutes — c'est aussi ce qui donne
  // un sens aux remplacements.
  function vitesseMs(j) {
    const endurance = typeof j.endurance === 'number' ? j.endurance : ENDURANCE_REF;
    // Un joueur peu endurant paie la fatigue plus cher ; un joueur tres endurant
    // la paie moins. Borne pour qu'aucun profil ne devienne infatigable.
    const coutFatigue = Math.max(0.4, Math.min(1.8, 1 + (ENDURANCE_REF - endurance) / 55));
    const fatigue = 1 - _fatCourant * PERTE_VITESSE_FATIGUE * coutFatigue;
    return (3.0 + (Math.max(0, Math.min(100, j.vitesse)) / 100) * 5.0) * fatigue;
  }

  // Regroupement INFRANCHISSABLE du tick courant (mêlée / ruck / maul) : on ne le
  // traverse pas. Positionné en début de tick() selon la phase, remis à null hors
  // regroupement. Partagé au niveau du module (avancer n'est pas une méthode) ;
  // sûr car chaque tick le (re)définit et avancer n'est appelé que pendant un tick.
  let _obstacle = null;

  // INERTIE DE COURSE (accélération / décélération) : un joueur de rugby ne
  // passe pas de l'arrêt à sa vitesse maximale en un dixième de seconde. Sans
  // cette inertie, tout le monde surgissait à pleine vitesse dès le premier
  // tick suivant un regroupement : le défenseur fondait sur le porteur en
  // ~0,5 s et le match enchaînait 3x trop de phases (mesuré : 542 séquences de
  // jeu courant et 407 rucks par match, contre ~150 rucks en vrai).
  // ACCELERATION volontairement modérée : elle ne représente pas la pointe
  // d'accélération d'un sprinteur sur piste, mais le rythme réel auquel un
  // joueur se REMET en marche dans le trafic (se relever, se réorienter,
  // contourner des corps) — mesuré comme le meilleur compromis par balayage.
  // DECELERATION : un joueur qu'on cesse de déplacer (cible atteinte, phase
  // terminée) redescend à l'arrêt en ~1,5 s au lieu de se figer net.
  const ACCELERATION = 2.0; // m/s²
  const DECELERATION = 5.0; // m/s²

  // TEMPS DE PLAQUAGE (loi 14), en secondes : du contact au ballon disponible
  // au sol. Le plaqueur tient le porteur, l'amene au sol ; le porteur se
  // retourne et PRESENTE le ballon. Ce temps N'EST PAS du recyclage : la duree
  // de ruck mesuree (World Rugby : ballon au sol -> ballon sorti, cf.
  // cfg.ruck.profil et server/test-ruck.js) court a partir d'ici et n'est pas
  // gonflee. Le moteur enchainait les deux dans le meme dixieme de seconde :
  // l'horloge du regroupement demarrait alors que rien n'avait encore eu lieu,
  // et le match jouait ~200 regroupements au lieu de 110-180.
  // 0,6 s et pas davantage : mesure, au-dela la defense a le temps de se
  // replacer PARFAITEMENT derriere chaque regroupement et le ballon se remet a
  // RECULER d'un temps de jeu au suivant (-0,23 m a 1,3 s, +0,27 m a 0,6 s).
  // Une partie du contact reel est d'ailleurs deja consommee avant : le
  // plaquage se declenche quand le plaqueur est encore a 2,2 m du porteur.
  const DUREE_PLAQUAGE = 0.6;

  // Duree maximale (secondes) pendant laquelle un chasseur reste HORS-JEU
  // apres un coup de pied (loi 10). Il redevient jouable des qu'il est repasse
  // derriere la ligne du coup de pied ; ce plafond evite qu'un joueur reste
  // bloque hors-jeu si le jeu s'est deplace ailleurs entre-temps.
  const DUREE_HORS_JEU_KICK = 6;
  // Profondeur de la base de la mêlée depuis le milieu du tunnel (P2-64) : les
  // premières lignes à ~0,35 m de la marque, le n°8 à 2 m derrière (formation
  // 3-4-1, cf. _meleePlacerPaquets), le ballon à ses pieds 0,3 m plus loin.
  const PROF_BASE_MELEE = 2.65;
  // Part de l'angle d'interception ideal reellement prise par le dernier
  // defenseur (n°15) quand le porteur a franchi la ligne (cf. pointInterception).
  // 0,35 -> 0,5 (P2-113) : 59 % des essais suivaient un franchissement de moins
  // de 20 s et seules 11 séquences sur 145 partaient des 22 adverses — l'arrière
  // ne lisait presque pas la course. À 0,5 : 46 % des essais après franchissement,
  // 15 séquences parties des 22 (20 matchs). Points sur 100 matchs appariés :
  // 61,9 -> 59,6 (-2,3 ± 3,7, même sens à 0,65). À 1,0 le contre disparaît.
  const COUVERTURE_ARRIERE = 0.5;
  // Rayon de contact du plaquage (m) : distance a laquelle le contact se resout,
  // et donc aussi celle a laquelle un SECOND defenseur participe au plaquage.
  const RAYON_PLAQUAGE = 2.2;
  // Puissance de reference au contact : MOYENNE MESUREE des porteurs amenes au
  // contact sur 10 matchs (1 666 contacts) — 75 cote avants, 44 cote
  // trois-quarts, 57 en moyenne ponderee. C'est le point neutre de
  // `facteurPuissance` : un porteur moyen gagne exactement ce qu'il gagnait
  // avant l'introduction du facteur, donc le correctif REPARTIT sans gonfler.
  const PUISSANCE_CONTACT_REF = 57;
  // Interception : distance maximale au couloir de passe (m) pour qu'un
  // defenseur soit en position, et probabilite de prise quand il l'est.
  //
  // CES DEUX VALEURS DEPENDENT DE LA LONGUEUR DE LA PASSE (cf. _chercherInterception).
  // Elles etaient PLATES : une sautee de 16 m et un pop de 2 m avaient
  // exactement le meme risque. Mesure sur 30 matchs en instrumentant la
  // fonction : la passe interceptee moyenne faisait 4,3 m et la mediane 2,7 m.
  // Le moteur ne produisait donc pas des interceptions mais des ramassages de
  // ballons deja dans les mains du receveur (0,39 prise sur 0,52 par match
  // sur des passes de moins de six metres).
  //
  // La raison physique est le TEMPS DE VOL. Une passe parcourt ~12 m/s : une
  // sautee de 15 m reste en l'air ~1,25 s, un pop de 2 m ~0,17 s. Ce temps
  // donne au defenseur (a) de quoi LIRE la trajectoire et partir dessus, (b) de
  // quoi COUVRIR du terrain lateralement avant l'arrivee du ballon. D'ou deux
  // termes lies a la longueur L au lieu de deux constantes :
  //   couloir  = SEUIL_COULOIR_INTERCEPTION + GAIN_COULOIR_PAR_METRE * L
  //   proba    = PROBA_INTERCEPTION * (L - LONGUEUR_ININTERCEPTABLE) / ECHELLE_LECTURE
  // A 15 m le couloir vaut 3,0 m, soit 2,4 m/s de deplacement lateral pendant
  // le vol : conservateur pour un joueur debout et lance.
  const SEUIL_COULOIR_INTERCEPTION = 1.2;
  const PROBA_INTERCEPTION = 0.065;
  // En dessous de cette longueur (m) la passe n'est pas interceptable : le
  // receveur a le ballon avant que le defenseur ait pu s'y mettre.
  const LONGUEUR_ININTERCEPTABLE = 3;
  // Longueur (m) au-dela du seuil ci-dessus qui vaut le taux historique.
  const ECHELLE_LECTURE = 6;
  // Metres de couloir gagnes par metre de passe (deplacement lateral pendant le vol).
  const GAIN_COULOIR_PAR_METRE = 0.12;
  // Plafond du facteur de longueur : meme une passe de 40 m n'est pas un cadeau.
  // NON COUVERT PAR LE TEST (audit de creusage : le mettre a 99 laisse le test
  // vert) — au-dela de 16 m les passes sont trop rares pour deplacer la moyenne.
  // C'est un garde-corps, pas un comportement mesure.
  const FACTEUR_LONGUEUR_MAX = 2.2;
  // LOI 15 — la ligne de hors-jeu d'un regroupement est le PIED LE PLUS RECULE
  // du dernier joueur, pas le ballon : elle se situe environ 1,5 m derriere lui,
  // du cote de chaque equipe. Le moteur clampait les defenseurs sur le ballon
  // lui-meme, soit 1,5 m trop avance : l'attaque recevait le ballon dans une
  // ligne deja sur elle et ne franchissait jamais. Mesure (comparaison APPARIEE
  // sur 80 matchs) : le gain net par temps de jeu passe de 0,90 m a 1,46 m
  // (+0,56 +/- 0,20, etabli) et la part des regroupements dans les 22 adverses
  // de 8,0 % a 10,2 % (+2,2 +/- 1,7, etabli).
  const RECUL_PIED_RECULE = 1.5;
  // Vitesse (fraction de sa vitesse de course) a laquelle un defenseur qui sort
  // d'un regroupement rejoint la ligne de hors-jeu. Plus bas = trou plus grand
  // derriere le ruck : a 0,45 le moteur montait a 6,0 essais par match, au-dela
  // du repere reel.
  const VITESSE_REPLI_SORTIE_RUCK = 0.85;
  // Probabilite qu'un porteur plaque sur la ligne soit TENU DEBOUT (held up)
  // au lieu d'aplatir (loi 8).
  const PROBA_TENU_DEBOUT = 0.35;

  function avancer(j, dx, dy, dt, vmax) {
    const d = Math.hypot(dx, dy);
    if (d < 0.01) return;
    // Vitesse RÉELLEMENT atteinte ce tick : la vitesse courante du joueur plus
    // ce qu'il peut gagner en dt, plafonnée par sa vitesse maximale.
    const vEff = Math.min(vmax, (j.vitesseCourante || 0) + ACCELERATION * dt);
    j.vitesseCourante = vEff;
    j._aBouge = true;
    const pas = Math.min(d, vEff * dt);
    let ux = dx / d, uy = dy / d;
    // Contournement du regroupement : un joueur ne TRAVERSE pas une mêlée/ruck/maul.
    // On ne dévie QUE celui qui veut passer DE L'AUTRE CÔTÉ (sa cible est au-delà du
    // regroupement) ; celui qui s'y ENGAGE (cible À L'INTÉRIEUR) n'est pas dévié —
    // sinon les soutiens ne pourraient jamais venir sécuriser le ballon. Le joueur
    // dévié glisse tangentiellement autour du cercle (« il fait le tour »).
    if (_obstacle) {
      const ox = _obstacle.x, oy = _obstacle.y, r = _obstacle.r;
      const cibleDist = Math.hypot((j.x + dx) - ox, (j.y + dy) - oy);
      const posDist = Math.hypot(j.x - ox, j.y - oy);
      if (cibleDist >= r && posDist >= r * 0.85) {
        const seg2 = dx * dx + dy * dy;
        let tc = ((ox - j.x) * dx + (oy - j.y) * dy) / (seg2 || 1);
        tc = Math.max(0, Math.min(1, tc));
        const closest = Math.hypot((j.x + tc * dx) - ox, (j.y + tc * dy) - oy);
        if (closest < r) {
          const nx = (j.x - ox) / (posDist || 1), ny = (j.y - oy) / (posDist || 1);
          // tangente du côté qui rapproche le plus de la cible
          const useT1 = (-ny * ux + nx * uy) >= (ny * ux - nx * uy);
          const tanx = useT1 ? -ny : ny, tany = useT1 ? nx : -nx;
          const push = posDist < r ? 1 : 0.25; // ressort vers l'extérieur si déjà au bord
          ux = tanx + nx * push; uy = tany + ny * push;
          const n = Math.hypot(ux, uy) || 1; ux /= n; uy /= n;
        }
      }
    }
    j.x += ux * pas;
    j.y += uy * pas;
    j.x = Math.max(0, Math.min(LONGUEUR, j.x));
    j.y = Math.max(0, Math.min(LARGEUR, j.y));
  }

  function joueurLePlusProche(liste, x, y) {
    let meilleur = null, meilleureDist = Infinity;
    for (const j of liste) {
      const d = Math.hypot(j.x - x, j.y - y);
      if (d < meilleureDist) { meilleureDist = d; meilleur = j; }
    }
    return { joueur: meilleur, distance: meilleureDist };
  }

  // --- Maul (loi 16) : machine à états ---------------------------------------
  // Le maul traverse une suite d'états bien définis, de sa formation à sa fin,
  // exactement comme l'arbitrage réel d'un maul (formation, avancée, arrêts
  // successifs, « use it », ballon injouable, écroulement). L'état est porté par
  // `engine.maul.etat`, la phase moteur restant 'MAUL'.
  const ETATS_MAUL = {
    AUCUN: 'NO_MAUL',
    FORMATION: 'MAUL_FORMING',
    ACTIF: 'MAUL_ACTIVE',
    AVANCE: 'MAUL_MOVING',
    PREMIER_ARRET: 'MAUL_FIRST_STOP',
    SECOND_ARRET: 'MAUL_SECOND_STOP',
    USE_IT: 'MAUL_USE_IT',
    ECROULE: 'MAUL_COLLAPSED',
    INJOUABLE: 'MAUL_UNPLAYABLE',
    TERMINE: 'MAUL_ENDED',
  };

  // Références de l'effectif PAR DÉFAUT (moyennes des PROFILS ci-dessus) :
  // puissance du pack (1-8) et vitesse de la ligne (9-15). Elles servent de
  // point neutre à `profilJeuAuPres` — un XV standard joue donc exactement le
  // réglage demandé, et seuls les effectifs atypiques s'en écartent.
  const PUISSANCE_PACK_REF = [1, 2, 3, 4, 5, 6, 7, 8]
    .reduce((a, n) => a + PROFILS[n].puissance, 0) / 8;
  const VITESSE_LIGNE_REF = [9, 10, 11, 12, 13, 14, 15]
    .reduce((a, n) => a + PROFILS[n].vitesse, 0) / 7;

  // Écart de l'effectif aligné par rapport au XV de référence : > 1 quand le
  // pack est plus puissant et/ou la ligne plus lente que la normale (on joue
  // davantage au près), < 1 dans le cas inverse. Borné pour qu'aucun effectif
  // ne bascule dans une seule façon de jouer.
  function profilJeuAuPres(equipe) {
    const pack = equipe.filter((j) => j.numero <= 8);
    const ligne = equipe.filter((j) => j.numero >= 9);
    if (!pack.length || !ligne.length) return 1;
    const moy = (l, f) => l.reduce((a, j) => a + f(j), 0) / l.length;
    const puissance = moy(pack, (j) => (typeof j.puissance === 'number' ? j.puissance : PUISSANCE_PACK_REF));
    const vitesse = moy(ligne, (j) => (typeof j.vitesse === 'number' ? j.vitesse : VITESSE_LIGNE_REF));
    const ecart = (puissance - PUISSANCE_PACK_REF) / 90 - (vitesse - VITESSE_LIGNE_REF) / 90;
    return Math.max(0.65, Math.min(1.35, 1 + ecart));
  }

  // Force de poussée d'un joueur dans le maul : les avants (1-8) poussent
  // nettement plus fort que les arrières ; modulée par le plaquage (contact)
  // ET l'attribut "puissance" (0-100, cf. profils Mode Club) s'il est fourni
  // — sinon comportement historique inchangé (puissance neutre = 60).
  function forceMaul(j) {
    const base = j.numero <= 8 ? 80 : 40;
    const puissance = typeof j.puissance === 'number' ? j.puissance : 60;
    return base + (j.plaquage - 60) * 0.2 + (puissance - 60) * 0.25;
  }

  // --- Chronologie du match (TODO_AUDIT.md P1-52) --------------------------
  //
  // `events` est une FENÊTRE GLISSANTE de 30 entrées, dimensionnée pour le fil
  // temps réel (5 lignes à l'écran). Mesuré sur un match complet : les 30
  // événements restants sont TOUS postérieurs à la 78e minute — tout le reste
  // du match a été jeté. Impossible, donc, de raconter la rencontre : ni
  // marqueurs, ni minutes, ni compte rendu après une simulation.
  //
  // La chronologie garde, elle, les FAITS MARQUANTS de tout le match : ce
  // qu'un journal de match imprimerait. Bornée aussi (un match en produit une
  // vingtaine, jamais des milliers), mais assez large pour n'en perdre aucun.
  const CHRONOLOGIE_MAX = 400;
  const TYPES_CHRONOLOGIE = new Set([
    // Points marqués ou manqués
    'ESSAI', 'ESSAI_PENALITE', 'TRANSFORMATION_REUSSIE', 'TRANSFORMATION_RATEE',
    'PENALITE_REUSSIE', 'PENALITE_RATEE', 'DROP_GOAL_REUSSI', 'DROP_GOAL_RATE',
    // Discipline
    'CARTON_JAUNE', 'PENALITE', 'PENALITE_RUCK_ISOLE', 'PENALITE_RUCK',
    // Repères de lecture et mouvements
    'MI_TEMPS', 'FIN_MATCH', 'REMPLACEMENT', 'SONNERIE',
    // Fait de jeu spectaculaire : le ballon change de camp en pleine attaque.
    'INTERCEPTION',
  ]);

  // Force spécifique de mêlée (technique de poussée organisée), distincte du
  // maul : pondérée par l'attribut "melee" (0-100) plutôt que par la
  // puissance brute — un pack technique domine même sans être le plus lourd.
  function forceMelee(j) {
    const base = j.numero <= 8 ? 80 : 40;
    const melee = typeof j.melee === 'number' ? j.melee : 60;
    return base + (j.plaquage - 60) * 0.15 + (melee - 60) * 0.35;
  }

  // --- Consigne de poussée en mêlée (TODO_AUDIT.md P1-51) ------------------
  //
  // Avant, `_meleeCalculerDiff` ne lisait AUCUNE clé de `cfgMelee` : l'issue
  // de la mêlée dépendait des joueurs, du score, des conditions et du hasard,
  // et le manager ne pouvait rien décider. Vérifié en jouant : poser
  // `meleeA.reculTroisQuarts = 12` donnait exactement le même résultat que le
  // défaut (81/94 mêlées gagnées dans les deux cas). Le seul réglage
  // disponible (`pickAndGoHuit`) décide de ce qu'on fait du ballon UNE FOIS
  // SORTI, jamais de la poussée.
  //
  // Comme pour la touche (P1-50b), la consigne doit avoir un COÛT, sinon
  // « dominer » serait toujours le bon choix et il n'y aurait pas d'arbitrage.
  // Pousser fort gagne du terrain et des ballons, mais expose à l'écroulement
  // et au pilier en travers — deux pénalités, pas des coups francs.
  //
  // Fonction PURE et exportée : c'est une règle du jeu, elle se vérifie
  // directement plutôt qu'à travers la moyenne bruitée de quelques matchs.
  // `bonusVol` agit DIRECTEMENT sur la probabilité de contre en mêlée, et pas
  // seulement via `bonusDiff`. Raison mesurée : `probaVol` vaut
  // `0,05 - diff/300` borné à 0,02, et l'avantage d'introduction (18) suffit
  // déjà à coller la valeur au plancher — un bonus de différentiel n'y change
  // donc RIEN dans des conditions normales. Vérifié :
  //     diff   0 -> 0,050    diff   8 -> 0,023
  //     diff  18 -> 0,020    diff  28 -> 0,020
  // Première version de ce patch : +10 de différentiel et rien d'autre. Le
  // taux de mêlées gagnées passait de 85,9 % à 79,6 % — l'effet était inerte
  // et seul le coût s'appliquait. Un pack qui pousse fort CONTRE
  // l'introduction doit vraiment contrer davantage : c'est ce que `bonusVol`
  // exprime.
  const EFFETS_POUSSEE_MELEE = {
    dominer: { bonusDiff: 10, bonusVol: 0.05, facteurFaute: 1.5 },
    equilibre: { bonusDiff: 0, bonusVol: 0, facteurFaute: 1 },
    sortirVite: { bonusDiff: -8, bonusVol: -0.02, facteurFaute: 0.6 },
  };
  function effetPousseeMelee(poussee) {
    return EFFETS_POUSSEE_MELEE[poussee] || EFFETS_POUSSEE_MELEE.equilibre;
  }

  // SORTIE DE RUCK : ce que le service rapide du n°9 fait vraiment gagner.
  //
  // Le profil de durées (cf. DEFAULT_CONFIG.ruck) contient DÉJÀ son palier de
  // ballon rapide (55 % des rucks en 1,5-3 s). L'ancienne règle multipliait en
  // plus la durée tirée par 0,55 quand le 9 était à la base : la vitesse était
  // comptée deux fois, et un ballon tiré LENT ressortait servi comme un ballon
  // rapide. Mesuré sur 5 matchs complets (3100 rucks) :
  //     tiré   3,57 s   -   54,8 % < 3 s | 33,2 % en 3-6 s | 12,0 % > 6 s
  //     joué   2,52 s   -   72,2 % < 3 s | 26,1 % en 3-6 s |  1,7 % > 6 s
  // 71,1 % des rucks étaient raccourcis, et les rucks tirés à 6 s et plus
  // étaient joués en 4,29 s : le ballon lent avait disparu du match.
  //
  // La règle correcte, en termes de rugby : un 9 déjà à la base GAGNE du temps
  // de sortie, il ne transforme pas un ruck disputé en ballon rapide. Le gain
  // est donc BORNÉ (~0,9 s, à l'échelle des arrêts de jeu) et ne descend jamais
  // sous le plancher du profil lui-même. La récompense reste entière sur les
  // ballons déjà rapides : 2,4 s -> 1,5 s passe sous le seuil de 1,8 s qui
  // ouvre la fenêtre « défense pas replacée » (_defenseTardive).
  //
  // Fonction PURE et exportée : même méthode qu'en P1-50b / P1-51, la règle se
  // vérifie directement au lieu d'être jugée sur une moyenne bruitée.
  // Gain du service rapide, en secondes, ramene de 0,9 a 0,7 : un ballon
  // genuinement LENT (regroupement dispute) ne peut pas etre sorti vite, meme
  // par le meilleur demi de melee. A 0,9 la moitie des rucks tires « lents »
  // (>= 6 s) repassaient sous les 6 s a la sortie : le ballon lent, qui fait
  // respirer un match, ne representait plus que 5,9 % des regroupements joues
  // contre ~10 % dans un vrai match (cf. server/test-ruck.js R6). Le plancher
  // est 0,6 s : en deca, un ballon deja rapide (2,4 s) ne passerait plus sous
  // le seuil de « defense pas replacee » et le service rapide ne servirait
  // plus a rien (cf. server/test-ruck.js R2).
  const GAIN_SERVICE_RAPIDE_RUCK = 0.7;
  function dureeSortieRuck(opts) {
    const o = opts || {};
    const cible = Math.max(0, Number(o.dureeCible) || 0);
    if (!o.serviceRapide) return cible;
    const echelle = o.echelle != null ? o.echelle : 1;
    const plancher = Math.min(cible, Math.max(0, Number(o.plancher) || 0));
    return Math.max(plancher, cible - GAIN_SERVICE_RAPIDE_RUCK * echelle);
  }

  // Force de contestation en touche : pondérée par l'attribut "touche"
  // (détente/timing du sauteur, soutien du lever) plutôt que par la
  // puissance brute.
  function forceTouche(j) {
    const base = j.numero <= 8 ? 80 : 40;
    const touche = typeof j.touche === 'number' ? j.touche : 60;
    return base + (j.plaquage - 60) * 0.1 + (touche - 60) * 0.4;
  }

  // Tirage du sauteur PONDÉRÉ par son attribut `touche` (TODO_AUDIT.md P1-50).
  //
  // Avant, le tirage était uniforme : un sauteur à 88 et un à 45 étaient visés
  // aussi souvent l'un que l'autre, et l'attribut `touche` d'un joueur donné
  // n'existait que noyé dans la somme des huit avants. Mesuré : désigner le
  // SEUL bon sauteur d'un pack ne changeait rien du tout (120/115 touches
  // gagnées dans les deux cas, 0,0 point d'écart).
  //
  // Le poids plancher (25) garantit qu'un sauteur médiocre reste une option :
  // une équipe qui ne viserait qu'un seul homme deviendrait illisible pour le
  // moteur comme pour l'adversaire, alors qu'en vrai on varie les appels.
  const POIDS_SAUTEUR_PLANCHER = 25;
  // Surcroît de risque de vol quand l'alignement est totalement prévisible
  // (un seul sauteur possible). Proportionnel à la part du pool retirée.
  const COEF_LISIBILITE_TOUCHE = 0.03;
  function tirerSauteurPondere(pool, rng) {
    if (!pool || !pool.length) return null;
    const poids = pool.map((j) => Math.max(POIDS_SAUTEUR_PLANCHER,
      typeof j.touche === 'number' ? j.touche : 60));
    const total = poids.reduce((a, b) => a + b, 0);
    let r = rng() * total;
    for (let i = 0; i < pool.length; i++) {
      r -= poids[i];
      if (r <= 0) return pool[i];
    }
    return pool[pool.length - 1];
  }

  // Probabilité qu'une touche soit volée par la défense. Fonction PURE et
  // exportée : c'est une règle du jeu, elle doit pouvoir être vérifiée
  // directement plutôt que devinée à travers la moyenne bruitée de quelques
  // matchs (un effet de 2 points sur 145 touches ne se distingue pas du
  // hasard).
  //
  // Trois termes :
  //   - la domination COLLECTIVE du pack (somme des forceTouche) ;
  //   - la qualité PROPRE du sauteur visé — sans elle, désigner un sauteur ne
  //     changeait rien (mesuré : 0,0 point d'écart, cf. P1-50) ;
  //   - la LISIBILITÉ de l'alignement : restreindre le pool rend le lancer
  //     prévisible. Sans ce terme, désigner n'avait QUE des avantages, donc
  //     n'était pas un choix (mesuré : 95,1 % -> 97,8 % à qualité égale).
  //
  // COEF_LISIBILITE_TOUCHE (0,03 à pool réduit à un homme, soit +0,024 de
  // risque) est calibré SOUS le gain d'un vrai spécialiste (~0,038 quand il
  // domine nettement ses coéquipiers) : désigner un bon sauteur reste payant,
  // désigner à qualité égale coûte des ballons.
  function probaVolTouche({ forceLanceur, forceAdverse, qualiteSauteur, taillePool }) {
    const poolDefaut = DEFAULT_CONFIG.touche.sauteurs.length;
    const taille = taillePool > 0 ? taillePool : poolDefaut;
    const lisibilite = Math.max(0, (poolDefaut - taille) / poolDefaut);
    return Math.max(0.06, Math.min(0.30,
      0.14 + (forceAdverse - forceLanceur) / 900
      - ((qualiteSauteur != null ? qualiteSauteur : 80) - 80) / 400
      + lisibilite * COEF_LISIBILITE_TOUCHE));
  }

  // Discipline moyenne (0-100) des avants sur le terrain d'une équipe — sert à
  // moduler la fréquence des fautes de mêlée/maul (cf. _meleeDetecterFautes/
  // _maulDetecterFautes). Neutre (60, comportement historique) si l'attribut
  // n'est pas fourni pour un joueur donné.
  function disciplineMoyenne(equipe) {
    const avants = equipe.filter(j => j.numero <= 8 && j.sinBin <= 0);
    if (avants.length === 0) return 60;
    const somme = avants.reduce((s, j) => s + (typeof j.discipline === 'number' ? j.discipline : 60), 0);
    return somme / avants.length;
  }
  // Facteur multiplicatif appliqué aux seuils de faute (>1 = plus fautif) :
  // une équipe très disciplinée (90) concède ~40 % de fautes en moins sur ces
  // regroupements, une équipe indisciplinée (20) ~55 % de plus — borné pour
  // ne jamais neutraliser complètement le risque de faute.
  function facteurDiscipline(equipe) {
    return Math.max(0.55, Math.min(1.6, 1 + (60 - disciplineMoyenne(equipe)) / 75));
  }

  // --- Mêlée (lois 19/20) : machine à états -----------------------------------
  // Comme le maul (ETATS_MAUL ci-dessus), la mêlée traverse une vraie séquence
  // arbitrale (placement, "Crouch"/"Bind"/"Set", introduction, contestation,
  // sortie de balle) au lieu d'un tirage aléatoire instantané. L'état est porté
  // par `engine.melee.etat`, la phase moteur restant 'MELEE'.
  const ETATS_MELEE = {
    FORMATION: 'MELEE_FORMATION',
    CROUCH: 'MELEE_CROUCH',
    BIND: 'MELEE_BIND',
    SET: 'MELEE_SET',
    INTRODUCTION: 'MELEE_INTRODUCTION',
    CONTESTATION: 'MELEE_CONTESTATION',
    SORTIE: 'MELEE_SORTIE',
  };

  // --- Arbitre : applique de vraies règles plutôt que de laisser le jeu continuer
  // sans contrainte. Chaque méthode renvoie une infraction ou null. ---
  const Referee = {
    // Une passe est en-avant si le ballon avance vers la ligne d'en-but adverse
    // (relativement au sens d'attaque de l'équipe du passeur), tolérance 0.3m.
    passeEnAvant(sensAttaque, depuis, vers) {
      const deltaAttaque = (vers.x - depuis.x) * sensAttaque;
      return deltaAttaque > 0.3;
    },
    // Un en-avant se produit quand une réception échoue et que le ballon
    // continue dans le sens de l'attaque au moment du contact.
    enAvant(sensAttaque, depuis, vers) {
      return this.passeEnAvant(sensAttaque, depuis, vers);
    },
    // Hors-jeu de ruck : un défenseur qui ne participe pas au ruck ne doit pas
    // franchir la ligne de hors-jeu (le point de ruck) avant la sortie du ballon.
    horsJeuRuck(defenseur, ruckPoint, sensAttaqueAdverse) {
      const marge = 0.5;
      if (sensAttaqueAdverse > 0) return defenseur.x < ruckPoint.x - marge;
      return defenseur.x > ruckPoint.x + marge;
    },
    // Décision : un maul est-il valablement formé (loi 16) ? Il faut le porteur
    // debout, au moins un adversaire lié et debout, au moins un coéquipier lié,
    // le ballon en main (pas au sol) et l'action dans le champ de jeu.
    maulForme(porteur, adversaireLie, coequipierLie) {
      if (!porteur || porteur.auSol > 0) return false;
      if (!coequipierLie) return false;
      if (!adversaireLie || adversaireLie.auSol > 0) return false;
      if (porteur.x <= 0 || porteur.x >= LONGUEUR) return false;
      if (porteur.y <= 0 || porteur.y >= LARGEUR) return false;
      return true;
    },
    // Hors-jeu au maul : la ligne de hors-jeu passe par le dernier pied de
    // chaque équipe engagée dans le maul. Un défenseur NON lié qui se retrouve
    // du côté de la sortie du ballon (derrière le maul dans le sens d'attaque)
    // est hors-jeu — typiquement le défenseur qui contourne pour bloquer le
    // ballon. `sensAttaque` est celui de l'équipe en possession.
    horsJeuMaul(defenseur, centreMaul, sensAttaque) {
      const marge = 1.2;
      if (sensAttaque > 0) return defenseur.x < centreMaul.x - marge;
      return defenseur.x > centreMaul.x + marge;
    },
  };

  class MatchEngine {
    // dureeMatch (secondes de jeu simulées) optionnel : Infinity par défaut pour ne
    // pas casser les usages existants (tests headless, qui veulent un flux continu).
    constructor(seed, dureeMatch = Infinity, config = null) {
      // Config paramétrable avant le match (caractéristiques joueurs, touche,
      // mêlée, attaque, défense) fusionnée par-dessus les défauts : cf.
      // DEFAULT_CONFIG. `null` => comportement historique exact.
      this.cfg = fusionnerConfig(DEFAULT_CONFIG, config);
      // Tactique PAR ÉQUIPE (Mode Club) : `config.attaqueA/attaqueB` et
      // `config.defenseA/defenseB`, fusionnés par-dessus this.cfg.attaque/
      // defense (déjà résolu ci-dessus, donc un réglage partagé via
      // `config.attaque` reste le socle commun) plutôt que par-dessus
      // DEFAULT_CONFIG directement — sinon un override partiel (ex. juste
      // `tauxJeuAuPied`) perdrait les autres champs (ex. `jeuLargeTaux`).
      // Sans surcharge, les deux équipes utilisent this.cfg.attaque/defense :
      // comportement historique strictement inchangé.
      this.cfgAttaque = {
        A: fusionnerConfig(this.cfg.attaque, config && config.attaqueA),
        B: fusionnerConfig(this.cfg.attaque, config && config.attaqueB),
      };
      this.cfgDefense = {
        A: fusionnerConfig(this.cfg.defense, config && config.defenseA),
        B: fusionnerConfig(this.cfg.defense, config && config.defenseB),
      };
      // Buteur désigné (tirs au but/transformations) et lanceur en touche, PAR
      // ÉQUIPE (Mode Club) : `config.buteurA/buteurB` (numéro de maillot) et
      // `config.toucheLanceurA/toucheLanceurB`. Sans surcharge : n°10 au pied,
      // n°2 (talonneur) en touche — comportement historique inchangé.
      this.buteurNumero = {
        A: (config && config.buteurA) || 10,
        B: (config && config.buteurB) || 10,
      };
      this.toucheLanceurNumero = {
        A: (config && config.toucheLanceurA) || this.cfg.touche.lanceur,
        B: (config && config.toucheLanceurB) || this.cfg.touche.lanceur,
      };
      // Mêlée/touche/ruck PAR ÉQUIPE (Mode Club, tactique) : même principe que
      // cfgAttaque/cfgDefense ci-dessus — `config.meleeA/meleeB`,
      // `config.toucheA/toucheB`, `config.ruckA/ruckB` fusionnés par-dessus le
      // socle commun this.cfg.melee/touche/ruck. Sans surcharge, comportement
      // historique inchangé (les deux équipes partagent le même réglage).
      this.cfgMelee = {
        A: fusionnerConfig(this.cfg.melee, config && config.meleeA),
        B: fusionnerConfig(this.cfg.melee, config && config.meleeB),
      };
      this.cfgTouche = {
        A: fusionnerConfig(this.cfg.touche, config && config.toucheA),
        B: fusionnerConfig(this.cfg.touche, config && config.toucheB),
      };
      this.cfgRuck = {
        A: fusionnerConfig(this.cfg.ruck, config && config.ruckA),
        B: fusionnerConfig(this.cfg.ruck, config && config.ruckB),
      };
      this.rng = creerRng(seed >>> 0 || 1);
      // Remplacements planifiés (Mode Club, TODO_AUDIT.md P1-17) :
      // config.remplacements, optionnel — [{equipe:'A'|'B', numero, minute,
      // joueur:{...attributs}}]. Absent par défaut (tous les appels existants,
      // Match rapide comme tests headless) : comportement historique
      // strictement inchangé. Convertit chaque minute en instant (secondes
      // de jeu simulées, même unité que tempsMatch) et marque chaque entrée
      // "non appliquée" — cf. tick(), qui les applique une seule fois.
      this._remplacements = (config && Array.isArray(config.remplacements) ? config.remplacements : [])
        .map((r) => ({ equipe: r.equipe, numero: r.numero, joueur: r.joueur, instant: r.minute * 60, applique: false,
          joueurId: r.joueurId != null ? r.joueurId : null }));
      // Statistiques individuelles d'un joueur SORTI (bugs.md BUG-RM-007) : le
      // maillot reste, la personne change. Ses actions sont closes au moment
      // du remplacement et l'entrant repart d'une ligne vierge.
      this.statsJoueursSortis = { A: [], B: [] };
      this.remplacementsEffectues = [];
      this.score = { A: 0, B: 0 };
      this.events = [];
      this.chronologie = [];
      this.tempsMatch = 0;
      this.dureeMatch = dureeMatch;
      // Échelle des temps d'arrêt (essai/transformation/pénalité au but) : ces
      // durées sont calibrées sur un vrai match (80 min = 4800 s). Appliquées
      // telles quelles à un format démo très raccourci (5 min), elles
      // dévorent l'essentiel du temps de jeu visible (placement, recul,
      // frappe...) et laissent trop peu de place au jeu courant (passes,
      // coups de pied, mêlées) — ce qui donne l'impression d'une simulation
      // morte. On les compresse proportionnellement à la durée du match,
      // sans jamais descendre sous un minimum qui resterait lisible à l'écran.
      this._echelleArret = Math.max(0.15, Math.min(1, dureeMatch / 4800));
      // Mi-temps (loi 12) : "les adversaires de l'équipe qui a donné le coup
      // d'envoi en début de match donnent le coup d'envoi de la 2e période."
      this.dureeMiTemps = dureeMatch / 2;
      this.miTempsJouee = false;
      // Ballon en vol : pendant un coup d'envoi/une remise en jeu, le ballon est
      // botté en cloche et vole seul vers sa zone de chute (personne ne le
      // "porte"). En dehors de ces phases, il est tenu par le porteur.
      this.ballonEnVol = false;
      this.ballonVolX = LONGUEUR / 2;
      this.ballonVolY = LARGEUR / 2;
      this.ballonVolHauteur = 0;
      // Ballon au sol après un coup de pied tactique, pas encore récupéré :
      // les chasseurs/receveurs doivent réellement courir jusqu'au point de
      // chute (cf. _tickReceptionCoupDePied) avant qu'un joueur ne soit
      // déclaré porteur, jamais une téléportation instantanée.
      this._receptionEnAttente = false;
      this._rouleBallon = null;
      this._ballonEnBut = null;
      this.timerReceptionAuSol = 0;
      // Lancer de touche en cours (loi 18) : pendant que le ballon vole du
      // lanceur vers le sauteur, on stocke ici la cible et l'issue déjà
      // décidée ; null hors lancer. Évite que le ballon "saute" instantanément
      // de la ligne de touche jusque dans l'alignement (cf. _tickToucheLancer).
      this.toucheLancer = null;
      this.penTouche = null;
      this.toucheRapide = null;
      // Vol visuel d'une passe en jeu courant : le ballon décrit un court arc
      // du passeur au receveur au lieu de "sauter" instantanément. Purement
      // visuel (la possession change tout de suite côté logique), null hors
      // passe. Cf. _lancerPasseVisuelle / getState.
      this.passeVisuelle = null;
      // Temps de plaquage restant avant que l'horloge du ruck ne démarre (cf. DUREE_PLAQUAGE).
      this.ruckPlaquage = 0;
      // Coups de pied au but (pénalité / transformation) : passe à true une fois
      // que TOUS les joueurs ont fini de se replacer. Tant que c'est false, la
      // frappe n'est pas armée (on ne peut pas botter tant que le replacement
      // n'est pas terminé) ; une fois true, les joueurs ne bougent plus —
      // notamment au moment du tir. Remis à false à chaque nouveau coup de pied.
      this.tirEnPlace = false;
      this.transfoEnPlace = false;
      // Maul (loi 16) : objet d'état courant (null hors maul), et indicateur
      // « le ballon vient d'une réception directe d'un coup de pied adverse »
      // (exception loi 19 sur l'attribution de la mêlée en cas de ballon injouable).
      this.maul = null;
      this._receptionDirecte = false;
      // Avantage (loi 7) : objet d'état courant (null hors avantage). Quand une
      // équipe commet une faute, l'arbitre laisse jouer l'équipe non fautive et
      // ne siffle la sanction que si celle-ci n'en tire rien. Stocke la sanction
      // en attente, le bénéficiaire, la marque et le repère de progression.
      this.avantage = null;
      // Position courante de l'arbitre (entité qui se déplace, jamais
      // téléportée) : il court vers sa cible chaque tick (cf. _majArbitre).
      this.arbitrePos = { x: LONGUEUR / 2, y: LARGEUR / 2 };
      // Compteur d'infractions de maul par équipe sur l'ensemble du match
      // (persiste d'un maul à l'autre) : sert à siffler un carton jaune pour
      // fautes répétées, comme l'arbitrage réel.
      this._maulPenalitesMatch = { A: 0, B: 0 };
      // Mêlée (lois 19/20) : objet d'état courant (null hors mêlée), et même
      // compteur d'infractions répétées par équipe que le maul ci-dessus.
      this.melee = null;
      this._meleePenalitesMatch = { A: 0, B: 0 };
      this._sequenceEvenement = 0;
      // Statistiques agrégées du match, calibrage du jeu (pas un affichage
      // décoratif) : chaque compteur n'est incrémenté qu'au moment réel où
      // l'action correspondante se produit dans la simulation, jamais déduit
      // ou estimé après coup. Persiste sur tout le match (PAS réinitialisé par
      // _nouvelleManche, qui ne fait que relancer une mancha de jeu).
      this.stats = {
        A: this._statsVierges(), B: this._statsVierges(),
      };
      // Statistiques PAR JOUEUR (numéro), même principe que this.stats mais
      // ventilé individu par individu (Mode Club : classement des marqueurs,
      // fiche joueur) — peuplé paresseusement au premier événement de chaque
      // joueur, jamais déduit après coup.
      this.statsJoueurs = { A: {}, B: {} };
      this.tempsJeuEffectif = 0;
      // Temps de possession réel par équipe (ballon vivant uniquement, même
      // condition que tempsJeuEffectif) : sert à calculer un % de possession
      // basé sur le temps de jeu effectif, pas sur un compteur d'événements.
      this.tempsPossession = { A: 0, B: 0 };
      // Occupation territoriale (où se joue le match), distincte de la
      // possession (qui porte le ballon) : cf. tick().
      this.tempsOccupation = { A: 0, B: 0 };
      // Entrée dans les 22 m adverses (cf. tick()) : mémorise la dernière
      // équipe en possession et si CETTE possession a déjà compté une entrée,
      // pour n'en compter qu'une seule par possession continue (pas une par
      // tick passé dans la zone, ni une par phase/ruck).
      this._entree22DernierePossession = null;
      this._entree22Faite = false;
      this._nouvelleManche('A');
      this.equipeKickPremiereMiTemps = this._dernierEquipeKick;
    }

    // Statistiques de match, alignées sur les définitions officielles World Rugby
    // (game analysis). Toutes dérivées d'ACTIONS RÉELLES de la simulation, jamais
    // fabriquées. Correspondance documentée dans docs/REGLES_RUGBY.md.
    //  - carries          : ballons portés AU CONTACT (le porteur engage le contact),
    //                       une course par ballon reçu : un plaquage cassé n'en fait pas une deuxième ;
    //  - passes / passesTentees / offloads : passes réussies / tentées / dans le plaquage ;
    //  - tacklesMade / missedTackles       : plaquages réussis / manqués (côté défense) ;
    //  - defenseursBattus : défenseurs BATTUS (côté attaque = plaquage manqué subi par la défense) ;
    //  - turnovers / turnoversConcedes      : ballons GAGNÉS / PERDUS (perte de possession en jeu) ;
    //  - phases           : phases jouées (nombre de rucks + mauls de la possession) ;
    //  - kicks            : coups de pied en jeu ; metresGagnes : mètres gagnés ballon en main.
    _statsVierges() {
      return {
        essais: 0, carries: 0, passes: 0, passesTentees: 0, offloads: 0, kicks: 0,
        tacklesAttempted: 0, tacklesMade: 0, missedTackles: 0, defenseursBattus: 0,
        rucks: 0, lineouts: 0, lineoutsGagnes: 0, scrums: 0, scrumsGagnes: 0, mauls: 0, phases: 0,
        penalitesConcedees: 0, turnovers: 0, turnoversConcedes: 0, knockOns: 0, cartonsJaunes: 0, metresGagnes: 0,
        // Tableau de marque et conservation (P2-63) : comptés là où l'action a lieu.
        essaisPenalite: 0, transformationsTentees: 0, transformationsReussies: 0,
        penalitesButTentees: 0, penalitesButReussies: 0, dropsTentes: 0, dropsReussis: 0,
        rucksConserves: 0, scrumsGagnesIntro: 0, lineoutsGagnesLancer: 0,
        cinquanteVingtDeux: 0, // 50:22 réussis (P2-96)
        touchesRapides: 0, // touches rapides jouées (P2-98)
        // Motifs de jeu discriminants (d'apres l'etude rorybunker/rugby-sequences,
        // qui identifie franchissements, touches gagnees, coups de pied regagnes,
        // jeu multi-phases et sorties de camp comme les motifs qui distinguent le
        // mieux marquer vs encaisser). Tous derives d'actions reelles.
        franchissements: 0, kicksRegagnes: 0, exits: 0, exitsRates: 0,
        // Entrée dans les 22 m adverses (TODO_AUDIT.md P2-13/T6) : une par
        // possession continue (cf. tick(), pas re-comptee tant que la
        // possession ne change pas), utile pour suivre la finition en zone
        // rouge (cf. docs/ANALYSE_MATCH_REEL.md).
        entrees22: 0,
      };
    }

    // Une course par ballon porté (analyse de match) : un porteur qui casse un
    // plaquage puis se fait reprendre a fait UNE course et battu un défenseur,
    // pas deux courses. Remis à zéro dès que le ballon change de mains (tick).
    _compterCourse(porteur) {
      if (!porteur || this._courseDe === porteur) return;
      this._courseDe = porteur;
      this.stats[this.possession].carries++;
      this._statJoueur(porteur).courses++;
    }

    // Retourne (en la créant si besoin) le compteur individuel d'un joueur —
    // sous-ensemble volontairement resserré de _statsVierges (les stats les
    // plus lisibles pour un classement individuel), jamais une déduction.
    _statJoueur(joueur) {
      if (!joueur) return null;
      const bucket = this.statsJoueurs[joueur.team];
      if (!bucket[joueur.numero]) {
        // Statistiques individuelles (P2-103) : chacune est comptée là où
        // l'action a lieu, au même endroit que le total de l'équipe.
        bucket[joueur.numero] = { essais: 0, passes: 0, tacklesMade: 0, tacklesAttempted: 0, metresGagnes: 0,
          courses: 0, defenseursBattus: 0, franchissements: 0, offloads: 0, plaquagesManques: 0,
          turnoversGagnes: 0, enAvants: 0, cartonsJaunes: 0, pointsAuPied: 0, touchesGagnees: 0,
          coupsDePied: 0, passesDecisives: 0 };
      }
      return bucket[joueur.numero];
    }

    // type : catégorie machine-lisible de l'événement (ESSAI, PENALITE, ...) pour que
    // l'interface puisse réagir (icône, bannière) sans reparser le message en français.
    // id : identifiant croissant, pour détecter côté client "un nouvel événement vient
    // d'arriver" même après que le tableau ait été tronqué (shift) à 30 entrées.
    // `extra` : champs STRUCTURES attaches a l'evenement (par ex. qui passe a
    // qui). L'interface peut ainsi raconter l'action sans avoir a analyser le
    // texte du message, ce qui serait fragile. Optionnel : tous les appels
    // existants restent valables tels quels.
    log(type, team, message, extra) {
      const evenement = Object.assign(
        { id: ++this._sequenceEvenement, type, team, message, t: this.tempsMatch },
        extra || null);
      this.events.push(evenement);
      if (this.events.length > 30) this.events.shift();
      // Fait marquant : conservé pour TOUT le match (cf. CHRONOLOGIE_MAX).
      // C'est cette liste, et pas `events`, qui permet de raconter la
      // rencontre après coup.
      if (TYPES_CHRONOLOGIE.has(type) && this.chronologie.length < CHRONOLOGIE_MAX) {
        this.chronologie.push(Object.assign({
          minute: Math.max(0, Math.floor(evenement.t / 60)),
        }, evenement));
      }
    }

    // Coup d'envoi / remise en jeu (loi 12) : l'équipe "equipeReceptrice" est
    // celle qui RECOIT le coup de pied (par ex. l'équipe qui vient de marquer,
    // ou qui vient de rater une pénalité au but) ; l'adversaire (equipeKick)
    // est celle qui botte depuis xCentre (50 = mi-terrain, ou la ligne des 22m
    // défendue par l'équipe qui botte pour une remise en 22m). L'équipe qui
    // botte doit rester derrière le ballon, l'équipe receptrice à 10m minimum :
    // le ballon est donc réellement botté et contestable, pas remis en main.
    _nouvelleManche(equipeReceptrice, xCentre = LONGUEUR / 2) {
      // Où le ballon est-il AFFICHÉ au moment de la reprise (P2-84) ? Il revient
      // de là jusqu'au botteur, à vue, pendant la mise en place (cf.
      // _tickCoupEnvoi) — avant, il sautait de ~49 m des poteaux à ses mains.
      // Après un coup de pied au but (transformation, pénalité, drop), le vol
      // vient d'être déclaré terminé : le ballon est à son point de chute
      // (ballonVolX/Y), pas dans les mains du dernier porteur.
      let depart = null;
      const apresTir = this.phase === 'TRANSFORMATION' || this.phase === 'PENALITE_TIR' || this.phase === 'COUP_DE_PIED_JEU';
      if ((this.ballonEnVol || apresTir) && this.ballonVolX != null) depart = { x: this.ballonVolX, y: this.ballonVolY };
      else { try { const b = this.getState().ballon; depart = { x: b.x, y: b.y }; } catch (e) { depart = null; } }
      this._retourEnvoi = depart;
      const sens = { A: 1, B: -1 };
      this.maul = null;
      this.melee = null;
      this.penaliteRecul = null;
      this.ruckDominant = false;
      this.combinaison = null;
      this._receptionDirecte = false;
      // Toute reprise (coup d'envoi après essai/pénalité/22 m) annule un avantage
      // éventuellement en cours : on repart sur une nouvelle séquence de jeu.
      this.avantage = null;
      // Un carton jaune en cours (sinBin > 0) doit survivre au redémarrage de
      // manche : sans ce report, l'exclusion de 10 min (loi 9.29) serait
      // effacée dès le prochain essai/pénalité/mi-temps, ce qui annule la
      // sanction au lieu de l'appliquer.
      // On mémorise le sin-bin ET la POSITION de chaque joueur avant de recréer les
      // équipes : sinon les nouveaux objets repartaient à (0, channelY) — les
      // joueurs « sautaient » sur la ligne d'en-but (téléportation à chaque
      // reprise). On restaure leur position réelle ; ils rejoignent ensuite leur
      // place de coup d'envoi EN COURANT (cf. _cibleEnvoi / _tickCoupEnvoi).
      const sinBinRestant = new Map();
      const posRestante = new Map();
      const avaitEquipes = !!(this.equipeA && this.equipeA.length);
      for (const j of (this.equipeA || []).concat(this.equipeB || [])) {
        if (j.sinBin > 0) sinBinRestant.set(j.team + '-' + j.numero, j.sinBin);
        posRestante.set(j.team + '-' + j.numero, { x: j.x, y: j.y });
      }
      this.equipeA = creerEquipe('A', sens.A, this.rng, this.cfg.joueursA || this.cfg.joueurs);
      this.equipeB = creerEquipe('B', sens.B, this.rng, this.cfg.joueursB || this.cfg.joueurs);
      for (const j of [...this.equipeA, ...this.equipeB]) {
        const restant = sinBinRestant.get(j.team + '-' + j.numero);
        if (restant) j.sinBin = restant;
        const p = posRestante.get(j.team + '-' + j.numero);
        if (p) { j.x = p.x; j.y = p.y; } // continuité : on garde la position d'avant la reprise
      }
      const equipeKick = equipeReceptrice === 'A' ? 'B' : 'A';
      this._dernierEquipeKick = equipeKick;
      const dirKick = sens[equipeKick];
      // Réception du coup d'envoi : défense ÉTAGÉE en profondeur (loi 12), pas
      // une seule ligne massée sur les 10 m. Sans étagement, un coup d'envoi long
      // tombait derrière tout le monde, personne pour le réceptionner.
      //  - Avants (1-8) : 1ʳᵉ ligne sur la ligne des 10 m (capter/contester les
      //    coups courts, monter au plaquage).
      //  - 9,10,12,13 : 2ᵉ rideau ~18 m.
      //  - Ailiers (11,14) : autour de la ligne des 22 m (~30 m du centre),
      //    écartés sur les bords.
      //  - Arrière (15) : couverture PROFONDE, ENTRE LES 22 M ET L'EN-BUT
      //    (~38 m du centre), au milieu — le dernier rideau qui cueille les
      //    longs coups de pied. (La ligne des 22 m est à 28 m du centre.)
      const profondeurReception = (n) => {
        if (n <= 8) return 10;
        if (n === 15) return 38;
        if (n === 11 || n === 14) return 30;
        return 18;
      };
      // Les joueurs ne sont PLUS téléportés à leur place de coup d'envoi : on
      // mémorise leur position CIBLE et ils s'y rendent EN COURANT pendant la mise
      // en place (cf. _tickCoupEnvoi, phase envoiEnPlace). Après un essai, on voit
      // donc les joueurs regagner le milieu de terrain à la course, comme en vrai,
      // au lieu de « sauter » d'un bout à l'autre du terrain (téléportation).
      for (const j of [...this.equipeA, ...this.equipeB]) {
        const cx = j.team === equipeKick
          ? Math.max(0, Math.min(LONGUEUR, xCentre - dirKick * (j.numero <= 8 ? 2 : 6)))
          : Math.max(0, Math.min(LONGUEUR, xCentre + dirKick * profondeurReception(j.numero)));
        j._cibleEnvoi = { x: cx, y: j.channelY };
        if (!avaitEquipes) { j.x = cx; j.y = j.channelY; } // 1er coup d'envoi du match : placement direct
      }
      const kickeur = (equipeKick === 'A' ? this.equipeA : this.equipeB)[9]; // ouvreur, n.10
      kickeur._cibleEnvoi = { x: xCentre, y: LARGEUR / 2 };
      if (!avaitEquipes) { kickeur.x = xCentre; kickeur.y = LARGEUR / 2; }
      // Mise en place : au coup d'envoi d'ouverture, les joueurs sont déjà placés ;
      // sinon (reprise après un score) ils COURENT rejoindre leur poste depuis leur
      // position réelle (pas de téléportation), cf. _tickCoupEnvoi.
      this.envoiEnPlace = !avaitEquipes;
      this.possession = equipeKick;
      this.porteur = kickeur;
      this.equipeReceptriceAttendue = equipeReceptrice;
      this.xCoupEnvoi = xCentre;
      this.dirCoupEnvoi = dirKick;
      // Cible : au-delà de la ligne des 10m adverses (obligation légale), assez
      // loin pour rendre le ballon réellement contestable à la réception.
      // Exception (loi 12) : un coup d'envoi mal frappé qui ne franchit pas les
      // 10m est sanctionné par une mêlée au centre pour l'équipe qui n'a pas
      // botté (cf. _tickCoupEnvoi). Simplifié : pas d'option de retaper.
      this.coupEnvoiCourt = this.rng() < 0.06;
      // Coup d'envoi profond : botté loin vers les 22 m adverses pour mettre la
      // pression sur la réception (au prix d'une chasse plus difficile). C'est
      // le seul cas où le receveur capte le ballon dans son propre en-deçà des
      // 22 m et peut donc demander une marque (loi 17).
      this.coupEnvoiProfond = !this.coupEnvoiCourt && this.rng() < 0.18;
      this.ballonCibleX = this.coupEnvoiCourt
        ? Math.max(0, Math.min(LONGUEUR, xCentre + dirKick * (3 + this.rng() * 6)))
        : this.coupEnvoiProfond
          ? Math.max(0, Math.min(LONGUEUR, xCentre + dirKick * (28 + this.rng() * 9)))
          : Math.max(0, Math.min(LONGUEUR, xCentre + dirKick * (12 + this.rng() * 15)));
      this.ballonCibleY = Math.max(5, Math.min(LARGEUR - 5, LARGEUR / 2 + (this.rng() * 30 - 15)));
      this.phase = 'COUP_ENVOI';
      this.timerPhase = 0;
      this.ruckPoint = { x: xCentre, y: LARGEUR / 2 };
      this.contestants = [];
      // Le ballon part en cloche depuis le point de coup d'envoi : il vole seul,
      // le botteur reste sur place (suivi de jeu), il n'est pas "porté".
      this.ballonEnVol = true;
      this.ballonVolX = xCentre;
      this.ballonVolY = LARGEUR / 2;
      this.ballonVolHauteur = 0;
      // Dès la première image, le ballon est encore là où il était : il revient
      // ensuite au botteur (cf. _tickCoupEnvoi, P2-84).
      if (this._retourEnvoi) { this.ballonVolX = this._retourEnvoi.x; this.ballonVolY = this._retourEnvoi.y; }
      // RENVOI AUX 22 M, PAS COUP D'ENVOI. Cette fonction sert aussi a la remise
      // en jeu apres une penalite au but ou un drop manques : le ballon repart
      // alors de la ligne des 22 m de l'equipe qui defendait, comme le veut la
      // loi. Mais l'evenement annonçait toujours « Coup d'envoi ... doit rester
      // a 10 m » : mesure sur 20 matchs, 2,75 remises en jeu par match partaient
      // des 22 m (1,95 apres une penalite manquee, 0,80 apres un drop manque) et
      // le joueur lisait « coup d'envoi » en voyant le ballon botte depuis les
      // 22 m. Et la consigne des 10 m est celle du coup d'envoi ; au renvoi aux
      // 22 m, les adversaires ne doivent pas franchir la ligne des 22 m avant le
      // coup de pied. `renvoi22` est expose par getState pour que l'interface
      // affiche aussi la bonne phase.
      this.renvoi22 = Math.abs(xCentre - LONGUEUR / 2) > 0.5;
      // Renvoi depuis la ligne d'en-but (ballon tenu dans l'en-but, P2-99).
      this.renvoiEnBut = xCentre <= 0.5 || xCentre >= LONGUEUR - 0.5;
      if (this.renvoiEnBut) {
        this.log('RENVOI_EN_BUT', equipeKick, `Renvoi depuis l'en-but botte par l'equipe ${equipeKick}`);
      } else if (this.renvoi22) {
        this.log('RENVOI_22', equipeKick, `Renvoi aux 22 m botte par l'equipe ${equipeKick}, l'equipe ${equipeReceptrice} ne franchit pas la ligne des 22 m avant le coup de pied`);
      } else {
        this.log('COUP_ENVOI', equipeKick, `Coup d'envoi botte par l'equipe ${equipeKick}, l'equipe ${equipeReceptrice} doit rester a 10m`);
      }
    }

    // Réception du coup d'envoi : le ballon, en l'air pendant le vol, peut être
    // récupéré par l'une ou l'autre équipe (contest aérien), pas systématiquement
    // par l'équipe "attendue" — conformément au fait qu'un coup d'envoi est
    // réellement disputé en l'air, pas une simple remise en main.
    _tickCoupEnvoi(dt) {
      this.timerPhase += dt;
      // MISE EN PLACE : après un essai/une pénalité, les joueurs REJOIGNENT le
      // milieu de terrain EN COURANT (cf. _nouvelleManche, positions cibles), au
      // lieu d'y être téléportés. Le ballon reste tenu par le botteur tant que la
      // ligne n'est pas prête ; on botte dès que tout le monde est à peu près en
      // place (ou au plus tard après ~8 s, pour ne jamais bloquer le match).
      if (!this.envoiEnPlace) {
        let pireEcart = 0;
        for (const j of [...this.equipeA, ...this.equipeB]) {
          if (!j._cibleEnvoi) continue;
          avancer(j, j._cibleEnvoi.x - j.x, j._cibleEnvoi.y - j.y, dt, vitesseMs(j));
          pireEcart = Math.max(pireEcart, Math.hypot(j._cibleEnvoi.x - j.x, j._cibleEnvoi.y - j.y));
        }
        // Le ballon REVIENT jusqu'au botteur (relancé vers le centre), à ~15 m/s,
        // en vol bas ; il est ensuite tenu par le botteur jusqu'à la frappe.
        const R = this._retourEnvoi, kb = this.porteur;
        if (R && kb) {
          const dxr = kb.x - R.x, dyr = kb.y - R.y, dr = Math.hypot(dxr, dyr), pasR = 15 * dt;
          if (dr <= Math.max(pasR, 1)) { this._retourEnvoi = null; this.ballonEnVol = false; }
          else {
            R.x += dxr / dr * pasR; R.y += dyr / dr * pasR;
            this.ballonEnVol = true; this.ballonVolX = R.x; this.ballonVolY = R.y; this.ballonVolHauteur = 0.25;
          }
        } else this.ballonEnVol = false; // le ballon est tenu par le botteur, pas encore botté
        // La frappe attend que le BOTTEUR soit réellement au centre (P2-80) : avec
        // un seul plafond de 8 s, il était encore à ~10 m du point de coup d'envoi
        // dans 84 % des cas (il revient de son en-but après un essai) et le ballon
        // sautait de ses mains au centre. Plafond de sécurité 25 s pour lui.
        const k = this.porteur;
        const botteurEnPlace = !k || Math.hypot(this.xCoupEnvoi - k.x, LARGEUR / 2 - k.y) < 1.5;
        if ((botteurEnPlace && !this._retourEnvoi && (pireEcart < 2 || this.timerPhase > 8)) || this.timerPhase > 25) {
          this._retourEnvoi = null;
          this.envoiEnPlace = true;
          this.timerPhase = 0; // le vol du ballon repart de zéro une fois en place
          for (const j of [...this.equipeA, ...this.equipeB]) j._cibleEnvoi = null;
        }
        return;
      }
      // Le ballon est botté : il file nettement plus vite qu'un joueur ne court
      // (~18 m/s contre ~7-9 m/s), c'est tout l'intérêt du coup de pied. La durée
      // de vol découle donc de la distance bottée et d'une vitesse de ballon
      // élevée (bornée pour garder un minimum de temps de chandelle visible).
      const dxVol = this.ballonCibleX - this.xCoupEnvoi;
      const dyVol = this.ballonCibleY - LARGEUR / 2;
      const distVol = Math.hypot(dxVol, dyVol);
      const VITESSE_BALLON = 18;
      const duree = Math.max(0.9, Math.min(2.0, distVol / VITESSE_BALLON));
      const t = Math.min(1, this.timerPhase / duree);
      // Le ballon vole seul du point de coup d'envoi vers sa cible, en cloche :
      // hauteur en sinus (0 au départ, maximale à mi-parcours, 0 à la chute).
      // Le ballon EST en l'air pendant ce vol (P2-80) : la phase de placement le
      // déclarait « tenu par le botteur » et rien ne le remettait en vol — il
      // restait affiché dans les mains du botteur puis apparaissait chez le
      // receveur (6 % seulement des pas de vol affichés en l'air).
      this.ballonEnVol = true;
      this.ballonVolX = this.xCoupEnvoi + dxVol * t;
      this.ballonVolY = LARGEUR / 2 + dyVol * t;
      this.ballonVolHauteur = Math.sin(Math.PI * t);

      for (const j of [...this.equipeA, ...this.equipeB]) {
        if (j === this.porteur) continue;
        if (j.team === this.possession) {
          // L'équipe qui botte chasse en remontant le terrain : elle part de
          // derrière le ballon et n'a pas une course directe, d'où une vitesse
          // de poursuite réduite (elle arrive rarement la première en pratique).
          avancer(j, this.ballonCibleX - j.x, this.ballonCibleY - j.y, dt, vitesseMs(j) * 0.75);
        } else {
          // L'équipe receveuse part déjà positionnée dans sa zone de réception
          // (au-delà de sa ligne des 10m) : elle converge à pleine vitesse sur
          // le point de chute pour s'organiser et capter le ballon.
          avancer(j, this.ballonCibleX - j.x, this.ballonCibleY - j.y, dt, vitesseMs(j));
        }
      }

      if (this.timerPhase >= duree) {
        // Le ballon retombe et est capté (ou contré) : fin du vol, il est de
        // nouveau tenu par un joueur.
        this.ballonEnVol = false;
        this.ballonVolHauteur = 0;
        // Coup d'envoi trop court (loi 12) : le ballon n'a pas franchi la
        // ligne des 10m adverses -> mêlée au centre pour l'équipe qui n'a pas
        // botté, qu'il ait été repris ou non par un chasseur.
        if (this.coupEnvoiCourt) {
          const equipeKick = this._dernierEquipeKick;
          this.log('COUP_ENVOI_COURT', equipeKick, `Coup d'envoi trop court par l'equipe ${equipeKick}, melee au centre pour l'equipe adverse`);
          this._accorderMelee(equipeKick, { x: this.xCoupEnvoi, y: LARGEUR / 2 });
          return;
        }
        // En pratique, l'équipe receveuse contrôle l'immense majorité des
        // coups d'envoi (elle est déjà positionnée pour réceptionner) ; un
        // ballon contré par les chasseurs (charge-down, erreur de réception)
        // reste l'exception, pas une course à égalité de chances.
        const receveurs = this.equipeReceptriceAttendue === 'A' ? this.equipeA : this.equipeB;
        const chasseurs = this.equipeReceptriceAttendue === 'A' ? this.equipeB : this.equipeA;
        const { joueur: receveurProche, distance: distReceveur } = joueurLePlusProche(receveurs, this.ballonCibleX, this.ballonCibleY);
        // Le ballon reste AU POINT DE CHUTE tant que le receveur ne l'a pas
        // rejoint (1,5 s au plus) : sinon il sautait de 3 à 7 m jusque dans ses
        // mains à la réception (P2-80).
        if (distReceveur > 1.5 && this.timerPhase < duree + 1.5) {
          this.ballonEnVol = true;
          this.ballonVolX = this.ballonCibleX; this.ballonVolY = this.ballonCibleY; this.ballonVolHauteur = 0;
          return;
        }
        const { joueur: chasseurProche, distance: distChasseur } = joueurLePlusProche(chasseurs, this.ballonCibleX, this.ballonCibleY);
        const chasseurGagne = distChasseur < 3 && this.rng() < 0.15;
        const joueur = chasseurGagne ? chasseurProche : receveurProche;
        // Le réceptionneur capte le ballon LÀ OÙ IL EST (le joueur le plus proche
        // du point de chute) : on ne le TÉLÉPORTE PLUS au point de chute (ça le
        // faisait « sauter » de quelques mètres). Le ballon vient à lui — le léger
        // écart entre le point de chute et le receveur est absorbé par
        // l'interpolation du ballon (glissé, jamais de saut du joueur).
        this.porteur = joueur;
        this.possession = joueur.team;
        this.ruckPoint = { x: joueur.x, y: joueur.y };
        if (joueur.team !== this.equipeReceptriceAttendue) {
          this._porteApresPied = true; // défense lancée, cf. rampe dans _tickPorte
          this.phase = 'PORTE';
          this.timerPhase = 0;
          this.log('CONTRE_COUP_ENVOI', joueur.team, `Coup d'envoi contre, equipe ${joueur.team} recupere le ballon`);
          return;
        }
        // Marque (loi 17) : un joueur qui réceptionne proprement le ballon dans
        // son propre en-deçà des 22 m peut crier « marque » et obtenir un coup
        // franc (pas de tir au but possible), pour dégager la pression.
        const sensReceveur = joueur.team === 'A' ? 1 : -1;
        const distPropreLigne = sensReceveur > 0 ? joueur.x : (LONGUEUR - joueur.x);
        if (distPropreLigne <= 22 && this.rng() < 0.5) {
          this._traiterCoupFranc(joueur.team, { x: joueur.x, y: joueur.y });
          return;
        }
        // Réception directe d'un coup de pied adverse : si un maul se forme dans
        // la foulée, l'exception de la loi 19 attribuera la mêlée (ballon
        // injouable) à l'équipe du réceptionneur, pas à la défense.
        this._receptionDirecte = true;
        this._porteApresPied = true; // défense lancée, cf. rampe dans _tickPorte
        this.phase = 'PORTE';
        this.timerPhase = 0;
      }
    }

    // Coup franc (loi 20) : sanction plus légère qu'une pénalité, sans
    // possibilité de tir au but ni de touche directe avec gain de terrain par
    // le pied. L'équipe joue rapidement à la main et avance un peu.
    _traiterCoupFranc(equipe, position, porteurImpose = null) {
      this._debutRemiseBallon();
      this.possession = equipe;
      const eq = equipe === 'A' ? this.equipeA : this.equipeB;
      if (porteurImpose) {
        // Joueur déjà en place (demi de mêlée à la base de la mêlée) : il tape
        // le ballon et part en courant depuis sa position, sans téléportation
        // sur la marque.
        this.porteur = porteurImpose;
      } else {
        // Le tapeur (joueur le plus proche de la marque) REJOINT la marque en
        // courant pendant la mise en place (cf. _tickJeuRapidePenalite), il n'y
        // est plus téléporté.
        const { joueur } = joueurLePlusProche(eq.filter(j => j.auSol === 0), position.x, position.y);
        this.porteur = joueur;
      }
      this.log('COUP_FRANC', equipe, `Marque, equipe ${equipe} obtient un coup franc et joue rapidement`);
      // Loi 20.12 : l'équipe non bénéficiaire recule de 10 m, comme sur pénalité.
      this._lancerJeuRapidePenalite(equipe, position);
    }

    // Met à jour la position de l'arbitre : il COURT vers sa cible (suivre le
    // jeu, se placer au ruck/à la mêlée), il n'y est jamais téléporté. Sa
    // vitesse est un peu supérieure à celle des joueurs pour qu'il reste au
    // contact du jeu ; sur un changement brusque (passe au large, coup de pied
    // long) il rejoint sa nouvelle place en courant, comme un vrai arbitre.
    _majArbitre(dt) {
      const cible = this._positionArbitre();
      const dx = cible.x - this.arbitrePos.x;
      const dy = cible.y - this.arbitrePos.y;
      const d = Math.hypot(dx, dy);
      if (d < 0.01) return;
      const pas = Math.min(d, 9 * dt); // ~9 m/s
      this.arbitrePos.x += (dx / d) * pas;
      this.arbitrePos.y += (dy / d) * pas;
    }

    // Cible de placement de l'arbitre : suit le point de ruck/mêlée pendant les
    // phases statiques, sinon reste juste derrière le porteur du ballon.
    _positionArbitre() {
      if (this.phase === 'RUCK' || this.phase === 'MAUL' || this.phase === 'MELEE') {
        return { x: this.ruckPoint.x, y: Math.max(0, Math.min(LARGEUR, this.ruckPoint.y - 5)) };
      }
      // Touche : l'arbitre ne se tient PAS sur la ligne de touche (place du juge
      // de touche) mais EN RETRAIT dans le terrain, derrière l'alignement et un
      // peu en arrière de la ligne de lancer, pour surveiller le couloir d'un
      // mètre, la rectitude du lancer et le hors-jeu des arrières. ruckPoint.y
      // est ici le bord (marque de touche) : on rentre de ~11 m vers le centre.
      if (this.phase === 'TOUCHE') {
        const versCentre = this.ruckPoint.y <= LARGEUR / 2 ? 1 : -1;
        return {
          x: this.ruckPoint.x,
          y: Math.max(0, Math.min(LARGEUR, this.ruckPoint.y + versCentre * 11)),
        };
      }
      if (this.phase === 'PENALITE_TIR' && this.positionTir) {
        return { x: this.positionTir.x, y: Math.max(0, Math.min(LARGEUR, this.positionTir.y + 5)) };
      }
      if (this.phase === 'TRANSFORMATION') {
        return { x: this.essaiX, y: Math.max(0, Math.min(LARGEUR, this.essaiY)) };
      }
      const p = this.porteur;
      return { x: p.x, y: Math.max(0, Math.min(LARGEUR, p.y - 6)) };
    }

    // Un joueur au bin (carton jaune) est retiré de la feuille de match active :
    // son équipe joue réellement à 14, au lieu d'un carton purement visuel.
    attaquants() {
      const eq = this.possession === 'A' ? this.equipeA : this.equipeB;
      return eq.filter(j => j.sinBin <= 0);
    }
    defenseurs() {
      const eq = this.possession === 'A' ? this.equipeB : this.equipeA;
      return eq.filter(j => j.sinBin <= 0);
    }

    // À la sortie d'un regroupement (mêlée, touche, ruck, maul), le 9
    // introduit ou récupère le ballon mais le transmet presque toujours
    // immédiatement à l'ouvreur (n°10), qui prend la décision tactique
    // (jouer au contact, écarter au large, botter) plutôt que de la
    // prendre lui-même. Si le 10 est indisponible (plaqué, hors du jeu),
    // le 9 garde le ballon.
    _neufVersDix(equipe, neuf) {
      // Recherche par numéro, pas par index : `equipe` est parfois la feuille
      // complète (15), parfois attaquants() déjà filtré du joueur au bin, où
      // l'index 9 ne correspond plus forcément au n°10.
      const dix = equipe.find(j => j.numero === 10);
      return (dix && dix.auSol === 0) ? dix : neuf;
    }

    // --- Mêlée suite à infraction (passe en avant / en-avant) : avantage + relance
    // pour l'équipe non fautive, conformément à la loi (knock-on / forward pass). ---
    // RÈGLE UNIQUE (loi 7) : toute nouvelle sanction sifflée pendant un avantage
    // ANNULE cet avantage. L'arbitre a arrêté le jeu et ordonné une reprise :
    // il ne peut plus revenir ensuite à une faute antérieure.
    //
    // Sans cela, l'avantage restait armé pendant que la sanction contraire
    // était accordée et jouée ; au tick suivant, `_tickAvantage` constatait que
    // la possession était passée à l'équipe fautive et « revenait à la
    // sanction ». Les DEUX équipes repartaient d'une pénalité dans la même
    // séquence — mesuré : 11 fois sur 20 matchs.
    //
    // `_tickAvantage` met déjà `this.avantage` à null AVANT d'appliquer la
    // sanction en attente : ce point d'entrée ne lui retire donc rien.
    _annulerAvantagePourNouvelleReprise(motif) {
      if (!this.avantage) return;
      const a = this.avantage;
      this.avantage = null;
      this.log('AVANTAGE_ANNULE', a.equipeBeneficiaire,
        `Avantage de l'equipe ${a.equipeBeneficiaire} annule : ${motif}`);
    }

    _accorderMelee(equipeFautive, position) {
      this._annulerAvantagePourNouvelleReprise('melee sifflee');
      this._formerMelee(equipeFautive === 'A' ? 'B' : 'A', position);
    }

    // --- Touche : un ballon porté en touche donne une touche (lancer) à l'équipe
    // adverse de celle qui l'a porté en touche, à l'endroit où il a franchi la ligne. ---
    // `cause` : 'PORTE' (le joueur a franchi la ligne de touche ballon en main,
    // loi 19.1) ou 'COUP_DE_PIED' (le ballon a trouve la touche au pied). Les
    // deux donnent une touche, mais ce ne sont PAS le meme fait de jeu : le fil
    // du match annoncait « Ballon porte en touche » y compris sur un
    // degagement, ce que le joueur lit comme une erreur. C'est aussi ce qui
    // rendait la loi 19 intestable : les deux voies ecrivaient exactement le
    // meme evenement, donc supprimer entierement la sortie du PORTEUR ne
    // faisait bouger aucun compteur (verifie par mutation).
    _accorderTouche(equipeQuiSort, position, cause) {
      const message = cause === 'COUP_DE_PIED'
        ? `Coup de pied de l'equipe ${equipeQuiSort} trouve la touche, lancer pour l'equipe adverse`
        : `Ballon porte en touche par l'equipe ${equipeQuiSort}, touche pour l'equipe adverse`;
      this.log('TOUCHE', equipeQuiSort, message);
      this.ruckPoint = { x: position.x, y: position.y };
      this.possession = equipeQuiSort === 'A' ? 'B' : 'A';
      const equipe = this.possession === 'A' ? this.equipeA : this.equipeB;
      // Loi 18 : c'est le talonneur (n°2) qui lance en touche en match reel,
      // jamais le demi de melee ni l'ouvreur - _neufVersDix (9->10) sert a la
      // sortie de balle d'un regroupement, pas au lancer de touche.
      this.porteur = equipe.find(j => j.numero === this.toucheLanceurNumero[this.possession] && j.sinBin <= 0) || equipe[8];
      this.phase = 'TOUCHE';
      this.timerPhase = 0;
      this.toucheLancer = null;
      this.penTouche = null;
      // Position des deux lignes de touche (loi 18) : avants au centre dans le
      // couloir, le reste écarté, comme préparation à un vrai contest (résolu
      // dans _tickTouche) plutôt qu'un simple timer sans enjeu.
      // Loi 18.22 : le lanceur se tient SUR la ligne de touche (les deux pieds
      // hors du terrain), pas à 5 m à l'intérieur au milieu des sauteurs. On le
      // place donc au bord du terrain ; l'alignement des sauteurs commence lui
      // à 5 m de la touche (cf. _touchePlacerLignes), laissant un vrai couloir
      // entre le lanceur et le premier sauteur.
      this.toucheLanceurY = position.y <= LARGEUR / 2 ? 0.5 : LARGEUR - 0.5;
      // Cible du lanceur (loi 18.22 : sur la marque de touche) — il doit s'y
      // rendre en courant (cf. _touchePlacerLignes), jamais y être téléporté,
      // même quand c'est l'ouvreur qui s'y trouve déjà sans rapport avec la
      // marque de touche.
      this.toucheLanceurX = Math.max(5, Math.min(LONGUEUR - 5, position.x));
      // Comme à la mêlée (cf. _capFormationMelee) : le lancer n'a lieu que
      // lorsque les avants ET le lanceur sont réellement alignés (cf.
      // _tickTouche), avec un plafond pour ne jamais bloquer le match si un
      // joueur est très excentré.
      this.toucheCapFormation = this._capFormationTouche(this.toucheLanceurX);
      this.toucheRapide = null;
      if (cause === 'COUP_DE_PIED') this._preparerToucheRapide(position);
    }

    // TOUCHE RAPIDE (loi 18, P2-98). Après un coup de pied en touche, un joueur
    // de l'équipe qui a le lancer, proche du point de sortie, court chercher le
    // ballon et peut relancer aussitôt — avant que l'alignement ne se forme —
    // vers un partenaire libre à au moins 5 m de la ligne de touche, pas devant
    // le point de sortie. Un peu plus d'une fois sur trois quand l'occasion
    // existe (~0,75 par match) : c'est l'arme de la relance après un
    // dégagement. Sinon, touche ordonnée.
    _preparerToucheRapide(position) {
      const equipe = this.possession;
      const libres = (equipe === 'A' ? this.equipeA : this.equipeB).filter(j => j.auSol === 0 && j.sinBin <= 0);
      if (!libres.length) return;
      const { joueur: lanceur, distance: d } = joueurLePlusProche(libres, position.x, position.y);
      // Jusqu'à 18 m : le joueur court chercher le ballon (même ballon, que
      // personne d'autre n'a touché). À 12 m, les dégagements à 35 m de portée
      // ne laissaient presque plus aucune touche rapide.
      if (d > 18 || this.rng() >= 0.35) return;
      this.toucheRapide = { equipe, lanceur, x: position.x, y: position.y <= LARGEUR / 2 ? 0 : LARGEUR, t: 0 };
    }

    // Course du lanceur jusqu'au ballon, puis relance si un partenaire est libre.
    // Renvoie true si la touche rapide a été jouée (le jeu reprend en PORTE).
    _tickToucheRapide(dt) {
      const R = this.toucheRapide;
      R.t += dt;
      const L = R.lanceur;
      if (L.auSol > 0 || R.t > 4) { this.toucheRapide = null; return false; }
      avancer(L, R.x - L.x, R.y - L.y, dt, vitesseMs(L));
      if (Math.hypot(L.x - R.x, L.y - R.y) > 1.5) return false;
      const eq = R.equipe === 'A' ? this.equipeA : this.equipeB;
      const adv = R.equipe === 'A' ? this.equipeB : this.equipeA;
      const sens = R.equipe === 'A' ? 1 : -1;
      const receveurs = eq.filter(j => j !== L && j.auSol === 0 && j.sinBin <= 0
        && Math.abs(j.y - R.y) >= 5
        && (j.x - R.x) * sens <= 2
        && Math.hypot(j.x - R.x, j.y - R.y) <= 20
        && !adv.some(d => d.auSol === 0 && d.sinBin <= 0 && distance(d, j) < 5));
      this.toucheRapide = null;
      if (!receveurs.length) return false;
      const receveur = joueurLePlusProche(receveurs, R.x, R.y).joueur;
      this.stats[R.equipe].touchesRapides++;
      this.log('TOUCHE_RAPIDE', R.equipe, `Touche rapide ! Le n°${L.numero} de l'equipe ${R.equipe} relance aussitot vers le n°${receveur.numero}`);
      // La séquence part du point de relance, pas de la marque de touche.
      if (this._sequence) this._sequence.depuis = Math.round(sens > 0 ? LONGUEUR - R.x : R.x);
      this.possession = R.equipe;
      this.porteur = receveur;
      this.ruckPoint = { x: receveur.x, y: receveur.y };
      this.phase = 'PORTE';
      this.timerPhase = 0;
      this.ballonEnVol = false;
      this._porteApresPied = true;
      this.toucheLancer = null;
      // Le ballon part de la ligne, des mains du lanceur, jusqu'au receveur.
      const d = Math.hypot(receveur.x - R.x, receveur.y - R.y);
      this.passeVisuelle = { fromX: L.x, fromY: L.y, cible: receveur, timer: 0, duree: Math.max(0.12, Math.min(1.0, d / 20)) };
      return true;
    }

    // Même logique que _capFormationMelee : temps réel nécessaire à l'avant le
    // plus excentré pour rallier en courant la ligne de touche (couloir
    // perpendiculaire à la ligne de touche, à l'abscisse px), borné pour ne
    // jamais bloquer le match.
    _capFormationTouche(px) {
      // Le plafond doit couvrir le trajet RÉEL (2D) de l'avant le plus éloigné
      // jusqu'à la zone d'alignement, pas seulement son décalage en profondeur
      // (x) : un avant déjà à la bonne abscisse mais encore loin sur la largeur
      // (y) mettait sinon le cap à ~3 s et le lancer partait pendant qu'il
      // courait encore vers la bande des 5-15 m, le laissant au-delà des 15 m.
      // On vise le milieu de cette bande (≈10 m de la touche), côté terrain.
      const yT = this.toucheLanceurY;
      const versCentre = (yT != null && yT <= LARGEUR / 2) ? 1 : -1;
      const cible = { x: px, y: (yT != null ? yT : LARGEUR / 2) + versCentre * 10 };
      const avants = this.equipeA.concat(this.equipeB).filter(j => j.numero <= 8 && j.sinBin <= 0);
      let pireDistance = 0;
      for (const j of avants) {
        const d = distance(j, cible);
        if (d > pireDistance) pireDistance = d;
      }
      // Le lanceur peut être bien plus loin de la marque que les avants
      // (ex. l'ouvreur qui couvrait en profondeur) : sans ce terme, le lancer
      // pourrait être autorisé avant même qu'il ait fini de courir jusqu'à
      // la touche.
      if (this.porteur) {
        const dLanceur = distance(this.porteur, { x: px, y: yT != null ? yT : LARGEUR / 2 });
        if (dLanceur > pireDistance) pireDistance = dLanceur;
      }
      const vitessePackMin = 2.5;
      return Math.min(12, Math.max(3, pireDistance / vitessePackMin));
    }

    // --- Avantage (loi 7) : au lieu de siffler la faute tout de suite, l'arbitre
    // laisse l'équipe non fautive (bénéficiaire) jouer. Si elle progresse
    // nettement ou garde le ballon, l'avantage est « joué » et le match continue
    // (la sanction est effacée). Si elle perd le ballon au profit de l'équipe
    // fautive sans contrepartie, l'arbitre revient à la marque et applique la
    // sanction en attente. Le jeu n'est PAS arrêté au moment de la faute. ---
    // `motif` (facultatif) : la faute en clair, avec son fautif — annoncée au
    // signal et rappelée si l'arbitre revient à la sanction (cf. P2-76).
    _jouerAvantage(type, equipeFautive, equipeBeneficiaire, position, motif) {
      // Un seul avantage à la fois : si un est déjà en cours, on n'en réarme pas.
      if (this.avantage) return;
      this.avantage = {
        type, // 'PENALITE' ou 'MELEE'
        equipeFautive, equipeBeneficiaire,
        position: { x: position.x, y: position.y },
        timer: 0,
        // Repère de progression : abscisse du porteur au moment de la faute.
        xDepart: this.porteur ? this.porteur.x : position.x,
        motif: motif || null,
      };
      this.log('AVANTAGE', equipeBeneficiaire, motif
        ? `${motif} : avantage pour l'equipe ${equipeBeneficiaire}`
        : `Avantage joue pour l'equipe ${equipeBeneficiaire} (faute de ${equipeFautive})`);
    }

    // Suivi de l'avantage à chaque tick : décide s'il est joué (jeu continue) ou
    // s'il faut revenir à la sanction.
    _tickAvantage(dt) {
      const a = this.avantage;
      a.timer += dt;
      // L'équipe bénéficiaire a tapé au pied (jeu territorial) ou marqué : elle a
      // utilisé son avantage. On le considère joué même si le ballon change
      // ensuite de camp sur la réception — sinon on reviendrait à la pénalité
      // alors qu'elle a délibérément choisi de jouer (et on téléporterait le
      // buteur sur la marque en plein vol de balle).
      if (this.phase === 'COUP_DE_PIED_JEU' || this.ballonEnVol
        || this.phase === 'ESSAI' || this.phase === 'TRANSFORMATION' || this.phase === 'PENALITE_TIR') {
        this.avantage = null;
        this.log('AVANTAGE_JOUE', a.equipeBeneficiaire, `Avantage joue pour l'equipe ${a.equipeBeneficiaire}`);
        return;
      }
      // Avantage non concrétisé : le ballon est passé à l'équipe fautive sans que
      // le bénéficiaire en tire profit -> retour à la marque, sanction appliquée.
      if (this.possession === a.equipeFautive) {
        this.avantage = null;
        this.log('AVANTAGE_REVIENT', a.equipeBeneficiaire, a.motif
          ? `Pas d'avantage : retour a la sanction (${a.motif.charAt(0).toLowerCase() + a.motif.slice(1)}) pour l'equipe ${a.equipeBeneficiaire}`
          : `Pas d'avantage : retour a la sanction pour l'equipe ${a.equipeBeneficiaire}`);
        if (a.type === 'PENALITE') this._traiterPenalite(a.equipeBeneficiaire, a.position);
        else this._accorderMelee(a.equipeFautive, a.position);
        return;
      }
      // Avantage obtenu : gain de terrain net (>= 12 m) ou ballon conservé assez
      // longtemps (l'équipe a fait au moins aussi bien qu'avec la pénalité). Le
      // jeu continue, la sanction est effacée.
      const sens = a.equipeBeneficiaire === 'A' ? 1 : -1;
      const gain = this.porteur ? (this.porteur.x - a.xDepart) * sens : 0;
      if (gain >= 12 || a.timer >= 5) {
        this.avantage = null;
        this.log('AVANTAGE_JOUE', a.equipeBeneficiaire, `Avantage obtenu, le jeu continue pour l'equipe ${a.equipeBeneficiaire}`);
      }
    }

    // --- Pénalité : selon la distance aux poteaux, l'équipe non fautive tente un
    // coup de pied au but (3 points) ou joue rapidement et avance (touche de pénalité
    // simplifiée), conformément aux options réelles de la loi sur les pénalités. ---
    _traiterPenalite(equipeBeneficiaire, position) {
      this._annulerAvantagePourNouvelleReprise('penalite sifflee');
      this.stats[equipeBeneficiaire === 'A' ? 'B' : 'A'].penalitesConcedees++;
      const sensAttaque = equipeBeneficiaire === 'A' ? 1 : -1;
      const distanceButs = sensAttaque > 0 ? (LONGUEUR - position.x) : position.x;
      // Faute délibérée sur sa propre ligne : carton jaune (loi 9.11), puis la
      // pénalité se joue. Ce n'est PAS un essai de pénalité : celui-ci exige
      // qu'un essai probable ait été empêché (loi 8.3), ce que le moteur sait
      // établir sur un maul lancé écroulé (cf. _maulSanctionner). Accordé ici au
      // hasard sur une pénalité sur quatre à moins de 5 m, il donnait 0,35 essai
      // de pénalité par match de plus, pour ~0,1 à 0,15 au total en vrai.
      if (distanceButs <= 5 && this.rng() < 0.25) {
        const fautive = equipeBeneficiaire === 'A' ? 'B' : 'A';
        const eqFautive = fautive === 'A' ? this.equipeA : this.equipeB;
        const { joueur: fautif } = joueurLePlusProche(eqFautive.filter(j => j.sinBin <= 0), position.x, position.y);
        if (fautif) {
          fautif.sinBin = 600 * this._echelleArret;
          this.stats[fautive].cartonsJaunes++;
          this._statJoueur(fautif).cartonsJaunes++;
          this.log('CARTON_JAUNE', fautive, `Carton jaune pour l'equipe ${fautive} (n°${fautif.numero}) : faute deliberee sur sa ligne - a 14 pendant ${Math.round(fautif.sinBin)}s`);
        }
      }
      // Pénalité en touche : contrairement à une touche en jeu courant, c'est
      // ici l'équipe qui a botté qui conserve le lancer (loi 20). Utilisée pour
      // gagner du terrain quand le but est hors de portée, ou pour chercher un
      // maul tout près de la ligne adverse plutôt que 3 points — deux tactiques
      // réelles très fréquentes que seul le jeu rapide à la main ne représentait
      // pas jusqu'ici.
      const tropLoinPourTir = distanceButs > 45;
      const procheLigneAdverse = distanceButs >= 5 && distanceButs <= 22;
      // CHOIX DU CAPITAINE SELON LE SCORE (P2-101). Dans le dernier quart du
      // match, une équipe menée de plus de 3 points n'a que faire de 3 points :
      // elle joue la touche (au coin, pour un maul) ; une équipe qui mène, ou
      // à égalité, prend les points dès qu'elle est à portée. Avant, le choix
      // ne dépendait que de la distance, à la 75e minute comme à la 5e.
      const adversaire = equipeBeneficiaire === 'A' ? 'B' : 'A';
      const ecartScore = this.score[equipeBeneficiaire] - this.score[adversaire];
      const finDeMatch = isFinite(this.dureeMatch) && this.dureeMatch > 0 && this.tempsMatch >= this.dureeMatch * 0.75;
      if (finDeMatch && ecartScore < -3 && distanceButs >= 5 && distanceButs <= 45 && this.rng() < 0.8) {
        this.log('CHOIX_CAPITAINE', equipeBeneficiaire,
          `Menee de ${-ecartScore} points, l'equipe ${equipeBeneficiaire} renonce aux poteaux et joue la touche`);
        this._accorderPenaliteTouche(equipeBeneficiaire, position);
        return;
      }
      const prendLesPoints = finDeMatch && ecartScore >= 0 && distanceButs >= 5 && distanceButs <= 45;
      // Taux releve de 0,15 a 0,45 pres de la ligne : a 15 %, une penalite dans
      // les 22 adverses partait presque toujours au but (3 points) et le moteur
      // ne construisait quasiment jamais la sequence la plus banale du rugby
      // moderne — penalite au coin, touche a 5 m, maul penetrant. Mesure : 0,25
      // maul par match a moins de 5 m de la ligne adverse.
      // HORS DE PORTÉE DE TIR, ON TAPE EN TOUCHE. Le taux était de 35 % : les
      // 65 % restants partaient en jeu rapide à la main. Mesuré au pas réel,
      // 20 matchs : sur 19,6 pénalités par match, 8,6 jeux rapides, 6,7 tirs au
      // but et seulement 4,3 coups de pied en touche. Une pénalité dans son
      // camp se joue en touche (on gagne 30-40 m et on garde le lancer) ; le jeu
      // rapide est l'exception. Conséquences mesurées à 85 % :
      //   pénalités : 5,8 au but, 9,9 en touche, 2,8 en jeu rapide
      //   touches dans les 22 adverses   1,75 -> 3,40 par match (réel 4 à 6)
      //   touches au total               21,1 -> 26,3 (repère du Tournoi ~25)
      //   essais 6,8 -> 7,0 (réel 7), points 55,8 -> 55,3
      // Et la calibration devient ROBUSTE : 12/14 sur les graines 1-20 ET sur
      // les graines 21-40, là où l'ancien taux échouait sur le second jeu
      // (touches 19,1, catégorie essentielle) et ne passait la CI que grâce
      // au jeu de graines qu'elle exécute. 65 % donnait 13/14 mais des essais
      // à 7,5-7,8, à 0,2 de la borne : trop peu de marge.
      if (!prendLesPoints && ((tropLoinPourTir && this.rng() < 0.85) || (procheLigneAdverse && this.rng() < 0.45))) {
        this._accorderPenaliteTouche(equipeBeneficiaire, position);
        return;
      }
      // Tir au but : une équipe à portée tape au but bien plus souvent qu'à la
      // main (calibré sur ~48,5 pts/match réels, dont ~4-6 pénalités au but).
      // L'ancien taux 0.55 ne donnait que ~1,4 tir/match ; ~0.85 rapproche des
      // ~5 tentatives réelles.
      const enZoneDeTir = distanceButs >= 5 && distanceButs <= 45;
      if (enZoneDeTir && (prendLesPoints || this.rng() < 0.85)) {
        this.equipeAuTir = equipeBeneficiaire;
        // Le ballon est à l'équipe qui tire (loi 20), comme pour le jeu rapide
        // ci-dessous : la possession restait au camp fautif pendant tout le tir,
        // si bien que le buteur tenait le ballon d'une équipe « sans ballon »
        // (QA-RM-002 : 1,8 % des instants d'un match).
        this.possession = equipeBeneficiaire;
        this.positionTir = { x: position.x, y: position.y, distanceButs };
        // Place le buteur (l'ouvreur) sur le point de pénalité : sans ça, le
        // porteur reste figé là où la faute a été commise et rien ne montre
        // visuellement qu'un coup de pied au but va être tenté.
        const eqTir = equipeBeneficiaire === 'A' ? this.equipeA : this.equipeB;
        // Le buteur (l'ouvreur) REJOINT le tee en courant pendant la mise en
        // place (cf. _penaliteTirPlacerJoueurs), il n'y est plus téléporté ; le
        // ballon est posé sur le tee (cf. getState, ballon sur la marque en
        // PENALITE_TIR).
        this._debutRemiseBallon();
        this.porteur = eqTir.find(j => j.numero === this.buteurNumero[equipeBeneficiaire] && j.sinBin <= 0) || eqTir[9];
        this.phase = 'PENALITE_TIR';
        this.timerPhase = 0;
        this.tirEnPlace = false;
        this.log('PENALITE', equipeBeneficiaire, `Penalite, equipe ${equipeBeneficiaire} tente un coup de pied au but`);
        return;
      }
      // Jeu rapide (tap-and-go). Loi 20 : le ballon revient à l'équipe NON
      // fautive — avant ce correctif, la possession et le porteur restaient ceux
      // de l'équipe FAUTIVE (mesuré : bénéficiaire A → possession B), si bien que
      // la pénalité ne donnait même pas le ballon au bon camp. On donne donc le
      // ballon au bénéficiaire (son n°9 tape) et on arme la mise en place.
      this._debutRemiseBallon();
      this.possession = equipeBeneficiaire;
      const eqBen = equipeBeneficiaire === 'A' ? this.equipeA : this.equipeB;
      const neuf = eqBen.find(j => j.numero === 9 && j.auSol === 0);
      this.porteur = neuf || joueurLePlusProche(eqBen.filter(j => j.auSol === 0), position.x, position.y).joueur;
      this.log('PENALITE', equipeBeneficiaire, `Penalite, equipe ${equipeBeneficiaire} joue rapidement et avance`);
      this._lancerJeuRapidePenalite(equipeBeneficiaire, position);
    }

    // Mise en place d'une pénalité/coup franc joué rapidement à la main (loi
    // 20.12). Le tapeur (possession/porteur déjà fixés par l'appelant) REJOINT la
    // marque en courant et l'équipe fautive RECULE de 10 m vers son en-but, le
    // tout EN COURANT pendant une brève phase de mise en place (cf.
    // _tickJeuRapidePenalite) — jamais une téléportation. Le jeu courant ne
    // reprend qu'une fois le tapeur sur la marque et les fautifs repliés : c'est
    // ce qui crée enfin l'espace réel de la pénalité (sans lui, le tapeur se
    // faisait plaquer aussitôt par un défenseur resté sur la marque).
    _lancerJeuRapidePenalite(equipeBeneficiaire, position) {
      // Le coup de sifflet arrête le jeu : une passe encore en vol (par exemple
      // interceptée juste avant que l'arbitre ne revienne à la pénalité) est
      // annulée, sinon elle masquait le ballon posé sur la marque et le
      // ballon sautait dans les mains du tapeur (9 m, P2-95).
      this.passeVisuelle = null;
      // La faute arrete le jeu : une phase nee d'un coup de pied cesse de
      // l'etre, la defense repart avec sa rampe normale apres la reprise.
      this._porteApresPied = false;
      const sens = equipeBeneficiaire === 'A' ? 1 : -1;
      const eqDef = equipeBeneficiaire === 'A' ? this.equipeB : this.equipeA;
      // Ligne des 10 m, bornée à l'en-but des fautifs (équivalent loi 19.32 :
      // marque à moins de 10 m de leur ligne → recul jusqu'à la ligne d'en-but).
      const ligne = Math.max(0, Math.min(LONGUEUR, position.x + sens * 10));
      // Temps mort d'une pénalité JOUÉE RAPIDEMENT : 8 s de plancher.
      //
      // Le plancher était de 26 s, justifié par le temps mort réel d'une
      // pénalité (l'arbitre explique, les fautifs reculent : 25-40 s). C'est
      // vrai d'une pénalité tirée au but ou en touche ; mais un jeu rapide se
      // définit précisément par le fait qu'on n'attend pas — on tape pendant
      // que la défense recule encore. L'évènement annonçait « l'équipe joue
      // rapidement et avance » et le joueur voyait ensuite une demi-minute sans
      // rien. Mesuré au pas réel : 13,0 jeux rapides par match, 25,8 s chacun,
      // soit 359 s de temps mort — l'essentiel du déficit de temps de jeu
      // effectif (30,0 min pour une fourchette 32-42).
      //
      // Raccourci SEUL, ce plancher faisait déborder les essais (P2-44) : le
      // temps mort masquait une attaque trop productive. Il n'est livré
      // qu'avec la défense de face qui monte au contact et la défense lancée
      // après un coup de pied (cf. _tickPorte, P2-49), qui retirent d'abord
      // cet excès. La condition « fautifs repliés à 10 m » reste en place, et
      // le plafond de 40 s aussi.
      this.penaliteRecul = { sens, eqDef, ligne, markX: position.x, markY: position.y,
        timer: 40 * this._echelleArret, attente: 1 * this._echelleArret };
      // Le ballon est POSÉ sur la marque (loi 20.4) : il y va depuis là où il
      // était affiché (ruck, mêlée, porteur fautif), puis le tapeur l'y
      // rejoint. Avant, il sautait dans les mains du n°9 (~8 m, jusqu'à 14 m).
      if (this._remiseBallon) this._remiseBallon.marque = { x: position.x, y: position.y };
      this.phase = 'PORTE';
      this.timerPhase = 0;
    }

    // Phase de mise en place du jeu rapide : tapeur vers la marque, fautifs vers
    // la ligne des 10 m, tout en course. Se termine (le ballon est « tapé », jeu
    // courant normal) dès que tapeur en place ET fautifs repliés, ou au délai.
    _tickJeuRapidePenalite(dt) {
      const R = this.penaliteRecul;
      R.timer -= dt;
      let pret = true;
      if (this.porteur) {
        avancer(this.porteur, R.markX - this.porteur.x, R.markY - this.porteur.y, dt, vitesseMs(this.porteur));
        if (distance(this.porteur, { x: R.markX, y: R.markY }) > 1) pret = false;
      }
      for (const j of R.eqDef) {
        // Un fautif AU SOL dans les 10 m bloque aussi la reprise (loi 20.14) :
        // l'ignorer le laissait se relever DANS les 10 m une fois le jeu repris,
        // libre de plaquer. Il ne peut pas bouger tant qu'il est a terre ; on
        // attend qu'il se releve et recule (plafond de 40 s inchange).
        if (j.auSol > 0) {
          if ((j.x - R.ligne) * R.sens < -0.5) pret = false;
          continue;
        }
        // En deçà de la ligne des 10 m (entre la marque et la ligne) → se replie
        // en reculant (x vers la ligne), en gardant sa largeur (y inchangé).
        if ((j.x - R.ligne) * R.sens < -0.5) {
          avancer(j, R.ligne - j.x, 0, dt, vitesseMs(j));
          pret = false;
        }
      }
      // JEU RAPIDE = RAPIDE (retour joueur, P2-123) : on peut jouer une
      // pénalité vite comme prendre son temps. Ici l'équipe a choisi de la
      // jouer vite : le tapeur frappe dès qu'il est sur la marque (une seconde
      // pour poser le ballon), sans attendre que les fautifs aient reculé. Ceux
      // qui sont encore dans les 10 m sont HORS-JEU (loi 20.14) : ils doivent
      // se replier et ne peuvent pas plaquer avant d'y être (même mécanisme que
      // le hors-jeu sur coup de pied). Avant, un plancher de 8 s et l'attente du
      // repli complet laissaient tout le monde en place, immobile.
      R.attente -= dt;
      if (R.attente > 0) return;
      const tapeurPret = !this.porteur || distance(this.porteur, { x: R.markX, y: R.markY }) <= 1;
      if (tapeurPret || R.timer <= 0) {
        for (const j of R.eqDef) {
          if ((j.x - R.ligne) * R.sens < -0.5) { j.horsJeuKick = DUREE_HORS_JEU_KICK; j.horsJeuKickX = R.ligne; }
        }
        this.penaliteRecul = null;
      }
    }

    // Pénalité jouée en touche : l'équipe qui a botté conserve le lancer
    // (à l'inverse d'une touche en jeu courant), avec un gain de terrain
    // réaliste borné au terrain.
    _accorderPenaliteTouche(equipe, position) {
      this.log('PENALITE', equipe, `Penalite, equipe ${equipe} joue en touche et conserve le lancer`);
      this.possession = equipe;
      // Une touche venait peut-être d'être accordée dans ce même instant (plaqué
      // en touche, puis retour à la sanction de l'avantage) : sa touche RAPIDE
      // préparée pour l'adversaire n'a plus lieu d'être. Restée armée, elle
      // partait pendant l'élan du buteur et le ballon traversait le terrain.
      this.toucheRapide = null;
      // Loi 5.7 : tapée en touche après la sonnerie, la pénalité donne une
      // touche qui se joue (la « dernière touche » d'une mi-temps).
      if (this._sonnerie) { this._sonnerie.aJouer = 'TOUCHE'; this._sonnerie.vu = false; }
      const sensAttaque = equipe === 'A' ? 1 : -1;
      // AU COIN. Une penalite tapee en touche ne gagne pas dix metres : elle
      // part au coin. Depuis 45 m, un buteur trouve la touche a 5-10 m de la
      // ligne, soit 35-40 m gagnes. Le gain de 10-20 m faisait atterrir la
      // touche loin de la ligne, et la sequence la plus banale du rugby moderne
      // — penalite au coin, touche a 5 m, maul — ne se construisait pas.
      //
      // Mesure sur 20 matchs : 3,95 penalites tapees en touche par match, mais
      // seulement 0,40 touche dans les 22 adverses. Avec la portee reelle, 1,40.
      // (Zero touche a moins de 5 m dans les deux cas : c'est la LOI 18, la
      // ligne de touche ne peut pas etre formee a moins de 5 m de la ligne de
      // but — le moteur l'applique deja.)
      //
      // La portee depend du JEU AU PIED du buteur designe (reglage d'equipe,
      // cf. buteurNumero) : choisir son botteur devient un vrai choix
      // territorial, au lieu d'un tirage identique pour tous les clubs.
      const buteurTouche = (equipe === 'A' ? this.equipeA : this.equipeB)
        .find(j => j.numero === this.buteurNumero[equipe] && j.sinBin <= 0);
      const jp = buteurTouche && typeof buteurTouche.jeuPied === 'number' ? buteurTouche.jeuPied : 60;
      const portee = 22 + (jp - 60) * 0.35;
      const gain = Math.max(8, portee * (0.75 + this.rng() * 0.5));
      const xTouche = Math.max(0, Math.min(LONGUEUR, position.x + sensAttaque * gain));
      const eqLanceur = equipe === 'A' ? this.equipeA : this.equipeB;
      // Loi 18 : le talonneur (n°2) lance, comme a la touche en jeu courant
      // (cf. _accorderTouche).
      this.porteur = eqLanceur.find(j => j.numero === this.toucheLanceurNumero[equipe] && j.sinBin <= 0) || eqLanceur[8];
      const xLanceur = Math.max(5, Math.min(LONGUEUR - 5, xTouche));
      // Loi 18.22 : le lanceur sur la ligne de touche (cf. _accorderTouche),
      // pas à 5 m à l'intérieur.
      const yLanceur = position.y <= LARGEUR / 2 ? 0.5 : LARGEUR - 0.5;
      this.ruckPoint = { x: xLanceur, y: yLanceur };
      this.phase = 'TOUCHE';
      this.timerPhase = 0;
      this.toucheLancer = null;
      this.toucheLanceurY = yLanceur;
      // Cible à rejoindre en courant (cf. _touchePlacerLignes), jamais une
      // téléportation : le lanceur peut être loin du point de pénalité si le
      // gain de terrain du coup de pied est important.
      this.toucheLanceurX = xLanceur;
      this.toucheCapFormation = this._capFormationTouche(xLanceur);
      // LE COUP DE PIED EN TOUCHE SE VOIT (P2-79). Avant, le ballon passait
      // directement de la marque de pénalité à la marque de touche, 22 à 40 m
      // plus loin, sans que personne ne frappe. Le buteur rejoint la marque en
      // courant, frappe, et le ballon vole jusqu'à la touche (cf.
      // _tickPenaliteTouche). Durée totale de la touche inchangée : le lancer
      // reste soumis au même délai minimal (cf. _tickTouche).
      const buteurFrappe = buteurTouche || eqLanceur.find(j => j.numero === 10 && j.sinBin <= 0) || null;
      // Le ballon part de là où on le voyait (vol du lancer en touche, ruck…)
      // et rejoint la marque à vue, au lieu d'y apparaître (P2-91).
      const depart = this._positionBallonAffichee() || { x: position.x, y: position.y };
      this.penTouche = buteurFrappe ? {
        etape: 'APPROCHE', buteur: buteurFrappe, equipe, t: 0,
        marque: { x: position.x, y: position.y }, cible: { x: xLanceur, y: yLanceur },
      } : null;
      if (this.penTouche) {
        this.ballonEnVol = true;
        this.ballonVolX = depart.x; this.ballonVolY = depart.y; this.ballonVolHauteur = 0;
        // Assez vite pour être sur la marque avant la frappe (pose minimale de
        // 0,8 s, cf. _tickPenaliteTouche) : n'agit que sur l'affichage.
        // Plafonnée à 25 m/s : quand la marque est loin (retour à une sanction
        // après un long avantage, jusqu'à 40 m), le ballon traversait le
        // terrain à 57 m/s, un saut de 5,7 m par image. La frappe attend
        // désormais qu'il soit posé (cf. _tickPenaliteTouche).
        this.penTouche.vitesseBallon = Math.max(10, Math.min(25, Math.hypot(position.x - depart.x, position.y - depart.y) / 0.7));
      }
    }

    // Pénalité tapée en touche, à vue : le buteur court jusqu'à la marque (le
    // ballon y est posé), frappe, et le ballon décrit une cloche jusqu'à la
    // marque de touche, où l'affichage le pose ensuite (cf. getState, TOUCHE).
    _tickPenaliteTouche(dt) {
      const P = this.penTouche;
      P.t += dt;
      if (P.etape === 'APPROCHE') {
        const b = P.buteur;
        avancer(b, P.marque.x - b.x, P.marque.y - b.y, dt, vitesseMs(b));
        // Le ballon est ramené à la marque (~10 m/s) pendant que le buteur y court.
        const dxm = P.marque.x - this.ballonVolX, dym = P.marque.y - this.ballonVolY, dm = Math.hypot(dxm, dym), pas = (P.vitesseBallon || 10) * dt;
        if (dm <= pas) { this.ballonVolX = P.marque.x; this.ballonVolY = P.marque.y; }
        else { this.ballonVolX += dxm / dm * pas; this.ballonVolY += dym / dm * pas; }
        this.ballonVolHauteur = 0;
        // Plafond : un buteur très éloigné ne bloque jamais la touche.
        // Pose du ballon : jamais de frappe avant 0,8 s, même si le buteur est
        // déjà sur la marque (durée fixe : la simulation ne dépend pas de
        // l'affichage).
        const ballonPose = this.ballonVolX === P.marque.x && this.ballonVolY === P.marque.y;
        if ((distance(b, P.marque) < 1.5 && P.t >= 0.8 && ballonPose) || P.t > 10) {
          // Le vol part de là où est le ballon (en principe déjà sur la marque).
          P.etape = 'VOL'; P.t = 0; P.depart = { x: this.ballonVolX, y: this.ballonVolY };
          this.log('PENALITE_TOUCHE_FRAPPE', P.equipe, `Le n°${b.numero} tape la penalite en touche`);
        }
        return;
      }
      const duree = 2.2;
      const k = Math.min(1, P.t / duree);
      const D = P.depart || P.marque;
      this.ballonVolX = D.x + (P.cible.x - D.x) * k;
      this.ballonVolY = D.y + (P.cible.y - D.y) * k;
      this.ballonVolHauteur = 1.2 * Math.sin(Math.PI * k);
      if (k >= 1) {
        this.ballonEnVol = false;
        this.ballonVolHauteur = 0;
        this.penTouche = null;
      }
    }

    // À la sortie d'un regroupement (ruck/maul/mêlée/touche), les joueurs qui
    // étaient liés tout près du point de regroupement ont besoin d'un instant
    // pour se relever et rejoindre l'alignement : sans ce délai, le défenseur
    // qui vient juste d'être contestant au ruck, resté au même endroit, devient
    // mécaniquement le défenseur le plus proche et plaque le porteur suivant dès
    // la première fraction de seconde de jeu courant (cf. _tickPorte).
    // `duree` : cf. INERTIE DE COURSE (avancer) — se relever puis rejoindre
    // l'alignement couvre la meme distance qu'avant, mais prend desormais
    // environ deux fois plus de temps ; la fenetre est donc doublee (2 -> 4 s).
    _imposerRecuperationRuck(pt, rayon = 6, duree = 4) {
      // Tout près de sa propre ligne d'en-but, la défense est naturellement
      // massée sur un espace réduit (peu de place pour se replier) : un rayon
      // d'exclusion large y évacue mécaniquement TOUTE la couverture proche du
      // point de regroupement, laissant le couloir vers l'essai grand ouvert
      // dès la sortie suivante. On réduit donc le rayon près des lignes
      // d'en-but pour ne lever que les contestants immédiats, pas tout le
      // rideau défensif du point de marque.
      const pres = pt.x <= 8 || pt.x >= LONGUEUR - 8;
      const rayonEffectif = pres ? Math.min(rayon, 3) : rayon;
      for (const j of [...this.equipeA, ...this.equipeB]) {
        if (distance(j, pt) < rayonEffectif) j.ruckRecovery = duree;
      }
    }

    // Qui court REELLEMENT vers le ballon apres un coup de pied. Dans un vrai
    // match, une equipe n'envoie pas quinze joueurs sur le point de chute :
    // deux ou trois CHASSEURS montent (l'aile et le centre du cote du coup de
    // pied), et cote receveur l'arriere et un soutien vont au ballon — tout le
    // reste tient sa ligne et se replace pour la suite. Le moteur faisait
    // converger les TRENTE joueurs : le receveur etait etouffe (un adversaire a
    // moins de 3 m sur 20 % des receptions) et aucune relance n'etait possible.
    _groupeVersBallon(equipe, cibleX, cibleY, nb) {
      return new Set(
        equipe.filter((j) => j.auSol === 0 && j.sinBin <= 0 && !(j.horsJeuKick > 0))
          .sort((a, b) => distance(a, { x: cibleX, y: cibleY }) - distance(b, { x: cibleX, y: cibleY }))
          .slice(0, nb)
      );
    }

    // Placement d'un joueur qui NE va PAS au ballon : il tient son couloir et
    // se replace en profondeur par rapport au point de chute, pret pour la
    // phase suivante, au lieu de courir sur le ballon.
    _tenirLigneCoupDePied(j, cibleX, dt) {
      const cibleXj = cibleX - j.sensAttaque * 8;
      avancer(j, cibleXj - j.x, j.channelY - j.y, dt, vitesseMs(j) * 0.7);
    }

    // Repli d'un chasseur HORS-JEU (loi 10) : il court vers la ligne du coup de
    // pied et redevient jouable des qu'il l'a repassee.
    _replierHorsJeuKick(j, dt) {
      const ligne = j.horsJeuKickX;
      if (ligne == null) { j.horsJeuKick = 0; return; }
      const sens = j.sensAttaque;
      if ((j.x - ligne) * sens <= 0) { j.horsJeuKick = 0; return; }
      avancer(j, ligne - j.x, 0, dt, vitesseMs(j));
    }

    // Zone du terrain du point de vue de l'équipe en possession (distance à
    // FRANCHIR pour aplatir) : détermine le registre tactique réel (kick très
    // fréquent dans son 22, jeu au sol/maul tout près de la ligne adverse...)
    // plutôt qu'un comportement uniforme sur tout le terrain.
    _zoneTerrain(porteur) {
      const distButs = porteur.sensAttaque > 0 ? (LONGUEUR - porteur.x) : porteur.x;
      if (distButs <= 5) return 'CINQ_M';
      if (distButs <= 22) return 'OPP_22';
      if (distButs <= 50) return 'OPP_HALF';
      if (distButs < 78) return 'OWN_HALF';
      return 'OWN_22';
    }

    // FRANCHISSEMENT (line break), définition courante : le porteur passe la
    // PREMIÈRE LIGNE de défense — plus aucun défenseur debout devant lui dans
    // son couloir (10 m de part et d'autre) — puis gagne encore 5 m. Le moteur
    // ne comptait qu'après un plaquage manqué suivi d'espace : 4,7 par match
    // (réel ~18), alors que 69 % des essais suivent une course où le porteur
    // n'a plus personne devant lui. Pur comptage, aucun tirage aléatoire : le
    // déroulé du match est inchangé. Un porteur ne compte qu'une fois.
    // Cf. TODO_AUDIT.md P2-60.
    _suivreFranchissement(porteur, def) {
      if (!porteur) return;
      if (porteur !== this._suiviPorteur) {
        this._suiviPorteur = porteur; this._ligneX0 = null; this._franchiDeja = false;
      }
      if (this._franchiDeja) return;
      if (this._ligneX0 == null) {
        const devant = def.some((d) => d.auSol === 0
          && (d.x - porteur.x) * porteur.sensAttaque > 0 && Math.abs(d.y - porteur.y) < 10);
        if (!devant) this._ligneX0 = porteur.x;
        return;
      }
      if ((porteur.x - this._ligneX0) * porteur.sensAttaque >= 5) {
        this._franchiDeja = true;
        this.stats[porteur.team].franchissements++;
        this._statJoueur(porteur).franchissements++;
        this.log('FRANCHISSEMENT', porteur.team,
          `Franchissement ! Le n°${porteur.numero} de l'equipe ${porteur.team} passe la ligne de defense`);
      }
    }

    _tickPorte(dt) {
      const porteur = this.porteur;
      const def = this.defenseurs();
      this._suivreFranchissement(porteur, def);
      // Pour la détermination du plaqueur potentiel, on exclut les défenseurs en
      // récupération post-regroupement (cf. _imposerRecuperationRuck) : sinon le
      // contestant qui vient de sortir du ruck, resté au même endroit, redevient
      // mécaniquement le défenseur le plus proche et plaque dès la fraction de
      // seconde suivante. S'ils sont tous en récupération (cas rare), on retombe
      // sur la liste complète plutôt que de ne désigner aucun plaqueur.
      // Un defenseur HORS-JEU sur coup de pied (loi 10) ne peut pas plaquer : il
      // doit d'abord se remettre en jeu (cf. _replierHorsJeuKick).
      // Sans défenseur disponible, on retombe d'abord sur ceux qui sont en jeu :
      // à 2 m de l'en-but, une pénalité jouée vite met toute la défense
      // hors-jeu, et la liste complète désignait un fautif comme plaqueur.
      const defDisponibles = def.filter(j => j.ruckRecovery <= 0 && !(j.horsJeuKick > 0));
      const defEnJeu = def.filter(j => !(j.horsJeuKick > 0));
      const { joueur: defenseurProche, distance: distDef } = joueurLePlusProche(
        defDisponibles.length > 0 ? defDisponibles : defEnJeu.length > 0 ? defEnJeu : def, porteur.x, porteur.y
      );
      this.timerPhase += dt;

      // BALLON EN L'AIR : une passe met un vrai temps a parcourir la distance
      // qui separe le passeur du receveur (cf. _lancerPasseVisuelle). Tant
      // qu'elle vole, PERSONNE ne porte le ballon : on ne peut donc ni plaquer
      // le receveur, ni aplatir, ni sortir en touche, ni relancer une decision.
      // Avant, la passe etait instantanee cote jeu et seul l'affichage voyait
      // le ballon voyager : le receveur devenait plaquable dans la meme
      // fraction de seconde. Les joueurs, eux, continuent de courir pendant le
      // vol — la defense avance donc bel et bien, ce n'est pas un cadeau fait
      // a l'attaque.
      const ballonEnVolPasse = !!(this.passeVisuelle && this.passeVisuelle.timer < this.passeVisuelle.duree);

      // Combinaison scriptée en cours (sortie de mêlée/touche, cf. playbook) :
      // elle PILOTE les passes ; le porteur ne décide pas librement (kick/passe
      // libre) tant qu'elle dure. Si une passe scriptée est jouée ce tick, le
      // tick s'arrête là ; entre deux passes, le porteur court (RUN) et reste
      // plaquable ci-dessous — la défense peut donc contrer la combinaison.
      if (this.combinaison && this._tickCombinaison(dt)) return;

      // Décision tactique du porteur (botter, passer, jouer au large, foncer au
      // contact) : tranchée AVANT la résolution du plaquage ci-dessous, sur la
      // base de la zone, de la pression défensive, du soutien disponible, du
      // numéro du porteur et du score (cf. choisirActionPorteur). Le coup de
      // pied peut survenir même défenseur tout proche (dégagement sous
      // pression) ; la passe suppose de ne pas être déjà au contact.
      let action = (this.combinaison || ballonEnVolPasse) ? 'RUN' : this.choisirActionPorteur(porteur, defenseurProche, distDef, dt);
      // Sonnerie de fin de match : l'équipe menée ou à égalité ne rend pas le
      // ballon au pied, elle garde la dernière action en main.
      if (action === 'KICK' && this._sonnerie && this.miTempsJouee
          && this.score[porteur.team] <= this.score[porteur.team === 'A' ? 'B' : 'A']) {
        this._typeCoupDePiedForce = null;
        action = 'RUN';
      }
      if (action === 'KICK') { this._executerCoupDePiedJeu(porteur); return; }
      if (distDef >= 2.2 && (action === 'PASS' || action === 'JEU_LARGE') && this._tenterPasse(porteur, action === 'JEU_LARGE')) return;

      // Plaquage / contact : résolu AVANT le déplacement de ce tick, sur la
      // base de la distance déjà mesurée. Sinon, un porteur déjà à portée de
      // plaquage avançait quand même ce tick et pouvait franchir la ligne
      // d'en-but (ou la ligne de touche) avant que le contact ne soit jamais
      // résolu — un défenseur collé au porteur ne l'arrêtait jamais. Le
      // cooldown posé sur un plaquage manqué empêche de re-tirer au tick
      // suivant contre le même défenseur (sinon le raté n'aurait aucune
      // conséquence : il serait rejoué jusqu'à réussite quelques dixièmes de
      // seconde plus tard).
      if (!ballonEnVolPasse && distDef < 2.2 && defenseurProche.missCooldown <= 0 && (defenseurProche.fixeCooldown || 0) <= 0
          && !(defenseurProche.horsJeuKick > 0)) {
        const att0 = this.attaquants();
        this._compterCourse(porteur);
        this.stats[defenseurProche.team].tacklesAttempted++;
        this._statJoueur(defenseurProche).tacklesAttempted++;
        // Réussite de plaquage ~86-88 % (réel ~85-88 %) : l'ancienne base 0.83
        // donnait ~80 % de réussite et ~128 plaquages manqués/match (réel ~15 %
        // d'échec), donc trop de défenseurs battus et de franchissements.
        // FATIGUE : les plaquages sont plus SÛRS en début de match et plus
        // souvent MANQUÉS en fin de match (défenseurs fatigués) — le jeu s'ouvre
        // dans le dernier quart, comme en vrai. Effet CENTRÉ (moyenne du match
        // inchangée) : on ne change pas le taux global de plaquage ni le nombre
        // total d'essais, on déplace juste les essais vers la fin du match.
        const fatigue = (this.dureeMatch === Infinity || this.dureeMatch <= 0) ? 0.5 : Math.min(1, this.tempsMatch / this.dureeMatch);
        const bonusFraicheur = (0.5 - fatigue) * 0.06; // +0.03 au coup d'envoi, -0.03 à la 80e
        // Base 0.88 (~84 % de plaquages réussis, RÉALISTE) : les brèches viennent
        // désormais du FIXAGE/surnombre au large (cf. _tenterPasse), plus d'une
        // défense volontairement affaiblie. On peut donc remettre un taux de
        // plaquage réel tout en gardant un jeu au large qui perce.
        // Base ramenee de 0,88 a 0,855 : le taux de reussite mesure passe de
        // 86,3 % a 84,2 %, dans la fourchette reelle (84-88 %). Chaque plaquage
        // manque est une tentative de plaquage EN PLUS et un porteur qui
        // continue : c'est ce qui remet le volume de plaquages du match dans sa
        // fourchette maintenant que le nombre de regroupements est realiste.
        const probaPlaquage = Math.max(0.80, Math.min(0.95, 0.855 + bonusFraicheur + (defenseurProche.plaquage - this.porteur.vitesse) / 250));
        if (this.rng() >= probaPlaquage) {
          // Plaquage manqué : le défenseur reste hors-jeu de contact un court
          // instant, le porteur poursuit sa course sans être inquiété par lui.
          defenseurProche.missCooldown = 1.0;
          // ET IL DOIT SE RETOURNER. Un defenseur qui vient d'etre elimine
          // courait VERS le porteur : au moment ou celui-ci le passe, sa vitesse
          // pointe dans le mauvais sens. Il lui faut freiner, pivoter, puis
          // relancer — pendant ce temps il ne couvre presque aucun terrain. Le
          // moteur, lui, le faisait repartir a sa vitesse de pointe dans la
          // foulee : un franchissement ne rapportait que 7,6 m en 6 s et ne
          // devenait un essai que dans 1 % des cas (en vrai : 15 a 25 m, et une
          // percee sur quatre ou cinq finit a l'essai). Remettre sa vitesse
          // courante a zero suffit : l'inertie de course (cf. ACCELERATION) fait
          // le reste, exactement comme pour un vrai joueur pris a contre-pied.
          defenseurProche.vitesseCourante = 0;
          this.stats[defenseurProche.team].missedTackles++;
          this.stats[this.possession].defenseursBattus++; // le porteur a battu un défenseur
          this._statJoueur(defenseurProche).plaquagesManques++;
          this._statJoueur(porteur).defenseursBattus++;
          // FRANCHISSEMENT (line break) : le porteur bat le plaqueur ET se
          // retrouve en ESPACE — le motif clé de l'étude. Seuil de 7 m vers le
          // prochain défenseur : c'est la distance au-delà de laquelle un
          // défenseur ne peut plus intervenir immédiatement, ce qui correspond à
          // un vrai « clean break » (World Rugby). Un seuil de 12 m ne comptait
          // presque jamais (0,1/match) alors qu'un match réel en montre ~8-20 ;
          // 6 m ramène le compteur au cœur de cette fourchette sans rien changer
          // au jeu (score et essais strictement identiques : pur comptage).
          const autres = def.filter((d) => d !== defenseurProche && d.auSol === 0);
          if (joueurLePlusProche(autres, porteur.x, porteur.y).distance > 6 && !this._franchiDeja) {
            this.stats[this.possession].franchissements++;
            this._statJoueur(porteur).franchissements++;
            this._franchiDeja = true; // un porteur ne compte qu'une fois (cf. _suivreFranchissement)
          }
          // PERCÉE EN COURS : pendant quelques secondes, le porteur qui vient de
          // battre son vis-à-vis joue en CONTINUITÉ — ses soutiens sprintent dans
          // sa foulée et, si la couverture le reprend, il garde le ballon VIVANT
          // par un offload au trailer (cf. résolution du plaquage) au lieu de
          // mourir au premier plaquage de couverture. C'est ce qui transforme un
          // franchissement en avancée longue, comme en vrai.
          porteur._percee = 2.5;
          this.log('PLAQUAGE_MANQUE', this.possession, `Plaquage manque, l'equipe ${this.possession} poursuit sa course`);
          return;
        }
        this.stats[defenseurProche.team].tacklesMade++;
        this._statJoueur(defenseurProche).tacklesMade++;
        // LOI 19 — PLAQUE EN TOUCHE. Tout pres de la ligne de touche, le
        // plaqueur pousse le porteur DEHORS : le ballon est mort, touche pour
        // l'adversaire. C'est comme cela qu'un ailier sort en touche dans un
        // vrai match — ce n'est pas lui qui choisit de sortir.
        // Mesure avant : le moteur produisait 0,0 ballon porte en touche par
        // match. Le controle de sortie du porteur existait bien mais ne se
        // declenchait JAMAIS, parce que le porteur pres d'une ligne de touche
        // crochete systematiquement vers l'interieur (cf. `evite`). Toutes les
        // touches du match venaient donc du jeu au pied.
        // Rayon 1,5 -> 2,0 m (P2-57) : un porteur plaque a deux metres de la
        // ligne y tombe (elan du plaquage, taille du corps). Mesure sur 24
        // matchs : 0,33 -> 1,08 ballon porte en touche par match (reel 2 a 4),
        // gain apres une percee inchange (14,1 -> 14,3 m). A 2,5 m on atteint
        // 2,17 mais les percees le long de la touche finissent dehors : le gain
        // apres percee tombe a 12,6 m (reel 15-25) — refuse.
        if (this.porteur.y <= 2.0 || this.porteur.y >= LARGEUR - 2.0) {
          this.log('PLAQUE_EN_TOUCHE', defenseurProche.team, `Plaque en touche par l'equipe ${defenseurProche.team}`);
          this._accorderTouche(this.possession, this.porteur, 'PORTE');
          return;
        }
        // Définition officielle du plaquage (World Rugby) : le plaqueur amène le
        // porteur au sol ET va LUI-MÊME au sol. On le montre donc brièvement
        // couché À L'ÉCRAN (marqueur PUREMENT VISUEL solVisuel, cf. renderer),
        // SANS le figer côté jeu : le figer, même 0,3 s, le retirait de la
        // défense et faisait monter les essais (4,8 -> 5,9 mesuré). Ce marqueur
        // n'a AUCUN effet sur la simulation — il illustre juste la définition.
        defenseurProche.solVisuel = 0.9;
        this.timerPhase = 0;
        // En-avant au contact : conséquence directe et distincte du plaquage
        // réussi, pas seulement un succès/échec binaire ruck-ou-rien. Taux
        // volontairement bas (~1 contact sur 75) : à 0.045 il produisait à lui
        // seul ~25 mêlées/match, très au-dessus du repère réel (8-25 mêlées
        // TOTALES par match, cf. CLAUDE.md Rôle 6).
        // Sécurité du ballon au contact modulée par la décision/lucidité du
        // porteur (0-100, cf. profils Mode Club) : neutre (60) = taux
        // historique inchangé, un porteur mal inspiré (30) en perd nettement
        // plus, un porteur très sûr (90) presque jamais.
        const facteurDecision = typeof porteur.decision === 'number'
          ? Math.max(0.5, Math.min(1.6, 1 + (60 - porteur.decision) / 75)) : 1;
        // Taux releve de 0,008 a 0,040 : l'EN-AVANT AU CONTACT est la faute de
        // main normale d'un match de rugby (10 a 15 fautes de main par match,
        // cf. CLAUDE.md Role 6). A 0,008 le moteur n'en produisait que 2,6 et
        // compensait par 12 passes en avant, ce qui n'existe pas en vrai. Le
        // taux est PAR PLAQUAGE : il a ete remonte une seconde fois (0,028 ->
        // 0,034) quand le nombre de plaquages par match a baisse vers le reel,
        // pour garder le total de fautes de main dans sa fourchette.
        if (this.rng() < 0.040 * facteurDecision) {
          this.stats[this.possession].knockOns++;
          this._statJoueur(this.porteur).enAvants++;
          this.log('MELEE_ENAVANT', this.possession, `En-avant au contact, equipe ${this.possession} - melee adverse`);
          this._accorderMelee(this.possession, porteur);
          return;
        }
        // Plaquage DOMINANT : le défenseur gagne nettement le duel (gros
        // plaqueur, lecture parfaite, porteur lent). Le porteur est REPOUSSÉ — la
        // défense AVANCE au lieu de subir : le contact recule la ligne de gain
        // (~1,2 m côté attaque) et la défense récupère un ballon « sur l'avancée »
        // (contest bien plus probable au ruck qui suit, cf. _tickRuck). C'est ce
        // qui rend un bon plaquage payant au lieu de toujours céder du terrain.
        // PLAQUAGE A DEUX. Un plaquage de rugby est tres souvent le fait de DEUX
        // defenseurs : un qui ceinture, un qui vient au soutien dans le meme
        // contact. Le releve officiel les compte tous les deux — c'est une part
        // importante des 240 a 360 plaquages d'un match. Le moteur n'en creditait
        // qu'un seul, celui qu'il avait DESIGNE, et sous-estimait donc
        // structurellement le total (215 par match mesures, contre 240-360 reels).
        // Ce n'est PAS un compteur fabrique (cf. CLAUDE.md role 6) : le second
        // plaqueur doit se trouver REELLEMENT dans le rayon de contact (le meme
        // 2,2 m qui declenche le plaquage) au moment ou celui-ci se resout, etre
        // debout, en jeu, et ne pas sortir d'un regroupement. Mesure : c'est le
        // cas sur ~11 % des plaquages, ce qui ramene le total a 246 par match.
        // Aucun effet sur le jeu lui-meme : le contact est resolu a l'identique
        // (coupler le plaquage a deux a un plaquage DOMINANT a ete essaye et
        // rejete — il rabaissait le gain de terrain de 0,83 m a 0,67 m et
        // ramenait la part des avants dans les essais de 15 % a 7 %).
        const soutienPlaquage = def.filter((d) => d !== defenseurProche && d.auSol === 0
          && d.ruckRecovery <= 0 && !(d.horsJeuKick > 0)
          && distance(d, this.porteur) < RAYON_PLAQUAGE);
        if (soutienPlaquage.length > 0) {
          const { joueur: assistant } = joueurLePlusProche(soutienPlaquage, this.porteur.x, this.porteur.y);
          this.stats[assistant.team].tacklesAttempted++;
          this.stats[assistant.team].tacklesMade++;
          this._statJoueur(assistant).tacklesAttempted++;
          this._statJoueur(assistant).tacklesMade++;
        }
        // LE RIDEAU DEVANT LE PORTEUR AU MOMENT DU CONTACT. Jusqu'ici, le gain
        // de terrain au contact ne dépendait QUE des attributs du duel
        // (plaquage du défenseur contre vitesse du porteur) : percuter au ras
        // d'une défense en place rapportait exactement autant qu'attaquer un
        // espace. Mesuré au banc A/B sur 300 matchs appariés et cinq variantes
        // du passage au contact (TODO_AUDIT.md P2-22) : `gain par temps de jeu`
        // valait 1,46 m pour le moteur et 1,45 à 1,51 m pour toutes les
        // variantes — l'écart était nul. Aller au contact était donc une option
        // GRATUITE, et la première décision que CLAUDE.md (rôle 4) exige du
        // porteur — courir, passer, aller au contact — n'avait aucune
        // conséquence ni pour l'IA ni pour le joueur qui regarde.
        //
        // On compte les défenseurs DEBOUT, en jeu, postés dans le couloir droit
        // devant le porteur (jusqu'à 7 m devant, ±5 m de large), en plus du
        // plaqueur lui-même. C'est la définition de terrain d'une « défense en
        // place » : le porteur n'a personne à fixer, il rentre dedans.
        // UN PORTEUR EN PERCÉE N'AFFRONTE PAS UNE DÉFENSE EN PLACE. Mesuré :
        // en comptant naïvement tous les défenseurs situés devant, la couverture
        // qui court EN ARRIÈRE pour revenir était comptée comme un rideau en
        // place, et le gain après un franchissement tombait de 16,6 m à 10,5 m
        // sur les mêmes 8 graines — exactement le fait de jeu le plus précieux
        // du rugby, dévalué par un compteur. `_percee` (posé quand le porteur
        // bat son vis-à-vis) marque justement le jeu déployé : on ne lui oppose
        // aucun rideau. Un défenseur qui vient d'être battu (missCooldown) est
        // exclu pour la même raison.
        const rideau = (this.porteur._percee || 0) > 0 ? 0 : def.filter((d) => d !== defenseurProche
          && d.auSol === 0 && d.ruckRecovery <= 0 && !(d.horsJeuKick > 0)
          && (d.missCooldown || 0) <= 0
          && (d.x - this.porteur.x) * this.porteur.sensAttaque > -1
          && (d.x - this.porteur.x) * this.porteur.sensAttaque < 7
          && Math.abs(d.y - this.porteur.y) < 5).length;
        const margePlaquage = defenseurProche.plaquage - this.porteur.vitesse;
        this.ruckDominant = margePlaquage > 12 && this.rng() < 0.3;
        if (this.ruckDominant) {
          // Plaquage dominant : la défense repousse le porteur (~1,2 m perdus).
          this.porteur.x -= this.porteur.sensAttaque * 1.2;
        }
        // Plaquage NORMAL : le porteur TOMBE EN AVANT. C'est la realite du
        // contact — le plaque continue sur sa lancee, se tourne et PRESENTE le
        // ballon bras tendus vers ses soutiens : le ballon est disponible
        // environ un metre devant le point de contact. Symetrique du plaquage
        // dominant ci-dessus, qui fait reculer le ballon de 1,2 m.
        // Sans cela, mesure : d'un regroupement au suivant le ballon RECULAIT
        // de 0,35 m — l'attaque ne franchissait jamais la ligne d'avantage et
        // n'entrait que 10 fois par match dans les 22 adverses.
        // Le contact est resolu des que le plaqueur est a 2,2 m (rayon de
        // plaquage) : a cet instant les deux joueurs ne se sont PAS encore
        // rencontres. Le regroupement se formait donc systematiquement deux
        // metres EN ARRIERE du point de collision reel, et le porteur, qui
        // continue sa course et tombe en avant, n'avancait jamais. Mesure : d'un
        // regroupement au suivant le ballon RECULAIT de 0,35 m, l'attaque
        // n'entrait que 10 fois par match dans les 22 adverses et aucun essai ne
        // se construisait. On amene donc le point de plaquage la ou les deux
        // joueurs se rencontrent vraiment : le porteur avance de la moitie de
        // l'ecart restant (l'autre moitie etant couverte par le plaqueur qui
        // monte), plafonnee a 2 m.
        // AVANCÉE AU CONTACT, selon ce que le porteur avait devant lui. Au
        // rugby, une percussion d'un homme dans un rideau en place gagne 0 à
        // 1 m ; c'est le ballon qui circule, crée le surnombre et attaque
        // l'espace qui gagne du terrain. Valeur unique de 0,9 m auparavant,
        // quelle que soit la situation.
        //
        // ON RÉPARTIT, ON NE BAISSE PAS. Distribution mesurée du rideau au
        // moment du contact, sur 10 matchs complets : 25,1 % des contacts se
        // font sans personne devant, 25,3 % contre un seul défenseur, 49,6 %
        // contre deux ou plus. Les trois valeurs ci-dessous sont choisies pour
        // que la moyenne pondérée — en tenant compte des 12 % de plaquages
        // dominants ajoutés au rideau — retombe sur les 0,90 m d'avant. Un
        // premier jeu de valeurs (0,15 / 0,75 / 1,6) donnait une moyenne de
        // 0,665 m : il créait bien l'écart, mais en RABAISSANT le gain de
        // terrain du match (1,46 -> 1,22 m mesuré au banc) et en faisant sortir
        // le temps de jeu effectif de sa fourchette (32,4 -> 30,9 min).
        //
        // ET SELON QUI PERCUTE. Le rideau decrit OU l'on percute ; il ne disait
        // rien de QUI percute. Mesure en contact construit (meme geometrie,
        // meme plaqueur, 40 graines) : un porteur de 90 de puissance et un de
        // 35 gagnaient EXACTEMENT le meme terrain — 1,50 m contre un rideau
        // vide, 0,53 m contre un rideau de deux, au centieme pres.
        //
        // Sur des matchs complets l'effet etait meme INVERSE : terciles de
        // puissance sur 1 998 contacts, les plus puissants gagnaient 0,50 m
        // contre 1,07 m pour les plus legers — parce que les avants percutent
        // pres du regroupement (rideau fourni) et les trois-quarts dans
        // l'espace. C'est l'exact contraire du rugby, ou l'on donne le ballon au
        // plus lourd precisement pour avancer dans le trafic (CLAUDE.md role 4).
        //
        // Centre sur la puissance MESUREE au contact (57) : un porteur moyen
        // gagne exactement ce qu'il gagnait avant — on repartit, on ne gonfle
        // pas. Borne a +/-70 % pour qu'un pilier ne traverse pas le rideau.
        const puissPorteur = typeof this.porteur.puissance === 'number'
          ? this.porteur.puissance : PUISSANCE_CONTACT_REF;
        const facteurPuissance = Math.max(0.3, Math.min(1.7,
          1 + (puissPorteur - PUISSANCE_CONTACT_REF) / 90));
        const avanceContact = (rideau >= 2 ? 0.55 : rideau === 1 ? 1.0 : 1.55) * facteurPuissance;
        if (!this.ruckDominant) this.porteur.x += this.porteur.sensAttaque * avanceContact;
        // Le terrain pris DANS le plaquage compte aussi (P2-102) : c'est là
        // que la puissance d'un avant fait la différence.
        this._compterMetresGagnes(this.porteur);
        // LOI 8 — PLAQUE SUR LA LIGNE : un porteur plaque a moins d'un metre de
        // l'en-but, et dont l'elan l'emmene quand meme au-dela de la ligne,
        // TEND LE BRAS ET APLATIT : c'est un essai, pas un regroupement. Avant
        // ce correctif le moteur formait un ruck DANS L'EN-BUT dans ce cas — la
        // facon la plus courante de marquer au ballon porte n'existait tout
        // simplement pas. L'adversaire peut encore le TENIR DEBOUT (held up),
        // auquel cas le ballon reste en jeu juste devant la ligne.
        const ligneEnBut = this.porteur.sensAttaque > 0 ? LONGUEUR : 0;
        const franchitEnAplatissant = this.porteur.sensAttaque > 0
          ? this.porteur.x >= ligneEnBut : this.porteur.x <= ligneEnBut;
        if (!this.ruckDominant && franchitEnAplatissant) {
          if (this.rng() >= PROBA_TENU_DEBOUT) {
            const marqueur = this.porteur;
            marqueur.x = ligneEnBut;
            this.score[this.possession] += 5;
            this.stats[this.possession].essais++;
            this._compterCourse(marqueur);
            this._statJoueur(marqueur).essais++;
            this._passeDecisive(marqueur);
            this.essaiX = marqueur.x;
            this.essaiY = marqueur.y;
            this.essaiEquipe = this.possession;
            this.log('ESSAI', this.possession, `Essai equipe ${this.possession} !`, this._infoEssai(marqueur));
            this.phase = 'ESSAI';
            this.timerPhase = 0;
            return;
          }
          // TENU DANS L'EN-BUT (P2-99). Loi en vigueur depuis 2022 : un ballon
          // tenu dans l'en-but n'est plus une mêlée à 5 m ni un ruck sur la
          // ligne, c'est un RENVOI DEPUIS L'EN-BUT par l'équipe qui défendait.
          // Avant, le moteur formait un ruck à 30 cm de la ligne et l'attaque
          // gardait le ballon pour l'essai suivant.
          const defense = this.possession === 'A' ? 'B' : 'A';
          this.log('EN_BUT_TENU', this.possession,
            `Ballon tenu dans l'en-but ! Le n°${defenseurProche.numero} de l'equipe ${defense} empeche l'aplatissement : renvoi depuis l'en-but`);
          this._nouvelleManche(this.possession, ligneEnBut);
          return;
        }
        this.ruckPoint = { x: this.porteur.x, y: this.porteur.y };
        this.contestants = [defenseurProche.numero];
        // RUCK QUI RECULE (plaquage dominant) : un SEUL contestant ne suffit
        // pas à représenter la réalité — sur un ballon repoussé, un 2e
        // défenseur proche vient SOUTENIR le jackal pour presser le turnover
        // (d'où le bonus de probabilité de grattage déjà appliqué plus bas,
        // cf. bonusDominant). Avant ce correctif, ce bonus existait dans le
        // calcul mais RIEN ne se voyait à l'écran : sur un ruck qui recule,
        // aucun défenseur ne venait jamais soutenir le plaqueur — signalé par
        // le joueur, confirmé dans le code (contestants toujours limité à 1,
        // même dominant). Le 2e défenseur le plus proche (hors le plaqueur
        // déjà désigné), s'il est disponible, rejoint la contestation.
        if (this.ruckDominant) {
          const autresDef = def.filter(j => j !== defenseurProche && j.auSol === 0 && j.ruckRecovery <= 0);
          if (autresDef.length > 0) {
            const { joueur: soutienDef } = joueurLePlusProche(autresDef, this.ruckPoint.x, this.ruckPoint.y);
            this.contestants.push(soutienDef.numero);
          }
        }
        // Offload : le porteur plaqué mais pas encore au sol transmet à un
        // soutien tout proche plutôt que de finir au ruck — garde le ballon vivant.
        // Le soutien doit être À HAUTEUR OU EN RETRAIT (loi 11) : un offload reste
        // une passe, il ne peut pas aller vers l'avant. Sans ce filtre, l'offload
        // était la seule voie de passe qui contournait le contrôle de la passe en
        // avant (jusqu'à ~3 m vers l'avant non sifflés, ~5/match mesurés).
        // TAUX RESTRUCTURÉ selon la situation, comme en vrai : dans un plaquage
        // banal (défense en place), l'offload est RARE (0,04 — l'ancien taux
        // uniforme 0,10 en produisait ~61/match, réel 8-15) ; mais un porteur EN
        // PERCÉE (vient de battre son vis-à-vis, _percee actif) cherche la
        // continuité : son offload au trailer porte plus loin (rayon 6 m, les
        // soutiens sprintent dans sa foulée). Taux abaissé 0,30 → 0,18
        // (docs/ANALYSE_MATCH_REEL.md, T3) : à 0,30 la simulation produisait
        // ~48,7 offloads/match contre 25 en match réel (France-Irlande 2026).
        // Plaquage banal : 0,03 -> 0,12 (P2-52). À 0,03 (le commentaire annonçait
        // 0,04), le moteur ne produisait que 4,4 offloads par match contre 25 :
        // le ballon ne vivait presque jamais dans le contact. Refusé seul en
        // P2-47 (les touches tombaient sous 20) ; livrable depuis que les
        // pénalités hors de portée vont en touche (P2-50). Mesuré : 14,9 par match.
        const enPercee = (porteur._percee || 0) > 0;
        const rayonOffload = enPercee ? 6 : 4;
        // Modulé par l'attribut "passe" du porteur (0-100) : offloader dans le
        // contact est une compétence de passe sous pression — neutre (60) =
        // taux historique inchangé.
        const facteurPasse = typeof porteur.passe === 'number'
          ? Math.max(0.5, Math.min(1.6, 1 + (porteur.passe - 60) / 90)) : 1;
        const tauxOffload = (enPercee ? 0.18 : 0.12) * facteurPasse;
        const soutiens = att0.filter(j => j !== porteur && distance(j, porteur) < rayonOffload && j.auSol === 0
          && (j.x - porteur.x) * porteur.sensAttaque <= 0.3);
        if (soutiens.length > 0 && this.rng() < tauxOffload) {
          // Sur PERCÉE, le perceur sert le soutien EN ESPACE (défenseur le plus
          // proche le plus loin), pas le plus proche dans le trafic : c'est le
          // receveur lancé dans le trou qui prolonge vraiment l'avancée. Dans un
          // plaquage banal, on garde le soutien le plus proche (offload court).
          let receveurOffload;
          if (enPercee) {
            let meilleurAir = -1;
            for (const s of soutiens) {
              const air = joueurLePlusProche(def, s.x, s.y).distance;
              if (air > meilleurAir) { meilleurAir = air; receveurOffload = s; }
            }
          } else {
            ({ joueur: receveurOffload } = joueurLePlusProche(soutiens, porteur.x, porteur.y));
          }
          // Un offload est une passe : tentée PUIS réussie, comme les autres
          // (bugs.md BUG-RM-006 — il comptait des succès sans tentative).
          this.stats[this.possession].passesTentees++;
          this.stats[this.possession].passes++;
          this.stats[this.possession].offloads++;
          this._statJoueur(porteur).passes++;
          this._statJoueur(porteur).offloads++;
          this.log('OFFLOAD', this.possession, `Offload de l'equipe ${this.possession} dans le plaquage`);
          this._lancerPasseVisuelle(porteur, receveurOffload);
          // NB : figer les défenseurs engagés sur le plaquage (fixeCooldown) a été
          // testé ici et RETIRÉ — mesuré négatif (-4 pts sur deux jeux de graines) :
          // gelés, ils ne se replient plus et se retrouvent parfaitement placés au
          // point de chute suivant. L'espace vient du receveur décalé, pas du gel.
          this.porteur = receveurOffload;
          this._receptionDirecte = false;
          return;
        }
        // Maul (loi 16) : voie secondaire (rare en plein champ), nettement plus
        // probable tout près de la ligne adverse (pick-and-go qui se transforme
        // en maul) — la voie PRINCIPALE de formation reste la touche gagnée
        // dans les 22 m adverses (cf. _tickTouche).
        const zone0 = this._zoneTerrain(porteur);
        const tauxMaul = (zone0 === 'OPP_22' || zone0 === 'CINQ_M') ? 0.085 : 0.022; // taux PAR CONTACT, releve avec la baisse du nombre de contacts
        if (soutiens.length > 0 && this.rng() < tauxMaul && Referee.maulForme(porteur, defenseurProche, soutiens.length > 0)) {
          this._formerMaul(porteur, defenseurProche);
        } else {
          // Plaqué : à terre, il ne se relèvera pas tout de suite (cf. _tickRuck
          // qui maintient cet état pendant le ruck et impose un temps de relève).
          // On mémorise l'endroit EXACT de la chute : tant qu'il est au sol, le
          // joueur y est figé (cf. tick(), gel global des joueurs au sol) et ne
          // se déplace plus du tout jusqu'à s'être relevé.
          this.porteur.auSol = 2.0;
          this.porteur._solX = this.porteur.x; this.porteur._solY = this.porteur.y;
          this.stats[this.possession].rucks++; this.stats[this.possession].phases++;
          // Durée de recyclage du ruck : tirée du profil configurable
          // (cfg.ruck.profil), calibré par balayage de simulations sur les
          // vitesses de ruck du France-Irlande 2026 (cf. _tirerDureeRuck).
          this.ruckDureeCible = this._tirerDureeRuck(this.possession);
          this.ruckTempsSansSoutien = 0;
          this.ruckPlaquage = DUREE_PLAQUAGE * this._echelleArret;
          this.phase = 'RUCK';
          this._receptionDirecte = false;
        }
        return;
      }

      const dx = porteur.sensAttaque * 6;
      // Amplitude du crochet selon le PROFIL : un joueur rapide (ailier ~90)
      // crochète franchement pour éliminer le défenseur, un avant (~45) court
      // quasi droit et va au contact. Donne une évasion individuelle visible au
      // lieu d'un même pas de côté pour tous.
      const amplEvite = 1.0 + Math.max(0, (porteur.vitesse - 45)) / 45 * 2.5;
      let evite = ((porteur.y - defenseurProche.y) > 0 ? 1 : -1) * amplEvite;
      // Ligne CROISÉE (issue d'une combinaison, cf. _tickCombinaison) : le
      // receveur vient de prendre le ballon sur un croisé, il change de direction
      // et repique de l'autre côté un court instant, au lieu du crochet habituel.
      if (porteur._croiseTimer > 0) evite = (porteur._croiseDir || 1) * amplEvite;
      // Pres d'une ligne de touche, le porteur ne crocheté JAMAIS vers la touche :
      // il coupe a l'interieur. Le seuil etait de 8 m, ce qui revenait a lui
      // interdire tout le couloir : il s'ecartait de la ligne bien avant de
      // l'approcher, et le BALLON PORTE EN TOUCHE — une sortie de rugby
      // parfaitement banale — n'existait pas (0,05 par match mesure, contre 2 a
      // 4 en vrai). Toutes les touches du match venaient du jeu au pied ou d'une
      // penalite jouee au coin.
      //
      // Ramene a 1,5 m : le porteur court vraiment le long de la ligne et n'y
      // rentre qu'au dernier moment, donc la defense peut l'y pousser (cf. loi
      // 19, PLAQUE_EN_TOUCHE). Mesure au banc A/B, 400 matchs par variante avec
      // correction de multiplicite : ballon porte en touche 0,05 -> ~1,5 par
      // match, touches 21,4 -> 22,3 (+0,95 +/- 0,76, etabli), ESSAIS 5,16 ->
      // 5,78 (+0,62 +/- 0,41, etabli) et passes 516 -> 493 (-24 +/- 9, etabli).
      // Le seuil de 8 m avait ete pose a une epoque ou le porteur sortait
      // "gratuitement" faute de defense laterale credible ; ce n'est plus le cas.
      if (porteur.y < 1.5) evite = Math.abs(evite);
      else if (porteur.y > LARGEUR - 1.5) evite = -Math.abs(evite);
      const xAvantCourse = porteur.x;
      avancer(porteur, dx, evite, dt, vitesseMs(porteur));
      // Mètres gagnés : le terrain pris AU-DELÀ du point le plus avancé de la
      // phase, en partant de la ligne d'avantage (point de regroupement ou de
      // réception), comme la statistique d'un relevé de match réel (P2-102).
      // Avant, tout le terrain couru vers l'avant depuis la réception comptait :
      // le n°10, qui reçoit 10 m derrière le ruck et court avant de passer,
      // « gagnait » 217 m par match, plus que les ailiers, et une équipe 1233 m
      // (record réel du Tournoi : 116 m par match pour un joueur).
      void xAvantCourse;
      this._compterMetresGagnes(porteur);

      // Touche : le ballon porté au-delà de la ligne de touche est mort, jeu arrêté.
      // (Pas pendant qu'une passe vole : le receveur ne porte pas encore le ballon.)
      if (!ballonEnVolPasse && (porteur.y <= 0.01 || porteur.y >= LARGEUR - 0.01)) {
        this._accorderTouche(this.possession, porteur, 'PORTE');
        return;
      }

      // Soutien et organisation de l'attaque : seuls les 2 coéquipiers les PLUS
      // PROCHES du porteur (quel que soit leur poste) viennent réellement le
      // soutenir. Tous les autres NE courent PAS après le ballon : ils tiennent
      // leur couloir du plan de jeu (avants au centre, ligne de trois-quarts
      // écartée, ailiers sur les bords), légèrement en retrait pour rester
      // onside, et OCCUPENT la largeur du terrain — prêts à recevoir une passe
      // au large. Avant, toute l'équipe dérivait vers le ballon et se compactait.
      const att = this.attaquants();
      // Trailers : les DEUX joueurs les plus proches suivent le porteur — ce
      // sont eux qui se précipiteront pour sécuriser le ruck au plaquage. (Une
      // variante « avants seulement » a été testée et RETIRÉE : un back parti au
      // large se retrouvait sans soutien à moins de 15 m, chaque percée mourait
      // isolée — score effondré de 29 à 19. La limitation du monde au
      // regroupement se fait AU RUCK, cf. soutiensRuck limité à 2, pas ici.)
      const soutienDirect = new Set(
        att.filter(j => j !== porteur && j.auSol === 0)
          .sort((a, b) => distance(a, porteur) - distance(b, porteur))
          .slice(0, 2)
      );
      // AVANT LANCÉ : quand le 9 tient le ballon à la base, l'avant de pod le
      // plus proche (onside) part en COURSE DE PERCUSSION vers la ligne
      // d'avantage — il arrive lancé au niveau du 9, prêt à percuter si le 9 le
      // sert (cf. choisirActionPorteur, avantLance). C'est l'animation visible
      // du jeu d'avants : un gros qui se lance dans l'axe à chaque temps de jeu,
      // même quand le ballon part finalement au large.
      // Le coureur est désigné par la MÊME règle que l'avant que le 9 servira
      // (cf. _designerAvantLance) : avant, c'était le plus proche du 9, et le
      // joueur voyait un avant arriver lancé pendant qu'un autre recevait
      // (43 % de cohérence mesurée, cf. test R10).
      const avantLanceRun = porteur.numero === 9 ? this._designerAvantLance(porteur, att) : null;
      this._avantLanceRun = avantLanceRun;
      for (const j of att) {
        if (j === porteur) continue;
        if (j === avantLanceRun) {
          const cibleXl = porteur.x - porteur.sensAttaque * 0.3;
          avancer(j, cibleXl - j.x, (porteur.y - j.y) * 0.3, dt, vitesseMs(j));
          continue;
        }
        // HORS-JEU D'ATTAQUE (jeu courant) : un coéquipier NETTEMENT devant le
        // porteur est hors-jeu. Au lieu de traîner devant le ballon (les avants du
        // temps précédent restaient plantés en avant quand le ballon repartait vers
        // l'arrière — « hors-jeu » très visible), il se REPLIE derrière le porteur
        // pour se remettre onside, comme un vrai joueur. Repli à allure modérée
        // (0,8×) pour ne pas déstructurer le jeu ; seuil 2 m pour ne cibler que les
        // joueurs franchement hors-jeu (au-delà de la tolérance de passe et de
        // l'alignement à plat de la ligne).
        if (this.phase === 'PORTE' && (j.x - porteur.x) * porteur.sensAttaque > 2) {
          const cibleX = porteur.x - porteur.sensAttaque * 2.5;
          avancer(j, cibleX - j.x, (j.channelY - j.y) * 0.3, dt, vitesseMs(j) * 0.8);
          continue;
        }
        // Le 9 (quand il ne porte pas) SUIT L'ACTION EN PERMANENCE : ~4,5 m
        // derrière le porteur, en glissant vers sa colonne — c'est lui qui doit
        // ARRIVER LE PREMIER sur le prochain ruck pour distribuer avant le
        // redéploiement adverse. Avant, il traînait à ~6,5 m par la logique
        // générique : chaque mètre d'écart retarde la sortie du ballon.
        if (j.numero === 9 && j.auSol === 0) {
          const cibleX9 = porteur.x - porteur.sensAttaque * 4.5;
          avancer(j, cibleX9 - j.x, (porteur.y - j.y) * 0.6, dt, vitesseMs(j) * 0.95);
          continue;
        }
        // L'OUVREUR (10) ne se place JAMAIS dans le dos direct du 9 : quand le 9
        // a le ballon (sortie), le 10 se décale sur un CÔTÉ (le grand côté, plus
        // d'espace) et EN RETRAIT, pour recevoir lancé et avec un angle et amorcer
        // l'attaque — pas à l'arrêt collé au regroupement. C'est ce premier
        // receveur décalé qui donne une vraie ligne d'attaque.
        if (j.numero === 10 && porteur.numero === 9 && j.auSol === 0) {
          // Quand le 9 tient le ballon (sortie), le 10 — parti PROFOND (placé
          // ~8 m derrière pendant le ruck) — S'ÉLANCE à pleine vitesse vers une
          // cible quasi à plat sur le côté ouvert : la passe du 9 part en ~0,3-
          // 0,5 s, donc le 10 la reçoit LANCÉ, encore ~4-6 m derrière (passe
          // légale) mais en pleine accélération vers la ligne d'avantage.
          const coteOuvert = porteur.y <= LARGEUR / 2 ? 1 : -1;
          const cibleY10 = Math.max(6, Math.min(LARGEUR - 6, porteur.y + coteOuvert * 6));
          const cibleX10 = porteur.x - porteur.sensAttaque * 1.5;
          avancer(j, cibleX10 - j.x, cibleY10 - j.y, dt, vitesseMs(j));
          continue;
        }
        // LIGNE DE TROIS-QUARTS À PLAT : quand un back (9-13) porte en jeu courant,
        // les backs situés À L'EXTÉRIEUR de lui dans la ligne (vers le grand côté)
        // se placent ÉCARTÉS (~7 m entre chaque) et seulement LÉGÈREMENT en retrait
        // (~3-6 m, jamais loin derrière — « pas de passe derrière soi »), pour
        // recevoir À PLAT et enchaîner 10→12→13→aile. C'est ce qui fait circuler
        // le ballon sur 2-3 passes avant le contact, au lieu de foncer au ras.
        const ordreLigne = { 10: 0, 12: 1, 13: 2, 11: 3, 14: 3 };
        if (this.phase === 'PORTE' && !soutienDirect.has(j)
          && porteur.numero >= 9 && porteur.numero <= 13
          && (j.numero >= 10 && j.numero <= 14)) {
          const rang = (ordreLigne[j.numero] ?? 3) - (ordreLigne[porteur.numero] ?? 0);
          if (rang > 0) {
            // LANCEMENT : partis EN PROFONDEUR (placés ~8-12 m derrière pendant
            // le ruck), les backs extérieurs SPRINTENT (pleine vitesse) vers une
            // cible quasi À PLAT sur le porteur — ils prennent de la vitesse
            // pendant que le ballon voyage et le reçoivent EN PLEINE COURSE au
            // moment de franchir la ligne d'avantage, au lieu d'attendre à plat
            // et d'être plaqués sur place (« départ au ras »).
            const coteOuvert = porteur.y <= LARGEUR / 2 ? 1 : -1;
            // L'ailier côté fermé tient son aile (cf. placement au ruck) au lieu
            // de traverser tout le terrain pour rejoindre l'éventail ouvert.
            const estAilier = j.numero === 11 || j.numero === 14;
            const sonCote = Math.sign(j.channelY - LARGEUR / 2) || 1;
            if (estAilier && sonCote !== coteOuvert) {
              const cibleXa = porteur.x - porteur.sensAttaque * 4;
              avancer(j, cibleXa - j.x, j.channelY - j.y, dt, vitesseMs(j) * 0.85);
              continue;
            }
            const cibleY = Math.max(4, Math.min(LARGEUR - 4, porteur.y + coteOuvert * 7 * rang));
            // DIAGONALE en course aussi : le voisin immédiat vient quasi à plat
            // (rang 1 : ~2,2 m derrière le porteur, prêt à prendre la passe
            // courte lancé), mais chaque homme au-delà GARDE de la profondeur
            // (~1,4 m de plus par cran) — la ligne ne s'aplatit jamais toute
            // entière : quand le 12 reçoit, le 13 et l'aile ont encore du champ
            // pour continuer le mouvement. C'est ce qui permet d'ÉCARTER par
            // passes courtes successives au lieu d'une seule passe longue.
            const cibleX = porteur.x - porteur.sensAttaque * (0.8 + rang * 1.4);
            avancer(j, cibleX - j.x, cibleY - j.y, dt, vitesseMs(j));
            continue;
          }
        }
        if (soutienDirect.has(j)) {
          // Soutien rapproché, toujours légèrement en retrait du porteur en
          // profondeur (jamais devant, sinon passe en avant) : il attend le
          // ballon dans son dos.
          const cibleX = porteur.x - porteur.sensAttaque * 1.5;
          if ((porteur._percee || 0) > 0) {
            // PERCÉE : le soutien SPRINTE en LIGNE DE PASSE dans l'ESPACE — il ne
            // colle pas l'axe du perceur (où la couverture converge), il se
            // décale du CÔTÉ OPPOSÉ au défenseur de couverture le plus proche.
            // L'offload du perceur trouve ainsi un receveur lancé EN ESPACE, ce
            // qui transforme la percée en avancée longue/essai construit au lieu
            // d'un relais dans le trafic aussitôt plaqué.
            const { joueur: couverture } = joueurLePlusProche(def, porteur.x, porteur.y);
            const coteLibre = couverture ? (Math.sign(porteur.y - couverture.y) || 1) : 1;
            const cibleY = Math.max(3, Math.min(LARGEUR - 3, porteur.y + coteLibre * 4));
            avancer(j, cibleX - j.x, cibleY - j.y, dt, vitesseMs(j));
          } else {
            // Le soutien court À CÔTÉ-derrière du porteur (décalé de ~2,5-3 m
            // sur le côté, jamais dans son dos) : une passe se donne à un
            // joueur SUR LE CÔTÉ — passer droit derrière soi est impossible.
            // Mesuré avant : 16 % des passes partaient « dans le dos ».
            const cote = (j.numero % 2 === 0) ? 1 : -1;
            const cibleYs = Math.max(2, Math.min(LARGEUR - 2, porteur.y + cote * (2.5 + (j.numero % 3) * 0.4)));
            avancer(j, cibleX - j.x, cibleYs - j.y, dt, vitesseMs(j) * 0.9);
          }
        } else {
          // AUTONOMIE par le profil : chaque joueur suit le ballon selon SA
          // tendance individuelle (proximité au ballon, cf. modèle) plutôt qu'un
          // binaire avant/back. Un joueur « tenant du ballon » (n°9, piliers,
          // tendance ~90) dérive franchement vers le jeu pour soutenir ; un ailier
          // (tendance ~15) tient son large. Idem pour la profondeur : les suiveurs
          // se placent plus à plat (soutien proche), les arrières plus en
          // profondeur (lecture et espace). Le placement émerge ainsi des profils.
          const t = j.tendance / 100; // 0.15 (ailier) .. 0.90 (9/pilier)
          const driftBallon = 0.04 + t * 0.20;
          const cibleY = j.channelY * (1 - driftBallon) + porteur.y * driftBallon;
          const profondeur = (10 - t * 4) + Math.abs(j.channelY - porteur.y) * (0.14 - t * 0.1);
          const cibleX = porteur.x - porteur.sensAttaque * profondeur;
          avancer(j, cibleX - j.x, cibleY - j.y, dt, vitesseMs(j) * (j.numero <= 8 ? 0.7 : 0.8));
        }
      }

      // MONTÉE EN CHARGE de la défense (cfg.defense.rampeMontee, en secondes) :
      // au début de chaque temps de jeu la ligne se RÉORGANISE (repli, comptage,
      // communication) avant de monter à pleine vitesse — c'est ce qui laisse au
      // porteur lancé le temps de courir 5-8 m avant le contact, comme en vrai
      // (mesuré France-Irlande : 3,8 m gagnés par course, un contact toutes les
      // ~11 s de jeu ; sans rampe le contact tombait en ~2 s et le match jouait
      // 4x trop de phases). 0 = montée immédiate (comportement historique).
      const cfgDef = this.cfgDefense[porteur.team === 'A' ? 'B' : 'A'];
      const rampeDef = cfgDef.rampeMontee || 0;
      // PAS DE RAMPE QUAND LE JEU NAÎT D'UN COUP DE PIED. La montée en charge
      // modélise une ligne qui se RÉORGANISE à la sortie d'un regroupement. Après
      // un coup de pied rattrapé, la ligne de chasse arrive déjà lancée ; la
      // rampe la faisait pourtant repartir de 35 % de sa vitesse pendant que le
      // receveur courait à 100 %. Mesuré (P2-48) : 51 % des essais longs
      // naissent d'une réception de coup de pied, et 44 % de tous les essais
      // longs sont marqués SANS UN SEUL RUCK.
      const fRampe = this._porteApresPied ? 1
        : (rampeDef > 0 ? Math.min(1, 0.35 + this.timerPhase / rampeDef) : 1);
      // LE DÉFENSEUR DE FACE MONTE AU CONTACT. Seul le défenseur le plus proche
      // (`defenseurProche`) montait sur le porteur ; tous les autres tenaient
      // leur ligne à 85 % de leur vitesse. Or, une fois le premier rideau
      // battu, le plus proche est souvent un défenseur DÉPASSÉ, juste derrière
      // le porteur, qui ne peut plus le rattraper — pendant que ceux de devant
      // reculent dans leur couloir sans jamais attaquer. Mesuré sur les essais
      // longs (P2-48/49) : les défenseurs placés devant le marqueur dans son
      // couloir à la réception passaient 62 % de la course à « tenir leur
      // ligne », 16 % seulement comme plaqueur désigné, et 90 % d'entre eux
      // finissaient PLUS LOIN du porteur qu'au départ. En vrai, c'est le
      // défenseur de face qui plaque.
      // Le défenseur le plus proche DEVANT le porteur (couloir de 15 m), libre
      // de jouer, monte donc lui aussi. Seul le plus proche en absolu peut
      // plaquer : le monteur ne plaque qu'en le devenant.
      // NE JAMAIS LIVRER L'UN SANS L'AUTRE (ni sans le jeu rapide raccourci) :
      // chacun des deux, mesuré seul, ne changeait rien aux essais longs — le
      // monteur restait bridé par la rampe, la défense lancée n'avait personne
      // qui monte (P2-49).
      // SEULEMENT EN JEU DÉCOUSU : le monteur n'entre en jeu que si le
      // défenseur le plus proche est DÉJÀ DERRIÈRE le porteur (premier rideau
      // battu). En jeu de phase ordinaire, le plus proche est devant et monte
      // déjà : un second défenseur lancé à pleine vitesse écrasait les phases
      // (séquence ballon en main 3,6 s au lieu de ~7 s, percées qui ne
      // rapportaient plus que 11,7 m au lieu de 15-25 m — quatre invariants
      // rouges dans la première version de ce correctif).
      const premierRideauBattu = !defenseurProche
        || (defenseurProche.x - porteur.x) * porteur.sensAttaque < -0.5;
      let monteur = null;
      if (premierRideauBattu) {
        const devant = def.filter(d => d.auSol === 0 && d.sinBin <= 0 && !(d.horsJeuKick > 0)
          && !((d.fixeCooldown || 0) > 0) && d.ruckRecovery <= 0
          && (d.x - porteur.x) * porteur.sensAttaque > 0.5 && Math.abs(d.y - porteur.y) < 15);
        if (devant.length) monteur = joueurLePlusProche(devant, porteur.x, porteur.y).joueur;
      }
      for (const j of def) {
        // HORS-JEU sur coup de pied (loi 10) : il se retire vers la ligne du
        // coup de pied au lieu de defendre, jusqu'a etre remis en jeu.
        if (j.horsJeuKick > 0) { this._replierHorsJeuKick(j, dt); continue; }
        // Défenseur FIXÉ (battu par une passe, cf. _tenterPasse) : il est hors du
        // coup un court instant, il ne monte plus couvrir le receveur — c'est ce
        // qui laisse le SURNOMBRE (et l'espace) au large.
        if ((j.fixeCooldown || 0) > 0) continue;
        // SORTIE DE REGROUPEMENT : un defenseur qui vient d'etre engage dans le
        // ruck (ruckRecovery, cf. _imposerRecuperationRuck) n'est PAS dans la
        // ligne pendant qu'il se releve. Il ne fait que revenir vers la ligne de
        // hors-jeu, plus lentement qu'un joueur debout.
        // AVANT : ruckRecovery ne faisait qu'une chose, l'ecarter de la
        // DESIGNATION du plaqueur. Il continuait a tenir sa place dans le
        // rideau defensif et a GLISSER vers le ballon comme un joueur frais
        // (mesure sur scenario construit : 1,79 m de glissement lateral en 1 s).
        // La defense repartait donc a quinze a chaque temps de jeu et le trou
        // que cree un ballon rapide n'existait pas.
        // ORDRE IMPORTANT : ce correctif avait d'abord ete essaye SEUL, avant
        // que la loi 15 ne soit appliquee au plaqueur designe. Il faisait alors
        // RECULER le ballon (gain -0,13 m) et tombait a 11/14 : il ouvrait la
        // defense sans que l'attaque sache avancer. Une fois la ligne
        // d'avantage positive, les deux s'additionnent (comparaison APPARIEE
        // sur 80 matchs) : points 43,1 -> 47,4 (+4,3 +/- 3,5, etabli), part des
        // AVANTS dans les essais 4,8 % -> 10,4 % et poste le plus prolifique
        // 51 % -> 41 % (~3 ecarts-types), gain de terrain preserve (0,83 ->
        // 0,89). Ne jamais remettre l'un sans l'autre.
        if (j.ruckRecovery > 0 && j !== defenseurProche) {
          const ligneHorsJeuRuck = this.ruckPoint ? this.ruckPoint.x : porteur.x;
          avancer(j, ligneHorsJeuRuck - j.x, 0, dt, vitesseMs(j) * VITESSE_REPLI_SORTIE_RUCK);
          continue;
        }
        // Le MONTEUR (défenseur de face, cf. plus haut) vise le POINT DE
        // RENCONTRE avec le porteur, pas un point collé à lui : décalé de
        // quelques mètres dans son couloir, il passait derrière le porteur sans
        // jamais entrer à portée (scénario construit : 3,5 m au plus près, sur
        // un porteur qu'il voyait arriver de face). Un défenseur placé DEVANT
        // voit son point de rencontre ENTRE lui et le porteur : c'est la montée
        // de face, qui ne quitte pas le plaquage. (Appliqué au plaqueur désigné
        // en général, ce même calcul le faisait courir vers l'en-but au lieu de
        // monter au contact — essais 6,8 -> 10,7 ; P2-48. Il n'est donc
        // réservé qu'au défenseur de face.)
        if (j === monteur && j !== defenseurProche) {
          const ligneX = porteur.sensAttaque > 0 ? LONGUEUR : 0;
          const pi = pointInterception(j, porteur, vitesseMs(porteur), vitesseMs(j), ligneX);
          avancer(j, pi.x - j.x, pi.y - j.y, dt, vitesseMs(j) * fRampe);
          continue;
        }
        if (j === defenseurProche) {
          // Le plaqueur désigné vise un point d'interception légèrement
          // devant le porteur (dans son sens de course), pas sa position
          // actuelle : une poursuite "pure" qui vise toujours le talon du
          // porteur ne converge jamais contre un porteur de vitesse égale qui
          // jute latéralement (chaque tick, le défenseur réoriente en retard
          // d'un cran) — un vrai plaqueur lit la trajectoire et coupe l'angle.
          // LOI 15 — LE PLAQUEUR DESIGNE EST HORS-JEU LUI AUSSI. La ligne de
          // hors-jeu d'un regroupement vaut pour TOUS les defenseurs, y compris
          // celui qui va plaquer : il ne peut pas se placer DEVANT le ballon
          // pour venir cueillir le receveur. Le moteur clampait bien la ligne
          // defensive (cf. ligneGain plus bas) mais PAS le plaqueur designe,
          // qui visait porteur.x + 1,5 m quelle que soit sa position. Il
          // partait donc chercher le porteur EN AVANT du regroupement, et le
          // contact tombait systematiquement sur la ligne de depart : d'un
          // regroupement au suivant, une equipe qui CONSERVE le ballon
          // n'avancait que de 0,15 m (mediane negative : elle reculait une fois
          // sur deux) la ou une vraie equipe avance de plusieurs metres.
          // Mesure apres correctif (20 matchs) : gain net +0,91 m, part des
          // regroupements dans les 22 adverses 6,3 % -> 8,3 %.
          let cibleInterceptX = porteur.x + porteur.sensAttaque * 1.5;
          if (this.ruckPoint) {
            const ligneHorsJeu = this.ruckPoint.x + porteur.sensAttaque * RECUL_PIED_RECULE;
            cibleInterceptX = porteur.sensAttaque > 0
              ? Math.max(cibleInterceptX, ligneHorsJeu)
              : Math.min(cibleInterceptX, ligneHorsJeu);
          }
          avancer(j, cibleInterceptX - j.x, porteur.y - j.y, dt, vitesseMs(j) * fRampe);
          continue;
        }
        // POURSUITE (scramble) : premier rideau battu, les défenseurs DÉJÀ
        // DÉPASSÉS, à moins de 25 m, ne tiennent plus une ligne qui n'existe
        // plus — ils sprintent vers le porteur pour le reprendre de dos ou de
        // côté. Avant, ils montaient à 85 % de leur vitesse vers son point
        // comme si la ligne tenait : 3 défenseurs à moins de 10 m du perceur
        // dans la première seconde, 0,4 au bout de 3 à 4 s, et 32 % des
        // franchissements finissaient à l'essai en moins de 20 s (P2-119).
        // L'arrière garde sa propre logique de dernier rideau (ci-dessous).
        if (premierRideauBattu && j.numero !== 15 && j.ruckRecovery <= 0
          && (j.x - porteur.x) * porteur.sensAttaque < -0.5 && distance(j, porteur) < 25) {
          const cibleX = porteur.x + porteur.sensAttaque * 2;
          avancer(j, cibleX - j.x, porteur.y - j.y, dt, vitesseMs(j) * fRampe);
          continue;
        }
        // L'ARRIÈRE (n°15) ne monte PAS dans la ligne : il SWEEPE en couverture
        // ~18 m derrière, au centre, pour parer le jeu au pied et les
        // débordements (dernier rideau). Il ne court jamais vers le ballon.
        if (j.numero === 15) {
          const cibleX = porteur.x + porteur.sensAttaque * cfgDef.profondeurArriereJeu;
          const cibleY = j.channelY * 0.7 + porteur.y * 0.3;
          // DERNIER DEFENSEUR : des que le porteur a FRANCHI la ligne de
          // defense (plus aucun defenseur devant lui dans son couloir), le
          // balayage central n'a plus de sens — l'arriere est le seul homme
          // entre le ballon et l'en-but, il doit COURIR AU POINT DE RENCONTRE.
          // Mesure avant ce correctif : le marqueur d'un essai recevait le
          // ballon a 43 m de la ligne en mediane et 82 % des essais partaient
          // de plus de 20 m — le moteur ne produisait que des essais « en
          // contre », jamais un essai construit pres de la ligne, et les deux
          // seuls ailiers marquaient 85 % des essais du match.
          const franchi = !def.some((d) => d !== j && d.auSol === 0
            && (d.x - porteur.x) * porteur.sensAttaque > 0.5
            && Math.abs(d.y - porteur.y) < 12);
          if (franchi) {
            const ligneX = porteur.sensAttaque > 0 ? LONGUEUR : 0;
            const pi = pointInterception(j, porteur, vitesseMs(porteur), vitesseMs(j), ligneX);
            // Un arriere n'est pas un radar : il LIT la course et corrige son
            // angle, il ne resout pas l'equation. On ne prend donc qu'une part
            // de l'angle ideal (0,35), le reste restant sa couverture
            // habituelle. A 1,0 (interception parfaite) le contre n'existait
            // plus du tout : 2,8 essais par match au lieu de 5,3, sous le
            // repere reel (cf. CLAUDE.md role 6).
            const k = COUVERTURE_ARRIERE;
            avancer(j, (cibleX + (pi.x - cibleX) * k) - j.x, (cibleY + (pi.y - cibleY) * k) - j.y,
              dt, vitesseMs(j) * (0.8 + 0.2 * k));
            continue;
          }
          avancer(j, cibleX - j.x, cibleY - j.y, dt, vitesseMs(j) * 0.8);
          continue;
        }
        // AILE CÔTÉ FERMÉ (à l'opposé du ballon) : elle ne monte PAS dans la
        // ligne mais RECULE en couverture (~10 m derrière la ligne d'avantage),
        // formant le rideau arrière avec le n°15 (back-three) — prête à cueillir
        // un coup de pied ou un débordement au large. L'aile côté OUVERT (près du
        // ballon) reste, elle, dans la ligne pour défendre le large. La défense
        // couvre ainsi la PROFONDEUR sans dégarnir le côté où l'attaque se
        // développe.
        if (j.numero === 11 || j.numero === 14) {
          const coteAile = Math.sign(j.channelY - LARGEUR / 2) || 1;
          const coteBallon = Math.sign(porteur.y - LARGEUR / 2) || 1;
          // Seulement LOIN de la ligne défendue (>40 m) : là, la menace est le
          // coup de pied/le territoire, donc on décroche l'aile fermée en
          // couverture. PRÈS de l'en-but défendu (zone rouge), la menace est
          // l'essai : l'aile RESTE dans la ligne, on ne dégarnit pas la défense
          // là où se marquent les essais (sinon on en concède davantage).
          const ligneDef = porteur.sensAttaque > 0 ? LONGUEUR : 0;
          const distLigneDef = Math.abs(ligneDef - porteur.x);
          if (coteAile !== coteBallon && distLigneDef > 40) {
            const cibleXcouv = porteur.x + porteur.sensAttaque * 12;
            avancer(j, cibleXcouv - j.x, j.channelY - j.y, dt, vitesseMs(j) * 0.85);
            continue;
          }
        }
        // Les autres défenseurs (avants + 9/10/12/13 + AILIER côté ouvert) montent
        // en LIGNE à plat sur la ligne d'avantage et tiennent leur couloir pour
        // OCCUPER toute la largeur, avec une glissade vers le ballon (défense en
        // glissement). Les AILIERS tiennent FERMEMENT leur bord (dérive minime) :
        // ils ne se font pas aspirer vers le ballon, donc les ailes restent
        // couvertes. Tous restent côté en-but adverse au porteur (couloir fermé).
        const estAvant = j.numero <= 8;
        const ailier = j.numero === 11 || j.numero === 14;
        const avance = porteur.sensAttaque > 0 ? (estAvant ? 1 : 2.5) : -(estAvant ? 1 : 2.5);
        // LIGNE D'AVANTAGE : une ligne defensive AVANCE, elle ne RECULE jamais
        // pour aller chercher un receveur place en profondeur. Elle part de la
        // ligne de hors-jeu (le dernier regroupement) et monte ; c'est au
        // receveur, qui prend le ballon 5 a 8 m derriere, de venir la chercher
        // en courant — c'est la course qui franchit la ligne d'avantage.
        // Avant, chaque defenseur visait simplement porteur.x + avance : quand
        // le 9 donnait a un 10 place 6 m en retrait, TOUTE la ligne reculait de
        // 6 m avec lui, et le plaquage tombait derriere le regroupement
        // precedent. Mesure : d'un regroupement au suivant, le ballon RECULAIT
        // de 0,5 m en moyenne. L'attaque n'atteignait donc quasiment jamais les
        // 22 adverses (10 entrees par match au lieu d'une vingtaine) et aucun
        // essai ne se construisait ; a l'inverse, une possession pouvait
        // enchainer dix temps de jeu au meme endroit — c'est aussi ce qui
        // gonflait rucks, passes et courses.
        const ligneGain = (this.ruckPoint ? this.ruckPoint.x : porteur.x)
          + porteur.sensAttaque * RECUL_PIED_RECULE;
        const cibleBrute = porteur.x + avance;
        const cibleX = porteur.sensAttaque > 0
          ? Math.max(cibleBrute, ligneGain)
          : Math.min(cibleBrute, ligneGain);
        const drift = ailier ? 0.06 : 0.2;
        const cibleY = j.channelY * (1 - drift) + porteur.y * drift;
        // DÉFENSE PAS REPLACÉE après un ballon éclair au ruck (_defenseTardive) :
        // la montée en ligne est nettement plus lente pendant ~1,2 s — c'est la
        // récompense du jeu rapide, le seul vrai avantage du ballon éclair.
        // Le tout modulé par la montée en charge du temps de jeu (fRampe).
        const vLigne = (this._defenseTardive > 0 ? 0.55 : 0.85) * fRampe;
        avancer(j, cibleX - j.x, cibleY - j.y, dt, vitesseMs(j) * vLigne);
      }

      // Essai (jamais pendant qu'une passe vole : on n'aplatit pas sans ballon)
      if (!ballonEnVolPasse && ((porteur.sensAttaque > 0 && porteur.x >= LONGUEUR) || (porteur.sensAttaque < 0 && porteur.x <= 0))) {
        // Plaquage de sauvetage in extremis : le contrôle de contact en début
        // de tick utilisait la distance d'AVANT le déplacement ; un défenseur
        // qui a comblé l'écart pendant ce même tick (donc invisible à ce
        // contrôle initial) doit quand même avoir sa chance d'arrêter l'essai
        // au ras de la ligne, comme un vrai plaquage de couverture désespéré.
        // Un fautif encore hors-jeu (loi 10, loi 20.14) ne sauve pas l'essai.
        const { joueur: sauveteur, distance: distSauvetage } = joueurLePlusProche(
          def.filter(d => !(d.horsJeuKick > 0)), porteur.x, porteur.y);
        if (distSauvetage < 2.2 && sauveteur.missCooldown <= 0) {
          this._compterCourse(porteur);
          this.stats[sauveteur.team].tacklesAttempted++;
          this._statJoueur(sauveteur).tacklesAttempted++;
          const probaSauvetage = Math.max(0.55, Math.min(0.85, 0.68 + (sauveteur.plaquage - porteur.vitesse) / 250));
          if (this.rng() < probaSauvetage) {
            this.stats[sauveteur.team].tacklesMade++;
            this._statJoueur(sauveteur).tacklesMade++;
            porteur.x = porteur.sensAttaque > 0 ? LONGUEUR - 0.5 : 0.5;
            this.ruckPoint = { x: porteur.x, y: porteur.y };
            this.contestants = [sauveteur.numero];
            porteur.auSol = 2.0;
            porteur._solX = porteur.x; porteur._solY = porteur.y;
            this.stats[this.possession].rucks++; this.stats[this.possession].phases++;
            // Profil de durées configurable, cf. l'autre site de création de ruck.
            this.ruckDureeCible = this._tirerDureeRuck(this.possession);
            this.ruckTempsSansSoutien = 0;
            this.ruckPlaquage = DUREE_PLAQUAGE * this._echelleArret;
            this.ruckDominant = false; // plaquage de sauvetage in extremis, pas un ballon sur l'avancée
            this.phase = 'RUCK';
            this._receptionDirecte = false;
            this.timerPhase = 0;
            return;
          }
          sauveteur.missCooldown = 1.0;
          sauveteur.vitesseCourante = 0; // pris a contre-pied, il doit se retourner (cf. plaquage manque)
          this.stats[sauveteur.team].missedTackles++;
          this.stats[this.possession].defenseursBattus++;
          this._statJoueur(sauveteur).plaquagesManques++;
          this._statJoueur(porteur).defenseursBattus++;
          // Battre le dernier défenseur (plaquage de sauvetage) EST un
          // franchissement — le porteur file vers l'en-but. Sauf s'il est déjà
          // compté pour ce porteur (cf. _suivreFranchissement).
          if (!this._franchiDeja) { this.stats[this.possession].franchissements++; this._statJoueur(porteur).franchissements++; this._franchiDeja = true; }
          this.log('PLAQUAGE_MANQUE', this.possession, `Plaquage de sauvetage manque, l'equipe ${this.possession} aplatit`);
        }
        porteur.x = porteur.sensAttaque > 0 ? LONGUEUR : 0;
        this.score[this.possession] += 5;
        this.stats[this.possession].essais++;
        this._compterCourse(porteur);
        this._statJoueur(porteur).essais++;
        this._passeDecisive(porteur);
        this.essaiX = porteur.x;
        this.essaiY = porteur.y;
        this.essaiEquipe = this.possession;
        this.log('ESSAI', this.possession, `Essai equipe ${this.possession} !`, this._infoEssai(porteur));
        this.phase = 'ESSAI';
        this.timerPhase = 0;
        return;
      }

      // Drop-goal (loi 9.A) : dans la zone de tir (8–38 m), l'équipe en
      // possession peut choisir de travailler le ballon pour son ouvreur, qui
      // tente un drop en jeu courant (ballon lâché qui rebondit puis botté entre
      // les poteaux). Choix tactique rare ; la réussite est calculée comme un
      // tir au but mais minorée, car botté en pleine action et sous pression.
      {
        const sensAttaqueDrop = porteur.sensAttaque;
        const distanceButsDrop = sensAttaqueDrop > 0 ? (LONGUEUR - porteur.x) : porteur.x;
        // Réservé aux joueurs qui tirent réellement au but en match (ouvreur,
        // centres, arrière) : sans ce filtre, un pilier porteur du ballon à
        // 30 m pouvait tenter un drop-goal, ce qu'on ne voit jamais en match.
        // Seuls les vrais BUTEURS droppent (jeu au pied >= 60 : ouvreur, arrière),
        // et la tentative dépend du MATCH : rare en temps normal, recherchée
        // dans les dernières minutes d'un match serré (cf. _facteurContexteDrop).
        // Avant, un taux fixe faisait tenter 1,5 drop par match à n'importe quel
        // moment, y compris par les ailiers avec 20 points d'avance.
        if (porteur.tendance <= 55 && (porteur.jeuPied || 0) >= 60
          && distanceButsDrop >= 8 && distanceButsDrop <= 38
          && this.rng() < 0.012 * this._facteurContexteDrop(this.possession) * dt) {
          const offsetLateralDrop = Math.abs(porteur.y - LARGEUR / 2);
          const equipe = this.possession;
          this.stats[equipe].kicks++;
          this.stats[equipe].dropsTentes++;
          this._statJoueur(porteur).coupsDePied++;
          if (this.rng() < probaReussiteTir(distanceButsDrop, offsetLateralDrop, porteur.adresse) * 0.7) {
            this.stats[equipe].dropsReussis++;
            this._statJoueur(porteur).pointsAuPied += 3;
            this.score[equipe] += 3;
            this.log('DROP_GOAL_REUSSI', equipe, `Drop-goal reussi, equipe ${equipe} +3`);
            this._nouvelleManche(equipe);
          } else {
            this.log('DROP_GOAL_RATE', equipe, `Drop-goal rate, equipe ${equipe}`);
            // Comme une pénalité au but ratée : le ballon part au-delà de la
            // ligne d'en-but adverse, remise en 22m pour l'équipe défenseure.
            const sens = { A: 1, B: -1 };
            const sensEquipe = sens[equipe];
            const ligneEssaiAdverse = sensEquipe > 0 ? LONGUEUR : 0;
            const x22 = ligneEssaiAdverse - sensEquipe * 22;
            this._nouvelleManche(equipe, x22);
          }
          return;
        }
      }
    }

    // Botte en jeu courant : choix du type et de la cible selon la zone et la
    // pression. Renvoie true si un coup de pied a été déclenché ce tick (dans
    // ce cas, _tickPorte ne fait rien d'autre pour ce tick).
    // Décision tactique centrale du porteur, prise AVANT toute résolution de
    // plaquage : zone du terrain, pression défensive immédiate, numéro du
    // porteur (avants vs demi de mêlée/ouvreur vs trois-quarts/arrières),
    // soutien disponible et score au tableau. Ne fait que choisir l'intention
    // (aucun effet de bord) ; c'est _tickPorte qui exécute l'action retournée.
    choisirActionPorteur(porteur, defenseurProche, distDef, dt) {
      const zone = this._zoneTerrain(porteur);
      const pression = distDef < 5;
      const att = this.attaquants();
      const soutiens = att.filter(j => j !== porteur && j.auSol === 0 && distance(j, porteur) < 15)
        .sort((a, b) => distance(a, porteur) - distance(b, porteur));
      const soutienDisponible = soutiens.length > 0;
      const avant = porteur.numero <= 8;
      const enMene = this.score[porteur.team] > this.score[porteur.team === 'A' ? 'B' : 'A'];

      // SONNERIE (loi 5.7) : le ballon en main, l'équipe qui ne veut plus
      // jouer le sort en touche pour faire siffler la fin — à la mi-temps
      // depuis son camp, en fin de match quand elle mène. Les arrières le
      // tapent tout de suite ; un avant joue jusqu'à la sortie suivante.
      if (this._sonnerie && !this.penaliteRecul && porteur.numero >= 9) {
        const distButAdv = porteur.sensAttaque > 0 ? LONGUEUR - porteur.x : porteur.x;
        const veutFinir = this.miTempsJouee ? enMene : distButAdv > 50;
        if (veutFinir) { this._typeCoupDePiedForce = 'TOUCHE'; return 'KICK'; }
      }

      // 0. DEMI DE MÊLÉE LIBRE à la sortie (ruck/mêlée/touche où il n'était pas
      // au contact) : en plus du lancement classique 9→10 et du jeu au pied déjà
      // gérés plus bas (sections 1 et 2b, calibrés), on ajoute ici les deux seules
      // options qui manquaient au 9, et RAREMENT pour ne pas casser la structure
      // d'attaque (un 9 qui snipe/tape à chaque ruck effondre les essais) :
      //   - PERCÉE : s'il y a un vrai trou devant lui (aucun défenseur dans un
      //     large cône proche), il part seul ;
      //   - AVANT LANCÉ : il sert un avant tout près (ballon porté / pick).
      // Sinon (cas courant) il tombe dans le jeu au pied calibré (touche/dégagement
      // dans ses 22, chandelle plus haut) puis le lancement vers l'ouvreur.
      // Chandelle depuis la base DÉCIDÉE (cf. plus bas) : le 9 se place, lève
      // la tête et tape — ~1 s en vrai, pas un réflexe en 0,15 s. S'il a perdu
      // le ballon entre-temps, l'intention tombe.
      if (this._chandelleBaseA != null) {
        if (porteur.numero !== 9) this._chandelleBaseA = null;
        else if (this.timerPhase < this._chandelleBaseA) return null;
        else {
          this._chandelleBaseA = null;
          this._typeCoupDePiedForce = 'CHANDELLE';
          return 'KICK';
        }
      }
      if (porteur.numero === 9 && this._neufLibre) {
        if (this.timerPhase < 0.15) return null; // le ballon finit d'arriver de la base (sortie éclair)
        this._neufLibre = false;
        // CHANDELLE DEPUIS LA BASE (box kick, P2-57). Dans son propre camp, le
        // demi de melee tape regulierement par-dessus le regroupement : c'est le
        // coup de pied le plus frequent du rugby moderne, et il se dispute
        // depuis P2-55/P2-56. Le moteur n'en produisait que 3 par match.
        if (zone === 'OWN_22' || zone === 'OWN_HALF') {
          if (this.rng() < (zone === 'OWN_22' ? 0.25 : 0.15)) {
            this._chandelleBaseA = this.timerPhase + 1.0;
            return null;
          }
        }
        const sens = porteur.sensAttaque;
        const r = this.rng();
        // PERCÉE du 9 : uniquement dans le camp adverse (là où un 9 stoppé laisse
        // un ruck en bonne position au lieu de sacrifier une possession dans son
        // propre camp) et seulement si le CHANNEL immédiat devant lui est vide
        // (aucun défenseur dans un cône serré) — c'est le vrai trou près du ruck.
        // Le 9 est un PASSEUR : son travail est de donner au 10, il ne part que
        // TRÈS RAREMENT au ras. Percée seulement s'il y a un vrai trou net devant
        // lui près de la ligne adverse, et rarement (r < 0.10). Sinon il donne
        // (section 2b, 9→10 quasi systématique).
        const enCampAdverse = zone === 'OPP_HALF' || zone === 'OPP_22' || zone === 'CINQ_M';
        const channelVide = !this.defenseurs().some(d => d.auSol === 0
          && (d.x - porteur.x) * sens > -0.5 && (d.x - porteur.x) * sens < 6
          && Math.abs(d.y - porteur.y) < 3);
        if (channelVide && enCampAdverse && r < 0.10) return 'RUN'; // trou net près de la ligne → il part seul (rare)
        // AVANT LANCÉ sur le pod (animation offensive) : les avants se tiennent
        // en pods à plat de chaque côté du ruck (cf. _tickRuck) et le plus
        // proche part en course de percussion dès que le 9 tient le ballon (cf.
        // _tickPorte). Le 9 le sert nettement plus souvent qu'avant (18 % contre
        // 5 %) : l'attaque ALTERNE visiblement percussion dans l'axe et
        // lancement au large, comme une vraie animation offensive — au lieu de
        // sortir mécaniquement vers le 10 à chaque temps de jeu.
        // Rayon de recherche du percuteur elargi pres de la ligne : a 3 m de
        // l'en-but les avants sont masses autour du regroupement mais pas
        // forcement dans les 8 m utiles ailleurs sur le terrain, et le n°9
        // retombait alors sur la sortie 9->10 faute de candidat.
        const avantLance = this._designerAvantLance(porteur, att);
        // PRES DE LA LIGNE, ON JOUE LE PACK. A 18 % partout, le n°9 servait
        // l'ouvreur quasi systematiquement (branche 2b ci-dessous) y compris a
        // 3 m de la ligne d'en-but. Mesure sur 20 matchs : dans les CINQ
        // DERNIERS METRES, les avants ne portaient le ballon que 6,3 % du temps,
        // soit MOINS que sur le reste du terrain (15,5 %) — l'inverse exact d'un
        // vrai match, ou l'absence d'espace au large et une defense massee font
        // jouer le pack (pick-and-go, ballon porte, maul). Consequence mesuree :
        // les avants ne marquaient que 13,8 % des essais (repere reel ~33 %)
        // pendant que les deux ailiers en marquaient 69,8 % — le joueur voyait
        // toujours les deux memes maillots aplatir.
        // Le taux vient du RÉGLAGE D'ÉQUIPE, modulé par l'effectif réellement
        // aligné : à situation identique, un club au gros pack joue le ballon
        // porté là où un club à ailiers rapides tente encore d'écarter. Sans
        // cela, les trente joueurs de tous les clubs joueraient la même chose
        // au même endroit — un rail, pas une décision.
        const regleAuPres = this.cfgAttaque[porteur.team].jeuAuPresLigne;
        const basePres = typeof regleAuPres === 'number' ? regleAuPres : 0.90;
        const tauxPres = Math.max(0.10, Math.min(0.95, basePres * profilJeuAuPres(att)));
        // PARTOUT AILLEURS, c'etait reste la constante 0,18 — donc un rail : le
        // n°9 de TOUS les clubs sortait le ballon de la meme facon sur les
        // trois quarts du terrain. Mesure sur 10 matchs (1 825 passes du 9) :
        // vers le n°10 63,5 % (recul -4,51 m), vers un AVANT 16,9 % (-2,45 m),
        // vers le n°15 10,2 % (-7,12 m). Un vrai demi de melee alterne, et
        // environ un tiers des sorties de regroupement partent au pres.
        //
        // CE QUE CE CORRECTIF N'APPORTE PAS : du terrain. Comparaison APPARIEE
        // sur 300 graines (Bonferroni) : gain/temps de jeu -0,062 +/- 0,162,
        // NON ETABLI, comme les dix autres metriques du banc. Le patch ne coute
        // ni ne rapporte de terrain ; le jeu confine au milieu (P2-15) reste
        // entier. Son effet est sur QUI joue, pas sur la forme du match.
        //
        // NB : une decomposition de ce gain (course contre recul des passes) a
        // figure ici. Elle etait FAUSSE — elle decoupait les phases sur tout
        // changement de ruckPoint.x, qui bouge aussi EN COURS de phase, d'ou
        // des phases fantomes a gain nul. Le bon decoupage est celui du depot
        // (entree en phase RUCK, cf. server/test-stats-matchs.js) : il donne
        // 2,60 passes par phase et une mediane de 1,09 m, non 0,78 et 0,08.
        // Retiree plutot que corrigee : meme bien decoupee, la somme des
        // composantes ne se reconcilie pas avec le gain (5,71 m contre 1,46),
        // parce qu'entre deux rucks il peut y avoir un coup de pied, une touche
        // ou un turnover. Cf. TODO_AUDIT.md P2-33.
        //
        // Ce que le correctif apporte est ailleurs, et c'est un critere
        // explicite de CLAUDE.md : deux equipes ne jouaient pas differemment.
        //
        // Meme forme que le jeu au pres pres de la ligne : REGLAGE D'EQUIPE
        // module par l'effectif reellement aligne, jamais une constante.
        const regleSortie = this.cfgAttaque[porteur.team].sortieAvant;
        const baseSortie = typeof regleSortie === 'number' ? regleSortie : 0.34;
        const tauxSortie = Math.max(0.05, Math.min(0.85, baseSortie * profilJeuAuPres(att)));
        // Plus on approche de la ligne, plus on joue le pack : les 22 prennent
        // le plus eleve des deux taux plutot que le seul taux de zone.
        const tauxAvantLance = zone === 'CINQ_M' ? tauxPres
          : zone === 'OPP_22' ? Math.max(tauxPres * 0.35, tauxSortie) : tauxSortie;
        if (avantLance && r < tauxAvantLance) { this._passeCibleForcee = avantLance; return 'PASS'; }
        // sinon (cas TRÈS majoritaire) : lancement vers l'ouvreur (section 2b).
      }

      // 1. Botter en jeu courant : très fréquent dans son propre 22 (surtout
      // sous pression), de plus en plus rare en remontant le terrain. Une
      // équipe qui mène botte un peu plus pour la touche/le territoire.
      if (this.timerPhase > 0.4 && zone !== 'CINQ_M') {
        // Taux abaissés (~ -35 %) : le jeu au pied était trop fréquent (~64
        // coups de pied/match, réel ~25-40). On botte toujours surtout depuis
        // son propre camp (dégagement/occupation) mais on garde davantage le
        // ballon en main pour faire vivre le jeu.
        let pParSeconde;
        if (zone === 'OWN_22') pParSeconde = 0.26 + (pression ? 0.16 : 0);
        else if (zone === 'OWN_HALF') pParSeconde = 0.075 + (pression ? 0.05 : 0);
        else if (zone === 'OPP_HALF') pParSeconde = 0.02 + (pression ? 0.012 : 0);
        else pParSeconde = 0.01; // OPP_22 : on privilégie le jeu au sol/pick-and-go.
        if (enMene) pParSeconde *= 1.15; else pParSeconde *= 0.9;
        // Multiplicateur global configurable : en vrai une équipe botte toutes
        // les ~3 courses (78 coups de pied pour 255 courses au France-Irlande
        // 2026) — c'est LE régulateur de la longueur des possessions. Calibré
        // par balayage (cf. docs/ANALYSE_MATCH_REEL.md).
        pParSeconde *= (this.cfgAttaque[porteur.team].tauxJeuAuPied || 1);
        // RECALAGE AU PAS REEL DU JEU. Les taux ci-dessus ont ete balayes sur un
        // banc tournant a 0,2 s (server/test-calibration-moteur.js), alors que le
        // navigateur fait tourner le moteur a 0,1 s (docs/js/constants.js,
        // PAS_FIXE). Le balayage a donc regle une partie que personne ne joue.
        //
        // POURQUOI LE PAS CHANGE LE RESULTAT, alors que le tirage est
        // correctement normalise (`rng() < pParSeconde * dt`). Mesure sur 20
        // matchs, avec des compteurs poses dans le moteur :
        //                                   0,1 s (le jeu)   0,2 s (le banc)
        //   temps de jeu porte                  1135 s           1221 s
        //   temps ou le porteur DECIDE           605 s            724 s
        //   esperance cumulee de coup de pied     49,3             59,4
        //   coups de pied observes                47,6             59,0
        // L'esperance colle a l'observe a 3 % pres des deux cotes : la formule
        // fait ce qu'elle dit. Ce qui manque au pas fin, c'est le TEMPS DE
        // DECISION. Pendant qu'une passe vole ou qu'une combinaison se deroule,
        // le porteur ne decide pas, et le nombre de ticks bloques vaut
        // `ceil(duree / pas) - 1` : une passe de 0,12 s bloque UN tick a 0,1 s
        // et ZERO a 0,2 s. Le pas grossier arrondit le blocage vers le bas et
        // rend au porteur du temps de decision qu'il n'a pas en vrai. Cette
        // quantification explique environ 30 s des 119 s d'ecart ; le reste
        // n'est pas elucide (cf. TODO_AUDIT.md P2-41).
        //
        // Consequence mesuree AVANT recalage, au pas reel : 47,6 coups de pied
        // (le balayage visait ~59) et 18,1 touches, sous la fourchette [20-35] —
        // le moteur ECHOUAIT sa propre calibration sur une categorie essentielle.
        // Le facteur ci-dessous a ete rebalaye AU PAS REEL, quatre dosages sur
        // 20 matchs chacun :
        //   1,00  47,6 pieds  18,1 touches  13,4 melees  7,2 essais  ECHEC 11/14
        //   1,15  59,3        21,1          11,0         6,8         OK    12/14
        //   1,25  63,3        21,3          10,0         6,9         OK    12/14
        //   1,35  64,0        22,9           8,8         8,0         ECHEC 11/14
        // 1,15 est le plus petit dosage qui restitue le volume vise. Au-dela,
        // les touches PLAFONNENT (21,1 puis 21,3) : les coups de pied en plus
        // restent en jeu au lieu de trouver la touche, et on ne paie que le
        // ballon en main. A 1,35 le moteur decroche.
        //
        // A SUPPRIMER le jour ou les taux de base seront rebalayes directement
        // au pas reel : ce facteur ne fait que rattraper un balayage fait au
        // mauvais pas, il n'a aucune justification de jeu.
        pParSeconde *= RECALAGE_PIED_PAS_REEL;
        // QUI TAPE (P2-57). Le taux ci-dessus valait pour TOUS les porteurs :
        // 29 % des coups de pied etaient tapes par des avants, 8 % par le n°9.
        // En vrai, ce sont les demis et l'arriere qui tapent ; un avant ne tape
        // presque jamais. Le n°9 tape surtout depuis la base (chandelle, cf.
        // section 0), d'ou son facteur neutre ici. Dosage balaye sur quatre
        // jeux de graines (TODO_AUDIT.md P2-57) : plus haut (10 x2,4), les
        // sequences de jeu courant tombaient sous la fourchette reelle.
        pParSeconde *= avant ? 0.05 : porteur.numero === 10 ? 2.0 : porteur.numero === 15 ? 1.6 : 1;
        if (this.rng() < pParSeconde * dt) return 'KICK';
      }

      // 2. Pick-and-go : un avant tout près de la ligne adverse sous pression
      // préfère relancer au contact plutôt que chercher le large.
      if (avant && (zone === 'CINQ_M' || zone === 'OPP_22') && pression && this.rng() < 0.55 * dt) {
        return 'PICK_GO';
      }

      // 2b. Sortie de regroupement : le demi de mêlée (9) ÉCARTE le ballon de la
      // congestion. À la sortie d'un ruck/d'une mêlée, les deux paquets sont
      // massés autour du ballon et la défense ne laisse pas passer le porteur ;
      // le 9 ne doit donc PAS foncer dedans, il donne à l'ouvreur (10) ou à un
      // trois-quarts placé EN ESPACE derrière/à hauteur. C'est ce qui sort
      // réellement le ballon du regroupement et permet d'avancer. Très probable
      // dès qu'une option existe (encore plus sous pression immédiate).
      if (porteur.numero === 9) {
        // Sortie classique 9->10 : le 9 donne à l'ouvreur dégagé à hauteur/léger
        // retrait. (Varier ce destinataire déstabilise l'alignement et effondre
        // les essais — cf. _tenterPasse, branche passeurNeuf. La largeur vient du
        // 10 qui écarte ensuite le long de la ligne.)
        // Le 9 donne au 10 QUASI SYSTÉMATIQUEMENT, même si un défenseur est proche
        // du 10 (c'est une passe, le 10 recevra et décidera) : sinon, dès que la
        // défense montait vite, le 9 ne trouvait « personne de libre » et fonçait
        // au ras du ruck où il se faisait plaquer (67 plaquages/match sur le 9 !).
        // Son rôle est de PASSER, pas de porter. On force la cible sur le 10.
        const dix = att.find(j => j.numero === 10 && j.auSol === 0
          && (j.x - porteur.x) * porteur.sensAttaque <= 0.5
          && distance(j, porteur) < 20);
        // SYNCHRONISATION : si le 10 est encore PROFOND (> 4,5 m en retrait,
        // en train de s'élancer), le 9 tient le ballon un court instant
        // (≤ 0,6 s) pour lui passer À PLAT en pleine course — au lieu de lâcher
        // aussitôt une passe de 6-8 m vers l'arrière (« que des passes en
        // arrière »). Passé 0,6 s, il donne quand même (jeu rapide d'abord).
        if (dix) {
          const profondeurDix = (porteur.x - dix.x) * porteur.sensAttaque;
          if (profondeurDix > 4.5 && this.timerPhase < 0.6) return null;
          this._passeCibleForcee = dix; return 'PASS';
        }
      }

      // 2c. Trois-quarts qui FAIT VIVRE LA LIGNE : un back (10-13) qui a un
      // partenaire EXTÉRIEUR (plus près de la touche ouverte) et EN ESPACE écarte
      // le ballon vers le large plutôt que de rentrer au centre. C'est ce qui
      // exploite la largeur du terrain (10->12->13->aile) au lieu de figer le jeu
      // sur l'axe central 9-10. On vise le joueur SUIVANT de la ligne (passe
      // courte, <22 m), jamais un saut direct vers l'ailier collé à la touche
      // (marge de bord), et on évite de fixer un partenaire déjà sous pression.
      if (porteur.numero >= 10 && porteur.numero <= 13 && zone !== 'CINQ_M') {
        // On vise le SUIVANT dans la ligne des trois-quarts (plus à l'extérieur :
        // 10→12→13→aile), onside et en espace, et on FORCE la passe sur lui — une
        // passe courte et latérale (jamais en arrière). C'est ce qui fait circuler
        // le ballon sur 2-3 passes avant le contact au lieu de foncer au ras.
        const ordreL = { 10: 0, 12: 1, 13: 2, 11: 3, 14: 3 };
        const rangP = ordreL[porteur.numero] ?? 0;
        // On vise le VOISIN IMMÉDIAT dans la ligne (rang le plus proche au-dessus),
        // à courte distance (< 13 m) : passe courte et latérale au joueur d'à côté.
        // On passe MÊME si un défenseur est proche du receveur (c'est une passe, le
        // receveur enchaînera) : sinon la chaîne s'arrêtait au 12 dès que la défense
        // couvrait, et le porteur fonçait au ras. C'est en faisant TOURNER le ballon
        // vite le long de la ligne qu'on atteint enfin l'espace au large (13/aile).
        const suivant = att.filter(j => j !== porteur && j.auSol === 0
          && (ordreL[j.numero] ?? -1) > rangP
          && (j.x - porteur.x) * porteur.sensAttaque <= 0.5 // onside (à hauteur/léger retrait)
          && distance(j, porteur) < 13
          && joueurLePlusProche(this.defenseurs(), j.x, j.y).distance > 2) // au moins un peu d'air
          .sort((a, b) => (ordreL[a.numero] - ordreL[b.numero]))[0];
        // Passe rapide et fiable le long de la ligne (taux élevé) tant que le
        // porteur n'est pas au contact immédiat : le ballon file vers le large.
        // ENCHAÎNEMENT : un receveur frais (vient de recevoir, fenêtre _enchaine)
        // relâche le ballon nettement plus volontiers — c'est ce qui fait
        // TRAVERSER la ligne au ballon (10->12->13->aile) plus vite que la
        // défense ne glisse, au lieu de mourir au 2e maillon. Mesuré sans ça :
        // 2,2 passes par séquence, 32 % seulement à 3+ passes.
        const cfgAtt = this.cfgAttaque[porteur.team];
        const tauxLigne = (pression ? cfgAtt.jeuLargeTaux.pression : cfgAtt.jeuLargeTaux.calme)
          // Bonus d'enchainement ramene de 2,2 a 1,5 : un receveur frais relache
          // toujours le ballon plus volontiers (le mouvement continue), mais
          // plus deux fois plus vite qu'un porteur installe — c'etait la
          // deuxieme source du deluge de passes.
          * ((porteur._enchaine || 0) > 0 ? 1.5 : 1);
        // ON NE PASSE QUE SI LE SUIVANT EST MIEUX SERVI QUE SOI. Jusqu'ici la
        // chaîne se déroulait jusqu'à l'aile à tous les coups : le porteur
        // cherchait un partenaire onside, à portée, avec un peu d'air, et lui
        // donnait — sans JAMAIS comparer cet air au sien. Un centre avec neuf
        // mètres devant lui redonnait donc au large exactement comme un centre
        // pris au collet, et c'est ce qui faisait marquer 71,2 % des essais aux
        // deux ailiers (repère réel : environ 28 %).
        //
        // Un vrai trois-quarts fait l'inverse : il passe quand le suivant a plus
        // d'espace que lui, et il y va quand c'est lui qui l'a. La marge de 20 %
        // évite de transformer la règle en bascule : à espace comparable, la
        // chaîne continue de vivre comme avant.
        const espaceSuivant = suivant
          ? joueurLePlusProche(this.defenseurs(), suivant.x, suivant.y).distance : 0;
        const suivantMieuxServi = espaceSuivant > distDef * 1.2;
        if (suivant && suivantMieuxServi && distDef > 2.4 && this.rng() < tauxLigne * RYTHME_PASSES * dt) {
          this._passeCibleForcee = suivant; return 'PASS';
        }
      }

      // 3. Passe avant contact, modulée par le PROFIL du porteur (autonomie) :
      // un AVANT (tendance haute) va au CONTACT pour avancer et fixer plutôt que
      // de lâcher ; un FINISSEUR rapide (ailier/arrière, vitesse élevée) se fie à
      // sa vitesse et PERCE plutôt que de passer ; un DISTRIBUTEUR (ouvreur/centre)
      // lâche volontiers le ballon avant le choc. Même situation, choix différent
      // selon le joueur — au lieu d'un taux unique pour tous.
      let pPasse = 0.7;
      if (porteur.numero <= 8) pPasse = 0.45;
      else if (porteur.vitesse > 80) pPasse = 0.45;
      // L'OUVREUR est d'abord un distributeur (P2-114) : il gagnait 58 m par
      // match, plus que les ailiers (56), presque tout en portages hors percée
      // (50 m sur 62) — il courait dans la ligne au lieu de servir. 0,9 -> 1,5 :
      // 49 m pour l'ouvreur, 59 pour les ailiers (100 matchs appariés).
      else if (porteur.numero === 10) pPasse = 1.5;
      else if (porteur.numero === 12 || porteur.numero === 13) pPasse = 0.9;
      if (distDef < 5.5 && soutienDisponible && this.rng() < pPasse * RYTHME_PASSES * dt) {
        return 'PASS';
      }

      // 4. Jeu au large : occasionnellement, même sans pression immédiate,
      // l'attaque écarte délibérément vers un trois-quarts/arrière (numéro
      // de tendance basse) plutôt que de jouer le ballon près du regroupement.
      if (!pression && zone !== 'CINQ_M' && this.timerPhase > 1.0) {
        // Les ailiers/arrière tiennent leur couloir, donc à 20-30 m du
        // regroupement la plupart du temps : chercher l'option large dans le
        // même rayon de 15 m que le soutien rapproché ne trouve quasiment
        // jamais qu'un centre, jamais un ailier. D'où un rayon dédié, plus
        // large, pour cette détection (la passe elle-même reste risquée sur
        // la distance via probaReussite dans _tenterPasse).
        // Distance ramenée de 45 m à 18 m : le « jeu au large » ne doit PAS être
        // une passe interminable par-dessus tout le terrain (« super longue passe »
        // signalée). L'écartement se fait de proche en proche via la ligne (2c) ;
        // ici on ne cherche qu'un partenaire large RAISONNABLEMENT proche.
        const soutienLarge = att.find(j => j !== porteur && j.auSol === 0
          && j.tendance <= 50 && distance(j, porteur) < 18);
        // Taux relevé (0.22 -> 0.33) : l'attaque ÉCARTE le ballon plus souvent
        // vers les trois-quarts au lieu de le porter systématiquement au contact —
        // le ballon circule davantage (comme en vrai). On ne relève QUE le jeu au
        // LARGE (pas la passe de contact) : augmenter la passe brute effondre le
        // score (ballon latéral sans percer + en-avants), tandis que l'écart vers
        // l'espace fait vivre le jeu sans casser la finition (score préservé ~47).
        // Taux abaissé (0,33 -> 0,15) : la passe LONGUE directe est RARE en vrai
        // (difficile, interceptable) — l'écart normal se fait par passes courtes
        // successives le long de la ligne (cf. 2c + diagonale d'attaque).
        if (soutienLarge && this.rng() < 0.15 * RYTHME_PASSES * dt) return 'JEU_LARGE';
      }

      // 4b. ANTI « DÉPART AU RAS » : un demi/back (9-13) pris tout près du
      // regroupement, en plein champ (pas dans les 22 m, où le pick-and-go /
      // la percée près de la ligne sont légitimes), ne CRASHE PAS bêtement le
      // ballon 3 m après la sortie — il le garde vivant en le donnant au
      // partenaire SUIVANT de la ligne (plus à l'extérieur, onside, à portée)
      // pour continuer d'écarter. C'est la dernière option avant le contact :
      // mesuré, les rucks « au ras » (< 5 m du précédent) venaient à 55 % du
      // 9/10/12 qui recevaient et se faisaient plaquer sur place au lieu de
      // faire circuler. On ne déclenche ce relais que si le partenaire existe
      // (sinon on retombe sur le contact) — donc jamais de passe dans le vide.
      if (porteur.numero >= 9 && porteur.numero <= 13
          && zone !== 'CINQ_M' && zone !== 'OPP_22' && distDef < 2.2) {
        const ordreRelais = { 9: -1, 10: 0, 12: 1, 13: 2, 15: 2, 11: 3, 14: 3 };
        const rangP = ordreRelais[porteur.numero] ?? 0;
        const relais = att.filter(j => j !== porteur && j.auSol === 0
          && (ordreRelais[j.numero] ?? -2) > rangP
          && (j.x - porteur.x) * porteur.sensAttaque <= 0.5 // onside (jamais devant)
          && distance(j, porteur) < 14)
          .sort((a, b) => (ordreRelais[a.numero] - ordreRelais[b.numero]))[0];
        if (relais) { this._passeCibleForcee = relais; return 'PASS'; }
      }

      // 5. Hors de portée de plaquage et aucune décision ci-dessus : on
      // continue de courir (cf. logique d'évitement existante).
      if (distDef >= 2.2) return 'RUN';
      return 'CONTACT';
    }

    // Exécute une passe (courte ou jeu au large) vers le meilleur soutien
    // disponible. Retourne true si la tentative a consommé le tick (passe
    // réussie, en-avant ou passe ratée -> mêlée), false s'il n'y avait aucun
    // candidat valable (le tick retombe alors sur la logique de course/contact).
    // Déclenche le vol visuel d'une passe : le ballon part du passeur et
    // décrit un court arc jusqu'au receveur (cf. getState), au lieu de "sauter"
    // instantanément. La possession (this.porteur) change tout de suite côté
    // logique — c'est purement de l'affichage —, donc aucun impact sur le jeu,
    // les statistiques ou les invariants ; seul le dernier saut instantané du
    // ballon lors d'une passe disparaît à l'écran. Durée proportionnelle à la
    // distance (passe courte ~0,15 s, jeu au large ~0,5 s).
    // Defenseur en position d'intercepter une passe, ou null. Voir le commentaire
    // detaille au point d'appel (_tenterPasse).
    _chercherInterception(passeur, cible) {
      const vx = cible.x - passeur.x, vy = cible.y - passeur.y;
      const len2 = vx * vx + vy * vy;
      if (len2 < 0.01) return null;
      // Temps de vol : tout depend de la longueur de la passe (cf. constantes).
      const longueur = Math.sqrt(len2);
      const facteurLongueur = Math.max(0, Math.min(FACTEUR_LONGUEUR_MAX,
        (longueur - LONGUEUR_ININTERCEPTABLE) / ECHELLE_LECTURE));
      if (facteurLongueur <= 0) return null; // un pop de fixation ne s'intercepte pas
      // Le couloir s'elargit avec le vol : le defenseur a le temps de s'y mettre.
      let meilleur = null;
      let distMin = SEUIL_COULOIR_INTERCEPTION + GAIN_COULOIR_PAR_METRE * longueur;
      for (const d of this.defenseurs()) {
        if (d.auSol > 0 || d.horsJeuKick > 0 || d.sinBin > 0) continue;
        // Derriere le passeur : il ne voit pas partir le ballon.
        if ((d.x - passeur.x) * passeur.sensAttaque < -0.5) continue;
        const wx = d.x - passeur.x, wy = d.y - passeur.y;
        const u = (wx * vx + wy * vy) / len2;
        // Projection hors du segment : il est a cote du passeur ou colle au
        // receveur (ou c'est un plaquage, pas une interception).
        if (u < 0.15 || u > 0.95) continue;
        const px = passeur.x + vx * u, py = passeur.y + vy * u;
        const dist = Math.hypot(d.x - px, d.y - py);
        if (dist < distMin) { distMin = dist; meilleur = d; }
      }
      if (!meilleur) return null;
      // Lecture du jeu : l'attribut "adresse" (0-100, neutre 60) module la
      // prise. Un defenseur qui lit bien intercepte plus, sans que cela
      // devienne courant pour autant.
      const lecture = typeof meilleur.adresse === 'number'
        ? Math.max(0.5, Math.min(1.6, 1 + (meilleur.adresse - 60) / 80)) : 1;
      return this.rng() < PROBA_INTERCEPTION * lecture * facteurLongueur ? meilleur : null;
    }

    _lancerPasseVisuelle(passeur, cible) {
      // Point de départ du vol : normalement les mains du passeur. MAIS si une
      // passe est déjà en vol (ballon pas encore arrivé au receveur précédent),
      // on démarre la nouvelle passe depuis la position ACTUELLE du ballon en
      // vol, pas depuis le passeur : sinon, sur les passes enchaînées le long de
      // la ligne (9->10->12->13...), chaque nouvelle passe faisait "sauter" le
      // ballon depuis son vol en cours jusqu'au passeur suivant — la balle qui
      // apparaît puis disparaît pour réapparaître ailleurs. Ainsi le ballon
      // glisse de façon continue d'un receveur au suivant.
      let fromX = passeur.x, fromY = passeur.y;
      if (this.passeVisuelle) {
        const P = this.passeVisuelle;
        const t = P.duree > 0 ? Math.min(1, P.timer / P.duree) : 1;
        fromX = P.fromX + (P.cible.x - P.fromX) * t;
        fromY = P.fromY + (P.cible.y - P.fromY) * t;
      }
      const d = distance({ x: fromX, y: fromY }, cible);
      this.passeVisuelle = {
        fromX, fromY, cible,
        timer: 0,
        // Durée proportionnelle à la distance, plafonnée plus haut pour les
        // passes au large (sinon le ballon "saute" ~5 m/tick et paraît
        // téléporté) : une passe longue prend ~1 s comme en vrai.
        duree: Math.max(0.12, Math.min(1.0, d / 20)),
      };
    }

    // LOI 11 — LA PASSE TROP PLATE SOUS PRESSION (P2-112). Le moteur ne
    // sifflait une passe en avant que lorsque le porteur n'avait aucune option
    // légale : 0,1 à 0,2 par match, contre 1 à 3 en vrai. En vrai, elle naît
    // surtout d'une passe lâchée PLATE (receveur à moins d'un mètre en retrait)
    // par un porteur pressé par un défenseur, le receveur lancé : le ballon
    // part vers l'avant et l'arbitre siffle. Le risque grandit avec la
    // pression et la platitude, et baisse avec l'attribut « passe ». Une passe
    // nettement en retrait, ou lâchée sans pression, n'est jamais jugée en avant.
    _passePlateJugeeEnAvant(porteur, cible) {
      const recul = (porteur.x - cible.x) * porteur.sensAttaque;
      if (recul >= 1 || recul < -0.3) return false;
      const pression = joueurLePlusProche(this.defenseurs().filter(d => d.auSol === 0), porteur.x, porteur.y).distance;
      if (!(pression < 3)) return false;
      const facteurPasse = typeof porteur.passe === 'number'
        ? Math.max(0.4, Math.min(1.8, 1 + (60 - porteur.passe) / 60)) : 1;
      const p = 0.32 * (1 - Math.max(0, recul)) * ((3 - pression) / 3) * facteurPasse;
      return this.rng() < p;
    }

    _tenterPasse(porteur, jeuLarge) {
      const att = this.attaquants();
      // Rayon de recherche du destinataire : un jeu au large vise précisément
      // un ailier/arrière qui tient son couloir à 20-30 m du regroupement, le
      // plafond de 25 m utilisé pour la passe courte l'exclurait presque
      // toujours — la distance reste pénalisée via probaReussite ci-dessous.
      // Rayon du jeu au large ramené de 45 à 28 m : une passe de 30-45 m
      // n'existe pas (sauf coup de pied) — même la sautée reste sous ~20 m.
      const rayon = jeuLarge ? 28 : 25;
      let candidats = att.filter(j => j !== porteur && j.auSol === 0 && distance(j, porteur) <= rayon);
      if (jeuLarge) candidats = candidats.filter(j => j.tendance <= 50);
      // Un vrai joueur ne cherche pas un soutien placé devant lui dans le sens
      // d'attaque : il sait que ce serait une passe en avant, donc il regarde
      // les options à hauteur ou en retrait avant de lâcher le ballon. Sans ce
      // filtre, le meilleur candidat au score (proximité/tendance) était
      // parfois légèrement devant le porteur, transformant une simple passe en
      // mêlée pour passe en avant bien plus souvent qu'en match réel. On garde
      // un repli sur la liste complète si aucune option à hauteur/en retrait
      // n'existe, comme un joueur sous pression qui tente quand même sa chance.
      const memesTolerance = 0.3;
      const candidatsOnside = candidats.filter(j => (j.x - porteur.x) * porteur.sensAttaque <= memesTolerance);
      if (candidatsOnside.length > 0) {
        candidats = candidatsOnside;
      } else {
        // AUCUNE option legale : tous les partenaires a portee sont DEVANT le
        // porteur. Un joueur ne lache pas sciemment une passe en avant — il
        // GARDE le ballon et va au contact (ou botte). Avant, on retombait sur
        // la liste complete, donc sur une passe en avant CERTAINE : mesure,
        // 12,2 passes en avant par match, alors qu'un vrai match en compte 1 a
        // 3 et que la faute de main normale est l'EN-AVANT au contact.
        // On garde une part de vraie maladresse (le porteur tente quand meme,
        // le receveur a survole sa course) : rare, et d'autant plus rare que le
        // porteur a une bonne prise de decision.
        const facteurDecision = typeof porteur.decision === 'number'
          ? Math.max(0.5, Math.min(1.6, 1 + (60 - porteur.decision) / 75)) : 1;
        // 8 % : le moteur siffle alors 0,4 passe en avant par match, contre 1 a 3
        // dans un vrai match. C'est un ECART ASSUME, mesure : monter ce taux
        // remplace des touches par des melees, or le nombre de touches et de
        // plaquages est deja au plancher de sa fourchette — a 12 % comme a
        // 20 %, le moteur retombe a 11/14 categories realistes contre 13/14
        // ici. La faute existe et reste sanctionnee (cf. le test direct de
        // Referee.passeEnAvant dans server/test-invariants.js) ; elle est
        // seulement plus rare qu'en vrai.
        // Taux releve de 0,08 a 0,12 puis a 0,20 pour COMPENSER, a frequence
        // absolue egale,
        // l'effet du retrait des sortants de ruck de la ligne defensive : avec
        // plus d'espace, l'attaque se retrouve beaucoup plus rarement sans
        // solution legale, et la sanction de la passe en avant tombait de 0,33
        // a 0,20 par match (30 matchs) — la loi devenait quasi invisible. A
        // 0,12 elle retrouvait exactement son niveau d'avant (0,33). La baisse
        // de la cadence de passes (jeuLargeTaux 1,7 -> 0,7) a reproduit le meme
        // effet une seconde fois : 0,17 par match mesure, de nouveau sous le
        // plancher. A 0,20 la sanction remonte a 0,40 par match — au-dessus de
        // son niveau historique et un peu plus pres du reel (1 a 3), pour un
        // cout nul ailleurs (chaque passe en avant vaut une melee, soit +0,2
        // melee par match).
        if (this.rng() >= 0.20 * facteurDecision) return false;
      }
      // Une passe se donne à un joueur SUR LE CÔTÉ (composante latérale) :
      // passer droit dans son propre dos est impossible. On écarte les cibles
      // sans décalage latéral (< 1,2 m) tant qu'une option latérale existe.
      const candidatsLateraux = candidats.filter(j => Math.abs(j.y - porteur.y) > 1.2);
      if (candidatsLateraux.length > 0) candidats = candidatsLateraux;
      if (candidats.length === 0) return false;

      // Le demi de mêlée (9) qui sort le ballon cherche à l'ÉCARTER de la
      // congestion : il vise l'ouvreur (10) en priorité, puis un trois-quarts
      // EN ESPACE (défenseur le plus proche loin), pas un avant collé au
      // regroupement. Pour les autres passeurs, on garde la logique « soutien
      // le plus proche ».
      const passeurNeuf = porteur.numero === 9;
      const passeurBack = porteur.numero >= 10 && porteur.numero <= 13;
      let cible = candidats[0], meilleurScore = -Infinity;
      // Cible imposée par une décision du porteur (ex. le 9 libre qui sert un
      // avant lancé tout près à la sortie, cf. choisirActionPorteur) : on
      // court-circuite le scoring si elle est bien une option légale (onside).
      const cibleForcee = this._passeCibleForcee; this._passeCibleForcee = null;
      if (cibleForcee && candidats.includes(cibleForcee)) {
        cible = cibleForcee;
      } else
      for (const c of candidats) {
        const d = distance(c, porteur);
        let score;
        if (jeuLarge) {
          score = Math.abs(c.channelY - LARGEUR / 2) - d * 0.3;
        } else if (passeurNeuf) {
          // Le 9 vise l'ouvreur (10) en priorité, puis le soutien dégagé le plus
          // proche — sans aller chercher le joueur le plus profond (ce qui ferait
          // reculer le ballon et tuerait l'avancée). L'attaque du moteur démarre
          // structurellement par cette sortie 9->10 ; varier le destinataire du 9
          // (back plus large/profond) déstabilise l'alignement et effondre les
          // essais (testé). La VARIÉTÉ vient ensuite du 10 qui écarte le long de la
          // ligne (cf. branche passeurBack).
          const espace = joueurLePlusProche(this.defenseurs(), c.x, c.y).distance;
          score = (c.numero === 10 ? 80 : 0) + espace * 0.5 - d * 0.4 - c.tendance * 0.1;
        } else if (passeurBack) {
          // Trois-quarts qui fait vivre la ligne : il vise un partenaire EN ESPACE
          // dans la zone MI-LARGE (couloirs des centres/arrière), pas le soutien
          // le plus proche (souvent un avant central) NI l'ailier collé à la
          // touche. « largeurUtile » récompense l'écartement jusqu'à ~22 m du
          // centre PUIS REDESCEND vers la touche (offset 35) : ainsi le ballon va
          // au large sans s'entonner dans le coin (ce qui envoyait l'ailier en
          // touche). La pénalité de distance garde la passe sur le joueur suivant.
          const espace = joueurLePlusProche(this.defenseurs(), c.x, c.y).distance;
          const offset = Math.abs(c.y - LARGEUR / 2);
          const largeurUtile = offset > 22 ? Math.max(0, LARGEUR / 2 - offset) : offset;
          score = largeurUtile * 2 + espace * 0.7 - d * 0.5;
        } else {
          score = (100 - d) + c.tendance * 0.1;
        }
        if (score > meilleurScore) { meilleurScore = score; cible = c; }
      }

      this.stats[this.possession].passesTentees++;
      if (Referee.passeEnAvant(porteur.sensAttaque, porteur, cible)) {
        this.log('MELEE_AVANT', this.possession, `Passe en avant, equipe ${this.possession} - melee adverse`);
        this._accorderMelee(this.possession, porteur);
        return true;
      }
      if (this._passePlateJugeeEnAvant(porteur, cible)) {
        this.log('MELEE_AVANT', this.possession,
          `Passe en avant du n°${porteur.numero} (passe trop plate sous pression), equipe ${this.possession} - melee adverse`,
          { de: porteur.numero, vers: cible.numero });
        this._accorderMelee(this.possession, porteur);
        return true;
      }
      // INTERCEPTION. Un defenseur place DANS LE COULOIR DE PASSE, a hauteur du
      // passeur ou devant lui, peut lire la trajectoire et partir dessus. C'est
      // l'evenement le plus spectaculaire du rugby — et il n'existait pas : le
      // moteur ne pouvait perdre le ballon sur une passe qu'en la RATANT.
      // Consequence mesuree, les changements de possession ne venaient que de
      // trois sources (grattage au ruck 6,9, touche volee 1,9, melee contre
      // l'introduction 0,4 = 9,2 par match, contre 12 a 18 en vrai).
      //
      // Le defenseur doit etre REELLEMENT dans le couloir : proche du SEGMENT
      // passeur->receveur (pas seulement du receveur), sa projection tombant
      // entre les deux, debout, en jeu, et pas derriere le passeur. Mesure :
      // c'est le cas sur 12,3 passes par match (2,3 % d'entre elles). Le taux
      // de prise est calibre pour produire ~0,8 interception par match, la
      // frequence reelle.
      {
        const interception = this._chercherInterception(porteur, cible);
        if (interception) {
          const equipeDef = this.possession === 'A' ? 'B' : 'A';
          this.stats[this.possession].turnoversConcedes++;
          this.stats[equipeDef].turnovers++;
          this._statJoueur(interception).turnoversGagnes++;
          this.log('INTERCEPTION', equipeDef,
            `Interception du n°${interception.numero} ! Le ballon change de camp, equipe ${equipeDef}`,
            { de: porteur.numero, par: interception.numero });
          this.possession = equipeDef;
          this.porteur = interception;
          // Le ballon vole du passeur jusqu'à l'intercepteur, à vue (P2-88) :
          // effacer la passe visuelle le faisait apparaître d'un coup dans ses
          // mains (~6 m, jusqu'à 10 m).
          this.passeVisuelle = null;
          this._lancerPasseVisuelle(porteur, interception);
          // Tout le monde court dans l'autre sens : l'intercepteur part dans un
          // espace reel, comme apres un franchissement (cf. _percee).
          interception._percee = 2.5;
          this.phase = 'PORTE';
          this.timerPhase = 0;
          this._receptionDirecte = false;
          return true;
        }
      }
      const distancePasse = distance(porteur, cible);
      // Réussite de passe réaliste : en match réel une passe se complète à
      // ~95-98 %, y compris au large. L'ancien plancher 0.65 faisait rater 35 %
      // des passes longues, ce qui produisait ~19 mêlées/match sur passe ratée
      // (bien trop : cf. repère 8-25 mêlées TOTALES, CLAUDE.md Rôle 6). On
      // relève le plancher et on adoucit la pénalité de distance.
      // Une passe COURTE (9->10, passe le long de la ligne au voisin) se complète
      // en réalité à ~99 % : elle ne doit quasiment jamais finir en mêlée. Seules
      // les passes LONGUES (sautée, jeu au large tendu) gardent un vrai risque.
      // Le taux est calibré sur le NOMBRE ABSOLU d'en-avants par match (~10-15
      // en réel) et non sur un pourcentage : le moteur joue beaucoup de passes
      // (structure 9->10->ligne), donc même un petit pourcentage d'échec
      // produisait des dizaines de mêlées sur passe ratée (56 mesurées, puis 36).
      // Barème : ~99,3 % de près, ~98 % à 20 m, plancher 97 % au large.
      // Écart borné et volontairement PETIT (cf. attribut "passe", 0-100,
      // neutre à 60) : la base ci-dessus est déjà calibrée sur le nombre
      // absolu d'en-avants réels par match, un skill de passe ne doit
      // qu'affiner ce taux déjà très élevé, jamais le dénaturer.
      const skillPasse = typeof porteur.passe === 'number'
        ? Math.max(-0.02, Math.min(0.015, (porteur.passe - 60) * 0.0003)) : 0;
      const probaReussite = Math.max(0.94, Math.min(0.999,
        Math.max(0.97, Math.min(0.998, 1.0 - distancePasse / 1500)) + skillPasse));
      if (this.rng() < probaReussite) {
        this.stats[this.possession].passes++;
        this._statJoueur(porteur).passes++;
        // FIXAGE / SURNOMBRE : si le passeur (n'importe qui, 9 compris — sa
        // sortie de ruck fixe tout autant un défenseur qu'une passe de back) a
        // couru sur son défenseur avant de lâcher — un adversaire est tout
        // proche DEVANT lui — il l'a FIXÉ. Ce défenseur est battu par la passe :
        // il ne peut plus glisser couvrir le receveur pendant un court instant
        // (fixeCooldown). En enchaînant fixe+passe le long de la ligne, les
        // défenseurs intérieurs sont battus un à un et un SURNOMBRE se crée au
        // large → c'est ça qui fait qu'écarter le ballon PERCE (au lieu de
        // mourir sur une défense qui couvre tout).
        // AVANT : le 9 (numero 9) était EXCLU (seuil >= 10) — mesuré : sa passe
        // au 10 (34 % de toutes les sorties de ruck, la plus grosse catégorie)
        // ne fixait jamais aucun défenseur. Avec une défense bien organisée en
        // créneaux (sans trous, cf. patch précédent), un défenseur se trouvait
        // quasi toujours déjà à portée du 10 à la réception, sans la moindre
        // fenêtre pour relayer — 54 % de ces séquences restaient à moins de 5 m
        // de large. Le 9 doit fixer comme n'importe quel passeur.
        if (porteur.numero >= 9) {
          const sens = porteur.sensAttaque;
          let fixe = null, dmin = 4.6;
          for (const d of this.defenseurs()) {
            if (d.auSol > 0 || (d.fixeCooldown || 0) > 0) continue;
            const devant = (d.x - porteur.x) * sens; // > 0 = devant le passeur (côté défense)
            const dd = distance(d, porteur);
            if (devant > -1.5 && devant < 4 && dd < dmin) { dmin = dd; fixe = d; }
          }
          if (fixe) fixe.fixeCooldown = 2.6; // cf. INERTIE DE COURSE : meme distance de retard, deux fois plus de temps
        }
        // Le fil du match affichait « Passe de l'equipe A » cinq fois d'affilee :
        // 14,3 des 30 evenements conserves sont des passes, et 29 % d'entre eux
        // repetaient MOT POUR MOT la ligne precedente. On dit desormais QUI
        // passe A QUI — le joueur suit le ballon le long de la ligne au lieu de
        // lire la meme phrase en boucle — et l'interface regroupe la chaine
        // grace aux champs structures ci-dessous.
        this.log(jeuLarge ? 'JEU_LARGE' : 'PASSE', this.possession,
          `${jeuLarge ? 'Jeu au large' : 'Passe'} du n°${porteur.numero} au n°${cible.numero}, equipe ${this.possession}`,
          { de: porteur.numero, vers: cible.numero });
        this._lancerPasseVisuelle(porteur, cible);
        // Fenêtre d'enchaînement : le receveur a ~0,9 s pendant lesquelles il
        // relâche volontiers le ballon au suivant (le mouvement continue).
        cible._enchaine = 1.8; // cf. INERTIE DE COURSE : le mouvement se poursuit sur la meme distance
        this._dernierePasse = { passeur: porteur, receveur: cible };
        this.porteur = cible;
        this._receptionDirecte = false;
        this._neufLibre = false; // le ballon a quitté le 9 : la fenêtre de décision de sortie est close
      } else {
        this.stats[this.possession].knockOns++;
        this._statJoueur(cible).enAvants++;
        this.log('PASSE_RATEE', this.possession, `Passe ratee, equipe ${this.possession} - melee adverse`);
        this._accorderMelee(this.possession, cible);
      }
      return true;
    }

    // Sélectionne le type de coup de pied tactique selon la zone (déjà
    // décidé par choisirActionPorteur) puis l'exécute via _tenterCoupDePiedJeu.
    _executerCoupDePiedJeu(porteur) {
      const zone = this._zoneTerrain(porteur);
      let type;
      const r = this.rng();
      if (this._typeCoupDePiedForce) {
        // Chandelle du n°9 depuis la base (cf. choisirActionPorteur, section 0).
        type = this._typeCoupDePiedForce;
        this._typeCoupDePiedForce = null;
      } else if (zone === 'OWN_22') {
        // Dans SES 22, une equipe vise la TOUCHE avant tout : depuis ses 22 le
        // coup de pied direct en touche est autorise et rend le ballon a
        // l'adversaire LOIN de sa ligne — c'est le degagement de reference du
        // rugby, et il ARRETE le jeu. Le moteur ne visait la touche que 30 % du
        // temps et rendait le reste en l'air : 98 coups de pied par match pour
        // 21 touches seulement, c'est-a-dire ~77 relances adverses, autant de
        // sequences de jeu en plus et un ballon en jeu artificiellement long.
        type = r < 0.50 ? 'TOUCHE' : r < 0.85 ? 'DEGAGEMENT' : 'CHANDELLE';
      } else if (zone === 'OWN_HALF') {
        // Dans son camp mais hors des 22, la touche demande un rebond : plus
        // rare, mais c'est quand meme une option de terrain courante.
        type = r < 0.30 ? 'TOUCHE' : r < 0.80 ? 'OCCUPATION' : 'CHANDELLE';
      } else if (zone === 'OPP_HALF') {
        type = r < 0.60 ? 'CHANDELLE' : 'CHIP';
      } else {
        type = 'CHIP';
      }
      this._tenterCoupDePiedJeu(porteur, type);
    }

    // Lance le ballon en vol pour un coup de pied tactique en jeu courant
    // (dégagement, occupation, chandelle contestable, touche directe ou chip) :
    // même mécanique de vol que le coup d'envoi, résolue dans _tickCoupDePiedJeu.
    _tenterCoupDePiedJeu(porteur, type) {
      const equipe = this.possession;
      this.stats[equipe].kicks++;
      this._statJoueur(porteur).coupsDePied++;
      const sens = porteur.sensAttaque;
      // Attribut "jeu au pied" (0-100, neutre 60) : distincte de l'adresse au
      // but, cette compétence module la PORTÉE réelle en jeu courant — un
      // bon botteur gagne du terrain, un piètre botteur en perd.
      const skillPied = typeof porteur.jeuPied === 'number'
        ? Math.max(-7, Math.min(7, (porteur.jeuPied - 60) * 0.14)) : 0;
      let portee, etale;
      if (type === 'DEGAGEMENT') { portee = 35 + this.rng() * 20 + skillPied; etale = true; }
      else if (type === 'OCCUPATION') { portee = 20 + this.rng() * 15 + skillPied * 0.7; etale = false; }
      // Touche : 25 à 45 m (moyenne 35). À 15-30 m, un dégagement depuis ses
      // 22 ne gagnait que 27 m et rendait la touche vers ses 40 m, à deux pas
      // des 22 adverses ; un ouvreur ou un arrière en gagne 30 à 45.
      else if (type === 'TOUCHE') { portee = 25 + this.rng() * 20 + skillPied * 0.7; etale = true; }
      else if (type === 'CHANDELLE') { portee = 10 + this.rng() * 10 + skillPied * 0.4; etale = false; }
      else { portee = 8 + this.rng() * 7 + skillPied * 0.3; etale = false; } // CHIP
      portee = Math.max(4, portee);
      // TENTATIVE DE 50:22 (P2-96). Depuis son camp, hors de ses 22 m, une
      // équipe qui cherche la touche vise les 22 m adverses quand elle les a à
      // portée : le ballon tombe juste à l'intérieur, près de la ligne, et
      // rebondit en touche (cf. _tickRouleBallon).
      // C'est un pari RARE et RISQUÉ : un quart des coups de pied « touche »
      // éligibles seulement, et une chute moins précise (1 à 11 m de la ligne)
      // — souvent le ballon reste dans le terrain et l'adversaire le récupère
      // dans ses 22. Toujours tenté, il donnait 3,5 50:22 par match (réel :
      // rarement plus d'un) et +4,8 points.
      let tente5022 = false;
      if (type === 'TOUCHE' && this._zoneTerrain(porteur) === 'OWN_HALF') {
        const jusqua22 = sens > 0 ? (LONGUEUR - 22) - porteur.x : porteur.x - 22;
        if (jusqua22 > 0 && jusqua22 <= 40 + skillPied && this.rng() < 0.25) {
          portee = jusqua22 + 2 + this.rng() * 6;
          tente5022 = true;
        }
      }

      const cibleX = Math.max(0, Math.min(LONGUEUR, porteur.x + sens * portee));
      let cibleY;
      if (type === 'TOUCHE' && this._zoneTerrain(porteur) !== 'OWN_22') {
        // Hors de ses 22 m, le direct en touche ne gagne aucun terrain (loi 18,
        // P2-95) : on vise la touche EN REBOND, 2 à 4 m à l'intérieur du
        // terrain, et le ballon roule dehors (cf. _tickRouleBallon).
        const marge = tente5022 ? 1 + this.rng() * 10 : 2 + this.rng() * 2;
        cibleY = porteur.y <= LARGEUR / 2 ? marge : LARGEUR - marge;
      } else if (type === 'TOUCHE') {
        cibleY = porteur.y <= LARGEUR / 2 ? -2 : LARGEUR + 2;
      } else if (etale) {
        cibleY = porteur.y <= LARGEUR / 2
          ? Math.max(-2, porteur.y - 10 - this.rng() * 15)
          : Math.min(LARGEUR + 2, porteur.y + 10 + this.rng() * 15);
      } else {
        cibleY = Math.max(3, Math.min(LARGEUR - 3, porteur.y + (this.rng() * 8 - 4)));
      }

      // SORTIE DE CAMP (exit play) : coup de pied depuis son propre 22 m pour se
      // dégager (motif discriminant de l'étude). Ratée si le ballon ne dégage pas
      // au-delà de la ligne des 22 m (reste dans la zone de danger) — hors touche,
      // qui trouve la ligne et dégage toujours.
      if (this._zoneTerrain(porteur) === 'OWN_22') {
        this.stats[equipe].exits++;
        const ligne22 = sens > 0 ? 22 : LONGUEUR - 22;
        if (type !== 'TOUCHE' && (cibleX - ligne22) * sens < 0) {
          this.stats[equipe].exitsRates++;
        }
      }

      this.typeCoupDePiedJeu = type;
      this.equipeCoupDePiedJeu = equipe;
      // LOI 10 — HORS-JEU SUR COUP DE PIED. Seuls les joueurs situes DERRIERE
      // le botteur au moment ou il frappe peuvent chasser. Tous ceux qui sont
      // devant sont HORS-JEU : ils doivent se retirer vers la ligne du coup de
      // pied et ne peuvent pas jouer le ballon ni plaquer tant qu'ils ne sont
      // pas remis en jeu. Le moteur faisait courir les QUINZE joueurs de
      // l'equipe botteuse vers le point de chute : mesure, 12,9 d'entre eux
      // etaient hors-jeu, et le receveur etait etouffe (un adversaire a moins
      // de 3 m sur 20 % des receptions, a moins de 6 m sur 47 %). Une relance
      // apres coup de pied etait donc impossible.
      for (const j of (equipe === 'A' ? this.equipeA : this.equipeB)) {
        if (j === porteur) { j.horsJeuKick = 0; continue; }
        j.horsJeuKick = (j.x - porteur.x) * sens > 1 ? DUREE_HORS_JEU_KICK : 0;
        j.horsJeuKickX = porteur.x;
      }
      this.xCoupDePiedJeu = porteur.x;
      this.yCoupDePiedJeu = porteur.y;
      this.cibleCoupDePiedX = cibleX;
      this.cibleCoupDePiedY = cibleY;
      this.log('COUP_DE_PIED', equipe, `Coup de pied (${type.toLowerCase()}) de l'equipe ${equipe}`);
      this.ballonEnVol = true;
      this.ballonVolX = porteur.x;
      this.ballonVolY = porteur.y;
      this.ballonVolHauteur = 0;
      this.phase = 'COUP_DE_PIED_JEU';
      this.timerPhase = 0;
    }

    // Vol d'un coup de pied tactique : sortie en touche (avec l'exception loi
    // 19.2 du 22 m) dès la chute si hors-terrain, sinon le ballon retombe au
    // sol et c'est _tickReceptionCoupDePied qui gère la course jusqu'à lui.
    _tickCoupDePiedJeu(dt) {
      this.timerPhase += dt;
      if (!this.ballonEnVol) { this._tickReceptionCoupDePied(dt); return; }

      const dxVol = this.cibleCoupDePiedX - this.xCoupDePiedJeu;
      const dyVol = this.cibleCoupDePiedY - this.yCoupDePiedJeu;
      const distVol = Math.hypot(dxVol, dyVol);
      const duree = dureeVolCoupDePied(this.typeCoupDePiedJeu, distVol);
      const t = Math.min(1, this.timerPhase / duree);
      this.ballonVolX = this.xCoupDePiedJeu + dxVol * t;
      this.ballonVolY = this.yCoupDePiedJeu + dyVol * t;
      this.ballonVolHauteur = Math.sin(Math.PI * t);

      const equipeKick = this.equipeCoupDePiedJeu;
      const chasseurs = equipeKick === 'A' ? this.equipeA : this.equipeB;
      const receveurs = equipeKick === 'A' ? this.equipeB : this.equipeA;
      const versBallonVol = new Set([
        ...this._groupeVersBallon(chasseurs, this.cibleCoupDePiedX, this.cibleCoupDePiedY, 3),
        ...this._groupeVersBallon(receveurs, this.cibleCoupDePiedX, this.cibleCoupDePiedY, 2),
      ]);
      const receveursTouche = receveurs.filter(j => versBallonVol.has(j))
        .sort((a, b) => distance(a, { x: this.cibleCoupDePiedX, y: this.cibleCoupDePiedY })
          - distance(b, { x: this.cibleCoupDePiedX, y: this.cibleCoupDePiedY }));
      for (const j of [...chasseurs, ...receveurs]) {
        if (j.horsJeuKick > 0) { this._replierHorsJeuKick(j, dt); continue; }
        if (!versBallonVol.has(j)) { this._tenirLigneCoupDePied(j, this.cibleCoupDePiedX, dt); continue; }
        // Coup de pied en touche : le receveur court au POINT DE SORTIE pour
        // récupérer le ballon (et relancer vite, cf. _preparerToucheRapide),
        // pas derrière le ballon en l'air. À 35 m de portée, il finissait à
        // 18 m du point de sortie et la touche rapide avait disparu.
        // Le second se place à 10 m à l'intérieur du terrain, à hauteur : c'est
        // lui qui recevra la touche rapide (loi 18 : à 5 m ou plus de la ligne).
        if (this.typeCoupDePiedJeu === 'TOUCHE' && j.team !== equipeKick) {
          const bas = this.cibleCoupDePiedY <= LARGEUR / 2;
          const yS = Math.max(1, Math.min(LARGEUR - 1, this.cibleCoupDePiedY));
          const premier = j === receveursTouche[0];
          const cy = premier ? yS : (bas ? 10 : LARGEUR - 10);
          avancer(j, this.cibleCoupDePiedX - j.x, cy - j.y, dt, vitesseMs(j) * 0.85);
          continue;
        }
        avancer(j, this.ballonVolX - j.x, this.ballonVolY - j.y, dt, vitesseMs(j) * 0.85);
      }

      if (this.timerPhase < duree) return;
      this.ballonEnVol = false;
      this.ballonVolHauteur = 0;
      const cibleX = Math.max(0, Math.min(LONGUEUR, this.cibleCoupDePiedX));
      const cibleY = Math.max(0, Math.min(LARGEUR, this.cibleCoupDePiedY));
      const horsTerrain = this.cibleCoupDePiedY <= 0.01 || this.cibleCoupDePiedY >= LARGEUR - 0.01;

      if (horsTerrain) {
        // LOI 18 — COUP DE PIED DIRECT EN TOUCHE (P2-95). En jeu courant, le
        // lancer revient TOUJOURS à l'adversaire de l'équipe qui a botté (seule
        // une pénalité tapée en touche garde le lancer). Depuis ses 22 m, la
        // touche se joue là où le ballon est sorti ; de plus loin, elle se joue
        // au niveau du point de frappe : le ballon direct en touche ne fait
        // gagner aucun terrain. Avant, le moteur donnait le lancer au botteur
        // depuis ses 22 m (un tiers des coups de pied directs en touche) et
        // plaçait toujours la touche au point de sortie.
        const zoneKickeur = this._zoneTerrain({ x: this.xCoupDePiedJeu, sensAttaque: equipeKick === 'A' ? 1 : -1 });
        const xTouche = zoneKickeur === 'OWN_22' ? cibleX : Math.max(5, Math.min(LONGUEUR - 5, this.xCoupDePiedJeu));
        this._accorderTouche(equipeKick, { x: xTouche, y: cibleY }, 'COUP_DE_PIED');
        return;
      }

      // Le ballon touche le sol : il reste loose au point de chute, personne
      // n'est téléporté dessus. _tickReceptionCoupDePied (appelée au prochain
      // tick puisque ballonEnVol vient de passer à false) fait converger les
      // chasseurs/receveurs en courant et ne déclare un porteur qu'une fois
      // l'un d'eux réellement arrivé au contact du ballon.
      this.ballonVolX = cibleX;
      this.ballonVolY = cibleY;
      this._receptionEnAttente = true;
      this.timerReceptionAuSol = 0;
      // LE BALLON ROULE (P2-92). Sans personne dessous, il rebondit et file
      // dans le sens du coup de pied : c'est ce qui fait gagner du terrain à un
      // dégagement et ce qui crée la course pour le récupérer. Avant, il
      // restait collé au point de chute. Un ballon reçu de volée (un joueur
      // sous le ballon) ne roule pas.
      const sousLeBallon = [...chasseurs, ...receveurs].some(j => Math.hypot(j.x - cibleX, j.y - cibleY) <= 1.3);
      const elan = { DEGAGEMENT: 6, OCCUPATION: 5, CHIP: 3, CHANDELLE: 1.5 }[this.typeCoupDePiedJeu] || 3;
      this._rouleBallon = !sousLeBallon && distVol > 0.1
        ? { vx: dxVol / distVol * elan, vy: dyVol / distVol * elan }
        : null;
      // Touche visée EN REBOND (P2-95) : le ballon est frappé en biais vers la
      // ligne et file vers elle après le rebond, au lieu de rouler dans l'axe.
      if (this._rouleBallon && this.typeCoupDePiedJeu === 'TOUCHE') {
        const versTouche = cibleY < LARGEUR / 2 ? -1 : 1;
        this._rouleBallon = { vx: Math.sign(dxVol) * 3, vy: versTouche * 4 };
      }
      this._ballonEnBut = null;
      // Coup de pied qui retombe au-delà de la ligne d'essai adverse : le ballon
      // est dans l'en-but (P2-93).
      if (this.cibleCoupDePiedX <= 0 || this.cibleCoupDePiedX >= LONGUEUR) this._entrerEnBut();
    }

    // Ballon dans l'en-but de l'équipe qui reçoit le coup de pied (P2-93). Les
    // joueurs ne franchissent pas la ligne dans ce moteur : le ballon est posé
    // à 0,8 m derrière elle, à portée de bras, et le premier arrivé décide —
    // le défenseur aplatit (renvoi aux 22 m, loi 12), le chasseur marque
    // (essai sur coup de pied à suivre, loi 8).
    _entrerEnBut() {
      const ligne = this.ballonVolX < LONGUEUR / 2 ? 0 : LONGUEUR;
      const defense = this.equipeCoupDePiedJeu === 'A' ? 'B' : 'A';
      this.ballonVolX = ligne === 0 ? -0.8 : LONGUEUR + 0.8;
      this._rouleBallon = null;
      this._ballonEnBut = { ligne, defense };
    }

    // Passe décisive (P2-103) : la dernière passe reçue par le marqueur, dans la
    // même séquence de jeu courant (cf. tick, remise à zéro hors PORTE).
    _passeDecisive(marqueur) {
      const D = this._dernierePasse;
      if (D && D.receveur === marqueur && D.passeur !== marqueur && D.passeur.team === marqueur.team) {
        this._statJoueur(D.passeur).passesDecisives++;
      }
      this._dernierePasse = null;
    }

    // Mètres gagnés (P2-102) : le terrain pris par le porteur au-delà du point
    // le plus avancé de la phase (cf. tick, ligne d'avantage). Statistique
    // seule : aucune décision du moteur ne la lit.
    _compterMetresGagnes(porteur) {
      if (!porteur || this._xGainPhase == null || this._possGainPhase !== this.possession) return;
      const gain = (porteur.x - this._xGainPhase) * porteur.sensAttaque;
      if (gain <= 0) return;
      this.stats[this.possession].metresGagnes += gain;
      this._statJoueur(porteur).metresGagnes += gain;
      this._xGainPhase = porteur.x;
    }

    // Rebond du ballon qui roule, pour l'affichage seulement (P2-100) : des
    // sauts de ~1,2 par seconde qui s'amortissent avec la vitesse, et le ballon
    // qui tourne sur lui-même. Rien quand il est arrêté ou tenu.
    _rebondBallon() {
      const R = this._rouleBallon;
      if (!this._receptionEnAttente || !R || !R.v0) return {};
      const v = Math.hypot(R.vx, R.vy), t = R.t || 0;
      return { rebond: 0.35 * Math.abs(Math.sin(Math.PI * 1.2 * t)) * Math.min(1, v / R.v0), rotation: t * 7 };
    }

    // Ballon qui roule après la chute (P2-92) : il ralentit (~3 m/s²), s'arrête
    // sur la ligne de but, et s'il franchit une ligne de touche, l'adversaire de
    // l'équipe qui a botté obtient la touche là où il est sorti (loi 18).
    // Renvoie true si le ballon est sorti en touche.
    _tickRouleBallon(dt) {
      const R = this._rouleBallon;
      if (!R) return false;
      const v = Math.hypot(R.vx, R.vy);
      // Rebonds à l'écran (P2-100) : temps de roulement et élan initial.
      R.t = (R.t || 0) + dt;
      if (R.v0 == null) R.v0 = v;
      if (v < 0.2) { this._rouleBallon = null; return false; }
      this.ballonVolX = Math.max(0, Math.min(LONGUEUR, this.ballonVolX + R.vx * dt));
      this.ballonVolY += R.vy * dt;
      const f = Math.max(0, v - 3 * dt) / v;
      R.vx *= f; R.vy *= f;
      // Le ballon franchit la ligne d'essai en roulant : il est dans l'en-but.
      if ((this.ballonVolX <= 0 && R.vx < 0) || (this.ballonVolX >= LONGUEUR && R.vx > 0)) {
        if (this.ballonVolY > 0 && this.ballonVolY < LARGEUR) { this._entrerEnBut(); return false; }
      }
      if (this.ballonVolY <= 0 || this.ballonVolY >= LARGEUR) {
        const y = Math.max(0, Math.min(LARGEUR, this.ballonVolY));
        this.ballonVolY = y;
        this._rouleBallon = null;
        this._receptionEnAttente = false;
        const kick = this.equipeCoupDePiedJeu, adv = kick === 'A' ? 'B' : 'A';
        // 50:22 (loi 18, P2-96) : tapé depuis son propre camp, le ballon a
        // rebondi dans le terrain et sort dans les 22 m adverses -> le lancer
        // revient à l'équipe qui a botté.
        const sens = kick === 'A' ? 1 : -1;
        const depuisSonCamp = (this.xCoupDePiedJeu - LONGUEUR / 2) * sens < 0;
        const dans22Adverses = sens > 0 ? this.ballonVolX >= LONGUEUR - 22 : this.ballonVolX <= 22;
        if (depuisSonCamp && dans22Adverses) {
          this.stats[kick].cinquanteVingtDeux++;
          this.log('CINQUANTE_VINGT_DEUX', kick, `50:22 ! Le coup de pied de l'equipe ${kick} rebondit en touche dans les 22 adverses : lancer pour l'equipe ${kick}`);
          this._accorderTouche(adv, { x: this.ballonVolX, y }, 'COUP_DE_PIED');
          return true;
        }
        this._accorderTouche(kick, { x: this.ballonVolX, y }, 'COUP_DE_PIED');
        return true;
      }
      return false;
    }

    // Ballon au sol après un coup de pied tactique, en attente de réception :
    // les chasseurs et receveurs continuent de courir vers le point de chute
    // (mêmes vitesses que pendant le vol), et seul un joueur réellement arrivé
    // au contact peut capter le ballon — jamais de téléportation directe sur
    // la cible. Délai de grâce borné (4 s) pour ne jamais laisser le ballon
    // mort au sol indéfiniment si un dégagement profond atterrit loin de tout
    // le monde : on force alors l'arrivée du joueur le plus proche.
    _tickReceptionCoupDePied(dt) {
      this.timerReceptionAuSol += dt;
      const type = this.typeCoupDePiedJeu;
      const equipeKick = this.equipeCoupDePiedJeu;
      const chasseurs = equipeKick === 'A' ? this.equipeA : this.equipeB;
      const receveurs = equipeKick === 'A' ? this.equipeB : this.equipeA;
      const cibleX = this.ballonVolX, cibleY = this.ballonVolY;

      const versBallon = new Set([
        ...this._groupeVersBallon(chasseurs, cibleX, cibleY, 3),
        ...this._groupeVersBallon(receveurs, cibleX, cibleY, 2),
      ]);
      for (const j of [...chasseurs, ...receveurs]) {
        if (j.horsJeuKick > 0) { this._replierHorsJeuKick(j, dt); continue; }
        if (!versBallon.has(j)) { this._tenirLigneCoupDePied(j, cibleX, dt); continue; }
        // Ballon au sol depuis 4 s (dégagement tombé loin de tout le monde) :
        // ceux qui y vont passent à pleine vitesse.
        const allure = this.timerReceptionAuSol >= 4 ? 1 : 0.85;
        avancer(j, cibleX - j.x, cibleY - j.y, dt, vitesseMs(j) * allure);
      }

      const RAYON_RECEPTION = 1.3;
      // Un chasseur HORS-JEU ne peut pas jouer le ballon (loi 10) : il ne
      // compte pas dans la course a la reception.
      const chasseursOnside = chasseurs.filter((j) => !(j.horsJeuKick > 0));
      const { joueur: chasseurProche, distance: dChasseur } = joueurLePlusProche(chasseursOnside.length ? chasseursOnside : chasseurs, cibleX, cibleY);
      const { joueur: receveurProche, distance: dReceveur } = joueurLePlusProche(receveurs, cibleX, cibleY);
      const chasseurOk = dChasseur <= RAYON_RECEPTION;
      const receveurOk = dReceveur <= RAYON_RECEPTION;
      // Délai de grâce : au-delà de 4 s, c'est le PREMIER ARRIVÉ au ballon qui
      // le ramasse (les joueurs qui y vont accélèrent, cf. plus haut). Avant,
      // le délai donnait le ballon au plus proche là où il se trouvait (2 à
      // 20 m du ballon, ~2 fois par match après un dégagement profond) : saut
      // à l'écran (P2-90). Le plafond de 10 s ne sert que de garde-fou.
      const delaiEcoule = this.timerReceptionAuSol >= 10;
      if (!chasseurOk && !receveurOk && !delaiEcoule) { this._tickRouleBallon(dt); return; }

      this._receptionEnAttente = false;
      this._rouleBallon = null;
      const enBut = this._ballonEnBut;
      this._ballonEnBut = null;
      // Seul un camp réellement arrivé au contact peut capter le ballon : si
      // un seul camp est à portée, il récupère d'office (pas de tirage au
      // sort, pas de téléportation : le joueur est déjà là où il a couru).
      // Si les deux sont à portée (ou qu'aucun ne l'est après le délai de
      // grâce), le tirage au sort habituel départage, et le gagnant ramasse
      // depuis sa position réelle — jamais en se déplaçant sur la cible.
      let chasseurGagne;
      if (chasseurOk && !receveurOk) {
        chasseurGagne = true;
      } else if (receveurOk && !chasseurOk) {
        chasseurGagne = false;
      } else {
        const contestable = type === 'CHANDELLE' || type === 'CHIP';
        const probaChasseurGagne = contestable
          ? Math.max(0.15, Math.min(0.55, 0.4 - (dChasseur - dReceveur) / 20))
          : Math.max(0.03, Math.min(0.2, 0.08 - (dChasseur - dReceveur) / 30));
        chasseurGagne = this.rng() < probaChasseurGagne;
      }
      const joueur = chasseurGagne ? chasseurProche : receveurProche;
      // RÉCEPTION DISPUTÉE (chandelle ou petit coup de pied à suivre, les deux
      // camps sous le ballon) : deux joueurs sautent pour le même ballon, et
      // une part notable finit échappée vers l'avant — en-avant, mêlée pour
      // l'adversaire (loi 11). C'est le risque qui fait de la chandelle un
      // pari, des deux côtés. Risque de base 12 %, modulé par la sûreté de
      // mains du joueur qui capte (attribut « passe », neutre 60), comme
      // l'offload. Cf. TODO_AUDIT.md P2-56.
      const disputee = chasseurOk && receveurOk && (type === 'CHANDELLE' || type === 'CHIP');
      if (disputee) {
        this.log('RECEPTION_DISPUTEE', joueur.team,
          `Chandelle disputee : le n°${joueur.numero} de l'equipe ${joueur.team} s'eleve au milieu de la chasse`);
        const mains = typeof joueur.passe === 'number'
          ? Math.max(0.5, Math.min(1.6, 1 + (60 - joueur.passe) / 90)) : 1;
        if (this.rng() < 0.12 * mains) {
          this.stats[joueur.team].knockOns++;
          this._statJoueur(joueur).enAvants++;
          this.log('MELEE_ENAVANT', joueur.team,
            `En-avant sous la chandelle, equipe ${joueur.team} - melee adverse`);
          this._accorderMelee(joueur.team, { x: joueur.x, y: joueur.y });
          return;
        }
      }
      // Coup de pied REGAGNÉ : l'équipe qui a botté récupère son propre coup de
      // pied (motif discriminant de l'étude).
      if (chasseurGagne) this.stats[equipeKick].kicksRegagnes++;
      // BALLON DANS L'EN-BUT (P2-93) : le premier arrivé l'aplatit.
      if (enBut) {
        if (joueur.team === enBut.defense) {
          // Loi 12 : ballon botté par l'attaque et aplati par la défense dans
          // son en-but -> renvoi aux 22 m par la défense.
          this.log('EN_BUT_APLATI', joueur.team,
            `Le n°${joueur.numero} de l'equipe ${joueur.team} aplatit dans son en-but : renvoi aux 22 m`);
          this._nouvelleManche(equipeKick, enBut.ligne === 0 ? 22 : LONGUEUR - 22);
          return;
        }
        // Loi 8 : un chasseur en position régulière aplatit le premier -> essai.
        this.possession = equipeKick;
        this.porteur = joueur;
        joueur.x = enBut.ligne;
        this.score[equipeKick] += 5;
        this.stats[equipeKick].essais++;
        this._statJoueur(joueur).essais++;
        this.essaiX = enBut.ligne;
        this.essaiY = joueur.y;
        this.essaiEquipe = equipeKick;
        this.log('ESSAI', equipeKick, `Essai equipe ${equipeKick} ! Le n°${joueur.numero} aplatit le coup de pied a suivre`,
          Object.assign(this._infoEssai(joueur), { origine: 'COUP_DE_PIED_A_SUIVRE' }));
        this.phase = 'ESSAI';
        this.timerPhase = 0;
        return;
      }
      this.porteur = joueur;
      this.possession = joueur.team;
      this.ruckPoint = { x: joueur.x, y: joueur.y };

      // Marque (loi 17) : réception propre dans son propre en-deçà des 22 m.
      const sensReceveur = joueur.team === 'A' ? 1 : -1;
      const distPropreLigne = sensReceveur > 0 ? joueur.x : (LONGUEUR - joueur.x);
      if (!chasseurGagne && distPropreLigne <= 22 && this.rng() < 0.35) {
        this._traiterCoupFranc(joueur.team, { x: joueur.x, y: joueur.y });
        return;
      }
      this._porteApresPied = true; // défense lancée, cf. rampe dans _tickPorte
      this.phase = 'PORTE';
      this.timerPhase = 0;
    }

    // Pause de mi-temps (loi 12) : courte pause avant le coup d'envoi de la 2e
    // période, le temps que l'interface affiche l'événement MI_TEMPS avant
    // qu'il ne soit remplacé par le COUP_ENVOI suivant.
    // Départage d'un match à élimination directe resté nul après la
    // prolongation : d'abord le nombre d'essais, puis une séance de tirs au but
    // — cinq tireurs par équipe (les meilleurs buteurs présents), face aux
    // poteaux à 22 m, puis mort subite. Les tirs ne comptent pas au score du
    // match, comme dans une vraie coupe.
    _departager() {
      const eA = this.stats.A.essais, eB = this.stats.B.essais;
      if (eA !== eB) {
        this.departage = { type: 'essais', vainqueur: eA > eB ? 'A' : 'B', essais: { A: eA, B: eB } };
        this.log('DEPARTAGE', this.departage.vainqueur,
          `Toujours a egalite : l'equipe ${this.departage.vainqueur} l'emporte au nombre d'essais (${Math.max(eA, eB)} a ${Math.min(eA, eB)})`);
        return;
      }
      const tireurs = (eq) => eq.filter(j => j.sinBin <= 0)
        .sort((a, b) => (b.adresse || 0) - (a.adresse || 0)).slice(0, 5);
      const tA = tireurs(this.equipeA), tB = tireurs(this.equipeB);
      const tir = (j) => this.rng() < probaReussiteTir(22, 0, j && j.adresse);
      const tirs = { A: 0, B: 0 };
      for (let i = 0; i < 5; i++) { if (tir(tA[i % tA.length])) tirs.A++; if (tir(tB[i % tB.length])) tirs.B++; }
      for (let i = 5; tirs.A === tirs.B && i < 60; i++) {
        if (tir(tA[i % tA.length])) tirs.A++;
        if (tir(tB[i % tB.length])) tirs.B++;
      }
      // Garde-fou : après 55 tours de mort subite à égalité (jamais observé),
      // l'équipe A tire en dernier et rate.
      if (tirs.A === tirs.B) tirs.B++;
      const vainqueur = tirs.A > tirs.B ? 'A' : 'B';
      this.departage = { type: 'tirs', vainqueur, essais: { A: eA, B: eB }, tirs };
      this.log('DEPARTAGE', vainqueur,
        `Toujours a egalite, meme nombre d'essais : l'equipe ${vainqueur} gagne la seance de tirs au but (${tirs[vainqueur]} a ${tirs[vainqueur === 'A' ? 'B' : 'A']})`);
    }

    _tickMiTemps(dt) {
      this.timerPhase += dt;
      if (this.timerPhase >= 1) {
        this._nouvelleManche(this.equipeKickPremiereMiTemps);
      }
    }

    // Profil de durées de ruck en vigueur pour une équipe
    // (cfg.ruck.profil = liste de paliers [part, minimum, étendue]). Calibré par
    // balayage de simulations sur les vitesses de ruck réelles ET les volumes
    // réels de rucks/passes/plaquages (France-Irlande 2026, cf.
    // docs/ANALYSE_MATCH_REEL.md).
    _profilRuck(team) {
      const cfgR = team ? this.cfgRuck[team] : this.cfg.ruck;
      return (cfgR && cfgR.profil)
        || [[0.70, 0.7, 0.9], [0.22, 1.6, 1.2], [0.08, 2.8, 1.7]];
    }

    // Plancher de sortie : le début du palier le plus rapide du profil. Rien ne
    // doit sortir plus vite que le ballon rapide décrit par le profil lui-même
    // (sinon le service du 9 recompte une vitesse déjà comptée, cf.
    // dureeSortieRuck).
    _plancherSortieRuck(team) {
      const profil = this._profilRuck(team);
      return (profil[0] && profil[0][1] ? profil[0][1] : 0) * this._echelleArret;
    }

    // Tire une durée de recyclage dans le profil : la part est la fraction des
    // rucks concernée, la durée = minimum + alea*étendue, le tout à l'échelle
    // des arrêts de jeu (_echelleArret).
    _tirerDureeRuck(team) {
      const profil = this._profilRuck(team);
      const r = this.rng();
      let cumul = 0;
      for (const [part, minimum, etendue] of profil) {
        cumul += part;
        if (r < cumul) return (minimum + this.rng() * etendue) * this._echelleArret;
      }
      const dernier = profil[profil.length - 1];
      return (dernier[1] + this.rng() * dernier[2]) * this._echelleArret;
    }

    // Tirage d'une faute au regroupement (loi 15, cf. appel dans _tickRuck).
    // Renvoie null si le ruck est propre. Les taux de base sont calibrés pour
    // amener le total de pénalités du match dans la fourchette réelle
    // (16-28, cf. CLAUDE.md Rôle 6) ; le partage défense/attaque suit celui
    // d'un vrai match, où la majorité des pénalités de regroupement sanctionne
    // le camp qui conteste.
    _tirerFauteRuck(equipeAtt, equipeDef) {
      const MOTIFS_DEFENSE = [
        'Mains dans le ruck',
        'Le plaqueur ne se retire pas',
        'Entree sur le cote au regroupement',
      ];
      const MOTIFS_ATTAQUE = [
        'Ballon non libere par le joueur plaque',
        'Regroupement scelle : soutien couche sur le ballon',
      ];
      // Taux PAR REGROUPEMENT : releves une seconde fois (0,030/0,016 ->
      // 0,038/0,020) quand le nombre de regroupements par match a baisse vers
      // le reel, pour garder le total de penalites du match dans sa fourchette
      // (16-28, cf. CLAUDE.md Role 6).
      const pDefense = 0.046 * facteurDiscipline(equipeDef);
      const pAttaque = 0.024 * facteurDiscipline(equipeAtt);
      const r = this.rng();
      if (r < pDefense) {
        return { camp: 'DEFENSE', motif: MOTIFS_DEFENSE[Math.floor(this.rng() * MOTIFS_DEFENSE.length)] };
      }
      if (r < pDefense + pAttaque) {
        return { camp: 'ATTAQUE', motif: MOTIFS_ATTAQUE[Math.floor(this.rng() * MOTIFS_ATTAQUE.length)] };
      }
      return null;
    }

    _tickRuck(dt) {
      // Le porteur est tenu et amene au sol : l'horloge du RECYCLAGE n'a pas
      // encore demarre (cf. DUREE_PLAQUAGE). Les soutiens arrivent et la
      // defense se replie pendant ce temps — c'est le tick normal ci-dessous,
      // seule l'horloge attend.
      if (this.ruckPlaquage > 0) this.ruckPlaquage -= dt;
      else this.timerPhase += dt;
      const pt = this.ruckPoint;
      const sensAttaque = this.porteur.sensAttaque;
      // Loi 14/15 : le joueur PLAQUÉ (porteur actuel) est au sol et NE PEUT PAS
      // se relever ni rejouer tant que le ruck n'est pas résolu. On maintient
      // son état « au sol » pendant toute la durée du regroupement (sinon il se
      // relevait après 1,5 s alors que le ruck dure plus longtemps) : il faut
      // qu'un partenaire vienne sécuriser puis sortir le ballon avant qu'il ne
      // reparte. Il se relèvera (auSol redescend) une fois le ballon sorti.
      if (this.porteur && this.porteur.auSol >= 0) {
        // Se relever quand on est à terre prend du temps : on maintient l'état
        // « au sol » à au moins 2 s pendant tout le ruck. Ainsi le plaqué reste
        // au sol pendant le regroupement PUIS met encore ~2 s à se relever et
        // rejoindre le jeu une fois le ballon sorti — il ne « rebondit » jamais
        // sur ses pieds instantanément.
        this.porteur.auSol = Math.max(this.porteur.auSol, 2.0);
        // Le plaqué reste figé à l'endroit où il est tombé pendant tout le ruck
        // (et le temps de se relever ensuite) : sa position est verrouillée par
        // le gel global des joueurs au sol dans tick(). On s'assure juste que sa
        // position de chute est mémorisée (cas d'un ruck formé par une autre
        // voie que le plaquage standard).
        if (this.porteur._solX == null) { this.porteur._solX = this.porteur.x; this.porteur._solY = this.porteur.y; }
      }
      // Marge de repli et délai de grâce : au moment du plaquage, des défenseurs
      // non-contestants se trouvent souvent déjà tout près du point de ruck (ils
      // suivaient le porteur en jeu ouvert). La loi sanctionne le hors-jeu, mais un
      // défenseur a le temps de courir se replier derrière la ligne avant d'être
      // sifflé ; sans ce délai, quasi tout plaquage dégénérait en pénalité.
      // Recul réel observé en match (au-delà du strict minimum légal de la ligne
      // de hors-jeu) : laisse un peu d'air à l'attaque avant le prochain contact.
      // Valeur modérée : combinée à la récupération post-regroupement (cf.
      // _imposerRecuperationRuck), un recul trop large ouvrirait des brèches
      // systématiques côté ligne d'en-but.
      const margeRecul = this.cfgDefense[this.porteur.team === 'A' ? 'B' : 'A'].reculRuck;
      const delaiGrace = 1.5 * this._echelleArret;

      // Joueurs qui convergent vers le point de ruck (le(s) contestant(s)
      // défensif(s) et les soutiens d'attaque) : chacun garde une position
      // décalée en rosette autour du point plutôt que de viser la même
      // coordonnée — deux joueurs ne peuvent pas occuper la même place.
      const placerEnRosette = (j, recul, i) => {
        const cx = pt.x - sensAttaque * recul * (0.5 + (i % 2) * 0.5);
        const cy = pt.y + ((i % 2) ? -1 : 1) * Math.ceil((i + 1) / 2) * 0.7;
        // Les soutiens d'attaque SE PRÉCIPITENT au ruck (pleine vitesse : chaque
        // dixième de seconde compte pour ne pas perdre le ballon) ; le contestant
        // défensif arrive en opposition, plus posé (0,7×).
        const vRuck = recul < 0 ? vitesseMs(j) : vitesseMs(j) * 0.7;
        avancer(j, cx - j.x, cy - j.y, dt, vRuck);
      };
      // Seuls les attaquants LES PLUS PROCHES du ruck s'y engagent (ceux qui se
      // précipitent pour ne pas perdre le ballon) ; le reste de l'équipe NE se
      // jette PAS dedans, il se REPLACE en ligne d'attaque pour le temps suivant
      // (pods d'avants, éventail de trois-quarts — cf. plus bas). NB : réduire à
      // 2 a été testé (même avec un contest repondéré « corps sur le ballon ») et
      // RETIRÉ : le 3e homme sert aussi de relais de sortie et de présence de
      // sécurisation — sans lui, turnovers +20 % et score effondré (29 -> 20).
      // Un vrai ruck compte d'ailleurs ~5-6 corps avec le plaqué et le plaqueur.
      const soutiensRuck = new Set(
        [...this.equipeA, ...this.equipeB]
          .filter(j => j.team === this.possession && j !== this.porteur && j.auSol === 0 && j.numero !== 9)
          .sort((a, b) => distance(a, pt) - distance(b, pt))
          .slice(0, 3)
      );
      // Avants disponibles pour les PODS de relais (cf. placement plus bas) :
      // ordre stable pendant tout le ruck pour que chacun garde son pod d'un
      // tick à l'autre, mais RETIRÉ À CHAQUE RUCK (P2-69). Trié par numéro, le
      // n°1 tenait toujours la place la plus proche côté ouvert et c'était lui
      // que le 9 servait : 31 % des percussions des avants pour lui seul, 7 %
      // pour le n°8 (cf. test R9). Tirage pondéré par la puissance (clé
      // u^(1/w)) : les gros porteurs se placent un peu plus souvent en tête.
      if (this._ordrePodRuck !== this.ruckPoint) {
        this._ordrePodRuck = this.ruckPoint;
        this._ordrePod = new Map();
        for (const j of this.possession === 'A' ? this.equipeA : this.equipeB) {
          if (j.numero <= 8) this._ordrePod.set(j, Math.pow(this.rng(), 1 / Math.max(1, j.puissance || 60)));
        }
      }
      const clePod = (j) => (this._ordrePod && this._ordrePod.has(j) ? this._ordrePod.get(j) : 0);
      this._podAvants = [...this.equipeA, ...this.equipeB]
        .filter(j => j.team === this.possession && j !== this.porteur && j.auSol === 0
          && j.sinBin <= 0 && j.numero <= 8 && j.numero !== 9 && !soutiensRuck.has(j))
        .sort((a, b) => clePod(b) - clePod(a) || a.numero - b.numero);
      // CRÉNEAUX DÉFENSIFS ÉQUIRÉPARTIS : les défenseurs de la ligne (ni
      // contestants, ni l'arrière n°15 qui couvre le fond) se répartissent
      // UNIFORMÉMENT sur la largeur, triés par position pour ne jamais se
      // croiser. Avant, chacun tenait son couloir nominal fixe : la ligne
      // couvrait bien 47 m MAIS avec des trous latéraux moyens de ~16 m (un
      // boulevard) selon l'endroit du ruck. Espacement désormais régulier
      // (~5 m), comme une vraie ligne qui se compte et comble les espaces.
      const defsLigne = [...this.equipeA, ...this.equipeB]
        .filter(j => j.team !== this.possession && j.auSol === 0 && j.sinBin <= 0
          && j.numero !== 15 && j.numero !== 9 && !this.contestants.includes(j.numero))
        .sort((a, b) => a.y - b.y);
      this._slotDefense = new Map();
      if (defsLigne.length > 0) {
        // Créneaux CENTRÉS SUR LE RUCK, à la manière d'une vraie ligne qui se
        // compte : deux « gardes » collés au regroupement (±2,5 m), puis un
        // défenseur tous les ~5 m en s'écartant. La défense est dense là où le
        // danger est immédiat, plus étirée vers le grand large ; l'extrême bord
        // opposé reste plus doux (comme en vrai, c'est le repli/l'aile qui y
        // glisse). NB : une équirépartition mur-à-mur sur TOUTE la largeur a été
        // testée : zéro trou mais plus aucun espace nulle part — score effondré
        // (30 -> 20, des matchs à 0) ; retirée. NB2 : élargir l'écart guard/1er
        // créneau (2,5->4,5 m) a aussi été testé pour désaligner la couverture
        // du point de réception du 10 — mesuré INEFFICACE (54,1 % -> 58,4 % de
        // séquences 9->10 sous 5 m de large, aggravé) ; retiré. La cause n'est
        // pas l'alignement des créneaux (cf. mesure directe distance 10<->
        // défenseur à la réception, plus bas dans l'historique des commits).
        const cibles = [];
        for (let i = 0; i < defsLigne.length; i++) {
          const k = Math.ceil((i + 1) / 2);
          const cote = (i % 2 === 0) ? 1 : -1;
          cibles.push(Math.max(2.5, Math.min(LARGEUR - 2.5, pt.y + cote * (2.5 + (k - 1) * 5))));
        }
        cibles.sort((a, b) => a - b);
        // Espacement minimal après bornage aux touches (les créneaux repoussés
        // par le bord se tassaient au même endroit) : balayage avant/arrière.
        for (let i = 1; i < cibles.length; i++) cibles[i] = Math.max(cibles[i], cibles[i - 1] + 2.5);
        for (let i = cibles.length - 2; i >= 0; i--) cibles[i] = Math.min(cibles[i], cibles[i + 1] - 2.5);
        // RÉPARTITION PAR POSTE (rôles réels, pas un simple tri par position) :
        // 1. les AILIERS tiennent les EXTRÉMITÉS de leur propre côté (jamais un
        //    10 planté au bord de touche à l'extérieur de son ailier — vu à
        //    l'écran avant ce correctif) ;
        // 2. les AVANTS prennent les créneaux PROCHES du ruck (gardes — et ils
        //    restent près d'une éventuelle mêlée à venir : invariant « une
        //    mêlée se termine ») ;
        // 3. les autres BACKS (10/12/13) remplissent les créneaux restants.
        // Le 9 défensif n'est PAS dans la ligne : il balaie derrière (cf. plus
        // bas), comme l'arrière.
        const dispo = [...cibles];
        const prendreSlot = (j, idx) => { this._slotDefense.set(j, dispo[idx]); dispo.splice(idx, 1); };
        for (const j of defsLigne.filter(x => x.numero === 11 || x.numero === 14)) {
          if (!dispo.length) break;
          prendreSlot(j, j.channelY < LARGEUR / 2 ? 0 : dispo.length - 1);
        }
        const avantsDef = defsLigne.filter(j => j.numero <= 8 && !this._slotDefense.has(j)).sort((a, b) => a.y - b.y);
        const idxProches = dispo.map((c, i) => ({ i, d: Math.abs(c - pt.y) }))
          .sort((a, b) => a.d - b.d).slice(0, avantsDef.length).map(o => o.i);
        const slotsAvants = idxProches.map(i => dispo[i]).sort((a, b) => a - b);
        avantsDef.forEach((j, k) => this._slotDefense.set(j, slotsAvants[k]));
        for (const v of slotsAvants) { const i = dispo.indexOf(v); if (i >= 0) dispo.splice(i, 1); }
        const restes = defsLigne.filter(j => !this._slotDefense.has(j)).sort((a, b) => a.y - b.y);
        restes.forEach((j, k) => { if (k < dispo.length) this._slotDefense.set(j, dispo[k]); });
      }
      let iContestants = 0, iSoutien = 0;
      for (const j of [...this.equipeA, ...this.equipeB]) {
        if (j === this.porteur) continue;
        const estContestant = this.contestants.includes(j.numero) && j.team !== this.possession;
        const estSoutienAttaque = soutiensRuck.has(j);
        // Le demi de mêlée court vers la base du ruck quelle que soit sa
        // distance de départ (il suit toujours le jeu en match réel) : c'est
        // lui qui jouera le ballon à la sortie (cf. plus bas), donc il ne
        // doit jamais y être téléporté à la résolution — il doit l'avoir
        // réellement rejoint en courant pendant la phase.
        const estDemiMelee = j.team === this.possession && j.numero === 9 && j.auSol === 0;

        if (estContestant) { placerEnRosette(j, 1, iContestants++); continue; }
        if (estSoutienAttaque) { placerEnRosette(j, -1, iSoutien++); continue; }
        if (estDemiMelee) {
          const cx = pt.x - sensAttaque * 1;
          avancer(j, cx - j.x, pt.y - j.y, dt, vitesseMs(j));
          continue;
        }
        // Le 9 DÉFENSIF ne se met pas dans la ligne : il BALAIE derrière elle,
        // près du ruck (~6 m côté défense), prêt à couvrir un ballon poussé, un
        // petit côté ou un coup de pied rasant — son rôle réel. Avant, il
        // héritait d'un créneau de ligne parfois au bord de touche.
        if (j.team !== this.possession && j.numero === 9 && j.auSol === 0) {
          const cx = pt.x + sensAttaque * 6;
          avancer(j, cx - j.x, pt.y - j.y, dt, vitesseMs(j) * 0.85);
          continue;
        }

        if (j.team !== this.possession && Referee.horsJeuRuck(j, pt, sensAttaque)) {
          // Se replier vers la zone ONSIDE (au-delà du point de ruck, côté de
          // son propre en-but), vers son CRÉNEAU équiréparti de la ligne (pas
          // son couloir nominal — cf. _slotDefense) : la ligne se reforme sans
          // trous en même temps qu'elle se replie.
          const cibleX = sensAttaque > 0 ? pt.x + margeRecul : pt.x - margeRecul;
          const slotY = this._slotDefense.get(j) ?? j.channelY;
          avancer(j, cibleX - j.x, slotY - j.y, dt, vitesseMs(j));
          // L'arbitre ne siffle que le hors-jeu qui PÈSE sur le jeu, et une
          // seule fois par ruck : à la fin du délai de grâce, un défenseur
          // DEBOUT encore devant la ligne dans la zone du ruck (10 m de part et
          // d'autre) est jugé — sifflé selon sa DISCIPLINE (celui qui traîne ou
          // part trop tôt), toléré sinon (il se replie, il ne gêne pas). Avant,
          // le premier défenseur encore en repli suffisait — plaqueur au sol,
          // ailier à 30 m — et l'avantage était annoncé ~52 fois par match,
          // sans motif ni fautif (cf. test R12).
          // Un fautif d'une pénalité jouée vite, déjà en train de se replier
          // (hors-jeu des 10 m, P2-123), n'est pas jugé une seconde fois.
          if (this.timerPhase > delaiGrace && this._horsJeuRuckJuge !== pt && j.auSol === 0 && !(j.horsJeuKick > 0)
            && Math.abs(j.y - pt.y) <= 10 && Referee.horsJeuRuck(j, pt, sensAttaque)) {
            this._horsJeuRuckJuge = pt;
            const discipline = typeof j.discipline === 'number' ? j.discipline : 55;
            // Base 0,24 (0,30 avant P2-95) : avec ~200 rucks par match depuis
            // les touches à 30 s (P2-94), 0,30 donnait 22 avantages pour
            // hors-jeu au ruck par match, et le fil en était de nouveau saturé.
            const pSiffle = Math.max(0.1, Math.min(0.6, 0.24 * (1 + (60 - discipline) / 40)));
            if (this.rng() >= pSiffle) continue;
            // Hors-jeu défensif au ruck : avantage (loi 7). L'équipe en possession
            // joue ; la pénalité n'est sifflée que si elle n'en tire rien (cf.
            // _tickAvantage). On ne stoppe donc PAS le ruck — il se résout
            // normalement et l'avantage est suivi à partir de là.
            const fautive = this.possession === 'A' ? 'B' : 'A';
            this._jouerAvantage('PENALITE', fautive, this.possession, { x: this.porteur.x, y: this.porteur.y },
              `Hors-jeu au ruck du n°${j.numero} (equipe ${fautive})`);
          }
          continue;
        }

        // Tous les autres (attaquants non engagés et défenseurs déjà onside) ne
        // courent pas après le ballon : ils tiennent leur couloir et occupent la
        // largeur, prêts pour la phase suivante. L'attaque se replace en retrait
        // du ruck (ligne onside prête à relancer), la défense monte en ligne à
        // plat de son côté.
        if (j.team === this.possession) {
          // La LIGNE DE TROIS-QUARTS (10-14) se met en place PENDANT le ruck : à
          // PLAT (~4-6 m derrière la base, onside) et ÉTAGÉE sur le CÔTÉ OUVERT,
          // prête à lancer le jeu au large DÈS la sortie du 9. Avant, tous les
          // attaquants étaient massés ~8 m derrière le ruck : le 9 devait alors
          // passer 7-11 m EN ARRIÈRE au 10 (mesuré), le ballon reculait à chaque
          // passe et l'attaque ne « lançait » jamais le jeu sur le côté. Les backs
          // se placent donc en éventail à droite/gauche du 9, pas dans son dos.
          const estBack = j.numero >= 10 && j.numero <= 14;
          if (estBack) {
            // Placement EN PROFONDEUR pendant le ruck (~8-12 m derrière la base,
            // éventail LARGE de ~7 à ~31 m sur le côté ouvert) : la ligne n'est
            // PAS à plat à l'arrêt — elle prend du recul pour pouvoir S'ÉLANCER
            // à la sortie et recevoir LANCÉE (cf. _tickPorte : cibles à plat,
            // pleine vitesse). Mesuré avant : receveurs à 0,5 m/s vers l'avant
            // (à l'arrêt → plaqués sur place, « départ au ras ») et attaque
            // resserrée sur 31 m de large. La profondeur donne la piste d'élan,
            // l'éventail donne la largeur.
            const coteOuvert = pt.y <= LARGEUR / 2 ? 1 : -1;
            // L'ailier CÔTÉ FERMÉ ne rejoint PAS l'éventail : il tient son aile
            // (option côté court, couverture). Avant, les DEUX ailiers filaient
            // au même point du côté ouvert et le côté fermé était abandonné —
            // c'est ce qui resserrait l'attaque sur ~32 m de large au lieu
            // d'occuper tout le terrain.
            const estAilier = j.numero === 11 || j.numero === 14;
            const sonCote = Math.sign(j.channelY - LARGEUR / 2) || 1;
            if (estAilier && sonCote !== coteOuvert) {
              const cibleXf = pt.x - sensAttaque * 8;
              avancer(j, cibleXf - j.x, j.channelY - j.y, dt, vitesseMs(j) * 0.85);
              continue;
            }
            const ordreBack = { 10: 1, 12: 2, 13: 3, 11: 4, 14: 4 };
            const rangB = ordreBack[j.numero] || 2;
            const cibleY = Math.max(4, Math.min(LARGEUR - 4, pt.y + coteOuvert * (7 + (rangB - 1) * 8)));
            // DIAGONALE D'ATTAQUE : chaque homme se place PLUS PROFOND que celui
            // à son intérieur (10 à ~5,7 m, 12 à ~7,4 m, 13 à ~9,1 m, aile à
            // ~10,8 m) — c'est la profondeur qui permet de CONSTRUIRE : chaque
            // receveur arrive lancé sur une passe courte pendant que le suivant
            // garde encore du champ. Une ligne trop plate (testée) ne laisse
            // aucune profondeur pour attaquer ; trop profonde (8-12 m uniformes,
            // testé aussi), toutes les passes partent 5 m en arrière.
            const cibleX = pt.x - sensAttaque * (4 + rangB * 1.7);
            // PLEINE VITESSE : la ligne se replace en COURANT pendant le ruck —
            // c'est ce qui permet au 9 de jouer éclair (cf. porte dixPret) sans
            // lancer vers une ligne pas prête. À 85 %, le 10 arrivait souvent
            // après la durée cible du ruck et retardait toutes les sorties.
            avancer(j, cibleX - j.x, cibleY - j.y, dt, vitesseMs(j));
          } else if (j.numero <= 8) {
            // PODS D'AVANTS (animation offensive) : les avants non engagés ne
            // flottent plus chacun dans son couloir — ils se GROUPENT en deux
            // cellules de relais (2-3 joueurs serrés) À PLAT (~3 m derrière la
            // base), une de CHAQUE CÔTÉ du ruck (~4,5-8 m), comme les pods du
            // rugby moderne (structure 1-3-3-1). Ce sont les options de
            // percussion du 9 (avant lancé dans l'axe) et le premier rideau de
            // conservation du temps suivant. Visuellement : deux blocs compacts
            // qui encadrent chaque ruck au lieu d'une masse diffuse.
            const coteOuvert = pt.y <= LARGEUR / 2 ? 1 : -1;
            const iPod = this._podAvants ? this._podAvants.indexOf(j) : -1;
            const cote = (iPod % 2 === 0) ? coteOuvert : -coteOuvert;
            const rangPod = Math.max(0, Math.floor(iPod / 2));
            const cibleY = Math.max(3, Math.min(LARGEUR - 3, pt.y + cote * (4.5 + rangPod * 1.8)));
            const cibleX = pt.x - sensAttaque * 3.2;
            avancer(j, cibleX - j.x, cibleY - j.y, dt, vitesseMs(j) * 0.85);
          } else {
            // Arrière (15) : en couverture profonde dans son couloir.
            const cibleX = pt.x - sensAttaque * (6 + Math.abs(j.channelY - pt.y) * 0.12);
            avancer(j, cibleX - j.x, j.channelY - j.y, dt, vitesseMs(j) * 0.7);
          }
        } else {
          // Défenseur déjà onside : il rejoint son CRÉNEAU équiréparti sur la
          // ligne de défense (cf. _slotDefense) — espacement régulier ~5 m,
          // plus de trous de 15 m laissés par les couloirs nominaux.
          // L'ARRIÈRE (n°15), exclu des créneaux, COUVRE LE FOND : même
          // profondeur qu'en jeu courant (cf. _tickPorte, profondeurArriereJeu),
          // dans son couloir tiré vers le ballon. Avant, il visait la ligne de
          // défense comme les autres : 97 % du temps de ruck dans le premier
          // rideau, à 3 m du ruck (cf. test R11), et la défense n'avait aucun
          // dernier rideau derrière elle.
          if (j.numero === 15) {
            const profondeur = this.cfgDefense[j.team].profondeurArriereJeu;
            // Près de sa propre ligne, il ne recule pas au-delà de l'en-but.
            const cibleXq = Math.max(0.5, Math.min(LONGUEUR - 0.5, pt.x + sensAttaque * profondeur));
            const cibleYq = j.channelY * 0.7 + pt.y * 0.3;
            avancer(j, cibleXq - j.x, cibleYq - j.y, dt, vitesseMs(j) * 0.8);
            continue;
          }
          const cibleX = sensAttaque > 0 ? pt.x + margeRecul : pt.x - margeRecul;
          const slotY = this._slotDefense.get(j) ?? j.channelY;
          avancer(j, cibleX - j.x, slotY - j.y, dt, vitesseMs(j) * 0.8);
        }
      }
      const dureeCible = this.ruckDureeCible || 1.8 * this._echelleArret;
      // Le ballon ne SORT du ruck que lorsqu'un partenaire est venu le sécuriser
      // (au moins un coéquipier debout, hors le plaqué, est arrivé sur le ballon
      // au sol) : c'est lui qui va chercher le ballon puis le redonne (cf. la
      // sortie ci-dessous, par le n°9). Tant que personne n'est arrivé, le
      // ballon reste au sol et on attend (le porteur isolé voit son risque de
      // turnover/pénalité grandir), avec un plafond pour ne jamais bloquer.
      const eqAtt = this.possession === 'A' ? this.equipeA : this.equipeB;
      const soutienArrive = eqAtt.some(j => j !== this.porteur && j.auSol === 0
        && j.sinBin <= 0 && distance(j, pt) < 2.5);
      // Temps sans aucun soutien d'attaque RÉELLEMENT ARRIVÉ au ruck (porteur
      // isolé au sol) : accru ce tick tant que personne n'a encore sécurisé le
      // ballon, jamais réinitialisé tant que le ruck dure — c'est ce cumul qui
      // pèse sur le risque de turnover/pénalité. Utilise `soutienArrive` (test
      // de distance réelle au point de ruck), pas `iSoutien` (qui ne comptait
      // que les 3 coéquipiers les plus proches DÉSIGNÉS comme soutien dès le
      // premier tick, même à 10-15 m en train de courir) : avec `iSoutien`, ce
      // compteur ne dépassait jamais 0 dans toute une saison de matchs simulés
      // (mesuré) — le risque « porteur isolé » n'existait donc jamais en
      // pratique, malgré le mécanisme écrit pour l'appliquer.
      if (!soutienArrive) this.ruckTempsSansSoutien = (this.ruckTempsSansSoutien || 0) + dt;
      // Le ballon ne SORT proprement que lorsque le n°9 est ARRIVÉ à la base
      // (son rôle : rejoindre vite le ruck pour jouer le ballon). Avec le ballon
      // rapide, le ruck peut être « mûr » avant que le 9 n'ait fini de courir ;
      // on lui laisse alors un court délai (≤ ~2 s au-delà de la durée cible)
      // pour arriver, plutôt que de sortir le ballon vers un 9 encore à 8-10 m
      // (ce qui faisait « filer » le ballon loin de la base au lieu d'une vraie
      // sortie de demi de mêlée). Passé ce délai, on sort quand même (un avant
      // relaie), pour ne jamais bloquer le jeu.
      const neuf9 = eqAtt.find(j => j.numero === 9 && j.auSol === 0 && j.sinBin <= 0);
      const neufPret = !neuf9 || distance(neuf9, pt) < 4;
      // NB : une porte « attendre que le 10 soit replacé » a été testée ici puis
      // RETIRÉE : elle rallongeait la sortie médiane de 1,5 à 2,1 s (l'inverse du
      // but — sorties de ruck jugées lentes) pour un gain de score dans le bruit
      // statistique. La ligne se replace à pleine vitesse pendant le ruck à la
      // place (cf. placement des backs).
      // SERVICE RAPIDE MÉRITÉ : la durée tirée (profil réel) n'est pas un
      // couperet aveugle — si le 9 est DÉJÀ à la base, le ballon sécurisé par
      // un soutien et le contact non dominé, le 9 joue dès ~55 % de la durée
      // (plancher 1,6 s) : il distribue AVANT le redéploiement adverse, ce qui
      // déclenche en plus la fenêtre « défense pas replacée » (_defenseTardive).
      // Un ruck contesté/dominé ou un 9 en retard garde sa durée pleine —
      // exactement la dynamique réelle du ballon rapide.
      const serviceRapide = soutienArrive && !this.ruckDominant
        && neuf9 && distance(neuf9, pt) < 3;
      // Le gain du service rapide est BORNÉ et plafonné par le plancher du
      // profil : un ballon déjà rapide sort encore plus tôt (et déclenche
      // _defenseTardive), un ballon disputé reste un ballon lent. Cf.
      // dureeSortieRuck pour la mesure qui a imposé cette règle.
      const dureeEffective = dureeSortieRuck({
        dureeCible,
        serviceRapide,
        plancher: this._plancherSortieRuck(this.possession),
        echelle: this._echelleArret,
      });
      if (this.timerPhase >= dureeEffective) {
        if (!soutienArrive && this.timerPhase < dureeEffective + 4 * this._echelleArret) return;
        if (!neufPret && this.timerPhase < dureeEffective + 1.2 * this._echelleArret) return;
        // Contest au ruck pondéré par les avants réellement engagés autour du
        // point de ruck (même proxy de force que le maul, forceMaul), plutôt
        // qu'un taux de turnover fixe : un paquet adverse plus nombreux ou
        // plus puissant fait gratter le ballon plus souvent, sans jamais
        // rendre l'issue certaine (bruit aléatoire conservé).
        const equipeOriginale = this.possession;
        const equipeAtt = equipeOriginale === 'A' ? this.equipeA : this.equipeB;
        const equipeDef = equipeOriginale === 'A' ? this.equipeB : this.equipeA;
        // LOI 15 — LE REGROUPEMENT EST ARBITRÉ. C'est, dans un vrai match, la
        // première source de pénalités ; le moteur n'en produisait aucune de ce
        // type (7,5 pénalités par match au total, contre 16-28 en vrai) : au
        // contact, la discipline ne coûtait rien et l'arbitre était invisible.
        // Deux familles, comme sur un terrain :
        //  - CÔTÉ DÉFENSE (la plus fréquente) : mains dans le ruck (15.12),
        //    joueur qui ne se retire pas du sol après le plaquage (14.5),
        //    entrée sur le côté (15.9) ;
        //  - CÔTÉ ATTAQUE : le plaqué qui ne libère pas (14.3), le soutien qui
        //    s'écroule sur le ballon pour le sceller (15.16).
        // Fréquence modulée par l'attribut `discipline` des avants engagés
        // (facteurDiscipline) : une équipe indisciplinée est bel et bien punie
        // plus souvent, une équipe propre bien moins — le réglage tactique et
        // le recrutement se voient donc au tableau d'affichage.
        const fauteRuck = this._tirerFauteRuck(equipeAtt, equipeDef);
        if (fauteRuck) {
          const equipeFautive = fauteRuck.camp === 'DEFENSE'
            ? (equipeOriginale === 'A' ? 'B' : 'A') : equipeOriginale;
          const beneficiaire = equipeFautive === 'A' ? 'B' : 'A';
          this.log('PENALITE_RUCK', beneficiaire, `${fauteRuck.motif} (equipe ${equipeFautive}), penalite pour l'equipe ${beneficiaire}`);
          this._traiterPenalite(beneficiaire, pt);
          return;
        }
        // Les corps SUR le ballon (< 3 m : les 1-2 nettoyeurs/contestants
        // réellement engagés) pèsent bien plus (×1,6) que les avants À PROXIMITÉ
        // (3-8 m : pods, arrivées) : c'est ce qui permet de ne commettre que 2
        // soutiens au ruck (réalisme, cf. soutiensRuck) sans perdre le ballon
        // plus qu'avant — un ruck bien nettoyé à 2 se gagne, comme en vrai.
        let forceAtt = 0, forceDef = 0;
        for (const j of equipeAtt) if (j.numero <= 8 && j.auSol === 0) {
          const dj = distance(j, pt);
          if (dj < 3) forceAtt += forceMaul(j) * 1.6;
          else if (dj < 8) forceAtt += forceMaul(j);
        }
        for (const j of equipeDef) if (j.numero <= 8 && j.auSol === 0) {
          const dj = distance(j, pt);
          if (dj < 3) forceDef += forceMaul(j) * 1.6;
          else if (dj < 8) forceDef += forceMaul(j);
        }

        // Ruck très disputé des deux côtés et quasiment à l'équilibre : le
        // ballon ne sort franchement pour personne, l'arbitre rend une mêlée
        // plutôt que de trancher arbitrairement un gagnant.
        const ecartForces = Math.abs(forceDef - forceAtt);
        const engagementTotal = forceAtt + forceDef;
        // Ballon injouable au ruck → mêlée : rare en match réel. À 0.10 cette
        // voie produisait ~9 mêlées/match ; abaissée pour rester dans le repère
        // global de 8-25 mêlées TOTALES (cf. CLAUDE.md Rôle 6).
        if (engagementTotal > 80 && ecartForces < 35 && this.rng() < 0.04) {
          this.log('MELEE_RUCK_INJOUABLE', equipeOriginale, `Ballon injouable au ruck, melee pour l'equipe ${equipeOriginale}`);
          this._accorderMeleeA(equipeOriginale, pt);
          return;
        }

        // Porteur isolé (pas de soutien arrivé à temps) : risque accru de
        // turnover ou, si le porteur s'accroche au ballon sans soutien,
        // pénalité directe pour "ballon non rendu" plutôt qu'un turnover propre.
        // Rééquilibré après la correction de `ruckTempsSansSoutien` (calculé
        // avant sur un signal toujours nul, cf. plus haut) : ce bonus est
        // maintenant RÉELLEMENT actif, et gonflait les turnovers (~12,5 -> ~20)
        // si on gardait le multiplicateur/plafond historiques (0,08 / 0,12) —
        // plafond abaissé à 0,03 (balayage mesuré) pour rester dans le repère
        // CLAUDE.md (12-18 turnovers/match) tout en laissant l'isolement peser.
        const bonusIsolement = Math.min(0.03, (this.ruckTempsSansSoutien || 0) * 0.02);
        // Taux de grattage au ruck : en match réel l'équipe qui attaque conserve
        // ~95 % de ses rucks (turnover ~3-5 %). L'ancienne base de 0.12 donnait
        // ~24 % de turnovers, soit ~122 ballons grattés/match (réel ~20) et un
        // jeu en va-et-vient permanent irréaliste. Base abaissée à 0.012 (plancher
        // du Math.max ci-dessous) ; le différentiel de force du pack et surtout
        // l'isolement du porteur (bonusIsolement) restent les vrais moteurs d'un
        // grattage — un porteur isolé face à un pack costaud peut toujours se
        // faire gratter souvent.
        // Ballon « sur l'avancée » après un plaquage dominant (cf. _tickPorte) :
        // la défense a gagné le contact, elle conteste avec bien plus de chances
        // de gratter le ballon. Bonus consommé une seule fois (ce ruck).
        const bonusDominant = this.ruckDominant ? 0.035 : 0;
        // Base relevée de 0,030 à 0,048. À 3 %, l'équipe qui attaque conservait
        // 97 % de ses rucks : le grattage, qui est UN DES FAITS DE JEU LES PLUS
        // FRÉQUENTS du rugby moderne, n'existait quasiment pas. Un vrai match en
        // perd 5 à 7 % (conservation 93-95 %), et le repère de CLAUDE.md (rôle 6)
        // demande 12 à 18 turnovers par match quand le moteur n'en produisait que
        // 9,5. Mesuré au banc A/B sur 300 matchs appariés, avec correction de
        // Bonferroni sur 11 métriques : turnovers 9,47 -> 11,86 (+2,39 ± 0,63,
        // ÉTABLI) et AUCUNE autre métrique établie — essais, points, passes,
        // rucks, plaquages, touches, mêlées et gain de terrain sont inchangés.
        // C'est le rare levier qui ajoute un fait de jeu sans rien déséquilibrer.
        const probaTurnover = Math.max(0.048, Math.min(0.20, 0.048 + (forceDef - forceAtt) / 1600 + bonusIsolement + bonusDominant));
        const turnover = this.rng() < probaTurnover;
        this.ruckDominant = false;
        if (turnover) {
          this.stats[this.possession].turnoversConcedes++; // équipe qui PERD le ballon
          this.possession = this.possession === 'A' ? 'B' : 'A';
          this.stats[this.possession].turnovers++;           // équipe qui GAGNE le ballon
          {
            // Le grattage revient au défenseur qui contestait le ballon.
            const eqG = this.possession === 'A' ? this.equipeA : this.equipeB;
            const gratteur = eqG.find(j => this.contestants && j.numero === this.contestants[0]);
            if (gratteur) this._statJoueur(gratteur).turnoversGagnes++;
          }
          this.log('TURNOVER', this.possession, `Ballon gratte au ruck, equipe ${this.possession} recupere`);
        } else if ((this.ruckTempsSansSoutien || 0) > 1.5 * this._echelleArret && this.rng() < 0.5) {
          this.log('PENALITE_RUCK_ISOLE', equipeOriginale, `Porteur isole au ruck, ballon non rendu, penalite pour l'equipe adverse`);
          this._traiterPenalite(equipeOriginale === 'A' ? 'B' : 'A', pt);
          return;
        }
        if (!turnover) this.stats[equipeOriginale].rucksConserves++;
        // Sortie de ruck : c'est le demi de mêlée (n°9) qui joue le ballon au
        // pied du regroupement, comme à la mêlée et à la sortie de maul — pas
        // simplement l'avant le plus proche du point de ruck. Il a couru vers
        // le ruck tout au long de la phase ci-dessus (cf. estDemiMelee) ; on
        // ne force donc plus sa position au point de ruck à la résolution, ce
        // qui le téléportait auparavant depuis là où il se trouvait vraiment.
        // S'il est lui-même au sol (rare, juste plaqué), l'avant le plus
        // proche du point relaie à sa place. La transmission à l'ouvreur
        // n'est plus instantanée : depuis sa position réelle, le 9 décide
        // ensuite normalement (cf. _tickPorte/_tenterPasse) s'il lui passe,
        // exactement comme n'importe quelle autre passe en jeu courant.
        const att = this.attaquants();
        let relayeur;
        if (turnover) {
          // Ballon gratté : c'est le joueur qui l'a arraché (le plus proche du
          // ruck dans la nouvelle équipe, déjà sur place) qui le récupère, là
          // où il est — pas le demi de mêlée adverse resté loin, ce qui
          // téléportait le ballon à l'autre bout du regroupement.
          ({ joueur: relayeur } = joueurLePlusProche(att.filter(j => j.auSol === 0), pt.x, pt.y));
        } else {
          // Sortie propre : le demi de mêlée (n°9) joue le ballon au pied du
          // regroupement (il a couru vers le ruck pendant la phase, cf.
          // estDemiMelee) ; il décide ensuite normalement (passe/jeu au pied).
          const neuf = att.find(j => j.numero === 9 && j.auSol === 0);
          if (neuf) { relayeur = neuf; this._neufLibre = true; this.log('RUCK_SORTIE_9', this.possession, `Sortie de ruck par le 9`); }
          // Le 9 au sol (c'est lui qui vient d'être plaqué) : l'avant DEBOUT le
          // plus proche relaie. Le filtre manquait : le plaqué lui-même, encore
          // à terre, recevait le ballon et repartait « en courant » allongé
          // (QA-RM-002, ~25 instants par match).
          else {
            const debout = att.filter(j => j.tendance >= 50 && j.auSol === 0);
            ({ joueur: relayeur } = joueurLePlusProche(debout.length ? debout : att.filter(j => j.auSol === 0), pt.x, pt.y));
          }
        }
        // Le joueur qui était plaqué (ancien porteur, au sol) se relève PROMPTEMENT
        // une fois le ballon sorti et le jeu reparti : sinon il restait ~2 s au sol
        // TOUT SEUL pendant que le jeu s'éloignait de 10-15 m — c'est ce qui donnait
        // l'impression d'un joueur « qui tombe sans plaqueur ». Il se relève donc
        // plus vite (auSol ramené à ~1,3 s) au lieu de traîner ~2 s à terre. NB :
        // le relever trop vite (0,7 s) le renvoie tout de suite dans la ligne et
        // gonfle les essais (mesuré : 10/match) ; 1,3 s garde ~7 essais/match tout
        // en supprimant le "joueur au sol tout seul".
        const plaque = this.porteur;
        if (plaque && plaque.auSol > 1.3) plaque.auSol = 1.3;
        this.porteur = relayeur || att.find(j => j.numero === 8) || att[0];
        // BALLON ÉCLAIR : un ruck recyclé en moins de ~1,8 s prend la défense
        // PAS ENCORE REPLACÉE — pendant ~1,2 s sa montée en ligne est ralentie
        // (cf. _tickPorte). C'est LA récompense réelle du jeu rapide au ruck :
        // sans elle, la défense du moteur se réalignait instantanément et le
        // ballon rapide ne servait à rien (il ne faisait qu'enchaîner les
        // phases plus vite contre une défense toujours en place).
        this._defenseTardive = this.timerPhase < 1.8 * this._echelleArret ? 2.4 : 0; // cf. INERTIE DE COURSE : le retard de replacement se compte en metres, pas en secondes
        this.phase = 'PORTE';
        this.timerPhase = 0;
        // Le ballon sort du regroupement en étant JOUÉ depuis la base vers le
        // porteur (le 9 le ramasse au pied du ruck) : on anime ce trajet en
        // passe visible depuis le point de ruck. Sans ça le ballon, affiché au
        // point de ruck pendant toute la phase, "réapparaissait" d'un coup sur
        // le porteur — parfois à 15-20 m quand le 9 n'avait pas fini de rejoindre
        // la base —, exactement la téléportation signalée. Le ballon glisse
        // désormais à vue de la base vers le joueur qui le joue.
        if (this.porteur && distance({ x: pt.x, y: pt.y }, this.porteur) > 1.5) {
          this._lancerPasseVisuelle({ x: pt.x, y: pt.y }, this.porteur);
        }
        this._imposerRecuperationRuck(pt);
      }
    }

    // === Maul (loi 16) : machine à états complète ============================
    // Initialise l'objet maul et bascule la phase moteur sur 'MAUL'. À partir de
    // là, _tickMaul fait avancer la machine à états jusqu'à la sortie du ballon,
    // la mêlée (ballon injouable) ou une pénalité.
    _formerMaul(porteur, defenseur) {
      const poss = this.possession;
      const sens = porteur.sensAttaque;
      this.ruckDominant = false; // un maul n'est pas un ballon de ruck sur l'avancée
      this.maul = {
        etat: ETATS_MAUL.FORMATION,
        equipePossession: poss,
        equipeNonPossession: poss === 'A' ? 'B' : 'A',
        // Loi 8 : si le ballon est injouable, mêlée à l'équipe qui n'avait pas le
        // ballon au début du maul — sauf si le maul a suivi une réception directe
        // d'un coup de pied adverse, auquel cas la mêlée revient au réceptionneur.
        equipeMeleeSiInjouable: this._receptionDirecte ? poss : (poss === 'A' ? 'B' : 'A'),
        x: porteur.x, y: porteur.y, sens,
        timer: 0, timerGlobal: 0, timerUseIt: -1,
        nbArrets: 0, tempsImmobile: 0, tempsMouvement: 0,
        timerHorsJeu: 0, vitesse: 0,
      };
      this._receptionDirecte = false;
      this.ruckPoint = { x: porteur.x, y: porteur.y };
      this.contestants = [defenseur.numero];
      this.phase = 'MAUL';
      this.timerPhase = 0;
      this.stats[poss].mauls++; this.stats[poss].phases++;
      this.log('MAUL', poss, `Maul forme, l'equipe ${poss} garde le ballon debout avec ses soutiens`);
    }

    // Orchestrateur : exécute un pas de la machine à états du maul.
    _tickMaul(dt) {
      const m = this.maul;
      if (!m) { this.phase = 'PORTE'; this.timerPhase = 0; return; }
      m.timer += dt;
      m.timerGlobal += dt;
      this.ruckPoint = { x: m.x, y: m.y };

      // GARDE-FOU ANTI-BLOCAGE (loi 16) : un maul ne s'eternise JAMAIS. Le
      // moteur garantissait deja qu'un ruck et qu'une melee se terminent, mais
      // pas le maul : sa sortie ne dependait que du tirage aleatoire du demi de
      // melee. Mesure sur 10 matchs : duree moyenne 15,5 s mais un maul observe
      // a 64,8 s, et en figeant le hasard le maul ne se terminait JAMAIS.
      //
      // IL SIFFLAIT UNE MELEE SUR DES MAULS QUI AVANCENT — ET C'EST ILLEGAL.
      // Ce garde-fou appelait directement `_maulMeleeInjouable()` a 45 s. Or la
      // loi 16.16/16.17 ne permet de terminer un maul par une melee que sur
      // ballon injouable, ecroulement, ou « use it » non execute : JAMAIS parce
      // que le maul dure. Tant que les mauls mouraient a 8,4 s le cas etait
      // marginal (2 % des mauls) ; en les allongeant a 23 s, le correctif de
      // poussee en a fait la sortie PRINCIPALE. Mesure sur 20 matchs au pas
      // reel du jeu (0,1 s, cf. docs/js/constants.js PAS_FIXE) :
      //   27 mauls sur 104 (26 %) termines par ce garde-fou, dont 24 EN
      //   MOUVEMENT. A 0,2 s : 13 sur 103, dont 13 en mouvement.
      // La possession changeait donc sans declencheur legal, et toujours au
      // detriment du pack qui domine — c'est justement parce qu'il pousse que
      // le maul dure.
      //
      // LE MAUL TROP LONG PASSE DESORMAIS PAR LA SEQUENCE LEGALE : second
      // arret -> « use it » (5 s) -> et melee SEULEMENT si le ballon ne sort
      // pas. Mesure apres correctif : 0 melee sur maul en mouvement aux deux
      // pas, duree maximale 40,0 s au lieu de 44,9 s (sous la borne de 50 s
      // assertee par server/test-invariants.js), avancee 8,51 m a 0,1 s.
      // Le seuil passe a 35 s pour laisser les 5 s du « use it » tenir sous la
      // meme borne. Il n'est PAS mis a l'echelle des arrets : la date-limite du
      // « use it » (m.timerUseIt = 5 s) ne l'est pas non plus.
      if (m.timerGlobal > 35 && m.etat !== ETATS_MAUL.SECOND_ARRET
          && m.etat !== ETATS_MAUL.USE_IT) {
        m.nbArrets = 2; m.etat = ETATS_MAUL.SECOND_ARRET; m.timer = 0;
      }

      // 1) IA des joueurs : liaisons, poussée dans l'axe, repli des non-engagés.
      this._maulGererLiaisons(dt);

      // 2) Arbitrage permanent : hors-jeu, puis fautes techniques/volontaires.
      const horsJeu = this._maulDetecterHorsJeu(dt);
      if (horsJeu) return this._maulSanctionner(horsJeu);
      const faute = this._maulDetecterFautes(dt);
      if (faute) return this._maulSanctionner(faute);

      // 3) Poussée collective + classification avance/arrêt (états « jouables »).
      const etatsPoussee = [ETATS_MAUL.FORMATION, ETATS_MAUL.ACTIF, ETATS_MAUL.AVANCE, ETATS_MAUL.PREMIER_ARRET];
      if (etatsPoussee.includes(m.etat)) {
        const avance = this._maulCalculerPoussee(dt);
        m.x = Math.max(0, Math.min(LONGUEUR, m.x + avance * m.sens));
        // Le ballon est transféré vers l'arrière du maul (côté de son propre camp).
        this.porteur.x = Math.max(0, Math.min(LONGUEUR, m.x - m.sens * 0.8));
        this.porteur.y = m.y;
        // EN METRES PAR SECONDE, PAS PAR TICK. `avance` vaut `m.vitesse * dt` :
        // compare a une constante, le seuil valait 0,20 m/s a dt=0,2 mais
        // 0,40 m/s a dt=0,1 — le pas REEL du jeu (docs/js/constants.js
        // PAS_FIXE). La loi 16.14/16.15 et la condition d'essai ci-dessous ne
        // s'appliquaient donc pas pareil selon la boucle appelante.
        const enMouvement = m.vitesse >= 0.2;
        if (enMouvement) { m.tempsMouvement += dt; m.tempsImmobile = 0; }
        else { m.tempsImmobile += dt; m.tempsMouvement = 0; }
        // Essai sur maul pénétrant : seulement s'il avance réellement jusqu'à la
        // ligne d'en-but adverse (rare, car la défense le stoppe le plus souvent).
        if (enMouvement && ((m.sens > 0 && m.x >= LONGUEUR - 0.3) || (m.sens < 0 && m.x <= 0.3))) {
          return this._maulEssai();
        }
      }

      // 4) Transitions de la machine à états.
      const poss = m.equipePossession;
      switch (m.etat) {
        case ETATS_MAUL.FORMATION:
          if (m.timer >= 0.5) { m.etat = ETATS_MAUL.ACTIF; m.timer = 0; }
          break;
        case ETATS_MAUL.ACTIF:
        case ETATS_MAUL.AVANCE:
          m.etat = m.tempsMouvement > 0 ? ETATS_MAUL.AVANCE : m.etat;
          if (m.tempsImmobile >= 1.0) {
            if (m.nbArrets === 0) {
              m.nbArrets = 1; m.etat = ETATS_MAUL.PREMIER_ARRET; m.timer = 0;
              this.log('MAUL_ARRET_UN', poss, `Maul arrete une fois : l'arbitre annonce "use it once" a l'equipe ${poss}`);
            } else {
              m.nbArrets = 2; m.etat = ETATS_MAUL.SECOND_ARRET; m.timer = 0;
            }
          }
          break;
        case ETATS_MAUL.PREMIER_ARRET:
          // Une seule relance autorisée : s'il repart clairement, on laisse jouer.
          if (m.tempsMouvement >= 0.4) { m.etat = ETATS_MAUL.AVANCE; }
          else if (m.timer >= 5) {
            m.nbArrets = 2; m.etat = ETATS_MAUL.SECOND_ARRET; m.timer = 0;
          }
          break;
        case ETATS_MAUL.SECOND_ARRET:
          this.log('MAUL_ARRET_DEUX', poss, `Maul arrete une deuxieme fois, equipe ${poss}`);
          m.etat = ETATS_MAUL.USE_IT; m.timerUseIt = 5; m.timer = 0;
          this.log('MAUL_USE_IT', poss, `"Use it" : l'equipe ${poss} doit sortir ou jouer le ballon sous 5 secondes`);
          break;
        case ETATS_MAUL.USE_IT:
          m.timerUseIt -= dt;
          // Le demi de mêlée sort/joue le ballon, avec une probabilité croissante.
          if (this.rng() < 0.6 * dt) return this._maulSortieBallon();
          if (m.timerUseIt <= 0) return this._maulMeleeInjouable();
          break;
      }
    }

    // Gestion des liaisons et de l'IA des joueurs autour du maul.
    _maulGererLiaisons(dt) {
      const m = this.maul;
      const att = m.equipePossession === 'A' ? this.equipeA : this.equipeB;
      const def = m.equipeNonPossession === 'A' ? this.equipeA : this.equipeB;
      const liesAtt = this._maulJoueursLies(att);
      const liesDef = this._maulJoueursLies(def);
      // Attaque : avants liés DERRIÈRE le ballon (côté de leur camp), poussent
      // dans l'axe ; le porteur est maintenu au cœur du maul.
      // Bloc compact : rangées de trois, l'une derrière l'autre (et non une
      // ligne de 3 m de large).
      liesAtt.forEach((j, i) => {
        const cx = m.x - m.sens * (0.6 + Math.floor(i / 3) * 0.6);
        const cy = m.y + ((i % 3) - 1) * 0.7;
        avancer(j, cx - j.x, cy - j.y, dt, vitesseMs(j));
      });
      // Défense : avants liés DEVANT, debout, contestent la progression.
      liesDef.forEach((j, i) => {
        const cx = m.x + m.sens * (0.6 + Math.floor(i / 3) * 0.6);
        const cy = m.y + ((i % 3) - 1) * 0.7;
        avancer(j, cx - j.x, cy - j.y, dt, vitesseMs(j));
      });
      // Le demi de mêlée de l'équipe en possession suit la base du maul tout
      // au long de la phase, comme au ruck (cf. _tickRuck, estDemiMelee) :
      // c'est lui qui jouera le ballon à la sortie (cf. _maulSortieBallon),
      // donc il ne doit jamais y être téléporté à la résolution — il doit
      // l'avoir réellement rejoint en courant pendant le maul.
      const neufAtt = att.find(j => j.numero === 9 && j.auSol === 0 && j !== this.porteur);
      if (neufAtt) {
        const cx9 = m.x - m.sens * 1.5;
        avancer(neufAtt, cx9 - neufAtt.x, m.y - neufAtt.y, dt, vitesseMs(neufAtt));
      }
      // Joueurs non liés : rester en-deçà de leur ligne de hors-jeu (onside).
      const cibleAtt = m.x - m.sens * 3;
      for (const j of att) {
        if (liesAtt.includes(j) || j === this.porteur || j === neufAtt) continue;
        if ((m.sens > 0 && j.x > cibleAtt) || (m.sens < 0 && j.x < cibleAtt)) {
          avancer(j, cibleAtt - j.x, 0, dt, vitesseMs(j) * 0.6);
        }
      }
      const cibleDef = m.x + m.sens * 3;
      for (const j of def) {
        if (liesDef.includes(j)) continue;
        if ((m.sens > 0 && j.x < cibleDef) || (m.sens < 0 && j.x > cibleDef)) {
          avancer(j, cibleDef - j.x, 0, dt, vitesseMs(j) * 0.6);
        }
      }
    }

    // Les (jusqu'à 7) avants d'une équipe les plus proches du maul et debout :
    // le pack pousse presque entier. Avec 5, les piliers restaient à regarder
    // depuis la touche. Mesuré sur 100 matchs appariés : avancée et durée du
    // maul quasi inchangées (13,0 m, 16 s), essais et points sans écart
    // significatif.
    _maulJoueursLies(equipe) {
      const m = this.maul;
      return equipe
        .filter(j => j.numero <= 8 && j.auSol === 0)
        .sort((a, b) => Math.hypot(a.x - m.x, a.y - m.y) - Math.hypot(b.x - m.x, b.y - m.y))
        .slice(0, 7);
    }

    // Calcul de la poussée : déséquilibre des forces des deux paquets liés, borné
    // et bruité — un maul ne garantit jamais une avancée nette. Renvoie l'avancée
    // (mètres ce tick, positive = vers la ligne adverse).
    //
    // LE DÉ POUSSAIT PLUS FORT QUE LES TRENTE AVANTS. La formule valait
    // `(fAtt - fDef) / 200 + (aléa - 0,5) * 0,5`. L'écart de force entre les
    // deux paquets vaut ~27 points en moyenne, soit 0,135 m/s, face à un terme
    // de hasard de ±0,25 m/s : le tirage pesait DEUX FOIS les deux packs
    // réunis. Et comme « use it » se déclenche après 1 s sous 0,2 m/s, le maul
    // mourait dès que le dé tombait mal. Mesure sur 20 matchs : avancée 2,38 m
    // (repère réel 5 à 15 m), 0,79 m à moins de 10 m de la ligne, et ZÉRO essai
    // sur maul par match — une des deux machines à essais des avants
    // n'existait pas.
    //
    // CE QUE J'AI CRU, ET QUE LA MESURE A DÉMENTI : je craignais qu'en donnant
    // le poids aux packs l'issue devienne un rail. C'est l'inverse. Plus il y a
    // de hasard, plus le maul OSCILLE autour du seuil d'arrêt, sans jamais
    // avancer franchement ni s'arrêter proprement — et il finit en mêlée.
    // Dosages mesurés (rapport packs/dé — avancée, durée, essais, % mêlée) :
    //   0,54x (avant)  2,38 m  14,3 s  0,00  9 %
    //   1,7x           4,73 m  20,9 s  0,05  24 %
    //   2,2x           6,84 m  23,6 s  0,20  24 %
    //   3,0x           6,52 m  20,8 s  0,25  21 %
    //   5,0x (retenu)  7,61 m  18,9 s  0,20  13 %
    //
    // CE QUE LA COLONNE « % MELEE » MESURAIT VRAIMENT. En choisissant ce
    // dosage j'ai ecrit que c'etait « le seul qui ne fait pas finir un maul sur
    // quatre en melee ». Le controle d'arbitrage qui a suivi a montre que ces
    // 13 % (comme les 21-24 % des autres dosages) n'etaient PAS des melees de
    // loi 16.17 : c'etaient les coups de sifflet du garde-fou anti-blocage, sur
    // des mauls qui avançaient encore — 13 sur 13 a dt=0,2. Le classement des
    // dosages reste valable (un maul qui dure moins se fait moins siffler),
    // mais l'argument etait mal nomme. Le garde-fou est corrige plus haut.
    // Le dosage retenu est le seul qui donne une avancée réelle SANS faire
    // finir un maul sur quatre en mêlée. Ce n'est pas un rail non plus : deux
    // packs équivalents donnent un écart nul, donc un maul qui piétine.
    //
    // LE BLOCAGE DE P2-25 EST LEVÉ, ET DANS L'AUTRE SENS. Cette entrée avait
    // refusé trois calibrations parce qu'elles coûtaient 15 à 20 % des portages
    // dans les cinq mètres. Mesuré ici : portages à moins de 5 m 8,55 -> 10,10
    // par match (+18 %), part des avants 28,7 % -> 32,7 %. En avançant
    // réellement, le maul AMÈNE le ballon dans les cinq mètres au lieu d'y
    // mourir quinze mètres plus loin : il en crée au lieu d'en consommer.
    _maulCalculerPoussee(dt) {
      const m = this.maul;
      const att = m.equipePossession === 'A' ? this.equipeA : this.equipeB;
      const def = m.equipeNonPossession === 'A' ? this.equipeA : this.equipeB;
      let fAtt = 0, fDef = 0;
      for (const j of att) if (j.auSol === 0 && Math.hypot(j.x - m.x, j.y - m.y) < 4) fAtt += forceMaul(j);
      for (const j of def) if (j.auSol === 0 && Math.hypot(j.x - m.x, j.y - m.y) < 4) fDef += forceMaul(j);
      const net = (fAtt - fDef) / 70 + (this.rng() - 0.5) * 0.15;
      m.vitesse = Math.max(-0.5, Math.min(0.8, net));
      return m.vitesse * dt;
    }

    // Hors-jeu au maul : un défenseur non lié, debout, passé du côté de la sortie
    // du ballon (contournement), au-delà d'un délai de grâce → pénalité.
    _maulDetecterHorsJeu(dt) {
      const m = this.maul;
      if (m.etat === ETATS_MAUL.FORMATION) return null;
      const def = m.equipeNonPossession === 'A' ? this.equipeA : this.equipeB;
      let fautif = false;
      for (const j of def) {
        if (j.auSol > 0) continue;
        if (Math.hypot(j.x - m.x, j.y - m.y) < 4) continue; // lié, donc légal
        if (Referee.horsJeuMaul(j, m, m.sens)) { fautif = true; break; }
      }
      m.timerHorsJeu = fautif ? m.timerHorsJeu + dt : 0;
      if (m.timerHorsJeu >= 1.2) {
        return { type: 'HORS_JEU', equipeFautive: m.equipeNonPossession, message: 'hors-jeu au maul (defenseur qui contourne)', delibere: false };
      }
      return null;
    }

    // Détection probabiliste des fautes de maul, pondérée par la situation. Les
    // taux sont volontairement faibles : la plupart des mauls ne sont pas
    // sanctionnés, comme dans la réalité (sinon l'équilibre du match casse).
    _maulDetecterFautes(dt) {
      const m = this.maul;
      const r = this.rng();
      if (m.etat === ETATS_MAUL.FORMATION) {
        if (r < 0.012 * dt) {
          const eqF = this.rng() < 0.5 ? m.equipePossession : m.equipeNonPossession;
          return { type: 'ENTREE_COTE', equipeFautive: eqF, message: 'entree sur le cote a la formation du maul', delibere: false };
        }
        return null;
      }
      const distLigneDef = m.sens > 0 ? (LONGUEUR - m.x) : m.x;
      const avance = m.etat === ETATS_MAUL.AVANCE;
      // Écroulement volontaire de la défense. Taux faibles en milieu de terrain
      // (la plupart des mauls ne sont pas sanctionnés), mais nettement plus élevés
      // tout près de la ligne d'en-but : c'est l'acte cynique typique pour
      // empêcher un essai sur maul lancé, qui vaut souvent carton/essai de pénalité.
      // 0,04 -> 0,02 a moins de 5 m : un maul lance y restait ~5 s en mouvement
      // et l'ecroulement y donnait 0,40 essai de penalite par match (19 % de ces
      // mauls), pour ~0,1 a 0,15 essai de penalite au total en vrai.
      const tauxEcroulement = avance && distLigneDef < 5 ? 0.02
        : avance && distLigneDef < 18 ? 0.010
          : 0.003;
      const eqDefMaul = m.equipeNonPossession === 'A' ? this.equipeA : this.equipeB;
      let seuil = tauxEcroulement * dt * facteurDiscipline(eqDefMaul);
      if (r < seuil) {
        return { type: 'ECROULEMENT', equipeFautive: m.equipeNonPossession, message: 'ecroulement volontaire du maul', delibere: true };
      }
      // Autres fautes techniques (joueur non lié qui pousse, saut sur le maul,
      // tirer un adversaire, obstruction, détachement illégal, joueur au sol).
      const techniques = [
        { p: 0.0015, cible: 'def', msg: 'entree sur le cote', del: false, type: 'ENTREE_COTE' },
        { p: 0.0010, cible: 'att', msg: 'obstruction devant le porteur', del: false, type: 'TECHNIQUE' },
        { p: 0.0010, cible: 'def', msg: 'joueur non lie qui pousse', del: false, type: 'TECHNIQUE' },
        { p: 0.0008, cible: 'def', msg: 'joueur qui saute sur le maul', del: true, type: 'TECHNIQUE' },
        { p: 0.0008, cible: 'att', msg: 'porteur qui se detache illegalement', del: false, type: 'TECHNIQUE' },
        { p: 0.0008, cible: 'def', msg: 'joueur au sol qui empeche la sortie', del: false, type: 'TECHNIQUE' },
      ];
      for (const f of techniques) {
        seuil += f.p * dt;
        if (r < seuil) {
          const eqF = f.cible === 'att' ? m.equipePossession : m.equipeNonPossession;
          return { type: f.type, equipeFautive: eqF, message: f.msg, delibere: f.del };
        }
      }
      return null;
    }

    // Décision d'arbitrage sur une faute de maul : essai de pénalité, carton
    // jaune, ou pénalité simple, selon le caractère délibéré, la répétition et la
    // proximité de la ligne d'en-but.
    _maulSanctionner(faute) {
      const m = this.maul;
      const fautive = faute.equipeFautive;
      const benef = fautive === 'A' ? 'B' : 'A';
      const pos = { x: m.x, y: m.y };
      // Infractions de maul répétées par cette équipe sur le match (≥ 3 → carton).
      this._maulPenalitesMatch[fautive] = (this._maulPenalitesMatch[fautive] || 0) + 1;
      const repetee = this._maulPenalitesMatch[fautive] >= 3;
      const sensBenef = benef === 'A' ? 1 : -1;
      const distLigne = sensBenef > 0 ? (LONGUEUR - pos.x) : pos.x;
      const presDeLigne = distLigne <= 5;
      const maulLance = m.etat === ETATS_MAUL.AVANCE;
      // Essai de pénalité : faute délibérée empêchant un maul lancé qui allait
      // probablement marquer.
      const empecheEssai = faute.delibere && faute.type === 'ECROULEMENT' && presDeLigne && maulLance;
      this._finMaul();

      if (faute.delibere && (presDeLigne || repetee)) {
        // Le carton doit coûter un joueur, pas seulement une bannière : 10 min
        // réelles de bin (ramenées à l'échelle du match, cf. _echelleArret),
        // pendant lesquelles l'équipe fautive joue à 14 (attaquants()/
        // defenseurs() l'excluent). Le fautif retenu est le joueur de l'équipe
        // fautive le plus proche du maul, faute d'identifier l'auteur exact.
        const eqFautive = fautive === 'A' ? this.equipeA : this.equipeB;
        const { joueur: fautif } = joueurLePlusProche(eqFautive, pos.x, pos.y);
        fautif.sinBin = 600 * this._echelleArret;
        this.stats[fautive].cartonsJaunes++;
        this._statJoueur(fautif).cartonsJaunes++;
        this.log('CARTON_JAUNE', fautive, `Carton jaune pour l'equipe ${fautive} (n°${fautif.numero}) : ${faute.message} - a 14 pendant ${Math.round(fautif.sinBin)}s`);
      }
      if (empecheEssai) {
        this.score[benef] += 7;
        this.stats[benef].essais++;
        this.stats[benef].essaisPenalite++;
        this.log('ESSAI_PENALITE', benef, `Essai de penalite : ${faute.message} sur maul lance, equipe ${benef} +7`);
        this._nouvelleManche(benef);
        return;
      }
      const evt = faute.type === 'ECROULEMENT' ? 'MAUL_PEN_ECROULEMENT'
        : faute.type === 'HORS_JEU' ? 'MAUL_PEN_HORSJEU'
          : faute.type === 'ENTREE_COTE' ? 'MAUL_PEN_ENTREE_COTE'
            : 'MAUL_PEN_TECHNIQUE';
      this.log(evt, fautive, `Penalite maul : ${faute.message} (equipe ${fautive}), penalite pour l'equipe ${benef}`);
      // _traiterPenalite fixe lui-même la possession ET le porteur selon l'option
      // choisie (tir au but, pénalité-touche, ou jeu rapide où le tapeur REJOINT
      // la marque EN COURANT, cf. _lancerJeuRapidePenalite). On ne téléporte donc
      // plus un joueur directement sur la marque ici : ce set x/y était redondant
      // (aussitôt écrasé) et incohérent avec la politique anti-téléportation
      // appliquée partout ailleurs.
      this._traiterPenalite(benef, pos);
    }

    // Sortie du ballon après « use it » : le demi de mêlée (n°9) joue le ballon,
    // le jeu reprend à la main au pied du maul. Il a suivi la base du maul tout
    // au long de la phase (cf. _maulGererLiaisons, neufAtt) : pas de
    // téléportation, il joue depuis sa position réelle. S'il est au sol (rare,
    // juste plaqué), l'avant le plus proche du pied du maul relaie.
    _maulSortieBallon() {
      const m = this.maul;
      const poss = m.equipePossession;
      this.log('MAUL_BALLON_SORTI', poss, `Ballon sorti du maul par le demi de melee, l'equipe ${poss} relance`);
      this._finMaul();
      this.possession = poss;
      const eqMaul = poss === 'A' ? this.equipeA : this.equipeB;
      const neuf = eqMaul.find(j => j.numero === 9 && j.auSol === 0);
      this.porteur = neuf || joueurLePlusProche(eqMaul, m.x, m.y).joueur;
      this._imposerRecuperationRuck({ x: m.x, y: m.y });
      this.phase = 'PORTE';
      this.timerPhase = 0;
    }

    // Ballon injouable : mêlée à l'équipe désignée par la loi 19 (défense, ou
    // réceptionneur si le maul a suivi une réception directe).
    _maulMeleeInjouable() {
      const m = this.maul;
      const equipe = m.equipeMeleeSiInjouable;
      const pos = { x: m.x, y: m.y };
      this.log('MAUL_INJOUABLE', m.equipePossession, `Ballon injouable dans le maul, melee pour l'equipe ${equipe}`);
      this._finMaul();
      this._accorderMeleeA(equipe, pos);
    }

    // Qui a marqué et d'où venait l'action (QA-RM-007), cf. _sequence dans tick.
    _infoEssai(marqueur) {
      const q = this._sequence || {};
      return { marqueur: marqueur ? marqueur.numero : null, origine: q.origine || null,
        depuis: q.depuis != null ? q.depuis : null, rucks: q.rucks || 0 };
    }

    // Essai inscrit par un maul pénétrant qui franchit la ligne adverse.
    _maulEssai() {
      const m = this.maul;
      const poss = m.equipePossession;
      const x = m.sens > 0 ? LONGUEUR : 0;
      this.score[poss] += 5;
      this.stats[poss].essais++;
      this._statJoueur(this.porteur).essais++; // porteur réel du maul, cf. commentaire ci-dessous
      this.essaiX = x;
      this.essaiY = m.y;
      this.essaiEquipe = poss;
      this.log('ESSAI', poss, `Essai sur maul penetrant, equipe ${poss} !`, Object.assign(this._infoEssai(this.porteur), { maul: true }));
      // Le MARQUEUR est le porteur RÉEL du maul : pendant toute la poussée,
      // _tickMaul l'a maintenu collé à l'arrière du maul (this.porteur, cf.
      // lignes « this.porteur.x = m.x - m.sens*0.8 »), il est donc au CONTACT
      // de la ligne — à 1,1 m en deçà, mesuré : le centre du maul est déclaré
      // arrivé à `LONGUEUR - 0,3` et le porteur se tient 0,8 m derrière lui.
      // C'est licite au titre de la loi 8.2.b (c'est le MAUL qui doit atteindre
      // la ligne), mais le repositionnement ci-dessous n'est pas d'un pas : il
      // avance le marqueur de ces 1,1 m. Ne pas croire, en relisant, qu'aucun
      // déplacement n'a lieu. AVANT, on réassignait
      // this.porteur à un n°8 nominal (eq[7]) placé ailleurs sur le terrain puis
      // on le TÉLÉPORTAIT sur la marque (saut mesuré ~20 m) — le porteur réel,
      // lui, était pourtant déjà au bon endroit. On garde donc le porteur courant.
      const marqueur = this.porteur;
      this._finMaul();
      this.possession = poss;
      if (marqueur) {
        marqueur.x = x; marqueur.y = m.y;
        this.porteur = marqueur;
      } else {
        this.porteur = (poss === 'A' ? this.equipeA : this.equipeB)[7];
        this.porteur.x = x; this.porteur.y = m.y;
      }
      this.phase = 'ESSAI';
      this.timerPhase = 0;
    }

    // Mêlée accordée à une équipe précise (utilisée par le maul injouable, où le
    // bénéficiaire n'est pas forcément l'adversaire du porteur).
    _accorderMeleeA(equipe, position) {
      this._formerMelee(equipe, position);
    }

    _finMaul() {
      this.maul = null;
      this.contestants = [];
    }

    // === Mêlée (lois 19/20) : machine à états complète ========================
    // Initialise l'objet mêlée et bascule la phase moteur sur 'MELEE'. À partir
    // de là, _tickMelee fait avancer la machine à états (placement -> "Crouch"
    // -> "Bind" -> "Set" -> introduction -> contestation -> sortie de balle),
    // exactement comme _formerMaul/_tickMaul pour le maul.
    _formerMelee(equipeIntroduction, position) {
      // Où le ballon est-il AFFICHÉ juste avant la mêlée (P2-81) ? C'est de là
      // qu'il rejoint le 9, à vue (cf. état RETOUR plus bas).
      // Après un VOL (coup d'envoi trop court, lancer pas droit, en-avant sous
      // une chandelle), le vol vient d'être déclaré terminé : le ballon est au
      // point de chute (ballonVolX/Y), pas dans les mains du dernier porteur.
      let ballonAvant = null;
      const apresVol = (this.phase === 'COUP_ENVOI' || this.phase === 'TOUCHE' || this.phase === 'COUP_DE_PIED_JEU')
        && this.ballonVolX != null;
      if (apresVol) ballonAvant = { x: this.ballonVolX, y: this.ballonVolY };
      else {
        try { const b = this.getState().ballon; ballonAvant = { x: b.x, y: b.y }; } catch (e) { ballonAvant = null; }
      }
      this.stats[equipeIntroduction].scrums++;
      this.log('MELEE', equipeIntroduction, `Melee, introduction pour l'equipe ${equipeIntroduction}`);
      const px = Math.max(5, Math.min(LONGUEUR - 5, position.x));
      const py = Math.max(5, Math.min(LARGEUR - 5, position.y));
      this.melee = {
        etat: ETATS_MELEE.FORMATION,
        equipeIntroduction,
        equipeNonIntroduction: equipeIntroduction === 'A' ? 'B' : 'A',
        x: px, y: py, sens: equipeIntroduction === 'A' ? 1 : -1,
        timer: 0, timerGlobal: 0,
        // Conditions de terrain/ballon (pelouse, météo...) propres à cette
        // mêlée, tirées une seule fois : petit facteur de contestation parmi
        // d'autres, jamais déterminant à lui seul.
        conditions: (this.rng() - 0.5) * 0.1,
        rotation: 0, resets: 0,
        diff: 0, vainqueur: null, qualite: null, useItAnnonce: false,
        // Côté d'introduction : vers le grand côté du terrain (cf. _meleeFeedPos).
        cote: py < LARGEUR / 2 ? 1 : -1,
        // Ballon de la mêlée (P2-64) : sa position est une trajectoire continue
        // (mains du 9 -> milieu du tunnel -> sous le pack -> pieds du 8), jamais
        // un point fixe. Trace pas à pas du ballon et des deux 9, et contacts.
        balle: null, ach: null, trace: [], contacts: [],
      };
      this.possession = equipeIntroduction;
      const eq = equipeIntroduction === 'A' ? this.equipeA : this.equipeB;
      // Loi 19.13-15 : seul le demi de melee (n°9) introduit le ballon dans
      // le tunnel, jamais l'ouvreur. _neufVersDix (qui privilegie le n°10)
      // sert a la SORTIE de balle d'un regroupement, pas a l'introduction -
      // l'utiliser ici donnait le ballon au n°10 sur 100% des melees.
      this.porteur = eq.find(j => j.numero === 9 && j.sinBin <= 0) || eq[8];
      // Le demi de melee N'EST PLUS teleporte a l'entree du tunnel : il y court
      // depuis sa position courante (cf. _meleePositionnerBallon, via avancer()),
      // exactement comme les avants rejoignent le pack a la course. Avant ce
      // correctif il etait snappe d'un coup (jusqu'a ~27 m de saut visible). Il
      // se place sur le COTE du tunnel (loi 19 : le demi se tient sur le cote
      // pour introduire), pas au centre des avants, et ne glisse le ballon
      // qu'a l'annonce "introduction".
      // Les avants ET les deux demis convergent a la course (cf.
      // _meleePlacerPaquets, _meleePositionnerBallon et le palier "pret" de
      // _tickMelee, case FORMATION) : le joueur voit reellement la melee se
      // reorganiser vers le point plutot que d'apparaitre deja en place. Le
      // delai "Crouch" s'adapte a la distance du plus excentre, plafonne pour
      // ne jamais bloquer le match (cf. _capFormationMelee).
      // Le ballon n'est pas créé « dans les mains » du 9, encore loin de la
      // marque : il part de là où il était et le rejoint à vitesse de passe
      // (état RETOUR, cf. _meleePositionnerBallon) — avant, il sautait de ~11 m
      // (jusqu'à 35 m) à chaque mêlée (P2-81, test M24). Le contact
      // BALLON_AU_9 est tracé quand il arrive réellement dans ses mains.
      const depart = ballonAvant || { x: this.porteur.x, y: this.porteur.y };
      this.melee.balle = { etat: 'RETOUR', x: depart.x, y: depart.y, h: 0 };
      this.melee.capFormation = this._capFormationMelee(px, py);
      this.ruckPoint = { x: px, y: py };
      this.contestants = [];
      this.phase = 'MELEE';
      this.timerPhase = 0;
    }

    // Estime le temps reel necessaire au pack le plus excentre pour rallier
    // le point de melee en courant (vitesse pack ~0.7x, cf. _meleePlacerPaquets),
    // avec une marge de securite (vitesse basse) et un plafond pour qu'un
    // en-avant survenu tres loin du point de melee ne bloque jamais le match :
    // remplace l'ancien plafond fixe de 3s, qui ne laissait pas le temps aux
    // avants partis de loin de vraiment se regrouper avant l'annonce "Crouch".
    _capFormationMelee(px, py) {
      const avants = this.equipeA.concat(this.equipeB).filter(j => j.numero <= 8 && j.sinBin <= 0);
      let pireDistance = 0;
      for (const j of avants) {
        const d = Math.hypot(j.x - px, j.y - py);
        if (d > pireDistance) pireDistance = d;
      }
      // Le demi de melee qui introduit court lui aussi jusqu'a sa marque (le
      // cote du tunnel) : sans ce terme, "Crouch" pourrait etre annonce alors
      // qu'il est encore loin, et l'introduction se ferait sans lui en place.
      if (this.porteur && this.melee) {
        const feed = this._meleeFeedPos(this.melee);
        const d9 = Math.hypot(this.porteur.x - feed.x, this.porteur.y - feed.y);
        if (d9 > pireDistance) pireDistance = d9;
      }
      const vitessePackMin = 2.5; // m/s, vitesse basse d'un pack qui se regroupe
      return Math.min(10, Math.max(3, pireDistance / vitessePackMin));
    }

    // Position de mise en jeu du demi de melee : sur le COTE du tunnel (loi 19),
    // legerement du cote de son equipe, decale vers le centre du terrain pour
    // ne pas etre colle a la ligne de touche. Sert de cible de course (jamais
    // de teleportation) et de reference au palier "pret" de la formation.
    _meleeFeedPos(m) {
      // Face à l'OUVERTURE du tunnel (sur sa ligne médiane, x = marque), à
      // l'extérieur de la mêlée (1 m au-delà des flankers, liés à 1,6 m de l'axe).
      const cote = m.cote != null ? m.cote : (m.y < LARGEUR / 2 ? 1 : -1);
      return { x: m.x, y: m.y + cote * 2.6 };
    }

    _finMelee() {
      const m = this.melee;
      if (m && m.trace) {
        this._tracesMelees = this._tracesMelees || [];
        this._tracesMelees.push({ equipeIntroduction: m.equipeIntroduction, vainqueur: m.vainqueur,
          qualite: m.qualite, pas: m.trace, contacts: m.contacts });
        if (this._tracesMelees.length > 5) this._tracesMelees.shift();
      }
      this.melee = null;
      this.contestants = [];
    }

    // Trace des dernières mêlées (P2-64) : à chaque pas, la position du ballon
    // et des deux 9 avec leur action ; et chaque contact avec le ballon
    // (lâcher, sol, talonnage, contrôle du 8, ramassage, faute).
    traceMelees() {
      return (this._tracesMelees || []).slice();
    }

    _meleeContact(type, joueur, extra) {
      const m = this.melee;
      if (!m) return;
      const b = m.balle || {};
      m.contacts.push(Object.assign({ t: +m.timerGlobal.toFixed(2), type,
        equipe: joueur ? joueur.team : null, numero: joueur ? joueur.numero : null,
        x: b.x, y: b.y }, extra || {}));
    }

    // Les deux n°9 de la mêlée : celui de l'équipe qui introduit, et l'autre.
    _meleeNeufs() {
      const m = this.melee;
      const eqI = m.equipeIntroduction === 'A' ? this.equipeA : this.equipeB;
      const eqD = m.equipeIntroduction === 'A' ? this.equipeB : this.equipeA;
      return { intro: eqI.find(j => j.numero === 9 && j.sinBin <= 0) || null,
        adverse: eqD.find(j => j.numero === 9 && j.sinBin <= 0) || null };
    }

    // Orchestrateur : exécute un pas de la machine à états de la mêlée.
    _tickMelee(dt) {
      const m = this.melee;
      if (!m) { this.phase = 'PORTE'; this.timerPhase = 0; return; }
      m.timer += dt;
      m.timerGlobal += dt;
      this.ruckPoint = { x: m.x, y: m.y };

      // Garde-fou anti-blocage : une mêlée ne s'éternise JAMAIS. Au-delà du
      // plafond, l'arbitre RÉSOUT la mêlée au lieu de la refaire (l'équipe qui
      // introduit garde le ballon), ce qui garantit que TOUTE mêlée se termine
      // quelle que soit la durée du match.
      //
      // Ce plafond était à 24 s : il ne servait plus de garde-fou, il était
      // devenu le CHEMIN NORMAL. Mesuré sur 10 matchs, la durée moyenne d'une
      // mêlée était de 22,9 s — autrement dit presque toutes les mêlées
      // sortaient par ce couperet, jamais par la progression prévue
      // (formation, crouch, bind, set, introduction, contestation, sortie),
      // dont le commentaire annonce pourtant 45-70 s. La mêlée, premier poste
      // de ballon mort d'un vrai match, ne coûtait donc quasiment rien : le
      // ballon-en-jeu montait à 59,9 min sur 80 (réel ~35) et TOUS les volumes
      // d'actions étaient gonflés d'autant.
      //
      // Le plafond redevient ce qu'il doit être : un dernier recours, très
      // au-dessus d'une séquence normale. Il suit l'échelle des arrêts pour
      // rester valable sur les matchs de démonstration courts.
      // Depuis P2-64, le garde-fou ne RÉSOUT plus la mêlée d'un coup (le
      // ballon aurait été téléporté aux pieds du 8) : il force l'introduction,
      // et la séquence physique (introduction, talonnage, base) suit son cours,
      // elle-même bornée.
      if (m.timerGlobal > 95 * this._echelleArret && (m.etat === ETATS_MELEE.FORMATION
        || m.etat === ETATS_MELEE.CROUCH || m.etat === ETATS_MELEE.BIND || m.etat === ETATS_MELEE.SET)) {
        if (this._meleeIntroduire()) return;
      }

      // 1) IA des joueurs : packs qui se rapprochent et se lient, lignes
      // arrières en retrait, prêtes pour la sortie de balle.
      this._meleePlacerPaquets(dt);
      this._meleePositionnerBallon(dt);

      // 2) Arbitrage permanent : fautes (poussée prématurée, écroulement,
      // pilier en travers, liaison incorrecte, introduction non droite,
      // ballon bloqué, hors-jeu des lignes arrières...).
      const faute = this._meleeDetecterFautes(dt);
      if (faute) {
        // Une faute (écroulement, pilier en travers...) INTERROMPT la séquence
        // à l'instant : le ballon ne bouge plus, le pas est tracé tel quel.
        this._meleeTracer();
        this._meleeContact(faute.type, null, { equipeFautive: faute.equipeFautive });
        return this._meleeSanctionner(faute);
      }

      const E = ETATS_MELEE;
      const dur = (s) => s * this._echelleArret;
          // Durées des paliers : une séquence de mêlée réelle dure 45-70 s de
          // l'octroi à la sortie du ballon. Mesurées avant recalibrage, elles
          // totalisaient 22,9 s (formation 13,1 s, puis 1 à 2,4 s par palier) :
          // la mêlée, premier poste de ballon mort d'un vrai match, ne coûtait
          // presque rien. C'est la cause principale des 59,9 min de ballon en
          // jeu sur 80 (réel ~35) et donc des volumes d'actions 2 à 3× trop
          // élevés. `dur()` applique l'échelle des arrêts, qui compresse tout
          // automatiquement sur les matchs de démonstration courts.
      switch (m.etat) {
        case E.FORMATION: {
          // Les deux packs se placent face à face ; si une équipe est plus
          // forte elle ne pousse pas encore, elle attend l'introduction.
          // L'arbitre n'engage "Crouch" que lorsque les avants sont
          // réellement arrivés (sinon, sur un en-avant loin du point de
          // mêlée, la contestation démarrerait avec une poignée de joueurs
          // encore en train de courir depuis l'autre bout du terrain) ;
          // un plafond évite un blocage si un avant reste très excentré.
          const tousAvants = this.equipeA.concat(this.equipeB).filter(j => j.numero <= 8 && j.sinBin <= 0);
          const enPlace = tousAvants.filter(j => Math.hypot(j.x - m.x, j.y - m.y) < 3.5).length;
          // Tous les avants doivent être présents et alignés pour que l'arbitre
          // engage "Crouch" (pas seulement une majorité) : le plafond
          // capFormation reste l'unique garde-fou si un avant ne rejoint
          // jamais exactement le point (sin-bin, blocage en touche...).
          // Le demi de melee doit lui aussi avoir rejoint le cote du tunnel
          // (loi 19) avant l'engagement, sinon l'introduction demarrerait
          // alors qu'il court encore. Le plafond capFormation reste l'unique
          // garde-fou s'il ne peut jamais rallier exactement la marque.
          const feed = this._meleeFeedPos(m);
          const neufEnPlace = !this.porteur
            || Math.hypot(this.porteur.x - feed.x, this.porteur.y - feed.y) < 2;
          const pret = (tousAvants.length === 0 || enPlace >= tousAvants.length) && neufEnPlace;
          // Durée de formation RÉALISTE (loi 19 ; ~45-70 s de l'octroi à la
          // sortie en match réel) : les packs ne sprintent pas puis s'engagent
          // dans la foulée — ils marchent, se regroupent, se lient posément.
          // C'est le PRINCIPAL poste du temps « ballon mort » réel : l'expédier
          // en ~9 s (ancien réglage) gonflait le ballon-en-jeu à 65 % (réel
          // ~44 %) et multipliait les possessions (donc rucks/passes/mêlées,
          // 3-4× le réel). Les paliers ci-dessous consomment le temps réel d'une
          // vraie séquence de mêlée ; l'échelle (_echelleArret) compresse tout
          // automatiquement sur les matchs démo courts.
          // 22 s mesurees -> melee complete a 40,7 s, alors qu'un vrai octroi de
          // melee prend 60 a 90 s de la faute a la sortie du ballon (les packs
          // MARCHENT jusqu'a la marque, se comptent, se lient, l'arbitre annonce
          // en quatre temps). Porte a 34 s : c'est le plus gros poste de temps
          // mort du rugby, et le raccourcir revenait a jouer 1,5 fois trop de
          // possessions.
          if (m.timer >= dur(44) && (pret || m.timer >= m.capFormation + dur(6))) {
            m.etat = E.CROUCH; m.timer = 0;
            this.log('MELEE_CROUCH', m.equipeIntroduction, 'Arbitre : "Crouch" - les premieres lignes se baissent');
          }
          break;
        }
        case E.CROUCH:
          if (m.timer >= dur(4.5)) {
            m.etat = E.BIND; m.timer = 0;
            this.log('MELEE_BIND', m.equipeIntroduction, 'Arbitre : "Bind" - les piliers se lient a l\'adversaire');
          }
          break;
        case E.BIND:
          if (m.timer >= dur(3.5)) {
            m.etat = E.SET; m.timer = 0;
            this.log('MELEE_SET', m.equipeIntroduction, 'Arbitre : "Set" - les deux packs s\'engagent');
          }
          break;
        case E.SET:
          // La poussée ne commence qu'a partir d'ici (apres l'engagement),
          // jamais avant l'introduction.
          if (m.timer >= dur(3.0)) { if (this._meleeIntroduire()) return; }
          break;
        case E.INTRODUCTION: {
          // Le ballon a quitté les mains du 9 : il traverse l'ouverture du
          // tunnel, latéralement, et touche le sol entre les premières lignes.
          // La poussée peut commencer dès le lâcher ; le talonnage attend le sol.
          this._meleeAvancerPoussee(dt);
          const b = m.balle;
          const t = Math.min(1, m.timer / b.duree);
          b.x = b.x0 + (m.x - b.x0) * t;
          b.y = b.y0 + (m.y - b.y0) * t;
          b.h = 0.15 * Math.sin(Math.PI * t);
          if (t >= 1) {
            b.etat = 'SOL'; b.h = 0;
            this._meleeContact('SOL', null);
            // Talonnage : l'issue (ballon gardé, volé...) se décide au contact.
            this._meleeResoudreContestation();
          }
          break;
        }
        case E.CONTESTATION: {
          // Talonnage et acheminement : le talonneur ramène le ballon du pied, qui
          // roule AU SOL sous les avants (première ligne, deuxième ligne) jusqu'aux
          // pieds du 8 — ralenti sous pression, dévié, ou gagné par l'adversaire.
          this._meleeAvancerPoussee(dt);
          if (Math.abs(m.rotation) > 90) {
            this.log('MELEE_TOURNEE', m.equipeIntroduction, 'La melee tourne de plus de 90 degres, l\'arbitre la fait reformer');
            this._meleeContact('MELEE_TOURNEE', null);
            return this._meleeReset();
          }
          const a = m.ach;
          a.t = Math.min(1, a.t + dt / a.duree);
          this._meleePlacerBalleAuSol();
          if (a.t >= 1) this._meleeArriveeBase();
          break;
        }
        case E.SORTIE: {
          // Le ballon est à la base, CONTRÔLÉ aux pieds du 8 : la mêlée n'est pas
          // finie pour autant (la poussée continue). Elle se termine quand le 9
          // le joue — ou quand le 8 ramasse et part lui-même.
          this._meleeAvancerPoussee(dt);
          this._meleePlacerBalleAuSol();
          const seuilUseIt = dur(1.5);
          if (m.timerSortie <= seuilUseIt && !m.useItAnnonce) {
            m.useItAnnonce = true;
            this.log('MELEE_USE_IT', m.vainqueur, 'Arbitre : "Use it !" - le ballon doit sortir de la melee');
          }
          m.timerSortie -= dt;
          const eqV = m.vainqueur === 'A' ? this.equipeA : this.equipeB;
          const neufV = eqV.find(j => j.numero === 9 && j.sinBin <= 0);
          const huitV = eqV.find(j => j.numero === 8 && j.sinBin <= 0 && j.auSol === 0);
          const dureeSortie = (this.cfg.melee.durees || {}).sortie || 1.0;
          if (m.pickAndGo && huitV && m.timer >= dureeSortie * 0.6) return this._meleeSortieBallon(huitV);
          if (m.passeHuit && huitV && m.timer >= dureeSortie * 0.6) return this._meleeSortieBallon(huitV, true);
          const neufPret = neufV && Math.hypot(neufV.x - m.balle.x, neufV.y - m.balle.y) <= 1.0;
          if (neufPret && m.timer >= dureeSortie) return this._meleeSortieBallon(neufV);
          // « Use it » : si le 9 n'arrive pas, le 8 ramasse lui-même.
          if (m.timerSortie <= 0) return this._meleeSortieBallon(neufPret ? neufV : (huitV || neufV));
          break;
        }
      }
      this._meleeTracer();
    }

    // Lâcher du ballon par le 9 (introduction). Renvoie true si la séquence
    // s'est arrêtée sur une faute au lâcher (introduction non droite).
    _meleeIntroduire() {
      const m = this.melee;
      const { intro: neuf } = this._meleeNeufs();
      const d = this.cfg.melee.durees || {};
      m.etat = ETATS_MELEE.INTRODUCTION; m.timer = 0;
      this.log('MELEE_INTRODUCTION', m.equipeIntroduction, `Le demi de melee introduit le ballon dans le tunnel pour l'equipe ${m.equipeIntroduction}`);
      const b = m.balle;
      if (b.etat !== 'MAINS_9' && neuf) { b.x = neuf.x; b.y = neuf.y; }
      b.etat = 'INTRODUIT'; b.x0 = b.x; b.y0 = b.y; b.duree = Math.max(0.2, d.introduction || 0.8);
      this._meleeContact('LACHER', neuf);
      // La poussée peut commencer dès le lâcher : le différentiel de
      // contestation est établi maintenant.
      m.diff = this._meleeFacteurs();
      // Introduction non droite (loi 19) : jugée AU LÂCHER, une fois par mêlée
      // (cf. cfg.melee.introductionNonDroite).
      const tauxNonDroite = this.cfg.melee.introductionNonDroite;
      if (this.rng() < (typeof tauxNonDroite === 'number' ? tauxNonDroite : 0.04)) {
        this._meleeTracer();
        this._meleeContact('INTRODUCTION_NON_DROITE', neuf);
        this._meleeSanctionner({ type: 'INTRODUCTION_NON_DROITE', equipeFautive: m.equipeIntroduction, gravite: 'COUP_FRANC', message: 'introduction non droite dans le tunnel', delibere: false });
        return true;
      }
      return false;
    }

    // Position du ballon au sol sous le pack, PROPORTIONNELLE à la marque (qui
    // se déplace avec la poussée) : il garde donc une trajectoire continue même
    // quand la mêlée avance ou recule. prof : distance parcourue depuis le
    // milieu du tunnel vers l'arrière du pack qui a gagné le ballon.
    _meleePlacerBalleAuSol() {
      const m = this.melee, a = m.ach, b = m.balle;
      if (!a) return;
      const lisse = a.t * a.t * (3 - 2 * a.t);
      const prof = PROF_BASE_MELEE * lisse;
      b.x = m.x - a.sens * prof;
      b.y = m.y + a.deviation * Math.sin(Math.PI * Math.min(1, a.t));
      b.h = 0;
    }

    // Le ballon arrive aux pieds du 8 qui l'a gagné : le 8 le contrôle.
    _meleeArriveeBase() {
      const m = this.melee;
      const intro = m.equipeIntroduction, nonIntro = m.equipeNonIntroduction;
      if (m.qualite === 'VOLE') {
        this.stats[nonIntro].turnovers++;
        this.stats[intro].turnoversConcedes++;
        this.log('TURNOVER', nonIntro, `Ballon vole en melee contre l'introduction, l'equipe ${nonIntro} recupere`);
      } else if (m.qualite === 'DOMINANT') {
        this.log('MELEE_DOMINEE', intro, `Poussee dominante en melee, l'equipe ${intro} fait reculer le pack adverse`);
      } else if (m.qualite === 'PROPRE') {
        this.log('MELEE_GAGNEE', intro, `Ballon gagne proprement par l'equipe ${intro} en melee`);
      } else {
        this.log('MELEE_PRESSION', intro, `Ballon gagne sous pression par l'equipe ${intro} en melee`);
      }
      this.stats[m.vainqueur].scrumsGagnes++;
      if (m.vainqueur === intro) this.stats[intro].scrumsGagnesIntro++;
      const eqV = m.vainqueur === 'A' ? this.equipeA : this.equipeB;
      const huit = eqV.find(j => j.numero === 8 && j.sinBin <= 0) || null;
      m.balle.etat = 'BASE';
      this._meleeContact('CONTROLE_8', huit);
      this.log('MELEE_BASE', m.vainqueur, `Le ballon est a la base, aux pieds du n°8 de l'equipe ${m.vainqueur}`);
      const pickAndGoHuit = this.cfgMelee[m.vainqueur].pickAndGoHuit;
      // Un seul tirage, deux seuils : la probabilité du pick-and-go reste celle
      // d'avant ; la passe du 8 prend une part des sorties par le 9.
      const passeHuit = this.cfgMelee[m.vainqueur].passeHuit || { dominant: 0, normal: 0 };
      const dom = m.qualite === 'DOMINANT';
      const pPick = dom ? pickAndGoHuit.dominant : pickAndGoHuit.normal;
      const pPasse = dom ? passeHuit.dominant : passeHuit.normal;
      const r = this.rng();
      const huitDispo = !!(huit && huit.auSol === 0);
      m.pickAndGo = huitDispo && r < pPick;
      m.passeHuit = huitDispo && !m.pickAndGo && r < pPick + pPasse;
      m.etat = ETATS_MELEE.SORTIE;
      m.timer = 0;
      m.timerSortie = 4 * this._echelleArret + ((this.cfg.melee.durees || {}).sortie || 1.0);
      m.useItAnnonce = false;
    }

    // Trace d'un pas de mêlée : ballon et deux 9, avec leur action.
    _meleeTracer() {
      const m = this.melee;
      if (!m || !m.balle) return;
      const { intro, adverse } = this._meleeNeufs();
      const action = (n, estIntro) => {
        if (!n) return null;
        let a;
        if (m.balle.etat === 'MAINS_9' && estIntro) a = 'TIENT_LE_BALLON';
        else if (m.etat === ETATS_MELEE.INTRODUCTION && estIntro) a = 'INTRODUIT';
        else if ((m.etat === ETATS_MELEE.CONTESTATION || m.etat === ETATS_MELEE.SORTIE) && n.team === m.vainqueur) {
          a = m.etat === ETATS_MELEE.SORTIE ? 'ATTEND_A_LA_BASE' : 'LONGE_LE_PACK';
        } else a = 'TIENT_SA_LIGNE';
        return { equipe: n.team, x: +n.x.toFixed(3), y: +n.y.toFixed(3), action: a };
      };
      m.trace.push({ t: +m.timerGlobal.toFixed(2), etat: m.etat,
        balle: { x: +m.balle.x.toFixed(3), y: +m.balle.y.toFixed(3), h: +m.balle.h.toFixed(3), etat: m.balle.etat },
        neufIntro: action(intro, true), neufAdverse: action(adverse, false) });
    }

    // Placement progressif des deux packs (et repli des lignes arrières) :
    // écart large à la formation, qui se resserre jusqu'à l'engagement
    // ("Set"), puis quasi nul une fois les packs liés en contestation.
    _meleePlacerPaquets(dt) {
      const m = this.melee;
      const E = ETATS_MELEE;
      const ecart = m.etat === E.FORMATION ? 1.6
        : m.etat === E.CROUCH ? 1.1
          : m.etat === E.BIND ? 0.7
            : 0.35;
      // Chaque pack se place de son propre cote du point de melee, celui
      // oppose a son sens d'attaque (comme un vrai pack qui pousse vers la
      // ligne adverse) : ce cote depend de l'equipe elle-meme (sensAttaque,
      // fixe pour tout le match), jamais de l'equipe qui introduit. Avant ce
      // correctif le cote dependait de m.sens (= equipe d'introduction), donc
      // les deux packs echangeaient de cote a chaque melee selon qui
      // introduisait - flagrant juste apres l'engagement, quand les deux
      // equipes arrivent encore bien separees de chaque cote du terrain.
      const placer = (equipe) => {
        // sinBin <= 0 : un avant au "bin" ne rejoint pas le pack, son équipe
        // joue la mêlée à 7 (ou moins), comme en match réel.
        const avants = equipe.filter(j => j.numero <= 8 && j.sinBin <= 0);
        // VRAIE FORMATION 3-4-1 (loi 19) — chaque avant à SA place, par numéro :
        // 1re ligne : pilier gauche (1), talonneur (2) au centre, pilier droit (3) ;
        // 2e ligne : les deux verrous (4, 5) dans l'axe, flankers (6, 7) liés sur
        // les côtés ; le n°8 SEUL EN 3e LIGNE, dans l'axe, DERNIER élément de la
        // mêlée — c'est à ses pieds que le ballon sort. L'ancienne « rosette »
        // par index plaçait le 8 quasi au niveau de la 1re ligne et décalé de
        // 2,4 m sur le côté, comme s'il était dans la ligne des trois-quarts.
        const FORMATION_341 = {
          1: { prof: 0, lat: -1.0 }, 2: { prof: 0, lat: 0 }, 3: { prof: 0, lat: 1.0 },
          4: { prof: 1.0, lat: -0.5 }, 5: { prof: 1.0, lat: 0.5 },
          6: { prof: 1.0, lat: -1.6 }, 7: { prof: 1.0, lat: 1.6 },
          8: { prof: 2.0, lat: 0 },
        };
        avants.forEach((j) => {
          const f = FORMATION_341[j.numero] || { prof: 1.0, lat: 0 };
          const cx = m.x - j.sensAttaque * (ecart + f.prof);
          const cy = m.y + f.lat;
          avancer(j, cx - j.x, cy - j.y, dt, vitesseMs(j) * 0.7);
        });
        // Les DEUX demis de mêlée (n°9) sont positionnés à part par
        // _meleePositionnerBallon (sur le côté de la base), pas ramenés sur le
        // couloir des arrières : sinon le 9 serait tiré à 9 m en retrait puis
        // devrait être téléporté sur la base à la sortie du ballon.
        const backs = equipe.filter(j => j.numero > 9 && j.sinBin <= 0);
        // Ligne de hors-jeu des trois-quarts (loi 19.31) : 5 m DERRIÈRE le pied
        // le plus reculé de la mêlée (~1,5 m), soit ~6,5 m de la marque ; on
        // place la ligne à 7,5 m (1 m de marge). Les 3/4 ne sont PLUS alignés en
        // un mur plat : ils prennent leur VRAIE forme de mêlée.
        const sA = equipe[0].sensAttaque;
        const ligneHJ = m.x - sA * this.cfg.melee.reculTroisQuarts;
        const estAttaque = equipe[0].team === m.equipeIntroduction;
        // Côté OUVERT = celui qui a le plus de champ depuis la mêlée (vers le
        // large), côté FERMÉ = petit côté vers la touche la plus proche.
        const openSign = m.y < LARGEUR / 2 ? 1 : -1;
        const clampY = (y) => Math.max(2, Math.min(LARGEUR - 2, y));
        const idxLigne = (n) => (n === 10 ? 0 : n === 12 ? 1 : 2); // 10,12,13
        backs.forEach((j) => {
          let cx, cy;
          if (j.numero === 15) {
            // Arrière : couverture PROFONDE au centre (dernier rideau), pas dans
            // la ligne.
            cx = m.x - sA * this.cfgDefense[equipe[0].team].profondeurArriereMelee; cy = LARGEUR / 2;
          } else if (j.numero === 11 || j.numero === 14) {
            // Ailiers : l'ailier du côté OUVERT s'écarte au large ; l'autre
            // couvre le petit côté (côté fermé). En ATTAQUE, l'ailier ouvert est
            // LE PLUS PROFOND de l'escalier (~11 m derrière la ligne de
            // hors-jeu) : c'est lui qui reçoit lancé en bout de ligne et file
            // dans le couloir (la flèche longue du tableau tactique).
            const cotAile = (Math.sign(j.channelY - LARGEUR / 2) || 1);
            const estOuvert = cotAile === openSign;
            cx = (estAttaque && estOuvert) ? ligneHJ - sA * 11 : ligneHJ;
            cy = estOuvert ? LARGEUR / 2 + openSign * 22 : m.y - openSign * 7;
          } else {
            // 10, 12, 13 : la ligne des trois-quarts, ÉTAGÉE vers le côté ouvert.
            const idx = idxLigne(j.numero);
            cy = m.y + openSign * (7 + idx * 8);
            // Attaque : ESCALIER DIAGONAL MARQUÉ (tableau tactique classique) —
            // chaque back nettement plus profond que l'intérieur (~3,5 m par
            // cran, 10 ~1,5 m derrière la ligne de hors-jeu, 13 ~8,5 m) : le
            // ballon descend la ligne par passes enchaînées, chaque receveur
            // arrive lancé, jusqu'à la libération de l'ailier dans le couloir.
            // Défense : ligne À PLAT sur la ligne de hors-jeu, rideau régulier.
            cx = estAttaque ? ligneHJ - sA * (1.5 + idx * 3.5) : ligneHJ;
          }
          // Priorité au REPLI en profondeur : tant que le back est en avant de sa
          // ligne de hors-jeu (loi 19.31), il ferme d'abord la profondeur (on
          // réduit la composante latérale) — sinon une cible large lointaine (aile
          // au grand large) lui fait dépenser sa course en y et il reste
          // transitoirement hors-jeu. Une fois derrière la ligne, il s'écarte.
          const enAvantLigne = (j.x - ligneHJ) * sA > 0.3;
          const dyB = clampY(cy) - j.y;
          avancer(j, cx - j.x, enAvantLigne ? dyB * 0.3 : dyB, dt, vitesseMs(j) * 0.9);
        });
      };
      placer(this.equipeA);
      placer(this.equipeB);
    }

    // Ballon tenu par le demi de mêlée à l'entrée du tunnel pendant la mise
    // en place (formation/Crouch/Bind/Set), glissé dans la mêlée seulement
    // pendant l'état "introduction" : le ballon ne doit pas déjà être au
    // centre des avants avant que l'arbitre ait réellement annoncé son
    // entrée, sinon l'annonce "introduction" arrive après coup, sur un
    // ballon visuellement déjà en place.
    _meleePositionnerBallon(dt) {
      // P2-64 — les deux 9 et le ballon tenu.
      //  - Avant l'introduction, le 9 qui introduit tient le ballon face à
      //    l'ouverture du tunnel, à l'extérieur de la mêlée (cf. _meleeFeedPos).
      //  - Pendant le talonnage, le 9 du camp qui GAGNE le ballon longe
      //    l'extérieur de son pack vers l'arrière, en gardant un pied au niveau
      //    du ballon ou derrière lui ; il ne rentre vers la base qu'une fois
      //    derrière les flankers (il ne traverse pas les joueurs).
      //  - Le 9 de l'équipe qui n'introduit pas se tient du MÊME côté de la
      //    mêlée que celui qui introduit (loi 20), au niveau du tunnel, de son
      //    côté de la ligne médiane. Celui du camp qui perd le ballon reste à
      //    cette ligne : il ne suit pas le ballon jusqu'au 8 adverse.
      const m = this.melee;
      const E = ETATS_MELEE;
      const cote = m.cote;
      const { intro: neufI, adverse: neufD } = this._meleeNeufs();
      const b = m.balle;
      const issueConnue = m.vainqueur && (m.etat === E.CONTESTATION || m.etat === E.SORTIE);
      const cibleNeuf = (neuf, estIntro) => {
        const s9 = neuf.sensAttaque;
        if (issueConnue && neuf.team === m.vainqueur) {
          const profNeuf = (m.x - neuf.x) * s9; // profondeur derrière l'axe, de son côté
          const versBase = m.etat === E.SORTIE || profNeuf >= 1.9;
          if (versBase) {
            // Près de la base, à l'extérieur, prêt à ramasser.
            return { x: b.x - s9 * 0.35, y: b.y + cote * 0.85 };
          }
          // Le long du pack, à l'extérieur, au niveau du ballon ou derrière.
          return { x: b.x - s9 * 0.3, y: m.y + cote * 2.6 };
        }
        if (estIntro && !issueConnue) return this._meleeFeedPos(m);
        // Du même côté que le 9 qui introduit, au niveau du tunnel, de son côté
        // de la ligne médiane (1,1 m derrière elle, à côté du 9 qui introduit :
        // assez pour que les deux joueurs restent distincts à l'écran).
        return { x: m.x - s9 * 1.1, y: m.y + cote * 2.6 };
      };
      for (const [neuf, estIntro] of [[neufI, true], [neufD, false]]) {
        if (!neuf) continue;
        const c = cibleNeuf(neuf, estIntro);
        avancer(neuf, c.x - neuf.x, c.y - neuf.y, dt, vitesseMs(neuf));
      }
      // Ballon tenu par le 9 : il suit ses mains. Ballon rendu après une mêlée à
      // refaire : il revient vers lui à vitesse de passe, puis dans ses mains.
      if (b && b.etat === 'MAINS_9' && neufI) { b.x = neufI.x; b.y = neufI.y; b.h = 0; }
      else if (b && b.etat === 'RETOUR' && neufI) {
        const dx = neufI.x - b.x, dy = neufI.y - b.y, dd = Math.hypot(dx, dy), pas = 8 * dt;
        if (dd <= pas) { b.x = neufI.x; b.y = neufI.y; b.etat = 'MAINS_9'; this._meleeContact('BALLON_AU_9', neufI); }
        else { b.x += dx / dd * pas; b.y += dy / dd * pas; }
        b.h = 0;
      }
    }

    // Facteurs de contestation (loi 19) combinés en un différentiel unique :
    // force des piliers, puissance du pack, technique du talonneur, cohésion/
    // fatigue (bruit plus fort en fin de match), moral (lié au score), terrain,
    // et avantage structurel de l'introduction (le pack qui introduit gagne
    // l'immense majorité des mêlées en match réel). Positif = avantage à
    // l'équipe qui introduit.
    _meleeFacteurs() {
      const m = this.melee;
      const eqIntro = m.equipeIntroduction === 'A' ? this.equipeA : this.equipeB;
      const eqDef = m.equipeNonIntroduction === 'A' ? this.equipeA : this.equipeB;
      // sinBin <= 0 : une équipe qui joue la mêlée à 7 (pack incomplet, cf.
      // _meleePlacerPaquets) ne doit pas garder la force de poussée d'un
      // pack à 8 dans le calcul de la contestation.
      const avantsIntro = eqIntro.filter(j => j.numero <= 8 && j.sinBin <= 0);
      const avantsDef = eqDef.filter(j => j.numero <= 8 && j.sinBin <= 0);
      const puissanceIntro = avantsIntro.reduce((s, j) => s + forceMelee(j), 0);
      const puissanceDef = avantsDef.reduce((s, j) => s + forceMelee(j), 0);
      const piliersIntro = avantsIntro.filter(j => j.numero === 1 || j.numero === 3).reduce((s, j) => s + forceMelee(j), 0);
      const piliersDef = avantsDef.filter(j => j.numero === 1 || j.numero === 3).reduce((s, j) => s + forceMelee(j), 0);
      const talonneur = eqIntro.find(j => j.numero === 2 && j.sinBin <= 0);
      const meleeTalonneur = talonneur && typeof talonneur.melee === 'number' ? talonneur.melee : 60;
      const techniqueTalonneur = talonneur ? (talonneur.plaquage - 60) * 0.2 + (meleeTalonneur - 60) * 0.5 : 0;
      const fatigue = (this.dureeMatch === Infinity || this.dureeMatch <= 0) ? 0 : Math.min(1, this.tempsMatch / this.dureeMatch);
      const moral = Math.max(-4, Math.min(4, (this.score[m.equipeIntroduction] - this.score[m.equipeNonIntroduction]) / 5));
      const avantageIntroduction = 18;
      // Consigne de poussée de CHAQUE camp (P1-51) : c'est le premier levier
      // du manager sur la contestation elle-même. Le neutre vaut 0 des deux
      // côtés, donc le comportement historique est strictement inchangé tant
      // que rien n'est réglé.
      const pousseeIntro = effetPousseeMelee(this.cfgMelee[m.equipeIntroduction].poussee).bonusDiff;
      const pousseeDef = effetPousseeMelee(this.cfgMelee[m.equipeNonIntroduction].poussee).bonusDiff;
      return (puissanceIntro - puissanceDef) + (piliersIntro - piliersDef) * 0.5
        + techniqueTalonneur + moral + avantageIntroduction
        + (pousseeIntro - pousseeDef)
        + m.conditions * 40 + (this.rng() - 0.5) * (10 + fatigue * 10);
    }

    // Pendant la contestation : la poussée fait dériver le point de mêlée
    // (gain/perte de terrain) et accumule une rotation (mêlée qui tourne),
    // jamais de façon déterministe — un déséquilibre net augmente juste la
    // probabilité, sans jamais la garantir.
    _meleeAvancerPoussee(dt) {
      const m = this.melee;
      const vitessePoussee = Math.max(-0.5, Math.min(0.7, m.diff / 80));
      m.x = Math.max(0, Math.min(LONGUEUR, m.x + vitessePoussee * m.sens * dt));
      m.rotation += (-m.diff / 20 + (this.rng() - 0.5) * 12) * dt;
    }

    // Détection des fautes probables de mêlée, gravité et camp fautif selon
    // l'état courant — mêmes ordres de grandeur que le maul (la plupart des
    // mêlées ne sont pas sanctionnées, sinon l'équilibre du match casse).
    _meleeDetecterFautes(dt) {
      const m = this.melee;
      const E = ETATS_MELEE;
      const r = this.rng();
      let seuil = 0;
      if (m.etat === E.CROUCH || m.etat === E.BIND || m.etat === E.SET) {
        seuil += 0.006 * dt;
        if (r < seuil) {
          const eqF = this.rng() < 0.5 ? m.equipeIntroduction : m.equipeNonIntroduction;
          return { type: 'POUSSEE_AVANT', equipeFautive: eqF, gravite: 'COUP_FRANC', message: "poussee avant l'introduction du ballon", delibere: false };
        }
        seuil += 0.004 * dt;
        if (r < seuil) {
          const eqF = this.rng() < 0.5 ? m.equipeIntroduction : m.equipeNonIntroduction;
          return { type: 'LIAISON', equipeFautive: eqF, gravite: 'COUP_FRANC', message: 'liaison incorrecte en premiere ligne', delibere: false };
        }
      }
      // (Introduction non droite : jugée une fois, au lâcher — cf. _meleeIntroduire.)
      if (m.etat === E.SET || m.etat === E.CONTESTATION || m.etat === E.SORTIE) {
        const distLigneDef = m.sens > 0 ? (LONGUEUR - m.x) : m.x;
        // Le camp en difficulté (qui recule dans le duel de poussée) est le
        // plus exposé à l'écroulement volontaire et au pilier en travers.
        const campEnDifficulte = m.diff >= 0 ? m.equipeNonIntroduction : m.equipeIntroduction;
        // La discipline moyenne du camp en difficulté module ces deux fautes
        // (écroulement/pilier en travers) : un pack indiscipliné y cède
        // nettement plus souvent qu'un pack rigoureux.
        const facteurDiscEcroulement = facteurDiscipline(campEnDifficulte === 'A' ? this.equipeA : this.equipeB);
        // Le COÛT de la consigne (P1-51) : un pack qui pousse à fond
        // s'écroule et se met en travers plus souvent. C'est ce qui fait de
        // « dominer » un arbitrage et non une option gratuite.
        const facteurPoussee = effetPousseeMelee(this.cfgMelee[campEnDifficulte].poussee).facteurFaute;
        seuil += (distLigneDef < 5 ? 0.05 * dt : 0.008 * dt) * facteurDiscEcroulement * facteurPoussee;
        if (r < seuil) {
          return { type: 'ECROULEMENT', equipeFautive: campEnDifficulte, gravite: 'PENALITE', message: 'ecroulement volontaire de la melee', delibere: true };
        }
        seuil += 0.0025 * dt * facteurDiscEcroulement * facteurPoussee;
        if (r < seuil) {
          return { type: 'PILIER_TRAVERS', equipeFautive: campEnDifficulte, gravite: 'PENALITE', message: 'pilier qui pousse en travers (boring in)', delibere: false };
        }
        seuil += 0.0025 * dt;
        if (r < seuil) {
          const eqF = this.rng() < 0.5 ? m.equipeIntroduction : m.equipeNonIntroduction;
          return { type: 'RELEVE', equipeFautive: eqF, gravite: 'COUP_FRANC', message: 'joueur de premiere ligne qui se releve', delibere: false };
        }
        seuil += 0.002 * dt;
        if (r < seuil) {
          return { type: 'BALLON_BLOQUE', equipeFautive: m.equipeIntroduction, gravite: 'RESET', message: 'ballon bloque, ne ressort pas du pied du numero 8', delibere: false };
        }
      }
      // Hors-jeu des lignes arrières (loi 19.31) : les trois-quarts défenseurs
      // (n°10-15) doivent rester 5 m DERRIÈRE le pied le plus reculé de la
      // mêlée, de LEUR côté, jusqu'à la sortie du ballon. La mêlée étant
      // profonde d'environ 1,5 m depuis la marque (m.x), la ligne réglementaire
      // est à ~6,5 m de la marque (5 m + 1,5 m), et non 5 m du centre comme
      // auparavant : on mesurait alors le hors-jeu depuis la marque, pas depuis
      // le dernier pied, ce qui laissait un défenseur s'avancer ~1,5 m trop
      // près. On ne contrôle qu'à partir de l'introduction (pas pendant SET)
      // pour laisser aux arrières le temps de rejoindre leur ligne.
      if (m.etat === E.INTRODUCTION || m.etat === E.CONTESTATION || m.etat === E.SORTIE) {
        const def = m.equipeNonIntroduction === 'A' ? this.equipeA : this.equipeB;
        const margeBacks = 6.5, delaiGrace = 2.5;
        for (const j of def) {
          // Avants (dans la mêlée) ET demi de mêlée exclus : le demi défenseur
          // a sa propre ligne (rester derrière le ballon, de son côté), pas la
          // ligne des 5 m qui ne vaut que pour les autres trois-quarts.
          if (j.numero <= 9) continue;
          // L'équipe défenseure se tient du côté +m.sens de la mêlée (m.sens =
          // sens d'attaque de l'équipe qui introduit). Sa ligne de hors-jeu est
          // donc ~6,5 m derrière la marque DANS CE SENS. Un défenseur est
          // hors-jeu s'il est à moins de 6,5 m (5 m + profondeur de mêlée)
          // derrière le point de mêlée de son côté.
          // (Avant correctif : la limite était calculée du mauvais côté, si
          // bien que les arrières défenseurs — désormais correctement placés de
          // leur côté — étaient sifflés hors-jeu sur 100 % des mêlées, qui ne
          // ressortaient donc jamais proprement.)
          const reculBack = (j.x - m.x) * m.sens;
          if (reculBack < margeBacks && m.timerGlobal > delaiGrace) {
            return { type: 'HORS_JEU_BACKS', equipeFautive: m.equipeNonIntroduction, gravite: 'PENALITE', message: 'hors-jeu des lignes arrieres a la melee', delibere: false };
          }
        }
      }
      return null;
    }

    // Reformation sans faute (mêlée tournée, ballon bloqué) : même équipe
    // réintroduit, sans changement de possession ni sanction. Bornée pour
    // éviter une boucle en cas de série de reformations improbable.
    _meleeReset() {
      const m = this.melee;
      m.resets = (m.resets || 0) + 1;
      m.rotation = 0;
      m.timer = 0;
      // Reformation RAPIDE : les deux packs sont déjà sur la marque, l'arbitre
      // les fait directement re-engager (« Crouch ») — on ne re-déroule pas la
      // longue mise en place initiale (formation ~14 s : marche d'approche,
      // liaisons), ce qui faisait traîner les mêlées à refaire au-delà du
      // raisonnable. Au 3e reset, engagement direct (« Set »), comme un arbitre
      // pressé d'en finir.
      m.etat = m.resets > 2 ? ETATS_MELEE.SET : ETATS_MELEE.CROUCH;
      // Le ballon est rendu au 9 qui introduit (P2-64) : il lui revient en
      // roulant/passant (cf. _meleePositionnerBallon, état RETOUR), jamais
      // téléporté dans ses mains.
      m.vainqueur = null; m.qualite = null; m.ach = null; m.pickAndGo = false; m.passeHuit = false;
      if (m.balle && m.balle.etat !== 'MAINS_9') m.balle.etat = 'RETOUR';
    }

    // Décision d'arbitrage sur une faute de mêlée : reformation simple, coup
    // franc, pénalité (avec essai de pénalité/carton si délibérée, proche de
    // la ligne ou répétée), même logique que _maulSanctionner.
    _meleeSanctionner(faute) {
      const m = this.melee;
      if (faute.gravite === 'RESET') {
        this.log('MELEE_RESET', m.equipeIntroduction, `Melee a refaire : ${faute.message}`);
        return this._meleeReset();
      }
      const fautive = faute.equipeFautive;
      const benef = fautive === 'A' ? 'B' : 'A';
      const pos = { x: m.x, y: m.y };
      // Statistique « mêlées gagnées sur introduction » (P2-63) : comme dans les
      // relevés réels, une pénalité, un coup franc ou un essai de pénalité
      // obtenu par l'équipe qui introduit est une mêlée gagnée. Une mêlée sur
      // trois finit sur un coup de sifflet : sans cette règle, la statistique
      // tombait à 59 % au lieu de ~90 %.
      if (benef === m.equipeIntroduction) this.stats[benef].scrumsGagnesIntro++;
      this._meleePenalitesMatch[fautive] = (this._meleePenalitesMatch[fautive] || 0) + 1;
      const repetee = this._meleePenalitesMatch[fautive] >= 3;
      const sensBenef = benef === 'A' ? 1 : -1;
      const distLigne = sensBenef > 0 ? (LONGUEUR - pos.x) : pos.x;
      const presDeLigne = distLigne <= 5;
      const empecheEssai = faute.delibere && faute.type === 'ECROULEMENT' && presDeLigne;
      this._finMelee();

      if (faute.delibere && (presDeLigne || repetee)) {
        const eqFautive = fautive === 'A' ? this.equipeA : this.equipeB;
        const { joueur: fautif } = joueurLePlusProche(eqFautive, pos.x, pos.y);
        fautif.sinBin = 600 * this._echelleArret;
        this.stats[fautive].cartonsJaunes++;
        this._statJoueur(fautif).cartonsJaunes++;
        this.log('CARTON_JAUNE', fautive, `Carton jaune pour l'equipe ${fautive} (n°${fautif.numero}) : ${faute.message} - a 14 pendant ${Math.round(fautif.sinBin)}s`);
      }
      if (empecheEssai) {
        this.score[benef] += 7;
        this.stats[benef].essais++;
        this.stats[benef].essaisPenalite++;
        this.log('ESSAI_PENALITE', benef, `Essai de penalite : ${faute.message} en melee, equipe ${benef} +7`);
        this._nouvelleManche(benef);
        return;
      }
      const evt = faute.type === 'ECROULEMENT' ? 'MELEE_PEN_ECROULEMENT'
        : faute.type === 'PILIER_TRAVERS' ? 'MELEE_PEN_TRAVERS'
          : faute.type === 'HORS_JEU_BACKS' ? 'MELEE_PEN_HORSJEU'
            : 'MELEE_PEN_TECHNIQUE';
      // Le ballon de pénalité/coup franc de mêlée est joué par le demi de mêlée,
      // déjà présent à la base (cf. _meleePositionnerBallon), et non par un avant
      // "le plus proche" téléporté sur la marque (~5-6 m de saut visible). Repli
      // sur le joueur disponible le plus proche si le 9 est indisponible.
      const eqB = benef === 'A' ? this.equipeA : this.equipeB;
      const neufB = eqB.find(j => j.numero === 9 && j.sinBin <= 0)
        || joueurLePlusProche(eqB.filter(j => j.sinBin <= 0), pos.x, pos.y).joueur;
      this.possession = benef;
      this.porteur = neufB;
      if (faute.gravite === 'COUP_FRANC') {
        this.log(evt, fautive, `Coup franc melee : ${faute.message} (equipe ${fautive}), coup franc pour l'equipe ${benef}`);
        this._traiterCoupFranc(benef, pos, neufB);
        return;
      }
      this.log(evt, fautive, `Penalite melee : ${faute.message} (equipe ${fautive}), penalite pour l'equipe ${benef}`);
      this._traiterPenalite(benef, pos);
    }

    // Résolution de la contestation : détermine qui ressort avec le ballon et
    // dans quelles conditions (propre, sous pression, poussée dominante, ou
    // volé contre l'introduction — rare mais possible), à partir du
    // différentiel de force calculé à l'entrée en contestation.
    _meleeResoudreContestation() {
      const m = this.melee;
      const intro = m.equipeIntroduction, nonIntro = m.equipeNonIntroduction;
      // Consigne de poussée (P1-51) : le camp qui pousse à fond CONTRE
      // l'introduction contre davantage ; celui qui cherche à sortir vite se
      // protège. Terme séparé du différentiel, qui est déjà saturé (cf.
      // EFFETS_POUSSEE_MELEE).
      const volDef = effetPousseeMelee(this.cfgMelee[nonIntro].poussee).bonusVol;
      const volIntro = effetPousseeMelee(this.cfgMelee[intro].poussee).bonusVol;
      const probaVol = Math.max(0.02, Math.min(0.35,
        0.05 - m.diff / 300 + volDef - volIntro));
      if (this.rng() < probaVol) {
        m.vainqueur = nonIntro; m.qualite = 'VOLE';
      } else if (m.diff > (this.cfg.melee.seuilsQualite || {}).dominant) {
        m.vainqueur = intro; m.qualite = 'DOMINANT';
      } else if (m.diff > (this.cfg.melee.seuilsQualite || {}).pression) {
        m.vainqueur = intro; m.qualite = 'PROPRE';
      } else {
        m.vainqueur = intro; m.qualite = 'PRESSION';
      }
      // P2-64 : l'issue est DÉCIDÉE ici, au contact du ballon avec le sol, mais
      // elle n'est annoncée (et comptée) que lorsque le ballon arrive
      // réellement aux pieds du 8 (cf. _meleeArriveeBase). Entre les deux, le
      // ballon roule sous le pack : plus vite après une poussée dominante, plus
      // lentement sous pression, avec une légère déviation latérale.
      const eqV = m.vainqueur === 'A' ? this.equipeA : this.equipeB;
      const talonneur = (m.vainqueur === intro ? eqV : (intro === 'A' ? this.equipeA : this.equipeB)).find(j => j.numero === 2) || null;
      const d = this.cfg.melee.durees || {};
      const dMin = d.acheminementMin != null ? d.acheminementMin : 2.0;
      const dMax = Math.max(dMin, d.acheminementMax != null ? d.acheminementMax : 4.0);
      const plage = m.qualite === 'DOMINANT' ? [0, 0.35] : m.qualite === 'PROPRE' ? [0.25, 0.6]
        : m.qualite === 'PRESSION' ? [0.6, 1] : [0.45, 1];
      const f = plage[0] + (plage[1] - plage[0]) * this.rng();
      m.ach = { t: 0, duree: Math.max(0.2, dMin + (dMax - dMin) * f),
        sens: eqV[0].sensAttaque, deviation: (this.rng() - 0.5) * 0.6 };
      if (m.balle) m.balle.etat = 'TALONNE';
      this._meleeContact('TALONNAGE', talonneur, { vers: m.vainqueur });
      m.etat = ETATS_MELEE.CONTESTATION;
      m.timer = 0;
      this.log('MELEE_CONTESTATION', m.equipeIntroduction, 'Le talonneur ramene le ballon, les deux packs poussent');
    }

    // Sortie de balle : le demi de mêlée sort le ballon vers l'ouvreur dans la
    // grande majorité des cas (qui décide ensuite passe/jeu au large/coup de
    // pied via l'IA de jeu courant), ou le numéro 8 ramasse et part au près
    // (pick-and-go), plus probable après une poussée dominante.
    // Contexte du drop-goal pour l'équipe en possession : un match serré (écart
    // de 3 points ou moins, un drop suffit à égaliser ou à passer devant) dans
    // les 15 dernières minutes est LE moment du drop ; ailleurs, c'est un choix
    // rare (ballon qui ne progresse plus, tentative opportuniste).
    // Avant « lancé » que le 9 peut servir à la sortie d'un regroupement : parmi
    // les avants debout, à portée (8 m, 13 m dans les cinq derniers mètres où
    // le pack est massé autour du regroupement) et pas devant le ballon, le
    // premier dans l'ORDRE DE POD tiré à chaque ruck (cf. _tickRuck, P2-69).
    // Avant P2-69, `find` prenait le premier par numéro de maillot : le n°1
    // dès qu'il était à portée. NB : servir l'avant le PLUS PROCHE (P2-67)
    // donnait la même variété mais +4,1 ± 1,9 points par match (100 graines
    // appariées). Sert à la fois à la COURSE (cf. _tickPorte) et à la PASSE
    // (cf. choisirActionPorteur) : l'avant qu'on voit arriver est celui servi.
    _designerAvantLance(porteur, att) {
      const sens = porteur.sensAttaque;
      const rayon = this._zoneTerrain(porteur) === 'CINQ_M' ? 13 : 8;
      const ordrePod = (j) => (this._ordrePod && this._ordrePod.has(j) ? this._ordrePod.get(j) : 0);
      return att.filter(j => j !== porteur && j.numero <= 8 && j.auSol === 0
        && distance(j, porteur) < rayon
        && (j.x - porteur.x) * sens <= 0.3 && (j.x - porteur.x) * sens > -5)
        .sort((p, q) => ordrePod(q) - ordrePod(p) || p.numero - q.numero)[0] || null;
    }

    // Probabilité qu'un lancer en touche soit jugé pas droit (loi 18), selon la
    // compétence en touche du lanceur : ~3,5 % pour un talonneur moyen (touche
    // 55), ~1 % pour un excellent lanceur, jusqu'à 8 % pour un mauvais.
    _probaLancerPasDroit(lanceur) {
      const touche = typeof lanceur.touche === 'number' ? lanceur.touche : 55;
      return Math.max(0.01, Math.min(0.08, 0.035 * (1 + (55 - touche) / 50)));
    }

    // Probabilité qu'un trois-quarts défensif parte trop tôt en touche, selon
    // sa discipline : ~3 % pour un joueur moyen, de 1 à 8 %.
    _probaHorsJeuTouche(joueur) {
      const discipline = typeof joueur.discipline === 'number' ? joueur.discipline : 55;
      return Math.max(0.01, Math.min(0.08, 0.03 * (1 + (60 - discipline) / 40)));
    }

    // Tir au but (pénalité, transformation) : le ballon ne saute pas dans les
    // mains du buteur. On note où il est AFFICHÉ juste avant que le buteur ne
    // devienne porteur, et il le rejoint ensuite à vue (cf. tick, P2-85) —
    // avant, il sautait de ~10 m (jusqu'à 22 m) du ruck ou du marqueur.
    _debutRemiseBallon() {
      this._remiseBallon = this._positionBallonAffichee();
    }

    _positionBallonAffichee() {
      let p = null;
      // Ce que le joueur voyait à l'image précédente : en pleine transition
      // (mêlée ou touche déjà soldée), recalculer l'affichage donnerait le
      // porteur ou le lanceur, pas le ballon vu à l'écran (P2-89).
      const vu = this._ballonAffiche;
      if (vu && vu.n === (this._numTick || 0) - 1) p = { x: vu.x, y: vu.y };
      else if (this.ballonEnVol && this.ballonVolX != null) p = { x: this.ballonVolX, y: this.ballonVolY };
      else { try { const b = this.getState().ballon; p = { x: b.x, y: b.y }; } catch (e) { p = null; } }
      return p;
    }

    _facteurContexteDrop(equipe) {
      const adv = equipe === 'A' ? 'B' : 'A';
      const ecart = Math.abs(this.score[equipe] - this.score[adv]);
      const serre = ecart <= 3;
      const fin = isFinite(this.dureeMatch) && this.dureeMatch > 0
        && this.tempsMatch >= this.dureeMatch - 15 * 60 * (this.dureeMatch / 4800);
      // Un écart de 3 points ou moins EN DÉBUT de match n'est pas un match
      // serré, c'est un match qui commence (0-0) : mesuré avec un facteur
      // intermédiaire 0,5, la majorité des drops partaient avant la 12e minute.
      return serre && fin ? 4 : 0.15;
    }

    _meleeSortieBallon(joueur, passeDuHuit) {
      const m = this.melee;
      const poss = m.vainqueur;
      const eq = poss === 'A' ? this.equipeA : this.equipeB;
      const huit = eq.find(j => j.numero === 8);
      const neuf = eq.find(j => j.numero === 9 && j.sinBin <= 0);
      const porteur = joueur || neuf || huit || eq[7];
      // Passe du 8 : vers le 10 s'il est à hauteur ou derrière lui (jamais en
      // avant) et à portée, sinon vers le 9 ; faute de receveur, il part.
      let cible = null;
      if (passeDuHuit && porteur.numero === 8) {
        const s = porteur.sensAttaque;
        const ok = j => j && j.sinBin <= 0 && j.auSol === 0
          && (j.x - porteur.x) * s <= 0 && Math.hypot(j.x - porteur.x, j.y - porteur.y) <= 20;
        const dix = eq.find(j => j.numero === 10);
        cible = ok(dix) ? dix : (ok(neuf) ? neuf : null);
      }
      const pickAndGo = porteur.numero === 8 && !cible;
      const pt = { x: m.x, y: m.y };
      m.balle.etat = 'RAMASSE';
      this._meleeContact('RAMASSAGE', porteur);
      this._meleeTracer();
      this._finMelee();
      this.possession = poss;
      this.porteur = porteur;
      if (pickAndGo) {
        // Le n°8 ramasse au pied de la mêlée et part lui-même ; le 9, déjà près
        // de la base, vient en soutien.
        this.log('MELEE_PICK_AND_GO', poss, `Le numero 8 ramasse au pied de la melee et part au contact pour l'equipe ${poss}`);
      } else if (cible) {
        // Le 8 ramasse et sert directement un trois-quarts (ou son 9).
        this.stats[poss].passesTentees++;
        this.stats[poss].passes++;
        this._statJoueur(porteur).passes++;
        this._lancerPasseVisuelle(porteur, cible);
        this.porteur = cible;
        this.log('MELEE_PASSE_HUIT', poss, `Le n°8 ramasse a la base et passe au n°${cible.numero} pour l'equipe ${poss}`);
      } else {
        // P2-64 : c'est le 9 qui PREND le ballon disponible aux pieds du 8 — il
        // est à la base, à moins d'un mètre du ballon. Le 8 ne le lui passe pas.
        this.log('MELEE_BALLON_SORTI', poss, `Le n°9 ramasse le ballon a la base de la melee pour l'equipe ${poss}`);
      }
      // Sortie propre par le 9 : on peut enchaîner une COMBINAISON scriptée
      // (playbook, cf. cfg.combinaisons.melee) — ex. 9->10->12 croisé. Sinon jeu
      // libre normal. (Pas de combinaison sur un pick-and-go du n°8 : il part au
      // contact.)
      if (!pickAndGo && !cible) this._lancerCombinaison('melee');
      // Sortie de mêlée par le 9 SANS combinaison scriptée : il est libre et
      // décide lui-même (cf. choisirActionPorteur, branche _neufLibre).
      if (!pickAndGo && !this.combinaison && this.porteur && this.porteur.numero === 9) this._neufLibre = true;
      this._imposerRecuperationRuck(pt);
      this.phase = 'PORTE';
      this.timerPhase = 0;
    }

    // --- Combinaisons scriptées (playbook, cf. cfg.combinaisons) --------------
    // Tire une combinaison pondérée pour le type donné ('melee' | 'touche'),
    // ou null (jeu libre) selon la probabilité configurée.
    _choisirCombinaison(type) {
      const cc = this.cfg.combinaisons;
      if (!cc || this.rng() >= (cc.proba || 0)) return null;
      // Playbook SPÉCIFIQUE à l'équipe en possession (cc.A / cc.B) s'il existe,
      // sinon la liste partagée (cc.melee / cc.touche) : chaque équipe peut avoir
      // son propre répertoire de combinaisons.
      const specifique = cc[this.possession] && cc[this.possession][type];
      let liste = (specifique && specifique.length) ? specifique : cc[type];
      if (!liste || !liste.length) return null;
      // Filtre par ZONE de terrain si la combinaison en impose une (une chandelle
      // ou un cross-kick ne se joue que dans les 22 m adverses, etc.).
      const zone = this.porteur ? this._zoneTerrain(this.porteur) : null;
      liste = liste.filter((c) => !c.zone || (zone && c.zone.indexOf(zone) >= 0));
      if (!liste.length) return null;
      const total = liste.reduce((s, c) => s + (c.poids || 1), 0);
      let r = this.rng() * total;
      for (const c of liste) { r -= (c.poids || 1); if (r <= 0) return c; }
      return liste[liste.length - 1];
    }

    // Arme une combinaison : le porteur courant doit être le "de" de la 1re étape
    // (le 9 qui vient de récupérer). Rien ne se passe si aucune combinaison n'est
    // tirée (jeu libre).
    _lancerCombinaison(type) {
      const combo = this._choisirCombinaison(type);
      if (!combo || !combo.etapes || !combo.etapes.length) return;
      this.combinaison = { etapes: combo.etapes, i: 0, timer: 0, delai: 0.55 };
    }

    // Déroule pas à pas la combinaison en cours (passes ciblées + lignes de
    // course). Renvoie true si une passe a été jouée CE tick (le tick de jeu
    // courant s'arrête là). Une passe qui serait en avant, ou vers un joueur
    // indisponible, ou un porteur qui n'est plus le "de" attendu (plaquage,
    // interruption), stoppe la combinaison et rend la main au jeu libre.
    _tickCombinaison(dt) {
      const c = this.combinaison;
      if (!c) return false;
      const etape = c.etapes[c.i];
      if (!this.porteur || this.porteur.numero !== etape.de || this.porteur.team !== this.possession) {
        this.combinaison = null; return false;
      }
      c.timer += dt;
      if (c.timer < c.delai) return false; // le porteur court en attendant l'action
      c.timer = 0;

      // Action COUP DE PIED programmé (ex. cross-kick / chandelle sur combinaison
      // de zone) : le joueur "de" botte, ce qui termine la combinaison.
      if (etape.action === 'pied') {
        const TYPES = ['DEGAGEMENT', 'OCCUPATION', 'TOUCHE', 'CHANDELLE', 'CHIP'];
        const type = TYPES.indexOf((etape.type || '').toUpperCase()) >= 0 ? etape.type.toUpperCase() : 'CHANDELLE';
        this.log('COMBINAISON', this.possession, `Combinaison : coup de pied (${type.toLowerCase()}) du n°${etape.de}`);
        this.combinaison = null;
        this._tenterCoupDePiedJeu(this.porteur, type);
        return true;
      }

      // Action PASSE (défaut).
      const eq = this.possession === 'A' ? this.equipeA : this.equipeB;
      const cible = eq.find(j => j.numero === etape.vers && j.sinBin <= 0 && j.auSol === 0);
      if (!cible || Referee.passeEnAvant(this.porteur.sensAttaque, this.porteur, cible)) {
        this.combinaison = null; return false; // option scriptée impossible -> jeu libre
      }
      const passeur = this.porteur;
      this.stats[this.possession].passesTentees++;
      this.stats[this.possession].passes++;
      this._statJoueur(passeur).passes++;
      this._lancerPasseVisuelle(passeur, cible);
      this.porteur = cible;
      this._receptionDirecte = false;
      this.log('COMBINAISON', this.possession, `Combinaison : passe du n°${etape.de} au n°${etape.vers}${etape.ligne ? ' (' + etape.ligne + ')' : ''}`);
      // Ligne de course du RECEVEUR (croisé ou boucle) : dans les deux cas il
      // CHANGE de direction un court instant.
      if (etape.ligne === 'croise' || etape.ligne === 'boucle') {
        // croisé : le receveur repique vers le côté du passeur (derrière lui) ;
        // boucle : il part à l'extérieur (le passeur boucle dans son dos).
        const versPasseur = Math.sign(passeur.y - cible.y) || 1;
        cible._croiseTimer = 1.2 * this._echelleArret + 0.6;
        cible._croiseDir = etape.ligne === 'croise' ? versPasseur : -versPasseur;
      }
      c.i++;
      if (c.i >= c.etapes.length) this.combinaison = null; // combinaison terminée
      return true;
    }

    // Touche (loi 18) : véritable contest au saut, pondéré par la force des
    // avants engagés (même proxy que ruck/maul/mêlée) — le lanceur ne conserve
    // pas systématiquement son propre lancer. Une touche gagnée dans les 22 m
    // adverses est la voie PRINCIPALE de formation d'un maul (catch-and-drive),
    // pas une mêlée aléatoire en plein champ.
    // Alignement progressif des deux lignes de touche pendant l'attente (loi 18) :
    // les avants des deux équipes convergent en courant vers le couloir
    // perpendiculaire à la ligne de touche, espacés le long de la touche (axe y),
    // de part et d'autre d'un mince couloir central où passe le ballon. Le demi
    // de mêlée de chaque équipe se tient en retrait, prêt à jouer un ballon
    // gagné — c'est lui qui récupère un lancer volé (cf. _tickTouche), donc il
    // doit avoir réellement rejoint cette position en courant, jamais y être
    // téléporté à la résolution.
    _touchePlacerLignes(dt) {
      const pt = this.ruckPoint;
      // yTouche = bord du terrain où se tient le lanceur (loi 18.22). La ligne
      // des sauteurs commence elle à 5 m de la touche (loi 18 : l'alignement est
      // entre la ligne des 5 m et celle des 15 m), d'où un vrai couloir entre le
      // lanceur et le premier sauteur, au lieu d'un lanceur noyé dans la ligne.
      const yTouche = this.toucheLanceurY != null ? this.toucheLanceurY : pt.y;
      const versCentre = yTouche <= LARGEUR / 2 ? 1 : -1;
      const yLigne5 = yTouche + versCentre * 5;
      // Le lanceur rejoint la marque de touche (sur le bord) en courant, comme
      // les avants ci-dessous — avant ce correctif, il y était téléporté
      // directement dès l'octroi de la touche (cf. _accorderTouche), ce qui
      // pouvait le faire apparaître instantanément à 30-50 m de sa position.
      if (this.porteur) {
        const xLanceur = this.toucheLanceurX != null ? this.toucheLanceurX : pt.x;
        avancer(this.porteur, xLanceur - this.porteur.x, yTouche - this.porteur.y, dt, vitesseMs(this.porteur) * 0.9);
      }
      const placer = (equipe, decalX) => {
        const sens = equipe[0].sensAttaque;
        // Sauteurs alignés perpendiculairement à la touche, de la ligne des 5 m
        // vers l'intérieur, espacés de 1,4 m (zone 5-15 m, loi 18.10). Avec
        // jusqu'à 7 avants dans l'alignement (n°1,3-8, le n°2 lance), un
        // espacement de 1,7 m poussait le dernier sauteur jusqu'à ~15,7-17,4 m,
        // donc AU-DELÀ de la ligne des 15 m (coup franc en jeu réel). À 1,4 m,
        // 7 sauteurs depuis 5 m s'étalent jusqu'à ~13,4 m, sous le plafond légal.
        // Les deux équipes forment deux colonnes séparées par le couloir d'un
        // mètre (decalX), conformément à la loi.
        const avants = equipe.filter(j => j.numero <= 8 && j.sinBin <= 0 && j !== this.porteur);
        avants.forEach((j, i) => {
          const cx = pt.x + decalX;
          const cy = yLigne5 + versCentre * (i * this.cfg.touche.espacementSauteurs);
          avancer(j, cx - j.x, cy - j.y, dt, vitesseMs(j) * 0.8);
        });
        // Position du n°9 selon que SON équipe lance ou non (le placement diffère
        // dans la loi) :
        //  - Équipe qui LANCE → RECEVEUR (loi 18.16) : nettement DERRIÈRE son
        //    propre alignement, ~4 m en retrait, à au moins 2 m de ses
        //    coéquipiers. Il NE capte PAS le lancer (c'est le sauteur) ; il reçoit
        //    le ballon redescendu par le sauteur dans un DEUXIÈME temps.
        //  - Équipe qui NE LANCE PAS → GARDIEN du couloir avant (loi 18.15) : un
        //    joueur ENTRE la ligne de touche et la ligne des 5 m, à ~2 m de la
        //    marque (côté de son camp) et ~2 m de la ligne des 5 m. Auparavant ce
        //    9 défenseur était lui aussi planté en receveur à 10 m, si bien que
        //    personne ne tenait le couloir des 5 m (loi 18.15 jamais respectée).
        const estLanceur = equipe[0].team === this.possession;
        const neuf = equipe.find(j => j.numero === 9 && j.auSol === 0 && j !== this.porteur);
        if (neuf) {
          let cx9, cy9;
          if (estLanceur) {
            cx9 = pt.x - sens * this.cfg.touche.reculReceveur;
            cy9 = yLigne5 + versCentre * 5;
          } else {
            cx9 = pt.x + Math.sign(decalX) * 2;
            cy9 = yTouche + versCentre * 3;
          }
          avancer(neuf, cx9 - neuf.x, cy9 - neuf.y, dt, vitesseMs(neuf) * 0.8);
        }
        // Loi 18 : les joueurs NON participants à la touche (les trois-quarts,
        // n°10-15) doivent se replacer DERRIÈRE leur ligne de hors-jeu, à 10 m
        // de la ligne de touche, et non rester là où le ballon est sorti. Avant
        // ce correctif ils n'étaient jamais repositionnés pendant la touche : ils
        // restaient figés n'importe où sur le terrain. Ils s'alignent désormais
        // en courant (avancer, jamais de téléportation) sur cette ligne des 10 m,
        // côté de leur propre camp (sens), espacés sur la largeur du côté ouvert,
        // prêts à lancer ou défendre l'attaque issue de la touche.
        const backs = equipe.filter(j => j.numero >= 10 && j.sinBin <= 0 && j !== this.porteur);
        const xBacks = pt.x - sens * this.cfg.touche.offsideNonParticipants;
        backs.forEach((j, k) => {
          const cyB = yLigne5 + versCentre * (8 + k * 6);
          // Le trois-quarts jugé hors-jeu (cf. _tickTouche) part TROP TÔT : il
          // monte vers l'alignement pendant le vol du ballon, à pleine vitesse.
          // Le buteur d'une pénalité en touche court d'abord à la marque.
          if (this.penTouche && this.penTouche.etape === 'APPROCHE' && this.penTouche.buteur === j) return;
          if (this.toucheLancer && this.toucheLancer.horsJeu === j) {
            const xRush = pt.x - sens * 2;
            avancer(j, xRush - j.x, cyB - j.y, dt, vitesseMs(j));
            return;
          }
          avancer(j, xBacks - j.x, cyB - j.y, dt, vitesseMs(j) * 0.85);
        });
      };
      placer(this.equipeA, -0.5);
      placer(this.equipeB, 0.5);
    }

    _tickTouche(dt) {
      this.timerPhase += dt;
      if (this.toucheRapide) {
        // Les autres se placent pour une touche ordonnée ; le lanceur, lui,
        // court au ballon (une seule course par tick).
        const L = this.toucheRapide.lanceur, sx = L.x, sy = L.y, sv = L.vitesseCourante;
        this._touchePlacerLignes(dt);
        L.x = sx; L.y = sy; L.vitesseCourante = sv;
        if (this._tickToucheRapide(dt)) return;
        if (this.toucheRapide) return;
      }
      // Pénalité tapée en touche : le coup de pied se joue d'abord, à vue, pendant
      // que les joueurs se placent (cf. _tickPenaliteTouche).
      if (this.penTouche) {
        this._tickPenaliteTouche(dt);
        this._touchePlacerLignes(dt);
        return;
      }
      // Si le ballon est en train de voler du lanceur vers le sauteur, on
      // anime ce vol jusqu'à la réception (cf. _tickToucheLancer) plutôt que
      // de résoudre la touche dans le même tick.
      if (this.toucheLancer) return this._tickToucheLancer(dt);
      this._touchePlacerLignes(dt);
      // Alignement, lancer et contestation au saut pris dans leur ensemble :
      // une touche réelle prend ~25-35 s entre la sortie du ballon et la remise
      // en jeu (les joueurs MARCHENT vers l'alignement, l'annonce est faite, le
      // talonneur prépare son lancer). Compressée comme les autres temps d'arrêt
      // sur un format démo court (cf. _echelleArret). C'est, avec la mêlée, ce
      // qui ramène le « ballon en jeu » vers les ~44 % réels.
      // Mesurée avant recalibrage, la touche durait 15,0 s : la constante (14 s)
      // contredisait le commentaire ci-dessus. Portée à 32 s, au milieu de la
      // fourchette réelle annoncée — c'est, avec la mêlée, ce qui ramène le
      // ballon en jeu de 59,9 min à une valeur réaliste sur 80 minutes.
      // 32 s mesurees -> touche complete a ~30 s, alors qu'une vraie touche
      // prend 40 a 60 s (les avants reviennent en marchant, l'alignement se
      // forme, le talonneur attend l'annonce). Portee a 49 s : la touche
      // complete dure alors ~47 s, au milieu de la fourchette reelle.
      // 30 s depuis P2-94 : les « 40 a 60 s » n'avaient pas de source. Une
      // touche réelle prend ~25 s de la sortie du ballon au lancer (tests de
      // juillet 2022, ~27 touches par match), et la loi limite la mise en place
      // à 30 s (cf. docs/ANALYSE_MATCH_REEL.md). Avec 49 s, le ballon en jeu
      // plafonnait à ~29,5 min pour ~34 min en réel.
      const dureeMin = 30 * this._echelleArret;
      if (this.timerPhase < dureeMin) return;
      // Comme à la mêlée (cf. _tickMelee, case FORMATION) : l'arbitre n'autorise
      // le lancer que lorsque les avants des deux équipes sont réellement
      // alignés dans le couloir de touche, pas seulement après un délai fixe ;
      // le plafond toucheCapFormation évite un blocage si un avant reste très
      // excentré (cf. _capFormationTouche).
      const pt = this.ruckPoint;
      const tousAvants = this.equipeA.concat(this.equipeB).filter(j => j.numero <= 8 && j.sinBin <= 0);
      // Lancer autorisé seulement quand chaque avant est À LA FOIS aligné en
      // profondeur (x proche de la marque) ET dans la bande légale des 5-15 m
      // depuis la touche (loi 18.10). Sans la contrainte sur y, un avant encore
      // en course vers l'alignement (mesuré jusqu'à ~16,7 m sur la largeur)
      // pouvait se retrouver AU-DELÀ de la ligne des 15 m à l'instant où le
      // ballon partait : le lancer attend désormais qu'il soit rentré dans la
      // zone légale.
      const yTouche = this.toucheLanceurY != null ? this.toucheLanceurY : pt.y;
      const versTouche = yTouche <= LARGEUR / 2 ? 1 : -1;
      const dansBande = (j) => { const d = (j.y - yTouche) * versTouche; return d >= 4 && d <= 15; };
      const enPlace = tousAvants.filter(j => Math.abs(j.x - pt.x) < 2 && dansBande(j)).length;
      // Le lanceur lui-même doit avoir rejoint la marque de touche (loi 18.22)
      // avant que le lancer ne puisse être joué : sinon il pourrait "lancer"
      // alors qu'il court toujours vers la touche.
      const xLanceur = this.toucheLanceurX != null ? this.toucheLanceurX : pt.x;
      const yLanceur = this.toucheLanceurY != null ? this.toucheLanceurY : pt.y;
      const lanceurEnPlace = !this.porteur || distance(this.porteur, { x: xLanceur, y: yLanceur }) < 2;
      const pret = (tousAvants.length === 0 || enPlace >= tousAvants.length) && lanceurEnPlace;
      if (!pret && this.timerPhase < (this.toucheCapFormation || dureeMin)) return;

      const lanceur = this.possession;
      const adversaire = lanceur === 'A' ? 'B' : 'A';
      const eqLanceur = lanceur === 'A' ? this.equipeA : this.equipeB;
      const eqAdverse = adversaire === 'A' ? this.equipeA : this.equipeB;

      this.stats[lanceur].lineouts++;
      let forceLanceur = 0, forceAdverse = 0;
      for (const j of eqLanceur) if (j.numero <= 8) forceLanceur += forceTouche(j);
      for (const j of eqAdverse) if (j.numero <= 8) forceAdverse += forceTouche(j);
      // Le sauteur VISÉ par l'équipe qui lance est tiré AVANT de savoir si la
      // touche est volée : c'est lui qui monte au ballon, sa qualité propre
      // doit donc peser sur l'issue — en plus de la force collective du pack,
      // qui reste. Sans ça, désigner un sauteur ne changeait rien (mesuré).
      // `this.cfgTouche[lanceur]`, PAS `this.cfg.touche` : le pool de sauteurs
      // se règle par équipe (config.toucheA/toucheB). L'ancien code lisait la
      // config PARTAGÉE, si bien que `toucheA.sauteurs` n'était jamais lu —
      // c'est la seconde raison pour laquelle désigner un sauteur ne changeait
      // rien du tout (mesuré : 0,0 point d'écart).
      const poolLanceur = (this.cfgTouche[lanceur] || this.cfg.touche).sauteurs;
      const poolLanceurSauteurs = eqLanceur.filter(j =>
        poolLanceur.indexOf(j.numero) >= 0 && j.sinBin <= 0 && j.auSol === 0 && j !== this.porteur);
      const poolLanceurAvants = eqLanceur.filter(j => j.numero <= 8 && j.sinBin <= 0 && j.auSol === 0 && j !== this.porteur);
      const sauteurVise = tirerSauteurPondere(
        (poolLanceurSauteurs.length ? poolLanceurSauteurs
          : (poolLanceurAvants.length ? poolLanceurAvants : eqLanceur)), this.rng);
      // `forceTouche` d'un avant vaut ~64 (touche 20) à ~94 (touche 95) :
      // divisé par 400, l'écart pèse ~7,5 points de probabilité sur une
      // échelle bornée 6-30 % — assez pour que le choix compte, jamais assez
      // pour écraser la domination collective du pack.
      const qualiteSauteur = sauteurVise ? forceTouche(sauteurVise) : 80;
      // Lisibilité de l'alignement (TODO_AUDIT.md P1-50b) : plus le pool de
      // sauteurs est restreint, plus la défense anticipe le lancer. Sans ce
      // terme, désigner un sauteur n'avait QUE des avantages — mesuré : avec
      // cinq sauteurs strictement équivalents (donc aucun gain de qualité),
      // n'en désigner qu'un faisait passer le taux de 95,1 % à 97,8 %. Un
      // choix sans contrepartie n'est pas un choix.
      //
      // Le coefficient (0,03 pour un alignement réduit à un seul homme) est
      // calibré pour rester INFÉRIEUR au gain de qualité d'un vrai
      // spécialiste (~0,038 quand il domine ses coéquipiers) : désigner un
      // sauteur nettement meilleur reste payant, désigner à qualité égale
      // coûte des ballons.
      const probaVolAdverse = probaVolTouche({
        forceLanceur, forceAdverse, qualiteSauteur,
        taillePool: poolLanceurSauteurs.length,
      });
      const vole = this.rng() < probaVolAdverse;
      // Lancer pas droit (loi 18) : décidé au lancer, sifflé à l'arrivée du
      // ballon (cf. _tickToucheLancer). Touche perdue sur son lancer, sans
      // turnover compté : c'est une mêlée, pas un ballon volé.
      const pasDroit = this.rng() < this._probaLancerPasDroit(this.porteur || {});
      // Hors-jeu en touche (loi 18) : un trois-quarts défensif part avant la fin
      // de la touche. Jugé une fois par lancer, selon sa discipline ; il SORT
      // visiblement de sa ligne des 10 m pendant le vol (cf. _touchePlacerLignes)
      // et l'arbitre siffle à la réception (cf. _tickToucheLancer).
      let horsJeu = null;
      if (!pasDroit && !vole) {
        const backsDef = eqAdverse.filter(j => j.numero >= 10 && j.sinBin <= 0 && j.auSol === 0);
        if (backsDef.length) {
          const cand = backsDef[Math.floor(this.rng() * backsDef.length)];
          if (this.rng() < this._probaHorsJeuTouche(cand)) {
            horsJeu = cand;
            // Déjà sur les appuis, il part AU LANCER : sans élan, il ne faisait
            // qu'un mètre pendant les 0,8 s de vol et la faute ne se voyait pas.
            horsJeu.vitesseCourante = vitesseMs(horsJeu);
          }
        }
      }
      const gagnant = vole ? adversaire : lanceur;
      if (!pasDroit) {
        this.stats[gagnant].lineoutsGagnes++;
        if (!vole) this.stats[lanceur].lineoutsGagnesLancer++;
        if (vole) { this.stats[adversaire].turnovers++; this.stats[lanceur].turnoversConcedes++; }
      }
      // Le sauteur n'est jamais "le plus proche d'un point" : en match réel le
      // lancer vise un appel tactique (plot avant/milieu/fond de ligne), donc
      // un sauteur choisi au hasard parmi les vrais sauteurs (2e/3e ligne,
      // n°4-8 - jamais la 1ere ligne qui lie/lève sans sauter). Tous les
      // candidats sont déjà alignés en courant (cf. _touchePlacerLignes).
      const eqGagnante = gagnant === 'A' ? this.equipeA : this.equipeB;
      const poolSauteurs = (this.cfgTouche[gagnant] || this.cfg.touche).sauteurs;
      const tirerSauteur = (equipe, exclu) => {
        const sauteurs = equipe.filter(j => poolSauteurs.indexOf(j.numero) >= 0 && j.sinBin <= 0 && j.auSol === 0 && j !== exclu);
        const avants = equipe.filter(j => j.numero <= 8 && j.sinBin <= 0 && j.auSol === 0 && j !== exclu);
        const pool = sauteurs.length ? sauteurs : (avants.length ? avants : equipe);
        return tirerSauteurPondere(pool, this.rng);
      };
      const sauteur = vole ? tirerSauteur(eqGagnante, null) : sauteurVise;
      if (!pasDroit && sauteur) {
        this._statJoueur(sauteur).touchesGagnees++;
        if (vole) this._statJoueur(sauteur).turnoversGagnes++;
      }
      // On NE résout PAS la touche tout de suite : le ballon doit voler du
      // lanceur (sur la ligne de touche) jusqu'au sauteur, à vue, avant d'être
      // capté. Sans ça le ballon "sautait" instantanément de la touche jusque
      // dans l'alignement — la "magie" signalée. Le vol et la réception sont
      // gérés par _tickToucheLancer ; l'issue (volé/gagné, sauteur) est déjà
      // décidée ici mais ne s'applique qu'à la réception.
      const fromX = this.porteur ? this.porteur.x : xLanceur;
      const fromY = this.porteur ? this.porteur.y : yLanceur;
      // Un lancer pas droit part VISIBLEMENT de travers : il dévie de ~2 m le
      // long de l'alignement au lieu d'arriver dans les mains du sauteur.
      const decal = pasDroit ? (this.rng() < 0.5 ? -1 : 1) * (1.5 + this.rng()) : 0;
      this.toucheLancer = { sauteur, gagnant, vole, lanceur, eqAdverse, fromX, fromY, timer: 0, duree: 0.8,
        pasDroit, decal, horsJeu, lanceurNumero: this.porteur ? this.porteur.numero : null };
      this.ballonEnVol = true;
      this.ballonVolX = fromX;
      this.ballonVolY = fromY;
      this.ballonVolHauteur = 0;
      this.log('TOUCHE_LANCER', lanceur, `Lancer en touche de l'equipe ${lanceur}`);
    }

    // Vol du ballon lors d'un lancer en touche : trajectoire en cloche du
    // lanceur (ligne de touche) vers le sauteur, puis réception. Reprend le
    // mécanisme de vol des coups de pied (ballonEnVol) pour que la remise en
    // jeu soit réellement visible, jamais une téléportation du ballon.
    _tickToucheLancer(dt) {
      const L = this.toucheLancer;
      L.timer += dt;
      this._touchePlacerLignes(dt);
      const t = Math.min(1, L.timer / L.duree);
      // La cible suit le sauteur (toujours positionné par _touchePlacerLignes),
      // donc le ballon atterrit bien dans ses mains où qu'il se tienne.
      this.ballonEnVol = true;
      this.ballonVolX = L.fromX + (L.sauteur.x + (L.decal || 0) - L.fromX) * t;
      this.ballonVolY = L.fromY + (L.sauteur.y - L.fromY) * t;
      this.ballonVolHauteur = Math.sin(Math.PI * t);
      if (t < 1) return;
      if (L.pasDroit) {
        // Sifflé : mêlée pour l'adversaire sur la ligne des 15 m, à la marque
        // de touche (loi 18 — l'adversaire peut aussi choisir de relancer ;
        // le moteur prend la mêlée, l'option la plus jouée).
        this.ballonEnVol = false;
        this.ballonVolHauteur = 0;
        this.toucheLancer = null;
        const adv = L.lanceur === 'A' ? 'B' : 'A';
        const qui = L.lanceurNumero ? `du n°${L.lanceurNumero} ` : '';
        this.log('TOUCHE_PAS_DROIT', L.lanceur, `Lancer pas droit ${qui}(equipe ${L.lanceur}) : melee pour l'equipe ${adv}`);
        const yMelee = L.fromY <= LARGEUR / 2 ? 15 : LARGEUR - 15;
        this._accorderMelee(L.lanceur, { x: this.toucheLanceurX != null ? this.toucheLanceurX : L.fromX, y: yMelee });
        return;
      }
      // Réception : le sauteur capte le ballon en l'air, à sa position réelle.
      this.ballonEnVol = false;
      this.ballonVolHauteur = 0;
      this.toucheLancer = null;
      this.possession = L.gagnant;
      this.porteur = L.sauteur;
      if (L.horsJeu) {
        // Sifflé à la réception : pénalité pour l'équipe qui lançait, sur la
        // ligne des 15 m à la marque de touche.
        const fautive = L.lanceur === 'A' ? 'B' : 'A';
        this.log('TOUCHE_HORS_JEU', L.lanceur, `Hors-jeu en touche du n°${L.horsJeu.numero} (equipe ${fautive}) : penalite pour l'equipe ${L.lanceur}`);
        const yPen = L.fromY <= LARGEUR / 2 ? 15 : LARGEUR - 15;
        this._traiterPenalite(L.lanceur, { x: this.toucheLanceurX != null ? this.toucheLanceurX : L.fromX, y: yPen });
        return;
      }
      if (L.vole) {
        this.log('TURNOVER', L.gagnant, `Touche volee, l'equipe ${L.gagnant} recupere le ballon`);
      } else {
        this.log('TOUCHE_BALLON_GAGNE', L.lanceur, `Touche gagnee, le n°${L.sauteur.numero} capte le ballon pour l'equipe ${L.lanceur}`);
        // Maul (catch-and-drive) probable près de la ligne adverse, presque
        // systématique à moins de 10 m : c'est l'arme n°1 des avants près de
        // l'en-but. À 5 m il n'avait lieu que 43 % du temps, comme à 16 m, et
        // ces touches ne donnaient un essai qu'une fois sur trois et demie. La
        // consigne de touche garde son effet relatif (jeu au sol : 25 %).
        const zone = this._zoneTerrain(this.porteur);
        const tauxMaulCfg = this.cfgTouche[L.lanceur].tauxMaul;
        const distLigneTouche = this.porteur.sensAttaque > 0 ? LONGUEUR - this.porteur.x : this.porteur.x;
        const tauxMaulTouche = distLigneTouche <= 10 ? Math.min(0.95, tauxMaulCfg.proche * 1.7)
          : (zone === 'OPP_22' || zone === 'CINQ_M') ? tauxMaulCfg.proche : tauxMaulCfg.loin;
        if (this.rng() < tauxMaulTouche) {
          const { joueur: defenseurProche } = joueurLePlusProche(L.eqAdverse, this.porteur.x, this.porteur.y);
          this._formerMaul(this.porteur, defenseurProche);
          return;
        }
        // Le sauteur a capté le lancer ; il transmet ENSUITE le ballon au demi de
        // mêlée (receveur), en retrait derrière l'alignement (~4 m, cf.
        // _touchePlacerLignes). Cette transmission est une PASSE VISIBLE (le
        // ballon descend du sauteur vers le 9, à vue) et non un transfert
        // instantané : sans ça le ballon "apparaissait" directement dans les
        // mains du 9 (le 9 semblait capter le lancer lui-même). C'est le
        // "deuxième temps" de la touche. On NE délègue PAS à l'ouvreur ici
        // (_neufVersDix) : la passe 9 -> 10 se fait après, en jeu courant.
        const eqG = L.gagnant === 'A' ? this.equipeA : this.equipeB;
        const neuf = eqG.find(j => j.numero === 9 && j.sinBin <= 0 && j.auSol === 0);
        if (neuf && neuf !== this.porteur) {
          this._lancerPasseVisuelle(this.porteur, neuf);
          this.porteur = neuf;
          // Le 9 a le ballon derrière l'alignement : on peut enchaîner une
          // COMBINAISON scriptée de touche (cf. cfg.combinaisons.touche).
          this._lancerCombinaison('touche');
          // Sans combinaison, le 9 est libre et décide lui-même (dégagement,
          // chandelle, avant lancé, ouvreur, ou percée) — cf. choisirActionPorteur.
          if (!this.combinaison) this._neufLibre = true;
        }
      }
      this._imposerRecuperationRuck(this.ruckPoint);
      this.phase = 'PORTE';
      this.timerPhase = 0;
    }

    // Replacement des joueurs pendant l'essai/la transformation (loi 8.9 et
    // 8.14) : l'équipe qui défend doit se replier sur sa ligne d'en-but tant
    // que le botteur n'a pas amorcé sa course d'élan ; l'équipe du botteur
    // reste derrière le ballon. Sans ce replacement, les 28 autres joueurs
    // restaient figés exactement là où l'essai avait été marqué pendant les
    // ~33 s de célébration + transformation.
    // Renvoie true quand tous les joueurs concernés ont rejoint leur place
    // (la défense sur sa ligne d'en-but, l'attaque derrière le ballon), ce qui
    // permet d'armer la frappe et de les figer ensuite.
    _transformationPlacerJoueurs(dt) {
      const sens = this.essaiEquipe === 'A' ? 1 : -1;
      const equipeAttaque = this.essaiEquipe === 'A' ? this.equipeA : this.equipeB;
      const equipeDefense = this.essaiEquipe === 'A' ? this.equipeB : this.equipeA;
      const ligneDefense = sens > 0 ? LONGUEUR : 0;
      const buteur = equipeAttaque.find(j => j.numero === this.buteurNumero[this.essaiEquipe] && j.sinBin <= 0) || equipeAttaque[9];
      const recul = reculTransformation(Math.abs(this.essaiY - LARGEUR / 2), buteur && buteur.adresse);
      const teeX = Math.max(0, Math.min(LONGUEUR, this.essaiX - sens * recul));
      // Les coéquipiers se placent derrière le ballon (5 m derrière le tee).
      const xAttaque = Math.max(0, Math.min(LONGUEUR, this.essaiX - sens * (recul + 5)));
      const teeY = this.essaiY;
      let pireEcart = 0;
      for (const j of equipeDefense) {
        if (j.sinBin > 0) continue;
        avancer(j, ligneDefense - j.x, 0, dt, vitesseMs(j) * 0.8);
        pireEcart = Math.max(pireEcart, Math.abs(j.x - ligneDefense));
      }
      for (const j of equipeAttaque) {
        if (j.sinBin > 0 || j === this.porteur || j === buteur) continue;
        avancer(j, xAttaque - j.x, 0, dt, vitesseMs(j) * 0.8);
        pireEcart = Math.max(pireEcart, Math.abs(j.x - xAttaque));
      }
      // Le buteur COURT jusqu'au tee (dans l'axe de l'essai, ~10 m en retrait), à
      // pleine vitesse, dès la célébration de l'essai (la fonction est appelée
      // pendant ESSAI puis TRANSFORMATION) : il a tout le temps d'y arriver et
      // n'y est plus téléporté.
      if (buteur && buteur.sinBin <= 0) {
        avancer(buteur, teeX - buteur.x, teeY - buteur.y, dt, vitesseMs(buteur));
        pireEcart = Math.max(pireEcart, distance(buteur, { x: teeX, y: teeY }));
      }
      return pireEcart < 1.2;
    }

    // Célébration de l'essai avant l'enchaînement sur la transformation : en
    // match réel, l'arbitre laisse un temps mort notable (replays, retour au
    // sol, replacement) avant que le botteur ne s'installe.
    _tickEssai(dt) {
      this.timerPhase += dt;
      this._transformationPlacerJoueurs(dt);
      // Célébration + replacement : en match réel, entre l'essai accordé et le
      // début de la routine du buteur, il se passe un long moment — célébration,
      // vérification vidéo, retour des deux équipes au centre, le buteur qui va
      // chercher son tee. Mesuré sur un match télévisé : 30 à 45 s. Le moteur
      // n'en comptait que 10, ce qui raccourcissait artificiellement le temps
      // mort et gonflait d'autant le temps de jeu effectif (mesuré 42,6 min
      // pour 32-42 attendues).
      if (this.timerPhase >= 32 * this._echelleArret) {
        // Le buteur (l'ouvreur) a couru jusqu'au tee pendant la célébration
        // (cf. _transformationPlacerJoueurs) : il y est déjà, on ne le téléporte
        // plus. Il devient simplement le porteur pour la frappe.
        const eq = this.essaiEquipe === 'A' ? this.equipeA : this.equipeB;
        this._debutRemiseBallon();
        this.porteur = eq.find(j => j.numero === this.buteurNumero[this.essaiEquipe] && j.sinBin <= 0) || eq[9];
        this.phase = 'TRANSFORMATION';
        this.timerPhase = 0;
        this.transfoEnPlace = false;
      }
    }

    // Transformation : tentative de coup de pied au but (+2) depuis l'alignement
    // de l'essai, conformément à la loi (le botteur peut reculer mais pas changer d'axe).
    // Durée réaliste : placement du ballon, recul du botteur, course d'élan et
    // frappe prennent ~20-25 s en match réel, pas 2 s.
    _tickTransformation(dt) {
      this.timerPhase += dt;
      // Loi 8.21 : la transformation doit être JOUÉE dans les 90 secondes qui
      // suivent l'essai, sinon elle est refusée. Le buteur prend une vraie
      // routine (placement du tee, concentration, course d'élan), plus longue
      // sur un angle fermé — mais toujours sous le maximum réglementaire. Le
      // match étant regardé en avance rapide, ce temps réel reste confortable.
      const DUREE_MAX_TRANSFO = 60; // secondes réglementaires (loi 8.8.c : la transformation doit être jouée sous 60 s)
      // Routine réelle d'un buteur international : il pose le tee, recule, se
      // concentre, prend sa course. C'est 45 à 60 s, pas 26 — le maximum
      // réglementaire de 60 s est d'ailleurs atteint presque à chaque fois sur
      // un angle fermé. Le moteur bouclait la séquence en 44 s en moyenne.
      const routine = 45 + Math.abs(this.essaiY - LARGEUR / 2) * 0.5;
      const duree = Math.min(DUREE_MAX_TRANSFO, routine) * this._echelleArret;
      // Le ballon s'envole vers les poteaux pendant la dernière fraction du
      // temps d'arrêt (le reste, c'est le placement et la course d'élan) :
      // réutilise le mécanisme de vol du coup d'envoi pour rendre la frappe
      // visible à l'écran, au lieu de 25 s où rien ne bouge.
      const dureeVol = Math.min(1.4, duree * 0.3);
      const debutVol = duree - dureeVol;
      // Mise en place : les joueurs rejoignent leur position. On ne les fige (et
      // la frappe n'est armée) qu'une fois TOUS arrivés — au plus tard au début
      // du vol, pour ne jamais bloquer. Une fois en place, on ne les replace
      // plus : ils sont donc parfaitement immobiles au moment du tir (loi 8 :
      // personne n'avance tant que le botteur n'a pas frappé).
      if (!this.transfoEnPlace) {
        const enPlace = this._transformationPlacerJoueurs(dt);
        if (enPlace || this.timerPhase >= debutVol) this.transfoEnPlace = true;
      }
      if (this.timerPhase >= debutVol && this.timerPhase < duree) {
        const t = Math.min(1, (this.timerPhase - debutVol) / dureeVol);
        this.ballonEnVol = true;
        this.ballonVolX = this.porteur.x + (this.essaiX - this.porteur.x) * t;
        this.ballonVolY = this.porteur.y + (LARGEUR / 2 - this.porteur.y) * t;
        this.ballonVolHauteur = Math.sin(Math.PI * t);
      }
      if (this.timerPhase >= duree) {
        this.ballonEnVol = false;
        this.ballonVolHauteur = 0;
        const equipe = this.essaiEquipe;
        const offsetLateral = Math.abs(this.essaiY - LARGEUR / 2);
        const recul = reculTransformation(offsetLateral, this.porteur.adresse);
        this.stats[equipe].transformationsTentees++;
        // Distance réelle du tir et buteur, portés par l'événement (QA-RM-007) :
        // le fil le dit, et les mesures peuvent décomposer les buts.
        const tirT = { buteur: this.porteur.numero, distance: Math.round(Math.hypot(recul, offsetLateral)), decalage: Math.round(offsetLateral) };
        if (this.rng() < probaReussiteTir(recul, offsetLateral, this.porteur.adresse)) {
          this.stats[equipe].transformationsReussies++;
          this._statJoueur(this.porteur).pointsAuPied += 2;
          this.score[equipe] += 2;
          this.log('TRANSFORMATION_REUSSIE', equipe, `Transformation reussie a ${tirT.distance} m par le n°${tirT.buteur}, equipe ${equipe} +2`, tirT);
        } else {
          this.log('TRANSFORMATION_RATEE', equipe, `Transformation ratee a ${tirT.distance} m par le n°${tirT.buteur}, equipe ${equipe}`, tirT);
        }
        // Loi 12 : qu'elle soit réussie ou ratée, la transformation est suivie
        // d'un coup d'envoi à la mi-terrain, botté par l'équipe qui vient
        // d'encaisser l'essai (l'équipe qui a marqué le reçoit).
        this._nouvelleManche(equipe);
      }
    }

    // Replacement des joueurs pendant un coup de pied de pénalité au but : comme
    // à la transformation (cf. _transformationPlacerJoueurs), les 28 autres
    // joueurs restaient figés là où la faute avait été commise pendant les ~25 s
    // du tir. L'équipe qui défend se replie derrière sa ligne d'en-but (elle ne
    // peut pas charger un tir au but), l'équipe qui botte se replace derrière le
    // ballon (onside), prête à suivre le jeu sur une éventuelle touche/relance.
    // Tout se fait à la course (avancer), jamais de téléportation.
    // Renvoie true quand tous les joueurs concernés sont en place (même logique
    // que _transformationPlacerJoueurs) : sert à armer la frappe puis à figer.
    _penaliteTirPlacerJoueurs(dt) {
      if (!this.positionTir) return true;
      const sens = this.equipeAuTir === 'A' ? 1 : -1;
      const equipeAttaque = this.equipeAuTir === 'A' ? this.equipeA : this.equipeB;
      const equipeDefense = this.equipeAuTir === 'A' ? this.equipeB : this.equipeA;
      const ligneDefense = sens > 0 ? LONGUEUR : 0;
      const xAttaque = Math.max(0, Math.min(LONGUEUR, this.positionTir.x - sens * 15));
      let pireEcart = 0;
      for (const j of equipeDefense) {
        if (j.sinBin > 0) continue;
        avancer(j, ligneDefense - j.x, 0, dt, vitesseMs(j) * 0.8);
        pireEcart = Math.max(pireEcart, Math.abs(j.x - ligneDefense));
      }
      for (const j of equipeAttaque) {
        if (j.sinBin > 0 || j === this.porteur) continue;
        avancer(j, xAttaque - j.x, 0, dt, vitesseMs(j) * 0.8);
        pireEcart = Math.max(pireEcart, Math.abs(j.x - xAttaque));
      }
      // Le buteur COURT jusqu'au tee (point de pénalité), à pleine vitesse — il
      // n'y est jamais téléporté. Sa présence sur le tee fait partie des
      // conditions de « tous en place » avant d'armer la frappe.
      if (this.porteur) {
        avancer(this.porteur, this.positionTir.x - this.porteur.x, this.positionTir.y - this.porteur.y, dt, vitesseMs(this.porteur));
        pireEcart = Math.max(pireEcart, distance(this.porteur, this.positionTir));
      }
      return pireEcart < 1.2;
    }

    // Coup de pied de pénalité au but (+3). Loi 20 : le tir doit être PORTÉ dans
    // les 60 secondes qui suivent l'annonce de l'intention de taper au but, sinon
    // le coup de pied est annulé (mêlée à l'adversaire). Le buteur prend une
    // routine réaliste (placement, recul, course d'élan, frappe), plus longue sur
    // un angle fermé, mais toujours sous le maximum réglementaire.
    _tickPenaliteTir(dt) {
      this.timerPhase += dt;
      const DUREE_MAX_PENALITE = 60; // secondes réglementaires (loi 20)
      const offsetTir = this.positionTir ? Math.abs(this.positionTir.y - LARGEUR / 2) : 0;
      // Même routine réelle qu'à la transformation (45-60 s) : sur une pénalité,
      // s'y ajoutent la décision du capitaine et la marche jusqu'à la marque,
      // déjà comptées dans la mise en place de la pénalité (penaliteRecul).
      const routine = 45 + offsetTir * 0.4;
      const duree = Math.min(DUREE_MAX_PENALITE, routine) * this._echelleArret;
      // Même principe que pour la transformation : le ballon vole vers les
      // poteaux pendant la dernière fraction du temps d'arrêt.
      const dureeVol = Math.min(1.4, duree * 0.3);
      const debutVol = duree - dureeVol;
      // On ne peut pas botter tant que le replacement n'est pas fini : les
      // joueurs rejoignent leur place, et seulement une fois tous arrivés (au
      // plus tard au début du vol) la frappe est armée et ils sont figés — ils
      // ne bougent plus au moment du tir.
      if (!this.tirEnPlace) {
        const enPlace = this._penaliteTirPlacerJoueurs(dt);
        if (enPlace || this.timerPhase >= debutVol) this.tirEnPlace = true;
      }
      if (this.timerPhase >= debutVol && this.timerPhase < duree) {
        const sensVol = this.equipeAuTir === 'A' ? 1 : -1;
        const cibleX = sensVol > 0 ? LONGUEUR : 0;
        const t = Math.min(1, (this.timerPhase - debutVol) / dureeVol);
        this.ballonEnVol = true;
        this.ballonVolX = this.porteur.x + (cibleX - this.porteur.x) * t;
        this.ballonVolY = this.porteur.y + (LARGEUR / 2 - this.porteur.y) * t;
        this.ballonVolHauteur = Math.sin(Math.PI * t);
      }
      if (this.timerPhase >= duree) {
        this.ballonEnVol = false;
        this.ballonVolHauteur = 0;
        const equipe = this.equipeAuTir;
        const { y, distanceButs } = this.positionTir;
        const offsetLateral = Math.abs(y - LARGEUR / 2);
        const sens = { A: 1, B: -1 };
        this.stats[equipe].penalitesButTentees++;
        const tirP = { buteur: this.porteur.numero, distance: Math.round(Math.hypot(distanceButs, offsetLateral)), decalage: Math.round(offsetLateral) };
        if (this.rng() < probaReussiteTir(distanceButs, offsetLateral, this.porteur.adresse)) {
          this.stats[equipe].penalitesButReussies++;
          this._statJoueur(this.porteur).pointsAuPied += 3;
          this.score[equipe] += 3;
          this.log('PENALITE_REUSSIE', equipe, `Coup de pied au but reussi a ${tirP.distance} m par le n°${tirP.buteur}, equipe ${equipe} +3`, tirP);
          // Comme après un essai : coup d'envoi à la mi-terrain, botté par
          // l'équipe qui vient d'encaisser la pénalité.
          this._nouvelleManche(equipe);
        } else {
          this.log('PENALITE_RATEE', equipe, `Coup de pied au but rate a ${tirP.distance} m par le n°${tirP.buteur}, equipe ${equipe}`, tirP);
          // Un tir manqué part en général au-delà de la ligne d'en-but adverse
          // et y meurt : remise en jeu en 22m (loi 12), botté par l'équipe
          // défenseure depuis SA ligne des 22m, pas un coup d'envoi à mi-terrain.
          const sensEquipe = sens[equipe];
          const ligneEssaiAdverse = sensEquipe > 0 ? LONGUEUR : 0;
          const x22 = ligneEssaiAdverse - sensEquipe * 22;
          this._nouvelleManche(equipe, x22);
        }
      }
    }

    tick(dt) {
      this._numTick = (this._numTick || 0) + 1;
      if (this.porteur !== this._courseDe) this._courseDe = null;
      // Ligne d'avantage de la phase (stat des mètres gagnés, P2-102) : posée à
      // chaque début de jeu courant au point de regroupement ou de réception,
      // et à chaque changement de possession, au point du nouveau porteur.
      if (this.phase === 'PORTE' && (this._phaseGainPrec !== 'PORTE' || this._possGainPhase !== this.possession)) {
        const pt = this._phaseGainPrec !== 'PORTE' && this.ruckPoint ? this.ruckPoint : this.porteur;
        this._xGainPhase = pt ? pt.x : null;
        this._possGainPhase = this.possession;
      }
      this._phaseGainPrec = this.phase;
      if (this.phase !== 'PORTE') this._dernierePasse = null;
      // Origine de la séquence en cours (QA-RM-007) : touche, mêlée, coup
      // d'envoi, pénalité jouée, ou ballon gagné dans le jeu ; distance de son
      // point de départ à la ligne visée et nombre de rucks. Portée par
      // l'événement ESSAI, elle dit d'où vient chaque essai.
      const phasesArret = { TOUCHE: 'TOUCHE', MELEE: 'MELEE', COUP_ENVOI: 'COUP_ENVOI' };
      const nouvelArret = phasesArret[this.phase] && this._phaseSeqPrec !== this.phase;
      if (nouvelArret || this.possession !== this._seqPoss || (this.penaliteRecul && !this._seqPenalite)) {
        const sensSeq = this.possession === 'A' ? 1 : -1;
        const xTouche = this.phase === 'TOUCHE' ? this.toucheLanceurX : null;
        this._sequence = {
          origine: phasesArret[this.phase] || (this.penaliteRecul ? 'PENALITE' : 'JEU_COURANT'),
          depuis: xTouche != null ? Math.round(sensSeq > 0 ? LONGUEUR - xTouche : xTouche) : null,
          rucks: 0,
        };
        this._seqPoss = this.possession;
      }
      // Point de départ : la marque de touche, sinon là où l'équipe a le ballon
      // en main pour la première fois (sortie de mêlée, pénalité jouée), pas la
      // position d'avant l'arrêt — une touche sur pénalité prenait celle du botteur.
      if (this._sequence && this._sequence.depuis === null && this.porteur
          && (this.phase === 'PORTE' || this.phase === 'MAUL') && this.porteur.team === this.possession) {
        const sensSeq = this.possession === 'A' ? 1 : -1;
        this._sequence.depuis = Math.round(sensSeq > 0 ? LONGUEUR - this.porteur.x : this.porteur.x);
      }
      this._seqPenalite = !!this.penaliteRecul;
      if (this.phase === 'RUCK' && this._phaseSeqPrec !== 'RUCK' && this._sequence) this._sequence.rucks++;
      this._phaseSeqPrec = this.phase;
      // Décélération des joueurs qu'aucune logique de phase n'a déplacés au
      // tick précédent (cf. avancer / ACCELERATION) : ils ralentissent au lieu
      // de conserver leur élan, et repartiront donc de leur vitesse réelle.
      for (const j of [...this.equipeA, ...this.equipeB]) {
        if (!j._aBouge) j.vitesseCourante = Math.max(0, (j.vitesseCourante || 0) - DECELERATION * dt);
        j._aBouge = false;
        // Hors-jeu de coup de pied (loi 10) : plafond de securite, cf.
        // DUREE_HORS_JEU_KICK. Le joueur est normalement remis en jeu bien
        // avant, des qu'il repasse derriere la ligne du coup de pied.
        if (j.horsJeuKick > 0) j.horsJeuKick = Math.max(0, j.horsJeuKick - dt);
      }
      if (this.phase === 'TERMINE') return;
      // Zone de regroupement infranchissable de ce tick (mêlée/ruck/maul) : les
      // joueurs la contournent au lieu de la traverser (cf. avancer). Une mêlée
      // est plus large (16 avants liés) qu'un ruck ou un maul.
      if (this.phase === 'MELEE' && this.melee) _obstacle = { x: this.melee.x, y: this.melee.y, r: 4 };
      else if (this.phase === 'MAUL' && this.maul) _obstacle = { x: this.maul.x, y: this.maul.y, r: 3 };
      else if (this.phase === 'RUCK' && this.ruckPoint) _obstacle = { x: this.ruckPoint.x, y: this.ruckPoint.y, r: 2.6 };
      else _obstacle = null;
      // Fatigue de fin de match : les joueurs ralentissent progressivement (jusqu'à
      // ~10 % à la 80e minute). Purement visuel/rythmique (s'applique aux 2 équipes).
      _fatCourant = (this.dureeMatch === Infinity || this.dureeMatch <= 0) ? 0
        : Math.min(1, this.tempsMatch / this.dureeMatch);
      for (const j of [...this.equipeA, ...this.equipeB]) {
        if (j.auSol > 0) {
          j.auSol = Math.max(0, j.auSol - dt);
          // Une fois relevé (auSol retombé à 0), on oublie la position de chute :
          // le joueur redevient libre de se déplacer (l'IA le replace).
          if (j.auSol === 0) j._solX = null;
        }
        if (j.missCooldown > 0) j.missCooldown = Math.max(0, j.missCooldown - dt);
        if (j._percee > 0) j._percee = Math.max(0, j._percee - dt); // fenêtre de continuité après un défenseur battu
        if (j._enchaine > 0) j._enchaine = Math.max(0, j._enchaine - dt); // fenêtre d'enchaînement après réception (le ballon circule)
        if (j.fixeCooldown > 0) j.fixeCooldown = Math.max(0, j.fixeCooldown - dt); // défenseur fixé/battu par une passe
        if (j.ruckRecovery > 0) j.ruckRecovery = Math.max(0, j.ruckRecovery - dt);
        if (j._croiseTimer > 0) j._croiseTimer = Math.max(0, j._croiseTimer - dt);
        // Plaqueur couché (visuel pur) : ne persiste qu'en JEU COURANT. Sur un
        // changement de phase (mêlée, touche, coup de pied...), on l'efface : sinon
        // un plaqueur restait dessiné au sol tout seul, loin de la nouvelle action
        // (effet « joueur qui tombe sans plaqueur »).
        if (j.solVisuel > 0) {
          j.solVisuel = (this.phase === 'PORTE' || this.phase === 'RUCK' || this.phase === 'MAUL')
            ? Math.max(0, j.solVisuel - dt) : 0;
        }
        if (j.sinBin > 0) j.sinBin = Math.max(0, j.sinBin - dt);
      }
      // Fenêtre « défense pas replacée » après un ballon éclair au ruck.
      if (this._defenseTardive > 0) this._defenseTardive = Math.max(0, this._defenseTardive - dt);
      // Avancement du vol visuel d'une passe (cf. _lancerPasseVisuelle) : on le
      // termine au bout de sa durée. Le vol n'a de sens qu'en jeu courant ; si
      // la phase a changé entre-temps (plaquage -> ruck, sortie en touche...),
      // on l'arrête pour que le ballon ne reste pas "en l'air" sur un autre
      // arrêt de jeu.
      if (this.passeVisuelle) {
        this.passeVisuelle.timer += dt;
        if (this.passeVisuelle.timer >= this.passeVisuelle.duree || this.phase !== 'PORTE') {
          this.passeVisuelle = null;
        }
      }
      // Temps de jeu effectif (ballon vivant) : phases où le jeu est réellement
      // en cours, à l'exclusion des arrêts (essai/transformation/pénalité au
      // but/mi-temps) et de la formation mêlée/touche (liaison des paquets,
      // alignement avant lancer : le ballon n'est pas encore vivant). Mesuré
      // tick par tick, jamais recalculé après coup.
      // Une pénalité en cours de mise en place n'est PAS du jeu : le ballon
      // n'a pas encore été tapé, l'arbitre parle et les fautifs reculent. La
      // phase est pourtant déjà 'PORTE' (cf. _lancerJeuRapidePenalite), d'où
      // cette exclusion explicite — sans elle, les ~30 s réglementaires
      // seraient comptées comme du ballon en jeu.
      const enMiseEnPlacePenalite = !!this.penaliteRecul;
      // MÊLÉE ET TOUCHE : seule leur FORMATION est un arrêt. Le ballon est en
      // jeu dès qu'il est introduit dans la mêlée (introduction, poussée,
      // sortie) et dès qu'il est lancé en touche (définition World Rugby du
      // temps de jeu effectif). Ces deux phases étaient exclues ENTIÈRES :
      // ~1,5 à 2 min de vrai jeu par match manquaient au temps de jeu effectif
      // et à la possession (cf. TODO_AUDIT.md P2-59).
      const meleeVivante = this.phase === 'MELEE' && this.melee
        && (this.melee.etat === ETATS_MELEE.INTRODUCTION || this.melee.etat === ETATS_MELEE.CONTESTATION
          || this.melee.etat === ETATS_MELEE.SORTIE);
      const toucheVivante = this.phase === 'TOUCHE' && !!this.toucheLancer;
      // COUP D'ENVOI : seul le VOL est du jeu. La mise en place (les joueurs
      // regagnent leur moitié, le botteur rejoint le centre) n'en est pas — le
      // ballon n'est pas en jeu avant la frappe. Elle était comptée : 1,87 min
      // de « jeu effectif » par match qui n'en était pas (P2-80).
      const envoiVivant = this.phase === 'COUP_ENVOI' && this.envoiEnPlace;
      if (!enMiseEnPlacePenalite && (this.phase === 'PORTE' || this.phase === 'RUCK' || this.phase === 'MAUL'
        || envoiVivant || this.phase === 'COUP_DE_PIED_JEU' || meleeVivante || toucheVivante)) {
        this.tempsJeuEffectif += dt;
        this.tempsPossession[this.possession] += dt;
        // Occupation : où se joue le match (position réelle du ballon),
        // indépendamment de qui le porte — sensAttaque de A est toujours +1,
        // donc la moitié de terrain x > LONGUEUR/2 est sa moitié offensive.
        // Mêlée ou lancer en touche (P2-59) : personne ne porte forcément le
        // ballon, on prend alors le point de la mêlée ou de la marque.
        const xBallon = (this.ballonEnVol || this._receptionEnAttente) ? this.ballonVolX
          : this.porteur ? this.porteur.x
            : (this.melee ? this.melee.x : (this.ruckPoint ? this.ruckPoint.x : LONGUEUR / 2));
        if (xBallon > LONGUEUR / 2) this.tempsOccupation.A += dt;
        else this.tempsOccupation.B += dt;
        // Entrée dans les 22 m adverses (une seule par possession continue) :
        // sensAttaque de A est toujours +1 (attaque vers x=LONGUEUR), donc ses
        // 22 m adverses sont x > LONGUEUR-22 ; B attaque vers x=0, ses 22 m
        // adverses sont x < 22. Le compteur ne se réarme qu'au changement de
        // possession (turnover, coup de pied, pénalité...), jamais à chaque
        // tick passé dans la zone.
        if (this.possession !== this._entree22DernierePossession) {
          this._entree22DernierePossession = this.possession;
          this._entree22Faite = false;
        }
        if (!this._entree22Faite) {
          const enZone22Adverse = this.possession === 'A' ? xBallon > LONGUEUR - 22 : xBallon < 22;
          if (enZone22Adverse) {
            this._entree22Faite = true;
            this.stats[this.possession].entrees22++;
            this.log('ENTREE_22', this.possession, `L'equipe ${this.possession} entre dans les 22 m adverses`);
          }
        }
      }
      this.tempsMatch += dt;
      // Remplacements planifiés (cf. constructeur) : mutation EN PLACE des
      // attributs de performance du joueur déjà présent à ce numéro — jamais
      // un nouvel objet. Position (x/y), ballon porté, liaisons de
      // regroupement en cours (mêlée/ruck/maul, qui gardent une référence
      // directe vers cet objet) restent celles du joueur remplacé, exactement
      // comme un remplaçant qui entre à la place précise de celui qu'il
      // relève, même en pleine phase de jeu.
      if (this._remplacements.length) {
        for (const r of this._remplacements) {
          if (r.applique || this.tempsMatch < r.instant) continue;
          r.applique = true;
          const equipe = r.equipe === 'A' ? this.equipeA : this.equipeB;
          const sortant = equipe && equipe[r.numero - 1];
          if (!sortant) continue;
          // Les actions du sortant lui restent : sa ligne est close ici, et
          // l'entrant commencera la sienne (cf. _statJoueur).
          const lignes = this.statsJoueurs[r.equipe];
          this.statsJoueursSortis[r.equipe].push({ numero: r.numero, sortie: this.tempsMatch, stats: lignes[r.numero] || null });
          delete lignes[r.numero];
          this.remplacementsEffectues.push({ equipe: r.equipe, numero: r.numero, instant: this.tempsMatch, joueurId: r.joueurId });
          const c = r.joueur || {};
          Object.assign(sortant, {
            label: c.poste || sortant.label,
            vitesse: (c.vitesse != null ? c.vitesse : sortant.vitesse) + (this.rng() * 10 - 5),
            plaquage: (c.plaquage != null ? c.plaquage : sortant.plaquage) + (this.rng() * 10 - 5),
            tendance: c.tendance != null ? c.tendance : sortant.tendance,
            adresse: c.adresse != null ? c.adresse : sortant.adresse,
            melee: c.melee != null ? c.melee : sortant.melee,
            touche: c.touche != null ? c.touche : sortant.touche,
            puissance: c.puissance != null ? c.puissance : sortant.puissance,
            endurance: c.endurance != null ? c.endurance : sortant.endurance,
            passe: c.passe != null ? c.passe : sortant.passe,
            jeuPied: c.jeuPied != null ? c.jeuPied : sortant.jeuPied,
            decision: c.decision != null ? c.decision : sortant.decision,
            discipline: c.discipline != null ? c.discipline : sortant.discipline,
          });
          // _nouvelleManche (coup d'envoi après essai/pénalité/mi-temps, cf.
          // plus haut) RECRÉE entièrement equipeA/equipeB depuis this.cfg.
          // joueursA/joueursB à chaque reprise — sans cette mise à jour, le
          // remplacement ci-dessus serait effacé et le titulaire d'origine
          // reviendrait dès le prochain coup d'envoi. On met donc aussi à
          // jour la config source, pour que toute reprise future régénère
          // bien le remplaçant (avec un nouveau bruit RNG, comme n'importe
          // quel autre joueur à chaque reprise — cohérent, pas un cas
          // spécial).
          const cleCfg = r.equipe === 'A' ? 'joueursA' : 'joueursB';
          if (!this.cfg[cleCfg]) this.cfg[cleCfg] = Object.assign({}, this.cfg.joueurs);
          this.cfg[cleCfg][r.numero] = c;
          // `c.nom` (optionnel, ignoré par Object.assign ci-dessus qui ne lit
          // que les attributs de performance) : purement pour un message
          // lisible — le moteur n'a sinon aucune notion de nom de joueur.
          this.log('REMPLACEMENT', r.equipe, c.nom
            ? `Remplacement equipe ${r.equipe} : ${c.nom} entre en jeu au n°${r.numero}`
            : `Remplacement equipe ${r.equipe} : nouveau joueur au n°${r.numero}`);
        }
      }
      // Une séquence de marque déjà engagée (essai en attente de transformation,
      // tir au but en cours) doit aller à son TERME même si le temps de la
      // période ou du match expire pendant ce temps : en rugby, un essai marqué
      // au temps écoulé se transforme, et un coup de pied accordé avant la fin se
      // joue (le temps ne s'arrête que lorsque le ballon est mort). Sans ce
      // report, la bascule en MI_TEMPS/TERMINE court-circuitait _tickEssai/
      // _tickTransformation/_tickPenaliteTir (return immédiat) et effaçait des
      // points légitimes — ~7,5 % des matchs perdaient la transformation d'un
      // essai de fin de période. On laisse donc la phase de marque se résoudre,
      // puis la bascule de temps se déclenche au tick suivant.
      const sequenceMarque = this.phase === 'ESSAI' || this.phase === 'TRANSFORMATION' || this.phase === 'PENALITE_TIR';
      // LOI 5.7 : LA SONNERIE NE SIFFLE PAS LA FIN, LE BALLON MORT SI. Une fois
      // le temps écoulé, le jeu continue jusqu'au premier ballon mort, et une
      // mêlée ou une touche déjà accordée se joue (comme la touche d'une
      // pénalité tapée en touche après la sonnerie). Avant, la période
      // s'arrêtait à 40:00 et 80:00 pile : 29 fins sur 60 coupaient une course,
      // un ruck ou un maul, et 9 autres une touche ou une mêlée à jouer.
      const limitePeriode = this.miTempsJouee ? this.dureeMatch : this.dureeMiTemps;
      let finPeriode = false;
      if (!sequenceMarque && this.tempsMatch >= limitePeriode) {
        if (!this._sonnerie) {
          const aJouer = this.phase === 'MELEE' || this.phase === 'TOUCHE' ? this.phase : null;
          this._sonnerie = { aJouer, vu: !!aJouer };
          this.log('SONNERIE', null, aJouer
            ? `Temps ecoule : la ${aJouer === 'MELEE' ? 'melee' : 'touche'} se joue, jusqu'au prochain ballon mort`
            : `Temps ecoule : derniere action, le jeu continue jusqu'au ballon mort`);
        }
        finPeriode = this._ballonMortApresSonnerie();
        if (finPeriode) this._sonnerie = null;
      }
      if (finPeriode && this.miTempsJouee) {
        // ÉLIMINATION DIRECTE (BUG-RM-001) : à égalité au coup de sifflet, une
        // PROLONGATION de 20 minutes se joue réellement (à l'échelle de la
        // durée du match), après un coup d'envoi. Si l'égalité persiste à son
        // terme : l'équipe qui a marqué le plus d'essais, puis une séance de
        // tirs au but (cf. _departager). Avant, la coupe tranchait sur un hash
        // des identifiants des clubs et annonçait une prolongation jamais jouée.
        if (this.cfg.eliminationDirecte && this.score.A === this.score.B) {
          if (!this.prolongationJouee) {
            this.prolongationJouee = true;
            this.dureeReglementaire = this.dureeMatch;
            this.dureeMatch += this.dureeMatch * 0.25;
            this.log('PROLONGATION', null,
              `Egalite ${this.score.A} - ${this.score.B} : prolongation de 20 minutes`);
            this.phase = 'MI_TEMPS';
            this.timerPhase = 0;
            return;
          }
          this._departager();
        }
        this.phase = 'TERMINE';
        this.log('FIN_MATCH', null, `Fin du match : equipe A ${this.score.A} - ${this.score.B} equipe B`);
        return;
      }
      // Coup d'envoi de la 2e période (loi 12) : ce sont les adversaires de
      // l'équipe qui a donné le coup d'envoi du match qui le donnent en 2e
      // période, depuis le centre, comme en début de match. Le coup d'envoi
      // est différé d'une seconde de jeu (phase MI_TEMPS) plutôt que déclenché
      // dans le même tick que l'événement MI_TEMPS, sinon l'événement COUP_ENVOI
      // qui suit immédiatement masque la bannière de mi-temps dans l'interface.
      if (finPeriode && !this.miTempsJouee) {
        this.miTempsJouee = true;
        this.log('MI_TEMPS', null, `Mi-temps : equipe A ${this.score.A} - ${this.score.B} equipe B`);
        this.phase = 'MI_TEMPS';
        this.timerPhase = 0;
        return;
      }
      // Une PORTE née d'un coup de pied cesse de l'être dès que le jeu s'arrête.
      if (this.phase !== 'PORTE') { this._porteApresPied = false; this._chandelleBaseA = null; }
      if (this.phase === 'MI_TEMPS') this._tickMiTemps(dt);
      else if (this.phase === 'PORTE') {
        // Mise en place d'un jeu rapide sur pénalité/coup franc (recul de 10 m
        // des fautifs, tapeur vers la marque) avant que le jeu courant reprenne.
        if (this.penaliteRecul) this._tickJeuRapidePenalite(dt);
        else this._tickPorte(dt);
      }
      else if (this.phase === 'COUP_ENVOI') this._tickCoupEnvoi(dt);
      else if (this.phase === 'COUP_DE_PIED_JEU') this._tickCoupDePiedJeu(dt);
      else if (this.phase === 'RUCK') this._tickRuck(dt);
      else if (this.phase === 'MAUL') this._tickMaul(dt);
      else if (this.phase === 'MELEE') this._tickMelee(dt);
      else if (this.phase === 'TOUCHE') this._tickTouche(dt);
      else if (this.phase === 'ESSAI') this._tickEssai(dt);
      else if (this.phase === 'TRANSFORMATION') this._tickTransformation(dt);
      else if (this.phase === 'PENALITE_TIR') this._tickPenaliteTir(dt);
      // Remise du ballon au buteur (P2-85) : il le rejoint à ~10 m/s.
      if (this._remiseBallon) {
        const R = this._remiseBallon, k = this.porteur;
        // Jeu rapide (P2-89) : le ballon va sur la marque et y reste tant que la
        // mise en place dure, puis rejoint le tapeur.
        const jeuRapide = R.marque && this.phase === 'PORTE' && !this.passeVisuelle;
        if (!k || (this.phase !== 'PENALITE_TIR' && this.phase !== 'TRANSFORMATION' && !jeuRapide) || this.ballonEnVol) this._remiseBallon = null;
        else {
          const cible = jeuRapide && this.penaliteRecul ? R.marque : k;
          const dxr = cible.x - R.x, dyr = cible.y - R.y, dr = Math.hypot(dxr, dyr), pasR = 10 * dt;
          if (dr <= pasR) { R.x = cible.x; R.y = cible.y; if (cible === k) this._remiseBallon = null; }
          else { R.x += dxr / dr * pasR; R.y += dyr / dr * pasR; }
        }
      }
      // Gel global des joueurs AU SOL : un joueur plaqué/à terre (auSol > 0) ne
      // se déplace JAMAIS tant qu'il n'est pas relevé. Sans ce verrou, l'IA de
      // placement (ligne défensive, soutiens, replacement) le faisait glisser —
      // parfois à pleine vitesse de course (~7 m/s mesuré) — alors qu'il est
      // dessiné couché : on voyait des joueurs « courir au sol ». On les refige
      // à l'endroit exact de leur chute dans TOUTES les phases SAUF la formation
      // d'une mêlée ou d'une touche (où ils doivent au contraire pouvoir rejoindre
      // leur place, auSol expirant en ~2 s). Le coup de pied est inclus : sinon le
      // joueur, figé pendant le jeu courant, se « dégelait » au coup de pied et
      // sautait d'un coup vers sa position de chasse (téléportation détectée par
      // les invariants).
      if (this.phase !== 'MELEE' && this.phase !== 'TOUCHE') {
        for (const j of [...this.equipeA, ...this.equipeB]) {
          if (j.auSol > 0 && j._solX != null) { j.x = j._solX; j.y = j._solY; }
        }
      } else {
        // Pendant la formation d'une mêlée/touche, un joueur encore à terre
        // (auSol > 0) est autorisé à REJOINDRE sa place (freeze levé ci-dessus).
        // On lève alors définitivement son épingle de chute (_solX) : sinon, dès
        // qu'on RESORT de la mêlée/touche (ex. mi-temps qui interrompt la mêlée),
        // le gel se réactive et le RE-fige d'un coup à son ancien point de chute
        // — un saut visible (mesuré : ~5 m) alors qu'il avait déjà rejoint sa
        // position. Une fois qu'il a commencé à se replacer, il n'est plus épinglé.
        for (const j of [...this.equipeA, ...this.equipeB]) {
          if (j._solX != null) { j._solX = null; j._solY = null; }
        }
      }
      // ANTI-COLLISION : deux joueurs DEBOUT ne doivent jamais occuper (quasi)
      // le même point — sans ça, plusieurs joueurs qui convergent vers la même
      // cible (chasse au ballon, ruck, tee de transformation...) finissent
      // superposés à l'écran, et l'un semble « avancer à travers » l'autre.
      // Un joueur AU SOL n'est jamais déplacé (il est figé à sa chute).
      this._separerJoueurs();
      // Suivi de l'avantage (loi 7) APRÈS la phase : on évalue sur l'état mis à
      // jour (possession, position du porteur) si l'avantage est joué ou s'il
      // faut revenir à la sanction.
      if (this.avantage) this._tickAvantage(dt);
      // L'arbitre court vers sa place (jamais de téléportation).
      if (this.phase !== 'TERMINE') this._majArbitre(dt);
    }

    // Écarte les paires de joueurs DEBOUT trop rapprochées, d'un pas borné
    // (jamais un saut : au plus minSep/2 par joueur, très en-dessous du seuil
    // de téléportation) — pas un pas de simulation supplémentaire mais une
    // correction géométrique après le placement du tick.
    //
    // Ce n'est PAS la portée des bras : la portée de contact/plaquage existe
    // déjà séparément (distDef < 2.2 m, cf. choisirActionPorteur/_tickPorte) —
    // c'est là que « les bras accrochent ». Ici, on empêche seulement les
    // TORSES de s'interpénétrer une fois deux joueurs déjà au contact/à l'arrêt
    // l'un contre l'autre. Valeurs calées sur l'anatomie réelle (le corps n'est
    // pas un disque isotrope : plus large de face que profond) :
    //   - largeur d'épaules (biacromiale) d'un joueur de rugby : ~0,48-0,55 m ;
    //   - profondeur du torse (poitrine-dos) : ~0,28-0,32 m.
    // JEU OUVERT (0,55 m) : contact majoritairement épaule/latéral (joueurs qui
    // courent côte à côte) + marge pour le balancement des bras en course.
    // REGROUPEMENT (0,42 m, mêlée/ruck/maul) : mélange de contacts LATÉRAUX
    // (première ligne de mêlée, liée épaule contre épaule, ~0,48-0,50 m) et
    // FRONTAUX (plaqueur/jackal au ruck, torse contre torse, ~0,30 m) — un seul
    // seuil isotrope ne peut pas distinguer l'orientation, 0,42 m est le point
    // médian qui reste physiquement plausible dans les deux cas plutôt que de
    // sous-serrer le contact frontal (ancien 0,32 m, trop permissif pour une
    // mêlée liée épaule contre épaule).
    _separerJoueurs() {
      const tous = [...this.equipeA, ...this.equipeB].filter(j => j.auSol === 0);
      const SEP_OUVERT = 0.55, SEP_REGROUPEMENT = 0.42;
      for (let a = 0; a < tous.length; a++) {
        const j1 = tous[a];
        for (let b = a + 1; b < tous.length; b++) {
          const j2 = tous[b];
          const dx = j2.x - j1.x, dy = j2.y - j1.y;
          const d = Math.hypot(dx, dy);
          const pres1 = _obstacle && Math.hypot(j1.x - _obstacle.x, j1.y - _obstacle.y) < _obstacle.r + 1.5;
          const pres2 = _obstacle && Math.hypot(j2.x - _obstacle.x, j2.y - _obstacle.y) < _obstacle.r + 1.5;
          const minSep = (pres1 || pres2) ? SEP_REGROUPEMENT : SEP_OUVERT;
          if (d >= minSep) continue;
          let ux, uy;
          if (d > 1e-6) { ux = dx / d; uy = dy / d; }
          else {
            // Superposition exacte : direction déterministe (jamais this.rng(),
            // qui romprait la reproductibilité du match) via un angle dérivé
            // des identités des deux joueurs, réparti par nombre d'or.
            const id1 = (j1.team === 'A' ? 0 : 100) + j1.numero;
            const id2 = (j2.team === 'A' ? 0 : 100) + j2.numero;
            const ang = (id1 - id2) * 2.399963;
            ux = Math.cos(ang); uy = Math.sin(ang);
          }
          const push = (minSep - d) / 2;
          j1.x = Math.max(0, Math.min(LONGUEUR, j1.x - ux * push));
          j1.y = Math.max(0, Math.min(LARGEUR, j1.y - uy * push));
          j2.x = Math.max(0, Math.min(LONGUEUR, j2.x + ux * push));
          j2.y = Math.max(0, Math.min(LARGEUR, j2.y + uy * push));
        }
      }
    }

    // Forme normalisée du ballon (cf. docs/index.html refonte modulaire) :
    // un objet indépendant du porteur, avec un état explicite plutôt qu'une
    // simple référence d'objet joueur. Vitesse en m/s, dérivée de la cible et
    // de la durée de vol pendant un coup d'envoi ; nulle sinon (le ballon
    // "tenu" n'a pas de vitesse propre, il suit le porteur).
    _etatBallon() {
      if (this.ballonEnVol) return 'AIR';
      if (this._receptionEnAttente) return 'LOOSE';
      if (this.phase === 'RUCK') return 'RUCK';
      // Mêlée (P2-64) : une fois lâché par le 9, le ballon est au sol sous le
      // pack — personne ne le porte (le 9 reste porteur logique pour la suite).
      if (this.phase === 'MELEE' && this.melee && this.melee.balle && this.melee.balle.etat !== 'MAINS_9') return 'SCRUM';
      if (this.phase === 'MAUL') return 'MAUL';
      if (this.phase === 'TOUCHE') return 'OUT';
      return 'CARRIED';
    }

    // --- Décisions du manager PENDANT la rencontre -------------------------
    //
    // Le match était intégralement calculé avant que le manager le regarde
    // (docs/js/main.js : genererMatchEnArrierePlan puis relecture à
    // l'identique). Il assistait à un film : aucune de ses décisions ne
    // pouvait changer quoi que ce soit, le résultat étant déjà enregistré
    // dans la sauvegarde avant la première image.
    //
    // Ces deux méthodes sont le point d'entrée d'une décision prise EN COURS
    // de jeu. Elles n'inventent aucune règle : elles écrivent dans les mêmes
    // structures que la configuration d'avant-match (cfgAttaque, cfgDefense,
    // cfgMelee, cfgTouche, cfgRuck, buteur, lanceur) et dans la même file de
    // remplacements — le moteur les lit ensuite exactement comme d'habitude.
    //
    // Le déterminisme est intact : sans appel, le match se déroule au tick
    // près comme avant (vérifié par server/test-match-interactif.js).

    // `consignes` accepte les mêmes clés que la config d'avant-match :
    //   { attaque, defense, melee, touche, ruck, buteur, toucheLanceur }
    // Chaque bloc est FUSIONNÉ par-dessus le réglage courant de l'équipe, donc
    // une consigne partielle (ex. juste `probaKick`) ne fait pas perdre le
    // reste. Retourne false si l'équipe est inconnue.
    appliquerTactiqueEnCours(equipe, consignes) {
      if (equipe !== 'A' && equipe !== 'B') return false;
      const c = consignes || {};
      if (c.attaque) this.cfgAttaque[equipe] = fusionnerConfig(this.cfgAttaque[equipe], c.attaque);
      if (c.defense) this.cfgDefense[equipe] = fusionnerConfig(this.cfgDefense[equipe], c.defense);
      if (c.melee) this.cfgMelee[equipe] = fusionnerConfig(this.cfgMelee[equipe], c.melee);
      if (c.touche) this.cfgTouche[equipe] = fusionnerConfig(this.cfgTouche[equipe], c.touche);
      if (c.ruck) this.cfgRuck[equipe] = fusionnerConfig(this.cfgRuck[equipe], c.ruck);
      if (c.buteur != null) this.buteurNumero[equipe] = c.buteur;
      if (c.toucheLanceur != null) this.toucheLanceurNumero[equipe] = c.toucheLanceur;
      this.log('TACTIQUE', equipe, `Consigne de touche pour l'équipe ${equipe}`);
      return true;
    }

    // Fait entrer `joueur` (mêmes attributs qu'en config) sur le numéro
    // `numero`. On ne duplique PAS la mécanique de remplacement : on empile
    // dans la même file que les remplacements planifiés, avec pour instant le
    // temps courant, donc le prochain tick l'applique par le chemin déjà
    // éprouvé (mise à jour du joueur vivant ET de la config source, pour que
    // le remplaçant survive au prochain coup d'envoi).
    // `joueurId` (optionnel) : l'identité de l'entrant côté club, rendue avec
    // le remplacement effectué pour lui créditer SES actions (BUG-RM-007).
    remplacerJoueurEnCours(equipe, numero, joueur, joueurId) {
      if (equipe !== 'A' && equipe !== 'B') return false;
      if (!(numero >= 1 && numero <= 15)) return false;
      this._remplacements.push({
        equipe, numero: Math.round(numero), joueur: joueur || {},
        instant: this.tempsMatch, applique: false, joueurId: joueurId != null ? joueurId : null,
      });
      return true;
    }

    // Joue le match jusqu'au COUP DE SIFFLET final (phase TERMINE), pas jusqu'au
    // chrono : une transformation ou un tir engagé avant 80:00 se termine
    // après (bugs.md BUG-RM-010). Les scripts de mesure qui lisaient le score à
    // 80:00 perdaient ces points. Garde bornée : un match qui ne finit pas est
    // une erreur, jamais un résultat.
    // Après la sonnerie : le ballon est-il mort ? Coup d'envoi (après un
    // point marqué ou un renvoi), mêlée ou touche nouvellement accordées.
    // La mêlée ou la touche déjà accordée à la sonnerie (ou celle d'une
    // pénalité tapée en touche ensuite) se joue d'abord.
    _ballonMortApresSonnerie() {
      const S = this._sonnerie;
      const ph = this.phase;
      if (S.aJouer) {
        if (ph === S.aJouer) { S.vu = true; return false; }
        if (S.vu) S.aJouer = null;
        else return false;
      }
      return ph === 'COUP_ENVOI' || ph === 'MELEE' || ph === 'TOUCHE';
    }

    jouerJusquAuSifflet(dt = 0.1, margeMax = 600) {
      while (this.phase !== 'TERMINE') {
        if (this.tempsMatch >= this.dureeMatch + margeMax) {
          throw new Error(`match non termine : ${this.tempsMatch.toFixed(1)} s, phase ${this.phase}`);
        }
        this.tick(dt);
      }
      return this;
    }

    getState() {
      const enVol = this.ballonEnVol;
      // Ballon au sol après un coup de pied tactique, pas encore récupéré :
      // pas tenu par le porteur (qui est resté en arrière, ballon déjà loin) —
      // sa position réelle est celle du point de chute, comme pendant le vol.
      const auSolLoose = !enVol && this._receptionEnAttente;
      let bvx = 0, bvy = 0;
      if (enVol) {
        const dxVol = this.ballonCibleX - this.xCoupEnvoi;
        const dyVol = this.ballonCibleY - LARGEUR / 2;
        const duree = Math.max(0.9, Math.min(2.0, Math.hypot(dxVol, dyVol) / 18));
        bvx = dxVol / duree;
        bvy = dyVol / duree;
      }
      // Vol visuel d'une passe en jeu courant (cf. _lancerPasseVisuelle) : le
      // ballon décrit un petit arc du passeur jusqu'au receveur (qui est déjà
      // le porteur côté logique). On ne l'affiche qu'en jeu courant (PORTE) :
      // si un plaquage/une touche a interrompu entre-temps, le ballon revient
      // à sa position normale. L'arc est plus bas qu'un coup de pied (×0,4).
      let passeX = null, passeY = null, passeH = 0;
      if (this.passeVisuelle && !enVol && !auSolLoose && this.phase === 'PORTE') {
        const P = this.passeVisuelle;
        const t = P.duree > 0 ? Math.min(1, P.timer / P.duree) : 1;
        passeX = P.fromX + (P.cible.x - P.fromX) * t;
        passeY = P.fromY + (P.cible.y - P.fromY) * t;
        passeH = Math.sin(Math.PI * t) * 0.4;
      }
      const enPasse = passeX != null;
      // Position d'affichage du ballon pendant les phases statiques (mêlée /
      // touche) : le ballon est sur la MARQUE (base de la mêlée, marque de
      // touche), PAS « dans les mains » d'un joueur encore loin — sinon il se
      // téléporte vers ce joueur au début de la phase (jusqu'à ~40 m observés à
      // la touche) puis en revient. Pendant un vol (lancer de touche, coup de
      // pied), le vol prime (géré au-dessus via enVol). Le porteur réel reste
      // inchangé côté logique ; ceci ne concerne QUE l'affichage du ballon.
      let ballonPhaseX = null, ballonPhaseY = null;
      if (!enVol && !enPasse && !auSolLoose) {
        if (this.phase === 'MELEE' && this.melee) {
          // Le VRAI ballon de la mêlée (P2-64) : mains du 9, vol d'introduction,
          // puis au sol sous le pack jusqu'aux pieds du 8.
          const b = this.melee.balle;
          ballonPhaseX = b ? b.x : this.melee.x; ballonPhaseY = b ? b.y : this.melee.y;
        } else if (this.phase === 'TOUCHE') {
          ballonPhaseX = this.toucheLanceurX != null ? this.toucheLanceurX : this.ruckPoint.x;
          ballonPhaseY = this.toucheLanceurY != null ? this.toucheLanceurY : this.ruckPoint.y;
        } else if (this.phase === 'RUCK' && this.ruckPoint) {
          // Ballon au sol au point de regroupement, jamais « dans les mains » du
          // joueur plaqué : sans cet ancrage, le ballon suivait la position du
          // porteur (this.porteur.x/y plus bas). Le plaqué pouvant désormais
          // ramper pour s'écarter (loi 14, cf. _tickRuck), le ballon le suivrait
          // s'il n'était pas fixé ici au point de ruck.
          ballonPhaseX = this.ruckPoint.x; ballonPhaseY = this.ruckPoint.y;
        }
      }
      if (!enVol && !enPasse && !auSolLoose && this._remiseBallon
        && (this.phase === 'PENALITE_TIR' || this.phase === 'TRANSFORMATION' || (this.phase === 'PORTE' && this._remiseBallon.marque))) {
        ballonPhaseX = this._remiseBallon.x; ballonPhaseY = this._remiseBallon.y;
      }
      const enPhaseStatique = ballonPhaseX != null;
      const ballonX = enVol || auSolLoose ? this.ballonVolX : enPasse ? passeX : enPhaseStatique ? ballonPhaseX : this.porteur.x;
      const ballonY = enVol || auSolLoose ? this.ballonVolY : enPasse ? passeY : enPhaseStatique ? ballonPhaseY : this.porteur.y;
      // Dernière position AFFICHÉE (cf. _debutRemiseBallon) : n'influence que
      // l'affichage, la simulation reste identique avec ou sans getState.
      this._ballonAffiche = { x: ballonX, y: ballonY, n: this._numTick || 0 };
      return {
        equipeA: this.equipeA.map(j => ({ ...j })),
        equipeB: this.equipeB.map(j => ({ ...j })),
        porteur: { team: this.porteur.team, numero: this.porteur.numero, x: this.porteur.x, y: this.porteur.y },
        // Position réelle du ballon : en vol pendant un coup d'envoi (avec une
        // hauteur 0..1 pour figurer la cloche), au sol après un coup de pied
        // tactique tant que personne ne l'a rejoint, sinon dans les mains du
        // porteur. Conservé pour compatibilité avec le rendu existant.
        ballon: enVol
          ? { x: this.ballonVolX, y: this.ballonVolY, enVol: true, hauteur: this.ballonVolHauteur }
          : (this.phase === 'MELEE' && this.melee && this.melee.balle && this.melee.balle.h > 0)
            // Introduction (P2-64) : le ballon vient de quitter les mains du 9.
            ? { x: ballonX, y: ballonY, enVol: true, hauteur: this.melee.balle.h }
          : enPasse
            ? { x: passeX, y: passeY, enVol: true, hauteur: passeH }
            : { x: ballonX, y: ballonY, enVol: false, hauteur: 0, ...this._rebondBallon() },
        // Objet ballon normalisé : { x, y, vx, vy, state, carrierTeam, carrierNumber }.
        // À terme, c'est cette forme qui doit devenir la source de vérité côté
        // rendu (docs/js/renderer.js) ; `ballon`/`porteur` restent en place tant
        // que la migration du rendu n'est pas terminée.
        ball: {
          x: ballonX,
          y: ballonY,
          vx: bvx, vy: bvy,
          state: enPasse ? 'AIR' : this._etatBallon(),
          carrierTeam: enVol || auSolLoose || enPasse || enPhaseStatique ? null : this.porteur.team,
          carrierNumber: enVol || auSolLoose || enPasse || enPhaseStatique ? null : this.porteur.numero,
        },
        arbitre: { x: this.arbitrePos.x, y: this.arbitrePos.y },
        possession: this.possession,
        phase: this.phase,
        // Remise en jeu en cours depuis la ligne des 22 m (cf. _nouvelleManche).
        renvoi22: this.phase === 'COUP_ENVOI' && !!this.renvoi22,
        renvoiEnBut: this.phase === 'COUP_ENVOI' && !!this.renvoiEnBut,
        // État détaillé du maul en cours (null hors maul), pour l'affichage.
        maul: this.maul ? { etat: this.maul.etat, x: this.maul.x, y: this.maul.y } : null,
        // État détaillé de la mêlée en cours (null hors mêlée), pour l'affichage.
        melee: this.melee ? { etat: this.melee.etat, x: this.melee.x, y: this.melee.y,
          balle: this.melee.balle ? { etat: this.melee.balle.etat, x: this.melee.balle.x, y: this.melee.balle.y } : null } : null,
        // État du ruck en cours (null hors ruck), pour l'affichage/les tests.
        ruck: this.phase === 'RUCK' ? {
          x: this.ruckPoint.x, y: this.ruckPoint.y,
          attackingTeam: this.possession,
          defendingTeam: this.possession === 'A' ? 'B' : 'A',
          attackersCommitted: [...this.equipeA, ...this.equipeB]
            .filter(j => j.team === this.possession && j !== this.porteur && distance(j, this.ruckPoint) < 8).length,
          defendersCommitted: [...this.equipeA, ...this.equipeB]
            .filter(j => j.team !== this.possession && j.auSol === 0 && distance(j, this.ruckPoint) < 8).length,
          timer: this.timerPhase,
          ballAvailable: this.timerPhase >= 1.2,
        } : null,
        score: { ...this.score },
        tempsMatch: this.tempsMatch,
        dureeMatch: this.dureeMatch,
        periode: (this.prolongationJouee && this.tempsMatch >= this.dureeReglementaire) ? 3 : this.miTempsJouee ? 2 : 1,
        prolongationJouee: !!this.prolongationJouee,
        departage: this.departage || null,
        events: this.events.slice(),
        chronologie: this.chronologie.slice(),
        // Statistiques agrégées réelles (cf. constructeur) : pour outillage de
        // calibrage (simulateBatch) et affichage éventuel, jamais recalculées
        // après coup à partir d'autre chose que ces compteurs.
        stats: { A: { ...this.stats.A }, B: { ...this.stats.B } },
        // Statistiques PAR JOUEUR (numéro -> compteurs), même principe que
        // ci-dessus mais ventilé individu par individu (cf. _statJoueur).
        statsJoueurs: {
          A: Object.fromEntries(Object.entries(this.statsJoueurs.A).map(([n, s]) => [n, { ...s }])),
          B: Object.fromEntries(Object.entries(this.statsJoueurs.B).map(([n, s]) => [n, { ...s }])),
        },
        // Lignes closes des joueurs remplacés, dans l'ordre des sorties, et les
        // remplacements réellement effectués (BUG-RM-007).
        statsJoueursSortis: {
          A: this.statsJoueursSortis.A.map((x) => ({ numero: x.numero, sortie: x.sortie, stats: x.stats ? { ...x.stats } : null })),
          B: this.statsJoueursSortis.B.map((x) => ({ numero: x.numero, sortie: x.sortie, stats: x.stats ? { ...x.stats } : null })),
        },
        remplacementsEffectues: this.remplacementsEffectues.map((r) => ({ ...r })),
        tempsJeuEffectif: this.tempsJeuEffectif,
        // % de possession réel, calculé à partir du temps de jeu effectif
        // accumulé par équipe (this.tempsPossession), pas un chiffre fixé :
        // 50/50 tant qu'aucune seconde de jeu effectif n'a encore eu lieu.
        possessionPct: this.tempsJeuEffectif > 0 ? {
          A: Math.round((this.tempsPossession.A / this.tempsJeuEffectif) * 100),
          B: Math.round((this.tempsPossession.B / this.tempsJeuEffectif) * 100),
        } : { A: 50, B: 50 },
        // % d'occupation réel (où s'est joué le match), calculé à partir de la
        // position du ballon accumulée par équipe (this.tempsOccupation).
        occupationPct: this.tempsJeuEffectif > 0 ? {
          A: Math.round((this.tempsOccupation.A / this.tempsJeuEffectif) * 100),
          B: Math.round((this.tempsOccupation.B / this.tempsJeuEffectif) * 100),
        } : { A: 50, B: 50 },
      };
    }
  }

  // `Referee` est EXPORTE pour que les tests puissent enoncer les lois
  // elles-memes plutot que de les deviner a travers des statistiques de match.
  // Sans cela, une loi pouvait etre neutralisee sans qu'aucun test ne bronche :
  // en supprimant la sanction de la passe en avant, la suite restait verte
  // parce que le seul test concerne ne posait qu'une borne HAUTE (« pas plus
  // de 4 passes en avant par match »), satisfaite a zero.
  return { MatchEngine, Referee, LONGUEUR, LARGEUR, creerRng, distance, DEFAULT_CONFIG, fusionnerConfig,
    tirerSauteurPondere, forceTouche, probaVolTouche, COEF_LISIBILITE_TOUCHE,
    effetPousseeMelee, dureeSortieRuck, GAIN_SERVICE_RAPIDE_RUCK,
    CHRONOLOGIE_MAX, TYPES_CHRONOLOGIE };
});
