# Générateur de Covering de Véhicule - Luxe & IA

Ce projet est une application web générant des designs de covering de véhicule ultra-réalistes via l'IA (Kie.ai).

## Prérequis

- Node.js installé
- Un compte Railway (pour le déploiement)
- Une clé API **Kie.ai**

## Installation Locale

1. Installer les dépendances :
   ```bash
   npm install
   ```

2. Créer un fichier `.env` à la racine et ajouter votre clé :
   ```
   KIE_API_KEY=votre_clé_api_ici
   ```

3. Lancer le serveur :
   ```bash
   npm run dev
   ```
   Accédez à `http://localhost:3000`.

## Déploiement sur Railway

1. **Pusher sur GitHub** : Mettez ce projet sur un dépôt GitHub.
2. **Nouveau Projet Railway** : Connectez votre GitHub et sélectionnez ce dépôt.
3. **Variables d'Environnement** :
   Dans l'onglet "Variables" de votre projet Railway, ajoutez :
   
   - `KIE_API_KEY` : (Collez votre clé API Kie.ai ici)
   - `PORT` : (Railway le gère souvent automatiquement, mais vous pouvez laisser par défaut)

4. **Déployer** : Railway détectera automatiquement `package.json` et lancera `npm start`.

## Documentation API
Le projet utilise l'endpoint `gpt4o-image` de Kie.ai.
