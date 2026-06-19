#pragma once

#include <cmath>

// Vecteur 2D en mètres, utilisé pour les positions et vitesses sur le terrain.
struct Vector2 {
    float x = 0.0f;
    float y = 0.0f;

    Vector2 operator+(const Vector2& autre) const { return {x + autre.x, y + autre.y}; }
    Vector2 operator-(const Vector2& autre) const { return {x - autre.x, y - autre.y}; }
    Vector2 operator*(float scalaire) const { return {x * scalaire, y * scalaire}; }

    float longueur() const { return std::sqrt(x * x + y * y); }

    Vector2 normalise() const {
        float l = longueur();
        if (l < 1e-6f) {
            return {0.0f, 0.0f};
        }
        return {x / l, y / l};
    }

    static float distance(const Vector2& a, const Vector2& b) { return (a - b).longueur(); }
};
