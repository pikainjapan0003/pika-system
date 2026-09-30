import {defineConfig} from '@playwright/test';
import assert from 'node:assert/strict';
assert.equal(process.env.PIKA_PHASE5_E2E,'DB-BUILD-05');
const url=new URL(process.env.E2E_BASE_URL);assert.equal(url.hostname,'127.0.0.1');
export default defineConfig({testDir:'.',testMatch:['product-database.spec.mjs','product-listing.spec.mjs'],workers:1,fullyParallel:false,retries:0,timeout:120000,expect:{timeout:15000},outputDir:process.env.PIKA_PHASE5_EVIDENCE+'/test-results',reporter:[['line'],['junit',{outputFile:process.env.PIKA_PHASE5_EVIDENCE+'/e2e.junit.xml'}]],use:{baseURL:url.href,browserName:'chromium',headless:true,viewport:{width:390,height:844},screenshot:'only-on-failure',trace:'retain-on-failure',launchOptions:{args:['--disable-dev-shm-usage']}}});
