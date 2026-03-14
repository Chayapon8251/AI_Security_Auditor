import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import WebSocket from 'ws';
import * as dotenv from 'dotenv';

dotenv.config();

@WebSocketGateway({ cors: { origin: '*' }, transports: ['websocket'], upgrade: false }) // ยอมรับ Connection จาก Next.js
export class GeminiGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  // เก็บ Session ของ Gemini แยกตาม Client ID
  private geminiSessions: Map<string, WebSocket> = new Map();
  private readonly GEMINI_MODEL = 'models/gemini-2.0-flash-exp';

  handleConnection(client: Socket) {
    console.log(`🟢 Client connected: ${client.id}`);
    this.connectToGemini(client);
  }

  handleDisconnect(client: Socket) {
    console.log(`🔴 Client disconnected: ${client.id}`);
    const ws = this.geminiSessions.get(client.id);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
    this.geminiSessions.delete(client.id);
  }

  private connectToGemini(client: Socket) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('Missing GEMINI_API_KEY');
      return;
    }

    // URL สำหรับเชื่อมต่อ Gemini Live API แบบ Bidi (Bidirectional)
    const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`;
    const geminiWs = new WebSocket(url);

    geminiWs.on('open', () => {
      console.log(`🚀 Connected to Gemini API for client: ${client.id}`);

      // 1. ส่ง Setup Message ทันทีที่เชื่อมต่อ เพื่อกำหนด Persona (สำคัญมากสำหรับ Hackathon!)
      const setupMessage = {
        setup: {
          model: this.GEMINI_MODEL,
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: "Aoide", // ลองเลือกชื่อ Aoide, Charon, หรือ Puck ดูครับ
                }
              }
            } // บังคับให้ AI ตอบกลับมาเป็นเสียง
          },
          systemInstruction: {
            parts: [{
              text: "You are an elite Cybersecurity Auditor assisting a developer. You can see their screen and hear their voice. Analyze the code, logs, or UI they show you. Identify vulnerabilities, hardcoded secrets, or misconfigurations. Be concise, professional, and speak directly to the developer."
            }]
          }
        }
      };
      geminiWs.send(JSON.stringify(setupMessage));

      // 2. ส่งคำสั่งลับให้ AI พูดเปิดตัว (ทำหลังจากส่ง Setup 1 วินาที)
      setTimeout(() => {
        const greeting = {
          realtimeInput: {
            mediaChunks: [{
              mimeType: "text/plain",
              data: Buffer.from("User is ready. Please greet them as a professional Security Auditor and mention that you are monitoring their screen in real-time.").toString('base64')
            }]
          }
        };
        geminiWs.send(JSON.stringify(greeting));
      }, 1000);
    });

    geminiWs.on('message', (data: WebSocket.Data) => {
      try {
        const response = JSON.parse(data.toString());

        // 1. เช็คว่าการ Setup สำเร็จหรือไม่ (เอาไว้ดูใน Log เพื่อความมั่นใจ)
        if (response.setupComplete) {
          console.log(`✅ Setup complete for client: ${client.id}`);
        }

        // 2. ส่งข้อมูล modelTurn ไปที่ Frontend (ซึ่งมีก้อน Audio PCM อยู่ข้างใน)
        if (response.serverContent?.modelTurn) {
          client.emit('gemini-response', response.serverContent.modelTurn);
        }
      } catch (error) {
        console.error('Error parsing Gemini response:', error);
      }
    });

    geminiWs.on('error', (error) => {
      console.error(`Gemini WS Error for ${client.id}:`, error);
    });

    this.geminiSessions.set(client.id, geminiWs);
  }

  // รับ Event 'media-stream' จาก Next.js (ภาพและเสียง) แล้วยิงตรงเข้า Gemini
  @SubscribeMessage('media-stream')
  handleMediaStream(client: Socket, payload: any) {
    const ws = this.geminiSessions.get(client.id);
    if (ws && ws.readyState === WebSocket.OPEN) {
      // payload ถูกจัด format มาจากหน้าเว็บเรียบร้อยแล้ว { realtimeInput: { mediaChunks: [...] } }
      ws.send(JSON.stringify(payload));
    }
  }
}