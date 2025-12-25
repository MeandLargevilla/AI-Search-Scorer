chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "analyzeFastBatch") {
        routeRequest(request, sendResponse);
        return true;
    }
});

async function routeRequest(request, sendResponse) {
    const config = await chrome.storage.local.get(['provider', 'geminiKey', 'openaiKey', 'openaiUrl', 'openaiModel']);
    
    // 默认走 Gemini
    const provider = config.provider || 'gemini';

    if (provider === 'gemini') {
        if (!config.geminiKey) return sendResponse({ error: "NO_API_KEY" });
        await callGemini(request, config.geminiKey, sendResponse);
    } else {
        if (!config.openaiKey) return sendResponse({ error: "NO_API_KEY" });
        await callOpenAI(request, config, sendResponse);
    }
}

// --- Gemini 引擎 (之前写的 V9.0 逻辑) ---
async function callGemini(request, apiKey, sendResponse) {
    // ... (这里保持之前 V9.0 handleFastBatch 内部 fetch 的逻辑，把 url 里的 key 换成 apiKey 即可)
    // 为了节省篇幅，逻辑同上一个回复，只需注意 Prompt 格式
    try {
        // 简化的 Prompt 构建
        const itemsText = request.items.map(i => `{id:"${i.id}", text:"${i.text.substring(0,100)}"}`).join("\n");
        const prompt = `打分(0-100)，JSON数组格式 [{"id":"x","s":80}]，不要markdown。\n关键词:"${request.query}"\n数据:\n${itemsText}`;
        
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        const json = await res.json();
        if(json.error) return sendResponse({error: json.error.message});
        
        const text = json.candidates[0].content.parts[0].text.replace(/```json|```/g, '').trim();
        sendResponse({ results: JSON.parse(text) });
    } catch (e) { sendResponse({error: e.message}); }
}

// --- OpenAI / DeepSeek 兼容引擎 ---
async function callOpenAI(request, config, sendResponse) {
    try {
        const itemsText = request.items.map(i => `{id:"${i.id}", text:"${i.text.substring(0,100)}"}`).join("\n");
        // OpenAI 的 Prompt 稍微不同，通常用 system role
        const messages = [
            { role: "system", content: "You are a search scorer. Return ONLY a JSON array: [{\"id\":\"uid\",\"s\":80}]. 0-100 score. No markdown." },
            { role: "user", content: `Query: ${request.query}\nData:\n${itemsText}` }
        ];

        // 支持 DeepSeek 等任何兼容接口
        const url = (config.openaiUrl || "https://api.openai.com/v1").replace(/\/$/, '') + "/chat/completions";
        
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.openaiKey}`
            },
            body: JSON.stringify({
                model: config.openaiModel || "gpt-3.5-turbo",
                messages: messages,
                temperature: 0.3
            })
        });

        const json = await res.json();
        if(json.error) return sendResponse({error: json.error.message});
        
        const text = json.choices[0].message.content.replace(/```json|```/g, '').trim();
        sendResponse({ results: JSON.parse(text) });

    } catch (e) { sendResponse({error: e.message}); }
}