import { useEffect, useRef, useState } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useAuth, useClerk, useUser } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { Switch, Route, Redirect, useLocation, Router as WouterRouter } from "wouter";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { queryClient } from "@/lib/queryClient";
import { useGetMyStore, useCreateStore, getGetMyStoreQueryKey, setAuthTokenGetter } from "@workspace/api-client-react";
import { applyBrandColor, DEFAULT_BRAND_PRIMARY_COLOR } from "@/lib/brandColor";

import HomePage from "@/pages/Home";
import DashboardPage from "@/pages/Dashboard";
import ProductsPage from "@/pages/Products";
import ProductFormPage from "@/pages/ProductForm";
import OrdersPage from "@/pages/Orders";
import SetupPage from "@/pages/Setup";
import PublicOrderPage from "@/pages/PublicOrder";
import TrackLookupPage from "@/pages/TrackLookup";
import TrackOrderPage from "@/pages/TrackOrder";
import SettingsPage from "@/pages/Settings";
import AgentSettingsPage from "@/pages/AgentSettings";
import GuidePage from "@/pages/Guide";
import DevHandoffPage from "@/pages/DevHandoff";
import ProductCategoriesPage from "@/pages/ProductCategories";
import Cvs711ReturnPage from "@/pages/Cvs711Return";
import Cvs711SelectPage from "@/pages/Cvs711Select";
import NotFoundPage from "@/pages/not-found";

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: DEFAULT_BRAND_PRIMARY_COLOR,
    colorForeground: "hsl(20,15%,15%)",
    colorMutedForeground: "hsl(20,10%,50%)",
    colorDanger: "hsl(0,72%,51%)",
    colorBackground: "hsl(36,33%,97%)",
    colorInput: "hsl(30,15%,88%)",
    colorInputForeground: "hsl(20,15%,15%)",
    colorNeutral: "hsl(30,15%,70%)",
    fontFamily: "'Noto Sans TC', 'PingFang TC', sans-serif",
    borderRadius: "0.75rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-white rounded-2xl w-[440px] max-w-full overflow-hidden shadow-lg",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-foreground font-bold",
    headerSubtitle: "text-muted-foreground",
    socialButtonsBlockButtonText: "text-foreground",
    formFieldLabel: "text-foreground font-medium",
    footerActionLink: "text-primary font-medium",
    footerActionText: "text-muted-foreground",
    dividerText: "text-muted-foreground",
    identityPreviewEditButton: "text-primary",
    formFieldSuccessText: "text-green-600",
    alertText: "text-foreground",
    logoBox: "mb-2",
    logoImage: "h-10",
    socialButtonsBlockButton: "border border-border bg-white hover:bg-secondary",
    formButtonPrimary: "bg-primary hover:opacity-90 text-white",
    formFieldInput: "border-input bg-white text-foreground",
    footerAction: "border-t border-border",
    dividerLine: "bg-border",
    alert: "bg-secondary border-border",
    otpCodeFieldInput: "border-input",
    formFieldRow: "",
    main: "p-6",
  },
};

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

function MerchantPortal() {
  const { isLoaded, isSignedIn } = useUser();
  const qc = useQueryClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: store, isLoading, error } = useGetMyStore({ query: { enabled: !!isSignedIn } as any });
  const { mutateAsync: createStoreMutate } = useCreateStore();

  const { signOut } = useClerk();

  const [storeInitState, setStoreInitState] = useState<"idle" | "creating" | "failed">("idle");
  const [storeInitError, setStoreInitError] = useState("");

  useEffect(() => {
    applyBrandColor(store?.brandPrimaryColor ?? DEFAULT_BRAND_PRIMARY_COLOR);
  }, [store?.brandPrimaryColor]);
  const createAttemptedRef = useRef(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const errorStatus = (error as any)?.status as number | undefined;
  const is404 = !!error && errorStatus === 404;
  const isAuthError = !!error && (errorStatus === 401 || errorStatus === 403);

  useEffect(() => {
    if (!isSignedIn || !is404 || storeInitState !== "idle" || createAttemptedRef.current) return;
    createAttemptedRef.current = true;
    setStoreInitState("creating");

    const genSlug = () => `store-${Math.random().toString(36).slice(2, 8)}`;
    (async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await createStoreMutate({ data: { name: "我的代購店", slug: genSlug() } });
          await qc.invalidateQueries({ queryKey: getGetMyStoreQueryKey() });
          setStoreInitState("idle");
          return;
        } catch (err: any) {
          if (err?.status !== 409) break;
        }
      }
      setStoreInitState("failed");
      setStoreInitError("初始化店鋪失敗，請稍後再試");
      createAttemptedRef.current = false;
    })();
    // createStoreMutate and qc are stable React Query references
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn, is404, storeInitState]);

  if (!isLoaded || isLoading || storeInitState === "creating" || (is404 && !!isSignedIn && storeInitState === "idle")) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center flex-col gap-3">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        {storeInitState === "creating" && (
          <p className="text-sm text-muted-foreground">正在初始化您的店鋪...</p>
        )}
      </div>
    );
  }

  if (!isSignedIn) return <Redirect to="/" />;

  if (storeInitState === "failed") {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center px-5">
        <div className="w-full max-w-sm bg-white rounded-2xl p-6 border border-border space-y-4 text-center">
          <p className="font-medium text-foreground">初始化店鋪失敗</p>
          <p className="text-sm text-muted-foreground">{storeInitError}</p>
          <button
            onClick={() => setStoreInitState("idle")}
            className="w-full h-11 bg-primary text-white font-semibold rounded-xl text-sm"
          >
            重試
          </button>
        </div>
      </div>
    );
  }

  if (isAuthError) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center px-5">
        <div className="w-full max-w-sm bg-white rounded-2xl p-6 border border-border space-y-4 text-center">
          <p className="font-medium text-foreground">登入狀態已失效</p>
          <p className="text-sm text-muted-foreground">請重新登入後繼續使用代購系統。</p>
          <button
            onClick={() => void signOut({ redirectUrl: basePath || "/" })}
            className="w-full h-11 bg-primary text-white font-semibold rounded-xl text-sm"
          >
            重新登入
          </button>
        </div>
      </div>
    );
  }

  if (error && !is404) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center px-5">
        <div className="w-full max-w-sm bg-white rounded-2xl p-6 border border-border text-center">
          <p className="font-medium text-foreground">無法載入店鋪資料</p>
          <p className="text-sm text-muted-foreground mt-2">請確認網路連線後重新整理頁面</p>
        </div>
      </div>
    );
  }

  if (!store) return null;

  return (
    <Switch>
      <Route path="/dashboard" component={DashboardPage} />
      <Route path="/products/new">
        {() => <ProductFormPage />}
      </Route>
      <Route path="/products/:productId/edit">
        {(params) => <ProductFormPage productId={Number(params.productId)} />}
      </Route>
      <Route path="/products" component={ProductsPage} />
      <Route path="/categories" component={ProductCategoriesPage} />
      <Route path="/orders" component={OrdersPage} />
      <Route path="/settings/agent" component={AgentSettingsPage} />
      <Route path="/settings" component={SettingsPage} />
      <Route path="/guide" component={GuidePage} />
      <Route component={NotFoundPage} />
    </Switch>
  );
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/dashboard" />
      </Show>
      <Show when="signed-out">
        <HomePage />
      </Show>
    </>
  );
}

function SetupRoute() {
  const { isSignedIn } = useUser();
  if (!isSignedIn) return <Redirect to="/" />;
  return <SetupPage />;
}

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={HomeRedirect} />
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={SignUpPage} />
      <Route path="/p/:shareToken">
        {(params) => <PublicOrderPage shareToken={params.shareToken} />}
      </Route>
      <Route path="/track">
        {() => <TrackLookupPage />}
      </Route>
      <Route path="/track/:publicToken">
        {(params) => <TrackOrderPage publicToken={params.publicToken} />}
      </Route>
      <Route path="/cvs/711/select" component={Cvs711SelectPage} />
      <Route path="/cvs/711/return" component={Cvs711ReturnPage} />
      <Route path="/setup" component={SetupRoute} />
      <Route path="/dev/handoff" component={DevHandoffPage} />
      <Route path="/dashboard" component={MerchantPortal} />
      <Route path="/products/*?" component={MerchantPortal} />
      <Route path="/categories" component={MerchantPortal} />
      <Route path="/orders" component={MerchantPortal} />
      <Route path="/settings/agent" component={MerchantPortal} />
      <Route path="/settings" component={MerchantPortal} />
      <Route path="/guide" component={MerchantPortal} />
      <Route component={NotFoundPage} />
    </Switch>
  );
}

function ClerkTokenBridge() {
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  useEffect(() => {
    setAuthTokenGetter(() => getTokenRef.current());
    return () => { setAuthTokenGetter(null); };
  }, []);

  return null;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: "商家登入",
            subtitle: "登入您的揪單帳號",
          },
        },
        signUp: {
          start: {
            title: "建立帳號",
            subtitle: "開始管理您的團購訂單",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <ClerkTokenBridge />
        <AppRouter />
        <Toaster />
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
