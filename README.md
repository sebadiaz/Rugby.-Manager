# Rugby.-Manager

# Rugby Manager 2D — Simulation intelligente de rugby

## Présentation du projet

**Rugby Manager 2D** est un jeu de gestion et de simulation de rugby inspiré des jeux de management sportif comme *Football Manager*, mais adapté au rugby.

Le projet est composé de deux grandes parties :

1. **Une interface de gestion web**
   - gestion du club ;
   - gestion de l’effectif ;
   - gestion des joueurs ;
   - gestion des entraînements ;
   - gestion des matchs ;
   - gestion des compétitions ;
   - consultation des statistiques ;
   - historique des saisons.

2. **Un moteur de simulation de match en 2D**
   - écrit entièrement en JavaScript (aucune dépendance), partagé entre le serveur et le navigateur ;
   - affichage en 2D (Canvas) ;
   - terrain de rugby réaliste ;
   - 30 joueurs autonomes ;
   - ballon ;
   - passes ;
   - courses ;
   - plaquages ;
   - rucks, mauls, mêlées et touches ;
   - coup d'envoi et remises en jeu réellement bottés et disputés en l'air (loi 12 : l'équipe qui a marqué reçoit, remise aux 22 m après une pénalité ratée, coup d'envoi de la 2e période donné par l'équipe adverse de celle qui a ouvert le match, mêlée au centre en cas de coup d'envoi trop court) ;
   - essais, transformations, pénalités au but ;
   - score conforme aux règles du rugby (essai 5 pts, transformation +2, pénalité +3) ;
   - arbitrage des règles (passe en avant, en-avant, hors-jeu au ruck, ballon en touche) ;
   - intelligence artificielle par rôle.

### Démo jouable

- En ligne : https://sebadiaz.github.io/Rugby.-Manager/
- En local : ouvrir `client/index.html` dans un navigateur (aucune installation requise).

### Architecture du moteur

- `engine/rugby-engine.js` — moteur de match, source unique, sans dépendance au DOM. Exposé en module Node (`require`) et en variable globale `RugbyEngine` (`<script>`).
- `server/simulate.js` — harnais de test headless (Node) : fait tourner le moteur sur une longue durée et vérifie des invariants réels (positions valides, score cohérent, essais, mêlées, transformations, pénalités au but et coups d'envoi effectivement déclenchés). Usage : `node server/simulate.js [seed] [secondes]`.
- `client/index.html` — rendu Canvas du moteur dans le navigateur, avec contrôles (lecture/pause, vitesse, réinitialisation).
- `docs/index.html` — copie publiée sur GitHub Pages (la copie de `engine/rugby-engine.js` qu'elle utilise est synchronisée automatiquement par le pipeline de déploiement).
- `docs/REGLES_RUGBY.md` — référence des règles du rugby (coup d'envoi, hors-jeu au ruck, options sur pénalité, etc.) avec, pour chacune, ce que le moteur implémente réellement et les simplifications/écarts connus.

L’objectif n’est pas seulement d’afficher des joueurs qui bougent, mais de créer une vraie simulation de rugby où chaque joueur prend des décisions selon son poste, ses statistiques, la situation de jeu, la tactique de l’équipe et la position du ballon.

---

# Objectif final

Le but final du projet est de créer un jeu complet où le joueur humain devient manager d’un club de rugby.

Il doit pouvoir :

- créer ou choisir une équipe ;
- gérer son effectif ;
- recruter des joueurs ;
- définir une tactique ;
- lancer une simulation de match ;
- observer le match en 2D ;
- analyser les statistiques ;
- faire progresser ses joueurs ;
- jouer plusieurs saisons ;
- participer à des championnats, coupes et phases finales.

Le cœur du projet est le moteur de match.  
L’interface web ne doit pas être prioritaire tant que la simulation de match n’est pas solide.

---

# Priorité absolue du développement

La priorité actuelle est :

```text
Créer un moteur de match 2D jouable, lisible et crédible.
