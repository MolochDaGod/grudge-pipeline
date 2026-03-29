import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "../lib/grudge-client";
import { logger } from "../lib/logger";
import type { GrudgeUser } from "../types/grudge";

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      grudgeUser?: GrudgeUser;
      isInternal?: boolean;
    }
  }
}

const INTERNAL_KEY = process.env["INTERNAL_API_KEY"] ?? "";

/**
 * Requires Grudge JWT auth. Rejects unauthenticated requests.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  // Check internal API key first (service-to-service)
  const apiKey = req.headers["x-api-key"] as string | undefined;
  if (apiKey && INTERNAL_KEY && apiKey === INTERNAL_KEY) {
    req.isInternal = true;
    return next();
  }

  // Check Bearer token
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing authorization token" });
    return;
  }

  const token = header.slice(7);
  try {
    const result = await verifyToken(token);
    if (!result.valid || !result.user) {
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }
    req.grudgeUser = result.user;
    next();
  } catch (err) {
    logger.error({ err }, "Token verification failed");
    res.status(401).json({ error: "Token verification failed" });
  }
}

/**
 * Optional auth — attaches user if token present, but doesn't reject.
 */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const apiKey = req.headers["x-api-key"] as string | undefined;
  if (apiKey && INTERNAL_KEY && apiKey === INTERNAL_KEY) {
    req.isInternal = true;
    return next();
  }

  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next();
  }

  try {
    const result = await verifyToken(header.slice(7));
    if (result.valid && result.user) {
      req.grudgeUser = result.user;
    }
  } catch {
    // Silently continue — auth is optional
  }
  next();
}

/**
 * Extract the raw Bearer token from request headers.
 */
export function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice(7);
}
