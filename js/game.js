/*
 * AWS BuilderCards 2nd Edition (非公式Web版) — ゲームエンジン
 *
 * 公式ルール（note.com/sekimoriko/n/n7a53b081272a 準拠）:
 *
 * ── 重要ルール ──
 *  - オンプレカードはクレジットを生まない。最初に配られる10枚で、
 *    ビルドフェーズで破棄（リタイア）してデッキを薄くしていく対象。
 *    一部のオンプレは AWS カードとのシナジー効果を持つ。
 *  - クレジットは AWS カード（Builder）から得る（カード中央のオレンジ丸）。
 *
 * ターン構造:
 *   ① ビルドフェーズ:
 *      - 手札の AWS カードが オンプレカードより多い場合、オンプレ1枚を破棄できる
 *        （カード効果によるドロー前に処理）
 *      - 手札のカード（AWS/オンプレ）を場に出して効果を処理
 *        プライマリ効果（常時）＋ セカンダリ効果（条件付き: カテゴリ/特定カード/同名枚数）
 *      - 手札のクレジット（= AWSカードのクレジット）でコンソールから購入
 *   ② 購入フェーズ:
 *      (1) コストフリービルダー取得（クレジット不要）
 *      (2) コストありビルダー購入（クレジット消費）
 *      (3) Well-Architected 購入（1ptが残る間は3pt不可）
 *      (4) コンソール列が不要なら山札トップをブラインド取得（拒否不可）
 *   ③ エンドフェーズ:
 *      手札・場を全て捨て札へ → 5枚ドロー → 次のプレイヤー
 *
 * 終了: Well-Architected が全て購入され尽くした瞬間。
 * 勝敗: VP合計最多 → 同点は AWS(Builder) 枚数が多い方 → それも同数は引き分け。
 */

class Player {
  constructor(name, isCPU) {
    this.name = name;
    this.isCPU = isCPU;
    this.deck = [];
    this.hand = [];
    this.inPlay = [];
    this.discard = [];
    this.retired = [];  // リタイア（ゲームから除去）したカードid
    this.scored = [];   // 購入した勝利点カード（山札に循環しない・別置き場）
    this.synergyUsed = new Set(); // シナジーで消費済みの inPlay インデックス
    this.firedSynergies = new Set(); // 発動済みシナジーのキー（1ターン1回）
  }

  allCards() { return [...this.deck, ...this.hand, ...this.inPlay, ...this.discard]; }
  totalVP() {
    // 山札等に残っているVP（保険）＋ 別置き場の得点カード
    const inDeck = this.allCards().reduce((s, id) => s + (CARD_DB[id].vp || 0), 0);
    const scoredVP = this.scored.reduce((s, id) => s + (CARD_DB[id].vp || 0), 0);
    return inDeck + scoredVP;
  }
  builderCount() { return this.allCards().filter(id => CARD_DB[id].type === 'builder').length; }
  onpremCount() { return this.allCards().filter(id => CARD_DB[id].type === 'onprem').length; }
  handAwsCount() { return this.hand.filter(id => CARD_DB[id].type === 'builder').length; }
  handOnpremCount() { return this.hand.filter(id => CARD_DB[id].type === 'onprem').length; }
  totalCards() { return this.deck.length + this.hand.length + this.inPlay.length + this.discard.length; }
}

class Game {
  constructor(logFn) {
    this.log = logFn || function () {};
    this.players = [new Player('あなた', false), new Player('CPU', true)];
    this.current = 0;
    this.turnCount = 1;
    this.phase = 'build';
    this.coins = 0;
    this.buys = 1;
    this.over = false;
    this.pendingRecycle = null;
    this.retiredThisTurn = false;

    this.freeDeck = [];
    this.freeRow = [];
    this.paidDeck = [];   // コストありビルダーのシャッフル山
    this.paidRow = null;  // 表向き1枚（めくって置く）
    this.waSupply = {};

    this.setup();
  }

  setup() {
    const pool = [];
    FREE_BUILDER_POOL.forEach(e => { for (let i = 0; i < e.copies; i++) pool.push(e.id); });
    this.freeDeck = shuffle(pool);
    this.freeRow = [];
    for (let i = 0; i < FREE_ROW_SIZE; i++) this.freeRow.push(this.freeDeck.pop() || null);

    // コストありビルダー: 1つの山にまとめてシャッフルし、1枚だけ表向きに公開
    const paidPool = [];
    PAID_SUPPLY_SETUP.forEach(s => { for (let i = 0; i < s.count; i++) paidPool.push(s.id); });
    this.paidDeck = shuffle(paidPool);
    this.paidRow = this.paidDeck.pop() || null;
    WA_SUPPLY_SETUP.forEach(s => { this.waSupply[s.id] = s.count; });

    // 各プレイヤーの初期デッキ = オンプレ10枚（この時点ではまだドローしない）
    this.players.forEach(p => { p.deck = [...STARTER_DECK]; });

    // CPU はコンソールから2枚を自動選択してデッキに加える
    const cpu = this.players[1];
    for (let k = 0; k < 2; k++) {
      const id = this.pickCpuInitialFree();
      if (id) cpu.deck.push(id);
    }

    // 人間プレイヤーは開始前に「コンソールから2枚選ぶ」フェーズ
    this.setupPicksRemaining = 2;   // 残り選択回数
    this.phase = 'setup';           // セットアップ選択フェーズ
    this.current = 0;
    this.turnCount = 1;
    // startTurn は選択完了後に beginPlay() で呼ぶ
  }

  // CPUの初期無料カード選択（compute/containers優先で価値の高いもの）
  pickCpuInitialFree() {
    let bestIdx = -1, bestScore = -1;
    this.freeRow.forEach((id, idx) => {
      if (!id) return;
      const c = CARD_DB[id];
      let sc = (c.primary?.coins || 0) * 2 + (c.primary?.cards || 0) + (c.primary?.buys || 0) * 2;
      if (c.category === 'compute' || c.category === 'containers') sc += 3;
      if (sc > bestScore) { bestScore = sc; bestIdx = idx; }
    });
    if (bestIdx < 0) return null;
    const id = this.freeRow[bestIdx];
    this.freeRow[bestIdx] = this.freeDeck.pop() || null;
    return id;
  }

  // 人間が初期カードをコンソール列から1枚選ぶ
  pickInitialFree(rowIndex) {
    if (this.phase !== 'setup' || this.setupPicksRemaining <= 0) return false;
    const id = this.freeRow[rowIndex];
    if (!id) return false;
    this.players[0].deck.push(id);
    this.freeRow[rowIndex] = this.freeDeck.pop() || null;
    this.setupPicksRemaining -= 1;
    this.log(`あなた: 初期カードに ${CARD_DB[id].name} を選択（残り${this.setupPicksRemaining}枚）`, 'buy');
    if (this.setupPicksRemaining === 0) this.beginPlay();
    return true;
  }

  // 選択完了 → シャッフルして5枚ドローし、ゲーム開始
  beginPlay() {
    this.players.forEach(p => {
      p.deck = shuffle(p.deck);
      this.draw(p, 5, true);
    });
    for (let i = 0; i < this.freeRow.length; i++) {
      if (!this.freeRow[i]) this.freeRow[i] = this.freeDeck.pop() || null;
    }
    this.current = 0;
    this.turnCount = 1;
    this.startTurn();
  }

  draw(player, n, allowReshuffle = false) {
    const drawn = [];
    for (let i = 0; i < n; i++) {
      if (player.deck.length === 0) {
        // 再シャッフルはエンドフェーズの引き直しのみ許可。
        // カード効果によるドローでは山札が尽きたら打ち切る（無限ドロー防止）。
        if (!allowReshuffle || player.discard.length === 0) break;
        player.deck = shuffle(player.discard);
        player.discard = [];
      }
      drawn.push(player.deck.pop());
    }
    player.hand.push(...drawn);
    return drawn;
  }

  startTurn() {
    this.phase = 'build';
    this.coins = 0;
    this.buys = 1;
    this.retiredThisTurn = false;  // このターン既にリタイアしたか（1ターン1枚まで）
    const p = this.players[this.current];
    this.log(`── ${p.name} のターン (${this.turnCount}) ──`, 'turn');
  }

  applyEffect(player, eff) {
    if (!eff) return [];
    const parts = [];
    if (eff.coins) { this.coins += eff.coins; parts.push(`+$${eff.coins}`); }
    if (eff.buys) { this.buys += eff.buys; parts.push(`+${eff.buys}購入`); }
    if (eff.cards) { this.draw(player, eff.cards, true); parts.push(`+${eff.cards}ドロー`); }
    return parts;
  }

  // シナジー解決（記事準拠・複数効果＋perMatch対応）
  // card.synergies: [{ requires, coins, cards, buys, perMatch }]
  //   requires:
  //     { cardId: 'x' }           特定カードが未使用で場にある
  //     { cardIds: ['a','b'] }    いずれかが場にある
  //     { categoryIn: ['compute','containers'] } 該当カテゴリが場にある
  //     { self: N }               同名が自身含めN枚
  //     { any: true }             自身以外のAWSカードが1枚でもある
  //   perMatch: true の場合、条件に合う未使用カード「全て」とマッチし効果×枚数、全て消費する
  // 発動した各シナジーについて {parts, usedIdx} を集計して返す。
  // 盤面シナジー解決（場に並んだカードを毎回スキャンし、未発動・未使用のシナジーを発動する）。
  // - 一度シナジーに使われた（消費された）カードは再利用不可（player.synergyUsed）。
  // - 各カードの各シナジーは1ターンに1回だけ発動（player.firedSynergies でキー管理）。
  // - self（同名N枚）は閾値到達で1回、相手は消費しない。
  // 戻り値: 発動した効果の説明文字列配列（ログ用）。
  resolveBoardSynergies(player) {
    const used = player.synergyUsed;      // 消費済み inPlay インデックス
    const fired = player.firedSynergies;  // 発動済みシナジーのキー集合
    const inPlay = player.inPlay;
    const isBuilder = i => CARD_DB[inPlay[i]].type === 'builder';
    const catOf = i => CARD_DB[inPlay[i]].category;
    const avail = (selfIndex) => {
      const a = [];
      for (let i = 0; i < inPlay.length; i++) {
        if (i === selfIndex) continue;
        if (used.has(i)) continue;
        a.push(i);
      }
      return a;
    };

    const allParts = [];
    let progressed = true;
    // 発動により盤面状態が変わる（消費が増える）ので、変化がなくなるまで繰り返す
    let guard = 0;
    while (progressed && guard++ < 100) {
      progressed = false;

      for (let ti = 0; ti < inPlay.length; ti++) {
        const card = CARD_DB[inPlay[ti]];
        const list = card.synergies || (card.secondary ? [card.secondary] : []);
        if (list.length === 0) continue;

        for (let si = 0; si < list.length; si++) {
          const syn = list[si];
          const req = syn.requires || {};

          if (req.self) {
            const key = 'self#' + card.id + '#' + req.self;
            if (fired.has(key)) continue;
            const sameCount = inPlay.filter(pid => pid === card.id).length;
            if (sameCount < req.self) continue;
            // 発動（自身は消費しない）
            fired.add(key);
            const eff = { coins: syn.coins || 0, cards: syn.cards || 0, buys: syn.buys || 0 };
            const parts = this.applyEffect(player, eff);
            if (parts.length) allParts.push(`${card.name}(同名${req.self}): ${parts.join(', ')}`);
            progressed = true;
            continue;
          }

          // 非self: このトリガーカード実体×このシナジーは1回だけ
          const key = 'pair#' + ti + '#' + si;
          if (fired.has(key)) continue;
          if (used.has(ti)) continue; // トリガー自身が既に消費済みなら不可

          const av = avail(ti);
          let matches = [];
          if (req.cardId) {
            const f = av.filter(i => inPlay[i] === req.cardId);
            matches = syn.perMatch ? f : f.slice(0, 1);
          } else if (req.cardIds) {
            const f = av.filter(i => req.cardIds.includes(inPlay[i]));
            matches = syn.perMatch ? f : f.slice(0, 1);
          } else if (req.categoryIn) {
            const f = av.filter(i => req.categoryIn.includes(catOf(i)));
            if (req.count) matches = f.length >= req.count ? f.slice(0, req.count) : [];
            else matches = syn.perMatch ? f : f.slice(0, 1);
          } else if (req.any) {
            const f = av.filter(i => isBuilder(i));
            matches = syn.perMatch ? f : f.slice(0, 1);
          }

          if (matches.length === 0) continue;

          fired.add(key);
          const factor = syn.perMatch ? matches.length : 1;
          const eff = {
            coins: (syn.coins || 0) * factor,
            cards: (syn.cards || 0) * factor,
            buys: (syn.buys || 0) * factor
          };
          const parts = this.applyEffect(player, eff);
          if (parts.length) allParts.push(`${card.name}シナジー: ${parts.join(', ')}`);
          // 相手カードを消費（再利用不可）。トリガー自身は消費しない。
          matches.forEach(i => used.add(i));
          progressed = true;
        }
      }
    }
    return allParts;
  }

  // 特殊効果（個別処理）
  applySpecial(player, card) {
    switch (card.special) {
      case 'perAllCards': {
        // 場（自身を除く）に出ている全カード枚数ぶん +$1
        const n = player.inPlay.length - 1;
        const gain = Math.max(0, n);
        if (gain > 0) { this.coins += gain; return [`+$${gain}(場${gain}枚)`]; }
        return ['+$0'];
      }
      case 'perAwsCard': {
        // 場の AWS カード枚数ぶん +$1（このカード自身も AWS だが、他の枚数を数える）
        const n = player.inPlay.filter(id => CARD_DB[id].type === 'builder' && id !== card.id).length
                  + player.inPlay.filter(id => id === card.id).length - 1; // 自身1枚は除外
        const gain = Math.max(0, n);
        if (gain > 0) { this.coins += gain; return [`+$${gain}(AWS${gain}枚)`]; }
        return ['+$0'];
      }
      case 'recycleFromDiscard': {
        // 捨て札から1枚を山札トップへ。
        if (player.discard.length === 0) return ['捨札が空のため効果なし'];
        if (player.isCPU) {
          // CPUは最も価値の高いカードを自動選択
          let best = -1, bestScore = -1;
          player.discard.forEach((id, i) => {
            const c = CARD_DB[id];
            const sc = c.type === 'builder'
              ? (c.primary?.coins || 0) * 2 + (c.primary?.cards || 0) + (c.primary?.buys || 0) * 2 + 1
              : 0;
            if (sc > bestScore) { bestScore = sc; best = i; }
          });
          if (best < 0) best = 0;
          const id = player.discard.splice(best, 1)[0];
          player.deck.push(id);
          return [`捨札の${CARD_DB[id].name}を山札トップへ`];
        }
        // 人間プレイヤーは UI で選択させる（保留状態をセット）
        this.pendingRecycle = { playerIndex: this.current };
        return ['捨札から1枚を選んで山札トップへ（選択待ち）'];
      }
      default: return [];
    }
  }

  // カードを場に出して効果処理（AWS/オンプレ両方）
  playCard(player, handIndex) {
    const id = player.hand[handIndex];
    const card = CARD_DB[id];
    if (!card) return false;
    if (card.type === 'wa') { this.log(`${card.name} は勝利点カードでプレイできません。`, 'warn'); return false; }

    player.hand.splice(handIndex, 1);
    player.inPlay.push(id);

    const parts = [];
    parts.push(...this.applyEffect(player, card.primary));
    if (card.special) parts.push(...this.applySpecial(player, card));

    // 場に並んだカード全体を再スキャンし、成立する未発動シナジーを発動する
    // （相手カードを後から出しても発動する。使用済みカードは再利用不可）。
    const synParts = this.resolveBoardSynergies(player);

    if (synParts.length > 0) {
      this.log(`${player.name}: ${card.name} ${parts.length ? '(' + parts.join(', ') + ')' : ''} ＋シナジー(${synParts.join(' / ')})`, 'play');
      return true;
    }
    this.log(`${player.name}: ${card.name} ${parts.length ? '(' + parts.join(', ') + ')' : '（効果なし）'}`, 'play');
    return true;
  }

  // 手札のカードを全てプレイ（AWS → オンプレの順。シナジーを乗せやすくする）
  playAll(player) {
    // ★ボタンを押した時点の手札のみをプレイする。
    // 効果でドローした新しいカードは手札に残し、連鎖的な大量プレイを防ぐ。
    // 手札の実体（このスナップショット）を、AWS→オンプレ順に並べて順次プレイする。
    const snapshot = [...player.hand];
    // AWS(builder) を先に、その後オンプレを出す（シナジーが乗りやすい順）
    const order = [
      ...snapshot.filter(id => CARD_DB[id].type === 'builder'),
      ...snapshot.filter(id => CARD_DB[id].type === 'onprem')
    ];
    for (const id of order) {
      // スナップショット由来のこのカードが今も手札にあればプレイ（重複IDは1枚ずつ消費）
      const idx = player.hand.indexOf(id);
      if (idx < 0) continue;
      this.playCard(player, idx);
    }
  }

  // リタイア可能か: 手札の AWS カード枚数 > 手札のオンプレ枚数
  // （ルール: ビルドフェーズ冒頭、カード効果ドロー前に判定するのが正式だが、
  //   ここでは「まだ手札にオンプレが残っている」ことを条件に簡易化）
  canRetire(player) {
    // 手札のAWSカードが3枚以上あれば、オンプレを1枚リタイアできる（1ターンに1枚まで）
    return !this.retiredThisTurn && player.handOnpremCount() > 0 && player.handAwsCount() >= 3;
  }

  // 手札のオンプレを1枚リタイア（ゲームから除去）
  retireFromHand(player, index = null) {
    if (!this.canRetire(player)) return false;
    let idx = index;
    if (idx == null) idx = player.hand.findIndex(id => CARD_DB[id].type === 'onprem');
    if (idx < 0 || CARD_DB[player.hand[idx]].type !== 'onprem') return false;
    const id = player.hand.splice(idx, 1)[0];
    player.retired.push(id);
    this.retiredThisTurn = true;
    this.log(`${player.name}: ${CARD_DB[id].name}（オンプレ）をリタイア`, 'retire');
    return true;
  }

  // CDK: 人間が選んだ捨て札1枚を山札トップへ
  recycleChosen(discardIndex) {
    if (!this.pendingRecycle) return false;
    const player = this.players[this.pendingRecycle.playerIndex];
    if (discardIndex < 0 || discardIndex >= player.discard.length) return false;
    const id = player.discard.splice(discardIndex, 1)[0];
    player.deck.push(id);
    this.log(`${player.name}: 捨札の${CARD_DB[id].name}を山札トップへ`, 'play');
    this.pendingRecycle = null;
    return true;
  }

  // ── 購入フェーズ ──
  takeFreeBuilder(player, rowIndex) {
    if (this.buys <= 0) return false;
    const id = this.freeRow[rowIndex];
    if (!id) return false;
    player.discard.push(id);
    this.freeRow[rowIndex] = this.freeDeck.pop() || null;
    this.buys -= 1;
    this.log(`${player.name}: ${CARD_DB[id].name} を取得（コストフリー）`, 'buy');
    return true;
  }

  takeFreeBlind(player) {
    if (this.buys <= 0 || this.freeDeck.length === 0) return false;
    const id = this.freeDeck.pop();
    player.discard.push(id);
    this.buys -= 1;
    this.log(`${player.name}: 山札トップから ${CARD_DB[id].name} を引いた（ブラインド）`, 'buy');
    return true;
  }

  buyPaidBuilder(player, id) {
    // 表向きの1枚のみ購入可能（id は表向きカードと一致する必要がある）
    if (this.paidRow == null || this.paidRow !== id) return false;
    const card = CARD_DB[id];
    if (this.buys <= 0 || this.coins < card.cost) return false;
    this.coins -= card.cost;
    this.buys -= 1;
    player.discard.push(id);
    // 山から次の1枚を公開
    this.paidRow = this.paidDeck.pop() || null;
    this.log(`${player.name}: ${card.name} を購入（$${card.cost}）`, 'buy');
    return true;
  }

  canBuyWA(id) {
    const card = CARD_DB[id];
    if (this.buys <= 0 || !this.waSupply[id] || this.coins < card.cost) return false;
    if (id === 'wa3' && this.waSupply['wa1'] > 0) return false;
    return true;
  }

  buyWA(player, id) {
    if (!this.canBuyWA(id)) return false;
    const card = CARD_DB[id];
    this.coins -= card.cost;
    this.buys -= 1;
    this.waSupply[id] -= 1;
    player.scored.push(id);  // 勝利点カードは山札に入れず別置き場へ
    this.log(`${player.name}: ${card.name} を購入（$${card.cost}）★`, 'buy');
    this.checkEnd();
    return true;
  }

  endTurn() {
    const p = this.players[this.current];
    p.discard.push(...p.inPlay, ...p.hand);
    p.inPlay = [];
    p.hand = [];
    p.synergyUsed = new Set();
    p.firedSynergies = new Set();
    this.draw(p, 5, true);

    if (this.over) return;
    this.current = (this.current + 1) % this.players.length;
    if (this.current === 0) this.turnCount++;
    this.startTurn();
  }

  checkEnd() {
    const waLeft = Object.values(this.waSupply).reduce((a, b) => a + b, 0);
    if (waLeft === 0) this.over = true;
  }

  result() {
    const scores = this.players.map(p => ({
      name: p.name, vp: p.totalVP(),
      builders: p.builderCount(), cards: p.totalCards()
    }));
    scores.sort((a, b) => b.vp - a.vp || b.builders - a.builders);
    const top = scores[0];
    const tie = scores.filter(s => s.vp === top.vp && s.builders === top.builders).length > 1;
    scores.forEach(s => { s.winner = !tie && s === top; });
    scores.draw = tie;
    return scores;
  }
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

if (typeof module !== 'undefined') {
  module.exports = { Game, Player, shuffle };
}
