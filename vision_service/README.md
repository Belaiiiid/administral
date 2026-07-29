# Service TruFor

Le service charge TruFor officiel depuis `third_party/trufor`, utilise `cuda:0` si CUDA est disponible, sinon le CPU.

Avant la première exécution, récupérer le dépôt officiel et les poids :

```powershell
git clone --depth 1 https://github.com/grip-unina/TruFor.git third_party/trufor
Invoke-WebRequest https://www.grip.unina.it/download/prog/TruFor/TruFor_weights.zip -OutFile vision_service/TruFor_weights.zip
Expand-Archive vision_service/TruFor_weights.zip vision_service/weights
```

```powershell
py -m venv .venv-trufor
.\.venv-trufor\Scripts\python -m pip install -r vision_service\requirements-cuda.txt
.\.venv-trufor\Scripts\python -m uvicorn vision_service.app:app --host 127.0.0.1 --port 8011
```

Ajoute `FRAUD_VISION_ENDPOINT=http://127.0.0.1:8011/analyse` dans `backend/.env`. Consulte `/health` pour le périphérique actif.
