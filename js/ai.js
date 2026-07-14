/*
 * AWS BuilderCards 2nd Edition (非公式Web版) — CPU AI（強化版・戦略選択付き）
 *
 * 戦略（note.com/sekimoriko の攻略に準拠）:
 *   序盤〜中盤: AWS カードを集め、効果なしオンプレを破棄
 *   中盤〜終盤: 1ptを1〜2枚取りつつ $8 安定供給を目指す
 *   終盤: 3pt解禁後は最優先で購入。購入回数が増えていれば複数購入
 *   読み合い: 自分がリードしていない限り「最後の1ptカード」を取って3ptを相手に開放しない
 *
 * ★戦略アーキタイプ（ゲーム開始時にランダム選択、一貫した方針で収集）:
 *   'ec2'        … EC2重視。EC2を複数集めてself3(+$4+購入)、EC2起点シナジー
 *                  （Auto Scaling / ELB / EFS / ECS / EKS / SSM）を軸にクレジットを伸ばす
 *   'serverless' … サーバーレス重視。Lambda を核に API Gateway / DynamoDB / SQS / SNS /
 *                  Step Functions / Fargate / S3 / Athena のシナジーを連鎖させる
 */

// 効果を持たないオンプレ（優先的にリタイアする対象）
const USELESS_ONPREM = new Set(['dbserver', 'datawarehouse', 'san', 'docstore', 'networking']);

// 各戦略が重視するカードID（強いボーナス）とカテゴリ（弱いボーナス）
const STRATEGY_PROFILES = {
  ec2: {
    name: 'EC2重視',
    cards: {
      ec2: 9, autoscaling: 7, elb: 6, efs: 5, ecs: 5, eks: 5,
      ssm: 5, cloudfront: 4, rds: 3, elasticache: 3, cloudwatch: 4
    },
    cats: { compute: 2, containers: 2, networking: 1 },
    // 戦略対象外だが汎用で出やすいカードの抑制
    penalize: { lambda: -3, apigw: -2, stepfunctions: -2, sns: -2, sqs: -1 }
  },
  serverless: {
    name: 'サーバーレス重視',
    cards: {
      lambda: 9, apigw: 7, dynamodb: 6, sqs: 6, sns: 6, stepfunctions: 6,
      fargate: 5, s3: 5, athena: 4, eventbridge: 4, kinesis: 3
    },
    cats: { 'app-integration': 2, storage: 1.5, analytics: 1.5 },
    // EC2偏重を抑えてサーバーレス色を強める
    penalize: { ec2: -4, autoscaling: -3, elb: -2, ecs: -1, eks: -1 }
  }
};

// ゲームに戦略が未設定なら選ぶ（CPUプレイヤーごと・そのゲーム中は一貫）
function ensureStrategy(game) {
  if (!game._cpuStrategy) {
    const keys = Object.keys(STRATEGY_PROFILES);
    game._cpuStrategy = keys[Math.floor(Math.random() * keys.length)];
    // ゲームログに一度だけ戦略を表示
    if (typeof game.log === 'function') {
      game.log(`CPU の戦略: ${STRATEGY_PROFILES[game._cpuStrategy].name}`, 'turn');
    }
  }
  return game._cpuStrategy;
}

function cpuTakeTurn(game) {
  const p = game.players[game.current];
  const strat = ensureStrategy(game);

  // ① ビルドフェーズ
  // リタイア（効果ドロー前・1ターン1枚）: 効果なしオンプレを優先して除去
  if (game.canRetire(p)) {
    let idx = p.hand.findIndex(id => USELESS_ONPREM.has(id));
    if (idx < 0) {
      idx = p.hand.findIndex(id => {
        if (CARD_DB[id].type !== 'onprem') return false;
        if (id === 'vm') return !p.hand.includes('baremetal');
        if (id === 'baremetal') return !p.hand.includes('vm');
        if (id === 'cidp') return !p.hand.includes('iamic');
        return true;
      });
    }
    if (idx >= 0) game.retireFromHand(p, idx);
    else game.retireFromHand(p);
  }

  // 手札を出し切る
  let guard = 0;
  while (guard++ < 60) {
    const playable = p.hand.some(id => CARD_DB[id].type !== 'wa');
    if (!playable) break;
    game.playAll(p);
  }

  // ② 購入フェーズ
  game.phase = 'buy';
  while (game.buys > 0) {
    if (!cpuBuyOne(game, p, strat)) break;
    if (game.over) break;
  }
}

// カードの実効価値（購入判断用スコア）。strat で戦略バイアスを加える
function cardValue(game, p, id, strat) {
  const c = CARD_DB[id];
  if (!c) return 0;
  let v = (c.primary?.coins || 0) * 2 + (c.primary?.cards || 0) * 1.5 + (c.primary?.buys || 0) * 2.5;

  const cats = {};
  const ids = new Set();
  p.allCards().forEach(x => {
    ids.add(x);
    const cc = CARD_DB[x];
    if (cc.category) cats[cc.category] = (cats[cc.category] || 0) + 1;
  });

  (c.synergies || []).forEach(syn => {
    const r = syn.requires || {};
    const gain = (syn.coins || 0) * 2 + (syn.cards || 0) * 1.5 + (syn.buys || 0) * 2.5;
    let feas = 0;
    if (r.self) feas = (cats[c.category] || 0) >= (r.self - 1) ? 0.8 : 0.2;
    else if (r.cardId) feas = ids.has(r.cardId) ? 0.9 : 0.3;
    else if (r.cardIds) feas = r.cardIds.some(x => ids.has(x)) ? 0.9 : 0.3;
    else if (r.categoryIn) feas = r.categoryIn.some(cat => cats[cat]) ? 0.8 : 0.3;
    else if (r.any) feas = 0.8;
    if (syn.perMatch && r.categoryIn) {
      const n = r.categoryIn.reduce((s, cat) => s + (cats[cat] || 0), 0);
      feas = Math.min(1, 0.3 + n * 0.2);
    }
    v += gain * feas;
  });

  // 汎用の優遇
  if (c.category === 'compute' || c.category === 'containers') v += 0.5;
  if ((c.primary?.cards || 0) >= 1 && (!c.synergies || c.synergies.length === 0)) v += 1;
  if (c.special === 'perAwsCard') v += Math.min(6, p.builderCount() * 0.4);

  // ★戦略バイアス
  const profile = STRATEGY_PROFILES[strat];
  if (profile) {
    if (profile.cards[id]) v += profile.cards[id];
    if (profile.penalize && profile.penalize[id]) v += profile.penalize[id];
    if (c.category && profile.cats[c.category]) v += profile.cats[c.category];
    // 戦略の核カードを既に持っているほど、関連シナジーの実現性が上がるので追加加点
    if (strat === 'ec2' && (c.synergies || []).some(s => (s.requires||{}).cardId === 'ec2') && (cats['compute'] || 0) > 0) v += 1.5;
    if (strat === 'serverless' && (c.synergies || []).some(s => (s.requires||{}).cardId === 'lambda') && ids.has('lambda')) v += 1.5;
  }

  return v;
}

function cpuBuyOne(game, p, strat) {
  const coins = game.coins;
  const wa1 = game.waSupply['wa1'];
  const wa3 = game.waSupply['wa3'];
  const waLeft = wa1 + wa3;

  const me = p.totalVP();
  const opp = game.players[(game.players.indexOf(p) + 1) % game.players.length].totalVP();
  const leading = me > opp;

  // 終盤: 3pt解禁かつ$8以上 → 最優先で購入
  if (game.canBuyWA('wa3') && coins >= 8) return game.buyWA(p, 'wa3');

  const endgame = waLeft <= 6 || game.turnCount >= 12;

  if (endgame) {
    if (game.canBuyWA('wa1') && coins >= 3) {
      if (wa1 === 1) {
        if (leading || wa3 === 0 || game.turnCount >= 20) return game.buyWA(p, 'wa1');
      } else {
        return game.buyWA(p, 'wa1');
      }
    }
  }

  // コストありビルダー（表向き1枚）: 価値が高く、買える範囲なら購入
  if (game.paidRow != null && CARD_DB[game.paidRow].cost <= coins) {
    const paidVal = cardValue(game, p, game.paidRow, strat);
    const bestFree = bestFreePick(game, p, strat);
    const freeVal = bestFree ? bestFree.score : 0;
    if (paidVal >= freeVal + 1.5) {
      if (game.buyPaidBuilder(p, game.paidRow)) return true;
    }
  }

  // コストフリービルダー: 戦略スコア最良の1枚を取得
  const pick = bestFreePick(game, p, strat);
  if (pick) return game.takeFreeBuilder(p, pick.idx);

  // 中盤の得点稼ぎ
  if (game.canBuyWA('wa1') && coins >= 3) {
    if (!(wa1 === 1 && wa3 > 0 && !leading && game.turnCount < 20)) return game.buyWA(p, 'wa1');
  }

  if (game.freeDeck.length > 0 && game.buys > 0 && !pick) return game.takeFreeBlind(p);

  return false;
}

// コンソール列から戦略スコア最良のカードを返す
function bestFreePick(game, p, strat) {
  let best = null;
  game.freeRow.forEach((id, idx) => {
    if (!id) return;
    const score = cardValue(game, p, id, strat);
    if (!best || score > best.score) best = { idx, id, score };
  });
  return best;
}

if (typeof module !== 'undefined') {
  module.exports = { cpuTakeTurn, STRATEGY_PROFILES };
}
