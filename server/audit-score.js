// Recomposition du score d'une équipe à partir des statistiques du moteur (loi 8 : essai 5, transformation 2, pénalité 3, drop 3).
// `stats.essais` compte AUSSI les essais de pénalité (7 points, sans transformation) : ils valent 5 + 2 de supplément.
function recomposerScore(st) {
  return 5 * st.essais + 2 * (st.essaisPenalite || 0) + 2 * st.transformationsReussies + 3 * st.penalitesButReussies + 3 * st.dropsReussis;
}
module.exports = { recomposerScore };
