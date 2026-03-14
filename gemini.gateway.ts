import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import * as WebSocket from 'ws';

@WebSocketGateway({ cors: { origin: '*' } }) // อนุญาตให้ Next.js เชื่อมต่อได้
export class GeminiGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private geminiWs: WebSocket;
  // ใช้ Model ตัวใหม่ล่าสุดที่รองรับ Live API
  private readonly GEMINI_MODEL = 'models/gemini-2.0-flash-exp'; 

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
    this.connectToGemini(client);
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
    if (this.geminiWs && this.geminiWs.readyState === WebSocket.OPEN) {
      this.geminiWs.close();
    }
  }

  private connectToGemini(client: Socket) {
    const apiKey = process.env.GEMINI_API_KEY; // อย่าลืมใส่ในไฟล์ .env
    const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`;

    this.geminiWs = new WebSocket(url);

    this.geminiWs.on('open', () => {
      console.log('Connected to Gemini Live API');
      // ทันทีที่เชื่อมต่อได้ เราต้องส่ง Setup Message เพื่อตั้งค่า Persona ให้ AI
      const setupMessage = {
        setup: {
          model: this.GEMINI_MODEL,
          systemInstruction: {
            parts: [{ 
              text: "You are an expert Cybersecurity Auditor. You will analyze the user's screen (code, logs, or UI) and audio. Point out vulnerabilities, misconfigurations, or risks concisely. Keep responses short and professional." 
            }]
          }
        }
      };
      this.geminiWs.send(JSON.stringify(setupMessage));
    });

    this.geminiWs.on('message', (data: WebSocket.Data) => {
      // รับข้อมูลกลับมาจาก Gemini (ส่วนใหญ่จะเป็น Audio/PCM และ Text)
      const response = JSON.parse(data.toString());
      
      // ดึงเอาส่วนที่เป็น Audio หรือ Text ส่งกลับไปให้ Frontend (Next.js)
      if (response.serverContent?.modelTurn) {
        client.emit('gemini-response', response.serverContent.modelTurn);
      }
    });

    this.geminiWs.on('error', (error) => {
      console.error('Gemini WS Error:', error);
    });
  }

  // รับภาพและเสียงจาก Frontend แล้วส่งต่อให้ Gemini
  @SubscribeMessage('media-stream')
  handleMediaStream(client: Socket, payload: any) {
    if (this.geminiWs && this.geminiWs.readyState === WebSocket.OPEN) {
      // payload จาก Frontend ควรเป็น Format RealtimeInput ของ Gemini
      // เช่น { realtimeInput: { mediaChunks: [ { mimeType: "image/jpeg", data: "base64..." } ] } }
      this.geminiWs.send(JSON.stringify(payload));
    }
  }
}