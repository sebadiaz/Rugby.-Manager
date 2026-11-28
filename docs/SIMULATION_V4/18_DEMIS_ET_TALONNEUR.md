# 18 — Demi de mêlée (9), demi d'ouverture (10) et talonneur (2)

> **Statut : spécification du propriétaire (28 novembre 2026), découpée en tâches RM4-G63 à G70 ; G63 et G64 codés.**
> Objectif : qu'on reconnaisse le 9, le 10 et le 2 **à leurs décisions**, sans voir les maillots — sans IA collective,
> sans comportement par numéro, sans quota statistique.

## 1. Ce que dit la spécification (résumé fidèle)

- **Demi de mêlée.** Il commande les avants, introduit en mêlée et sort le ballon si le 8 ne le prend pas. À chaque
  sortie il choisit : rejouer dans l'axe avec un avant lancé, ouvrir au 10, jouer le petit côté avec un ailier, taper
  ou percer lui-même. Il joue vite les pénalités et lance le jeu en touche.
- **Demi d'ouverture.** En défense, il trouve la touche le plus loin possible. En attaque, il choisit entre occupation,
  chandelle vers l'arrière adverse, coup de pied à suivre et drop. Il annonce les combinaisons. Sous pression dans ses
  22 m, il joue rarement à la main. Il feinte la passe. Les styles diffèrent (le buteur à la Wilkinson, le joueur à la
  Larkham), sans stéréotype physique. Les troisièmes lignes adverses le ciblent.
- **Talonneur.** Il talonne en mêlée en arrêtant sa poussée : le pack résiste alors à 7 contre 8. Il lance en touche,
  percute au ras des regroupements et commande l'entrée en mêlée. Il appartient, avec le 8, le 9, le 10 et le 15, à la
  colonne vertébrale de l'équipe.

## 2. Comment cette demande s'accorde avec la règle permanente

Mêmes leviers que pour les troisièmes lignes (doc 17, § 1) :

1. **Les caractéristiques individuelles** (doc 15) : précision et portée au pied, gestes maîtrisés (drop, passe au pied,
   petit coup de pied, passe longue), passe sous pression, lancer en touche, talonnage.
2. **Les préférences de poste pondérées** (`profilePour`), qui ne sont jamais exclusives.
3. **La perception** : défenseurs vus, temps devant le premier défenseur, tableau d'affichage, appels entendus.

Le moteur décide toujours du résultat (réussite d'un drop, lancer droit ou non, mêlée gagnée). Un « style buteur » n'est
pas une étiquette : c'est un joueur dont la précision au pied rend le drop et le tir plus attirants à ses propres yeux.

## 3. Constat de départ (mesure GOAP, 12 matchs de 20 min, 27-28 novembre 2026)

| Mesure | Valeur |
|---|---|
| Passes du 9 vers le 10 | 18 % (55 % vers les avants, réparties uniformément entre eux) |
| Coups de pied du 9 | environ 2,3 par match |
| Pénalités jouées vite | 0 (corrigé par G63) |
| Coups de pied et passes du 10 dans ses 22 m | 15 coups de pied pour 6 passes (conforme à la spécification) |
| Drops | 0 : en mode agents, le drop était encore un tirage aléatoire du moteur (corrigé par G64) |

## 4. Tâches (une par session, preuve sur scénario d'abord)

| Tâche | Contenu | Statut |
|---|---|---|
| G63 | Pénalité jouée vite quand la défense n'est pas en place (au plus un défenseur à 7-22 m devant la marque), seulement hors de son camp (`penalty-choice.js`) | fait |
| G64 | **Drop décidé par le porteur** : geste `drop` maîtrisé (précision au pied), portée lue sur la distance au pied, angle, temps devant le défenseur, tableau d'affichage (trois points décisifs dans le dernier quart) ; le moteur ne tire plus le drop au hasard en mode agents, il tranche seulement la réussite (`lireDrop`, `_executerDrop`) | fait |
| G65 | Sortie de regroupement : axe (avant lancé VU arriver) ou ouverture, selon la défense vue (regroupée ou étirée) ; petit côté quand l'ailier y est et que le côté est peu défendu | à faire |
| G66 | Choix du coup de pied d'attaque selon le fond vu : chandelle sur un arrière isolé, coup de pied à suivre, occupation | à faire |
| G67 | Feinte de passe, geste maîtrisé (passe et lecture du jeu), lue par le défenseur selon SA lecture du jeu | à faire |
| G68 | Défenseurs qui montent sur le joueur le plus dangereux qu'ils voient (porteur ou relais qui oriente le jeu), sans désignation du 10 | à faire |
| G69 | Talonneur : talonnage avec arrêt de poussée (mêlée à 7 contre 8 pendant le geste, résolu par le moteur), lancer en touche par le meilleur lanceur présent, percussion au ras | à faire |
| G70 | Commandement : annonce de combinaison et d'entrée en mêlée par les joueurs que leurs traits de leadership et leur position rendent écoutés (communication locale, doc 08) | à faire |

## 5. G64 en détail (drop)

- **Geste :** `gestes.drop` = 0 à 3, explicite ou déduit de `precisionPied` (seuils 66, 78 et 88). À 0, le drop n'est
  jamais une option, quel que soit le contexte.
- **Portée lue :** 22 m + 0,25 × `distancePied`, soit 37 m pour un pied de 60 et 47 m pour un pied de 100. Le joueur
  doit être à au moins 8 m des poteaux, sous un angle de 40° au plus, avec au moins 3 m devant le premier défenseur.
- **Chance perçue (estimation du joueur, ce n'est pas le résultat) :** elle baisse avec la distance et l'angle, monte
  avec la précision au pied et le temps disponible.
- **Envie :** trois points décisifs (de 3 points derrière à 2 points devant) dans le dernier quart du match multiplient
  l'attrait. Ailleurs, le drop ne bat la course que si l'attaque est bloquée (peu d'espace devant le porteur).
- **Moteur :** il accepte la demande `KICK`/`DROP` du porteur en jeu (au moins 2,2 m devant le défenseur). La réussite
  vaut `probaReussiteTir` × 0,7, comme avant. Un drop raté donne un renvoi aux 22 m. Le mode LEGACY garde son tirage.
- **Loi 8.29 :** après un coup franc, l'équipe bénéficiaire ne peut pas marquer de drop tant que le ballon n'est pas mort et
  qu'aucun adversaire ne l'a joué ou n'a plaqué le porteur. Le moteur refuse alors la demande (et LEGACY ne tire pas).
- **Limite héritée :** tout drop raté donne un renvoi aux 22 m. Selon la loi 12.11, ce renvoi n'est dû que si le ballon
  devient mort dans l'en-but ; un drop court resté dans le terrain devrait laisser le jeu continuer (à traiter).
- **Tests :** `node server/test-v4-drop.js`.
