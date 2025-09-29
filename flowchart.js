function updateFlowchart() {
  const timeline = document.getElementById("timeline");
  timeline.innerHTML = ""; // タイムラインをクリア

  const activeTab = document.querySelector(".day-tab.active");
  const day = activeTab ? activeTab.textContent : "すべて";
  const trimmedDay = day.trim();

  let ideasToRender;

  if (trimmedDay.includes("すべて")) {
    ideasToRender = appState.ideas;
  } else if (trimmedDay === "未定") {
    ideasToRender = appState.ideas.filter((idea) => idea.day === "0");
  } else {
    const dayNumberMatch = trimmedDay.match(/\d+/);
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

  timedIdeas.forEach((idea) => {
    addTimelineItem(idea);
  });
}

function addTimelineItem(idea) {
  const timeline = document.getElementById("timeline");
  const timelineItem = document.createElement("div");
  timelineItem.className = "timeline-item";

  timelineItem.innerHTML = `
    <div class="time-display">${idea.startTime || "未定"}</div>
    <div class="timeline-content">
      <div class="timeline-title">${idea.title}</div>
      <div class="timeline-duration">所要時間: ${idea.duration || "未定"}</div>
    </div>
  `;

  timeline.appendChild(timelineItem);
}
