import type { TripListItem } from "@/lib/tripProfitBoard";

export function TripSelector({
  trips,
  selectedTripId,
  onSelectTrip,
}: {
  trips: TripListItem[];
  selectedTripId: number | null;
  onSelectTrip: (id: number) => void;
}) {
  return (
    <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
      行程選擇器
      <select
        aria-label="選擇行程"
        value={selectedTripId ?? ""}
        onChange={(event) => {
          const selected = trips.find(
            (trip) => String(trip.id) === event.target.value,
          );
          if (selected) onSelectTrip(selected.id);
        }}
        className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {trips.map((trip) => (
          <option key={trip.id} value={trip.id}>
            {trip.name}
          </option>
        ))}
      </select>
    </label>
  );
}
