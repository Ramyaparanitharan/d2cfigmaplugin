// npm install express openai dotenv node-fetch cors
const os = require("os");
const archiver = require("archiver");
const express = require("express");
const path = require("path");
const cors = require("cors");
const { OpenAI } = require("openai");
const fs = require("fs");

const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

require("dotenv").config();

const app = express();

// Allow CORS from any origin (for development use only)
app.use(cors({
  origin: "*", 
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"]
}));

app.use(express.json({ limit: "10mb" }));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const downloadsDir = path.join(os.homedir(), "Downloads");
if (!fs.existsSync(downloadsDir)) {
  fs.mkdirSync(downloadsDir, { recursive: true });
}
const downloadsPath = path.join(downloadsDir, "generated-ui.zip");
console.log("downloaded path", downloadsPath)
// Serve your UI
app.use(express.static(path.join(__dirname, "frontend")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "frontend", "ui.html"));  
});

function createZipWithHTMLAndCSS(html, css) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(downloadsPath);
    const archive = archiver("zip", { zlib: { level: 9 } });
    console.log("OUTPUT", output)
    output.on("close", () => {
      resolve();
    });

    output.on("error", (err) => {
      console.error("❌ Stream error:", err);
      reject(err);
    });

    archive.on("error", (err) => {
      console.error("❌ Archiver error:", err);
      reject(err);
    });

    archive.pipe(output);

    // Add files to folders inside zip
    archive.append(html, { name: "html/index.html" });
    archive.append(css, { name: "css/styles.css" });

    archive.finalize();
  });
}
app.post("/api/generate-html", async (req, res) => {
  const { imageUrl } = req.body;

  if (!imageUrl) {
    return res.status(400).json({ error: "Missing imageUrl" });
  }

  try {
    // Step 1: Fetch the image from URL
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch image: ${imageResponse.statusText}`);
    }

    // Step 2: Convert image to base64
    const buffer = await imageResponse.arrayBuffer();
    const imageBase64 = Buffer.from(buffer).toString("base64");

    // Step 3: Use OpenAI Vision API
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `
    Generate responsive HTML and CSS for this UI image.
    
    ### Requirements:
    - Create folders for \`html\` and \`css\` separately.
    - Place the HTML and CSS files in their respective folders.
    - Use clean, semantic HTML5 and responsive CSS (Flexbox or Grid preferred).
    
    ### File Output Structure:
    - For **Raw HTML & CSS**: Provide code blocks for:
      - \`{screen_name}.html\`
      - \`styles.css\`
      - (Optional) \`{screen_name}.js\` if JavaScript is required
    
    Now generate the output for the following image:
            `.trim(),
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/png;base64,${imageBase64}`,
              },
            },
          ],
        },
      ],
      max_tokens: 3000,
    });

    const code = response.choices[0].message.content;
    const extractCodeBlocks = (text) => {
      const htmlMatch = text.match(/```html([\s\S]*?)```/);
      const cssMatch = text.match(/```css([\s\S]*?)```/);
      
      return {
        html: htmlMatch ? htmlMatch[1].trim() : "",
        css: cssMatch ? cssMatch[1].trim() : "",
      };
    };
    const { html, css } = extractCodeBlocks(code);
    console.log("****>>> html", html, "<<<< crew", css)
    await createZipWithHTMLAndCSS(html, css);
    res.json({ message: "Code and ZIP generated successfully", zipPath: downloadsPath });


  } catch (err) {
    console.error("OpenAI error:", err);
    res.status(500).send("Error generating code");
  }
});

app.listen(3000, () => console.log("Server running on http://localhost:3000"));
