# Relais IA gratuit (Cloudflare)

Génère des sols pour « Mes sols » avec FLUX.1 schnell, gratuitement (quota Workers AI : 10 000 neurones/jour, environ 50 images).

Mise en place (une fois) :
1. Crée un compte gratuit sur https://dash.cloudflare.com/sign-up
2. Dans ce dossier : `npx wrangler login` (valide dans le navigateur)
3. `npx wrangler secret put KEY` puis tape un code secret de ton choix
4. `npx wrangler deploy` : l'adresse du relais s'affiche (https://vinted-agent-ia.xxx.workers.dev)
5. Dans l'appli : Réglages → Mes sols → Réglages Cloudflare : colle l'adresse et le code secret.
