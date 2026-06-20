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
| Drop-goal | 3 | ❌ non modélisé (pas de tentative de drop-goal en jeu courant) |

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
  au-delà de 10 m, ballon réellement animé en vol vers une cible aléatoire
  (12 à 27 m), contesté à la réception.
- ⚠️ Simplifié : pas de règle « ballon qui ne parcourt pas 10 m » (le ballon
  va toujours au-delà), pas d'option de retaper, pas de mêlée au centre en
  cas de coup d'envoi raté/non réglementaire. La réception favorise l'équipe
  receveuse (≈ 12 % de récupération par l'équipe qui a botté), calibré pour
  rester réaliste sans modéliser le détail des courses de couverture.
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

Règle réelle : un maul se forme quand le porteur du ballon est plaqué/contesté
mais **reste sur ses appuis** (pas amené au sol) et qu'au moins un partenaire
se lie à lui — à la différence du ruck, où le ballon est au sol. Même ligne de
hors-jeu que le ruck (point le plus reculé). Le maul est l'une des quatre
phases de regroupement citées dans la plupart des présentations grand public
du jeu (avec touche, mêlée et ruck).

Implémenté (`_tickMaul`, déclenché depuis `_tickPorte`) :
- ✅ Sur un plaquage réussi, si un soutien attaquant est déjà à moins de 3 m,
  il y a une chance (30 %) que le jeu forme un maul (`phase = 'MAUL'`) plutôt
  qu'un ruck — le ballon reste en main (`porteur.auSol` n'est pas activé),
  contrairement au ruck où il est posé au sol.
- ✅ Même ligne de hors-jeu et même logique de repli/pénalité que le ruck
  (réutilise `Referee.horsJeuRuck`).
- ⚠️ Volontairement sans avancée de terrain automatique ni taux de turnover
  différent du ruck : une première version donnait au maul une avancée nette
  garantie (≈2.6 m) à faible risque, ce qui en faisait un raccourci vers
  l'essai et faisait presque tripler le nombre d'essais sur une simulation de
  test — ce comportement a été retiré. Sans modéliser la poussée comparée des
  deux paquets (forces, nombre de joueurs liés), le maul est donc, en net,
  équivalent au ruck en termes de risque/possession ; seule sa représentation
  (ballon en main, pas au sol) et son déclenchement diffèrent.

## 5. Options sur pénalité (Law 19–21 — Penalty and free kick options)

Règle réelle : l'équipe qui obtient une pénalité a le choix entre :
1. Tir au but (3 points si réussi).
2. **Coup de pied de pénalité en touche** — particularité importante : à la
   différence d'une sortie en touche en jeu courant (où c'est l'équipe qui
   n'a pas tapé qui a le lancer), **sur une pénalité jouée en touche, c'est
   l'équipe qui a botté qui conserve le lancer en touche**.
3. Mêlée à l'endroit de la faute.
4. Jeu rapide à la main ou au pied (tap-and-go / quick tap).

Implémenté (`_traiterPenalite`) :
- ✅ Tir au but si la position est dans la zone de tir réaliste (`enZoneDeTir`,
  5–45 m) avec une probabilité de tenter (`0.55`).
- ✅ Sinon, jeu rapide à la main (tap-and-go), le porteur avance de 8 m.
- ❌ **Non implémenté : option « pénalité en touche »** avec conservation du
  lancer par l'équipe qui a botté, et option « mêlée sur pénalité ». C'est un
  écart connu et volontairement différé : à ajouter si on veut un jeu au pied
  tactique plus réaliste (actuellement, hors tir au but, le seul choix
  modélisé est le jeu à la main).

## 6. Touche en jeu courant (Law 18/19 — Touch and Line-out)

Règle réelle : quand le ballon (ou le porteur) sort en touche en jeu courant,
le lancer est pour l'équipe qui N'A PAS fait sortir le ballon.

Implémenté (`_accorderTouche`) :
- ✅ Touche accordée à l'équipe adverse de celle qui a porté le ballon en
  touche (`event.message` : « touche pour l'équipe adverse »).
- ⚠️ Simplifié : pas de contestation du lancer (saut, soutien), le ballon est
  remis directement en jeu.

## 7. Mêlée sur faute de jeu (Law 19 — Forward pass / Knock-on)

Règle réelle : passe en avant ou en-avant (ballon qui part vers l'avant
depuis les mains ou touché en avant) → mêlée pour l'équipe non fautive à
l'endroit de la faute (sauf avantage).

Implémenté (`MELEE_AVANT`, `MELEE_ENAVANT`) : ✅ mêlée simplifiée déclenchée,
pas de contestation de mêlée joueur par joueur (résolution agrégée).

## 8. Hors scope explicite (non modélisé du tout)

- Drop-goals.
- Cartons (jaune/rouge), exclusions temporaires.
- 50:22, jeu au pied tactique avancé (chandelles, grubber).
- Avantage prolongé (l'avantage n'est pas modélisé comme une fenêtre
  temporelle distincte ; cf. tap-and-go immédiat dans `_traiterPenalite`).
- TMO / arbitrage vidéo.

Voir aussi `docs/SPEC_MOTEUR_MATCH.md` pour l'architecture générale du moteur
(obsolète sur le plan technique — décrit une conception C++ jamais
implémentée — mais toujours pertinent pour l'intention de conception).
