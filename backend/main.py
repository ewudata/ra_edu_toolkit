from __future__ import annotations

import os
from fastapi import FastAPI
from dotenv import load_dotenv

from .routes import auth, databases, evaluation, queries

# Load environment variables
load_dotenv()

app = FastAPI(title="RA Education Toolkit API")

# Register routes
app.include_router(databases.router)
app.include_router(queries.router)
app.include_router(evaluation.router)
app.include_router(evaluation.custom_router)
app.include_router(auth.router)


@app.get("/")
def root():
    return {"message": "RA Education Toolkit API", "version": "1.0.0"}


@app.get("/health")
def health_check():
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn

    # Get configuration from environment
    HOST = os.getenv("BACKEND_HOST", "0.0.0.0")
    PORT = int(os.getenv("BACKEND_PORT", "8000"))
    DEBUG = os.getenv("DEBUG", "True").lower() == "true"
    RELOAD = os.getenv("RELOAD", "True").lower() == "true"

    uvicorn.run("main:app", host=HOST, port=PORT, reload=RELOAD and DEBUG, debug=DEBUG)
