// Exemple minimal : crée un joueur, lui fait dérouler quelques ticks de
// décision face à un adversaire et un coéquipier, et affiche son évolution.
// Sert de point de départ pour brancher le moteur de simulation complet.

#include <iostream>

#include "../engine/ai/JoueurAgent.hpp"
#include "../engine/core/Rng.hpp"
#include "../engine/model/Joueur.hpp"
#include "../engine/simulation/ContexteMatch.hpp"

namespace {

const char* nomEtat(EtatJoueur etat) {
    switch (etat) {
        case EtatJoueur::Idle: return "Idle";
        case EtatJoueur::SeReplacer: return "SeReplacer";
        case EtatJoueur::SoutenirPorteur: return "SoutenirPorteur";
        case EtatJoueur::AttaquerEspace: return "AttaquerEspace";
        case EtatJoueur::PorteurBallon: return "PorteurBallon";
        case EtatJoueur::FairePasse: return "FairePasse";
        case EtatJoueur::RecevoirPasse: return "RecevoirPasse";
        case EtatJoueur::TaperAuPied: return "TaperAuPied";
        case EtatJoueur::Plaquer: return "Plaquer";
        case EtatJoueur::ParticiperRuck: return "ParticiperRuck";
        case EtatJoueur::ParticiperMaul: return "ParticiperMaul";
        case EtatJoueur::RevenirEnDefense: return "RevenirEnDefense";
        case EtatJoueur::HorsJeu: return "HorsJeu";
        case EtatJoueur::AuSol: return "AuSol";
        case EtatJoueur::Blesse: return "Blesse";
    }
    return "?";
}

Joueur creerOuvreur(int id) {
    Joueur j;
    j.id = id;
    j.nom = "Ouvreur Exemple";
    j.numero = 10;
    j.poste = Poste::Ouvreur;
    j.roleTactique = RoleTactique::Distributeur;
    j.tailleCm = 182.0f;
    j.poidsKg = 84.0f;

    j.physique.vitesse = 70;
    j.physique.acceleration = 72;
    j.physique.agilite = 75;
    j.physique.endurance = 65;

    j.technique.passe = 85;
    j.technique.passeLongue = 78;
    j.technique.jeuAuPied = 80;
    j.technique.precisionPied = 82;

    j.mental.vision = 88;
    j.mental.decision = 84;
    j.mental.sangFroid = 80;
    j.mental.creativite = 75;

    j.etatMatch.position = {40.0f, 35.0f};
    j.etatMatch.aLeBallon = true;
    return j;
}

Joueur creerAilier(int id) {
    Joueur j;
    j.id = id;
    j.nom = "Ailier Exemple";
    j.numero = 14;
    j.poste = Poste::Ailier;
    j.roleTactique = RoleTactique::Finisseur;
    j.physique.vitesse = 90;
    j.technique.reception = 80;
    j.mental.concentration = 75;
    j.tactique.soutien = 70;
    j.etatMatch.position = {45.0f, 55.0f};
    return j;
}

Joueur creerDefenseur(int id) {
    Joueur j;
    j.id = id;
    j.nom = "Centre Adverse";
    j.numero = 13;
    j.poste = Poste::Centre;
    j.physique.vitesse = 75;
    j.physique.force = 78;
    j.technique.plaquage = 80;
    j.mental.agressivite = 70;
    j.mental.discipline = 75;
    j.etatMatch.position = {50.0f, 35.0f};
    return j;
}

}  // namespace

int main() {
    Joueur ouvreur = creerOuvreur(1);
    Joueur ailier = creerAilier(2);
    Joueur defenseur = creerDefenseur(101);

    JoueurAgent agentOuvreur(ouvreur);
    JoueurAgent agentAilier(ailier);
    Rng rng(42);

    for (int tick = 0; tick < 8; ++tick) {
        ContexteMatch contexte;
        contexte.coequipiers = {&ouvreur, &ailier};
        contexte.adversaires = {&defenseur};
        contexte.idPorteurBallon = ouvreur.etatMatch.aLeBallon ? ouvreur.id : -1;
        contexte.positionBallon = ouvreur.etatMatch.aLeBallon ? ouvreur.etatMatch.position : ailier.etatMatch.position;
        contexte.xEnButPropre = 0.0f;
        contexte.xEnButAdverse = 100.0f;

        float dt = 0.5f;  // secondes simulées par tick

        agentOuvreur.update(dt, contexte, rng);
        agentAilier.update(dt, contexte, rng);

        std::cout << "tick " << tick << " | ouvreur: etat=" << nomEtat(ouvreur.etatIA)
                  << " pos=(" << ouvreur.etatMatch.position.x << "," << ouvreur.etatMatch.position.y << ")"
                  << " ballon=" << ouvreur.etatMatch.aLeBallon
                  << " | ailier: etat=" << nomEtat(ailier.etatIA) << " ballon=" << ailier.etatMatch.aLeBallon
                  << '\n';
    }

    return 0;
}
