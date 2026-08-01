import httpx
from pathlib import Path

path = Path("D:/Fatma/Stages/TALAN/Projet/MonParcours/third_party/trufor/test_docker/images/tampered1.png")
with path.open("rb") as f:
    r = httpx.post("http://127.0.0.1:8011/analyse", files={"file": (path.name, f, "application/octet-stream")})
print(r.status_code)
print(r.json())
