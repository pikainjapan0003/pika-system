import { useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMyStore,
  useListTrips,
  useCreateTrip,
  useUpdateTrip,
  useCreateTripRoute,
  useUpdateTripRoute,
  useListTripAreas,
  useCreateTripArea,
  useUpdateTripArea,
  getListTripsQueryKey,
  getListTripAreasQueryKey,
  type TripWithRoutes,
  type TripRoute,
  type TripArea,
  type TripAreaCost,
} from "@workspace/api-client-react";
import { BottomNav } from "./Dashboard";
import { ExchangeRateReferenceHint } from "@/components/ExchangeRateReferenceHint";
import { formatActionableError } from "@/lib/actionableError";

const inputClass =
  "w-full h-11 px-3.5 rounded-xl border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm tabular-nums lining-nums";

function TripForm({
  initial,
  onSubmit,
  onCancel,
  submitting,
}: {
  initial?: { name: string; exchangeRate: string; notes: string };
  onSubmit: (v: { name: string; exchangeRate: string; notes: string }) => void;
  onCancel: () => void;
  submitting: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [exchangeRate, setExchangeRate] = useState(initial?.exchangeRate ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [error, setError] = useState("");

  return (
    <div className="bg-secondary/40 rounded-xl p-3 space-y-2.5">
      <div>
        <label className="block text-xs text-muted-foreground mb-1">
          行程名稱 *
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例：2026/07 東京補貨"
          className={inputClass}
        />
      </div>
      <div>
        <label className="block text-xs text-muted-foreground mb-1">
          匯率（日圓 → 台幣，可留空）
        </label>
        <input
          type="number"
          value={exchangeRate}
          onChange={(e) => setExchangeRate(e.target.value)}
          placeholder="例：0.22"
          min="0"
          step="0.0001"
          className={inputClass}
        />
        <ExchangeRateReferenceHint context="trip" onApply={setExchangeRate} />
      </div>
      <div>
        <label className="block text-xs text-muted-foreground mb-1">
          備註（可留空）
        </label>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className={inputClass}
        />
      </div>
      {error && (
        <p className="text-xs text-destructive whitespace-pre-line">{error}</p>
      )}
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          disabled={submitting}
          onClick={() => {
            if (!name.trim()) {
              setError(
                formatActionableError({
                  happened: "行程沒有儲存。",
                  reason: "行程名稱尚未填寫。",
                  action: "請輸入容易辨識的行程名稱。",
                  support: "若仍無法儲存，請截圖交給系統管理者。",
                }),
              );
              return;
            }
            const rate = exchangeRate.trim();
            if (rate && (isNaN(parseFloat(rate)) || parseFloat(rate) < 0)) {
              setError(
                formatActionableError({
                  happened: "行程沒有儲存。",
                  reason: "匯率必須是 0 以上的數字，或留空表示待確認。",
                  action: "請修正匯率，或清空欄位後再儲存。",
                  support: "不確定匯率時可先留空。",
                }),
              );
              return;
            }
            onSubmit({
              name: name.trim(),
              exchangeRate: rate,
              notes: notes.trim(),
            });
          }}
          className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
        >
          {submitting ? "儲存中…" : "儲存"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="h-10 px-4 rounded-xl border border-border bg-card text-sm"
        >
          取消
        </button>
      </div>
    </div>
  );
}

function RouteForm({
  initial,
  areas,
  onSubmit,
  onCancel,
  submitting,
}: {
  initial?: Partial<TripRoute>;
  areas: TripArea[];
  onSubmit: (v: {
    tripAreaId: number | null;
    areaTitle: string;
    startPlace: string;
    endPlace: string;
    estQty: string;
    trainJpy: string;
    fuelJpy: string;
    parkingJpy: string;
    etcJpy: string;
  }) => void;
  onCancel: () => void;
  submitting: boolean;
}) {
  const [tripAreaId, setTripAreaId] = useState(
    initial?.tripAreaId != null ? String(initial.tripAreaId) : "",
  );
  const [areaTitle, setAreaTitle] = useState(initial?.areaTitle ?? "");
  const [startPlace, setStartPlace] = useState(initial?.startPlace ?? "");
  const [endPlace, setEndPlace] = useState(initial?.endPlace ?? "");
  const [estQty, setEstQty] = useState(
    initial?.estQty != null ? String(initial.estQty) : "",
  );
  const [trainJpy, setTrainJpy] = useState(
    initial?.trainJpy != null ? String(initial.trainJpy) : "",
  );
  const [fuelJpy, setFuelJpy] = useState(
    initial?.fuelJpy != null ? String(initial.fuelJpy) : "",
  );
  const [parkingJpy, setParkingJpy] = useState(
    initial?.parkingJpy != null ? String(initial.parkingJpy) : "",
  );
  const [etcJpy, setEtcJpy] = useState(
    initial?.etcJpy != null ? String(initial.etcJpy) : "",
  );
  const [error, setError] = useState("");

  const numField = (
    label: string,
    value: string,
    setValue: (v: string) => void,
  ) => (
    <div>
      <label className="block text-xs text-muted-foreground mb-1">
        {label}
      </label>
      <input
        type="number"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="0"
        min="0"
        step="1"
        className={inputClass}
      />
    </div>
  );

  return (
    <div className="bg-secondary/40 rounded-xl p-3 space-y-2.5">
      <div>
        <label className="block text-xs text-muted-foreground mb-1">
          所屬大區
        </label>
        <select
          aria-label="所屬大區"
          value={tripAreaId}
          onChange={(e) => setTripAreaId(e.target.value)}
          className={inputClass}
        >
          <option value="">未指定</option>
          {areas.map((area) => (
            <option key={area.id} value={area.id}>
              {area.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs text-muted-foreground mb-1">
          路線名稱 *
        </label>
        <input
          value={areaTitle}
          onChange={(e) => setAreaTitle(e.target.value)}
          placeholder="例：東京市區"
          className={inputClass}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            起點
          </label>
          <input
            value={startPlace}
            onChange={(e) => setStartPlace(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            終點
          </label>
          <input
            value={endPlace}
            onChange={(e) => setEndPlace(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>
      {numField("預估件數 *", estQty, setEstQty)}
      <div className="grid grid-cols-2 gap-2">
        {numField("電車費 (¥)", trainJpy, setTrainJpy)}
        {numField("油資 (¥)", fuelJpy, setFuelJpy)}
        {numField("停車費 (¥)", parkingJpy, setParkingJpy)}
        {numField("ETC 費用 (¥) *", etcJpy, setEtcJpy)}
      </div>
      <p className="rounded-xl bg-card px-3 py-2 text-xs leading-relaxed text-muted-foreground">
        請填這條路線實際發生的日圓費用；ETC 必須手動填寫，可填
        0。油資留空＝待確認。系統不會自動填
        0，也不會自動推估。儲存後系統才會依已拍板公式分攤，預估件數不正確時不會用
        0 冒充成本。
      </p>
      {error && (
        <p className="text-xs text-destructive whitespace-pre-line">{error}</p>
      )}
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          disabled={submitting}
          onClick={() => {
            if (!areaTitle.trim()) {
              setError(
                formatActionableError({
                  happened: "路線沒有儲存。",
                  reason: "路線名稱仍是空白。",
                  action: "請填寫路線名稱；起點與終點可留空。",
                  support: "若仍無法儲存，請截圖交給系統管理者。",
                }),
              );
              return;
            }
            const qty = parseInt(estQty, 10);
            if (!Number.isFinite(qty) || qty < 1) {
              setError(
                formatActionableError({
                  happened: "路線沒有儲存。",
                  reason: "預估件數必須是大於 0 的整數。",
                  action: "請填入預計分攤的商品件數。",
                  support: "件數尚未確認時，請先確認後再儲存。",
                }),
              );
              return;
            }
            if (
              etcJpy.trim() === "" ||
              !/^\d+(?:\.\d+)?$/.test(etcJpy.trim())
            ) {
              setError(
                formatActionableError({
                  happened: "路線沒有儲存。",
                  reason: "ETC 費用尚未手動填寫，或格式不是非負數字。",
                  action: "請填入實際 ETC 日圓費用；沒有費用時填 0。",
                  support: "請以實際帳單為準，不要使用猜測值。",
                }),
              );
              return;
            }
            onSubmit({
              tripAreaId: tripAreaId ? parseInt(tripAreaId, 10) : null,
              areaTitle: areaTitle.trim(),
              startPlace: startPlace.trim(),
              endPlace: endPlace.trim(),
              estQty,
              trainJpy,
              fuelJpy,
              parkingJpy,
              etcJpy,
            });
          }}
          className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
        >
          {submitting ? "儲存中…" : "儲存"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="h-10 px-4 rounded-xl border border-border bg-card text-sm"
        >
          取消
        </button>
      </div>
    </div>
  );
}

type AreaFormValue = {
  name: string;
  mode: "ESTIMATE" | "ACTUAL";
  cardboardUnitJpy: string;
  shippingUnitJpy: string;
  parcelCount: string;
  estimatedItemQuantity: string;
};

function AreaForm({
  initial,
  onSubmit,
  onCancel,
  submitting,
}: {
  initial?: Partial<AreaFormValue>;
  onSubmit: (value: AreaFormValue) => void;
  onCancel: () => void;
  submitting: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [mode, setMode] = useState<"ESTIMATE" | "ACTUAL">(
    initial?.mode ?? "ESTIMATE",
  );
  const [cardboardUnitJpy, setCardboardUnitJpy] = useState(
    initial?.cardboardUnitJpy ?? "0",
  );
  const [shippingUnitJpy, setShippingUnitJpy] = useState(
    initial?.shippingUnitJpy ?? "0",
  );
  const [parcelCount, setParcelCount] = useState(initial?.parcelCount ?? "0");
  const [estimatedItemQuantity, setEstimatedItemQuantity] = useState(
    initial?.estimatedItemQuantity ?? "",
  );
  const [error, setError] = useState("");

  const numberField = (
    label: string,
    value: string,
    setValue: (value: string) => void,
    step: string,
  ) => (
    <div>
      <label className="block text-xs text-muted-foreground mb-1">
        {label}
      </label>
      <input
        type="number"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        min="0"
        step={step}
        className={inputClass}
      />
    </div>
  );

  return (
    <div className="bg-secondary/40 rounded-xl p-3 space-y-2.5">
      <div>
        <label className="block text-xs text-muted-foreground mb-1">
          大區名稱 *
        </label>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="例：東京境內運"
          className={inputClass}
        />
      </div>
      <div>
        <label className="block text-xs text-muted-foreground mb-1">
          成本模式
        </label>
        <select
          aria-label="成本模式"
          value={mode}
          onChange={(event) =>
            setMode(event.target.value as "ESTIMATE" | "ACTUAL")
          }
          className={inputClass}
        >
          <option value="ESTIMATE">預估</option>
          <option value="ACTUAL">實際</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {numberField(
          "每箱紙板單價 (¥)",
          cardboardUnitJpy,
          setCardboardUnitJpy,
          "0.01",
        )}
        {numberField(
          "每箱境內運費 (¥)",
          shippingUnitJpy,
          setShippingUnitJpy,
          "0.01",
        )}
        {numberField("箱數", parcelCount, setParcelCount, "1")}
        {numberField(
          "預計商品數",
          estimatedItemQuantity,
          setEstimatedItemQuantity,
          "1",
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        預計商品數可留空；缺值時成本計算會顯示待確認，不會以 0 代替。
      </p>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          disabled={submitting}
          onClick={() => {
            const nonNegativeDecimal = /^\d+(?:\.\d+)?$/;
            const nonNegativeInteger = /^\d+$/;
            const quantityIsValid =
              estimatedItemQuantity === "" ||
              (/^\d+$/.test(estimatedItemQuantity) &&
                parseInt(estimatedItemQuantity, 10) > 0);
            if (!name.trim()) {
              setError("請填寫大區名稱。");
              return;
            }
            if (
              !nonNegativeDecimal.test(cardboardUnitJpy) ||
              !nonNegativeDecimal.test(shippingUnitJpy) ||
              !nonNegativeInteger.test(parcelCount) ||
              !quantityIsValid
            ) {
              setError("金額與箱數必須為非負數；預計商品數須留空或大於 0。");
              return;
            }
            onSubmit({
              name: name.trim(),
              mode,
              cardboardUnitJpy,
              shippingUnitJpy,
              parcelCount,
              estimatedItemQuantity,
            });
          }}
          className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
        >
          {submitting ? "儲存中…" : "儲存大區"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="h-10 px-4 rounded-xl border border-border bg-card text-sm"
        >
          取消
        </button>
      </div>
    </div>
  );
}

function areaFormInitial(area: TripArea, cost: TripAreaCost): AreaFormValue {
  return {
    name: area.name,
    mode: cost.mode,
    cardboardUnitJpy: String(cost.cardboardUnitJpy),
    shippingUnitJpy: String(cost.shippingUnitJpy),
    parcelCount: String(cost.parcelCount),
    estimatedItemQuantity:
      cost.estimatedItemQuantity == null
        ? ""
        : String(cost.estimatedItemQuantity),
  };
}

function emptyAreaMode(
  area: TripArea,
  mode: "ESTIMATE" | "ACTUAL",
): AreaFormValue {
  return {
    name: area.name,
    mode,
    cardboardUnitJpy: "0",
    shippingUnitJpy: "0",
    parcelCount: "0",
    estimatedItemQuantity: "",
  };
}

function TripCard({
  trip,
  storeId,
}: {
  trip: TripWithRoutes;
  storeId: number;
}) {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const updateTrip = useUpdateTrip();
  const createRoute = useCreateTripRoute();
  const updateRoute = useUpdateTripRoute();
  const { data: areas = [] } = useListTripAreas(storeId, trip.id);
  const createArea = useCreateTripArea();
  const updateArea = useUpdateTripArea();

  const [editingTrip, setEditingTrip] = useState(false);
  const [addingRoute, setAddingRoute] = useState(false);
  const [editingRouteId, setEditingRouteId] = useState<number | null>(null);
  const [areaFormState, setAreaFormState] = useState<{
    areaId: number | null;
    initial?: AreaFormValue;
  } | null>(null);

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: getListTripsQueryKey() });
  const invalidateAreas = () =>
    qc.invalidateQueries({
      queryKey: getListTripAreasQueryKey(storeId, trip.id),
    });

  const saveArea = async (value: AreaFormValue) => {
    const data = {
      name: value.name,
      mode: value.mode,
      cardboardUnitJpy: parseFloat(value.cardboardUnitJpy),
      shippingUnitJpy: parseFloat(value.shippingUnitJpy),
      parcelCount: parseInt(value.parcelCount, 10),
      estimatedItemQuantity: value.estimatedItemQuantity
        ? parseInt(value.estimatedItemQuantity, 10)
        : null,
    };
    if (areaFormState?.areaId == null) {
      await createArea.mutateAsync({ storeId, tripId: trip.id, data });
    } else {
      await updateArea.mutateAsync({
        storeId,
        tripId: trip.id,
        areaId: areaFormState.areaId,
        data,
      });
    }
    invalidateAreas();
    setAreaFormState(null);
  };

  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      <div className="px-4 py-3.5 border-b border-border flex items-start justify-between gap-2">
        {editingTrip ? (
          <div className="flex-1">
            <TripForm
              initial={{
                name: trip.name,
                exchangeRate:
                  trip.exchangeRate != null ? String(trip.exchangeRate) : "",
                notes: trip.notes ?? "",
              }}
              submitting={updateTrip.isPending}
              onCancel={() => setEditingTrip(false)}
              onSubmit={async (v) => {
                await updateTrip.mutateAsync({
                  tripId: trip.id,
                  data: {
                    name: v.name,
                    exchangeRate: v.exchangeRate
                      ? parseFloat(v.exchangeRate)
                      : null,
                    notes: v.notes || null,
                  },
                });
                invalidate();
                setEditingTrip(false);
              }}
            />
          </div>
        ) : (
          <>
            <div className="min-w-0">
              <p className="text-sm font-bold text-foreground">{trip.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {trip.exchangeRate != null
                  ? `匯率 ${trip.exchangeRate}`
                  : "匯率未設定"}
                {trip.notes ? ` · ${trip.notes}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setEditingTrip(true)}
              className="shrink-0 text-xs font-medium text-primary border border-primary/30 px-2.5 py-1 rounded-lg"
            >
              編輯
            </button>
          </>
        )}
      </div>

      <div className="border-b border-border px-4 py-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-foreground">境內運大區</p>
          <button
            type="button"
            onClick={() => setAreaFormState({ areaId: null })}
            className="text-xs font-medium text-primary border border-primary/30 px-2.5 py-1 rounded-lg"
          >
            + 新增大區
          </button>
        </div>

        {areas.length === 0 && !areaFormState && (
          <p className="text-xs text-muted-foreground">尚未建立大區</p>
        )}

        {areas.map((area) => (
          <div key={area.id} className="rounded-xl border border-border p-3">
            <p className="text-sm font-medium text-foreground">{area.name}</p>
            <div className="mt-2 space-y-2">
              {area.costs.map((cost) => (
                <div
                  key={cost.id}
                  className="flex items-start justify-between gap-2 text-xs text-muted-foreground"
                >
                  <p>
                    {cost.mode === "ESTIMATE" ? "預估" : "實際"} · 每箱紙板 ¥
                    {cost.cardboardUnitJpy} · 每箱境內運 ¥{cost.shippingUnitJpy}{" "}
                    · {cost.parcelCount} 箱 · 預計商品數{" "}
                    {cost.estimatedItemQuantity ?? "待確認"}
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      setAreaFormState({
                        areaId: area.id,
                        initial: areaFormInitial(area, cost),
                      })
                    }
                    className="shrink-0 font-medium text-primary"
                  >
                    編輯{cost.mode === "ESTIMATE" ? "預估" : "實際"}
                  </button>
                </div>
              ))}
              {(["ESTIMATE", "ACTUAL"] as const)
                .filter(
                  (mode) => !area.costs.some((cost) => cost.mode === mode),
                )
                .map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() =>
                      setAreaFormState({
                        areaId: area.id,
                        initial: emptyAreaMode(area, mode),
                      })
                    }
                    className="mr-2 text-xs font-medium text-primary"
                  >
                    + {mode === "ESTIMATE" ? "預估" : "實際"}
                  </button>
                ))}
            </div>
          </div>
        ))}

        {areaFormState && (
          <AreaForm
            initial={areaFormState.initial}
            submitting={createArea.isPending || updateArea.isPending}
            onCancel={() => setAreaFormState(null)}
            onSubmit={saveArea}
          />
        )}
      </div>

      <div className="divide-y divide-border/60">
        {(trip.routes ?? []).map((route) =>
          editingRouteId === route.id ? (
            <div key={route.id} className="px-4 py-3">
              <RouteForm
                initial={route}
                areas={areas}
                submitting={updateRoute.isPending}
                onCancel={() => setEditingRouteId(null)}
                onSubmit={async (v) => {
                  await updateRoute.mutateAsync({
                    tripId: trip.id,
                    routeId: route.id,
                    data: {
                      tripAreaId: v.tripAreaId,
                      areaTitle: v.areaTitle,
                      startPlace: v.startPlace,
                      endPlace: v.endPlace,
                      estQty: parseInt(v.estQty, 10),
                      trainJpy: v.trainJpy ? parseFloat(v.trainJpy) : 0,
                      fuelJpy: v.fuelJpy ? parseFloat(v.fuelJpy) : null,
                      parkingJpy: v.parkingJpy ? parseFloat(v.parkingJpy) : 0,
                      etcJpy: parseFloat(v.etcJpy),
                    },
                  });
                  invalidate();
                  setEditingRouteId(null);
                }}
              />
            </div>
          ) : (
            <div
              key={route.id}
              className="px-4 py-3 flex items-start justify-between gap-2"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  {route.areaTitle}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {route.startPlace} → {route.endPlace} · 預估 {route.estQty} 件
                </p>
                <p className="text-[11px] text-muted-foreground/80 mt-0.5">
                  所屬大區：
                  {areas.find((area) => area.id === route.tripAreaId)?.name ??
                    "未指定"}
                </p>
                <p className="text-[11px] text-muted-foreground/80 mt-0.5">
                  電車 ¥{route.trainJpy} · 油資{" "}
                  {route.fuelJpy == null ? "待確認" : `¥${route.fuelJpy}`} ·
                  停車 ¥{route.parkingJpy} · ETC{" "}
                  {route.etcJpy == null ? "待確認" : `¥${route.etcJpy}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingRouteId(route.id)}
                className="shrink-0 text-xs font-medium text-primary border border-primary/30 px-2.5 py-1 rounded-lg"
              >
                編輯
              </button>
            </div>
          ),
        )}
      </div>

      <div className="px-4 py-3">
        <div className="mb-3 grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => setLocation(`/trips/${trip.id}/estimate`)}
            className="min-h-11 rounded-xl border border-primary/30 px-2 text-xs font-medium text-primary"
          >
            預估成本
          </button>
          <button
            type="button"
            onClick={() => setLocation(`/trips/${trip.id}/actual`)}
            className="min-h-11 rounded-xl border border-primary/30 px-2 text-xs font-medium text-primary"
          >
            實際成本
          </button>
          <button
            type="button"
            onClick={() => setLocation(`/trips/${trip.id}/comparison`)}
            className="min-h-11 rounded-xl border border-primary/30 px-2 text-xs font-medium text-primary"
          >
            預估比較
          </button>
        </div>
        {addingRoute ? (
          <RouteForm
            areas={areas}
            submitting={createRoute.isPending}
            onCancel={() => setAddingRoute(false)}
            onSubmit={async (v) => {
              await createRoute.mutateAsync({
                tripId: trip.id,
                data: {
                  tripAreaId: v.tripAreaId,
                  areaTitle: v.areaTitle,
                  startPlace: v.startPlace,
                  endPlace: v.endPlace,
                  estQty: parseInt(v.estQty, 10),
                  trainJpy: v.trainJpy ? parseFloat(v.trainJpy) : undefined,
                  fuelJpy: v.fuelJpy ? parseFloat(v.fuelJpy) : null,
                  parkingJpy: v.parkingJpy
                    ? parseFloat(v.parkingJpy)
                    : undefined,
                  etcJpy: parseFloat(v.etcJpy),
                },
              });
              invalidate();
              setAddingRoute(false);
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setAddingRoute(true)}
            className="w-full h-10 rounded-xl border-2 border-dashed border-border text-sm font-medium text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
          >
            + 新增路線
          </button>
        )}
      </div>
    </div>
  );
}

export default function TripsPage() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { data: store } = useGetMyStore();
  const { data: trips, isLoading } = useListTrips();
  const createTrip = useCreateTrip();
  const [addingTrip, setAddingTrip] = useState(false);
  const storeId = store?.id;

  return (
    <div className="min-h-[100dvh] bg-background max-w-[480px] mx-auto pb-24">
      <header className="bg-card border-b border-border px-5 pt-10 pb-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setLocation("/settings")}
            className="text-muted-foreground text-xl leading-none pr-1"
            aria-label="返回"
          >
            ‹
          </button>
          <div>
            <h1 className="text-lg font-bold text-foreground">
              行程與路線管理
            </h1>
            <p className="text-xs text-muted-foreground">
              用於商品的交通成本分攤與成本快照計算。
            </p>
          </div>
        </div>
      </header>

      <div className="px-5 py-5 space-y-4">
        {isLoading && (
          <div className="flex items-center justify-center py-10">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!isLoading && (trips ?? []).length === 0 && !addingTrip && (
          <div className="bg-card rounded-2xl border border-border px-5 py-8 text-center">
            <p className="text-sm text-muted-foreground">尚未建立任何行程</p>
          </div>
        )}

        {storeId != null &&
          storeId > 0 &&
          (trips ?? []).map((trip) => (
            <TripCard key={trip.id} trip={trip} storeId={storeId} />
          ))}

        {addingTrip ? (
          <div className="bg-card rounded-2xl border border-border p-4">
            <TripForm
              submitting={createTrip.isPending}
              onCancel={() => setAddingTrip(false)}
              onSubmit={async (v) => {
                await createTrip.mutateAsync({
                  data: {
                    name: v.name,
                    exchangeRate: v.exchangeRate
                      ? parseFloat(v.exchangeRate)
                      : undefined,
                    notes: v.notes || undefined,
                  },
                });
                qc.invalidateQueries({ queryKey: getListTripsQueryKey() });
                setAddingTrip(false);
              }}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAddingTrip(true)}
            className="w-full h-11 rounded-xl border-2 border-dashed border-border text-sm font-medium text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
          >
            + 新增行程
          </button>
        )}
      </div>

      <BottomNav active="settings" />
    </div>
  );
}
