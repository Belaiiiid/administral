# Minimal image for the optional TruFor localisation service. The official
# TruFor source (`third_party/trufor`) and downloaded weights are NOT baked
# into the image — they are large, license-specific artefacts fetched once
# per the steps in vision_service/README.md — so the image only ships the
# Python runtime; docker-compose.yml mounts both directories as volumes.
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY vision_service/requirements-cuda.txt vision_service/requirements-cuda.txt
RUN pip install --no-cache-dir -r vision_service/requirements-cuda.txt

COPY vision_service/app.py vision_service/app.py

EXPOSE 8011

CMD ["uvicorn", "vision_service.app:app", "--host", "0.0.0.0", "--port", "8011"]
