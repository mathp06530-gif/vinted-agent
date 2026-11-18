# Vinted Agent

Tu prends tes vêtements en photo, l'agent prépare l'annonce Vinted : titre, description qui sonne humaine, marque, modèle, taille, état, prix conseillé, hashtags. Tu relis, tu valides, tu publies. Ça marche sur téléphone, tablette et PC, même PC éteint, et tes annonces sont synchronisées partout.

- **L'agent** (gratuit, via Groq) : Qwen 3.8 (vision) lit les photos et les étiquettes, GPT-OSS 120B écrit l'annonce.
- **L'appli** est hébergée sur GitHub Pages.
- **Tes annonces et photos** sont stockées dans ta base Supabase (gratuite), visibles par toi seul.

## Mise en place (une seule fois)

### 1. Supabase
1. supabase.com → New project.
2. **SQL Editor** → colle le contenu de `supabase/schema.sql` → **Run**.
3. **Project Settings → API** : copie l'**URL** et la clé **anon / publishable** dans `config.js`.
4. **Authentication → URL Configuration** : mets l'adresse GitHub Pages de l'appli dans *Site URL*.
5. Une fois ton compte créé dans l'appli : **Authentication → Sign In / Providers** → désactive *Allow new users to sign up*, pour que personne d'autre ne puisse créer de compte.

### 2. Groq
console.groq.com → API Keys → crée une clé → dans l'appli : **Réglages** → colle-la.

### 3. Sur ton téléphone
Ouvre l'adresse de l'appli → menu du navigateur → **Ajouter à l'écran d'accueil**. Elle s'ouvre ensuite comme une vraie appli.

## Publier sur Vinted
Dans une annonce « Prête » : **Enregistrer / partager les photos** → **Copier** le titre et la description → **Ouvrir Vinted** → colle, choisis la catégorie, la marque, la taille et l'état → publie → reviens cliquer sur **Marquer publiée**.

## Sécurité
- `config.js` ne contient que des valeurs publiques. Les règles de la base empêchent quiconque de lire tes annonces.
- Ta clé Groq est enregistrée dans ton compte Supabase, jamais dans le code.
- Ne mets jamais la clé `service_role` de Supabase dans ce dépôt.
