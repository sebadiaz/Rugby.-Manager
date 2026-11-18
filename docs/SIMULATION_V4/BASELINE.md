# BASELINE — moteur existant (RM4-G00)

Mesurée par `node server/v4/measure-baseline.js 30 --ecrire` (lecture seule, aucune modification du moteur).

## Paramètres

- SHA mesuré : `a7f22288acba69a488a45eac79b0ec70cb5f7057` (branche `claude/sharp-faraday-2c0k9h`) ; `origin/main` au moment de la mesure : `d10aa55112161f8cc9687348b6b0eddb4856a072`
- Graines 1..30, durée 4800 s, pas fixe dt = 0.1 s, `jouerJusquAuSifflet`, v22.23.4.
- Équipes par défaut du moteur, sans blessures configurées autrement que par défaut. Valeurs cumulées des deux équipes par match (possession : équipe A).

## Résultats

| Métrique | Moyenne | Écart-type | Min | Max |
|---|---:|---:|---:|---:|
| essais | 7 | 1.98 | 3 | 11 |
| points | 59.17 | 13.55 | 30 | 84 |
| passes | 410.67 | 43.8 | 319 | 505 |
| passesTentees | 415.1 | 44.16 | 327 | 512 |
| courses | 261.93 | 26.26 | 209 | 311 |
| metresGagnes | 1079.26 | 116.09 | 844.231 | 1395.231 |
| coupsDePied | 57.83 | 6.99 | 47 | 71 |
| plaquagesTentes | 337.57 | 36.64 | 260 | 410 |
| plaquagesReussis | 296.77 | 32.87 | 234 | 359 |
| rucks | 211.97 | 26.45 | 160 | 262 |
| melees | 17.87 | 3.5 | 12 | 26 |
| touches | 27.8 | 4.19 | 18 | 37 |
| mauls | 6.93 | 2.66 | 2 | 12 |
| penalitesConcedees | 24.6 | 4.98 | 16 | 34 |
| turnovers | 19.87 | 4.49 | 13 | 28 |
| enAvants | 13.13 | 2.81 | 8 | 19 |
| cartonsJaunes | 0.93 | 0.73 | 0 | 3 |
| tempsJeuEffectifMin | 34.32 | 2.63 | 29.09 | 38.457 |
| possessionA | 49.07 | 4.57 | 39 | 57 |
| essaisDuN15 | 0.4 | 0.61 | 0 | 2 |

## Données brutes

`docs/SIMULATION_V4/fixtures/baseline_30_graines.json` : une ligne par graine (`parGraine`) et 8 captures de positions des 30 joueurs (`captures`, phases RUCK, MELEE, TOUCHE, MAUL, COUP_ENVOI, PORTE, RUCK, MELEE).

## Limites

- Ce sont les statistiques du moteur tel qu'il est (placements par rôles, pas encore d'agents à buts) : elles servent de référence « avant » pour les tâches RM4-G01 et suivantes.
- Les fourchettes « réalistes » du dépôt (`server/simulate-batch.js`) restent des repères, pas des seuils : voir `docs/SIMULATION_V4/README.md`.
