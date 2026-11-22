# BioMaint IA — Version web (installable)

Application web installable (PWA) : elle fonctionne dans le navigateur, s'installe sur l'écran d'accueil (Android, iPhone, PC) et marche **hors ligne** une fois chargée.
Elle contient les mêmes fonctions que l'APK : équipements, interventions, rapports PDF, profil, manuels IA, notifications, sauvegarde.

---

## 1. Contenu du dossier

```
index.html            page principale
sw.js                 service worker (hors ligne + mises à jour)  ← contient VERSION
manifest.webmanifest  nom, icônes et couleurs de l'application installée
about.json            "À propos" + numéro de version              ← contient version
renderer.js, bridge-android.js, web-extra.js, intro.js, styles.css
jspdf.umd.min.js, pdf.min.js, pdf.worker.min.js
icons/  assets/       icônes et images de l'intro
```
**Ne renomme et ne déplace aucun fichier** : l'application cherche chacun à son emplacement exact.

---

## 2. Héberger le site (HTTPS obligatoire)

Le site doit être en **HTTPS** : sans cela, le code d'accès, l'installation et le mode hors ligne ne fonctionnent pas. Les 3 solutions ci-dessous sont gratuites et en HTTPS.

### Option A — GitHub Pages (recommandée, tu as déjà un compte)
1. Sur GitHub : **New repository** → nom `biomaint-web` → **Public** → Create.
2. **Add file › Upload files** : glisse **tout le contenu** de ce dossier (fichiers **et** dossiers `icons` et `assets`) → **Commit changes**.
3. **Settings › Pages** → *Branch* : `main`, dossier `/ (root)` → **Save**.
4. Après 1 à 2 minutes, le site est disponible à :
   `https://dr-kgoule.github.io/biomaint-web/`

### Option B — Netlify (le plus rapide)
1. Va sur `app.netlify.com/drop`.
2. Glisse le dossier entier dans la page. Tu obtiens une adresse en `.netlify.app` (modifiable dans *Site settings*).

### Option C — Cloudflare Pages
1. *Workers & Pages › Create › Pages › Upload assets* → glisse le dossier.

> Un hébergement classique (cPanel, nom de domaine à toi) convient aussi, à condition d'activer le HTTPS (certificat gratuit « Let's Encrypt »).

---

## 3. Comment tes amis l'installent

**Android (Chrome)** : ouvrir le lien → un bandeau « Installer » apparaît (ou menu ⋮ › *Installer l'application*).
**iPhone / iPad (Safari uniquement)** : ouvrir le lien → bouton **Partager** (carré avec flèche) › **Sur l'écran d'accueil**.
**PC (Chrome / Edge)** : icône d'installation à droite de la barre d'adresse.

Premier lancement : créer son code d'accès, puis renseigner son profil (nom, prénom, structure).
Pour l'IA des manuels : chacun ajoute **sa propre clé API** dans Réglages (Gemini a un niveau gratuit).

---

## 4. Publier une mise à jour du site

1. Modifie les fichiers voulus.
2. Augmente la version à **2 endroits** (même numéro) :
   - `about.json` → `"version": "1.2.6"`
   - `sw.js` → `const VERSION = "1.2.6";`
3. Remplace les fichiers sur ton hébergement (GitHub : *Add file › Upload files*, ou modifie le fichier directement).
4. C'est tout : au prochain lancement avec internet, chaque téléphone télécharge la nouvelle version en arrière-plan et affiche un bandeau **« Nouvelle version installée — Recharger »**. Le bouton *Réglages › Mises à jour › Vérifier* force la vérification.

> **Si tu oublies d'augmenter `VERSION` dans `sw.js`, les utilisateurs gardent l'ancienne version en cache.** C'est l'erreur la plus fréquente.
> Si tu ajoutes un fichier (image, script…), ajoute aussi son nom dans la liste `CORE` de `sw.js` pour qu'il fonctionne hors ligne.

---

## 5. Limites de la version web (à connaître)

| Sujet | Version web | APK Android |
|---|---|---|
| Rappels de maintenance | Affichés **quand l'app est ouverte** | Programmés, même app fermée |
| Notifications | À activer dans Réglages › Application web (sur iPhone : app installée, iOS 16.4+) | Automatiques |
| Données | Stockées dans le navigateur de l'appareil | Stockées dans l'app |
| Mise à jour | Automatique (bandeau « Recharger ») | Téléchargement d'un nouvel APK |
| Fichiers PDF | Téléchargés (iPhone : onglet de prévisualisation puis Partager) | Menu Partager Android |

Conseils :
- **Les données restent sur l'appareil.** Sur iPhone, ne pas effacer les données du site Safari. Faire une sauvegarde régulière (Réglages › Sauvegarde).
- Le fichier de sauvegarde est **identique** entre l'APK et la version web : on peut passer de l'un à l'autre via Sauvegarder / Restaurer.
- Sur iPhone, ouvrir l'app **installée sur l'écran d'accueil** (et pas dans Safari) : le stockage y est plus durable.

---

## 6. Personnaliser

- **Appareils de l'intro** : liste `MACHINES` en haut de `intro.js` (marque, nom, type, image). Image au format `.webp` dans `assets/`, puis ajouter son nom dans `CORE` de `sw.js`.
- **« À propos »** : `about.json` (nom, rôle, texte).
- **Couleurs / icône** : `manifest.webmanifest` et dossier `icons/`.

---

## 7. Problèmes fréquents

| Symptôme | Cause / solution |
|---|---|
| Le code d'accès ne marche pas / pas d'installation | Le site n'est pas en HTTPS |
| Pas de bouton « Installer » | Android : utiliser Chrome. iPhone : utiliser Safari, puis Partager |
| L'ancienne version s'affiche encore | `VERSION` de `sw.js` non augmentée, ou pas encore rechargé |
| Image manquante dans l'intro | Nom ou emplacement du fichier changé dans `assets/` |
| Pas de notifications | Les activer dans Réglages › Application web ; autoriser aussi dans les réglages du téléphone |
