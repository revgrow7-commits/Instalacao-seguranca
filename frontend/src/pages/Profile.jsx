import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { 
  User, 
  Mail, 
  Building2, 
  Shield, 
  LogOut, 
  RefreshCw,
  ChevronRight,
  Key,
  Eye,
  EyeOff,
  Lock,
  CheckCircle
} from 'lucide-react';
import { toast } from 'sonner';

const Profile = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  
  // Password change state
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  const handleLogout = () => {
    logout();
    toast.success('Logout realizado com sucesso!');
    navigate('/login');
  };

  const handleSwitchAccount = () => {
    logout();
    navigate('/login');
  };

  const openPasswordModal = () => {
    setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    setShowPasswordModal(true);
  };

  const handlePasswordChange = async () => {
    // Validações
    if (!passwordForm.currentPassword) {
      toast.error('Informe a senha atual');
      return;
    }
    if (!passwordForm.newPassword) {
      toast.error('Informe a nova senha');
      return;
    }
    if (passwordForm.newPassword.length < 6) {
      toast.error('A nova senha deve ter pelo menos 6 caracteres');
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error('As senhas não coincidem');
      return;
    }
    if (passwordForm.currentPassword === passwordForm.newPassword) {
      toast.error('A nova senha deve ser diferente da atual');
      return;
    }

    try {
      setChangingPassword(true);
      await api.changePassword(passwordForm.currentPassword, passwordForm.newPassword);
      toast.success('Senha alterada com sucesso!');
      setShowPasswordModal(false);
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (error) {
      const message = error.response?.data?.detail || 'Erro ao alterar senha';
      toast.error(message);
    } finally {
      setChangingPassword(false);
    }
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

  // Password strength indicator
  const getPasswordStrength = (password) => {
    if (!password) return { strength: 0, label: '', color: '' };
    let strength = 0;
    if (password.length >= 6) strength++;
    if (password.length >= 8) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;

    if (strength <= 2) return { strength: 1, label: 'Fraca', color: 'bg-red-500' };
    if (strength <= 3) return { strength: 2, label: 'Média', color: 'bg-yellow-500' };
    return { strength: 3, label: 'Forte', color: 'bg-green-500' };
  };

  const passwordStrength = getPasswordStrength(passwordForm.newPassword);

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

      {/* Security Section */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide px-1">
          Segurança
        </h3>
        
        {/* Change Password */}
        <button
          onClick={openPasswordModal}
          className="w-full flex items-center justify-between p-4 bg-card border border-white/5 rounded-lg hover:bg-card/80 transition-colors group"
          data-testid="change-password-btn"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
              <Key className="w-5 h-5 text-primary" />
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-white">Alterar Senha</p>
              <p className="text-xs text-muted-foreground">Atualize sua senha de acesso</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-white transition-colors" />
        </button>
      </div>

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

      {/* Password Change Modal */}
      <Dialog open={showPasswordModal} onOpenChange={setShowPasswordModal}>
        <DialogContent className="bg-card border-white/10 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Lock className="h-5 w-5 text-primary" />
              Alterar Senha
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Para sua segurança, informe sua senha atual e escolha uma nova senha.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Current Password */}
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Senha Atual</Label>
              <div className="relative">
                <Input
                  type={showCurrentPassword ? "text" : "password"}
                  value={passwordForm.currentPassword}
                  onChange={(e) => setPasswordForm({...passwordForm, currentPassword: e.target.value})}
                  placeholder="Digite sua senha atual"
                  className="bg-white/5 border-white/10 text-white pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white"
                >
                  {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Nova Senha</Label>
              <div className="relative">
                <Input
                  type={showNewPassword ? "text" : "password"}
                  value={passwordForm.newPassword}
                  onChange={(e) => setPasswordForm({...passwordForm, newPassword: e.target.value})}
                  placeholder="Mínimo 6 caracteres"
                  className="bg-white/5 border-white/10 text-white pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white"
                >
                  {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {/* Password Strength Indicator */}
              {passwordForm.newPassword && (
                <div className="space-y-1">
                  <div className="flex gap-1">
                    {[1, 2, 3].map((level) => (
                      <div
                        key={level}
                        className={`h-1 flex-1 rounded-full ${
                          level <= passwordStrength.strength ? passwordStrength.color : 'bg-white/10'
                        }`}
                      />
                    ))}
                  </div>
                  <p className={`text-xs ${
                    passwordStrength.strength === 1 ? 'text-red-400' :
                    passwordStrength.strength === 2 ? 'text-yellow-400' : 'text-green-400'
                  }`}>
                    Força da senha: {passwordStrength.label}
                  </p>
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Confirmar Nova Senha</Label>
              <Input
                type="password"
                value={passwordForm.confirmPassword}
                onChange={(e) => setPasswordForm({...passwordForm, confirmPassword: e.target.value})}
                placeholder="Repita a nova senha"
                className="bg-white/5 border-white/10 text-white"
              />
              {passwordForm.confirmPassword && passwordForm.newPassword !== passwordForm.confirmPassword && (
                <p className="text-xs text-red-400">As senhas não coincidem</p>
              )}
              {passwordForm.confirmPassword && passwordForm.newPassword === passwordForm.confirmPassword && (
                <p className="text-xs text-green-400 flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" />
                  Senhas coincidem
                </p>
              )}
            </div>

            {/* Tips */}
            <div className="bg-primary/10 rounded-lg p-3 border border-primary/20">
              <p className="text-xs text-primary font-medium mb-1">Dicas para uma senha forte:</p>
              <ul className="text-xs text-muted-foreground space-y-0.5">
                <li>• Pelo menos 8 caracteres</li>
                <li>• Letras maiúsculas e minúsculas</li>
                <li>• Números e caracteres especiais</li>
              </ul>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setShowPasswordModal(false)}
              className="flex-1"
              disabled={changingPassword}
            >
              Cancelar
            </Button>
            <Button
              onClick={handlePasswordChange}
              disabled={changingPassword || !passwordForm.currentPassword || !passwordForm.newPassword || passwordForm.newPassword !== passwordForm.confirmPassword}
              className="flex-1 bg-primary hover:bg-primary/90"
            >
              {changingPassword ? (
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
              ) : (
                <Key className="h-4 w-4 mr-2" />
              )}
              Alterar Senha
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Profile;
