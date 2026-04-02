import React, { useState, useEffect } from 'react';
import { db, OperationType, handleFirestoreError } from '../lib/firebase';
import { collection, onSnapshot, doc, updateDoc, query, orderBy, getDocs } from 'firebase/firestore';
import { Users, Shield, ShieldAlert, ShieldCheck, Ban, UserCheck, Search, Activity, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface UserData {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string;
  role: 'admin' | 'user';
  status: 'active' | 'banned' | 'pending_payment';
  createdAt: any;
  lastLogin: any;
}

export default function AdminPanel() {
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [stats, setStats] = useState({ total: 0, active: 0, banned: 0, pending: 0, online: 0 });

  useEffect(() => {
    const q = query(collection(db, 'users'), orderBy('lastLogin', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const usersData = snapshot.docs.map(doc => ({ ...doc.data() } as UserData));
      setUsers(usersData);
      
      const now = new Date().getTime();
      const newStats = usersData.reduce((acc, user) => {
        acc.total++;
        if (user.status === 'active') acc.active++;
        else if (user.status === 'banned') acc.banned++;
        else if (user.status === 'pending_payment') acc.pending++;
        
        // Consider "online" if lastLogin was in the last 5 minutes
        if (user.lastLogin && (now - user.lastLogin.seconds * 1000) < 5 * 60 * 1000) {
          acc.online++;
        }
        return acc;
      }, { total: 0, active: 0, banned: 0, pending: 0, online: 0 });
      
      setStats(newStats);
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'users'));

    return unsubscribe;
  }, []);

  const updateUserStatus = async (userId: string, newStatus: UserData['status']) => {
    try {
      await updateDoc(doc(db, 'users', userId), { status: newStatus });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
    }
  };

  const filteredUsers = users.filter(user => 
    user.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-4xl font-black tracking-tight gold-text-gradient uppercase">Painel de Controle</h2>
          <p className="text-white/40 font-bold uppercase tracking-widest text-xs">Administração Flow Estudios</p>
        </div>
        
        <div className="flex items-center gap-4 bg-white/5 p-2 rounded-2xl border border-white/10">
          <div className="flex items-center gap-2 px-4 py-2 border-r border-white/10" title="Total de Usuários">
            <Users size={16} className="text-gold" />
            <span className="text-sm font-bold">{stats.total}</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 border-r border-white/10" title="Usuários Ativos">
            <UserCheck size={16} className="text-emerald-500" />
            <span className="text-sm font-bold">{stats.active}</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 border-r border-white/10" title="Usuários Online (Últimos 5 min)">
            <Activity size={16} className="text-sky-500" />
            <span className="text-sm font-bold">{stats.online}</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2" title="Usuários Banidos">
            <Ban size={16} className="text-red-500" />
            <span className="text-sm font-bold">{stats.banned}</span>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={20} />
        <input
          type="text"
          placeholder="Buscar usuários por nome ou email..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-2xl pl-12 pr-6 py-4 focus:outline-none focus:border-gold transition-colors"
        />
      </div>

      {/* Users Table */}
      <div className="bg-[#121214] border border-white/5 rounded-[32px] overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white/5 text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
                <th className="px-6 py-4">Usuário</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Função</th>
                <th className="px-6 py-4">Último Acesso</th>
                <th className="px-6 py-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredUsers.map((user) => (
                <tr key={user.uid} className="group hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <img src={user.photoURL} alt="" className="w-10 h-10 rounded-full border border-white/10" referrerPolicy="no-referrer" />
                        {user.lastLogin && (new Date().getTime() - user.lastLogin.seconds * 1000) < 5 * 60 * 1000 && (
                          <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-[#121214]" />
                        )}
                      </div>
                      <div>
                        <div className="font-bold text-white">{user.displayName}</div>
                        <div className="text-xs text-white/40">{user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                      user.status === 'active' ? "bg-emerald-500/10 text-emerald-500" :
                      user.status === 'banned' ? "bg-red-500/10 text-red-500" :
                      "bg-amber-500/10 text-amber-500"
                    )}>
                      {user.status === 'active' ? 'Ativo' : user.status === 'banned' ? 'Banido' : 'Pendente'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-xs font-bold text-white/60">
                      {user.role === 'admin' ? <Shield size={14} className="text-gold" /> : <Users size={14} />}
                      <span className="capitalize">{user.role}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-xs text-white/40 font-medium">
                    {user.lastLogin ? new Date(user.lastLogin.seconds * 1000).toLocaleString() : 'N/A'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {user.status !== 'active' && (
                        <button
                          onClick={() => updateUserStatus(user.uid, 'active')}
                          className="p-2 bg-emerald-500/10 text-emerald-500 rounded-xl hover:bg-emerald-500 hover:text-white transition-all"
                          title="Ativar Usuário"
                        >
                          <UserCheck size={18} />
                        </button>
                      )}
                      {user.status !== 'banned' && user.role !== 'admin' && (
                        <button
                          onClick={() => updateUserStatus(user.uid, 'banned')}
                          className="p-2 bg-red-500/10 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all"
                          title="Banir Usuário"
                        >
                          <Ban size={18} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {filteredUsers.length === 0 && (
          <div className="py-20 text-center">
            <Users size={48} className="mx-auto text-white/10 mb-4" />
            <p className="text-white/40 font-medium">Nenhum usuário encontrado.</p>
          </div>
        )}
      </div>
    </div>
  );
}
