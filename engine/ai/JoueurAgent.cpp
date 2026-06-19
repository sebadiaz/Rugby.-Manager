#include "JoueurAgent.hpp"

#include <algorithm>
#include <cmath>

namespace {
// Constantes de calibrage. Regroupées ici pour rester faciles à retoucher
// sans fouiller la logique. Unités : mètres, secondes, points sur 100.
constexpr float VITESSE_BASE_MS = 4.5f;       // vitesse max à 0 en note "vitesse"
constexpr float VITESSE_GAIN_MAX_MS = 5.5f;     // gain max ajouté à 100 en "vitesse"
constexpr float DISTANCE_PASSE_MAX_M = 25.0f;     // au-delà, la passe n'est plus envisagée
constexpr float DISTANCE_PASSE_LONGUE_M = 12.0f;   // seuil passe courte / passe longue
constexpr float DISTANCE_DUEL_M = 1.5f;              // distance de contact (plaquage)
constexpr float COULOIR_DEFENSIF_M = 8.0f;              // largeur du couloir surveillé

constexpr float INTENSITE_FAIBLE = 0.3f;
constexpr float INTENSITE_MOYENNE = 0.6f;
constexpr float INTENSITE_ELEVEE = 1.0f;
}  // namespace

void JoueurAgent::update(float dt, const ContexteMatch& contexte, Rng& rng) {
    if (joueur_.etatIA == EtatJoueur::Blesse) {
        return;  // un joueur blessé ne décide plus ; la sortie est gérée par le moteur de match
    }

    percevoir(contexte);

    if (joueur_.etatMatch.estAuSol) {
        // Relevé simplifié : le joueur se relève après un court délai au sol.
        joueur_.etatMatch.tempsDepuisDerniereAction += dt;
        if (joueur_.etatMatch.tempsDepuisDerniereAction > 1.5f) {
            joueur_.etatMatch.estAuSol = false;
            joueur_.etatMatch.tempsDepuisDerniereAction = 0.0f;
            joueur_.etatIA = EtatJoueur::Idle;
        }
        return;
    }

    ActionJoueur action = choisirAction(contexte);
    executerAction(action, dt, contexte, rng);
    joueur_.etatMatch.tempsDepuisDerniereAction = 0.0f;
}

void JoueurAgent::percevoir(const ContexteMatch& contexte) {
    auto& perc = joueur_.perception;
    const Vector2& pos = joueur_.etatMatch.position;

    perc.distanceBallon = Vector2::distance(pos, contexte.positionBallon);
    perc.idPorteurBallon = contexte.idPorteurBallon;

    perc.distanceAdversairePlusProche = 1e6f;
    perc.idAdversairePlusProche = -1;
    for (Joueur* adversaire : contexte.adversaires) {
        float d = Vector2::distance(pos, adversaire->etatMatch.position);
        if (d < perc.distanceAdversairePlusProche) {
            perc.distanceAdversairePlusProche = d;
            perc.idAdversairePlusProche = adversaire->id;
        }
    }

    perc.distanceCoequipierPlusProche = 1e6f;
    perc.idCoequipierPlusProche = -1;
    for (Joueur* coequipier : contexte.coequipiers) {
        if (coequipier->id == joueur_.id) continue;
        float d = Vector2::distance(pos, coequipier->etatMatch.position);
        if (d < perc.distanceCoequipierPlusProche) {
            perc.distanceCoequipierPlusProche = d;
            perc.idCoequipierPlusProche = coequipier->id;
        }
    }

    // Densité défensive sur la trajectoire directe : adversaires situés entre
    // soi et la ligne d'en-but adverse, dans un couloir étroit autour de sa position.
    bool versXCroissant = contexte.xEnButAdverse > contexte.xEnButPropre;
    int defenseurs = 0;
    for (Joueur* adversaire : contexte.adversaires) {
        const Vector2& posAdv = adversaire->etatMatch.position;
        bool estDevant = versXCroissant ? (posAdv.x > pos.x && posAdv.x <= contexte.xEnButAdverse)
                                         : (posAdv.x < pos.x && posAdv.x >= contexte.xEnButAdverse);
        bool estDansCouloir = std::abs(posAdv.y - pos.y) < COULOIR_DEFENSIF_M;
        if (estDevant && estDansCouloir) ++defenseurs;
    }
    perc.defenseursEntreSoiEtEnBut = defenseurs;
    perc.espaceLibreDevant = std::clamp(100.0f - defenseurs * 25.0f, 0.0f, 100.0f);
}

ActionJoueur JoueurAgent::choisirAction(const ContexteMatch& contexte) const {
    const EtatMatch& etat = joueur_.etatMatch;

    if (etat.estDansRuck) return ActionJoueur::AllerAuRuck;
    if (etat.estDansMaul) return ActionJoueur::AllerAuMaul;

    // --- Cas offensif : le joueur porte lui-même le ballon. ---
    if (etat.aLeBallon) {
        float scoreCourse = evaluerCourse(contexte);
        float scorePasse = evaluerPasse(contexte);
        float scorePied = evaluerCoupDePied(contexte);

        if (scoreCourse >= scorePasse && scoreCourse >= scorePied) return ActionJoueur::Courir;
        if (scorePasse >= scorePied) return ActionJoueur::Passer;
        return ActionJoueur::TaperAuPied;
    }

    bool equipeEnPossession = false;
    for (Joueur* coequipier : contexte.coequipiers) {
        if (coequipier->id == contexte.idPorteurBallon) {
            equipeEnPossession = true;
            break;
        }
    }

    // --- Cas offensif : l'équipe a le ballon, mais pas ce joueur. ---
    if (equipeEnPossession) {
        if (joueur_.perception.distanceBallon < 6.0f) return ActionJoueur::Soutenir;
        if (joueur_.perception.espaceLibreDevant > 60.0f) return ActionJoueur::AttaquerEspace;
        return ActionJoueur::SePlacerOffensivement;
    }

    // --- Cas défensif : l'adversaire a le ballon. ---
    bool adversaireProcheALeBallon = joueur_.perception.idAdversairePlusProche == contexte.idPorteurBallon &&
                                      joueur_.perception.distanceAdversairePlusProche < DISTANCE_DUEL_M * 3.0f;
    if (adversaireProcheALeBallon) return ActionJoueur::TenterPlaquage;

    return ActionJoueur::SeReplacerDefensivement;
}

void JoueurAgent::executerAction(ActionJoueur action, float dt, const ContexteMatch& contexte, Rng& rng) {
    switch (action) {
        case ActionJoueur::Courir: {
            // Direction simplifiée : droit vers la ligne d'en-but adverse, à la même
            // hauteur. L'évitement fin des défenseurs reviendra avec le moteur de règles.
            Vector2 cible{contexte.xEnButAdverse, joueur_.etatMatch.position.y};
            seDeplacerVers(cible, dt);
            appliquerEffort(dt, INTENSITE_ELEVEE);
            joueur_.etatIA = EtatJoueur::PorteurBallon;
            break;
        }
        case ActionJoueur::Passer: {
            Joueur* receveur = trouverMeilleurReceveur(contexte);
            if (receveur != nullptr) {
                fairePasse(*receveur, rng);
            }
            joueur_.etatIA = EtatJoueur::FairePasse;
            appliquerEffort(dt, INTENSITE_FAIBLE);
            break;
        }
        case ActionJoueur::TaperAuPied: {
            // Coup de pied simplifié : le ballon part vers l'avant, personne ne le porte
            // jusqu'à ce que le moteur de règles attribue la réception.
            joueur_.etatMatch.aLeBallon = false;
            joueur_.etatIA = EtatJoueur::TaperAuPied;
            appliquerEffort(dt, INTENSITE_MOYENNE);
            break;
        }
        case ActionJoueur::TenterPlaquage: {
            int idCible = joueur_.perception.idAdversairePlusProche;
            for (Joueur* adversaire : contexte.adversaires) {
                if (adversaire->id == idCible) {
                    tenterPlaquage(*adversaire, rng);
                    break;
                }
            }
            appliquerEffort(dt, INTENSITE_ELEVEE);
            break;
        }
        case ActionJoueur::AllerAuRuck: {
            participerRuck(contexte, rng);
            appliquerEffort(dt, INTENSITE_ELEVEE);
            break;
        }
        case ActionJoueur::AllerAuMaul: {
            joueur_.etatMatch.estDansMaul = true;
            joueur_.etatIA = EtatJoueur::ParticiperMaul;
            appliquerEffort(dt, INTENSITE_MOYENNE);
            break;
        }
        case ActionJoueur::SeReplacerDefensivement: {
            seReplacerDefensivement(contexte, dt);
            appliquerEffort(dt, INTENSITE_MOYENNE);
            break;
        }
        case ActionJoueur::SePlacerOffensivement: {
            sePlacerOffensivement(contexte, dt);
            appliquerEffort(dt, INTENSITE_FAIBLE);
            break;
        }
        case ActionJoueur::AttaquerEspace: {
            // Course de soutien vers l'espace libre repéré, plus franche qu'un simple
            // replacement offensif.
            bool versXCroissant = contexte.xEnButAdverse > contexte.xEnButPropre;
            Vector2 cible{contexte.xEnButAdverse, joueur_.etatMatch.position.y + (versXCroissant ? 3.0f : -3.0f)};
            seDeplacerVers(cible, dt);
            joueur_.etatIA = EtatJoueur::AttaquerEspace;
            appliquerEffort(dt, INTENSITE_MOYENNE);
            break;
        }
        case ActionJoueur::Soutenir: {
            Vector2 ciblePorteur = contexte.positionBallon;
            seDeplacerVers(ciblePorteur, dt);
            joueur_.etatIA = EtatJoueur::SoutenirPorteur;
            appliquerEffort(dt, INTENSITE_MOYENNE);
            break;
        }
        case ActionJoueur::Aucune:
        default: {
            recuperer(dt);
            joueur_.etatIA = EtatJoueur::Idle;
            break;
        }
    }
}

void JoueurAgent::seDeplacerVers(const Vector2& cible, float dt) {
    Vector2 ecart = cible - joueur_.etatMatch.position;
    Vector2 direction = ecart.normalise();
    float vMax = vitesseMax();

    joueur_.etatMatch.vitesse = direction * vMax;
    joueur_.etatMatch.position = joueur_.etatMatch.position + joueur_.etatMatch.vitesse * dt;
    if (direction.longueur() > 0.0f) {
        joueur_.etatMatch.direction = std::atan2(direction.y, direction.x);
    }
}

float JoueurAgent::vitesseMax() const {
    float base = VITESSE_BASE_MS + (joueur_.physique.vitesse / 100.0f) * VITESSE_GAIN_MAX_MS;
    float facteurFatigue = std::max(0.4f, 1.0f - joueur_.etatMatch.fatigue / 150.0f);
    return base * facteurFatigue;
}

float JoueurAgent::evaluerCourse(const ContexteMatch& /*contexte*/) const {
    const Physique& p = joueur_.physique;
    const Mental& m = joueur_.mental;
    const Perception& perc = joueur_.perception;

    float score = perc.espaceLibreDevant * 0.6f + p.vitesse * 0.2f + m.creativite * 0.1f + m.decision * 0.1f -
                  perc.defenseursEntreSoiEtEnBut * 8.0f - joueur_.etatMatch.fatigue * 0.3f;
    return std::max(0.0f, score);
}

float JoueurAgent::evaluerPasse(const ContexteMatch& contexte) const {
    Joueur* receveur = trouverMeilleurReceveur(contexte);
    if (receveur == nullptr) return 0.0f;

    const Technique& t = joueur_.technique;
    const Mental& m = joueur_.mental;
    float distance = Vector2::distance(joueur_.etatMatch.position, receveur->etatMatch.position);
    float facteurDistance = distance > DISTANCE_PASSE_MAX_M ? 0.0f : (1.0f - distance / DISTANCE_PASSE_MAX_M);

    float score = t.passe * 0.4f + m.vision * 0.2f + receveur->perception.espaceLibreDevant * 0.3f +
                  facteurDistance * 20.0f;
    return std::max(0.0f, score);
}

float JoueurAgent::evaluerCoupDePied(const ContexteMatch& /*contexte*/) const {
    const Technique& t = joueur_.technique;
    const Mental& m = joueur_.mental;

    // Le jeu au pied devient préférable quand l'espace de course se ferme.
    float score = t.jeuAuPied * 0.4f + t.precisionPied * 0.3f + m.decision * 0.2f -
                  joueur_.perception.espaceLibreDevant * 0.5f;
    return std::max(0.0f, score);
}

float JoueurAgent::evaluerPlaquage(const Joueur& /*cible*/) const {
    const Technique& t = joueur_.technique;
    const Physique& p = joueur_.physique;
    const Mental& m = joueur_.mental;

    constexpr float angleBonus = 5.0f;  // bonus fixe simplifié ; affinable avec l'angle d'approche réel
    return t.plaquage * 0.5f + p.force * 0.2f + m.agressivite * 0.1f + angleBonus - joueur_.etatMatch.fatigue * 0.2f;
}

float JoueurAgent::evaluerRuck(const ContexteMatch& /*contexte*/) const {
    const Technique& t = joueur_.technique;
    const Physique& p = joueur_.physique;
    const Mental& m = joueur_.mental;

    return t.ruck * 0.5f + p.force * 0.25f + m.courage * 0.15f + m.agressivite * 0.10f -
           joueur_.etatMatch.fatigue * 0.25f;
}

void JoueurAgent::fairePasse(Joueur& cible, Rng& rng) {
    const Technique& t = joueur_.technique;
    const Mental& m = joueur_.mental;

    float distance = Vector2::distance(joueur_.etatMatch.position, cible.etatMatch.position);
    int notePasse = distance > DISTANCE_PASSE_LONGUE_M ? t.passeLongue : t.passe;

    float scoreReussite = notePasse * 0.5f + m.sangFroid * 0.2f + (100.0f - joueur_.etatMatch.pression) * 0.2f -
                          joueur_.etatMatch.fatigue * 0.1f;
    float probabiliteReussite = std::clamp(scoreReussite / 100.0f, 0.05f, 0.98f);

    if (!rng.tirage(probabiliteReussite)) {
        // Passe ratée : en-avant, ballon au sol (résolu par les règles de ruck/turnover).
        joueur_.etatMatch.aLeBallon = false;
        return;
    }

    float scoreReception = cible.technique.reception * 0.6f + cible.mental.concentration * 0.4f;
    float probabiliteReception = std::clamp(scoreReception / 100.0f, 0.1f, 0.99f);

    joueur_.etatMatch.aLeBallon = false;
    if (rng.tirage(probabiliteReception)) {
        cible.etatMatch.aLeBallon = true;
        cible.etatIA = EtatJoueur::RecevoirPasse;
    }
    // Sinon : ballon échappé au sol, personne ne le porte (turnover simplifié).
}

void JoueurAgent::tenterPlaquage(Joueur& cible, Rng& rng) {
    joueur_.etatIA = EtatJoueur::Plaquer;

    float scoreAttaquant = cible.physique.force * 0.5f + cible.physique.vitesse * 0.3f +
                           cible.mental.creativite * 0.2f - cible.etatMatch.fatigue * 0.2f;
    float scoreDefenseur = evaluerPlaquage(cible);

    float probabiliteReussite = std::clamp(0.5f + (scoreDefenseur - scoreAttaquant) / 100.0f, 0.05f, 0.95f);

    if (rng.tirage(probabiliteReussite)) {
        cible.etatMatch.estAuSol = true;
        cible.etatMatch.aLeBallon = false;
        cible.etatIA = EtatJoueur::AuSol;
        joueur_.etatMatch.estAuSol = true;  // le plaqueur va au contact, au sol lui aussi (simplifié)

        // Risque de blessure proportionnel à l'intensité du choc et inversement
        // proportionnel à la résistance aux chocs de l'encaisseur.
        float intensiteChoc = (joueur_.physique.force + joueur_.physique.puissance) * 0.5f;
        cible.etatMatch.risqueBlessure =
            std::clamp(intensiteChoc / 4.0f - cible.physique.resistanceChocs / 5.0f, 0.0f, 100.0f);
        if (rng.tirage(cible.etatMatch.risqueBlessure / 100.0f)) {
            cible.etatIA = EtatJoueur::Blesse;
        }
    } else {
        cible.etatMatch.pression = std::max(0.0f, cible.etatMatch.pression - 10.0f);
    }

    // Risque de faute si l'agressivité dépasse nettement la discipline (plaquage dangereux).
    float ecartAgressiviteDiscipline = static_cast<float>(joueur_.mental.agressivite - joueur_.mental.discipline);
    float risqueFaute = std::max(0.0f, ecartAgressiviteDiscipline) * 0.3f;
    if (rng.tirage(risqueFaute / 100.0f)) {
        joueur_.etatMatch.pression += 5.0f;  // pénalité concédée, à relier au moteur de règles
    }
}

void JoueurAgent::participerRuck(const ContexteMatch& /*contexte*/, Rng& rng) {
    joueur_.etatMatch.estDansRuck = true;
    joueur_.etatIA = EtatJoueur::ParticiperRuck;

    float scoreGrattage = joueur_.technique.grattage * 0.5f + joueur_.physique.equilibre * 0.3f +
                          joueur_.mental.agressivite * 0.2f - joueur_.etatMatch.fatigue * 0.2f;
    // Probabilité par tick volontairement faible : un ruck dure plusieurs ticks.
    float probabiliteGrattage = std::clamp(scoreGrattage / 200.0f, 0.0f, 0.3f);

    if (rng.tirage(probabiliteGrattage)) {
        // Signal de changement de possession au point de ruck ; la résolution
        // complète (sortie du ruck, repositionnement) revient au moteur de règles.
        joueur_.etatMatch.aLeBallon = true;
    }
}

void JoueurAgent::seReplacerDefensivement(const ContexteMatch& contexte, float dt) {
    // Maintient la ligne défensive : aligné avec le ballon en profondeur,
    // conserve sa position latérale (son couloir de couverture).
    Vector2 cible{joueur_.etatMatch.position.x, contexte.positionBallon.y};
    seDeplacerVers(cible, dt);
    joueur_.etatIA = EtatJoueur::RevenirEnDefense;
}

void JoueurAgent::sePlacerOffensivement(const ContexteMatch& contexte, float dt) {
    // Se positionne en soutien large, dans le sens de l'attaque de l'équipe.
    bool versXCroissant = contexte.xEnButAdverse > contexte.xEnButPropre;
    float pas = versXCroissant ? 5.0f : -5.0f;
    Vector2 cible{joueur_.etatMatch.position.x + pas, joueur_.etatMatch.position.y};
    seDeplacerVers(cible, dt);
    joueur_.etatIA = EtatJoueur::AttaquerEspace;
}

Joueur* JoueurAgent::trouverMeilleurReceveur(const ContexteMatch& contexte) const {
    Joueur* meilleur = nullptr;
    float meilleurScore = -1.0f;

    for (Joueur* coequipier : contexte.coequipiers) {
        if (coequipier->id == joueur_.id) continue;
        float distance = Vector2::distance(joueur_.etatMatch.position, coequipier->etatMatch.position);
        if (distance > DISTANCE_PASSE_MAX_M) continue;

        float score = coequipier->perception.espaceLibreDevant * 0.6f + coequipier->tactique.soutien * 0.2f +
                      (DISTANCE_PASSE_MAX_M - distance) * 0.8f;
        if (score > meilleurScore) {
            meilleurScore = score;
            meilleur = coequipier;
        }
    }
    return meilleur;
}

void JoueurAgent::appliquerEffort(float dt, float intensite) {
    EtatMatch& etat = joueur_.etatMatch;
    float resistance = 1.0f - joueur_.physique.endurance / 150.0f;  // 0.33 (endurance 100) à 1.0 (endurance 0)
    etat.fatigue = std::clamp(etat.fatigue + dt * intensite * resistance * 10.0f, 0.0f, 100.0f);
    etat.energie = 100.0f - etat.fatigue;
}

void JoueurAgent::recuperer(float dt) {
    EtatMatch& etat = joueur_.etatMatch;
    float recuperation = joueur_.physique.endurance / 100.0f;
    etat.fatigue = std::clamp(etat.fatigue - dt * recuperation * 2.0f, 0.0f, 100.0f);
    etat.energie = 100.0f - etat.fatigue;
}
