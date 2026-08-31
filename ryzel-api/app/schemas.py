import uuid
from datetime import datetime
from typing import Optional

from sqlmodel import SQLModel

from app.models import OrderStatus, InvoiceStatus, CarrierStyle, ShipmentStatus


class UserRead(SQLModel):
    id: uuid.UUID
    email: str
    wallet_balance_ngn: float
    is_admin: bool = False


class OrderRead(SQLModel):
    id: int
    service: str
    country: str
    provider_name: str
    phone_number: str
    price_ngn: float
    status: OrderStatus
    sms_code: Optional[str] = None
    created_at: datetime
    expires_at: datetime
    completed_at: Optional[datetime] = None


class OfferRead(SQLModel):
    """One purchasable pool for a service+country — what the buy screen lists."""
    operator: str
    price_ngn: float
    success_rate: Optional[float] = None  # 0-100
    available: Optional[int] = None


class LedgerEntryRead(SQLModel):
    id: int
    amount_ngn: float
    reason: str
    order_id: Optional[int] = None
    balance_after_ngn: float
    created_at: datetime


# ---------- Admin ----------


class AdminUserRead(SQLModel):
    user_id: uuid.UUID
    email: Optional[str] = None
    wallet_balance_ngn: float
    is_admin: bool
    is_suspended: bool
    created_at: datetime


class WalletAdjustRequest(SQLModel):
    amount_ngn: float  # positive = credit, negative = debit
    reason: str


class AdminOrderRead(OrderRead):
    user_id: uuid.UUID
    user_email: Optional[str] = None


class SiteSettingsRead(SQLModel):
    whatsapp_group_url: str = ""
    telegram_url: str = ""
    support_ticket_url: str = ""
    support_email: str = ""
    support_phone: str = ""
    announcement: str = ""


class PricingTier(SQLModel):
    max_cost_ngn: Optional[float] = None  # None = catch-all (applies above all other tiers)
    markup_percent: float
    markup_flat_ngn: float


class PricingSettingsRead(SQLModel):
    usd_ngn_rate: float
    min_price_ngn: float
    tiers: list[PricingTier]


class AdminStatsRead(SQLModel):
    total_users: int
    total_orders: int
    orders_pending: int
    orders_received: int
    total_wallet_balance_ngn: float
    total_revenue_ngn: float  # sum of order_charge ledger entries (negative -> flipped positive)
    total_topups_ngn: float
    total_provider_cost_ngn: float  # what received orders cost us, at current USD/NGN rate
    total_profit_ngn: float  # total_revenue_ngn - total_provider_cost_ngn (received orders only)
    profit_margin_pct: float


# ---------- Invoices ----------


class InvoiceLineItem(SQLModel):
    description: str
    quantity: float = 1
    unit_price: float


class InvoiceCreate(SQLModel):
    client_name: str
    client_email: Optional[str] = None
    client_address: Optional[str] = None
    currency: str = "NGN"
    line_items: list[InvoiceLineItem]
    tax_percent: float = 0.0
    notes: Optional[str] = None
    due_date: Optional[datetime] = None


class InvoiceRead(SQLModel):
    id: int
    invoice_number: str
    client_name: str
    client_email: Optional[str] = None
    client_address: Optional[str] = None
    currency: str
    line_items: list[InvoiceLineItem]
    tax_percent: float
    notes: Optional[str] = None
    subtotal: float
    tax_amount: float
    total: float
    status: InvoiceStatus
    issue_date: datetime
    due_date: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class InvoiceStatusUpdate(SQLModel):
    status: InvoiceStatus


# ---------- Package tracker ----------


class TrackerEvent(SQLModel):
    status: ShipmentStatus
    location: Optional[str] = None
    note: Optional[str] = None
    timestamp: Optional[datetime] = None  # defaults to "now" server-side if omitted


class TrackerCreate(SQLModel):
    carrier_style: CarrierStyle = CarrierStyle.generic
    carrier_name: Optional[str] = None
    sender_name: Optional[str] = None
    recipient_name: Optional[str] = None
    origin: Optional[str] = None
    destination: Optional[str] = None
    package_description: Optional[str] = None
    estimated_delivery: Optional[datetime] = None


class TrackerRead(SQLModel):
    id: int
    tracking_code: str
    carrier_style: CarrierStyle
    carrier_name: Optional[str] = None
    sender_name: Optional[str] = None
    recipient_name: Optional[str] = None
    origin: Optional[str] = None
    destination: Optional[str] = None
    package_description: Optional[str] = None
    status: ShipmentStatus
    estimated_delivery: Optional[datetime] = None
    events: list[TrackerEvent]
    created_at: datetime
    updated_at: datetime


class TrackerPublicRead(SQLModel):
    """What an unauthenticated visitor sees at /track/{code} — no user_id."""
    tracking_code: str
    carrier_style: CarrierStyle
    carrier_name: Optional[str] = None
    origin: Optional[str] = None
    destination: Optional[str] = None
    package_description: Optional[str] = None
    status: ShipmentStatus
    estimated_delivery: Optional[datetime] = None
    events: list[TrackerEvent]
    updated_at: datetime


class TrackerAddEvent(SQLModel):
    status: ShipmentStatus
    location: Optional[str] = None
    note: Optional[str] = None
