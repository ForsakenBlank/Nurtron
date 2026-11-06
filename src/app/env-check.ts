// proves the graphics and physics both really work inside the app window. run by `npm run check-env`.
import { Application, Graphics } from 'pixi.js';

export async function runEnvCheck() {
  const result: Record<string, unknown> = { ok: false };
  const app = new Application();
  await app.init({ width: 640, height: 360, background: '#12141d', antialias: true });
  document.body.appendChild(app.canvas);
  result.renderer = app.renderer.name;

  const RAPIER = (await import('@dimforge/rapier2d-compat')).default;
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: 900 });
  world.createCollider(RAPIER.ColliderDesc.cuboid(320, 10).setTranslation(320, 340));
  const ball = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(320, 0));
  world.createCollider(RAPIER.ColliderDesc.ball(24), ball);
  for (let i = 0; i < 240; i++) world.step();
  const landedY = ball.translation().y;
  result.rapierLandedY = Math.round(landedY);

  const g = new Graphics();
  g.rect(0, 330, 640, 30).fill(0x2a3048);
  g.circle(ball.translation().x, landedY, 24).fill(0xf0524d);
  app.stage.addChild(g);
  app.render();

  result.ok = Math.abs(landedY - 306) < 3 && !!app.renderer.name;
  return result;
}
