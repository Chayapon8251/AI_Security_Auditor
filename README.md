# 🛡️ Nexus SOC Auditor

Nexus SOC Auditor is a next-generation Live Agent built for the #GeminiLiveAgentChallenge. It acts as a real-time cybersecurity assistant that "sees" your screen and "hears" your voice to identify code vulnerabilities, misconfigurations, and hardcoded secrets on the fly.

## Demo clip
https://youtu.be/-j0HGmlforc

## The "Wow" Factor
This project goes beyond text-in/text-out. It leverages the **Gemini Live API** to establish a bidirectional WebSocket connection. The agent processes interleaved multimodal inputs (real-time screen capture + microphone audio) and delivers professional audio responses directly to the developer, acting as an elite, on-demand SOC Analyst.

## Architecture & Tech Stack
- **Frontend:** Next.js (React), WebRTC (Screen/Audio Capture), HTML5 Canvas, Tailwind CSS.
- **Backend:** NestJS, Socket.io, Google GenAI SDK (Gemini BidiGenerateContent).
- **Cloud Infrastructure:** Google Cloud Platform (Compute Engine VM).
- **CI/CD:** GitHub Actions & Docker.

## Spin-up Instructions (How to reproduce)
We have fully containerized this project to make it incredibly easy for judges to run.

### Prerequisites
- Docker & Docker Compose installed on your machine.
- A Gemini API Key.

### 3 Simple Steps to Run
1. **Clone the repository:**
   ```bash
   git clone https://github.com/YOUR_USERNAME/AI_Security_Auditor.git
   cd AI_Security_Auditor
2. **Set up the Environment Variable:**
**_Create a .env file in the root directory and add your Gemini API Key**
   ```bash
    GEMINI_API_KEY=your_gemini_api_key_here
   ```
3. **Spin it up using Docker Compose:**
   ```bash
    docker compose up -d --build
   ```
## ⚠️ Important: Browser Configuration (Required)
Since this project requires **Screen & Audio Capture** via WebRTC, modern browsers require a **Secure Context (HTTPS)**. If you are running this on `http://localhost` or a remote IP via HTTP, you must manually enable this flag to allow the browser to access your screen/mic:

### For Google Chrome:
1. Copy and paste this into your address bar: 
   `chrome://flags/#unsafely-treat-insecure-origin-as-secure`
2. Set the policy to **Enabled**.
3. In the text box, add your site URL (e.g., `http://34.142.131.101` or `http://localhost:3000`).
4. Click **Relaunch** at the bottom.

### For Microsoft Edge:
1. Copy and paste this into your address bar: 
   `edge://flags/#unsafely-treat-insecure-origin-as-secure`
2. Set the policy to **Enabled**.
3. Add your site URL in the text box.
4. Click **Restart**.

> **Note:** Without this step, the "Start Capture" button will not work due to browser security policies.