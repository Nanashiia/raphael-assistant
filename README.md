# Raphael Assistant

Assistant IA de bureau sous forme de petite bulle en superposition (overlay), toujours visible par-dessus tes autres fenetres, avec une personnalite d'ange de la sagesse hautain mais serviable. Fonctionne sur **Windows** et **macOS**, propulse par l'API Claude d'Anthropic.

Fonctionnalites :

- Bulle flottante deplacable n'importe ou sur l'ecran, qui se replie/depiane en un clic, avec un embleme original anime (oeil de sagesse ailes, halo, anneaux tournants).
- **Tu peux lui parler directement** : clique sur le micro, pose ta question a voix haute, elle est transcrite puis envoyee automatiquement des que tu t'arretes de parler.
- **Raphael te repond a voix haute** (synthese vocale), avec le choix de la voix, de la langue, de la vitesse, de la tonalite et du volume dans les Parametres.
- L'avatar reagit visuellement a ce qui se passe : il "ecoute" quand le micro capte ta voix, "reflechit" en attendant la reponse de Claude, et sa bouche s'anime pendant qu'il parle.
- Peut etre masquee (icone dans la zone de notification / tray) et rappelee via un raccourci clavier.
- Fenetre de parametres dediee : cle API, choix du modele Claude, personnalite (prompt systeme modifiable), voix et reconnaissance vocale, taille, opacite, raccourci clavier, lancement automatique, reinitialisation de la position, effacement de l'historique.
- Reste au premier plan, sur tous les bureaux virtuels.

> **A propos de l'apparence** : l'avatar est un embleme original (dessine pour ce projet), inspire du theme "ange de la sagesse" â ce n'est pas une reproduction du design du personnage Raphael de l'anime, qui reste la propriete de ses ayants droit. Seuls le nom, le ton de personnalite et le style de reponse s'en inspirent, via le prompt systeme configurable dans les Parametres.

---

## 1. Ce dont tu as besoin avant de commencer

1. **Node.js 20 ou plus recent** installe sur ta machine (uniquement necessaire si tu veux compiler toi-meme en local â pas necessaire si tu utilises GitHub Actions, voir section 3).
2. Un **compte GitHub** (gratuit) si tu veux que la compilation se fasse automatiquement dans le cloud sans rien installer.
3. Une **cle API Anthropic** : cree-la sur https://console.anthropic.com/settings/keys (rubrique "API Keys"). Cette cle est payante a l'usage (facturee par Anthropic selon le nombre de mots echanges) â elle n'est pas fournie avec ce projet. Tu la colles ensuite dans la fenetre "Parametres" de l'application, elle reste stockee uniquement sur ton ordinateur (fichier local, jamais envoyee ailleurs qu'a l'API Anthropic).

---

## 2. Compiler automatiquement avec GitHub Actions (recommande, gratuit)

C'est la methode la plus simple : GitHub compile pour toi la version Windows (.exe) ET la version Mac (.dmg) dans le cloud, sans que tu aies besoin d'un Mac ni d'installer quoi que ce soit.

1. Cree un nouveau depot GitHub (vide), par exemple `raphael-assistant`.
2. Mets tout le contenu de ce dossier dedans et pousse-le :
   ```
   cd raphael-assistant
   git init
   git add .
   git commit -m "Premiere version de Raphael Assistant"
   git branch -M main
   git remote add origin https://github.com/<ton-compte>/raphael-assistant.git
   git push -u origin main
   ```
3. Sur GitHub, va dans l'onglet **Actions** de ton depot. Le workflow "Build Raphael Assistant" y apparait.
4. Clique sur **Run workflow** (bouton a droite) pour lancer une compilation manuelle, ou pousse un tag (`git tag v1.0.0 && git push origin v1.0.0`) pour la declencher automatiquement.
5. Attends la fin (quelques minutes). Ouvre le run termine, descends jusqu'a **Artifacts** : tu y trouveras deux archives a telecharger, une pour Windows (`raphael-assistant-windows-latest`) contenant le `.exe`, une pour macOS (`raphael-assistant-macos-latest`) contenant le `.dmg`.
6. Telecharge, decompresse, et installe sur la machine de ton choix.

Tu peux relancer ce workflow a chaque fois que tu modifies le code (nouvelle personnalite par defaut, nouvelle fonctionnalite, etc.).

---

## 3. Compiler toi-meme en local (alternative)

Si tu preferes ne pas passer par GitHub :

```
npm install
npm run dist:win     # sur Windows -> produit dist/Raphael Assistant-Setup-1.0.0.exe
npm run dist:mac     # sur macOS   -> produit dist/Raphael Assistant-x.x.x.dmg
```

Note : pour produire un `.exe`, `electron-builder` doit tourner sur Windows (ou dans un environnement Windows) ; pour produire un `.dmg`, il doit tourner sur macOS. C'est pour cela que la methode GitHub Actions (section 2) est la plus pratique : elle fait tourner les deux systemes pour toi.

Pour tester l'application sans la compiler (mode developpement) :

```
npm install
npm start
```

---

## 4. A propos des avertissements "editeur inconnu"

Ce projet n'est pas signe numeriquement (une signature de code coute un abonnement annuel aupres d'une autorite de certification). Sur ta propre machine, tu peux donc voir un avertissement au premier lancement :

- **Windows (SmartScreen)** : un ecran bleu "Windows a protege votre ordinateur" apparait. Clique sur **Informations complementaires**, puis sur **Executer quand meme**.
- **macOS (Gatekeeper)** : macOS peut refuser d'ouvrir l'app en disant qu'elle vient d'un "developpeur non identifie". Fais un **clic droit (ou Ctrl+clic) sur l'application > Ouvrir**, puis confirme dans la boite de dialogue. Si macOS bloque completement l'ouverture, ouvre le Terminal et tape :
  ```
  xattr -cr "/Applications/Raphael Assistant.app"
  ```
  puis relance l'application normalement.

Ces avertissements sont normaux pour une application non signee et n'empechent pas l'app de fonctionner correctement.

---

## 5. Utilisation

- Au premier lancement, une petite bulle doree apparait en haut a droite de l'ecran.
- **Clique sur la bulle** pour ouvrir la fenetre de discussion et poser une question.
- **Glisse la bulle** (ou l'en-tete de la fenetre de discussion) pour la deplacer n'importe ou sur l'ecran ; sa position est memorisee.
- **Icone dans la zone de notification (tray)** : clic pour afficher/masquer, clic droit pour acceder aux Parametres, effacer l'historique, reinitialiser la position, ou quitter.
- **Raccourci clavier** (par defaut `Ctrl+Shift+R` / `Cmd+Shift+R` sur Mac) : affiche ou masque la bulle instantanement, meme si elle est cachee.
- **Bouton micro** (a cote de la zone de saisie) : parle, et ta question est transcrite puis envoyee automatiquement des que tu t'arretes ; l'avatar affiche un anneau bleu pendant qu'il t'ecoute. Necessite d'autoriser le microphone au premier lancement (et sur macOS, l'autorisation systeme "Microphone" dans Reglages > Confidentialite).
- **Bouton haut-parleur** (en-tete de la fenetre de discussion) : coupe ou reactive instantanement la reponse vocale de Raphael.
- **Parametres** (roue dentee dans la fenetre de discussion, ou menu du tray) : cle API, modele Claude utilise, personnalite (le prompt systeme qui donne son style a Raphael), voix (activation, choix de la voix, langue, vitesse, tonalite, volume, bouton "Tester la voix"), taille de la bulle, opacite, raccourci clavier, lancement automatique au demarrage, reinitialisation de la position, effacement de la memoire de conversation.

Note sur la voix : elle utilise les voix deja installees sur ton systeme (Windows/macOS) ainsi que la reconnaissance vocale du navigateur integre a l'application â aucune cle ou service externe supplementaire n'est necessaire, et rien n'est envoye ailleurs qu'a l'API Anthropic pour le texte de la conversation. La disponibilite et la qualite des voix dependent de celles installees sur ta machine.

---

## 6. Structure du projet

```
raphael-assistant/
âââ main.js                  Processus principal Electron (fenetres, tray, appel API Claude)
âââ preload.js                Pont securise entre l'interface et le processus principal
âââ renderer/
â   âââ overlay.html/css/js   La bulle flottante + fenetre de discussion
â   âââ settings.html/css/js  La fenetre de parametres
âââ assets/icon.svg           Icone source de l'application (embleme original "oeil de sagesse")
âââ scripts/generate-icons.js Genere .ico/.icns/.png a partir de icon.svg (auto, apres npm install)
âââ .github/workflows/build.yml  Compilation automatique via GitHub Actions
âââ package.json               Configuration electron-builder (Windows/macOS)
```

Aucune donnee n'est envoyee a un serveur autre que l'API officielle d'Anthropic (`api.anthropic.com`), avec la cle que tu fournis toi-meme.
