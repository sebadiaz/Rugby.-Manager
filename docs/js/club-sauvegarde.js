// Sauvegarde et migration (Mode Club) — domaine extrait de docs/js/club.js
// (TODO_AUDIT.md P2-10, tranche 15) : persistance localStorage, validation de
// schéma, migrations versionnées, copie de secours + avertissement en cas de
// sauvegarde irrécupérable (cf. audit P0-2), chargement/effacement.
// Comportement strictement inchangé.
//
// `resynchroniserCompteurs` (audit P0-1) est délibérément RESTÉE dans
// club.js : elle mute directement compteurJoueurId/compteurMessageId/
// compteurId, trois variables de module qui vivent dans la fermeture de
// club.js (nécessaires à genererProchainIdJoueur, genererProchainIdClub et
// ajouterMessage, restés là) — les en extraire aurait exigé 3 nouvelles
// fonctions dédiées de mutation pour un seul appelant (chargerSaison,
// ci-dessous), plus de surface que de gain. `chargerSaison` l'appelle donc
// via `global.RMClub.resynchroniserCompteurs(...)`.
(function (global) {
  'use strict';

  const CLE_CLUB = 'rugbyManager.club.v1';
  const CLE_SECOURS = 'rugbyManager.club.secours.v1';
  const CLE_AVERTISSEMENT = 'rugbyManager.club.avertissement.v1';

  // Retourne true/false (au lieu d'avaler silencieusement l'erreur) : permet
  // à l'UI de prévenir le joueur UNE FOIS si le stockage est indisponible
  // (navigation privée, quota dépassé) au lieu de perdre sa progression sans
  // aucun signal — cf. clubUI.js.
  function sauvegarderSaison(saison) {
    try { localStorage.setItem(CLE_CLUB, JSON.stringify(saison)); return true; } catch (e) { return false; }
  }

  // Extrait le suffixe numérique d'un id préfixé ("j42" -> 42) — 0 si l'id
  // n'a pas ce préfixe ou n'a pas de suffixe numérique exploitable.
  function idNumerique(id, prefixe) {
    if (typeof id !== 'string' || id.slice(0, prefixe.length) !== prefixe) return 0;
    const n = Number(id.slice(prefixe.length));
    return Number.isFinite(n) ? n : 0;
  }

  // Audit P0-2 (TODO_AUDIT.md) : avant ce correctif, une sauvegarde dont la
  // version ne correspondait plus à VERSION_SAUVEGARDE était silencieusement
  // traitée comme "aucune carrière" — aucun message, aucune sauvegarde de
  // secours. Le joueur, ne voyant "rien", créait alors une nouvelle carrière
  // qui écrasait (même clé localStorage) l'ancienne, PERTE IRRÉCUPÉRABLE
  // démontrée avec une vraie carrière de plusieurs saisons.
  //
  // Registre de migrations versionnées : clé = version de DÉPART, valeur =
  // fonction qui transforme une sauvegarde de cette version vers la
  // suivante.
  const MIGRATIONS = {
    // 7 → 8 : échelle de l'économie du club (G3). Le sponsor est tiré UNE
    // SEULE FOIS à la création et stocké ; une carrière déjà commencée
    // garderait donc son revenu à l'ancienne échelle et resterait riche alors
    // que la billetterie, elle, est recalculée à chaque match. On convertit
    // donc le revenu stocké avec le même rapport que le nouveau barème
    // (~28 → ~16 k€/match au niveau de départ). Le partenaire lui-même, son
    // nom, le budget, l'effectif et les résultats ne sont pas touchés.
    7: (saison) => {
      const c = saison.clubJoueur;
      if (c && c.sponsor && typeof c.sponsor.revenuParMatch === 'number') {
        c.sponsor.revenuParMatch = Math.max(1, Math.round(c.sponsor.revenuParMatch * 0.57));
      }
      // Les installations existent déjà (migration 6 → 7) ; elles ont
      // désormais un coût d'exploitation, lu à chaque journée depuis les
      // niveaux en place. Rien à écrire ici.
      saison.version = 8;
      return saison;
    },
    // 6 → 7 : infrastructures du club (P1-44). Une sauvegarde antérieure n'a
    // aucune structure ; elle démarre simplement au niveau 1 partout, ce qui
    // reproduit EXACTEMENT son comportement d'avant (tous les facteurs valent
    // 1 au niveau 1). Rien d'autre n'est touché : ni budget, ni effectif, ni
    // résultats.
    6: (saison) => {
      if (global.RMClub.assurerInfrastructures) global.RMClub.assurerInfrastructures(saison);
      if (saison.clubJoueur && saison.clubJoueur.chantier === undefined) saison.clubJoueur.chantier = null;
      // La boucle de migration s'appuie sur ce numéro pour avancer : l'oublier
      // fait tourner la migration à vide jusqu'au garde-fou, et la sauvegarde
      // est alors rejetée comme irrécupérable.
      saison.version = 7;
      return saison;
    },
    // 2 → 3 : introduction du temps calendaire. Une sauvegarde v2 n'a ni
    // date courante, ni graine de saison, ni date sur ses rencontres — mais
    // elle a tout ce qu'il faut pour les reconstituer SANS PERTE : son
    // numéro de saison donne l'année sportive, et ses journées déjà jouées
    // donnent le point exact où reprendre. La progression sportive
    // (classement, résultats, effectif, finances) n'est jamais touchée.
    2: (saison) => {
      const RMClub = global.RMClub;
      // Graine de saison : dérivée de données STABLES de la sauvegarde
      // (identifiant et nom du club), pas d'un tirage aléatoire — deux
      // chargements de la même sauvegarde donnent ainsi la même graine, donc
      // la même suite d'événements.
      if (!Number.isFinite(saison.graine)) {
        const source = String((saison.clubJoueur && saison.clubJoueur.id) || '') +
          '|' + String((saison.clubJoueur && saison.clubJoueur.nom) || '') +
          '|' + String(saison.numero || 1);
        let h = 0x811c9dc5;
        for (let i = 0; i < source.length; i++) {
          h ^= source.charCodeAt(i);
          h = Math.imul(h, 0x01000193) >>> 0;
        }
        saison.graine = h >>> 0;
      }
      // Dates réelles sur chaque rencontre (championnat + Équipe B), dérivées
      // de leur journée : le calendrier sportif reste rigoureusement le même.
      RMClub.daterCalendrier(saison);
      // Date courante : reprise au lendemain de la dernière journée jouée
      // (ou à l'intersaison si la carrière n'a pas encore commencé).
      RMClub.assurerTemps(saison);
      saison.version = 3;
      return saison;
    },
    // 3 → 4 : le temps s'écoule désormais jour par jour, donc les durées
    // exprimées en « journées de championnat » deviennent des JOURS. Une
    // journée valait une semaine (cf. club-temps.js, une journée par
    // semaine) : les compteurs sont convertis à l'identique, sans jamais
    // allonger ni raccourcir une indisponibilité déjà en cours.
    // 4 → 5 : Centre médical 2.0 (TODO_AUDIT.md P1-40). Une sauvegarde v4
    // ne connaît qu'un entier `blessureJournees` par joueur. On ne peut pas
    // inventer rétroactivement le type et la zone d'une blessure : on crée
    // un dossier honnête, générique, dont la SEULE donnée certaine — le
    // nombre de jours restants — est rigoureusement préservée. Aucun joueur
    // n'est soigné ni blessé par la migration.
    4: (saison) => {
      const RMClub = global.RMClub;
      const groupes = [
        saison.clubJoueur && saison.clubJoueur.effectif,
        saison.clubJoueur && saison.clubJoueur.jeunes,
      ];
      for (const a of saison.adversaires || []) groupes.push(a.effectif, a.groupe, a.banc);
      for (const groupe of groupes) {
        if (!Array.isArray(groupe)) continue;
        for (const j of groupe) { if (j && typeof j === 'object') RMClub.migrerJoueurV4(j); }
      }
      saison.version = 5;
      return saison;
    },

    // 5 → 6 : carrière du manager (TODO_AUDIT.md P1-42). Une sauvegarde v5
    // n'a aucun profil : le joueur était collé à son club. On en crée un,
    // rattaché au club actuellement dirigé, en reprenant le nombre de saisons
    // DÉJÀ jouées pour ne pas faire passer un vétéran pour un débutant.
    // Rien d'autre n'est touché : club, joueurs, calendriers, finances et
    // historiques restent strictement identiques.
    5: (saison) => {
      global.RMClub.assurerManager(saison);
      saison.version = 6;
      return saison;
    },

    3: (saison) => {
      const JOURS_PAR_JOURNEE = 7;
      const convertir = (effectif) => {
        for (const j of effectif || []) {
          if (j.blessureJournees > 0) j.blessureJournees *= JOURS_PAR_JOURNEE;
          if (j.pret && j.pret.dureeRestante > 0) j.pret.dureeRestante *= JOURS_PAR_JOURNEE;
        }
      };
      if (saison.clubJoueur) {
        convertir(saison.clubJoueur.effectif);
        convertir(saison.clubJoueur.jeunes);
      }
      saison.version = 4;
      return saison;
    },
  };

  // Validation minimale du schéma : uniquement les champs structurels SANS
  // LESQUELS le jeu ne peut pas fonctionner (le moteur a besoin d'un
  // effectif, d'un calendrier, d'un classement). Ne valide pas chaque champ
  // optionnel un par un : ceux-là ont déjà leur propre valeur par défaut
  // défensive disséminée dans le code (cf. assurerCentreFormation,
  // assurerCompetitionB, palierPyramide dans avancerSaison...).
  function saisonEstValide(saison) {
    return !!(saison && typeof saison === 'object'
      && saison.clubJoueur && typeof saison.clubJoueur === 'object'
      && Array.isArray(saison.clubJoueur.effectif) && saison.clubJoueur.effectif.length > 0
      && Array.isArray(saison.adversaires)
      && Array.isArray(saison.calendrier)
      && saison.classement && typeof saison.classement === 'object');
  }

  // Applique les migrations disponibles jusqu'à VERSION_SAUVEGARDE.
  // { ok:true, saison } si une version valide et à jour est atteinte,
  // { ok:false, raison } si la sauvegarde est irrécupérable en l'état
  // (version sans migration connue, boucle anormale, ou schéma invalide
  // même après migration) — jamais un plantage, jamais un silence.
  function migrerSaison(saisonBrute) {
    const VERSION_SAUVEGARDE = global.RMClub.VERSION_SAUVEGARDE;
    if (!saisonBrute || typeof saisonBrute !== 'object' || typeof saisonBrute.version !== 'number') {
      return { ok: false, raison: 'schema_invalide' };
    }
    let saison = saisonBrute;
    let garde = 0;
    while (saison.version < VERSION_SAUVEGARDE) {
      const migrer = MIGRATIONS[saison.version];
      if (!migrer) return { ok: false, raison: 'version_sans_migration', version: saison.version };
      saison = migrer(saison);
      if (++garde > 50) return { ok: false, raison: 'boucle_migration' }; // garde-fou, ne devrait jamais arriver
    }
    if (saison.version !== VERSION_SAUVEGARDE) return { ok: false, raison: 'version_incoherente' };
    if (!saisonEstValide(saison)) return { ok: false, raison: 'schema_invalide' };
    return { ok: true, saison };
  }

  // Sauvegarde de secours : CLÉ DISTINCTE de CLE_CLUB, jamais touchée par
  // sauvegarderSaison/nouvelleSaison — une carrière créée ensuite n'écrase
  // donc jamais ce secours. + un avertissement qu'affiche l'UI une seule
  // fois (cf. clubUI.js) plutôt que de laisser le joueur croire qu'il n'a
  // simplement jamais eu de carrière.
  function conserverSecours(brut, raison) {
    try {
      localStorage.setItem(CLE_SECOURS, brut);
      localStorage.setItem(CLE_AVERTISSEMENT, JSON.stringify({ raison, quand: Date.now() }));
    } catch (e) { /* stockage indisponible : rien de plus à faire */ }
  }
  function consulterAvertissementChargement() {
    try {
      const brut = localStorage.getItem(CLE_AVERTISSEMENT);
      return brut ? JSON.parse(brut) : null;
    } catch (e) { return null; }
  }
  function effacerAvertissementChargement() {
    try { localStorage.removeItem(CLE_AVERTISSEMENT); } catch (e) { /* ignore */ }
  }

  function chargerSaison() {
    try {
      const brut = localStorage.getItem(CLE_CLUB);
      if (!brut) return null; // pas de sauvegarde : cas normal (1re visite), rien à signaler
      let saisonBrute;
      try {
        saisonBrute = JSON.parse(brut);
      } catch (e) {
        conserverSecours(brut, 'json_invalide');
        return null;
      }
      const resultat = migrerSaison(saisonBrute);
      if (!resultat.ok) {
        conserverSecours(brut, resultat.raison);
        return null;
      }
      global.RMClub.resynchroniserCompteurs(resultat.saison);
      return resultat.saison;
    } catch (e) { return null; }
  }
  function effacerSaison() {
    try { localStorage.removeItem(CLE_CLUB); } catch (e) { /* ignore */ }
  }

  global.RMClub = Object.assign(global.RMClub || {}, {
    sauvegarderSaison, idNumerique, saisonEstValide, migrerSaison,
    consulterAvertissementChargement, effacerAvertissementChargement,
    chargerSaison, effacerSaison,
  });
})(window);
