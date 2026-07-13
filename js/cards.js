/*
 * AWS BuilderCards 2nd Edition (非公式Web版) — カード定義
 *
 * 参考:
 *   - 【AWS学習】AWS BuilderCards 2nd Edition 完全ガイド
 *     https://zenn.dev/issy/articles/zenn-aws-buildercards
 *   - AWS BuilderCards 2nd Edition攻略（moriko）
 *     https://note.com/sekimoriko/n/n7a53b081272a
 *
 * ── 2nd Edition の要点（正確なルール） ──
 *  - オンプレカードは「最初に配られる10枚」。★クレジットを生まない★
 *    （デッキを薄くするためにビルドフェーズで破棄していく対象）
 *  - クレジットは AWS カード（Builder）から得る。カード中央のオレンジ丸の数字がクレジット。
 *  - 序盤はクレジット0なので、コストフリーの AWS カードを取得してデッキを育てる。
 *  - オンプレカードにも AWS カードとのシナジー効果を持つものがある:
 *      Virtual Machine ⇔ Bare Metal Host（相互で +1ドロー）
 *      Corporate Identity Provider ⇔ AWS IAM Identity Center（+購入1）
 *  - クレジットは1種類だけ（TCO は廃止）。
 *
 * カードのプロパティ:
 *   id, name, type('onprem'|'builder'|'wa'), category
 *   free    : true=コストフリービルダー / false=コストありビルダー
 *   cost    : 購入コスト（コストあり builder / wa）
 *   vp      : 勝利点（wa）
 *   primary : { coins, cards, buys }  場に出すと常時発動
 *   secondary: { coins, cards, buys, requires } 条件を満たすと追加発動
 *      requires:
 *        { category: 'compute' }  … 同カテゴリの別カードが場にある
 *        { cardId: 'baremetal' }  … 特定カードが場にある
 *        { self: 2 }              … 同名カードが場に2枚以上（自身含む）
 *   special : 'perAwsCard' 等、個別処理する特殊効果（game.js で解決）
 *   retirable: オンプレがリタイア対象か
 *   desc    : 説明（学習用 / フレーバー）
 */

const CARD_DB = {
// ───────── オンプレカード（スターター10枚・クレジットを生まない） ─────────
  // 内訳: Bare Metal Host×3、他7種×1（計10枚）。
  // シナジーは Bare Metal Host + Virtual Machine の組み合わせで山札から1枚引けるのみ。
  // 他のオンプレカードには効果はない（デッキを薄くするためのリタイア対象）。
  baremetal: {
    id: 'baremetal', name: 'Bare Metal Host', type: 'onprem', category: 'on-premises', retirable: true,
    secondary: { cards: 1, requires: { cardId: 'vm' } },
    text: 'クレジットなし / Virtual Machine と組み合わせると +1ドロー',
    desc: 'オンプレの物理サーバー。Virtual Machine と組み合わせると山札から1枚引ける。'
  },
  vm: {
    id: 'vm', name: 'Virtual Machine', type: 'onprem', category: 'on-premises', retirable: true,
    secondary: { cards: 1, requires: { cardId: 'baremetal' } },
    text: 'クレジットなし / Bare Metal Host と組み合わせると +1ドロー',
    desc: 'オンプレの仮想マシン。Bare Metal Host と組み合わせると山札から1枚引ける。'
  },
  dbserver: {
    id: 'dbserver', name: 'Database Server', type: 'onprem', category: 'on-premises', retirable: true,
    text: 'クレジットなし・効果なし（リタイア対象）',
    desc: 'オンプレのデータベースサーバー。効果はない。デッキを薄くするため破棄していく。'
  },
  datawarehouse: {
    id: 'datawarehouse', name: 'Data Warehouse', type: 'onprem', category: 'on-premises', retirable: true,
    text: 'クレジットなし・効果なし（リタイア対象）',
    desc: 'オンプレのデータウェアハウス。効果はない。デッキを薄くするため破棄していく。'
  },
  san: {
    id: 'san', name: 'Storage Area Network (SAN)', type: 'onprem', category: 'on-premises', retirable: true,
    text: 'クレジットなし・効果なし（リタイア対象）',
    desc: 'オンプレのストレージ。効果はない。デッキを薄くするため破棄していく。'
  },
  docstore: {
    id: 'docstore', name: 'Document Store', type: 'onprem', category: 'on-premises', retirable: true,
    text: 'クレジットなし・効果なし（リタイア対象）',
    desc: 'オンプレの文書ストア。効果はない。デッキを薄くするため破棄していく。'
  },
  networking: {
    id: 'networking', name: 'Networking', type: 'onprem', category: 'on-premises', retirable: true,
    text: 'クレジットなし・効果なし（リタイア対象）',
    desc: 'オンプレのネットワーク機器。効果はない。デッキを薄くするため破棄していく。'
  },
  cidp: {
    id: 'cidp', name: 'Corporate Identity Provider', type: 'onprem', category: 'on-premises', retirable: true,
    text: 'クレジットなし・効果なし（リタイア対象）',
    desc: '社内IDプロバイダー。効果はない。デッキを薄くするため破棄していく。'
  },
    // ───────── ビルダーカード（AWSサービス）─ asia-quest記事の効果一覧に準拠 ─────────
  // primary.coins = AWSome（カード中央のクレジット）。条件付き効果は synergies に厳密化。
  // synergies[].requires: { cardId } / { cardIds:[...] } / { categoryIn:[...] } / { self:N } / { any:true }
  //   perMatch:true = 条件に合う未使用カード全てとマッチし、効果×枚数（全て消費）
  // free:true=コストフリー / false=コストあり(cost=TCO)

  // ── Compute / Container ──
  ec2: {
    id: 'ec2', name: 'Amazon EC2', type: 'builder', category: 'compute', free: true,
    primary: { coins: 2 },
    synergies: [
      { requires: { self: 3 }, coins: 4, buys: 1 },
      { requires: { self: 2 }, coins: 3 }
    ],
    text: '+$2 / EC2を2枚で+$3、3枚で+$4と購入+1',
    desc: '再構成可能な仮想サーバー。同じEC2を複数集めると強力。'
  },
  lambda: {
    id: 'lambda', name: 'AWS Lambda', type: 'builder', category: 'compute', free: true,
    primary: { coins: 1 },
    text: '+$1（組み合わせ効果なし・多くのカードの条件になる）',
    desc: 'サーバーレス。多くのカードのシナジー条件になる重要カード。'
  },
  ecs: {
    id: 'ecs', name: 'Amazon ECS', type: 'builder', category: 'containers', free: true,
    primary: { coins: 2 },
    synergies: [ { requires: { cardId: 'ec2' }, cards: 1 } ],
    text: '+$2 / Amazon EC2 と組み合わせると1ドロー',
    desc: 'コンテナオーケストレーション。EC2 と好相性。'
  },
  eks: {
    id: 'eks', name: 'Amazon EKS', type: 'builder', category: 'containers', free: true,
    primary: { coins: 2 },
    synergies: [ { requires: { cardId: 'ec2' }, cards: 1 } ],
    text: '+$2 / Amazon EC2 と組み合わせると1ドロー',
    desc: 'マネージド Kubernetes。EC2 と好相性。'
  },
  fargate: {
    id: 'fargate', name: 'AWS Fargate', type: 'builder', category: 'containers', free: true,
    primary: {},
    synergies: [ { requires: { cardIds: ['ecs','eks'] }, buys: 1, coins: 3 } ],
    text: 'ECS または EKS と組み合わせると +$3 と購入+1',
    desc: 'サーバーレスなコンテナ実行。単独ではcontainersとして組み合わせ不可。'
  },
  autoscaling: {
    id: 'autoscaling', name: 'Amazon EC2 Auto Scaling', type: 'builder', category: 'compute', free: false,
    cost: 4, primary: {},
    synergies: [
      { requires: { cardId: 'ec2' }, coins: 4 },
      { requires: { cardId: 'elb' }, cards: 1, buys: 1 }
    ],
    text: 'EC2と→+$4 / ELBと→1ドローと購入+1',
    desc: '需要に応じてEC2数を自動増減。'
  },

  // ── Storage ──
  s3: {
    id: 's3', name: 'Amazon S3', type: 'builder', category: 'storage', free: true,
    primary: { coins: 2 },
    synergies: [
      { requires: { cardId: 'lambda' }, cards: 1 },
      { requires: { categoryIn: ['analytics'] }, coins: 2 }
    ],
    text: '+$2 / Lambdaと→1ドロー / analyticsと→+$2',
    desc: '高耐久のオブジェクトストレージ。分析サービスの対象にもなる。'
  },
  efs: {
    id: 'efs', name: 'Amazon EFS', type: 'builder', category: 'storage', free: true,
    primary: { coins: 2 },
    synergies: [
      { requires: { cardId: 'ec2' }, cards: 1 },
      { requires: { cardIds: ['fargate','lambda'] }, buys: 1 }
    ],
    text: '+$2 / EC2と→1ドロー / Fargate・Lambdaと→購入+1',
    desc: '共有ファイルストレージ。'
  },

  // ── Database ──
  rds: {
    id: 'rds', name: 'Amazon RDS', type: 'builder', category: 'database', free: true,
    primary: { coins: 2 },
    synergies: [
      { requires: { categoryIn: ['compute','containers'] }, coins: 1 },
      { requires: { categoryIn: ['analytics'] }, buys: 1 }
    ],
    text: '+$2 / compute・containersと→+$1 / analyticsと→購入+1',
    desc: 'マネージドなリレーショナルDB。'
  },
  aurora: {
    id: 'aurora', name: 'Amazon Aurora', type: 'builder', category: 'database', free: true,
    primary: { coins: 2 },
    synergies: [
      { requires: { categoryIn: ['compute','containers'] }, coins: 2 },
      { requires: { categoryIn: ['analytics'] }, buys: 1 }
    ],
    text: '+$2 / compute・containersと→+$2 / analyticsと→購入+1',
    desc: 'クラウド最適化された高性能リレーショナルDB。'
  },
  dynamodb: {
    id: 'dynamodb', name: 'Amazon DynamoDB', type: 'builder', category: 'database', free: true,
    primary: { coins: 2 },
    synergies: [
      { requires: { categoryIn: ['compute','containers'] }, coins: 1, perMatch: true },
      { requires: { cardId: 'lambda' }, cards: 1 }
    ],
    text: '+$2 / compute・containers1枚ごとに+$1 / Lambda含むと1ドロー',
    desc: 'サーバーレスNoSQL。compute/containersが多いほど強力。'
  },
  elasticache: {
    id: 'elasticache', name: 'Amazon ElastiCache', type: 'builder', category: 'database', free: true,
    primary: { coins: 2 },
    synergies: [
      { requires: { categoryIn: ['compute','containers'] }, coins: 2 },
      { requires: { cardIds: ['rds','aurora'] }, cards: 1 }
    ],
    text: '+$2 / compute・containersと→+$2 / RDS・Auroraと→1ドロー',
    desc: 'インメモリキャッシュ。'
  },

  // ── Analytics ──
  athena: {
    id: 'athena', name: 'Amazon Athena', type: 'builder', category: 'analytics', free: true,
    primary: { coins: 1 },
    synergies: [ { requires: { cardId: 's3' }, coins: 3 } ],
    text: '+$1 / Amazon S3 と組み合わせると +$3',
    desc: 'S3上のデータにSQLクエリ。S3が定番の相方。'
  },
  redshift: {
    id: 'redshift', name: 'Amazon Redshift', type: 'builder', category: 'analytics', free: true,
    primary: { coins: 3 },
    synergies: [
      { requires: { cardId: 'aurora' }, buys: 1 },
      { requires: { cardId: 's3' }, cards: 1 }
    ],
    text: '+$3 / Auroraと→購入+1 / S3と→1ドロー',
    desc: 'ペタバイト級データウェアハウス。'
  },
  kinesis: {
    id: 'kinesis', name: 'Amazon Kinesis Data Streams', type: 'builder', category: 'analytics', free: true,
    primary: { coins: 2 },
    synergies: [
      { requires: { categoryIn: ['compute','containers'] }, coins: 1, perMatch: true }
    ],
    text: '+$2 / compute・containers1枚ごとに+$1',
    desc: 'リアルタイムのストリーミングデータ収集。'
  },
  opensearch: {
    id: 'opensearch', name: 'Amazon OpenSearch Service', type: 'builder', category: 'analytics', free: true,
    primary: { coins: 2 },
    synergies: [
      { requires: { categoryIn: ['compute','containers'] }, coins: 1, perMatch: true }
    ],
    text: '+$2 / compute・containers1枚ごとに+$1',
    desc: '検索・ログ分析。アーキテクチャの規模に比例して強力。'
  },

  // ── Network & Content Delivery ──
  vpc: {
    id: 'vpc', name: 'Amazon VPC', type: 'builder', category: 'networking', free: true,
    primary: { coins: 2, cards: 1 },
    text: '+$2 +1ドロー（常時）',
    desc: '論理的に分離した仮想ネットワーク。常にカードを1枚引ける。'
  },
  route53: {
    id: 'route53', name: 'Amazon Route 53', type: 'builder', category: 'networking', free: true,
    primary: { coins: 2 },
    synergies: [ { requires: { cardIds: ['cloudfront','s3','apigw','elb'] }, cards: 1 } ],
    text: '+$2 / CloudFront・S3・API Gateway・ELBのいずれかと→1ドロー',
    desc: '可用性の高いDNS。配信系サービスと好相性。'
  },
  cloudfront: {
    id: 'cloudfront', name: 'Amazon CloudFront', type: 'builder', category: 'networking', free: true,
    primary: { coins: 3 },
    synergies: [
      { requires: { cardIds: ['elb','ec2'] }, buys: 1 },
      { requires: { cardId: 's3' }, cards: 1 }
    ],
    text: '+$3 / ELB・EC2と→購入+1 / S3と→1ドロー',
    desc: 'エッジ配信CDN。'
  },
  elb: {
    id: 'elb', name: 'Elastic Load Balancing', type: 'builder', category: 'networking', free: true,
    primary: { coins: 2 },
    synergies: [ { requires: { categoryIn: ['compute','containers'] }, coins: 2 } ],
    text: '+$2 / compute・containersと→+$2',
    desc: 'トラフィックを分散する負荷分散サービス。'
  },

  // ── Application Integration ──
  eventbridge: {
    id: 'eventbridge', name: 'Amazon EventBridge', type: 'builder', category: 'app-integration', free: true,
    primary: { coins: 2 },
    synergies: [
      { requires: { cardId: 'lambda' }, coins: 2 },
      { requires: { any: true }, coins: 2 }
    ],
    text: '+$2 / Lambdaと→+$2 / どのAWSサービスとでも→+$2',
    desc: 'イベントバス。あらゆるサービスと連携。'
  },
  stepfunctions: {
    id: 'stepfunctions', name: 'AWS Step Functions', type: 'builder', category: 'app-integration', free: true,
    primary: { coins: 2 },
    synergies: [ { requires: { cardId: 'lambda' }, coins: 2, perMatch: true } ],
    text: '+$2 / Lambdaとの組み合わせごとに+$2',
    desc: 'ワークフローオーケストレーション。Lambdaを並べるほど強力。'
  },
  apigw: {
    id: 'apigw', name: 'Amazon API Gateway', type: 'builder', category: 'app-integration', free: true,
    primary: { coins: 1 },
    synergies: [
      { requires: { categoryIn: ['compute','containers'] }, coins: 1, perMatch: true },
      { requires: { cardId: 'lambda' }, cards: 1 }
    ],
    text: '+$1 / compute・containers1枚ごとに+$1 / Lambda含むと1ドロー',
    desc: 'APIのフロントドア。'
  },
  sns: {
    id: 'sns', name: 'Amazon SNS', type: 'builder', category: 'app-integration', free: true,
    primary: { coins: 2 },
    synergies: [
      { requires: { cardId: 'lambda' }, coins: 2 },
      { requires: { cardId: 'sqs' }, cards: 1, perMatch: true }
    ],
    text: '+$2 / Lambdaと→+$2 / SQSとの組み合わせごとに1ドロー',
    desc: 'Pub/Sub通知。SQSとのファンアウトが定番。'
  },
  sqs: {
    id: 'sqs', name: 'Amazon SQS', type: 'builder', category: 'app-integration', free: true,
    primary: { coins: 2 },
    synergies: [
      { requires: { cardId: 'lambda' }, coins: 2 },
      { requires: { categoryIn: ['compute','containers'], count: 2 }, buys: 1 }
    ],
    text: '+$2 / Lambdaと→+$2 / compute・containers2つと→購入+1',
    desc: 'メッセージキュー。'
  },

  // ── Management & Governance ──
  cloudwatch: {
    id: 'cloudwatch', name: 'Amazon CloudWatch', type: 'builder', category: 'mgmt', free: true,
    primary: { coins: 2 }, special: 'perAwsCard',
    text: '+$2 / 場の他AWSカード1枚につき +$1',
    desc: '可観測性を提供。手札のAWSカードが増える終盤ほど強力。'
  },
  cloudtrail: {
    id: 'cloudtrail', name: 'AWS CloudTrail', type: 'builder', category: 'mgmt', free: true,
    primary: { coins: 2 },
    synergies: [
      { requires: { cardId: 'opensearch' }, cards: 1 },
      { requires: { cardId: 'athena' }, cards: 1 }
    ],
    text: '+$2 / OpenSearchと→1ドロー / Athenaと→1ドロー',
    desc: 'API操作の監査ログ。'
  },
  cloudformation: {
    id: 'cloudformation', name: 'AWS CloudFormation', type: 'builder', category: 'mgmt', free: false,
    cost: 3, primary: { coins: 2, cards: 1 },
    text: '+$2 +1ドロー（常時）',
    desc: 'テンプレートでインフラを宣言的にプロビジョニング。'
  },
  ssm: {
    id: 'ssm', name: 'AWS Systems Manager', type: 'builder', category: 'mgmt', free: false,
    cost: 3, primary: { coins: 2 },
    synergies: [ { requires: { cardId: 'ec2' }, buys: 1 } ],
    text: '+$2 / Amazon EC2 と組み合わせると購入+1',
    desc: '運用タスクの自動化・一元管理。'
  },

  // ── Security, Identity & Compliance ──
  iamic: {
    id: 'iamic', name: 'AWS IAM Identity Center', type: 'builder', category: 'security', free: true,
    primary: { coins: 1, cards: 1 },
    synergies: [ { requires: { cardId: 'cidp' }, buys: 1 } ],
    text: '+$1 +1ドロー / Corporate Identity Provider と組み合わせると購入+1',
    desc: 'アクセス管理。オンプレの社内IDプロバイダーと連携する。'
  },

  // ── Developer tools ──
  cdk: {
    id: 'cdk', name: 'AWS CDK', type: 'builder', category: 'devtools', free: false,
    cost: 4, primary: { coins: 1 }, special: 'recycleFromDiscard',
    text: '+$1 / 捨て札から1枚選んで山札の一番上に置く（1ターンに1枚のみ）',
    desc: '前のターンまでに使ったカードを使い回せる。捨て札が少ないと空振りも。'
  },

  // ───────── Well-Architected カード（勝利点） ─────────
  wa1: {
    id: 'wa1', name: 'Well-Architected (1pt)', type: 'wa',
    cost: 3, vp: 1,
    text: '勝利点 +1（コスト3）',
    desc: 'Well-Architected の柱を1つ満たす。1ptが場に残る間は3ptを購入できない。'
  },
  wa3: {
    id: 'wa3', name: 'Well-Architected (3pt)', type: 'wa',
    cost: 8, vp: 3,
    text: '勝利点 +3（コスト8）',
    desc: '複数の柱を高いレベルで満たす。1ptがすべて無くなってから購入可能。'
  }
};

// オンプレ初期デッキ（各プレイヤー10枚・クレジットを生まない）
// 記事で判明している3種で構成
const STARTER_DECK = [
  'baremetal', 'baremetal', 'baremetal',
  'vm',
  'dbserver',
  'datawarehouse',
  'san',
  'docstore',
  'networking',
  'cidp'
];

// コストフリー・ビルダーの「マーケット（コンソール）」を構成する山札
const FREE_BUILDER_POOL = [
  { id: 'ec2', copies: 8 },
  { id: 'lambda', copies: 6 },
  { id: 's3', copies: 4 },
  { id: 'ecs', copies: 3 }, { id: 'eks', copies: 3 }, { id: 'fargate', copies: 3 },
  { id: 'efs', copies: 3 },
  { id: 'sqs', copies: 3 }, { id: 'sns', copies: 3 }, { id: 'apigw', copies: 3 },
  { id: 'eventbridge', copies: 2 }, { id: 'stepfunctions', copies: 2 },
  { id: 'route53', copies: 3 }, { id: 'cloudfront', copies: 3 }, { id: 'vpc', copies: 3 },
  { id: 'elb', copies: 3 },
  { id: 'rds', copies: 3 }, { id: 'aurora', copies: 3 }, { id: 'dynamodb', copies: 3 },
  { id: 'elasticache', copies: 3 },
  { id: 'athena', copies: 3 }, { id: 'redshift', copies: 3 }, { id: 'kinesis', copies: 3 },
  { id: 'opensearch', copies: 3 },
  { id: 'cloudwatch', copies: 2 }, { id: 'cloudtrail', copies: 3 },
  { id: 'iamic', copies: 3 }
];

// コンソールの face-up 列に並べる枚数
const FREE_ROW_SIZE = 5;

// コストあり・ビルダーの供給
const PAID_SUPPLY_SETUP = [
  { id: 'autoscaling', count: 4 },
  { id: 'cdk', count: 2 },
  { id: 'cloudformation', count: 4 },
  { id: 'ssm', count: 4 }
];

// Well-Architected 山（記事準拠: 1点7枚 / 3点5枚）
const WA_SUPPLY_SETUP = [
  { id: 'wa1', count: 7 },
  { id: 'wa3', count: 5 }
];

// カテゴリ表示ラベル
const CATEGORY_LABEL = {
  'on-premises': 'オンプレミス',
  compute: 'コンピューティング',
  containers: 'コンテナ',
  storage: 'ストレージ',
  database: 'データベース',
  'app-integration': 'アプリ統合',
  networking: 'ネットワーク',
  analytics: '分析',
  mgmt: '管理とガバナンス',
  devtools: '開発者ツール',
  security: 'セキュリティ'
};

if (typeof module !== 'undefined') {
  module.exports = {
    CARD_DB, FREE_BUILDER_POOL, FREE_ROW_SIZE,
    PAID_SUPPLY_SETUP, WA_SUPPLY_SETUP, STARTER_DECK, CATEGORY_LABEL
  };
}
