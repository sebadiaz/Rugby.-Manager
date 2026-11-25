# BASELINE — moteur existant (RM4-G00)

Mesurée par `node server/v4/measure-baseline.js 30 --ecrire` (lecture seule, aucune modification du moteur).

## Paramètres

- SHA mesuré : `52c5c69e0b5b9364ed2d1c59d00696aef3ca6c62` (branche `claude/sharp-faraday-2c0k9h`) ; `origin/main` au moment de la mesure : `159b13ee0a802af17bbfbbc60b4d15fdb6037c3c`
- Graines 1..30, durée 4800 s, pas fixe dt = 0.1 s, `jouerJusquAuSifflet`, v22.23.4.
- Équipes par défaut du moteur, sans blessures configurées autrement que par défaut. Valeurs cumulées des deux équipes par match (possession : équipe A).

## Résultats

| Métrique | Moyenne | Écart-type | Min | Max |
|---|---:|---:|---:|---:|
| essais | 7.07 | 2.28 | 3 | 12 |
| points | 58.2 | 13.96 | 38 | 83 |
| passes | 423.57 | 37.41 | 333 | 493 |
| passesTentees | 427.3 | 37.71 | 335 | 497 |
| courses | 271.4 | 21.97 | 225 | 316 |
| metresGagnes | 1069.71 | 132.3 | 806.154 | 1399.64 |
| coupsDePied | 61.3 | 8.92 | 48 | 83 |
| plaquagesTentes | 352 | 31.72 | 282 | 410 |
| plaquagesReussis | 304.03 | 27.22 | 236 | 349 |
| rucks | 214.77 | 19.16 | 166 | 252 |
| melees | 17.63 | 3.2 | 8 | 23 |
| touches | 28.27 | 3.46 | 19 | 35 |
| mauls | 8.13 | 3.1 | 2 | 15 |
| penalitesConcedees | 23.63 | 3.56 | 17 | 35 |
| turnovers | 19.37 | 3.9 | 11 | 28 |
| enAvants | 14.23 | 2.86 | 7 | 21 |
| cartonsJaunes | 0.63 | 0.75 | 0 | 2 |
| tempsJeuEffectifMin | 34.74 | 2.27 | 29.072 | 38.473 |
| possessionA | 49.83 | 6.16 | 32 | 63 |
| essaisDuN15 | 0.23 | 0.42 | 0 | 1 |

## Données brutes

`docs/SIMULATION_V4/fixtures/baseline_30_graines.json` : une ligne par graine (`parGraine`) et 8 captures de positions des 30 joueurs (`captures`, phases RUCK, MELEE, TOUCHE, MAUL, COUP_ENVOI, PORTE, RUCK, MELEE).

## Limites

- Ce sont les statistiques du moteur tel qu'il est (placements par rôles, pas encore d'agents à buts) : elles servent de référence « avant » pour les tâches RM4-G01 et suivantes.
- Les fourchettes « réalistes » du dépôt (`server/simulate-batch.js`) restent des repères, pas des seuils : voir `docs/SIMULATION_V4/README.md`.
