#pragma once

#include "../core/Rng.hpp"
#include "../model/Joueur.hpp"
#include "../simulation/ContexteMatch.hpp"

// Pilote les décisions et déplacements d'un Joueur, tick par tick.
// Le Joueur référencé reste la seule source de vérité sur son état ;
// JoueurAgent ne fait que lire/modifier cet état.
class JoueurAgent {
public:
    explicit JoueurAgent(Joueur& joueur) : joueur_(joueur) {}

    // Cycle complet d'un tick : percevoir -> choisir -> exécuter.
    void update(float dt, const ContexteMatch& contexte, Rng& rng);

    // Étapes du cycle, exposées séparément pour les tests unitaires.
    void percevoir(const ContexteMatch& contexte);
    ActionJoueur choisirAction(const ContexteMatch& contexte) const;
    void executerAction(ActionJoueur action, float dt, const ContexteMatch& contexte, Rng& rng);

    void seDeplacerVers(const Vector2& cible, float dt);

    // Évaluations utilisées par choisirAction (et réutilisables isolément).
    float evaluerCourse(const ContexteMatch& contexte) const;
    float evaluerPasse(const ContexteMatch& contexte) const;
    float evaluerCoupDePied(const ContexteMatch& contexte) const;
    float evaluerPlaquage(const Joueur& cible) const;
    float evaluerRuck(const ContexteMatch& contexte) const;

    // Résolutions d'action, avec tirage aléatoire pour les duels.
    void fairePasse(Joueur& cible, Rng& rng);
    void tenterPlaquage(Joueur& cible, Rng& rng);
    void participerRuck(const ContexteMatch& contexte, Rng& rng);
    void seReplacerDefensivement(const ContexteMatch& contexte, float dt);
    void sePlacerOffensivement(const ContexteMatch& contexte, float dt);

    Joueur& joueur() { return joueur_; }
    const Joueur& joueur() const { return joueur_; }

private:
    Joueur& joueur_;

    Joueur* trouverMeilleurReceveur(const ContexteMatch& contexte) const;
    float vitesseMax() const;
    void appliquerEffort(float dt, float intensite);
    void recuperer(float dt);
};
