const CLERK_JS_ROUTE = "**/npm/@clerk/clerk-js@*/dist/clerk.browser.js";

const CLERK_STUB_SCRIPT = String.raw`
class ClerkStub {
  constructor(key) {
    this.publishableKey = key;
    this.loaded = true;
    this.status = "ready";
    this.user = null;
    this.session = null;
    this.client = { signIn: {}, signUp: {} };
    this.organization = null;
    this.listeners = new Map();
  }

  async load(_options) {
    this.loaded = true;
    for (const listener of this.listeners.get("status") ?? []) {
      listener("ready");
    }
  }

  addListener(callback) {
    callback({
      user: this.user,
      session: this.session,
      client: this.client,
      organization: this.organization,
    });
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

export async function installClerkStub(page) {
  await page.route(CLERK_JS_ROUTE, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: CLERK_STUB_SCRIPT,
    });
  });
}
