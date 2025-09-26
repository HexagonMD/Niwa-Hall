import './legacy.css'

type LegacyWindow = Window & {
  [key: string]: unknown
}

const callWindowFn = (name: string, ...args: unknown[]) => {
  const globalWindow = window as unknown as LegacyWindow
  const fn = globalWindow[name]
  if (typeof fn === 'function') {
    ;(fn as (...innerArgs: unknown[]) => void)(...args)
  }
}

function App() {
  return (
    <div className="app-container">
      <div className="sidebar" id="sidebar">
        <button
          type="button"
          className="nav-button active"
          data-view="idea"
          onClick={() => callWindowFn('switchView', 'idea')}
        >
          <span>💡</span>
          <span className="tooltip">アイデアスペース</span>
        </button>
        <button
          type="button"
          className="nav-button"
          data-view="map"
          onClick={() => callWindowFn('switchView', 'map')}
        >
          <span>📍</span>
          <span className="tooltip">マップ</span>
        </button>
        <button
          type="button"
          className="nav-button"
          data-view="flowchart"
          onClick={() => callWindowFn('switchView', 'flowchart')}
        >
          <span>📊</span>
          <span className="tooltip">フローチャート</span>
        </button>
      </div>
      <div className="main-content">
        <div className="header">
          <h1 style={{ color: '#2c3e50', fontSize: '24px' }}>🗺️ 旅のプランナー</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => callWindowFn('startCollaboration')}
              id="collaborationBtn"
            >
              🤝 協働開始
            </button>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => callWindowFn('leaveCollaboration')}
              id="leaveBtn"
              style={{ display: 'none' }}
            >
              🚪 退出
            </button>
            <div className="user-indicator" style={{ display: 'flex', gap: '5px' }}>
              <span
                id="statusIndicator"
                style={{
                  width: '10px',
                  height: '10px',
                  background: '#e74c3c',
                  borderRadius: '50%',
                  marginTop: '5px',
                }}
              />
              <span style={{ color: '#7f8c8d', fontSize: '14px' }} id="userCount">
                オフライン
              </span>
            </div>
          </div>
        </div>
        <div className="view-container">
          <div className="view idea-space active" id="idea-view">
            <div className="url-import">
              <input
                type="text"
                placeholder="Google MapsのURLを貼り付けて自動でピンを追加..."
                id="urlInput"
              />
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => callWindowFn('importFromURL')}
              >
                インポート
              </button>
            </div>
            <div className="idea-board" id="ideaBoard" />
          </div>
          <div className="view map-view" id="map-view">
            <div className="map-toolbar">
              <div className="day-tabs">
                <button type="button" className="day-tab active">
                  全日程
                </button>
                <button type="button" className="day-tab">
                  1日目
                </button>
                <button type="button" className="day-tab">
                  2日目
                </button>
                <button type="button" className="day-tab">
                  3日目
                </button>
              </div>
              <div style={{ flex: 1 }} />
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => callWindowFn('centerMap')}
              >
                現在地
              </button>
            </div>
            <div id="map" />
          </div>
          <div className="view flowchart-view" id="flowchart-view">
            <div className="timeline" id="timeline">
              <div className="timeline-item" draggable>
                <div className="time-display">09:00</div>
                <div className="timeline-content">
                  <div className="timeline-title">札幌駅集合</div>
                  <div className="timeline-duration">所要時間 30分</div>
                </div>
              </div>
              <div className="timeline-item" draggable>
                <div className="time-display">09:30</div>
                <div className="timeline-content">
                  <div className="timeline-title">大通公園散策</div>
                  <div className="timeline-duration">所要時間 1時間</div>
                </div>
              </div>
              <div className="timeline-item" draggable>
                <div className="time-display">10:30</div>
                <div className="timeline-content">
                  <div className="timeline-title">札幌時計台見学</div>
                  <div className="timeline-duration">所要時間 45分</div>
                </div>
              </div>
              <div className="timeline-item" draggable>
                <div className="time-display">11:15</div>
                <div className="timeline-content">
                  <div className="timeline-title">ラーメン横丁でランチ</div>
                  <div className="timeline-duration">所要時間 1時間30分</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <button type="button" className="fab" onClick={() => callWindowFn('openModal')}>
        +
      </button>
      <div className="modal" id="modal">
        <div className="modal-content">
          <div className="modal-header">
            <h2>新しいアイデアを追加</h2>
          </div>
          <form id="addForm">
            <div className="form-group">
              <label htmlFor="itemTitle">タイトル</label>
              <input type="text" id="itemTitle" placeholder="例: おいしいラーメン店" />
            </div>
            <div className="form-group">
              <label htmlFor="itemLocation">場所</label>
              <input type="text" id="itemLocation" placeholder="場所を検索..." />
            </div>
            <div className="form-group">
              <label htmlFor="itemDescription">説明</label>
              <textarea id="itemDescription" placeholder="詳細な説明を入力..."></textarea>
            </div>
            <div className="form-group">
              <label htmlFor="itemUrl">URL</label>
              <input type="url" id="itemUrl" placeholder="https://..." />
            </div>
            <div className="form-group">
              <label htmlFor="itemStartTime">開始時間</label>
              <input type="time" id="itemStartTime" />
            </div>
            <div className="form-group">
              <label htmlFor="itemDuration">所要時間</label>
              <input type="text" id="itemDuration" placeholder="例: 1時間30分" />
            </div>
            <div className="form-group">
              <label htmlFor="itemEndTime">終了時間</label>
              <input type="time" id="itemEndTime" />
            </div>
            <div className="form-group">
              <span>ピンの種類</span>
              <div className="pin-types">
                <div className="pin-type">
                  <input type="radio" name="pinType" value="food" id="food" defaultChecked />
                  <label htmlFor="food">
                    <span className="pin-type-color" style={{ background: '#e74c3c' }}></span>
                    グルメ
                  </label>
                </div>
                <div className="pin-type">
                  <input type="radio" name="pinType" value="sightseeing" id="sightseeing" />
                  <label htmlFor="sightseeing">
                    <span className="pin-type-color" style={{ background: '#3498db' }}></span>
                    観光
                  </label>
                </div>
                <div className="pin-type">
                  <input type="radio" name="pinType" value="hotel" id="hotel" />
                  <label htmlFor="hotel">
                    <span className="pin-type-color" style={{ background: '#27ae60' }}></span>
                    宿泊
                  </label>
                </div>
                <div className="pin-type">
                  <input type="radio" name="pinType" value="transport" id="transport" />
                  <label htmlFor="transport">
                    <span className="pin-type-color" style={{ background: '#f39c12' }}></span>
                    交通
                  </label>
                </div>
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="itemDay">日程</label>
              <select id="itemDay" defaultValue="0">
                <option value="0">未定</option>
                <option value="1">1日目</option>
                <option value="2">2日目</option>
                <option value="3">3日目</option>
              </select>
            </div>
            <div className="form-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => callWindowFn('closeModal')}
              >
                キャンセル
              </button>
              <button type="submit" className="btn btn-primary">
                追加
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default App