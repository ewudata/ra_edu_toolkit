from __future__ import annotations

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from .routes import auth, databases, evaluation, queries

# Load environment variables
load_dotenv()

app = FastAPI(title="RA Education Toolkit API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:8501").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
