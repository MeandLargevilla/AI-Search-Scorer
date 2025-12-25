// 生产环境版 Content Script
// 已移除调试日志，已对接 CSS Class
// v2.0: 使用 URL 作为稳定 ID，支持缓存机制，UI 增加 reason 悬停提示

const PROCESSED_CLASS = "sss-processed-v11";
const CACHE_PREFIX = "score_cache_"; // 渲染评分 Badge（支持 reason 悬停提示）
function renderBadge(el, score, reason) {
  const styleData = getScoreData(score);
  el.className = `gemini-badge fade-in ${styleData.class}`;
  // 清空内联样式，让 CSS Class 生效
  el.style.backgroundColor = "";
  el.style.color = "";
  el.style.border = "";

  // 设置 data-reason 属性用于 CSS Tooltip 显示
  if (reason) {
    el.setAttribute("data-reason", reason);
    el.removeAttribute("title"); // 移除原生 title 防止双重提示
  }

  el.innerHTML = `<span style="margin-right:4px">${styleData.icon}</span><b>${score}</b>`;
}
const CACHE_EXPIRE_MS = 7 * 24 * 60 * 60 * 1000; // 缓存 7 天

let batchQueue = [];
let processTimer = null;

// 新版样式生成器：返回 CSS 类名，而不是硬编码颜色
function getScoreData(score) {
  if (score >= 85) return { class: "score-high", icon: "🌟" };
  if (score >= 60) return { class: "score-mid", icon: "👌" };
  if (score >= 30) return { class: "score-low", icon: "🤔" };
  return { class: "score-bad", icon: "🗑️" };
}

// 将 URL 转换为安全的存储 key
function urlToKey(url) {
  // 使用 base64 编码避免特殊字符问题，截取前 100 字符防止 key 过长
  return CACHE_PREFIX + btoa(url).slice(0, 100);
}

// 从卡片中提取 URL 作为唯一 ID
function extractUrlFromCard(card) {
  const anchor = card.querySelector("a[href]");
  if (anchor && anchor.href) {
    try {
      const url = new URL(anchor.href);
      // 只保留协议+域名+路径，去除查询参数和哈希
      return url.origin + url.pathname;
    } catch {
      return null;
    }
  }
  return null;
}

// 渲染评分 Badge（支持 reason 悬停提示）
function renderBadge(el, score, reason) {
  const styleData = getScoreData(score);
  el.className = `gemini-badge fade-in ${styleData.class}`;
  // 清空内联样式，让 CSS Class 生效
  el.style.backgroundColor = "";
  el.style.color = "";
  el.style.border = "";

  // 设置 data-reason 属性用于 CSS Tooltip 显示
  if (reason && reason.trim()) {
    el.dataset.reason = reason;
  }

  el.innerHTML = `<span style="margin-right:4px">${styleData.icon}</span><b>${score}</b>`;
}

// 从缓存读取评分
async function getFromCache(url) {
  const key = urlToKey(url);
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (result) => {
      const cached = result[key];
      if (cached && Date.now() - cached.timestamp < CACHE_EXPIRE_MS) {
        resolve(cached);
      } else {
        resolve(null);
      }
    });
  });
}

// 保存评分到缓存
function saveToCache(url, score, reason) {
  const key = urlToKey(url);
  chrome.storage.local.set({
    [key]: {
      score: score,
      reason: reason || "",
      timestamp: Date.now(),
    },
  });
}

async function processResults() {
  const urlParams = new URLSearchParams(window.location.search);
  const query = urlParams.get("q");
  if (!query) return;

  const snippets = document.querySelectorAll(
    'div.VwiC3b, div.ItzFZd, div[style*="-webkit-line-clamp"]'
  );

  let newItems = [];

  for (const snippetNode of snippets) {
    if (snippetNode.classList.contains(PROCESSED_CLASS)) continue;

    const card =
      snippetNode.closest("div.g") || snippetNode.closest("div.MjjYud");
    if (!card) continue;

    // 提取 URL 作为唯一 ID
    const url = extractUrlFromCard(card);
    if (!url) continue;

    snippetNode.classList.add(PROCESSED_CLASS);
    const text = snippetNode.innerText.trim();
    if (text.length < 10) continue;

    // 使用 URL 的哈希作为 DOM ID（避免特殊字符）
    const domId =
      "b_" +
      btoa(url)
        .replace(/[^a-zA-Z0-9]/g, "")
        .slice(0, 20);

    // 检查是否已经创建过 badge（防止重复）
    if (document.getElementById(domId)) continue;

    // UI 占位
    const badge = document.createElement("div");
    badge.id = domId;
    badge.className = "gemini-badge loading";
    badge.innerHTML = "<span>●</span>";
    snippetNode.insertBefore(badge, snippetNode.firstChild);

    // 检查缓存
    const cached = await getFromCache(url);
    if (cached) {
      // 命中缓存，直接渲染
      renderBadge(badge, cached.score, cached.reason);
    } else {
      // 未命中缓存，加入请求队列
      newItems.push({ id: domId, url: url, text: text });
    }
  }

  if (newItems.length > 0) {
    batchQueue = batchQueue.concat(newItems);
    clearTimeout(processTimer);
    processTimer = setTimeout(() => dispatchBatches(query), 200);
  }
}

function dispatchBatches(query) {
  if (batchQueue.length === 0) return;

  const allItems = [...batchQueue];
  batchQueue = [];

  // 分块发送，每块 5 个
  const CHUNK_SIZE = 5;

  for (let i = 0; i < allItems.length; i += CHUNK_SIZE) {
    const chunk = allItems.slice(i, i + CHUNK_SIZE);
    const delay = i === 0 ? 0 : 600 * (i / CHUNK_SIZE);

    setTimeout(() => {
      sendChunk(chunk, query);
    }, delay);
  }
}

function sendChunk(chunk, query) {
  chrome.runtime.sendMessage(
    {
      action: "analyzeFastBatch",
      query: query,
      items: chunk,
    },
    (response) => {
      if (chrome.runtime.lastError || !response || response.error) {
        // 生产环境静默失败，或者只显示简单错误图标
        chunk.forEach((item) => {
          const el = document.getElementById(item.id);
          if (el) {
            if (response?.error === "RATE_LIMIT") {
              el.innerText = "⏳";
            } else if (response?.error === "NO_API_KEY") {
              el.className = "gemini-badge error";
              el.innerText = "未配置 Key";
            } else {
              el.style.display = "none"; // 其他错误直接隐藏
            }
          }
        });
        // 仅在控制台保留严重错误，方便排查
        if (response?.error) console.error("AI Scorer Error:", response.error);
        return;
      }

      // 构建结果映射（支持 score 和 reason）
      const resultMap = {};
      if (response.results) {
        response.results.forEach((r) => {
          resultMap[r.id] = { score: r.s, reason: r.reason || "" };
        });
      }

      chunk.forEach((item) => {
        const el = document.getElementById(item.id);
        const result = resultMap[item.id];

        if (el && result && result.score !== undefined) {
          // 渲染 Badge
          renderBadge(el, result.score, result.reason);

          // 保存到缓存
          saveToCache(item.url, result.score, result.reason);
        }
      });
    }
  );
}

let timer;
const observer = new MutationObserver(() => {
  clearTimeout(timer);
  timer = setTimeout(processResults, 500);
});
observer.observe(document.body, { childList: true, subtree: true });
setTimeout(processResults, 500);
