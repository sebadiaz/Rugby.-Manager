// Temps de la carrière (Mode Club) — date réelle, progression jour par jour
// et graines déterministes.
//
// Jusqu'ici l'unité de temps du jeu était la « journée » de championnat : un
// simple entier de ronde, sans aucune date. Un clic résolvait d'un coup le
// monde, les autres paliers, le match espoirs, toute la ronde d'Équipe B et
// le match du joueur. Ce module introduit la couche manquante : une VRAIE
// date civile, et un calendrier où chaque rencontre a un jour précis.
//
// Choix structurants :
//
// 1. ARITHMÉTIQUE DE DATES PURE. Aucune utilisation de `Date` : une date est
//    un triplet {annee, mois, jour} et toute la logique passe par un numéro
//    de jour absolu (algorithme days_from_civil de Howard Hinnant). Aucun
//    fuseau horaire, aucune heure d'été, aucun « aujourd'hui » implicite —
//    donc entièrement reproductible et testable sans navigateur.
//
// 2. `journee` EST CONSERVÉ. Les finances, la périodicité des matchs espoirs,
//    l'historique et les messages en dépendent déjà. La date est une couche
//    ADDITIVE calculée par-dessus, jamais un remplacement : une sauvegarde
//    migrée retrouve exactement la même progression sportive.
//
// 3. DÉTERMINISME SANS COMPTEUR. Chaque jour tire sa propre graine de la
//    graine de la saison et du numéro de jour absolu (`grainePourJour`).
//    Même graine + même date = même résultat, en O(1), y compris après un
//    rechargement de page — sans avoir à persister un compteur de tirages
//    qu'il faudrait maintenir à chaque appel. `Math.random` n'est jamais
//    utilisé ici.
(function (global) {
  'use strict';

  // --- Arithmétique de dates civiles --------------------------------------
  // days_from_civil / civil_from_days (Howard Hinnant) : conversion exacte
  // entre une date grégorienne et un numéro de jour, années bissextiles
  // comprises, sans aucune dépendance.
  function jourAbsolu(date) {
    const a = date.annee - (date.mois <= 2 ? 1 : 0);
    const era = Math.floor((a >= 0 ? a : a - 399) / 400);
    const yoe = a - era * 400;
    const doy = Math.floor((153 * (date.mois + (date.mois > 2 ? -3 : 9)) + 2) / 5) + date.jour - 1;
    const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
    return era * 146097 + doe - 719468;
  }

  function dateDepuisJourAbsolu(n) {
    const z = n + 719468;
    const era = Math.floor((z >= 0 ? z : z - 146096) / 146097);
    const doe = z - era * 146097;
    const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
    const a = yoe + era * 400;
    const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
    const mp = Math.floor((5 * doy + 2) / 153);
    const jour = doy - Math.floor((153 * mp + 2) / 5) + 1;
    const mois = mp + (mp < 10 ? 3 : -9);
    return { annee: a + (mois <= 2 ? 1 : 0), mois, jour };
  }

  function ajouterJours(date, n) {
    return dateDepuisJourAbsolu(jourAbsolu(date) + n);
  }

  // Nombre de jours de `a` vers `b` (négatif si b précède a).
  function ecartJours(a, b) {
    return jourAbsolu(b) - jourAbsolu(a);
  }

  function comparerDates(a, b) {
    return jourAbsolu(a) - jourAbsolu(b);
  }

  // 0 = dimanche … 6 = samedi. Le 1er janvier 1970 était un jeudi (jour
  // absolu 0), d'où le décalage de 4.
  function jourSemaine(date) {
    const n = jourAbsolu(date);
    return ((n % 7) + 11) % 7;
  }

  const NOMS_JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const NOMS_JOURS_COURTS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  const NOMS_MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const NOMS_MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
    'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

  function formaterDateLongue(date) {
    return `${NOMS_JOURS[jourSemaine(date)]} ${date.jour} ${NOMS_MOIS[date.mois - 1]} ${date.annee}`;
  }
  function formaterDateCourte(date) {
    return `${NOMS_JOURS_COURTS[jourSemaine(date)]} ${date.jour} ${NOMS_MOIS_COURTS[date.mois - 1]}`;
  }
  // Forme stockée dans les rencontres : triable lexicographiquement, stable
  // en JSON, et lisible telle quelle dans une sauvegarde.
  function dateISO(date) {
    const mm = String(date.mois).padStart(2, '0');
    const jj = String(date.jour).padStart(2, '0');
    return `${date.annee}-${mm}-${jj}`;
  }
  function dateDepuisISO(iso) {
    if (!iso || typeof iso !== 'string') return null;
    const p = iso.split('-');
    if (p.length !== 3) return null;
    const d = { annee: Number(p[0]), mois: Number(p[1]), jour: Number(p[2]) };
    return Number.isFinite(d.annee) && Number.isFinite(d.mois) && Number.isFinite(d.jour) ? d : null;
  }

  // --- Calendrier sportif -------------------------------------------------
  // La saison sportive N se joue sur l'année civile ANNEE_BASE + N - 1 : une
  // carrière garde ainsi des dates qui avancent réellement d'année en année.
  const ANNEE_BASE = 2024;

  function anneeDeSaison(numeroSaison) {
    return ANNEE_BASE + (Math.max(1, numeroSaison || 1) - 1);
  }

  // Première journée : le premier samedi de septembre, comme un vrai début
  // de championnat.
  function premierSamediDeSeptembre(annee) {
    let d = { annee, mois: 9, jour: 1 };
    while (jourSemaine(d) !== 6) d = ajouterJours(d, 1);
    return d;
  }

  // Trois calendriers distincts dans la même semaine, comme un vrai club :
  // les espoirs jouent en semaine, l'équipe première le samedi, l'Équipe B
  // le lendemain. Le décalage est constant, donc entièrement dérivable de la
  // journée — aucune date à stocker deux fois.
  const DECALAGE_JOUR_MATCH = { pro: 0, b: 1, jeunes: -3 };

  function dateDeJournee(numeroSaison, journee, equipe) {
    const base = premierSamediDeSeptembre(anneeDeSaison(numeroSaison));
    const decalage = DECALAGE_JOUR_MATCH[equipe || 'pro'] || 0;
    return ajouterJours(base, (Math.max(1, journee) - 1) * 7 + decalage);
  }

  // La saison démarre trois semaines avant la première journée : une vraie
  // intersaison, où le manager peut préparer son effectif avant le premier
  // match (et où les tranches suivantes placeront le marché des transferts).
  const JOURS_AVANT_PREMIERE_JOURNEE = 21;

  function debutDeSaison(numeroSaison) {
    return ajouterJours(dateDeJournee(numeroSaison, 1, 'pro'), -JOURS_AVANT_PREMIERE_JOURNEE);
  }

  // --- Graines déterministes ---------------------------------------------
  // Une graine par JOUR, dérivée de la graine de la saison et du numéro de
  // jour absolu : rejouer la même journée donne le même résultat, y compris
  // après un rechargement de page, sans persister aucun compteur.
  function grainePourJour(graine, date, canal) {
    let h = (graine >>> 0) ^ 0x9e3779b9;
    h = Math.imul(h ^ jourAbsolu(date), 2654435761) >>> 0;
    h = Math.imul(h ^ ((canal || 0) + 0x85ebca6b), 2246822519) >>> 0;
    h ^= h >>> 13;
    return h >>> 0;
  }

  // --- État temporel de la saison ----------------------------------------
  // Rétrocompatible : une sauvegarde antérieure au calendrier daté n'a ni
  // `temps` ni `graine`. On les reconstitue à partir de ce qui existe déjà
  // (numéro de saison, journées réellement jouées) — jamais en repartant de
  // zéro, jamais en perdant la progression sportive.
  function assurerTemps(saison) {
    if (!saison.temps || typeof saison.temps !== 'object'
      || !Number.isFinite(saison.temps.annee) || !Number.isFinite(saison.temps.mois) || !Number.isFinite(saison.temps.jour)) {
      saison.temps = Object.assign(debutDeSaison(saison.numero || 1), { saisonNumero: saison.numero || 1 });
      // Une carrière déjà entamée reprend le lendemain de sa dernière
      // journée jouée : sa progression sportive est conservée telle quelle.
      const jouees = (saison.calendrier || []).filter((f) => f.joue).map((f) => f.journee);
      if (jouees.length) {
        const derniere = Math.max.apply(null, jouees);
        saison.temps = Object.assign(ajouterJours(dateDeJournee(saison.numero || 1, derniere, 'pro'), 1),
          { saisonNumero: saison.numero || 1 });
      }
    }
    if (saison.temps.saisonNumero == null) saison.temps.saisonNumero = saison.numero || 1;
    return saison.temps;
  }

  function dateCourante(saison) {
    const t = assurerTemps(saison);
    return { annee: t.annee, mois: t.mois, jour: t.jour };
  }

  function definirDateCourante(saison, date) {
    const t = assurerTemps(saison);
    t.annee = date.annee; t.mois = date.mois; t.jour = date.jour;
    return t;
  }

  // Repositionne le temps au début d'une nouvelle saison sportive — appelé
  // par avancerSaison, en même temps que le nouveau calendrier.
  function reinitialiserTempsPourSaison(saison, numeroSaison) {
    saison.temps = Object.assign(debutDeSaison(numeroSaison), { saisonNumero: numeroSaison });
    return saison.temps;
  }

  global.RMClub = Object.assign(global.RMClub || {}, {
    jourAbsolu, dateDepuisJourAbsolu, ajouterJours, ecartJours, comparerDates,
    jourSemaine, NOMS_JOURS, formaterDateLongue, formaterDateCourte, dateISO,
    dateDepuisISO, dateDeJournee, debutDeSaison, grainePourJour, assurerTemps,
    dateCourante, definirDateCourante, reinitialiserTempsPourSaison,
  });
})(window);
