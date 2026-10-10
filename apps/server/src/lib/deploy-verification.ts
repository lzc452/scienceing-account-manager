import type { NextFunction, Request, Response } from 'express';

export function isDeploymentVerification(): boolean {
  return process.env.SCIENCEING_DEPLOY_VERIFY_ONLY === '1';
}

export function deploymentVerificationMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!isDeploymentVerification() || (req.method === 'GET' && req.path === '/api/extension/config')) {
    next();
    return;
  }
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Retry-After', '30');
  res.status(503).json({ statusCode: 503, message: '发布验证中，请稍后重试' });
}
