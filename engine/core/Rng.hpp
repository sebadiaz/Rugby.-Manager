#pragma once

#include <cstdint>
#include <random>

// Générateur pseudo-aléatoire seedé, partagé par les calculs de simulation
// pour garder un match reproductible à seed égale.
class Rng {
public:
    explicit Rng(uint64_t graine) : generateur_(graine) {}

    // Valeur uniforme dans [0, 1).
    float uniforme01() { return distribution_(generateur_); }

    // Valeur uniforme dans [min, max).
    float intervalle(float min, float max) { return min + uniforme01() * (max - min); }

    // Tirage booléen : true avec la probabilité donnée (0-1).
    bool tirage(float probabiliteSucces) { return uniforme01() < probabiliteSucces; }

private:
    std::mt19937_64 generateur_;
    std::uniform_real_distribution<float> distribution_{0.0f, 1.0f};
};
