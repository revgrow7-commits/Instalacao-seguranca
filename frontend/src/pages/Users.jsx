import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '../components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../components/ui/alert-dialog';
import { Users as UsersIcon, Plus, Edit, Trash2, UserPlus, Shield, Wrench } from 'lucide-react';
import { toast } from 'sonner';

const Users = () => {
  const { isAdmin } = useAuth();
  const [users, setUsers] = useState([]);
  const [installers, setInstallers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'installer',
    phone: '',
    branch: 'POA'
  });

  useEffect(() => {
    if (isAdmin) {
      loadData();
    }
  }, [isAdmin]);

  const loadData = async () => {
    try {
      const [usersRes, installersRes] = await Promise.all([
        api.getUsers(),
        api.getInstallers()
      ]);
      setUsers(usersRes.data);
      setInstallers(installersRes.data);
    } catch (error) {
      toast.error('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!formData.name || !formData.email || !formData.password) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    try {
      await api.createUser(formData);
      toast.success('Usuário criado com sucesso!');
      setShowCreateDialog(false);
      resetForm();
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao criar usuário');
    }
  };

  const handleEdit = async () => {
    if (!formData.name || !formData.email) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    try {
      await api.updateUser(selectedUser.id, formData);
      toast.success('Usuário atualizado com sucesso!');
      setShowEditDialog(false);
      resetForm();
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao atualizar usuário');
    }
  };

  const handleDelete = async () => {
    try {
      await api.deleteUser(selectedUser.id);
      toast.success('Usuário deletado com sucesso!');
      setShowDeleteDialog(false);
      setSelectedUser(null);
      loadData();
    } catch (error) {
      toast.error('Erro ao deletar usuário');
    }
  };

  const openEditDialog = (user) => {
    setSelectedUser(user);
    const installer = installers.find(i => i.user_id === user.id);
    setFormData({
      name: user.name,
      email: user.email,
      password: '',
      role: user.role,
      phone: installer?.phone || '',
      branch: installer?.branch || 'POA'
    });
    setShowEditDialog(true);
  };

  const openDeleteDialog = (user) => {
    setSelectedUser(user);
    setShowDeleteDialog(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      email: '',
      password: '',
      role: 'installer',
      phone: '',
      branch: 'POA'
    });
    setSelectedUser(null);
  };

  const getRoleIcon = (role) => {
    switch (role) {
      case 'admin':
        return <Shield className="h-5 w-5 text-red-500" />;
      case 'manager':
        return <Wrench className="h-5 w-5 text-blue-500" />;
      default:
        return <UserPlus className="h-5 w-5 text-green-500" />;
    }
  };

  const getRoleName = (role) => {
    switch (role) {
      case 'admin':
        return 'Administrador';
      case 'manager':
        return 'Gerente';
      default:
        return 'Instalador';
    }
  };

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-red-500">Acesso negado. Apenas administradores podem acessar esta página.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="loading-pulse text-primary text-2xl font-heading">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6" data-testid="users-page">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-4xl font-heading font-bold text-white tracking-tight">Usuários</h1>
          <p className="text-muted-foreground mt-2">
            Gerencie usuários e permissões do sistema
          </p>
        </div>

        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button
              className="bg-primary hover:bg-primary/90 neon-glow"
              data-testid="create-user-button"
              onClick={resetForm}
            >
              <Plus className="mr-2 h-5 w-5" />
              Novo Usuário
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-white/10 max-w-md">
            <DialogHeader>
              <DialogTitle className="text-2xl font-heading text-white">Criar Novo Usuário</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Preencha os dados do novo usuário
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-white">Nome Completo *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="bg-white/5 border-white/10 text-white"
                  placeholder="João Silva"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="text-white">E-mail *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="bg-white/5 border-white/10 text-white"
                  placeholder="joao@industriavisual.com"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-white">Senha *</Label>
                <Input
                  id="password"
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="bg-white/5 border-white/10 text-white"
                  placeholder="••••••••"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="role" className="text-white">Perfil *</Label>
                <Select value={formData.role} onValueChange={(value) => setFormData({ ...formData, role: value })}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-white/10">
                    <SelectItem value="installer">Instalador</SelectItem>
                    <SelectItem value="manager">Gerente</SelectItem>
                    <SelectItem value="admin">Administrador</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formData.role === 'installer' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="phone" className="text-white">Telefone</Label>
                    <Input
                      id="phone"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="bg-white/5 border-white/10 text-white"
                      placeholder="(51) 99999-9999"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="branch" className="text-white">Filial</Label>
                    <Select value={formData.branch} onValueChange={(value) => setFormData({ ...formData, branch: value })}>
                      <SelectTrigger className="bg-white/5 border-white/10 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-white/10">
                        <SelectItem value="POA">Porto Alegre</SelectItem>
                        <SelectItem value="SP">São Paulo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </div>

            <DialogFooter className="mt-6">
              <Button
                variant="outline"
                onClick={() => {
                  setShowCreateDialog(false);
                  resetForm();
                }}
                className="border-white/20 text-white hover:bg-white/10"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleCreate}
                className="bg-primary hover:bg-primary/90"
              >
                Criar Usuário
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Users List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {users.map((user) => {
          const installer = installers.find(i => i.user_id === user.id);
          return (
            <Card
              key={user.id}
              className="bg-card border-white/5 hover:border-primary/50 transition-colors"
              data-testid={`user-card-${user.id}`}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {getRoleIcon(user.role)}
                    <div>
                      <CardTitle className="text-lg text-white">{user.name}</CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">{user.email}</p>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span
                    className={
                      `px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                        user.role === 'admin'
                          ? 'bg-red-500/20 text-red-500 border border-red-500/20'
                          : user.role === 'manager'
                          ? 'bg-blue-500/20 text-blue-500 border border-blue-500/20'
                          : 'bg-green-500/20 text-green-500 border border-green-500/20'
                      }`
                    }
                  >
                    {getRoleName(user.role)}
                  </span>
                </div>

                {installer && (
                  <div className="space-y-1 pt-2 border-t border-white/5">
                    {installer.phone && (
                      <p className="text-sm text-muted-foreground">📱 {installer.phone}</p>
                    )}
                    <p className="text-sm text-muted-foreground">🏢 Filial: {installer.branch}</p>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openEditDialog(user)}
                    className="flex-1 border-primary/50 text-primary hover:bg-primary/10"
                  >
                    <Edit className="h-4 w-4 mr-1" />
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openDeleteDialog(user)}
                    className="border-red-500/50 text-red-500 hover:bg-red-500/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="bg-card border-white/10 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-2xl font-heading text-white">Editar Usuário</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Atualize os dados do usuário
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name" className="text-white">Nome Completo *</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="bg-white/5 border-white/10 text-white"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-email" className="text-white">E-mail *</Label>
              <Input
                id="edit-email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="bg-white/5 border-white/10 text-white"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-password" className="text-white">Nova Senha (deixe em branco para manter)</Label>
              <Input
                id="edit-password"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="bg-white/5 border-white/10 text-white"
                placeholder="••••••••"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-role" className="text-white">Perfil *</Label>
              <Select value={formData.role} onValueChange={(value) => setFormData({ ...formData, role: value })}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-white/10">
                  <SelectItem value="installer">Instalador</SelectItem>
                  <SelectItem value="manager">Gerente</SelectItem>
                  <SelectItem value="admin">Administrador</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button
              variant="outline"
              onClick={() => {
                setShowEditDialog(false);
                resetForm();
              }}
              className="border-white/20 text-white hover:bg-white/10"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleEdit}
              className="bg-primary hover:bg-primary/90"
            >
              Salvar Alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="bg-card border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Tem certeza que deseja deletar o usuário <strong className="text-white">{selectedUser?.name}</strong>?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/20 text-white hover:bg-white/10">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              Deletar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Users;