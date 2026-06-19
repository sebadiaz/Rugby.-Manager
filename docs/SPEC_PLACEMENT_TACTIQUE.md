# Spécification — Placement tactique réaliste des joueurs (v2)

Révision de `docs/SPEC_PLACEMENT_TACTIQUE.md` (v1). La v1 décrivait des formations comme des grilles figées avec des distances arbitraires (pods à 2m les uns des autres, profondeur d'attaque à -1m...). Ce n'est pas réaliste : en rugby professionnel les espacements, les profondeurs et les déclencheurs de décision sont connus et beaucoup plus précis. Cette version corrige :

1. les **distances** (espacement de pods, profondeur de ligne, écartement défensif) ramenées à des valeurs réalistes du rugby professionnel ;
2. le **temps** : une formation n'est pas un instantané, les joueurs convergent vers elle à vitesse finie, dans un ordre qui dépend de leur distance à parcourir ;
3. le **rapport de force par couloir** (nombre d'attaquants vs nombre de défenseurs dans une zone) comme véritable moteur de la décision, plutôt qu'une heuristique générique ;
4. les **formations de phases statiques** (mêlée, touche, coup d'envoi), absentes de la v1, avec des schémas chiffrés ;
5. des **rôles individuels non négociables** qui existent dans toutes les formations (gardes de ruck, sweeper, etc.) et qu'une grille générique ne capture pas.

## 1. Repères officiels du terrain

Le placement réaliste se réfère toujours aux lignes réelles du terrain, pas à des distances abstraites au ballon :

| Ligne | Position (x, en-but propre = 0) | Rôle pour le placement |
|---|---|---|
| Ligne d'en-but propre | x = 0 | référence de profondeur défensive maximale |
| Ligne des 5m | x = 5 | zone de mêlée/touche "sous pression", formations très resserrées |
| Ligne des 22m propre | x = 22 | bascule vers jeu prudent (8) |
| Ligne médiane | x = 50 | référence neutre, coup d'envoi |
| Ligne des 22m adverse | x = 78 | bascule vers jeu de percussion (8) |
| Ligne d'en-but adverse | x = 100 | objectif d'attaque |
| Touches | y = 0 et y = 70 | hors-jeu latéral, définissent côté ouvert/fermé |
| Ligne des 15m (chaque touche) | y = 15 et y = 55 | zone où les ailiers restent par défaut hors intervention |
| Ligne des 5m (chaque touche) | y = 5 et y = 65 | zone "côté fermé extrême" : aucun pod n'y est jamais placé |

Ces lignes remplacent les « canaux » arbitraires de la v1 par des seuils ancrés sur le terrain réel (ex. « la défense passe en `LignePlate` dès que x < 10 », pas « canal 0 »).

## 2. Le placement est un objectif dynamique, pas un instantané

Erreur de la v1 : traiter une formation comme une téléportation. En réalité :

- Chaque joueur calcule une **position cible** (`positionReference`, section 9) à chaque tick.
- Il s'y déplace à une vitesse d'organisation **inférieure à sa vitesse de sprint** : un joueur qui se replace lit le jeu, il ne sprinte pas au hasard. Vitesse de replacement ≈ `0.7 * vitesseMax(joueur)` (cf. `vitesseMax()` dans `JoueurAgent.cpp`), sauf en contre-attaque ou en couverture d'urgence (`AttaquerEspace`/`TenterPlaquage`) où c'est `1.0 * vitesseMax()`.
- **Temps de réorganisation après un ruck**, mesuré empiriquement en rugby professionnel :
  - ruck rapide (« quick ball ») : 2 à 4 secondes — seuls les joueurs déjà à moins de ~8m de leur position cible l'atteignent à temps ; les autres jouent la phase suivante en retard, depuis une position intermédiaire.
  - ruck lent (« slow ball », contesté, ou après un maul) : 6 à 10 secondes — tout le monde a le temps de rejoindre sa position de référence, y compris le pod le plus éloigné.
  - cette durée se calcule dans le modèle comme `dureeRuck = base - vitesseSortie * (qualiteRuck/100)`, où `qualiteRuck` dérive de `score_ruck` (cf. `docs/SPEC_JOUEUR.md` section 8).
- **Ordre d'arrivée** : les joueurs rejoignent leur position cible dans l'ordre croissant de distance à parcourir. Conséquence directe et volontairement exploitée par les vraies équipes : sur ballon rapide, le pod le plus éloigné côté ouvert n'est souvent pas encore en place — jouer "out the back" (passe au-dessus du premier rideau, vers une cible encore en mouvement plus large) est une option offensive à part entière, pas un bug de désynchronisation.

Conséquence pour le code : `JoueurAgent::seDeplacerVers` doit recevoir une vitesse de consigne distincte de `vitesseMax()` brute, et `ContexteMatch` doit exposer le temps écoulé depuis le début de la phase courante pour permettre ce calcul de retard.

## 3. Le rapport de force par couloir : le vrai moteur de la décision

La v1 utilisait une heuristique générique (`espaceLibreDevant = 100 - defenseurs*25`). Ce n'est pas comment un joueur de rugby décide réellement. La vraie heuristique, utilisée à tous les niveaux du jeu, est le **comptage attaquants vs défenseurs dans le couloir visé** :

```
rapportDeForce(couloir) = nombreAttaquantsDisponibles(couloir) - nombreDefenseursPresents(couloir)
```

où un « couloir » est une bande de largeur ~5m centrée sur la trajectoire de jeu envisagée (et non plus un « canal de profondeur » comme en v1, qui mélangeait profondeur et largeur).

- `rapportDeForce > 0` (supériorité numérique, ex. 3 attaquants contre 2 défenseurs en bout de ligne) → la décision correcte est presque toujours **élargir/passer** jusqu'au couloir en supériorité (cf. `evaluerPasse`, à repondérer pour intégrer ce rapport plutôt que le seul `espaceLibreDevant` actuel).
- `rapportDeForce = 0` (égalité numérique) → dépend de la qualité individuelle (créativité/agilité de l'attaquant contre plaquage/positionnement du défenseur) : c'est le seul cas où le 1-contre-1 (`raffut`, `crochet`) prend le pas sur la décision collective.
- `rapportDeForce < 0` (infériorité, ex. défense en surnombre après un ruck mal négocié) → la décision correcte est de **conserver le ballon au près** (jeu au pied tactique ou pick-and-go via un pod), jamais de tenter le large.

Ce comptage est ce qui justifie réellement, ligne arrière par ligne arrière, les ajustements des sections 5 et 8 (largeur des pods, choix `Rush` vs `Drift`) — la formation n'est qu'une **conséquence** du rapport de force anticipé, pas une fin en soi.

## 4. Formations de phases statiques (absentes de la v1)

### 4.1 Mêlée

Schéma réaliste pour une mêlée à x=50, axe d'attaque vers x croissant, ballon entrant côté ouvert (y croissant par convention dans cet exemple) :

| Poste | Position relative au point d'introduction (Δx, Δy) | Détail réaliste |
|---|---|---|
| Pilier gauche (1) | (-0.5, -0.75) | liaison épaule contre épaule avec le talonneur, ~0.75m d'écartement entre piliers |
| Talonneur (2) | (-0.5, 0) | au centre de la première ligne, talonne le ballon |
| Pilier droit (3) | (-0.5, +0.75) | symétrique du 1 |
| 2e ligne (4, 5) | (-1.5, ±0.4) | poussent dans l'interstice des piliers/talonneur, ~1.5m derrière la 1ère ligne |
| 3e ligne aile (6, 7) | (-2.0, ±1.3) | liés à l'extérieur des 2e lignes, premiers à décrocher pour défendre/soutenir |
| 3e ligne centre / n°8 (8) | (-2.5, 0) | au centre, dernier point de liaison, contrôle souvent la sortie de balle au pied |
| Demi de mêlée (9) | (-3.0, -1.0 ou +1.0 selon le côté d'introduction) | au ballon, côté d'introduction |
| Ouvreur (10) | (-8.0, -3.0) | profondeur type pour une attaque organisée depuis la mêlée (jeu différé), ramenée à (-3.0, -2.0) si attaque « jeu plat au 1er temps » |
| Centres (12, 13) | (-7.0, -8.0) et (-6.0, -16.0) | échelonnés, déjà en position d'attaque large potentielle |
| Ailiers (11, 14) | sur leur touche respective, x aligné à -6.0 | restent à 5m environ de la ligne de touche (pas collés à la ligne — marge pour réceptionner sans sortir) |
| Arrière (15) | (-15.0, -10.0 à -20.0 selon plan de jeu) | profondeur de sécurité, latéralement du côté où l'attaque est probable |

Côté défenseur, la ligne de hors-jeu des arrières adverses (non engagés en mêlée) se situe réglementairement à 10m derrière le dernier pied de la mêlée — c'est une contrainte dure, pas un choix tactique : la ligne défensive ne peut physiquement pas être plus proche que `xMelee - 10` (ou +10 selon le sens) tant que le ballon n'est pas sorti.

### 4.2 Touche

Schéma pour une touche à y=70 (touche droite), ballon lancé par l'équipe attaquante :

- **Sauteurs et releveurs** : 4 à 7 avants alignés perpendiculairement à la touche, espacés de ~1m, entre y=70 et y=60 environ (la ligne de touche fait toujours face à l'intérieur du terrain).
- **Receveur désigné** (souvent un 2e ligne ou un 3e ligne aile) : positionné pour sauter, élevé par deux releveurs immédiatement adjacents.
- **Demi de mêlée** : juste derrière la ligne de touche côté terrain, prêt à récupérer.
- **Avants non participants** (1, 8 souvent) : ligne de pré-formation d'un futur maul/pod, ~3-5m derrière la ligne de touche.
- **Ligne arrière complète** : comme en mêlée, déjà répartie en profondeur croissante vers l'extérieur, prête à exploiter une sortie de balle rapide.
- **Contrainte réglementaire dure** : tous les joueurs des deux équipes non engagés dans l'alignement doivent rester à **10m** de la ligne de touche virtuelle (perpendiculaire au point de lancer) jusqu'à la fin de la phase de touche — ceci fixe une limite stricte sur la position x minimale de la ligne arrière défensive, indépendante de toute stratégie.

### 4.3 Coup d'envoi / renvoi

- **Équipe qui donne le coup de pied** : ligne de chasse en éventail, pas un alignement plat — 2 à 3 chasseurs avancés au centre (souvent 3e ligne, rapides), le reste de la ligne (avants + arrières) en retrait progressif vers les ailes, formant un arc convexe vers l'avant. Tous doivent rester derrière le point de frappe jusqu'à ce que le ballon soit joué (10m minimum de portée du coup de pied, contrainte dure).
- **Équipe qui reçoit** : un **pod de réception** de 2-3 avants (souvent 2e lignes, bons sauteurs) positionné sous la trajectoire anticipée du ballon, flanqué de 2 soutiens immédiats prêts à sécuriser/ruck. Le reste de l'équipe se répartit en éventail inverse derrière, prêt à une contre-attaque immédiate si le ballon est propre.

Ces trois formations statiques n'existaient pas dans la v1 ; elles couvrent pourtant une part importante des phases d'un match réel et leurs contraintes (10m de hors-jeu en touche/mêlée/coup d'envoi) sont des règles dures, pas des choix de placement.

## 5. Formations dynamiques en jeu courant : espacements réalistes

La v1 plaçait les pods à 2m d'écart, ce qui ne laisse aucune place pour accélérer avant le contact. Valeurs corrigées, basées sur l'observation du rugby professionnel :

- **Espacement entre pods** : 10 à 15m (pas 2m) — suffisant pour qu'un pod constitue une option distincte, pas une simple variation du même point de contact.
- **Profondeur d'alignement d'un pod par rapport à la ligne d'avantage** : 4 à 6m (pas 1m) — la distance nécessaire pour qu'un avant reçoive le ballon **en mouvement, à pleine vitesse d'impact**, plutôt qu'à l'arrêt collé à la ligne.
- **Profondeur de l'ouvreur en attaque organisée (2e/3e temps)** : 5 à 8m derrière la ligne d'avantage (jeu dit "profond", temps de lecture) ; réduite à 2-3m en attaque dite "à plat" (1er temps après ruck rapide, prend la défense de vitesse mais laisse peu de marge d'erreur).
- **Échelonnement de la ligne des centres** : chaque joueur 2 à 3m plus large ET plus profond que son voisin intérieur (pas un simple décalage en y comme en v1) — c'est cet échelon en profondeur qui rend la passe vers l'extérieur légale et non interceptable par l'avant.
- **Ailiers** : ne sont *pas* figés sur leur couloir en permanence ; ils tiennent une position par défaut à 5m de leur touche, mais se rabattent activement vers le jeu dès que le ballon franchit la moitié opposée du terrain (cf. section 6, « aile rentre »).

Les trois formations en pods (`Pods_1_3_3_1`, `Pods_2_4_2`, `Pods_3_4_1`) gardent leur logique de répartition de la v1 (1 proche / pods latéraux / 1 isolé large), mais avec ces espacements corrigés et la **profondeur d'élan** comme paramètre explicite, pas une position figée sur la ligne d'avantage.

## 6. Rôles individuels non négociables

Indépendamment de la formation globale choisie, certains rôles sont **systématiques** à chaque ruck/phase, et la v1 les avait omis en ne traitant que des formations collectives :

- **Gardes de ruck (« pilier » et « poteau »)** : les deux joueurs immédiatement adjacents à un ruck défensif (souvent les avants les plus proches au moment du contact, peu importe leur poste d'origine) ont pour rôle fixe de bloquer le pick-and-go et le 1er temps de mêlée ouverte. Ce rôle existe dans `Rush` comme dans `Drift` comme dans `LignePlate` — c'est un rôle de position, pas un système.
- **Demi de mêlée défensif** : marque systématiquement la base du ruck adverse (zone juste derrière les gardes), quel que soit le système défensif global.
- **« Le 13 monte »** : quand la défense compte un défenseur de moins que l'attaque dans la ligne extérieure (rapport de force négatif détecté section 3), le centre extérieur (13) avance d'un cran dans la ligne pour rétablir l'égalité numérique, indépendamment du système (`Drift`/`Rush`) en cours.
- **« L'aile rentre »** : l'ailier du côté fermé (loin du jeu) ne reste jamais isolé sur sa touche au-delà d'une certaine distance latérale au ballon (~25-30m) ; il se rabat vers le couloir 3 pour devenir un défenseur supplémentaire utile plutôt qu'un joueur hors-jeu de fait.
- **Arrière « sweeper »** : reste structurellement le seul joueur en couverture profonde (jamais doublé sauf phase `Cloche` explicite), et ajuste sa position latérale en anticipant le couloir de jeu au pied le plus probable (lecture du pied fort de l'ouvreur adverse, de la position du ballon par rapport à l'axe central), plutôt que de suivre une position fixe « centrale ».

Ces rôles doivent être calculés **avant** la formation collective dans le pipeline de décision (ils priment sur le placement générique de poste), ce qui n'était pas modélisé en v1.

## 7. Systèmes défensifs : espacement et dynamique réels

Reprise des 4 systèmes de la v1 avec valeurs corrigées :

| Système | Écart entre défenseurs adjacents | Vitesse de montée vers la ligne d'avantage | Profondeur de ligne vs ligne d'avantage |
|---|---|---|---|
| `Drift` | 4 à 6m (resserré près du ruck, jusqu'à 8-9m en sortie de ligne large) | faible (~0.4 * vitesseMax, glissement latéral dominant) | 1 à 2m en retrait |
| `Rush` | 4 à 5m, ligne plus compacte qu'en `Drift` | élevée (~0.9 * vitesseMax, avancée frontale) | quasi nulle au moment de l'impact (objectif : contact avant la ligne d'avantage adverse) |
| `LignePlate` | 3 à 4m (très resserré, peu de couverture large) | faible, replacement latéral minimal | 0 (collé à la ligne d'avantage, aucune marge — typique zone 0-10m) |
| `Cloche` (3 derniers défenseurs uniquement) | n/a (triangle, pas une ligne) | n/a | arrière à 15-20m, ailiers à 10-12m en retrait diagonal |

L'écart entre défenseurs n'est jamais uniforme sur toute la largeur : il se resserre mécaniquement près du point de ruck (gardes, section 6) et s'élargit vers les ailes, parce que le nombre de défenseurs disponibles est fixe (15 moins les joueurs au sol/en ruck) alors que la largeur à couvrir varie selon la position du ballon par rapport au centre du terrain.

## 8. Circonstances de match (valeurs chiffrées)

Reprise de la v1, avec seuils explicites cette fois :

- **Zone du terrain** : bascule `Rush`→`LignePlate` quand x < 10 (zone 0-10m, plus de place pour reculer) ; bascule formation d'attaque `Pods_1_3_3_1`→`Pods_3_4_1` quand x > 90 (proximité immédiate de la ligne d'en-but adverse).
- **Côté du ballon vs touche** : si distance au point de ruck à la touche la plus proche < 15m, aucun pod complet n'est placé de ce côté (cf. section 4.1, contrainte des 5m de marge) — au maximum 1 avant isolé.
- **Score/temps** : dans les 10 dernières minutes, écart de score ≤ 3 points → bascule systématique en `Pods_1_3_3_1` élargi + `Rush` (prise de risque) ; écart ≥ 8 points en faveur → `Pods_2_4_2` + `Drift` (gestion du risque).
- **Infériorité numérique (carton)** : la largeur totale couverte par la ligne défensive est recalculée immédiatement avec 14 joueurs au lieu de 15 ; l'écart entre défenseurs (section 7) augmente mécaniquement d'environ `largeurCouverte / 14` au lieu de `/15` — l'équipe en infériorité doit donc explicitement choisir entre élargir ses intervalles (`Drift` accentué) ou réduire la largeur couverte en acceptant de concéder le couloir le plus éloigné du ballon.
- **Fatigue cumulée d'équipe** : la vitesse de replacement (section 2) est multipliée par `(1 - fatigueMoyenneEquipe/200)` ; au-delà de 70% de fatigue moyenne, les pods les plus éloignés (>15m) ne sont structurellement plus atteints à temps sur ballon rapide (cf. section 2), ce qui se traduit en jeu par des formations qui se resserrent d'elles-mêmes en fin de match, sans qu'il s'agisse d'une décision tactique délibérée.

## 9. Modèle de calcul révisé

```
positionCible(joueur, phase, t) =
      roleFixe(joueur, contexteImmediat)                      [section 6, prioritaire si applicable]
   ?: positionBase(poste, formation/système, profondeurElan)   [sections 4 et 5, valeurs réalistes]
    + ajustementRapportDeForce(couloir)                          [section 3 ; déplace latéralement vers le couloir en supériorité]
    + ajustementContexte(zone, scoreEtTemps, carton, fatigue)      [section 8]
    + bruitIndividuel(creativite, decision, ligneDeCourse)

positionReelle(joueur, t) = position(t - dt) + direction(positionCible - position(t-dt)) * vitesseReplacement(joueur, contexte) * dt
```

Différence clé avec la v1 : `positionReelle` n'est plus égale à `positionCible` à chaque tick. Le décalage entre les deux **est** l'information exploitable par les décisions offensives (cf. section 2, jouer "out the back" sur un défenseur pas encore arrivé).

## 10. Exemple chiffré complet (revu)

### 10.1 Mêlée à x=50, ballon introduit côté droit (y croissant)

Voir le tableau complet en section 4.1 — non répété ici, il reste valide tel que donné, avec la précision que la ligne arrière défensive adverse est mécaniquement à `x ≥ 60` (10m derrière x=50) jusqu'à la sortie de balle.

### 10.2 Ruck consécutif, t+4s après la mêlée, ballon sorti vite (qualité de ruck élevée)

Le ballon est porté en 4 secondes de x=50 à x=58 (course du n°8 après sortie de mêlée), y=46 (jeu parti légèrement côté ouvert, qui était y croissant). Avec un ruck rapide (2-4s), seuls les joueurs initialement à moins de ~8m de leur position cible en pod l'ont rejointe :

| Poste | Position cible (formation `Pods_1_3_3_1`, profondeur d'élan 5m) | Position réelle à t+4s | Écart | Conséquence tactique |
|---|---|---|---|---|
| Talonneur (2) | (53, 46) | (53, 46) | 0 | déjà au contact, gardes de ruck en place |
| Pilier (3) | (53, 36) — 1er pod ouvert, 10m du ruck | (54, 40) | en chemin, ~6m manquants | option de pick-and-go encore disponible mais pod pas totalement formé |
| Ouvreur (10) | (51, 38) — profondeur 7m, jeu différé | (50, 39) | quasiment en place (était déjà profond depuis la mêlée) | peut lancer le jeu immédiatement |
| Ailier loin (11, côté fermé) | (53, 8) — reste sur sa touche, hors course | (60, 12) | en train de rentrer (cf. section 6, l'aile rentre) car le ballon est passé largement de son côté | pas encore défenseur supplémentaire utile, fenêtre d'attaque côté fermé encore ouverte pendant ~2-3s |

Ce tableau illustre concrètement pourquoi le **temps** change la décision optimale : une passe vers le couloir fermé est meilleure ici qu'en t+8s, une fois l'ailier adverse revenu.

## 11. Catalogue phase → formation/système (mis à jour)

Identique à la v1, avec ajout des trois phases statiques désormais spécifiées :

| Phase | Formation/contrainte | Source |
|---|---|---|
| Mêlée | Schéma fixe section 4.1, hors-jeu adverse à 10m | règle dure |
| Touche | Schéma fixe section 4.2, hors-jeu à 10m de la ligne de touche virtuelle | règle dure |
| Coup d'envoi/renvoi | Chasse en éventail / pod de réception, section 4.3 | convention tactique |
| Ruck 1ère phase, lointaine, jeu déployé, contre-attaque, sortie de camp | inchangé, avec espacements corrigés (section 5) | tactique |

## 12. Prochaine étape d'implémentation

Par rapport au jalon défini précédemment :

1. `ContextePlacement` doit désormais inclure `tempsDepuisDebutPhase` et `qualiteRuck` pour calculer le décalage `positionCible`/`positionReelle` (sections 2 et 9).
2. Les rôles fixes de la section 6 doivent être évalués **avant** la formation collective dans `JoueurAgent::choisirAction` (priorité de calcul, pas un système supplémentaire parmi d'autres).
3. `evaluerPasse`/`evaluerCourse` doivent intégrer un comptage explicite attaquants/défenseurs par couloir (section 3) en remplacement ou en complément de `perception.espaceLibreDevant`, qui reste une approximation trop grossière pour ces décisions.
4. Les formations statiques (mêlée, touche, coup d'envoi) nécessitent un état de phase dédié dans le futur `MatchSimulator`, distinct du jeu courant, avec leurs contraintes de hors-jeu dures (10m) gérées comme des invariants et non comme des préférences tactiques.
