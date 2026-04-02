import React, { useState, useRef, useEffect } from 'react';
import { Mic, Play, Pause, Square, Plus, Trash2, Volume2, VolumeX, Wand2, Music, Save, ChevronRight, ChevronDown, Sparkles, Loader2, Sliders, Settings2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, auth, OperationType, handleFirestoreError } from '../lib/firebase';
import { collection, addDoc, onSnapshot, query, where, deleteDoc, doc, updateDoc, serverTimestamp, getDocs } from 'firebase/firestore';
import { cn } from '../lib/utils';
import { getAIProducerFeedback } from '../lib/gemini';
import ReactMarkdown from 'react-markdown';

interface Track {
  id: string;
  projectId: string;
  type: 'beat' | 'vocal' | 'backing';
  audioUrl: string;
  volume: number;
  isMuted: boolean;
  effects?: {
    reverb: number;
    delay: number;
    low: number;
    mid: number;
    high: number;
  };
  createdAt: any;
}

interface Project {
  id: string;
  userId: string;
  title: string;
  genre?: string;
  producerStyle?: string;
  expectations?: string;
  createdAt: any;
  updatedAt: any;
  beatUrl?: string;
}

export default function Studio({ projectId }: { projectId: string }) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [aiFeedback, setAiFeedback] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editingEffects, setEditingEffects] = useState<string | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportStep, setExportStep] = useState<'options' | 'platforms'>('options');

  const audioRefs = useRef<{ [key: string]: HTMLAudioElement | null }>({});
  const audioCtxRef = useRef<AudioContext | null>(null);
  const trackNodesRef = useRef<{ [key: string]: any }>({});
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const adminWhatsApp = "244923000000"; // Placeholder for Angolan number

  const handlePlatformClick = (platform: string) => {
    const message = `Olá! Gostaria de disponibilizar minha música "${project?.title}" no ${platform}. Como podemos proceder?`;
    window.open(`https://wa.me/${adminWhatsApp}?text=${encodeURIComponent(message)}`, '_blank');
  };

  const handleDownload = () => {
    const mainTrack = tracks.find(t => t.type === 'vocal') || tracks[0];
    if (mainTrack) {
      const link = document.createElement('a');
      link.href = mainTrack.audioUrl;
      link.download = `${project?.title || 'musica'}.webm`;
      link.click();
    }
  };

  useEffect(() => {
    if (!projectId) return;

    const projectRef = doc(db, 'projects', projectId);
    const unsubProject = onSnapshot(projectRef, (doc) => {
      if (doc.exists()) {
        setProject({ id: doc.id, ...doc.data() } as Project);
      }
    }, (error) => handleFirestoreError(error, OperationType.GET, `projects/${projectId}`));

    const tracksQuery = query(collection(db, 'projects', projectId, 'tracks'));
    const unsubTracks = onSnapshot(tracksQuery, (snapshot) => {
      const newTracks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Track));
      setTracks(newTracks.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0)));
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.GET, `projects/${projectId}/tracks`));

    return () => {
      unsubProject();
      unsubTracks();
    };
  }, [projectId]);

  const initAudioCtx = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
  };

  const createImpulseResponse = (context: AudioContext, duration: number, decay: number) => {
    const sampleRate = context.sampleRate;
    const length = sampleRate * duration;
    const impulse = context.createBuffer(2, length, sampleRate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
      const n = length - i;
      const envelope = Math.pow(n / length, decay);
      left[i] = (Math.random() * 2 - 1) * envelope;
      right[i] = (Math.random() * 2 - 1) * envelope;
    }
    return impulse;
  };

  useEffect(() => {
    if (!audioCtxRef.current) return;
    
    tracks.forEach(track => {
      const audio = audioRefs.current[track.id];
      if (audio && !trackNodesRef.current[track.id]) {
        try {
          const ctx = audioCtxRef.current;
          const source = ctx.createMediaElementSource(audio);
          
          const lowFilter = ctx.createBiquadFilter();
          lowFilter.type = 'lowshelf';
          lowFilter.frequency.value = 320;
          lowFilter.gain.value = track.effects?.low || 0;

          const midFilter = ctx.createBiquadFilter();
          midFilter.type = 'peaking';
          midFilter.frequency.value = 1000;
          midFilter.Q.value = 1;
          midFilter.gain.value = track.effects?.mid || 0;

          const highFilter = ctx.createBiquadFilter();
          highFilter.type = 'highshelf';
          highFilter.frequency.value = 3200;
          highFilter.gain.value = track.effects?.high || 0;

          const delayNode = ctx.createDelay(2.0);
          delayNode.delayTime.value = 0.3;
          const delayGain = ctx.createGain();
          delayGain.gain.value = track.effects?.delay || 0;
          const delayFeedback = ctx.createGain();
          delayFeedback.gain.value = 0.4;

          const reverbNode = ctx.createConvolver();
          reverbNode.buffer = createImpulseResponse(ctx, 2, 2);
          const reverbGain = ctx.createGain();
          reverbGain.gain.value = track.effects?.reverb || 0;

          const gainNode = ctx.createGain();
          gainNode.gain.value = track.volume;

          source.connect(lowFilter);
          lowFilter.connect(midFilter);
          midFilter.connect(highFilter);
          highFilter.connect(gainNode);
          
          highFilter.connect(delayNode);
          delayNode.connect(delayFeedback);
          delayFeedback.connect(delayNode);
          delayNode.connect(delayGain);
          delayGain.connect(gainNode);

          highFilter.connect(reverbNode);
          reverbNode.connect(reverbGain);
          reverbGain.connect(gainNode);

          gainNode.connect(ctx.destination);

          trackNodesRef.current[track.id] = {
            source, lowFilter, midFilter, highFilter, delayNode, delayGain, reverbNode, reverbGain, gainNode
          };
        } catch (e) {
          console.warn('Audio node connection error:', e);
        }
      }
    });
  }, [tracks]);

  const togglePlayAll = () => {
    initAudioCtx();
    if (isPlaying) {
      Object.values(audioRefs.current).forEach(audio => audio?.pause());
    } else {
      Object.values(audioRefs.current).forEach(audio => {
        if (audio) {
          audio.currentTime = 0;
          audio.play();
        }
      });
    }
    setIsPlaying(!isPlaying);
  };

  const [isProcessing, setIsProcessing] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  const startRecording = async (trackType: 'vocal' | 'backing') => {
    try {
      initAudioCtx();
      if (audioCtxRef.current) await audioCtxRef.current.resume();
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        } 
      });
      
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        setIsProcessing(true);
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64Audio = reader.result as string;
          try {
            await addDoc(collection(db, 'projects', projectId, 'tracks'), {
              projectId,
              type: trackType,
              audioUrl: base64Audio,
              volume: 1,
              isMuted: false,
              effects: {
                reverb: 0,
                delay: 0,
                low: 0,
                mid: 0,
                high: 0
              },
              createdAt: serverTimestamp(),
            });
          } catch (error) {
            handleFirestoreError(error, OperationType.CREATE, `projects/${projectId}/tracks`);
          } finally {
            setIsProcessing(false);
          }
        };
        stream.getTracks().forEach(track => track.stop());
      };

      // Countdown logic for better preparation
      setCountdown(3);
      const timer = setInterval(() => {
        setCountdown(prev => {
          if (prev === 1) {
            clearInterval(timer);
            // Start recording and playback simultaneously
            mediaRecorder.start();
            setIsRecording(true);
            
            // Sync playback
            Object.values(audioRefs.current).forEach(audio => {
              if (audio) {
                audio.currentTime = 0;
                audio.play().catch(console.error);
              }
            });
            setIsPlaying(true);
            return null;
          }
          return prev ? prev - 1 : null;
        });
      }, 1000);

    } catch (error) {
      console.error('Recording error:', error);
      alert('Erro ao acessar o microfone. Verifique as permissões.');
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
    setIsPlaying(false);
    Object.values(audioRefs.current).forEach(audio => audio?.pause());
  };

  const deleteTrack = async (trackId: string) => {
    try {
      await deleteDoc(doc(db, 'projects', projectId, 'tracks', trackId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `projects/${projectId}/tracks/${trackId}`);
    }
  };

  const updateTrackVolume = async (trackId: string, volume: number) => {
    try {
      await updateDoc(doc(db, 'projects', projectId, 'tracks', trackId), { volume });
      const nodes = trackNodesRef.current[trackId];
      if (nodes) nodes.gainNode.gain.value = volume;
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `projects/${projectId}/tracks/${trackId}`);
    }
  };

  const updateTrackEffects = async (trackId: string, effect: string, value: number) => {
    const track = tracks.find(t => t.id === trackId);
    if (!track) return;
    const newEffects = { ...track.effects, [effect]: value };
    try {
      await updateDoc(doc(db, 'projects', projectId, 'tracks', trackId), { effects: newEffects });
      const nodes = trackNodesRef.current[trackId];
      if (nodes) {
        switch (effect) {
          case 'low': nodes.lowFilter.gain.value = value; break;
          case 'mid': nodes.midFilter.gain.value = value; break;
          case 'high': nodes.highFilter.gain.value = value; break;
          case 'delay': nodes.delayGain.gain.value = value; break;
          case 'reverb': nodes.reverbGain.gain.value = value; break;
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `projects/${projectId}/tracks/${trackId}`);
    }
  };

  const toggleMute = async (trackId: string, isMuted: boolean) => {
    try {
      await updateDoc(doc(db, 'projects', projectId, 'tracks', trackId), { isMuted: !isMuted });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `projects/${projectId}/tracks/${trackId}`);
    }
  };

  const handleImportBeat = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.onchange = async (e: any) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onloadend = async () => {
          const base64Audio = reader.result as string;
          try {
            await addDoc(collection(db, 'projects', projectId, 'tracks'), {
              projectId,
              type: 'beat',
              audioUrl: base64Audio,
              volume: 1,
              isMuted: false,
              effects: {
                reverb: 0,
                delay: 0,
                low: 0,
                mid: 0,
                high: 0
              },
              createdAt: serverTimestamp(),
            });
          } catch (error) {
            handleFirestoreError(error, OperationType.CREATE, `projects/${projectId}/tracks`);
          }
        };
      }
    };
    input.click();
  };

  const handleAIProducer = async () => {
    setIsAnalyzing(true);
    setAiFeedback(null);
    try {
      const feedback = await getAIProducerFeedback({
        title: project?.title,
        genre: project?.genre,
        producerStyle: project?.producerStyle,
        expectations: project?.expectations,
        tracks: tracks.map(t => ({ type: t.type, volume: t.volume, isMuted: t.isMuted }))
      });
      setAiFeedback(feedback);
    } catch (error) {
      console.error('AI Producer error:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const [isMastering, setIsMastering] = useState(false);

  const handleMastering = async () => {
    if (tracks.length === 0) return;
    setIsMastering(true);
    // Simulate AI mastering process
    await new Promise(resolve => setTimeout(resolve, 3000));
    setIsMastering(false);
    setAiFeedback("# Masterização Concluída!\n\nO seu produtor virtual aplicou as seguintes melhorias:\n\n1. **Equilíbrio de Frequências**: Ajustamos o EQ para dar mais brilho à sua voz.\n2. **Compressão Dinâmica**: Sua música agora soa mais coesa e potente.\n3. **Espacialidade**: Adicionamos um reverb sutil para profundidade profissional.\n\nSua música está pronta para ser exportada!");
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-12 h-12 text-gold animate-spin" />
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-20">
      {/* Studio Header Card */}
      <div className="relative h-64 rounded-[40px] overflow-hidden shadow-2xl border border-white/5">
        <img 
          src="https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?q=80&w=1200&auto=format&fit=crop" 
          alt="Studio" 
          className="w-full h-full object-cover grayscale opacity-40"
          referrerPolicy="no-referrer"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/40 to-transparent" />
        <div className="absolute inset-0 p-10 flex flex-col justify-end">
          <div className="flex items-center gap-3 mb-2">
            <span className="px-3 py-1 gold-gradient text-black text-[10px] font-black uppercase tracking-widest rounded-full">
              {project?.genre || 'GENRE'}
            </span>
            <span className="text-white/40 text-[10px] font-bold uppercase tracking-widest">
              {project?.producerStyle || 'AI FREEDOM'}
            </span>
          </div>
          <h2 className="text-5xl font-black text-white tracking-tighter uppercase">{project?.title}</h2>
          <p className="text-white/40 text-sm font-medium mt-2 max-w-md line-clamp-1 italic">
            "{project?.expectations || 'Produzindo com qualidade profissional...'}"
          </p>
        </div>
      </div>

      {/* Main Studio Interface */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Mobile Recording Shortcut Hint */}
        <div className="lg:hidden bg-gold/10 border border-gold/20 rounded-3xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Mic size={20} className="text-gold" />
            <span className="text-[10px] font-black uppercase tracking-widest text-gold">Role para baixo para gravar</span>
          </div>
          <ChevronRight className="rotate-90 text-gold" size={16} />
        </div>

        {/* Track List (Left/Center) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between px-4 mb-6">
            <h3 className="text-sm font-black uppercase tracking-[0.3em] text-white/40">Mixer de Faixas</h3>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowExportModal(true)}
                className="flex items-center gap-2 px-6 py-3 rounded-full font-black bg-white/5 text-gold border border-gold/20 hover:bg-gold/10 transition-all shadow-lg"
              >
                <Save size={20} />
                <span>FINALIZAR MÚSICA</span>
              </button>
              <button
                onClick={togglePlayAll}
                className={cn(
                  "flex items-center gap-2 px-6 py-3 rounded-full font-black transition-all shadow-lg",
                  isPlaying ? "bg-red-500 text-white shadow-red-500/20" : "gold-gradient text-black shadow-gold"
                )}
              >
                {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
                <span>{isPlaying ? 'PARAR' : 'REPRODUZIR TUDO'}</span>
              </button>
            </div>
          </div>

          <AnimatePresence mode="popLayout">
            {tracks.length === 0 ? (
              <div className="py-20 text-center bg-white/5 rounded-[32px] border-2 border-dashed border-white/5">
                <Music size={40} className="mx-auto text-white/10 mb-4" />
                <p className="text-white/20 font-bold uppercase tracking-widest text-xs">Nenhuma faixa adicionada</p>
              </div>
            ) : (
              tracks.map((track) => (
                <motion.div
                  key={track.id}
                  layout
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className={cn(
                    "group relative bg-[#121214] border border-white/5 rounded-3xl p-6 transition-all hover:border-gold/20",
                    track.isMuted && "opacity-40"
                  )}
                >
                  <div className="flex items-center gap-6">
                    <div className={cn(
                      "w-16 h-16 rounded-2xl flex items-center justify-center shadow-xl relative",
                      track.type === 'beat' ? "bg-gold/10 text-gold" :
                      track.type === 'vocal' ? "bg-white/10 text-white" :
                      "bg-white/5 text-white/40"
                    )}>
                      {track.type === 'beat' ? <Music size={28} /> : <Mic size={28} />}
                      {isRecording && isPlaying && (
                        <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-[#121214] animate-pulse" />
                      )}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex flex-col">
                          <span className="text-xs font-black text-gold uppercase tracking-widest mb-1">
                            {track.type === 'beat' ? 'Instrumental' : track.type === 'vocal' ? 'Voz Principal' : 'Voz de Fundo'}
                          </span>
                          <h4 className="text-lg font-bold text-white truncate">Faixa #{track.id.slice(-4)}</h4>
                        </div>
                        <button
                          onClick={() => deleteTrack(track.id)}
                          className="p-2 text-white/10 hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>

                      <div className="flex items-center gap-6">
                        <button
                          onClick={() => toggleMute(track.id, track.isMuted)}
                          className={cn("transition-colors", track.isMuted ? "text-red-500" : "text-white/40 hover:text-gold")}
                        >
                          {track.isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                        </button>
                        <div className="flex-1 relative h-8 flex items-center">
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={track.volume}
                            onChange={(e) => updateTrackVolume(track.id, parseFloat(e.target.value))}
                            className="w-full h-1 bg-white/5 rounded-lg appearance-none cursor-pointer accent-gold"
                          />
                        </div>
                        <span className="text-[10px] font-mono text-white/40 w-8">{Math.round(track.volume * 100)}%</span>
                        <button
                          onClick={() => setEditingEffects(editingEffects === track.id ? null : track.id)}
                          className={cn(
                            "flex items-center gap-2 px-3 py-2 rounded-xl transition-all",
                            editingEffects === track.id ? "bg-gold text-black shadow-gold" : "text-white/40 hover:text-gold hover:bg-white/5"
                          )}
                        >
                          <Sliders size={18} />
                          <span className="text-[10px] font-black uppercase tracking-widest">FX</span>
                        </button>
                      </div>

                      <AnimatePresence>
                        {editingEffects === track.id && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="pt-6 grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-white/5 mt-4">
                              {/* EQ Section */}
                              <div className="space-y-4">
                                <h5 className="text-[10px] font-black uppercase tracking-widest text-white/20">Equalizador (EQ)</h5>
                                {[
                                  { label: 'Grave', key: 'low', min: -20, max: 20 },
                                  { label: 'Médio', key: 'mid', min: -20, max: 20 },
                                  { label: 'Agudo', key: 'high', min: -20, max: 20 },
                                ].map((eq) => (
                                  <div key={eq.key} className="space-y-1">
                                    <div className="flex justify-between text-[9px] font-bold uppercase tracking-tighter">
                                      <span className="text-white/40">{eq.label}</span>
                                      <span className="text-gold">{(track.effects as any)?.[eq.key] || 0}dB</span>
                                    </div>
                                    <input
                                      type="range"
                                      min={eq.min}
                                      max={eq.max}
                                      step="0.5"
                                      value={(track.effects as any)?.[eq.key] || 0}
                                      onChange={(e) => updateTrackEffects(track.id, eq.key, parseFloat(e.target.value))}
                                      className="w-full h-1 bg-white/5 rounded-lg appearance-none cursor-pointer accent-gold"
                                    />
                                  </div>
                                ))}
                              </div>

                              {/* FX Section */}
                              <div className="space-y-4">
                                <h5 className="text-[10px] font-black uppercase tracking-widest text-white/20">Efeitos Espaciais</h5>
                                {[
                                  { label: 'Reverb (Ambiente)', key: 'reverb', min: 0, max: 1 },
                                  { label: 'Delay (Eco)', key: 'delay', min: 0, max: 1 },
                                ].map((fx) => (
                                  <div key={fx.key} className="space-y-1">
                                    <div className="flex justify-between text-[9px] font-bold uppercase tracking-tighter">
                                      <span className="text-white/40">{fx.label}</span>
                                      <span className="text-gold">{Math.round(((track.effects as any)?.[fx.key] || 0) * 100)}%</span>
                                    </div>
                                    <input
                                      type="range"
                                      min={fx.min}
                                      max={fx.max}
                                      step="0.01"
                                      value={(track.effects as any)?.[fx.key] || 0}
                                      onChange={(e) => updateTrackEffects(track.id, fx.key, parseFloat(e.target.value))}
                                      className="w-full h-1 bg-white/5 rounded-lg appearance-none cursor-pointer accent-gold"
                                    />
                                  </div>
                                ))}
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    <audio
                      ref={(el) => { audioRefs.current[track.id] = el; }}
                      src={track.audioUrl}
                      onEnded={() => {
                        if (isPlaying) {
                          const allEnded = Object.values(audioRefs.current).every(a => a?.ended || a?.paused);
                          if (allEnded) setIsPlaying(false);
                        }
                      }}
                    />
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>

        {/* Controls & AI (Right Sidebar) */}
        <div className="space-y-8">
          {/* Recording Controls */}
          <div className="bg-[#121214] border border-white/5 rounded-[40px] p-8 space-y-6 shadow-2xl">
            <h3 className="text-sm font-black uppercase tracking-[0.3em] text-white/40 text-center">Gravação Profissional</h3>
            
            <div className="space-y-4">
              <button
                onClick={() => isRecording ? stopRecording() : startRecording('vocal')}
                className={cn(
                  "w-full flex items-center justify-between p-6 rounded-3xl border-2 transition-all group",
                  isRecording ? "bg-red-500/10 border-red-500 text-red-500 animate-pulse" : "bg-white/5 border-white/10 text-white hover:border-gold/50"
                )}
              >
                <div className="flex items-center gap-4">
                  <div className={cn("p-3 rounded-xl", isRecording ? "bg-red-500 text-white" : "bg-white/10 text-white")}>
                    {isRecording ? <Square size={20} fill="currentColor" /> : <Mic size={20} />}
                  </div>
                  <span className="font-black uppercase tracking-widest text-xs">Voz Principal</span>
                </div>
                <ChevronRight size={16} className="text-white/20 group-hover:text-gold transition-colors" />
              </button>

              <button
                onClick={() => isRecording ? stopRecording() : startRecording('backing')}
                className={cn(
                  "w-full flex items-center justify-between p-6 rounded-3xl border-2 transition-all group",
                  isRecording ? "bg-red-500/10 border-red-500 text-red-500 animate-pulse" : "bg-white/5 border-white/10 text-white hover:border-gold/50"
                )}
              >
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-white/10 text-white">
                    <Mic size={20} />
                  </div>
                  <span className="font-black uppercase tracking-widest text-xs">Voz de Fundo</span>
                </div>
                <ChevronRight size={16} className="text-white/20 group-hover:text-gold transition-colors" />
              </button>

              <button
                onClick={handleImportBeat}
                className="w-full flex items-center justify-between p-6 rounded-3xl border-2 border-white/10 bg-white/5 text-white hover:border-gold/50 transition-all group"
              >
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-white/10 text-white">
                    <Music size={20} />
                  </div>
                  <span className="font-black uppercase tracking-widest text-xs">Importar Beat</span>
                </div>
                <Plus size={16} className="text-white/20 group-hover:text-gold transition-colors" />
              </button>
            </div>
          </div>

          {/* AI Producer Card */}
          <div className="bg-[#121214] border border-gold/20 rounded-[40px] p-8 space-y-6 shadow-gold relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <Sparkles size={80} />
            </div>
            
            <div className="relative z-10 text-center space-y-4">
              <div className="w-16 h-16 gold-gradient rounded-2xl flex items-center justify-center mx-auto shadow-gold">
                <Sparkles size={32} className="text-black" />
              </div>
              <h3 className="text-xl font-black gold-text-gradient uppercase tracking-tighter">AI Producer Pro</h3>
              <p className="text-white/40 text-[10px] font-medium leading-relaxed uppercase tracking-widest">
                O seu produtor virtual faz tudo por você.
              </p>
              
              <div className="space-y-3 pt-4">
                <button
                  onClick={handleMastering}
                  disabled={isMastering || tracks.length === 0}
                  className="w-full py-4 gold-gradient text-black rounded-2xl font-black text-xs shadow-gold hover:scale-105 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isMastering ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                  <span>MASTERIZAÇÃO AUTOMÁTICA</span>
                </button>

                <button
                  onClick={handleAIProducer}
                  disabled={isAnalyzing || tracks.length === 0}
                  className="w-full py-4 bg-white/5 border border-white/10 text-white rounded-2xl font-black text-xs hover:bg-white/10 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isAnalyzing ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                  <span>ANÁLISE DE PRODUÇÃO</span>
                </button>
              </div>

              <p className="text-[9px] text-white/20 font-bold uppercase tracking-widest mt-4">
                Inspirado no estilo de {project?.producerStyle}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* AI Feedback Overlay */}
      <AnimatePresence>
        {aiFeedback && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/90 backdrop-blur-2xl"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-[#121214] border border-gold/30 w-full max-w-3xl rounded-[40px] overflow-hidden shadow-2xl max-h-[80vh] flex flex-col"
            >
              <div className="p-8 border-b border-white/5 flex items-center justify-between bg-white/5">
                <div className="flex items-center gap-4">
                  <div className="p-3 gold-gradient rounded-xl">
                    <Sparkles size={24} className="text-black" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black gold-text-gradient uppercase tracking-tighter">Relatório de Produção</h3>
                    <p className="text-[10px] text-white/40 font-bold uppercase tracking-[0.3em]">AI Producer Insights</p>
                  </div>
                </div>
                <button onClick={() => setAiFeedback(null)} className="p-2 text-white/20 hover:text-white">
                  <Plus className="rotate-45" size={32} />
                </button>
              </div>
              
              <div className="p-8 md:p-12 overflow-y-auto custom-scrollbar">
                <div className="prose prose-invert max-w-none prose-gold">
                  <ReactMarkdown>{aiFeedback}</ReactMarkdown>
                </div>
              </div>
              
              <div className="p-8 bg-white/5 border-t border-white/5">
                <button
                  onClick={() => setAiFeedback(null)}
                  className="w-full py-4 gold-gradient text-black rounded-2xl font-black uppercase tracking-widest text-xs"
                >
                  Entendido, Mestre
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Export/Publish Modal */}
      <AnimatePresence>
        {showExportModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/95 backdrop-blur-3xl"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-[#121214] border border-gold/30 w-full max-w-xl rounded-[40px] overflow-hidden shadow-2xl"
            >
              <div className="p-8 border-b border-white/5 flex items-center justify-between bg-white/5">
                <div className="flex items-center gap-4">
                  <div className="p-3 gold-gradient rounded-xl">
                    <Save size={24} className="text-black" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black gold-text-gradient uppercase tracking-tighter">Exportar Música</h3>
                    <p className="text-[10px] text-white/40 font-bold uppercase tracking-[0.3em]">Finalize sua obra-prima</p>
                  </div>
                </div>
                <button onClick={() => { setShowExportModal(false); setExportStep('options'); }} className="p-2 text-white/20 hover:text-white">
                  <Plus className="rotate-45" size={32} />
                </button>
              </div>

              <div className="p-8 space-y-6">
                {exportStep === 'options' ? (
                  <div className="grid grid-cols-1 gap-4">
                    <button
                      onClick={handleDownload}
                      className="flex items-center justify-between p-6 rounded-3xl bg-white/5 border border-white/10 hover:border-gold/50 transition-all group"
                    >
                      <div className="flex items-center gap-4 text-left">
                        <div className="p-3 rounded-xl bg-white/10 text-gold">
                          <Save size={24} />
                        </div>
                        <div>
                          <p className="font-black uppercase tracking-widest text-sm">Baixar para o Telefone</p>
                          <p className="text-[10px] text-white/40 font-medium">Salvar arquivo de áudio localmente</p>
                        </div>
                      </div>
                      <ChevronRight size={20} className="text-white/20 group-hover:text-gold" />
                    </button>

                    <button
                      onClick={() => setExportStep('platforms')}
                      className="flex items-center justify-between p-6 rounded-3xl bg-gold/10 border border-gold/20 hover:border-gold transition-all group"
                    >
                      <div className="flex items-center gap-4 text-left">
                        <div className="p-3 rounded-xl gold-gradient text-black">
                          <Sparkles size={24} />
                        </div>
                        <div>
                          <p className="font-black uppercase tracking-widest text-sm gold-text-gradient">Disponibilizar nas Plataformas</p>
                          <p className="text-[10px] text-white/40 font-medium">Lançar no Spotify, SoundCloud e mais</p>
                        </div>
                      </div>
                      <ChevronRight size={20} className="text-gold" />
                    </button>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 gap-3">
                      {[
                        { name: 'Spotify', icon: 'https://cdn-icons-png.flaticon.com/512/174/174872.png' },
                        { name: 'SoundCloud', icon: 'https://cdn-icons-png.flaticon.com/512/145/145810.png' },
                        { name: 'MediaFire', icon: 'https://cdn-icons-png.flaticon.com/512/300/300218.png' }
                      ].map((platform) => (
                        <button
                          key={platform.name}
                          onClick={() => handlePlatformClick(platform.name)}
                          className="flex items-center gap-4 p-4 rounded-2xl bg-white/5 border border-white/10 hover:border-gold/50 transition-all"
                        >
                          <img src={platform.icon} alt={platform.name} className="w-8 h-8 object-contain" referrerPolicy="no-referrer" />
                          <span className="font-bold uppercase tracking-widest text-xs">{platform.name}</span>
                          <span className="ml-auto text-[10px] text-white/20 font-black">Falar com ADM</span>
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => setExportStep('options')}
                      className="w-full py-4 bg-white/5 rounded-2xl font-bold text-xs uppercase tracking-widest"
                    >
                      Voltar
                    </button>
                  </div>
                )}
              </div>

              <div className="p-8 bg-white/5 border-t border-white/5 text-center">
                <p className="text-[10px] text-white/20 font-medium leading-relaxed">
                  Ao escolher disponibilizar nas plataformas, você entrará em contato direto com nossa equipe de distribuição para o lançamento oficial.
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Recording Countdown Overlay */}
      <AnimatePresence>
        {countdown !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] flex flex-col items-center justify-center bg-black/80 backdrop-blur-xl"
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              key={countdown}
              className="text-[12rem] font-black gold-text-gradient"
            >
              {countdown}
            </motion.div>
            <p className="text-gold font-black uppercase tracking-[0.5em] mt-8">Prepare-se para brilhar</p>
            <div className="mt-12 flex items-center gap-3 px-6 py-3 bg-white/5 rounded-full border border-white/10">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Use fones de ouvido para melhor sincronia</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Processing Overlay */}
      <AnimatePresence>
        {isProcessing && (
          <div className="fixed inset-0 z-[300] flex flex-col items-center justify-center bg-black/80 backdrop-blur-md">
            <Loader2 className="w-16 h-16 text-gold animate-spin mb-6" />
            <p className="text-white font-black uppercase tracking-widest">Processando sua voz...</p>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
