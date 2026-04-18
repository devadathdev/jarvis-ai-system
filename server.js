require("dotenv").config();

console.log("API KEY:", process.env.OPENAI_API_KEY);

const express = require("express");
const axios = require("axios");
const cors = require("cors");
const fs = require("fs");
const { exec } = require("child_process");

const app = express();
app.use(express.json());
app.use(cors());

// 📂 JSON DATABASE FILE
const DB_FILE = "data.json";

// 🔧 INIT DB
function initDB() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({
      messages: [],
      workflows: []
    }, null, 2));
  }
}

initDB();

// 📖 LOAD DB
function loadDB() {
  return JSON.parse(fs.readFileSync(DB_FILE));
}

// 💾 SAVE DB
function saveDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// 🔥 WORKFLOW ENGINE
let workflows = [];

function loadWorkflows() {
  const data = loadDB();
  workflows = data.workflows.map(w => createWorkflow(w));
}

function createWorkflow(w) {
  return {
    name: w.name,
    time: parseInt(w.time),

    condition: () => {
      const hour = new Date().getHours();
      return hour >= w.time;
    },

    actions: [
      () => exec("am start -a android.intent.action.VIEW -d https://youtube.com")
    ]
  };
}

loadWorkflows();

// 🔄 RUN WORKFLOWS
setInterval(() => {
  workflows.forEach(w => {
    if (w.condition()) {
      w.actions.forEach(a => a());
    }
  });
}, 5000);

// 🏠 ROOT
app.get("/", (req, res) => {
  res.send("Jarvis JSON backend running");
});

// 📜 GET HISTORY
app.get("/history", (req, res) => {
  const data = loadDB();
  res.json(data.messages);
});

// 🤖 MAIN ROUTE
app.post("/ask", async (req, res) => {
  const message = req.body.message.toLowerCase();

  const data = loadDB();

  // 🔥 CREATE WORKFLOW
  if (message.includes("create workflow")) {
    const match = message.match(/\d+/);

    if (!match) {
      return res.json({ reply: "Specify hour (0-23)" });
    }

    const hour = match[0];

    data.workflows.push({
      name: "auto workflow",
      time: hour
    });

    saveDB(data);
    loadWorkflows();

    return res.json({ reply: `Workflow saved for ${hour}:00` });
  }

  // 💾 SAVE USER MESSAGE
  data.messages.push({ role: "user", content: message });
  saveDB(data);

  // ⚙️ PYTHON CORE
  exec(`python ../core/jarvis.py "${message}"`, async (err, stdout) => {

    const pythonReply = stdout.trim();

    // ✅ PYTHON HANDLED
    if (pythonReply && pythonReply !== "AI_FALLBACK") {
      return res.json({ reply: pythonReply });
    }

    // 🧠 AI FALLBACK
    try {
  const response = await axios.post(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      model: "openrouter/auto",
      messages: [{ role: "user", content: message }]
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost",
        "X-Title": "Jarvis"
      }
    }
  );

  const reply = response.data.choices[0].message.content;

  data.messages.push({ role: "assistant", content: reply });
  saveDB(data);

  return res.json({ reply });

} catch (error) {
  console.log("==== FULL ERROR START ====");
  console.log(error);
  console.log("---- RESPONSE ----");
  console.log(error.response?.data);
  console.log("==== FULL ERROR END ====");

  return res.json({ reply: "AI error" });
}
  });
});

// 🚀 START SERVER
app.listen(3000, () => {
  console.log("Server running (JSON DB)");
});