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

## 3. Catalogue détaillé des caractéristiques (0–100 sauf mention)

Chaque ligne : `clé` — ce que c'est → ce que la simulation doit en faire. Une caractéristique est **un savoir-faire
précis**, jamais un fourre-tout : « passe » ne dit rien de la passe après contact, de la passe longue ou de la
passe du sol. Les 12 clés existantes (section 2) restent comme valeurs de repli et servent à initialiser les
nouvelles lors de la migration.

### 3.1 Physique — vitesse et mobilité
- `vitesseMax` — vitesse de pointe → percées, couverture, retours défensifs (aujourd'hui `vitesse`).
- `acceleration` — départ arrêté sur 5–10 m → prise d'intervalle, montée défensive, premier pas.
- `vitesseAvecBallon` — vitesse en portant le ballon → certains perdent beaucoup ballon en main.
- `vitesseReaction` — temps de démarrage après un événement (passe, coup de sifflet, ballon libre).
- `agilite` — changements de direction, appuis → crochet, évitement, se replacer.
- `equilibre` — rester sur ses appuis au contact → avancée après contact, rester debout au ruck.
- `changementRythme` — ralentir puis réaccélérer → fixer puis passer, déborder.
- `repetitionSprints` — enchaîner les efforts courts → qualité en fin de séquence longue.
- `enduranceAerobie` — volume de course sur 80 min → fatigue (aujourd'hui `endurance`).
- `recuperation` — récupération entre deux temps forts et après un plaquage → relève plus rapide.

### 3.2 Physique — force et gabarit
- `taille` (cm), `masse` (kg), `envergure` (cm) — collisions, saut et levée, grattage, prise des ballons hauts.
- `forceHaut` — force du haut du corps → arrachage, maintien du porteur debout, raffût.
- `forceBas` — force des jambes → poussée en mêlée, maul, déblayage.
- `puissance` — force explosive → percussion, plaquage dominant, déblayage (existe).
- `detente` — saut vertical → touche, ballons hauts, contestation aérienne.
- `souplesse` — mobilité articulaire → plaquages bas, ramassage, prévention des blessures.
- `resistanceChocs` — encaisser les impacts → baisse de performance et blessures après collisions.
- `propensionBlessure` — fragilité → risque de blessure (Mode Club).
- `age` / `declin` — progression puis baisse des qualités physiques (Mode Club).

### 3.3 Ballon en main — passes
- `passeCourte` — passe à 2–8 m (pop, passe au contact) → précision et vitesse d'exécution.
- `passeLongue` — passe vissée > 15 m → portée maximale et précision au large (tout le monde ne passe pas à 20 m).
- `passeVissee` — qualité de la rotation → passe tendue, rapide, difficile à intercepter.
- `passeFlottante` — passe lobée → par-dessus un défenseur, risque d'interception.
- `passeSautee` — sauter un ou deux partenaires → exige `passeLongue` et `vision`.
- `passeSousPression` — réussite avec un défenseur au contact.
- `passeApresContact` — offload pendant ou après le contact → offloads, jeu après plaquage.
- `passeUneMain` — passe à une main (dont chistera) → rare, risquée.
- `passeDuSol` — passe depuis le sol (9 au ruck) → rapidité et précision de la sortie de ruck.
- `ejection` — vitesse de sortie du ballon du ruck par le 9 → rythme de jeu, temps laissé à la défense.
- `passeGauche` / `passeDroite` — qualité selon le côté → la plupart ont un côté faible.
- `timingPasse` — lâcher le ballon au bon moment → fixer le défenseur, receveur lancé.
- `feintePasse` — dummy → fait mordre un défenseur, crée un intervalle.
- `passeCroisee` / `redoublement` — exécution des combinaisons à deux → croisée, boucle.

### 3.4 Ballon en main — réception et conservation
- `receptionPasse` — mains sur passe → en-avants à la réception.
- `receptionSousPression` — recevoir avec un défenseur arrivant.
- `receptionBallonHaut` — chandelles, coups d'envoi, ballons aériens.
- `ramassage` — ramasser un ballon au sol (en course ou arrêté) → ballons libres, en-avants au ramassage.
- `plongeonBallon` — plonger sur un ballon libre → récupérations, turnovers.
- `conservationContact` — tenir le ballon au contact, ne pas se le faire arracher.
- `presentationBallon` — placer le ballon au sol après plaquage → rucks propres, ballon rapide.
- `protectionAuSol` — se placer au sol pour protéger le ballon, rouler légalement → grattages subis.
- `releveRapide` — se relever et rejoindre le jeu après un plaquage.
- `finition` — conclure près de la ligne, aplatir sous la pression, en coin → essais marqués/refusés.
- `aplatissement` — aplatir proprement (bras tendu, plongeon) → en-avants dans l'en-but.

### 3.5 Ballon en main — courses et duels
- `percussion` — aller au contact en avançant → mètres après contact.
- `avanceeApresContact` — continuer à pousser les jambes → gain derrière la ligne d'avantage.
- `evitement` — esquiver un défenseur.
- `crochet` — crochet intérieur/extérieur.
- `cadrageDebordement` — fixer puis déborder sur l'extérieur.
- `raffut` — repousser le plaqueur avec le bras.
- `angleCourse` — choix de la ligne de course → intervalles trouvés, fixation.
- `appelBalle` — se rendre disponible, demander le ballon au bon moment.
- `courseLeurre` — course de leurre crédible → fixe un défenseur (lecture, pas script).
- `courseSoutien` — suivre le porteur intérieur/extérieur → offloads reçus, rucks gagnés.
- `porterCoteOppose` — porter le ballon à l'opposé du plaqueur.
- `protegerDeuxMains` — garder le ballon à deux mains pour menacer la passe.

### 3.6 Jeu au pied (chaque type est un savoir-faire)
- `puissancePied` — force de frappe → distance maximale.
- `distancePied` — portée utile en jeu courant (aujourd'hui `jeuPied`).
- `precisionPied` — atteindre la zone visée → touche trouvée, passe au pied, chandelle bien placée.
- `effetBallon` — vissé, flottant, rebond travaillé → longueur, rebond vers la touche, difficulté de réception.
- `piedFaible` — qualité du pied non dominant ; `piedFort` (gauche/droit).
- `degagement` — dégagement en touche ou long → sortie de camp.
- `chandelle` — up-and-under → hauteur, temps de suspension, contestabilité.
- `boxKick` — chandelle du 9 depuis la base → hauteur, précision, protection.
- `grubber` — coup de pied rasant → rebond, ballon récupérable.
- `petitPiedPardessus` — chip à suivre.
- `passeAuPied` — cross-kick vers l'aile.
- `coupPied5022` — coup de pied de 50/22.
- `penaliteEnTouche` — distance et précision de la pénalité tapée en touche.
- `coupEnvoi` — coup d'envoi (direct, court, contestable) et renvoi aux 22 / en-but.
- `drop` — drop en jeu courant (savoir-faire rare).
- `buteurDistance` — portée au but (aujourd'hui partie de `adresse`).
- `buteurPrecision` — précision au but selon l'angle (aujourd'hui `adresse`).
- `buteurRegularite` — constance du geste, influence du vent et de la pression.
- `jeuPiedSousPression` — frapper avec un défenseur qui arrive → contrés, pieds ratés.
- `rapiditeFrappe` — temps de mise en place → risque de contre.

### 3.7 Défense individuelle
- `techniquePlaquage` — technique générale (aujourd'hui `plaquage`).
- `plaquageBas` — plaquer aux jambes → plaquage sûr, ballon libéré au sol.
- `plaquageHaut` / `plaquageEtreinte` — plaquer à hauteur de ballon pour empêcher l'offload ou tenir debout (choke tackle → maul/ballon injouable).
- `plaquageOffensif` — plaquage dominant qui fait reculer → gain défensif, turnover.
- `plaquageRattrapage` — plaquer de côté ou par-derrière en course.
- `plaquageADeux` — premier ou second plaqueur coordonné.
- `timingPlaquage` — moment d'engagement → plaquages manqués, pénalités de plaquage retardé.
- `securitePlaquage` — hauteur légale → cartons et pénalités pour plaquage haut.
- `placementDefensif` — tenir sa place dans la ligne → trous.
- `monteeDefensive` — vitesse et timing de la montée (rush).
- `glissade` — glisser au bon moment sur l'homme suivant.
- `couvertureFond` — placement et course du dernier rideau.
- `interception` — lire et couper une passe.
- `contrePied` — contrer un coup de pied.
- `pressionBotteur` — gêner le botteur ou le 9.
- `communicationDefensive` — appels en défense (« monte », « glisse »).

### 3.8 Jeu au sol et zone de ruck
- `arriveeRuck` — vitesse et angle d'arrivée → ruck gagné ou perdu.
- `deblayage` — nettoyer un défenseur au ruck.
- `liaisonRuck` — se lier légalement, rester sur ses appuis.
- `grattage` — jackal, arracher le ballon au sol → turnovers.
- `contreRuck` — repousser l'attaquant pour reprendre le ballon.
- `decisionRuck` — choisir d'entrer au ruck ou de rester en ligne.
- `ralentissementRuck` — ralentir le ballon adverse (à la limite des lois, cf. 3.12).

### 3.9 Mêlée (par poste)
- `liaisonMelee` — prise de liaison, stabilité.
- `entreeMelee` — engagement au signal.
- `pousseeMelee` — poussée (aujourd'hui `melee`).
- `stabiliteMelee` — tenir sous pression, ne pas reculer.
- `pilierGauche` / `pilierDroit` — technique spécifique du côté (le pilier droit porte la mêlée).
- `talonnage` — talonner le ballon introduit → mêlées gagnées sur introduction.
- `introduction` — introduction du 9 → légalité, vitesse.
- `controleBallonMelee` — garder le ballon aux pieds du 8.
- `ramassage8` — prise de balle du 8 au pied de la mêlée.
- `resistanceRotation` — ne pas faire tourner la mêlée.
- `lectureArbitreMelee` — comprendre ce que l'arbitre veut voir.

### 3.10 Touche et maul
- `precisionLancer` — lancer droit et sur le sauteur.
- `puissanceLancer` — portée du lancer (fond d'alignement).
- `trajectoireLancer` — hauteur et longueur choisies → plus haut = plus sûr mais plus lent.
- `rapiditeLancer` — lancer vite, touche rapide.
- `detenteTouche` — hauteur de saut ; `timingSaut` — synchronisation avec le lancer.
- `levee` — lever le sauteur ; `timingLevee`.
- `receptionTouche` — capter en l'air, protéger, transmettre.
- `contreTouche` — contre-saut, lecture des annonces adverses.
- `codesTouche` — connaissance des annonces de l'équipe.
- `formationMaul` — former le maul autour du sauteur.
- `pousseeMaul` — pousser au maul (aujourd'hui `puissance`).
- `transmissionMaul` — faire glisser le ballon vers l'arrière du maul.
- `defenseMaul` — stopper un maul, saquer le sauteur légalement.

### 3.11 Techniques individuelles PAR POSTE
Un joueur a une note par poste qu'il connaît (polyvalence) ; hors de ses postes, ses savoir-faire spécifiques baissent.
- **Pilier gauche (1)** : liaison et poussée côté gauche, stabilité, levée en touche, porteur au près.
- **Talonneur (2)** : talonnage, lancer (précision, puissance, trajectoire), rôle au maul, gratteur.
- **Pilier droit (3)** : porter la mêlée, stabilité sous pression, levée.
- **Deuxièmes lignes (4, 5)** : saut, levée, poussée en mêlée, maul, déblayage, plaquage de répétition.
- **Troisièmes lignes (6, 7)** : plaquage, grattage, vitesse vers le ruck, couverture, saut en fond d'alignement, soutien.
- **Numéro 8 (8)** : contrôle et prise de balle au pied de la mêlée, départ du 8, percussion, saut, couverture.
- **Demi de mêlée (9)** : passe du sol, éjection, box-kick, lecture des petits côtés, départ au ras, introduction, commandement des avants.
- **Demi d'ouverture (10)** : passe longue, lecture de la défense, jeu au pied tactique, buteur, fixation, commandement de la ligne.
- **Centres (12, 13)** : percussion, passe sous pression, angle de course, plaquage dans le couloir, lecture défensive, interception.
- **Ailiers (11, 14)** : vitesse, finition, réception des ballons hauts, retours défensifs, renfort sur l'autre aile.
- **Arrière (15)** : couverture du fond, réception, relance, jeu au pied long, intercalé, dernier plaquage.

### 3.12 Vice, triche et rapport à l'arbitre
La triche n'est **jamais** un résultat écrit par le joueur : elle est une **tentative** que l'arbitre voit ou ne voit
pas (perception de l'arbitre, son placement, son profil). Pris, c'est la sanction prévue par la loi.
- `vice` — jeu à la limite des lois → gains marginaux au ruck et au maul, pénalités si l'arbitre le voit.
- `triche` — propension à la faute volontaire dissimulée : hors-jeu au ruck, mains au ruck, retenir le porteur,
  obstruction, tirer un maillot en touche, écrouler un maul, plaquage retardé, en-avant volontaire.
- `lectureArbitre` — savoir jusqu'où l'arbitre laisse aller → fautes commises au bon moment, moins sanctionnées.
- `simulation` — exagérer une faute subie → avantage obtenu, ou carton si l'arbitre le voit.
- `provocation` / `reactionProvocation` — chercher l'adversaire / réagir aux provocations → cartons, échauffourées.
- `discipline` — maîtrise de soi → fréquence des fautes involontaires (existe).

### 3.13 Lecture du jeu, perception et décision
- `lectureJeu` — comprendre la situation → délai de réaction, erreurs d'estimation.
- `vision` — portée et champ de vision, options vues.
- `anticipation` — prévoir la passe, la course, le pied adverse.
- `prisePositionnelle` — être au bon endroit avant le ballon.
- `decision` — choisir la bonne option (existe).
- `decisionSousPression` — garder ses choix sous pression et en fin de match.
- `priseDeRisque` — goût du risque → gestes osés, ballons perdus.
- `altruisme` / `egoisme` — passer ou garder → passes décisives, percées solitaires.
- `gestionTemps` — gérer le chrono et le score (fin de match, sonnerie).
- `lectureAdversaire` — repérer le défenseur faible, l'annonce adverse.

### 3.14 Connaissances tactiques et collectives
- `connaissancePlan` — maîtrise du plan de jeu du club (placements, consignes).
- `annonces` — connaissance des codes de touche, mêlée, combinaisons.
- `connaissanceRegles` — finesse des lois (hors-jeu, en-avant volontaire, ruck).
- `experience` — matchs joués et niveau connu → stabilité des décisions.
- `polyvalence` — postes connus et niveau à chacun.
- `cohesion` — habitude avec chaque partenaire (charnière 9–10, centres, triangle arrière) → timing des passes et des croisées.
- `communication` — parler, être entendu, comprendre → portée et clarté des appels.
- `leadership` — capitaine, orateur, choix du capitaine.
- `leadershipDefensif` — organiser la ligne par la voix.

### 3.15 Mental et caractère
- `concentration` — erreurs d'inattention (en-avants bêtes, hors-jeu).
- `sangFroid` — gestes décisifs sous pression.
- `confianceSoi` — niveau qui monte/descend selon les réussites.
- `courage` — s'engager au contact, aller au sol pour un ballon.
- `agressivite` — intensité → plaquages dominants mais fautes.
- `resilience` — réaction après une erreur ou un essai encaissé.
- `motivation` — engagement à l'entraînement et en match (Mode Club).
- `regularite` — constance d'un match à l'autre.
- `grandsMatchs` — performance dans les matchs à enjeu.
- `espritEquipe` — se sacrifier pour le collectif (déblayage ingrat, course leurre).

### 3.16 Latéralité
- `piedFort` (G/D), `piedFaible` (0–100) ; `mainForte`, `passeGauche`, `passeDroite` ; `coteDePrediction` (côté vers lequel il crochète naturellement).

### 3.17 État du jour (dynamique)
`fatigue` (dans le match), `forme` (semaine), `confiance` (dans le match), `blessure`, `douleur`, `carton` (en jeu ou non).
Ils **modulent** toutes les caractéristiques ci-dessus sans les remplacer.

## 4. Gestes maîtrisés (savoir-faire : 0 ne sait pas · 1 notions · 2 maîtrise · 3 spécialiste)

Un geste non maîtrisé n'est **pas une option du plan** du joueur. Le niveau fixe aussi la réussite, avec les
caractéristiques continues associées.

| Famille | Gestes |
|---|---|
| Passe | passe vissée longue, passe sautée, passe flottante, passe à une main, **chistera**, offload, passe du sol rapide, passe croisée, redoublement (boucle), feinte de passe, passe dans le dos |
| Course | crochet, cadrage-débordement, **raffût**, changement de rythme, course leurre, course de soutien intérieure |
| Pied | **drop**, chandelle, box-kick, grubber, petit pied par-dessus, passe au pied, coup de pied de 50/22, pénalité en touche longue, coup d'envoi court, pied faible, coup de pied vissé en touche |
| Défense | plaquage offensif, plaquage d'étreinte (ballon tenu debout), plaquage de rattrapage, interception, contre de pied |
| Sol | grattage (jackal), contre-ruck, plongeon sur ballon libre, présentation rapide |
| Phases statiques | talonnage, lancer, saut avant/milieu/fond, levée, contre-saut, prise de balle du 8, introduction, transmission dans le maul, sack du sauteur |
| Arbitre | lecture de l'arbitre, simulation, faute tactique (avec risque de carton) |

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
