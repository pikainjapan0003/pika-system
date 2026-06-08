import { Router } from "express";
import { agentTokenAuth } from "../middlewares/agentAuth.ts";

const router = Router();

const NOT_IMPLEMENTED = {
  error: "not_implemented",
  message: "Agent endpoint is not implemented yet",
} as const;

// All routes require agent token auth.
// Skeleton only — returns 501 until full implementation in Step 7D-3C/3D/3E.

router.get("/orders/tracking-jobs", agentTokenAuth, (_req, res) => {
  res.status(501).json(NOT_IMPLEMENTED);
});

router.post("/shipment-events", agentTokenAuth, (_req, res) => {
  res.status(501).json(NOT_IMPLEMENTED);
});

router.patch("/shipment-status", agentTokenAuth, (_req, res) => {
  res.status(501).json(NOT_IMPLEMENTED);
});

router.post("/run-log", agentTokenAuth, (_req, res) => {
  res.status(501).json(NOT_IMPLEMENTED);
});

export default router;
