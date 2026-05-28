import { createApp } from '../index';

describe('App smoke test', () => {
  it('should create an Express app', () => {
    const app = createApp();
    expect(app).toBeDefined();
    expect(typeof app.listen).toBe('function');
  });

  it('should have health endpoint registered', () => {
    const app = createApp();
    const routes = app._router.stack
      .filter((layer: any) => layer.route)
      .map((layer: any) => layer.route.path);
    expect(routes).toContain('/health');
  });
});
