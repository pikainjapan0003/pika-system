import { Router, type IRouter } from "express";
import healthRouter from "./health.ts";
import storesRouter from "./stores.ts";
import productsRouter from "./products.ts";
import tripsRouter from "./trips.ts";
import categoriesRouter from "./categories.ts";
import ordersRouter from "./orders.ts";
import customersRouter from "./customers.ts";
import publicRouter from "./public.ts";
import uploadRouter from "./upload.ts";
import devHandoffRouter from "./devHandoff.ts";
import cvsRouter from "./cvs.ts";
import agentRouter from "./agent.ts";
import sellerAgentRouter from "./sellerAgent.ts";
import logisticsImportsRouter from "./logisticsImports.ts";
import logisticsExceptionsRouter from "./logisticsExceptions.ts";
import logisticsSyncRouter from "./logisticsSync.ts";
import internalLogisticsSyncRouter from "./internalLogisticsSync.ts";
import exchangeRateReferenceRouter from "./exchangeRateReference.ts";
import auditLogsRouter from "./auditLogs.ts";
import skillsRouter from "./skills.ts";

const router: IRouter = Router();

router.use(healthRouter);
router.use(publicRouter);
router.use(storesRouter);
router.use(productsRouter);
router.use(tripsRouter);
router.use(categoriesRouter);
router.use(ordersRouter);
router.use(customersRouter);
router.use(cvsRouter);
router.use(uploadRouter);
router.use("/internal/agent", agentRouter);
router.use(sellerAgentRouter);
router.use(logisticsImportsRouter);
router.use(logisticsExceptionsRouter);
router.use(logisticsSyncRouter);
router.use(internalLogisticsSyncRouter);
router.use(exchangeRateReferenceRouter);
router.use(auditLogsRouter);
router.use(skillsRouter);
if (process.env.NODE_ENV !== "production") {
  router.use(devHandoffRouter);
}

export default router;
