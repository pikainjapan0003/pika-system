import { createHash } from "node:crypto";
import { eq, and, isNull, or, gt, sql } from "drizzle-orm";
import { db, sellerAgentTokensTable } from "@workspace/db";
import { logger } from "../lib/logger.ts";

export interface AgentTokenLocals {
  tokenId: number;
  merchantId: string;
  storeId: number;
  scopes: unknown;
  tokenPrefix: string;
}

export const agentTokenAuth = async (req: any, res: any, next: any) => {
  try {
    const authHeader = req.headers["authorization"] as string | undefined;

    if (!authHeader) {
      return res.status(401).json({
        error: "agent_auth_missing",
        message: "Authorization header required",
      });
    }

    if (!authHeader.startsWith("Bearer ") || authHeader.length <= 7) {
      return res.status(401).json({
        error: "agent_auth_invalid_format",
        message: "Authorization must be: Bearer <token>",
      });
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      return res.status(401).json({
        error: "agent_auth_invalid_format",
        message: "Authorization must be: Bearer <token>",
      });
    }

    // Hash the token — never log or store the plaintext
    const tokenHash = createHash("sha256").update(token).digest("hex");

    const [record] = await db
      .select()
      .from(sellerAgentTokensTable)
      .where(
        and(
          eq(sellerAgentTokensTable.tokenHash, tokenHash),
          eq(sellerAgentTokensTable.status, "active"),
          isNull(sellerAgentTokensTable.revokedAt),
          or(
            isNull(sellerAgentTokensTable.expiresAt),
            gt(sellerAgentTokensTable.expiresAt, sql`NOW()`),
          ),
        ),
      )
      .limit(1);

    if (!record) {
      // Log only a hash prefix — never the raw token
      logger.warn(
        { tokenHashPrefix: tokenHash.slice(0, 8) },
        "agent_token_auth_failed",
      );
      return res.status(401).json({
        error: "agent_auth_unauthorized",
        message: "Invalid or expired token",
      });
    }

    const agentToken: AgentTokenLocals = {
      tokenId: record.id,
      merchantId: record.merchantId,
      storeId: record.storeId,
      scopes: record.scopes,
      tokenPrefix: record.tokenPrefix,
    };
    res.locals.agentToken = agentToken;

    // Fire-and-forget: update lastUsedAt; never fail the request on error
    db.update(sellerAgentTokensTable)
      .set({ lastUsedAt: new Date() })
      .where(eq(sellerAgentTokensTable.id, record.id))
      .catch((updateErr: unknown) => {
        logger.warn(
          { tokenId: record.id, err: updateErr },
          "agent_token_lastUsedAt_update_failed",
        );
      });

    next();
  } catch (err) {
    next(err);
  }
};
