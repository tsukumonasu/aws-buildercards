# 🧱 AWS BuilderCards 2nd Edition — デッキ構築ゲーム（非公式Web版）

AWS サービスカードを組み合わせてクレジットを稼ぎ、**Well-Architected カード（勝利点）**を
集めるブラウザ向けデッキ構築ゲームです。
[Zenn の解説記事「AWS BuilderCards 2nd Edition 完全ガイド」](https://zenn.dev/issy/articles/zenn-aws-buildercards)
と公式ルール図を参考にした**非公式ファン実装**です。

**ビルド不要**・依存パッケージなし。`index.html` を開くだけで動作します。

## 🎮 遊び方

```bash
git clone https://github.com/<your-username>/aws-buildercards.git
cd aws-buildercards
open index.html          # ブラウザで開くだけ（macOS）
# または: python3 -m http.server 8000 → http://localhost:8000
```

CPU と 1 対 1 で対戦します。画面上部の「📜 ルール」「📖 カード図鑑」から詳細を確認できます。

## 📜 ルール概要（2nd Edition 準拠）

- **クレジットは1種類だけ**（TCO は廃止されました）。
- カードは3種類：
  - **Starter（On-Premises ×10）** … 初期手札。プレイで +$1。
  - **Builder** … AWSサービス。**コストフリー**（無料取得）と**コストあり**（クレジット消費）の2種。
    場に出すと**プライマリ効果（常時）**、同カテゴリが場にあれば**セカンダリ効果（シナジー）**も発動。
  - **Well-Architected** … 勝利点（1pt=コスト3 / 3pt=コスト8）。**1ptが残る間は3ptを買えません。**

### ターンの流れ

1. **① ビルドフェーズ** — 手札の Builder / On-Premises をプレイ。
   `Builder枚数 > Starter枚数` になったら On-Premises を1枚**リタイア（除去）**してデッキを薄くできます。
2. **② 購入フェーズ**（基本1購入・効果で増加）
   1. コストフリービルダーを取得（クレジット不要）
   2. コストありビルダーを購入（クレジット消費）
   3. Well-Architected を購入（クレジット消費）
   4. コンソール列が気に入らなければ**山札トップをブラインドで取得**（拒否不可）
3. **③ エンドフェーズ** — 手札・場を全て捨て札へ → 5枚ドロー → 次のプレイヤー。

### 終了と勝敗

- **Well-Architected カードが全て（1pt+3pt）購入され尽くした瞬間**にゲーム終了。
- 勝利点の合計が最多のプレイヤーの勝ち → **同点は Builder 枚数**が多い方 → それも同数なら**引き分け**。

## 📁 ディレクトリ構成

```
aws-buildercards/
├── index.html          # エントリポイント
├── css/style.css       # AWSカラーテーマ
├── js/
│   ├── cards.js        # カード定義（Starter/Builder(free/paid)/WA、コンソール構成）
│   ├── game.js         # エンジン（ビルド/購入/エンドの3フェーズ、シナジー、リタイア、終了判定）
│   ├── ai.js           # CPU AI（シナジー重視＋ポイントの買い時判断）
│   └── ui.js           # 画面描画・操作
└── README.md
```

## 🚀 GitHub Pages で公開する

静的サイトなので GitHub Pages にそのまま公開できます（`.nojekyll` 同梱済み）。

```bash
git init && git add -A
git commit -m "AWS BuilderCards 2nd Edition Web版"
git branch -M main
git remote add origin https://github.com/<your-username>/aws-buildercards.git
git push -u origin main
```

その後 **Settings → Pages → Source を「Deploy from a branch」→ `main` / `root` → Save**。
数十秒後に `https://<your-username>.github.io/aws-buildercards/` で公開されます。

## ⚠️ 注意

学習・ゲーム性を重視した簡易実装です。カード効果値・枚数はオリジナルの物理カードと
完全一致するものではなく、ルール構造（フェーズ・シナジー・リタイア・勝利条件）を再現しています。

## 🙏 クレジット

- 参考記事: [【AWS学習】AWS BuilderCards 2nd Edition 完全ガイド（Zenn / issy 氏）](https://zenn.dev/issy/articles/zenn-aws-buildercards)
- 日本語化プロジェクト: [jaws-ug/AWS-BuilderCards-Japanese](https://github.com/jaws-ug/AWS-BuilderCards-Japanese)
- AWS および各サービス名は Amazon.com, Inc. またはその関連会社の商標です。本ゲームは非公式のファン制作物です。
