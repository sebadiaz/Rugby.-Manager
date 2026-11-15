# V4 — Caractéristiques individuelles des joueurs : la base de la simulation

> **Décision du propriétaire — 15 novembre 2026.** Les caractéristiques individuelles sont **primordiales** :
> capacités physiques et techniques, **connaissances tactiques individuelles**, lecture du jeu et mental.
> Tout le monde ne sait pas faire une chistera, un drop ou une très longue passe. Les statistiques d'un match
> **découlent du niveau des joueurs présents** : les repères de l'élite (Tournoi des Six Nations, Top 14) ne
> s'appliquent qu'à un match entre équipes d'élite. On ne calibre jamais un moteur pour que des joueurs moyens
> produisent des chiffres d'élite.

## 1. Principes

1. **Le geste, pas le résultat.** On calibre la réussite de chaque geste (passe, plaquage, réception, coup de
   pied, lecture) en fonction des caractéristiques du joueur, de la pression et de la fatigue. Les statistiques
   du match en sont la conséquence.
2. **Savoir faire avant de vouloir faire.** Un agent ne planifie qu'un geste qu'il **maîtrise** (section 4).
   Un geste non maîtrisé n'est pas une option de son plan ; s'il est forcé (urgence), son échec est très probable.
3. **Percevoir et décider selon son niveau.** Lecture du jeu, vision et expérience changent ce que le joueur
   perçoit (délai, champ, erreurs d'estimation) et la qualité de ses choix — pas seulement l'exécution.
4. **Connaître le plan de jeu.** Un joueur connaît plus ou moins bien les consignes, les annonces de touche, le
   système défensif. Un nouveau venu ou un joueur peu expérimenté se trompe plus souvent (placement, hors-jeu, appel).
5. **Différences réelles, jamais de script.** Aucun « bonus d'équipe » caché : la différence entre deux équipes
   vient des 15 + remplaçants qui jouent, joueur par joueur.
6. **Repères par niveau.** Validation sur une matrice de niveaux (élite, professionnel, semi-pro, amateur…) avec
   des repères sourcés par niveau, et surtout des **tests de tendance** (moins de qualité de passe → plus
   d'en-avants ; meilleur plaqueur → moins de plaquages manqués), vrais quel que soit le niveau.

Échelle : 0–100 pour chaque caractéristique continue (60 = joueur professionnel moyen à son poste, neutre du
moteur actuel). Les gestes maîtrisés sont des niveaux (0 = ne sait pas, 1 = notions, 2 = maîtrise, 3 = spécialiste).

## 2. Ce qui existe déjà (moteur + Mode Club, sauvegardé)

| Clé actuelle | Sens dans le code | Usage actuel |
|---|---|---|
| `vitesse` | vitesse de course | déplacement, percées |
| `plaquage` | qualité de plaquage | réussite au contact |
| `tendance` | proximité au ballon (suiveur ↔ tenant de station) | placement LEGACY, jeu au large |
| `adresse` | précision au pied sur tir au but | réussite des pénalités et transformations |
| `melee` | technique de poussée | force de mêlée |
| `touche` | contestation de lancer / saut | force de touche, choix du sauteur |
| `puissance` | poussée, maul, gain au contact | maul, avancée au contact |
| `endurance` | gestion de la fatigue | Mode Club |
| `passe` | réussite de passe / offload | passes, chistera (mains) |
| `jeuPied` | portée du jeu au pied courant | coups de pied, passe au pied, petit pied |
| `decision` | sécurité du ballon, choix | contact, choix du capitaine |
| `discipline` | fréquence des fautes | fautes de mêlée/maul, hors-jeu |

Ces 12 clés restent valides (sauvegardes de carrière). Les nouvelles caractéristiques s'**ajoutent** ; une
sauvegarde ancienne reçoit des valeurs dérivées de ses clés existantes et du poste (migration, jamais de perte).

## 3. Caractéristiques continues (0–100)

### 3.1 Physique
| Clé proposée | Description | Effet attendu dans la simulation | État |
|---|---|---|---|
| `vitesse` | vitesse maximale | vitesse de course, percée, couverture | existe |
| `acceleration` | départ arrêté, changement de rythme | premiers mètres, montée défensive, prise d'intervalle | à créer |
| `agilite` | appuis, crochet, changement de direction | éviter un plaqueur, cadrage-débordement | à créer |
| `puissance` | force explosive | gain après contact, maul, déblayage | existe |
| `force` | force statique | mêlée, maintien au sol, arrachage | à créer (aujourd'hui dans `melee`/`puissance`) |
| `endurance` | capacité à répéter les efforts | fatigue, baisse des autres caractéristiques en fin de match | existe |
| `gabarit` | taille et poids (deux valeurs) | collisions, saut en touche, levée, mêlée | à créer |
| `resistance` | encaisser les chocs | blessures, relève après plaquage | à créer |

### 3.2 Ballon en main
| Clé proposée | Description | Effet attendu | État |
|---|---|---|---|
| `passe` | qualité générale de passe | réussite, précision | existe |
| `longueurPasse` | portée de passe vissée | passes longues (> 15 m), passe sautée ; tout le monde ne passe pas à 20 m | à créer |
| `passeContact` | passe dans le contact, offload | offload, chistera, jeu après contact | à créer (aujourd'hui `passe`) |
| `reception` | mains, prise de balle | en-avants à la réception, ballons hauts | à créer |
| `conservation` | protection du ballon au contact, présentation | ballons perdus au sol, grattage subi | à créer (aujourd'hui `decision`) |
| `percussion` | aller au contact en avançant | mètres après contact | à créer (aujourd'hui `puissance`) |
| `evitement` | raffût, cadrage, feinte | plaquages manqués provoqués | à créer |
| `finition` | conclure près de la ligne, aplatir sous pression | essais marqués / ballons perdus dans l'en-but | à créer |

### 3.3 Jeu au pied
| Clé proposée | Description | Effet attendu | État |
|---|---|---|---|
| `jeuPied` | portée du jeu au pied courant | longueur des dégagements | existe |
| `precisionPied` | précision du jeu au pied courant | touche trouvée, passe au pied, chandelle bien placée | à créer |
| `adresse` | coups de pied au but | pénalités, transformations | existe |
| `drop` | drop en jeu courant | tentative possible seulement si maîtrisé (section 4) | à créer |
| `piedRasant` | grubber, petit coup de pied à suivre | précision et rebond | à créer |

### 3.4 Défense et contact
| Clé proposée | Description | Effet attendu | État |
|---|---|---|---|
| `plaquage` | technique de plaquage | réussite, plaquage dominant | existe |
| `placementDefensif` | tenir sa ligne, glisser au bon moment | trous dans la ligne, glissade trop tôt/trop tard | à créer |
| `grattage` | contester au sol (jackal) | turnovers au ruck, pénalités obtenues/concédées | à créer |
| `deblayage` | nettoyer un ruck | vitesse de libération, rucks conservés | à créer |
| `contreMaul` | arrêter un maul, saquer le sauteur | mauls stoppés | à créer |
| `jeuAerien` | réception et contestation des ballons hauts | chandelles regagnées/perdues | à créer |

### 3.5 Phases statiques
| Clé proposée | Description | Effet attendu | État |
|---|---|---|---|
| `melee` | technique de mêlée | domination, pénalités de mêlée | existe |
| `touche` | saut / contestation | touches gagnées, volées | existe |
| `lancer` | précision du lancer (talonneur) | lancers pas droits, touches perdues | à créer |
| `levee` | lever un sauteur | timing du saut, touches gagnées | à créer |
| `maul` | technique de maul | avancée, maul écroulé | à créer (aujourd'hui `puissance`) |

### 3.6 Perception, lecture du jeu et décision (cognitif)
| Clé proposée | Description | Effet attendu sur l'agent | État |
|---|---|---|---|
| `lectureJeu` | comprendre ce qui se passe | délai de réaction, erreurs d'estimation des vitesses/espaces | à créer (aujourd'hui `decision`) |
| `vision` | voir le jeu loin, à 360° | champ de vision, portée de perception, options vues | à créer |
| `decision` | choisir la bonne option sous pression | bruit dans la comparaison des options, choix sous pression | existe |
| `anticipation` | prévoir la passe, l'interception | lecture des croisées, interceptions, couverture | à créer |
| `communication` | parler, être entendu, comprendre les appels | portée et clarté des appels, réponses du 10/9/8 | à créer |

### 3.7 Connaissances tactiques individuelles
| Clé proposée | Description | Effet attendu | État |
|---|---|---|---|
| `connaissancePlan` | maîtrise du plan de jeu du club | placement de référence juste, appels compris | à créer |
| `connaissanceRegles` | connaissance fine des lois | hors-jeu, en-avant volontaire, pénalités concédées | à créer (aujourd'hui `discipline`) |
| `experience` | matchs joués, niveau connu | stabilité des décisions, gestion des fins de match | à créer |
| `polyvalence` | connaissance des autres postes | performance hors de son poste | à créer |
| `cohesion` | habitude de jouer avec ses partenaires | timing des passes et courses (croisées, intercalé) | à créer (niveau joueur ↔ équipe) |

### 3.8 Mental et caractère
| Clé proposée | Description | Effet attendu | État |
|---|---|---|---|
| `discipline` | se contrôler, ne pas commettre de faute | pénalités, cartons | existe |
| `sangFroid` | performer sous pression (fin de match, pénalité décisive) | réussite des gestes dans les moments chauds | à créer |
| `courage` | s'engager dans le contact, plaquer plus fort | engagement au ruck, plaquages offensifs | à créer |
| `leadership` | capitaine, orateur | qualité des choix du capitaine, influence des appels | à créer |
| `agressivite` | intensité | plaquages dominants, mais fautes et cartons | à créer |
| `regularite` | constance d'un match à l'autre | dispersion des performances | à créer |

### 3.9 État du jour (dynamique, non permanent)
`fatigue` (dans le match), `forme` (semaine), `confiance` (après ses réussites/échecs), `blessure`. Ces états
**modulent** les caractéristiques ci-dessus ; ils ne les remplacent pas.

## 4. Gestes maîtrisés (savoir-faire)

Un geste est une **option de plan** seulement s'il est maîtrisé. Niveaux : 0 ne sait pas · 1 notions · 2 maîtrise ·
3 spécialiste. Le niveau fixe aussi la réussite (avec les caractéristiques continues associées).

| Geste | Caractéristiques associées | Remarque |
|---|---|---|
| Chistera | `passeContact`, `reception` (du receveur) | geste rare : la plupart des avants à 0 |
| Offload | `passeContact`, `puissance` | |
| Passe vissée longue (> 15 m) | `longueurPasse`, `passe` | |
| Passe sautée | `longueurPasse`, `vision` | |
| Passe croisée / redoublement | `passe`, `cohesion` | timing avec un partenaire |
| Passe au pied (cross-kick) | `precisionPied`, `vision` | |
| Petit coup de pied à suivre / grubber | `piedRasant`, `vitesse` | |
| Chandelle (up-and-under, box-kick) | `precisionPied`, `jeuPied` | |
| Drop en jeu courant | `drop`, `sangFroid` | tout le monde n'en tente pas |
| Coup de pied de 50/22 | `jeuPied`, `precisionPied` | |
| Pénalité en touche longue | `jeuPied`, `precisionPied` | |
| Raffût, cadrage-débordement | `evitement`, `agilite`, `vitesse` | |
| Grattage (jackal) | `grattage`, `force`, `connaissanceRegles` | |
| Contre de coup de pied | `anticipation`, `courage` | |
| Lancer en touche | `lancer` | talonneur, parfois un autre avant |
| Saut / levée | `touche`, `levee`, `gabarit` | |

## 5. Comment l'agent s'en sert (Russell–Norvig / GOAP)

- **Perception** (`perception.js`, `agent-context.js`) : délai de réaction, champ de vision, portée et bruit
  d'estimation dépendent de `lectureJeu`, `vision`, `anticipation`, `fatigue`.
- **Choix des buts et des plans** (`goals.js`, `actions.js`, `open-play.js`) : un geste non maîtrisé n'est pas
  une action disponible ; la comparaison des options est bruitée selon `decision`, `experience`, `sangFroid` ;
  le placement de référence suit `connaissancePlan`.
- **Exécution** (moteur) : la réussite de chaque geste dépend des caractéristiques associées, de la pression et
  de la fatigue. Le moteur reste seul juge du résultat.
- **Communication** (`local-communication.js`) : portée et compréhension des appels selon `communication`.

## 6. Constantes aujourd'hui FIXES qui devront dépendre des caractéristiques

Relevé du 15 novembre 2026 (mode GOAP) — elles ont été réglées pour qu'une équipe **moyenne** atteigne des
chiffres **d'élite**, ce qui contredit la décision ci-dessus ; à reprendre :
- délai de réaction de perception (0,2 s), cône de vision (200°), portée (45 m) ;
- rayon de déclenchement du plaquage en GOAP (3,7 m) ;
- seuils de décision du porteur (`open-play.js` : pression 2,5–7 m, marge de 6, score ≥ 9) ;
- seuils du jeu au pied (`GAIN_TERRITORY` base 31), des pénalités (valeurs espérées du capitaine), de l'appel de
  touche (attrait du maul) ;
- taux d'en-avant de la chistera (18 % × mains) ; erreur de la passe au pied et du petit pied ;
- conditions d'accès des gestes : jeu au pied ≥ 65 (passe au pied), ≥ 60 (petit pied) — à remplacer par la
  maîtrise du geste (section 4).

## 7. Validation (à la place d'une cible unique)

1. **Tests de tendance** (vrais à tout niveau) : baisser `passe`/`reception` ⇒ plus d'en-avants ; baisser
   `plaquage` ⇒ plus de plaquages manqués et d'essais encaissés ; joueur sans maîtrise de la chistera ⇒ 0 chistera ;
   meilleure `lectureJeu` ⇒ réaction plus rapide ; l'équipe la plus forte gagne plus souvent mais pas toujours.
2. **Matrice de niveaux** : équipes types (élite, professionnelle, semi-pro, amateur) × graines ; les repères du
   Tournoi des Six Nations / Top 14 ne valent que pour élite contre élite. Repères des autres niveaux **à sourcer**
   (LNR Pro D2, études amateurs) — aucun chiffre inventé.
3. **Sauvegardes** : une carrière ancienne se charge, ses joueurs reçoivent des valeurs dérivées de leurs 12 clés
   et de leur poste ; aucune perte.

## 8. Ordre de mise en œuvre proposé

1. Ajouter les caractéristiques et les gestes maîtrisés au modèle de joueur (moteur + Mode Club) avec migration
   des sauvegardes et valeurs par défaut par poste.
2. Brancher d'abord trois éléments très visibles : maîtrise des gestes (chistera, drop, passe longue), lecture du
   jeu (délai et bruit de perception), réception/mains.
3. Remplacer une à une les constantes de la section 6 par des fonctions des caractéristiques, avec tests de tendance.
4. Construire la matrice de niveaux et rechercher les repères sourcés par niveau.
