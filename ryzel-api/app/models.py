import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from sqlalchemy import Column, JSON
from sqlmodel import SQLModel, Field


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class OrderStatus(str, Enum):
    pending = "pending"       # number reserved, waiting for SMS
    received = "received"     # SMS arrived, user charged
    expired = "expired"       # timed out, auto-refunded
    cancelled = "cancelled"   # user cancelled, refunded


class Wallet(SQLModel, table=True):
    """
    Replaces the old User table. Auth itself now lives entirely in
    Supabase's own auth.users table (managed by Supabase, not this app) —
    this table exists only to hold the things our app actually owns:
    wallet balance, admin/suspension flags, and a cached copy of the email
    (handy for the admin panel without needing the Supabase service-role
    API). `user_id` is the Supabase Auth user's UUID, and a row here is
    created automatically by a Postgres trigger the moment someone signs up
    (see supabase_schema.sql) — the backend never inserts a row here itself
    except as a local-dev/SQLite fallback (see get_or_create_wallet).
    """
    __tablename__ = "wallets"

    user_id: uuid.UUID = Field(primary_key=True)
    email: Optional[str] = None
    wallet_balance_ngn: float = 0.0
    is_admin: bool = False
    is_suspended: bool = False
    created_at: datetime = Field(default_factory=utcnow)


class SiteSetting(SQLModel, table=True):
    """
    Simple key/value store for things the admin panel lets you edit without
    a redeploy — WhatsApp group link, Telegram channel, support contact,
    etc. Read publicly via GET /settings, written only via the admin router.
    """
    __tablename__ = "site_settings"

    key: str = Field(primary_key=True)
    value: str = ""
    updated_at: datetime = Field(default_factory=utcnow)


class LedgerEntry(SQLModel, table=True):
    """Every wallet movement, for auditing. Never delete rows here."""
    __tablename__ = "ledger_entries"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="wallets.user_id", index=True)
    amount_ngn: float  # positive = credit, negative = debit
    reason: str        # "topup_korapay", "order_charge", "order_refund_timeout", ...
    order_id: Optional[int] = Field(default=None, foreign_key="orders.id")
    balance_after_ngn: float
    created_at: datetime = Field(default_factory=utcnow)


class PaymentStatus(str, Enum):
    pending = "pending"
    success = "success"
    failed = "failed"


class PendingPayment(SQLModel, table=True):
    """
    Tracks a Korapay charge from initialization to confirmation.
    `reference` is our own generated ID (not Korapay's internal ID), passed to
    Korapay when we initialize the charge, and used to match the webhook back
    to a user + amount. `status` starts pending and is only ever flipped by
    server-side verification against Korapay's API — never by trusting the
    webhook body alone.
    """
    __tablename__ = "pending_payments"

    id: Optional[int] = Field(default=None, primary_key=True)
    reference: str = Field(unique=True, index=True)
    user_id: uuid.UUID = Field(foreign_key="wallets.user_id", index=True)
    amount_ngn: float
    status: PaymentStatus = PaymentStatus.pending
    created_at: datetime = Field(default_factory=utcnow)
    confirmed_at: Optional[datetime] = None


class Order(SQLModel, table=True):
    __tablename__ = "orders"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="wallets.user_id", index=True)

    service: str          # e.g. "whatsapp", "google"
    country: str          # e.g. "nigeria"

    provider_name: str            # which upstream adapter fulfilled this
    provider_order_id: str        # id from the upstream provider, for polling/cancel
    phone_number: str

    cost_usd: float        # what WE paid the provider
    price_ngn: float       # what the USER is charged (cost + markup)

    status: OrderStatus = OrderStatus.pending
    sms_code: Optional[str] = None

    created_at: datetime = Field(default_factory=utcnow)
    expires_at: datetime
    completed_at: Optional[datetime] = None


# ---------------------------------------------------------------------------
# INVOICES
# ---------------------------------------------------------------------------


class InvoiceStatus(str, Enum):
    draft = "draft"        # created but not sent to the client yet
    sent = "sent"          # marked as sent — informational only, doesn't gate anything
    paid = "paid"          # marked as paid by the user themselves — we don't verify this
    void = "void"          # cancelled/written off


class Invoice(SQLModel, table=True):
    """
    A paid feature: creating one deducts `settings.invoice_fee_ngn` from the
    wallet, same charge-then-record pattern as buying a number (see
    routers/invoices.py). Editing an existing invoice or changing its status
    is free — only creation is charged.

    Line items are stored as JSON rather than a child table since they're
    always read/written as a single unit with their parent invoice, never
    queried independently — a child table would just add join overhead for
    no benefit here.
    """
    __tablename__ = "invoices"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="wallets.user_id", index=True)

    invoice_number: str = Field(index=True)  # e.g. "INV-2026-0007", unique per user (not globally)

    client_name: str
    client_email: Optional[str] = None
    client_address: Optional[str] = None

    currency: str = "NGN"
    line_items: list = Field(default_factory=list, sa_column=Column(JSON))
    # each item: {"description": str, "quantity": float, "unit_price": float}

    tax_percent: float = 0.0
    notes: Optional[str] = None

    subtotal: float
    tax_amount: float
    total: float

    status: InvoiceStatus = InvoiceStatus.draft

    issue_date: datetime = Field(default_factory=utcnow)
    due_date: Optional[datetime] = None

    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


# ---------------------------------------------------------------------------
# PACKAGE TRACKER
# ---------------------------------------------------------------------------


class CarrierStyle(str, Enum):
    """
    Cosmetic theming only — a color scheme + label for the public tracking
    page. This is NOT a real courier integration: there's no API call to
    DHL/FedEx/etc, and all status events are entered manually by whoever
    creates the shipment. The `carrier_name` field is free text the user
    supplies (e.g. they might type "DHL Express" because that's genuinely
    who's carrying the package) — we just skin the page to roughly match
    what they picked, we don't claim any relationship with the carrier.
    """
    dhl = "dhl"
    fedex = "fedex"
    ups = "ups"
    generic = "generic"


class ShipmentStatus(str, Enum):
    label_created = "label_created"
    picked_up = "picked_up"
    in_transit = "in_transit"
    out_for_delivery = "out_for_delivery"
    delivered = "delivered"
    exception = "exception"


class Shipment(SQLModel, table=True):
    """
    A paid feature: creating one deducts `settings.tracker_fee_ngn` from the
    wallet (see routers/trackers.py). Adding events / updating status
    afterward is free. `tracking_code` is the public, unguessable slug used
    in the shareable link (GET /track/{tracking_code} is unauthenticated by
    design — that's the whole point, it's what you hand to your customer).
    """
    __tablename__ = "shipments"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="wallets.user_id", index=True)

    tracking_code: str = Field(unique=True, index=True)

    carrier_style: CarrierStyle = CarrierStyle.generic
    carrier_name: Optional[str] = None  # free text, e.g. "DHL Express" — user-supplied, not verified

    sender_name: Optional[str] = None
    recipient_name: Optional[str] = None
    origin: Optional[str] = None
    destination: Optional[str] = None
    package_description: Optional[str] = None

    status: ShipmentStatus = ShipmentStatus.label_created
    estimated_delivery: Optional[datetime] = None

    events: list = Field(default_factory=list, sa_column=Column(JSON))
    # each event: {"status": str, "location": str, "note": str, "timestamp": iso str}

    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
