# Spécification — Modèle de joueur (agent autonome)

Ce document détaille le modèle de joueur utilisé par le moteur de simulation de match (voir aussi `docs/SPEC_MOTEUR_MATCH.md`). Il complète ce dernier avec une spécification complète, directement exploitable en code, d'un joueur en tant qu'agent autonome.

Code source correspondant :

```
engine/core/Vector2.hpp        Vecteur 2D (position, vitesse)
engine/core/Rng.hpp             RNG seedé pour les tirages aléatoires
engine/model/Joueur.hpp          Enums + structs de données (Poste, EtatJoueur, ActionJoueur, Physique, Technique, Mental, Tactique, EtatMatch, Perception, Joueur)
engine/simulation/ContexteMatch.hpp  Vue locale du match transmise à un agent pour un tick
engine/ai/JoueurAgent.hpp/.cpp        Comportement : perception, décision, exécution
examples/exemple_joueur.cpp           Exemple compilable : création de joueurs + boucle de ticks
CMakeLists.txt                          Build (bibliothèque `rugby_engine` + exécutable `exemple_joueur`)
```

Compiler et exécuter l'exemple :

```
cmake -S . -B build && cmake --build build
./build/exemple_joueur
```

## 1. Vue d'ensemble du modèle

Un `Joueur` est une structure de données pure (aucune méthode) : identité, poste, morphologie, attributs (`Physique`, `Technique`, `Mental`, `Tactique`), état dynamique (`EtatMatch`), perception (`Perception`) et état de la machine à états IA (`EtatJoueur`). Toutes les notes d'attributs sont des `int` de 0 à 100, choisies volontairement simples pour rester faciles à éditer (fichier de données, éditeur de joueurs côté web, etc.).

Le comportement est séparé dans `JoueurAgent`, qui détient une référence vers un `Joueur` et exécute le cycle perception → décision → exécution à chaque tick. Cette séparation permet de tester l'IA indépendamment du rendu, et de réutiliser le même `Joueur` pour d'autres systèmes (fiche joueur côté web, progression de carrière, etc.) sans dépendre du code de simulation.

Le terrain est repéré en mètres : x ∈ [0, 100] (en-but à en-but), y ∈ [0, 70] (touche à touche), conformément à `docs/SPEC_MOTEUR_MATCH.md`.

## 2. Identité et morphologie

| Champ | Type | Description |
|---|---|---|
| `id` | int | identifiant unique du joueur |
| `nom` | string | nom affiché |
| `numero` | int | numéro de maillot (1-15) |
| `poste` | `Poste` | famille de poste, pilote l'IA |
| `roleTactique` | `RoleTactique` | rôle dans le plan de jeu, indépendant du poste |
| `tailleCm`, `poidsKg` | float | morphologie, utile pour les duels physiques et l'affichage futur |

`Poste` regroupe les 15 numéros en 9 familles de comportement : `Pilier`, `Talonneur`, `DeuxiemeLigne`, `TroisiemeLigne`, `DemiDeMelee`, `Ouvreur`, `Centre`, `Ailier`, `Arriere`. C'est volontairement plus grossier que le numéro exact : un pilier gauche et un pilier droit partagent le même comportement IA, seul `numero` les distingue pour l'affichage et les remplacements.

`RoleTactique` (`Generaliste`, `Distributeur`, `Percuteur`, `Finisseur`, `Sentinelle`) permet de nuancer un même poste selon la tactique d'équipe (ex. un centre `Percuteur` privilégiera la course/le contact, un centre `Distributeur` la passe).

## 3. Attributs

### 3.1 Physique

`vitesse`, `acceleration`, `agilite`, `puissance`, `force`, `endurance`, `explosivite`, `equilibre`, `resistanceChocs` — chacun 0-100.

### 3.2 Technique (rugby)

`passe`, `passeLongue`, `reception`, `jeuAuPied`, `precisionPied`, `puissancePied`, `plaquage`, `ruck`, `grattage`, `maul`, `melee`, `touche`, `lancerTouche`, `sautTouche`, `courseBallonEnMain`, `raffut`, `crochet`, `offload` — chacun 0-100.

### 3.3 Mental

`vision`, `decision`, `sangFroid`, `concentration`, `agressivite`, `courage`, `discipline`, `leadership`, `anticipation`, `creativite`, `collectif` — chacun 0-100.

### 3.4 Tactique

`placementOffensif`, `placementDefensif`, `soutien`, `lectureDuJeu`, `replacement`, `couvertureProfondeur`, `monteeDefensive`, `respectPlanDeJeu`, `ligneDeCourse` — chacun 0-100.

## 4. État dynamique (`EtatMatch`)

Recalculé à chaque tick, jamais persisté entre deux matchs :

- `position` (Vector2, m), `vitesse` (Vector2, m/s), `direction` (radians)
- `fatigue` (0-100, croît avec l'effort) et `energie` (0-100, = `100 - fatigue`, gardée séparée par lisibilité)
- `moral`, `confiance`, `pression`, `douleur`, `risqueBlessure` (0-100)
- `aLeBallon`, `estAuSol`, `estHorsJeu`, `estDansRuck`, `estDansMaul` (bool)
- `idCibleDefensive` (id du joueur adverse surveillé), `tempsDepuisDerniereAction` (s)

## 5. Perception (`Perception`)

Reconstruite chaque tick par `JoueurAgent::percevoir()` à partir du `ContexteMatch` (coéquipiers, adversaires, ballon visibles) :

- `distanceBallon`, `idPorteurBallon`
- `distanceAdversairePlusProche`, `idAdversairePlusProche`
- `distanceCoequipierPlusProche`, `idCoequipierPlusProche`
- `defenseursEntreSoiEtEnBut` : nombre d'adversaires situés entre le joueur et la ligne d'en-but adverse, dans un couloir de ±8m
- `espaceLibreDevant` : score heuristique 0-100, décroissant avec la densité défensive locale (`100 - defenseurs * 25`, borné)

## 6. Machine à états IA (`EtatJoueur`)

`Idle`, `SeReplacer`, `SoutenirPorteur`, `AttaquerEspace`, `PorteurBallon`, `FairePasse`, `RecevoirPasse`, `TaperAuPied`, `Plaquer`, `ParticiperRuck`, `ParticiperMaul`, `RevenirEnDefense`, `HorsJeu`, `AuSol`, `Blesse`.

`EtatJoueur` est un état *affiché/descriptif* (ce que le joueur est en train de faire, utile pour le futur rendu et les stats), tandis qu'`ActionJoueur` (`Aucune`, `Courir`, `Passer`, `TaperAuPied`, `TenterPlaquage`, `AllerAuRuck`, `AllerAuMaul`, `AttaquerEspace`, `SeReplacerDefensivement`, `SePlacerOffensivement`, `Soutenir`) est la *décision interne* prise à chaque tick par `choisirAction()`. `executerAction()` traduit l'action en mouvement/effet et met à jour `etatIA` en conséquence.

Un joueur `AuSol` ne décide plus pendant un court délai (1.5s simulées) puis repasse `Idle` ; un joueur `Blesse` ne décide plus du tout (sortie gérée plus tard par le moteur de remplacement, hors scope de cette spécification).

## 7. Logique de décision (`choisirAction`)

```
si estDansRuck         -> AllerAuRuck
si estDansMaul          -> AllerAuMaul

si aLeBallon:
    comparer evaluerCourse / evaluerPasse / evaluerCoupDePied
    -> choisir l'action au score le plus élevé (Courir / Passer / TaperAuPied)

sinon si l'équipe a le ballon (un coéquipier est porteur) :
    si proche du porteur (< 6m)         -> Soutenir
    sinon si espaceLibreDevant > 60      -> AttaquerEspace
    sinon                                  -> SePlacerOffensivement

sinon (l'adversaire a le ballon) :
    si l'adversaire le plus proche est le porteur et à portée de duel -> TenterPlaquage
    sinon                                                                -> SeReplacerDefensivement
```

`SeReplacerDefensivement` couvre, de façon agrégée pour ce MVP, le maintien de ligne, la couverture intérieure et le glissement défensif décrits dans la demande initiale : le joueur s'aligne en profondeur sur le ballon tout en conservant son couloir latéral. Le détail de chaque sous-comportement (glissement explicite, couverture de profondeur dédiée, surveillance du hors-jeu) est un raffinement futur une fois le moteur de règles branché.

## 8. Formules de simulation

```
vitesse_max(joueur) = (4.5 + vitesse/100 * 5.5) * max(0.4, 1 - fatigue/150)   [m/s]

score_course =
    espaceLibreDevant * 0.6
  + vitesse * 0.2
  + creativite * 0.1
  + decision * 0.1
  - defenseursEntreSoiEtEnBut * 8
  - fatigue * 0.3

score_passe(receveur) =
    passe_ou_passeLongue * 0.4        (passeLongue si distance > 12m)
  + vision * 0.2
  + espaceLibreDevant(receveur) * 0.3
  + (1 - distance/25) * 20

score_coup_de_pied =
    jeuAuPied * 0.4
  + precisionPied * 0.3
  + decision * 0.2
  - espaceLibreDevant * 0.5

score_plaquage(defenseur) =
    plaquage * 0.5
  + force * 0.2
  + agressivite * 0.1
  + angleBonus            (constante simplifiée pour le MVP)
  - fatigue * 0.2

score_ruck =
    ruck * 0.5
  + force * 0.25
  + courage * 0.15
  + agressivite * 0.10
  - fatigue * 0.25

probabilite_passe_reussie  = clamp((notePasse*0.5 + sangFroid*0.2 + (100-pression)*0.2 - fatigue*0.1) / 100, 0.05, 0.98)
probabilite_reception      = clamp((reception*0.6 + concentration*0.4) / 100, 0.1, 0.99)
probabilite_plaquage_reussi = clamp(0.5 + (score_plaquage(defenseur) - score_porteur(attaquant)) / 100, 0.05, 0.95)
probabilite_grattage_ruck   = clamp(score_ruck / 200, 0, 0.3)   [par tick, un ruck dure plusieurs ticks]
risque_blessure              = clamp(((force+puissance)/2) / 4 - resistanceChocs / 5, 0, 100)
risque_faute                  = max(0, agressivite - discipline) * 0.3

fatigue(dt, intensite) += dt * intensite * (1 - endurance/150) * 10     [accumulation par effort]
fatigue(dt) -= dt * (endurance/100) * 2                                [récupération au repos]
energie = 100 - fatigue
```

Toutes les pondérations ci-dessus sont des constantes de calibrage regroupées en tête de `JoueurAgent.cpp`, pensées pour être ajustées sans toucher à la logique.

## 9. Comportement attendu par poste

- **Pilier** : fort en mêlée/ruck, lent, défend proche du regroupement, va au contact plutôt que vers le large.
- **Talonneur** : lance en touche, participe activement aux rucks, reste autour des regroupements.
- **Deuxième ligne** : fort en touche (saut) et en maul, puissant, pousse en mêlée.
- **Troisième ligne** : plaque beaucoup, gratte les ballons, soutient rapidement, couvre beaucoup de terrain (lien avants/arrières).
- **Demi de mêlée** : sort vite les ballons des rucks, passes rapides et précises, organise le jeu proche des regroupements.
- **Ouvreur** : décide de l'attaque (course/passe/pied), attaque les espaces, gère le jeu au pied tactique.
- **Centre** : fixe la défense, plaque fort, casse les lignes, offload après contact.
- **Ailier** : cherche les espaces extérieurs, vitesse de pointe, termine les actions, défend les extérieurs.
- **Arrière** : couvre le fond du terrain, réceptionne les coups de pied adverses, relance, dernier défenseur.

Dans le modèle actuel, ce comportement émerge des **notes d'attributs** par poste (un pilier a `vitesse` basse et `plaquage`/`ruck`/`melee` hauts, un ailier l'inverse) plutôt que d'un branchement explicite par `Poste` dans `JoueurAgent` : les mêmes formules s'appliquent à tous, pondérées différemment par les stats. C'est volontaire pour le MVP — un branchement explicite par poste (ex. zone de placement préférentielle stricte) est un raffinement listé dans `docs/SPEC_MOTEUR_MATCH.md` (jalon 4).

## 10. Exemple complet

Voir `examples/exemple_joueur.cpp` : crée un ouvreur porteur du ballon, un ailier en soutien et un centre adverse, puis exécute 8 ticks de `JoueurAgent::update()` en affichant l'évolution de `etatIA`, position et possession. Extrait de la boucle :

```cpp
JoueurAgent agentOuvreur(ouvreur);
JoueurAgent agentAilier(ailier);
Rng rng(42);

for (int tick = 0; tick < 8; ++tick) {
    ContexteMatch contexte;
    contexte.coequipiers = {&ouvreur, &ailier};
    contexte.adversaires = {&defenseur};
    contexte.idPorteurBallon = ouvreur.etatMatch.aLeBallon ? ouvreur.id : -1;
    contexte.positionBallon = ouvreur.etatMatch.aLeBallon
        ? ouvreur.etatMatch.position : ailier.etatMatch.position;
    contexte.xEnButPropre = 0.0f;
    contexte.xEnButAdverse = 100.0f;

    agentOuvreur.update(0.5f, contexte, rng);
    agentAilier.update(0.5f, contexte, rng);
}
```

Sortie observée (avec la seed 42) : l'ouvreur court, tente une passe (ratée dans ce tirage), puis les deux joueurs basculent en `RevenirEnDefense` puisque plus personne dans l'équipe n'a le ballon — comportement cohérent avec la logique de décision décrite en section 7.

## 11. Limites connues du MVP et prochaines étapes

- `ContexteMatch` est construit à la main par l'appelant (pas encore par un `MatchSimulator`) ; son remplissage à partir d'un véritable état de match à 30 joueurs est le travail du jalon 2 de `docs/SPEC_MOTEUR_MATCH.md`.
- Le ruck et le maul sont résolus de façon agrégée et probabiliste (pas de positionnement individuel détaillé dans le regroupement).
- Pas de gestion des remplacements, cartons, ou fin de match : hors scope explicite, voir section 10 de `docs/SPEC_MOTEUR_MATCH.md`.
- Aucune dépendance graphique : `Vector2`/`Joueur`/`JoueurAgent` sont directement réutilisables avec SFML plus tard en lisant `etatMatch.position` pour le rendu.
