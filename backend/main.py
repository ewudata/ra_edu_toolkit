from __future__ import annotations

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from .routes import ai_privacy, auth, databases, evaluation, llm, queries

# Load environment variables
load_dotenv()

app = FastAPI(title="RA Education Toolkit API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173,https://relational.cubely.us").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routes
app.include_router(databases.router)
app.include_router(queries.router)
app.include_router(evaluation.router)
app.include_router(evaluation.custom_router)
app.include_router(llm.router)
app.include_router(llm.database_router)
app.include_router(auth.router)
app.include_router(ai_privacy.router)


@app.get("/")
def root():
    return {"message": "RA Education Toolkit API", "version": "1.0.0"}


@app.get("/health")
def health_check():
    return {"status": "healthy"}


@app.middleware("http")
async def limit_public_evaluation(request, call_next):
    from starlette.responses import JSONResponse
    from starlette.concurrency import run_in_threadpool
    from .services.public_access import check_guest_rate
    is_evaluation = request.method == "POST" and request.url.path.startswith("/databases/") and request.url.path.rsplit("/", 1)[-1] in {"evaluate", "evaluate-sql", "check-translation"}
    if is_evaluation:
        body = bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body) > 65536:
                return JSONResponse({"detail": "Evaluation request is too large."}, status_code=413)
        request._body = bytes(body)
        if "authorization" not in request.headers:
            client = request.client.host if request.client else "unknown"
            if not await run_in_threadpool(check_guest_rate, client):
                return JSONResponse({"detail": "Too many evaluations. Try again in a minute."}, status_code=429, headers={"Retry-After": "60"})
    return await call_next(request)


if __name__ == "__main__":
    import uvicorn

    # Get configuration from environment
    HOST = os.getenv("BACKEND_HOST", "0.0.0.0")
    PORT = int(os.getenv("BACKEND_PORT", "8000"))
    DEBUG = os.getenv("DEBUG", "True").lower() == "true"
    RELOAD = os.getenv("RELOAD", "True").lower() == "true"

    uvicorn.run("main:app", host=HOST, port=PORT, reload=RELOAD and DEBUG, debug=DEBUG)
