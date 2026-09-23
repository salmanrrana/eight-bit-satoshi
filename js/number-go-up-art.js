// Level 7 art: SMB3 / SMW style pixel sprites, tiles, live city backdrops
// (Washington D.C., New York, Dubai) and an in-canvas HUD. Everything is drawn
// at 384 × 216 logical pixels and scaled 3× onto the 1152 × 648 game canvas.
// Sprites are authored as character grids and get an automatic ink outline.
(() => {
  "use strict";
  const G = window.NumberGoUp;
  const {
    TILE,
    VIEW_W: W,
    VIEW_H: H,
    WORLD_H,
    SECTIONS,
    SECTION_COLS,
    GROUND,
    P_FULL,
  } = G;
  const SCALE = 3;
  const INK = "#1a1028";
  const SECTION_PX = SECTION_COLS * TILE;

  function makeCanvas(w, h) {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    return [canvas, ctx];
  }

  // Character-grid sprite → canvas with a 1px ink outline around opaque pixels.
  function sprite(rows, pal, outline = INK) {
    const h = rows.length;
    const w = Math.max(...rows.map((row) => row.length));
    const grid = rows.map((row) =>
      [...row.padEnd(w, ".")].map((ch) => (ch === "." ? null : pal[ch] || INK)),
    );
    return fromGrid(grid, w, h, outline);
  }

  // Procedural sprite: fn(x, y) returns a color or null.
  function shape(w, h, fn, outline = INK) {
    const grid = Array.from({ length: h }, (_, y) =>
      Array.from({ length: w }, (_, x) => fn(x, y)),
    );
    return fromGrid(grid, w, h, outline);
  }

  function fromGrid(grid, w, h, outline) {
    const [canvas, ctx] = makeCanvas(w + 2, h + 2);
    const at = (x, y) =>
      y >= 0 && y < h && x >= 0 && x < w ? grid[y][x] : null;
    for (let y = -1; y <= h; y++) {
      for (let x = -1; x <= w; x++) {
        const color = at(x, y);
        if (color) {
          ctx.fillStyle = color;
          ctx.fillRect(x + 1, y + 1, 1, 1);
        } else if (
          outline &&
          (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1))
        ) {
          ctx.fillStyle = outline;
          ctx.fillRect(x + 1, y + 1, 1, 1);
        }
      }
    }
    return canvas;
  }

  function tile(draw) {
    const [canvas, ctx] = makeCanvas(TILE, TILE);
    const r = (x, y, w, h, c) => {
      ctx.fillStyle = c;
      ctx.fillRect(x, y, w, h);
    };
    draw(r, ctx);
    return canvas;
  }

  // ---------------------------------------------------------------------------
  // Pixel font (5 × 7). "*" is ×, ">" is the P-meter arrow, "^" is ▲, "@" is ₿.
  const FONT = {
    A: ".###.#...##...#######...##...##...#",
    B: "####.#...##...#####.#...##...#####.",
    C: ".###.#...##....#....#....#...#.###.",
    D: "####.#...##...##...##...##...#####.",
    E: "######....#....####.#....#....#####",
    F: "######....#....####.#....#....#....",
    G: ".###.#...##....#.####...##...#.####",
    H: "#...##...##...#######...##...##...#",
    I: ".###...#....#....#....#....#...###.",
    J: "..###...#....#....#....#.#..#..##..",
    K: "#...##..#.#.#..##...#.#..#..#.#...#",
    L: "#....#....#....#....#....#....#####",
    M: "#...###.###.#.##.#.##...##...##...#",
    N: "#...##...###..##.#.##..###...##...#",
    O: ".###.#...##...##...##...##...#.###.",
    P: "####.#...##...#####.#....#....#....",
    Q: ".###.#...##...##...##.#.##..#..##.#",
    R: "####.#...##...#####.#.#..#..#.#...#",
    S: ".#####....#.....###.....#....#####.",
    T: "#####..#....#....#....#....#....#..",
    U: "#...##...##...##...##...##...#.###.",
    V: "#...##...##...##...##...#.#.#...#..",
    W: "#...##...##...##.#.##.#.##.#.#.#.#.",
    X: "#...##...#.#.#...#...#.#.#...##...#",
    Y: "#...##...#.#.#...#....#....#....#..",
    Z: "#####....#...#...#...#...#....#####",
    0: ".###.#...##..###.#.###..##...#.###.",
    1: "..#...##....#....#....#....#...###.",
    2: ".###.#...#....#...#...#...#...#####",
    3: "#####...#...#.....#.....##...#.###.",
    4: "...#...##..#.#.#..#.#####...#....#.",
    5: "######....####.....#....##...#.###.",
    6: "..##..#...#....####.#...##...#.###.",
    7: "#####....#...#...#...#....#....#...",
    8: ".###.#...##...#.###.#...##...#.###.",
    9: ".###.#...##...#.####....#...#..##..",
    ".": "..........................##...##..",
    ",": ".....................##....#...#...",
    "!": "..#....#....#....#....#.........#..",
    "?": ".###.#...#....#...#...#.........#..",
    ":": ".....##...##.........##...##.......",
    "-": "...............#####...............",
    "+": ".......#....#..#####..#....#.......",
    $: "..#...#####.#...###...#.#####...#..",
    "/": "....#....#...#...#...#...#....#....",
    "'": "..#....#...#.......................",
    "*": ".....#...#.#.#...#...#.#.#...#.....",
    ">": "#....##...###..####.###..##...#....",
    "^": ".......#...###.#####...............",
    "@": ".#.#.####.#...#####.#...#####..#.#.",
    "(": "...#...#...#....#....#.....#.....#.",
    ")": ".#.....#.....#....#....#...#...#...",
    "%": "##...##..#...#...#...#...#..##...##",
    "·": ".................#.................",
    " ": "...................................",
  };
  const glyphCache = new Map();
  function glyph(ch, color, outline) {
    const key = `${ch}|${color}|${outline}`;
    let canvas = glyphCache.get(key);
    if (!canvas) {
      const bits = (FONT[ch] || FONT["?"]).padEnd(35, ".");
      const grid = Array.from({ length: 7 }, (_, y) =>
        Array.from({ length: 5 }, (_, x) =>
          bits[y * 5 + x] === "#" ? color : null,
        ),
      );
      canvas = fromGrid(grid, 5, 7, outline);
      glyphCache.set(key, canvas);
    }
    return canvas;
  }
  function textWidth(str, scale = 1) {
    return str.length * 6 * scale - scale;
  }

  // ---------------------------------------------------------------------------
  // Hero: Satoshi's dark hood, and the orange NO-BS hoodie power suit.
  const HEAD = [
    ".....HHHHH....",
    "...HHhhhhhH...",
    "..Hhhhhhhhhh..",
    ".Hhhhhhhhhhhh.",
    ".hhhhhhddddhh.",
    ".hhhhhdffffdh.",
    ".hhhhdffefefd.",
    ".dhhhdffffffd.",
    "..dhhhdffffd..",
    "..dhhhhddddh..",
  ];
  const SMALL = {
    stand: [
      ".....HHHHH....",
      "...HHhhhhhH...",
      "..Hhhhhhhhhh..",
      "..hhhhhhddddh.",
      ".hhhhhhdffffd.",
      ".hhhhhdffefefd",
      ".dhhhhdffffffd",
      "..dhhhhddddhd.",
      "..HhhhhhhhhH..",
      ".shhhhhoowhhs.",
      ".sdhhhoowohds.",
      "..dhhhhoohhd..",
      "..ddhhhhhhdd..",
      "...bbb..bbb...",
      "..bbbb..bbbb..",
    ],
    walk: [
      ".....HHHHH....",
      "...HHhhhhhH...",
      "..Hhhhhhhhhh..",
      "..hhhhhhddddh.",
      ".hhhhhhdffffd.",
      ".hhhhhdffefefd",
      ".dhhhhdffffffd",
      "..dhhhhddddhd.",
      "..HhhhhhhhhHs.",
      ".hhhhhhoowhhs.",
      "sdhhhhoowohd..",
      "s.dhhhhoohhd..",
      "..ddhhhhhhdd..",
      "..bbb....bbb..",
      ".bbbb.....bbb.",
    ],
    jump: [
      ".....HHHHH..s.",
      "...HHhhhhhH.s.",
      "..Hhhhhhhhhhs.",
      "..hhhhhhddddh.",
      ".hhhhhhdffffd.",
      ".hhhhhdffefefd",
      ".dhhhhdffffffd",
      "..dhhhhddddhd.",
      "..HhhhhhhhhH..",
      ".hhhhhhoowhh..",
      "sdhhhhoowohd..",
      "s.dhhhhoohhdbb",
      "..ddhhhhhhddbb",
      "..bbb.........",
      ".bbbb.........",
    ],
    dead: [
      "s....HHHH....s",
      "s..HHhhhhHH..s",
      "sHhhhhhhhhhhHs",
      ".hhhhddddddhh.",
      ".hhhdffffffdh.",
      ".hhhdfeffefdh.",
      ".dhhdffffffdd.",
      "..dhhddddddh..",
      "..HhhhhhhhhH..",
      "..hhhhoowhhh..",
      "..dhhhoowohd..",
      "..dhhhhoohhd..",
      "..ddhhhhhhdd..",
      "...bbb..bbb...",
      "..bbbb..bbbb..",
    ],
  };
  const BODY = [
    "..HhhhhhhhhH..",
    ".HhhhhhhhhhhH.",
    ".hhhhhoooohhh.",
    "hhdhhoowoohdhh",
    "hhdhhowwwohdhh",
    "shdhhoowoohdhs",
    "ssdhhowwwohdss",
    "s.dhhoowoohd.s",
    "..dhhhoooohhd.",
    "..ddhhhhhhhdd.",
  ];
  const BIG = {
    stand: [
      ...HEAD,
      ...BODY,
      "..dddd..dddd..",
      "..dddd..dddd..",
      "..bbb....bbb..",
      ".bbbb....bbbb.",
      ".bbbb....bbbb.",
    ],
    walk: [
      ...HEAD,
      ...BODY.slice(0, 5),
      "hhdhhoowoohdhs",
      "shdhhowwwohdss",
      "ssdhhoowoohd.s",
      "s.dhhhoooohhd.",
      "..ddhhhhhhhdd.",
      "..ddd....ddd..",
      ".ddd......ddd.",
      ".bbb......bbb.",
      "bbbb.......bbb",
      "bbb........bbb",
    ],
    jump: [
      ...HEAD.slice(0, 9),
      "..dhhhhddddhs.",
      "..HhhhhhhhhHs.",
      ".HhhhhhhhhhhH.",
      ".hhhhhoooohhh.",
      "shdhhoowoohdh.",
      "ssdhhowwwohdh.",
      "s.dhhoowoohd..",
      "..dhhowwwohd..",
      "..dhhoowoohdd.",
      "..dhhhoooohhdd",
      "..ddhhhhhhhddd",
      "..dddd...dddbb",
      "..dddd.....bbb",
      "..bbb......bb.",
      ".bbbb.........",
      ".bbb..........",
    ],
  };
  // Hood flaps streaming behind the hoodie while flying.
  const FLAP = [
    ["hh......", "Hhhh....", ".Hhhhh..", "..dhhhh.", "...ddhh."],
    ["........", "hhhh....", "HhhhhH..", ".Hhhhhh.", "..dddhh."],
  ];
  const HERO_PAL = {
    normal: {
      h: "#3a3f5c",
      H: "#5a6288",
      d: "#252840",
      f: "#0e0f1a",
      e: "#ffb347",
      s: "#f4cba5",
      b: "#7b4a26",
      o: "#f7931a",
      w: "#fff1c9",
    },
    hoodie: {
      h: "#f7931a",
      H: "#ffc466",
      d: "#c2620a",
      f: "#1c1426",
      e: "#fff6d6",
      s: "#f4cba5",
      b: "#3a2a1e",
      o: "#1c1426",
      w: "#fff6d6",
    },
  };
  const STAR_HUES = ["#ff5a5a", "#ffd23c", "#4cff8a", "#4cc8ff"];

  // The four Level 6 heroes as runners. Satoshi keeps the hood; the others
  // lay their own 8-row head over the shared body frames and recolour the
  // outfit. Everyone's NO-BS hoodie is the same orange.
  const RUNNER_HEADS = {
    jack: [
      "....yyyyyy....",
      "...yyyyyyyyy..",
      "..yyyyyyyyyyy.",
      "..yYssssssss..",
      "..Ysssssksks..",
      "..ssssssssss..",
      "...sssssskkk..",
      "....ssssss....",
    ],
    wizard: [
      "......tt......",
      ".....tttt.....",
      "....ttyttt....",
      "..tttttttttttt",
      "...ssssssss...",
      "...sssskssks..",
      "..WWWWWWWWWW..",
      "...WWWWWWWW...",
    ],
    coder: [
      "..............",
      "....cccccc....",
      "...cccccccc...",
      "..ccccccccCCC.",
      "..ssssssssss..",
      "..ssgnngsgnng.",
      "..ssssssssss..",
      "...sssssksss..",
    ],
  };
  const RUNNERS = {
    satoshi: { name: "SATOSHI", color: "#ff9a2a", pal: HERO_PAL.normal },
    jack: {
      name: "JACK",
      color: "#ffd24c",
      pal: {
        ...HERO_PAL.normal,
        h: "#26262e",
        H: "#484856",
        d: "#141418",
        o: "#f0f0f0",
        w: "#f7931a",
        b: "#1a1a1a",
        y: "#e8c060",
        Y: "#b08830",
        k: INK,
      },
    },
    wizard: {
      name: "WIZARD",
      color: "#7af0be",
      pal: {
        ...HERO_PAL.normal,
        h: "#3a5ab8",
        H: "#6a8ae0",
        d: "#22357a",
        o: "#ffd24c",
        w: "#ffffff",
        t: "#5a3ab0",
        y: "#ffd24c",
        W: "#f4f4f4",
        k: INK,
        b: "#5a3a20",
      },
    },
    coder: {
      name: "CODER",
      color: "#94ceff",
      pal: {
        ...HERO_PAL.normal,
        h: "#3c6c8c",
        H: "#6aa0c0",
        d: "#24445c",
        o: "#1a1a2a",
        w: "#7af0be",
        c: "#e03a3a",
        C: "#a82020",
        g: INK,
        n: "#9ce0ff",
        k: INK,
        b: "#2a2a3a",
      },
    },
  };
  function runnerPalette(id, paletteKey) {
    const base = (RUNNERS[id] || RUNNERS.satoshi).pal;
    if (paletteKey !== "hoodie") return base;
    return id === "satoshi"
      ? HERO_PAL.hoodie
      : {
          ...base,
          h: "#f7931a",
          H: "#ffc466",
          d: "#c2620a",
          o: "#1c1426",
          w: "#fff6d6",
        };
  }
  // Swap a frame's head rows for a runner's head, keeping raised hands ("s").
  function withHead(rows, head) {
    return rows.map((row, i) => {
      if (i >= head.length) return row;
      return [...head[i]]
        .map((ch, x) => (ch !== "." ? ch : row[x] === "s" ? "s" : "."))
        .join("");
    });
  }

  // Politicians (the goombas of this world) and bankers (the koopas).
  const POLITICIAN = [
    "....gggggg....",
    "...ggggggggg..",
    "..gsssssssssg.",
    "..skkssssskks.",
    "..swksssswkss.",
    "..sssssssssss.",
    "..sskwwwwwkss.",
    "...ssskkksss..",
    "..nnnwwrwwnnn.",
    ".nnnnnwrwnnnnn",
    "pnnnnnnrnnnnnp",
    "p.nnnnnrnnnn.p",
    "..nnnnnnnnnn..",
    "..kkk....kkk..",
    ".kkkk....kkkk.",
  ];
  const POLITICIAN_2 = [
    ...POLITICIAN.slice(0, 12),
    "..nnnnnnnnnn..",
    "...kkk..kkk...",
    "...kkkk.kkkk..",
  ];
  const POLITICIAN_FLAT = [
    "...gggggggg...",
    ".gsskwssskwsg.",
    "sssskwwwkssss.",
    "nnnnnwrwnnnnnn",
    "kkkk.....kkkkk",
  ];
  const POL_PAL = {
    g: "#c8c8d0",
    s: "#f2c29a",
    k: INK,
    w: "#ffffff",
    n: "#27336b",
    r: "#e03a3a",
    p: "#fffbe8",
  };
  const BANKER = [
    "....kkkkkk....",
    "....kkkkkk....",
    "....kkkkkk....",
    "....rrrrrr....",
    "..kkkkkkkkkk..",
    "...ssssssss...",
    "..sswkssswks..",
    "..sswkssywky..",
    "..ssssssssss..",
    "..smmmmmmmms..",
    "...ssmkkmss...",
    "....ssssss....",
    "..ggwwrrwwgg..",
    ".gggwwrrwwggg.",
    "ggGgggrrgggGg.",
    "sgGgggrrgggGgs",
    "s.GgggrrgggG.s",
    "..gGggggggGg..",
    "..gGggggggGg..",
    "..ggg....ggg..",
    "..ggg....ggg..",
    "..kkk....kkk..",
    ".kkkk....kkkk.",
  ];
  const BANKER_2 = [
    ...BANKER.slice(0, 19),
    "..ggg...ggg...",
    "...ggg..ggg...",
    "...kkk..kkkk..",
    "..kkkk...kkkk.",
  ];
  const BANK_PAL = {
    k: INK,
    r: "#d83a3a",
    s: "#f2c29a",
    w: "#ffffff",
    y: "#ffd24c",
    m: "#6b4424",
    g: "#6f7382",
    G: "#9aa0b2",
  };
  const BRIEFCASE = [
    ".....kkkk.....",
    ".....k..k.....",
    ".bbbbbbbbbbbb.",
    "bBBBBBBBBBBBBb",
    "bBbbbbbbbbbbBb",
    "bbbbbyyyybbbbb",
    "bbbbbykkybbbbb",
    "bbbbbyyyybbbbb",
    "bbbwkbbbbwkbbb",
    "bbbbbbbbbbbbbb",
    ".dddddddddddd.",
  ];
  const BRIEFCASE_2 = [
    ".....kkkk.....",
    ".....k..k.....",
    ".bbbbbbbbbbbb.",
    "bBBBBBBBBBBBBb",
    "bBbbbbbbbbbbBb",
    "bbbbbyyyybbbbb",
    "bbbbbykkybbbbb",
    "bbbbbyyyybbbbb",
    "bbbbbbbbbbbbbb",
    "bbbbbbbbbbbbbb",
    ".dddddddddddd.",
  ];
  const CASE_PAL = {
    k: INK,
    b: "#8a4b22",
    B: "#b86a34",
    d: "#5c2f14",
    y: "#ffd24c",
    w: "#ffffff",
  };
  const WINGS = [
    ["...ww.", ".wwwww", "wwwww.", "wwww..", ".ww..."],
    [".......", "wwwwww.", ".wwwww.", "..www..", "......."],
  ];
  const PLANT_HEAD = (open) => [
    "..rrrrrrrrrr..",
    ".rrwrrrrrrwrr.",
    "rrwwrrrrrrwwrr",
    "rrrrrrwrrrrrrr",
    "rrrrrwwwrrrrrr",
    ...(open
      ? [
          "wwwwwwwwwwwwww",
          "w.k.k.k.k.k.kw",
          "wkkkkkkkkkkkkw",
          "wk.k.k.k.k.k.w",
          "wwwwwwwwwwwwww",
        ]
      : [
          "rrrrrrrrrrrrrr",
          "wwwwwwwwwwwwww",
          "wk.k.k.k.k.k.w",
          "wwwwwwwwwwwwww",
          "rrrrrrrrrrrrrr",
        ]),
    ".rrrrrrrrrrrr.",
    "...rrrrrrrr...",
    "......tt......",
    "......TT......",
    "..ll..tt..ll..",
    ".llll.TT.llll.",
    "lllll.tt.lllll",
    ".llll.TT.llll.",
    "..ll..tt..ll..",
    "......TT......",
    "......tt......",
    "......TT......",
  ];
  const PLANT_PAL = {
    r: "#e8383a",
    w: "#ffffff",
    k: "#5c0f16",
    t: "#d02828",
    T: "#ffe4e4",
    l: "#3cc05a",
  };
  const SHITCOIN = [
    "....pppp....",
    "..pPPPPppp..",
    ".pPppppppppp.",
    ".pwwppwwwpp.",
    ".pwpwpwpppp.",
    ".pwwppwwwpp.",
    ".pwpwpppwpp.",
    ".pwwppwwwpp.",
    ".pppppppppp.",
    "..pppppppp..",
    "....pppp....",
  ];
  const SHITCOIN_EDGE = [
    "....pp....",
    "...pPp....",
    "...pPp....",
    "...pPp....",
    "...ppp....",
    "...ppp....",
    "...ppp....",
    "...ppp....",
    "...ppp....",
    "...pp.....",
    "....p.....",
  ];
  const SHIT_PAL = { p: "#8a4cd8", P: "#c69cff", w: "#ffe1ff" };
  const COIN = [
    "...oooo...",
    "..oyyyyo..",
    ".oywyyyyo.",
    ".oyydydyo.",
    ".oydddyyo.",
    ".oydyydyo.",
    ".oydddyyo.",
    ".oydyydyo.",
    ".oydddyyo.",
    ".oyydydyo.",
    ".oyyyyyyo.",
    "..oyyyyo..",
    "...oooo...",
  ];
  const COIN_HALF = [
    "..oo..",
    ".oyyo.",
    ".oywo.",
    ".oydo.",
    ".oydo.",
    ".oydo.",
    ".oydo.",
    ".oydo.",
    ".oydo.",
    ".oydo.",
    ".oyyo.",
    ".oyyo.",
    "..oo..",
  ];
  const COIN_EDGE = [
    "oo",
    "oo",
    "oo",
    "oo",
    "oo",
    "oo",
    "oo",
    "oo",
    "oo",
    "oo",
    "oo",
    "oo",
    "oo",
  ];
  const COIN_PAL = { o: "#d9700a", y: "#ffc93c", w: "#fff6c8", d: "#a04c00" };
  const PILL = [
    "..ooooowwwww..",
    ".oOOooowwwwWw.",
    "oOOoooowwwwwWw",
    "oOooookowkwwww",
    "ooooookowkwwww",
    "ooooooowwwwwww",
    ".oooooowwwwww.",
    "..ooooowwwww..",
  ];
  const PILL_PAL = {
    o: "#f7931a",
    O: "#ffd08a",
    w: "#fff8ee",
    W: "#ffffff",
    k: INK,
  };
  const HOODIE = [
    "....HHHHHH....",
    "...HhhffhhH...",
    "..Hhhffffhhh..",
    ".hhhhffffhhhh.",
    "hhhhhhffhhhhhh",
    "hhhhhhhhhhhhhh",
    "hhhhhkkkkhhhhh",
    "hhh.hkwwkh.hhh",
    "hhh.hkkkkh.hhh",
    "hhh.hhhhhh.hhh",
    "ddd.hhhhhh.ddd",
    "....dddddd....",
  ];
  const HOODIE_PAL = {
    h: "#f7931a",
    H: "#ffc466",
    d: "#c2620a",
    f: "#3a1e10",
    k: INK,
    w: "#ffd24c",
  };
  const STAR = [
    "......yy......",
    ".....yyyy.....",
    ".....yyyy.....",
    "....yyyyyy....",
    "yyyyyyyyyyyyyy",
    ".yyyyyyyyyyyy.",
    "..yyykyykyyy..",
    "...yykyykyy...",
    "...yyyyyyyy...",
    "..yyyyyyyyyy..",
    "..yyyyy.yyyyy.",
    ".yyyy....yyyy.",
    ".yyy......yyy.",
    "yy..........yy",
  ];

  // Builds every sprite once, including palette variants.
  const S = {
    hero: {},
    flaps: {},
    politician: [sprite(POLITICIAN, POL_PAL), sprite(POLITICIAN_2, POL_PAL)],
    politicianFlat: sprite(POLITICIAN_FLAT, POL_PAL),
    banker: [sprite(BANKER, BANK_PAL), sprite(BANKER_2, BANK_PAL)],
    briefcase: [sprite(BRIEFCASE, CASE_PAL), sprite(BRIEFCASE_2, CASE_PAL)],
    wings: WINGS.map((w) => sprite(w, { w: "#ffffff" })),
    plant: [
      sprite(PLANT_HEAD(true), PLANT_PAL),
      sprite(PLANT_HEAD(false), PLANT_PAL),
    ],
    shitcoin: [sprite(SHITCOIN, SHIT_PAL), sprite(SHITCOIN_EDGE, SHIT_PAL)],
    coin: [
      sprite(COIN, COIN_PAL),
      sprite(COIN_HALF, COIN_PAL),
      sprite(COIN_EDGE, COIN_PAL),
      sprite(COIN_HALF, COIN_PAL),
    ],
    pill: sprite(PILL, PILL_PAL),
    hoodie: sprite(HOODIE, HOODIE_PAL),
    star: [
      sprite(STAR, { y: "#ffd23c", k: INK }),
      sprite(STAR, { y: "#ff9a1a", k: INK }),
    ],
  };
  function heroSprite(runner, form, frame, paletteKey, hue) {
    const key = `${runner}|${form}|${frame}|${paletteKey}|${hue || ""}`;
    if (!S.hero[key]) {
      const pal = { ...runnerPalette(runner, paletteKey) };
      if (hue) {
        pal.h = hue;
        pal.H = "#ffffff";
      }
      let rows = (form === "small" ? SMALL : BIG)[frame];
      const head = RUNNER_HEADS[runner];
      if (head)
        rows = withHead(
          rows,
          form === "small"
            ? head
            : [...head, "....ssssss....", "...HhhhhhhH..."],
        );
      S.hero[key] = sprite(rows, pal);
    }
    return S.hero[key];
  }
  function flapSprite(frame) {
    if (!S.flaps[frame]) S.flaps[frame] = sprite(FLAP[frame], HERO_PAL.hoodie);
    return S.flaps[frame];
  }

  // ---------------------------------------------------------------------------
  // Tiles
  const QUESTION = [0, 1, 2, 1].map((f) =>
    tile((r) => {
      r(0, 0, 16, 16, INK);
      r(1, 1, 14, 14, "#f8a800");
      r(1, 1, 14, 1, "#ffe08a");
      r(1, 1, 1, 14, "#ffe08a");
      r(1, 14, 14, 1, "#b85c00");
      r(14, 1, 1, 14, "#b85c00");
      for (const [x, y] of [
        [2, 2],
        [12, 2],
        [2, 12],
        [12, 12],
      ]) {
        r(x, y, 2, 2, "#b85c00");
        r(x, y, 1, 1, "#fff0b0");
      }
      const q = ["#ffffff", "#fff1c0", "#ffd678"][f];
      const bits = FONT["?"];
      for (let y = 0; y < 7; y++)
        for (let x = 0; x < 5; x++)
          if (bits[y * 5 + x] === "#") {
            r(6 + x, 5 + y, 1, 1, "#7a3a00");
            r(5 + x, 4 + y, 1, 1, q);
          }
    }),
  );
  const USED = tile((r) => {
    r(0, 0, 16, 16, INK);
    r(1, 1, 14, 14, "#a8602c");
    r(1, 1, 14, 1, "#d08850");
    r(1, 1, 1, 14, "#d08850");
    r(1, 14, 14, 1, "#6c3614");
    r(14, 1, 1, 14, "#6c3614");
    for (const [x, y] of [
      [3, 3],
      [11, 3],
      [3, 11],
      [11, 11],
    ])
      r(x, y, 2, 2, "#6c3614");
  });
  const BRICK = tile((r) => {
    r(0, 0, 16, 16, "#5a1e08");
    for (let row = 0; row < 4; row++) {
      const y = row * 4;
      const shift = row % 2 ? 4 : 0;
      for (let x = -8 + shift; x < 16; x += 8) {
        r(x + 1, y + 1, 7, 3, "#c85418");
        r(x + 1, y + 1, 7, 1, "#f08848");
      }
    }
    r(0, 0, 16, 1, INK);
  });
  const HARD = tile((r) => {
    r(0, 0, 16, 16, INK);
    r(1, 1, 14, 14, "#8aa0c8");
    r(1, 1, 14, 2, "#c8d8f0");
    r(1, 1, 2, 14, "#c8d8f0");
    r(1, 13, 14, 2, "#4a5a88");
    r(13, 1, 2, 14, "#4a5a88");
    r(5, 5, 6, 6, "#6a80b0");
    r(5, 5, 6, 1, "#4a5a88");
    r(5, 5, 1, 6, "#4a5a88");
  });
  const CLOUD = [0, 1, 2].map((kind) =>
    tile((r) => {
      r(0, 3, 16, 9, "#ffffff");
      r(kind === 0 ? 2 : 0, 1, kind === 0 ? 14 : 16, 2, "#ffffff");
      r(0, 10, 16, 2, "#c8e0f8");
      r(0, 2, 16, 1, INK);
      r(0, 12, 16, 1, INK);
      if (kind === 0) {
        r(0, 3, 1, 9, INK);
        r(1, 2, 1, 1, INK);
      }
      if (kind === 2) {
        r(15, 3, 1, 9, INK);
        r(14, 2, 1, 1, INK);
      }
      r(4, 5, 2, 2, "#e6f2ff");
    }),
  );
  const CANNON_TOP = tile((r) => {
    r(0, 0, 16, 16, INK);
    r(1, 1, 14, 14, "#34304a");
    r(2, 2, 12, 3, "#5a5478");
    r(1, 7, 14, 3, "#f7931a");
    r(1, 7, 14, 1, "#ffc466");
    r(5, 11, 6, 3, "#d8d8e8");
    r(6, 12, 1, 1, INK);
    r(9, 12, 1, 1, INK);
  });
  const CANNON_BASE = tile((r) => {
    r(0, 0, 16, 16, INK);
    r(2, 0, 12, 16, "#262238");
    r(3, 0, 2, 16, "#4a4466");
    r(2, 5, 12, 2, "#5a5478");
    r(2, 12, 12, 2, "#5a5478");
  });
  function pipeTile(top, left) {
    return tile((r) => {
      const x0 = left ? (top ? 0 : 2) : 0;
      const x1 = left ? 16 : top ? 16 : 14;
      r(x0, 0, x1 - x0, 16, "#00a838");
      if (left) {
        r(x0, 0, 1, 16, INK);
        r(x0 + 2, 0, 3, 16, "#88f8a0");
        r(x0 + 6, 0, 2, 16, "#40d060");
        r(x0 + 3, 0, 1, 16, "#e8fff0");
      } else {
        r(x1 - 1, 0, 1, 16, INK);
        r(x1 - 6, 0, 4, 16, "#007828");
        r(x1 - 9, 0, 2, 16, "#009030");
      }
      if (top) {
        r(0, 0, 16, 1, INK);
        r(0, 15, 16, 1, INK);
        r(0, 14, 16, 1, "#006020");
      }
    });
  }
  const PIPE = {
    tl: pipeTile(true, true),
    tr: pipeTile(true, false),
    bl: pipeTile(false, true),
    br: pipeTile(false, false),
  };

  // Ground tiles for each city, with an ink edge on exposed sides.
  const GROUND_STYLE = {
    dc: {
      top: "#5cd85c",
      topLight: "#b0f8a0",
      topDark: "#2c9c3c",
      fill: "#e0a868",
      fillDot: "#b87840",
      fillDark: "#9c6030",
    },
    ny: {
      top: "#c8c8d8",
      topLight: "#f0f0f8",
      topDark: "#8888a0",
      fill: "#a8483a",
      fillDot: "#6c2a22",
      fillDark: "#80382c",
    },
    dubai: {
      top: "#f8d878",
      topLight: "#fff4c0",
      topDark: "#d8a848",
      fill: "#e8a858",
      fillDot: "#b87838",
      fillDark: "#c88848",
    },
  };
  const groundCache = new Map();
  function groundTile(city, top, left, right, c, r) {
    const variant = (c * 7 + r * 3) % 4;
    const key = `${city}${+top}${+left}${+right}${variant}`;
    if (!groundCache.has(key)) {
      const s = GROUND_STYLE[city];
      groundCache.set(
        key,
        tile((rect) => {
          rect(0, 0, 16, 16, s.fill);
          if (city === "ny") {
            for (let y = 0; y < 16; y += 4) {
              rect(0, y, 16, 1, s.fillDot);
              rect(((y / 4) % 2) * 8 + 3, y, 1, 4, s.fillDot);
            }
          } else {
            const dots = [
              [3, 4],
              [10, 2],
              [6, 10],
              [13, 12],
              [1, 13],
            ];
            for (let i = 0; i < dots.length; i++)
              if ((i + variant) % 2 === 0 || city === "dubai")
                rect(dots[i][0], dots[i][1], 2, 2, s.fillDot);
            if (city === "dubai") {
              rect(0, 7 + (variant % 3), 16, 1, s.fillDark);
            }
          }
          if (top) {
            rect(0, 0, 16, 6, s.top);
            rect(0, 1, 16, 1, s.topLight);
            if (city === "dc") {
              for (let x = 0; x < 16; x += 4) rect(x, 5, 3, 2, s.topDark);
              rect(2 + variant * 3, 2, 1, 2, s.topLight);
            } else if (city === "ny") {
              rect(0, 5, 16, 2, s.topDark);
              rect(variant * 4, 1, 1, 4, s.topDark);
            } else {
              rect(2 + variant * 2, 3, 5, 1, s.topDark);
              rect(0, 6, 16, 1, s.topDark);
            }
            rect(0, 0, 16, 1, INK);
          }
          if (left) rect(0, 0, 1, 16, INK);
          if (right) rect(15, 0, 1, 16, INK);
        }),
      );
    }
    return groundCache.get(key);
  }

  const PLATFORM_COLORS = {
    mint: ["#b8ffd8", "#58d898", "#249860"],
    peach: ["#ffe0c0", "#ffb070", "#c87038"],
    orange: ["#ffd0a0", "#f89838", "#b85c10"],
    sky: ["#c8ecff", "#68c0f8", "#2c78c0"],
    gold: ["#fff0a0", "#f8c838", "#b88810"],
    rose: ["#ffd0e0", "#f888b0", "#b84878"],
  };

  // ---------------------------------------------------------------------------
  // Decorations
  const DECOR = {
    bush: shape(34, 14, (x, y) => {
      const blobs = [
        [8, 10, 8],
        [17, 7, 9],
        [26, 10, 8],
      ];
      for (const [cx, cy, rad] of blobs) {
        const d = Math.hypot(x - cx, (y - cy) * 1.1);
        if (d < rad)
          return y < cy - rad * 0.4 && x < cx
            ? "#8cf07c"
            : d > rad - 2 && y > cy
              ? "#1c8a2c"
              : "#38c048";
      }
      return y >= 10 ? "#38c048" : null;
    }),
    lamp: sprite(
      [
        "..kkkk..",
        ".kyyyyk.",
        ".kyWWyk.",
        ".kyWWyk.",
        "..kyyk..",
        "...kk...",
        "...kk...",
        "...kk...",
        "...kk...",
        "...kk...",
        "...kk...",
        "...kk...",
        "...kk...",
        "...kk...",
        "...kk...",
        "...kk...",
        "...kk...",
        "...kk...",
        "...kk...",
        "..kkkk..",
        ".kkkkkk.",
        ".kkkkkk.",
      ],
      { k: "#24303c", y: "#ffe070", W: "#fffbe0" },
    ),
    hydrant: sprite(
      [
        "..rrrr..",
        ".rRRRRr.",
        ".rrrrrr.",
        "rrrrrrrr",
        ".rrrrrr.",
        ".rrrrrr.",
        ".rRrrrr.",
        ".rrrrrr.",
        "rrrrrrrr",
      ],
      { r: "#e03030", R: "#ff9a8a" },
    ),
    bench: sprite(
      [
        "wwwwwwwwwwwwwwwwww",
        "..................",
        "wwwwwwwwwwwwwwwwww",
        "kk..............kk",
        "kk..............kk",
        "k................k",
      ],
      { w: "#6a8a3a", k: "#303030" },
    ),
    flag: sprite(
      [
        "wrrrrrrrrrrr",
        "wbbbbrrrrrrr",
        "wbwbbwwwwwww",
        "wbbbbrrrrrrr",
        "wwwwwwwwwwww",
        "wrrrrrrrrrrr",
        "w...........",
        "w...........",
        "w...........",
        "w...........",
        "w...........",
        "w...........",
        "w...........",
        "w...........",
        "w...........",
        "w...........",
        "w...........",
        "w...........",
        "w...........",
        "w...........",
        "w...........",
        "k...........",
      ],
      { w: "#d8d8d8", r: "#d83838", b: "#2c3c9c", k: "#4a4a4a" },
    ),
    tree: shape(30, 40, (x, y) => {
      if (y > 22 && x >= 13 && x <= 16) return x === 13 ? "#8a5a38" : "#5a3418";
      for (const [cx, cy, rad] of [
        [15, 11, 11],
        [7, 18, 7],
        [23, 18, 7],
      ]) {
        const d = Math.hypot(x - cx, y - cy);
        if (d < rad)
          return (x * 7 + y * 13) % 11 === 0
            ? "#ffffff"
            : y < cy - 2 && x < cx
              ? "#ffd0e4"
              : d > rad - 2
                ? "#e0709c"
                : "#ffa8c8";
      }
      return null;
    }),
    palm: shape(38, 56, (x, y) => {
      if (y > 12) {
        const trunkX = 18 + Math.round(Math.sin(y / 14) * 2);
        if (x >= trunkX && x <= trunkX + 3)
          return y % 4 === 0 ? "#6c4424" : x === trunkX ? "#c89058" : "#9c6a3c";
      }
      const fronds = [
        [-1, 0.35],
        [1, 0.35],
        [-1, -0.2],
        [1, -0.2],
        [0.2, -1],
      ];
      for (const [dx, slope] of fronds) {
        for (let t = 0; t < 18; t++) {
          const fx = 19 + dx * t;
          const fy = 12 - slope * t * (dx === 0.2 ? 0.6 : 1) + (t * t) / 26;
          if (Math.abs(x - fx) < 1.2 && Math.abs(y - fy) < 2 - t / 14)
            return t % 3 === 0 ? "#5cd05c" : "#2c9c3c";
        }
      }
      if (Math.hypot(x - 19, y - 13) < 2.5) return "#7a4a20";
      return null;
    }),
  };
  // SMB3-style cloud with eyes for the sky.
  const SKY_CLOUD = shape(40, 20, (x, y) => {
    for (const [cx, cy, rad] of [
      [10, 12, 8],
      [20, 9, 10],
      [30, 12, 8],
    ]) {
      if (Math.hypot(x - cx, (y - cy) * 1.15) < rad) {
        if ((x === 17 || x === 23) && y >= 7 && y <= 10) return INK;
        return y > 15 ? "#d0e4f8" : "#ffffff";
      }
    }
    return y >= 12 && y <= 18 && x > 3 && x < 37
      ? y > 15
        ? "#d0e4f8"
        : "#ffffff"
      : null;
  });

  // ---------------------------------------------------------------------------
  // City backdrops. Each paints a far skyline and a nearer mid layer once;
  // live bits (traffic, blimps, fireworks, tickers) are drawn every frame.
  function seeded(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }
  const FAR_W = 1024;
  const MID_W = 640;
  const CITY = {
    dc: {
      sky: ["#3c8ef0", "#5aa6f8", "#78bcf8", "#98d0f8", "#b8e0f8", "#d8f0f8"],
      far: paintFar((ctx, r) => {
        const stone = "#e8eef8";
        const shade = "#a8b8d8";
        const hill = "#88b0d8";
        r(0, 170, FAR_W, 60, hill);
        for (let x = 0; x < FAR_W; x += 22) {
          ctx.fillStyle = "#7aa4d0";
          ctx.beginPath();
          ctx.arc(x + 11, 172, 12, Math.PI, 0);
          ctx.fill();
        }
        // Lincoln Memorial
        r(40, 146, 90, 26, stone);
        r(34, 140, 102, 7, shade);
        r(40, 136, 90, 5, stone);
        for (let x = 44; x < 128; x += 7) r(x, 147, 3, 24, shade);
        // Reflecting pool
        r(130, 168, 200, 3, "#c8e8ff");
        // Washington Monument
        r(352, 40, 14, 132, stone);
        r(362, 40, 4, 132, shade);
        ctx.fillStyle = stone;
        ctx.beginPath();
        ctx.moveTo(352, 40);
        ctx.lineTo(359, 28);
        ctx.lineTo(366, 40);
        ctx.fill();
        r(358, 25, 2, 4, "#ff5050");
        // The Capitol
        const cx = 650;
        r(cx - 120, 132, 240, 40, stone);
        r(cx - 124, 128, 248, 5, shade);
        for (let x = cx - 116; x < cx + 116; x += 8) r(x, 136, 3, 34, shade);
        r(cx - 44, 104, 88, 26, stone);
        for (let x = cx - 40; x < cx + 40; x += 6) r(x, 108, 2, 20, shade);
        ctx.fillStyle = stone;
        ctx.beginPath();
        ctx.ellipse(cx, 104, 38, 34, 0, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = shade;
        ctx.beginPath();
        ctx.ellipse(cx + 12, 104, 24, 30, 0, Math.PI * 1.5, 0);
        ctx.fill();
        for (let i = -3; i <= 3; i++)
          r(cx + i * 10, 78 + Math.abs(i) * 3, 1, 26 - Math.abs(i) * 3, shade);
        r(cx - 6, 60, 12, 12, stone);
        r(cx - 2, 50, 4, 10, stone);
        r(cx - 1, 46, 2, 4, shade);
        // Jefferson Memorial
        ctx.fillStyle = stone;
        ctx.beginPath();
        ctx.ellipse(900, 150, 30, 22, 0, Math.PI, 0);
        ctx.fill();
        r(866, 150, 68, 22, stone);
        for (let x = 870; x < 932; x += 7) r(x, 152, 3, 20, shade);
      }),
      mid: paintMid((ctx, put) => {
        // SMB3 striped hills and cherry trees along the Mall.
        const hill = (x, w, h, base, stripe) =>
          put(
            shape(w, h, (px, py) => {
              const rx = w / 2;
              const dx = (px - rx) / rx;
              if (
                py < h * (1 - Math.sqrt(Math.max(0, 1 - dx * dx))) * 0.9 + 4 &&
                py < h - 1
              ) {
                if (py < 4 && Math.abs(dx) < 0.6) return null;
              }
              const top =
                rx - Math.sqrt(Math.max(0, rx * rx - (px - rx) * (px - rx)));
              if (py < Math.min(top, h - 1)) return null;
              return px % 8 < 3 ? stripe : base;
            }),
            x,
            216 - h,
          );
        hill(20, 90, 110, "#78d878", "#98e898");
        hill(150, 70, 80, "#58c058", "#78d078");
        hill(330, 110, 130, "#78d878", "#98e898");
        hill(470, 80, 90, "#58c058", "#78d078");
        for (const x of [100, 250, 420, 560, 610])
          put(DECOR.tree, x, 216 - 40 - 6);
      }),
      tint: null,
    },
    ny: {
      sky: ["#5a3c8c", "#8a4c9c", "#c85c8c", "#f07c6c", "#f8a860", "#ffd080"],
      far: paintFar((ctx, r) => {
        const rand = seeded(7);
        const body = "#5a4474";
        const dark = "#43345c";
        const lit = "#ffd870";
        // Statue of Liberty on her island
        r(20, 168, 90, 6, "#3a3c6c");
        r(52, 136, 26, 34, "#8c7c7c");
        r(56, 124, 18, 14, "#8c7c7c");
        r(60, 92, 10, 32, "#5cb8a0");
        r(58, 100, 14, 18, "#5cb8a0");
        r(62, 84, 6, 8, "#5cb8a0");
        r(61, 82, 8, 2, "#8ce8c8");
        r(68, 70, 3, 16, "#5cb8a0");
        r(67, 66, 5, 4, "#ffc84c");
        let x = 120;
        while (x < FAR_W - 20) {
          const w = 18 + Math.floor(rand() * 26);
          const h = 50 + Math.floor(rand() * 70);
          r(x, 190 - h, w, h + 30, rand() < 0.5 ? body : dark);
          for (let wy = 190 - h + 4; wy < 186; wy += 5)
            for (let wx = x + 3; wx < x + w - 3; wx += 4)
              if (rand() < 0.4) r(wx, wy, 2, 2, lit);
          x += w + 1;
        }
        // Landmarks over the skyline
        const tower = (x0, w, h, color) => {
          r(x0, 190 - h, w, h + 30, color);
          for (let wy = 190 - h + 5; wy < 186; wy += 5)
            for (let wx = x0 + 2; wx < x0 + w - 2; wx += 3)
              if (rand() < 0.55) r(wx, wy, 1, 2, lit);
        };
        // Empire State
        tower(300, 30, 120, "#6c5488");
        tower(306, 18, 138, "#6c5488");
        tower(310, 10, 150, "#6c5488");
        r(314, 22, 2, 20, "#c8b8e0");
        // Chrysler
        tower(520, 22, 128, "#7a6494");
        for (let i = 0; i < 5; i++) {
          ctx.fillStyle = "#e0d0f0";
          ctx.beginPath();
          ctx.arc(531, 62 - i * 6, 11 - i * 2, Math.PI, 0);
          ctx.fill();
          ctx.fillStyle = "#7a6494";
          ctx.beginPath();
          ctx.arc(531, 62 - i * 6, 9 - i * 2, Math.PI, 0);
          ctx.fill();
        }
        r(530, 24, 2, 16, "#e0d0f0");
        // One World Trade Center
        ctx.fillStyle = "#7c8cb8";
        ctx.beginPath();
        ctx.moveTo(780, 220);
        ctx.lineTo(784, 50);
        ctx.lineTo(806, 50);
        ctx.lineTo(812, 220);
        ctx.fill();
        r(794, 20, 2, 30, "#c8d8f0");
        for (let wy = 56; wy < 190; wy += 4) r(786, wy, 18, 1, "#a8b8e0");
      }),
      mid: paintMid((ctx, put, r) => {
        // Brownstones with fire escapes and water towers.
        const rand = seeded(11);
        let x = 0;
        while (x < MID_W) {
          const w = 44 + Math.floor(rand() * 24);
          const h = 64 + Math.floor(rand() * 40);
          const color = ["#9c4c3c", "#8c5a44", "#7c3c38", "#a86a4c"][
            Math.floor(rand() * 4)
          ];
          r(x, 216 - h, w, h, INK);
          r(x + 1, 217 - h, w - 2, h, color);
          r(x + 1, 217 - h, w - 2, 3, "#c88868");
          for (let wy = 224 - h; wy < 206; wy += 12)
            for (let wx = x + 5; wx < x + w - 8; wx += 10) {
              r(wx, wy, 6, 8, INK);
              r(wx + 1, wy + 1, 4, 6, rand() < 0.5 ? "#ffd870" : "#3c3c5c");
            }
          r(x + w - 10, 222 - h, 1, h - 16, "#302838");
          if (rand() < 0.5) {
            r(x + 8, 204 - h, 14, 12, INK);
            r(x + 9, 205 - h, 12, 10, "#8c5a2c");
            r(x + 10, 216 - h, 2, 1, INK);
            r(x + 18, 216 - h, 2, 1, INK);
          }
          x += w + 4;
        }
      }),
      tint: "#ff904018",
    },
    dubai: {
      sky: ["#0c1030", "#1c1c4c", "#34286c", "#5c3478", "#a8487c", "#e8787c"],
      far: paintFar((ctx, r) => {
        const rand = seeded(23);
        const body = "#241e44";
        const lit = "#8cd8ff";
        const warm = "#ffd38a";
        r(0, 176, FAR_W, 50, "#1c2c5c");
        for (let x = 0; x < FAR_W; x += 6)
          r(x, 178 + (x % 12 ? 0 : 2), 3, 1, "#3c5c9c");
        // Burj Al Arab sail on the water
        ctx.fillStyle = "#e8e0f0";
        ctx.beginPath();
        ctx.moveTo(150, 176);
        ctx.quadraticCurveTo(150, 90, 200, 70);
        ctx.lineTo(206, 70);
        ctx.lineTo(206, 176);
        ctx.fill();
        r(203, 58, 2, 118, "#b8b0d0");
        r(176, 120, 30, 4, "#c8c0e0");
        // Dubai Frame
        r(40, 110, 8, 66, "#e8b84c");
        r(84, 110, 8, 66, "#e8b84c");
        r(40, 106, 52, 8, "#e8b84c");
        r(48, 114, 36, 62, "#2a2854");
        let x = 240;
        while (x < FAR_W - 20) {
          const w = 16 + Math.floor(rand() * 22);
          const h = 40 + Math.floor(rand() * 80);
          r(x, 176 - h, w, h, body);
          for (let wy = 180 - h; wy < 172; wy += 4)
            for (let wx = x + 2; wx < x + w - 2; wx += 3)
              if (rand() < 0.45) r(wx, wy, 1, 2, rand() < 0.5 ? lit : warm);
          x += w + 3 + Math.floor(rand() * 10);
        }
        // Burj Khalifa, stepped needle
        const cx = 560;
        const steps = [
          [26, 176, 60],
          [20, 116, 40],
          [14, 76, 40],
          [9, 36, 30],
          [5, 6, 26],
        ];
        for (const [half, bottom, height] of steps) {
          r(cx - half, bottom - height, half * 2, height, "#3c3470");
          r(cx - half, bottom - height, 3, height, "#6c64a8");
          for (let wy = bottom - height + 2; wy < bottom; wy += 3)
            r(cx - half + 4, wy, half * 2 - 8, 1, "#8cc8ff");
        }
        r(cx - 1, -16, 2, 22, "#8c84c8");
        // Museum of the Future torus
        ctx.fillStyle = "#c8d0e8";
        ctx.beginPath();
        ctx.ellipse(840, 140, 34, 26, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#241e44";
        ctx.beginPath();
        ctx.ellipse(846, 140, 20, 14, 0, 0, Math.PI * 2);
        ctx.fill();
        r(812, 164, 56, 12, "#3c3470");
      }),
      mid: paintMid((ctx, put) => {
        // Moonlit dunes with palms.
        const dune = (x, w, h, color, light) =>
          put(
            shape(
              w,
              h,
              (px, py) => {
                const t = px / w;
                const top = h - Math.sin(t * Math.PI) * h * 0.95;
                if (py < top) return null;
                return py < top + 2 ? light : color;
              },
              null,
            ),
            x,
            216 - h,
          );
        dune(-20, 260, 70, "#a0604c", "#e8a870");
        dune(200, 300, 90, "#8c5044", "#d89468");
        dune(460, 220, 60, "#a0604c", "#e8a870");
        for (const x of [60, 300, 520]) put(DECOR.palm, x, 216 - 56 - 30);
      }),
      tint: null,
    },
  };

  function paintFar(draw) {
    const [canvas, ctx] = makeCanvas(FAR_W, H);
    const r = (x, y, w, h, c) => {
      ctx.fillStyle = c;
      ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    };
    draw(ctx, r);
    return canvas;
  }
  function paintMid(draw) {
    const [canvas, ctx] = makeCanvas(MID_W, H);
    const r = (x, y, w, h, c) => {
      ctx.fillStyle = c;
      ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    };
    const put = (img, x, y) => ctx.drawImage(img, Math.round(x), Math.round(y));
    draw(ctx, put, r);
    return canvas;
  }

  // ---------------------------------------------------------------------------
  function create(ctx) {
    const r = (x, y, w, h, c) => {
      ctx.fillStyle = c;
      ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    };
    const put = (img, x, y) => ctx.drawImage(img, Math.round(x), Math.round(y));
    function putFlipped(img, x, y, flipX, flipY) {
      ctx.save();
      ctx.translate(
        Math.round(x) + (flipX ? img.width : 0),
        Math.round(y) + (flipY ? img.height : 0),
      );
      ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
      ctx.drawImage(img, 0, 0);
      ctx.restore();
    }
    function text(str, x, y, color = "#ffffff", opts = {}) {
      const scale = opts.scale || 1;
      const s = String(str).toUpperCase();
      let x0 = Math.round(
        opts.align === "center"
          ? x - textWidth(s, scale) / 2
          : opts.align === "right"
            ? x - textWidth(s, scale)
            : x,
      );
      for (const ch of s) {
        const img = glyph(
          ch,
          color,
          opts.outline === undefined ? INK : opts.outline,
        );
        ctx.drawImage(
          img,
          x0 - scale,
          Math.round(y) - scale,
          img.width * scale,
          img.height * scale,
        );
        x0 += 6 * scale;
      }
    }

    // --- Backdrop -------------------------------------------------------------
    function cityWeights(camX) {
      const center = camX + W / 2;
      return SECTIONS.map((section, i) => {
        const start = i * SECTION_PX;
        const fadeIn = i === 0 ? 1 : clamp((center - start + 120) / 240, 0, 1);
        const next = (i + 1) * SECTION_PX;
        const fadeOut =
          i === SECTIONS.length - 1
            ? 0
            : clamp((center - next + 120) / 240, 0, 1);
        return { city: section.city, index: i, alpha: fadeIn * (1 - fadeOut) };
      });
    }

    function drawSky(city) {
      const bands = CITY[city].sky;
      const bandH = Math.ceil(H / bands.length);
      bands.forEach((color, i) => r(0, i * bandH, W, bandH + 1, color));
      // Dithered seams between bands, SNES style.
      for (let i = 1; i < bands.length; i++) {
        for (let x = 0; x < W; x += 2)
          r(x + (i % 2), i * bandH - 1, 1, 1, bands[i]);
      }
    }

    function drawCity(state, weight) {
      const { city, index } = weight;
      const cam = state.camera;
      const lift = WORLD_H - H - cam.y;
      drawSky(city);
      const t = state.time;
      if (city === "dubai") {
        for (let i = 0; i < 60; i++) {
          const sx = (i * 97) % W;
          const sy = (i * 53) % 120;
          if (Math.sin(t * 2 + i) > -0.2)
            r(sx, sy + lift * 0.05, 1, 1, i % 5 ? "#c8c8ff" : "#ffffff");
        }
        drawFireworks(t, lift);
      } else {
        for (let i = 0; i < 4; i++) {
          const x =
            mod(i * 150 - (cam.x - index * SECTION_PX) * 0.1 - t * 6, W + 80) -
            40;
          put(SKY_CLOUD, x, 14 + (i % 2) * 22 + lift * 0.15);
        }
      }
      const localX = cam.x - index * SECTION_PX;
      const farX = -Math.round(clamp(localX * 0.2 + 60, 0, FAR_W - W));
      put(CITY[city].far, farX, 22 + lift * 0.25);
      drawFarLife(state, city, farX, 22 + lift * 0.25);
      const midX = -mod(Math.round(localX * 0.5), MID_W);
      const midY = 24 + lift * 0.5;
      put(CITY[city].mid, midX, midY);
      put(CITY[city].mid, midX + MID_W, midY);
      drawMidLife(state, city, midX, midY);
      if (CITY[city].tint) r(0, 0, W, H, CITY[city].tint);
    }

    // Moving bits in the skyline: blimp, helicopter, planes, taxis, tickers.
    function drawFarLife(state, city, farX, farY) {
      const t = state.time;
      if (city === "dc") {
        const bx = mod(t * 8, W + 140) - 70;
        r(bx, 40, 56, 16, INK);
        r(bx + 1, 41, 54, 14, "#e8e8f0");
        r(bx + 2, 41, 52, 3, "#ffffff");
        r(bx + 20, 56, 16, 5, INK);
        r(bx + 21, 56, 14, 4, "#4a4a6a");
        r(bx - 6, 43, 6, 10, INK);
        text("BTC ^", bx + 28, 45, "#f7931a", { align: "center" });
        const hx = mod(-t * 40, W + 60) - 30;
        const hy = 70 + Math.sin(t * 2) * 4;
        r(hx, hy, 16, 7, "#2c3c2c");
        r(hx + 16, hy + 2, 12, 2, "#2c3c2c");
        r(hx + 2, hy + 1, 5, 3, "#88c8f8");
        r(hx - 4 + (Math.floor(t * 20) % 2) * 6, hy - 2, 18, 1, INK);
        r(hx + 2, hy + 8, 12, 1, INK);
        // The Capitol flag waves.
        const fx = farX + 650;
        r(fx + 1, farY + 36, 8 + Math.round(Math.sin(t * 6)), 5, "#d83838");
        r(fx + 1, farY + 36, 3, 3, "#2c3c9c");
      } else if (city === "ny") {
        // A plane tows a HODL banner across the sunset.
        const px = mod(-t * 26, W + 200) - 60;
        r(px, 34, 14, 4, "#e8e8f8");
        r(px + 4, 31, 4, 3, "#e8e8f8");
        r(px + 10, 32, 3, 2, "#e8e8f8");
        r(px + 14, 36, 14, 1, "#a8a8c8");
        r(px + 28, 31, 60, 10, INK);
        r(px + 29, 32, 58, 8, "#fff4d8");
        text("HODL", px + 58, 33, "#f7931a", {
          align: "center",
          outline: null,
        });
        for (let i = 0; i < 14; i++) {
          if (Math.sin(t * 1.3 + i * 7.1) > 0.7)
            r(
              farX + 130 + i * 61,
              farY + 110 + ((i * 17) % 50),
              2,
              2,
              "#fff8c0",
            );
        }
      } else {
        // Burj Khalifa light show and a blinking tip.
        const cx = farX + 560;
        const hue = ["#ff6adf", "#6ae0ff", "#ffd36a", "#8aff9a"][
          Math.floor(t * 1.5) % 4
        ];
        const bandY = farY + 176 - mod(t * 60, 180);
        r(cx - 24, bandY, 48, 3, hue);
        if (Math.floor(t * 2) % 2) r(cx - 1, farY - 18, 2, 2, "#ff3030");
        const px = mod(t * 30, W + 60) - 30;
        if (Math.floor(t * 3) % 2) r(px, 50, 2, 1, "#ff4040");
        r(px + 3, 50, 1, 1, "#ffffff");
      }
    }

    function drawMidLife(state, city, midX, midY) {
      const t = state.time;
      if (city === "ny") {
        // Times Square billboard with the live BTC price.
        for (const bx of [midX + 250, midX + 250 + MID_W]) {
          if (bx > W || bx + 90 < 0) continue;
          r(bx, midY + 96, 92, 34, INK);
          r(bx + 2, midY + 98, 88, 30, "#101828");
          text("BTC", bx + 6, midY + 101, "#f7931a");
          text("^", bx + 80, midY + 101, "#4cff7a");
          text(
            "$" + Math.round(state.btc).toLocaleString("en-US"),
            bx + 46,
            midY + 116,
            "#4cff7a",
            { align: "center" },
          );
          r(bx + 44, midY + 130, 4, 24, INK);
        }
        // Yellow cabs rolling along the avenue.
        for (let i = 0; i < 4; i++) {
          const cx = mod(t * (40 + i * 11) + i * 170, W + 60) - 30;
          const cy = midY + 184;
          const dir = i % 2;
          const x = dir ? cx : W - cx;
          r(x, cy, 24, 8, INK);
          r(x + 1, cy + 1, 22, 6, "#ffd21e");
          r(x + 5, cy - 4, 13, 5, INK);
          r(x + 6, cy - 3, 11, 4, "#9ce0ff");
          r(x + 10, cy - 6, 4, 2, "#f7931a");
          r(x + 3, cy + 7, 5, 3, INK);
          r(x + 16, cy + 7, 5, 3, INK);
        }
      } else if (city === "dubai") {
        // A camel caravan crossing the dunes.
        for (let i = 0; i < 3; i++) {
          const x = mod(t * 9 + i * 22, W + 120) - 60;
          const y = midY + 150 + Math.sin(x / 40) * 4;
          const step = Math.floor(t * 4 + i) % 2;
          r(x, y, 14, 6, "#3a2230");
          r(x + 4, y - 3, 6, 3, "#3a2230");
          r(x + 13, y - 5, 3, 7, "#3a2230");
          r(x + 14, y - 7, 5, 3, "#3a2230");
          r(x + 1 + step, y + 6, 2, 6, "#3a2230");
          r(x + 10 - step, y + 6, 2, 6, "#3a2230");
        }
      } else {
        // Joggers on the Mall.
        for (let i = 0; i < 3; i++) {
          const x = mod(t * (22 + i * 6) + i * 140, W + 40) - 20;
          const y = midY + 176;
          const step = Math.floor(t * 8 + i) % 2;
          r(x + 1, y, 4, 4, "#f2c29a");
          r(x, y + 4, 6, 6, ["#e04848", "#4878e0", "#f7931a"][i]);
          r(x + step * 2, y + 10, 2, 4, "#2c2c3c");
          r(x + 4 - step * 2, y + 10, 2, 4, "#2c2c3c");
        }
      }
    }

    function drawFireworks(t, lift) {
      for (let i = 0; i < 4; i++) {
        const period = 2.6 + i * 0.5;
        const phase = mod(t + i * 1.1, period);
        const x =
          60 +
          ((i * 131 + Math.floor((t + i * 1.1) / period) * 83) % (W - 120));
        const y = 30 + ((i * 37) % 60) + lift * 0.2;
        const color = ["#ff6adf", "#ffd36a", "#6ae0ff", "#8aff9a"][i];
        if (phase < 0.6) {
          r(x, y + 90 - phase * 150, 1, 3, "#ffe8c0");
        } else if (phase < 1.8) {
          const k = (phase - 0.6) / 1.2;
          const rad = 4 + k * 24;
          for (let a = 0; a < 12; a++) {
            const ang = (a / 12) * Math.PI * 2;
            r(
              x + Math.cos(ang) * rad,
              y + Math.sin(ang) * rad + k * 6,
              k < 0.7 ? 2 : 1,
              k < 0.7 ? 2 : 1,
              a % 2 ? color : "#ffffff",
            );
          }
        }
      }
    }

    // --- World ----------------------------------------------------------------
    function drawDecor(state, camX, camY) {
      for (const d of state.decor) {
        const x = d.x - camX;
        if (x < -80 || x > W + 80) continue;
        const y = d.y - camY;
        if (d.kind === "gate" || d.kind === "goal") continue;
        const img = DECOR[d.kind];
        if (img) put(img, x + 8 - img.width / 2, y - img.height + 1);
      }
    }

    function drawGates(state, camX, camY, front) {
      for (const d of state.decor) {
        const x = d.x - camX;
        if (x < -80 || x > W + 80) continue;
        const ground = d.y - camY;
        if (d.kind === "gate") {
          const index = d.x < SECTION_PX ? 0 : 1;
          const passed = state.checkpoint >= index;
          if (!front) {
            post(x - 2, ground - 64, 64, "#f7931a");
          } else {
            post(x + 30, ground - 64, 64, "#f7931a");
            if (!passed) {
              r(x + 2, ground - 40, 30, 5, INK);
              r(x + 3, ground - 39, 28, 3, "#ffd23c");
            }
            text(
              passed ? "FAILED" : "VOTE",
              x + 18,
              ground - 78,
              passed ? "#ff5050" : "#ffffff",
              { align: "center" },
            );
          }
        } else if (d.kind === "goal") {
          const top = ground - 9 * TILE;
          if (!front) {
            post(x - 22, top, 9 * TILE, "#8a4cd8");
          } else {
            post(x + 22, top, 9 * TILE, "#8a4cd8");
            if (!state.goal) {
              const y = goalTape(state) - camY;
              r(x - 18, y - 2, 40, 5, INK);
              r(x - 17, y - 1, 38, 3, "#f7931a");
              r(x - 17, y - 1, 38, 1, "#ffd08a");
            }
            text("GENESIS", x + 8, top - 14, "#ffd23c", { align: "center" });
          }
        }
      }
    }
    function goalTape(state) {
      const top = (GROUND - 9) * TILE;
      const bottom = GROUND * TILE - 18;
      return top + (bottom - top) * (0.5 + 0.5 * Math.sin(state.time * 1.6));
    }
    function post(x, y, h, color) {
      r(x, y, 6, h, INK);
      r(x + 1, y + 1, 4, h - 1, color);
      r(x + 1, y + 1, 1, h - 1, "#ffffff80");
      for (let yy = y + 6; yy < y + h; yy += 8) r(x + 1, yy, 4, 3, "#00000030");
      r(x - 1, y - 3, 8, 4, INK);
      r(x, y - 2, 6, 2, "#fff0c0");
    }

    function drawPlatforms(state, camX, camY) {
      for (const p of state.platforms) {
        const x = p.x - camX;
        if (x > W || x + p.w < 0) continue;
        const y = p.y - camY;
        const [light, base, dark] =
          PLATFORM_COLORS[p.color] || PLATFORM_COLORS.mint;
        r(x + p.w, y + 6, 6, p.h - 6, "#00000040");
        r(x, y, p.w, p.h, INK);
        r(x + 1, y + 1, p.w - 2, p.h - 1, base);
        r(x + 1, y + 1, p.w - 2, 2, light);
        r(x + 1, y + 1, 2, p.h - 1, light);
        r(x + p.w - 3, y + 3, 2, p.h - 3, dark);
        for (const bx of [x + 4, x + p.w - 8]) {
          r(bx, y + 4, 4, 4, INK);
          r(bx + 1, y + 5, 2, 2, "#f0f0f0");
        }
      }
    }

    function tileCity(c) {
      return SECTIONS[
        Math.min(SECTIONS.length - 1, Math.floor(c / SECTION_COLS))
      ].city;
    }

    function drawTiles(state, camX, camY, tileAt) {
      const c0 = Math.floor(camX / TILE);
      const c1 = c0 + Math.ceil(W / TILE) + 1;
      const r0 = Math.max(0, Math.floor(camY / TILE));
      const r1 = Math.min(G.ROWS - 1, r0 + Math.ceil(H / TILE) + 1);
      const qFrame = Math.floor(state.time * 6) % 4;
      const coinFrame = Math.floor(state.time * 8) % 4;
      for (let row = r0; row <= r1; row++) {
        for (let c = c0; c <= c1; c++) {
          const t = tileAt(c, row);
          if (t === ".") continue;
          const x = c * TILE - camX;
          let y = row * TILE - camY;
          const bump = state.bumps.find((b) => b.c === c && b.r === row);
          if (bump)
            y -= Math.round(Math.sin((1 - bump.life / 0.18) * Math.PI) * 5);
          if (t === "G") {
            put(
              groundTile(
                tileCity(c),
                tileAt(c, row - 1) !== "G",
                tileAt(c - 1, row) !== "G",
                tileAt(c + 1, row) !== "G",
                c,
                row,
              ),
              x,
              y,
            );
          } else if (t === "?" || t === "M" || t === "S")
            put(QUESTION[qFrame], x, y);
          else if (t === "U") put(USED, x, y);
          else if (t === "B") put(BRICK, x, y);
          else if (t === "H") put(HARD, x, y);
          else if (t === "=")
            put(
              CLOUD[
                tileAt(c - 1, row) !== "="
                  ? 0
                  : tileAt(c + 1, row) !== "="
                    ? 2
                    : 1
              ],
              x,
              y,
            );
          else if (t === "K")
            put(tileAt(c, row - 1) === "K" ? CANNON_BASE : CANNON_TOP, x, y);
          else if (t === "P") {
            const top = tileAt(c, row - 1) !== "P";
            const left = tileAt(c - 1, row) !== "P";
            put(PIPE[(top ? "t" : "b") + (left ? "l" : "r")], x, y);
          } else if (t === "o") {
            const img = S.coin[coinFrame];
            put(img, x + 8 - img.width / 2, y + 1);
          }
        }
      }
    }

    function drawItems(state, camX, camY, rising) {
      for (const item of state.items) {
        if (item.rise > 0 !== rising) continue;
        const x = item.x - camX;
        const y = item.y - camY;
        if (item.kind === "popcoin") {
          const img = S.coin[Math.floor(state.time * 16) % 4];
          put(img, x + 5 - img.width / 2, y);
        } else if (item.kind === "pill") put(S.pill, x - 1, y + 4);
        else if (item.kind === "hoodie") put(S.hoodie, x - 1, y);
        else if (item.kind === "star")
          put(S.star[Math.floor(state.time * 10) % 2], x - 1, y - 1);
      }
    }

    function drawEnemies(state, camX, camY, plants) {
      const t = state.time;
      for (const e of state.enemies) {
        if (!e.active || (!e.alive && e.flat <= 0)) continue;
        if ((e.type === "plant") !== plants) continue;
        const x = e.x - camX;
        const y = e.y - camY;
        if (x < -40 || x > W + 40) continue;
        const frame = Math.floor(t * 4 + e.id) % 2;
        if (e.type === "plant") {
          put(S.plant[Math.floor(t * 3) % 2], x - 1, y - 1);
          continue;
        }
        let img;
        if (e.type === "politician")
          img = e.flat > 0 ? S.politicianFlat : S.politician[frame];
        else if (e.type === "banker") img = S.banker[frame];
        else if (e.type === "briefcase")
          img = S.briefcase[e.vx !== 0 ? Math.floor(t * 12) % 2 : 0];
        else if (e.type === "shitcoin") img = S.shitcoin[Math.floor(t * 6) % 2];
        const dx = x + e.w / 2 - img.width / 2;
        const dy = y + e.h + 1 - img.height;
        if (e.wings && !e.flip)
          put(
            S.wings[Math.floor(t * 8) % 2],
            dx + (e.vx > 0 ? -4 : 10),
            dy + 8,
          );
        putFlipped(img, dx, dy, e.vx > 0 && e.type === "banker", e.flip);
        if (
          e.type === "politician" &&
          !e.flip &&
          e.flat <= 0 &&
          Math.floor(t * 0.5 + e.id) % 5 === 0
        ) {
          text("YES!", x + 7, y - 12, "#ffffff", { align: "center" });
        }
      }
    }

    function drawPlayer(state, camX, camY) {
      const p = state.player;
      if (p.invincible > 0 && !p.dead && Math.floor(state.time * 20) % 2 === 0)
        return;
      let form = p.form;
      if (p.grow > 0)
        form =
          Math.floor(p.grow * 14) % 2
            ? p.form === "small"
              ? "big"
              : "small"
            : p.form;
      const tall = form !== "small";
      let frame = "stand";
      if (p.dead) frame = tall ? "stand" : "dead";
      else if (!p.onGround) frame = "jump";
      else if (Math.abs(p.vx) > 4)
        frame =
          Math.floor(p.step / (Math.abs(p.vx) > 140 ? 5 : 7)) % 2
            ? "walk"
            : "stand";
      const paletteKey = form === "hoodie" ? "hoodie" : "normal";
      const hue =
        p.star > 0
          ? STAR_HUES[Math.floor(state.time * 16) % STAR_HUES.length]
          : null;
      const img = heroSprite(
        state.characterId,
        tall ? "big" : "small",
        frame,
        paletteKey,
        hue,
      );
      const x = p.x + p.w / 2 - img.width / 2 - camX;
      const y = p.y + p.h + 1 - img.height - camY;
      const flip = p.facing < 0;
      if (
        form === "hoodie" &&
        (p.flying > 0 || (!p.onGround && p.vy > 0 && p.jumpHeld))
      ) {
        const flap = flapSprite(Math.floor(state.time * 12) % 2);
        putFlipped(
          flap,
          flip ? x + img.width - 4 : x - flap.width + 4,
          y + 8,
          flip,
          false,
        );
      }
      putFlipped(img, x, y, flip, false);
      if (p.star > 0 && Math.floor(state.time * 20) % 3 === 0) {
        r(
          x + Math.sin(state.time * 30) * 8 + 6,
          y + Math.cos(state.time * 23) * 10 + 10,
          2,
          2,
          "#ffffff",
        );
      }
    }

    function drawParticles(state, camX, camY) {
      for (const q of state.particles) {
        const x = q.x - camX;
        const y = q.y - camY;
        if (q.color === "brick") {
          r(x, y, 6, 6, INK);
          r(x + 1, y + 1, 4, 4, "#c85418");
          r(x + 1, y + 1, 2, 1, "#f08848");
        } else r(x, y, q.size, q.size, q.color);
      }
      for (const w of state.words)
        text(w.text, w.x - camX + 7, w.y - camY, w.color, { align: "center" });
    }

    // --- HUD ------------------------------------------------------------------
    function drawHud(state, hud) {
      const p = state.player;
      r(0, 0, W, 26, "#1a102880");
      const runner = RUNNERS[state.characterId] || RUNNERS.satoshi;
      text(runner.name, 6, 3, runner.color);
      text("*" + String(hud.lives), 6, 13, "#ffffff");
      // P-meter
      for (let i = 0; i < P_FULL - 1; i++) {
        const on = p.pMeter > i;
        text(">", 30 + i * 6, 13, on ? "#ffffff" : "#5a5a7a");
      }
      const full = p.pMeter >= P_FULL;
      const blink = full && Math.floor(state.time * 10) % 2;
      r(67, 12, 13, 10, INK);
      r(68, 13, 11, 8, full ? (blink ? "#ffffff" : "#f7931a") : "#5a5a7a");
      text("P", 71, 14, full ? INK : "#2a2a3a", { outline: null });

      put(S.coin[0], 96, 3);
      text("*" + String(hud.coins).padStart(2, "0"), 108, 6, "#ffffff");
      text(String(hud.score).padStart(7, "0"), 96, 16, "#ffffff");

      text("TIME", 174, 3, "#ffd23c");
      text(hud.time, 174, 13, "#ffffff");

      // BTC price keeps climbing, with a tiny chart.
      const price = "$" + Math.round(state.btc).toLocaleString("en-US");
      text("@", 244, 3, "#f7931a");
      text(price, 252, 3, "#4cff7a");
      text("^", 252 + textWidth(price) + 4, 3, "#4cff7a");
      const hist = state.btcHistory.slice(-40);
      if (hist.length > 1) {
        const lo = Math.min(...hist);
        const hi = Math.max(...hist) || 1;
        r(244, 12, 42, 12, "#0a1a14");
        for (let i = 0; i < hist.length; i++) {
          const v = hi === lo ? 0.5 : (hist[i] - lo) / (hi - lo);
          r(246 + i, 21 - Math.round(v * 8), 1, 1, "#4cff7a");
        }
      }
      text(SECTIONS[state.section].name, W - 4, 16, "#ffffff", {
        align: "right",
      });
      text("BILLS " + state.billsFailed + "/3", W - 4, 3, "#ff6a6a", {
        align: "right",
      });
    }

    function drawBanner(state) {
      if (!state.banner) return;
      const msg = state.banner.text;
      const w = Math.min(W - 8, textWidth(msg) + 46);
      const x = Math.round((W - w) / 2);
      const y = H - 20;
      r(x, y, w, 14, INK);
      r(x + 1, y + 1, 36, 12, "#d82828");
      text("NEWS", x + 19, y + 4, "#ffffff", {
        align: "center",
        outline: null,
      });
      r(x + 37, y + 1, w - 38, 12, "#10182c");
      text(msg, x + 42, y + 4, "#fff4d0", { outline: null });
    }

    function drawStamp(state) {
      if (!state.stamp) return;
      const life = state.stamp.life;
      const pop = life > 2.2 ? 1 + (life - 2.2) * 3 : 1;
      const bill = state.stamp.bill;
      const w = Math.max(160, textWidth(bill) + 24);
      const x = Math.round((W - w) / 2);
      const y = 32;
      r(x, y, w, 72, INK);
      r(x + 2, y + 2, w - 4, 68, "#fff4dc");
      text(bill, W / 2, y + 8, "#1a1028", { align: "center", outline: null });
      const scale = Math.round(3 * pop);
      const sw = textWidth("FAILED", scale) + 12;
      const sx = Math.round(W / 2 - sw / 2);
      r(sx, y + 20, sw, 7 * scale + 10, "#d82828");
      r(sx + 2, y + 22, sw - 4, 7 * scale + 6, "#fff4dc");
      r(sx + 3, y + 23, sw - 6, 7 * scale + 4, "#d82828");
      text("FAILED", W / 2, y + 25, "#fff4dc", {
        align: "center",
        scale,
        outline: null,
      });
      text("BTC NEW ALL-TIME HIGH ^", W / 2, y + 58, "#1a9a4a", {
        align: "center",
        outline: null,
      });
    }

    function draw(state, hud, tileAt) {
      ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
      ctx.imageSmoothingEnabled = false;
      const camX = Math.round(state.camera.x);
      const camY = Math.round(state.camera.y);
      const weights = cityWeights(camX).filter((w) => w.alpha > 0);
      weights.forEach((w, i) => {
        ctx.globalAlpha = i === 0 ? 1 : w.alpha;
        drawCity(state, w);
      });
      ctx.globalAlpha = 1;
      drawDecor(state, camX, camY);
      drawGates(state, camX, camY, false);
      drawPlatforms(state, camX, camY);
      drawEnemies(state, camX, camY, true);
      drawItems(state, camX, camY, true);
      drawTiles(state, camX, camY, tileAt);
      drawItems(state, camX, camY, false);
      drawEnemies(state, camX, camY, false);
      drawPlayer(state, camX, camY);
      drawGates(state, camX, camY, true);
      drawParticles(state, camX, camY);
      // The start screen shows the city without the run HUD.
      if (!hud.menu) {
        drawHud(state, hud);
        drawBanner(state);
      }
      drawStamp(state);
      if (state.goal && state.goal.time > 1) {
        ctx.globalAlpha = Math.min(1, (state.goal.time - 1) / 2);
        r(0, 0, W, H, "#000000");
        ctx.globalAlpha = 1;
        text("NUMBER GO UP", W / 2, 80, "#f7931a", {
          align: "center",
          scale: 3,
        });
        text(
          "EVERY BILL FAILED. BITCOIN KEPT CLIMBING.",
          W / 2,
          118,
          "#ffffff",
          { align: "center" },
        );
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    return { draw };
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }
  function mod(v, n) {
    return ((v % n) + n) % n;
  }

  // Menu portrait: the runner's big standing sprite, centred and scaled up.
  function portrait(ctx, runner) {
    const img = heroSprite(runner, "big", "stand", "normal");
    const scale = Math.floor(
      Math.min(ctx.canvas.width / img.width, ctx.canvas.height / img.height) *
        0.9,
    );
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      img,
      Math.round((ctx.canvas.width - img.width * scale) / 2),
      ctx.canvas.height - img.height * scale,
      img.width * scale,
      img.height * scale,
    );
  }

  window.NumberGoUpArt = { create, portrait, SCALE };
})();
