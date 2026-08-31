import secrets
import string
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.auth import CurrentUser, get_current_user
from app.config import settings
from app.database import get_session
from app.models import LedgerEntry, Shipment, Wallet
from app.schemas import (
    TrackerAddEvent,
    TrackerCreate,
    TrackerPublicRead,
    TrackerRead,
)

router = APIRouter(prefix="/trackers", tags=["trackers"])

# Separate router with no auth dependency at all — mounted at /track, not
# /trackers, so there's no ambiguity between the two in the URL itself.
public_router = APIRouter(prefix="/track", tags=["trackers"])

_CODE_ALPHABET = string.ascii_uppercase + string.digits


def _generate_tracking_code(session: Session) -> str:
    """
    Short, unguessable, and shareable — this is the whole public link, so it
    needs to not collide and not be easily enumerable. 10 chars from a
    36-character alphabet is ~5×10^15 combinations; a retry loop handles the
    astronomically unlikely collision case rather than trusting math alone.
    """
    for _ in range(10):
        code = "".join(secrets.choice(_CODE_ALPHABET) for _ in range(10))
        exists = session.exec(
            select(Shipment).where(Shipment.tracking_code == code)
        ).first()
        if not exists:
            return code
    raise HTTPException(status_code=500, detail="Could not generate a unique tracking code, try again")


@router.get("", response_model=list[TrackerRead])
def list_trackers(
    user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    shipments = session.exec(
        select(Shipment)
        .where(Shipment.user_id == user.id)
        .order_by(Shipment.created_at.desc())
    ).all()
    return shipments


@router.get("/{shipment_id}", response_model=TrackerRead)
def get_tracker(
    shipment_id: int,
    user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    shipment = session.get(Shipment, shipment_id)
    if shipment is None or shipment.user_id != user.id:
        raise HTTPException(status_code=404, detail="Tracker not found")
    return shipment


@router.post("", response_model=TrackerRead)
def create_tracker(
    payload: TrackerCreate,
    user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    fee = settings.tracker_fee_ngn

    wallet = session.get(Wallet, user.id)
    if wallet is None:
        raise HTTPException(status_code=500, detail="Wallet not found")

    if wallet.wallet_balance_ngn < fee:
        raise HTTPException(
            status_code=402,
            detail=f"Insufficient wallet balance — creating a tracking link costs \u20a6{fee:.0f}",
        )

    wallet.wallet_balance_ngn -= fee

    now = datetime.now(timezone.utc)
    shipment = Shipment(
        user_id=user.id,
        tracking_code=_generate_tracking_code(session),
        carrier_style=payload.carrier_style,
        carrier_name=payload.carrier_name,
        sender_name=payload.sender_name,
        recipient_name=payload.recipient_name,
        origin=payload.origin,
        destination=payload.destination,
        package_description=payload.package_description,
        estimated_delivery=payload.estimated_delivery,
        events=[
            {
                "status": "label_created",
                "location": payload.origin,
                "note": "Tracking created",
                "timestamp": now.isoformat(),
            }
        ],
    )

    session.add(wallet)
    session.add(shipment)
    session.commit()
    session.refresh(shipment)

    session.add(
        LedgerEntry(
            user_id=user.id,
            amount_ngn=-fee,
            reason="tracker_fee",
            balance_after_ngn=wallet.wallet_balance_ngn,
        )
    )
    session.commit()
    session.refresh(shipment)

    return shipment


@router.post("/{shipment_id}/events", response_model=TrackerRead)
def add_tracker_event(
    shipment_id: int,
    payload: TrackerAddEvent,
    user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Adding a status update is free — only creating the tracker costs money.
    This is what you call every time the package actually moves.
    """
    shipment = session.get(Shipment, shipment_id)
    if shipment is None or shipment.user_id != user.id:
        raise HTTPException(status_code=404, detail="Tracker not found")

    now = datetime.now(timezone.utc)
    events = list(shipment.events or [])
    events.append(
        {
            "status": payload.status.value,
            "location": payload.location,
            "note": payload.note,
            "timestamp": now.isoformat(),
        }
    )

    shipment.events = events
    shipment.status = payload.status
    shipment.updated_at = now

    session.add(shipment)
    session.commit()
    session.refresh(shipment)
    return shipment


@router.delete("/{shipment_id}")
def delete_tracker(
    shipment_id: int,
    user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    shipment = session.get(Shipment, shipment_id)
    if shipment is None or shipment.user_id != user.id:
        raise HTTPException(status_code=404, detail="Tracker not found")

    session.delete(shipment)
    session.commit()
    return {"deleted": True}


@public_router.get("/{tracking_code}", response_model=TrackerPublicRead)
def public_track(
    tracking_code: str,
    session: Session = Depends(get_session),
):
    """
    Unauthenticated on purpose — this is the shareable link handed to
    whoever's receiving the package. Deliberately returns only
    TrackerPublicRead, which drops user_id and anything else that isn't
    meant for a stranger to see.
    """
    shipment = session.exec(
        select(Shipment).where(Shipment.tracking_code == tracking_code.upper())
    ).first()
    if shipment is None:
        raise HTTPException(status_code=404, detail="Tracking code not found")
    return shipment
