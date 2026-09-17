import { defineConfig, InputTransformerFn, OutputClientFunc } from "orval";
import path from "path";

const root = path.resolve(__dirname, "..", "..");
const apiClientReactSrc = path.resolve(root, "lib", "api-client-react", "src");
const apiZodSrc = path.resolve(root, "lib", "api-zod", "src");

// Orval 8.9.1 reads preprocess.response for param and only returns that mutator's
// import. Generate params alone with this wiring workaround, then retain the
// stock body/response verbatim. Never patch generated files or other operations.
const previewParamClient: OutputClientFunc = (clients) => ({
  ...clients.zod,
  client: async (verb, ...args) => {
    const mutator = verb.override.zod.preprocess?.param;
    if (verb.operationName !== "previewPricingV2" || !mutator) return clients.zod.client(verb, ...args);
    const baseline = await clients.zod.client({ ...verb, override: {
      ...verb.override, zod: { ...verb.override.zod, preprocess: undefined },
    } }, ...args);
    const params = await clients.zod.client({ ...verb, override: {
      ...verb.override, zod: { ...verb.override.zod,
        generate: { param: true, query: false, header: false, body: false, response: false },
        preprocess: { param: mutator, response: mutator },
      },
    } }, ...args);
    const bodyStart = baseline.implementation.indexOf("export const previewPricingV2BodyTemplateIdMax");
    if (bodyStart < 0 || !params.implementation.includes("zod.preprocess(preprocessPreviewPricingParams,")) {
      throw new Error("Preview param generation changed; review the scoped Orval workaround");
    }
    return { ...baseline,
      implementation: params.implementation.trimEnd() + "\n\n" + baseline.implementation.slice(bodyStart),
      mutators: params.mutators,
    };
  },
});

// Reuse the stock generator except for the new Catalog path preprocessing.
const catalogClient: OutputClientFunc = (clients) => ({
  ...previewParamClient(clients),
  client: async (verb, ...args) => {
    if (!verb.operationName.startsWith("catalog")) {
      const result = await previewParamClient(clients).client(verb, ...args);
      // A query DTO and a path schema otherwise share this generated export name.
      if (verb.operationName === "getCatalogSales") return {...result, implementation:result.implementation.replace('export const GetCatalogSalesParams =', 'export const GetCatalogSalesPathParams =')};
      return result;
    }
    const mutator = verb.override.zod.preprocess?.param;
    const baseline = await clients.zod.client({ ...verb, override: { ...verb.override, zod: { ...verb.override.zod, preprocess: undefined } } }, ...args);
    const params = await clients.zod.client({ ...verb, override: { ...verb.override, zod: { ...verb.override.zod,
      generate: { param: true, query: false, header: false, body: false, response: false },
      preprocess: { param: mutator, response: mutator },
    } } }, ...args);
    const name=verb.operationName[0].toUpperCase()+verb.operationName.slice(1);
    const start=baseline.implementation.indexOf(`export const ${name}Params = `);
    const end=baseline.implementation.indexOf("\n\n",start);
    if(start<0 || !params.implementation.includes("zod.preprocess(preprocessCatalogParams,")) throw new Error("Catalog parameter generator changed");
    const pathSchema=params.implementation.replace(`export const ${name}Params =`, `export const ${name}PathParams =`);
    let remainder=end<0?"":baseline.implementation.slice(end).trimStart();
    let mutators=params.mutators;
    if(verb.operationName==='catalogListingMatchPreview') {
      // Orval 8.9.1 also reads response for query preprocess. Generate only
      // this query with that workaround, preserving every other stock schema.
      const queryMutator={path:path.resolve(apiZodSrc,'listingMatchQuery.ts'),name:'preprocessListingMatchQuery'};
      const query=await clients.zod.client({...verb,override:{...verb.override,zod:{...verb.override.zod,
        generate:{param:false,query:true,header:false,body:false,response:false},
        preprocess:{query:queryMutator,response:queryMutator},
      }}},...args);
      const queryStart=remainder.indexOf('export const catalogListingMatchPreviewQueryPageMax');
      const queryEnd=remainder.indexOf('\n\n',remainder.indexOf('export const CatalogListingMatchPreviewQueryParams ='));
      if(queryStart!==0 || queryEnd<0 || !query.implementation.includes('zod.preprocess(preprocessListingMatchQuery,')) throw new Error('Listing query generator changed');
      remainder=query.implementation.trimEnd()+remainder.slice(queryEnd);
      mutators=[...(params.mutators??[]),...(query.mutators??[])];
    }
    if(verb.operationName==='catalogInitialize') {
      // Orval 8.9.1 omits strict() for a zero-property object; honor additionalProperties:false.
      const empty=/export const CatalogInitializeBody = zod\.object\(\{\s*\}\)(?:\.strict\(\))?/;
      if(!empty.test(remainder))throw new Error('Catalog empty body generation changed');
      remainder=remainder.replace(empty,'export const CatalogInitializeBody = zod.object({}).strict()');
    }
    return { ...baseline, implementation: pathSchema.trimEnd()+"\n\n"+remainder, mutators };
  },
});
const catalogOperation = { zod: { strict: { body:true,param:true,query:true }, coerce: { param:["number"] as const }, preprocess: { param: {path:path.resolve(apiZodSrc,"catalogParams.ts"),name:"preprocessCatalogParams"} } } };

// Our exports make assumptions about the title of the API being "Api" (i.e. generated output is `api.ts`).
const titleTransformer: InputTransformerFn = (config) => {
  config.info ??= {};
  config.info.title = "Api";

  return config;
};
// Multer validates the bounded binary part; generated Node validators cover
// the same JSON/metadata shape without introducing browser-only Blob types.
const importServerTransformer: InputTransformerFn = (config) => {
  const transformed=titleTransformer(config);
  const operation=transformed.paths?.["/stores/{storeId}/sheet-imports/preview"]?.post;
  const body=operation?.requestBody;
  if(body && !("$ref" in body)) delete body.content["multipart/form-data"];
  return transformed;
};

export default defineConfig({
  "api-client-react": {
    input: {
      target: "./openapi.yaml",
      override: {
        transformer: titleTransformer,
      },
    },
    output: {
      workspace: apiClientReactSrc,
      target: "generated",
      client: "react-query",
      mode: "split",
      baseUrl: "/api",
      clean: true,
      prettier: true,
      override: {
        fetch: {
          includeHttpResponseReturnType: false,
        },
        mutator: {
          path: path.resolve(apiClientReactSrc, "custom-fetch.ts"),
          name: "customFetch",
        },
      },
    },
  },
  zod: {
    input: {
      target: "./openapi.yaml",
      override: {
        transformer: importServerTransformer,
      },
    },
    output: {
      workspace: apiZodSrc,
      client: catalogClient,
      target: "generated",
      schemas: { path: "generated/types", type: "typescript" },
      mode: "split",
      clean: true,
      prettier: true,
      override: {
        zod: {
          coerce: {
            query: ["boolean", "number", "string"],
            param: ["boolean", "number", "string"],
            body: ["bigint", "date"],
            response: ["bigint", "date"],
          },
        },
        // Only this new operation opts into closed request objects, including nested thresholds.
        operations: {
          catalogListingMatchPreview: catalogOperation,
          catalogListingMatchApply: catalogOperation,
          catalogImportPreview: catalogOperation,
          catalogImportGet: catalogOperation,
          catalogImportResolve: catalogOperation,
          catalogImportApprove: catalogOperation,
          catalogImportCommit: catalogOperation,
          catalogImportRollback: catalogOperation,
          catalogImportReferences: catalogOperation,
          captureCatalogOrderItem: {zod:{strict:{body:true,param:true,query:true},coerce:{body:[]}}},
          createCatalogOrder: {zod:{strict:{body:true,param:true,query:true},coerce:{body:[]}}},
          createCatalogListing: {zod:{strict:{body:true,param:true,query:true},coerce:{body:["date"]}}},
          recalculateListingPricing: {zod:{strict:{body:true,param:true,query:true},coerce:{body:["date"]}}},
          catalogList: catalogOperation,
          catalogCreate: catalogOperation,
          catalogGet: catalogOperation,
          catalogPatch: catalogOperation,
          catalogDelete: catalogOperation,
          catalogCorrectBarcode: catalogOperation,
          catalogClone: catalogOperation,
          catalogAliases: catalogOperation,
          catalogAliasCreate: catalogOperation,
          catalogAliasDelete: catalogOperation,
          catalogCosts: catalogOperation,
          catalogCostCreate: catalogOperation,
          catalogCostVoid: catalogOperation,
          catalogShopee: catalogOperation,
          catalogShopeeCreate: catalogOperation,
          catalogShopeeVoid: catalogOperation,
          catalogRelationships: catalogOperation,
          catalogRelationshipCreate: catalogOperation,
          catalogRelationshipDelete: catalogOperation,
          catalogAudit: catalogOperation,
          catalogSettingsGet: catalogOperation,
          catalogSettingsPatch: catalogOperation,
          catalogInitialize: catalogOperation,
          catalogTemplates: catalogOperation,
          catalogTemplateCreate: catalogOperation,
          catalogTemplatePatch: catalogOperation,
          catalogTemplateDelete: catalogOperation,
          catalogShippingProfiles: catalogOperation,
          catalogShippingCreate: catalogOperation,
          catalogShippingPatch: catalogOperation,
          catalogShippingDelete: catalogOperation,
          previewPricingV2: {
            zod: {
              strict: { body: true, param: true },
              coerce: { param: ["number"] },
              preprocess: { param: {
                path: path.resolve(apiZodSrc, "previewPricingParams.ts"),
                name: "preprocessPreviewPricingParams",
              } },
            },
          },
        },
        useDates: true,
        useBigInt: true,
      },
    },
  },
});
