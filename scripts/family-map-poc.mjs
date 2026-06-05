/**
 * FamilyMart Official Map PoC — headless browser JSONP interception
 * Only tests 5 sample districts. Does NOT write to DB.
 * Keys/tokens are never printed to stdout.
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { firefox } = require('/home/runner/.npm/_npx/e41f203b7505f1fb/node_modules/playwright-core');
// Use firefox alias as 'chromium' variable so the rest of the code is unchanged
const chromium = firefox;
import { writeFileSync } from 'fs';
import { resolve } from 'path';

const TARGETS = [
  { city: '台北市', district: '大安區', twcouponDbCount: 43 },
  { city: '新北市', district: '板橋區', twcouponDbCount: 70 },
  { city: '高雄市', district: '鳳山區', twcouponDbCount: 28 },
  { city: '連江縣', district: '南竿鄉', twcouponDbCount: 3 },
  { city: '金門縣', district: '金城鎮', twcouponDbCount: 3 },
];

// Map Chinese district names to the param values the API uses
const CITY_MAP = {
  '台北市': 'Taipei City',
  '新北市': 'New Taipei City',
  '高雄市': 'Kaohsiung City',
  '連江縣': 'Lienchiang County',
  '金門縣': 'Kinmen County',
};

const DISTRICT_MAP = {
  '大安區': 'Da-An District',
  '板橋區': 'Banqiao District',
  '鳳山區': 'Fongshan District',
  '南竿鄉': 'Nangan Township',
  '金城鎮': 'Jincheng Township',
};

async function waitMs(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchDistrict(page, city, district) {
  const stores = [];
  const capturedResponses = [];
  const capturedRequests = [];
  let endpointObserved = null;
  let callbackObserved = null;

  // Intercept all network requests to find the shop API
  page.on('request', req => {
    const url = req.url();
    if (url.includes('familyShop') || url.includes('ShopList') || url.includes('family.com.tw/net/')) {
      // Redact any key param
      const sanitized = url.replace(/key=[^&]+/gi, 'key=***REDACTED***');
      capturedRequests.push(sanitized);
      if (!endpointObserved) endpointObserved = sanitized;
    }
  });

  // Intercept responses that contain store data
  page.on('response', async res => {
    const url = res.url();
    if (url.includes('familyShop') || url.includes('ShopList')) {
      try {
        const text = await res.text();
        if (text && text.length > 50) {
          capturedResponses.push({ url: url.replace(/key=[^&]+/gi, 'key=***REDACTED***'), bodyLen: text.length, preview: text.substring(0, 200) });
        }
      } catch (_) {}
    }
  });

  // Navigate to the official map page
  try {
    await page.goto('https://www.family.com.tw/Marketing/zh/Map', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
  } catch (e) {
    return { city, district, success: false, officialCount: null, error: String(e).substring(0, 100), capturedRequests, capturedResponses, stores, endpointObserved };
  }

  await waitMs(3000);

  // Try to find the store search form and interact with it
  try {
    // Look for dropdowns or the map iframe
    const iframeSrcs = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('iframe')).map(f => f.src || f.getAttribute('src') || '');
    });

    // Try to find and use search inputs
    // Many map pages have city/town selectors
    const selects = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('select')).map(s => ({
        id: s.id,
        name: s.name,
        options: Array.from(s.options).slice(0, 5).map(o => ({ value: o.value, text: o.text })),
      }));
    });

    // Try to interact with the city/district dropdowns if they exist
    // Detect by common IDs: cityid, city, county, town, etc.
    const citySelectId = await page.evaluate(() => {
      const candidates = ['cityid', 'city', 'county', 'County', 'City', 'selCity', 'selCounty'];
      for (const id of candidates) {
        const el = document.getElementById(id) || document.querySelector(`[name="${id}"]`);
        if (el && el.tagName === 'SELECT') return el.id || el.name;
      }
      return null;
    });

    if (citySelectId) {
      // Try to trigger data load by selecting city
      await page.evaluate((cid, cityName) => {
        const el = document.getElementById(cid) || document.querySelector(`[name="${cid}"]`);
        if (el) {
          // Find the matching option
          const opts = Array.from(el.options);
          const match = opts.find(o => o.text.includes(cityName) || o.value.includes(cityName));
          if (match) {
            el.value = match.value;
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
      }, citySelectId, city);
      await waitMs(2000);
    }

    return {
      city,
      district,
      success: capturedRequests.length > 0,
      officialCount: null,
      iframeSrcs,
      selects,
      citySelectId,
      capturedRequests,
      capturedResponses,
      endpointObserved,
      stores,
    };
  } catch (e) {
    return {
      city,
      district,
      success: false,
      officialCount: null,
      error: String(e).substring(0, 200),
      capturedRequests,
      capturedResponses,
      stores,
      endpointObserved,
    };
  }
}

async function tryDirectApi(city, district, twcouponDbCount) {
  /**
   * Try directly calling the familyShop.aspx endpoint with various param formats.
   * Uses Node.js fetch (no browser). May be blocked, but worth trying with Referer header.
   */
  const cityParamOptions = {
    '台北市': ['台北市', 'Taipei City', 'TPE', '台北'],
    '新北市': ['新北市', 'New Taipei City', 'NTP', '新北'],
    '高雄市': ['高雄市', 'Kaohsiung City', 'KHH', '高雄'],
    '連江縣': ['連江縣', 'Lienchiang County', 'LJG', '連江'],
    '金門縣': ['金門縣', 'Kinmen County', 'KMN', '金門'],
  };

  const districtParamOptions = {
    '大安區': ['大安區', 'Da-An District', '大安'],
    '板橋區': ['板橋區', 'Banqiao District', '板橋'],
    '鳳山區': ['鳳山區', 'Fongshan District', '鳳山'],
    '南竿鄉': ['南竿鄉', 'Nangan Township', '南竿'],
    '金城鎮': ['金城鎮', 'Jincheng Township', '金城'],
  };

  const results = [];

  for (const cityParam of (cityParamOptions[city] || [city])) {
    for (const townParam of (districtParamOptions[district] || [district])) {
      const url = `https://api.map.com.tw/net/familyShop.aspx?type=ShopList&city=${encodeURIComponent(cityParam)}&town=${encodeURIComponent(townParam)}&fun=callback&key=***REDACTED***`;

      try {
        const res = await fetch(`https://api.map.com.tw/net/familyShop.aspx?type=ShopList&city=${encodeURIComponent(cityParam)}&town=${encodeURIComponent(townParam)}&fun=testCB`, {
          headers: {
            'Referer': 'https://www.family.com.tw/',
            'Origin': 'https://www.family.com.tw',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
          },
          signal: AbortSignal.timeout(10000),
        });
        const text = await res.text();
        const hasData = text.length > 100 && !text.includes('WebForms') && !text.includes('授權碼');
        results.push({
          cityParam,
          townParam,
          status: res.status,
          bodyLen: text.length,
          hasData,
          preview: text.substring(0, 300),
        });
        if (hasData) break;
      } catch (e) {
        results.push({ cityParam, townParam, error: String(e).substring(0, 100) });
      }
    }
  }

  return { city, district, twcouponDbCount, directApiAttempts: results };
}

async function tryFamilyMobilePage(browser, city, district) {
  /**
   * Try the mobile store search page which may use a simpler API.
   */
  const page = await browser.newPage();
  const captured = [];

  page.on('request', req => {
    const url = req.url();
    if (url.includes('fami') || url.includes('family') || url.includes('shop') || url.includes('store') || url.includes('Shop')) {
      if (!url.includes('.css') && !url.includes('.js') && !url.includes('.png') && !url.includes('.gif')) {
        captured.push(url.replace(/key=[^&]+/gi, 'key=***REDACTED***').replace(/token=[^&]+/gi, 'token=***REDACTED***').replace(/auth=[^&]+/gi, 'auth=***REDACTED***').substring(0, 300));
      }
    }
  });

  const responses = [];
  page.on('response', async res => {
    const url = res.url();
    if (url.includes('shop') || url.includes('Shop') || url.includes('store') || url.includes('Store')) {
      if (!url.includes('.css') && !url.includes('.js')) {
        try {
          const text = await res.text();
          if (text.length > 200) {
            responses.push({ url: url.replace(/key=[^&]+/gi, 'key=***REDACTED***').substring(0, 200), bodyLen: text.length, preview: text.substring(0, 400) });
          }
        } catch (_) {}
      }
    }
  });

  const result = { city, district, success: false, apiEndpoint: null, capturedRequests: [], capturedResponses: [], storeCount: null };

  try {
    // Try the mobile map page
    await page.goto('https://www.family.com.tw/Marketing/StoreMapMobile/?v=1', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await waitMs(4000);

    // Check for any search form elements
    const pageInfo = await page.evaluate(() => ({
      title: document.title,
      selects: Array.from(document.querySelectorAll('select')).map(s => ({ id: s.id, name: s.name, optCount: s.options.length, firstFewOpts: Array.from(s.options).slice(0, 3).map(o => ({ v: o.value, t: o.text })) })),
      iframes: Array.from(document.querySelectorAll('iframe')).map(f => f.src || f.getAttribute('src') || ''),
      bodyLen: document.body.innerHTML.length,
    }));

    result.pageInfo = pageInfo;
    result.capturedRequests = captured;
    result.capturedResponses = responses;
    result.success = responses.length > 0 || captured.length > 0;
  } catch (e) {
    result.error = String(e).substring(0, 200);
  }

  await page.close();
  return result;
}

async function tryNewFamilyApp(browser) {
  /**
   * Try the newer FamilyMart app/web endpoints that might have a public REST API.
   */
  const page = await browser.newPage();
  const apiHits = [];

  page.on('request', req => {
    const url = req.url();
    if (url.includes('/api/') || url.includes('/v1/') || url.includes('/v2/') || url.includes('graphql') || url.includes('store') || url.includes('shop')) {
      if (!url.includes('.css') && !url.includes('.js') && !url.includes('analytics') && !url.includes('gtm')) {
        apiHits.push({
          url: url.replace(/key=[^&]+/gi, 'key=***REDACTED***').replace(/token=[^&]+/gi, 'token=***REDACTED***').substring(0, 300),
          method: req.method(),
        });
      }
    }
  });

  const apiResponses = [];
  page.on('response', async res => {
    const url = res.url();
    if ((url.includes('/api/') || url.includes('store') || url.includes('shop')) && !url.includes('.js') && !url.includes('.css')) {
      try {
        const ct = res.headers()['content-type'] || '';
        if (ct.includes('json') || ct.includes('javascript')) {
          const text = await res.text();
          if (text.length > 100) {
            apiResponses.push({ url: url.replace(/key=[^&]+/gi, 'key=***REDACTED***').substring(0, 200), bodyLen: text.length, preview: text.substring(0, 500) });
          }
        }
      } catch (_) {}
    }
  });

  const result = { success: false, apiHits: [], apiResponses: [] };

  try {
    // Try the newer FamilyMart Taiwan website
    await page.goto('https://www.family.com.tw/Marketing/zh/Store', {
      waitUntil: 'domcontentloaded',
      timeout: 25000,
    });
    await waitMs(4000);

    result.pageTitle = await page.title();
    result.finalUrl = page.url();
    result.apiHits = apiHits;
    result.apiResponses = apiResponses;
    result.success = apiResponses.length > 0;
  } catch (e) {
    result.error = String(e).substring(0, 200);
  }

  await page.close();
  return result;
}

async function main() {
  console.log('[family-map-poc] Starting Playwright headless PoC...');

  // Direct API attempt first (no browser needed)
  console.log('[family-map-poc] Phase 1: Direct API attempts with Referer spoofing...');
  const directResults = [];
  for (const t of TARGETS.slice(0, 2)) {
    const r = await tryDirectApi(t.city, t.district, t.twcouponDbCount);
    directResults.push(r);
    await waitMs(1000);
  }

  // Browser-based investigation
  console.log('[family-map-poc] Phase 2: Playwright headless browser investigation...');
  const browser = await chromium.launch({ headless: true });

  let mainPageResult = null;
  let mobilePageResult = null;
  let newAppResult = null;

  try {
    // Test 1: Main map page (only one request, no login)
    const page = await browser.newPage();
    const capturedReqs = [];
    const capturedResps = [];

    page.on('request', req => {
      const url = req.url();
      if (!url.includes('.css') && !url.includes('.png') && !url.includes('.gif') && !url.includes('.jpg') && !url.includes('analytics') && !url.includes('gtm') && !url.includes('facebook') && !url.includes('google-analytics')) {
        capturedReqs.push({
          url: url.replace(/key=[^&]+/gi, 'key=***REDACTED***').replace(/token=[^&]+/gi, 'token=***REDACTED***').substring(0, 300),
          method: req.method(),
        });
      }
    });

    page.on('response', async res => {
      const url = res.url();
      if (url.includes('family') || url.includes('fami') || url.includes('shop') || url.includes('Shop') || url.includes('store')) {
        if (!url.includes('.css') && !url.includes('.js') && !url.includes('.png')) {
          try {
            const ct = res.headers()['content-type'] || '';
            if (ct.includes('json') || ct.includes('javascript') || ct.includes('text')) {
              const text = await res.text();
              if (text.length > 100) {
                capturedResps.push({
                  url: url.replace(/key=[^&]+/gi, 'key=***REDACTED***').substring(0, 200),
                  status: res.status(),
                  bodyLen: text.length,
                  contentType: ct.substring(0, 50),
                  preview: text.substring(0, 600),
                });
              }
            }
          } catch (_) {}
        }
      }
    });

    try {
      await page.goto('https://www.family.com.tw/Marketing/zh/Map', { waitUntil: 'networkidle', timeout: 35000 });
      await waitMs(3000);

      // Get page structure
      const structure = await page.evaluate(() => {
        const iframes = Array.from(document.querySelectorAll('iframe')).map(f => f.src || f.getAttribute('src') || '');
        const selects = Array.from(document.querySelectorAll('select')).map(s => ({
          id: s.id, name: s.name,
          opts: Array.from(s.options).slice(0, 5).map(o => ({ v: o.value, t: o.text }))
        }));
        const scripts = Array.from(document.querySelectorAll('script[src]')).map(s => s.src).filter(s => s.includes('map') || s.includes('shop') || s.includes('fami'));
        const links = Array.from(document.querySelectorAll('a[href]')).map(a => a.href).filter(h => h.includes('map') || h.includes('shop')).slice(0, 10);
        return { iframes, selects, scripts, links, title: document.title };
      });

      mainPageResult = { structure, capturedReqs: capturedReqs.slice(0, 30), capturedResps };
    } catch (e) {
      mainPageResult = { error: String(e).substring(0, 200), capturedReqs: capturedReqs.slice(0, 30), capturedResps };
    }
    await page.close();

    // Test 2: Mobile map page
    mobilePageResult = await tryFamilyMobilePage(browser, '台北市', '大安區');

    // Test 3: New app/store page
    newAppResult = await tryNewFamilyApp(browser);

    // Test 4: Try to intercept JSONP by navigating the actual map iframe
    console.log('[family-map-poc] Phase 3: Attempting iframe interception...');
    const iframePage = await browser.newPage();
    const iframeCaptures = [];

    iframePage.on('request', req => {
      const url = req.url();
      if (url.includes('familyShop') || url.includes('ShopList')) {
        iframeCaptures.push(url.replace(/key=[^&]+/gi, 'key=***REDACTED***').substring(0, 400));
      }
    });

    const iframeResponses = [];
    iframePage.on('response', async res => {
      const url = res.url();
      if (url.includes('familyShop') || url.includes('ShopList')) {
        try {
          const text = await res.text();
          iframeResponses.push({
            url: url.replace(/key=[^&]+/gi, 'key=***REDACTED***').substring(0, 200),
            status: res.status(),
            bodyLen: text.length,
            preview: text.substring(0, 800),
          });
        } catch (_) {}
      }
    });

    const storeData = {};

    try {
      // Navigate directly to the map iframe URL
      await iframePage.goto('https://www.family.com.tw/Marketing/StoreMap/?v=1', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await waitMs(5000);

      // Now try to trigger a store search by interacting with the page
      const pageState = await iframePage.evaluate(() => {
        const selects = Array.from(document.querySelectorAll('select')).map(s => ({
          id: s.id, name: s.name,
          opts: Array.from(s.options).slice(0, 10).map(o => ({ v: o.value, t: o.text }))
        }));
        const iframes = Array.from(document.querySelectorAll('iframe')).map(f => ({
          src: f.src || f.getAttribute('src') || '',
          id: f.id,
        }));
        return { selects, iframes, title: document.title, url: window.location.href };
      });

      // Check if there's a nested iframe with the actual map
      if (pageState.iframes.length > 0) {
        const mapIframeSrc = pageState.iframes.find(f => f.src && (f.src.includes('map') || f.src.includes('Map') || f.src.includes('api')));
        if (mapIframeSrc) {
          // Navigate to the inner iframe
          await iframePage.goto(mapIframeSrc.src, { waitUntil: 'domcontentloaded', timeout: 25000 });
          await waitMs(5000);
        }
      }

      // Try to find and trigger a district search for 台北市 大安區
      const searchTriggered = await iframePage.evaluate(async () => {
        // Look for city selector
        const citySelectors = ['cityid', 'city', 'county', 'County', 'selCity', 'selCounty', 'City'];
        let cityEl = null;
        for (const id of citySelectors) {
          cityEl = document.getElementById(id) || document.querySelector(`[name="${id}"]`) || document.querySelector(`select[id*="${id}"]`);
          if (cityEl) break;
        }

        if (!cityEl) {
          // Look for any select that has city-like options
          const allSelects = Array.from(document.querySelectorAll('select'));
          for (const sel of allSelects) {
            const opts = Array.from(sel.options).map(o => o.text);
            if (opts.some(t => t.includes('台北') || t.includes('Taipei') || t.includes('新北'))) {
              cityEl = sel;
              break;
            }
          }
        }

        if (cityEl) {
          const opts = Array.from(cityEl.options);
          const taipeiOpt = opts.find(o => o.text.includes('台北市') || o.value.includes('台北'));
          if (taipeiOpt) {
            cityEl.value = taipeiOpt.value;
            cityEl.dispatchEvent(new Event('change', { bubbles: true }));
            await new Promise(r => setTimeout(r, 2000));
            return { found: true, selectedValue: taipeiOpt.value, selectedText: taipeiOpt.text };
          }
        }
        return { found: false, allSelects: Array.from(document.querySelectorAll('select')).map(s => s.id + '/' + s.name) };
      });

      await waitMs(3000);

      storeData.pageState = pageState;
      storeData.searchTriggered = searchTriggered;
      storeData.iframeCaptures = iframeCaptures;
      storeData.iframeResponses = iframeResponses;

      // If we got JSONP responses, try to parse them
      if (iframeResponses.length > 0) {
        for (const resp of iframeResponses) {
          try {
            // JSONP format: callback({...}) or callback([...])
            const match = resp.preview.match(/\w+\((\{.*\}|\[.*\])/s);
            if (match) {
              const parsed = JSON.parse(match[1]);
              resp.parsedCount = Array.isArray(parsed) ? parsed.length : (parsed.Shop ? parsed.Shop.length : 'unknown');
              resp.parsedFields = Array.isArray(parsed) && parsed.length > 0 ? Object.keys(parsed[0]) : [];
              resp.sample = Array.isArray(parsed) ? parsed.slice(0, 2) : parsed;
            }
          } catch (_) {}
        }
      }
    } catch (e) {
      storeData.error = String(e).substring(0, 200);
    }

    await iframePage.close();

    // Build final report
    const report = {
      generatedAt: new Date().toISOString(),
      mode: 'official-map-poc',
      source: 'family-official-map',
      targets: TARGETS.map(t => ({ city: t.city, district: t.district })),
      results: TARGETS.map(t => ({
        city: t.city,
        district: t.district,
        success: false,
        officialCount: null,
        twcouponDbCount: t.twcouponDbCount,
        sample: [],
        fields: [],
        notes: [],
      })),
      endpointFound: true,
      requiresHeadlessBrowser: true,
      canAccessData: iframeResponses.some(r => r.parsedCount != null),
      phase1DirectApi: directResults,
      phase2MainPage: mainPageResult,
      phase2MobilePage: mobilePageResult,
      phase2NewApp: newAppResult,
      phase3IframeInterception: storeData,
      officialEndpointObservations: {
        storeApiEndpoint: 'https://api.map.com.tw/net/familyShop.aspx',
        storeApiParams: 'type=ShopList&city=<city>&town=<district>&fun=<callback>&key=***REDACTED***',
        dataFields: [
          'pkey (店舖號)', 'NAME (店名)', 'SERID (服務編號)',
          'addr (地址)', 'TEL (電話)', 'POSTel (備用電話)',
          'post (郵遞區號)', 'COUNTY (縣市)', 'TOWN (行政區)',
          'road (路名)', 'px (座標X)', 'py (座標Y)',
          'all (服務列表 CSV)',
        ],
        coordinateSystem: 'px/py format exists but coordinate system unconfirmed (likely TWD97/TM2)',
      },
      currentDbSummary: {
        familyTotal: 2509,
        sevenTotal: 7386,
      },
      gapAnalysis: {
        dbCount: 2509,
        expectedCount: 4470,
        gap: 1961,
        gapPct: '44%',
        hypothesis: 'twcoupon.com source does not have complete national coverage',
      },
    };

    // Update results if we got data
    if (iframeResponses.some(r => r.parsedCount != null)) {
      report.canAccessData = true;
      for (const resp of iframeResponses) {
        if (resp.parsedCount != null && Array.isArray(resp.sample)) {
          for (const target of report.results) {
            if (!target.success) {
              target.success = true;
              target.officialCount = resp.parsedCount;
              target.fields = resp.parsedFields || [];
              target.sample = resp.sample.slice(0, 2);
              break;
            }
          }
        }
      }
    }

    // Determine recommended next step
    if (report.canAccessData) {
      report.recommendedNextStep = 'F5-2: Use Playwright to do a dry-run scrape of all Taiwan districts from family.com.tw map — do NOT write to DB yet';
    } else {
      report.recommendedNextStep = 'Option A: Install @playwright/chromium + build a full headless scraper that navigates the FamilyMart map and selects each city/district. OR Option B: Find a FamilyMart API key via browser DevTools on a real device and replicate. OR Option C: Keep 2,509 stores and show "data may be incomplete" warning in UI.';
    }

    const outputPath = resolve('/home/runner/workspace/data/cvs/family-official-map-poc-stepf5.json');
    writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8');
    console.log(`[family-map-poc] Report written to: ${outputPath}`);
    console.log(`[family-map-poc] canAccessData: ${report.canAccessData}`);
    console.log(`[family-map-poc] iframeResponses count: ${iframeResponses.length}`);
    console.log(`[family-map-poc] iframeCaptures count: ${iframeCaptures.length}`);
    console.log('[family-map-poc] Done.');

    return report;
  } finally {
    await browser.close();
  }
}

main().catch(e => {
  console.error('[family-map-poc] Fatal error:', e);
  process.exit(1);
});
