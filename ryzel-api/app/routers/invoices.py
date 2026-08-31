from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.auth import CurrentUser, get_current_user
from app.config import settings
from app.database import get_session
from app.models import Invoice, InvoiceStatus, LedgerEntry, Wallet
from app.schemas import InvoiceCreate, InvoiceRead, InvoiceStatusUpdate

router = APIRouter(prefix="/invoices", tags=["invoices"])


def _generate_invoice_number(session: Session, user_id) -> str:
    """
    Human-friendly and per-user (not globally unique) — "INV-2026-0001" reads
    fine on an actual invoice sent to a client. We just need it distinct
    within one user's own invoices, not across the whole platform.
    """
    year = datetime.now(timezone.utc).year
    count = session.exec(
        select(Invoice).where(Invoice.user_id == user_id)
    ).all()
    return f"INV-{year}-{len(count) + 1:04d}"


@router.get("", response_model=list[InvoiceRead])
def list_invoices(
    user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    invoices = session.exec(
        select(Invoice)
        .where(Invoice.user_id == user.id)
        .order_by(Invoice.created_at.desc())
    ).all()
    return invoices


@router.get("/{invoice_id}", response_model=InvoiceRead)
def get_invoice(
    invoice_id: int,
    user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    invoice = session.get(Invoice, invoice_id)
    if invoice is None or invoice.user_id != user.id:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return invoice


@router.post("", response_model=InvoiceRead)
def create_invoice(
    payload: InvoiceCreate,
    user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not payload.line_items:
        raise HTTPException(status_code=400, detail="At least one line item is required")

    subtotal = sum(item.quantity * item.unit_price for item in payload.line_items)
    tax_amount = subtotal * (payload.tax_percent / 100)
    total = subtotal + tax_amount

    fee = settings.invoice_fee_ngn

    wallet = session.get(Wallet, user.id)
    if wallet is None:
        raise HTTPException(status_code=500, detail="Wallet not found")

    if wallet.wallet_balance_ngn < fee:
        raise HTTPException(
            status_code=402,
            detail=f"Insufficient wallet balance — creating an invoice costs \u20a6{fee:.0f}",
        )

    wallet.wallet_balance_ngn -= fee

    invoice = Invoice(
        user_id=user.id,
        invoice_number=_generate_invoice_number(session, user.id),
        client_name=payload.client_name,
        client_email=payload.client_email,
        client_address=payload.client_address,
        currency=payload.currency,
        line_items=[item.model_dump() for item in payload.line_items],
        tax_percent=payload.tax_percent,
        notes=payload.notes,
        subtotal=subtotal,
        tax_amount=tax_amount,
        total=total,
        due_date=payload.due_date,
    )

    session.add(wallet)
    session.add(invoice)
    session.commit()
    session.refresh(invoice)

    session.add(
        LedgerEntry(
            user_id=user.id,
            amount_ngn=-fee,
            reason="invoice_fee",
            balance_after_ngn=wallet.wallet_balance_ngn,
        )
    )
    session.commit()
    session.refresh(invoice)

    return invoice


@router.patch("/{invoice_id}/status", response_model=InvoiceRead)
def update_invoice_status(
    invoice_id: int,
    payload: InvoiceStatusUpdate,
    user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Marking an invoice sent/paid/void is free — only creating it costs
    money. We don't verify "paid" against anything real; it's the user's
    own record-keeping, same as ticking a box in a spreadsheet.
    """
    invoice = session.get(Invoice, invoice_id)
    if invoice is None or invoice.user_id != user.id:
        raise HTTPException(status_code=404, detail="Invoice not found")

    invoice.status = payload.status
    invoice.updated_at = datetime.now(timezone.utc)
    session.add(invoice)
    session.commit()
    session.refresh(invoice)
    return invoice


@router.delete("/{invoice_id}")
def delete_invoice(
    invoice_id: int,
    user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    No refund on delete — the fee is for the act of generating the invoice,
    not a subscription to keep it around. This just declutters the list.
    """
    invoice = session.get(Invoice, invoice_id)
    if invoice is None or invoice.user_id != user.id:
        raise HTTPException(status_code=404, detail="Invoice not found")

    session.delete(invoice)
    session.commit()
    return {"deleted": True}
