# eurostar-snap-watch

Suivi continu des billets [Eurostar Snap](https://snap.eurostar.com/fr-fr) sur un trajet : ce qui est en vente maintenant, quand chaque créneau est sorti, quand il est parti et en combien de temps. Un mail à chaque nouvelle sortie, et une alerte dédiée pour la date qui vous intéresse.

**Tableau de bord : https://matrac73.github.io/eurostar-snap-watch/**

Tout tourne gratuitement dans GitHub Actions, sans ordinateur allumé.

## Ce que ça fait

Toutes les 15 minutes environ, un scan :

1. ouvre le calendrier Snap pour lire les dates en vente sur le trajet ;
2. ouvre la page de chaque date pour lire les créneaux (matin, après-midi) et les prix ;
3. compare avec le scan précédent et met à jour l'historique : créneau **sorti**, **prix modifié**, créneau **parti** ;
4. envoie les mails et publie les données du tableau de bord.

| Mail | Quand | À qui |
|---|---|---|
| Nouvelle sortie | un créneau ou une date apparaît (un mail par scan, avec ce qui est parti depuis le dernier mail et tout ce qui est en vente) | tous les destinataires |
| Billets partis | un créneau disparaît sans nouvelle sortie au même scan (même mail, titré « Certains billets ne sont plus disponibles. ») ; un créneau dont la date est passée ne compte pas | tous les destinataires |
| Votre départ (objet commençant par « Votre départ ») | le créneau de la date cible apparaît, avec un lien de réservation pré-rempli ; puis à chaque changement tant que la date n'est pas passée : prix modifié, créneau parti, créneau revenu, autre créneau du même jour en vente | tous les destinataires |
| Suivi en panne / reparti | 6 scans ratés de suite, puis au retour à la normale | le premier destinataire |

Rien n'est acheté ni réservé : Snap ne tient une place qu'une fois payée. Le lien du mail ouvre la page avec la date, le nombre d'adultes et le créneau déjà choisis.

## Lire les chiffres

- **Heure de sortie / de disparition** : c'est l'heure du scan qui a vu le changement. Le changement réel a eu lieu dans la « fenêtre » entre ce scan et le précédent (15 minutes, un peu plus au passage de relais entre deux exécutions).
- **Vitesse de vente** : le site ne publie pas le nombre de places. La vitesse est mesurée par la durée pendant laquelle un créneau reste en vente et par ses changements de prix.
- **« Avant le suivi »** : créneaux déjà en vente au tout premier scan, dont l'heure de sortie est inconnue. Leur durée est affichée avec « ≥ ».
- **Motif de disparition** : `vendu` ; `fermé la veille` quand le créneau disparaît la veille du voyage (Snap arrête la vente à ce moment-là, vendu ou non). Les dates passées ne sont pas listées.
- Les disponibilités sont celles pour le nombre d'adultes configuré (2 par défaut).

## Changer de date cible ou de trajet

Tout est dans [`settings.json`](settings.json), modifiable directement sur GitHub (crayon, puis « Commit ») :

```json
{
  "route": { "label": "Paris → Londres", "origin": "8727100", "destination": "7015400" },
  "adults": 2,
  "target": { "date": "2026-12-06", "slot": "morning" }
}
```

- `target.date` : la date qui déclenche l'alerte envoyée à tout le monde (`AAAA-MM-JJ`) ; `target.slot` : `morning` ou `afternoon`. Supprimer `target` pour ne garder que le suivi.
- `adults` : 1 à 4.
- `route` : codes de gare ci-dessous. Changer de trajet mélange deux historiques : repartir d'une branche `gh-pages` vide dans ce cas.

| Gare | Code |
|---|---|
| Paris Gare du Nord | `8727100` |
| Londres St Pancras | `7015400` |
| Bruxelles-Midi | `8814001` |
| Amsterdam Centraal | `8400058` |
| Rotterdam Centraal | `8400530` |
| Cologne Hbf | `8015458` |

Le changement est pris en compte au scan suivant.

## Réglages hors dépôt

Les adresses et le mot de passe du compte d'envoi ne sont jamais dans le dépôt : ce sont des secrets chiffrés (Settings → Secrets and variables → Actions).

| Secret | Contenu |
|---|---|
| `SMTP_USER` | adresse du compte d'envoi (Gmail) |
| `SMTP_PASS` | mot de passe d'application de ce compte |
| `MAIL_TO` | destinataires séparés par des virgules ; le premier reçoit en plus les mails techniques (premier scan, panne) |

Rythme : le planificateur de GitHub lance les workflows planifiés avec des heures de retard, donc une exécution reste active environ 5 h, scanne toutes les 15 minutes, puis lance elle-même la suivante. Le planning (`cron`) ne sert qu'à relancer la chaîne si elle casse. Un changement poussé sur `main` (réglages, code) est pris en compte au scan suivant.

Mettre en pause : onglet Actions → « Snap watch » → Disable workflow, puis annuler l'exécution en cours (Cancel run). Relancer : Enable workflow, puis « Run workflow ». Ce même bouton sert à envoyer seulement des mails d'exemple (case `test_mail`).

## Installer sa propre copie

1. Dupliquer le dépôt (public : les minutes Actions y sont gratuites).
2. Créer les trois secrets ci-dessus.
3. Créer une branche `gh-pages` vide et activer GitHub Pages dessus (Settings → Pages).
4. Adapter `settings.json` (dont `dashboardUrl`).

En local (Windows, macOS ou Linux, avec Node 20+ et Chrome) :

```bash
npm install
SMTP_USER=... SMTP_PASS=... MAIL_TO=... node track.mjs --visible
```

## Comment le site est lu

Le site refuse les appels directs à son API et les navigateurs sans fenêtre (protection anti-robots). Le script ne la contourne pas : il parcourt les pages publiques dans un Chrome normal, comme un visiteur, à faible fréquence (une dizaine de pages par scan). Usage personnel ; garder un intervalle raisonnable. Si Eurostar modifie ses pages, le scan passe en erreur et le mail d'alerte part : les sélecteurs sont dans `lib/scan.mjs`.

## Fichiers

- `track.mjs` : un scan complet (lecture, historique, mails, publication).
- `lib/scan.mjs` : lecture du site ; `lib/history.mjs` : historique des créneaux ; `lib/mail.mjs` : mails.
- `site/index.html` : tableau de bord, publié avec `data.json` sur la branche `gh-pages`.
- `.github/workflows/watch.yml` : planification.
