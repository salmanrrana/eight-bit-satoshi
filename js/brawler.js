// Level 6 simulation. Rendering lives in brawler-art.js; callbacks connect the
// arcade fight to the existing timer, lives, checkpoints and local scoreboard.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.SatoshiBrawler = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const WIDTH = 640;
  const HEIGHT = 360;
  const STAGE_WIDTH = 1080;
  const WAVE_WIDTH = STAGE_WIDTH / 2;
  const LANE_TOP = 244;
  const LANE_BOTTOM = 321;
  const STAGES = [
    { name: "THE NOISE", scene: 0, line: "Jack leaves Twenty One. The people's route starts here.", waves: [["pundit", "suit", "pundit"], ["heavy", "suit", "pundit"]] },
    { name: "PRINTER ALLEY", scene: 0, line: "The printers work overtime. Send their junk straight back.", waves: [["heavy", "pundit", "suit"], ["pundit", "heavy", "pundit", "suit"]] },
    { name: "WIZARD SEASON", scene: 1, line: "CryptoWizzardd: Bullish. Tokens flying. I know all the secrets.", waves: [["shill", "shill", "suit"], ["heavy", "shill", "shill", "pundit"]] },
    { name: "THE TOKEN ARCADE", scene: 1, line: "Willy Woo: Posting less. Dodging more. Watch those flying tokens.", waves: [["shill", "pundit", "shill"], ["shill", "heavy", "shill", "suit"]] },
    { name: "THE BIG MONEY", scene: 2, line: "Larry Fink: Bitcoin meets the markets. The bouncers meet a chair.", waves: [["suit", "suit", "heavy"], ["heavy", "suit", "pundit", "suit"]] },
    { name: "SAYLOR'S FORK", scene: 2, line: "Saylor takes a different road. Your route runs through the gatekeepers.", waves: [["heavy", "suit", "shill"], ["suit", "heavy", "pundit", "shill"]] },
    { name: "THE PEOPLE'S MARCH", scene: 3, line: "The whole block is with you. One last push to the exchange.", waves: [["pundit", "heavy", "shill", "suit"], ["heavy", "suit", "shill", "pundit"]] },
    { name: "FOR THE PEOPLE", scene: 3, line: "For the people. By the people. Break the Bullshit Machine.", waves: [["heavy", "suit", "pundit"], ["boss", "suit", "shill"]] }
  ];
  const CHARACTERS = {
    jack: { name: "Jack Mallers", short: "Jack", hp: 120, speed: 146, damage: [18, 24, 38, 32], reach: 70, tempo: 1, projectile: "bolt", special: "People Power", color: "#ffb34c", move: "Heavy uppercut", description: "Heavy punches, lightning sats, and a crowd-clearing shockwave." },
    satoshi: { name: "Satoshi", short: "Satoshi", hp: 110, speed: 143, damage: [16, 21, 33, 30], reach: 74, tempo: 1, projectile: "bitcoin", special: "Genesis Spin", color: "#f1c66c", move: "Genesis sweep", description: "Sweeping combos, piercing Bitcoin discs, and a ring of coins." },
    wizard: { name: "CryptoWizzardd", short: "Wizard", hp: 95, speed: 138, damage: [14, 19, 30, 28], reach: 96, tempo: 1.08, projectile: "token", special: "Moonshot", color: "#7af0be", move: "Long-range staff", description: "Long staff strikes, exploding shitcoins, and a token storm." },
    coder: { name: "Random Coder", short: "Coder", hp: 100, speed: 172, damage: [12, 17, 27, 26], reach: 66, tempo: 0.76, projectile: "keyboard", special: "Hotfix", color: "#94ceff", move: "Rapid keyboard jab", description: "Fast combos, flying keyboards, and a healing stun pulse." }
  };
  const ITEMS = {
    chair: { name: "CHAIR", damage: 46, speed: 280, radius: 18, pierce: 2, splash: 0, color: "#bc865a" },
    bin: { name: "TRASH CAN", damage: 54, speed: 245, radius: 20, pierce: 2, splash: 0, color: "#9ba7aa" },
    crate: { name: "CRATE", damage: 40, speed: 300, radius: 18, pierce: 1, splash: 48, color: "#d3a36b" },
    cone: { name: "TRAFFIC CONE", damage: 28, speed: 340, radius: 12, pierce: 1, splash: 0, color: "#ef9257" },
    bottle: { name: "BOTTLE", damage: 25, speed: 390, radius: 9, pierce: 1, splash: 35, color: "#79c7ad" },
    token: { name: "SHITCOIN", damage: 24, speed: 335, radius: 11, pierce: 1, splash: 44, color: "#bda0ec" },
    bolt: { name: "LIGHTNING SAT", damage: 24, speed: 440, radius: 10, pierce: 1, splash: 0, color: "#ffca6b" },
    bitcoin: { name: "BITCOIN DISC", damage: 22, speed: 360, radius: 11, pierce: 3, splash: 0, color: "#f1c66c" },
    keyboard: { name: "KEYBOARD", damage: 20, speed: 400, radius: 13, pierce: 2, splash: 0, color: "#94ceff" },
    paper: { name: "FUD PAPER", damage: 10, speed: 220, radius: 10, pierce: 1, splash: 0, color: "#e7dac0" }
  };
  const TOKEN_NAMES = ["DOGE", "PEPE", "XRP", "SOL", "FOMO", "RUG"];
  const TYPES = {
    pundit: { name: "SPIN DOCTOR", hp: 46, speed: 44, damage: 9, reach: 42, windup: 0.62 },
    suit: { name: "GATEKEEPER", hp: 60, speed: 39, damage: 12, reach: 46, windup: 0.7 },
    shill: { name: "TOKEN SHILL", hp: 42, speed: 57, damage: 8, reach: 40, windup: 0.58 },
    heavy: { name: "FIAT ENFORCER", hp: 90, speed: 29, damage: 17, reach: 54, windup: 0.9 },
    boss: { name: "THE BULLSHIT MACHINE", hp: 480, speed: 24, damage: 22, reach: 88, windup: 1.1 }
  };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function create(hooks = {}, characterId = "jack") {
    const character = CHARACTERS[characterId] || CHARACTERS.jack;
    const player = { x: 95, y: 286, z: 0, vz: 0, facing: 1, hp: character.hp, maxHp: character.hp, invincible: 1.2, attack: 0, attackKind: 0, moving: false, step: 0, hurt: 0, held: null, throwing: 0, throwCooldown: 0 };
    const state = {
      player, characterId: CHARACTERS[characterId] ? characterId : "jack", stage: 0, wave: 0, waveClear: false, camera: 0, time: 0, intro: 5, stageClear: false,
      enemies: [], drops: [], props: [], items: [], projectiles: [], particles: [], words: [],
      combo: 0, comboTime: 0, bestCombo: 0, chain: 0, chainTime: 0,
      special: 60, specialTime: 0, hitstop: 0, shake: 0, kills: 0,
      deathTime: 0, finished: false, stopped: false, message: "",
      messageTime: 0, specialHeld: false, throwHeld: false, pendingThrow: false, pendingSpecial: false, pendingJump: false, stageKills: 0,
      throws: 0, enemyThrows: 0, pickups: 0, projectileHits: 0, nextId: 0
    };

    function message(value, duration = 3.5) {
      state.message = value;
      state.messageTime = duration;
    }

    function spawnWave(wave) {
      state.wave = wave;
      state.waveClear = false;
      const origin = state.stage * STAGE_WIDTH + wave * WAVE_WIDTH;
      state.enemies = STAGES[state.stage].waves[wave].map((kind, i) => {
        const type = TYPES[kind];
        return { id: state.nextId++, kind, ...type, maxHp: type.hp, x: origin + 300 + (i % 3) * 64,
          y: LANE_TOP + 12 + ((i * 29) % 66), facing: -1, step: 0, moving: false,
          hurt: 0, stun: 0, vx: 0, attack: 0, wind: 0, cooldown: 1.5 + i * 0.45,
          dead: 0, attackFacing: -1, throwing: 0, throwWind: 0, throwCooldown: 0.3 + i * 0.22,
          throwKind: "paper", throwTargetX: 0, throwTargetY: 0 };
      });
      state.props = [{ x: origin + 240, y: 312, hp: 28, kind: "newsbox" },
        { x: origin + 460, y: 249, hp: 28, kind: "crate" }];
      const kinds = ["chair", "token", "bin", "bottle", "cone", "crate"];
      state.items = [0, 1, 2].map((i) => ({ id: state.nextId++, x: origin + 150 + i * 100, y: 280 + (i % 2) * 31,
        kind: kinds[(state.stage + wave * 2 + i) % kinds.length], taken: false, token: TOKEN_NAMES[(state.stage + i) % TOKEN_NAMES.length] }));
      state.projectiles = [];
      state.drops = [];
    }

    function spawnStage(index) {
      state.stage = index;
      state.camera = index * STAGE_WIDTH;
      state.stageClear = false;
      state.stageKills = 0;
      state.intro = 4.5;
      spawnWave(0);
      message(STAGES[index].line, 6);
    }
    spawnStage(0);

    // Fixed patterns keep feedback lively without randomizing timed runs.
    function burst(x, y, color, count = 12) {
      for (let i = 0; i < count; i++) {
        const angle = i * Math.PI * 2 / count;
        state.particles.push({ x, y, vx: Math.cos(angle) * (50 + i * 5), vy: Math.sin(angle) * 80 - 30, life: 0.4 + (i % 3) * 0.1, maxLife: 0.6, color, size: 2 + i % 3 });
      }
    }

    function word(value, x, y, color = "#fff1c7") {
      state.words.push({ value, x, y, life: 0.8, color });
    }

    function hurtEnemy(enemy, damage, direction) {
      if (enemy.hp <= 0) return;
      enemy.hp = Math.max(0, enemy.hp - damage);
      enemy.hurt = 0.16;
      enemy.stun = enemy.kind === "boss" ? 0.12 : 0.42;
      enemy.vx = direction * (enemy.kind === "boss" ? 75 : 190);
      if (enemy.kind !== "boss") { enemy.wind = 0; enemy.throwWind = 0; }
      state.combo += 1;
      state.comboTime = 2.6;
      state.bestCombo = Math.max(state.bestCombo, state.combo);
      state.special = Math.min(100, state.special + 6);
      burst(enemy.x, enemy.y - 40, "#ffc568");
      state.hitstop = 0.045;
      state.shake = 0.15;
      hooks.sfx?.("blockhit");
      if (enemy.hp === 0) {
        enemy.dead = 0.7;
        state.kills += 1;
        state.stageKills += 1;
        hooks.reward?.(3, enemy.kind === "boss" ? 2500 : 250);
        word(enemy.kind === "boss" ? "BULLSHIT: BROKEN." : "BOUNCED!", enemy.x, enemy.y - 70, "#ffe396");
        burst(enemy.x, enemy.y - 30, "#64e1ab", 18);
        if (state.stageKills % 3 === 0) state.drops.push({ x: enemy.x, y: enemy.y, kind: "pizza", taken: false });
      }
    }

    function attack() {
      if (player.attack > 0 || player.hurt > 0 || state.deathTime > 0) return;
      state.chain = state.chainTime > 0 ? (state.chain + 1) % 3 : 0;
      state.chainTime = 0.9;
      player.attackKind = player.z > 8 ? 3 : state.chain;
      player.attack = player.attackKind === 2 ? 0.38 : 0.27;
      player.attack *= character.tempo;
      const reach = character.reach + (player.attackKind >= 2 ? 14 : 0);
      const damage = character.damage[player.attackKind];
      hooks.sfx?.("satshot");
      for (const enemy of state.enemies) {
        const dx = (enemy.x - player.x) * player.facing;
        if (enemy.hp > 0 && dx > -20 && dx < reach && Math.abs(enemy.y - player.y) < 27 && player.z < 78) {
          hurtEnemy(enemy, damage, player.facing);
          if (state.characterId === "wizard") burst(enemy.x, enemy.y - 45, character.color, 6);
          word(["POW!", "BAM!", "THWACK!", "KICK!"][player.attackKind], enemy.x, enemy.y - 78, "#fff1c7");
        }
      }
      for (const prop of state.props) {
        const dx = (prop.x - player.x) * player.facing;
        if (prop.hp > 0 && dx > -15 && dx < reach && Math.abs(prop.y - player.y) < 30) {
          prop.hp -= damage;
          burst(prop.x, prop.y - 20, "#ca9567");
          hooks.sfx?.("blockhit");
          if (prop.hp <= 0) {
            state.drops.push({ x: prop.x, y: prop.y, kind: prop.kind === "crate" ? "pizza" : "secret", taken: false });
            word("CRASH!", prop.x, prop.y - 42);
          }
        }
      }
    }

    function nearbyItem() {
      return state.items.filter((item) => !item.taken && Math.abs(item.x - player.x) < 42 && Math.abs(item.y - player.y) < 27)
        .sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y))[0] || null;
    }

    // Lane coordinates stay on the street; z gives thrown objects an arc. Each
    // projectile remembers its victims so piercing never hits one NPC twice.
    function launch(kind, x, y, dx, dy, owner, damage, token) {
      const item = ITEMS[kind];
      const length = Math.hypot(dx, dy) || 1;
      const heavy = ["chair", "bin", "crate", "cone", "bottle"].includes(kind);
      state.projectiles.push({ id: state.nextId++, kind, token: token || TOKEN_NAMES[state.nextId % TOKEN_NAMES.length],
        owner, x, y, z: 43, vx: dx / length * item.speed, vy: dy / length * item.speed,
        vz: heavy ? 90 : 25, gravity: heavy ? 220 : 70, age: 0, alive: true, hit: [],
        remaining: item.pierce, damage: damage ?? (owner === "enemy" ? Math.min(18, item.damage * 0.5) : item.damage) });
      if (owner === "player") state.throws += 1;
      else state.enemyThrows += 1;
      hooks.sfx?.("shitshot");
    }

    function throwObject() {
      if (player.throwCooldown > 0 || player.hurt > 0) return;
      const nearby = player.z === 0 ? nearbyItem() : null;
      if (!player.held && nearby) {
        nearby.taken = true;
        player.held = { kind: nearby.kind, token: nearby.token };
        player.throwCooldown = 0.18;
        state.pickups += 1;
        message(`${ITEMS[nearby.kind].name} in hand. Press E / THROW again to launch it.`, 3);
        hooks.sfx?.("coin");
        return;
      }
      const kind = player.held ? player.held.kind : character.projectile;
      launch(kind, player.x + player.facing * 25, player.y, player.facing, 0, "player", undefined, player.held?.token);
      player.held = null;
      player.throwing = 0.3;
      player.throwCooldown = state.characterId === "coder" ? 0.43 : 0.62;
    }

    function projectileImpact(projectile) {
      burst(projectile.x, projectile.y - projectile.z, ITEMS[projectile.kind].color, 10);
      projectile.alive = false;
    }

    function updateProjectiles(dt) {
      for (const shot of state.projectiles) {
        if (!shot.alive) continue;
        const previousX = shot.x;
        shot.age += dt;
        shot.x += shot.vx * dt;
        shot.y += shot.vy * dt;
        shot.z += shot.vz * dt;
        shot.vz -= shot.gravity * dt;
        const item = ITEMS[shot.kind];
        const crossed = (target) => target.x >= Math.min(previousX, shot.x) - item.radius - 14 &&
          target.x <= Math.max(previousX, shot.x) + item.radius + 14 && Math.abs(target.y - shot.y) < 23;
        if (shot.owner === "player") {
          for (const enemy of state.enemies) {
            if (enemy.hp <= 0 || shot.hit.includes(enemy.id) || !crossed(enemy) || shot.z < 8 || shot.z > 105) continue;
            shot.hit.push(enemy.id);
            hurtEnemy(enemy, shot.damage, Math.sign(shot.vx) || 1);
            state.projectileHits += 1;
            word("BONK!", enemy.x, enemy.y - 84, item.color);
            if (item.splash > 0) {
              for (const other of state.enemies) {
                if (other.hp > 0 && !shot.hit.includes(other.id) && Math.hypot(other.x - enemy.x, (other.y - enemy.y) * 2) < item.splash) {
                  shot.hit.push(other.id);
                  hurtEnemy(other, Math.round(shot.damage * 0.65), Math.sign(other.x - enemy.x) || 1);
                }
              }
            }
            shot.remaining -= 1;
            if (shot.remaining <= 0) { projectileImpact(shot); break; }
          }
        } else if (crossed(player) && shot.z >= player.z + 8 && shot.z < player.z + 82) {
          hurtPlayer({ damage: shot.damage, attackFacing: Math.sign(shot.vx) || 1 }, true);
          projectileImpact(shot);
        }
        if (shot.alive && (shot.z <= 0 || shot.age > 2.2)) {
          if (shot.owner === "enemy" && ["chair", "bin", "token", "bottle"].includes(shot.kind) &&
            shot.x > state.stage * STAGE_WIDTH + 24 && shot.x < (state.stage + 1) * STAGE_WIDTH - 24 &&
            shot.y >= LANE_TOP && shot.y <= LANE_BOTTOM && state.items.length < 20) {
            state.items.push({ id: state.nextId++, x: shot.x, y: shot.y, kind: shot.kind, token: shot.token, taken: false });
          }
          projectileImpact(shot);
        }
      }
      state.projectiles = state.projectiles.filter((shot) => shot.alive);
    }

    function special() {
      if (state.special < 100) {
        message(`Land hits to charge ${character.special}.`, 2);
        return;
      }
      state.special = 0;
      state.specialTime = 0.65;
      player.invincible = 0.9;
      player.attack = 0.5;
      player.attackKind = 2;
      if (state.characterId === "satoshi" || state.characterId === "wizard") {
        for (let i = 0; i < 8; i++) {
          const angle = i * Math.PI / 4;
          launch(character.projectile, player.x, player.y, Math.cos(angle), Math.sin(angle) * 0.55, "player", 38);
        }
      } else {
        for (const enemy of state.enemies) {
          if (enemy.hp > 0 && Math.abs(enemy.x - player.x) < (state.characterId === "coder" ? 230 : 180)) {
            hurtEnemy(enemy, state.characterId === "coder" ? 22 : 60, Math.sign(enemy.x - player.x) || 1);
            if (state.characterId === "coder") { enemy.stun = 3; enemy.wind = 0; enemy.throwWind = 0; }
          }
        }
      }
      if (state.characterId === "coder") player.hp = Math.min(player.maxHp, player.hp + 35);
      state.special = 0;
      burst(player.x, player.y - 35, "#65e1bd", 28);
      word(character.special.toUpperCase() + "!", player.x, player.y - 105, character.color);
      hooks.sfx?.("crowd");
    }

    function hurtPlayer(enemy, projectile = false) {
      if (player.invincible > 0 || (!projectile && player.z > 20) || state.deathTime > 0) return;
      player.hp = Math.max(0, player.hp - enemy.damage);
      player.hurt = 0.25;
      player.invincible = 1.05;
      player.x = clamp(player.x + enemy.attackFacing * 16, state.stage * STAGE_WIDTH + 24, (state.stage + 1) * STAGE_WIDTH - 24);
      state.combo = 0;
      state.shake = 0.2;
      burst(player.x, player.y - 38, "#e66e63", 9);
      hooks.sfx?.("hurt");
      if (player.hp === 0) { state.deathTime = 0.85; player.held = null; }
    }

    function update(dt, input) {
      if (state.finished || state.stopped) return;
      // Edge flags preserve quick keyboard/touch taps, including during hitstop.
      if (input.throwPressed || (input.throw && !state.throwHeld)) state.pendingThrow = true;
      if (input.specialPressed || (input.special && !state.specialHeld)) state.pendingSpecial = true;
      if (input.jumpPressed) state.pendingJump = true;
      state.throwHeld = !!input.throw;
      state.specialHeld = !!input.special;
      state.time += dt;
      state.messageTime = Math.max(0, state.messageTime - dt);
      state.intro = Math.max(0, state.intro - dt);
      state.shake = Math.max(0, state.shake - dt);
      state.specialTime = Math.max(0, state.specialTime - dt);
      for (const particle of state.particles) {
        particle.life -= dt;
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.vy += 300 * dt;
      }
      state.particles = state.particles.filter((p) => p.life > 0);
      for (const entry of state.words) { entry.life -= dt; entry.y -= dt * 25; }
      state.words = state.words.filter((entry) => entry.life > 0);
      if (state.hitstop > 0) { state.hitstop -= dt; return; }

      player.invincible = Math.max(0, player.invincible - dt);
      player.hurt = Math.max(0, player.hurt - dt);
      player.attack = Math.max(0, player.attack - dt);
      state.chainTime = Math.max(0, state.chainTime - dt);
      state.comboTime = Math.max(0, state.comboTime - dt);
      if (state.comboTime === 0) state.combo = 0;
      if (state.deathTime > 0) {
        state.deathTime -= dt;
        if (state.deathTime <= 0) {
          if (hooks.death?.() === false) { state.stopped = true; return; }
          player.hp = player.maxHp;
          player.invincible = 2.5;
          player.x = Math.max(state.stage * STAGE_WIDTH + 90, player.x - 60);
          player.z = 0;
          player.vz = 0;
          message(`${character.short}: Still standing. Still here for the people.`);
        }
        return;
      }

      const mx = Number(!!input.right) - Number(!!input.left);
      const my = Number(!!input.down) - Number(!!input.up);
      const length = Math.hypot(mx, my) || 1;
      player.moving = (mx !== 0 || my !== 0) && player.hurt === 0;
      if (player.moving) {
        const speed = player.attack > 0 ? character.speed * 0.62 : character.speed;
        player.x += mx / length * speed * dt;
        player.y += my / length * speed * 0.68 * dt;
        if (mx) player.facing = Math.sign(mx);
        player.step += dt * 11;
      }
      player.x = clamp(player.x, state.stage * STAGE_WIDTH + 24, state.stage * STAGE_WIDTH + (state.wave + 1) * WAVE_WIDTH - 28);
      player.y = clamp(player.y, LANE_TOP, LANE_BOTTOM);
      if (state.pendingJump && player.z === 0) { player.vz = 350; hooks.sfx?.("jump"); }
      state.pendingJump = false;
      if (player.z > 0 || player.vz > 0) {
        player.z = Math.max(0, player.z + player.vz * dt);
        player.vz -= 1000 * dt;
        if (player.z === 0) player.vz = 0;
      }
      if (input.fire) attack();
      player.throwing = Math.max(0, player.throwing - dt);
      player.throwCooldown = Math.max(0, player.throwCooldown - dt);
      if (state.pendingThrow && player.throwCooldown === 0 && player.hurt === 0) {
        throwObject();
        state.pendingThrow = false;
      }
      if (state.pendingSpecial) { special(); state.pendingSpecial = false; }

      state.enemies.forEach((enemy, i) => {
        enemy.hurt = Math.max(0, enemy.hurt - dt);
        enemy.attack = Math.max(0, enemy.attack - dt);
        enemy.throwing = Math.max(0, enemy.throwing - dt);
        if (enemy.hp <= 0) { enemy.dead = Math.max(0, enemy.dead - dt); return; }
        if (enemy.stun > 0) {
          enemy.stun -= dt;
          enemy.x += enemy.vx * dt;
          enemy.vx *= 0.86;
          enemy.x = clamp(enemy.x, state.stage * STAGE_WIDTH + 30, (state.stage + 1) * STAGE_WIDTH - 35);
          return;
        }
        enemy.cooldown = Math.max(0, enemy.cooldown - dt);
        const dx = player.x - enemy.x;
        const dy = player.y - enemy.y;
        enemy.moving = false;
        enemy.throwCooldown = Math.max(0, enemy.throwCooldown - dt);
        if (enemy.throwWind > 0) {
          enemy.throwWind -= dt;
          if (enemy.throwWind <= 0) {
            launch(enemy.throwKind, enemy.x + enemy.attackFacing * 22, enemy.y,
              enemy.throwTargetX - enemy.x, enemy.throwTargetY - enemy.y, "enemy");
            enemy.throwing = 0.35;
            enemy.throwCooldown = 3.4 + (i % 3) * 0.65;
          }
          return;
        }
        if (enemy.wind > 0) {
          enemy.wind -= dt;
          if (enemy.wind <= 0) {
            enemy.attack = 0.28;
            enemy.cooldown = enemy.kind === "boss" ? 1.4 : 1.2 + (i % 3) * 0.35;
            const forward = dx * enemy.attackFacing;
            if (forward > -18 && forward < enemy.reach + 10 && Math.abs(dy) < 26) hurtPlayer(enemy);
            if (enemy.kind === "boss") { burst(enemy.x + enemy.attackFacing * 65, enemy.y - 10, "#e87463", 15); state.shake = 0.2; }
          }
          return;
        }
        if (enemy.attack > 0) return;
        enemy.facing = dx >= 0 ? 1 : -1;
        if (enemy.throwCooldown === 0 && Math.abs(dx) > 115 && Math.abs(dx) < 410) {
          enemy.throwKind = { pundit: "paper", suit: "bottle", shill: "token", heavy: "chair", boss: "bin" }[enemy.kind];
          const nearby = state.items.find((item) => !item.taken && Math.hypot(item.x - enemy.x, item.y - enemy.y) < 65);
          if (nearby) { nearby.taken = true; enemy.throwKind = nearby.kind; }
          enemy.throwWind = enemy.kind === "boss" ? 1 : 0.75;
          enemy.throwTargetX = player.x;
          enemy.throwTargetY = player.y;
          enemy.attackFacing = enemy.facing;
        } else if (Math.abs(dx) < enemy.reach && Math.abs(dy) < 19 && enemy.cooldown === 0) {
          enemy.wind = enemy.windup;
          enemy.attackFacing = enemy.facing;
        } else if (Math.abs(dx) > enemy.reach - 5 || Math.abs(dy) > 10) {
          enemy.moving = true;
          const length = Math.hypot(dx, dy) || 1;
          if (Math.abs(dx) > enemy.reach - 5) enemy.x += dx / length * enemy.speed * dt;
          enemy.y += Math.sign(dy) * Math.min(Math.abs(dy), enemy.speed * 0.65 * dt);
          enemy.step += dt * 8;
        }
        // Spread the crowd enough to make silhouettes and attack tells readable.
        for (let j = 0; j < i; j++) {
          const other = state.enemies[j];
          if (other.hp > 0 && Math.abs(other.x - enemy.x) < 26 && Math.abs(other.y - enemy.y) < 15) {
            enemy.y = clamp(enemy.y + (i % 2 ? 1 : -1) * dt * 24, LANE_TOP, LANE_BOTTOM);
          }
        }
      });

      updateProjectiles(dt);
      // A lethal hit must spend its life before pickups or an exit can advance
      // the run, including a projectile knocking the player over a cleared gate.
      if (state.deathTime > 0) return;

      for (const drop of state.drops) {
        if (!drop.taken && Math.abs(drop.x - player.x) < 25 && Math.abs(drop.y - player.y) < 22) {
          drop.taken = true;
          if (drop.kind === "pizza") {
            player.hp = Math.min(player.maxHp, player.hp + 30);
            word("+30 HEALTH", player.x, player.y - 72, "#65e1bd");
          } else {
            state.special = Math.min(100, state.special + 35);
            hooks.reward?.(5, 500);
            word("SECRET: KEEP BUILDING", player.x, player.y - 80, "#65e1bd");
          }
          hooks.sfx?.("coin");
        }
      }
      if (!state.waveClear && state.enemies.every((enemy) => enemy.hp <= 0)) {
        state.waveClear = true;
        if (state.wave === STAGES[state.stage].waves.length - 1) {
          state.stageClear = true;
          hooks.checkpoint?.(state.stage, STAGES[state.stage].name);
        }
        message(state.stage === STAGES.length - 1 && state.stageClear ? "The machine is down. Walk right. Take the street back." : "Fight cleared. Move right — the street keeps going.", 5);
      }
      if (state.waveClear && player.x >= state.stage * STAGE_WIDTH + (state.wave + 1) * WAVE_WIDTH - 40) {
        if (!state.stageClear) {
          player.x += 48;
          player.hp = Math.min(player.maxHp, player.hp + 8);
          spawnWave(state.wave + 1);
          message("More incoming. Grab something heavy.", 3);
        } else if (state.stage === STAGES.length - 1) {
          state.finished = true;
          hooks.complete?.();
        } else {
          player.x = (state.stage + 1) * STAGE_WIDTH + 45;
          player.hp = Math.min(player.maxHp, player.hp + 25);
          player.invincible = 1.5;
          spawnStage(state.stage + 1);
        }
      }
      const cameraTarget = clamp(player.x - 235, state.stage * STAGE_WIDTH, (state.stage + 1) * STAGE_WIDTH - WIDTH);
      state.camera += (cameraTarget - state.camera) * Math.min(1, dt * 8);
    }

    // Serializable read-only snapshot for browser playtests and deterministic tests.
    function snapshot() {
      return JSON.parse(JSON.stringify({ ...state, particles: undefined, words: undefined, props: state.props }));
    }
    return { state, update, snapshot, nearbyItem };
  }
  return { create, WIDTH, HEIGHT, STAGE_WIDTH, WAVE_WIDTH, STAGES, TYPES, CHARACTERS, ITEMS };
});
