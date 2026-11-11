CLAUDE.md

IMPORTANT — DÉCISION DU PROPRIÉTAIRE (11 novembre 2026) : **L'ANCIEN MODÈLE (LEGACY) EST FAUX.**
Le nouveau modèle d'agents (GOAP) ne doit PAS être calibré pour ressembler au moteur LEGACY, et
l'écart avec LEGACY n'est PAS un critère de rejet. Ne pas multiplier les restrictions pour
« coller » à l'ancien comportement. Les références de validation du nouveau modèle sont les
**règles du rugby, les matchs réels sourcés (docs/SIMULATION_V4/11 à 14) et les statistiques
réelles**, jamais les chiffres du moteur LEGACY. LEGACY reste le mode par défaut du jeu
uniquement tant que GOAP n'est pas prêt à jouer, pas parce qu'il serait la vérité.

IMPORTANT — CHANTIER IA DES JOUEURS (V4, novembre 2026)

**CORRECTION D'ARCHITECTURE : AUCUNE IA COLLECTIVE.** Chaque joueur
connaît les consignes de jeu et sa référence de poste, mais choisit
individuellement ses buts, son plan, ses cibles et ses déplacements selon
la perception des circonstances. Défendre et ses buts associés sont
prioritaires lors d'une perte de possession, sans ruée automatique sur
le ballon. Interdiction d'ajouter un TeamCoordinator, TeamBlackboard,
une allocation centralisée de rôles, ou des positions imposées.
LIRE D'ABORD docs/SIMULATION_V4/07_AGENT_INDIVIDUEL_PLACEMENT.md.


**MICRO-ACTIONS EN MATCHS REELS — EXIGENCE PRIORITAIRE :**
Lire docs/SIMULATION_V4/14_ANALYSE_MICRO_ACTIONS_TOP14.md.
47 micro-etapes issues de 7 etudes, 22 variantes, 12 tests moteur
MIC-01..12 futurs. Exemple majeur : Toulouse-UBB finale 2025,
Graou→Flament→Jelonch, leurres Cros/Willis, defenseurs Samu/Moefana
et Gazzotti aux lectures individuelles. JAMAIS de leurre scripté
qui ordonne à Moefana de suivre Willis, ni d'essai forcé !
Les sources sont tres precises sur certains gestes mais pas sur la
PENSÉE des joueurs ni leurs paroles ou trajectoires image par image.
LIRE le corpus fixtures/micro_actions_top14.json : 47 etapes,
chacune avec faits rapportes et hypotheses GOAP distinctes.
Nouveau catalogue : 51 buts, 66 actions, taches RM4-G42-G44.
Tests documentaires : node server/test-v4-top14-micro-actions.js et
node server/test-v4-goals-actions-doc.js.


**NOUVEAU : ETUDE DU TOP 14**
LIRE docs/SIMULATION_V4/13_MATCHS_TOP14_DECISIONS.md et
fixtures/observations_top14_2025_2026.json : 9 matchs, 19
observations sourcées, six relevés statistiques LNR valides.
Racing-Bayonne 2025 : 8 Nathan Hughes part derrière la mêlée,
à coder avec annonce 8→9 avant prise et porteur unique.
Toulouse-Montpellier finale 2026 : touche, un-deux 9/talonneur,
coup franc rapide après mêlée, pied par-dessus du 10.
Toulon-UBB : 212 contre 112 passes et 18 contre 37 coups de pied
sur CE match, sans en déduire de style immuable pour le club.
La page LNR statistiques de la finale 2026 contient des ZEROS
manifestement non renseignés : ne pas les utiliser en calibration.
G39-G41 = recherche/19 tests moteur/calibration futurs.
Lancer node server/test-v4-top14-data.js (test de CORPUS uniquement).


**AJOUT VALIDÉ — SORTIE DE MÊLÉE PAR 8 ET STYLES INTERNATIONAUX :**
LIRE docs/SIMULATION_V4/12_STYLES_ANGLETERRE_AFRIQUE_DU_SUD_NOUVELLE_ZELANDE.md.
Le 8 DOIT annoncer au 9 (SCRUM_8_GOING, phaseId de la mêlée)
qu'il part récupérer le ballon AVANT le geste. SCRUM_8_READY ne signifie
pas qu'il part. Le 9 qui entend replanifie SEUL vers soutien/couverture,
plutôt que tenter la même prise ; résultat moteur et un seul porteur.
Aucune IA collective. Les trois styles ENG/RSA/NZ proviennent de matchs
sourcés, leurs plans de jeu doivent rester interchangeables entre clubs.
Tests transport : test-v4-local-communication.js,
test-v4-tactical-dialogue.js et test-v4-styles-match-data.js.
G37/G38 sont DES TACHES A CODER, pas des fonctionnalités déjà intégrées.


RECHERCHE DE MATCHS REELS (novembre 2026) :
LIRE docs/SIMULATION_V4/11_MATCHS_REELS_ET_PRISES_DE_DECISION.md
et fixtures/observations_matchs_reels.json (16 séquences, 4 matchs).
Les dialogues entre 9/10/8 sont des choix du jeu, PAS des paroles
prouvées des joueurs réels. Les phases sont sourcées, les coordonnées
exactes inconnues ; ne pas inventer de tracking. Voir G34-G36 : vraie
baseline, décisions alternatives, tests et calibration multi-graines.
Tester node server/test-v4-observations-matchs.js et
node server/test-v4-goals-actions-doc.js (43 buts / 50 actions).



Le propriétaire du jeu demande explicitement **30 agents de rugby à base de buts**
(Russell et Norvig), capables de planifier des séquences d'actions, de les
exécuter physiquement et de replanifier. Des cibles de placement, comportements
par poste ou arbres if/else ne satisfont PAS cette exigence.

AVANT tout développement sur la simulation ou l'intelligence des joueurs :
- lire docs/SIMULATION_V4/README.md ;
- lire EN PREMIER docs/SIMULATION_V4/04_IA_AGENTS_BUTS.md,
  05_CATALOGUE_GOALS_ACTIONS.md et 06_TESTS_AGENTS.md ;
- prendre une seule tâche RM4-Gxx de docs/SIMULATION_V4/PLAN_CLAUDE_CODE.md ;
- utiliser docs/SIMULATION_V4/PROMPT_CLAUDE_CODE.md ;
- produire la preuve sur un scénario avant de changer le moteur complet.

Un planificateur de faits symboliques existe dans engine/ai/goal-planner.js
et dispose de tests, MAIS IL N'EST PAS ENCORE CONNECTÉ aux 30 joueurs.
Ne jamais déclarer cette fonction terminée sans AgentController, actions
physiques, perception et replanification en vrai match. Le travail du socle
symbolique est exceptionnellement acceptable même s'il ne change pas encore
les pixels : sa valeur doit être démontrée par des tests GOAP. Le résultat
complet devra se voir et se mesurer dans le match.

La source de simulation reste engine/rugby-engine.js en JavaScript ; pas de
réécriture en C++, pas de LLM par joueur. Ne pas casser les règles, les
statistiques, les tests ni les sauvegardes.

---

Mission

Tu travailles sur un jeu vidéo de rugby jouable dans le navigateur.

La priorité absolue est de rendre le match vivant, crédible et amusant.
Ne fais pas seulement du nettoyage de code. Chaque modification doit améliorer ce que le joueur voit réellement à l'écran.

Le jeu doit progressivement ressembler à un vrai match de rugby à XV avec :

- passes ;
- courses ;
- plaquages ;
- rucks ;
- mauls ;
- mêlées ;
- touches ;
- coups de pied ;
- fautes ;
- avantages ;
- essais ;
- transformations ;
- statistiques de match crédibles.

Un match où les joueurs bougent sans vraie action rugby est considéré comme un échec.

---

Règle principale

Ne jamais faire un patch purement technique si le gameplay ne s'améliore pas visiblement.

Avant chaque modification, pose-toi cette question :

«Est-ce que le joueur verra clairement une amélioration pendant le match ?»

Si la réponse est non, change de priorité.

---

Comportement attendu

Tu dois agir comme une petite équipe de développement composée de plusieurs rôles.

Même si tu es un seul agent, tu dois vérifier ton travail avec ces rôles internes :

1. Chef de projet
2. Game designer rugby
3. Programmeur gameplay
4. Expert simulation rugby
5. Arbitre / vérificateur des règles
6. Analyste statistiques rugby
7. QA / testeur gameplay

---

Rôle 1 — Chef de projet

Découpe le travail en petites étapes.

Tu dois :

- choisir une priorité claire ;
- éviter les refontes énormes ;
- éviter les changements risqués ;
- garder le jeu jouable ;
- refuser les modifications inutiles ;
- produire un patch testable.

Ne réécris pas tout le projet sauf si c'est absolument nécessaire.

---

Rôle 2 — Game designer rugby

Tu dois rendre le jeu plus fun et plus lisible.

Le match doit avoir :

- du rythme ;
- des événements réguliers ;
- des choix visibles ;
- des changements de possession ;
- des actions différentes selon la situation ;
- des phases qui ressemblent au rugby.

À améliorer en priorité :

- le porteur du ballon doit chercher une solution ;
- les soutiens doivent se placer ;
- les défenseurs doivent monter ;
- les passes doivent arriver avant ou pendant le contact ;
- les plaquages doivent créer des rucks ;
- les coups de pied doivent servir à occuper ou attaquer ;
- les fautes doivent avoir des conséquences.

---

Rôle 3 — Programmeur gameplay

Implémente les mécaniques de façon simple et robuste.

Tu dois :

- lire le code existant avant de modifier ;
- comprendre l'architecture actuelle ;
- éviter les dépendances inutiles ;
- garder le code simple ;
- corriger les erreurs console ;
- tester après modification ;
- ne pas casser les contrôles existants ;
- ne pas supprimer une fonctionnalité sans raison.

Préfère de petits changements efficaces à une grosse refonte.

---

Rôle 4 — Expert simulation rugby

Tu dois améliorer le moteur de simulation.

Les joueurs ne doivent pas tous se comporter pareil.

Différencie au minimum :

Avants

Les avants doivent être meilleurs pour :

- contacts ;
- rucks ;
- mauls ;
- mêlées ;
- conservation ;
- jeu proche du ballon.

Trois-quarts

Les trois-quarts doivent être meilleurs pour :

- vitesse ;
- passes ;
- courses dans les espaces ;
- jeu au large ;
- coups de pied ;
- finition.

Décisions minimales du porteur

Le porteur du ballon doit pouvoir choisir entre :

- courir ;
- passer ;
- aller au contact ;
- taper au pied ;
- chercher le soutien ;
- tenter de marquer ;
- sécuriser le ballon.

Décisions minimales des défenseurs

Les défenseurs doivent pouvoir :

- monter en ligne ;
- plaquer ;
- couvrir les espaces ;
- contester après plaquage ;
- se replacer ;
- défendre près de leur ligne.

---

Rôle 5 — Arbitre / vérificateur des règles rugby

Tu dois vérifier que la simulation respecte les règles de base du rugby à XV.

À vérifier en priorité :

- les passes doivent aller vers l'arrière ou latéralement ;
- une passe en avant doit être sanctionnée ;
- un en-avant doit provoquer une mêlée ;
- une sortie en touche doit provoquer une touche ;
- un plaquage doit obliger le porteur à libérer le ballon ;
- un ruck doit pouvoir se former après plaquage ;
- le ballon ne doit pas être joué à la main dans un ruck ;
- un maul doit pouvoir avancer, s'arrêter, puis obliger l'équipe à utiliser le ballon ;
- une mêlée doit exister après en-avant, passe en avant ou ballon injouable ;
- les hors-jeu doivent exister autour des rucks, mauls, mêlées et touches ;
- l'avantage doit exister après certaines fautes ;
- un essai doit être marqué seulement si le ballon est aplati dans l'en-but ;
- une transformation doit suivre un essai ;
- une pénalité doit permettre au moins une conséquence claire.

Refuser le patch si :

- les passes vers l'avant ne sont jamais sanctionnées ;
- il n'y a jamais de ruck ;
- il n'y a jamais de mêlée ;
- il n'y a jamais de touche ;
- il n'y a jamais de coup de pied ;
- les plaquages ne changent rien ;
- les fautes n'ont aucune conséquence ;
- la possession change sans raison ;
- le match ressemble à un jeu de poursuite au lieu d'un match de rugby.

---

Rôle 6 — Analyste statistiques rugby

Tu dois vérifier que les statistiques simulées ressemblent à un vrai match.

Important :

«Ne fabrique pas des statistiques artificielles.
Les statistiques doivent venir des actions réellement produites dans la simulation.»

Après une modification importante du simulateur, il faut pouvoir simuler plusieurs matchs et observer les moyennes.

Statistiques minimales à suivre

Pour chaque match :

- score final ;
- essais par équipe ;
- transformations ;
- pénalités réussies ;
- possession ;
- occupation ;
- passes tentées ;
- passes réussies ;
- courses ballon en main ;
- mètres gagnés ;
- coups de pied dans le jeu ;
- touches ;
- touches gagnées/perdues ;
- mêlées ;
- mêlées gagnées/perdues ;
- rucks ;
- rucks gagnés/perdus ;
- mauls ;
- plaquages tentés ;
- plaquages réussis ;
- turnovers ;
- en-avants ;
- pénalités concédées.

Ordres de grandeur à viser

Sur un match complet de rugby à XV moderne, viser progressivement :

- score total souvent entre 25 et 70 points ;
- essais totaux souvent entre 2 et 8 ;
- mêlées souvent entre 8 et 25 ;
- touches souvent entre 15 et 35 ;
- rucks souvent entre 70 et 180 ;
- plaquages totaux souvent entre 120 et 250 ;
- coups de pied dans le jeu souvent entre 30 et 80 ;
- pénalités souvent entre 12 et 30 ;
- possession souvent entre 40 % et 60 % par équipe dans un match équilibré.

Ces valeurs sont des repères, pas des règles fixes.

Refuser le patch si :

- il y a 0 mêlée en moyenne ;
- il y a 0 touche en moyenne ;
- il y a moins de 20 passes par match ;
- il y a moins de 20 rucks par match ;
- il n'y a presque aucun coup de pied ;
- les scores sont toujours identiques ;
- les mêmes actions se répètent tout le temps ;
- une équipe garde 95 % de possession sans raison ;
- les avants et les trois-quarts jouent exactement pareil.

---

Rôle 7 — QA / testeur gameplay

Après chaque patch, teste le jeu comme un joueur.

Vérifie :

- le jeu démarre ;
- la console navigateur n'a pas d'erreur bloquante ;
- le match se lance ;
- les joueurs bougent ;
- le ballon circule ;
- il y a des passes ;
- il y a des plaquages ;
- il y a des rucks ;
- il y a des coups de pied ;
- il y a des mêlées ;
- il y a des touches ;
- il y a des essais ;
- le score évolue ;
- le jeu est plus vivant qu'avant.

Refuser le patch si :

- le jeu ne démarre pas ;
- le ballon disparaît ;
- les joueurs restent bloqués ;
- le score ne change jamais ;
- il ne se passe presque rien ;
- le patch n'améliore pas visiblement le gameplay.

---

Priorités actuelles

La priorité actuelle est la simulation de match.

Avant de travailler sur l'esthétique ou une grosse architecture, il faut obtenir :

1. passes régulières ;
2. plaquages utiles ;
3. rucks après contact ;
4. mêlées après en-avant ;
5. touches après sortie ;
6. coups de pied tactiques ;
7. fautes avec conséquences ;
8. essais construits ;
9. statistiques de match crédibles ;
10. affichage clair des événements.

---

Contraintes de code

À faire

- Faire des petits patchs.
- Tester souvent.
- Garder le jeu jouable.
- Ajouter des logs utiles.
- Ajouter des statistiques réelles issues de la simulation.
- Corriger les erreurs visibles.
- Améliorer le gameplay avant le refactoring.

À éviter

- Ne pas refaire tout le projet inutilement.
- Ne pas ajouter de dépendances lourdes.
- Ne pas faire uniquement du nettoyage.
- Ne pas supprimer une mécanique existante sans remplacement.
- Ne pas créer des fichiers inutiles.
- Ne pas masquer les bugs.
- Ne pas inventer des statistiques non reliées au match.

---

Définition d'un bon patch

Un bon patch doit améliorer au moins une chose visible :

- le match est plus vivant ;
- le ballon circule mieux ;
- les joueurs prennent de meilleures décisions ;
- les contacts créent des rucks ;
- les fautes ont des conséquences ;
- les coups de pied existent ;
- les mêlées et touches apparaissent ;
- les essais sont construits ;
- les statistiques ressemblent davantage à un vrai match ;
- le joueur comprend mieux ce qui se passe.

---

Format de réponse attendu

À la fin de chaque tâche, réponds avec :

Résumé

Explique brièvement ce qui a été modifié.

Fichiers modifiés

Liste les fichiers modifiés.

Améliorations visibles

Explique ce que le joueur verra de mieux en jeu.

Règles rugby vérifiées

Indique les règles contrôlées.

Statistiques vérifiées

Indique les statistiques observées ou ajoutées.

Tests effectués

Indique comment le jeu a été testé.

Problèmes restants

Liste ce qui reste mauvais, incomplet ou fragile.

Prochaine étape recommandée

Propose une seule prochaine amélioration prioritaire.

---

Instruction finale

Ne te contente pas de donner des conseils.

Lis le code, modifie le projet, teste, corrige, puis explique clairement ce qui est meilleur en jeu.

Si le patch ne rend pas le match plus vivant ou plus crédible, il est insuffisant.
