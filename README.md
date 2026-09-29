# YORUMICHI

**実在する場所 × AIの勝手な解釈。**
「本屋行きたい」と入れると、本屋だけでなく「漫画を待つための町中華」も出てくる。
検索していたものとは違う。でも、なんかいい。──そんな寄り道をつくる、スマホ向けWebアプリです。

案内役（というより勝手なことを言う相棒）は、街のすき間に住む生き物「みちび」。

---

## 流れ

1. アプリを開く → **端末の現在地**を取得（取得中は「今いる街を探しています」、拒否時は許可ボタン。勝手な場所には切り替えない）
2. 現在地のまわり800mの実在スポットを **Google Places (New)** で先に取得しておく
3. 一言入力（音声入力可）→「寄ってみる」
4. Claude が実在スポットに「一言あだ名」をつける（3〜5件）
5. 地図上のマーカーをタップ → Bottom Sheet（REAL / AI FILTER）
6. 「行ってみる」→ Google マップ（アプリ／Web）で道案内、YORUMICHI 側は「着いた？」画面へ
7. 「実際どうだった？」😐 / 🙂 / 🤩
8. 写真を撮る → **写っている物だけを自動で切り抜いて白フチのシールに**（1枚の写真から複数OK）
9. シール帳に貼る。採集マップでは、自分のシールがその場所に貼られる

---

## ローカル起動

```bash
npm install
cp .env.example .env.local   # 値を入れる（下記）
npm run dev                  # http://localhost:3000
```

ブラウザ（Chrome 等）で開くと位置情報の許可を求められます。localhost は https でなくても位置情報が使えます。

### スマホで試す

スマホのブラウザは https でないと位置情報とカメラが使えないため、専用コマンドがあります。

```bash
npm run dev:phone
```

同じWi-FiのスマホでMacのIPアドレス（例 `https://192.168.x.x:3000`）を開き、証明書の警告を許可してください。ホーム画面に追加するとアプリのように全画面で開けます。

### キーなしで画面を確認する（デモモード）

```
NEXT_PUBLIC_USE_MOCK_DATA=true
```

- **現在地は本物**を使い、そのまわりに開発用のサンプルスポットを配置します
- `ANTHROPIC_API_KEY` が空なら、キーワードベースの簡易解釈を使います（入力を理解できないときは「みちびの連想」を出しません）
- **Vercel本番（`VERCEL_ENV=production`）では無視されます**

---

## 環境変数

| 変数 | 必須 | 説明 |
| --- | --- | --- |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | 地図表示に | ブラウザ用キー（Maps JavaScript API のみ・リファラー制限） |
| `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` | 任意 | Advanced Markers 用 Map ID（未設定なら `DEMO_MAP_ID`） |
| `GOOGLE_PLACES_API_KEY` | ✅ | サーバー用キー（Places API (New) のみ）。ブラウザには出ません |
| `ANTHROPIC_API_KEY` | ✅ | Claude API キー |
| `AI_PROVIDER` | 任意 | `anthropic`（既定）/ `mock` |
| `ANTHROPIC_MODEL` | 任意 | 最終解釈（既定 `claude-opus-5`） |
| `ANTHROPIC_SHORTLIST_MODEL` | 任意 | 一次選定（既定 `claude-haiku-4-5`、速度優先） |
| `ANTHROPIC_EFFORT` | 任意 | `low`（既定）/ `medium` / `high` |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 任意 | 未設定ならスマホ本体（IndexedDB）に保存 |
| `SUPABASE_STORAGE_BUCKET` | 任意 | 既定 `stickers` |
| `REMOVE_BG_API_KEY` | 任意 | 切り抜きの予備（端末内の切り抜きが使えない環境向け） |
| `NEXT_PUBLIC_USE_MOCK_DATA` | 任意 | デモモード（上記） |
| `NEXT_PUBLIC_USE_MOCK_LOCATION` | 任意 | **開発用**。`true` かつ `NEXT_PUBLIC_MOCK_LAT` / `NEXT_PUBLIC_MOCK_LNG` の両方があるときだけ固定位置を使う。通常は `false` |
| `NEXT_PUBLIC_SERVICE_AREA` | 任意 | `all`（既定）/ `tokyo`（東京外で案内を出す） |

アプリ内に固定座標のフォールバックはありません。Mapsのブラウザキーがない／読み込みに失敗した場合は、フィールドノート風の簡易地図に自動で切り替わります。

---

## Google Cloud の設定

1. プロジェクトを作成し、課金を有効化
2. **APIを有効化**：Maps JavaScript API / Places API (New)
3. **キーを2つ作る**
   - ブラウザ用：HTTPリファラー制限（`http://localhost:3000/*`, `https://<your-app>.vercel.app/*`, スマホ確認用のIP）、API制限＝Maps JavaScript API
   - サーバー用：API制限＝Places API (New)
4. 任意：Map Management で JavaScript 用 Map ID（ベクター）を作り、淡い配色のスタイルを当てる（アプリ側でも地図の彩度を落としています）

取得フィールドは Nearby Search では基本情報＋評価＋営業状況のみ。口コミはAIが一次選定した6〜8件だけ Place Details で取得し、**AIの根拠づけ（内部）にだけ使い、画面には出しません**。口コミ・写真・営業時間を見たい人は「Google マップで見る」でそのスポットのページへ。閉業（`businessStatus` が `OPERATIONAL` 以外）は除外します。

---

## Supabase の設定

1. プロジェクトを作成
2. **Authentication → Sign In / Providers → Anonymous sign-ins を ON**
3. **SQL Editor で `supabase/schema.sql` を実行**
   - テーブル：`users` / `searches` / `recommendations` / `visits` / `stickers`
   - すべてRLS有効（本人の行だけ）
   - Storage：非公開バケット `stickers`（`{user_id}/...` のみ本人がアクセス可）
   - Google の口コミ等は保存しない。`place_id` と、ユーザーが生み出したもの（シール、写真、リアクション）だけ
4. URL と anon key を `.env.local` へ

---

## Vercel 公開

```bash
npm i -g vercel
vercel link
vercel env add GOOGLE_PLACES_API_KEY
vercel env add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
vercel env add ANTHROPIC_API_KEY
vercel --prod
```

Production では `NEXT_PUBLIC_USE_MOCK_DATA` / `NEXT_PUBLIC_USE_MOCK_LOCATION` を設定しないでください（データのモックは本番で無視されます）。ブラウザ用キーのリファラーに本番ドメインを追加。

---

## 構成

```
src/
  app/
    page.tsx                  Home（現在地の地図・一言入力・寄ってみる）
    map/page.tsx              AIマップ（Loading / エラー / マーカー / Bottom Sheet）
    place/[placeId]/page.tsx  スポット詳細（Bottom Sheet と同じ中身のページ版）
    visit/[placeId]/page.tsx  着いた → リアクション → 撮影 → 切り抜き → 貼る
    collection/page.tsx       シール帳（シールだけ）／採集マップ
    api/
      places/nearby           POST 周辺スポット（3系統を並列取得）
      places/details          POST スポット詳細
      places/photo            GET  写真（キーを隠してリダイレクト）
      interpret               POST AIフィルター（一次選定 → 詳細 → 最終解釈 → タイトル重複チェック）
      reaction                POST リアクション
      stickers                GET/POST シール（写真1枚 + シール複数）
      sticker/cutout          POST 予備の切り抜きAPI（remove.bg）
  components/
    map/  MapView, GoogleSpotMap, FieldMap, CurrentLocationMarker,
          YorumichiMarker, StickerMapMarker, MapMarkerView(＋みちび)
    BottomSheet, PlaceSheetContent, SpotCard, StickerView, Michibi, StateViews …
  lib/
    store/search-context.tsx  現在地・検索の唯一の状態（currentLocation）
    ai/        provider（interface）, anthropic, mock, prompts, pipeline, title-lint
    places/    google, mock（development-only）, place-types
    sticker/   cutter（MediaPipe → remove.bg → 予備）, render（白フチ・透明PNG）
    character.ts              みちびの名前・セリフ・ポーズ
supabase/schema.sql
public/michibi/*.webp         みちびの8ポーズ
```

### 現在地の流れ

`SearchProvider` がアプリ起動時に一度だけ `navigator.geolocation.getCurrentPosition`（`enableHighAccuracy: true, timeout: 10000, maximumAge: 30000`）を呼び、`currentLocation`（緯度・経度・精度）を保持。地図の中心・現在地マーカー・Nearby Search・AIへの `origin`・距離計算はすべてこの値を使います。

### AIタイトル（一言あだ名）

- タイトルはカテゴリ説明ではなく、その場所にしか成立しない一言あだ名
- スポットごとに発想軸（音／時間／用途のズレ…）を変える
- サーバー側で「っぽい」×2以上・同じ語尾×3・同じ名詞・同じ書き出しを検出したら、タイトルだけAIに付け直させる
- 画面に出すのは タイトル・一言コピー・みちびのひとことだけ。根拠（口コミ）は内部メモとしてのみ保持

### シール

写真 → 端末内で MediaPipe Interactive Segmenter が物体を切り抜き（中央＋周囲4点を自動で探索、重複除去）→ 白フチ＋かすかな縁の透明PNG。候補トレイで選んで貼る。写真からタップで追加も可。モデルは初回に Google のCDNから読み込みます。

---

## 現時点での制約

- 徒歩時間は直線距離×1.25÷80m/分の概算（Routes API未使用）
- 切り抜きは初回にモデル（数MB）をダウンロード。オフラインや非対応端末では丸型の切り取りにフォールバック
- 「場所を入力する」代替手段は未実装（位置情報を許可しないと使えない）
- Supabase未設定時は端末内保存のみ（機種変更で消える）
- デモモードの解釈はキーワードベースで、分かる言葉が限られる（本番は Claude）

## 次に改善するなら

- 「実際どうだった？」の結果を次の解釈に反映（ズレ具合の個人チューニング）
- Routes API で実際の徒歩時間
- 時間帯・天気で解釈を変える
- シール帳の自由配置（ドラッグで貼り直し）
