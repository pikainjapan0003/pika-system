const CLERK_JS_ROUTE = "**/npm/@clerk/clerk-js*";

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
  }

  async load(_options) {
    this.loaded = true;
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

  on() {}

  off() {}
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
