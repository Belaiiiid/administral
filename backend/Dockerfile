# Minimal image for the FastAPI backend. PostgreSQL stays external (see the
# repo-root docker-compose.yml) — only the API process runs in the container.
FROM python:3.11-slim

WORKDIR /app/backend

# libgl1/libglib2.0-0: runtime shared libraries opencv-python-headless still
# dlopen()s even in headless mode.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
