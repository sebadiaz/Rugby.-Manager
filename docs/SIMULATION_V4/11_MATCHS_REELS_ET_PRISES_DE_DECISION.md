# Rugby Manager V4 — Étude de matchs **réels** pour spécifier les décisions des 30 agents

**Établi le 8 novembre 2026.** Ce document sert d'entrée à Claude Code, **sans réinventer la réalité d'un match**. Les 16 séquences ci-dessous sont extraites de comptes rendus de matchs identifiés et accompagnées d'une proposition de scénario de simulation : `fixtures/observations_matchs_reels.json`.

## 0. Exigence de rigueur : observation ≠ intention ≠ implémentation

Pour chaque séquence, distinguer :

- **[OBSERVÉ]** : l'action, l'acteur, la période et l'issue décrits dans une **source publiée**. Lorsqu'on connaît seulement la minute de l'essai, on ne connaît pas les secondes de chaque passe.
- **[INCONNU]** : paroles exactes entre le 9, le 10, le 8 et les autres, plan de jeu préparé, position des **30 joueurs image par image**, motifs psychologiques précis, force du contact, angle exact des trajectoires, temps de réaction.
- **[SIMULATION]** : hypothèse explicite, utile pour rendre cette séquence possible avec des agents GOAP et de la physique, **pas** une prétendue retranscription de la pensée des joueurs.
- **[TEST]** : scène inventée, déterministe, dérivée de la séquence réelle pour vérifier qu'un comportement différent survient lorsqu'une circonstance change.

Les **4 matchs** : Angleterre–Galles 16-14 (10/02/2024), Angleterre–France 26-25 (08/02/2025), Irlande–France 27-42 (08/03/2025), France–Fidji 54-17 (07/11/2026).

**IMPORTANT :** la recherche en psychologie sportive montre que des équipes utilisent un vocabulaire de combinaisons, des pré-appels et des modifications rapides selon le tableau défensif. Les témoignages décrivent souvent un **meneur de touche parmi les avants**, avec le 9 comme relais ; un autre guide d'entraînement précise que le 9 communique, parfois sur une idée du 10. Le **9 comme initiateur et décideur final**, demandé par le propriétaire de Rugby Manager, est donc une **convention de notre jeu**, pas une généralité démontrée de tous les matchs.

Références :
- [Étude sur les mécanismes de décision de rugbymen universitaires et professionnels](https://pmc.ncbi.nlm.nih.gov/articles/PMC8149625/) — situations de touche, mêlée, défense et attaque, « slow thought »/« fast thought », langage commun.
- [Rugby Coach Weekly — le 9 et la communication lors des touches](https://www.rugbycoachweekly.net/rugby-coaching/scrum-half-communication-at-the-lineouts/).
- [World Rugby — rôle des postes](https://passport.world.rugby/officiating/match-observation-programme/teams-and-players/), notamment 8 et 9.

## 1. Match : Angleterre–Galles, 10 février 2024 — départ authentique du n°8

**Source** : [BBC Sport, Angleterre 16–14 Galles](https://www.bbc.co.uk/sport/rugby-union/68254950) ; [TNT Sports, chronologie](https://www.tntsports.co.uk/rugby/six-nations/2024/england-v-wales-six-nations-live_sto10013354/story.shtml).

### ENW01 — vers 19e : Ben Earl part de l'arrière d'une mêlée et marque

- **[OBSERVÉ]** : le n°8 anglais Ben Earl prend la balle à l'arrière de la mêlée et progresse jusqu'à l'essai. La récupération, la course et l'issue sont rapportées.
- **[INCONNU]** : pas de preuve que le n°9 ait demandé un départ du 8, ni qu'il ait discuté avec le 10. Les comptes rendus ne fournissent pas la conversation.
- **[SIMULATION]** : les agents 9, 10 et 8 ont un mini-dialogue ; le 8 évalue sa capacité de prendre le ballon et la menace proche ; le 9 peut proposer `SCRUM_8_BREAK` après avis. **Le 8 reste l'exécutant physique** et le ballon ne change de porteur qu'après une prise légale.
- **[TEST]** : mêmes équipes, même graine et ballon au fond. En configuration A, défense du petit côté ouverte => possibilité d'une sortie du 8 ; en configuration B, couverture fermée et 10 libre => possibilité d'une sortie du 9 vers l'extérieur. **Ne pas coder « score certain »** en A.

**Règle exacte** : World Rugby 19.36(b,c) prévoit notamment une fin de mêlée lorsque le joueur de fond se saisit du ballon ou que le n°8 récupère celui aux pieds d'un seconde ligne ; 19.24 interdit de prendre le ballon avec les mains **pendant** la mêlée autrement que dans la sortie légale. Loi prioritaire sur la volonté du 9.

## 2. Match : Irlande–France, 8 mars 2025 — phases, mauls, turnovers et changements de joueurs

**Source** : [Six Nations, compte rendu officiel Irlande 27–42 France](https://www.sixnationsrugby.com/en/m6n/fixtures/202500/ireland-v-france-08032025-1415/report) ; [Sky Sports, compte rendu complémentaire](https://www.skysports.com/rugby-union/ireland-vs-france/report/108369).

### IRF01 — environ 21e : touche → ballon porté → ouverture vers l'aile

- **[OBSERVÉ]** : une pénaltouche offensive française forme un maul progressant vers la ligne ; Dupont sert Bielle-Biarrey au large pour l'essai.
- **[SIMULATION]** : le 9 connaît le plan de jeu et peut avoir préparé une sortie ; tant que le maul avance et que la défense reste dense, `CONTINUE_MAUL` est une option ; si la défense se ferme intérieurement et qu'un receveur est libre, `RELEASE_TO_WING` devient possible. **Le 9 ne maîtrise pas la force du maul**.
- **[TEST]** : test en deux branches avec même touche gagnée : A, maul avance puis libération vers ailier ; B, maul bloqué et ballon indisponible, aucune passe magique. Changement du seul état `BALL_AVAILABLE` suffit à rendre l'action possible/impossible.

### IRF02 — environ 43e : maul irlandais → Dan Sheehan se détache

- **[OBSERVÉ]** : Dan Sheehan conclut une attaque après départ depuis un maul proche de la ligne française.
- **[SIMULATION]** : joueur au cœur du ballon porté avec but `SCORE_TRY`, compare `HOLD_IN_MAUL` et `PEEL_AND_CARRY` en fonction de la position réelle, des liaisons, de la visibilité et de la pression. Pas besoin qu'un coordinateur le commande.
- **[TEST]** : engagé et ballon inaccessible => départ impossible ; ballon contrôlé et sortie légale => départ possible puis contact physique, pas essai automatique.

### IRF03 — environ 29e : Dupont blessé → entrée de Maxime Lucu

- **[OBSERVÉ]** : blessure de Dupont et remplacement par le 9 Maxime Lucu. Le jeu français continue.
- **[SIMULATION]** : le nouveau 9 connaît le **plan commun** mais possède un `AgentContext` propre, ses perceptions, sa fatigue et ses compétences. Les anciens plans GOAP du titulaire **ne sont pas copiés**. Il peut demander au 10 une information utile.
- **[TEST]** : `SUBSTITUTION` invalide les plans du joueur sortant, initialise ceux du remplaçant sans accès omniscient à ses intentions et sans 16e joueur sur le terrain.

### IRF04 — environ 50e : turnover → pied intérieur de Bielle-Biarrey → poursuite

- **[OBSERVÉ]** : récupération française, puis Bielle-Biarrey joue un coup de pied vers l'intérieur et poursuit pour marquer.
- **[SIMULATION]** : une **aile** peut choisir `KICK_INFIELD` plutôt que toujours attendre que le 9 ou 10 joue au pied. Ses partenaires observent le coup de pied et réagissent avec leurs propres buts de poursuite/couverture.
- **[TEST]** : porteur A11 avec espace derrière défense : `KICK_AND_CHASE` est une option ; si pied fermé ou hors-jeu, autre action ou refus. Le score reste non garanti.

### IRF05 — environ 47e : passes après contact et appuis

- **[OBSERVÉ]** : séquence française avec des passes après contact impliquant Jean-Baptiste Gros puis Maxime Lucu, conclue par l'essai de Paul Boudehent.
- **[SIMULATION]** : `OFFLOAD` n'est possible que si le porteur est encore en état de libérer, le receveur se trouve à portée et le contact n'a pas rendu l'action illégale/impossible ; la trajectoire et le délai sont physiques.
- **[TEST]** : même contact, bras libres versus immobilisés ; réception/soutien à bonne profondeur versus absents.

### IRF06 — environ 75e : interception par Ramos → course de Penaud

- **[OBSERVÉ]** : Ramos intercepte une passe irlandaise, puis Penaud marque dans la contre-attaque.
- **[SIMULATION]** : la **défense intelligente** inclut `READ_PASS`, `INTERCEPT_IF_LEGAL`, `PROTECT_BACKFIELD`. Après récupération, les buts individuels passent défense → attaque ; le 15 ne reçoit pas une instruction centrale.
- **[TEST]** : passe lisible et trajectoire interceptable versus feinte/ligne fermée ; une décision de tenter l'interception peut échouer et laisser un intervalle.

## 3. Match : Angleterre–France, 8 février 2025 — jeu au pied, choix de pénalité et espaces

**Source** : [Six Nations, compte rendu officiel Angleterre 26–25 France](https://www.sixnationsrugby.com/en/m6n/fixtures/202500/england-v-france-08022025-1645/report).

### ENF01 — Dupont → Penaud → petit coup de pied → Bielle-Biarrey

- **[OBSERVÉ]** : en première période, après récupération de balle, Dupont progresse et trouve Penaud ; ce dernier joue un petit coup de pied rasant derrière l'adversaire pour Bielle-Biarrey, qui marque.
- **[SIMULATION]** : le porteur A14 estime `PASS_SAFE`, `CARRY` ou `GRUBBER_BEHIND` selon défense et vitesse du soutien ; l'ailier poursuivant doit courir **après** le pied et attraper/aplatir réellement.
- **[TEST]** : défenseur ferme passe et fond libre → pied peut devenir meilleur ; arrière placé derrière → pied peut perdre son intérêt.

### ENF02 — Fin Smith lève un ballon haut, Tommy Freeman le capte

- **[OBSERVÉ]** : l'ouvreur anglais Fin Smith joue un ballon haut vers les 22 français ; Freeman le capte, et la séquence aboutit à son essai après recyclage.
- **[SIMULATION]** : le **10** aussi choisit un ballon aérien : l'annonce de chandelle par le **9** est une convention de Rugby Manager **quand le 9 lui-même prépare ce pied**, pas un prérequis universel pour tous les botteurs. Les ailes estiment le point de retombée, leur temps d'arrivée et leur hors-jeu.
- **[TEST]** : évaluer `KICK_HIGH` selon air-time/point de chute/pressing et opposants ; si le receveur ne capte pas, l'issue change naturellement.

### ENF03 — Pénalité : tirs au but contre pénaltouche, puis essai au près

- **[OBSERVÉ]** : l'Angleterre dispose de deux moments de choix : une pénalité tentée au but est manquée, puis Fin Smith choisit la touche sur une pénalité suivante ; après la touche, le pilier Fin Baxter marque au près.
- **[SIMULATION]** : `PENALTY_GOAL` versus `PENALTY_TO_CORNER` dépend de score, temps, placement, efficacité au pied, confiance et chance de conquête. Après une touche gagnée, tous les joueurs n'attaquent pas au large : `PICK_AND_GO` est un but pertinent.
- **[TEST]** : même lieu mais score/temps différent ; le choix peut différer, résultat du tir non garanti, lancer/maul/essai non automatiques.

### ENF04 — Elliot Daly coupe depuis l'aile fermée pour marquer

- **[OBSERVÉ]** : dans le final, Elliot Daly quitte l'aile aveugle, reçoit une passe de Fin Smith et marque.
- **[SIMULATION]** : l'ailier `HOLD_WIDTH` peut abandonner sa référence nominale si l'ouverture intérieure devient plus intéressante et qu'il perçoit le bon moment de course ; en cas d'échec, il expose potentiellement un autre espace.
- **[TEST]** : même ailier, couloir au large fermé versus intérieur ouvert ; le changement d'angle découle de **son** but, pas d'un `TeamAI` qui change 30 positions.

## 4. Match : France–Fidji, 7 novembre 2026 — tendances contemporaines

**Sources** : [Six Nations, compte rendu France 54–17 Fidji](https://www.sixnationsrugby.com/en/m6n/news/france-run-riot-against-fiji) ; [Rugby365, chronologie des actions](https://www.rugby365.fr/championnat-des-nations-j4-suivez-france-fidji-en-direct-a-partir-de-21h10-10881793.html) ; [FFR, compte rendu](https://amp.www.ffr.fr/actualites/championnat-des-nations-france-fidji-54-17).

### FIF01 — environ 15e : séquence offensive, coup de pied tactique du 9, soutien puis essai d'un pilier

- **[OBSERVÉ]** : Dupont joue un coup de pied derrière, Attissogbe intervient, puis Jean-Baptiste Gros termine l'action après d'autres phases.
- **[SIMULATION]** : le 9 peut alterner passe, pied dans l'espace ou conservation ; l'ailier/arrière et le pilier doivent poursuivre leurs **buts individuels** en fonction de la récupération et du soutien effectifs.
- **[TEST]** : changer placement du rideau arrière → choix de pied différent ; arrivée tardive du pilier ne crée pas de soutien instantané.

### FIF02 — environ 22e : ballon porté français dominé par défense illégale → essai de pénalité

- **[OBSERVÉ]** : après touche, maul français dominant près de l'en-but ; action irrégulière des défenseurs empêchant un essai probable, décision d'essai de pénalité.
- **[SIMULATION]** : graphe de liaisons et effort réel ; une intervention illicite peut interrompre la progression, mais l'IA **ne fabrique pas un essai de pénalité** : arbitre/statut légal/danger d'essai évident sont vérifiés.
- **[TEST]** : maul qui avance légalement / défense valide / intervention délibérément illégale ; trois outcomes distincts, jamais fondés seulement sur la force statistique.

### FIF03 — environ 60e : récupération et attaque de plusieurs passes, essai de Gourgues

- **[OBSERVÉ]** : un turnover permet une attaque française au cours de laquelle Kalvin Gourgues marque ; la chronologie rapporte plusieurs passes.
- **[SIMULATION]** : `POSSESSION_CHANGE` est un déclencheur de replans **individuels**, notamment des supports non porteurs, sans téléportation.
- **[TEST]** : faire varier l'angle de défense d'un centre, laisser les autres perceptions inchangées → décision de porteur plus ou moins large.

### FIF04 — environ 63e : Dupont → Bielle-Biarrey fixe → Attissogbe conclut

- **[OBSERVÉ]** : après récupération profonde, Dupont progresse, sert Bielle-Biarrey, qui attire la défense puis passe à Attissogbe pour l'essai.
- **[SIMULATION]** : le porteur estime `FIX_DEFENDER` avant `PASS_OUTSIDE` ; le partenaire suit son plan `SUPPORT_INSIDE/OUTSIDE` et doit se trouver en position de recevoir au bon instant.
- **[TEST]** : défenseur garde le porteur versus mord sur soutien ; l'option peut basculer d'une course à une passe, sans essai garanti.

### FIF05 — environ 79e : touche → maul → Mauvaka sert Dupont qui marque au près

- **[OBSERVÉ]** : en fin de rencontre, maul après touche, Mauvaka donne à Dupont qui trouve le passage près du groupement et marque.
- **[SIMULATION]** : **le 9 peut finir lui-même au près**, le jeu au large n'est pas obligatoire ; le lanceur/relayeur et le 9 doivent se trouver réellement proches du ballon. Pas de synchronisation parfaite imposée.
- **[TEST]** : défense adverse s'écarte au large versus garde le petit côté ; modifier une seule circonstance peut changer le plan du 9.

## 5. Ce que ces matchs disent de l'IA des 30 joueurs

### A. Un plan de jeu n'est pas un script

Une touche peut déboucher sur un maul, une passe au large, un départ près du groupement ou un essai de pénalité. Des joueurs perçoivent les mêmes *faits de match*, mais pas nécessairement les mêmes détails. **Chaque agent choisit une trajectoire individuelle**.

### B. Le 9 doit consulter mais rester décideur dans le modèle choisi

Pour **Rugby Manager** : dialogue 9→10 (près/large/avance), discussion 9↔8 (départ du 8), renseignements sur la stabilité de mêlée, annonce d'option par le 9. Sur touche : 9 consulte 10 puis demande au lanceur / aux avants. En jeu : annonce du 9 avant chandelle s'il décide de la botter.

**Cette organisation vocale a été définie par le propriétaire du jeu et non directement observée dans les matchs cités.** Ne jamais créer un « appel authentique de Dupont » imaginaire dans le rapport d'essai. On teste le modèle proposé **contre des actions réelles**, pas des paroles inventées.

### C. Les responsabilités ne sont pas des privilèges exclusifs

Un n°8 peut partir en sortie de mêlée (ENW01). Un ailier peut botter (IRF04, ENF01). Un ouvreur peut botter haut (ENF02). Un talonneur peut se détacher d'un maul (IRF02). Un 9 peut marquer à partir d'un maul (FIF05). Un ailier peut rentrer depuis son côté opposé (ENF04).

**Conséquence GOAP :** les capacités sont limitées par compétences, possession, lois, position et état physique, **pas par des interdictions artificielles de numéro**. Un 6 peut passer ; un 15 peut plaquer ; un 10 peut effectuer un pied. L'algorithme de choix du but doit les rendre plausibles au bon moment.

### D. Les événements sont causaux, pas une animation programmée

```text
source possession -> action réelle -> nouveau porteur/phase
  -> observation différée -> sélection de but individuel
  -> plan alternatif -> déplacement réel -> action possible/impossible
  -> nouveau monde -> replanification
```

Refuser : `LINEOUT_WON === true` et exécuter instantanément `MAUL_DRIVE + PASS_9 + TRY` dans un seul tick ; `SCRUM_8_READY` qui donne le ballon par magie ; `KICK_HIGH` qui assure sa réception.

## 6. Ordres de grandeur historiques à tester et **ne pas surajuster**

World Rugby, **Tournoi des Six Nations masculin 2023**, moyenne par match des 15 matchs :

| Indicateur | Moyenne 2023 | Min. | Max. |
|---|---:|---:|---:|
| Points totaux | 48 | 29 | 69 |
| Essais | 6,1 | 4 | 9 |
| Passes | 314 | 230 | 398 |
| Rucks | 185 | 134 | 228 |
| Mauls | 11 | 3 | 20 |
| Coups de pied en jeu | 55 | 37 | 77 |
| Touches | 26 | 14 | 34 |
| Mêlées | 11 | 5 | 16 |
| Pénalités/coups francs | 23 | 15 | 31 |
| Ballon effectivement en jeu | 37 min 38 s | 33 min 47 s | 45 min 30 s |

Source : [World Rugby — Game Analysis Men's Six Nations 2023, Overall Summary](https://www.world.rugby/the-game/game-analysis/reports/internationals-men).

### Les équipes réelles ont des styles opposés : ne pas moyenner tous les comportements

Le **même rapport World Rugby 2023** indique des tendances très distinctes :

- **Irlande 2023** : rucks particulièrement rapides, meilleure conservation au ruck, jeu plus riche en passes ; **la moitié des essais** irlandais résultait d'actions comportant **au moins sept passes**.
- **France 2023** : préférence pour l'occupation territoriale au détriment de la possession ; forte utilisation du jeu au pied, et **le demi de mêlée français bottait plus que les autres n°9 du tournoi** ; taux de passes et activité de ruck plus faibles ; turnovers exploités pour marquer.
- Sur le tournoi **2023**, **44 % des essais** provenaient d'une possession commencée sur une touche, contre **15 %** sur mêlée. Ce ne sont ni des probabilités légales de marquer, ni une cible obligatoire pour le jeu.

**Conséquence architecture** : des joueurs individuels d'équipes utilisant un plan de jeu différent doivent prendre des décisions différentes **dans une même situation**. Ne pas simuler une « moyenne nationale » et surtout ne pas créer une IA d'équipe ; les consignes du manager sont des poids/préférences en **lecture seule** que chaque agent incorpore dans sa propre recherche.

**Test différentiel `STYLE-01`** : même état, mêmes joueurs, graine et fatigue, modifier seulement `playbook` d'une équipe : `FAST_RUCK_MULTIPASS` versus `TERRITORY_KICK_PRESSURE`. Vérifier une différence statistique de distribution `RUN_PASS`/`KICK`/`SUPPORT`, **sans forcer** tous les n°9 à botter ni garantir qu'aucun ailier ne bottera.

**Test `STYLE-02`** : deux numéros 9 avec compétences et lecture du jeu différentes, **même playbook** : comparer perception, choix de sortie et temps d'exécution. La variation individuelle doit persister après application d'un plan de jeu commun.

**Test `STYLE-03`** : une équipe doit pouvoir privilégier `PENALTY_TO_CORNER` selon score et position, mais le lancer/maul/essai restent trois épreuves indépendantes ; ne pas convertir le 44 % historique en « 44 % d'essais sur touche » dans le RNG.

**Source précise** : https://www.world.rugby/the-game/game-analysis/reports/internationals-men (sections `Ireland & France`, `Try Scoring`, `Scrums`, `Overall Summary` pour 2023).

**À faire** : produire une baseline actuelle GOAP désactivé avec 100 graines appariées ; rejouer exactement les mêmes graines avec GOAP activé ; comparer médiane, p10/p90 et moyennes, **avec les mêmes définitions de compteurs**. Une moyenne de passes éloignée de 314 **n'est pas seule un bug** : le match a évolué et le modèle de championnat diffère. Rechercher davantage de saisons/compétitions, utiliser le rapport 2023 comme repère explicite daté, et mettre en évidence les différences plutôt que de modifier des paramètres pour imiter un seul tournoi.

Comparer aussi des **conditionnelles**, plus révélatrices que le total :
- actions au large depuis touche/maul/mêlée selon position sur le terrain ;
- départs du 8 en mêlée réellement contrôlée, contre sorties par le 9 ;
- fréquence/issue des coups de pied hauts selon zone, disponibilité des chasseurs, temps de vol ;
- actions du 9 près du maul versus distribution large, selon espace et pression ;
- nombre de phases sans gain avant un pied : **distribution**, pas « après 3 phases botter » automatique ;
- décisions d'interception qui échouent et ouvrent un espace, pas 100% de réussite ;
- erreurs de communication et réorganisations après substitution.

**Interdiction d'inventer une calibration :** aucune des 16 observations ci-dessus ne donne un taux de `SCRUM_8_BREAK`, ni une vraie probabilité d'interception. Pour en estimer la fréquence, il faut un **corpus d'actions annotées plus large**, pas déduire 30% d'un exemple.

## 7. Lois World Rugby actuelles à appliquer aux scènes

- **Mêlée — loi 19.13–19.17** : le 9 introducteur choisit le côté d'introduction, introduction en place, poussée **seulement après départ du ballon des mains du 9**.
- **19.19 / 19.25 / 19.34 / 19.37** : poussée droite et parallèle au sol, sifflet immédiat pour mêlée effondrée, conditions de remise en place si mêlée qui tourne de >90° sans infraction ; effondrement volontaire interdit et pénalisable.
- **19.26** : le « use it » de mêlée dépend d'une période d'immobilité avec ballon disponible (trois à cinq secondes **avant appel**), puis ballon à jouer immédiatement — **ne pas copier les cinq secondes de la règle du ruck**.
- **19.36** : fin de mêlée possible par sortie réelle du ballon, jeu du 9 ou prise du n°8 selon position et conditions légales. Ce dernier ne « sort pas » parce que le 9 a crié.
- **Touche — loi 18** : formation, participants, lancer, soutien, règles de remise rapide ; le n°9 n'a **pas** le privilège juridique exclusif de décider du lancer.
- **Maul — loi 16 et directive juin 2026** : liaisons et fin légales ; une action après touche ne devient pas nécessairement un maul.
- **Profils 2026** : les nouvelles compétitions démarrant après le 1er juillet 2026 appliquent les changements World Rugby correspondants selon la fédération/compétition ; tournoi 2024/2025 n'est **pas rejugé rétroactivement** en appliquant une règle 2026.
- Hors-jeu et jeu aérien : lois 10/11, plaquages loi 14, ruck loi 15, protection du porteur et contacts loi 9.

Références : [loi 19 mêlée](https://passport.world.rugby/laws-of-the-game/laws-by-number/19-scrum/) ; [loi 18 touche](https://passport.world.rugby/laws-of-the-game/laws-by-number/18-touch-quick-throw-and-lineout/) ; [loi 15 ruck](https://passport.world.rugby/laws-of-the-game/laws-by-number/15-ruck/) ; [loi 16 maul](https://passport.world.rugby/laws-of-the-game/laws-by-number/16-maul/) ; [changements 2026](https://passport.world.rugby/laws-of-the-game/whats-new/2026-07-law-updates/).

## 8. Tests déterministes issus de ce corpus

Les **16 observations** sont stockées en JSON avec un `sourceUrl`, un `clock.label` non précis, une explication `observation` et une `gameMechanicHypothesis`. Les tests de données doivent garantir que :
- aucune observation ne se voit attribuer un faux `sourceTimeSeconds` exact ;
- aucun dialogue inventé n'est classé `OBSERVED_MATCH_REPORT` ;
- aucune position des 30 joueurs n'est prétendue mesurée ;
- chaque action peut être rejouée en **deux branches** (ex. libre/couvert, 8 capable/bloqué, maul avance/bloqué) ;
- la production du ballon, des scores et des fautes reste dans le moteur.

### Scénarios moteurs à construire (nouvelles tâches G34–G36)

| Test | Référence réelle | Changement contrôlé | Condition testée |
|---|---|---|---|
| REAL-01 | ENW01 | 8 capable puis bloqué | plan 8 sortie vs 9, ballon unique |
| REAL-02 | IRF01 | maul avance puis ballon indisponible | passe du 9 seulement si ballon libéré |
| REAL-03 | IRF02 | porteur lié puis disponible | maul → départ légal d'un joueur |
| REAL-04 | IRF03 | départ blessure du 9 | remplaçant autonome, 15 joueurs maximum |
| REAL-05 | IRF04 | espace derrière défense fermé | ailier change de pied à course/passe |
| REAL-06 | IRF05 | receveur après contact absent | offload impossible / ballon perdu possible |
| REAL-07 | IRF06 | angle de passe interceptable vs non | interception contestable, pas garantie |
| REAL-08 | ENF01 | défenseur ferme la passe | petit pied derrière possible, partenaire poursuit réellement |
| REAL-09 | ENF02 | chasseurs hors-jeu ou trop loin | ballon haut sans récupération automatique |
| REAL-10 | ENF03 | score +2 versus -4 à la fin | pénaltouche ou tir évalués localement |
| REAL-11 | ENF04 | ailier perçoit un trou intérieur | insertion de l'aile fermée décidée individuellement |
| REAL-12 | FIF01 | rideau arrière vient couvrir | le 9 peut renoncer au pied et poursuivre la possession |
| REAL-13 | FIF02 | maul légal vs faute dans l'en-but | arbitrage distinct, penalty try non garanti |
| REAL-14 | FIF03 | turnover à mi-course | chaque joueur change son but séparément |
| REAL-15 | FIF04 | défenseur fixe le porteur | décision fixer/passer adaptée et soutien au bon moment |
| REAL-16 | FIF05 | défense ferme le petit côté | 9 peut choisir sortie large ou conserver si légal |

**Tests déjà réalisables immédiatement (données seulement)** : `node server/test-v4-observations-matchs.js` vérifie le corpus de 16 événements. **Les tests REAL-01…16 n'existent pas encore** dans le moteur : les créer au fil des tâches G34–G36 après G02–G11 et les agents concernés.

## 9. Priorités Claude Code après cette recherche

**P0 — vérité et observabilité :** G34 valider le corpus, les sources et mesurer la baseline reproductible ; ne jamais attribuer une « statistique réelle » à une hypothèse.

**P1 — décisions connues :** G35 implémenter d'abord le 8 en sortie de mêlée, le 9 à la sortie de maul/touche, le pied court ou haut et les changements de possession, chacun avec garde physique et replanification.

**P2 — calibration des choix, pas uniquement des statistiques :** G36 comparer les distributions et alternatives de stratégies ; documenter des cas d'échec et des maladresses réalistes. Une IA qui marque systématiquement quand elle reconnaît une situation idéale n'est pas crédible.

**P3 — élargir les observations :** annoter d'autres matchs avec vidéo et horodatages, idéalement sur **plusieurs équipes et championnats**, avant d'estimer des fréquences. Pour un vrai benchmark vidéo : fournir `matchId, videoUrl, timecode, joueur, trajectoire observée, action réelle, situation défensive, annotation humaine`. À défaut de vidéo vérifiée, déclarer les coordonnées **inconnues**.

---

### Sources publiques consultées

- World Rugby, *Game Analysis, Men's Six Nations 2023* : https://www.world.rugby/the-game/game-analysis/reports/internationals-men
- Six Nations, *Irlande–France, 8 mars 2025* : https://www.sixnationsrugby.com/en/m6n/fixtures/202500/ireland-v-france-08032025-1415/report
- Six Nations, *Angleterre–France, 8 février 2025* : https://www.sixnationsrugby.com/en/m6n/fixtures/202500/england-v-france-08022025-1645/report
- BBC Sport, *Angleterre–Galles, 10 février 2024* : https://www.bbc.co.uk/sport/rugby-union/68254950
- Six Nations, *France–Fidji, 7 novembre 2026* : https://www.sixnationsrugby.com/en/m6n/news/france-run-riot-against-fiji
- World Rugby, *loi 19 mêlée* : https://passport.world.rugby/laws-of-the-game/laws-by-number/19-scrum/
- World Rugby, *loi 18 touche* : https://passport.world.rugby/laws-of-the-game/laws-by-number/18-touch-quick-throw-and-lineout/
- Étude académique de décisions en rugby (2021) : https://pmc.ncbi.nlm.nih.gov/articles/PMC8149625/
