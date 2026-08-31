/**
 * The backend returns a 402 with a message like "Insufficient wallet
 * balance — creating an invoice costs ₦50" for every paid action (buying a
 * number, creating an invoice, creating a tracker). Checking for this
 * substring lets any view show a "Fund Wallet" button instead of just
 * dead-ending on red error text — the person can act immediately instead
 * of hunting for the wallet tab themselves.
 */
export function isInsufficientBalanceError(error) {
  const message =
    typeof error === "string" ? error : error?.message;
  return Boolean(message?.toLowerCase().includes("insufficient wallet balance"));
}
