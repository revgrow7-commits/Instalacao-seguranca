import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Checkbox } from '../components/ui/checkbox';
import { Input } from '../components/ui/input';
import { ArrowLeft, Users, MapPin, Calendar, Briefcase, Clock, User } from 'lucide-react';
import { toast } from 'sonner';

const JobDetail = () => {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const { user, isAdmin, isManager } = useAuth();
  const [job, setJob] = useState(null);
  const [installers, setInstallers] = useState([]);
  const [selectedInstallers, setSelectedInstallers] = useState([]);
  const [scheduledDate, setScheduledDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);

  useEffect(() => {
    loadData();
  }, [jobId]);

  const loadData = async () => {
    try {
      const [jobRes, installersRes] = await Promise.all([
        api.getJob(jobId),
        isAdmin || isManager ? api.getInstallers() : Promise.resolve({ data: [] })
      ]);
      
      setJob(jobRes.data);
      setInstallers(installersRes.data);
      setSelectedInstallers(jobRes.data.assigned_installers || []);
      
      if (jobRes.data.scheduled_date) {
        const date = new Date(jobRes.data.scheduled_date);
        setScheduledDate(date.toISOString().slice(0, 16));
      }
    } catch (error) {
      toast.error('Erro ao carregar job');
      navigate('/jobs');
    } finally {
      setLoading(false);
    }
  };

  const handleAssignInstallers = async () => {
    if (selectedInstallers.length === 0) {
      toast.error('Selecione pelo menos um instalador');
      return;
    }

    try {
      await api.assignJob(jobId, selectedInstallers);
      toast.success('Instaladores atribuídos com sucesso!');
      setShowAssignDialog(false);
      loadData();
    } catch (error) {
      toast.error('Erro ao atribuir instaladores');
    }
  };

  const handleScheduleJob = async () => {
    if (!scheduledDate) {
      toast.error('Selecione uma data e hora');
      return;
    }

    try {
      await api.scheduleJob(jobId, scheduledDate, selectedInstallers.length > 0 ? selectedInstallers : null);
      toast.success('Job agendado com sucesso!');
      setShowScheduleDialog(false);
      loadData();
    } catch (error) {
      toast.error('Erro ao agendar job');
    }
  };

  const toggleInstaller = (installerId) => {
    setSelectedInstallers(prev => 
      prev.includes(installerId)
        ? prev.filter(id => id !== installerId)
        : [...prev, installerId]
    );
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500/20 text-green-500 border border-green-500/20';
      case 'in_progress':
        return 'bg-blue-500/20 text-blue-500 border border-blue-500/20';
      default:
        return 'bg-yellow-500/20 text-yellow-500 border border-yellow-500/20';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'completed':
        return 'Concluído';
      case 'in_progress':
        return 'Em Andamento';
      default:
        return 'Pendente';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="loading-pulse text-primary text-2xl font-heading">Carregando...</div>
      </div>
    );
  }

  if (!job) {
    return null;
  }

  const assignedInstallersData = installers.filter(i => selectedInstallers.includes(i.id));

  return (
    <div className="p-4 md:p-8 space-y-6" data-testid="job-detail-page">
      {/* Back Button */}
      <Button
        variant="ghost"
        onClick={() => navigate('/jobs')}
        className="text-white hover:text-primary"
        data-testid="back-button"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Voltar para Jobs
      </Button>

      {/* Job Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h1 className="text-4xl font-heading font-bold text-white tracking-tight">
            {job.title}
          </h1>
          <p className="text-muted-foreground mt-2">Job ID: {job.id}</p>
        </div>

        <span className={`px-4 py-2 rounded-full text-sm font-bold uppercase tracking-wider ${getStatusColor(job.status)}`}>
          {getStatusText(job.status)}
        </span>
      </div>

      {/* Action Buttons - Admin/Manager only */}
      {(isAdmin || isManager) && (
        <div className="flex gap-3">
          <Dialog open={showAssignDialog} onOpenChange={setShowAssignDialog}>
            <DialogTrigger asChild>
              <Button className="bg-primary hover:bg-primary/90">
                <Users className="mr-2 h-4 w-4" />
                Atribuir Instaladores
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-white/10 max-w-md">
              <DialogHeader>
                <DialogTitle className="text-2xl font-heading text-white">Atribuir Instaladores</DialogTitle>
                <DialogDescription className="text-muted-foreground">
                  Selecione os instaladores para este job
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3 mt-4 max-h-96 overflow-y-auto">
                {installers.map((installer) => (
                  <div
                    key={installer.id}
                    className="flex items-center space-x-3 p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                  >
                    <Checkbox
                      checked={selectedInstallers.includes(installer.id)}
                      onCheckedChange={() => toggleInstaller(installer.id)}
                    />
                    <div className="flex-1">
                      <p className="text-white font-medium">{installer.full_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {installer.branch} • {installer.phone || 'Sem telefone'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <DialogFooter className="mt-6">
                <Button
                  variant="outline"
                  onClick={() => setShowAssignDialog(false)}
                  className="border-white/20 text-white hover:bg-white/10"
                >
                  Cancelar
                </Button>
                <Button onClick={handleAssignInstallers} className="bg-primary hover:bg-primary/90">
                  Atribuir ({selectedInstallers.length})
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={showScheduleDialog} onOpenChange={setShowScheduleDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" className="border-primary/50 text-primary hover:bg-primary/10">
                <Calendar className="mr-2 h-4 w-4" />
                Agendar
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-white/10 max-w-md">
              <DialogHeader>
                <DialogTitle className="text-2xl font-heading text-white">Agendar Job</DialogTitle>
                <DialogDescription className="text-muted-foreground">
                  Defina a data e hora para este job
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="scheduled-date" className="text-white">Data e Hora</Label>
                  <Input
                    id="scheduled-date"
                    type="datetime-local"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    className="bg-white/5 border-white/10 text-white"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-white">Instaladores Atribuídos</Label>
                  {assignedInstallersData.length > 0 ? (
                    <div className="space-y-2">
                      {assignedInstallersData.map((installer) => (
                        <div key={installer.id} className="p-2 rounded bg-white/5 text-sm text-white">
                          ✓ {installer.full_name} ({installer.branch})
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Nenhum instalador atribuído. Atribua instaladores primeiro.
                    </p>
                  )}
                </div>
              </div>

              <DialogFooter className="mt-6">
                <Button
                  variant="outline"
                  onClick={() => setShowScheduleDialog(false)}
                  className="border-white/20 text-white hover:bg-white/10"
                >
                  Cancelar
                </Button>
                <Button onClick={handleScheduleJob} className="bg-primary hover:bg-primary/90">
                  Agendar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {/* Job Information */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-card border-white/5">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-primary" />
              Informações do Job
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-sm text-muted-foreground">Cliente</p>
              <p className="text-white font-medium">{job.client_name}</p>
            </div>
            
            {job.client_address && (
              <div>
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> Endereço
                </p>
                <p className="text-white">{job.client_address}</p>
              </div>
            )}

            <div>
              <p className="text-sm text-muted-foreground">Filial</p>
              <p className="text-white font-medium">{job.branch === 'SP' ? 'São Paulo' : 'Porto Alegre'}</p>
            </div>

            {job.scheduled_date && (
              <div>
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> Agendado para
                </p>
                <p className="text-white font-medium">
                  {new Date(job.scheduled_date).toLocaleString('pt-BR')}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border-white/5">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Instaladores Atribuídos
            </CardTitle>
          </CardHeader>
          <CardContent>
            {assignedInstallersData.length > 0 ? (
              <div className="space-y-2">
                {assignedInstallersData.map((installer) => (
                  <div
                    key={installer.id}
                    className="flex items-center gap-3 p-3 rounded-lg bg-white/5"
                  >
                    <User className="h-5 w-5 text-primary" />
                    <div>
                      <p className="text-white font-medium">{installer.full_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {installer.branch} • {installer.phone || 'Sem telefone'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-6">
                Nenhum instalador atribuído ainda
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Job Items */}
      {job.items && job.items.length > 0 && (
        <Card className="bg-card border-white/5">
          <CardHeader>
            <CardTitle className="text-white">Itens do Job</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {job.items.map((item, index) => (
                <div
                  key={index}
                  className="p-3 rounded-lg bg-white/5 border border-white/5"
                >
                  <p className="text-white font-medium">{item.name || `Item ${index + 1}`}</p>
                  {item.quantity && (
                    <p className="text-sm text-muted-foreground mt-1">
                      Quantidade: {item.quantity}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default JobDetail;
