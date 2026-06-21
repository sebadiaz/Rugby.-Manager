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
   - coup d'envoi et remises en jeu réellement bottés et disputés en l'air (loi 12 : l'équipe qui a marqué reçoit, remise aux 22 m après une pénalité ratée, coup d'envoi de la 2e période donné par l'équipe adverse de celle qui a ouvert le match, mêlée au centre en cas de coup d'envoi trop court, coup d'envoi profond vers les 22 m) ;
   - marque sur réception dans son propre en-deçà des 22 m (loi 11) donnant un coup franc ;
   - maul complet (loi 17) modélisé par une machine à états : formation, poussée, arrêts successifs, annonce « use it », sortie du ballon par le demi de mêlée ou mêlée si ballon injouable, fautes (écroulement, entrée sur le côté, hors-jeu) sanctionnées par pénalité, carton jaune ou essai de pénalité ;
   - essais, transformations, pénalités au but, drop-goals en jeu courant et essais de pénalité ;
   - score conforme aux règles du rugby (essai 5 pts, transformation +2, pénalité +3, drop-goal +3, essai de pénalité +7) ;
   - arbitrage des règles (passe en avant, en-avant, hors-jeu au ruck, ballon en touche) ;
   - intelligence artificielle par rôle.

### Démo jouable

- En ligne : https://sebadiaz.github.io/Rugby.-Manager/
- En local : ouvrir `client/index.html` dans un navigateur (aucune installation requise).

### État actuel du projet

- **La démo jouable est entièrement en JavaScript.** Moteur de règles : `engine/rugby-engine.js`. Interface (HUD, rendu Canvas, contrôles) : `docs/css/style.css` + `docs/js/*.js`, chargés depuis `docs/index.html` (et, via les mêmes fichiers, depuis `client/index.html`).
- **Il n'y a plus aucun code C++ dans ce dépôt.** Un moteur C++ a existé tout au début du projet (voir la conception dans `docs/SPEC_JOUEUR.md` / `docs/SPEC_MOTEUR_MATCH.md`), mais il a été intégralement remplacé par le moteur JS actuel et supprimé du dépôt — `engine/` ne contient que du JS, et ni `examples/` ni `CMakeLists.txt` n'existent. Il n'y a donc rien à débrancher ni à effacer : pas de moteur C++ legacy à ménager.
- Les documents `docs/SPEC_*.md` restent en place comme référence de conception historique ; chacun est annoté en tête de fichier (« historique, obsolète » ou « cible future ») pour ne pas laisser croire qu'ils décrivent le code actuel. Le code qui fait foi est `engine/rugby-engine.js`, vérifié par `server/simulate.js` et `server/test-invariants.js`.
- Priorité actuelle : continuer à fiabiliser et structurer ce moteur JS et son interface (objet ballon normalisé, RNG seedé documenté, séparation rendu/HUD/règles) — pas de réécriture en C++, pas de nouveau moteur parallèle.

### Architecture

- `engine/rugby-engine.js` — moteur de match (règles, IA, RNG seedé), source unique, sans dépendance au DOM. Exposé en module Node (`require`) et en variable globale `RugbyEngine` (`<script>`).
- `docs/css/style.css`, `docs/js/constants.js`, `docs/js/rng.js`, `docs/js/matchState.js`, `docs/js/renderer.js`, `docs/js/ui.js`, `docs/js/main.js` — interface modulaire (constantes d'affichage, RNG côté UI, adaptateur d'état de match, rendu Canvas, HUD/historique, orchestration). Chargés en scripts classiques (`<script src="...">`, pas de modules ES) pour pouvoir s'ouvrir directement en `file://` sans serveur ni étape de build.
- `docs/index.html` — démo publiée sur GitHub Pages : HUD, canvas, contrôles, et les imports des fichiers ci-dessus (la copie de `engine/rugby-engine.js` qu'elle utilise est synchronisée automatiquement par le pipeline de déploiement).
- `client/index.html` — la même démo ouverte en local : référence les mêmes `docs/js/*.js` / `docs/css/style.css` / `engine/rugby-engine.js` par chemin relatif, pas de copie dupliquée à maintenir.
- `server/simulate.js` — harnais de test headless (Node) : fait tourner le moteur sur une longue durée et vérifie des invariants réels (positions valides, score cohérent, essais, mêlées, transformations, pénalités au but et coups d'envoi effectivement déclenchés). Usage : `node server/simulate.js [seed] [secondes]`.
- `server/test-invariants.js` — tests d'invariants ciblés : déterminisme à graine égale, un seul porteur de balle à la fois, essai = +5, transformation = +2, un ruck se termine toujours, un maul bloqué déclenche bien « use it », le ballon ne disparaît jamais, les joueurs restent dans le terrain. Usage : `node server/test-invariants.js`.
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
