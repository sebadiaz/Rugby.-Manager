# Spécification — Placement tactique réaliste des joueurs (v3)

Révision de `docs/SPEC_PLACEMENT_TACTIQUE.md` (v2). La v2 corrigeait les distances et ajoutait la dimension temporelle, mais restait **stéréotypée** sur trois points :

1. elle associait directement `Poste → comportement`, comme si un pilier ne pouvait jamais se comporter autrement qu'un pilier-type, et qu'un joueur ne pouvait pas changer de poste ni en maîtriser plusieurs ;
2. elle traitait le replacement défensif comme une convergence directe vers une position assignée, alors qu'en réalité un défenseur **bouche d'abord le trou le plus proche** (continuité de la ligne, peu importe si ce n'est pas son créneau habituel), puis **glisse ensuite** vers son poste une fois la ligne stabilisée ;
3. elle traitait la défense comme **une seule ligne** par système (`Drift`/`Rush`/`LignePlate`), alors qu'une défense réelle empile souvent plusieurs rideaux successifs.

Cette v3 corrige ces trois points, plus la distinction entre joueurs « suiveurs de jeu » et « tenants de station » en attaque. Les acquis de la v2 (lignes réelles du terrain, espacements 10-15m, dynamique temporelle, rapport de force par couloir) restent valides et sont repris sans changement en section 6-7.

## 1. Le poste n'est pas le comportement : modèle multi-rôle

Erreur de v1/v2 : une table `Poste → règle de placement` fixe. Correction : on distingue désormais trois choses, alors que le modèle ne connaissait que `Joueur.poste` :

- **`posteNaturel`** : le poste de référence du joueur (carrière, fiche joueur, marché des transferts côté gestion) — c'est l'actuel `Joueur.poste`, inchangé.
- **`postesMaitrises`** : une liste `(Poste, niveauMaitrise 0-100)`. Un joueur peut maîtriser plusieurs postes à des degrés différents (ex. un 3e ligne aile avec `TroisiemeLigne: 90, DeuxiemeLigne: 55`, ou un arrière polyvalent avec `Arriere: 85, Ailier: 70, Ouvreur: 40`). Ceci permet les changements de poste en cours de saison/carrière et le dépannage à un autre poste pendant un match, sans que le modèle de comportement s'effondre.
- **`affectationMatch`** : le poste **réellement joué ce match-là** (peut différer de `posteNaturel`, ex. un centre titularisé à l'aile). **C'est ce champ, pas `posteNaturel`, qui pilote le comportement de placement** — un joueur affecté à l'aile ce match se comporte comme un ailier (section 2), quel que soit son poste de carrière.

Le comportement lui-même n'est plus une table par énumération de poste, mais une fonction **continue** de deux traits dérivés, recalculés à partir de `affectationMatch` (et non plus une constante figée par poste) :

```
tendanceProximite(joueur) ∈ [0, 100]
   = valeurDeReferenceDuPoste(affectationMatch.poste)        // une moyenne de départ, pas une règle absolue
   + ajustement(mental.collectif, tactique.soutien, roleTactique)
   + ajustement(consignesTactiquesEquipe)                      // une équipe peut délibérément demander
                                                                 // à ses avants de "tenir leur poste" plutôt
                                                                 // que suivre, ou inversement
```

Valeurs de référence par défaut (point de départ, pas une règle figée — un joueur précis peut s'en écarter nettement selon ses attributs et la consigne d'équipe) :

| `affectationMatch.poste` | `tendanceProximite` de référence |
|---|---|
| Pilier, Talonneur, 2e ligne | 80-90 (forte proximité, suit le ballon) |
| 3e ligne | 70-80 |
| Demi de mêlée | 75 (proche du jeu par construction du poste) |
| Ouvreur | 50 (mixte : organise depuis une position relative au ballon, mais doit aussi tenir une profondeur de lecture) |
| Centre | 40-50 |
| Ailier, Arrière | 15-25 (faible proximité, tient sa station) |

Ces valeurs sont des **priors**, explicitement modulables joueur par joueur et match par match — exactement ce qui manquait en v2.

## 2. Attaque : deux archétypes comportementaux, pas un calcul unique

La v2 utilisait un seul calcul `sePlacerOffensivement` pour tout le monde. En réalité, deux logiques de placement coexistent, et le choix entre les deux dépend de `tendanceProximite` (section 1) plutôt que du poste brut :

### 2.1 Mode « Suiveur de jeu » (`tendanceProximite` élevée)

```
positionCible(joueur, t) = positionBallon(t) + offsetRole(formation, pod, profondeurElan)
```

Le joueur recalcule sa cible en continu par rapport à la position **actuelle** du ballon, où qu'il aille latéralement sur le terrain. C'est le comportement typique d'un avant : il ne tient pas un couloir, il **suit le jeu**.

### 2.2 Mode « Tenant de station » (`tendanceProximite` faible)

```
si distance(joueur, ballon) > seuilEngagement (≈ 15-20m) ET ballon hors de son couloir de référence :
    positionCible = stationDeReference(couloir, profondeur par défaut)   // attend, ne suit pas
sinon :
    bascule temporaire en mode "Suiveur" tant que le ballon reste engagé dans son couloir
    (retour automatique en mode "Tenant" après un délai sans ballon, ≈ 5s, ou changement de phase)
```

Le joueur garde une position de référence sur son couloir (ex. un ailier à 5m de sa touche, profondeur canal 3) et **attend que le jeu vienne à lui**, plutôt que de courir après le ballon sur toute la largeur du terrain. C'est le comportement typique d'un ailier ou d'un arrière non engagé.

### 2.3 Pourquoi cette distinction est plus réaliste

Avec un calcul unique (v2), un ailier aurait tendance à se rapprocher du ruck comme un avant, ce qui viderait son couloir et casserait toute option de débordement. Avec la distinction, l'équipe garde mécaniquement une **largeur de positionnement** sans qu'aucune règle explicite de « largeur du jeu » ne soit nécessaire — elle émerge du mélange des deux modes dans l'effectif. C'est aussi pour cela qu'un changement d'`affectationMatch` (un avant dépanné à l'aile) change immédiatement son comportement de placement sans toucher au reste du modèle.

## 3. Défense : replacement en deux temps, pas une convergence directe

Erreur de v2 (section 9, `positionReelle → positionCible`) : elle laissait penser qu'un défenseur vise directement son créneau assigné. En réalité, la priorité immédiate après une rupture de structure (tacle, turnover, sortie de touche, ruck qui se termine) est de **boucher la ligne**, pas de retrouver son poste.

### 3.1 Priorité 1 — Continuité de ligne (urgente)

Déclenchée à chaque rupture de structure et tant qu'un trou existe :

```
trou(i) = distance entre défenseur i et défenseur i+1 le long de la ligne, une fois triés par y

pour chaque défenseur sans position stable :
    rejoindre le trou le plus proche de SA position actuelle (pas de son poste assigné)
    si trou(i) > seuilTrou (≈ 8m) pour deux voisins quelconques
```

Le défenseur le plus proche d'un trou le bouche, indépendamment de son poste habituel — un pilier peut très bien se retrouver temporairement dans le couloir d'un centre. L'objectif est zéro trou exploitable, même si le placement par poste est provisoirement faux.

### 3.2 Priorité 2 — Glissement vers le poste assigné (une fois la ligne stable)

Une fois qu'aucun trou > seuil ne subsiste :

```
chaque défenseur glisse latéralement vers son créneau assigné (poste/rôle dans le système courant)
   à vitesse réduite (≈ 0.3 * vitesseMax, pour ne jamais rouvrir un trou pendant la transition)
   en respectant un séquencement : un défenseur ne quitte son slot stable que si son voisin
   immédiat a déjà confirmé le sien — la correction se propage comme une vague depuis
   le point de contact vers l'extérieur de la ligne, pas tous les joueurs en même temps.
```

C'est ce séquencement (vague de correction, pas mouvement simultané) qui distingue une vraie ligne défensive d'un simple alignement instantané : juste après un ruck, la ligne est correcte en continuité mais « fausse » par poste (le pilier est peut-être dans le couloir du 13) ; quelques secondes plus tard, elle s'est réorganisée par glissement progressif sans jamais avoir laissé de trou.

## 4. Défense : plusieurs rideaux simultanés, pas une seule ligne

Erreur de v2 : `Drift`/`Rush`/`LignePlate` décrivaient chacun **une seule ligne**. En réalité une défense empile souvent 2 à 3 rideaux à des profondeurs différentes, chacun avec son propre effectif :

| Ligne | Rôle | Profondeur typique vs ligne d'avantage |
|---|---|---|
| **Ligne 1 (engagement)** | la ligne principale de contact, décrite en v2 section 7 | 0 à 2m |
| **Ligne 2 (couverture intermédiaire)** | filet de sécurité immédiat, utile quand la ligne 1 n'a pas eu le temps de se stabiliser (juste après un turnover ou une réception de coup de pied) | 10 à 15m |
| **Ligne 3 (dernier rideau)** | la `Cloche` de v2, généralisée en ligne permanente (1 à 3 joueurs) plutôt qu'un cas particulier | 15 à 25m |

Chaque système défensif précise désormais combien de lignes il active et comment il répartit son effectif (15, ou 14 en infériorité) entre elles :

| Système | Ligne 1 | Ligne 2 | Ligne 3 | Usage |
|---|---|---|---|---|
| `Drift` | 11 joueurs | — (pas activée) | 3-4 joueurs (ailiers + arrière) | par défaut, milieu de terrain |
| `Rush` | 13-14 joueurs | — | 1 joueur (arrière seul) | presse maximale, accepte le risque sur la ligne 3 |
| `LignePlate` | 13-14 joueurs, très resserrés | — | 1 joueur | zone 0-10m, pas de place pour une ligne 2 |
| `DoubleRideau` (nouveau) | 7-8 joueurs (avants + 9/10) | 4-5 joueurs (centres/ailiers, 10-15m derrière) | 1-2 joueurs | transition défensive immédiate : juste après une perte de balle en plein terrain ou une réception de coup de pied adverse, le temps que la ligne 1 se stabilise (cf. section 3), une ligne 2 assure une redondance temporaire avant de se résorber dans la ligne 1 une fois la continuité retrouvée |

`DoubleRideau` n'est pas un système permanent : c'est un **état transitoire**, actif typiquement pendant les 3-6 premières secondes suivant une rupture de structure majeure (le temps que la priorité 1 de la section 3 fasse son travail), puis la ligne 2 se fond dans la ligne 1 dès que celle-ci est continue.

## 5. Rapport de force, calculé ligne par ligne

Le rapport de force par couloir (v2 section 3) doit désormais se calculer **par ligne**, pas globalement : un couloir peut être en supériorité numérique sur la ligne 1 (l'attaque a percé le premier rideau) tout en étant en infériorité sur la ligne 2/3 (la couverture arrière reste en place). C'est cette distinction qui justifie, par exemple, de privilégier une passe courte après une percée de ligne 1 plutôt qu'un jeu au pied par-dessus une ligne 3 encore organisée.

## 6. Rappel condensé (acquis de la v2, toujours valides)

- Repères réels du terrain (lignes des 5m/22m/15m/médiane) plutôt que canaux abstraits.
- Espacement de pods 10-15m, profondeur d'élan 4-6m, profondeur ouvreur 5-8m (jeu différé) ou 2-3m (jeu à plat).
- Dynamique temporelle : convergence à vitesse finie (~0.7 * vitesseMax en replacement standard, 1.0 * vitesseMax en urgence, ~0.3 * vitesseMax pendant le glissement de la section 3.2), ordre d'arrivée par distance, fenêtre exploitable « out the back » sur ballon rapide.
- Formations statiques (mêlée, touche, coup d'envoi) avec contraintes de hors-jeu réglementaires à 10m, inchangées.

## 7. Exemple chiffré : les trois mécaniques en même temps

Contexte : ruck gagné en milieu de terrain (x=55, y=40), équipe A attaque vers x croissant, l'équipe B vient de perdre le ballon sur turnover 3 secondes plus tôt (donc encore en `DoubleRideau` partiel).

### 7.1 Attaque, équipe A — deux modes en présence

| Joueur | `affectationMatch` | `tendanceProximite` | Mode | Position cible |
|---|---|---|---|---|
| 3e ligne aile (posteNaturel TroisiemeLigne) | TroisiemeLigne | 75 | Suiveur | (50, 35) — colle au ballon, offset de pod |
| Centre dépanné à l'aile ce match (posteNaturel Centre, affectationMatch Ailier) | Ailier | 20 (recalculée d'après l'affectation, pas le poste naturel) | Tenant de station | (51, 65) — tient son couloir à 5m de la touche, à 25m du ballon, hors fenêtre d'engagement |
| Ouvreur | Ouvreur | 50 | Mixte | (49, 38) — profondeur de lecture, suit modérément le déplacement latéral du ruck |

Le centre dépanné à l'aile se comporte comme un ailier (tenant de station) malgré son poste naturel de centre — c'est exactement le cas que la v2 ne pouvait pas représenter.

### 7.2 Défense, équipe B — deux temps + deux lignes

À t+0.5s après le ruck (juste après le turnover, ligne pas encore stable) :

| Joueur | Action | Position |
|---|---|---|
| Pilier (le plus proche du trou central) | Priorité 1 : bouche le trou le plus proche de lui, peu importe son poste | (57, 41) — dans ce qui sera plus tard le couloir d'un centre |
| Ailier faible-côté | Ligne 2 (`DoubleRideau`), couverture intermédiaire en redondance | (65, 25) |
| Arrière | Ligne 3, profondeur de sécurité | (75, 35) |

À t+4s (ligne 1 redevenue continue, glissement engagé) :

| Joueur | Action | Position |
|---|---|---|
| Pilier | Priorité 2 : glisse vers son créneau réel (ligne 1, près des gardes de ruck), son voisin ayant confirmé sa position | (57, 47) |
| Ailier faible-côté | `DoubleRideau` résorbé, rejoint la ligne 1 standard sur son propre couloir | (58, 65) |
| Arrière | Reste seul en ligne 3 (`Drift` repris comme système stable) | (70, 38) |

## 8. Catalogue mis à jour

Identique à la v2 (section 11), avec ajout :

| Situation | Système activé |
|---|---|
| 0-6s après une rupture de structure majeure (turnover, réception de coup de pied profond, sortie de touche défensive précipitée) | `DoubleRideau` (ligne 1 + ligne 2 + ligne 3 réduite) |
| Stabilisé (au-delà de 6s, ou ligne 1 redevenue continue) | retour au système nominal (`Drift`/`Rush`/`LignePlate` selon zone/score, v2 section 8) |

## 9. Modèle de données conceptuel révisé

Extension de `docs/SPEC_JOUEUR.md` (pas encore de code, comme pour les sections tactiques précédentes) :

```
Joueur (existant) :
    posteNaturel: Poste                              // anciennement "poste", renommé pour clarifier
    postesMaitrises: vector<(Poste, int niveau0a100)>
    // tendanceProximite n'est PAS stockée : calculée à la volée à partir de
    // affectationMatch + mental.collectif + tactique.soutien + consignes d'équipe

AffectationMatch (nouveau, un par joueur et par match) :
    posteJoue: Poste
    roleTactique: RoleTactique

LigneDefensive (nouveau) :
    numero: int                 // 1, 2 ou 3
    profondeurCible: float
    joueursAssignes: vector<int>  // ids

ContextePlacement (étendu vs v2) :
    tempsDepuisRupture: float     // pilote le basculement DoubleRideau -> système nominal
    lignesActives: vector<LigneDefensive>
```

## 10. Prochaine étape d'implémentation

1. Remplacer `Joueur::poste` par `posteNaturel` + `postesMaitrises`, ajouter `AffectationMatch` comme donnée d'entrée du `MatchSimulator` (pas du `Joueur` lui-même, pour ne pas dupliquer l'état entre les matchs).
2. Calculer `tendanceProximite` comme une fonction pure (pas un champ stocké), appelée par `JoueurAgent::choisirAction`/`sePlacerOffensivement` pour sélectionner le mode Suiveur/Tenant (section 2).
3. Remplacer le calcul direct `positionCible` de `seReplacerDefensivement` par les deux passes de la section 3 (détection de trou prioritaire, puis glissement séquencé) — nécessite que `JoueurAgent` connaisse les positions de ses voisins de ligne immédiats, pas seulement l'adversaire le plus proche comme actuellement dans `Perception`.
4. Introduire `LigneDefensive` comme structure explicite dans `ContexteMatch`, et faire en sorte que `DoubleRideau` soit un état temporaire géré par le futur `MatchSimulator` (déclenché sur rupture de structure, résorbé après un délai ou un critère de continuité retrouvée), pas un choix tactique permanent au même niveau que `Drift`/`Rush`/`LignePlate`.
