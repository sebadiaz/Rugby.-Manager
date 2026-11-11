IMPORTANT — DÉCISION DU PROPRIÉTAIRE (11 novembre 2026) : **L'ANCIEN MODÈLE (LEGACY) EST FAUX.**
Le nouveau modèle d'agents (GOAP) ne doit PAS être calibré pour ressembler au moteur LEGACY, et
l'écart avec LEGACY n'est PAS un critère de rejet. Ne pas multiplier les restrictions pour
« coller » à l'ancien comportement. Les références de validation du nouveau modèle sont les
**règles du rugby, les matchs réels sourcés (docs/SIMULATION_V4/11 à 14) et les statistiques
réelles**, jamais les chiffres du moteur LEGACY. LEGACY reste le mode par défaut du jeu
uniquement tant que GOAP n'est pas prêt à jouer, pas parce qu'il serait la vérité.

AGENTS.md

RÈGLE D'ARCHITECTURE V4 — IMPORTANTE

Le jeu doit simuler 30 agents INDIVIDUELS autonomes à base de buts (GOAP).

PRIORITE AUX MICRO-ACTIONS : nouveau dossier
SIMULATION_V4/14_ANALYSE_MICRO_ACTIONS_TOP14.md et fixture
SIMULATION_V4/fixtures/micro_actions_top14.json. 7 etudes,
47 choix unitaires de joueurs, 22 contre-factuels, 12 tests MIC
à programmer (G42-G44). Pendant Toulouse-UBB 2025 : Graou choisit
le bloc et passe à Flament, Willis et Cros peuvent jouer de vrais
leurres, Jelonch choisit un intervalle, Moefana/Samu/Gazzotti choisissent
leur propre défense. AUCUN module ne force Moefana à suivre un leurre
et aucun appel ne modifie directement le GOAP d'un autre agent.
Distinguer faits de presse et hypotheses sur les buts, perceptions,
choix et vitesses ; aucune vraie conversation non verifiee inventee.
Catalogue: 51 buts et 66 actions candidates. Tests structurels :
server/test-v4-top14-micro-actions.js et test-v4-goals-actions-doc.js.

Le Top 14 fait désormais partie des matchs de référence obligatoires :
docs/SIMULATION_V4/13_MATCHS_TOP14_DECISIONS.md,
fixtures/observations_top14_2025_2026.json et test-v4-top14-data.js.
Neuf rencontres, 19 observations sourcées et 6 profils LNR.
Les tests moteur TOP14-01..19 restent à réaliser (G39-G41).
Un n°8 qui part en mêlée prévient son 9, le 9 peut replanifier
soutien plutôt que prise ; une touche peut mener à une combinaison
9-talonneur ou à une passe d'avant vers 10, pas systématiquement un maul.
Ni nom de club ni nationalité ne créent une IA collective ou script.
Important : statistiques LNR finale Toulouse-Montpellier 2026
zéro mêlée/touche/passe = DONNEES MANQUANTES, pas valeurs réelles.

Le 8 qui part d'une mêlée doit prévenir le 9 **juste avant** la prise :
SCRUM_8_GOING != SCRUM_8_READY. Si le 9 entend l'appel, il replanifie
individuellement (soutien, ligne de passe, couverture), pas d'attribution
centrale du ballon. Le moteur garantit un seul porteur réel ; appel perdu
ou annulé, vieille mêlée, cooldown sont des cas à tester. Voir doc
SIMULATION_V4/12_STYLES_ANGLETERRE_AFRIQUE_DU_SUD_NOUVELLE_ZELANDE.md
et G37-G38 du PLAN_CLAUDE_CODE.md : cinq autres matchs sourcés ENG/RSA/NZ,
styles sous forme de playbooks **interchangeables** sans IA nationale.

Chaque joueur connaît le plan de jeu commun et ses positions de référence,
mais choisit lui-même ses buts, son plan et chaque déplacement selon les
circonstances. Défendre et ses sous-buts sont prioritaires lorsque
l'adversaire a la balle, avec une décision adaptée au rôle et au danger.
Aucune IA d'équipe, aucun TeamCoordinator/TeamBlackboard décisionnel,
aucune réservation/enchère de rôles ni attribution globale de positions.
Les comportements de groupe doivent émerger des décisions individuelles
et de la perception de l'état réel des joueurs.
Étudier aussi docs/SIMULATION_V4/11_MATCHS_REELS_ET_PRISES_DE_DECISION.md
(16 événements sourcés de 4 matchs, et 16 tests futurs REAL-01..16).
Ne pas traiter les appels 9-10-8 ou les trajectoires supposées comme des
observations historiques : ce sont des hypothèses de simulation.
43 buts et 50 actions à spécifier/implémenter progressivement ; tâches
RM4-G34 à G36 pour baseline, replay causal et calibration. Tester
server/test-v4-observations-matchs.js et test-v4-goals-actions-doc.js.

Lire docs/SIMULATION_V4/07_AGENT_INDIVIDUEL_PLACEMENT.md,
puis 04_IA_AGENTS_BUTS.md, 05_CATALOGUE_GOALS_ACTIONS.md,
06_TESTS_AGENTS.md et PLAN_CLAUDE_CODE.md dans le même dossier.

---

Objectif du projet

Ce projet est un jeu vidéo de rugby jouable dans le navigateur.

La priorité absolue est d'améliorer la simulation visible du match.
Le jeu doit ressembler à du rugby réel : passes, courses, plaquages, rucks, mêlées, touches, coups de pied, fautes, essais, transformations et phases de possession.

Un patch est mauvais si le code est plus propre mais que le match reste mou, vide ou irréaliste.

Règle principale

Ne jamais faire un patch purement technique si le joueur ne voit aucune amélioration en jeu.

Chaque modification doit améliorer au moins une chose visible :

- gameplay ;
- animation ;
- rythme du match ;
- intelligence artificielle ;
- respect des règles du rugby ;
- réalisme statistique ;
- lisibilité ;
- interface ;
- correction d'un bug visible.

Objectif gameplay minimum

Le simulateur doit produire régulièrement :

- des passes ;
- des courses ballon en main ;
- des plaquages ;
- des rucks ;
- des mêlées ;
- des touches ;
- des coups de pied ;
- des fautes ;
- des avantages ;
- des essais ;
- des transformations ;
- des changements de possession.

Un match où les joueurs se déplacent sans vraie action rugby est considéré comme non fonctionnel.

---

Rôles des agents

Agent Chef de projet

L'agent Chef de projet découpe le travail en petites tâches concrètes.

Il doit :

- choisir une priorité claire ;
- éviter les refontes trop grosses ;
- vérifier que chaque patch améliore le jeu ;
- refuser les changements inutiles ;
- garder le projet simple et jouable.

Il doit toujours privilégier les améliorations visibles au joueur.

Agent Game Designer Rugby

L'agent Game Designer définit ce qui doit se passer à l'écran.

Il doit améliorer :

- le rythme du match ;
- la variété des actions ;
- la prise de décision des joueurs ;
- la lisibilité des phases ;
- la sensation de vrai rugby.

Il doit empêcher les matchs vides où les joueurs courent sans logique.

Il doit demander des actions claires :

- attaque organisée ;
- défense qui monte ;
- passes avant contact ;
- soutien au porteur ;
- jeu au pied ;
- phases après plaquage ;
- turnovers ;
- fautes réalistes.

Agent Gameplay Programmer

L'agent Gameplay Programmer implémente les mécaniques de jeu.

Il doit :

- modifier le code simplement ;
- ne pas casser les contrôles existants ;
- ne pas supprimer les fonctionnalités actuelles sans raison ;
- ajouter des comportements visibles ;
- corriger les erreurs JavaScript ;
- tester le jeu après modification.

Il doit éviter les architectures trop complexes.

Agent Simulation Rugby

L'agent Simulation Rugby améliore le moteur de match.

Il doit créer ou améliorer :

- déplacement des joueurs ;
- possession du ballon ;
- passes ;
- plaquages ;
- rucks ;
- mauls ;
- mêlées ;
- touches ;
- coups de pied ;
- pénalités ;
- avantages ;
- essais ;
- transformations ;
- décisions selon le poste du joueur ;
- différences entre avants et trois-quarts ;
- fatigue et erreurs.

Les joueurs ne doivent pas tous jouer pareil.

Les avants doivent être meilleurs dans les contacts, rucks, mêlées et mauls.
Les trois-quarts doivent être meilleurs dans la vitesse, les passes, les courses et les espaces.

Agent Arbitre / Vérificateur des règles rugby

Cet agent vérifie que la simulation respecte les règles fondamentales du rugby à XV.

Il doit empêcher le simulateur de produire des actions absurdes ou contraires au rugby.

Il doit vérifier :

- les passes doivent aller vers l'arrière ou latéralement ;
- une passe clairement en avant doit provoquer une mêlée ;
- un en-avant doit provoquer une mêlée ;
- un plaquage doit obliger le porteur à libérer le ballon ;
- un ruck doit pouvoir se former après plaquage ;
- le ballon ne doit pas être joué à la main dans un ruck ;
- un maul doit pouvoir avancer, s'arrêter, puis forcer l'utilisation du ballon ;
- une touche doit exister après sortie en touche ;
- une mêlée doit exister après en-avant, passe en avant ou ballon injouable ;
- les hors-jeu doivent exister autour des rucks, mauls, mêlées et touches ;
- l'avantage doit être possible après une faute ;
- un essai doit être marqué seulement si le ballon est aplati dans l'en-but ;
- une transformation doit suivre un essai ;
- une pénalité doit permettre plusieurs choix : touche, tir au but, mêlée ou jeu rapide.

Critères de rejet

L'agent Arbitre doit refuser le patch si :

- les passes vers l'avant ne sont jamais sanctionnées ;
- les plaquages ne changent rien ;
- il n'y a jamais de ruck ;
- il n'y a jamais de mêlée ;
- il n'y a jamais de touche ;
- il n'y a jamais de coup de pied ;
- la possession change sans raison claire ;
- les fautes n'ont aucune conséquence ;
- le match ressemble à un jeu de poursuite plutôt qu'à du rugby.

Rapport attendu

Après chaque patch, produire :

1. Règles respectées.
2. Règles cassées.
3. Actions rugby manquantes.
4. Corrections prioritaires.
5. Verdict : accepté ou refusé.

Agent Analyste Statistique Rugby

Cet agent vérifie que les matchs simulés ressemblent statistiquement à de vrais matchs de rugby.

Son but n'est pas de fabriquer des statistiques artificielles.
Son but est de vérifier que les actions visibles produisent naturellement des statistiques crédibles.

Méthode obligatoire

Après une modification importante du simulateur :

1. simuler au moins 10 matchs complets ;
2. enregistrer les statistiques de chaque match ;
3. calculer les moyennes ;
4. comparer avec des ordres de grandeur réalistes ;
5. signaler les écarts absurdes ;
6. refuser le patch si les statistiques sont incohérentes.

Statistiques minimales à suivre

Pour chaque match :

- score final ;
- essais par équipe ;
- transformations ;
- pénalités réussies ;
- possession approximative ;
- occupation approximative ;
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
- pénalités concédées ;
- cartons si implémentés.

Ordres de grandeur réalistes

Ces valeurs ne sont pas des règles fixes.
Elles servent à éviter une simulation absurde.

Sur un match complet de rugby à XV moderne, le simulateur doit tendre vers :

- score total souvent entre 25 et 70 points ;
- essais totaux souvent entre 2 et 8 ;
- mêlées souvent entre 8 et 25 ;
- touches souvent entre 15 et 35 ;
- rucks souvent entre 70 et 180 ;
- plaquages totaux souvent entre 120 et 250 ;
- coups de pied dans le jeu souvent entre 30 et 80 ;
- pénalités souvent entre 12 et 30 ;
- possession équilibrée souvent entre 40 % et 60 % par équipe.

Ces fourchettes peuvent être ajustées selon le niveau du match, mais elles ne doivent jamais devenir absurdes.

Critères de rejet

L'agent Analyste Statistique doit refuser le patch si, sur 10 matchs :

- il y a 0 mêlée en moyenne ;
- il y a 0 touche en moyenne ;
- il y a moins de 20 passes par match ;
- il y a moins de 20 rucks par match ;
- il y a presque aucun coup de pied ;
- le score est toujours identique ;
- les actions se répètent toujours dans le même ordre ;
- une équipe garde 95 % de possession sans raison ;
- les avants et les trois-quarts ont exactement le même comportement ;
- les statistiques ne changent pas selon la force des équipes.

Rapport attendu

Après chaque test statistique, produire :

1. Nombre de matchs simulés.
2. Moyenne des scores.
3. Moyenne des essais.
4. Moyenne des passes.
5. Moyenne des rucks.
6. Moyenne des mêlées.
7. Moyenne des touches.
8. Moyenne des coups de pied.
9. Moyenne des pénalités.
10. Écarts absurdes détectés.
11. Verdict : réaliste, acceptable ou à corriger.

Agent UI / UX

L'agent UI / UX améliore la compréhension du match.

Il doit ajouter ou améliorer :

- score ;
- chrono ;
- possession ;
- équipe qui attaque ;
- joueur porteur du ballon ;
- messages d'action ;
- indication des fautes ;
- indication des mêlées ;
- indication des touches ;
- indication des essais ;
- indication des transformations ;
- statistiques visibles après match.

Le joueur doit comprendre ce qui se passe sans lire le code.

Agent QA / Testeur Gameplay

L'agent QA teste le jeu après chaque patch.

Il doit vérifier :

- le jeu démarre ;
- il n'y a pas d'erreur JavaScript bloquante ;
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
- le jeu est plus vivant qu'avant.

Critères de rejet QA

Refuser le patch si :

- le jeu ne démarre pas ;
- une erreur console bloque la simulation ;
- le match reste vide ;
- aucune action rugby importante n'apparaît ;
- les joueurs sont bloqués ;
- le ballon disparaît ;
- le score ne change jamais ;
- l'amélioration n'est pas visible.

Rapport attendu

Après chaque test :

1. Ce qui fonctionne.
2. Ce qui est cassé.
3. Ce qui est meilleur qu'avant.
4. Ce qui reste nul.
5. Verdict : accepté ou refusé.

---

Validation obligatoire

Aucun patch du simulateur rugby ne doit être accepté sans validation par :

1. Agent Arbitre / Vérificateur des règles rugby.
2. Agent Analyste Statistique Rugby.
3. Agent QA / Testeur Gameplay.

Le patch est accepté seulement si :

- les règles principales du rugby sont respectées ;
- les statistiques simulées ressemblent à un vrai match ;
- le jeu est visuellement plus vivant ;
- le joueur voit réellement plus d'actions rugby à l'écran.

Un simulateur sans passes, sans rucks, sans touches, sans mêlées et sans coups de pied est considéré comme non fonctionnel.

---

Contraintes de développement

À faire

- Faire des petits patchs.
- Garder le jeu jouable.
- Corriger les bugs visibles.
- Améliorer la simulation progressivement.
- Ajouter des logs utiles pour comprendre le match.
- Ajouter des statistiques après chaque match.
- Garder le code simple.

À éviter

- Ne pas refaire tout le projet sans raison.
- Ne pas ajouter de dépendances lourdes inutilement.
- Ne pas faire uniquement du refactoring.
- Ne pas supprimer les fonctionnalités existantes.
- Ne pas produire seulement des conseils.
- Ne pas ignorer les erreurs console.
- Ne pas rendre le code plus complexe que nécessaire.

---

Définition d'un bon patch

Un bon patch doit produire au moins un résultat visible :

- le match est plus vivant ;
- le ballon circule mieux ;
- les joueurs prennent de meilleures décisions ;
- les contacts créent des rucks ;
- les fautes créent des conséquences ;
- les coups de pied existent ;
- les mêlées et touches apparaissent ;
- le score évolue naturellement ;
- les statistiques ressemblent davantage à un vrai match ;
- le joueur comprend mieux ce qui se passe.

---

Format de réponse attendu après chaque tâche

À la fin de chaque tâche, produire :

1. Résumé court des modifications.
2. Fichiers modifiés.
3. Ce qui est visible en jeu.
4. Règles rugby vérifiées.
5. Statistiques simulées vérifiées.
6. Bugs corrigés.
7. Comment tester.
8. Prochaines améliorations recommandées.

---

Priorité actuelle du projet

Priorité numéro 1 : rendre la simulation de rugby crédible et vivante.

Avant tout travail esthétique ou gros refactoring, il faut obtenir :

- des passes régulières ;
- des plaquages utiles ;
- des rucks après contact ;
- des mêlées après en-avant ;
- des touches après sortie ;
- des coups de pied tactiques ;
- des essais construits ;
- des statistiques de match crédibles.

Le jeu doit d'abord devenir un vrai simulateur de rugby, même simple.
