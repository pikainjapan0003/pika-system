import type { IconType } from "react-icons";
import {
  FiBarChart2,
  FiBox,
  FiClipboard,
  FiHome,
  FiMoreHorizontal,
} from "react-icons/fi";
import { useLocation } from "wouter";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type BottomNavigationItem =
  | "home"
  | "kpi"
  | "products"
  | "orders"
  | "more";

const ITEMS: Array<{
  key: BottomNavigationItem;
  label: string;
  path: string;
  icon: IconType;
}> = [
  { key: "home", label: "首頁", path: "/dashboard", icon: FiHome },
  {
    key: "kpi",
    label: "KPI",
    path: "/reports/monthly-profit?view=kpi",
    icon: FiBarChart2,
  },
  { key: "products", label: "商品", path: "/products", icon: FiBox },
  { key: "orders", label: "訂單", path: "/orders", icon: FiClipboard },
  { key: "more", label: "更多", path: "/settings", icon: FiMoreHorizontal },
];

export function BottomNavigation({ active }: { active: BottomNavigationItem }) {
  const [, setLocation] = useLocation();

  return (
    <TooltipProvider delayDuration={350}>
      <nav
        aria-label="主要導覽"
        className="fixed bottom-2 left-1/2 z-50 min-h-[calc(88px+env(safe-area-inset-bottom))] w-[calc(100%-24px)] max-w-[560px] -translate-x-1/2 rounded-[20px] border border-border bg-card/95 px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 shadow-lg backdrop-blur"
      >
        <div className="grid grid-cols-5 gap-1">
          {ITEMS.map((item) => {
            const Icon = item.icon;
            const selected = active === item.key;

            return (
              <Tooltip key={item.key}>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    aria-current={selected ? "page" : undefined}
                    aria-label={item.label}
                    onClick={() => setLocation(item.path)}
                    className={cn(
                      "h-[70px] min-w-0 flex-col gap-1 rounded-[14px] px-1 py-1 text-[11px] transition-[color,background-color] duration-200 motion-reduce:transition-none",
                      selected
                        ? "text-primary"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-7 place-items-center rounded-full border transition-colors duration-200 motion-reduce:transition-none",
                        selected
                          ? "border-primary bg-primary/10"
                          : "border-transparent",
                      )}
                      aria-hidden="true"
                    >
                      <Icon className="size-4" />
                    </span>
                    <span className="truncate">{item.label}</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">{item.label}</TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </nav>
    </TooltipProvider>
  );
}
