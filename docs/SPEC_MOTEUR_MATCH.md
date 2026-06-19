# Spécification — Moteur de simulation de match 2D (C++)

Ce document détaille la conception du moteur de simulation de match, qui constitue la priorité absolue du projet (voir README.md). Il sert de référence avant l'implémentation. Aucun rendu graphique n'est traité ici : le moteur doit fonctionner en pur calcul (state + logique), le rendu sera branché plus tard sur l'état exposé.

## 1. Objectifs du moteur

- Simuler un match de rugby à 15 (30 joueurs autonomes) de façon crédible : décisions individuelles influencées par le poste, les statistiques du joueur, la situation de jeu, la tactique d'équipe et la position du ballon.
- Produire un flux d'événements et un état de jeu exploitables par : (a) un futur rendu 2D, (b) un système de statistiques/résumé de match pour l'interface web.
- Rester déterministe pour une seed donnée (reproductibilité des tests et des replays).

## 2. Architecture générale

```
engine/
  core/        Vector2, RNG seedé, Clock/Tick
  model/       Player, Team, Ball, Field, MatchState
  ai/          Decision (par rôle), Tactics
  simulation/  MatchSimulator, règles de phase de jeu (FSM)
  events/      MatchEvent, EventBus
```

Principe : **séparation stricte calcul / présentation**. Le moteur tourne en boucle de ticks fixes (ex. 10 ticks/seconde simulée) et produit une liste de `MatchEvent` consommables par n'importe quel front (CLI, futur rendu 2D, export JSON pour le web).

## 3. Modèle de données

### 3.1 Primitives

```cpp
struct Vector2 { float x, y; };
```

### 3.2 Terrain (`Field`)

- Dimensions réglementaires simplifiées : 100m (jeu) + 2x10m (en-but) x 70m.
- Repères : lignes de but, lignes des 22m, ligne médiane, touches.
- Le terrain est une donnée statique, pas un objet à état.

### 3.3 Poste (`PlayerRole`)

Énumération des 15 postes (numéros 1 à 15), regroupés en familles pour l'IA :
- Avants de mêlée (1,2,3) : pilier gauche/droit, talonneur
- Deuxième ligne (4,5)
- Troisième ligne (6,7,8) : flanker gauche/droit, n°8
- Charnière (9,10) : demi de mêlée, demi d'ouverture
- Centres (12,13)
- Ailiers/arrière (11,14,15)

### 3.4 Joueur (`Player`)

```cpp
struct PlayerStats {
    int speed;        // 1-100
    int strength;      // 1-100
    int passing;        // 1-100
    int tackling;       // 1-100
    int handling;       // 1-100 (sécurité du ballon, évite les en-avants)
    int decisionMaking;  // 1-100 (qualité des choix IA)
    int stamina;        // 1-100, dégradation en cours de match
};

struct Player {
    int id;
    std::string name;
    PlayerRole role;
    PlayerStats stats;
    Vector2 position;
    Vector2 velocity;
    float currentStamina;   // évolue pendant le match, dérivé de stamina
    bool hasBall;
    bool isTackled;
};
```

### 3.5 Ballon (`Ball`)

```cpp
struct Ball {
    Vector2 position;
    Vector2 velocity;
    int carrierId;       // -1 si personne ne le porte
    BallState state;     // EnMain, EnLAir(passe/coup de pied), AuSol(ruck/turnover)
};
```

### 3.6 Équipe (`Team`)

```cpp
struct Team {
    std::string name;
    std::array<Player, 15> players;
    Tactics tactics;       // largeur du jeu, agressivité défensive, jeu au pied vs jeu à la main
    int score;
};
```

### 3.7 État de match (`MatchState`)

```cpp
struct MatchState {
    Field field;
    Team teamA, teamB;
    Ball ball;
    int tick;
    int minute;            // dérivé du tick
    MatchPhase phase;       // voir FSM ci-dessous
    Team* teamInPossession;
};
```

## 4. Boucle de simulation

```cpp
class MatchSimulator {
public:
    explicit MatchSimulator(MatchState initialState, uint64_t seed);
    std::vector<MatchEvent> step(float deltaTime); // une frame de simulation
    bool isFinished() const;
private:
    MatchState state_;
    RNG rng_;
};
```

- `step()` exécute, dans l'ordre : (1) décision IA pour chaque joueur (`ai::decide`), (2) résolution des mouvements/actions, (3) détection des collisions/contacts (plaquages), (4) transition de phase si besoin, (5) émission des `MatchEvent`.
- Le match dure 80 minutes simulées ; le mapping temps réel → ticks est un paramètre (ex. accéléré pour la version web, "temps réel" pour un éventuel mode spectacle).

## 5. Machine à états du jeu (`MatchPhase`)

Phases couvertes par le MVP (volontairement simplifiées par rapport au rugby réel) :

```
KickOff → OpenPlay ⇄ Tackle → Ruck → OpenPlay
                 ↘ Knock-on/Forward pass → ScrumSimplifie → OpenPlay
                 ↘ Sortie en touche → ToucheSimplifiee → OpenPlay
                 ↘ Ballon porté dans l'en-but → Essai → Transformation → KickOff (camp adverse)
                 ↘ Faute → PenaliteSimplifiee → (tir au but | jeu au pied | mêlée)
```

Hors scope MVP (à ajouter plus tard) : mêlées et touches détaillées avec contestation, drop-goals, carton/exclusion, 50:22, avantage prolongé.

## 6. IA par poste

L'IA est calculée par un module `ai::decide(const Player&, const MatchState&) -> Action`, où `Action` est une des suivantes : `Courir(direction)`, `Passer(cible)`, `Taper(direction)`, `Plaquer(cible)`, `Soutenir(joueurPorteur)`, `SePlacer(positionTactique)`.

Facteurs d'entrée pour chaque décision :
1. **Poste** : détermine la zone d'évolution préférentielle (ex. pilier reste près des regroupements, ailier reste large et profite des extérieurs).
2. **Statistiques** : `decisionMaking` pondère le bruit aléatoire (joueur faible = décisions plus erratiques), `speed`/`strength`/`tackling` déterminent l'issue des duels.
3. **Situation de jeu** : possession ou non, position du ballon par rapport au joueur, distance aux lignes (en-but, 22m), nombre de défenseurs entre le porteur et la ligne.
4. **Tactique d'équipe** : largeur du jeu (jouer au large vs concentrer au centre), profil offensif/défensif, jeu au pied privilégié ou non.
5. **Fatigue** (`currentStamina`) : réduit `speed` effective et la qualité des décisions en fin de match.

Comportement type par famille de poste (MVP) :
- **Avants (1,2,3,4,5)** : se regroupent autour du point de ruck/plaquage, soutiennent le porteur, peu de jeu au large.
- **Troisième ligne (6,7,8)** : lien entre avants et arrières, premiers défenseurs/plaqueurs, soutien rapproché.
- **Charnière (9,10)** : organisateurs du jeu, choix entre passer au large, taper au pied, ou lancer un avant proche.
- **Centres/ailiers/arrière (12,13,11,14,15)** : exploitation des espaces, course de vitesse, dernier rempart défensif (arrière).

## 7. Règles de résolution simplifiées (MVP)

- **Passe** : réussie si `passing` du passeur et `handling` du receveur dépassent un seuil aléatoire pondéré par la distance et la pression défensive ; échec = en-avant (`Knock-on`) ou interception possible.
- **Plaquage** : duel `strength`+`tackling` (défenseur) vs `strength`+`speed` (porteur), avec un facteur aléatoire ; issue = plaquage simple (→ Ruck) ou cassé (le porteur continue).
- **Ruck** : résolu de façon agrégée (pas joueur par joueur) à partir du nombre de soutiens de chaque équipe et de leurs stats moyennes ; déterminé si le ballon ressort vite/lent et pour quelle équipe.
- **Essai** : ballon porté avec contrôle (`hasBall = true`, pas `isTackled`) au-delà de la ligne d'en-but → +5 points, événement `Essai`.
- **Transformation** : tentative automatique pondérée par une statistique de botteur (à ajouter, ex. `kicking`) et l'angle/distance par rapport aux poteaux → +2 points si réussie.

## 8. Événements (`MatchEvent`)

```cpp
enum class MatchEventType { KickOff, Passe, Plaquage, Ruck, Essai, Transformation, Penalite, Touche, Carton, FinMiTemps, FinMatch };

struct MatchEvent {
    MatchEventType type;
    int tick;
    int teamIndex;     // équipe concernée
    int playerId;       // joueur principal concerné (-1 si non applicable)
    Vector2 position;
};
```

Ce flux d'événements est la base du futur export JSON consommé par l'interface web (résumé de match, stats) et, plus tard, par un rendu 2D qui rejouera les positions.

## 9. Plan de développement (jalons)

1. **Jalon 1 — Squelette de données** : structs `Vector2`, `Player`, `Team`, `Ball`, `Field`, `MatchState`, sans logique.
2. **Jalon 2 — Boucle de simulation minimale** : `OpenPlay` uniquement, un seul type de décision IA (courir vers l'en-but adverse + passer si bloqué), pas de plaquage encore.
3. **Jalon 3 — Plaquages et Rucks** : ajout de la FSM complète et de la résolution des contacts.
4. **Jalon 4 — IA différenciée par poste** : comportements distincts selon la famille de poste et la tactique d'équipe.
5. **Jalon 5 — Essais, transformations, score, fin de match** : boucle de match complète jouable en CLI (sortie texte des événements).
6. **Jalon 6 (hors moteur)** : export JSON du flux d'événements pour consommation par l'interface web ; le rendu 2D graphique sera un jalon séparé, après validation de la simulation.

## 10. Hors scope explicite pour le MVP

- Rendu graphique (SFML/SDL2 ou autre) — décision reportée.
- Mêlées et touches avec contestation réaliste.
- Cartons, exclusions temporaires, TMO/arbitrage vidéo.
- Gestion de la fatigue inter-matchs / saison (relève du module de gestion web, pas du moteur de match).
- Multithreading / optimisation performance (prématuré avant d'avoir une logique de jeu correcte).
