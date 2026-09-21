FROM python:3.13-slim-bookworm AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 UV_PROJECT_ENVIRONMENT=/opt/venv UV_LINK_MODE=copy
RUN pip install --no-cache-dir uv==0.8.22 && useradd --uid 10001 --create-home app
WORKDIR /app/apps/api
COPY --chown=app:app --chmod=644 apps/api/pyproject.toml apps/api/uv.lock ./

FROM base AS development
RUN uv sync --frozen
COPY --chown=app:app apps/api/app ./app
USER app
EXPOSE 8000
CMD ["/opt/venv/bin/uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload", "--reload-dir", "/app/apps/api/app"]

FROM base AS build
RUN uv sync --frozen --no-dev

FROM python:3.13-slim-bookworm AS production
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
RUN useradd --uid 10001 --create-home app
WORKDIR /app/apps/api
COPY --from=build --chown=app:app /opt/venv /opt/venv
COPY --chown=app:app --chmod=644 apps/api/pyproject.toml ./pyproject.toml
COPY --chown=app:app apps/api/app ./app
USER app
EXPOSE 8000
CMD ["/opt/venv/bin/uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
