// Authored pixel sprites and arcade presentation for Level 6. Draw coordinates
// are independent of the original 256 × 240 renderer.
(() => {
  "use strict";
  const { WIDTH: W, HEIGHT: H, STAGE_WIDTH, WAVE_WIDTH, STAGES, CHARACTERS, ITEMS } = window.SatoshiBrawler;
  const city = new Image();
  city.src = "assets/brawler/city.png";
  const ink = "#141922";
  const cream = "#fff0c2";
  const gold = "#ffb34c";
  const mint = "#7af0be";

  function create(ctx) {
    const r = (x, y, w, h, color) => {
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    };
    function poly(points, color) {
      ctx.fillStyle = color;
      ctx.beginPath();
      points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
      ctx.closePath(); ctx.fill();
    }
    function label(value, x, y, size = 10, color = cream, align = "left") {
      ctx.font = `bold ${Math.max(11, size)}px Arial, sans-serif`;
      ctx.textAlign = align;
      if (color !== ink) {
        ctx.strokeStyle = ink;
        ctx.lineWidth = 2.5;
        ctx.lineJoin = "round";
        ctx.strokeText(value, Math.round(x), Math.round(y));
      }
      ctx.fillStyle = color;
      ctx.fillText(value, Math.round(x), Math.round(y));
      ctx.textAlign = "left";
    }
    function shadow(x, y, width = 22) {
      ctx.fillStyle = "#12192180";
      ctx.beginPath(); ctx.ellipse(Math.round(x), Math.round(y), width, 6, 0, 0, Math.PI * 2); ctx.fill();
    }

    // Characters are built on a two-pixel grid with ink silhouettes, shaded
    // clothing and separate moving limbs. x/y always describes their feet.
    function fighter(person, x, y, kind = "jack", time = 0) {
      const isJack = kind === "jack";
      const hero = Object.hasOwn(CHARACTERS, kind);
      const heavy = kind === "heavy";
      const dead = person.hp <= 0;
      const moving = person.moving && !dead;
      const walk = moving ? Math.sin(person.step) : 0;
      const attacking = person.attack > 0 || person.throwing > 0;
      const kick = hero && person.attack > 0 && (person.attackKind === 3 || (kind === "satoshi" && person.attackKind === 2));
      const wind = person.wind > 0 || person.throwWind > 0;
      const bob = moving ? Math.abs(walk) * 1.4 : Math.sin(time * 3) * 0.6;
      const coats = { jack: ["#292c36", "#464552", "#161e29"], suit: ["#445d7a", "#6883a0", "#293647"], pundit: ["#975554", "#c58065", "#542e41"], shill: ["#648c51", "#9abb64", "#315343"], heavy: ["#56546b", "#858397", "#333343"], fink: ["#546a81", "#7a8ca1", "#2d3c4a"], saylor: ["#665e81", "#91869c", "#3c3c55"], woo: ["#5e7c81", "#8aabab", "#304d5a"] };
      const heroCoats = { satoshi: ["#956b3d", "#c3a266", "#5c4634"], coder: ["#34596c", "#70a3b7", "#233d4f"], wizard: ["#567889", "#87b7b6", "#304d5b"] };
      const [coat, light, dark] = heroCoats[kind] || coats[kind] || coats.suit;
      shadow(x, y, heavy ? 27 : 21);
      if (hero && person.invincible > 0 && Math.floor(time * 12) % 2 === 0) ctx.globalAlpha = 0.65;
      ctx.save();
      ctx.translate(Math.round(x), Math.round(y - (person.z || 0)));
      ctx.scale(person.facing || 1, 1);
      if (dead) { ctx.rotate(-1.3); ctx.translate(20, 25); ctx.globalAlpha *= hero ? 1 : Math.min(1, person.dead * 2); }
      ctx.scale(heavy ? 2.3 : 2, 2);
      ctx.translate(0, -bob);
      const leg = Math.round(walk * 4);
      // Rear fist, sleeve and leg.
      r(-13, -27, 8, 17, ink); r(-12, -26, 6, 10, dark);
      r(-12, -16, 7, 5, "#ae7455"); r(-11, -16, 5, 3, "#dcaa7a");
      r(-9 - leg, -15, 8, 14, ink); r(-8 - leg, -14, 5, 11, dark);
      r(-11 - leg, -4, 11, 4, ink); r(-10 - leg, -3, 9, 2, isJack ? "#ce5b4c" : "#536074");
      r(-10 - leg, -1, 10, 1, "#d5c3a2");
      if (kick) {
        poly([[0, -17], [8, -19], [23, -14], [23, -7], [15, -8], [4, -9]], ink);
        poly([[3, -16], [8, -17], [19, -13], [19, -9], [15, -10], [4, -11]], light);
        r(20, -15, 9, 6, ink); r(21, -14, 7, 3, "#df7158"); r(21, -10, 9, 1, cream);
      } else {
        r(1 + leg, -15, 8, 14, ink); r(2 + leg, -14, 5, 12, coat); r(6 + leg, -11, 1, 7, light);
        r(1 + leg, -4, 12, 4, ink); r(2 + leg, -3, 9, 2, isJack ? "#e37858" : "#68748b");
        r(2 + leg, -1, 11, 1, "#eee0b8");
      }
      // Body, shoulders and hoodie / lapels.
      poly([[-8, -32], [7, -32], [12, -26], [9, -13], [-8, -13], [-11, -25]], ink);
      poly([[-7, -30], [6, -30], [9, -25], [7, -15], [-7, -15], [-9, -25]], coat);
      r(-7, -28, 3, 10, light); r(-7, -16, 14, 2, dark); r(-3, -18, 8, 1, light);
      if (hero) {
        poly([[-5, -31], [1, -26], [7, -31], [5, -33], [-4, -33]], dark);
        r(-3, -28, 1, 5, "#c8b798"); r(5, -28, 1, 5, "#c8b798");
        if (isJack) poly([[1, -26], [5, -26], [2, -22], [5, -22], [-1, -17], [0, -22], [-2, -22]], gold);
        else if (kind === "coder") { r(-3, -24, 2, 2, "#94ceff"); r(-5, -22, 2, 2, "#94ceff"); r(3, -24, 2, 2, "#94ceff"); r(5, -22, 2, 2, "#94ceff"); }
        else { r(0, -27, 2, 9, gold); r(-2, -25, 7, 2, gold); r(-2, -21, 7, 2, gold); }
      } else {
        poly([[-4, -30], [5, -30], [2, -19]], "#e6d7b8");
        poly([[0, -28], [2, -28], [3, -22], [1, -20], [-1, -23]], kind === "shill" ? gold : "#ce6b5d");
        r(-7, -23, 4, 1, "#a5a6ac");
      }
      // Neck, ear, face and hair.
      r(-3, -35, 8, 5, ink); r(-2, -35, 6, 4, "#c18a60");
      poly([[-7, -44], [5, -46], [10, -41], [11, -36], [8, -32], [-2, -32], [-7, -36]], ink);
      poly([[-5, -43], [5, -44], [8, -40], [8, -37], [11, -36], [8, -35], [6, -33], [-1, -34], [-5, -37]], "#dfab79");
      r(-3, -41, 8, 5, "#f4ca91"); r(-6, -39, 3, 4, "#c88b62");
      r(4, -40, 4, 1, ink); r(6, -39, 1, 2, ink); r(4, -35, 3, 1, "#713f37");
      if (isJack) {
        poly([[-8, -43], [-6, -47], [3, -49], [7, -46], [7, -42], [0, -43], [-3, -39], [-6, -37]], "#8b5635");
        r(-5, -46, 8, 2, "#d7a761"); r(-6, -43, 4, 2, "#b48245");
        r(0, -47, 4, 1, "#f1cb7c");
      } else if (kind === "satoshi") {
        poly([[-9, -36], [-10, -44], [-5, -50], [4, -50], [10, -44], [9, -40], [5, -44], [-3, -44], [-5, -37]], dark);
        r(-3, -42, 10, 3, ink); r(2, -40, 5, 2, "#a48355");
      } else if (kind === "wizard") {
        poly([[-14, -44], [-7, -48], [1, -65], [9, -48], [15, -44]], ink);
        poly([[-11, -45], [-5, -49], [1, -60], [7, -48], [12, -45]], light);
        r(-7, -48, 16, 2, gold);
        poly([[-4, -36], [3, -33], [9, -36], [5, -25], [-1, -28]], "#e7e9d5");
      } else if (kind === "fink") {
        r(-6, -44, 3, 6, "#c7bbae"); r(-3, -46, 7, 2, "#c7bbae");
      } else {
        poly([[-7, -43], [-4, -47], [5, -47], [9, -43], [5, -41], [-2, -43], [-4, -38], [-7, -38]], kind === "saylor" ? "#8f7262" : "#30313b");
        r(-3, -46, 7, 1, "#60636e");
        if (kind === "suit" || heavy || kind === "woo") { r(0, -40, 9, 3, ink); r(2, -40, 2, 1, "#87b4c3"); }
        if (kind === "saylor") poly([[-2, -36], [7, -35], [5, -31], [0, -32]], "#8f7262");
        if (kind === "coder") { r(-4, -45, 2, 11, "#94ceff"); r(-6, -39, 5, 7, ink); r(-5, -38, 3, 5, "#638f9e"); r(0, -40, 10, 3, ink); r(1, -40, 3, 1, "#94ceff"); }
      }
      // Front arm: the punch silhouette extends beyond the torso.
      if (isJack && person.attack > 0 && person.attackKind === 2) {
        r(7, -33, 8, 11, ink); r(8, -32, 6, 8, light);
        r(11, -43, 7, 13, ink); r(12, -42, 5, 11, coat);
        r(9, -49, 10, 10, ink); r(10, -48, 8, 7, "#f4ca91");
      } else if (attacking && !kick) {
        r(6, -29, 9, 8, ink); r(8, -28, 8, 5, light);
        r(15, -29, 12, 7, ink); r(15, -28, 12, 4, coat);
        r(24, -31, 9, 9, ink); r(25, -30, 7, 6, "#f4ca91");
        r(26, -24, 5, 1, "#b67d59"); r(29, -29, 1, 3, "#d59a6b");
      } else {
        const raise = wind ? -7 : 0;
        r(7, -29, 7, 11, ink); r(8, -28, 5, 8, light);
        r(9, -22 + raise, 10, 8, ink); r(10, -21 + raise, 8, 5, "#ddaa78");
        r(11, -21 + raise, 5, 2, "#f8ce94"); r(16, -20 + raise, 1, 3, "#b9805a");
      }
      if (person.hurt > 0) {
        r(-3, -42, 4, 2, "#fff4d1"); r(9, -28, 4, 3, "#fff4d1");
      }
      if (kind === "wizard") {
        const staffX = attacking ? 31 : 19;
        r(staffX, -39, 2, attacking ? 22 : 37, "#d5b275");
        poly([[staffX + 1, -47], [staffX + 5, -41], [staffX + 1, -36], [staffX - 3, -41]], mint);
      }
      if (kind === "coder" && person.attack > 0) {
        r(22, -28, 14, 6, ink); r(23, -27, 12, 4, "#8babb5");
        for (let i = 0; i < 4; i++) r(24 + i * 3, -26, 1, 1, ink);
      }
      ctx.restore(); ctx.globalAlpha = 1;
      if (wind) label(person.throwWind > 0 ? "THROW!" : "!", x, y - (heavy ? 121 : 107), person.throwWind > 0 ? 12 : 21, "#ffb59f", "center");
      if (!hero && person.hp > 0 && (person.hurt > 0 || wind)) {
        r(x - 22, y - 101, 44, 4, ink);
        r(x - 21, y - 100, 42 * person.hp / person.maxHp, 2, "#ef8a6b");
      }
    }

    function boss(enemy, x, y, time) {
      shadow(x, y, 51);
      ctx.save(); ctx.translate(Math.round(x), Math.round(y));
      if (enemy.hp <= 0) { ctx.globalAlpha = enemy.dead; ctx.rotate(Math.sin(time * 30) * 0.1); }
      const bob = Math.round(Math.sin(time * 6) * 2);
      ctx.translate(0, bob);
      r(-43, -19, 86, 19, ink); r(-39, -16, 78, 13, "#414957");
      for (let i = 0; i < 5; i++) { r(-35 + i * 16, -14, 11, 11, "#818b94"); r(-32 + i * 16, -11, 5, 5, "#252a38"); }
      poly([[-40, -92], [31, -92], [42, -77], [40, -18], [-39, -18], [-46, -72]], ink);
      r(-38, -87, 72, 65, "#5b6974"); r(-38, -87, 7, 62, "#94a1a0"); r(26, -83, 8, 58, "#303e4e");
      r(-30, -79, 56, 37, ink); r(-26, -75, 48, 28, enemy.wind > 0 ? "#a94e4b" : "#364f59");
      r(-19, -67, 12, 5, "#ffab67"); r(5, -67, 12, 5, "#ffab67");
      r(-15, -52, 30, 3, "#edac73");
      for (let i = 0; i < 4; i++) r(-13 + i * 8, -51, 4, 5, ink);
      r(-24, -38, 43, 11, ink); r(-22, -36, 39, 3, "#899793");
      const paper = (time * 35) % 15;
      r(-13, -33, 20, 10 + paper, "#c5d3a7"); r(-7, -29, 7, 3, "#788967");
      poly([[-49, -92], [-1, -117], [47, -92]], ink);
      poly([[-40, -94], [-1, -112], [39, -94]], "#8e9187");
      label("FIAT", -1, -96, 9, cream, "center");
      const reach = enemy.attack > 0 || enemy.throwing > 0 ? 32 : 0;
      r(-55 - reach, -69, 19, 13, ink); r(-53 - reach, -67, 17, 8, "#a2a8a0");
      r(34, -70, 24 + reach, 13, ink); r(37, -67, 19 + reach, 8, "#a2a8a0");
      r(-67 - reach, -68, 18, 24, ink); r(-65 - reach, -66, 14, 19, "#b88754");
      r(49 + reach, -71, 18, 24, ink); r(51 + reach, -69, 14, 19, "#d5a263");
      if (enemy.wind > 0 || enemy.throwWind > 0) label(enemy.throwWind > 0 ? "THROW!" : "!", 0, -124, 18, "#ffb59f", "center");
      ctx.restore();
    }

    function sign(x, y, w, headline, subline, color = gold) {
      r(x - 3, y - 3, w + 6, 42, ink); r(x, y, w, 35, color);
      label(headline, x + w / 2, y + 14, 13, ink, "center");
      label(subline, x + w / 2, y + 29, 11, ink, "center");
      r(x + 7, y + 39, 4, 12, ink); r(x + w - 11, y + 39, 4, 12, ink);
    }

    function wizard(x, y, time) {
      shadow(x, y, 22);
      const bob = Math.round(Math.sin(time * 3) * 3);
      ctx.save(); ctx.translate(x, y + bob);
      poly([[-23, -2], [-17, -43], [-6, -57], [10, -53], [20, -3]], ink);
      poly([[-18, -5], [-13, -43], [0, -52], [12, -46], [15, -5]], "#567889");
      poly([[-10, -5], [-5, -47], [2, -43], [-1, -5]], "#87b7b6");
      r(-9, -66, 20, 20, ink); r(-7, -64, 16, 15, "#ecc99c");
      poly([[-10, -54], [0, -47], [11, -55], [7, -36], [-4, -40]], "#dce5d4");
      poly([[-24, -65], [-11, -72], [2, -103], [16, -73], [25, -65]], ink);
      poly([[-19, -67], [-8, -72], [2, -96], [12, -73], [20, -67]], "#68989d");
      r(-11, -72, 24, 3, gold); r(-1, -62, 3, 2, ink); r(7, -62, 3, 2, ink);
      r(26, -63, 4, 63, ink); r(27, -62, 2, 61, "#d1a567");
      poly([[28, -81], [37, -70], [28, -58], [19, -70]], mint);
      label("B", 28, -66, 11, ink, "center");
      for (let i = 0; i < 3; i++) {
        const cy = -38 - ((time * 24 + i * 26) % 65);
        r(40 + i * 12, cy, 7, 9, gold); r(42 + i * 12, cy + 2, 2, 5, cream);
      }
      ctx.restore();
    }

    function scenery(state) {
      r(0, 0, W, H, "#ba7c72");
      const local = state.camera - state.stage * STAGE_WIDTH;
      if (city.complete && city.naturalWidth > 0) {
        // Use a different portion of the panorama in each district. Foreground
        // moves faster than this plate for a subtle arcade parallax effect.
        const imageW = H * city.naturalWidth / city.naturalHeight;
        const offset = Math.max(0, Math.min(imageW - W, STAGES[state.stage].scene / 3 * (imageW - W - 130) + local * 0.25));
        ctx.drawImage(city, Math.round(-offset), 0, imageW, H);
      } else {
        // The fight stays playable if the optional image cannot load.
        for (let i = 0; i < 11; i++) {
          const height = 90 + (i * 43 % 100);
          r(i * 67, 232 - height, 61, height, i % 2 ? "#544b62" : "#835e64");
          for (let row = 0; row < 5; row++) for (let col = 0; col < 3; col++) r(i * 67 + 9 + col * 17, 244 - height + row * 28, 8, 15, "#e8b570");
        }
        r(0, 235, W, 125, "#59606a");
      }
      // Moving steam, paper scraps and a helicopter live over the painted city.
      ctx.globalAlpha = 0.22;
      for (let i = 0; i < 5; i++) {
        const t = (state.time * 17 + i * 12) % 60;
        r(520 - local + Math.sin(t / 13) * 7, 268 - t, 9 + t / 7, 4, "#e0d6bb");
      }
      ctx.globalAlpha = 1;
      const hx = (state.time * 17 + 480) % 820 - 90;
      r(hx, 83, 25, 8, "#354052"); r(hx - 14, 82, 17, 3, "#354052"); r(hx - 18, 77, 4, 7, "#354052");
      r(hx + 10, 77, 2, 5, "#354052"); r(hx - 4, 76, 42, 1, "#354052"); r(hx + 19, 84, 6, 3, "#be9e82");
      for (let i = 0; i < 9; i++) {
        const px = ((i * 89 - local) % 700 + 700) % 700;
        r(px, 276 + (i * 17 % 45), 4 + i % 3, 2, "#baa893");
      }
      const start = state.stage * STAGE_WIDTH + state.wave * WAVE_WIDTH - state.camera;
      const scene = STAGES[state.stage].scene;
      if (scene === 0) {
        sign(start + 28, 101, 190, "THE PEOPLE'S ROUTE", "TWENTY ONE EXIT");
        sign(start + 330, 116, 205, "WORLD ON EDGE", "GOVERNMENTS AT WAR", "#e68e7c");
        r(start + 51, 216, 85, 17, ink); label("KEEP BUILDING", start + 93, 228, 9, cream, "center");
      } else if (scene === 1) {
        sign(start + 24, 89, 194, "CRYPTOWIZZARDD", "ALL TOKENS UP. ALL SECRETS.", mint);
        wizard(start + 126, 241, state.time);
        sign(start + 380, 106, 172, "WILLY WOO", "POSTING LESS. WATCHING.", "#b9cccb");
        fighter({ facing: -1, hp: 1, step: 0 }, start + 522, 236, "woo", state.time);
        r(start + 497, 194, 25, 16, ink); r(start + 499, 196, 21, 11, "#71a6a6");
      } else if (scene === 2) {
        sign(start + 18, 97, 190, "LARRY FINK", "BITCOIN MEETS THE MARKETS", "#b9cccb");
        fighter({ facing: 1, hp: 1, step: 0 }, start + 135, 235, "fink", state.time);
        sign(start + 358, 109, 193, "SAYLOR'S NEXT MOVE", "TAKING ANOTHER ROAD", "#c1acd2");
        fighter({ facing: 1, hp: 1, step: 0 }, start + 550, 235, "saylor", state.time);
      } else {
        sign(start + 22, 95, 213, "FOR THE PEOPLE", "BY THE PEOPLE. KEEP BUILDING.");
        sign(start + 350, 109, 200, "THE FINAL SPIN", "BREAK THE MACHINE", "#e68e7c");
      }
      const gateX = start + WAVE_WIDTH - 39;
      if (!state.waveClear) {
        for (let y = 237; y < 326; y += 16) { r(gateX, y, 6, 10, "#ffb34c"); r(gateX + 6, y + 5, 6, 10, ink); }
      }
    }

    function throwable(kind, x, y, token = "FOMO", rotation = 0) {
      ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.rotate(rotation);
      if (kind === "chair") {
        r(-15, -27, 6, 36, ink); r(9, -27, 6, 36, ink);
        r(-13, -25, 4, 32, "#c4986b"); r(9, -25, 4, 32, "#926744");
        r(-15, -27, 30, 12, ink); r(-12, -25, 24, 7, "#ad7f50");
        r(-18, -6, 36, 8, ink); r(-15, -5, 30, 4, "#d7ab75");
      } else if (kind === "bin") {
        r(-16, -23, 32, 31, ink); r(-13, -21, 26, 26, "#809498");
        for (let i = 0; i < 4; i++) r(-10 + i * 6, -19, 2, 23, "#bbc5bf");
        r(-19, -26, 38, 5, ink); r(-17, -25, 34, 2, "#c6cbc1");
      } else if (kind === "crate") {
        r(-16, -22, 32, 30, ink); r(-14, -20, 28, 26, "#b68956");
        for (let i = 0; i < 3; i++) r(-13, -17 + i * 8, 26, 2, "#725339");
        poly([[-13, -20], [-9, -20], [13, 3], [9, 5]], "#efc788");
      } else if (kind === "cone") {
        poly([[-15, 7], [-5, -23], [5, -23], [15, 7]], ink);
        poly([[-11, 4], [-3, -20], [3, -20], [11, 4]], "#f1995e");
        r(-8, -7, 16, 5, cream); r(-18, 5, 36, 4, ink);
      } else if (kind === "bottle") {
        r(-4, -25, 8, 12, ink); r(-7, -14, 14, 22, ink); r(-5, -12, 10, 18, "#6fb391");
        r(-2, -23, 4, 10, "#a2d6b5"); r(-4, -5, 8, 7, cream);
      } else if (kind === "keyboard") {
        r(-19, -9, 38, 17, ink); r(-17, -7, 34, 13, "#99b3bd");
        for (let row = 0; row < 2; row++) for (let col = 0; col < 7; col++) r(-14 + col * 4, -4 + row * 4, 2, 2, ink);
        r(-6, 4, 14, 1, ink);
      } else if (kind === "bolt") {
        poly([[1, -18], [13, -18], [3, -3], [12, -3], [-12, 18], [-4, 2], [-13, 2]], ink);
        poly([[2, -15], [9, -15], [-1, 0], [6, 0], [-7, 12], [0, -1], [-7, -1]], gold);
      } else if (kind === "paper") {
        r(-11, -14, 23, 25, ink); r(-9, -12, 19, 21, cream);
        r(-6, -8, 13, 3, "#b45b52"); for (let i = 0; i < 3; i++) r(-6, -2 + i * 3, 13, 1, "#826d60");
      } else {
        ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(0, 0, 19, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = ITEMS[kind].color; ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.fill();
        label(kind === "bitcoin" ? "B" : token.slice(0, 4), 0, 4, kind === "bitcoin" ? 15 : 8, ink, "center");
      }
      ctx.restore();
    }

    function prop(prop, x) {
      if (prop.hp <= 0) return;
      shadow(x, prop.y, 19);
      const y = prop.y;
      if (prop.kind === "newsbox") {
        r(x - 15, y - 40, 29, 39, ink); r(x - 12, y - 37, 23, 34, "#b75950");
        r(x - 10, y - 30, 19, 19, ink); r(x - 8, y - 28, 15, 15, "#e0cda6");
        label("FUD", x, y - 19, 7, ink, "center"); r(x - 7, y - 16, 12, 1, "#7a675d");
        r(x + 10, y - 36, 3, 32, "#7a4245"); r(x - 10, y - 35, 16, 2, "#ec9982");
      } else {
        r(x - 19, y - 29, 37, 28, ink); r(x - 17, y - 27, 33, 24, "#b28253");
        r(x - 15, y - 25, 29, 3, "#edbe7b"); r(x - 15, y - 18, 29, 2, "#624c40");
        poly([[x - 14, y - 25], [x - 10, y - 25], [x + 13, y - 5], [x + 8, y - 5]], "#edbe7b");
        label("SATS", x, y - 9, 7, ink, "center");
      }
    }

    function fightLabels(state) {
      if (state.combo > 1) {
        label(`${state.combo} HIT COMBO`, 20, 27, 17, gold);
      }
      if (state.waveClear) {
        label("GO!", 590, 202, 24, gold, "center");
        poly([[609, 179], [623, 192], [609, 204]], gold);
      }
      const bossEnemy = state.enemies.find((e) => e.kind === "boss" && e.hp > 0);
      if (bossEnemy) {
        label(bossEnemy.name, 320, 27, 15, "#ffb197", "center");
        r(220, 34, 200, 8, ink); r(222, 36, 196 * bossEnemy.hp / bossEnemy.maxHp, 4, "#ef816c");
      }
    }

    function draw(state) {
      ctx.save();
      ctx.setTransform(ctx.canvas.width / W, 0, 0, ctx.canvas.height / H, 0, 0);
      if (state.shake > 0 && !matchMedia("(prefers-reduced-motion: reduce)").matches) ctx.translate(Math.round(Math.sin(state.time * 95) * 3), 0);
      scenery(state);
      for (const drop of state.drops) {
        if (drop.taken) continue;
        const x = drop.x - state.camera;
        const y = drop.y - 5 + Math.sin(state.time * 5) * 2;
        shadow(x, drop.y, 11);
        if (drop.kind === "pizza") {
          poly([[x - 11, y - 10], [x + 11, y - 10], [x, y + 5]], ink);
          poly([[x - 9, y - 9], [x + 9, y - 9], [x, y + 2]], "#ffd580");
          r(x - 8, y - 10, 16, 3, "#b77d4e"); r(x - 3, y - 5, 3, 3, "#b65347"); r(x + 3, y - 7, 2, 2, "#b65347");
        } else {
          r(x - 8, y - 13, 16, 18, ink); r(x - 6, y - 11, 12, 14, mint); label("?", x, y, 12, ink, "center");
        }
      }
      for (const item of state.items) {
        if (item.taken) continue;
        shadow(item.x - state.camera, item.y, 17);
        throwable(item.kind, item.x - state.camera, item.y - 9, item.token);
      }
      const actors = [
        ...state.props.filter((p) => p.hp > 0).map((p) => ({ y: p.y, draw: () => prop(p, p.x - state.camera) })),
        ...state.enemies.filter((e) => e.hp > 0 || e.dead > 0).map((e) => ({ y: e.y, draw: () => e.kind === "boss" ? boss(e, e.x - state.camera, e.y, state.time) : fighter(e, e.x - state.camera, e.y, e.kind, state.time) })),
        { y: state.player.y, draw: () => fighter(state.player, state.player.x - state.camera, state.player.y, state.characterId, state.time) }
      ];
      actors.sort((a, b) => a.y - b.y).forEach((actor) => actor.draw());
      if (state.player.held) throwable(state.player.held.kind, state.player.x - state.camera,
        state.player.y - state.player.z - (state.characterId === "wizard" ? 151 : 117), state.player.held.token);
      for (const enemy of state.enemies) {
        if (enemy.hp > 0 && enemy.throwWind > 0) throwable(enemy.throwKind, enemy.x - state.camera, enemy.y - 117);
      }
      for (const shot of state.projectiles) {
        shadow(shot.x - state.camera, shot.y, 10);
        throwable(shot.kind, shot.x - state.camera, shot.y - shot.z, shot.token, shot.age * Math.sign(shot.vx) * 9);
      }
      if (state.specialTime > 0) {
        ctx.strokeStyle = mint; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.ellipse(state.player.x - state.camera, state.player.y - 30, (0.7 - state.specialTime) * 270, (0.7 - state.specialTime) * 110, 0, 0, Math.PI * 2); ctx.stroke();
      }
      for (const p of state.particles) r(p.x - state.camera, p.y, p.size, p.size, p.color);
      for (const entry of state.words) {
        ctx.globalAlpha = Math.min(1, entry.life * 3);
        label(entry.value, Math.max(72, Math.min(568, entry.x - state.camera)), entry.y, entry.value.length > 15 ? 11 : 18, entry.color, "center");
      }
      ctx.globalAlpha = 1;
      fightLabels(state);
      ctx.restore();
    }
    function portrait(characterId) {
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.save();
      ctx.translate(ctx.canvas.width / 2, ctx.canvas.height);
      ctx.scale(0.78, 0.78);
      fighter({ hp: 1, maxHp: 1, facing: 1, step: 0 }, 0, 2, characterId, 0);
      ctx.restore();
    }
    return { draw, portrait };
  }
  window.SatoshiBrawlerArt = { create };
})();
