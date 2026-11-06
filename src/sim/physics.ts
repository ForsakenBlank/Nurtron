// the rapier physics world. the world's things stay the source of truth for what exists and how it's set
// up, so saves don't depend on rapier's own format and still load after a rapier update. each tick the
// bodies' positions are copied back onto the things.
import RAPIER from '@dimforge/rapier2d-compat';
import type { Collider, RigidBody } from '@dimforge/rapier2d-compat';
import type { MotorOrder } from './circuit.ts';
import { localCorners } from './shapes.ts';
import type { Form } from './shapes.ts';

let ready = false;

// rapier loads from webassembly, so this has to finish once before making any world
export async function initPhysics(): Promise<void> {
  if (ready) return;
  await RAPIER.init();
  ready = true;
}

export const GRAVITY = 1100;
const SUBSTEPS = 2;
const TELEPORT_OVER = 70; // moved further than this in one tick, it jumps there instead of ramming things

const WALK_STRENGTH = 25; // how much speed it can gain in one substep
const WALL = 200; // thickness of the room's walls, so nothing can get through them

// what a motor's power of 1 does
const PUSH_POWER = 30; // speed gained per second. gravity is 1100, so about 37 power holds something up
const MOVE_POWER = 4; // speed
const SPIN_POWER = 0.1; // radians per second
const KICK_POWER = 8; // speed gained at once

// who collides with whom. things set to not solid only ever hit the room, so they don't fall forever.
const ROOM_GROUP = 1;
const THING_GROUP = 2;
const CREATURE_GROUP = 4;
const GHOST_GROUP = 8;
const groups = (member: number, collidesWith: number): number => ((member << 16) | collidesWith) >>> 0;

export const BODY = { radius: 24, halfHeight: 6, centreAboveFeet: 30 };

export interface PhysicalThing {
  id: number;
  form: Form;
  hw: number;
  hh: number;
  x: number;
  y: number;
  angle: number;
  vx: number;
  vy: number;
  spin: number;
  gravity: boolean;
  fixed: boolean;
  solid: boolean;
  bounce: number;
  friction: number;
  weight: number;
  heldBy: boolean;
  dragged: boolean;
  inBody?: boolean; // inside a creature, so it isn't anywhere in the room
}

export interface PhysicalCreature {
  id: number;
  x: number;
  y: number;
  dragged: boolean;
  wantVx: number | null; // null leaves it free, like when it has just been knocked back
  wantVy: number;
  hop: boolean;
  hopSpeed: number; // how hard it pushes off
  floating: boolean; // no gravity here, so it goes wherever it likes
  climbing: boolean; // holding on, so it goes up and down as well
  hiddenAway: boolean; // not part of the world for now
  field: { x: number; y: number } | null; // gravity that isn't the world's, if it's in a zone
}

interface Entry {
  body: RigidBody;
  collider: Collider;
}

interface CreatureEntry extends Entry {
  slippery: boolean;
  kinematic: boolean;
  free: boolean; // its gravity is being handled here rather than by the physics world
  away: boolean;
}

export class Physics {
  private world: RAPIER.World;
  private entries = new Map<number, Entry>();
  private creatures = new Map<number, CreatureEntry>();
  private room: { width: number; height: number; floor: number };
  private walls: Collider[] = [];
  private drivenFixed = new Set<number>(); // fixed things a motor is moving, which go back to fixed when it stops
  private drivenNow = new Set<number>();

  constructor(room: { width: number; height: number; floor: number }) {
    this.room = room;
    this.world = new RAPIER.World({ x: 0, y: GRAVITY });
    this.world.lengthUnit = 50;
    this.world.timestep = 1 / 30 / SUBSTEPS;
    this.buildWalls();
  }

  // the gravity everything gets unless a zone says otherwise
  setGravity(x: number, y: number): void {
    this.world.gravity = { x, y };
    this.wakeAll();
  }

  // a different size of room just means different walls
  setRoom(room: { width: number; height: number; floor: number }): void {
    this.room = room;
    for (const wall of this.walls) this.world.removeCollider(wall, false);
    this.buildWalls();
    this.wakeAll();
  }

  private buildWalls(): void {
    this.walls = [];
    const wall = (cx: number, cy: number, hx: number, hy: number): void => {
      const desc = RAPIER.ColliderDesc.cuboid(hx, hy).setTranslation(cx, cy).setFriction(0.8).setRestitution(0.1).setCollisionGroups(groups(ROOM_GROUP, THING_GROUP | CREATURE_GROUP | GHOST_GROUP));
      this.walls.push(this.world.createCollider(desc));
    };
    const { width, height, floor } = this.room;
    const across = width / 2 + WALL * 2;
    wall(width / 2, floor + WALL, across, WALL);
    wall(width / 2, -WALL, across, WALL);
    wall(-WALL, height / 2, WALL, height);
    wall(width + WALL, height / 2, WALL, height);
  }

  // creatures walk straight through each other, because a crowd jamming up in a corner would stop anything getting learned
  addCreature(id: number, feetX: number, feetY: number): void {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(feetX, feetY - BODY.centreAboveFeet).lockRotations().setCcdEnabled(true),
    );
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.capsule(BODY.halfHeight, BODY.radius).setDensity(0.01).setFriction(1).setRestitution(0).setCollisionGroups(groups(CREATURE_GROUP, ROOM_GROUP | THING_GROUP)),
      body,
    );
    this.creatures.set(id, { body, collider, slippery: false, kinematic: false, free: false, away: false });
  }

  removeCreature(id: number): void {
    const entry = this.creatures.get(id);
    if (!entry) return;
    this.world.removeRigidBody(entry.body);
    this.creatures.delete(id);
    this.wakeAll();
  }

  private colliderDesc(t: PhysicalThing): RAPIER.ColliderDesc {
    let desc: RAPIER.ColliderDesc | null = null;
    if (t.form === 'circle') desc = RAPIER.ColliderDesc.ball(t.hw);
    else if (t.form === 'box') desc = RAPIER.ColliderDesc.cuboid(t.hw, t.hh);
    else desc = RAPIER.ColliderDesc.convexHull(new Float32Array(localCorners(t.form, t.hw, t.hh).flatMap((p) => [p.x, p.y])));
    desc ??= RAPIER.ColliderDesc.ball(Math.max(t.hw, t.hh));
    return desc
      .setDensity(0.01 * t.weight)
      .setFriction(t.friction)
      .setRestitution(t.bounce)
      // something bouncy should bounce fully off anything, not average out with a dull floor
      .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max)
      .setEnabled(!t.heldBy)
      .setCollisionGroups(t.solid ? groups(THING_GROUP, ROOM_GROUP | THING_GROUP | CREATURE_GROUP) : groups(GHOST_GROUP, ROOM_GROUP));
  }

  private bodyDesc(t: PhysicalThing): RAPIER.RigidBodyDesc {
    const moved = t.dragged || t.heldBy;
    if (moved) return RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(t.x, t.y).setRotation(t.angle);
    if (t.fixed) return RAPIER.RigidBodyDesc.fixed().setTranslation(t.x, t.y).setRotation(t.angle);
    return RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(t.x, t.y)
      .setRotation(t.angle)
      .setLinvel(t.vx, t.vy)
      .setAngvel(t.spin)
      .setGravityScale(t.gravity ? 1 : 0)
      // a bit of drag so balls don't roll forever, and a lot for floating things so a nudge doesn't drift forever
      .setLinearDamping(t.gravity ? 0.4 : 1.5)
      .setAngularDamping(1)
      .setCcdEnabled(true);
  }

  add(t: PhysicalThing): void {
    if (t.inBody) return;
    const body = this.world.createRigidBody(this.bodyDesc(t));
    const collider = this.world.createCollider(this.colliderDesc(t), body);
    this.entries.set(t.id, { body, collider });
  }

  remove(id: number): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.world.removeRigidBody(entry.body);
    this.entries.delete(id);
    this.drivenFixed.delete(id);
    this.wakeAll();
  }

  // after any change to how a thing is set up, the simplest correct thing is to build it again
  rebuild(t: PhysicalThing): void {
    this.remove(t.id);
    this.add(t);
    this.wakeAll();
  }

  // something leaning on a thing that changed needs to notice, even if it had settled and gone to sleep
  wakeAll(): void {
    for (const entry of this.entries.values()) if (entry.body.isDynamic()) entry.body.wakeUp();
    for (const entry of this.creatures.values()) entry.body.wakeUp();
  }

  massOf(id: number): number {
    return this.entries.get(id)?.body.mass() ?? 0;
  }

  setVelocity(id: number, vx: number, vy: number): void {
    this.entries.get(id)?.body.setLinvel({ x: vx, y: vy }, true);
  }

  // a motor at work. something fixed can't be shoved, but it can be turned or moved along, which is how you make a
  // windmill or a lift: nothing that hits it changes its course.
  drive(t: PhysicalThing, order: MotorOrder): void {
    const entry = this.entries.get(t.id);
    if (!entry || t.dragged || t.heldBy) return;
    const body = entry.body;
    const a = (order.direction * Math.PI) / 180;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const p = order.power;
    if (t.fixed) {
      if (order.kick || order.mode === 'push') return;
      if (!this.drivenFixed.has(t.id)) {
        this.drivenFixed.add(t.id);
        body.setBodyType(RAPIER.RigidBodyType.KinematicVelocityBased, true);
      }
      this.drivenNow.add(t.id);
      if (order.mode === 'spin') {
        body.setAngvel(p * SPIN_POWER, true);
      } else {
        // it stops at the edge of the room, since walls can't stop something that nothing can push
        const at = body.translation();
        const dt = 1 / 30;
        let vx = dx * p * MOVE_POWER;
        let vy = dy * p * MOVE_POWER;
        if (at.x + vx * dt < t.hw || at.x + vx * dt > this.room.width - t.hw) vx = 0;
        if (at.y + vy * dt < t.hh || at.y + vy * dt > this.room.floor - t.hh) vy = 0;
        body.setLinvel({ x: vx, y: vy }, true);
      }
      return;
    }
    const v = body.linvel();
    if (order.kick) {
      if (order.mode === 'spin') body.setAngvel(body.angvel() + p * KICK_POWER * 0.05, true);
      else body.setLinvel({ x: v.x + dx * p * KICK_POWER, y: v.y + dy * p * KICK_POWER }, true);
    } else if (order.mode === 'spin') {
      body.setAngvel(p * SPIN_POWER, true);
    } else if (order.mode === 'push') {
      body.setLinvel({ x: v.x + (dx * p * PUSH_POWER) / 30, y: v.y + (dy * p * PUSH_POWER) / 30 }, true);
    } else {
      // only its speed along that direction is decided, so it still falls if it's going sideways
      const along = v.x * dx + v.y * dy;
      const change = p * MOVE_POWER - along;
      body.setLinvel({ x: v.x + dx * change, y: v.y + dy * change }, true);
    }
  }

  private settleDriven(): void {
    for (const id of this.drivenFixed) {
      if (this.drivenNow.has(id)) continue;
      const body = this.entries.get(id)?.body;
      if (body) {
        body.setLinvel({ x: 0, y: 0 }, true);
        body.setAngvel(0, true);
        body.setBodyType(RAPIER.RigidBodyType.Fixed, true);
      }
      this.drivenFixed.delete(id);
    }
    this.drivenNow.clear();
  }

  placeCreature(id: number, feetX: number, feetY: number): void {
    const body = this.creatures.get(id)?.body;
    if (!body) return;
    body.setTranslation({ x: feetX, y: feetY - BODY.centreAboveFeet }, true);
    body.setLinvel({ x: 0, y: 0 }, true);
  }

  knockCreature(id: number, vx: number, vy: number): void {
    this.creatures.get(id)?.body.setLinvel({ x: vx, y: vy }, true);
  }

  // true when there's something under its feet
  creatureGrounded(id: number): boolean {
    const body = this.creatures.get(id)?.body;
    if (!body) return false;
    const at = body.translation();
    const ray = new RAPIER.Ray({ x: at.x, y: at.y }, { x: 0, y: 1 });
    const hit = this.world.castRay(ray, 46, true, undefined, groups(CREATURE_GROUP, ROOM_GROUP | THING_GROUP), undefined, body);
    return hit !== null;
  }

  step(things: PhysicalThing[], creatures: PhysicalCreature[], fieldAt: ((x: number, y: number) => { x: number; y: number } | null) | null = null): void {
    this.settleDriven();
    this.applyFields(things, fieldAt);
    const moves: { body: RigidBody; fromX: number; fromY: number; toX: number; toY: number; angle: number }[] = [];
    for (const t of things) {
      if (!t.dragged && !t.heldBy) continue;
      const entry = this.entries.get(t.id);
      if (!entry) continue;
      const from = entry.body.translation();
      if (Math.hypot(t.x - from.x, t.y - from.y) > TELEPORT_OVER) entry.body.setTranslation({ x: t.x, y: t.y }, true);
      const start = entry.body.translation();
      moves.push({ body: entry.body, fromX: start.x, fromY: start.y, toX: t.x, toY: t.y, angle: t.angle });
    }

    const walkers = creatures.flatMap((creature) => {
      const entry = this.creatures.get(creature.id);
      if (!entry) return [];
      this.prepareCreature(entry, creature);
      const from = entry.body.translation();
      return [{ creature, body: entry.body, fromX: from.x, fromY: from.y }];
    });
    for (let s = 1; s <= SUBSTEPS; s++) {
      const along = s / SUBSTEPS;
      for (const m of moves) {
        m.body.setNextKinematicTranslation({ x: m.fromX + (m.toX - m.fromX) * along, y: m.fromY + (m.toY - m.fromY) * along });
        m.body.setNextKinematicRotation(m.angle);
      }
      for (const { creature, body, fromX, fromY } of walkers) {
        if (creature.dragged) {
          const toY = creature.y - BODY.centreAboveFeet;
          body.setNextKinematicTranslation({ x: fromX + (creature.x - fromX) * along, y: fromY + (toY - fromY) * along });
        } else if (creature.floating || creature.climbing) {
          const v = body.linvel();
          const towards = (want: number, now: number): number => now + Math.max(-WALK_STRENGTH, Math.min(WALK_STRENGTH, want - now));
          if (creature.wantVx !== null) body.setLinvel({ x: towards(creature.wantVx, v.x), y: towards(creature.wantVy, v.y) }, true);
        } else if (creature.wantVx !== null) {
          // it speeds up with limited strength, so light things get shoved along but heavy ones stop it
          const v = body.linvel();
          const change = Math.max(-WALK_STRENGTH, Math.min(WALK_STRENGTH, creature.wantVx - v.x));
          body.setLinvel({ x: v.x + change, y: v.y }, true);
        }
      }
      this.world.step();
    }

    for (const t of things) {
      if (t.dragged || t.heldBy) continue;
      const entry = this.entries.get(t.id);
      if (!entry) continue;
      const at = entry.body.translation();
      const v = entry.body.linvel();
      if (this.lost(at.x, at.y)) {
        // should never happen, but something outside the room could never be got back
        t.x = this.room.width / 2;
        t.y = this.room.floor - 300;
        t.vx = t.vy = t.spin = 0;
        entry.body.setTranslation({ x: t.x, y: t.y }, true);
        entry.body.setLinvel({ x: 0, y: 0 }, true);
        continue;
      }
      t.x = at.x;
      t.y = at.y;
      t.angle = entry.body.rotation();
      t.vx = v.x;
      t.vy = v.y;
      t.spin = entry.body.angvel();
    }

    for (const { creature, body } of walkers) {
      if (creature.dragged) continue;
      const at = body.translation();
      if (this.lost(at.x, at.y)) this.placeCreature(creature.id, this.room.width / 2, this.room.floor);
      const safe = body.translation();
      creature.x = safe.x;
      creature.y = safe.y + BODY.centreAboveFeet;
    }
  }

  // zones are the only thing that needs this, so with none there's nothing here to change how anything falls
  private fielded = new Set<number>();
  private applyFields(things: PhysicalThing[], fieldAt: ((x: number, y: number) => { x: number; y: number } | null) | null): void {
    if (!fieldAt) {
      if (this.fielded.size > 0) {
        for (const t of things) {
          if (!this.fielded.has(t.id)) continue;
          this.entries.get(t.id)?.body.setGravityScale(t.gravity ? 1 : 0, true);
        }
        this.fielded.clear();
      }
      return;
    }
    for (const t of things) {
      if (t.fixed || t.dragged || t.heldBy || t.inBody || !t.gravity) continue;
      const entry = this.entries.get(t.id);
      if (!entry) continue;
      const at = entry.body.translation();
      const field = fieldAt(at.x, at.y);
      if (!field) {
        if (this.fielded.delete(t.id)) entry.body.setGravityScale(1, true);
        continue;
      }
      if (!this.fielded.has(t.id)) {
        this.fielded.add(t.id);
        entry.body.setGravityScale(0, true);
      }
      if (field.x !== 0 || field.y !== 0) {
        const v = entry.body.linvel();
        entry.body.setLinvel({ x: v.x + field.x / 30, y: v.y + field.y / 30 }, true);
      }
    }
  }

  private prepareCreature(entry: CreatureEntry, creature: PhysicalCreature): void {
    const { body, collider } = entry;
    if (creature.hiddenAway !== entry.away) {
      entry.away = creature.hiddenAway;
      collider.setEnabled(!creature.hiddenAway);
      body.setEnabled(!creature.hiddenAway);
    }
    // floating and climbing mean no falling at all, and a zone means falling some other way
    const free = creature.floating || creature.climbing || creature.field !== null;
    if (free !== entry.free) {
      entry.free = free;
      body.setGravityScale(free ? 0 : 1, true);
    }
    if (creature.field && !creature.floating && !creature.climbing && !creature.dragged) {
      const v = body.linvel();
      body.setLinvel({ x: v.x + creature.field.x / 30, y: v.y + creature.field.y / 30 }, true);
    }
    if (creature.dragged !== entry.kinematic) {
      entry.kinematic = creature.dragged;
      body.setBodyType(creature.dragged ? RAPIER.RigidBodyType.KinematicPositionBased : RAPIER.RigidBodyType.Dynamic, true);
      if (!creature.dragged) body.setLinvel({ x: 0, y: 0 }, true);
    }
    if (creature.dragged) {
      const from = body.translation();
      const toY = creature.y - BODY.centreAboveFeet;
      if (Math.hypot(creature.x - from.x, toY - from.y) > TELEPORT_OVER) body.setTranslation({ x: creature.x, y: toY }, true);
      return;
    }
    // sliding on ice while walking stops it snagging on every edge. standing still it grips, so it doesn't slide down ramps
    const slippery = creature.wantVx !== null && creature.wantVx !== 0;
    if (slippery !== entry.slippery) {
      entry.slippery = slippery;
      collider.setFriction(slippery ? 0 : 1);
    }
    if (creature.hop) {
      const v = body.linvel();
      body.setLinvel({ x: v.x, y: -creature.hopSpeed }, true);
      creature.hop = false;
    }
  }

  private lost(x: number, y: number): boolean {
    const m = 60;
    return !Number.isFinite(x) || !Number.isFinite(y) || x < -m || x > this.room.width + m || y < -m || y > this.room.floor + m;
  }

  dispose(): void {
    this.world.free();
  }
}
