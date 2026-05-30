import { Router, type IRouter } from "express";
import healthRouter from "./health";
import storesRouter from "./stores";
import productsRouter from "./products";
import ordersRouter from "./orders";
import publicRouter from "./public";

const router: IRouter = Router();

router.use(healthRouter);
router.use(publicRouter);
router.use(storesRouter);
router.use(productsRouter);
router.use(ordersRouter);

export default router;
