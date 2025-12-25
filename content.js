// 生产环境版 Content Script
// 已移除调试日志，已对接 CSS Class

const PROCESSED_CLASS = 'sss-processed-v10';
let batchQueue = [];
let processTimer = null;

// 新版样式生成器：返回 CSS 类名，而不是硬编码颜色
function getScoreData(score) {
    if (score >= 85) return { class: 'score-high', icon: '🌟' };
    if (score >= 60) return { class: 'score-mid', icon: '👌' };
    if (score >= 30) return { class: 'score-low', icon: '🤔' };
    return { class: 'score-bad', icon: '🗑️' };
}

function processResults() {
    const urlParams = new URLSearchParams(window.location.search);
    const query = urlParams.get('q');
    if (!query) return;

    const snippets = document.querySelectorAll('div.VwiC3b, div.ItzFZd, div[style*="-webkit-line-clamp"]');
    
    let newItems = [];

    snippets.forEach((snippetNode) => {
        if (snippetNode.classList.contains(PROCESSED_CLASS)) return;
        
        const card = snippetNode.closest('div.g') || snippetNode.closest('div.MjjYud');
        if (!card) return;

        snippetNode.classList.add(PROCESSED_CLASS);
        const text = snippetNode.innerText.trim();
        if (text.length < 10) return;

        const uniqueId = Math.random().toString(36).substr(2, 9);
        
        // UI 占位
        const badge = document.createElement('div');
        badge.id = `b_${uniqueId}`;
        badge.className = 'gemini-badge loading';
        badge.innerHTML = '<span>●</span>'; 
        snippetNode.insertBefore(badge, snippetNode.firstChild);

        newItems.push({ id: uniqueId, text: text });
    });

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
    chrome.runtime.sendMessage({
        action: "analyzeFastBatch",
        query: query,
        items: chunk
    }, (response) => {
        
        if (chrome.runtime.lastError || !response || response.error) {
            // 生产环境静默失败，或者只显示简单错误图标
            chunk.forEach(item => {
                const el = document.getElementById(`b_${item.id}`);
                if(el) {
                    if(response?.error === 'RATE_LIMIT') {
                        el.innerText = '⏳'; 
                    } else if (response?.error === 'NO_API_KEY') {
                        el.className = 'gemini-badge error';
                        el.innerText = '未配置 Key';
                    } else {
                        el.style.display = 'none'; // 其他错误直接隐藏
                    }
                }
            });
            // 仅在控制台保留严重错误，方便排查
            if(response?.error) console.error("AI Scorer Error:", response.error);
            return;
        }

        const scoreMap = {};
        if (response.results) {
            response.results.forEach(r => scoreMap[r.id] = r.s);
        }

        chunk.forEach(item => {
            const el = document.getElementById(`b_${item.id}`);
            const score = scoreMap[item.id];
            
            if (el && score !== undefined) {
                // 使用新的 CSS Class 逻辑
                const styleData = getScoreData(score);
                el.className = `gemini-badge fade-in ${styleData.class}`;
                // 清空内联样式，让 CSS Class 生效
                el.style.backgroundColor = '';
                el.style.color = '';
                el.style.border = '';
                
                el.innerHTML = `<span style="margin-right:4px">${styleData.icon}</span><b>${score}</b>`;
            }
        });
    });
}

let timer;
const observer = new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(processResults, 500);
});
observer.observe(document.body, { childList: true, subtree: true });
setTimeout(processResults, 500);