/*
 * AWS BuilderCards 2nd Edition (非公式Web版) — CPU AI
 *
 * 攻略記事（note.com/sekimoriko）の戦略に沿う:
 *   序盤〜中盤: compute/containers を中心に AWS カードを集め、オンプレを破棄
 *   中盤〜終盤: 1ptカードを1〜2枚取りつつ、$8安定供給を目指す
 *   終盤: 3ptカードが解禁されたら購入
 */

function cpuTakeTurn(game) {
  const p = game.players[game.current];

  // ① ビルドフェーズ
  // リタイア: 手札のAWSカード > オンプレなら、オンプレを1枚破棄（効果ドロー前）
  if (game.canRetire(p)) game.retireFromHand(p);

  // 手札を全てプレイ（AWS→オンプレ順・シナジーが乗る）
  game.playAll(p);

  // ② 購入フェーズ
  game.phase = 'buy';
  while (game.buys > 0) {
    if (!cpuBuyOne(game, p)) break;
    if (game.over) break;
  }
}

function cpuBuyOne(game, p) {
  const coins = game.coins;
  const waLeft = game.waSupply['wa1'] + game.waSupply['wa3'];
  const deck = p.totalCards();

  // 終盤: 3pt解禁かつ$8以上 → 最優先
  if (game.canBuyWA('wa3') && coins >= 8) return game.buyWA(p, 'wa3');

  // WA残り僅かなら1ptも積極取得
  if (waLeft <= 5 && game.canBuyWA('wa1') && coins >= 3) return game.buyWA(p, 'wa1');

  // コストありビルダー（表向き1枚のみ。買えるなら狙う）
  if (game.paidRow != null && CARD_DB[game.paidRow].cost <= coins && Math.random() < 0.55) {
    if (game.buyPaidBuilder(p, game.paidRow)) return true;
  }

  // コストフリービルダー取得: クレジット源とシナジーを重視
  const myCats = {};
  const myIds = new Set();
  p.allCards().forEach(id => {
    myIds.add(id);
    const c = CARD_DB[id];
    if (c.category) myCats[c.category] = (myCats[c.category] || 0) + 1;
  });

  let bestIdx = -1, bestScore = -1;
  game.freeRow.forEach((id, idx) => {
    if (!id) return;
    const c = CARD_DB[id];
    let score = (c.primary?.coins || 0) * 2 + (c.primary?.cards || 0) + (c.primary?.buys || 0) * 2;
    // compute/containers を優遇（記事の Tier1）
    if (c.category === 'compute' || c.category === 'containers') score += 2;
    // 既に持つカテゴリはシナジー期待で加点
    if (c.category && myCats[c.category]) score += 2;
    // セカンダリ条件が既に満たせそうなら加点
    if (c.secondary?.requires) {
      const r = c.secondary.requires;
      if (r.category && myCats[r.category]) score += 2;
      if (r.cardId && myIds.has(r.cardId)) score += 2;
    }
    // CloudWatch はデッキが厚い終盤に価値
    if (c.special === 'perAwsCard' && deck > 16) score += 4;
    if (score > bestScore) { bestScore = score; bestIdx = idx; }
  });
  if (bestIdx >= 0) return game.takeFreeBuilder(p, bestIdx);

  // 中盤の得点稼ぎ: 1ptを時々取る
  if (game.canBuyWA('wa1') && coins >= 3 && Math.random() < 0.4) return game.buyWA(p, 'wa1');

  // 列が空なら山札トップをブラインド
  if (game.freeDeck.length > 0 && game.buys > 0 && bestIdx < 0) return game.takeFreeBlind(p);

  return false;
}

if (typeof module !== 'undefined') {
  module.exports = { cpuTakeTurn };
}
