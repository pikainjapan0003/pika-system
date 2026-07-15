import { useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListTrips,
  useCreateTrip,
  useUpdateTrip,
  useCreateTripRoute,
  useUpdateTripRoute,
  getListTripsQueryKey,
  type TripWithRoutes,
  type TripRoute,
} from "@workspace/api-client-react";
import { BottomNav } from "./Dashboard";

const inputClass =
  "w-full h-11 px-3.5 rounded-xl border border-input bg-white text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm";

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
        <label className="block text-xs text-muted-foreground mb-1">行程名稱 *</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例：2026/07 東京補貨" className={inputClass} />
      </div>
      <div>
        <label className="block text-xs text-muted-foreground mb-1">匯率（日圓 → 台幣，可留空）</label>
        <input
          type="number"
          value={exchangeRate}
          onChange={(e) => setExchangeRate(e.target.value)}
          placeholder="例：0.22"
          min="0"
          step="0.0001"
          className={inputClass}
        />
      </div>
      <div>
        <label className="block text-xs text-muted-foreground mb-1">備註（可留空）</label>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          disabled={submitting}
          onClick={() => {
            if (!name.trim()) { setError("請輸入行程名稱"); return; }
            const rate = exchangeRate.trim();
            if (rate && (isNaN(parseFloat(rate)) || parseFloat(rate) < 0)) { setError("請輸入有效的匯率"); return; }
            onSubmit({ name: name.trim(), exchangeRate: rate, notes: notes.trim() });
          }}
          className="flex-1 h-10 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-50"
        >
          {submitting ? "儲存中…" : "儲存"}
        </button>
        <button type="button" onClick={onCancel} className="h-10 px-4 rounded-xl border border-border bg-white text-sm">
          取消
        </button>
      </div>
    </div>
  );
}

function RouteForm({
  initial,
  onSubmit,
  onCancel,
  submitting,
}: {
  initial?: Partial<TripRoute>;
  onSubmit: (v: {
    areaTitle: string; startPlace: string; endPlace: string; estQty: string;
    trainJpy: string; fuelJpy: string; parkingJpy: string; etcJpy: string; cardboardJpy: string; shippingJpy: string; parcelCount: string;
  }) => void;
  onCancel: () => void;
  submitting: boolean;
}) {
  const [areaTitle, setAreaTitle] = useState(initial?.areaTitle ?? "");
  const [startPlace, setStartPlace] = useState(initial?.startPlace ?? "");
  const [endPlace, setEndPlace] = useState(initial?.endPlace ?? "");
  const [estQty, setEstQty] = useState(initial?.estQty != null ? String(initial.estQty) : "");
  const [trainJpy, setTrainJpy] = useState(initial?.trainJpy != null ? String(initial.trainJpy) : "");
  const [fuelJpy, setFuelJpy] = useState(initial?.fuelJpy != null ? String(initial.fuelJpy) : "");
  const [parkingJpy, setParkingJpy] = useState(initial?.parkingJpy != null ? String(initial.parkingJpy) : "");
  const [etcJpy, setEtcJpy] = useState(initial?.etcJpy != null ? String(initial.etcJpy) : "");
  const [cardboardJpy, setCardboardJpy] = useState(initial?.cardboardJpy != null ? String(initial.cardboardJpy) : "");
  const [shippingJpy, setShippingJpy] = useState(initial?.shippingJpy != null ? String(initial.shippingJpy) : "");
  const [parcelCount, setParcelCount] = useState(initial?.parcelCount != null ? String(initial.parcelCount) : "");
  const [error, setError] = useState("");

  const numField = (label: string, value: string, setValue: (v: string) => void) => (
    <div>
      <label className="block text-xs text-muted-foreground mb-1">{label}</label>
      <input type="number" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0" min="0" step="1" className={inputClass} />
    </div>
  );

  return (
    <div className="bg-secondary/40 rounded-xl p-3 space-y-2.5">
      <div>
        <label className="block text-xs text-muted-foreground mb-1">路線名稱 *</label>
        <input value={areaTitle} onChange={(e) => setAreaTitle(e.target.value)} placeholder="例：東京市區" className={inputClass} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">起點 *</label>
          <input value={startPlace} onChange={(e) => setStartPlace(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">終點 *</label>
          <input value={endPlace} onChange={(e) => setEndPlace(e.target.value)} className={inputClass} />
        </div>
      </div>
      {numField("預估件數 *", estQty, setEstQty)}
      <div className="grid grid-cols-2 gap-2">
        {numField("電車費 (¥)", trainJpy, setTrainJpy)}
        {numField("油資 (¥)", fuelJpy, setFuelJpy)}
        {numField("停車費 (¥)", parkingJpy, setParkingJpy)}
        {numField("ETC 費用 (¥) *", etcJpy, setEtcJpy)}
        {numField("紙箱費 (¥)", cardboardJpy, setCardboardJpy)}
        {numField("日本境內運費 (¥)", shippingJpy, setShippingJpy)}
        {numField("包裹數", parcelCount, setParcelCount)}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          disabled={submitting}
          onClick={() => {
            if (!areaTitle.trim() || !startPlace.trim() || !endPlace.trim()) { setError("請填寫路線名稱、起點與終點"); return; }
            const qty = parseInt(estQty, 10);
            if (!Number.isFinite(qty) || qty < 1) { setError("預估件數需為大於 0 的整數"); return; }
            if (etcJpy.trim() === "" || !/^\d+(?:\.\d+)?$/.test(etcJpy.trim())) { setError("請手動填寫 ETC 費用，可填 0"); return; }
            onSubmit({ areaTitle: areaTitle.trim(), startPlace: startPlace.trim(), endPlace: endPlace.trim(), estQty, trainJpy, fuelJpy, parkingJpy, etcJpy, cardboardJpy, shippingJpy, parcelCount });
          }}
          className="flex-1 h-10 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-50"
        >
          {submitting ? "儲存中…" : "儲存"}
        </button>
        <button type="button" onClick={onCancel} className="h-10 px-4 rounded-xl border border-border bg-white text-sm">
          取消
        </button>
      </div>
    </div>
  );
}

function TripCard({ trip }: { trip: TripWithRoutes }) {
  const qc = useQueryClient();
  const updateTrip = useUpdateTrip();
  const createRoute = useCreateTripRoute();
  const updateRoute = useUpdateTripRoute();

  const [editingTrip, setEditingTrip] = useState(false);
  const [addingRoute, setAddingRoute] = useState(false);
  const [editingRouteId, setEditingRouteId] = useState<number | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: getListTripsQueryKey() });

  return (
    <div className="bg-white rounded-2xl border border-border overflow-hidden">
      <div className="px-4 py-3.5 border-b border-border flex items-start justify-between gap-2">
        {editingTrip ? (
          <div className="flex-1">
            <TripForm
              initial={{ name: trip.name, exchangeRate: trip.exchangeRate != null ? String(trip.exchangeRate) : "", notes: trip.notes ?? "" }}
              submitting={updateTrip.isPending}
              onCancel={() => setEditingTrip(false)}
              onSubmit={async (v) => {
                await updateTrip.mutateAsync({
                  tripId: trip.id,
                  data: {
                    name: v.name,
                    exchangeRate: v.exchangeRate ? parseFloat(v.exchangeRate) : null,
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
                {trip.exchangeRate != null ? `匯率 ${trip.exchangeRate}` : "匯率未設定"}
                {trip.notes ? ` · ${trip.notes}` : ""}
              </p>
            </div>
            <button type="button" onClick={() => setEditingTrip(true)} className="shrink-0 text-xs font-medium text-primary border border-primary/30 px-2.5 py-1 rounded-lg">
              編輯
            </button>
          </>
        )}
      </div>

      <div className="divide-y divide-border/60">
        {(trip.routes ?? []).map((route) =>
          editingRouteId === route.id ? (
            <div key={route.id} className="px-4 py-3">
              <RouteForm
                initial={route}
                submitting={updateRoute.isPending}
                onCancel={() => setEditingRouteId(null)}
                onSubmit={async (v) => {
                  await updateRoute.mutateAsync({
                    tripId: trip.id,
                    routeId: route.id,
                    data: {
                      areaTitle: v.areaTitle,
                      startPlace: v.startPlace,
                      endPlace: v.endPlace,
                      estQty: parseInt(v.estQty, 10),
                      trainJpy: v.trainJpy ? parseFloat(v.trainJpy) : 0,
                      fuelJpy: v.fuelJpy ? parseFloat(v.fuelJpy) : 0,
                      parkingJpy: v.parkingJpy ? parseFloat(v.parkingJpy) : 0,
                      etcJpy: parseFloat(v.etcJpy),
                      cardboardJpy: v.cardboardJpy ? parseFloat(v.cardboardJpy) : 0,
                      shippingJpy: v.shippingJpy ? parseFloat(v.shippingJpy) : 0,
                      parcelCount: v.parcelCount ? parseInt(v.parcelCount, 10) : 0,
                    },
                  });
                  invalidate();
                  setEditingRouteId(null);
                }}
              />
            </div>
          ) : (
            <div key={route.id} className="px-4 py-3 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{route.areaTitle}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{route.startPlace} → {route.endPlace} · 預估 {route.estQty} 件</p>
                <p className="text-[11px] text-muted-foreground/80 mt-0.5">
                  電車 ¥{route.trainJpy} · 油資 ¥{route.fuelJpy} · 停車 ¥{route.parkingJpy} · ETC {route.etcJpy == null ? "待確認" : `¥${route.etcJpy}`} · 紙箱 ¥{route.cardboardJpy} · 日本境內運費 ¥{route.shippingJpy} · 包裹 {route.parcelCount}
                </p>
              </div>
              <button type="button" onClick={() => setEditingRouteId(route.id)} className="shrink-0 text-xs font-medium text-primary border border-primary/30 px-2.5 py-1 rounded-lg">
                編輯
              </button>
            </div>
          ),
        )}
      </div>

      <div className="px-4 py-3">
        {addingRoute ? (
          <RouteForm
            submitting={createRoute.isPending}
            onCancel={() => setAddingRoute(false)}
            onSubmit={async (v) => {
              await createRoute.mutateAsync({
                tripId: trip.id,
                data: {
                  areaTitle: v.areaTitle,
                  startPlace: v.startPlace,
                  endPlace: v.endPlace,
                  estQty: parseInt(v.estQty, 10),
                  trainJpy: v.trainJpy ? parseFloat(v.trainJpy) : undefined,
                  fuelJpy: v.fuelJpy ? parseFloat(v.fuelJpy) : undefined,
                  parkingJpy: v.parkingJpy ? parseFloat(v.parkingJpy) : undefined,
                  etcJpy: parseFloat(v.etcJpy),
                  cardboardJpy: v.cardboardJpy ? parseFloat(v.cardboardJpy) : undefined,
                  shippingJpy: v.shippingJpy ? parseFloat(v.shippingJpy) : undefined,
                  parcelCount: v.parcelCount ? parseInt(v.parcelCount, 10) : undefined,
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
  const { data: trips, isLoading } = useListTrips();
  const createTrip = useCreateTrip();
  const [addingTrip, setAddingTrip] = useState(false);

  return (
    <div className="min-h-[100dvh] bg-background max-w-[480px] mx-auto pb-24">
      <header className="bg-white border-b border-border px-5 pt-10 pb-4 sticky top-0 z-10">
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
            <h1 className="text-lg font-bold text-foreground">行程與路線管理</h1>
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
          <div className="bg-white rounded-2xl border border-border px-5 py-8 text-center">
            <p className="text-sm text-muted-foreground">尚未建立任何行程</p>
          </div>
        )}

        {(trips ?? []).map((trip) => (
          <TripCard key={trip.id} trip={trip} />
        ))}

        {addingTrip ? (
          <div className="bg-white rounded-2xl border border-border p-4">
            <TripForm
              submitting={createTrip.isPending}
              onCancel={() => setAddingTrip(false)}
              onSubmit={async (v) => {
                await createTrip.mutateAsync({
                  data: {
                    name: v.name,
                    exchangeRate: v.exchangeRate ? parseFloat(v.exchangeRate) : undefined,
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
