#pragma once

#include <string>

#include "../core/Vector2.hpp"

// Poste occupé sur le terrain. Regroupé par famille pour piloter l'IA
// (le numéro de maillot exact est stocké séparément dans Joueur::numero).
enum class Poste {
    Pilier,
    Talonneur,
    DeuxiemeLigne,
    TroisiemeLigne,
    DemiDeMelee,
    Ouvreur,
    Centre,
    Ailier,
    Arriere
};

// Rôle tactique dans le plan de jeu de l'équipe, indépendant du poste
// (un centre peut être Percuteur ou Distributeur selon la tactique choisie).
enum class RoleTactique {
    Generaliste,
    Distributeur,
    Percuteur,
    Finisseur,
    Sentinelle
};

// État courant de la machine à états IA du joueur.
enum class EtatJoueur {
    Idle,
    SeReplacer,
    SoutenirPorteur,
    AttaquerEspace,
    PorteurBallon,
    FairePasse,
    RecevoirPasse,
    TaperAuPied,
    Plaquer,
    ParticiperRuck,
    ParticiperMaul,
    RevenirEnDefense,
    HorsJeu,
    AuSol,
    Blesse
};

// Action concrète choisie pour le tick de simulation courant.
enum class ActionJoueur {
    Aucune,
    Courir,
    Passer,
    TaperAuPied,
    TenterPlaquage,
    AllerAuRuck,
    AllerAuMaul,
    AttaquerEspace,
    SeReplacerDefensivement,
    SePlacerOffensivement,
    Soutenir
};

// --- Attributs : notes de 0 (faible) à 100 (élite), pensées pour être éditées
// facilement (fichier de données / éditeur), sans logique attachée. ---

struct Physique {
    int vitesse = 50;
    int acceleration = 50;
    int agilite = 50;
    int puissance = 50;
    int force = 50;
    int endurance = 50;
    int explosivite = 50;
    int equilibre = 50;
    int resistanceChocs = 50;
};

struct Technique {
    int passe = 50;
    int passeLongue = 50;
    int reception = 50;
    int jeuAuPied = 50;
    int precisionPied = 50;
    int puissancePied = 50;
    int plaquage = 50;
    int ruck = 50;
    int grattage = 50;
    int maul = 50;
    int melee = 50;
    int touche = 50;
    int lancerTouche = 50;
    int sautTouche = 50;
    int courseBallonEnMain = 50;
    int raffut = 50;
    int crochet = 50;
    int offload = 50;
};

struct Mental {
    int vision = 50;
    int decision = 50;
    int sangFroid = 50;
    int concentration = 50;
    int agressivite = 50;
    int courage = 50;
    int discipline = 50;
    int leadership = 50;
    int anticipation = 50;
    int creativite = 50;
    int collectif = 50;
};

struct Tactique {
    int placementOffensif = 50;
    int placementDefensif = 50;
    int soutien = 50;
    int lectureDuJeu = 50;
    int replacement = 50;
    int couvertureProfondeur = 50;
    int monteeDefensive = 50;
    int respectPlanDeJeu = 50;
    int ligneDeCourse = 50;
};

// --- État dynamique : recalculé à chaque tick de simulation, jamais persisté
// entre deux matchs. ---

struct EtatMatch {
    Vector2 position;          // mètres, repère terrain (0,0) = coin du terrain
    Vector2 vitesse;             // m/s
    float direction = 0.0f;       // radians, orientation du déplacement

    float fatigue = 0.0f;          // 0 = frais, 100 = épuisé
    float energie = 100.0f;         // 0 = vide, 100 = plein ; consommée par l'effort
    float moral = 70.0f;             // 0-100
    float confiance = 70.0f;          // 0-100
    float pression = 0.0f;             // 0-100, pression adverse perçue
    float douleur = 0.0f;               // 0-100, accumulée par les chocs
    float risqueBlessure = 0.0f;         // 0-100, probabilité instantanée

    bool aLeBallon = false;
    bool estAuSol = false;
    bool estHorsJeu = false;
    bool estDansRuck = false;
    bool estDansMaul = false;

    int idCibleDefensive = -1;            // id du joueur adverse actuellement surveillé
    float tempsDepuisDerniereAction = 0.0f; // secondes
};

// --- Perception : lecture instantanée de l'environnement, reconstruite
// chaque tick par JoueurAgent::percevoir(). ---

struct Perception {
    float distanceBallon = 0.0f;
    int idPorteurBallon = -1;

    float distanceAdversairePlusProche = 1e6f;
    int idAdversairePlusProche = -1;

    float distanceCoequipierPlusProche = 1e6f;
    int idCoequipierPlusProche = -1;

    int defenseursEntreSoiEtEnBut = 0;   // densité défensive sur la trajectoire directe
    float espaceLibreDevant = 0.0f;        // score heuristique 0-100
};

// --- Agrégat complet d'un joueur : données pures, sans comportement.
// Le comportement vit dans JoueurAgent (engine/ai/JoueurAgent.hpp). ---

struct Joueur {
    // Identité
    int id = -1;
    std::string nom;
    int numero = 0;
    Poste poste = Poste::Centre;
    RoleTactique roleTactique = RoleTactique::Generaliste;

    // Morphologie
    float tailleCm = 180.0f;
    float poidsKg = 90.0f;

    // Attributs
    Physique physique;
    Technique technique;
    Mental mental;
    Tactique tactique;

    // État vivant
    EtatMatch etatMatch;
    Perception perception;
    EtatJoueur etatIA = EtatJoueur::Idle;
};
