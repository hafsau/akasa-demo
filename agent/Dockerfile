FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.5 /uv /usr/local/bin/uv
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy PYDANTIC_AI_NO_BANNER=1
COPY agent/pyproject.toml agent/uv.lock ./
RUN uv sync --frozen --no-dev
COPY agent/ ./
COPY evals/cases /evals/cases
EXPOSE 8080
CMD ["uv", "run", "--no-dev", "uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8080"]
