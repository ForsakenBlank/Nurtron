// checks the tools nurtron needs, with no window. the desktop half is scripts/check-app.mjs.
import RAPIER from '@dimforge/rapier2d-compat';

const [major, minor] = process.versions.node.split('.').map(Number);
const nodeOk = major > 22 || (major === 22 && minor >= 18);
console.log(`${nodeOk ? 'ok  ' : 'FAIL'} Node ${process.versions.node} (needs 22.18 or newer, which runs .ts files directly)`);

await RAPIER.init();
function drop(): number {
  const world = new RAPIER.World({ x: 0, y: 900 });
  world.createCollider(RAPIER.ColliderDesc.cuboid(320, 10).setTranslation(320, 340));
  const ball = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(320, 0));
  world.createCollider(RAPIER.ColliderDesc.ball(24), ball);
  for (let i = 0; i < 240; i++) world.step();
  return ball.translation().y;
}
const a = drop();
const b = drop();
const physicsOk = Math.abs(a - 306) < 3;
const repeatable = a === b;
console.log(`${physicsOk ? 'ok  ' : 'FAIL'} Rapier physics: a dropped ball lands on the floor (y=${a.toFixed(2)})`);
console.log(`${repeatable ? 'ok  ' : 'FAIL'} Rapier physics: the same drop gives exactly the same result twice`);

if (!nodeOk || !physicsOk || !repeatable) process.exit(1);
