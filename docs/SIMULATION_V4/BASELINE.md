# BASELINE — moteur existant (RM4-G00)

Mesurée par `node server/v4/measure-baseline.js 30 --ecrire` (lecture seule, aucune modification du moteur).

## Paramètres

- SHA mesuré : `7d815e2e2f6a335a95a2328bdd7d004e018b319e` (branche `claude/sharp-faraday-2c0k9h`) ; `origin/main` au moment de la mesure : `2c110568049efb28f28b83a238a42d0ec43b9271`
- Graines 1..30, durée 4800 s, pas fixe dt = 0.1 s, `jouerJusquAuSifflet`, v22.23.4.
- Équipes par défaut du moteur, sans blessures configurées autrement que par défaut. Valeurs cumulées des deux équipes par match (possession : équipe A).

## Résultats

| Métrique | Moyenne | Écart-type | Min | Max |
|---|---:|---:|---:|---:|
| essais | 8.13 | 1.93 | 4 | 12 |
| points | 64.2 | 12.03 | 46 | 92 |
| passes | 410.6 | 37.41 | 332 | 509 |
| passesTentees | 414.7 | 37.14 | 334 | 511 |
| courses | 264.1 | 24.02 | 214 | 315 |
| metresGagnes | 1069.78 | 136.33 | 853.025 | 1417.26 |
| coupsDePied | 58.77 | 6.3 | 47 | 72 |
| plaquagesTentes | 342.53 | 31.81 | 267 | 414 |
| plaquagesReussis | 296.83 | 28.58 | 226 | 356 |
| rucks | 210.83 | 20.86 | 169 | 262 |
| melees | 17.33 | 3.86 | 10 | 26 |
| touches | 26.23 | 5.11 | 17 | 38 |
| mauls | 6.57 | 2.8 | 3 | 13 |
| penalitesConcedees | 21.4 | 4.6 | 12 | 28 |
| turnovers | 20 | 4.3 | 9 | 28 |
| enAvants | 13.73 | 3.03 | 7 | 20 |
| cartonsJaunes | 0.7 | 0.59 | 0 | 2 |
| tempsJeuEffectifMin | 34.55 | 2.55 | 30.878 | 39.693 |
| possessionA | 47.97 | 4.85 | 37 | 56 |
| essaisDuN15 | 0.4 | 0.55 | 0 | 2 |

## Données brutes

`docs/SIMULATION_V4/fixtures/baseline_30_graines.json` : une ligne par graine (`parGraine`) et 8 captures de positions des 30 joueurs (`captures`, phases RUCK, MELEE, TOUCHE, MAUL, COUP_ENVOI, PORTE, RUCK, MELEE).

## Limites

- Ce sont les statistiques du moteur tel qu'il est (placements par rôles, pas encore d'agents à buts) : elles servent de référence « avant » pour les tâches RM4-G01 et suivantes.
- Les fourchettes « réalistes » du dépôt (`server/simulate-batch.js`) restent des repères, pas des seuils : voir `docs/SIMULATION_V4/README.md`.
