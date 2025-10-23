from __future__ import annotations

from fastapi import FastAPI

from .routes import databases, evaluation, queries

app = FastAPI(title="RA Education Toolkit API")

# 注册路由
app.include_router(databases.router)
app.include_router(queries.router)
app.include_router(evaluation.router)


@app.get("/")
def root():
    return {"message": "RA Education Toolkit API", "version": "1.0.0"}


@app.get("/health")
def health_check():
    return {"status": "healthy"}
