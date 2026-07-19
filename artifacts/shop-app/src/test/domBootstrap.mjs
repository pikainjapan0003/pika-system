import { JSDOM } from "jsdom";

const GLOBAL_KEYS = [
  "window",
  "document",
  "navigator",
  "location",
  "history",
  "addEventListener",
  "removeEventListener",
  "dispatchEvent",
  "HTMLElement",
  "Node",
  "Event",
  "MutationObserver",
  "getComputedStyle",
  "requestAnimationFrame",
  "cancelAnimationFrame",
];

export function installTestDom() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
    pretendToBeVisual: true,
  });
  const previousDescriptors = new Map(
    GLOBAL_KEYS.map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  );
  const values = {
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    location: dom.window.location,
    history: dom.window.history,
    addEventListener: dom.window.addEventListener.bind(dom.window),
    removeEventListener: dom.window.removeEventListener.bind(dom.window),
    dispatchEvent: dom.window.dispatchEvent.bind(dom.window),
    HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node,
    Event: dom.window.Event,
    MutationObserver: dom.window.MutationObserver,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
  };

  for (const [key, value] of Object.entries(values)) {
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    });
  }

  return () => {
    dom.window.close();
    for (const [key, descriptor] of previousDescriptors) {
      if (descriptor) {
        Object.defineProperty(globalThis, key, descriptor);
      } else {
        delete globalThis[key];
      }
    }
  };
}
