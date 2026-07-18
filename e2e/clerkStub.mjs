const CLERK_JS_ROUTE = "**/npm/@clerk/clerk-js@*/dist/clerk.browser.js";

const CLERK_STUB_SCRIPT = String.raw`
class ClerkStub {
  constructor(key) {
    const options = window.__codexClerkStubOptions ?? {};
    this.user = options.signedIn
      ? { id: options.userId ?? "user_e2e_merchant", organizationMemberships: [] }
      : null;
    this.session = this.user
      ? {
          id: "session_e2e_merchant",
          status: "active",
          user: this.user,
          lastActiveToken: { jwt: { claims: {} } },
          factorVerificationAge: null,
          getToken: async () => "e2e-owner-token",
        }
      : null;
    this.publishableKey = key;
    this.loaded = true;
    this.status = "ready";
    this.client = { signIn: {}, signUp: {} };
    this.organization = null;
    this.listeners = new Map();
    this.isSignedIn = this.session !== null;
    this.__internal_lastEmittedResources = this.resources();
  }

  resources() {
    return {
      user: this.user,
      session: this.session,
      client: this.client,
      organization: this.organization,
    };
  }

  async load(_options) {
    this.loaded = true;
    for (const listener of this.listeners.get("status") ?? []) {
      listener("ready");
    }
  }

  addListener(callback) {
    callback(this.resources());
    return () => {};
  }

  on(event, callback, options) {
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(callback);
    this.listeners.set(event, listeners);
    if (event === "status" && options?.notify === true) {
      callback("ready");
    }
  }

  off(event, callback) {
    const listeners = this.listeners.get(event);
    listeners?.delete(callback);
    if (listeners?.size === 0) {
      this.listeners.delete(event);
    }
  }
}

window.Clerk = new ClerkStub(window.__clerk_publishable_key);
`;

export async function installClerkStub(page, options = {}) {
  await page.addInitScript((stubOptions) => {
    window.__codexClerkStubOptions = stubOptions;
  }, options);
  await page.route(CLERK_JS_ROUTE, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: CLERK_STUB_SCRIPT,
    });
  });
}
