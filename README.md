# Vinted Agent

Tu déposes les photos d'un vêtement, l'agent prépare l'annonce Vinted (titre, description qui sonne humaine, marque, modèle, taille, état, prix conseillé, hashtags). Tu relis, tu valides, et un clic ouvre Vinted avec les photos, le titre, la description et le prix déjà remplis. C'est toi qui cliques sur « Ajouter ».

## Lancer
Double-clique sur `lancer.bat`. La page s'ouvre sur http://localhost:5050.
Depuis ton téléphone (même Wi-Fi) : l'adresse s'affiche dans la fenêtre noire, pratique pour envoyer les photos direct depuis la galerie.

## Première fois
1. Crée une clé gratuite sur console.groq.com (API Keys), puis Réglages → colle-la.
   L'agent utilise deux modèles open source sur Groq : Qwen 3.8 (vision) lit les photos et les étiquettes, GPT-OSS 120B écrit l'annonce.
   Tu peux aussi passer sur Claude (payant, plus précis) dans les Réglages.
2. Choisis ton style (tutoiement, emojis, phrase de fin...).
3. Pour la publication : la 1re fois, connecte-toi à Vinted dans la fenêtre qui s'ouvre. La connexion est gardée ensuite.

## Les statuts
- **À vérifier** : l'agent a rédigé, tu relis.
- **Prête** : validée, pas encore publiée.
- **Publiée** : en ligne.
- **Vendue**.

## Où sont mes données
Tout est dans `data/` : `annonces.db`, `photos/`, `config.json` (ta clé), `navigateur/` (ta session Vinted). Ne partage pas ce dossier.

## Installer depuis GitHub
```
git clone <ton-depot>
cd vinted-agent
lancer.bat
```
Le dossier `data/` n'est jamais envoyé sur GitHub (voir `.gitignore`).
