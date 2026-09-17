import assert from "node:assert/strict";
import { test } from "node:test";
import { calculatePricing, serializePricing } from "./index.ts";
import { ExactDecimal } from "../transport-cost/index.ts";
import { resolveProductTransportCost } from "../transport-cost/productTransportCost.ts";
import { calculateProductUnitProfit } from "../transport-cost/productUnitProfit.ts";

// Fixed 60 expected cells copied from DB-PLAN-01 Sheet evidence SHA256
// 58D5DE30B84742322E0A4917E6AE395AC46D0AC081B609634827E02DDF64FC6D.
// Expected values were derived independently before this implementation.
const samples = [
 { sheet:"商品資訊總攬(2026.03)", row:3, original:"1274", weight:"168", route:"14059", general:"510", vip:"490", template:"GENERAL",
 expected:"1274.000000000000 100.287533333333 105.287533333333 36.960000000000 4.089540000000 0.000000000000 272.636000000000 272.636000000000 418.973073333333 644.573958974359 91.026926666667 0.178484169935 196.314460000000 0.384930313725 237.364000000000 71.026926666667 0.144952911565 176.314460000000 0.359825428571 217.364000000000" },
 { sheet:"連線商品資訊總攬(2026.03)", row:4, original:"100", weight:"50", route:"14134", general:"50", vip:"50", template:"LIVE",
 expected:"100.000000000000 100.822533333333 105.822533333333 11.000000000000 0.321000000000 0.000000000000 21.400000000000 21.400000000000 138.543533333333 213.143897435897 -88.543533333333 -1.770870666667 17.279000000000 0.345580000000 28.600000000000 -88.543533333333 -1.770870666667 17.279000000000 0.345580000000 28.600000000000" },
 { sheet:"香水精品資訊總攬(2026.03)", row:4, original:"22660", weight:"15", route:"14134", general:"5050", vip:"4950", template:"PERFUME",
 expected:"20733.900000000000 100.822533333333 105.822533333333 0.787500000000 66.555819000000 75.163220000000 4849.240000000000 4437.054600000000 4685.383672333333 7208.282572820513 364.616327666667 0.072201253003 470.438861000000 0.093156210099 612.945400000000 264.616327666667 0.053457843973 370.438861000000 0.074836133535 512.945400000000" },
];
const columns="F H I J K L N O P Q AD AE AF AG AH AM AN AO AP AQ".split(" ");
for(const sample of samples) test("live Sheet parity: "+sample.sheet+" row "+sample.row+" (20 cells)",()=>{
 const result=calculatePricing({originalPriceJpy:sample.original,weightGrams:sample.weight,exchangeRate:"0.214",routeCostTwd:ExactDecimal.from(sample.route).divide(ExactDecimal.from("30")).multiply(ExactDecimal.from("0.214")),templateCode:sample.template,internationalShippingRateTwd:sample.template==="PERFUME"?"1050":"220",internationalShippingBasisGrams:sample.template==="PERFUME"?"20000":"1000",generalFinalPriceTwd:sample.general,vipFinalPriceTwd:sample.vip});
 assert.equal(result.status,"READY");
 const values=[...["effectiveCostJpy","routeCostTwd","protectedRouteCostTwd","internationalShippingTwd","purchasePaymentFeeTwd","departmentStoreFeeTwd","originalPriceTwd","effectiveProductCostTwd","totalCostTwd","targetPriceTwd"].map(k=>result.amounts[k]),...["general","vip"].flatMap(t=>["netProfitTwd","profitRate","contributionProfitTwd","contributionProfitRate","perceivedDifferenceTwd"].map(k=>result[t].values[k]))];
 sample.expected.split(" ").forEach((expected,i)=>assert.equal(values[i].toDecimalPlaces(12),expected,columns[i]+sample.row));
});
const base={originalPriceJpy:"100",weightGrams:"50",exchangeRate:"0.2",routeCostTwd:"10",internationalShippingRateTwd:"220",internationalShippingBasisGrams:"1000",generalFinalPriceTwd:"100",vipFinalPriceTwd:"90"};
test("missing price remains blank and each tier is independently pending",()=>{
 const r=calculatePricing({...base,generalFinalPriceTwd:null});
 assert.equal(r.status,"PENDING_CONFIRMATION");assert.equal(r.general.status,"PENDING_CONFIRMATION");assert.equal(r.general.values.finalPriceTwd,null);assert.equal(r.vip.status,"READY");
 assert.equal(calculatePricing({...base,vipFinalPriceTwd:null}).general.status,"READY");
});
for(const field of ["originalPriceJpy","effectiveCostJpy","weightGrams","exchangeRate","routeCostTwd","internationalShippingRateTwd","internationalShippingBasisGrams"])test("missing "+field+" never becomes zero",()=>{
 const r=calculatePricing({...base,[field]:null}); assert.equal(r.status,"PENDING_CONFIRMATION");assert.equal(r.general.values.netProfitTwd,null);
});
test("explicit exemption resolves absent Route but never absent cost",()=>{
 assert.equal(calculatePricing({...base,routeCostTwd:null,isTransportCostExempt:true}).amounts.routeCostTwd.toDecimalPlaces(12),"0.000000000000");
 assert.equal(calculatePricing({...base,effectiveCostJpy:null,isTransportCostExempt:true}).general.status,"PENDING_CONFIRMATION");
});
for(const [field,value] of [["originalPriceJpy","-1"],["effectiveCostJpy","NaN"],["exchangeRate","Infinity"],["exchangeRate","0"],["internationalShippingBasisGrams","0"],["targetMarginRate","1"],["targetMarginRate","1.1"],["generalFinalPriceTwd","0"],["vipFinalPriceTwd","1.001"],["originalPriceJpy",100],["purchasePaymentFeeRate","-0.1"]])test("reject invalid "+field+"="+value,()=>assert.throws(()=>calculatePricing({...base,[field]:value})));
test("signed ordered thresholds, manual cost and half-up terminal display",()=>{
 const r=calculatePricing({...base,effectiveCostJpy:"120",thresholds:{loss:"-10",low:"0",medium:"50"}});
 assert.equal(r.amounts.effectiveProductCostTwd.toDecimalPlaces(12),"24.000000000000");
 assert.throws(()=>calculatePricing({...base,thresholds:{loss:"1",low:"0",medium:"50"}}));
 assert.throws(()=>calculatePricing({...base,thresholds:{loss:"NaN",low:"0",medium:"50"}}));
 assert.equal(serializePricing(calculatePricing({...base,routeCostTwd:"10.005"})).display.routeCostTwd,"10.01");
});
function routeInput(){return {product:{tripRouteId:5},trip:{id:2,exchangeRate:"0.2",hepTotalJpy:"500",totalItemQuantity:100},route:{id:5,tripId:2,tripAreaId:12,estQty:20,etcJpy:"100",trainJpy:"200",fuelJpy:"300",parkingJpy:"400",fee1_5PctIsOverridden:false,totalJpyIsOverridden:false,domesticPerItemIsOverridden:false,transportPerItemIsOverridden:false,finalCostPerItemIsOverridden:false},area:{id:12,tripId:2},areaCost:{tripAreaId:12,mode:"ESTIMATE",cardboardUnitJpy:"100",shippingUnitJpy:"400",parcelCount:2,estimatedItemQuantity:100}};}
test("actual resolver oracle: v1 .015 retains 13.18; v2 .02 yields 13.24 once",()=>{
 const input=routeInput(), v1=resolveProductTransportCost(input), explicit=resolveProductTransportCost({...input,paymentFeeRate:"0.015"}), changed=resolveProductTransportCost({...input,paymentFeeRate:"0.02"});
 assert.equal(v1.finalCostPerItem.toDecimalPlaces(12),"13.180000000000");assert.equal(explicit.finalCostPerItem.toFractionString(),v1.finalCostPerItem.toFractionString());assert.equal(changed.finalCostPerItem.toDecimalPlaces(12),"13.240000000000");
 const old=calculateProductUnitProfit({unitPriceTwd:"300",costJpy:"1000",storePurchaseExchangeRate:"0.21",isTransportCostExempt:false,transport:input});
 assert.equal(old.productCostTwd.toDecimalPlaces(12),"210.000000000000");assert.equal(old.unitProfitTwd.toDecimalPlaces(12),"76.820000000000");
 const preview=calculatePricing({...base,originalPriceJpy:"1000",exchangeRate:"0.21",routeCostTwd:v1.finalCostPerItem,lossProtectionTwd:"0",internationalShippingRateTwd:"0",purchasePaymentFeeRate:"0",generalFinalPriceTwd:"300"});
 assert.equal(preview.general.values.netProfitTwd.toDecimalPlaces(12),"76.820000000000");
});

