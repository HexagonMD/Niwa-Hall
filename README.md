# Google Map Test (旅行プランナー)

このプロジェクトは Google Maps を組み込んだシンプルな旅行プランナーのデモです。

**目的**: `test.html` で実際の Google Maps を表示し、URL からピンをインポートできるようにする。

セットアップ手順

1. Google Maps API キーを取得する
   - Google Cloud Console にログインし、プロジェクトを作成します。
   - 「APIs & Services」→「Credentials」から API キーを作成します。
   - 必要に応じて「Maps JavaScript API」と「Places API」を有効にしてください。
   - 制限はデモ用途なら HTTP リファラー制限（localhost）を設定すると安全です。

2. `test.html` を開いて API キーを渡す方法
   - 方法A（推奨・一時的）: ブラウザで URL のハッシュにキーを付ける
     - 例: `file:///C:/path/to/test.html#key=YOUR_API_KEY`
   - 方法B（対話式）: ページを開くとプロンプトでキーを入力できます（セッションに保存されます）。

3. ローカルで開発する際の注意
   - 直接 `file://` で開くと一部のブラウザで制限（CORSやスクリプト読み込み）があります。簡単なサーバーで提供することを推奨します。
   - PowerShell で簡単に立ち上げるコマンド例:

```powershell
# PowerShell (Windows)
cd 'C:\Users\jinnosuke\Documents\src\HackU\googlemap_test'
python -m http.server 8000
# または
npx http-server -p 8000
```

ブラウザで `http://localhost:8000/test.html#key=YOUR_API_KEY` を開いてください。

4. URL からインポート
   - Google Maps の共有リンク（`https://www.google.com/maps/...@lat,lng,...`）を入力してインポートできます。
   - 短縮リンク（`maps.app.goo.gl`）も試行しますが、CORS 制限で失敗する場合があります。

実装ノート

- `test.html` に Google Maps の読み込み・初期化、`addMarker`、`importFromURL` を追加しました。
- API キーはセッションストレージに保存され、次回はプロンプトをスキップします。

問題が発生したら教えてください。キーの渡し方かブラウザのエラー（コンソールのエラーメッセージ）を伝えてください。
