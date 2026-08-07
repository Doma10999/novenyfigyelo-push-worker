NÖVÉNYFIGYELŐ PUSH WORKER – PRO V1

CÉL
- Web Push Chrome / Edge / Firefox alatt
- iPhone/iPad PWA Web Push támogatás
- Firebase bejelentkezett felhasználóhoz kötött feliratkozás
- Apps Scriptből titkos kulccsal indított értesítés
- Több telefon/böngésző egy fiókhoz
- Lejárt push subscription automatikus takarítása

MIÉRT GITHUB/WRANGLER TELEPÍTÉS?
A végleges Web Push a web-push npm csomagot használja. A Cloudflare saját
Web Push dokumentációja is npm web-push csomagot használ. Ezért a dashboard
Hello World szerkesztő helyett csomagolt Worker projektként érdemes telepíteni.

KÖTELEZŐ CLOUDFLARE BINDING
PUSH_SUBS -> Workers KV namespace

KÖTELEZŐ WORKER SECRET / VARIABLE
FIREBASE_PROJECT_ID = plant-monitor-3976f
PUSH_API_SECRET     = hosszú véletlen titkos kulcs (SECRET)
VAPID_PUBLIC_KEY    = VAPID nyilvános kulcs
VAPID_PRIVATE_KEY   = VAPID privát kulcs (SECRET)
VAPID_SUBJECT       = mailto:<saját értesítési email>

AJÁNLOTT VARIABLE
ALLOWED_ORIGINS = https://novenyfigyelo.netlify.app
APP_URL = https://novenyfigyelo.netlify.app/
PUSH_ICON_URL = https://novenyfigyelo.netlify.app/icon2.png
PUSH_BADGE_URL = https://novenyfigyelo.netlify.app/icon2.png

ENDPOINTOK
GET  /health
GET  /vapid-public-key
POST /subscribe             Firebase ID token kell
POST /unsubscribe           Firebase ID token kell
GET  /subscription-status   Firebase ID token kell
POST /send                  X-Push-Secret kell

FONTOS
A /send végpont csak a Google Apps Scriptből lesz meghívva. A Plus jogosultság
ellenőrzése továbbra is a szerveroldali Apps Scriptben történik. A felhasználó
nem tud saját maga push értesítést küldeni, mert a PUSH_API_SECRET nincs a
weboldalban és nincs az Android appban.

Cloudflare Worker connected.
