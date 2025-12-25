chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "analyzeFastBatch") {
    routeRequest(request, sendResponse);
    return true;
  }
});

// --- 通用重试机制 (指数退避) ---
async function fetchWithRetry(url, options, maxRetries = 3) {
  let lastError;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await fetch(url, options);

      // 如果是 429 Rate Limit，进入重试逻辑
      if (res.status === 429) {
        const waitTime = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
        console.warn(
          `[AI Scorer] Rate limited (429). Retry ${
            attempt + 1
          }/${maxRetries} in ${waitTime}ms...`
        );

        if (attempt < maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, waitTime));
          continue; // 继续重试
        } else {
          // 最后一次尝试仍然 429，抛出错误
          throw new Error("RATE_LIMIT");
        }
      }

      // 其他状态码直接返回
      return res;
    } catch (e) {
      lastError = e;

      // 网络错误也可以重试
      if (attempt < maxRetries - 1 && e.name !== "AbortError") {
        const waitTime = Math.pow(2, attempt) * 1000;
        console.warn(
          `[AI Scorer] Network error. Retry ${
            attempt + 1
          }/${maxRetries} in ${waitTime}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        continue;
      }
    }
  }

  throw lastError || new Error("FETCH_FAILED");
}

async function routeRequest(request, sendResponse) {
  const config = await chrome.storage.local.get([
    "provider",
    "geminiKey",
    "openaiKey",
    "openaiUrl",
    "openaiModel",
  ]);

  // 默认走 Gemini
  const provider = config.provider || "gemini";

  if (provider === "gemini") {
    if (!config.geminiKey) return sendResponse({ error: "NO_API_KEY" });
    await callGemini(request, config.geminiKey, sendResponse);
  } else {
    if (!config.openaiKey) return sendResponse({ error: "NO_API_KEY" });
    await callOpenAI(request, config, sendResponse);
  }
}

// 统一解析 AI 返回的 JSON，将 r 字段映射为 reason
function parseAIResponse(text) {
  const cleanText = text.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(cleanText);

  // 映射字段：id 保持不变，s -> s, r -> reason
  return parsed.map((item) => ({
    id: item.id,
    s: item.s,
    reason: item.r || "",
  }));
}

// --- Gemini 引擎 ---
async function callGemini(request, apiKey, sendResponse) {
  try {
    // 构建数据文本
    const itemsText = request.items
      .map((i) => `{id:"${i.id}", text:"${i.text.substring(0, 150)}"}`)
      .join("\n");

    // 新版 Prompt：要求返回分数和简短理由
    const prompt = `你是搜索结果评分专家。根据用户搜索意图，为每条结果打分并给出简短理由。

要求：
1. 返回纯JSON数组，不要markdown代码块
2. 格式：[{"id":"原始id","s":分数,"r":"理由"}]
3. 分数(s)：0-100，越相关越高
4. 理由(r)：不超过10个中文字，如"官方文档"、"内容农场"、"广告嫌疑"、"内容陈旧"、"高质量教程"等

用户搜索："${request.query}"

待评估数据：
${itemsText}`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    // 使用带重试的 fetch
    const res = await fetchWithRetry(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });

    const json = await res.json();
    if (json.error) return sendResponse({ error: json.error.message });

    const text = json.candidates[0].content.parts[0].text;
    const results = parseAIResponse(text);
    sendResponse({ results });
  } catch (e) {
    if (e.message === "RATE_LIMIT") {
      sendResponse({ error: "RATE_LIMIT" });
    } else {
      sendResponse({ error: e.message });
    }
  }
}

// --- OpenAI / DeepSeek 兼容引擎 ---
async function callOpenAI(request, config, sendResponse) {
  try {
    const itemsText = request.items
      .map((i) => `{id:"${i.id}", text:"${i.text.substring(0, 150)}"}`)
      .join("\n");

    // 新版 Prompt：要求返回分数和简短理由
    const messages = [
      {
        role: "system",
        content: `你是搜索结果评分专家。根据用户搜索意图，为每条结果打分并给出简短理由。

要求：
1. 返回纯JSON数组，不要markdown代码块
2. 格式：[{"id":"原始id","s":分数,"r":"理由"}]
3. 分数(s)：0-100，越相关越高
4. 理由(r)：不超过10个中文字，如"官方文档"、"内容农场"、"广告嫌疑"、"内容陈旧"、"高质量教程"等`,
      },
      {
        role: "user",
        content: `用户搜索："${request.query}"\n\n待评估数据：\n${itemsText}`,
      },
    ];

    // 支持 DeepSeek 等任何兼容接口
    const url =
      (config.openaiUrl || "https://api.openai.com/v1").replace(/\/$/, "") +
      "/chat/completions";

    // 使用带重试的 fetch
    const res = await fetchWithRetry(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.openaiKey}`,
      },
      body: JSON.stringify({
        model: config.openaiModel || "gpt-3.5-turbo",
        messages: messages,
        temperature: 0.3,
      }),
    });

    const json = await res.json();
    if (json.error) return sendResponse({ error: json.error.message });

    const text = json.choices[0].message.content;
    const results = parseAIResponse(text);
    sendResponse({ results });
  } catch (e) {
    if (e.message === "RATE_LIMIT") {
      sendResponse({ error: "RATE_LIMIT" });
    } else {
      sendResponse({ error: e.message });
    }
  }
}
