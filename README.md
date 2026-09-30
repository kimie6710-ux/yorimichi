# よりみち / YORIMICHI

**いつもの道に、あたらしい目を。**

実在する街の中で、自分だけの発見を見つけ、その発見をシールとして残し、
知らない誰かの発見から、また新しい街へ出会うスマホ向けWebアプリです。

街 → 発見 → シール → 共有 → 新しい街

---

## 流れ

1. アプリを開く → **端末の現在地**のまわりの地図。実在スポット（Google Places）に、AIが置いた「なにそれ？」な一文が並ぶ
2. 気になった一文の「行ってみる」→ アプリ内の地図で徒歩ナビ（名前と写真は着くまで伏せる）
3. 「着いた」→ **探索モード**：「ここでした」で本物の場所が分かる。誰かが置いていったシールもここで初めて見える
4. 自分の目で探して、気になったものを撮る
5. 端末内で写真の中のモノを切り抜き（MediaPipe）→ AIが切り抜きそれぞれに名前をつけ、背景のかけらを外す
6. ひとつ選ぶ → 白フチ＋手描きの輪郭＋紙の質感のシールに。ひとことメモ
7. **ここに置いていく／知らない誰かに送り出す／シール帳に残す**
8. 送り出すと、自分にも誰かの発見がひとつ届く。届いたシールから「このシールが生まれた場所を見る」→ また街へ

AIは主人公ではなく、最初の種（スポットの一文）と、切り抜いたものの名付けだけを手伝います。星評価や口コミは画面に出しません。

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
- `ANTHROPIC_API_KEY` が空なら、カテゴリ別の用意された一文と、仮の名前を使います
- **Vercel本番（`VERCEL_ENV=production`）では無視されます**

### データの保存先

Supabase の3つの値（URL・anon key・service role key）がそろっていれば Supabase、なければサーバーを動かしているマシンの `./.data` に保存します。
`./.data` はそのサーバーにつながる全端末で共有されるので、PCとスマホで「置く／送る／届く」を試せます（Vercel本番では使えません）。

---

## 環境変数

| 変数 | 必須 | 説明 |
| --- | --- | --- |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | 地図表示に | ブラウザ用キー（Maps JavaScript API のみ・リファラー制限） |
| `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` | 任意 | Advanced Markers 用 Map ID（未設定なら `DEMO_MAP_ID`） |
| `GOOGLE_PLACES_API_KEY` | ✅ | サーバー用キー（Places API (New) のみ）。ブラウザには出ません |
| `ANTHROPIC_API_KEY` | ✅ | Claude API キー |
| `AI_PROVIDER` | 任意 | `anthropic`（既定）/ `mock` |
| `ANTHROPIC_MODEL` | 任意 | スポットの一文（既定 `claude-opus-5`） |
| `ANTHROPIC_SHORTLIST_MODEL` | 任意 | 切り抜きの名付け（既定 `claude-haiku-4-5`、速度優先） |
| `ANTHROPIC_EFFORT` | 任意 | `low`（既定）/ `medium` / `high` |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | 任意 | 3つそろうと Supabase。なければ `./.data` |
| `SUPABASE_STORAGE_BUCKET` | 任意 | 既定 `stickers` |
| `REMOVE_BG_API_KEY` | 任意 | 切り抜きの予備（端末内の切り抜きが使えない環境向け） |
| `NEXT_PUBLIC_USE_MOCK_DATA` | 任意 | デモモード（上記） |
| `NEXT_PUBLIC_USE_MOCK_LOCATION` | 任意 | **開発用**。`true` かつ `NEXT_PUBLIC_MOCK_LAT` / `NEXT_PUBLIC_MOCK_LNG` の両方があるときだけ固定位置を使う。通常は `false` |
| `NEXT_PUBLIC_SERVICE_AREA` | 任意 | `all`（既定）/ `tokyo`（東京外で案内を出す） |

アプリ内に固定座標のフォールバックはありません。Mapsのブラウザキーがない／読み込みに失敗した場合は、フィールドノート風の簡易地図に自動で切り替わります。

---

## Google Cloud の設定

1. プロジェクトを作成し、課金を有効化
2. **APIを有効化**：Maps JavaScript API / Places API (New) / Routes API
3. **キーを2つ作る**
   - ブラウザ用：HTTPリファラー制限（`http://localhost:3000/*`, `https://<your-app>.vercel.app/*`, スマホ確認用のIP）、API制限＝Maps JavaScript API
   - サーバー用：API制限＝Places API (New)
4. 任意：Map Management で JavaScript 用 Map ID（ベクター）を作り、淡い配色のスタイルを当てる（アプリ側でも地図の彩度を落としています）

Nearby Search で周辺の実在スポットを取り、AIの一文は**スポットごとに1回だけ**作って保存し、全員で使い回します（2回目以降はAIを呼びません）。星評価・口コミは画面に出しません。閉業（`businessStatus` が `OPERATIONAL` 以外）は除外します。

---

## Supabase の設定

1. プロジェクトを作成
2. **Authentication → Sign In / Providers → Anonymous sign-ins を ON**
3. **SQL Editor で `supabase/schema.sql` を実行**
   - テーブル：`users` / `spots` / `visits` / `spot_saves` / `observations` / `stickers` / `sticker_transfers` / `sticker_views`
   - 置く・送るはユーザーをまたぐため、書き込みはAPIルート（サーバー）だけが service role key で行う。ルール（本人のシールか、現地にいるか、1日の上限）はサーバー側でチェック
   - 元の写真は本人にだけ返す。置かれたシールの画像は、現地にいる人にだけ返す
4. URL・anon key・service role key を `.env.local` へ

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
    page.tsx                  マップ（ホーム）：現在地・スポットの一文・カード
    spot/[id]/page.tsx        スポット：よりみちの層（一文・見つかったもの）＋基本情報
    visit/[placeId]/page.tsx  ナビ → 探索モード → 撮る → 選ぶ → シール → 置く／送る／残す
    capture/page.tsx          ＋：今いるスポットで探す（近くにいなければ候補）
    collection/page.tsx       シール帳（ぜんぶ／場所ごと、詳細シート）
    inbox/page.tsx            届いたもの
    me/page.tsx               マイページ（行った場所・残した・送った・届いた）
    api/
      spots/nearby            POST 周辺スポット＋保存済みの一文（まだのものを返す）
      spots/seed              POST まだのスポットにAIが一文を置く
      spots/[id]              GET  スポット詳細（現地判定つき）
      spots/[id]/visit|save   POST 着いた／気になる
      sticker/detect          POST 切り抜きに名前をつける（AI）
      stickers                GET/POST シール帳／シールを作る
      stickers/[id]           PATCH メモ
      stickers/[id]/place     POST ここに置く（150m以内 or 24時間以内に来た）
      stickers/[id]/send      POST 知らない誰かへ（＋お返し）
      inbox, inbox/count, inbox/[id]/open, me
      route                   POST 徒歩ルート（Routes API）
      places/photo            GET  写真（キーを隠す）
      files/[...path]         GET  ./.data の画像（ローカル保存時のみ）
  components/
    sketch/   手描きの囲い（SketchOutline, Card, Section, Button, Input, Bubble, Sheet, Modal, Tabs）
    map/      MapView, GoogleSpotMap, FieldMap, YorumichiMarker …
    GuideView, SpotReveal, StickerView, StickerGrid, StickerDetail, TopBar, BottomNav, Michibi …
  lib/
    store/search-context.tsx  現在地とまわりのスポットの唯一の状態
    server/services.ts        置く・送る・届くなどのルール
    server/repo/              保存先（local = ./.data / supabase）
    ai/        provider, anthropic, mock, prompts, title-lint
    places/    google, mock（development-only）, place-types
    sticker/   cutter（MediaPipe → remove.bg → 予備）, render（白フチ・手描き輪郭・紙の質感）
    character.ts              小鳥のポーズとセリフ
supabase/schema.sql
public/bird/*.webp            小鳥の10ポーズ
docs/REDESIGN.md              再設計プラン
```

### 現在地の流れ

`SearchProvider` が起動時に一度だけ `navigator.geolocation.getCurrentPosition` を呼び、`currentLocation` を保持。地図の中心・現在地マーカー・周辺スポット・距離・現地判定はすべてこの値。ナビ中だけ `watchPosition` で追いかけます。固定座標のフォールバックはありません。

### スポットの一文

- 本来の用途から少しずれた見方を、一文（断定／うわさ／条件／じゃなく／用途名／未満以上／疑問／名詞句）で
- 店名は書かない（着いてからの答え合わせ）。データにない事実は断定しない
- 店名が混ざった一文・ありがちな言葉（余白・記憶・物語…）を使った一文はサーバー側で捨てる

### シール

写真 → 端末内の MediaPipe Interactive Segmenter が写真の中を3×3で見てまわり、重ならないモノを切り抜く → 小さな画像にしてAI（`ANTHROPIC_SHORTLIST_MODEL`）が名前をつけ、背景のかけらを外す → 選んだひとつを白フチ＋手描きの輪郭＋紙の質感の透明PNGに。写真をタップして自分で追加もできます。

### 送り出すしくみ（MVP）

受け取る人は、①送った本人・作った本人ではない ②14日以内に使っている ③そのスポットに行ったことがない ④6時間以内に何も受け取っていない ⑤同じシールを持っていない 人からランダム。別のエリアの人を優先。該当者がいなければ保留し、次に誰かが開いたときに届けます。送った人には、誰かが見つけたシールがひとつ返ってきます。1日3枚まで。

---

## 現時点での制約

- `./.data` 保存はサーバー1台用。本番は Supabase が必要
- Supabase 保存は実装済みだが、実プロジェクトでの動作確認はまだ
- オフライン時の一時保存はなし（電波がないとシールを保存できない）
- 通知はアプリを開いたときだけ（プッシュ通知なし）
- 切り抜きは初回にモデル（数MB）をダウンロード。非対応端末では丸型の切り取りにフォールバック
- 位置情報を許可しないと使えない

## 次に改善するなら

- シール帳の日付別・エリア別
- スポットで見つかったものをAIがまとめる（見つかったものが増えてから）
- プッシュ通知、オフライン保存
- 地域限定シール・街歩きイベント（`area_key` と `origin` を土台に）
