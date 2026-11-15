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
- `ralentissementRuck` — ralentir le ballon adverse (à la limite des lois, cf. section « Vice, triche »).

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
- `pg_liaisonTalonneur` — qualité de la liaison avec son talonneur.
- `pg_tenueVisAVis` — tenir le pilier droit adverse (un seul adversaire) sans reculer.
- `pg_angleEntree` — entrée droite et légale, ne pas « rentrer » sous l'adversaire.
- `pg_pressionAutorisee` — mettre la pression sur le pilier droit sans écrouler.
- `pg_resistanceAuxDeuxContre` — résister quand l'adversaire pousse de travers sur lui.
- `pg_stabiliteSurIntroduction` — rester stable au moment de l'introduction (le talonneur lève le pied).
- `pg_leveeAvant` — lever le sauteur de devant en touche.
- `pg_porteurAuPres` — porter le ballon près du ruck, en pod.
- `pg_deblayageCourt` — nettoyer le ruck tout proche.
- `pg_plaquageRepetition` — plaquer encore à la 70e minute.
- `pg_passeAvant` — la passe courte d'un avant dans un pod (souvent faible).
- `pg_lectureArbitreMelee` — sentir ce que l'arbitre sanctionne en mêlée.

#### Talonneur (2)
- `ta_talonnage` — talonner vite et proprement le ballon introduit.
- `ta_talonnageContre` — talonner sur introduction adverse (rare mais décisif).
- `ta_liaisonPiliers` — tenir ses deux piliers liés.
- `ta_precisionLancer` — lancer droit, sur la main du sauteur.
- `ta_puissanceLancer` — atteindre le fond d'alignement.
- `ta_trajectoireLancer` — hauteur/longueur adaptées à l'annonce (lob, lancer tendu).
- `ta_rapiditeLancer` — lancer avant que la défense ne s'organise.
- `ta_lancerSousPression` — lancer droit dans un moment décisif (touche à 5 m).
- `ta_lancerVent` — corriger le vent et la pluie.
- `ta_appelTouche` — choisir ou relayer l'annonce.
- `ta_queueMaul` — prendre la queue du maul après son lancer et marquer.
- `ta_gratteur` — jackal au sol (souvent un point fort du talonneur moderne).
- `ta_vitesseAvant` — mobilité supérieure aux piliers.
- `ta_jeuDansLeCouloir` — porteur et passeur dans le premier couloir.

#### Pilier droit (3)
- `pd_tenueDeuxAdversaires` — tenir le pilier gauche et le talonneur adverses.
- `pd_porterLaMelee` — supporter le poids du paquet côté droit.
- `pd_angleEntree` — entrée légale, ne pas tourner.
- `pd_stabiliteSousPression` — ne pas s'effondrer, ne pas se relever.
- `pd_poussee` — faire reculer la mêlée adverse.
- `pd_pressionSurTalonneur` — gêner le talonnage adverse.
- `pd_resistanceFatigue` — tenir la mêlée en fin de match.
- `pd_leveeArriere` — lever le sauteur de milieu ou de fond.
- `pd_porteurAuPres`, `pd_plaquageRepetition`.

#### Deuxièmes lignes (4, 5)
- `dl_detente` — hauteur de saut.
- `dl_timingSaut` — synchronisation avec le lancer.
- `dl_receptionHaute` — capter à bout de bras.
- `dl_feinteSaut` — leurrer le contre-sauteur.
- `dl_contreSaut` — contester le lancer adverse.
- `dl_lectureAlignement` — deviner la cible adverse.
- `dl_levee` — lever un partenaire.
- `dl_pousseeMelee` — poussée en deuxième ligne (moteur de la mêlée).
- `dl_liaisonPiliers` — liaison sur les piliers.
- `dl_receptionCoupEnvoi` — prendre les coups d'envoi.
- `dl_maulAvant` — porter et diriger le maul.
- `dl_deblayage` — déblayer en masse.
- `dl_plaquageRepetition` — enchaîner les plaquages.
- `dl_leadershipAvants` — organiser le pack (souvent capitaine).
- `dl_5_annonceTouche` (5) — sauteur principal qui « appelle » la touche.

#### Troisièmes lignes ailes (6, 7)
- `tl_vitesseVersRuck` — premier arrivé au plaquage.
- `tl_grattage` — jackal légal, mains sur le ballon avant le ruck.
- `tl_ralentissement` — ralentir la sortie adverse (à la limite, cf. section « Vice, triche »).
- `tl_plaquageVolume` — nombre de plaquages possibles par match.
- `tl_plaquageOffensif` — plaquage dominant.
- `tl_couvertureDefensive` — couvrir derrière la ligne.
- `tl_soutienPorteur` — suivre la percée, recevoir l'offload.
- `tl_sautFond` — sauteur de fond d'alignement (6).
- `tl_ralentirLe9` — gêner le 9 adverse à la sortie de mêlée/ruck.
- `tl_7_coteOuvert` (7) — défense rapide côté ouvert.
- `tl_6_coteFerme` (6) — défense et jeu du côté fermé.
- `tl_porteurDansLesLignes` — courir dans l'intervalle entre les avants adverses.
- `tl_maulDefense` — contrer le maul.

#### Numéro 8
- `n8_controleBallonPied` — garder le ballon dans les pieds en mêlée qui avance.
- `n8_ramassagePiedMelee` — ramasser vite et proprement au fond de la mêlée.
- `n8_departHuit` — partir avec le ballon (et prévenir le 9 : `SCRUM_8_GOING`).
- `n8_passeAu9` — sortir le ballon au 9 depuis le pied de mêlée.
- `n8_percussionCourte` — gagner la ligne d'avantage au près.
- `n8_lectureMelee` — sentir si la mêlée avance ou recule pour choisir.
- `n8_sautFond`, `n8_couvertureFond`, `n8_soutien`.
- `n8_communicationAvec9` — dialogue 8 ↔ 9 (annonce de départ, ballon gardé).

#### Demi de mêlée (9) — le roi du ramassage et de la passe rapide sous pression
- `dm_ramassage` — ramasser le ballon au sol, quelle que soit sa position, en un geste.
- `dm_ramassageSousPression` — ramasser avec un adversaire qui arrive dessus (3e ligne qui ralentit, gratteur).
- `dm_passeDuSol` — passer sans se relever, ballon tendu.
- `dm_ejection` — vitesse entre la prise et le lâcher (moins de 0,5 s pour un très bon 9).
- `dm_precisionPasse` — ballon dans la course du receveur, à la bonne hauteur.
- `dm_passeLongueSol` — portée de la passe du sol (sauter un joueur depuis le ruck).
- `dm_passeDeuxCotes` — aussi bonne à gauche qu'à droite.
- `dm_passeSousPression` — réussir avec un adversaire collé, ballon sale, ballon qui roule.
- `dm_ballonSale` — jouer un ballon mal présenté, au fond d'un ruck lent.
- `dm_lectureRuck` — savoir quand le ballon est jouable, ne pas se faire contrer.
- `dm_lecturePetitCote` — voir le petit côté exploitable.
- `dm_sniping` — partir au ras du ruck.
- `dm_boxKick` — chandelle depuis la base, hauteur et précision.
- `dm_boxKickSousPression` — box-kick avec la défense qui monte.
- `dm_introductionMelee` — introduction légale et rapide.
- `dm_jeuApresMelee` — sortir de mêlée (lecture, passe, départ).
- `dm_relaisTouche` — recevoir du sauteur et distribuer.
- `dm_commandementAvants` — diriger les avants à la voix (pods, ruck).
- `dm_dialogue10` — complicité et dialogue avec le 10 (questions de touche et de mêlée).
- `dm_rythme` — accélérer ou ralentir le jeu selon la situation.
- `dm_couvertureRuck` — défendre au bord du ruck, plaquer le pick-and-go.
- `dm_couvertureFond` — couvrir le pied adverse derrière la ligne.
- `dm_gestionArbitre` — parler à l'arbitre, savoir quand le ballon « est utilisé ».
- `dm_pressionOral` — résister à la pression verbale et physique.

#### Demi d'ouverture (10)
- `do_passeLongue`, `do_passeAPlat`, `do_passeSautee` — distribution.
- `do_timingFixation` — attaquer la ligne et passer au dernier moment.
- `do_lectureDefense` — défense qui monte, qui glisse, surnombre, trou.
- `do_choixJeu` — main, pied, au près, au large selon la lecture.
- `do_jeuPiedTactique` — occupation, touche, chandelle, passe au pied, grubber.
- `do_buteur` — précision et distance au but.
- `do_drop` — drop en jeu.
- `do_commandementLigne` — placer la ligne d'attaque à la voix.
- `do_combinaisons` — exécuter les combinaisons du plan (croisée, boucle, intercalé).
- `do_jeuSousPression` — décisions avec la troisième ligne adverse dessus.
- `do_defenseCanal` — défendre son couloir (souvent un point faible).
- `do_gestionMatch` — gérer le score, le territoire, la fin de match.
- `do_dialogue9` — complicité avec le 9.
- `do_communication` — se faire entendre de toute la ligne.

#### Premier centre (12)
- `c12_percussion` — fixer en percussion, gagner la ligne d'avantage.
- `c12_passeSousPression` — passer au contact.
- `c12_offload`, `c12_deuxiemeMeneur` — relais de distribution, deuxième ouvreur.
- `c12_jeuPied` — pied gauche/droit en relais du 10.
- `c12_defenseFrontale` — plaquer les porteurs lourds.
- `c12_grattage` — contester au sol en défense.
- `c12_angleCourse` — courses à contre-pied.

#### Second centre (13)
- `c13_vitesseGrandCouloir` — attaquer l'espace large.
- `c13_cadrageDebordement` — fixer et décaler l'ailier.
- `c13_passeDecisive` — servir l'ailier au bon moment.
- `c13_defenseGrandCouloir` — décider : monter, glisser, rester (le poste le plus dur en défense).
- `c13_lectureSurnombre` — compter les attaquants extérieurs.
- `c13_interception`, `c13_couverture`.

#### Ailiers (11, 14)
- `ai_vitesse`, `ai_acceleration` — finition et retours.
- `ai_finitionCoin` — marquer en coin sans sortir en touche.
- `ai_jeuLongTouche` — courir le long de la ligne de touche sans mettre le pied dehors.
- `ai_receptionBallonHaut` — chandelles, passes au pied.
- `ai_contestationAerienne` — sauter contre l'arrière adverse.
- `ai_retourDefensif` — repli après un pied adverse.
- `ai_lectureDefensiveAile` — monter, rester, couvrir le pied.
- `ai_plaquageEnCoin` — pousser le porteur en touche.
- `ai_renfortAutreAile` — quitter l'aile fermée et participer côté ouvert.
- `ai_jeuPiedCourt` — petit pied à suivre le long de la touche.
- `ai_11_gaucher` / `ai_14_droitier` — main et pied du côté de la touche.

#### Arrière (15)
- `ar_receptionBallonHaut` — chandelles et dégagements, sous pression.
- `ar_placementFond` — être là où tombera le pied adverse.
- `ar_relance` — choisir de relancer ou de taper.
- `ar_jeuPiedLong` — renvoyer loin, en touche ou dans l'en-but.
- `ar_intercale` — s'intercaler dans la ligne au bon moment.
- `ar_dernierRideau` — dernier plaquage, couper l'angle.
- `ar_communicationFond` — organiser le triangle arrière.
- `ar_contreAttaque` — relance après un pied adverse mal dosé.
- `ar_buteurSecours` — deuxième buteur.

### 3.13 Conditions de jeu (sensibilité individuelle)
Chaque joueur réagit différemment aux conditions ; la caractéristique module les gestes concernés.
- `jeuSousPluie` — mains et appuis sur ballon et terrain mouillés.
- `ballonGlissant` — passes et réceptions avec un ballon gras.
- `jeuDansLeVent` — jeu au pied et lancer dans le vent.
- `terrainLourd` — vitesse et appuis sur terrain gras ou boueux.
- `chaleur` — fatigue par forte chaleur.
- `froid` — raideur, mains engourdies.
- `pressionPublic` — performance devant un public hostile.
- `arbitreStrict` — adaptation à un arbitre pointilleux.
- `terrainSynthetique` — appuis sur synthétique.

### 3.14 Situations et transitions de jeu
- `contreAttaque` — exploiter un ballon de récupération (turnover, mauvais pied adverse).
- `reactionTurnover` — passer de l'attaque à la défense (et inversement) en une seconde.
- `jeuSupNumerique` — exploiter un carton adverse.
- `jeuInfNumerique` — défendre à 14.
- `attaque22Adverse` — efficacité près de la ligne adverse (pick-and-go, maul, finition).
- `defenseSaLigne` — défendre à 5 m de sa ligne (montée, plaquage bas, ne pas faire de faute).
- `sortieDeCamp` — sortir de ses 22 m sous pression.
- `finDeMatch` — décisions et exécution dans les 10 dernières minutes.
- `sonnerie` — garder le ballon ou marquer après la sonnerie.
- `relancePenaliteRapide` — jouer vite une pénalité (tap-and-go).
- `jeuDesordonne` — performer dans un jeu cassé (ballon libre, phase désorganisée).
- `jeuStructure` — exécuter le plan après mêlée ou touche.

### 3.15 Coups d'envoi, réceptions, chasse
- `coupEnvoiPrecision`, `coupEnvoiHauteur` — coup d'envoi contestable.
- `receptionCoupEnvoi` — prendre le coup d'envoi au milieu de la chasse.
- `chasseCoupDePied` — vitesse et ligne de chasse, rester en jeu.
- `chasseEnLigne` — chasser en ligne avec ses partenaires (pas de trou).
- `pressionReceveur` — plaquer le receveur dès la réception.
- `renvoi22` — renvoi aux 22 m / depuis l'en-but.
- `marque` — appeler la marque dans ses 22 m.

### 3.16 Remplaçants, impact et gestion de l'effort
- `impactEntree` — niveau d'intensité en entrant en jeu.
- `gestionEffort` — doser son effort sur 80 minutes.
- `tempsDeJeuIdeal` — minutes avant la baisse de rendement.
- `polyvalenceBanc` — postes couverts depuis le banc.

### 3.17 Vice, triche et rapport à l'arbitre
La triche n'est **jamais** un résultat écrit par le joueur : elle est une **tentative** que l'arbitre voit ou ne voit
pas (perception de l'arbitre, son placement, son profil). Pris, c'est la sanction prévue par la loi.
- `vice` — jeu à la limite des lois → gains marginaux au ruck et au maul, pénalités si l'arbitre le voit.
- `triche` — propension à la faute volontaire dissimulée : hors-jeu au ruck, mains au ruck, retenir le porteur,
  obstruction, tirer un maillot en touche, écrouler un maul, plaquage retardé, en-avant volontaire.
- `lectureArbitre` — savoir jusqu'où l'arbitre laisse aller → fautes commises au bon moment, moins sanctionnées.
- `simulation` — exagérer une faute subie → avantage obtenu, ou carton si l'arbitre le voit.
- `provocation` / `reactionProvocation` — chercher l'adversaire / réagir aux provocations → cartons, échauffourées.
- `discipline` — maîtrise de soi → fréquence des fautes involontaires (existe).

### 3.18 Lecture du jeu, perception et décision
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

### 3.19 Connaissances tactiques et collectives
- `connaissancePlan` — maîtrise du plan de jeu du club (placements, consignes).
- `annonces` — connaissance des codes de touche, mêlée, combinaisons.
- `connaissanceRegles` — finesse des lois (hors-jeu, en-avant volontaire, ruck).
- `experience` — matchs joués et niveau connu → stabilité des décisions.
- `polyvalence` — postes connus et niveau à chacun.
- `cohesion` — habitude avec chaque partenaire (charnière 9–10, centres, triangle arrière) → timing des passes et des croisées.
- `communication` — parler, être entendu, comprendre → portée et clarté des appels.
- `leadership` — capitaine, orateur, choix du capitaine.
- `leadershipDefensif` — organiser la ligne par la voix.

### 3.20 Mental et caractère
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

### 3.21 Latéralité
- `piedFort` (G/D), `piedFaible` (0–100) ; `mainForte`, `passeGauche`, `passeDroite` ; `coteDePrediction` (côté vers lequel il crochète naturellement).

### 3.22 État du jour (dynamique)
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
