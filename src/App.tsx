import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc } from 'firebase/firestore';
import { db, auth, OperationType, handleFirestoreError } from './lib/firebase';
import Auth from './components/Auth';
import Studio from './components/Studio';
import AdminPanel from './components/AdminPanel';
import { Music, Plus, Trash2, ChevronRight, Mic2, Disc, LayoutGrid, List, Loader2, ShieldCheck, Ban, CreditCard, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';

interface Project {
  id: string;
  userId: string;
  title: string;
  genre?: string;
  producerStyle?: string;
  expectations?: string;
  createdAt: any;
}

interface UserData {
  uid: string;
  role: 'admin' | 'user';
  status: 'active' | 'banned' | 'pending_payment';
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [isAdminView, setIsAdminView] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [creationStep, setCreationStep] = useState(1);
  const [newProjectData, setNewProjectData] = useState({
    title: '',
    genre: '',
    producerStyle: '',
    expectations: ''
  });
  const [loading, setLoading] = useState(true);

  const genres = ['Kizomba', 'Kuduro', 'Semba', 'Tarraxinha', 'Afro House', 'Ghetto Zouk', 'Rap', 'Trap', 'R&B', 'Gospel', 'Pop', 'Rock', 'Sertanejo', 'Samba'];
  const producers = [
    'AI Freedom (Liberdade Total)',
    'DJ Habias (Angola)',
    'DJ Silyvi (Angola)',
    'DJ Devictor (Angola)',
    'DJ Malvado (Angola)',
    'DJ Znobia (Angola)',
    'Gaia Beat (Angola)',
    'Metro Boomin',
    'Dr. Dre',
    'Kanye West',
    'Rick Rubin'
  ];

  useEffect(() => {
    if (!user) {
      setProjects([]);
      setActiveProjectId(null);
      setUserData(null);
      setLoading(false);
      return;
    }

    // Fetch user data for role/status
    const userRef = doc(db, 'users', user.uid);
    const unsubUser = onSnapshot(userRef, (doc) => {
      if (doc.exists()) {
        const data = doc.data() as UserData;
        setUserData(data);
        
        // Only fetch projects if not banned
        if (data.status !== 'banned') {
          const q = query(collection(db, 'projects'), where('userId', '==', user.uid));
          const unsubProjects = onSnapshot(q, (snapshot) => {
            const newProjects = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project));
            setProjects(newProjects.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
            setLoading(false);
          }, (error) => {
            console.warn('Projects listener error:', error.message);
            setLoading(false);
          });
          return () => unsubProjects();
        } else {
          setLoading(false);
        }
      }
    }, (error) => {
      console.error('User data listener error:', error);
      setLoading(false);
    });

    return () => {
      unsubUser();
    };
  }, [user]);

  const [isCreatingProject, setIsCreatingProject] = useState(false);

  const createProject = async () => {
    if (!user || !newProjectData.title.trim() || isCreatingProject) return;
    setIsCreatingProject(true);
    try {
      const docRef = await addDoc(collection(db, 'projects'), {
        userId: user.uid,
        ...newProjectData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      
      // Small delay to show "Processing" state for a more professional feel
      setTimeout(() => {
        setActiveProjectId(docRef.id);
        setIsCreating(false);
        setIsCreatingProject(false);
        setCreationStep(1);
        setNewProjectData({ title: '', genre: '', producerStyle: '', expectations: '' });
      }, 1500);
    } catch (error) {
      setIsCreatingProject(false);
      handleFirestoreError(error, OperationType.CREATE, 'projects');
    }
  };

  const deleteProject = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('Tem certeza que deseja excluir este projeto?')) return;
    try {
      await deleteDoc(doc(db, 'projects', id));
      if (activeProjectId === id) setActiveProjectId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `projects/${id}`);
    }
  };

  const isBanned = userData?.status === 'banned';
  const isPending = userData?.status === 'pending_payment';
  const isAdmin = userData?.role === 'admin';

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-white font-sans selection:bg-gold/30">
      {/* Navigation */}
      <nav className="border-b border-white/5 bg-black/60 backdrop-blur-3xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4 group cursor-pointer" onClick={() => { setActiveProjectId(null); setIsAdminView(false); }}>
            <div className="w-12 h-12 gold-gradient rounded-2xl flex items-center justify-center shadow-gold group-hover:scale-105 transition-transform">
              <Mic2 className="text-black" size={24} />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tighter uppercase leading-none gold-text-gradient">Flow Estudios</h1>
              <p className="text-[10px] text-white/40 font-bold tracking-[0.3em] uppercase">Mobile Studio Pro</p>
            </div>
          </div>
          
          <div className="flex items-center gap-6">
            {isAdmin && (
              <button 
                onClick={() => setIsAdminView(!isAdminView)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-full text-xs font-black uppercase tracking-widest transition-all",
                  isAdminView ? "bg-gold text-black shadow-gold" : "bg-white/5 text-gold hover:bg-white/10"
                )}
              >
                <ShieldCheck size={16} />
                <span>Painel ADM</span>
              </button>
            )}
            <Auth onUserChange={setUser} />
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <AnimatePresence>
          {isCreatingProject && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[500] flex flex-col items-center justify-center bg-black/90 backdrop-blur-2xl"
            >
              <div className="relative">
                <Loader2 className="w-24 h-24 text-gold animate-spin" />
                <Sparkles className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-gold w-8 h-8" />
              </div>
              <h2 className="mt-8 text-4xl font-black gold-text-gradient uppercase tracking-tighter animate-pulse">Iniciando Produção por IA</h2>
              <p className="mt-4 text-white/40 font-bold uppercase tracking-[0.3em] text-xs">O seu produtor virtual está preparando o estúdio...</p>
            </motion.div>
          )}
        </AnimatePresence>

        {!user ? (
          <div className="relative min-h-[80vh] flex flex-col items-center justify-center rounded-[40px] overflow-hidden">
            {/* Background Image */}
            <div className="absolute inset-0 z-0">
              <img 
                src="https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?q=80&w=2070&auto=format&fit=crop" 
                alt="Studio Background" 
                className="w-full h-full object-cover opacity-40 grayscale"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0c] via-transparent to-[#0a0a0c]/80" />
            </div>

            <div className="relative z-10 text-center space-y-8 px-6 max-w-3xl">
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8 }}
              >
                <h2 className="text-6xl md:text-8xl font-black tracking-tighter mb-4 leading-[0.9]">
                  BEM-VINDO AO <br />
                  <span className="gold-text-gradient">FLOW ESTUDIO</span>
                </h2>
                <p className="text-white/60 text-xl md:text-2xl font-medium max-w-xl mx-auto leading-relaxed">
                  A experiência de estúdio profissional mais sofisticada do mundo, agora na palma da sua mão.
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="flex flex-col sm:flex-row items-center justify-center gap-4"
              >
                <button
                  onClick={() => (document.querySelector('button[title="Entrar com Google"]') as HTMLButtonElement)?.click()}
                  className="w-full sm:w-auto px-10 py-5 gold-gradient text-black rounded-full font-black text-lg hover:scale-105 transition-all shadow-gold"
                >
                  COMEÇAR JORNADA
                </button>
              </motion.div>
            </div>
          </div>
        ) : isBanned ? (
          <div className="flex flex-col items-center justify-center py-32 text-center space-y-6">
            <div className="w-24 h-24 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center shadow-lg shadow-red-500/20">
              <Ban size={48} />
            </div>
            <div className="space-y-2">
              <h2 className="text-4xl font-black uppercase tracking-tighter text-red-500">Acesso Bloqueado</h2>
              <p className="text-white/40 font-medium max-w-md mx-auto">
                Sua conta foi suspensa por violação dos termos de uso. Entre em contato com o suporte para mais informações.
              </p>
            </div>
          </div>
        ) : isPending && !isAdmin ? (
          <div className="flex flex-col items-center justify-center py-32 text-center space-y-8">
            <div className="w-24 h-24 bg-amber-500/10 text-amber-500 rounded-full flex items-center justify-center shadow-lg shadow-amber-500/20">
              <CreditCard size={48} />
            </div>
            <div className="space-y-4 max-w-md mx-auto">
              <h2 className="text-4xl font-black uppercase tracking-tighter gold-text-gradient">Assinatura Necessária</h2>
              <p className="text-white/60 font-medium leading-relaxed">
                O Flow Estudios é uma plataforma exclusiva. Para começar a produzir suas músicas, você precisa ativar sua assinatura.
              </p>
              <div className="p-6 bg-white/5 border border-gold/20 rounded-3xl space-y-4">
                <p className="text-sm font-bold text-white/80">Entre em contato com o administrador para liberar seu acesso:</p>
                <p className="text-gold font-mono text-lg">domingosafonso833@gmail.com</p>
              </div>
            </div>
          </div>
        ) : isAdminView ? (
          <AdminPanel />
        ) : activeProjectId ? (
          <div className="space-y-6">
            <button
              onClick={() => setActiveProjectId(null)}
              className="flex items-center gap-2 text-white/40 hover:text-gold transition-colors group"
            >
              <ChevronRight className="rotate-180 group-hover:-translate-x-1 transition-transform" size={20} />
              <span className="font-bold uppercase tracking-widest text-xs">Voltar para a Galeria</span>
            </button>
            <Studio projectId={activeProjectId} />
          </div>
        ) : (
          <div className="space-y-12">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div>
                <h2 className="text-5xl font-black tracking-tight mb-2">GALERIA DE <span className="gold-text-gradient">PROJETOS</span></h2>
                <p className="text-white/40 font-bold uppercase tracking-widest text-sm">Gerencie seu catálogo musical</p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setIsCreating(true)}
                  className="flex items-center gap-3 px-8 py-4 gold-gradient text-black rounded-2xl font-black transition-all shadow-gold hover:scale-105"
                >
                  <Plus size={24} />
                  <span>CRIAR NOVO PROJETO</span>
                </button>
              </div>
            </div>

            <AnimatePresence>
              {isCreating && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl"
                >
                  <div className="bg-[#121214] border border-gold/20 w-full max-w-2xl rounded-[40px] overflow-hidden shadow-2xl">
                    <div className="h-2 gold-gradient w-full" style={{ width: `${(creationStep / 4) * 100}%`, transition: 'width 0.5s ease' }} />
                    
                    <div className="p-8 md:p-12 space-y-8">
                      {creationStep === 1 && (
                        <div className="space-y-6">
                          <div className="space-y-2">
                            <h3 className="text-3xl font-black gold-text-gradient">NOME DO PROJETO</h3>
                            <p className="text-white/40 font-medium">Como devemos chamar sua próxima obra-prima?</p>
                          </div>
                          <input
                            autoFocus
                            type="text"
                            value={newProjectData.title}
                            onChange={(e) => setNewProjectData({ ...newProjectData, title: e.target.value })}
                            placeholder="Ex: Hit do Verão"
                            className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-xl focus:outline-none focus:border-gold transition-colors"
                          />
                          <button
                            disabled={!newProjectData.title}
                            onClick={() => setCreationStep(2)}
                            className="w-full py-5 gold-gradient text-black rounded-2xl font-black text-lg disabled:opacity-50"
                          >
                            PRÓXIMO PASSO
                          </button>
                        </div>
                      )}

                      {creationStep === 2 && (
                        <div className="space-y-6">
                          <div className="space-y-2">
                            <h3 className="text-3xl font-black gold-text-gradient">ESTILO MUSICAL</h3>
                            <p className="text-white/40 font-medium">Selecione o gênero que define sua música</p>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            {genres.map(g => (
                              <button
                                key={g}
                                onClick={() => setNewProjectData({ ...newProjectData, genre: g })}
                                className={cn(
                                  "py-3 rounded-xl font-bold border transition-all",
                                  newProjectData.genre === g ? "bg-gold text-black border-gold" : "bg-white/5 border-white/10 text-white/60 hover:border-gold/50"
                                )}
                              >
                                {g}
                              </button>
                            ))}
                          </div>
                          <div className="flex gap-3">
                            <button onClick={() => setCreationStep(1)} className="flex-1 py-4 bg-white/5 rounded-2xl font-bold">VOLTAR</button>
                            <button disabled={!newProjectData.genre} onClick={() => setCreationStep(3)} className="flex-[2] py-4 gold-gradient text-black rounded-2xl font-black disabled:opacity-50">CONTINUAR</button>
                          </div>
                        </div>
                      )}

                      {creationStep === 3 && (
                        <div className="space-y-6">
                          <div className="space-y-2">
                            <h3 className="text-3xl font-black gold-text-gradient">ESTILO DE PRODUÇÃO</h3>
                            <p className="text-white/40 font-medium">Inspire-se na sonoridade de grandes produtores</p>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto pr-2">
                            {producers.map(p => (
                              <button
                                key={p}
                                onClick={() => setNewProjectData({ ...newProjectData, producerStyle: p })}
                                className={cn(
                                  "py-4 px-4 rounded-xl font-bold border text-left transition-all",
                                  newProjectData.producerStyle === p ? "bg-gold text-black border-gold" : "bg-white/5 border-white/10 text-white/60 hover:border-gold/50"
                                )}
                              >
                                {p}
                              </button>
                            ))}
                          </div>
                          <div className="flex gap-3">
                            <button onClick={() => setCreationStep(2)} className="flex-1 py-4 bg-white/5 rounded-2xl font-bold">VOLTAR</button>
                            <button disabled={!newProjectData.producerStyle} onClick={() => setCreationStep(4)} className="flex-[2] py-4 gold-gradient text-black rounded-2xl font-black disabled:opacity-50">QUASE LÁ</button>
                          </div>
                        </div>
                      )}

                      {creationStep === 4 && (
                        <div className="space-y-6">
                          <div className="space-y-2">
                            <h3 className="text-3xl font-black gold-text-gradient">SUAS EXPECTATIVAS</h3>
                            <p className="text-white/40 font-medium">Que tipo de música você espera produzir?</p>
                          </div>
                            <textarea
                            autoFocus
                            value={newProjectData.expectations}
                            onChange={(e) => setNewProjectData({ ...newProjectData, expectations: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                createProject();
                              }
                            }}
                            placeholder="Ex: Espero uma música limpa, profissional e com qualidade musical respeitando a minha voz..."
                            className="w-full h-40 bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-lg focus:outline-none focus:border-gold transition-colors resize-none"
                          />
                          <p className="text-[10px] text-white/20 font-bold uppercase tracking-widest text-center">Pressione ENTER para finalizar e iniciar a produção por IA</p>
                          <div className="flex gap-3">
                            <button 
                              disabled={isCreatingProject}
                              onClick={() => setCreationStep(3)} 
                              className="flex-1 py-4 bg-white/5 rounded-2xl font-bold disabled:opacity-50"
                            >
                              VOLTAR
                            </button>
                            <button 
                              disabled={isCreatingProject || !newProjectData.expectations}
                              onClick={createProject} 
                              className="flex-[2] py-4 gold-gradient text-black rounded-2xl font-black flex items-center justify-center gap-2 disabled:opacity-50 hover:scale-105 transition-all shadow-gold"
                            >
                              <span>INICIAR PRODUÇÃO POR IA</span>
                              <ChevronRight size={20} />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                    
                    <button 
                      onClick={() => { setIsCreating(false); setCreationStep(1); }}
                      className="absolute top-8 right-8 text-white/20 hover:text-white"
                    >
                      <Plus className="rotate-45" size={32} />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-12 h-12 text-gold animate-spin" />
              </div>
            ) : projects.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {projects.map((project) => (
                  <motion.div
                    key={project.id}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    onClick={() => setActiveProjectId(project.id)}
                    className="group relative bg-white/5 border border-white/10 rounded-[32px] overflow-hidden cursor-pointer hover:border-gold/40 transition-all shadow-2xl"
                  >
                    <div className="h-48 relative overflow-hidden">
                      <img 
                        src={`https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?q=80&w=400&auto=format&fit=crop&seed=${project.id}`} 
                        alt="Project Cover" 
                        className="w-full h-full object-cover grayscale group-hover:grayscale-0 group-hover:scale-110 transition-all duration-700"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
                      <div className="absolute bottom-4 left-6">
                        <span className="px-3 py-1 bg-gold text-black text-[10px] font-black uppercase tracking-widest rounded-full">
                          {project.genre || 'GENRE'}
                        </span>
                      </div>
                    </div>
                    
                    <div className="p-8">
                      <div className="flex items-start justify-between mb-4">
                        <h3 className="text-2xl font-black text-white group-hover:text-gold transition-colors leading-tight">{project.title}</h3>
                        <button
                          onClick={(e) => deleteProject(e, project.id)}
                          className="p-2 text-white/10 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                      <div className="flex items-center gap-4 text-white/40 text-xs font-bold uppercase tracking-widest">
                        <div className="flex items-center gap-1">
                          <Disc size={14} className="text-gold" />
                          <span>{project.producerStyle?.split(' ')[0] || 'AI'} Style</span>
                        </div>
                        <span>•</span>
                        <span>{new Date(project.createdAt?.seconds * 1000).toLocaleDateString()}</span>
                      </div>
                      <div className="mt-8 flex items-center justify-between">
                        <div className="flex -space-x-2">
                          {[1,2,3].map(i => (
                            <div key={i} className="w-8 h-8 rounded-full border-2 border-[#0a0a0c] bg-white/10 flex items-center justify-center text-[10px] font-bold">
                              <Mic2 size={12} className="text-gold" />
                            </div>
                          ))}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-gold">
                          <span>ENTRAR NO ESTÚDIO</span>
                          <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="text-center py-32 bg-white/5 border-2 border-dashed border-white/5 rounded-[40px]">
                <div className="w-24 h-24 gold-gradient rounded-full flex items-center justify-center mx-auto mb-6 shadow-gold opacity-20">
                  <Music size={40} className="text-black" />
                </div>
                <h3 className="text-2xl font-bold text-white/40">Sua galeria está vazia</h3>
                <p className="text-white/20 font-medium mt-2">Comece sua jornada musical criando seu primeiro projeto.</p>
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="border-t border-white/5 py-20 mt-20 bg-black/40">
        <div className="max-w-7xl mx-auto px-4 flex flex-col items-center gap-8">
          <div className="flex items-center gap-3 opacity-30">
            <Mic2 className="text-gold" size={24} />
            <span className="text-xl font-black tracking-tighter uppercase">Flow Estudios</span>
          </div>
          <p className="text-white/10 text-[10px] font-black uppercase tracking-[0.5em]">The Gold Standard of Mobile Recording &copy; 2026</p>
        </div>
      </footer>
    </div>
  );
}
