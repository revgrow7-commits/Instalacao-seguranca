import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { 
  CheckCircle, MapPin, Clock, Image, Eye, Search, Filter, 
  Trash2, Archive, RefreshCw, LogIn, LogOut, Play, Pause,
  ChevronDown, Package
} from 'lucide-react';
import { toast } from 'sonner';

// Skeleton loader component
const CheckinSkeleton = () => (
  <Card className="bg-card border-white/5 animate-pulse">
    <CardHeader className="pb-2">
      <div className="h-5 bg-white/10 rounded w-3/4 mb-2"></div>
      <div className="h-4 bg-white/10 rounded w-1/2"></div>
    </CardHeader>
    <CardContent className="space-y-3">
      <div className="aspect-video bg-white/10 rounded-lg"></div>
      <div className="h-4 bg-white/10 rounded w-full"></div>
      <div className="h-8 bg-white/10 rounded w-full"></div>
    </CardContent>
  </Card>
);

// Mini card for check-in/checkout without photo for performance
const MiniCheckinCard = ({ checkin, onView, onDelete, onArchive, type }) => {
  const isCheckout = type === 'checkout';
  const photo = isCheckout ? checkin.checkout_photo : checkin.checkin_photo;
  const date = isCheckout ? checkin.checkout_at : checkin.checkin_at;
  
  return (
    <Card className="bg-card border-white/5 hover:border-primary/50 transition-all group">
      <CardContent className="p-4">
        <div className="flex gap-3">
          {/* Photo Thumbnail */}
          <div className="w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden bg-white/5">
            {photo ? (
              <img
                src={photo.startsWith('data:') ? photo : `data:image/jpeg;base64,${photo}`}
                alt={type}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Image className="h-6 w-6 text-muted-foreground" />
              </div>
            )}
          </div>
          
          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-sm font-medium text-white truncate">
                  {checkin.job_title || 'Job'}
                </h3>
                <p className="text-xs text-muted-foreground truncate">
                  {checkin.installer_name || 'Instalador'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {date ? new Date(date).toLocaleString('pt-BR', {
                    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                  }) : 'N/A'}
                </p>
              </div>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                checkin.status === 'completed'
                  ? 'bg-green-500/20 text-green-400'
                  : checkin.status === 'paused'
                  ? 'bg-orange-500/20 text-orange-400'
                  : 'bg-blue-500/20 text-blue-400'
              }`}>
                {checkin.status === 'completed' ? 'OK' : 
                 checkin.status === 'paused' ? 'PAUSA' : 'ATIVO'}
              </span>
            </div>
            
            {/* Product & Duration */}
            <div className="flex items-center gap-2 mt-2 text-xs">
              {checkin.product_name && (
                <span className="text-muted-foreground truncate max-w-[120px]" title={checkin.product_name}>
                  <Package className="h-3 w-3 inline mr-1" />
                  {checkin.product_name.substring(0, 20)}...
                </span>
              )}
              {checkin.duration_minutes && (
                <span className="text-green-400 whitespace-nowrap">
                  <Clock className="h-3 w-3 inline mr-1" />
                  {checkin.duration_minutes}min
                </span>
              )}
            </div>
          </div>
        </div>
        
        {/* Actions */}
        <div className="flex gap-2 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            onClick={() => onView(checkin.id)}
            variant="outline"
            size="sm"
            className="flex-1 h-7 text-xs border-primary/50 text-primary hover:bg-primary/10"
          >
            <Eye className="h-3 w-3 mr-1" />
            Ver
          </Button>
          <Button
            onClick={() => onArchive(checkin.id)}
            variant="outline"
            size="sm"
            className="h-7 text-xs border-orange-500/50 text-orange-400 hover:bg-orange-500/10"
          >
            <Archive className="h-3 w-3" />
          </Button>
          <Button
            onClick={() => onDelete(checkin.id)}
            variant="outline"
            size="sm"
            className="h-7 text-xs border-red-500/50 text-red-400 hover:bg-red-500/10"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

const Checkins = () => {
  const navigate = useNavigate();
  const { isAdmin, isManager } = useAuth();
  const [checkins, setCheckins] = useState([]);
  const [installers, setInstallers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [installerFilter, setInstallerFilter] = useState('all');
  const [activeTab, setActiveTab] = useState('all');
  const [visibleCount, setVisibleCount] = useState(12);
  const [deletingId, setDeletingId] = useState(null);
  const [archivingId, setArchivingId] = useState(null);

  useEffect(() => {
    if (!isAdmin && !isManager) {
      navigate('/dashboard');
      return;
    }
    loadData();
  }, [isAdmin, isManager, navigate]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [checkinsRes, installersRes] = await Promise.all([
        api.getAllItemCheckins(),
        api.getInstallers()
      ]);
      
      // Filter out archived checkins and sort by most recent
      const activeCheckins = checkinsRes.data
        .filter(c => !c.archived)
        .sort((a, b) => new Date(b.checkin_at || 0) - new Date(a.checkin_at || 0));
      
      setCheckins(activeCheckins);
      setInstallers(installersRes.data);
    } catch (error) {
      console.error('Error loading checkins:', error);
      toast.error('Erro ao carregar check-ins');
    } finally {
      setLoading(false);
    }
  }, []);

  // Memoized filtered data
  const { filteredCheckins, checkinsOnly, checkoutsOnly, stats } = useMemo(() => {
    const filtered = checkins.filter(checkin => {
      const jobTitle = (checkin.job_title || '').toLowerCase();
      const installerName = (checkin.installer_name || '').toLowerCase();
      const productName = (checkin.product_name || '').toLowerCase();
      const matchesSearch = !searchTerm || 
        jobTitle.includes(searchTerm.toLowerCase()) || 
        installerName.includes(searchTerm.toLowerCase()) ||
        productName.includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' || checkin.status === statusFilter;
      const matchesInstaller = installerFilter === 'all' || checkin.installer_id === installerFilter;
      
      return matchesSearch && matchesStatus && matchesInstaller;
    });

    // Separate check-ins from checkouts
    const withCheckout = filtered.filter(c => c.checkout_at && c.checkout_photo);
    const withoutCheckout = filtered.filter(c => !c.checkout_at || !c.checkout_photo);

    return {
      filteredCheckins: filtered,
      checkinsOnly: withoutCheckout,
      checkoutsOnly: withCheckout,
      stats: {
        total: filtered.length,
        inProgress: filtered.filter(c => c.status === 'in_progress').length,
        completed: filtered.filter(c => c.status === 'completed').length,
        paused: filtered.filter(c => c.status === 'paused').length,
      }
    };
  }, [checkins, searchTerm, statusFilter, installerFilter]);

  // Get data based on active tab
  const displayData = useMemo(() => {
    switch (activeTab) {
      case 'checkins':
        return checkinsOnly;
      case 'checkouts':
        return checkoutsOnly;
      default:
        return filteredCheckins;
    }
  }, [activeTab, filteredCheckins, checkinsOnly, checkoutsOnly]);

  const handleDelete = async (checkinId) => {
    if (!window.confirm('Tem certeza que deseja excluir este registro?\n\nEsta ação não pode ser desfeita.')) {
      return;
    }
    
    try {
      setDeletingId(checkinId);
      await api.deleteItemCheckin(checkinId);
      setCheckins(prev => prev.filter(c => c.id !== checkinId));
      toast.success('Registro excluído com sucesso');
    } catch (error) {
      console.error('Error deleting checkin:', error);
      toast.error('Erro ao excluir registro');
    } finally {
      setDeletingId(null);
    }
  };

  const handleArchive = async (checkinId) => {
    if (!window.confirm('Arquivar este registro?\n\nEle será removido da lista mas não excluído.')) {
      return;
    }
    
    try {
      setArchivingId(checkinId);
      await api.archiveItemCheckin(checkinId);
      setCheckins(prev => prev.filter(c => c.id !== checkinId));
      toast.success('Registro arquivado');
    } catch (error) {
      console.error('Error archiving checkin:', error);
      toast.error('Erro ao arquivar registro');
    } finally {
      setArchivingId(null);
    }
  };

  const handleView = (checkinId) => {
    navigate(`/checkin-viewer/${checkinId}`);
  };

  const loadMore = () => {
    setVisibleCount(prev => prev + 12);
  };

  if (loading) {
    return (
      <div className="p-4 md:p-8 space-y-6">
        <div className="h-10 bg-white/10 rounded w-48 animate-pulse"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => <CheckinSkeleton key={i} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-heading font-bold text-white tracking-tight">
            Check-ins
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Gerencie os registros de check-in e checkout
          </p>
        </div>
        <Button
          onClick={loadData}
          variant="outline"
          className="border-primary/50 text-primary hover:bg-primary/10"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Atualizar
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card border-white/5">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/20">
              <CheckCircle className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{stats.total}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-white/5">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/20">
              <Play className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{stats.inProgress}</p>
              <p className="text-xs text-muted-foreground">Em Andamento</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-white/5">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/20">
              <CheckCircle className="h-5 w-5 text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{stats.completed}</p>
              <p className="text-xs text-muted-foreground">Completos</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-white/5">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-orange-500/20">
              <Pause className="h-5 w-5 text-orange-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{stats.paused}</p>
              <p className="text-xs text-muted-foreground">Pausados</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="bg-card border-white/5">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative md:col-span-2">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por job, instalador ou produto..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-white/5 border-white/10 text-white"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="bg-white/5 border-white/10 text-white">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent className="bg-card border-white/10">
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="in_progress">🔵 Em andamento</SelectItem>
                <SelectItem value="completed">🟢 Completo</SelectItem>
                <SelectItem value="paused">🟠 Pausado</SelectItem>
              </SelectContent>
            </Select>
            <Select value={installerFilter} onValueChange={setInstallerFilter}>
              <SelectTrigger className="bg-white/5 border-white/10 text-white">
                <SelectValue placeholder="Instalador" />
              </SelectTrigger>
              <SelectContent className="bg-card border-white/10">
                <SelectItem value="all">Todos os instaladores</SelectItem>
                {installers.map(installer => (
                  <SelectItem key={installer.id} value={installer.id}>
                    {installer.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 bg-white/5">
          <TabsTrigger value="all" className="data-[state=active]:bg-primary data-[state=active]:text-white">
            <CheckCircle className="h-4 w-4 mr-2" />
            Todos ({filteredCheckins.length})
          </TabsTrigger>
          <TabsTrigger value="checkins" className="data-[state=active]:bg-blue-500 data-[state=active]:text-white">
            <LogIn className="h-4 w-4 mr-2" />
            Check-ins ({checkinsOnly.length})
          </TabsTrigger>
          <TabsTrigger value="checkouts" className="data-[state=active]:bg-green-500 data-[state=active]:text-white">
            <LogOut className="h-4 w-4 mr-2" />
            Check-outs ({checkoutsOnly.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-6">
          {displayData.length === 0 ? (
            <Card className="bg-card border-white/5">
              <CardContent className="py-12 text-center">
                <CheckCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  Nenhum registro encontrado com os filtros selecionados
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Two Column Layout for Checkouts Tab */}
              {activeTab === 'checkouts' ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Check-in Column */}
                  <div className="space-y-4">
                    <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                      <LogIn className="h-5 w-5 text-blue-400" />
                      Entrada (Check-in)
                    </h2>
                    <div className="space-y-3">
                      {displayData.slice(0, visibleCount).map(checkin => (
                        <MiniCheckinCard
                          key={`checkin-${checkin.id}`}
                          checkin={checkin}
                          type="checkin"
                          onView={handleView}
                          onDelete={handleDelete}
                          onArchive={handleArchive}
                        />
                      ))}
                    </div>
                  </div>
                  
                  {/* Check-out Column */}
                  <div className="space-y-4">
                    <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                      <LogOut className="h-5 w-5 text-green-400" />
                      Saída (Check-out)
                    </h2>
                    <div className="space-y-3">
                      {displayData.slice(0, visibleCount).map(checkin => (
                        <MiniCheckinCard
                          key={`checkout-${checkin.id}`}
                          checkin={checkin}
                          type="checkout"
                          onView={handleView}
                          onDelete={handleDelete}
                          onArchive={handleArchive}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                /* Grid Layout for All/Check-ins Tab */
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {displayData.slice(0, visibleCount).map(checkin => (
                    <MiniCheckinCard
                      key={checkin.id}
                      checkin={checkin}
                      type={checkin.checkout_at ? 'checkout' : 'checkin'}
                      onView={handleView}
                      onDelete={handleDelete}
                      onArchive={handleArchive}
                    />
                  ))}
                </div>
              )}
              
              {/* Load More Button */}
              {visibleCount < displayData.length && (
                <div className="flex justify-center mt-6">
                  <Button
                    onClick={loadMore}
                    variant="outline"
                    className="border-white/20 text-white hover:bg-white/5"
                  >
                    <ChevronDown className="h-4 w-4 mr-2" />
                    Carregar mais ({displayData.length - visibleCount} restantes)
                  </Button>
                </div>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Checkins;
