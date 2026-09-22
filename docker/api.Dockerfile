FROM python:3.13-slim-bookworm AS build

ENV UV_PROJECT_ENVIRONMENT=/opt/venv UV_LINK_MODE=copy
WORKDIR /app/apps/api
RUN pip install --no-cache-dir uv==0.8.22
COPY apps/api/pyproject.toml apps/api/uv.lock ./
RUN uv sync --frozen --no-dev

FROM python:3.13-slim-bookworm

ENV PATH=/opt/venv/bin:$PATH \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
WORKDIR /app/apps/api
RUN useradd --uid 10001 --create-home app
COPY --from=build /opt/venv /opt/venv
COPY --chown=app:app apps/api/app ./app
USER app
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
