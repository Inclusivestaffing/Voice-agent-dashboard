import { describe, expect, it } from "vitest";
import { safeNext, safeEqual, assertPublicHttpsUrl, isValidTimezone, HEX_COLOR } from "@/lib/security";
import { parseFilters, resolveRange, filtersToQuery } from "@/lib/filters";
import { ruleNarrative } from "@/lib/reports/snapshot";
import { demoSnapshot, demoCalls, filterDemo } from "@/lib/demo/openWater";
import { unverifiedNumbers } from "@/lib/reports/numbers";

describe("open-redirect protection", () => {
  it.each([["/w/acme/overview", "/w/acme/overview"], ["//evil.example", "/workspaces"], ["/\\evil.example", "/workspaces"],
    ["https://evil.example", "/workspaces"], ["javascript:alert(1)", "/workspaces"], ["/ok\r\nSet-Cookie: x", "/workspaces"], [null, "/workspaces"]])(
    "safeNext(%s) → %s", (input, out) => expect(safeNext(input as string | null)).toBe(out));
});

describe("constant-time compare", () => {
  it("matches only identical strings", () => {
    expect(safeEqual("Bearer abc", "Bearer abc")).toBe(true);
    expect(safeEqual("Bearer abc", "Bearer abd")).toBe(false);
    expect(safeEqual("short", "longer-value")).toBe(false);
  });
});

describe("SSRF guard for alert webhooks", () => {
  it.each(["http://hooks.example.com/x", "https://127.0.0.1/x", "https://169.254.169.254/latest/meta-data", "https://10.0.0.5/",
    "https://192.168.1.10/", "https://[::1]/", "https://localhost/hook", "https://user:pw@hooks.example.com/", "https://hooks.example.com:8443/"])(
    "rejects %s", async (u) => { await expect(assertPublicHttpsUrl(u)).rejects.toThrow(); });
  it("accepts a public https IP literal", async () => { await expect(assertPublicHttpsUrl("https://8.8.8.8/hook")).resolves.toBeInstanceOf(URL); });
});

describe("input validation helpers", () => {
  it("timezones and colors", () => {
    expect(isValidTimezone("America/Chicago")).toBe(true);
    expect(isValidTimezone("Mars/Olympus")).toBe(false);
    expect(HEX_COLOR.test("#facc15")).toBe(true);
    expect(HEX_COLOR.test("red;background:url(x)")).toBe(false);
  });
});

describe("filters: PostgREST injection hardening", () => {
  it("drops unsafe JSON keys from cf./md./dv. params", () => {
    const f = parseFilters(new URLSearchParams("cf.call_reason=pricing&cf.a)or(1=1=x&md.source=web&dv.bad-key=1&dv.business=OWM"));
    expect(f.custom).toEqual({ call_reason: "pricing" });
    expect(f.metadata).toEqual({ source: "web" });
    expect(f.dynVars).toEqual({ business: "OWM" });
  });
  it("only accepts known call types and round-trips through the URL", () => {
    const f = parseFilters(new URLSearchParams("call_type=web_call,evil&call_id=abc&batch_call_id=b1"));
    expect(f.callType).toEqual(["web_call"]);
    const q = new URLSearchParams(filtersToQuery(f));
    expect(q.get("call_id")).toBe("abc");
    expect(q.get("batch_call_id")).toBe("b1");
  });
});

describe("Retell date presets (workspace timezone)", () => {
  const now = new Date("2026-09-17T15:00:00Z"); // Thu 10:00 in Chicago
  const tz = "America/Chicago";
  it("today starts at local midnight", () => expect(resolveRange("today", null, null, now, tz).from).toBe("2026-09-17T05:00:00.000Z"));
  it("week to date starts Monday", () => expect(resolveRange("wtd", null, null, now, tz).from).toBe("2026-09-14T05:00:00.000Z"));
  it("month to date", () => expect(resolveRange("mtd", null, null, now, tz).from).toBe("2026-09-01T05:00:00.000Z"));
  it("year to date (CST in January)", () => expect(resolveRange("ytd", null, null, now, tz).from).toBe("2026-01-01T06:00:00.000Z"));
  it("last 4 weeks = 28 days", () => expect(Date.parse(resolveRange("4w", null, null, now, tz).from)).toBe(+now - 28 * 86400_000));
  it("custom range covers the whole end day", () => {
    const r = resolveRange("custom", "2026-08-27", "2026-09-30", now, tz);
    expect(r.from).toBe("2026-08-27T05:00:00.000Z");
    expect(r.to).toBe("2026-10-01T04:59:59.999Z");
  });
  it("invalid custom dates fall back to the default", () => {
    expect(Date.parse(resolveRange("custom", "garbage", "2026-01-01", now, tz).from)).toBe(+now - 28 * 86400_000);
  });
});

describe("rule-based report summary", () => {
  const f = parseFilters(new URLSearchParams("range=custom&from=2026-08-27&to=2026-09-30"), "America/Chicago");
  const snap = demoSnapshot(f);
  const n = ruleNarrative(snap);
  it("covers every call in the sample", () => {
    expect(snap.summary.total).toBe(44);
    expect(filterDemo(demoCalls(), f).length).toBe(44);
  });
  it("only uses numbers that exist in the snapshot", () => expect(unverifiedNumbers(n, snap)).toEqual([]));
  it("mentions the headline facts", () => {
    expect(n.headline).toContain("44 calls");
    expect(n.what_worked.join(" ")).toContain("13 of 15");
  });
});
