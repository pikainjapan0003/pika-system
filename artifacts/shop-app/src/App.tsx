import { useEffect, useRef } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk, useUser } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { Switch, Route, Redirect, useLocation, Router as WouterRouter } from "wouter";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { queryClient } from "@/lib/queryClient";
import { useGetMyStore } from "@workspace/api-client-react";

import HomePage from "@/pages/Home";
import DashboardPage from "@/pages/Dashboard";
import ProductsPage from "@/pages/Products";
import ProductFormPage from "@/pages/ProductForm";
import OrdersPage from "@/pages/Orders";
import SetupPage from "@/pages/Setup";
import PublicOrderPage from "@/pages/PublicOrder";
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
    colorPrimary: "hsl(18,72%,48%)",
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: store, isLoading, error } = useGetMyStore({ query: { enabled: !!isSignedIn } as any });

  if (!isLoaded || isLoading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isSignedIn) return <Redirect to="/" />;

  if (error && (error as any)?.status === 404) {
    return <Redirect to="/setup" />;
  }

  if (!store && !error) return <Redirect to="/setup" />;

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
      <Route path="/orders" component={OrdersPage} />
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
      <Route path="/setup" component={SetupRoute} />
      <Route path="/dashboard" component={MerchantPortal} />
      <Route path="/products/*?" component={MerchantPortal} />
      <Route path="/orders" component={MerchantPortal} />
      <Route component={NotFoundPage} />
    </Switch>
  );
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
