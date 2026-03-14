'use client';

import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

export default function SecurityAuditorLive() {
  const [isConnected, setIsConnected] = useState(false);
  const [isAuditing, setIsAuditing] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const socketRef = useRef<Socket | null>(null);
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // --- เพิ่มระบบสำหรับเล่นเสียง (Playback) ---
  const playbackContextRef = useRef<AudioContext | null>(null);
  const nextPlayTimeRef = useRef<number>(0);

  useEffect(() => {
    socketRef.current = io('http://localhost:3002', {
    transports: ['websocket'],
    upgrade: false
    });

    socketRef.current.on('connect', () => setIsConnected(true));
    socketRef.current.on('disconnect', () => setIsConnected(false));

    // ดักรับข้อมูลจาก Gemini
    socketRef.current.on('gemini-response', (data) => {
      // โครงสร้าง Response ของ Gemini จะซ้อนกันอยู่ลึกนิดนึง
      const parts = data?.parts;
      if (parts && parts.length > 0) {
        parts.forEach((part: any) => {
          // ถ้ามี Audio แนบมาด้วย
          if (part.inlineData && part.inlineData.mimeType.startsWith('audio/pcm')) {
            playAudioChunk(part.inlineData.data);
          }
        });
      }
    });

    return () => {
      socketRef.current?.disconnect();
      stopAudit();
    };
  }, []);

  // --- ฟังก์ชันถอดรหัส Base64 PCM และเล่นเสียง ---
  const playAudioChunk = (base64Audio: string) => {
    // กำหนด Sample Rate ให้ตรงกับที่ Gemini ส่งมา (24000 Hz)
    if (!playbackContextRef.current) {
      playbackContextRef.current = new window.AudioContext({ sampleRate: 24000 });
      nextPlayTimeRef.current = playbackContextRef.current.currentTime;
    }

    const audioCtx = playbackContextRef.current;
    
    // 1. แปลง Base64 เป็น ArrayBuffer
    const binaryString = window.atob(base64Audio);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // 2. แปลง PCM 16-bit เป็น Float32
    const int16Array = new Int16Array(bytes.buffer);
    const float32Array = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / 32768.0; 
    }

    // 3. สร้าง AudioBuffer
    const audioBuffer = audioCtx.createBuffer(1, float32Array.length, 24000);
    audioBuffer.getChannelData(0).set(float32Array);

    // 4. ตั้งคิวเล่นเสียงไม่ให้ซ้อนทับกัน
    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioCtx.destination);

    const currentTime = audioCtx.currentTime;
    if (nextPlayTimeRef.current < currentTime) {
      nextPlayTimeRef.current = currentTime;
    }
    
    source.start(nextPlayTimeRef.current);
    nextPlayTimeRef.current += audioBuffer.duration;
  };

  // --- Helper: Float32 (จากไมค์) เป็น Int16 PCM (ส่งให้ AI) ---
  const convertFloat32ToInt16 = (buffer: Float32Array) => {
    let l = buffer.length;
    let buf = new Int16Array(l);
    while (l--) {
      let s = Math.max(-1, Math.min(1, buffer[l]));
      buf[l] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return buf.buffer;
  };

  const bufferToBase64 = (buffer: ArrayBuffer) => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  };

  const setupAudioCapture = (stream: MediaStream) => {
    const audioContext = new window.AudioContext();
    audioContextRef.current = audioContext;
    const source = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    audioProcessorRef.current = processor;

    processor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);
      const pcm16Buffer = convertFloat32ToInt16(inputData);
      const base64Audio = bufferToBase64(pcm16Buffer);

      if (socketRef.current) {
        socketRef.current.emit('media-stream', {
          realtimeInput: {
            mediaChunks: [
              {
                mimeType: 'audio/pcm;rate=16000',
                data: base64Audio,
              },
            ],
          },
        });
      }
    };
    source.connect(processor);
    processor.connect(audioContext.destination);
  };

  const startAudit = async () => {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: 'always' }, audio: false });
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const combinedStream = new MediaStream([...screenStream.getTracks(), ...micStream.getTracks()]);
      mediaStreamRef.current = combinedStream;

      if (videoRef.current) {
        videoRef.current.srcObject = screenStream;
      }

      setupAudioCapture(micStream);
      setIsAuditing(true);

      intervalRef.current = setInterval(() => {
        sendScreenFrameToAI();
      }, 2500);

      screenStream.getVideoTracks()[0].onended = () => {
        stopAudit();
      };
    } catch (error) {
      console.error('Error accessing media:', error);
    }
  };

  const sendScreenFrameToAI = () => {
    if (!videoRef.current || !canvasRef.current || !socketRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (context && video.videoWidth > 0) {
      canvas.width = video.videoWidth / 2;
      canvas.height = video.videoHeight / 2;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      const base64Image = canvas.toDataURL('image/jpeg', 0.6).split(',')[1];

      socketRef.current.emit('media-stream', {
        realtimeInput: {
          mediaChunks: [
            {
              mimeType: 'image/jpeg',
              data: base64Image,
            },
          ],
        },
      });
    }
  };

  const stopAudit = () => {
    setIsAuditing(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
    
    if (audioProcessorRef.current && audioContextRef.current) {
      audioProcessorRef.current.disconnect();
      audioContextRef.current.close();
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8 flex flex-col items-center">
      <h1 className="text-3xl font-bold mb-4">AI Security Auditor Live 🕵️‍♂️</h1>
      <div className="flex items-center gap-2 mb-8">
        <span className="text-gray-400">Status:</span>
        <span className={`px-3 py-1 rounded-full text-sm ${isConnected ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
          {isConnected ? '🟢 Connected to Backend' : '🔴 Disconnected'}
        </span>
      </div>

      <div className="w-full max-w-4xl bg-black rounded-lg overflow-hidden border border-gray-700 mb-8 aspect-video relative shadow-2xl">
        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-contain" />
        <canvas ref={canvasRef} className="hidden" />
      </div>

      <div className="flex gap-4">
        {!isAuditing ? (
          <button onClick={startAudit} className="px-8 py-3 bg-blue-600 hover:bg-blue-500 rounded-lg font-bold transition-all shadow-lg shadow-blue-500/30">
            Start Live Audit 🎙️+📺
          </button>
        ) : (
          <button onClick={stopAudit} className="px-8 py-3 bg-red-600 hover:bg-red-500 rounded-lg font-bold transition-all shadow-lg shadow-red-500/30">
            Stop Audit 🛑
          </button>
        )}
      </div>
    </div>
  );
}