# Règles du rugby appliquées par le moteur — référence et écarts connus

Ce document liste les règles réelles du rugby à 15 qui s'appliquent au déroulé
d'un match, avec en regard ce que `engine/rugby-engine.js` implémente
effectivement. Objectif : éviter de réintroduire par erreur un comportement
qui ne respecte pas les lois du jeu (ce qui est arrivé plusieurs fois — score
non conforme, coup d'envoi absent, mêlée mal placée, hors-jeu au ruck jamais
sifflé). Quand le moteur simplifie une règle, c'est noté explicitement.

Numérotation des lois selon World Rugby (« Laws of the Game »).

## 1. Score (Law 8 / Law 9)

| Action | Points | Implémenté |
|---|---|---|
| Essai | 5 | ✅ `ESSAI`, +5 |
| Transformation réussie | 2 | ✅ `TRANSFORMATION_REUSSIE`, +2 |
| Pénalité au but réussie | 3 | ✅ `PENALITE_REUSSIE`, +3 |
| Drop-goal | 3 | ✅ `DROP_GOAL_REUSSI`, +3 (l'équipe en possession dans la zone de tir 8–38 m travaille le ballon pour son ouvreur qui tente un drop en jeu courant, ~1,4 tentative/match, cf. `_tickPorte`) |
| Essai de pénalité | 7 | ✅ `ESSAI_PENALITE`, +7 (faute à ≤ 5 m de la ligne d'en-but empêchant un essai probable, sans transformation, cf. `_traiterPenalite`) |

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
  (loi 11) → coup franc `COUP_FRANC` (cf. `_traiterCoupFranc`), jeu rapide à la
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
  ruck, côté de leur propre en-but) ; délai de grâce de 1.5 s avant
  sanction (`delaiGrace`), pour laisser un temps de réaction réaliste avant
  de siffler.
- ⚠️ Simplifié : pas de notion de « porte d'entrée » au ruck (entrer par les
  côtés), pas de ruck prolongé/jackal différencié — résolu de façon agrégée
  après 1.8 s (`timerPhase >= 1.8`).

## 4. Maul (Law 17 — Maul)

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
- ✅ **Formation (loi 17)** : sur un plaquage où le porteur reste debout avec un
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
- ✅ **Use it / ballon injouable (loi 8)** : après « use it », le demi de mêlée
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

## 5. Options sur pénalité (Law 19–21 — Penalty and free kick options)

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

## 6. Touche en jeu courant (Law 18/19 — Touch and Line-out)

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

## 7. Mêlée sur faute de jeu (Law 19 — Forward pass / Knock-on)

Règle réelle : passe en avant ou en-avant (ballon qui part vers l'avant
depuis les mains ou touché en avant) → mêlée pour l'équipe non fautive à
l'endroit de la faute (sauf avantage).

Implémenté (`MELEE_AVANT`, `MELEE_ENAVANT`) : ✅ mêlée simplifiée déclenchée,
pas de contestation de mêlée joueur par joueur (résolution agrégée).

## 8. Hors scope explicite (non modélisé du tout)

- Le carton rouge (exclusion définitive) n'est pas modélisé — seul le carton
  jaune existe, avec sin-bin réel (cf. section 4).
- 50:22, jeu au pied tactique avancé (chandelles, grubber).
- Avantage prolongé (l'avantage n'est pas modélisé comme une fenêtre
  temporelle distincte ; cf. tap-and-go immédiat dans `_traiterPenalite`).
- TMO / arbitrage vidéo.

Voir aussi `docs/SPEC_MOTEUR_MATCH.md` pour l'architecture générale du moteur
(obsolète sur le plan technique — décrit une conception C++ jamais
implémentée — mais toujours pertinent pour l'intention de conception).
