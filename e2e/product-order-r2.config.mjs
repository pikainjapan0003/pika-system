import {defineConfig} from '@playwright/test';
import assert from 'node:assert/strict';
assert.equal(process.env.PIKA_PHASE6_E2E,'DB-BUILD-06');const url=new URL(process.env.E2E_BASE_URL);assert.equal(url.hostname,'127.0.0.1');
export default defineConfig({testDir:'.',testMatch:['product-order-r2.spec.mjs'],workers:1,fullyParallel:false,retries:0,timeout:180000,expect:{timeout:15000},outputDir:process.env.PIKA_PHASE6_BROWSER_EVIDENCE+'/test-results',reporter:[['line'],['junit',{outputFile:process.env.PIKA_PHASE6_BROWSER_EVIDENCE+'/e2e.junit.xml'}]],use:{baseURL:url.href,browserName:'chromium',headless:true,viewport:{width:390,height:900},screenshot:'only-on-failure',trace:'on',launchOptions:{args:['--disable-dev-shm-usage']}}});
