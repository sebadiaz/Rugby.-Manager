# V4 — Top 14 **action par action**, pas seulement match par match

**Établi le 8 novembre 2026.** Ce document dépasse le niveau « Toulouse passe beaucoup / Afrique du Sud pousse davantage ». Il étudie le **choix de chaque joueur**, les courses sans ballon, les conséquences sur le défenseur, les erreurs de lecture, la latence et les transitions entre phases. **Source machine lisible :** `fixtures/micro_actions_top14.json` (7 études, **47 micro-étapes**, **22 variantes contrefactuelles**).

**Définitions de preuve** :
- **OBSERVÉ** : une action explicitement décrite dans un compte rendu ou une analyse tactique accessible, rattachée à l'URL.
- **RECONSTITUTION** : croyance plausible, intention, sous-but, trajectoire ou dialogue **proposé pour Rugby Manager**. Même lorsque l'action finale est documentée, les pensées et les appels réels des joueurs ne le sont **pas**.
- **STATISTIQUE** : résultat agrégé sur un match ou une période ; **jamais** un déroulé de match particulier.
- **CONTREFACTUEL** : scène synthétique changeant UNE seule circonstance, pour démontrer qu'un agent peut choisir autrement.
- **INCONNU** : coordonnées réelles des 30 joueurs, positions à chaque image, vitesse/angle exacts, paroles prononcées, éventuel code de combinaison. **Ne pas inventer des horodatages à la seconde.**

Le bus d'appels `engine/ai/local-communication.js` est déjà testé en isolation, mais n'est **pas encore branché au match**. Tous les buts et trajectoires évoqués restent des **spécifications de développement**.

## I. Finale Top 14 2025 : Toulouse–UBB, essai Jelonch (~31e) — **13 micro-décisions**

**Ce cas est notre benchmark tactique prioritaire.** Trois sources examinent le même lancement :
- [Eurosport, décomposition des alignements défenseurs (captures de Canal+)](https://www.eurosport.fr/rugby/top-14/2024-2025/une-combinaison-ciselee-lessai-danthony-jelonch-toulouse-en-finale-du-top-14-face-a-lubb-decrypte_sto23196768/story.shtml)
- [Midi Olympique/Rugbyrama, analyse technique de la combinaison](https://www.rugbyrama.fr/2025/06/29/finale-top-14-technique-comment-anthony-jelonch-a-pu-tromper-la-defense-de-lubb-sur-son-essai-12794092.php)
- [Rugbyrama, description du film d'essai](https://www.rugbyrama.fr/2025/06/28/video-finale-top-14-toulouse-bordeaux-begles-revivez-le-premier-essai-de-la-partie-inscrit-par-anthony-jelonch-12792712.php)

**Attention :** les sources ne sont pas entièrement cohérentes sur la qualification de la remise en jeu à cinq mètres : « pénalité jouée à la main » et « coup franc joué » sont mentionnés. **Ne pas imposer silencieusement l'une des deux lois dans le moteur sans revoir la séquence.** Distinguer l'événement **arbitre a autorisé une reprise à la main à 5 m** (confirmé) du `restartType` exact (à confirmer par replay/feuille arbitrale). Ce n'est **pas un départ derrière une mêlée** simplement parce que Jelonch porte le numéro 8.

### Enchaînement sourcé et son interprétation individuelle

| Ordre logique, **pas seconde mesurée** | Action observée | Décision individuelle que notre moteur DOIT pouvoir prendre |
|---|---|---|
| 1 | Essai de Marchand refusé, nouvelle remise en jeu à 5 m, Petti temporairement exclu | n°9 choisit une reprise permise en tenant compte du surnombre ; aucune action ne peut commencer avant le signal arbitral |
| 2 | Une première cellule d'avants toulousains est présentée comme option/leurre | chaque avant connaît ses possibilités mais **choisit son propre démarrage** selon timing et porteur |
| 3 | Les avants se décalent ; défense bordelaise doit décider quoi surveiller | chaque défenseur perçoit une menace et choisit **sa propre cible** |
| 4 | Samu et Moefana avancent, Gazzotti reste en retrait (écart d'environ 3 m signalé par Eurosport) | `PRESS_CARRIER`, `COVER_INSIDE` ou `HOLD_GOALLINE` se concurrencent ; pas de « ligne défensive pilotée d'un seul bloc » |
| 5 | Graou sert Flament par-delà le premier pod | le 9 a plusieurs options (premier bloc, deuxième bloc, renversement) **sans passe téléportée** |
| 6 | Willis propose une course derrière Jelonch ; l'attention de Moefana s'y concentre | `CREATE_DECOY` devient un but légitime **sans ballon** ; un leurre peut effectivement modifier la décision d'un défenseur |
| 7 | Jelonch arrive dans un autre intervalle, initialement masqué derrière Chocobares | `CUT_INSIDE` et `BE_PASS_OPTION` choisissent un axe **individuel** compatible avec le plan connu |
| 8 | Flament lit l'ouverture et sert Jelonch à hauteur | `FIX_AND_PASS` contre `CARRY` / `PASS_WILLIS` selon la défense **réellement vue**, pas selon le script « Jelonch marque à la 31e » |
| 9 | Moefana hésite, ne peut pas plaquer Willis sans ballon ; Gazzotti tente de revenir | gardes du plaquage légal, inertie, retour défensif et mauvais choix individuel possibles |
| 10 | Jelonch franchit et aplatit pour marquer | porteur unique, ballon contrôlé et essai accordé uniquement par le moteur/arbitre |

**Pourquoi il faut le coder autrement :** un joueur en leurre doit fournir une **menace crédible**, pas recevoir un objectif « attirer Moefana » omniscient. Willis ne sait pas à l'avance que Moefana va le couvrir. Il peut décider de courir en soutien parce que la combinaison le prévoit et que sa zone est praticable ; **Moefana choisit ensuite seul** d'y réagir ou pas.

**Quatre contre-tests déterministes** :
1. Moefana garde Jelonch plutôt que Willis : Flament peut servir Willis ou conserver ; Jelonch ne doit **pas** toujours marquer.
2. Samu/Moefana montent ensemble avec Gazzotti : la passe trouve éventuellement un autre angle, mais le trou historique est refermé.
3. Graou choisit le **premier** bloc : Flament n'a pas immédiatement le ballon ; l'action doit pouvoir évoluer vers un ruck ou une nouvelle phase.
4. Flament est plaqué avant de libérer : ruck/contact/ballon perdu possibles, pas de passe de secours magique.

**Métrologie** : journaliser `prepass_defender_angle`, `defender_attention_target` (croyance du défenseur), `carrier_fixation_duration`, `deception_reaction`, `receiver_eta`, `legal_pass_window` et `outcome`. Ces noms sont **proposés**, les valeurs devront être mesurées dans la simulation.

## II. Même finale, côté UBB : pied rasant Lucu → Penaud (~35e) — **5 micro-étapes**

Sources : [L'Équipe](https://www.lequipe.fr/Rugby/Actualites/L-essai-leche-de-damian-penaud-pour-bordeaux-begles-en-finale-du-top-14-face-au-stade-toulousain-en-video/1573894) et [Le Monde, chronologie](https://www.lemonde.fr/sport/article/2025/06/29/toulouse-bordeaux-begles-le-stade-toulousain-conserve-son-titre-de-champion-de-france-de-rugby-au-terme-d-une-folle-finale_6616317_3242.html).

**OBSERVÉ :** le 9 Maxime Lucu joue un **ras de terre côté fermé**, Damian Penaud le poursuit, récupère et élimine Matthis Lebel avant d'aplatir.

**Décisions à reconstituer :**
- **Lucu** : `PASS` vs `CARRY` vs `GRUBBER_TO_BLINDSIDE`. Il estime vitesse, couverture profonde et receveur possible ; **le pied n'est ni un up-and-under ni un box kick obligatoires**.
- **Penaud** : il n'est pas conduit par une cible serveur prédéfinie ; il voit le pied, estime le rebond, accélère puis réévalue le duel avec Lebel.
- **Lebel** : doit choisir anticiper la trajectoire du ballon, fermer la course de Penaud ou attendre le contrôle avant plaquage ; un défenseur qui s'engage trop tôt peut être éliminé.
- **Autres trois-quarts** : couverture et repli décidés par chacun si perte de possession.

**Trois contre-tests** : Lebel prend le ballon avant Penaud ; coup de pied trop puissant ; poursuivant hors-jeu. Le modèle doit permettre un **échec complet du même choix tactique**.

## III. Racing–Bayonne, 22 novembre 2025 : départ du 8 Hughes → soutien Hill (~77e) — **7 micro-étapes**

Source : [L'Équipe, direct Racing 47–27 Bayonne](https://www.lequipe.fr/Rugby/match-direct/top-14/2025-2026/racing-92-bayonne-live/40474).

**OBSERVÉ :** Nathan Hughes part de l'arrière d'une mêlée, bouscule Anscombe et Jonny Hill marque ensuite près des poteaux. Le direct ne démontre **ni la phrase dite par Hughes au 9 ni la transmission exacte entre Hughes et Hill**.

**Règle produit obligatoire**, avec deux moments distincts :
1. Le **9** consulte le 10 (près / large / avancer), discute la possibilité avec le 8, puis annonce sa préférence.
2. Le **8** qui se décide vraiment avertit **juste avant la prise** : `SCRUM_8_GOING` → message vers 9 avec `phaseId`.
3. Si **le 9 entend**, sa mémoire individuelle reçoit `EIGHT_GOING_TO_PICK`, son plan `PICK_AT_SCRUM_BASE` est annulé s'il peut l'être, et il choisit soutien, passe-relais ou couverture **sans réaffectation centrale**.
4. Si le 9 **n'entend pas**, deux courses concurrentes peuvent se produire. Le **moteur** arbitre possession réelle, liaison, collision et rebond : **une seule balle, un seul porteur**.
5. Le 8 sort, Anscombe défend, et Hill peut trouver une ligne de soutien puis recevoir/recycler/reprendre le ballon selon ce qui arrive **réellement**.

**Ne pas coder « Hughes donne à Hill directement » :** le commentaire garantit le départ de Hughes puis l'essai de Hill, mais ne détaille pas tous les gestes entre les deux.

Tests : balle encore au tunnel ; 8 hors d'état de saisir ; 9 n'entend pas ; plaquage de Hughes avant la ligne ; message périmé de mêlée précédente. Vérifier **l'unicité de la possession** à chaque pas physique.

## IV. Toulon–Toulouse, 9 mai 2026 : le 10 change de registre, le 9 devient soutien — **6 étapes**

Sources : [RCT, compte rendu](https://rctoulon.com/toulon-toulouse-le-rct-sincline-face-au-stade-toulousain-au-velodrome/) et [L'Équipe, analyse n°9–n°10](https://www.lequipe.fr/Rugby/Actualites/L-equipe-type-de-la-23e-journee-du-top-14-le-duo-dupont-ntamack-assure/1674903).

**Deux actions DISTINCTES**, ne pas les réunir en une même possession fictive :
- **~5e :** après une touche, Dupont sert Ntamack ; **Ntamack feinte une passe et marque en conservant le ballon**. Mécanique `DUMMY_PASS` / `DEFENDER_COMMITS_TO_RECEIVER` / `CARRY`.
- **~46e :** Ntamack joue un **rasant** ; Dupont suit cette action et sert Chocobares pour l'essai. Le 9 n'est plus simplement « distributeur de ruck », mais **chasseur-récepteur du pied du 10, puis passeur**.

**Trois contre-tests :** le défenseur ignore la feinte ; l'arrière couvre le rasant ; le 9 manque la récupération. Aucun essai automatique dans ces variantes.

**Enseignement fondamental :** `kickOwnerId`, `chaserId`, `receiverId` ne sont pas attachés à des postes immuables. Le 10 peut botter derrière, le 9 devenir poursuivant et un centre achever. À chaque instant, les états physiques décident si l'action reste réalisable.

## V. Finale Toulouse–Montpellier, 27 juin 2026 : touche, **une-deux Dupont–Mauvaka** — **5 étapes**

Source : [LNR, film de la finale](https://top14.lnr.fr/actualite/finale-top-14-le-stade-toulousain-est-champion-de-france-pour-la-quatrieme-fois-de-suite).

**OBSERVÉ :** après une touche, Antoine Dupont et le talonneur Peato Mauvaka réalisent un échange aller-retour concluant sur l'essai de Mauvaka vers la 7e minute.

**À spécifier :** un talonneur n'est **pas condamné à lancer puis disparaître du plan** :
- Il doit pouvoir rejoindre sa zone de soutien après la touche **avec une trajectoire réelle**.
- Le 9 doit pouvoir lui passer si le ballon a réellement été gagné et libéré.
- Le 9 doit pouvoir devenir lui-même option de soutien ou receveur.
- Le talonneur peut recevoir, conserver ou transmettre selon défense et collision.
- Les défenseurs peuvent choisir individuellement de suivre le 9 ou le talonneur ; jamais une « formation collective instantanée ».

**Limite de source :** le rapport ne fournit pas les identités de tous les soutiens, le sauteur exact, les angles de passes ni les mots échangés. Ce sont des **paramètres de scénario**, pas des données historiques.

## VI. Toulouse–La Rochelle (2021) : sortir de ses 22 sous pression — **5 étapes**

Source : [Rugbynistère, analyse du jeu au pied de Dupont à partir de matchs de Top 14](https://www.lerugbynistere.fr/news/antoine-dupont-aussi-bon-au-pied-qua-la-main-analyse-de-son-jeu-au-pied-1409211654.php).

**OBSERVÉ :** après une touche dans les 22 toulousains, Dupont sous pression rochelaise dégage loin et gagne approximativement 60 m d'occupation.

**À apprendre à l'agent 9 :**
- `EXIT_22` peut avoir une utilité supérieure à `KEEP_POSSESSION` si la pression monte.
- Le long dégagement est **différent** de `KICK_HIGH_CONTEST` et de `GRUBBER_IN_BEHIND` ; les trajectoires, la chasse et le plan de repli diffèrent.
- Un 9 **ne botte pas obligatoirement** après une durée fixe sans progression. Il compare distance de pression, zone de terrain, couverture du fond et options légales au moment de décider.
- Les partenaires décidant de chasser ou couvrir doivent être onside ; si la balle retombe aux adversaires, leurs buts basculent en défense.

Ce cas illustre la diversité d'un **même joueur** selon son emplacement et l'état de la défense. Les 60 mètres sont une **distance de l'action rapportée**, pas une variable de moteur à copier systématiquement.

## VII. La Rochelle–Bayonne, état du Top 14 avant J9 2026/27 — **6 scénarios SYNTHÉTIQUES issus de statistiques**

Sources LNR : [La Rochelle–Bayonne, analyse d'avant-match](https://top14.lnr.fr/actualite/analyse-davant-match-stade-rochelais-aviron-bayonnais-les-statistiques-a-connaitre) et [Pau–Toulouse, analyse J8](https://top14.lnr.fr/actualite/analyse-davant-match-section-paloise-stade-toulousain-les-statistiques-a-connaitre).

| Observation LNR, saison en cours au moment du rapport | Question à faire résoudre par **chaque** joueur |
|---|---|
| La Rochelle attaque côté ouvert sur **89,9 %** de ses phases | le 9 privilégie-t-il large quand l'intervalle existe, tout en sachant choisir petit côté si la défense l'abandonne ? |
| La Rochelle rucks offensifs : **3,18 s** en moyenne | chaque soutien peut-il se repositionner assez vite pour une libération réelle, sans supposer que tous les rucks font exactement 3,18 s ? |
| Défense rochelaise ralentit le ruck adverse à **3,86 s** ; récupère **5,0 %** des rucks adverses | 6/7/8 savent-ils décider `ENTER_RUCK_LEGALLY` versus `DEFEND_NEXT_PHASE`, et peut-on observer les deux ? |
| La Rochelle a tenté **7 transversales** en octobre, **4 récupérées** | l'ailier choisit-il sa course vers le ballon au lieu de recevoir une position-cible de l'équipe ? |
| Bayonne ne conserve que **9,1 %** de ses coups de pied dans le jeu | distingue-t-on les raisons d'échec : coup de pied trop long, chasseur hors-jeu, couverture adverse, réception manquée ? |
| La Rochelle réussite mêlée : **75,8 %** | effort et contrôle individuel du n°8/avants ne doivent pas être « victoire 75,8 % assurée » avant contact |

**Ces six lignes ne sont PAS des actions observées dans une rencontre individuelle**. Elles constituent des hypothèses de calibration et des scènes adversariales à construire. Les chiffres ne sont ni des vitesses/réactions fixes de joueur ni des probabilités à échantillonner littéralement.

## VIII. Contrat de simulation d'une seule micro-action

Une entrée dans `micro_actions_top14.json` doit être interprétée ainsi :

```ts
type MicroDecision = {
  order: number; // ordre narratif, PAS secondes historiques
  actor: string; // joueur concerné, pas décision d'équipe
  reported: string | null; // ce que la SOURCE rapporte (ou null)
  evidence: 'REPORT_SUPPORTED'|'SIMULATION_ONLY'|'STATS_DERIVED_SCENARIO';
  modeled: {
    limitedPerception: string;  // informations localement disponibles
    goal: string;                // but du joueur
    options: string[];           // au moins deux actions candidates
    legalGuard: string;          // légalité et précondition moteur
    individualMovement: string;  // la course choisie par CE joueur
    possibleConsequence: string; // hypothèse, jamais résultat garanti
  };
};
```

La division entre `reported` et `modeled` est essentielle : **les buts et intentions sont toujours des hypothèses**, y compris lorsqu'on sait avec certitude que Graou a passé à Flament et que Jelonch a marqué.

### Boucle à implémenter réellement dans `AgentController`

1. **Observer** : ballon / coéquipiers/adversaires visibles / zone / hors-jeu / corps engagés / messages locaux reçus, avec **âge et confiance**.
2. **Actualiser croyances** : `BALL_AVAILABLE`, `DEFENDER_RUSHING`, `RECEIVER_OPEN`, `OWN_SUPPORT_ONSIDE`, `RISK_OF_TURNOVER`, `LAST_PHASE_GAIN`.
3. **Comparer plusieurs buts** : `DEFEND` en priorité en défense, `COVER_BACKFIELD`, `BE_PASS_OPTION`, `CREATE_DECOY`, `SECURE_RUCK`, `CARRY`, `FIX_AND_PASS`, `KICK_IN_SPACE`.
4. **Choisir un plan individuel** : course avec point de départ/angle/vitesse/accélération calculés par le joueur, sans attribution serveur.
5. **Exécuter un geste** : passe, plaquage, course, pied, lutte en ruck, sautillement/lift etc. selon les garde-fous légaux et physiques.
6. **Observer l'effet réel** : le receveur était-il là ? La défense a-t-elle mordu ? Le plaquage a-t-il réussi ? Le ballon est-il toujours contrôlé ?
7. **Replanifier localement** si objectif atteint/invalidé, danger nouveau, possession changée ou appel pertinent ; pas de coordination instantanée à 30.

**Do not** : `if (play === JELONCH_2025) moveDefender(Moefana,...)` ; `if player.id === Willis then DRAW_MOEFANA` ; `if kickReason === GRUBBER then try=true`.

## IX. Traces attendues dans les replays

Pour chaque agent et chaque décision significative :

```js
{
  tick: 1450,              // temps DU JEU : exemple synthétique, pas historique
  actorId: "A4",           // ID interne, pas numéro de maillot prouvé
  phaseId: "PENALTY-07",
  perceived: {
    ballState: "HELD_BY_ME",
    defenderRushing: true,
    insideReceiverOpen: true,
    outsideReceiverOpen: false,
    teammateCall: null,
    beliefsAgeMs: 120
  },
  goalBefore: "FIX_DEFENDER",
  goalAfter: "PASS_TO_SUPPORT",
  optionsRejected: ["CARRY_CONTACT", "PASS_OUTSIDE"],
  chosenAction: "SHORT_FLAT_PASS",
  ownMovement: {headingRad: 0.35, speedTargetMps: 3.0},
  guards: {onside:true, ballControl:true, passDirectionLegal:true},
  outcome: "BALL_RELEASED", // l'exécution du moteur peut encore donner en-avant
  reason: "supportVisibleAndDefenderCommitted"
}
```

L'exemple utilise des **valeurs synthétiques de débogage** ; ne jamais les reproduire comme des coordonnées mesurées sur un vrai match. Le moteur doit logger **ce que le joueur croyait** avant l'action, pas enregistrer a posteriori la position parfaite des adversaires pour justifier un plan.

**Métriques par agent** : compteur de buts/choix, distance/speed d'arrivée au soutien, temps réaction depuis appel entendu, erreur de lecture défense, passe impossible refusée, hors-jeu évité, support en retard, espace créé par leurre (mesuré après), plaquage précoce illégal évité, durée de récupération en ruck, échecs effectifs.

## X. Tests qui prouvent enfin l'IA, et pas seulement la prose

Les **22 alternatives** du JSON sont des scènes unitaires à exécuter avec le même état/graines sauf une variable : dans chacun des sept cas au moins deux options doivent être réalisables **en fonction de circonstances différentes**. Le scénario d'origine doit rester **possible**, pas garanti.

**Scénarios d'acceptation supplémentaires** :
- `MIC-01` : le défenseur Moefana marque le bon receveur ; Flament choisit un autre porteur/duel ou conserve. Aucun « défenseur obligé de mordre au leurre ».
- `MIC-02` : les courses de Cros/Willis sont décalées dans le temps : Flament peut perdre son option sans que les autres soient repositionnés par le serveur.
- `MIC-03` : passes de Graou/Flament lancées depuis des positions réellement atteintes, pas des points de réception imposés.
- `MIC-04` : soutien à Jelonch absent, contact puis ruck réel ou turnover.
- `MIC-05` : Lucu joue rasant et Penaud est hors-jeu : poursuite empêchée par la loi ; résultat physique.
- `MIC-06` : départ de Hughes, message 8→9 entendu vs perdu : une seule balle malgré conflits.
- `MIC-07` : un 9 peut devenir chasseur/récepteur d'un pied du 10 (Dupont/Ntamack), pas toujours le botteur.
- `MIC-08` : une touche peut être suivie d'un une-deux 9–talonneur, ou échouer sous contest.
- `MIC-09` : près de ses 22, 9 choisit long dégagement plutôt que chandelle selon couverture ; aucune distance magique.
- `MIC-10` : avec le même playbook « ouvrir », 9 bascule au petit côté si l'espace s'ouvre ; pas de choix figé à 89,9 %.
- `MIC-11` : deux défenseurs observant les mêmes partenaires choisissent des cibles distinctes, la ligne conserve ou perd sa cohérence **sans cerveau d'équipe**.
- `MIC-12` : le même porteur sait faire `PASS`, `KICK`, `CARRY` selon opposition avec erreur possible ; aucune réussite à 100 %.

**Tests automatiques déjà faisables** : `node server/test-v4-top14-micro-actions.js` valide la provenance, 47 décisions, 22 variantes, 7 scénarios, la séparation `reported/modeled`, l'absence de tracking inventé et le fait que **les six étapes chiffrées MICRO-07 sont SYNTHÉTIQUES**. Cela **ne démontre pas** la conformité moteur.

### Plan Claude Code après ce document

- **RM4-G42** : données de micro-actions, détection de sources contradictoires, modèle de débogage des agents par décision.
- **RM4-G43** : injection de sept scénarios, 22 branches et 12 tests MIC, traces du mouvement **de chacun** au cours d'une seule action et défenseur qui peut faire un mauvais choix.
- **RM4-G44** : simulation/benchmark avec plusieurs tactiques, comparaison réelles vs synthétiques, vérification pas d'illusion de suivi spatial, changement de plan et de course quand une seule circonstance évolue.

**Critère de sortie majeur :** nous voulons produire une action comme celle de Jelonch **sans coder l'action Jelonch**, en donnant à Graou, Flament, Jelonch, Willis, Cros, Moefana, Samu, Gazzotti et aux autres leur plan de jeu et leurs buts individuels. Puis changer la défense d'un seul joueur doit pouvoir **faire échouer le même lancement**, sans déplacer artificiellement les 29 autres.
