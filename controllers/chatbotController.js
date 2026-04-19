const fs = require("fs/promises");
const path = require("path");
const { GoogleGenAI } = require("@google/genai");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const PROMPT_FILE_CANDIDATES = ["chatbot_prompt.txt", "chatbot prompt.txt"];
const DEFAULT_MODEL = "gemini-2.5-flash";
const MAX_HISTORY_MESSAGES = 16;

const getApiKey = () => process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;

const normalizeHistory = (history) => {
  if (!Array.isArray(history)) return [];

  return history
    .slice(-MAX_HISTORY_MESSAGES)
    .map((item) => {
      if (!item || typeof item !== "object") return null;

      const role = item.role === "model" ? "model" : "user";
      const text = typeof item.text === "string" ? item.text.trim() : "";
      if (!text) return null;

      return {
        role,
        parts: [{ text }],
      };
    })
    .filter(Boolean);
};

const readSystemPrompt = async () => {
  for (const fileName of PROMPT_FILE_CANDIDATES) {
    const fullPath = path.join(PROJECT_ROOT, fileName);

    try {
      const content = await fs.readFile(fullPath, "utf8");
      const trimmed = content.trim();
      if (trimmed) return trimmed;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }

  throw new Error("System prompt file was not found.");
};

const extractResponseText = (response) => {
  if (typeof response?.text === "string" && response.text.trim()) {
    return response.text.trim();
  }

  const candidates = Array.isArray(response?.candidates) ? response.candidates : [];
  for (const candidate of candidates) {
    const parts = candidate?.content?.parts;
    if (!Array.isArray(parts)) continue;

    const joined = parts
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .join("\n")
      .trim();

    if (joined) return joined;
  }

  return "";
};

exports.sendMessage = async (req, res) => {
  const userMessage = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  const history = normalizeHistory(req.body?.history);

  if (!userMessage) {
    return res.status(400).json({ error: "Message cannot be empty." });
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    return res.status(500).json({
      error:
        "Chatbot API key is missing. Set GOOGLE_API_KEY or GEMINI_API_KEY in your environment.",
    });
  }

  let systemPrompt;
  try {
    systemPrompt = await readSystemPrompt();
  } catch (error) {
    console.error("Failed to load chatbot system prompt:", error.message);
    return res.status(500).json({ error: "Failed to load chatbot system prompt." });
  }

  const ai = new GoogleGenAI({ apiKey });
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [...history, { role: "user", parts: [{ text: userMessage }] }],
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.45,
      },
    });

    const reply = extractResponseText(response);
    if (!reply) {
      return res
        .status(502)
        .json({ error: "The chatbot did not return a response. Please try again." });
    }

    return res.status(200).json({ reply, model });
  } catch (error) {
    console.error("Google GenAI request failed:", error.message || error);
    return res.status(502).json({
      error: "Unable to get a response from the chatbot right now. Please try again.",
    });
  }
};
