import { Router, type IRouter } from "express";
import healthRouter from "./health";
import storesRouter from "./stores";
import productsRouter from "./products";
import categoriesRouter from "./categories";
import ordersRouter from "./orders";
import publicRouter from "./public";
import uploadRouter from "./upload";
import devHandoffRouter from "./devHandoff";
import cvsRouter from "./cvs";
import agentRouter from "./agent";
import sellerAgentRouter from "./sellerAgent.ts";

const router: IRouter = Router();

router.use(healthRouter);
router.use(publicRouter);
router.use(storesRouter);
router.use(productsRouter);
router.use(categoriesRouter);
router.use(ordersRouter);
router.use(cvsRouter);
router.use(uploadRouter);
router.use("/internal/agent", agentRouter);
router.use(sellerAgentRouter);
if (process.env.NODE_ENV !== "production") {
  router.use(devHandoffRouter);
}

export default router;
