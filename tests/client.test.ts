import { describe, expect, it, vi } from "vitest";
import { FiveSimClient, FiveSimError, type FiveSimLogEvent } from "../src/providers/fivesim";
import { smsFingerprint } from "../src/modules/sms/fingerprint";

const KEY = "sk_test_SUPERSECRET";
const res = (status: number, body: unknown) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
const mk = (impl: (url: string, init: RequestInit) => Promise<Response>, extra: Record<string, unknown> = {}) => {
  const fetchMock = vi.fn(impl as never);
  const logs: FiveSimLogEvent[] = [];
  const client = new FiveSimClient({ apiKey: KEY, fetch: fetchMock as unknown as typeof fetch, sleep: async () => {}, logger: (e) => logs.push(e), ...extra });
  return { client, fetchMock, logs };
};
const buyBody = { id: 11631253, phone: "+447350690992", operator: "vodafone", product: "telegram", price: 21, status: "PENDING", expires: "2018-10-13T08:28:38.809469028Z", sms: null, created_at: "2018-10-13T08:13:38.809469028Z", forwarding: false, forwarding_number: "", country: "england" };
const buy = (c: FiveSimClient) => c.buyActivation({ country: "england", operator: "vodafone", product: "telegram" });

describe("buyActivation outcomes", () => {
  it("created: parses nanosecond dates, null sms, keeps raw + string id", async () => {
    const { client } = mk(async () => res(200, buyBody));
    const o = await buy(client);
    expect(o.kind).toBe("created");
    if (o.kind === "created") {
      expect(o.order.id).toBe("11631253");
      expect(o.order.sms).toEqual([]);
      expect(o.raw).toEqual(buyBody);
    }
  });
  it("200 plain-text 'no free phones' is a definitive rejection", async () => {
    const { client } = mk(async () => res(200, "no free phones"));
    expect(await buy(client)).toMatchObject({ kind: "rejected", code: "NO_STOCK" });
  });
  it("400 'not enough user balance' is a definitive rejection", async () => {
    const { client } = mk(async () => res(400, "not enough user balance"));
    expect(await buy(client)).toMatchObject({ kind: "rejected", code: "INSUFFICIENT_PROVIDER_BALANCE" });
  });
  it("timeout is UNCERTAIN and the buy is attempted exactly once", async () => {
    const { client, fetchMock } = mk(async () => { throw Object.assign(new Error("aborted"), { name: "AbortError" }); });
    expect(await buy(client)).toMatchObject({ kind: "uncertain", reason: "timeout" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each([500, 502, 503, 504])("HTTP %i is UNCERTAIN, never retried", async (s) => {
    const { client, fetchMock } = mk(async () => res(s, "oops"));
    expect(await buy(client)).toMatchObject({ kind: "uncertain", reason: "server_error" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("malformed 200 JSON is UNCERTAIN and preserves the raw body", async () => {
    const { client } = mk(async () => res(200, { id: 1, nonsense: true }));
    const o = await buy(client);
    expect(o.kind).toBe("uncertain");
    if (o.kind === "uncertain") expect(o.rawBody).toContain("nonsense");
  });
  it("429 and 401 are definitive rejections", async () => {
    expect(await buy(mk(async () => res(429, "")).client)).toMatchObject({ kind: "rejected", code: "RATE_LIMITED" });
    expect(await buy(mk(async () => res(401, "")).client)).toMatchObject({ kind: "rejected", code: "AUTH" });
  });
  it("sends bearer auth, GET, and never leaks the key into logs", async () => {
    const { client, fetchMock, logs } = mk(async () => res(200, buyBody));
    await buy(client);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://5sim.net/v1/user/buy/activation/england/vodafone/telegram");
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
    expect(JSON.stringify(logs)).not.toContain(KEY);
  });
  it("rejects path injection and misuse of maxPrice", async () => {
    const { client } = mk(async () => res(200, buyBody));
    await expect(client.buyActivation({ country: "../x", operator: "any", product: "telegram" })).rejects.toBeInstanceOf(FiveSimError);
    await expect(client.buyActivation({ country: "england", operator: "vodafone", product: "telegram", maxPrice: 5 })).rejects.toBeInstanceOf(FiveSimError);
  });
});

describe("order reads and actions", () => {
  const checked = { ...buyBody, operator: undefined, status: "RECEIVED", sms: [{ created_at: "2018-10-13T08:20:38.809469028Z", date: "2018-10-13T08:19:38Z", sender: "Telegram", text: "Code 09363", code: "09363" }] };
  it("checkOrder returns the SMS exactly as the provider sent it", async () => {
    const { client } = mk(async () => res(200, checked));
    const o = await client.checkOrder("11631253");
    expect(o.sms[0]?.code).toBe("09363");
  });
  it("checkOrder retries transient failures then succeeds", async () => {
    let n = 0;
    const { client, fetchMock } = mk(async () => (++n < 3 ? res(503, "busy") : res(200, checked)));
    expect((await client.checkOrder("11631253")).status).toBe("RECEIVED");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
  it("checkOrder surfaces failure after retries are exhausted (no fake success)", async () => {
    const { client } = mk(async () => res(500, "x"));
    await expect(client.checkOrder("1")).rejects.toMatchObject({ code: "SERVER" });
  });
  it("malformed check response raises MALFORMED without echoing values", async () => {
    const { client } = mk(async () => res(200, { ...checked, status: "WEIRD", sms: [{ text: "Secret 123456" }] }));
    let err: unknown;
    try { await client.checkOrder("1"); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(FiveSimError);
    expect((err as FiveSimError).code).toBe("MALFORMED_RESPONSE");
    expect((err as FiveSimError).message).not.toContain("123456");
  });
  it("one SMS missing optional fields still surfaces the OTP text", async () => {
    const { client } = mk(async () => res(200, { ...checked, sms: [{ text: "Code 1111" }] }));
    expect((await client.checkOrder("1")).sms[0]).toMatchObject({ text: "Code 1111", code: "", sender: "" });
  });
  it("cancel/finish are never auto-retried; provider text maps to codes", async () => {
    const { client, fetchMock } = mk(async () => res(400, "order has sms"));
    await expect(client.cancelOrder("1")).rejects.toMatchObject({ code: "ORDER_HAS_SMS" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const t = mk(async () => res(500, "x"));
    await expect(t.client.cancelOrder("1")).rejects.toMatchObject({ code: "SERVER" });
    expect(t.fetchMock).toHaveBeenCalledTimes(1);
  });
  it("listActivationOrders skips malformed items instead of failing the page", async () => {
    const { client } = mk(async () => res(200, { Data: [buyBody, { id: "bad" }], Total: 2 }));
    expect(await client.listActivationOrders()).toMatchObject({ skipped: 1, total: 2 });
  });
});

describe("catalog", () => {
  it("normalises country-first and product-first price shapes", async () => {
    const cell = { cost: 4, count: 10, rate: 99.9 };
    const a = mk(async () => res(200, { england: { telegram: { vodafone: cell } } }));
    expect(await a.client.getPrices({ country: "england" })).toEqual([{ country: "england", product: "telegram", operator: "vodafone", costMinor: 400, count: 10, rate: 99.9 }]);
    const b = mk(async () => res(200, { telegram: { england: { vodafone: cell } } }));
    expect((await b.client.getPrices({ product: "telegram" }))[0]).toMatchObject({ country: "england", product: "telegram" });
  });
  it("sends no Authorization header on guest endpoints; parses countries", async () => {
    const { client, fetchMock } = mk(async () => res(200, { england: { iso: { gb: 1 }, prefix: { "+44": 1 }, text_en: "England", vodafone: { activation: 1 }, virtual4: { activation: 1 } } }));
    expect(await client.getCountries()).toEqual([{ slug: "england", name: "England", iso: ["gb"], prefixes: ["+44"], operators: ["vodafone", "virtual4"] }]);
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });
  it("filters hosting products out of activation catalog", async () => {
    const { client } = mk(async () => res(200, { "1day": { Category: "hosting", Qty: 1, Price: 80 }, telegram: { Category: "activation", Qty: 5, Price: 21 } }));
    expect(await client.getProducts("any", "any")).toEqual([{ product: "telegram", qty: 5, price: 21 }]);
  });
});

describe("sms fingerprint", () => {
  const sms = { sender: "Telegram", text: "Code 1", code: "1", created_at: "2018-10-13T08:20:38Z", date: "2018-10-13T08:19:38Z" };
  it("is stable for the same SMS and differs across orders/content", async () => {
    expect(await smsFingerprint("1", sms)).toBe(await smsFingerprint("1", { ...sms }));
    expect(await smsFingerprint("1", sms)).not.toBe(await smsFingerprint("2", sms));
    expect(await smsFingerprint("1", sms)).not.toBe(await smsFingerprint("1", { ...sms, text: "Code 2" }));
  });
});
