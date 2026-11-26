# BASELINE — moteur existant (RM4-G00)

Mesurée par `node server/v4/measure-baseline.js 30 --ecrire` (lecture seule, aucune modification du moteur).

## Paramètres

- SHA mesuré : `54a80d868d8d82a4a72e39dbe41075b8218a71ea` (branche `claude/sharp-faraday-2c0k9h`) ; `origin/main` au moment de la mesure : `159b13ee0a802af17bbfbbc60b4d15fdb6037c3c`
- Graines 1..30, durée 4800 s, pas fixe dt = 0.1 s, `jouerJusquAuSifflet`, v22.23.4.
- Équipes par défaut du moteur, sans blessures configurées autrement que par défaut. Valeurs cumulées des deux équipes par match (possession : équipe A).

## Résultats

| Métrique | Moyenne | Écart-type | Min | Max |
|---|---:|---:|---:|---:|
| essais | 7.2 | 2.06 | 2 | 12 |
| points | 59.73 | 14.38 | 28 | 85 |
| passes | 419.77 | 47.17 | 328 | 514 |
| passesTentees | 423.67 | 47.27 | 332 | 520 |
| courses | 273.6 | 31.76 | 222 | 345 |
| metresGagnes | 1099.44 | 118.22 | 862.207 | 1308.867 |
| coupsDePied | 60.3 | 8.54 | 43 | 74 |
| plaquagesTentes | 353.77 | 45.33 | 281 | 467 |
| plaquagesReussis | 305.07 | 37.08 | 243 | 395 |
| rucks | 217.3 | 27.08 | 168 | 279 |
| melees | 17.83 | 3.47 | 12 | 24 |
| touches | 26.83 | 4.3 | 18 | 39 |
| mauls | 7 | 2.77 | 3 | 15 |
| penalitesConcedees | 23.17 | 4.07 | 17 | 32 |
| turnovers | 18.4 | 4.53 | 10 | 29 |
| enAvants | 14.2 | 3.45 | 8 | 21 |
| cartonsJaunes | 0.6 | 0.88 | 0 | 4 |
| tempsJeuEffectifMin | 34.71 | 3.2 | 27.665 | 42.183 |
| possessionA | 51.1 | 5.13 | 43 | 64 |
| essaisDuN15 | 0.4 | 0.61 | 0 | 2 |

## Données brutes

`docs/SIMULATION_V4/fixtures/baseline_30_graines.json` : une ligne par graine (`parGraine`) et 8 captures de positions des 30 joueurs (`captures`, phases RUCK, MELEE, TOUCHE, MAUL, COUP_ENVOI, PORTE, RUCK, MELEE).

## Limites

- Ce sont les statistiques du moteur tel qu'il est (placements par rôles, pas encore d'agents à buts) : elles servent de référence « avant » pour les tâches RM4-G01 et suivantes.
- Les fourchettes « réalistes » du dépôt (`server/simulate-batch.js`) restent des repères, pas des seuils : voir `docs/SIMULATION_V4/README.md`.
