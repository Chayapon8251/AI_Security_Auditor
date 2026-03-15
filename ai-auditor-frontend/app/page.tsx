'use client';

import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

export default function SecurityAuditorLive() {
  const [isConnected, setIsConnected] = useState(false);
  const [isAuditing, setIsAuditing] = useState(false);
  const [isAISpeaking, setIsAISpeaking] = useState(false);
  const [logs, setLogs] = useState<string[]>(['[System] Initialized. Ready for audit.']);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const speakingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  const playbackContextRef = useRef<AudioContext | null>(null);
  const nextPlayTimeRef = useRef<number>(0);

  // ฟังก์ชันช่วยเพิ่ม Log
  const addLog = (msg: string) => {
    setLogs(prev => [...prev.slice(-49), `[${new Date().toLocaleTimeString('th-TH')}] ${msg}`]);
  };

  // เลื่อน Log ลงมาล่างสุดเสมอ
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  useEffect(() => {
    socketRef.current = io('http://localhost:3002', {
      transports: ['websocket'],
      upgrade: false
    });

    socketRef.current.on('connect', () => {
      setIsConnected(true);
      addLog('[Network] Connected to SOC Backend Server');
    });
    
    socketRef.current.on('disconnect', () => {
      setIsConnected(false);
      addLog('[Network] Disconnected from Server');
    });

    socketRef.current.on('gemini-response', (data) => {
      const parts = data?.parts;
      if (parts && parts.length > 0) {
        parts.forEach((part: any) => {
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

  const playAudioChunk = (base64Audio: string) => {
    try {
      if (!playbackContextRef.current) return;
      const audioCtx = playbackContextRef.current;
      
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }

      const binaryString = window.atob(base64Audio);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const dataView = new DataView(bytes.buffer);
      const float32Array = new Float32Array(len / 2);
      for (let i = 0; i < len / 2; i++) {
        float32Array[i] = dataView.getInt16(i * 2, true) / 32768.0; 
      }

      if (float32Array.length === 0) return;

      const audioBuffer = audioCtx.createBuffer(1, float32Array.length, 24000);
      audioBuffer.getChannelData(0).set(float32Array);

      const source = audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioCtx.destination);

      const currentTime = audioCtx.currentTime;
      if (nextPlayTimeRef.current < currentTime) {
        nextPlayTimeRef.current = currentTime + 0.1;
      }
      
      source.start(nextPlayTimeRef.current);
      nextPlayTimeRef.current += audioBuffer.duration;

      // จัดการ UI แสดงผลว่า AI กำลังพูด
      setIsAISpeaking(true);
      if (speakingTimeoutRef.current) clearTimeout(speakingTimeoutRef.current);
      speakingTimeoutRef.current = setTimeout(() => {
        setIsAISpeaking(false);
      }, audioBuffer.duration * 1000 + 500);

    } catch (err) {
      console.error("❌ Audio playback error:", err);
    }
  };

  const downsampleBuffer = (buffer: Float32Array, sampleRate: number, outSampleRate: number) => {
    if (outSampleRate === sampleRate) return buffer;
    if (outSampleRate > sampleRate) throw new Error("Downsampling rate show be smaller.");
    const sampleRateRatio = sampleRate / outSampleRate;
    const newLength = Math.round(buffer.length / sampleRateRatio);
    const result = new Float32Array(newLength);
    let offsetResult = 0;
    let offsetBuffer = 0;
    while (offsetResult < result.length) {
        const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
        let accum = 0, count = 0;
        for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
            accum += buffer[i];
            count++;
        }
        result[offsetResult] = accum / count;
        offsetResult++;
        offsetBuffer = nextOffsetBuffer;
    }
    return result;
  };

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
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    audioContextRef.current = audioContext;
    const inputSampleRate = audioContext.sampleRate;

    const source = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    audioProcessorRef.current = processor;

    processor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);
      const downsampledData = downsampleBuffer(inputData, inputSampleRate, 16000);
      const pcm16Buffer = convertFloat32ToInt16(downsampledData);
      const base64Audio = bufferToBase64(pcm16Buffer);

      if (socketRef.current) {
        socketRef.current.emit('media-stream', {
          realtimeInput: {
            mediaChunks: [{ mimeType: 'audio/pcm;rate=16000', data: base64Audio }],
          },
        });
      }
    };

    source.connect(processor);
    const gainNode = audioContext.createGain();
    gainNode.gain.value = 0; 
    processor.connect(gainNode);
    gainNode.connect(audioContext.destination);
  };

  const startAudit = async () => {
    try {
      addLog('[Auth] Requesting media permissions...');
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!playbackContextRef.current) {
        playbackContextRef.current = new AudioContextClass({ sampleRate: 24000 });
      }
      if (playbackContextRef.current.state === 'suspended') {
        playbackContextRef.current.resume();
      }

      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: 'always' }, audio: false });
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const combinedStream = new MediaStream([...screenStream.getTracks(), ...micStream.getTracks()]);
      mediaStreamRef.current = combinedStream;

      if (videoRef.current) {
        videoRef.current.srcObject = screenStream;
      }

      setupAudioCapture(micStream);
      setIsAuditing(true);
      addLog('[Module] Screen capture & Microphone initialized');

      if (socketRef.current) {
        addLog('[AI] Establishing secure tunnel to AI Auditor...');
        socketRef.current.emit('start-session');
      }

      intervalRef.current = setInterval(() => {
        sendScreenFrameToAI();
      }, 2500);

      screenStream.getVideoTracks()[0].onended = () => {
        stopAudit();
      };
    } catch (error) {
      console.error('Error accessing media:', error);
      addLog('[Error] Failed to access screen/microphone');
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
          mediaChunks: [{ mimeType: 'image/jpeg', data: base64Image }],
        },
      });
      // แสดง Log เป็นบางรอบเพื่อไม่ให้รกเกินไป
      if (Math.random() > 0.7) addLog('[AI] Visual frame transmitted for analysis');
    }
  };

  const stopAudit = () => {
    setIsAuditing(false);
    setIsAISpeaking(false);
    addLog('[System] Audit session terminated');
    
    if (intervalRef.current) clearInterval(intervalRef.current);
    
    if (socketRef.current) {
      socketRef.current.emit('stop-session');
    }

    if (audioProcessorRef.current && audioContextRef.current) {
      audioProcessorRef.current.disconnect();
      audioContextRef.current.close();
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
    }
  };

  return (
    <>
      {/* แทรก CSS Custom Animation สำหรับ Scan Line */}
      <style>{`
        @keyframes scan {
          0% { top: 0%; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
        .animate-scan {
          animation: scan 3s linear infinite;
        }
        
        /* ตกแต่ง Scrollbar ของ Terminal ให้ดู Cyber */
        .terminal-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .terminal-scrollbar::-webkit-scrollbar-track {
          background: #020617; /* slate-950 */
        }
        .terminal-scrollbar::-webkit-scrollbar-thumb {
          background: #334155; /* slate-700 */
          border-radius: 4px;
        }
        .terminal-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #475569; /* slate-600 */
        }
      `}</style>

      <div className="min-h-screen bg-slate-900 text-slate-200 p-6 font-sans">
        
        {/* Header Section */}
        <header className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center mb-8 border-b border-slate-700 pb-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/30">
              <span className="text-2xl">🛡️</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-wide">Nexus SOC <span className="text-blue-400">Auditor</span></h1>
              <p className="text-sm text-slate-400">Real-time AI Security Analysis</p>
            </div>
          </div>
          
          <div className="mt-4 md:mt-0 flex items-center gap-6 bg-slate-800 px-5 py-2.5 rounded-full border border-slate-700">
            {/* Status Badge */}
            <div className="flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : 'bg-red-500'}`}></div>
              <span className="text-sm font-medium text-slate-300">
                {isConnected ? 'System Online' : 'Offline'}
              </span>
            </div>
            
            <div className="w-px h-5 bg-slate-600"></div>

            {/* AI Voice Status */}
            <div className="flex items-center gap-2">
              {isAISpeaking ? (
                <>
                  <div className="flex gap-1 items-end h-4">
                    <div className="w-1 bg-blue-400 h-2 animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-1 bg-blue-400 h-4 animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-1 bg-blue-400 h-3 animate-bounce" style={{ animationDelay: '300ms' }}></div>
                  </div>
                  <span className="text-sm font-medium text-blue-400">AI Speaking</span>
                </>
              ) : (
                <>
                  <span className="text-lg grayscale opacity-50">🎙️</span>
                  <span className="text-sm font-medium text-slate-500">Listening...</span>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Main Content Grid */}
        <main className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Left Column: Video & Controls (Spans 2 columns on large screens) */}
          <div className="lg:col-span-2 flex flex-col gap-6">
            
            {/* Video Container with Scan Effect */}
            <div className="relative bg-slate-950 rounded-2xl border border-slate-700 overflow-hidden aspect-video shadow-2xl flex items-center justify-center">
              
              {!isAuditing && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 z-10">
                  <span className="text-6xl mb-4 opacity-50">👀</span>
                  <p className="font-medium text-lg">Awaiting Visual Input</p>
                  <p className="text-sm">Click "Start Live Audit" to begin</p>
                </div>
              )}

              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                muted 
                className={`w-full h-full object-contain transition-opacity duration-500 ${isAuditing ? 'opacity-100' : 'opacity-10'}`} 
              />
              <canvas ref={canvasRef} className="hidden" />

              {/* Holographic Scan Line Effect */}
              {isAuditing && (
                <div className="absolute inset-0 pointer-events-none z-20">
                  <div className="absolute w-full h-1 bg-blue-400/60 shadow-[0_0_20px_rgba(96,165,250,0.8)] animate-scan"></div>
                </div>
              )}
            </div>

            {/* Controls */}
            <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700 flex justify-between items-center shadow-lg">
              <div>
                <h3 className="text-lg font-semibold text-white">Audit Controls</h3>
                <p className="text-sm text-slate-400">Manage your real-time session</p>
              </div>
              
              {!isAuditing ? (
                <button 
                  onClick={startAudit} 
                  disabled={!isConnected}
                  className="px-8 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed rounded-xl font-semibold text-white transition-all shadow-lg shadow-blue-500/25 flex items-center gap-2"
                >
                  <span className="text-xl">▶️</span> Start Live Audit
                </button>
              ) : (
                <button 
                  onClick={stopAudit} 
                  className="px-8 py-3 bg-rose-600 hover:bg-rose-500 rounded-xl font-semibold text-white transition-all shadow-lg shadow-rose-500/25 flex items-center gap-2"
                >
                  <span className="text-xl">🛑</span> End Session
                </button>
              )}
            </div>
          </div>

          {/* Right Column: Terminal Logs */}
          <div className="bg-slate-950 rounded-2xl border border-slate-700 flex flex-col shadow-2xl overflow-hidden h-[400px] lg:h-[550px]">
            <div className="bg-slate-800 px-4 py-3 border-b border-slate-700 flex items-center gap-3 shrink-0">
              <span className="text-lg">💻</span>
              <h3 className="font-semibold text-slate-200 text-sm tracking-wider uppercase">Activity Terminal</h3>
            </div>
            
            {/* เพิ่มคลาส terminal-scrollbar ตรงนี้ */}
            <div className="p-4 flex-1 overflow-y-auto font-mono text-xs leading-relaxed text-blue-300/80 scroll-smooth terminal-scrollbar">
              {logs.map((log, index) => (
                <div key={index} className="mb-2 hover:text-blue-200 transition-colors">
                  <span className="text-slate-500 mr-2">{'>'}</span>
                  {log.includes('[Error]') || log.includes('terminated') ? (
                    <span className="text-rose-400">{log}</span>
                  ) : log.includes('[Network]') ? (
                    <span className="text-emerald-400">{log}</span>
                  ) : log.includes('[AI]') ? (
                    <span className="text-indigo-300">{log}</span>
                  ) : (
                    log
                  )}
                </div>
              ))}
              {/* ตัว Anchor สำหรับดึง Scrollbar ลงมาล่างสุดอัตโนมัติ */}
              <div ref={logsEndRef} />
            </div>
          </div>

        </main>
      </div>
    </>
  );
}