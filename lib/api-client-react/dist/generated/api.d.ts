import type { QueryKey, UseMutationOptions, UseMutationResult, UseQueryOptions, UseQueryResult } from '@tanstack/react-query';
import type { BulkOrderUpdate, BulkOrderUpdateResponse, GetSellerAgentSettings200, HealthStatus, MerchantOrderInput, Order, OrderIdsBody, OrderInput, OrderStatusUpdate, OrderUpdate, PickingListResponse, Product, ProductCategory, ProductCategoryInput, ProductInput, ProductUpdate, PublicOrder, PublicProduct, ShippingListResponse, Store, StoreInput, StoreStats, StoreUpdate, TrackingImportBody, TrackingImportResponse, UpdateSellerAgentSettings200, UpdateSellerAgentSettingsRequest } from './api.schemas';
import { customFetch } from '../custom-fetch';
import type { ErrorType, BodyType } from '../custom-fetch';
type AwaitedInput<T> = PromiseLike<T> | T;
type Awaited<O> = O extends AwaitedInput<infer T> ? T : never;
type SecondParameter<T extends (...args: never) => unknown> = Parameters<T>[1];
export declare const getHealthCheckUrl: () => string;
/**
 * @summary Health check
 */
export declare const healthCheck: (options?: RequestInit) => Promise<HealthStatus>;
export declare const getHealthCheckQueryKey: () => readonly ["/api/healthz"];
export declare const getHealthCheckQueryOptions: <TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData> & {
    queryKey: QueryKey;
};
export type HealthCheckQueryResult = NonNullable<Awaited<ReturnType<typeof healthCheck>>>;
export type HealthCheckQueryError = ErrorType<unknown>;
/**
 * @summary Health check
 */
export declare function useHealthCheck<TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetMyStoreUrl: () => string;
/**
 * @summary Get current merchant's store
 */
export declare const getMyStore: (options?: RequestInit) => Promise<Store>;
export declare const getGetMyStoreQueryKey: () => readonly ["/api/me/store"];
export declare const getGetMyStoreQueryOptions: <TData = Awaited<ReturnType<typeof getMyStore>>, TError = ErrorType<void>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getMyStore>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getMyStore>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetMyStoreQueryResult = NonNullable<Awaited<ReturnType<typeof getMyStore>>>;
export type GetMyStoreQueryError = ErrorType<void>;
/**
 * @summary Get current merchant's store
 */
export declare function useGetMyStore<TData = Awaited<ReturnType<typeof getMyStore>>, TError = ErrorType<void>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getMyStore>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getCreateStoreUrl: () => string;
/**
 * @summary Create a store
 */
export declare const createStore: (storeInput: StoreInput, options?: RequestInit) => Promise<Store>;
export declare const getCreateStoreMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createStore>>, TError, {
        data: BodyType<StoreInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createStore>>, TError, {
    data: BodyType<StoreInput>;
}, TContext>;
export type CreateStoreMutationResult = NonNullable<Awaited<ReturnType<typeof createStore>>>;
export type CreateStoreMutationBody = BodyType<StoreInput>;
export type CreateStoreMutationError = ErrorType<unknown>;
/**
* @summary Create a store
*/
export declare const useCreateStore: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createStore>>, TError, {
        data: BodyType<StoreInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof createStore>>, TError, {
    data: BodyType<StoreInput>;
}, TContext>;
export declare const getUpdateStoreUrl: (storeId: number) => string;
/**
 * @summary Update store
 */
export declare const updateStore: (storeId: number, storeUpdate: StoreUpdate, options?: RequestInit) => Promise<Store>;
export declare const getUpdateStoreMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateStore>>, TError, {
        storeId: number;
        data: BodyType<StoreUpdate>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updateStore>>, TError, {
    storeId: number;
    data: BodyType<StoreUpdate>;
}, TContext>;
export type UpdateStoreMutationResult = NonNullable<Awaited<ReturnType<typeof updateStore>>>;
export type UpdateStoreMutationBody = BodyType<StoreUpdate>;
export type UpdateStoreMutationError = ErrorType<unknown>;
/**
* @summary Update store
*/
export declare const useUpdateStore: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateStore>>, TError, {
        storeId: number;
        data: BodyType<StoreUpdate>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof updateStore>>, TError, {
    storeId: number;
    data: BodyType<StoreUpdate>;
}, TContext>;
export declare const getListProductsUrl: (storeId: number) => string;
/**
 * @summary List products for a store
 */
export declare const listProducts: (storeId: number, options?: RequestInit) => Promise<Product[]>;
export declare const getListProductsQueryKey: (storeId: number) => readonly [`/api/stores/${number}/products`];
export declare const getListProductsQueryOptions: <TData = Awaited<ReturnType<typeof listProducts>>, TError = ErrorType<unknown>>(storeId: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listProducts>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listProducts>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListProductsQueryResult = NonNullable<Awaited<ReturnType<typeof listProducts>>>;
export type ListProductsQueryError = ErrorType<unknown>;
/**
 * @summary List products for a store
 */
export declare function useListProducts<TData = Awaited<ReturnType<typeof listProducts>>, TError = ErrorType<unknown>>(storeId: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listProducts>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getCreateProductUrl: (storeId: number) => string;
/**
 * @summary Create a product
 */
export declare const createProduct: (storeId: number, productInput: ProductInput, options?: RequestInit) => Promise<Product>;
export declare const getCreateProductMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createProduct>>, TError, {
        storeId: number;
        data: BodyType<ProductInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createProduct>>, TError, {
    storeId: number;
    data: BodyType<ProductInput>;
}, TContext>;
export type CreateProductMutationResult = NonNullable<Awaited<ReturnType<typeof createProduct>>>;
export type CreateProductMutationBody = BodyType<ProductInput>;
export type CreateProductMutationError = ErrorType<unknown>;
/**
* @summary Create a product
*/
export declare const useCreateProduct: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createProduct>>, TError, {
        storeId: number;
        data: BodyType<ProductInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof createProduct>>, TError, {
    storeId: number;
    data: BodyType<ProductInput>;
}, TContext>;
export declare const getGetProductUrl: (storeId: number, productId: number) => string;
/**
 * @summary Get a product
 */
export declare const getProduct: (storeId: number, productId: number, options?: RequestInit) => Promise<Product>;
export declare const getGetProductQueryKey: (storeId: number, productId: number) => readonly [`/api/stores/${number}/products/${number}`];
export declare const getGetProductQueryOptions: <TData = Awaited<ReturnType<typeof getProduct>>, TError = ErrorType<unknown>>(storeId: number, productId: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getProduct>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getProduct>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetProductQueryResult = NonNullable<Awaited<ReturnType<typeof getProduct>>>;
export type GetProductQueryError = ErrorType<unknown>;
/**
 * @summary Get a product
 */
export declare function useGetProduct<TData = Awaited<ReturnType<typeof getProduct>>, TError = ErrorType<unknown>>(storeId: number, productId: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getProduct>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getUpdateProductUrl: (storeId: number, productId: number) => string;
/**
 * @summary Update a product
 */
export declare const updateProduct: (storeId: number, productId: number, productUpdate: ProductUpdate, options?: RequestInit) => Promise<Product>;
export declare const getUpdateProductMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateProduct>>, TError, {
        storeId: number;
        productId: number;
        data: BodyType<ProductUpdate>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updateProduct>>, TError, {
    storeId: number;
    productId: number;
    data: BodyType<ProductUpdate>;
}, TContext>;
export type UpdateProductMutationResult = NonNullable<Awaited<ReturnType<typeof updateProduct>>>;
export type UpdateProductMutationBody = BodyType<ProductUpdate>;
export type UpdateProductMutationError = ErrorType<unknown>;
/**
* @summary Update a product
*/
export declare const useUpdateProduct: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateProduct>>, TError, {
        storeId: number;
        productId: number;
        data: BodyType<ProductUpdate>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof updateProduct>>, TError, {
    storeId: number;
    productId: number;
    data: BodyType<ProductUpdate>;
}, TContext>;
export declare const getDeleteProductUrl: (storeId: number, productId: number) => string;
/**
 * @summary Delete a product
 */
export declare const deleteProduct: (storeId: number, productId: number, options?: RequestInit) => Promise<void>;
export declare const getDeleteProductMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteProduct>>, TError, {
        storeId: number;
        productId: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof deleteProduct>>, TError, {
    storeId: number;
    productId: number;
}, TContext>;
export type DeleteProductMutationResult = NonNullable<Awaited<ReturnType<typeof deleteProduct>>>;
export type DeleteProductMutationError = ErrorType<unknown>;
/**
* @summary Delete a product
*/
export declare const useDeleteProduct: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteProduct>>, TError, {
        storeId: number;
        productId: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof deleteProduct>>, TError, {
    storeId: number;
    productId: number;
}, TContext>;
export declare const getListProductCategoriesUrl: (storeId: number) => string;
/**
 * @summary List product categories for a store
 */
export declare const listProductCategories: (storeId: number, options?: RequestInit) => Promise<ProductCategory[]>;
export declare const getListProductCategoriesQueryKey: (storeId: number) => readonly [`/api/stores/${number}/categories`];
export declare const getListProductCategoriesQueryOptions: <TData = Awaited<ReturnType<typeof listProductCategories>>, TError = ErrorType<unknown>>(storeId: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listProductCategories>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listProductCategories>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListProductCategoriesQueryResult = NonNullable<Awaited<ReturnType<typeof listProductCategories>>>;
export type ListProductCategoriesQueryError = ErrorType<unknown>;
/**
 * @summary List product categories for a store
 */
export declare function useListProductCategories<TData = Awaited<ReturnType<typeof listProductCategories>>, TError = ErrorType<unknown>>(storeId: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listProductCategories>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getCreateProductCategoryUrl: (storeId: number) => string;
/**
 * @summary Create a product category
 */
export declare const createProductCategory: (storeId: number, productCategoryInput: ProductCategoryInput, options?: RequestInit) => Promise<ProductCategory>;
export declare const getCreateProductCategoryMutationOptions: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createProductCategory>>, TError, {
        storeId: number;
        data: BodyType<ProductCategoryInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createProductCategory>>, TError, {
    storeId: number;
    data: BodyType<ProductCategoryInput>;
}, TContext>;
export type CreateProductCategoryMutationResult = NonNullable<Awaited<ReturnType<typeof createProductCategory>>>;
export type CreateProductCategoryMutationBody = BodyType<ProductCategoryInput>;
export type CreateProductCategoryMutationError = ErrorType<void>;
/**
* @summary Create a product category
*/
export declare const useCreateProductCategory: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createProductCategory>>, TError, {
        storeId: number;
        data: BodyType<ProductCategoryInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof createProductCategory>>, TError, {
    storeId: number;
    data: BodyType<ProductCategoryInput>;
}, TContext>;
export declare const getUpdateProductCategoryUrl: (storeId: number, categoryId: number) => string;
/**
 * @summary Update a product category name
 */
export declare const updateProductCategory: (storeId: number, categoryId: number, productCategoryInput: ProductCategoryInput, options?: RequestInit) => Promise<ProductCategory>;
export declare const getUpdateProductCategoryMutationOptions: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateProductCategory>>, TError, {
        storeId: number;
        categoryId: number;
        data: BodyType<ProductCategoryInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updateProductCategory>>, TError, {
    storeId: number;
    categoryId: number;
    data: BodyType<ProductCategoryInput>;
}, TContext>;
export type UpdateProductCategoryMutationResult = NonNullable<Awaited<ReturnType<typeof updateProductCategory>>>;
export type UpdateProductCategoryMutationBody = BodyType<ProductCategoryInput>;
export type UpdateProductCategoryMutationError = ErrorType<void>;
/**
* @summary Update a product category name
*/
export declare const useUpdateProductCategory: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateProductCategory>>, TError, {
        storeId: number;
        categoryId: number;
        data: BodyType<ProductCategoryInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof updateProductCategory>>, TError, {
    storeId: number;
    categoryId: number;
    data: BodyType<ProductCategoryInput>;
}, TContext>;
export declare const getDeleteProductCategoryUrl: (storeId: number, categoryId: number) => string;
/**
 * @summary Delete a product category
 */
export declare const deleteProductCategory: (storeId: number, categoryId: number, options?: RequestInit) => Promise<void>;
export declare const getDeleteProductCategoryMutationOptions: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteProductCategory>>, TError, {
        storeId: number;
        categoryId: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof deleteProductCategory>>, TError, {
    storeId: number;
    categoryId: number;
}, TContext>;
export type DeleteProductCategoryMutationResult = NonNullable<Awaited<ReturnType<typeof deleteProductCategory>>>;
export type DeleteProductCategoryMutationError = ErrorType<void>;
/**
* @summary Delete a product category
*/
export declare const useDeleteProductCategory: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteProductCategory>>, TError, {
        storeId: number;
        categoryId: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof deleteProductCategory>>, TError, {
    storeId: number;
    categoryId: number;
}, TContext>;
export declare const getListOrdersUrl: (storeId: number) => string;
/**
 * @summary List all orders for a store
 */
export declare const listOrders: (storeId: number, options?: RequestInit) => Promise<Order[]>;
export declare const getListOrdersQueryKey: (storeId: number) => readonly [`/api/stores/${number}/orders`];
export declare const getListOrdersQueryOptions: <TData = Awaited<ReturnType<typeof listOrders>>, TError = ErrorType<unknown>>(storeId: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listOrders>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listOrders>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListOrdersQueryResult = NonNullable<Awaited<ReturnType<typeof listOrders>>>;
export type ListOrdersQueryError = ErrorType<unknown>;
/**
 * @summary List all orders for a store
 */
export declare function useListOrders<TData = Awaited<ReturnType<typeof listOrders>>, TError = ErrorType<unknown>>(storeId: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listOrders>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getCreateMerchantOrderUrl: (storeId: number) => string;
/**
 * @summary Create an order from merchant backend
 */
export declare const createMerchantOrder: (storeId: number, merchantOrderInput: MerchantOrderInput, options?: RequestInit) => Promise<Order>;
export declare const getCreateMerchantOrderMutationOptions: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createMerchantOrder>>, TError, {
        storeId: number;
        data: BodyType<MerchantOrderInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createMerchantOrder>>, TError, {
    storeId: number;
    data: BodyType<MerchantOrderInput>;
}, TContext>;
export type CreateMerchantOrderMutationResult = NonNullable<Awaited<ReturnType<typeof createMerchantOrder>>>;
export type CreateMerchantOrderMutationBody = BodyType<MerchantOrderInput>;
export type CreateMerchantOrderMutationError = ErrorType<void>;
/**
* @summary Create an order from merchant backend
*/
export declare const useCreateMerchantOrder: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createMerchantOrder>>, TError, {
        storeId: number;
        data: BodyType<MerchantOrderInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof createMerchantOrder>>, TError, {
    storeId: number;
    data: BodyType<MerchantOrderInput>;
}, TContext>;
export declare const getExportOrdersUrl: (storeId: number) => string;
/**
 * @summary Export orders as CSV
 */
export declare const exportOrders: (storeId: number, options?: RequestInit) => Promise<string>;
export declare const getExportOrdersQueryKey: (storeId: number) => readonly [`/api/stores/${number}/orders/export`];
export declare const getExportOrdersQueryOptions: <TData = Awaited<ReturnType<typeof exportOrders>>, TError = ErrorType<unknown>>(storeId: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof exportOrders>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof exportOrders>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ExportOrdersQueryResult = NonNullable<Awaited<ReturnType<typeof exportOrders>>>;
export type ExportOrdersQueryError = ErrorType<unknown>;
/**
 * @summary Export orders as CSV
 */
export declare function useExportOrders<TData = Awaited<ReturnType<typeof exportOrders>>, TError = ErrorType<unknown>>(storeId: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof exportOrders>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetStoreStatsUrl: (storeId: number) => string;
/**
 * @summary Get order statistics for a store
 */
export declare const getStoreStats: (storeId: number, options?: RequestInit) => Promise<StoreStats>;
export declare const getGetStoreStatsQueryKey: (storeId: number) => readonly [`/api/stores/${number}/stats`];
export declare const getGetStoreStatsQueryOptions: <TData = Awaited<ReturnType<typeof getStoreStats>>, TError = ErrorType<unknown>>(storeId: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getStoreStats>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getStoreStats>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetStoreStatsQueryResult = NonNullable<Awaited<ReturnType<typeof getStoreStats>>>;
export type GetStoreStatsQueryError = ErrorType<unknown>;
/**
 * @summary Get order statistics for a store
 */
export declare function useGetStoreStats<TData = Awaited<ReturnType<typeof getStoreStats>>, TError = ErrorType<unknown>>(storeId: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getStoreStats>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetSellerAgentSettingsUrl: (storeId: number) => string;
/**
 * @summary Get seller agent settings for a store
 */
export declare const getSellerAgentSettings: (storeId: number, options?: RequestInit) => Promise<GetSellerAgentSettings200>;
export declare const getGetSellerAgentSettingsQueryKey: (storeId: number) => readonly [`/api/stores/${number}/agent/settings`];
export declare const getGetSellerAgentSettingsQueryOptions: <TData = Awaited<ReturnType<typeof getSellerAgentSettings>>, TError = ErrorType<void>>(storeId: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getSellerAgentSettings>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getSellerAgentSettings>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetSellerAgentSettingsQueryResult = NonNullable<Awaited<ReturnType<typeof getSellerAgentSettings>>>;
export type GetSellerAgentSettingsQueryError = ErrorType<void>;
/**
 * @summary Get seller agent settings for a store
 */
export declare function useGetSellerAgentSettings<TData = Awaited<ReturnType<typeof getSellerAgentSettings>>, TError = ErrorType<void>>(storeId: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getSellerAgentSettings>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getUpdateSellerAgentSettingsUrl: (storeId: number) => string;
/**
 * @summary Update seller agent settings for a store
 */
export declare const updateSellerAgentSettings: (storeId: number, updateSellerAgentSettingsRequest: UpdateSellerAgentSettingsRequest, options?: RequestInit) => Promise<UpdateSellerAgentSettings200>;
export declare const getUpdateSellerAgentSettingsMutationOptions: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateSellerAgentSettings>>, TError, {
        storeId: number;
        data: BodyType<UpdateSellerAgentSettingsRequest>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updateSellerAgentSettings>>, TError, {
    storeId: number;
    data: BodyType<UpdateSellerAgentSettingsRequest>;
}, TContext>;
export type UpdateSellerAgentSettingsMutationResult = NonNullable<Awaited<ReturnType<typeof updateSellerAgentSettings>>>;
export type UpdateSellerAgentSettingsMutationBody = BodyType<UpdateSellerAgentSettingsRequest>;
export type UpdateSellerAgentSettingsMutationError = ErrorType<void>;
/**
* @summary Update seller agent settings for a store
*/
export declare const useUpdateSellerAgentSettings: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateSellerAgentSettings>>, TError, {
        storeId: number;
        data: BodyType<UpdateSellerAgentSettingsRequest>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof updateSellerAgentSettings>>, TError, {
    storeId: number;
    data: BodyType<UpdateSellerAgentSettingsRequest>;
}, TContext>;
export declare const getUpdateOrderUrl: (orderId: number) => string;
/**
 * @summary Update order basic info (merchant)
 */
export declare const updateOrder: (orderId: number, orderUpdate: OrderUpdate, options?: RequestInit) => Promise<Order>;
export declare const getUpdateOrderMutationOptions: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateOrder>>, TError, {
        orderId: number;
        data: BodyType<OrderUpdate>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updateOrder>>, TError, {
    orderId: number;
    data: BodyType<OrderUpdate>;
}, TContext>;
export type UpdateOrderMutationResult = NonNullable<Awaited<ReturnType<typeof updateOrder>>>;
export type UpdateOrderMutationBody = BodyType<OrderUpdate>;
export type UpdateOrderMutationError = ErrorType<void>;
/**
* @summary Update order basic info (merchant)
*/
export declare const useUpdateOrder: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateOrder>>, TError, {
        orderId: number;
        data: BodyType<OrderUpdate>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof updateOrder>>, TError, {
    orderId: number;
    data: BodyType<OrderUpdate>;
}, TContext>;
export declare const getUpdateOrderStatusUrl: (orderId: number) => string;
/**
 * @summary Update order status
 */
export declare const updateOrderStatus: (orderId: number, orderStatusUpdate: OrderStatusUpdate, options?: RequestInit) => Promise<Order>;
export declare const getUpdateOrderStatusMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateOrderStatus>>, TError, {
        orderId: number;
        data: BodyType<OrderStatusUpdate>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updateOrderStatus>>, TError, {
    orderId: number;
    data: BodyType<OrderStatusUpdate>;
}, TContext>;
export type UpdateOrderStatusMutationResult = NonNullable<Awaited<ReturnType<typeof updateOrderStatus>>>;
export type UpdateOrderStatusMutationBody = BodyType<OrderStatusUpdate>;
export type UpdateOrderStatusMutationError = ErrorType<unknown>;
/**
* @summary Update order status
*/
export declare const useUpdateOrderStatus: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateOrderStatus>>, TError, {
        orderId: number;
        data: BodyType<OrderStatusUpdate>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof updateOrderStatus>>, TError, {
    orderId: number;
    data: BodyType<OrderStatusUpdate>;
}, TContext>;
export declare const getGetPickingListUrl: () => string;
/**
 * @summary Get picking list for selected orders (grouped by product)
 */
export declare const getPickingList: (orderIdsBody: OrderIdsBody, options?: RequestInit) => Promise<PickingListResponse>;
export declare const getGetPickingListMutationOptions: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof getPickingList>>, TError, {
        data: BodyType<OrderIdsBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof getPickingList>>, TError, {
    data: BodyType<OrderIdsBody>;
}, TContext>;
export type GetPickingListMutationResult = NonNullable<Awaited<ReturnType<typeof getPickingList>>>;
export type GetPickingListMutationBody = BodyType<OrderIdsBody>;
export type GetPickingListMutationError = ErrorType<void>;
/**
* @summary Get picking list for selected orders (grouped by product)
*/
export declare const useGetPickingList: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof getPickingList>>, TError, {
        data: BodyType<OrderIdsBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof getPickingList>>, TError, {
    data: BodyType<OrderIdsBody>;
}, TContext>;
export declare const getGetShippingListUrl: () => string;
/**
 * @summary Get shipping list for selected orders (one entry per order)
 */
export declare const getShippingList: (orderIdsBody: OrderIdsBody, options?: RequestInit) => Promise<ShippingListResponse>;
export declare const getGetShippingListMutationOptions: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof getShippingList>>, TError, {
        data: BodyType<OrderIdsBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof getShippingList>>, TError, {
    data: BodyType<OrderIdsBody>;
}, TContext>;
export type GetShippingListMutationResult = NonNullable<Awaited<ReturnType<typeof getShippingList>>>;
export type GetShippingListMutationBody = BodyType<OrderIdsBody>;
export type GetShippingListMutationError = ErrorType<void>;
/**
* @summary Get shipping list for selected orders (one entry per order)
*/
export declare const useGetShippingList: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof getShippingList>>, TError, {
        data: BodyType<OrderIdsBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof getShippingList>>, TError, {
    data: BodyType<OrderIdsBody>;
}, TContext>;
export declare const getDownloadPickingListCsvUrl: () => string;
/**
 * @summary Download picking list as CSV (UTF-8 BOM, grouped by product)
 */
export declare const downloadPickingListCsv: (orderIdsBody: OrderIdsBody, options?: RequestInit) => Promise<Blob>;
export declare const getDownloadPickingListCsvMutationOptions: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof downloadPickingListCsv>>, TError, {
        data: BodyType<OrderIdsBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof downloadPickingListCsv>>, TError, {
    data: BodyType<OrderIdsBody>;
}, TContext>;
export type DownloadPickingListCsvMutationResult = NonNullable<Awaited<ReturnType<typeof downloadPickingListCsv>>>;
export type DownloadPickingListCsvMutationBody = BodyType<OrderIdsBody>;
export type DownloadPickingListCsvMutationError = ErrorType<void>;
/**
* @summary Download picking list as CSV (UTF-8 BOM, grouped by product)
*/
export declare const useDownloadPickingListCsv: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof downloadPickingListCsv>>, TError, {
        data: BodyType<OrderIdsBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof downloadPickingListCsv>>, TError, {
    data: BodyType<OrderIdsBody>;
}, TContext>;
export declare const getDownloadShippingListCsvUrl: () => string;
/**
 * @summary Download shipping list as CSV (UTF-8 BOM, one row per order)
 */
export declare const downloadShippingListCsv: (orderIdsBody: OrderIdsBody, options?: RequestInit) => Promise<Blob>;
export declare const getDownloadShippingListCsvMutationOptions: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof downloadShippingListCsv>>, TError, {
        data: BodyType<OrderIdsBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof downloadShippingListCsv>>, TError, {
    data: BodyType<OrderIdsBody>;
}, TContext>;
export type DownloadShippingListCsvMutationResult = NonNullable<Awaited<ReturnType<typeof downloadShippingListCsv>>>;
export type DownloadShippingListCsvMutationBody = BodyType<OrderIdsBody>;
export type DownloadShippingListCsvMutationError = ErrorType<void>;
/**
* @summary Download shipping list as CSV (UTF-8 BOM, one row per order)
*/
export declare const useDownloadShippingListCsv: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof downloadShippingListCsv>>, TError, {
        data: BodyType<OrderIdsBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof downloadShippingListCsv>>, TError, {
    data: BodyType<OrderIdsBody>;
}, TContext>;
export declare const getBulkUpdateOrdersUrl: () => string;
/**
 * @summary Bulk update payment/shipping status for multiple orders
 */
export declare const bulkUpdateOrders: (bulkOrderUpdate: BulkOrderUpdate, options?: RequestInit) => Promise<BulkOrderUpdateResponse>;
export declare const getBulkUpdateOrdersMutationOptions: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof bulkUpdateOrders>>, TError, {
        data: BodyType<BulkOrderUpdate>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof bulkUpdateOrders>>, TError, {
    data: BodyType<BulkOrderUpdate>;
}, TContext>;
export type BulkUpdateOrdersMutationResult = NonNullable<Awaited<ReturnType<typeof bulkUpdateOrders>>>;
export type BulkUpdateOrdersMutationBody = BodyType<BulkOrderUpdate>;
export type BulkUpdateOrdersMutationError = ErrorType<void>;
/**
* @summary Bulk update payment/shipping status for multiple orders
*/
export declare const useBulkUpdateOrders: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof bulkUpdateOrders>>, TError, {
        data: BodyType<BulkOrderUpdate>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof bulkUpdateOrders>>, TError, {
    data: BodyType<BulkOrderUpdate>;
}, TContext>;
export declare const getImportOrderTrackingUrl: () => string;
/**
 * @summary Batch import tracking codes for orders (merchant, auth required)
 */
export declare const importOrderTracking: (trackingImportBody: TrackingImportBody, options?: RequestInit) => Promise<TrackingImportResponse>;
export declare const getImportOrderTrackingMutationOptions: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof importOrderTracking>>, TError, {
        data: BodyType<TrackingImportBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof importOrderTracking>>, TError, {
    data: BodyType<TrackingImportBody>;
}, TContext>;
export type ImportOrderTrackingMutationResult = NonNullable<Awaited<ReturnType<typeof importOrderTracking>>>;
export type ImportOrderTrackingMutationBody = BodyType<TrackingImportBody>;
export type ImportOrderTrackingMutationError = ErrorType<void>;
/**
* @summary Batch import tracking codes for orders (merchant, auth required)
*/
export declare const useImportOrderTracking: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof importOrderTracking>>, TError, {
        data: BodyType<TrackingImportBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof importOrderTracking>>, TError, {
    data: BodyType<TrackingImportBody>;
}, TContext>;
export declare const getGetPublicProductUrl: (shareToken: string) => string;
/**
 * @summary Get product by share token (public, no auth)
 */
export declare const getPublicProduct: (shareToken: string, options?: RequestInit) => Promise<PublicProduct>;
export declare const getGetPublicProductQueryKey: (shareToken: string) => readonly [`/api/p/${string}`];
export declare const getGetPublicProductQueryOptions: <TData = Awaited<ReturnType<typeof getPublicProduct>>, TError = ErrorType<void>>(shareToken: string, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getPublicProduct>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getPublicProduct>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetPublicProductQueryResult = NonNullable<Awaited<ReturnType<typeof getPublicProduct>>>;
export type GetPublicProductQueryError = ErrorType<void>;
/**
 * @summary Get product by share token (public, no auth)
 */
export declare function useGetPublicProduct<TData = Awaited<ReturnType<typeof getPublicProduct>>, TError = ErrorType<void>>(shareToken: string, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getPublicProduct>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getSubmitOrderUrl: (shareToken: string) => string;
/**
 * @summary Submit an order (public, no auth)
 */
export declare const submitOrder: (shareToken: string, orderInput: OrderInput, options?: RequestInit) => Promise<Order>;
export declare const getSubmitOrderMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof submitOrder>>, TError, {
        shareToken: string;
        data: BodyType<OrderInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof submitOrder>>, TError, {
    shareToken: string;
    data: BodyType<OrderInput>;
}, TContext>;
export type SubmitOrderMutationResult = NonNullable<Awaited<ReturnType<typeof submitOrder>>>;
export type SubmitOrderMutationBody = BodyType<OrderInput>;
export type SubmitOrderMutationError = ErrorType<unknown>;
/**
* @summary Submit an order (public, no auth)
*/
export declare const useSubmitOrder: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof submitOrder>>, TError, {
        shareToken: string;
        data: BodyType<OrderInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof submitOrder>>, TError, {
    shareToken: string;
    data: BodyType<OrderInput>;
}, TContext>;
export declare const getGetPublicOrderUrl: (publicToken: string) => string;
/**
 * @summary Get order status by public token (no auth)
 */
export declare const getPublicOrder: (publicToken: string, options?: RequestInit) => Promise<PublicOrder>;
export declare const getGetPublicOrderQueryKey: (publicToken: string) => readonly [`/api/orders/track/${string}`];
export declare const getGetPublicOrderQueryOptions: <TData = Awaited<ReturnType<typeof getPublicOrder>>, TError = ErrorType<void>>(publicToken: string, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getPublicOrder>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getPublicOrder>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetPublicOrderQueryResult = NonNullable<Awaited<ReturnType<typeof getPublicOrder>>>;
export type GetPublicOrderQueryError = ErrorType<void>;
/**
 * @summary Get order status by public token (no auth)
 */
export declare function useGetPublicOrder<TData = Awaited<ReturnType<typeof getPublicOrder>>, TError = ErrorType<void>>(publicToken: string, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getPublicOrder>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export {};
//# sourceMappingURL=api.d.ts.map