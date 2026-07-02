# Règles du rugby appliquées par le moteur — référence et écarts connus

Ce document liste les règles réelles du rugby à 15 qui s'appliquent au déroulé
d'un match, avec en regard ce que `engine/rugby-engine.js` implémente
effectivement. Objectif : éviter de réintroduire par erreur un comportement
qui ne respecte pas les lois du jeu (ce qui est arrivé plusieurs fois — score
non conforme, coup d'envoi absent, mêlée mal placée, hors-jeu au ruck jamais
sifflé). Quand le moteur simplifie une règle, c'est noté explicitement.

Numérotation des lois selon World Rugby (« Laws of the Game », édition 2025 —
texte intégral dans `rules/world-rugby-laws-2025.pdf` /
`rules/world-rugby-laws-2025.txt`, qui font foi en cas de doute sur un numéro
de loi).

## 1. Score (Law 8 — Scoring ; Law 9 — Foul play pour l'essai de pénalité)

| Action | Points | Implémenté |
|---|---|---|
| Essai | 5 | ✅ `ESSAI`, +5 |
| Transformation réussie | 2 | ✅ `TRANSFORMATION_REUSSIE`, +2 |
| Pénalité au but réussie | 3 | ✅ `PENALITE_REUSSIE`, +3 |
| Drop-goal | 3 | ✅ `DROP_GOAL_REUSSI`, +3 (l'équipe en possession dans la zone de tir 8–38 m travaille le ballon pour son ouvreur qui tente un drop en jeu courant, ~1,4 tentative/match, cf. `_tickPorte`) |
| Essai de pénalité | 7 | ✅ `ESSAI_PENALITE`, +7 (faute à ≤ 5 m de la ligne d'en-but empêchant un essai probable, sans transformation, cf. `_traiterPenalite`), **toujours accompagné d'un carton jaune** (`CARTON_JAUNE`) pour le défenseur le plus proche de la faute |

## 2. Coup d'envoi et remises en jeu (Law 12 — Kick-off and restart kicks)

Règles réelles :
- En début de match : coup d'envoi depuis le centre du terrain.
- **Mi-temps : les adversaires de l'équipe qui a donné le coup d'envoi en
  début de match donnent le coup d'envoi de la 2e période**, à nouveau depuis
  le centre du terrain.
- **Après un essai/une transformation (réussie ou pas) ou une pénalité au but
  réussie : c'est l'équipe qui VIENT DE SUBIR les points qui botte** (donc
  l'équipe qui a marqué récupère le jeu en réception, pas l'inverse).
- L'équipe qui botte doit avoir tous ses joueurs derrière le ballon au moment
  du coup de pied ; l'équipe qui reçoit doit rester à 10 m minimum.
- Le ballon doit parcourir au moins 10 m et rester dans le terrain de jeu,
  sinon mêlée pour l'équipe adverse au centre (ou option de retaper).
- **Après une pénalité au but ratée qui sort en touche de but / ballon mort
  en-but** : remise en jeu aux 22 m (« 22 m drop-out »), bottée par l'équipe
  qui défendait, depuis sa propre ligne des 22 m — ce n'est PAS un coup
  d'envoi au centre.

Implémenté (`_nouvelleManche`, `_tickCoupEnvoi`, phase `COUP_ENVOI`) :
- ✅ L'équipe qui vient de marquer (essai+transfo, ou pénalité réussie) est
  désignée `equipeReceptrice` ; l'adversaire botte (`_tickTransformation`,
  `_tickPenaliteTir`).
- ✅ Pénalité ratée → remise en 22 m bottée par l'équipe qui défendait
  (`x22 = ligneEssaiAdverse - sensEquipe * 22`), distincte du coup d'envoi
  central.
- ✅ Mi-temps : `dureeMiTemps` (= durée du match / 2) déclenche un événement
  `MI_TEMPS`, suivi d'une courte pause (phase `MI_TEMPS`, `_tickMiTemps`) puis
  d'un coup d'envoi central donné par l'équipe adverse de celle qui avait
  donné le coup d'envoi du match (`equipeKickPremiereMiTemps`, mémorisée à la
  construction du match).
- ✅ Positionnement : équipe qui botte derrière le ballon, équipe receveuse
  au-delà de 10 m.
- ✅ Le ballon est réellement **botté en cloche** : il vole seul depuis le point
  de coup d'envoi vers sa cible (trajectoire paramétrée, hauteur en sinus pour
  figurer la chandelle), le botteur reste sur place ; ce n'est pas un joueur qui
  court avec le ballon. À la retombée, un joueur le capte (`ballonEnVol`,
  `ballonVolHauteur`, exposés par `getState().ballon` pour le rendu).
- ✅ Réception : l'équipe receveuse, déjà placée sous la chandelle, récupère
  quasiment toujours le ballon ; une reprise par les chasseurs reste possible
  uniquement si l'un d'eux arrive réellement au point de chute (charge-down),
  ce qui est rare — l'équipe qui botte ne « gagne » donc plus son propre coup
  d'envoi par défaut.
- ✅ Coup d'envoi/remise en jeu trop court (ballon qui ne franchit pas les
  10 m, événement `COUP_ENVOI_COURT`, ~6 % des coups d'envoi/remises en jeu) :
  mêlée au centre pour l'équipe qui n'a pas botté (`_accorderMelee`), comme le
  prévoit la loi.
- ✅ Coup d'envoi profond (`coupEnvoiProfond`, ~18 % des coups d'envoi) : botté
  loin vers les 22 m adverses ; c'est le seul cas où le receveur capte le
  ballon dans son propre en-deçà des 22 m et peut alors demander une **marque**
  (loi 17 — Mark) → coup franc `COUP_FRANC` (cf. `_traiterCoupFranc`), jeu rapide à la
  main sans option de tir au but.
- ⚠️ Simplifié : pas d'option de retaper en cas de coup d'envoi trop court ou
  envoyé directement en touche (seule la conséquence « mêlée au centre » est
  modélisée, pas le choix entre les deux), pas de cas spécifique pour un
  coup d'envoi qui atterrit directement dans l'en-but.
- ❌ **Non implémenté : le « goal-line drop-out »**, remise en jeu depuis la
  ligne d'en-but (distincte du 22 m drop-out) après certaines actions
  d'attaque bloquées dans l'en-but adverse. Écart connu, non traité ici.
- ⚠️ Changement de camp à la mi-temps : non modélisé (les deux équipes
  continuent d'attaquer dans le même sens après la pause), volontairement
  hors du périmètre de cette correction centrée sur la loi 12 (qui régit le
  coup d'envoi, pas le choix de camp).

## 3. Ruck et hors-jeu (Law 15 — Ruck)

Règle réelle (révision 2024+) : la ligne de hors-jeu de chaque équipe au ruck
passe par **le point le plus reculé** (« hindmost point », plus seulement
« hindmost foot ») de tout joueur de cette équipe engagé dans le ruck. Un
joueur non engagé qui franchit cette ligne vers le jeu est hors-jeu →
pénalité.

Implémenté (`Referee.horsJeuRuck`, `_tickRuck`) :
- ✅ Ligne de hors-jeu calculée à partir du point de ruck (`ruckPoint`) et du
  sens d'attaque.
- ✅ Joueurs hors-jeu doivent se replier vers la zone onside (au-delà du
  ruck, côté de leur propre en-but) ; délai de grâce avant sanction
  (`delaiGrace`), pour laisser un temps de réaction réaliste avant de
  siffler.
- ⚠️ Simplifié : pas de notion de « porte d'entrée » au ruck (entrer par les
  côtés), pas de ruck prolongé/jackal différencié — résolu de façon agrégée
  après une durée cible tirée par paliers (`ruckDureeCible`) : 55 % de
  rucks rapides (2-4 s), 30 % de rucks moyens (4-7 s), 15 % de rucks lents
  (7-11 s). Comme tous les autres délais d'arrêt de jeu du moteur
  (carton, sortie de mêlée, célébration d'essai...), cette durée et le
  délai de grâce de hors-jeu sont mis à l'échelle par `_echelleArret`
  (`dureeMatch / 4800`, plancher 0.15) pour rester proportionnels sur un
  match raccourci plutôt que de figer un ruck à sa durée « 80 minutes »
  sur une partie de démonstration de quelques minutes.

## 4. Maul (Law 16 — Maul)

Règle réelle : un maul se forme quand le porteur du ballon est tenu/contesté
mais **reste sur ses appuis** (pas amené au sol), qu'au moins un adversaire est
lié à lui et qu'au moins un coéquipier se lie — à la différence du ruck, où le
ballon est au sol. Ligne de hors-jeu au dernier pied de chaque équipe. Un maul
peut avancer, s'arrêter, repartir ; s'il s'arrête durablement, l'arbitre
annonce « use it » et l'équipe doit jouer le ballon sous 5 s, sinon mêlée. Les
écroulements volontaires, entrées sur le côté et hors-jeu sont sanctionnés
(pénalité, carton, voire essai de pénalité près de la ligne).

Implémenté comme une **machine à états complète** (`_formerMaul`, `_tickMaul` et
ses fonctions dédiées ; états dans `ETATS_MAUL`) :
- ✅ **Formation (loi 16)** : sur un plaquage où le porteur reste debout avec un
  soutien lié, `Referee.maulForme(...)` vérifie les conditions (porteur debout,
  adversaire lié et debout, coéquipier lié, ballon en main, dans le champ de
  jeu) avant de créer le maul. Volontairement occasionnel (≈3,5 % des plaquages,
  ~20 mauls/match) : un maul est une action plus rare qu'un ruck.
- ✅ **États** : `MAUL_FORMING → MAUL_ACTIVE → MAUL_MOVING`, puis selon le jeu
  `MAUL_FIRST_STOP` (annonce « use it once », 5 s pour repartir, une relance
  autorisée) → `MAUL_SECOND_STOP` → `MAUL_USE_IT` (compteur 5 s) →
  `MAUL_ENDED` (ballon sorti) ou `MAUL_UNPLAYABLE` (mêlée). Événements visibles :
  `MAUL`, `MAUL_ARRET_UN`, `MAUL_ARRET_DEUX`, `MAUL_USE_IT`, `MAUL_BALLON_SORTI`,
  `MAUL_INJOUABLE`.
- ✅ **Poussée collective** (`_maulCalculerPoussee`) : avancée nette issue du
  déséquilibre des forces des deux paquets liés (`forceMaul`, avants > arrières),
  bornée et bruitée — jamais un gain garanti. Le ballon est transféré à l'arrière
  du maul ; un maul réellement pénétrant peut marquer un essai (`_maulEssai`),
  mais c'est rare car la défense le stoppe le plus souvent.
- ✅ **Liaisons / IA** (`_maulGererLiaisons`) : les avants liés poussent dans
  l'axe (attaque derrière le ballon, défense devant), les joueurs non engagés se
  replient derrière leur ligne de hors-jeu.
- ✅ **Use it / ballon injouable (loi 16)** : après « use it », le demi de mêlée
  sort le ballon (retour au jeu courant) ; s'il reste bloqué plus de 5 s →
  **mêlée à l'équipe qui n'avait pas le ballon au début du maul**, *sauf* si le
  maul a suivi une réception directe d'un coup de pied adverse (`_receptionDirecte`),
  auquel cas la mêlée revient au réceptionneur.
- ✅ **Fautes et sanctions** (`_maulDetecterHorsJeu`, `_maulDetecterFautes`,
  `_maulSanctionner`) : écroulement volontaire, entrée sur le côté, joueur non
  lié qui pousse, saut sur le maul, obstruction, détachement illégal, joueur au
  sol, hors-jeu (défenseur qui contourne). Taux faibles en jeu courant, plus
  élevés près de la ligne (écroulement cynique). Décision graduée : pénalité
  simple ; **carton jaune** (`CARTON_JAUNE`) si la faute délibérée est commise
  près de la ligne ou répétée ; **essai de pénalité** (`ESSAI_PENALITE`, +7) si
  une faute délibérée empêche un maul lancé qui allait probablement marquer.
- ✅ Le carton jaune entraîne désormais une **exclusion temporaire réelle**
  (`sinBin`, 10 min ramenées à l'échelle du match via `_echelleArret`) : le
  joueur fautif est retiré de `attaquants()`/`defenseurs()`, donc des phases de
  jeu courant (porteur, soutien, défense, passes) — son équipe joue réellement
  à 14. ⚠️ Simplifié : le fautif retenu est le joueur de l'équipe sanctionnée le
  plus proche du maul (faute d'identifier l'auteur exact), et il réapparaît
  encore dans les formations de mêlée/touche/coup d'envoi qui lisent
  directement `equipeA`/`equipeB` sans passer par ce filtre. Les liaisons sont
  gérées de façon agrégée (5 avants par camp), sans modéliser chaque bras.

## 5. Options sur pénalité (Law 20 — Penalty and free kick)

Règle réelle : l'équipe qui obtient une pénalité a le choix entre :
1. Tir au but (3 points si réussi).
2. **Coup de pied de pénalité en touche** — particularité importante : à la
   différence d'une sortie en touche en jeu courant (où c'est l'équipe qui
   n'a pas tapé qui a le lancer), **sur une pénalité jouée en touche, c'est
   l'équipe qui a botté qui conserve le lancer en touche**.
3. Mêlée à l'endroit de la faute.
4. Jeu rapide à la main ou au pied (tap-and-go / quick tap).

Implémenté (`_traiterPenalite`, `_accorderPenaliteTouche`) :
- ✅ Essai de pénalité : si la faute est commise à ≤ 5 m de la ligne d'en-but
  (essai probable empêché), 7 points sont accordés directement
  (`ESSAI_PENALITE`), sans tir ni transformation, puis coup d'envoi adverse.
  Le joueur fautif (le défenseur le plus proche du point de la faute) reçoit
  systématiquement un carton jaune (`CARTON_JAUNE`), comme en match réel où
  une faute délibérée qui empêche un essai quasi certain vaut un carton en
  plus des points.
- ✅ **Pénalité en touche**, avec conservation du lancer par l'équipe qui a
  botté (contrairement à une touche en jeu courant) : choisie quand le but est
  hors de portée de tir réaliste (> 45 m, probabilité `0.35`), ou pour chercher
  un maul tout près de la ligne adverse (5–22 m, probabilité `0.15`) plutôt que
  les 3 points. Réutilise le contest de touche normal (cf. section 6).
- ✅ Tir au but si la position est dans la zone de tir réaliste (`enZoneDeTir`,
  5–45 m) avec une probabilité de tenter (`0.55`).
- ✅ Sinon, jeu rapide à la main (tap-and-go), le porteur avance de 8 m.
- ❌ **Non implémenté : option « mêlée sur pénalité »**. Écart connu et
  volontairement différé (hors tir au but/touche, le seul autre choix
  modélisé est le jeu à la main).

## 6. Touche en jeu courant (Law 18 — Touch, quick throw and lineout)

Règle réelle : quand le ballon (ou le porteur) sort en touche en jeu courant,
le lancer est pour l'équipe qui N'A PAS fait sortir le ballon.

Implémenté (`_accorderTouche`, `_tickTouche`) :
- ✅ Touche accordée à l'équipe adverse de celle qui a porté le ballon en
  touche (`event.message` : « touche pour l'équipe adverse »), sauf sur
  pénalité jouée en touche où le lancer reste à l'équipe qui a botté
  (cf. section 5, `_accorderPenaliteTouche`).
- ✅ **Contestation réelle du lancer** (`_tickTouche`) : un contest au saut est
  résolu selon la force des avants engagés de chaque équipe (`forceMaul`,
  même proxy que ruck/maul/mêlée) — le lanceur ne conserve pas
  systématiquement son propre lancer ; une touche volée par la défense
  compte en `turnovers`. ⚠️ Simplifié : pas de modélisation individuelle du
  sauteur/lanceur/soutien, juste une probabilité agrégée par paquet.

## 7. Mêlée (Law 19 — Scrum)

Règle réelle : passe en avant ou en-avant (ballon qui part vers l'avant
depuis les mains ou touché en avant), ruck/maul devenu injouable → mêlée
pour l'équipe non fautive à l'endroit de la faute (sauf avantage). La
mêlée pit 8 avants contre 8, le demi de mêlée introduit le ballon dans le
tunnel, le talonneur tente de le crocheter, et le ballon ressort au pied du
n°8 vers la sortie de balle.

Offload (Law 11/14) : un porteur plaqué mais pas encore au sol peut
transmettre le ballon à un soutien tout proche (`_tickPorte`, mécanique de
contact) pour garder le jeu vivant. Comme toute passe, l'offload est soumis à
la règle de la passe en avant : le receveur doit être à hauteur ou en retrait
(`(receveur.x - porteur.x) * sensAttaque <= 0.3`, même seuil que
`Referee.passeEnAvant`), sinon le soutien n'est pas retenu — un offload ne
peut jamais aller vers l'avant.

Implémenté (`ETATS_MELEE`, `_formerMelee`, `_tickMelee`, et les méthodes
`_melee*`) : ✅ machine à états complète, plusieurs secondes, pas de tirage
aléatoire instantané :

1. **FORMATION** : les deux paquets se placent face à face de part et
   d'autre du point de mêlée (`_meleePlacerPaquets`, avants groupés près du
   point, arrières à ~7,5 m derrière leur ligne de hors-jeu réglementaire,
   soit 5 m derrière le pied le plus reculé, loi 19.31).
2. **CROUCH → BIND → SET** : séquence des commandes d'arbitre, journalisée
   dans le fil d'événements (`MELEE_CROUCH`, `MELEE_BIND`, `MELEE_SET`) ;
   les paquets se resserrent progressivement à chaque appel.
3. **INTRODUCTION** : le demi de mêlée introduit le ballon (`MELEE_INTRODUCTION`).
4. **CONTESTATION** : un différentiel de poussée (`_meleeFacteurs`) combine
   force des piliers, puissance globale du paquet (`forceMaul`, même proxy
   que ruck/maul/touche), technique du talonneur, moral (écart au score),
   conditions de terrain et avantage structurel de l'introduction ; il fait
   dériver le point de mêlée et accumule une rotation (`_meleeAvancerPoussee`).
   Issue résolue après quelques secondes (`_meleeResoudreContestation`) :
   ballon gagné proprement, gagné sous pression, poussée dominante (le paquet
   adverse est repoussé), ou — rare — ballon volé contre l'introduction
   (turnover).
5. **SORTIE** : le demi de mêlée sort le ballon (`MELEE_BALLON_SORTI`,
   relais vers l'IA de décision existante via `_neufVersDix` : passe, jeu au
   pied, jeu au large selon la situation) ou le n°8 ramasse et part au
   contact (`MELEE_PICK_AND_GO`, plus probable après une poussée dominante).
   Si le ballon reste trop longtemps, l'arbitre annonce « use it »
   (`MELEE_USE_IT`) puis force la sortie.
- ✅ **Fautes simulées** (`_meleeDetecterFautes` / `_meleeSanctionner`) :
  poussée avant l'introduction, liaison incorrecte, introduction non
  droite, écroulement volontaire (pénalité, carton jaune si répété ou près
  de la ligne, essai de pénalité si l'écroulement empêche un essai
  certain), pilier qui pousse en travers (« boring in »), joueur de
  première ligne qui se relève, ballon bloqué au pied du n°8 (mêlée à
  refaire sans sanction), hors-jeu des lignes arrières, mêlée qui tourne de
  plus de 90° (à refaire).
- ⚠️ Simplifié : pas de modélisation individuelle joueur par joueur de
  chaque liaison ; la contestation est un différentiel agrégé par paquet,
  comme pour le ruck/maul/touche.

## 8. Hors scope explicite (non modélisé du tout)

- Le carton rouge (exclusion définitive) n'est pas modélisé — seul le carton
  jaune existe, avec sin-bin réel (cf. section 4).
- 50:22, jeu au pied tactique avancé (chandelles, grubber).
- Avantage prolongé (l'avantage n'est pas modélisé comme une fenêtre
  temporelle distincte ; cf. tap-and-go immédiat dans `_traiterPenalite`).
- TMO / arbitrage vidéo.

## 9. Statistiques — définitions World Rugby (game analysis)

Les statistiques de match du moteur (`_statsVierges`, exposées par `getState().stats`
et affichées dans le panneau « Stats ») sont alignées sur les définitions officielles
World Rugby (game analysis definitions). **Toutes sont issues d'actions réellement
jouées dans la simulation — aucune n'est fabriquée.**

| Stat moteur | Définition World Rugby | Où c'est compté |
|---|---|---|
| `carries` (Courses au contact) | Un joueur qui, ballon en main, **engage le contact** avec l'adversaire | `_tickPorte`, à l'entrée du contact (distance défenseur < 2,2 m) |
| `passes` / `passesTentees` | Lancer du ballon (hors lancer de touche / introduction en mêlée) | passe réussie / tentée (`_tenterPasse`, combinaisons) |
| `offloads` | Passe effectuée **pendant** le plaquage | `_tickPorte`, offload dans le contact |
| `tacklesMade` / `missedTackles` | Plaquage réussi (le plaqueur amène le porteur au sol) / manqué | résolution du plaquage |
| `defenseursBattus` (Défenseurs battus) | Défenseur **battu** par le porteur (côté attaque = plaquage manqué subi) | à chaque `PLAQUAGE_MANQUE` |
| `turnovers` / `turnoversConcedes` | Ballon **gagné** / **perdu** (perte de possession en jeu : grattage, vol) | ruck, mêlée volée, touche volée |
| `phases` (Phases jouées) | Nombre de **rucks + mauls** de la possession (une phase par regroupement) | à chaque formation de ruck/maul |
| `metresGagnes` | Mètres gagnés **ballon en main** dans le sens d'attaque | course du porteur (`_tickPorte`) |
| `kicks` | Coup de pied en jeu (hors pénalités / coups francs) | `_tenterCoupDePiedJeu` |
| possession % / occupation % | % de temps de contrôle du ballon / d'occupation territoriale | `tempsPossession` / `tempsOccupation` |

### Motifs de jeu discriminants (étude rorybunker/rugby-sequences)

Une étude de fouille de motifs séquentiels sur des matchs réels (Japan Top League)
identifie les motifs qui distinguent le mieux **marquer** de **encaisser** :
franchissements, touches gagnées, coups de pied regagnés, jeu multi-phases et
sorties de camp ratées. Le moteur suit ces motifs (stats réelles) :

| Stat moteur | Motif | Comptage |
|---|---|---|
| `franchissements` | Line break : le porteur bat un défenseur ET se retrouve en espace (prochain défenseur > 12 m) | au plaquage manqué en espace |
| `kicksRegagnes` | Coup de pied regagné : l'équipe qui botte récupère son propre coup de pied | à la réception |
| `exits` / `exitsRates` | Sortie de camp (kick depuis son 22 m) / sortie **ratée** (ne dégage pas au-delà des 22 m) | au coup de pied |
| `phases` | Jeu multi-phases (rucks + mauls) | cf. tableau ci-dessus |
| `lineoutsGagnes` | Touches gagnées | à la touche |

Corrélation vérifiée dans la simulation (60 matchs) conforme à l'étude : l'équipe
qui l'emporte a **plus de franchissements** (1,7 vs 1,0) et **moins de sorties
ratées** (0,0 vs 0,3) que celle qui encaisse.

Comportement aligné sur la définition : le **plaquage** amène le porteur au sol **et
le plaqueur va aussi au sol** — le plaqueur est donc dessiné brièvement couché
(marqueur visuel `solVisuel`, purement graphique : le figer côté jeu retirait un
défenseur et faisait monter les essais, cf. commentaire moteur).

Voir aussi `docs/SPEC_MOTEUR_MATCH.md` pour l'architecture générale du moteur
(obsolète sur le plan technique — décrit une conception C++ jamais
implémentée — mais toujours pertinent pour l'intention de conception).
