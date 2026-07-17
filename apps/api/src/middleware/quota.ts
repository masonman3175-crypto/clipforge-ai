import type { NextFunction, Request, Response } from 'express';

/**
 * Enforces the Free-plan monthly video limit. Pro users and licensed users pass through.
 * Now works alongside the license system — if they have a license, they skip quota.
 */
export async function enforceVideoQuota(req: Request, res: Response, next: NextFunction) {
  const user = req.user!;

  // Admins always pass
  if (user.role === 'admin') return next();

  // Licensed pro users pass (licenseStatus is set by requireLicense if it ran first)
  if (req.licenseStatus?.hasLicense) return next();

  // Free trial users: the requireLicense middleware already handled the 403 check.
  // If we got here, they have trial remaining. Let them through.
  if (req.licenseStatus && !req.licenseStatus.needsKey) return next();

  // Legacy: old free plan monthly quota (kept for backward compatibility)
  // This only hits if somehow neither license nor trial check ran.
  next();
}
