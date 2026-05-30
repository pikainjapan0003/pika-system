import { useLocation } from "wouter";

export default function NotFound() {
  const [, setLocation] = useLocation();
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-5">
      <div className="text-center">
        <div className="text-5xl font-bold text-primary/30 mb-4">404</div>
        <h1 className="text-lg font-bold text-foreground">頁面不存在</h1>
        <p className="text-muted-foreground text-sm mt-1">您訪問的頁面不存在</p>
        <button
          onClick={() => setLocation("/")}
          className="mt-6 h-10 px-6 bg-primary text-white text-sm font-semibold rounded-xl"
        >
          回首頁
        </button>
      </div>
    </div>
  );
}
