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