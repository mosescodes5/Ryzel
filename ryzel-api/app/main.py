from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.database import init_db
from app.rate_limit import limiter
from app.routers import (
    admin,
    auth,
    invoices,
    orders,
    payments,
    providers,
    settings,
    trackers,
    wallet,
)


app = FastAPI(
    title="Ryzel API",
    version="0.1.0",
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)


# Allowed origins for the frontend. Update this list again once the domain's
# DNS is actually live and you've confirmed the exact hostnames Vercel/Cloudflare
# serve it under (with and without "www" are two different origins to a browser).
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://ryzel.online",
        "https://www.ryzel.online",
        "https://sms-one-three.vercel.app",  # old Vercel preview URL — safe to remove once ryzel.online is confirmed live
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    init_db()


app.include_router(auth.router)
app.include_router(wallet.router)
app.include_router(orders.router)
app.include_router(payments.router)
app.include_router(settings.router)
app.include_router(admin.router)
app.include_router(providers.router)
app.include_router(invoices.router)
app.include_router(trackers.router)
app.include_router(trackers.public_router)


@app.get("/")
def root():
    return {
        "status": "ok",
        "service": "ryzel-api",
    }