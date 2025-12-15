import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { 
  User, 
  Mail, 
  Building2, 
  Shield, 
  LogOut, 
  RefreshCw,
  ChevronRight
} from 'lucide-react';
import { toast } from 'sonner';

const Profile = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    toast.success('Logout realizado com sucesso!');
    navigate('/login');
  };

  const handleSwitchAccount = () => {
    logout();
    navigate('/login');
  };

  const getRoleLabel = (role) => {
    switch (role) {
      case 'admin':
        return 'Administrador';
      case 'manager':
        return 'Gerente';
      case 'installer':
        return 'Instalador';
      default:
        return role;
    }
  };

  const getRoleColor = (role) => {
    switch (role) {
      case 'admin':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'manager':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'installer':
        return 'bg-green-500/20 text-green-400 border-green-500/30';
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-6 pb-24 md:pb-8" data-testid="profile-page">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-4xl font-heading font-bold text-white tracking-tight">
          Meu Perfil
        </h1>
        <p className="text-sm md:text-base text-muted-foreground mt-1">
          Gerencie suas informações e conta
        </p>
      </div>

      {/* User Info Card */}
      <Card className="bg-card border-white/5">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-primary/20 flex items-center justify-center">
              <User className="w-8 h-8 md:w-10 md:h-10 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg md:text-xl font-bold text-white truncate">
                {user?.name || 'Usuário'}
              </h2>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border mt-1 ${getRoleColor(user?.role)}`}>
                <Shield className="w-3 h-3 mr-1" />
                {getRoleLabel(user?.role)}
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Email */}
          <div className="flex items-center gap-3 p-3 bg-background/50 rounded-lg">
            <Mail className="w-5 h-5 text-muted-foreground flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">Email</p>
              <p className="text-sm text-white truncate">{user?.email || '-'}</p>
            </div>
          </div>

          {/* Filial */}
          {user?.branch && (
            <div className="flex items-center gap-3 p-3 bg-background/50 rounded-lg">
              <Building2 className="w-5 h-5 text-muted-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">Filial</p>
                <p className="text-sm text-white truncate">{user.branch}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide px-1">
          Ações da Conta
        </h3>
        
        {/* Switch Account */}
        <button
          onClick={handleSwitchAccount}
          className="w-full flex items-center justify-between p-4 bg-card border border-white/5 rounded-lg hover:bg-card/80 transition-colors group"
          data-testid="switch-account-btn"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
              <RefreshCw className="w-5 h-5 text-blue-400" />
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-white">Trocar de Conta</p>
              <p className="text-xs text-muted-foreground">Entrar com outra conta</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-white transition-colors" />
        </button>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-between p-4 bg-card border border-red-500/20 rounded-lg hover:bg-red-500/10 transition-colors group"
          data-testid="logout-btn"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
              <LogOut className="w-5 h-5 text-red-400" />
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-red-400">Sair da Conta</p>
              <p className="text-xs text-muted-foreground">Encerrar sessão atual</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-red-400/50 group-hover:text-red-400 transition-colors" />
        </button>
      </div>

      {/* App Info */}
      <div className="text-center pt-4">
        <p className="text-xs text-muted-foreground">
          Indústria Visual PWA v1.0
        </p>
      </div>
    </div>
  );
};

export default Profile;
