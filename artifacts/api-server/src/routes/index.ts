import { Router, type IRouter } from "express";
import healthRouter from "./health";
import storesRouter from "./stores";
import productsRouter from "./products";
import ordersRouter from "./orders";
import publicRouter from "./public";
import uploadRouter from "./upload";
import devHandoffRouter from "./devHandoff";

const router: IRouter = Router();

router.use(healthRouter);
router.use(publicRouter);
router.use(storesRouter);
router.use(productsRouter);
router.use(ordersRouter);
router.use(uploadRouter);
if (process.env.NODE_ENV !== "production") {
  router.use(devHandoffRouter);
}

export default router;
