"""Independent exact-rational arithmetic audit; does not import the JS engine."""
import json
import sys
from fractions import Fraction as F


def ceiling(value, step=1):
    units = value / step
    return F(-(-units.numerator // units.denominator) * step)


rows = json.load(sys.stdin)
checks = 0
for row in rows:
    mode, draft, rate, actual = row["mode"], row["draft"], row["rate"], row["actual"]
    p, w, t, r = F(draft["price"]), F(draft["weight"]), F(draft["traffic"]), F(rate)
    a = F("52.5") if mode == "boutique" else F(draft["air"])
    q = (p * F("0.9155") if draft["qMode"] == "auto" else F(draft["q"])) if mode == "boutique" else p
    air = w * a / 1000
    cost = q * r * F("1.015") + air
    if mode != "general":
        cost += t
    if mode == "boutique":
        cost += p * r * F("0.0155")
        assert F(actual["q"]) == q
    assert F(actual["cost"]) == cost, (mode, draft, actual["cost"], str(cost))
    if mode == "general":
        sale = ceiling(cost * 2 + 5 if p <= 100 else cost + (20 if p <= 500 else 40 if p <= 650 else 50), 5)
        if draft["includeTraffic"]:
            sale = ceiling(sale + t, 5)
        sales = [sale, sale - (10 if draft["includeTraffic"] else 5)]
    elif mode == "jam":
        sale = ceiling(cost + (80 if p <= 600 else 90 if p <= 700 else 110 if p <= 900 else 130), 5)
        sales = [sale, sale - 10]
    elif mode == "ip":
        sales = []
        for factor in [F("0.35"), F("0.31"), F("0.29"), F("0.28"), F("0.26")]:
            base = p * factor + (0 if factor == F("0.35") else t)
            sales.extend([ceiling(base) if factor == F("0.31") else base, ceiling(base + air)])
    else:
        profit = F(250) if q < 5000 else F(300) if q < 6000 else F(350) if q < 7000 else q * (F("0.04") if q < 30000 else F("0.03") if q < 267000 else F("0.02"))
        sales = [ceiling(cost + profit)]
        if draft["vip"]:
            sales.append(F(draft["vip"]))
    assert len(sales) == len(actual["quotes"])
    for index, (sale, quote) in enumerate(zip(sales, actual["quotes"])):
        assert F(quote["sale"]) == sale
        assert F(quote["profit"]) == sale - cost
        warned = sale - cost < [100, 100, 100, 80, 50][index // 2] if mode == "ip" else mode == "boutique" and index == 1 and sale < cost
        assert bool(quote.get("warning")) == warned
        checks += 3
    checks += 1
print(f"PASS: exact Fraction audit, {len(rows)} cases, {checks} cost/sale/profit/warning assertions; no JS formula imports")
