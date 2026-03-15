import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import WebSocket from 'ws';

@Injectable()
@WebSocketGateway({ cors: { origin: '*' }, transports: ['websocket'], upgrade: false }) // ยอมรับ Connection จาก Next.js
export class GeminiGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  // เก็บ Session ของ Gemini แยกตาม Client ID
  private geminiSessions: Map<string, WebSocket> = new Map();
  private readonly GEMINI_MODEL = 'models/gemini-2.5-flash-native-audio-preview-12-2025';

  constructor(private configService: ConfigService) {}

  handleConnection(client: Socket) {
    console.log(`🟢 Client connected: ${client.id}`);
    //this.connectToGemini(client);
  }

  @SubscribeMessage('start-session')
  handleStartSession(client: Socket) {
    console.log(`🚀 Client ${client.id} requested to start Gemini session!`);
    
    // เคลียร์ Session เก่า (ถ้ามี)
    const existingWs = this.geminiSessions.get(client.id);
    if (existingWs && existingWs.readyState === WebSocket.OPEN) {
      console.log(`🧹 Cleaning up ghost connection for client ${client.id}`);
      existingWs.close();
    }

    this.connectToGemini(client);
  }

  @SubscribeMessage('stop-session')
  handleStopSession(client: Socket) {
    console.log(`🛑 Client ${client.id} stopped the session.`);
    const ws = this.geminiSessions.get(client.id);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
    this.geminiSessions.delete(client.id);
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
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      console.error('❌ Missing GEMINI_API_KEY in ConfigService');
      return;
    }
    console.log('✅ API Key found, connecting to Gemini...');
    const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;
    const geminiWs = new WebSocket(url);

    geminiWs.on('open', () => {
      console.log(`🚀 Connected to Gemini API for client: ${client.id}`);
      // 1. ส่ง Setup Message ทันทีที่เชื่อมต่อ
      const setupMessage = {
        setup: {
          model: this.GEMINI_MODEL,
          generationConfig: {
            responseModalities: ["AUDIO"],
          },
          systemInstruction: {
            parts: [{
              text: "You are an elite Cybersecurity Auditor assisting a developer. You can see their screen and hear their voice. Analyze the code, logs, or UI they show you. Identify vulnerabilities, hardcoded secrets, or misconfigurations. Be concise, professional, and speak directly to the developer."
            }]
          }
        }
      };
      geminiWs.send(JSON.stringify(setupMessage));
    });

    geminiWs.on('message', (data: WebSocket.Data) => {
      try {
        const response = JSON.parse(data.toString());
        // ปิด Log ยาวๆ ไปก่อน จะได้ไม่งง
        console.log('📨 Gemini raw response:', JSON.stringify(response).slice(0, 200));

        // 2. รอ setupComplete แล้วค่อยส่ง greeting ผ่าน clientContent (วิธีที่ถูกต้อง)
        if (response.setupComplete) {
          console.log(`✅ Setup complete for client: ${client.id}. Sending greeting...`);
          const greeting = {
            clientContent: {
              turns: [{
                role: "user",
                parts: [{
                  text: "Please greet the user as a professional Security Auditor and mention that you are monitoring their screen in real-time."
                }]
              }],
              turnComplete: true
            }
          };
          geminiWs.send(JSON.stringify(greeting));
        }

        // 3. ส่ง Audio กลับไปให้ Client
        if (response.serverContent?.modelTurn) {
          console.log('🔊 Audio data received from Gemini, emitting to client...');
          client.emit('gemini-response', response.serverContent.modelTurn);
        }
      } catch (error) {
        console.error('❌ Error parsing Gemini response:', error);
      }
    });

    // ✅ เพิ่มการดักจับ Error และ Close ฝั่ง Gemini จะได้รู้ถ้า Google ตัดสาย
    geminiWs.on('close', (code, reason) => {
      console.log(`⚠️ Gemini connection closed for client ${client.id} | Code: ${code}, Reason: ${reason}`);
    });

    geminiWs.on('error', (error) => {
      console.error(`❌ Gemini WebSocket Error for client ${client.id}:`, error);
    });

    this.geminiSessions.set(client.id, geminiWs);
  }

  // รับ Event 'media-stream' จาก Next.js (ภาพและเสียง) แล้วยิงตรงเข้า Gemini
  @SubscribeMessage('media-stream')
  handleMediaStream(client: Socket, payload: any) {
    // 💡 Log เพื่อเช็คว่า Next.js ส่งอะไรมาให้เราตอนเราพูด
    console.log('🎤 Received audio chunk from Next.js:', payload?.realtimeInput?.mediaChunks?.[0]?.mimeType);
    const ws = this.geminiSessions.get(client.id);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }

  // 🧪 Test function: ส่ง text ไปให้ Gemini โดยตรง เพื่อเช็คว่า Gemini ตอบกลับได้ไหม
  @SubscribeMessage('test-message')
  handleTestMessage(client: Socket, text: string) {
    console.log(`🧪 Test message from client ${client.id}:`, text);
    const ws = this.geminiSessions.get(client.id);
    if (ws && ws.readyState === WebSocket.OPEN) {
      const testPayload = {
        clientContent: {
          turns: [{
            role: "user",
            parts: [{ text: text || "Hello, can you hear me?" }]
          }],
          turnComplete: true
        }
      };
      ws.send(JSON.stringify(testPayload));
      console.log('🧪 Test payload sent to Gemini');
    } else {
      console.log('❌ No active Gemini session for this client');
    }
  }
}