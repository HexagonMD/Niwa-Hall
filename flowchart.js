function updateFlowchart() {
  const timelineContainer = document.getElementById("timeline");
  timelineContainer.innerHTML = ""; // コンテナをクリア

  const activeTab = document.querySelector(".day-tab.active");
  // タブのテキストから削除ボタンの '×' を除去して取得
  const dayText = activeTab ? activeTab.textContent.replace(/×$/, '').trim() : "全日程";

  if (dayText === "全日程") {
    // --- 全日程ビューのロジック（横並び） ---
    timelineContainer.classList.add("lanes-view"); // 横並び用のクラスを付与

    const ideasByDay = new Map();
    // 日付があり、開始時間が設定されているアイデアを日付ごとにグループ化
    appState.ideas.forEach(idea => {
      if (idea.day && idea.day !== "0" && idea.startTime) {
        if (!ideasByDay.has(idea.day)) {
          ideasByDay.set(idea.day, []);
        }
        ideasByDay.get(idea.day).push(idea);
      }
    });

    // 日付(day)の昇順でキーをソート
    const sortedDays = [...ideasByDay.keys()].sort((a, b) => Number(a) - Number(b));

    if (sortedDays.length === 0) {
      timelineContainer.classList.remove("lanes-view"); // アイテムがない場合は通常表示に戻す
      const noItemMessage = document.createElement("div");
      noItemMessage.className = "timeline-empty";
      noItemMessage.textContent = "時間設定済みの予定がありません。";
      timelineContainer.appendChild(noItemMessage);
      return;
    }

    // 各日付のレーンを作成
    sortedDays.forEach(dayKey => {
      // レーンのコンテナ
      const lane = document.createElement("div");
      lane.className = "flowchart-lane";
      timelineContainer.appendChild(lane);

      // ヘッダー
      const dayInfo = appState.days.find(d => d.id == dayKey);
      const header = document.createElement("div");
      header.className = "timeline-day-header";
      header.textContent = dayInfo ? dayInfo.name : `Day ${dayKey}`;
      lane.appendChild(header);

      // アイテムリスト
      const itemsContainer = document.createElement("div");
      itemsContainer.className = "timeline-items-container";
      lane.appendChild(itemsContainer);

      const dayIdeas = ideasByDay.get(dayKey);
      dayIdeas.sort((a, b) => a.startTime.localeCompare(b.startTime));
      dayIdeas.forEach(idea => {
        const timelineItem = createTimelineItemElement(idea);
        itemsContainer.appendChild(timelineItem);
      });
    });

  } else {
    // --- 個別日程ビューのロジック（元の縦一列表示） ---
    timelineContainer.classList.remove("lanes-view"); // 横並び用クラスを削除

    let ideasToRender;
    if (dayText === "未定") {
      ideasToRender = appState.ideas.filter((idea) => idea.day === "0");
    } else {
      const dayNumberMatch = dayText.match(/\d+/);
      if (dayNumberMatch) {
        const targetDay = dayNumberMatch[0];
        ideasToRender = appState.ideas.filter((idea) => idea.day === targetDay);
      } else {
        ideasToRender = [];
      }
    }

    const timedIdeas = ideasToRender
      .filter((idea) => idea.startTime)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));

    if (timedIdeas.length === 0) {
      const noItemMessage = document.createElement("div");
      noItemMessage.className = "timeline-empty";
      noItemMessage.textContent = "時間設定済みの予定がありません。";
      timelineContainer.appendChild(noItemMessage);
      return;
    }

    timedIdeas.forEach((idea) => {
      addTimelineItem(idea);
    });
  }
}

// この関数は個別日程表示の時だけ使われる
function createTimelineItemElement(idea) {
  const timelineItem = document.createElement("div");
  timelineItem.className = "timeline-item";
  timelineItem.dataset.ideaId = idea.id;

  const timeDisplay = document.createElement("div");
  timeDisplay.className = "time-display";
  timeDisplay.textContent = idea.startTime || "未定";

  const contentWrapper = document.createElement("div");
  contentWrapper.className = "timeline-content";

  const titleEl = document.createElement("div");
  titleEl.className = "timeline-title";
  titleEl.textContent = idea.title;

  const durationEl = document.createElement("div");
  durationEl.className = "timeline-duration";
  durationEl.textContent = "所要時間: " + (idea.duration || "未定");

  contentWrapper.appendChild(titleEl);
  contentWrapper.appendChild(durationEl);

  timelineItem.appendChild(timeDisplay);
  timelineItem.appendChild(contentWrapper);

  if (typeof handleDragStart === "function") {
    timelineItem.draggable = true;
    timelineItem.addEventListener("dragstart", handleDragStart);
  }
  if (typeof handleDragOver === "function") {
    timelineItem.addEventListener("dragover", handleDragOver);
  }
  if (typeof handleDrop === "function") {
    timelineItem.addEventListener("drop", handleDrop);
  }
  if (typeof handleDragEnd === "function") {
    timelineItem.addEventListener("dragend", handleDragEnd);
  }

  timelineItem.addEventListener("click", () => {
    if (timelineItem.dataset.skipClick === "true") {
      delete timelineItem.dataset.skipClick;
      return;
    }
    if (typeof window.openEditModalForIdea === "function") {
      window.openEditModalForIdea(idea.id);
    }
  });

  return timelineItem;
}


function addTimelineItem(idea) {
  const timeline = document.getElementById("timeline");
  const timelineItem = createTimelineItemElement(idea);

  timeline.appendChild(timelineItem);
}
