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

**Catalogue OUVERT** : il s'enrichit au fil du projet (demande du propriétaire), on n'en retire rien sans décision
explicite. Il combine des caractéristiques générales (3.1–3.10, 3.13–3.22), une **aptitude par poste et par côté**
(3.11) et des **caractéristiques propres à chaque poste** (3.12).

Chaque tableau : clé, description, effet attendu dans la simulation, et état dans le moteur actuel (« oui », « partiel : clé actuelle qui la couvre en partie », « à créer »). Une caractéristique est **un savoir-faire
précis**, jamais un fourre-tout : « passe » ne dit rien de la passe après contact, de la passe longue ou de la
passe du sol. Les 12 clés existantes (section 2) restent comme valeurs de repli et servent à initialiser les
nouvelles lors de la migration.

### 3.1 Physique — vitesse et mobilité
| Clé | Description | Effet dans la simulation | Moteur |
|---|---|---|---|
| `vitesseMax` | vitesse de pointe | percées, couverture, retours défensifs | partiel : vitesse |
| `acceleration` | départ arrêté sur 5–10 m | prise d'intervalle, montée défensive, premier pas | à créer |
| `vitesseAvecBallon` | vitesse en portant le ballon | certains perdent beaucoup ballon en main | à créer |
| `vitesseReaction` | temps de démarrage après un événement (passe, coup de sifflet, ballon libre) | — | à créer |
| `agilite` | changements de direction, appuis | crochet, évitement, se replacer | à créer |
| `equilibre` | rester sur ses appuis au contact | avancée après contact, rester debout au ruck | à créer |
| `changementRythme` | ralentir puis réaccélérer | fixer puis passer, déborder | à créer |
| `repetitionSprints` | enchaîner les efforts courts | qualité en fin de séquence longue | à créer |
| `enduranceAerobie` | volume de course sur 80 min | fatigue | partiel : endurance |
| `recuperation` | récupération entre deux temps forts et après un plaquage | relève plus rapide | à créer |

### 3.2 Physique — force et gabarit
| Clé | Description | Effet dans la simulation | Moteur |
|---|---|---|---|
| `taille` | taille en cm | collisions, saut et levée, prise des ballons hauts | à créer |
| `masse` | masse en kg | collisions, poussée, gain au contact | à créer |
| `envergure` | envergure en cm | grattage, ballons hauts, plaquage | à créer |
| `forceHaut` | force du haut du corps | arrachage, maintien du porteur debout, raffût | à créer |
| `forceBas` | force des jambes | poussée en mêlée, maul, déblayage | à créer |
| `puissance` | force explosive | percussion, plaquage dominant, déblayage (existe) | oui |
| `detente` | saut vertical | touche, ballons hauts, contestation aérienne | à créer |
| `souplesse` | mobilité articulaire | plaquages bas, ramassage, prévention des blessures | à créer |
| `resistanceChocs` | encaisser les impacts | baisse de performance et blessures après collisions | à créer |
| `propensionBlessure` | fragilité | risque de blessure (Mode Club) | à créer |
| `age` | âge | progression puis déclin (Mode Club) | à créer |
| `declin` | vitesse de déclin avec l'âge | baisse des qualités physiques en fin de carrière | à créer |

### 3.3 Ballon en main — passes
| Clé | Description | Effet dans la simulation | Moteur |
|---|---|---|---|
| `passeCourte` | passe à 2–8 m (pop, passe au contact) | précision et vitesse d'exécution | à créer |
| `passeLongue` | passe vissée > 15 m | portée maximale et précision au large (tout le monde ne passe pas à 20 m) | à créer |
| `passeVissee` | qualité de la rotation | passe tendue, rapide, difficile à intercepter | à créer |
| `passeFlottante` | passe lobée | par-dessus un défenseur, risque d'interception | à créer |
| `passeSautee` | sauter un ou deux partenaires | exige `passeLongue` et `vision` | à créer |
| `passeSousPression` | réussite avec un défenseur au contact | — | à créer |
| `passeApresContact` | offload pendant ou après le contact | offloads, jeu après plaquage | à créer |
| `passeUneMain` | passe à une main (dont chistera) | rare, risquée | à créer |
| `passeDuSol` | passe depuis le sol (9 au ruck) | rapidité et précision de la sortie de ruck | à créer |
| `ejection` | vitesse de sortie du ballon du ruck par le 9 | rythme de jeu, temps laissé à la défense | à créer |
| `passeGauche` | qualité de passe vers la gauche | côté faible fréquent | à créer |
| `passeDroite` | qualité de passe vers la droite | côté faible fréquent | à créer |
| `timingPasse` | lâcher le ballon au bon moment | fixer le défenseur, receveur lancé | à créer |
| `feintePasse` | dummy | fait mordre un défenseur, crée un intervalle | à créer |
| `passeCroisee` | exécuter une passe croisée | croisées réussies, timing avec le partenaire | à créer |
| `redoublement` | exécuter un redoublement (boucle) | boucles réussies | à créer |

### 3.4 Ballon en main — réception et conservation
| Clé | Description | Effet dans la simulation | Moteur |
|---|---|---|---|
| `receptionPasse` | mains sur passe | en-avants à la réception | à créer |
| `receptionSousPression` | recevoir avec un défenseur arrivant | — | à créer |
| `receptionBallonHaut` | chandelles, coups d'envoi, ballons aériens | — | à créer |
| `ramassage` | ramasser un ballon au sol (en course ou arrêté) | ballons libres, en-avants au ramassage | à créer |
| `plongeonBallon` | plonger sur un ballon libre | récupérations, turnovers | à créer |
| `conservationContact` | tenir le ballon au contact, ne pas se le faire arracher | — | à créer |
| `presentationBallon` | placer le ballon au sol après plaquage | rucks propres, ballon rapide | à créer |
| `protectionAuSol` | se placer au sol pour protéger le ballon, rouler légalement | grattages subis | à créer |
| `releveRapide` | se relever et rejoindre le jeu après un plaquage | — | à créer |
| `finition` | conclure près de la ligne, aplatir sous la pression, en coin | essais marqués/refusés | à créer |
| `aplatissement` | aplatir proprement (bras tendu, plongeon) | en-avants dans l'en-but | à créer |

### 3.5 Ballon en main — courses et duels
| Clé | Description | Effet dans la simulation | Moteur |
|---|---|---|---|
| `percussion` | aller au contact en avançant | mètres après contact | à créer |
| `avanceeApresContact` | continuer à pousser les jambes | gain derrière la ligne d'avantage | à créer |
| `evitement` | esquiver un défenseur | — | à créer |
| `crochet` | crochet intérieur/extérieur | — | à créer |
| `cadrageDebordement` | fixer puis déborder sur l'extérieur | — | à créer |
| `raffut` | repousser le plaqueur avec le bras | — | à créer |
| `angleCourse` | choix de la ligne de course | intervalles trouvés, fixation | à créer |
| `appelBalle` | se rendre disponible, demander le ballon au bon moment | — | à créer |
| `courseLeurre` | course de leurre crédible | fixe un défenseur (lecture, pas script) | à créer |
| `courseSoutien` | suivre le porteur intérieur/extérieur | offloads reçus, rucks gagnés | à créer |
| `porterCoteOppose` | porter le ballon à l'opposé du plaqueur | — | à créer |
| `protegerDeuxMains` | garder le ballon à deux mains pour menacer la passe | — | à créer |

### 3.6 Jeu au pied (chaque type est un savoir-faire)
| Clé | Description | Effet dans la simulation | Moteur |
|---|---|---|---|
| `puissancePied` | force de frappe | distance maximale | à créer |
| `distancePied` | portée utile en jeu courant | — | partiel : jeuPied |
| `precisionPied` | atteindre la zone visée | touche trouvée, passe au pied, chandelle bien placée | à créer |
| `effetBallon` | vissé, flottant, rebond travaillé | longueur, rebond vers la touche, difficulté de réception | à créer |
| `piedFaible` | qualité du pied non dominant ; `piedFort` (gauche/droit) | — | à créer |
| `degagement` | dégagement en touche ou long | sortie de camp | à créer |
| `chandelle` | up-and-under | hauteur, temps de suspension, contestabilité | à créer |
| `boxKick` | chandelle du 9 depuis la base | hauteur, précision, protection | à créer |
| `grubber` | coup de pied rasant | rebond, ballon récupérable | à créer |
| `petitPiedPardessus` | chip à suivre | — | à créer |
| `passeAuPied` | cross-kick vers l'aile | — | à créer |
| `coupPied5022` | coup de pied de 50/22 | — | à créer |
| `penaliteEnTouche` | distance et précision de la pénalité tapée en touche | — | à créer |
| `coupEnvoi` | coup d'envoi (direct, court, contestable) et renvoi aux 22 / en-but | — | à créer |
| `drop` | drop en jeu courant (savoir-faire rare) | — | à créer |
| `buteurDistance` | portée au but | — | partiel : adresse |
| `buteurPrecision` | précision au but selon l'angle | — | partiel : adresse |
| `buteurRegularite` | constance du geste, influence du vent et de la pression | — | à créer |
| `jeuPiedSousPression` | frapper avec un défenseur qui arrive | contrés, pieds ratés | à créer |
| `rapiditeFrappe` | temps de mise en place | risque de contre | à créer |

### 3.7 Défense individuelle
| Clé | Description | Effet dans la simulation | Moteur |
|---|---|---|---|
| `techniquePlaquage` | technique générale | — | partiel : plaquage |
| `plaquageBas` | plaquer aux jambes | plaquage sûr, ballon libéré au sol | à créer |
| `plaquageHaut` | plaquer à hauteur de ballon | empêcher l'offload | à créer |
| `plaquageEtreinte` | plaquer en tenant le porteur debout (choke tackle) | maul ou ballon injouable, turnover | à créer |
| `plaquageOffensif` | plaquage dominant qui fait reculer | gain défensif, turnover | à créer |
| `plaquageRattrapage` | plaquer de côté ou par-derrière en course | — | à créer |
| `plaquageADeux` | premier ou second plaqueur coordonné | — | à créer |
| `timingPlaquage` | moment d'engagement | plaquages manqués, pénalités de plaquage retardé | à créer |
| `securitePlaquage` | hauteur légale | cartons et pénalités pour plaquage haut | à créer |
| `placementDefensif` | tenir sa place dans la ligne | trous | à créer |
| `monteeDefensive` | vitesse et timing de la montée (rush) | — | à créer |
| `glissade` | glisser au bon moment sur l'homme suivant | — | à créer |
| `couvertureFond` | placement et course du dernier rideau | — | à créer |
| `interception` | lire et couper une passe | — | à créer |
| `contrePied` | contrer un coup de pied | — | à créer |
| `pressionBotteur` | gêner le botteur ou le 9 | — | à créer |
| `communicationDefensive` | appels en défense (« monte », « glisse ») | — | à créer |

### 3.8 Jeu au sol et zone de ruck
| Clé | Description | Effet dans la simulation | Moteur |
|---|---|---|---|
| `arriveeRuck` | vitesse et angle d'arrivée | ruck gagné ou perdu | à créer |
| `deblayage` | nettoyer un défenseur au ruck | — | à créer |
| `liaisonRuck` | se lier légalement, rester sur ses appuis | — | à créer |
| `grattage` | jackal, arracher le ballon au sol | turnovers | à créer |
| `contreRuck` | repousser l'attaquant pour reprendre le ballon | — | à créer |
| `decisionRuck` | choisir d'entrer au ruck ou de rester en ligne | — | à créer |
| `ralentissementRuck` | ralentir le ballon adverse (à la limite des lois, cf. section « Vice, triche ») | — | à créer |

### 3.9 Mêlée (par poste)
| Clé | Description | Effet dans la simulation | Moteur |
|---|---|---|---|
| `liaisonMelee` | prise de liaison, stabilité | — | à créer |
| `entreeMelee` | engagement au signal | — | à créer |
| `pousseeMelee` | poussée | — | partiel : melee |
| `stabiliteMelee` | tenir sous pression, ne pas reculer | — | à créer |
| `pilierGauche` | technique spécifique du pilier gauche | tenue de mêlée côté gauche | à créer |
| `pilierDroit` | technique spécifique du pilier droit | porter la mêlée côté droit | à créer |
| `talonnage` | talonner le ballon introduit | mêlées gagnées sur introduction | à créer |
| `introduction` | introduction du 9 | légalité, vitesse | à créer |
| `controleBallonMelee` | garder le ballon aux pieds du 8 | — | à créer |
| `ramassage8` | prise de balle du 8 au pied de la mêlée | — | à créer |
| `resistanceRotation` | ne pas faire tourner la mêlée | — | à créer |
| `lectureArbitreMelee` | comprendre ce que l'arbitre veut voir | — | à créer |

### 3.10 Touche et maul
| Clé | Description | Effet dans la simulation | Moteur |
|---|---|---|---|
| `precisionLancer` | lancer droit et sur le sauteur | — | à créer |
| `puissanceLancer` | portée du lancer (fond d'alignement) | — | à créer |
| `trajectoireLancer` | hauteur et longueur choisies | plus haut = plus sûr mais plus lent | à créer |
| `rapiditeLancer` | lancer vite, touche rapide | — | à créer |
| `detenteTouche` | hauteur de saut ; `timingSaut` — synchronisation avec le lancer | — | à créer |
| `levee` | lever le sauteur ; `timingLevee` | — | à créer |
| `receptionTouche` | capter en l'air, protéger, transmettre | — | à créer |
| `contreTouche` | contre-saut, lecture des annonces adverses | — | à créer |
| `codesTouche` | connaissance des annonces de l'équipe | — | à créer |
| `formationMaul` | former le maul autour du sauteur | — | à créer |
| `pousseeMaul` | pousser au maul | — | partiel : puissance |
| `transmissionMaul` | faire glisser le ballon vers l'arrière du maul | — | à créer |
| `defenseMaul` | stopper un maul, saquer le sauteur légalement | — | à créer |

### 3.11 Aptitude par poste et par côté (matrice)

Chaque joueur a une **aptitude 0–100 pour chacun des postes ci-dessous**. Le côté compte : un pilier gauche peut
n'être jouable qu'à gauche (aptitude pilier droit très basse) ; un ailier gauche n'est pas forcément un ailier
droit. Hors de ses aptitudes, les caractéristiques spécifiques du poste (3.12) chutent et ses décisions de
placement sont moins justes (`connaissancePlan` du poste).

| Clé | Poste | Remarque |
|---|---|---|
| `aptPilierGauche` | 1 | côté « ouvert », mêlée sur un seul adversaire |
| `aptPilierDroit` | 3 | porte la mêlée, deux adversaires ; très peu de piliers jouent les deux côtés |
| `aptTalonneur` | 2 | lancer et talonnage indispensables |
| `aptDeuxiemeLigneAvant` | 4 | « sauteur de devant », poussée côté gauche |
| `aptDeuxiemeLigneArriere` | 5 | sauteur principal, poussée côté droit |
| `aptTroisiemeLigneAile6` | 6 | côté fermé, plaqueur, sauteur |
| `aptTroisiemeLigneAile7` | 7 | côté ouvert, gratteur, premier au ruck |
| `aptNumero8` | 8 | fond de mêlée, prise de balle, départ |
| `aptDemiMelee` | 9 | |
| `aptDemiOuverture` | 10 | |
| `aptPremierCentre` | 12 | deuxième meneur, percussion, pied |
| `aptSecondCentre` | 13 | défense dans le grand couloir, vitesse |
| `aptAilierGauche` | 11 | pied et main côté gauche |
| `aptAilierDroit` | 14 | |
| `aptArriere` | 15 | |
| `aptJokerBanc` | remplaçant | impact en fin de match (`impactEntree`) |

### 3.12 Caractéristiques SPÉCIFIQUES de chaque poste

Ces caractéristiques n'ont de sens qu'au poste (un 9 n'a pas de « tenue en mêlée fermée côté droit »). Elles
s'ajoutent aux familles générales ; deux joueurs de même poste peuvent avoir des profils très différents
(un 9 « buteur-passeur » contre un 9 « sniper au ras »).

#### Pilier gauche (1)
| Clé | Description | Effet dans la simulation | Moteur |
|---|---|---|---|
| `pg_liaisonTalonneur` | qualité de la liaison avec son talonneur | — | à créer |
| `pg_tenueVisAVis` | tenir le pilier droit adverse (un seul adversaire) sans reculer | — | à créer |
| `pg_angleEntree` | entrée droite et légale, ne pas « rentrer » sous l'adversaire | — | à créer |
| `pg_pressionAutorisee` | mettre la pression sur le pilier droit sans écrouler | — | à créer |
| `pg_resistanceAuxDeuxContre` | résister quand l'adversaire pousse de travers sur lui | — | à créer |
| `pg_stabiliteSurIntroduction` | rester stable au moment de l'introduction (le talonneur lève le pied) | — | à créer |
| `pg_leveeAvant` | lever le sauteur de devant en touche | — | à créer |
| `pg_porteurAuPres` | porter le ballon près du ruck, en pod | — | à créer |
| `pg_deblayageCourt` | nettoyer le ruck tout proche | — | à créer |
| `pg_plaquageRepetition` | plaquer encore à la 70e minute | — | à créer |
| `pg_passeAvant` | la passe courte d'un avant dans un pod (souvent faible) | — | à créer |
| `pg_lectureArbitreMelee` | sentir ce que l'arbitre sanctionne en mêlée | — | à créer |

#### Talonneur (2)
| Clé | Description | Effet dans la simulation | Moteur |
|---|---|---|---|
| `ta_talonnage` | talonner vite et proprement le ballon introduit | — | à créer |
| `ta_talonnageContre` | talonner sur introduction adverse (rare mais décisif) | — | à créer |
| `ta_liaisonPiliers` | tenir ses deux piliers liés | — | à créer |
| `ta_precisionLancer` | lancer droit, sur la main du sauteur | — | à créer |
| `ta_puissanceLancer` | atteindre le fond d'alignement | — | à créer |
| `ta_trajectoireLancer` | hauteur/longueur adaptées à l'annonce (lob, lancer tendu) | — | à créer |
| `ta_rapiditeLancer` | lancer avant que la défense ne s'organise | — | à créer |
| `ta_lancerSousPression` | lancer droit dans un moment décisif (touche à 5 m) | — | à créer |
| `ta_lancerVent` | corriger le vent et la pluie | — | à créer |
| `ta_appelTouche` | choisir ou relayer l'annonce | — | à créer |
| `ta_queueMaul` | prendre la queue du maul après son lancer et marquer | — | à créer |
| `ta_gratteur` | jackal au sol (souvent un point fort du talonneur moderne) | — | à créer |
| `ta_vitesseAvant` | mobilité supérieure aux piliers | — | à créer |
| `ta_jeuDansLeCouloir` | porteur et passeur dans le premier couloir | — | à créer |

#### Pilier droit (3)
| Clé | Description | Effet dans la simulation | Moteur |
|---|---|---|---|
| `pd_tenueDeuxAdversaires` | tenir le pilier gauche et le talonneur adverses | — | à créer |
| `pd_porterLaMelee` | supporter le poids du paquet côté droit | — | à créer |
| `pd_angleEntree` | entrée légale, ne pas tourner | — | à créer |
| `pd_stabiliteSousPression` | ne pas s'effondrer, ne pas se relever | — | à créer |
| `pd_poussee` | faire reculer la mêlée adverse | — | à créer |
| `pd_pressionSurTalonneur` | gêner le talonnage adverse | — | à créer |
| `pd_resistanceFatigue` | tenir la mêlée en fin de match | — | à créer |
| `pd_leveeArriere` | lever le sauteur de milieu ou de fond | — | à créer |
| `pd_porteurAuPres` | porter le ballon au près, en pod | mètres au contact près du ruck | à créer |
| `pd_plaquageRepetition` | plaquer encore en fin de match | plaquages tardifs réussis | à créer |

#### Deuxièmes lignes (4, 5)
| `dl_5_annonceTouche` | sauteur principal qui « appelle » la touche (n°5) | — | à créer |

| Clé | Description | Effet dans la simulation | Moteur |
|---|---|---|---|
| `dl_detente` | hauteur de saut | — | à créer |
| `dl_timingSaut` | synchronisation avec le lancer | — | à créer |
| `dl_receptionHaute` | capter à bout de bras | — | à créer |
| `dl_feinteSaut` | leurrer le contre-sauteur | — | à créer |
| `dl_contreSaut` | contester le lancer adverse | — | à créer |
| `dl_lectureAlignement` | deviner la cible adverse | — | à créer |
| `dl_levee` | lever un partenaire | — | à créer |
| `dl_pousseeMelee` | poussée en deuxième ligne (moteur de la mêlée) | — | à créer |
| `dl_liaisonPiliers` | liaison sur les piliers | — | à créer |
| `dl_receptionCoupEnvoi` | prendre les coups d'envoi | — | à créer |
| `dl_maulAvant` | porter et diriger le maul | — | à créer |
| `dl_deblayage` | déblayer en masse | — | à créer |
| `dl_plaquageRepetition` | enchaîner les plaquages | — | à créer |
| `dl_leadershipAvants` | organiser le pack (souvent capitaine) | — | à créer |

#### Troisièmes lignes ailes (6, 7)
| `tl_7_coteOuvert` | défense rapide côté ouvert (n°7) | — | à créer |
| `tl_6_coteFerme` | défense et jeu du côté fermé (n°6) | — | à créer |

| Clé | Description | Effet dans la simulation | Moteur |
|---|---|---|---|
| `tl_vitesseVersRuck` | premier arrivé au plaquage | — | à créer |
| `tl_grattage` | jackal légal, mains sur le ballon avant le ruck | — | à créer |
| `tl_ralentissement` | ralentir la sortie adverse (à la limite, cf. section « Vice, triche ») | — | à créer |
| `tl_plaquageVolume` | nombre de plaquages possibles par match | — | à créer |
| `tl_plaquageOffensif` | plaquage dominant | — | à créer |
| `tl_couvertureDefensive` | couvrir derrière la ligne | — | à créer |
| `tl_soutienPorteur` | suivre la percée, recevoir l'offload | — | à créer |
| `tl_sautFond` | sauteur de fond d'alignement (6) | — | à créer |
| `tl_ralentirLe9` | gêner le 9 adverse à la sortie de mêlée/ruck | — | à créer |
| `tl_porteurDansLesLignes` | courir dans l'intervalle entre les avants adverses | — | à créer |
| `tl_maulDefense` | contrer le maul | — | à créer |

#### Numéro 8
| Clé | Description | Effet dans la simulation | Moteur |
|---|---|---|---|
| `n8_controleBallonPied` | garder le ballon dans les pieds en mêlée qui avance | — | à créer |
| `n8_ramassagePiedMelee` | ramasser vite et proprement au fond de la mêlée | — | à créer |
| `n8_departHuit` | partir avec le ballon (et prévenir le 9 : `SCRUM_8_GOING`) | — | à créer |
| `n8_passeAu9` | sortir le ballon au 9 depuis le pied de mêlée | — | à créer |
| `n8_percussionCourte` | gagner la ligne d'avantage au près | — | à créer |
| `n8_lectureMelee` | sentir si la mêlée avance ou recule pour choisir | — | à créer |
| `n8_sautFond` | sauteur de fond d'alignement | touches gagnées au fond | à créer |
| `n8_couvertureFond` | couvrir derrière la mêlée et la ligne | ballons au pied récupérés | à créer |
| `n8_soutien` | soutenir le porteur après une percée | offloads reçus, rucks gagnés | à créer |
| `n8_communicationAvec9` | dialogue 8 ↔ 9 (annonce de départ, ballon gardé) | — | à créer |

#### Demi de mêlée (9) — le roi du ramassage et de la passe rapide sous pression
| Clé | Description | Effet dans la simulation | Moteur |
|---|---|---|---|
| `dm_ramassage` | ramasser le ballon au sol, quelle que soit sa position, en un geste | — | à créer |
| `dm_ramassageSousPression` | ramasser avec un adversaire qui arrive dessus (3e ligne qui ralentit, gratteur) | — | à créer |
| `dm_passeDuSol` | passer sans se relever, ballon tendu | — | à créer |
| `dm_ejection` | vitesse entre la prise et le lâcher (moins de 0,5 s pour un très bon 9) | — | à créer |
| `dm_precisionPasse` | ballon dans la course du receveur, à la bonne hauteur | — | à créer |
| `dm_passeLongueSol` | portée de la passe du sol (sauter un joueur depuis le ruck) | — | à créer |
| `dm_passeDeuxCotes` | aussi bonne à gauche qu'à droite | — | à créer |
| `dm_passeSousPression` | réussir avec un adversaire collé, ballon sale, ballon qui roule | — | à créer |
| `dm_ballonSale` | jouer un ballon mal présenté, au fond d'un ruck lent | — | à créer |
| `dm_lectureRuck` | savoir quand le ballon est jouable, ne pas se faire contrer | — | à créer |
| `dm_lecturePetitCote` | voir le petit côté exploitable | — | à créer |
| `dm_sniping` | partir au ras du ruck | — | à créer |
| `dm_boxKick` | chandelle depuis la base, hauteur et précision | — | à créer |
| `dm_boxKickSousPression` | box-kick avec la défense qui monte | — | à créer |
| `dm_introductionMelee` | introduction légale et rapide | — | à créer |
| `dm_jeuApresMelee` | sortir de mêlée (lecture, passe, départ) | — | à créer |
| `dm_relaisTouche` | recevoir du sauteur et distribuer | — | à créer |
| `dm_commandementAvants` | diriger les avants à la voix (pods, ruck) | — | à créer |
| `dm_dialogue10` | complicité et dialogue avec le 10 (questions de touche et de mêlée) | — | à créer |
| `dm_rythme` | accélérer ou ralentir le jeu selon la situation | — | à créer |
| `dm_couvertureRuck` | défendre au bord du ruck, plaquer le pick-and-go | — | à créer |
| `dm_couvertureFond` | couvrir le pied adverse derrière la ligne | — | à créer |
| `dm_gestionArbitre` | parler à l'arbitre, savoir quand le ballon « est utilisé » | — | à créer |
| `dm_pressionOral` | résister à la pression verbale et physique | — | à créer |

#### Demi d'ouverture (10)
| Clé | Description | Effet dans la simulation | Moteur |
|---|---|---|---|
| `do_passeLongue` | passe longue du 10 | jeu au large rapide | à créer |
| `do_passeAPlat` | passe à plat sur la ligne d'avantage | receveur lancé, défense fixée | à créer |
| `do_passeSautee` | passe sautée du 10 | surnombre exploité | à créer |
| `do_timingFixation` | attaquer la ligne et passer au dernier moment | — | à créer |
| `do_lectureDefense` | défense qui monte, qui glisse, surnombre, trou | — | à créer |
| `do_choixJeu` | main, pied, au près, au large selon la lecture | — | à créer |
| `do_jeuPiedTactique` | occupation, touche, chandelle, passe au pied, grubber | — | à créer |
| `do_buteur` | précision et distance au but | — | à créer |
| `do_drop` | drop en jeu | — | à créer |
| `do_commandementLigne` | placer la ligne d'attaque à la voix | — | à créer |
| `do_combinaisons` | exécuter les combinaisons du plan (croisée, boucle, intercalé) | — | à créer |
| `do_jeuSousPression` | décisions avec la troisième ligne adverse dessus | — | à créer |
| `do_defenseCanal` | défendre son couloir (souvent un point faible) | — | à créer |
| `do_gestionMatch` | gérer le score, le territoire, la fin de match | — | à créer |
| `do_dialogue9` | complicité avec le 9 | — | à créer |
| `do_communication` | se faire entendre de toute la ligne | — | à créer |

#### Premier centre (12)
| Clé | Description | Effet dans la simulation | Moteur |
|---|---|---|---|
| `c12_percussion` | fixer en percussion, gagner la ligne d'avantage | — | à créer |
| `c12_passeSousPression` | passer au contact | — | à créer |
| `c12_offload` | offload dans le contact | continuité après contact | à créer |
| `c12_deuxiemeMeneur` | relais de distribution, deuxième ouvreur | jeu à deux meneurs | à créer |
| `c12_jeuPied` | pied gauche/droit en relais du 10 | — | à créer |
| `c12_defenseFrontale` | plaquer les porteurs lourds | — | à créer |
| `c12_grattage` | contester au sol en défense | — | à créer |
| `c12_angleCourse` | courses à contre-pied | — | à créer |

#### Second centre (13)
| Clé | Description | Effet dans la simulation | Moteur |
|---|---|---|---|
| `c13_vitesseGrandCouloir` | attaquer l'espace large | — | à créer |
| `c13_cadrageDebordement` | fixer et décaler l'ailier | — | à créer |
| `c13_passeDecisive` | servir l'ailier au bon moment | — | à créer |
| `c13_defenseGrandCouloir` | décider : monter, glisser, rester (le poste le plus dur en défense) | — | à créer |
| `c13_lectureSurnombre` | compter les attaquants extérieurs | — | à créer |
| `c13_interception` | lire et couper la passe au large | interceptions | à créer |
| `c13_couverture` | couvrir derrière l'ailier | percées stoppées | à créer |

#### Ailiers (11, 14)
| Clé | Description | Effet dans la simulation | Moteur |
|---|---|---|---|
| `ai_vitesse` | vitesse de l'ailier | finition, retours | à créer |
| `ai_acceleration` | accélération de l'ailier | prise d'intervalle sur l'aile | à créer |
| `ai_finitionCoin` | marquer en coin sans sortir en touche | — | à créer |
| `ai_jeuLongTouche` | courir le long de la ligne de touche sans mettre le pied dehors | — | à créer |
| `ai_receptionBallonHaut` | chandelles, passes au pied | — | à créer |
| `ai_contestationAerienne` | sauter contre l'arrière adverse | — | à créer |
| `ai_retourDefensif` | repli après un pied adverse | — | à créer |
| `ai_lectureDefensiveAile` | monter, rester, couvrir le pied | — | à créer |
| `ai_plaquageEnCoin` | pousser le porteur en touche | — | à créer |
| `ai_renfortAutreAile` | quitter l'aile fermée et participer côté ouvert | — | à créer |
| `ai_jeuPiedCourt` | petit pied à suivre le long de la touche | — | à créer |
| `ai_11_gaucher` | ailier gauche gaucher (main et pied côté touche) | jeu le long de la touche gauche | à créer |
| `ai_14_droitier` | ailier droit droitier (main et pied côté touche) | jeu le long de la touche droite | à créer |

#### Arrière (15)
| Clé | Description | Effet dans la simulation | Moteur |
|---|---|---|---|
| `ar_receptionBallonHaut` | chandelles et dégagements, sous pression | — | à créer |
| `ar_placementFond` | être là où tombera le pied adverse | — | à créer |
| `ar_relance` | choisir de relancer ou de taper | — | à créer |
| `ar_jeuPiedLong` | renvoyer loin, en touche ou dans l'en-but | — | à créer |
| `ar_intercale` | s'intercaler dans la ligne au bon moment | — | à créer |
| `ar_dernierRideau` | dernier plaquage, couper l'angle | — | à créer |
| `ar_communicationFond` | organiser le triangle arrière | — | à créer |
| `ar_contreAttaque` | relance après un pied adverse mal dosé | — | à créer |
| `ar_buteurSecours` | deuxième buteur | — | à créer |

### 3.13 Conditions de jeu (sensibilité individuelle)
Chaque joueur réagit différemment aux conditions ; la caractéristique module les gestes concernés.
| Clé | Description | Effet dans la simulation | Moteur |
|---|---|---|---|
| `jeuSousPluie` | mains et appuis sur ballon et terrain mouillés | — | à créer |
| `ballonGlissant` | passes et réceptions avec un ballon gras | — | à créer |
| `jeuDansLeVent` | jeu au pied et lancer dans le vent | — | à créer |
| `terrainLourd` | vitesse et appuis sur terrain gras ou boueux | — | à créer |
| `chaleur` | fatigue par forte chaleur | — | à créer |
| `froid` | raideur, mains engourdies | — | à créer |
| `pressionPublic` | performance devant un public hostile | — | à créer |
| `arbitreStrict` | adaptation à un arbitre pointilleux | — | à créer |
| `terrainSynthetique` | appuis sur synthétique | — | à créer |

### 3.14 Situations et transitions de jeu
| Clé | Description | Effet dans la simulation | Moteur |
|---|---|---|---|
| `contreAttaque` | exploiter un ballon de récupération (turnover, mauvais pied adverse) | — | à créer |
| `reactionTurnover` | passer de l'attaque à la défense (et inversement) en une seconde | — | à créer |
| `jeuSupNumerique` | exploiter un carton adverse | — | à créer |
| `jeuInfNumerique` | défendre à 14 | — | à créer |
| `attaque22Adverse` | efficacité près de la ligne adverse (pick-and-go, maul, finition) | — | à créer |
| `defenseSaLigne` | défendre à 5 m de sa ligne (montée, plaquage bas, ne pas faire de faute) | — | à créer |
| `sortieDeCamp` | sortir de ses 22 m sous pression | — | à créer |
| `finDeMatch` | décisions et exécution dans les 10 dernières minutes | — | à créer |
| `sonnerie` | garder le ballon ou marquer après la sonnerie | — | à créer |
| `relancePenaliteRapide` | jouer vite une pénalité (tap-and-go) | — | à créer |
| `jeuDesordonne` | performer dans un jeu cassé (ballon libre, phase désorganisée) | — | à créer |
| `jeuStructure` | exécuter le plan après mêlée ou touche | — | à créer |

### 3.15 Coups d'envoi, réceptions, chasse
| Clé | Description | Effet dans la simulation | Moteur |
|---|---|---|---|
| `coupEnvoiPrecision` | précision du coup d'envoi | coup d'envoi contestable | à créer |
| `coupEnvoiHauteur` | hauteur du coup d'envoi | temps laissé aux chasseurs | à créer |
| `receptionCoupEnvoi` | prendre le coup d'envoi au milieu de la chasse | — | à créer |
| `chasseCoupDePied` | vitesse et ligne de chasse, rester en jeu | — | à créer |
| `chasseEnLigne` | chasser en ligne avec ses partenaires (pas de trou) | — | à créer |
| `pressionReceveur` | plaquer le receveur dès la réception | — | à créer |
| `renvoi22` | renvoi aux 22 m / depuis l'en-but | — | à créer |
| `marque` | appeler la marque dans ses 22 m | — | à créer |

### 3.16 Remplaçants, impact et gestion de l'effort
| Clé | Description | Effet dans la simulation | Moteur |
|---|---|---|---|
| `impactEntree` | niveau d'intensité en entrant en jeu | — | à créer |
| `gestionEffort` | doser son effort sur 80 minutes | — | à créer |
| `tempsDeJeuIdeal` | minutes avant la baisse de rendement | — | à créer |
| `polyvalenceBanc` | postes couverts depuis le banc | — | à créer |

### 3.17 Vice, triche et rapport à l'arbitre
La triche n'est **jamais** un résultat écrit par le joueur : elle est une **tentative** que l'arbitre voit ou ne voit
pas (perception de l'arbitre, son placement, son profil). Pris, c'est la sanction prévue par la loi.
| Clé | Description | Effet dans la simulation | Moteur |
|---|---|---|---|
| `vice` | jeu à la limite des lois | gains marginaux au ruck et au maul, pénalités si l'arbitre le voit | à créer |
| `triche` | propension à la faute volontaire dissimulée : hors-jeu au ruck, mains au ruck, retenir le porteur, | — | à créer |
  obstruction, tirer un maillot en touche, écrouler un maul, plaquage retardé, en-avant volontaire.
| Clé | Description | Effet dans la simulation | Moteur |
|---|---|---|---|
| `lectureArbitre` | savoir jusqu'où l'arbitre laisse aller | fautes commises au bon moment, moins sanctionnées | à créer |
| `simulation` | exagérer une faute subie | avantage obtenu, ou carton si l'arbitre le voit | à créer |
| `provocation` | chercher l'adversaire | cartons, échauffourées | à créer |
| `reactionProvocation` | réagir aux provocations | cartons, fautes de représailles | à créer |
| `discipline` | maîtrise de soi | fréquence des fautes involontaires (existe) | oui |

### 3.18 Lecture du jeu, perception et décision
| Clé | Description | Effet dans la simulation | Moteur |
|---|---|---|---|
| `lectureJeu` | comprendre la situation | délai de réaction, erreurs d'estimation | à créer |
| `vision` | portée et champ de vision, options vues | — | à créer |
| `anticipation` | prévoir la passe, la course, le pied adverse | — | à créer |
| `prisePositionnelle` | être au bon endroit avant le ballon | — | à créer |
| `decision` | choisir la bonne option | — | oui |
| `decisionSousPression` | garder ses choix sous pression et en fin de match | — | à créer |
| `priseDeRisque` | goût du risque | gestes osés, ballons perdus | à créer |
| `altruisme` | tendance à passer | passes décisives | à créer |
| `egoisme` | tendance à garder le ballon | percées solitaires, ballons perdus | à créer |
| `gestionTemps` | gérer le chrono et le score (fin de match, sonnerie) | — | à créer |
| `lectureAdversaire` | repérer le défenseur faible, l'annonce adverse | — | à créer |

### 3.19 Connaissances tactiques et collectives
| Clé | Description | Effet dans la simulation | Moteur |
|---|---|---|---|
| `connaissancePlan` | maîtrise du plan de jeu du club (placements, consignes) | — | à créer |
| `annonces` | connaissance des codes de touche, mêlée, combinaisons | — | à créer |
| `connaissanceRegles` | finesse des lois (hors-jeu, en-avant volontaire, ruck) | — | à créer |
| `experience` | matchs joués et niveau connu | stabilité des décisions | à créer |
| `polyvalence` | postes connus et niveau à chacun | — | à créer |
| `cohesion` | habitude avec chaque partenaire (charnière 9–10, centres, triangle arrière) | timing des passes et des croisées | à créer |
| `communication` | parler, être entendu, comprendre | portée et clarté des appels | à créer |
| `leadership` | capitaine, orateur, choix du capitaine | — | à créer |
| `leadershipDefensif` | organiser la ligne par la voix | — | à créer |

### 3.20 Mental et caractère
| Clé | Description | Effet dans la simulation | Moteur |
|---|---|---|---|
| `concentration` | erreurs d'inattention (en-avants bêtes, hors-jeu) | — | à créer |
| `sangFroid` | gestes décisifs sous pression | — | à créer |
| `confianceSoi` | niveau qui monte/descend selon les réussites | — | à créer |
| `courage` | s'engager au contact, aller au sol pour un ballon | — | à créer |
| `agressivite` | intensité | plaquages dominants mais fautes | à créer |
| `resilience` | réaction après une erreur ou un essai encaissé | — | à créer |
| `motivation` | engagement à l'entraînement et en match (Mode Club) | — | à créer |
| `regularite` | constance d'un match à l'autre | — | à créer |
| `grandsMatchs` | performance dans les matchs à enjeu | — | à créer |
| `espritEquipe` | se sacrifier pour le collectif (déblayage ingrat, course leurre) | — | à créer |

### 3.21 Latéralité
| Clé | Description | Effet dans la simulation | Moteur |
|---|---|---|---|
| `piedFort` | pied fort (gauche ou droit) | côté des coups de pied | à créer |
| `mainForte` | main forte | passes et raffût du bon côté | à créer |
| `coteDePrediction` | côté vers lequel il crochète naturellement | lisible par les défenseurs | à créer |

### 3.22 État du jour (dynamique)
Ils **modulent** toutes les caractéristiques ci-dessus sans les remplacer.

| Clé | Description | Effet dans la simulation | Moteur |
|---|---|---|---|
| `fatigue` | fatigue accumulée dans le match | baisse de toutes les caractéristiques physiques et techniques | partiel |
| `forme` | forme de la semaine | modulation globale (Mode Club) | à créer |
| `confiance` | confiance dans le match | monte avec les réussites, baisse avec les erreurs | à créer |
| `blessure` | blessure en cours | caractéristiques réduites, sortie | à créer |
| `douleur` | douleur après un choc | baisse temporaire | à créer |
| `carton` | exclusion temporaire ou définitive | joueur absent du terrain | à créer |

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
