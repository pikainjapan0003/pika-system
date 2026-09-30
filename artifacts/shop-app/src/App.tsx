import { lazy, Suspense, useEffect, useRef } from "react";
import {
  ClerkProvider,
  SignIn,
  useAuth,
  useClerk,
  useUser,
} from "@clerk/react";
import { shadcn } from "@clerk/themes";
import {
  Switch,
  Route,
  Redirect,
  useLocation,
  Router as WouterRouter,
} from "wouter";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { queryClient } from "@/lib/queryClient";
import {
  useGetMyStore,
  getGetMyStoreQueryKey,
  setAuthTokenGetter,
} from "@workspace/api-client-react";
import { applyBrandColor, DEFAULT_BRAND_PRIMARY_COLOR } from "@/lib/brandColor";
import { CUSTOMER_PORTAL_ROUTE_PATTERN } from "@/lib/customerRoutes";

import PocShop from "@/pages/PocShop";
import Storefront from "@/pages/Storefront";
import DashboardPage from "@/pages/Dashboard";
import ProductsPage from "@/pages/Products";
import { CatalogBoundary, Loading as CatalogLoading } from '@/components/product-database/shared';
const ProductDatabasePage=lazy(()=>import('@/pages/ProductDatabase'));
const ProductDatabaseImportPage=lazy(()=>import('@/pages/ProductDatabaseImport'));
const ProductDatabaseDetailPage=lazy(()=>import('@/pages/ProductDatabaseDetail'));
const ProductDatabaseFormPage=lazy(()=>import('@/pages/ProductDatabaseForm'));
import ProductFormPage from "@/pages/ProductForm";
import OrdersPage from "@/pages/Orders";
import MonthlyProfitPage from "@/pages/MonthlyProfit";
import CustomersPage from "@/pages/Customers";
import CustomerDetailPage from "@/pages/CustomerDetail";
import LogisticsImportPage from "@/pages/LogisticsImport";
import LogisticsImportHistoryPage from "@/pages/LogisticsImportHistory";
import LogisticsExceptionsPage from "@/pages/LogisticsExceptions";
import PublicOrderPage from "@/pages/PublicOrder";
import TrackLookupPage from "@/pages/TrackLookup";
import TrackOrderPage from "@/pages/TrackOrder";
import SettingsPage from "@/pages/Settings";
import InvoiceOcrTestPage from "@/pages/InvoiceOcrTest";
import ExchangeRateReferencePage from "@/pages/ExchangeRateReference";
import AuditLogsPage from "@/pages/AuditLogs";
import TripsPage from "@/pages/Trips";
import GuidePage from "@/pages/Guide";
import ProductCategoriesPage from "@/pages/ProductCategories";
import Cvs711ReturnPage from "@/pages/Cvs711Return";
import Cvs711SelectPage from "@/pages/Cvs711Select";
import PublicCartPage from "@/pages/PublicCart";
import NotFoundPage from "@/pages/not-found";

const privatePoc = import.meta.env.VITE_PRIVATE_POC === "true";
// Site visibility is independent of the single-owner / synthetic-data mode.
const publicShop = import.meta.env.VITE_PUBLIC_SHOP === "true";
const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

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
    cardBox:
      "bg-white rounded-2xl w-[440px] max-w-full overflow-hidden shadow-lg",
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
    socialButtonsBlockButton:
      "border border-border bg-white hover:bg-secondary",
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
      <SignIn
        withSignUp={false}
        fallbackRedirectUrl={`${basePath}/products`}
        routing="path"
        path={`${basePath}/sign-in`}
      />
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
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
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
  const { data: store, isLoading, error } = useGetMyStore({
    query: { queryKey: getGetMyStoreQueryKey(), enabled: !!isSignedIn },
  });
  const { signOut } = useClerk();
  useEffect(() => {
    applyBrandColor(store?.brandPrimaryColor ?? DEFAULT_BRAND_PRIMARY_COLOR);
  }, [store?.brandPrimaryColor]);
  const errorStatus = (error as { status?: number } | null)?.status;
  const isAuthError = errorStatus === 401 || errorStatus === 403;
  if (!isLoaded || isLoading) {
    return <div role="status" className="flex min-h-[100dvh] items-center justify-center">載入中…</div>;
  }
  if (!isSignedIn) return <Redirect to="/sign-in" />;

  if (isAuthError) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center px-5">
        <div className="w-full max-w-sm bg-white rounded-2xl p-6 border border-border space-y-4 text-center">
          <p className="font-medium text-foreground">只有指定店主可以管理此店鋪</p>
          <p className="text-sm text-muted-foreground">
            請以指定店主帳號登入。
          </p>
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

  if (error) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center px-5">
        <div className="w-full max-w-sm bg-white rounded-2xl p-6 border border-border text-center">
          <p className="font-medium text-foreground">無法載入店鋪資料</p>
          <p className="text-sm text-muted-foreground mt-2">
            請確認網路連線後重新整理頁面
          </p>
        </div>
      </div>
    );
  }

  if (!store) return null;

  return (
      <Switch>
      <Route path="/product-database/new">{()=> <CatalogBoundary><Suspense fallback={<CatalogLoading/>}><ProductDatabaseFormPage/></Suspense></CatalogBoundary>}</Route>
      <Route path="/product-database/import">{()=> <CatalogBoundary><Suspense fallback={<CatalogLoading/>}><ProductDatabaseImportPage/></Suspense></CatalogBoundary>}</Route>
      <Route path="/product-database/matches">{()=> <CatalogBoundary><Suspense fallback={<CatalogLoading/>}><ProductDatabaseImportPage mode="matches"/></Suspense></CatalogBoundary>}</Route>
      <Route path="/product-database/:id/edit">{params=> <CatalogBoundary><Suspense fallback={<CatalogLoading/>}><ProductDatabaseFormPage productId={/^[1-9]\d*$/.test(params.id)?Number(params.id):0}/></Suspense></CatalogBoundary>}</Route>
      <Route path="/product-database/:id">{params=> <CatalogBoundary><Suspense fallback={<CatalogLoading/>}><ProductDatabaseDetailPage productId={/^[1-9]\d*$/.test(params.id)?Number(params.id):0}/></Suspense></CatalogBoundary>}</Route>
      <Route path="/product-database">{()=> <CatalogBoundary><Suspense fallback={<CatalogLoading/>}><ProductDatabasePage/></Suspense></CatalogBoundary>}</Route>
        <Route path="/dashboard" component={DashboardPage} />
        <Route path="/products/new">
          {() => (
              <ProductFormPage />
          )}
        </Route>
        <Route path="/products/:productId/edit">
          {(params) => (
              <ProductFormPage productId={Number(params.productId)} />
          )}
        </Route>
        <Route path="/products">
          {() => (
              <ProductsPage />
          )}
        </Route>
        <Route path="/categories">
          {() => (
              <ProductCategoriesPage />
          )}
        </Route>
        <Route path="/orders">
          {() => (
              <OrdersPage />
          )}
        </Route>
        <Route path="/reports/monthly-profit">
          {() => (
              <MonthlyProfitPage />
          )}
        </Route>
        <Route path="/customers">
          {() => (
              <CustomersPage />
          )}
        </Route>
        <Route path="/customers/:customerId">
          {(params) => (
              <CustomerDetailPage customerId={Number(params.customerId)} />
          )}
        </Route>
        <Route path="/logistics/import/history">
          {() => (
              <LogisticsImportHistoryPage />
          )}
        </Route>
        <Route path="/logistics/import">
          {() => (
              <LogisticsImportPage />
          )}
        </Route>
        <Route path="/logistics/exceptions">
          {() => (
              <LogisticsExceptionsPage />
          )}
        </Route>
        <Route
          path="/settings/exchange-rate-reference"
          component={ExchangeRateReferencePage}
        />
        <Route path="/audit-logs">
          {() => (
              <AuditLogsPage />
          )}
        </Route>
        <Route path="/settings/invoice-ocr" component={InvoiceOcrTestPage} />
        <Route path="/settings" component={SettingsPage} />
        <Route path="/trips" component={TripsPage} />
        <Route path="/guide">
          {() => (
              <GuidePage />
          )}
        </Route>
        <Route component={NotFoundPage} />
      </Switch>
  );
}

function HomeRedirect() {
  return publicShop ? <Storefront /> : <PocShop />;
}

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={HomeRedirect} />
      <Route path="/shop" component={Storefront} />
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={NotFoundPage} />
      <Route path="/p/:shareToken">
        {(params) => <PublicOrderPage shareToken={params.shareToken} />}
      </Route>
      <Route path="/track">{() => <TrackLookupPage />}</Route>
      <Route path="/track/:publicToken">
        {(params) => <TrackOrderPage publicToken={params.publicToken} />}
      </Route>
      <Route path="/cart" component={PublicCartPage} />
      <Route path="/cvs/711/select" component={Cvs711SelectPage} />
      <Route path="/cvs/711/return" component={Cvs711ReturnPage} />
      <Route path="/receipt-preview" component={NotFoundPage} />
      <Route path="/setup" component={NotFoundPage} />
      <Route path="/dev/handoff" component={NotFoundPage} />
      <Route path="/dashboard" component={MerchantPortal} />
      <Route path="/products/*?" component={MerchantPortal} />
      <Route path="/product-database/*?" component={MerchantPortal} />
      <Route path="/categories" component={MerchantPortal} />
      <Route path="/orders" component={MerchantPortal} />
      <Route path="/reports/monthly-profit" component={MerchantPortal} />
      {/* Keep customer detail routes inside MerchantPortal instead of falling through to 404. */}
      <Route path={CUSTOMER_PORTAL_ROUTE_PATTERN} component={MerchantPortal} />
      <Route path="/logistics/import/history" component={MerchantPortal} />
      <Route path="/logistics/import" component={MerchantPortal} />
      <Route path="/logistics/exceptions" component={MerchantPortal} />
      <Route
        path="/settings/exchange-rate-reference"
        component={MerchantPortal}
      />
      <Route path="/audit-logs" component={MerchantPortal} />
      <Route path="/settings/invoice-ocr" component={MerchantPortal} />
      <Route path="/settings" component={MerchantPortal} />
      <Route path="/trips" component={MerchantPortal} />
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
    return () => {
      setAuthTokenGetter(null);
    };
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
      localization={{
        signIn: {
          start: {
            title: "店主登入",
            subtitle: "登入 PIKA JP Selects 管理後台",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <ClerkTokenBridge />
        {privatePoc && !publicShop && <div className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-950">合成資料私人 POC · 不收款、不出貨 · <a className="underline" href={`${basePath}/`}>模擬客人瀏覽</a> · <a className="underline" href={`${basePath}/settings/invoice-ocr`}>收據辨識</a></div>}
        <AppRouter />
        <Toaster />
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <Switch>
        {publicShop && <Route path="/" component={Storefront} />}
        {publicShop && <Route path="/shop" component={Storefront} />}
        <Route><ClerkProviderWithRoutes /></Route>
      </Switch>
    </WouterRouter>
  );
}

export default App;
