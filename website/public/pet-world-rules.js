// website/src/shared/pet-world.ts
var WORLD = {
  // 体力：上限 100（小屋每级 +20），每 regen 秒回 1 点（一天约 480 点）。只来一次的人只能用到上限，常来的人能把回复都用掉。
  energyBase: 100,
  energyPerHouse: 20,
  regen: 180,
  dailyEarn: 18e5,
  maxActions: 40,
  minGap: 2,
  plotsStart: 6,
  plotsMax: 24,
  plotPrice: (n) => 1e4 * n,
  // 第 n 块（从第 7 块起）
  barnStart: 2,
  barnMax: 8,
  barnPrice: (n) => 8e4 * n,
  trapMax: 4,
  trapPrice: (n) => 3e4 * n,
  trapEvery: 180,
  trapCap: 4,
  houseMax: 5,
  housePrice: [1e5, 25e4, 6e5, 12e5, 25e5],
  // 鱼竿 / 镐子 1–4 级；洒水器 0–3 级（覆盖前 8 / 16 / 24 块地，自动浇水）
  tools: { rod: [0, 8e4, 3e5, 1e6], pick: [0, 8e4, 3e5, 1e6], spr: [15e4, 5e5, 15e5] },
  sprCover: [0, 8, 16, 24],
  cost: { plant: 2, water: 1, harvest: 1, clear: 1, feed: 1, fish: 4, mine: 3 },
  daily: { fish: 80, mine: 100, coffee: 3, rest: 3 },
  xp: { harvest: 2, collect: 2, fish: 3, mine: 2 },
  coffee: { price: 15e3, energy: 60 },
  // 2026-11-05：每天 3 次免费「免费便当」，体力直接回满（不会超过上限，满的时候不让用）
  rest: { energy: "max" },
  // 动物：每次产出给 animalYield 个（2026-11-05 翻倍）
  animalYield: 2,
  stockBatches: 384
  // 为40条社交日志、成熟池、逐批预留和管家报告预留存档空间
};
var SEASONS = ["\u6625", "\u590F", "\u79CB", "\u51AC"];
var WEATHERS = ["\u6674", "\u96E8", "\u98CE", "\u96EA"];
var worldDay = (t) => new Date((t + 8 * 3600) * 1e3).toISOString().slice(0, 10);
var dayNum = (day) => Math.floor(Date.parse(day) / 864e5);
var seasonOf = (day) => (Math.floor((dayNum(day) - dayNum("2026-11-02")) / 7) % 4 + 4) % 4;
var hourOf = (t) => new Date((t + 8 * 3600) * 1e3).getUTCHours();
function valleyActiveClock(t) {
  const local = t + 8 * 3600, d = Math.floor(local / 86400);
  return d * 18 * 3600 + Math.max(0, local - d * 86400 - 6 * 3600);
}
var valleyActiveSeconds = (from, to) => Math.max(0, valleyActiveClock(to) - valleyActiveClock(from));
function valleyAfterActive(t, seconds) {
  if (seconds <= 0) return t;
  const end = valleyActiveClock(t) + seconds, d = Math.floor(end / (18 * 3600)), r = end - d * 18 * 3600;
  return d * 86400 - 8 * 3600 + (r === 0 ? 0 : 6 * 3600 + r);
}
function valleyTime(t) {
  const local = t + 8 * 3600, realDay = Math.floor((local - 6 * 3600) / 86400);
  const h = (local - Math.floor(local / 86400) * 86400) / 3600;
  const slot = h < 6 || h >= 18 ? 2 : h < 12 ? 0 : 1;
  const day = (realDay - dayNum("2026-11-02")) * 3 + slot + 1;
  const hour = slot < 2 ? (h - (slot ? 12 : 6)) * 4 : h >= 18 ? (h - 18) * 3 : 18 + h;
  return {
    name: `\u7B2C${day}\u8C37\u65E5`,
    day,
    hour,
    night: h < 6,
    slot,
    season: seasonOf(worldDay(t)),
    realDay: worldDay(t),
    nextDay: realDay * 86400 - 8 * 3600 + (slot === 0 ? 12 : slot === 1 ? 18 : 30) * 3600
  };
}
var CROPS = [
  { id: "turnip", name: "\u5C0F\u767D\u841D\u535C", seasons: [0, 3], seed: 110, grow: 30, price: 540, eat: 8 },
  { id: "carrot", name: "\u80E1\u841D\u535C", seasons: [0, 2], seed: 180, grow: 60, price: 960, eat: 10 },
  { id: "wheat", name: "\u5C0F\u9EA6", seasons: [1, 2], seed: 220, grow: 120, price: 1400, eat: 6 },
  { id: "strawberry", name: "\u8349\u8393", seasons: [0], seed: 720, grow: 240, price: 3300, eat: 14, regrow: 180, times: 4 },
  { id: "tomato", name: "\u756A\u8304", seasons: [1], seed: 540, grow: 180, price: 2550, eat: 12, regrow: 150, times: 4 },
  { id: "corn", name: "\u7389\u7C73", seasons: [1, 2], seed: 900, grow: 360, price: 4800, eat: 14, regrow: 240, times: 3 },
  { id: "grape", name: "\u8461\u8404", seasons: [2], seed: 1080, grow: 360, price: 5700, eat: 12, regrow: 240, times: 4 },
  { id: "pumpkin", name: "\u5357\u74DC", seasons: [2, 3], seed: 1440, grow: 600, price: 9e3, eat: 20 },
  { id: "cabbage", name: "\u51AC\u767D\u83DC", seasons: [3], seed: 450, grow: 150, price: 2350, eat: 12 }
];
var ANIMALS = [
  {
    id: "chicken",
    name: "\u5C0F\u9E21",
    price: 12e3,
    every: 24,
    cap: 3,
    product: "egg",
    productName: "\u9E21\u86CB",
    productPrice: 1350,
    mature: 9,
    lifetime: 10,
    feed: 2,
    youngRate: 0.35,
    matureRate: 1.15,
    retiredRate: 0.45,
    products: [{ id: "egg", name: "\u9E21\u86CB", price: 1350, every: 1, fresh: 36 }, { id: "feather", name: "\u7FBD\u6BDB", price: 600, every: 4, fresh: 336 }]
  },
  {
    id: "duck",
    name: "\u9E2D\u5B50",
    price: 24e3,
    every: 30,
    cap: 3,
    product: "duckegg",
    productName: "\u9E2D\u86CB",
    productPrice: 2500,
    mature: 12,
    lifetime: 12,
    feed: 4,
    youngRate: 0.35,
    matureRate: 1.15,
    retiredRate: 0.45,
    products: [{ id: "duckegg", name: "\u9E2D\u86CB", price: 2500, every: 1, fresh: 36 }, { id: "duckdown", name: "\u9E2D\u7ED2", price: 1600, every: 4, fresh: 336 }]
  },
  {
    id: "cow",
    name: "\u5976\u725B",
    price: 6e4,
    every: 48,
    cap: 2,
    product: "milk",
    productName: "\u725B\u5976",
    productPrice: 5850,
    mature: 24,
    lifetime: 14,
    feed: 8,
    youngRate: 0.35,
    matureRate: 1.15,
    retiredRate: 0.45,
    products: [{ id: "milk", name: "\u725B\u5976", price: 5850, every: 1, fresh: 24 }, { id: "cream", name: "\u5976\u6CB9", price: 7800, every: 4, fresh: 24 }]
  },
  {
    id: "sheep",
    name: "\u7EF5\u7F8A",
    price: 9e4,
    every: 144,
    cap: 1,
    product: "wool",
    productName: "\u7F8A\u6BDB",
    productPrice: 19e3,
    mature: 30,
    lifetime: 8,
    feed: 12,
    youngRate: 0.35,
    matureRate: 1.15,
    retiredRate: 0.45,
    products: [{ id: "wool", name: "\u7F8A\u6BDB", price: 19e3, every: 1, fresh: 336 }, { id: "finewool", name: "\u7EC6\u7F8A\u6BDB", price: 24e3, every: 4, fresh: 336 }]
  },
  {
    id: "pig",
    name: "\u5C0F\u732A",
    price: 15e4,
    every: 72,
    cap: 1,
    product: "truffle",
    productName: "\u677E\u9732",
    productPrice: 13500,
    mature: 36,
    lifetime: 10,
    feed: 20,
    youngRate: 0.35,
    matureRate: 1.15,
    retiredRate: 0.45,
    products: [{ id: "truffle", name: "\u677E\u9732", price: 13500, every: 1, fresh: 36 }, { id: "white_truffle", name: "\u767D\u677E\u9732", price: 42e3, every: 4, fresh: 36 }]
  }
];
var FISH = [
  { id: "sardine", name: "\u6C99\u4E01\u9C7C", price: 1200, w: 40, rod: 1, seasons: [0, 1, 2, 3], hours: [0, 24] },
  { id: "carp", name: "\u9CA4\u9C7C", price: 2e3, w: 30, rod: 1, seasons: [0, 2, 3], hours: [0, 24] },
  { id: "bass", name: "\u9C88\u9C7C", price: 3600, w: 22, rod: 1, seasons: [1, 2], hours: [6, 20] },
  { id: "salmon", name: "\u4E09\u6587\u9C7C", price: 7200, w: 14, rod: 2, seasons: [2, 3], hours: [0, 24] },
  { id: "squid", name: "\u9C7F\u9C7C", price: 8800, w: 12, rod: 2, seasons: [3, 0], hours: [18, 30] },
  { id: "tuna", name: "\u91D1\u67AA\u9C7C", price: 14500, w: 8, rod: 3, seasons: [1, 3], hours: [0, 24] },
  { id: "puffer", name: "\u6CB3\u8C5A", price: 21e3, w: 6, rod: 3, seasons: [1, 0], hours: [12, 20] },
  { id: "whale", name: "\u8FF7\u4F60\u9CB8", price: 96e3, w: 1, rod: 4, seasons: [0, 1, 2, 3], hours: [0, 24] }
];
var ORES = [
  { id: "coal", name: "\u7164", price: 480, w: 40, floor: 1 },
  { id: "copper", name: "\u94DC\u77FF", price: 900, w: 35, floor: 1 },
  { id: "iron", name: "\u94C1\u77FF", price: 1900, w: 25, floor: 6 },
  { id: "amethyst", name: "\u7D2B\u6C34\u6676", price: 7200, w: 6, floor: 8 },
  { id: "gold", name: "\u91D1\u77FF", price: 4200, w: 14, floor: 12 },
  { id: "emerald", name: "\u7956\u6BCD\u7EFF", price: 12e3, w: 4, floor: 15 },
  { id: "ruby", name: "\u7EA2\u5B9D\u77F3", price: 18e3, w: 3, floor: 20 },
  { id: "diamond", name: "\u94BB\u77F3", price: 36e3, w: 1.2, floor: 25 }
];
var PICK_FLOOR = [0, 8, 16, 24, 30];
var SHOP = { feed: { name: "\u9972\u6599", price: 150 }, bait: { name: "\u9C7C\u9975", price: 400 } };
var BASE_PRICE = Object.fromEntries([
  ...CROPS.map((c) => [c.id, c.price]),
  ...ANIMALS.flatMap((a) => a.products.map((p) => [p.id, p.price])),
  ...FISH.map((f) => [f.id, f.price]),
  ...ORES.map((o) => [o.id, o.price])
]);
var ITEM_NAME = Object.fromEntries([
  ...CROPS.map((c) => [c.id, c.name]),
  ...ANIMALS.flatMap((a) => a.products.map((p) => [p.id, p.name])),
  ...FISH.map((f) => [f.id, f.name]),
  ...ORES.map((o) => [o.id, o.name]),
  ["feed", "\u9972\u6599"],
  ["bait", "\u9C7C\u9975"]
]);
var QUALITY = [1, 1.25, 1.5];
function worldHash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  h = Math.imul(h, 3266489909);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function weatherOf(day) {
  const r = worldHash("weather:" + day), s = seasonOf(day);
  if (s === 3) return r < 0.35 ? 3 : r < 0.5 ? 1 : r < 0.65 ? 2 : 0;
  return r < 0.3 ? 1 : r < 0.45 ? 2 : 0;
}
function marketFactor(item, day) {
  const d = dayNum(day);
  let walk = 0;
  const W = [1, 0.6, 0.35, 0.15];
  for (let k = 0; k < W.length; k++) walk += (worldHash(item + ":" + (d - k)) - 0.5) * W[k];
  const event = worldHash("event:" + item + ":" + d) < 0.04 ? worldHash("ev2:" + item + d) < 0.5 ? 0.7 : 1.45 : 1;
  const crop = CROPS.find((c) => c.id === item), season = seasonOf(day);
  const seasonal = crop ? crop.seasons.includes(season) ? 0.92 : 1.3 : 1;
  return Math.max(0.5, Math.min(2, Math.exp(walk * 0.7 - 0.03) * seasonal * event));
}
var supplyFactor = (soldYesterday, normal) => Math.max(0.6, Math.min(1.12, 1.12 - 0.5 * (soldYesterday / Math.max(1, normal))));
var NORMAL_VOLUME = 400;
function priceOf(item, day, soldYesterday = 0) {
  const base = BASE_PRICE[item];
  if (!base) return 0;
  return Math.max(1, Math.round(base * marketFactor(item, day) * supplyFactor(soldYesterday, NORMAL_VOLUME)));
}
var GOALS = [
  { id: "plant", name: "\u64AD\u79CD", n: 10 },
  { id: "water", name: "\u6D47\u6C34", n: 8 },
  { id: "harvest", name: "\u6536\u83B7\u4F5C\u7269", n: 8 },
  { id: "collect", name: "\u6536\u52A8\u7269\u4EA7\u7269", n: 3 },
  { id: "fish", name: "\u9493\u9C7C", n: 6 },
  { id: "mine", name: "\u6572\u77FF\u77F3", n: 15 },
  { id: "sold", name: "\u5356\u8D27\u6536\u5165", n: 3e4 }
];
var GOAL_REWARD = 6e3;
var GOAL_BONUS = 12e3;
var WELCOME_GIFT = 1e6;
function dailyGoals(day) {
  const pool = GOALS.map((g, i) => ({ g, r: worldHash("goal:" + day + ":" + i) })).sort((a, b) => a.r - b.r);
  return pool.slice(0, 3).map((x) => x.g);
}
function newWorld(t) {
  const s = {
    v: 2,
    en: WORLD.energyBase,
    enT: t,
    enDay: worldDay(t),
    plotN: WORLD.plotsStart,
    plots: Array(WORLD.plotsStart).fill(null),
    barnN: WORLD.barnStart,
    barn: [],
    traps: [],
    inv: { turnip: [4, 0, 0], feed: [6, 0, 0] },
    tools: { rod: 1, pick: 1, spr: 0, house: 0 },
    mine: { max: 1 },
    earn: { day: worldDay(t), amt: 0 },
    cnt: {},
    log: 0
  };
  stockInit(s, t, false);
  return s;
}
var energyMax = (s) => WORLD.energyBase + WORLD.energyPerHouse * s.tools.house;
function refresh(s, t) {
  if (autoDue(s, t)) return s;
  return refreshNow(s, t);
}
function refreshNow(s, t) {
  stockExpire(s, t);
  for (const pen of s.barn) if (pen.life) settleAnimal(pen, t, (id, n) => recordExpired(s, id, n, t));
  const day = worldDay(t), max = energyMax(s);
  if (s.en >= max) s.enT = Math.max(s.enT, t);
  else {
    const n = Math.floor((t - s.enT) / WORLD.regen);
    if (n > 0) {
      s.en = Math.min(max, s.en + n);
      s.enT = s.en >= max ? t : s.enT + n * WORLD.regen;
    }
  }
  if (s.enDay !== day) {
    s.enDay = day;
    s.cnt = {};
  }
  if (s.earn.day !== day) s.earn = { day, amt: 0 };
  return s;
}
var sprinkled = (s, i) => i < WORLD.sprCover[s.tools.spr];
function cropStage(p, t, auto = false) {
  const crop = CROPS.find((c) => c.id === p.c);
  if (!crop.seasons.includes(seasonOf(worldDay(t)))) return { stage: -1, left: 0, total: 1, crop };
  const base = (p.h && crop.regrow ? crop.regrow : crop.grow) * 60;
  const total = base * (auto ? 0.6 : 1) - p.g, el = t - p.t;
  if (el >= total) {
    const ripeAt = p.t + total, age = valleyActiveSeconds(ripeAt, t);
    const stale = age >= 24 * 3600, spoiled = age >= 24 * 3600 + stockShelf(crop.id, seasonOf(worldDay(ripeAt)));
    return { stage: spoiled ? -1 : 3, left: 0, total, crop, stale, spoiled, ripeAt };
  }
  return { stage: Math.min(2, Math.floor(el / total * 3)), left: total - el, total, crop };
}
function animalInit(a, t, graceAt = t) {
  if (a.life) return;
  const def = ANIMALS.find((x) => x.id === a.k);
  const n = Math.max(0, Math.min(def.cap, Math.floor((Math.min(t, a.f + 86400) - a.p) / (def.every * 60))));
  a.life = {
    at: t,
    grown: def.mature * 3600,
    used: 0,
    progress: 0,
    food: Math.max(0, a.f + 86400 - t),
    batches: Array.from({ length: n }, (_, i) => ({
      bid: `legacy:${a.p}:${i}`,
      id: def.product,
      n: WORLD.animalYield,
      at: t,
      expires: stockShelf(def.product, seasonOf(worldDay(t))) ? Math.max(graceAt + 3 * 86400, valleyAfterActive(t, stockShelf(def.product, seasonOf(worldDay(t))))) : 0
    }))
  };
}
function settleAnimal(a, t, expired = () => {
}) {
  const l = a.life, def = ANIMALS.find((x) => x.id === a.k);
  if (t < l.at) return;
  const clear = (at) => {
    l.batches = l.batches.filter((b) => {
      if (!b.expires || b.expires > at) return true;
      expired(b.id, Math.max(0, b.n - (a.social?.batches?.[b.bid]?.n || 0)));
      return false;
    });
  };
  const fed = Math.min(l.food, valleyActiveSeconds(l.at, t)), grow = Math.min(def.mature * 3600 - l.grown, fed);
  let cursor = valleyAfterActive(l.at, grow);
  const fedUntil = valleyAfterActive(l.at, fed);
  l.grown += grow;
  l.food -= fed;
  clear(cursor);
  while (l.grown >= def.mature * 3600 && l.used < def.lifetime && cursor < fedUntil) {
    if (l.batches.length >= def.cap) {
      l.progress = 0;
      const expires = Math.min(...l.batches.map((b) => b.expires || Infinity));
      if (expires > fedUntil) break;
      cursor = Math.max(cursor, expires);
      clear(cursor);
    }
    const need = def.every * 60 - l.progress, available = valleyActiveSeconds(cursor, fedUntil);
    if (available < need) {
      l.progress += available;
      break;
    }
    cursor = valleyAfterActive(cursor, need);
    clear(cursor);
    l.used++;
    l.progress = 0;
    const product = def.products.find((p) => p.every > 1 && l.used % p.every === 0) || def.products[0];
    l.batches.push({
      bid: `${a.k}:${l.used}:${cursor}`,
      id: product.id,
      n: WORLD.animalYield,
      at: cursor,
      expires: product.fresh ? valleyAfterActive(cursor, product.fresh * 3600) : 0
    });
  }
  if (l.batches.length >= def.cap || l.used >= def.lifetime) l.progress = 0;
  clear(t);
  l.at = t;
  a.p = t;
}
function animalView(a, t) {
  const copy = { ...a, life: a.life ? { ...a.life, batches: a.life.batches.map((b) => ({ ...b })) } : void 0 };
  animalInit(copy, t);
  settleAnimal(copy, t);
  return copy.life;
}
function animalValue(a, def, l) {
  const basis = (a.cashBasis || 0) + (a.creditBasis || 0);
  const cashRatio = a.cashBasis === void 0 ? 1 : basis > 0 ? Math.max(0, Math.min(1, a.cashBasis / basis)) : 0;
  const rate = l.grown < def.mature * 3600 ? def.youngRate : def.retiredRate + (def.matureRate - def.retiredRate) * (def.lifetime - l.used) / def.lifetime;
  return Math.round(def.price * rate * cashRatio);
}
function animalSaleValue(a, t) {
  const def = ANIMALS.find((x) => x.id === a.k), l = animalView(a, t);
  return animalValue(a, def, l);
}
function animalReady(a, t) {
  const def = ANIMALS.find((x) => x.id === a.k), l = animalView(a, t);
  const stage = l.grown < def.mature * 3600 ? "young" : l.used >= def.lifetime ? "retired" : "mature";
  const matureActiveLeft = Math.max(0, def.mature * 3600 - l.grown), activeLeft = matureActiveLeft + def.every * 60 - l.progress;
  return {
    def,
    fed: l.food > 0,
    n: l.batches.length,
    ready: l.batches.length > 0,
    left: stage === "retired" || l.batches.length >= def.cap ? 0 : valleyAfterActive(t, activeLeft) - t,
    stage,
    matureLeft: valleyAfterActive(t, matureActiveLeft) - t,
    matureActiveLeft,
    remaining: def.lifetime - l.used,
    sellPrice: animalValue(a, def, l),
    feedLeft: l.food,
    pendingMigration: !a.life,
    batches: l.batches
  };
}
function trapReady(tr, t, windy = false) {
  const n = Math.min(WORLD.trapCap, Math.floor((t - tr.p) / (WORLD.trapEvery * 60)) * (windy ? 2 : 1));
  return { n: Math.min(WORLD.trapCap, n), left: Math.max(0, WORLD.trapEvery * 60 - (t - tr.p) % (WORLD.trapEvery * 60)) };
}
function stockShelf(id, season) {
  const crop = CROPS.find((c) => c.id === id);
  if (crop) {
    const days = ["wheat", "pumpkin"].includes(id) ? [5, 4, 5, 7] : ["strawberry", "grape"].includes(id) ? [2, 1.5, 2, 3] : [3, 2, 3, 5];
    return days[season] * 86400;
  }
  const product = ANIMALS.flatMap((a) => a.products).find((p) => p.id === id);
  return product ? product.fresh * 3600 : FISH.some((f) => f.id === id) ? 24 * 3600 : 0;
}
function stockInit(s, t, legacy = true, graceAt = t) {
  if (s.freshness) return;
  s.freshness = { v: 1, migratedAt: graceAt, batches: {}, expired: { at: 0, items: {} } };
  const season = seasonOf(worldDay(t));
  for (const [id, qs] of Object.entries(s.inv)) {
    const shelf = stockShelf(id, season);
    if (!shelf) continue;
    const expires = Math.max(legacy ? graceAt + 3 * 86400 : 0, valleyAfterActive(t, shelf));
    s.freshness.batches[id] = qs.flatMap((n, q) => n > 0 ? [[q, n, t, expires, season]] : []);
  }
}
function recordExpired(s, id, n, t) {
  if (!s.freshness || !n) return;
  const e = s.freshness.expired;
  e.at = Math.max(e.at, t);
  e.items[id] = (e.items[id] || 0) + n;
}
function stockCompact(s) {
  const fresh = s.freshness;
  if (!fresh) return;
  let count = Object.values(fresh.batches).reduce((n, bs) => n + bs.length, 0);
  const grace = fresh.migratedAt + 3 * 86400;
  while (count > WORLD.stockBatches) {
    let best;
    for (const bs of Object.values(fresh.batches)) {
      const groups = Array.from({ length: 6 }, () => []);
      for (const b of bs) groups[b[0] + (!b[3] || b[3] >= grace ? 3 : 0)].push(b);
      for (const group of groups) {
        group.sort((a, b) => (a[3] || Infinity) - (b[3] || Infinity) || a[2] - b[2]);
        for (let i = 1; i < group.length; i++) {
          const a = group[i - 1], b = group[i], gap = a[3] === b[3] ? 0 : (b[3] || Infinity) - (a[3] || Infinity);
          if (!best || gap < best.gap) best = { bs, a, b, gap };
        }
      }
    }
    if (!best) break;
    best.a[1] += best.b[1];
    best.a[2] = Math.min(best.a[2], best.b[2]);
    best.bs.splice(best.bs.indexOf(best.b), 1);
    count--;
  }
}
function stockExpire(s, t) {
  if (!s.freshness) return;
  for (const [id, bs] of Object.entries(s.freshness.batches)) {
    const kept = bs.filter((b) => {
      if (!b[3] || b[3] > t) return true;
      const qs = s.inv[id], n = Math.min(b[1], qs?.[b[0]] || 0);
      if (qs) {
        qs[b[0]] -= n;
        if (!qs.some(Boolean)) delete s.inv[id];
      }
      recordExpired(s, id, n, t);
      return false;
    });
    if (kept.length) s.freshness.batches[id] = kept;
    else delete s.freshness.batches[id];
  }
  stockCompact(s);
}
function worldLifeInit(s, t, graceAt = t) {
  stockInit(s, t, true, graceAt);
  for (const pen of s.barn) animalInit(pen, t, graceAt);
}
function worldStockAdd(s, id, q, n, t, source) {
  if (!(Object.hasOwn(ITEM_NAME, id) && Number.isInteger(q) && q >= 0 && q <= 2 && Number.isSafeInteger(n) && n > 0 && Number.isFinite(t))) return false;
  stockInit(s, t);
  stockExpire(s, t);
  const qs = Object.hasOwn(s.inv, id) ? s.inv[id] : [0, 0, 0];
  if (!Number.isSafeInteger(qs[q] + n)) return false;
  const season = source?.season ?? seasonOf(worldDay(t)), shelf = stockShelf(id, season);
  if (shelf) {
    const at = source?.at ?? t, expires = source?.expires ?? valleyAfterActive(t, shelf);
    if (!Number.isFinite(at) || !Number.isFinite(expires) || expires <= t) return false;
    const bs = s.freshness.batches[id] ||= [];
    const bucket = (shelf >= 14 * 86400 ? 48 : CROPS.some((c) => c.id === id) ? 6 : 1) * 3600;
    const b = bs.find((b2) => b2[0] === q && b2[4] === season && (!source || b2[2] === at && b2[3] === expires) && Math.floor(b2[2] / bucket) === Math.floor(at / bucket) && Math.abs(b2[3] - expires) < bucket);
    if (b) {
      b[1] += n;
      b[2] = Math.min(b[2], at);
      b[3] = Math.min(b[3], expires);
    } else bs.push([q, n, at, expires, season]);
  }
  s.inv[id] = qs;
  qs[q] += n;
  stockCompact(s);
  return true;
}
function worldStockTake(s, id, q, n, t) {
  if (!(Object.hasOwn(ITEM_NAME, id) && Number.isInteger(q) && q >= 0 && q <= 2 && Number.isSafeInteger(n) && n > 0 && Number.isFinite(t))) return false;
  stockInit(s, t);
  stockExpire(s, t);
  const qs = Object.hasOwn(s.inv, id) ? s.inv[id] : null;
  if (!qs || qs[q] < n) return false;
  let left = n;
  const bs = s.freshness.batches[id];
  if (bs) {
    bs.sort((a, b) => (a[3] || Infinity) - (b[3] || Infinity) || a[2] - b[2]);
    for (const b of bs) if (b[0] === q) {
      const used = Math.min(left, b[1]);
      b[1] -= used;
      left -= used;
    }
    s.freshness.batches[id] = bs.filter((b) => b[1] > 0);
    if (!s.freshness.batches[id].length) delete s.freshness.batches[id];
  }
  qs[q] -= n;
  if (!qs.some(Boolean)) delete s.inv[id];
  return true;
}
function freshnessSummary(s, t) {
  const batches = Object.entries(s.freshness?.batches || {}).flatMap(([id, bs]) => bs.map((b) => ({ id, name: ITEM_NAME[id], q: b[0], n: b[1], at: b[2], expires: b[3], season: b[4], left: Math.max(0, b[3] - t) }))).sort((a, b) => a.expires - b.expires);
  return {
    pendingMigration: !s.freshness,
    migratedAt: s.freshness?.migratedAt,
    batches,
    soon: batches.filter((b) => b.expires > t && valleyActiveSeconds(t, b.expires) <= 24 * 3600),
    expired: s.freshness?.expired || { at: 0, items: {} }
  };
}
var pickWeighted = (pool, w, r) => {
  let x = r * w.reduce((a, b) => a + b, 0);
  for (let k = 0; k < pool.length; k++) {
    x -= w[k];
    if (x < 0) return pool[k];
  }
  return pool[pool.length - 1];
};
function fishPool(s, t, maxRod = s.tools.rod) {
  const season = seasonOf(worldDay(t)), h = hourOf(t);
  return FISH.filter((f) => f.rod <= maxRod && f.seasons.includes(season) && (h >= f.hours[0] && h < f.hours[1] || h + 24 >= f.hours[0] && h + 24 < f.hours[1]));
}
function applyActions(s, actions, ctx) {
  worldLifeInit(s, ctx.t);
  refreshNow(s, ctx.t);
  const out = [];
  let spend = 0, earn = 0, xp = 0;
  const weather = weatherOf(ctx.day);
  const coinsLeft = () => ctx.coins - spend + earn;
  const buildPay = (price) => {
    const available = Number.isSafeInteger(s.constructionCredit) ? Math.max(0, s.constructionCredit) : 0;
    const credit = Math.min(price, available), cash = price - credit;
    if (coinsLeft() < cash) return null;
    if (credit) s.constructionCredit = available - credit;
    spend += cash;
    return { cash, credit };
  };
  const fail = (a, msg) => out.push({ ok: false, a, msg });
  const count = (k) => s.cnt[k] || 0;
  for (const act of actions.slice(0, WORLD.maxActions)) {
    const a = String(act.a), i = Math.floor(Number(act.i));
    const cost = (WORLD.cost[a] ?? 0) + (ctx.auto && (a === "fish" || a === "mine") ? AUTO.surcharge : 0);
    if (cost && s.en < cost) {
      fail(a, "\u4F53\u529B\u4E0D\u8DB3");
      continue;
    }
    if (a === "plant") {
      const crop = CROPS.find((c) => c.id === act.c);
      if (!crop || !(i >= 0 && i < s.plotN) || s.plots[i]) {
        fail(a, "\u8FD9\u5757\u5730\u4E0D\u80FD\u79CD");
        continue;
      }
      if (!crop.seasons.includes(seasonOf(ctx.day))) {
        fail(a, `${crop.name}\u4E0D\u662F\u8FD9\u4E2A\u5B63\u8282\u7684\u4F5C\u7269`);
        continue;
      }
      if (coinsLeft() < crop.seed) {
        fail(a, "D\u5E01\u4E0D\u8DB3");
        continue;
      }
      spend += crop.seed;
      s.en -= cost;
      s.plots[i] = { c: crop.id, t: ctx.t, w: 0, g: 0, h: 0 };
      s.cnt.plant = count("plant") + 1;
      out.push({ ok: true, a, spend: crop.seed });
    } else if (a === "water") {
      const p = s.plots[i];
      if (!p) {
        fail(a, "\u6CA1\u6709\u4F5C\u7269");
        continue;
      }
      if (sprinkled(s, i) || weather === 1) {
        fail(a, "\u5DF2\u7ECF\u81EA\u52A8\u6D47\u8FC7\u4E86");
        continue;
      }
      const st = cropStage(p, ctx.t);
      if (st.stage < 0 || st.stage >= 3 || p.w > st.stage) {
        fail(a, "\u8FD9\u9636\u6BB5\u5DF2\u7ECF\u6D47\u8FC7\u4E86");
        continue;
      }
      s.en -= cost;
      p.w++;
      s.cnt.water = count("water") + 1;
      p.g += Math.floor(st.left * 0.25);
      out.push({ ok: true, a });
    } else if (a === "harvest") {
      const p = s.plots[i];
      const auto = !!p && (sprinkled(s, i) || weather === 1);
      const st = p && cropStage(p, ctx.t, auto);
      if (!p || !st || st.stage < 3) {
        fail(a, st?.spoiled ? "\u4F5C\u7269\u653E\u7F6E\u592A\u4E45\uFF0C\u5DF2\u7ECF\u5931\u6548\uFF0C\u8BF7\u6E05\u7406" : st?.stage === -1 ? "\u8FC7\u5B63\u67AF\u840E\u4E86\uFF0C\u6E05\u7406\u6389\u5427" : "\u8FD8\u6CA1\u6210\u719F");
        continue;
      }
      const w = auto ? 3 : p.w;
      const roll = ctx.rand(), gold = 0.05 + 0.1 * w, silver = 0.2 + 0.08 * w;
      const q = Math.max(0, (ctx.auto ? 0 : roll < gold ? 2 : roll < gold + silver ? 1 : 0) - (st.stale ? 1 : 0));
      const n = ctx.auto ? 1 : 1 + (ctx.rand() < 0.2 + 0.08 * w ? 1 : 0);
      const kept = Math.max(0, n - Math.max(0, p.social?.taken[p.c] || 0));
      delete p.social;
      if (kept) worldStockAdd(s, p.c, q, kept, ctx.t);
      s.en -= cost;
      xp += WORLD.xp.harvest;
      s.cnt.harvest = count("harvest") + 1;
      const crop = st.crop;
      if (crop.regrow && p.h + 1 < (crop.times || 1)) s.plots[i] = { c: p.c, t: ctx.t, w: 0, g: 0, h: p.h + 1 };
      else s.plots[i] = null;
      out.push({ ok: true, a, got: kept ? [{ id: p.c, q, n: kept }] : [] });
    } else if (a === "clear") {
      if (!s.plots[i]) {
        fail(a, "\u7A7A\u5730");
        continue;
      }
      s.plots[i] = null;
      s.en -= cost;
      out.push({ ok: true, a });
    } else if (a === "buyAnimal") {
      const def = ANIMALS.find((x) => x.id === act.k);
      if (!def || s.barn.length >= s.barnN) {
        fail(a, "\u755C\u680F\u5DF2\u6EE1");
        continue;
      }
      const pay = buildPay(def.price);
      if (!pay) {
        fail(a, "D\u5E01\u4E0D\u8DB3");
        continue;
      }
      s.barn.push({
        k: def.id,
        f: ctx.t,
        p: ctx.t,
        m: 60,
        cashBasis: pay.cash,
        creditBasis: pay.credit,
        life: { at: ctx.t, grown: 0, used: 0, progress: 0, food: 24 * 3600, batches: [] }
      });
      out.push({ ok: true, a, spend: pay.cash, credit: pay.credit });
    } else if (a === "sellAnimal") {
      const pen = s.barn[i];
      if (!pen) {
        fail(a, "\u6CA1\u6709\u8FD9\u53EA\u52A8\u7269");
        continue;
      }
      const st = animalReady(pen, ctx.t), value = st.sellPrice;
      if (st.ready) {
        fail(a, "\u5148\u6536\u53D6\u7A9D\u91CC\u7684\u4EA7\u7269\u518D\u51FA\u552E");
        continue;
      }
      if (s.earn.amt + earn + value > WORLD.dailyEarn) {
        fail(a, "\u4ECA\u5929\u6536\u5165\u5DF2\u8FBE\u4E0A\u9650");
        continue;
      }
      s.barn.splice(i, 1);
      earn += value;
      out.push({ ok: true, a, earn: value });
    } else if (a === "feed") {
      const pen = s.barn[i];
      if (!pen) {
        fail(a, "\u6CA1\u6709\u8FD9\u53EA\u52A8\u7269");
        continue;
      }
      const st = animalReady(pen, ctx.t);
      if (st.stage === "retired") {
        fail(a, "\u5DF2\u7ECF\u9000\u4F11\uFF0C\u4E0D\u9700\u8981\u518D\u5582\u98DF");
        continue;
      }
      if (st.feedLeft > 16 * 3600) {
        fail(a, "\u8FD8\u9971\u7740\u5462");
        continue;
      }
      if (!worldStockTake(s, "feed", 0, st.def.feed, ctx.t)) {
        fail(a, `\u9700\u8981 ${st.def.feed} \u4EFD\u9972\u6599`);
        continue;
      }
      s.en -= cost;
      pen.f = ctx.t;
      pen.life.food = 24 * 3600;
      pen.m = Math.min(100, pen.m + 8);
      out.push({ ok: true, a });
    } else if (a === "pet") {
      const pen = s.barn[i];
      if (!pen) {
        fail(a, "\u6CA1\u6709\u8FD9\u53EA\u52A8\u7269");
        continue;
      }
      if (count("pet" + i) >= 1) {
        fail(a, "\u4ECA\u5929\u5DF2\u7ECF\u6478\u8FC7\u4E86");
        continue;
      }
      s.cnt["pet" + i] = 1;
      pen.m = Math.min(100, pen.m + 6);
      out.push({ ok: true, a });
    } else if (a === "collect") {
      const pen = s.barn[i];
      if (!pen) {
        fail(a, "\u6CA1\u6709\u8FD9\u53EA\u52A8\u7269");
        continue;
      }
      const st = animalReady(pen, ctx.t);
      if (!st.ready) {
        fail(a, st.stage === "retired" ? "\u5DF2\u7ECF\u9000\u4F11" : !st.fed ? "\u997F\u4E86\uFF0C\u5148\u5582\u98DF" : st.stage === "young" ? "\u8FD8\u5728\u6210\u957F" : "\u8FD8\u6CA1\u4EA7\u51FA");
        continue;
      }
      const got = [];
      for (const batch of pen.life.batches) {
        const n = Math.max(0, batch.n - Math.max(0, pen.social?.batches?.[batch.bid]?.n || 0));
        if (!n) continue;
        const q = ctx.auto ? 0 : ctx.rand() < pen.m / 250 ? 2 : ctx.rand() < pen.m / 120 ? 1 : 0;
        worldStockAdd(s, batch.id, q, n, ctx.t, { at: batch.at, expires: batch.expires });
        got.push({ id: batch.id, q, n });
      }
      pen.life.batches = [];
      delete pen.social;
      pen.m = Math.max(20, pen.m - 2);
      xp += WORLD.xp.collect;
      s.cnt.collect = count("collect") + 1;
      out.push({ ok: true, a, got });
    } else if (a === "buyTrap") {
      if (s.traps.length >= WORLD.trapMax) {
        fail(a, "\u87F9\u7B3C\u5DF2\u7ECF\u653E\u6EE1");
        continue;
      }
      const price = WORLD.trapPrice(s.traps.length + 1);
      if (coinsLeft() < price) {
        fail(a, "D\u5E01\u4E0D\u8DB3");
        continue;
      }
      spend += price;
      s.traps.push({ p: ctx.t });
      out.push({ ok: true, a, spend: price });
    } else if (a === "trap") {
      const tr = s.traps[i];
      if (!tr) {
        fail(a, "\u6CA1\u6709\u8FD9\u4E2A\u87F9\u7B3C");
        continue;
      }
      const st = trapReady(tr, ctx.t, weather === 2);
      if (!st.n) {
        fail(a, "\u7B3C\u5B50\u91CC\u8FD8\u662F\u7A7A\u7684");
        continue;
      }
      const pool = fishPool(s, ctx.t, 1), got = [];
      for (let k = 0; k < st.n; k++) {
        const f = pickWeighted(pool, pool.map((x) => x.w), ctx.rand());
        worldStockAdd(s, f.id, 0, 1, ctx.t);
        got.push({ id: f.id, q: 0, n: 1 });
      }
      tr.p = st.n >= WORLD.trapCap ? ctx.t : tr.p + Math.ceil(st.n / (weather === 2 ? 2 : 1)) * WORLD.trapEvery * 60;
      out.push({ ok: true, a, got });
    } else if (a === "fish") {
      if (count("fish") >= WORLD.daily.fish) {
        fail(a, `\u4ECA\u5929\u5DF2\u7ECF\u9493\u4E86 ${WORLD.daily.fish} \u7AFF\uFF0C\u9C7C\u90FD\u8EB2\u8D77\u6765\u4E86`);
        continue;
      }
      const useBait = !!act.bait && worldStockTake(s, "bait", 0, 1, ctx.t);
      s.en -= cost;
      xp += WORLD.xp.fish;
      s.cnt.fish = count("fish") + 1;
      const pool = fishPool(s, ctx.t);
      const miss = Math.max(0.05, 0.22 - 0.04 * s.tools.rod - (useBait ? 0.08 : 0) - (weather === 1 ? 0.05 : 0));
      if (ctx.rand() < miss) {
        out.push({ ok: true, a, got: [], msg: "\u9C7C\u8DD1\u6389\u4E86" });
        continue;
      }
      const boost = (useBait ? 2 : 1) * (weather === 1 ? 1.5 : 1);
      const pick = pickWeighted(pool, pool.map((f) => f.w * (f.price >= 9e3 ? boost : 1)), ctx.rand());
      const q = ctx.auto ? 0 : ctx.rand() < 0.08 + 0.05 * s.tools.rod ? 2 : ctx.rand() < 0.28 ? 1 : 0;
      worldStockAdd(s, pick.id, q, 1, ctx.t);
      out.push({ ok: true, a, got: [{ id: pick.id, q, n: 1 }] });
    } else if (a === "mine") {
      if (count("mine") >= WORLD.daily.mine) {
        fail(a, `\u4ECA\u5929\u5DF2\u7ECF\u6316\u4E86 ${WORLD.daily.mine} \u4E0B\uFF0C\u77FF\u6D1E\u8981\u4F11\u606F`);
        continue;
      }
      const floor = Math.max(1, Math.min(Number(act.f) || 1, s.mine.max, PICK_FLOOR[s.tools.pick]));
      s.en -= cost;
      xp += WORLD.xp.mine;
      s.cnt.mine = count("mine") + 1;
      const pool = ORES.filter((o) => o.floor <= floor);
      const got = [];
      const hits = 1 + (ctx.rand() < 0.25 + 0.05 * s.tools.pick ? 1 : 0);
      for (let k = 0; k < hits; k++) {
        const pick = pickWeighted(pool, pool.map((o) => o.w * (o.price >= 12e3 && weather === 3 ? 1.6 : 1) * (1 + (floor - o.floor) / 40)), ctx.rand());
        worldStockAdd(s, pick.id, 0, 1, ctx.t);
        got.push({ id: pick.id, q: 0, n: 1 });
      }
      let msg;
      if (floor === s.mine.max && s.mine.max < PICK_FLOOR[s.tools.pick] && ctx.rand() < 0.25) {
        s.mine.max++;
        msg = `\u53D1\u73B0\u901A\u5F80\u7B2C ${s.mine.max} \u5C42\u7684\u68AF\u5B50\uFF01`;
      }
      out.push({ ok: true, a, got, msg });
    } else if (a === "eat") {
      const crop = CROPS.find((c) => c.id === act.id), q = Math.floor(Number(act.q)) || 0;
      if (s.en >= energyMax(s)) {
        fail(a, "\u4F53\u529B\u662F\u6EE1\u7684");
        continue;
      }
      if (!crop || !(q >= 0 && q <= 2) || !worldStockTake(s, crop.id, q, 1, ctx.t)) {
        fail(a, "\u6CA1\u6709\u8FD9\u4E2A");
        continue;
      }
      s.en = Math.min(energyMax(s), s.en + Math.round(crop.eat * QUALITY[q]));
      out.push({ ok: true, a });
    } else if (a === "rest") {
      if (count("rest") >= WORLD.daily.rest) {
        fail(a, `\u4ECA\u5929\u5DF2\u7ECF\u5403\u8FC7 ${WORLD.daily.rest} \u6B21\u4E86`);
        continue;
      }
      if (s.en >= energyMax(s)) {
        fail(a, "\u4F53\u529B\u662F\u6EE1\u7684");
        continue;
      }
      s.cnt.rest = count("rest") + 1;
      s.en = energyMax(s);
      s.enT = ctx.t;
      out.push({ ok: true, a });
    } else if (a === "coffee") {
      if (count("coffee") >= WORLD.daily.coffee) {
        fail(a, `\u6BCF\u5929\u6700\u591A\u559D ${WORLD.daily.coffee} \u676F`);
        continue;
      }
      if (coinsLeft() < WORLD.coffee.price) {
        fail(a, "D\u5E01\u4E0D\u8DB3");
        continue;
      }
      spend += WORLD.coffee.price;
      s.cnt.coffee = count("coffee") + 1;
      s.en += WORLD.coffee.energy;
      out.push({ ok: true, a, spend: WORLD.coffee.price });
    } else if (a === "buy") {
      const item = Object.hasOwn(SHOP, String(act.id)) ? SHOP[String(act.id)] : null, n = Math.max(1, Math.min(99, Math.floor(Number(act.n)) || 1));
      if (!item) {
        fail(a, "\u6CA1\u6709\u8FD9\u4E2A\u5546\u54C1");
        continue;
      }
      if (coinsLeft() < item.price * n) {
        fail(a, "D\u5E01\u4E0D\u8DB3");
        continue;
      }
      spend += item.price * n;
      worldStockAdd(s, String(act.id), 0, n, ctx.t);
      out.push({ ok: true, a, spend: item.price * n });
    } else if (a === "sell") {
      const id = String(act.id), q = Math.floor(Number(act.q)) || 0, n = Math.max(1, Math.min(999, Math.floor(Number(act.n)) || 1));
      const price = Object.hasOwn(BASE_PRICE, id) && Object.hasOwn(ctx.prices, id) ? Number(ctx.prices[id]) : 0;
      if (!(price > 0) || !(q >= 0 && q <= 2) || !Object.hasOwn(s.inv, id) || !(s.inv[id][q] >= n)) {
        fail(a, "\u5E93\u5B58\u4E0D\u8DB3");
        continue;
      }
      const value = Math.round(Math.round(price * QUALITY[q]) * n * (ctx.auto ? 1 - AUTO.fee : 1));
      if (s.earn.amt + earn + value > WORLD.dailyEarn) {
        fail(a, `\u4ECA\u5929\u5356\u51FA\u6240\u5F97\u5DF2\u8FBE\u4E0A\u9650 ${WORLD.dailyEarn.toLocaleString()} D\u5E01\uFF0C\u660E\u5929\u518D\u5356`);
        continue;
      }
      worldStockTake(s, id, q, n, ctx.t);
      earn += value;
      s.cnt.sold = count("sold") + value;
      out.push({ ok: true, a, earn: value });
    } else if (a === "expand") {
      const kind = act.k;
      if (kind === "plot") {
        if (s.plotN >= WORLD.plotsMax) {
          fail(a, "\u5DF2\u7ECF\u6700\u5927");
          continue;
        }
        const price = WORLD.plotPrice(s.plotN + 1);
        const pay = buildPay(price);
        if (!pay) {
          fail(a, "D\u5E01\u4E0D\u8DB3");
          continue;
        }
        s.plotN++;
        s.plots.push(null);
        out.push({ ok: true, a, spend: pay.cash, credit: pay.credit });
      } else if (kind === "barn") {
        if (s.barnN >= WORLD.barnMax) {
          fail(a, "\u5DF2\u7ECF\u6700\u5927");
          continue;
        }
        const price = WORLD.barnPrice(s.barnN + 1);
        const pay = buildPay(price);
        if (!pay) {
          fail(a, "D\u5E01\u4E0D\u8DB3");
          continue;
        }
        s.barnN++;
        out.push({ ok: true, a, spend: pay.cash, credit: pay.credit });
      } else fail(a, "\u65E0\u6548");
    } else if (a === "upgrade") {
      const tool = String(act.k);
      const price = upgradePrice(s, tool);
      if (price == null) {
        fail(a, "\u5DF2\u7ECF\u6EE1\u7EA7");
        continue;
      }
      const pay = buildPay(price);
      if (!pay) {
        fail(a, "D\u5E01\u4E0D\u8DB3");
        continue;
      }
      if (tool === "house") {
        s.tools.house++;
        s.en += WORLD.energyPerHouse;
      } else s.tools[tool]++;
      out.push({ ok: true, a, spend: pay.cash, credit: pay.credit });
    } else if (a === "goal") {
      const k = Math.floor(Number(act.k)), goals = dailyGoals(ctx.day);
      if (!(k >= 0 && k <= 3) || count("goal" + k)) {
        fail(a, "\u5DF2\u7ECF\u9886\u8FC7\u4E86");
        continue;
      }
      if (k < 3 ? count(goals[k].id) < goals[k].n : goals.some((g, j) => !count("goal" + j))) {
        fail(a, "\u8FD8\u6CA1\u5B8C\u6210");
        continue;
      }
      const value = k < 3 ? GOAL_REWARD : GOAL_BONUS;
      if (s.earn.amt + earn + value > WORLD.dailyEarn) {
        fail(a, "\u4ECA\u5929\u6536\u5165\u5DF2\u8FBE\u4E0A\u9650");
        continue;
      }
      s.cnt["goal" + k] = 1;
      earn += value;
      out.push({ ok: true, a, earn: value });
    } else fail(a, "\u672A\u77E5\u64CD\u4F5C");
  }
  const seen = s.seen ||= [];
  for (const o of out) for (const g of o.got || []) if (!seen.includes(g.id)) {
    seen.push(g.id);
    g.new = 1;
  }
  s.earn.amt += earn;
  s.log++;
  return { out, spend, earn, xp };
}
function upgradePrice(s, tool) {
  if (!["rod", "pick", "spr", "house"].includes(tool)) return null;
  if (tool === "house") return s.tools.house < WORLD.houseMax ? WORLD.housePrice[s.tools.house] : null;
  const table = WORLD.tools[tool], lv = s.tools[tool];
  return table && lv != null && lv < table.length ? table[lv] : null;
}
var AUTO = { every: 4 * 3600, maxBack: 48 * 3600, maxVisits: 12, fee: 0.2, surcharge: 2, budgetMax: 5e6, hire: 15e4, wage: 3e3 };
var AUTO_DEFAULT = { on: false, crop: "best", water: true, feed: true, fishPct: 50, keep: 30, sell: true, minPct: 90, budget: 1e5 };
function autoConfig(raw, prev = AUTO_DEFAULT) {
  const r = raw && typeof raw === "object" ? raw : {};
  const num = (v, lo, hi, d) => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d;
  };
  const bool = (v, d) => typeof v === "boolean" ? v : d;
  const crop = typeof r.crop === "string" && (r.crop === "best" || r.crop === "none" || CROPS.some((c) => c.id === r.crop)) ? r.crop : prev.crop;
  return { on: bool(r.on, prev.on), crop, water: bool(r.water, prev.water), feed: bool(r.feed, prev.feed), fishPct: num(r.fishPct, 0, 100, prev.fishPct), keep: num(r.keep, 0, 300, prev.keep), sell: bool(r.sell, prev.sell), minPct: num(r.minPct, 0, 200, prev.minPct), budget: num(r.budget, 0, AUTO.budgetMax, prev.budget) };
}
function bestCrop(season, gapMin = AUTO.every / 60) {
  const v = (c) => (c.price * 1.4 * (c.regrow ? Math.min(c.times || 1, 3) : 1) - c.seed) / Math.max(gapMin, c.grow * 0.6);
  return CROPS.filter((c) => c.seasons.includes(season)).sort((a, b) => v(b) - v(a))[0];
}
var autoDue = (s, now) => !!s.auto?.on && now - s.auto.t >= AUTO.every;
function autoSettle(s, ctx) {
  const a = s.auto;
  if (!a?.on || ctx.now - a.t < AUTO.every) return null;
  let spend = 0, earn = 0, xp = 0, visits = 0, wage = 0, skipped = 0;
  const got = {}, acts = {}, soldN = {};
  const priceCache = /* @__PURE__ */ new Map();
  const pricesFor = (day) => {
    if (day === ctx.today) return ctx.prices;
    if (!priceCache.has(day)) priceCache.set(day, Object.fromEntries(Object.keys(BASE_PRICE).map((id) => [id, priceOf(id, day)])));
    return priceCache.get(day);
  };
  const run = (list, t2) => {
    for (let k = 0; k < list.length; k += WORLD.maxActions) {
      const part = list.slice(k, k + WORLD.maxActions), day = worldDay(t2);
      const r = applyActions(s, part, { t: t2, day, rand: ctx.rand, prices: pricesFor(day), coins: ctx.coins - spend + earn, auto: true });
      spend += r.spend;
      earn += r.earn;
      xp += r.xp;
      r.out.forEach((o, j) => {
        if (!o.ok) return;
        acts[o.a] = (acts[o.a] || 0) + 1;
        for (const g of o.got || []) got[g.id] = (got[g.id] || 0) + g.n;
        if (o.a === "sell") {
          const id = String(part[j].id);
          soldN[id] = (soldN[id] || 0) + Math.max(1, Math.min(999, Math.floor(Number(part[j].n)) || 1));
        }
      });
    }
  };
  let t = a.t + AUTO.every;
  const oldest = ctx.now - AUTO.maxBack;
  if (t <= oldest) t += (Math.floor((oldest - t) / AUTO.every) + 1) * AUTO.every;
  const from = t;
  worldLifeInit(s, t, ctx.now);
  for (; t <= ctx.now && visits + skipped < AUTO.maxVisits; t += AUTO.every) {
    a.t = t;
    refresh(s, t);
    if (ctx.coins - spend + earn < AUTO.wage) {
      skipped++;
      a.t = t;
      continue;
    }
    spend += AUTO.wage;
    wage += AUTO.wage;
    const weather = weatherOf(worldDay(t)), season = seasonOf(worldDay(t));
    let budget = a.budget;
    run(s.traps.map((tr, i) => trapReady(tr, t, weather === 2).n ? { a: "trap", i } : null).filter(Boolean), t);
    const animal = [];
    s.barn.forEach((pen, i) => {
      if (animalReady(pen, t).ready) animal.push({ a: "collect", i });
    });
    if (a.feed) {
      const hungry = s.barn.map((pen, i) => {
        const st = animalReady(pen, t);
        return st.stage !== "retired" && st.feedLeft <= 8 * 3600 ? i : -1;
      }).filter((i) => i >= 0);
      const need = hungry.reduce((n2, i) => n2 + ANIMALS.find((d) => d.id === s.barn[i].k).feed, 0);
      const lack = Math.max(0, need - (s.inv.feed?.[0] || 0));
      const n = Math.min(lack, Math.floor(budget / SHOP.feed.price), Math.floor(Math.max(0, ctx.coins - spend + earn) / SHOP.feed.price));
      for (let left = n; left > 0; left -= 99) animal.push({ a: "buy", id: "feed", n: Math.min(99, left) });
      budget -= n * SHOP.feed.price;
      hungry.forEach((i) => animal.push({ a: "feed", i }));
    }
    run(animal, t);
    const farm = [];
    s.plots.forEach((p, i) => {
      if (!p) return;
      const st = cropStage(p, t, sprinkled(s, i) || weather === 1);
      if (st.stage === 3) farm.push({ a: "harvest", i });
      else if (st.stage === -1) farm.push({ a: "clear", i });
    });
    run(farm, t);
    const crop = a.crop === "none" ? null : a.crop === "best" ? bestCrop(season) : CROPS.find((c) => c.id === a.crop && c.seasons.includes(season));
    const tend = [];
    if (a.water && weather !== 1) s.plots.forEach((p, i) => {
      if (!p || sprinkled(s, i)) return;
      const st = cropStage(p, t);
      if (st.stage >= 0 && st.stage < 3 && p.w <= st.stage) tend.push({ a: "water", i });
    });
    if (crop) s.plots.forEach((p, i) => {
      if (!p && i < s.plotN && budget >= crop.seed && s.en - a.keep >= WORLD.cost.plant) {
        tend.push({ a: "plant", i, c: crop.id });
        budget -= crop.seed;
      }
    });
    run(tend, t);
    const spare = Math.max(0, s.en - a.keep), fishCost = WORLD.cost.fish + AUTO.surcharge, mineCost = WORLD.cost.mine + AUTO.surcharge;
    const nf = Math.floor(spare * a.fishPct / 100 / fishCost), nm = Math.floor((spare - nf * fishCost) / mineCost);
    const work = [];
    for (let k = 0; k < nf; k++) work.push({ a: "fish", bait: (s.inv.bait?.[0] || 0) > k });
    for (let k = 0; k < nm; k++) work.push({ a: "mine", f: 99 });
    run(work, t);
    if (a.sell) {
      const pr = pricesFor(worldDay(t)), sells = [];
      for (const [id, qs] of Object.entries(s.inv)) {
        if (!BASE_PRICE[id] || !(pr[id] >= BASE_PRICE[id] * a.minPct / 100)) continue;
        qs.forEach((n, q) => {
          if (n) sells.push({ a: "sell", id, q, n });
        });
      }
      run(sells, t);
    }
    visits++;
    a.t = t;
  }
  refresh(s, ctx.now);
  const log = { from, to: a.t, visits, got, earn, spend, xp, acts, wage, skipped };
  s.autoLog = log;
  return { spend, earn, xp, log, sold: soldN };
}
export {
  ANIMALS,
  AUTO,
  AUTO_DEFAULT,
  BASE_PRICE,
  CROPS,
  FISH,
  GOALS,
  GOAL_BONUS,
  GOAL_REWARD,
  ITEM_NAME,
  NORMAL_VOLUME,
  ORES,
  PICK_FLOOR,
  QUALITY,
  SEASONS,
  SHOP,
  WEATHERS,
  WELCOME_GIFT,
  WORLD,
  animalReady,
  animalSaleValue,
  applyActions,
  autoConfig,
  autoDue,
  autoSettle,
  bestCrop,
  cropStage,
  dailyGoals,
  energyMax,
  fishPool,
  freshnessSummary,
  hourOf,
  marketFactor,
  newWorld,
  priceOf,
  refresh,
  seasonOf,
  sprinkled,
  stockShelf,
  supplyFactor,
  trapReady,
  upgradePrice,
  valleyActiveClock,
  valleyActiveSeconds,
  valleyAfterActive,
  valleyTime,
  weatherOf,
  worldDay,
  worldStockAdd,
  worldStockTake
};
