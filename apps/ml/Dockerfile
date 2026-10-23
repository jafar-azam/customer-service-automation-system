# syntax=docker/dockerfile:1@sha256:4edf897a3ffa55b89f906fc8cc78afdb3f1834cc9c7083565e611a8a7d5fe99e
#
# ML service. CPU-only on purpose: inference must never require a GPU
# (training does, and runs outside the container — see docs/steps/01-planning).

ARG PYTHON_IMAGE=python:3.12-slim-bookworm@sha256:6a0e06f5ba0b373d051aabd3fffb9b873f27f9a2a3a14bcbe37dee6f0e3bbc70

FROM ${PYTHON_IMAGE} AS base
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy
WORKDIR /srv

FROM base AS deps
# uv is installed with pip rather than copied from another registry, so the
# build depends on PyPI only.
RUN pip install --no-cache-dir uv==0.13.5
COPY apps/ml/pyproject.toml apps/ml/uv.lock apps/ml/.python-version ./
# --frozen refuses to update the lockfile: the image gets exactly what was tested.
RUN uv sync --frozen --no-dev --no-install-project

FROM base AS runtime
COPY --from=deps /srv/.venv /srv/.venv
ENV PATH="/srv/.venv/bin:$PATH"
COPY apps/ml/app ./app

RUN useradd --create-home --uid 10001 mlsvc && chown -R mlsvc:mlsvc /srv
USER mlsvc

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=3s --start-period=15s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/ready',timeout=2).status==200 else 1)"

# One worker: this service is CPU-bound and the local stack has limited memory.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
