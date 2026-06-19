#pragma once

#include <vector>

#include "../model/Joueur.hpp"

// Vue partielle de l'état du match transmise à un agent pour un tick donné :
// juste assez d'information pour décider et bouger, sans dépendre du
// MatchSimulator complet (qui n'existe pas encore — voir docs/SPEC_MOTEUR_MATCH.md).
struct ContexteMatch {
    std::vector<Joueur*> coequipiers; // inclut le joueur lui-même
    std::vector<Joueur*> adversaires;

    Vector2 positionBallon;
    int idPorteurBallon = -1;

    float longueurTerrain = 100.0f; // mètres, ligne d'en-but à ligne d'en-but
    float largeurTerrain = 70.0f;    // mètres
    float xEnButPropre = 0.0f;        // coordonnée x de sa propre ligne d'en-but
    float xEnButAdverse = 100.0f;      // coordonnée x de la ligne d'en-but à atteindre
};
