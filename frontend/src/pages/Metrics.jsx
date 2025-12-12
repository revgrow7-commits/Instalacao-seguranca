import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { 
  BarChart3, 
  TrendingUp, 
  Clock, 
  Ruler, 
  Package, 
  Plus,
  Target,
  Layers,
  Mountain,
  Building,
  Palette,
  ArrowLeft,
  RefreshCw,
  Activity
} from 'lucide-react';

const Metrics = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState(null);
  const [families, setFamilies] = useState([]);
  const [products, setProducts] = useState([]);
  const [showAddFamily, setShowAddFamily] = useState(false);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [jobs, setJobs] = useState([]);
  
  // Form states
  const [newFamily, setNewFamily] = useState({ name: '', description: '', color: '#3B82F6' });
  const [newProduct, setNewProduct] = useState({
    job_id: '',
    product_name: '',
    family_id: '',
    width_m: '',
    height_m: '',
    quantity: 1,
    complexity_level: 1,
    height_category: 'terreo',
    scenario_category: 'loja_rua',
    estimated_time_min: '',
    actual_time_min: '',
    installers_count: 1,
    cause_notes: ''
  });

  useEffect(() => {
    if (user?.role !== 'admin' && user?.role !== 'manager') {
      navigate('/');
      return;
    }
    fetchData();
  }, [user, navigate]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [metricsRes, familiesRes, productsRes, jobsRes] = await Promise.all([
        api.getProductivityMetrics(),
        api.getProductFamilies(),
        api.getProductsInstalled(),
        api.getJobs()
      ]);
      setMetrics(metricsRes.data);
      setFamilies(familiesRes.data);
      setProducts(productsRes.data);
      setJobs(jobsRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const seedFamilies = async () => {
    try {
      await api.seedProductFamilies();
      fetchData();
    } catch (error) {
      console.error('Error seeding families:', error);
    }
  };

  const handleAddFamily = async (e) => {
    e.preventDefault();
    try {
      await api.createProductFamily(newFamily);
      setShowAddFamily(false);
      setNewFamily({ name: '', description: '', color: '#3B82F6' });
      fetchData();
    } catch (error) {
      console.error('Error creating family:', error);
    }
  };

  const handleAddProduct = async (e) => {
    e.preventDefault();
    try {
      const data = {
        ...newProduct,
        width_m: newProduct.width_m ? parseFloat(newProduct.width_m) : null,
        height_m: newProduct.height_m ? parseFloat(newProduct.height_m) : null,
        quantity: parseInt(newProduct.quantity),
        complexity_level: parseInt(newProduct.complexity_level),
        estimated_time_min: newProduct.estimated_time_min ? parseInt(newProduct.estimated_time_min) : null,
        actual_time_min: newProduct.actual_time_min ? parseInt(newProduct.actual_time_min) : null,
        installers_count: parseInt(newProduct.installers_count)
      };
      await api.createProductInstalled(data);
      setShowAddProduct(false);
      setNewProduct({
        job_id: '',
        product_name: '',
        family_id: '',
        width_m: '',
        height_m: '',
        quantity: 1,
        complexity_level: 1,
        height_category: 'terreo',
        scenario_category: 'loja_rua',
        estimated_time_min: '',
        actual_time_min: '',
        installers_count: 1,
        cause_notes: ''
      });
      fetchData();
    } catch (error) {
      console.error('Error creating product:', error);
    }
  };

  const heightCategoryLabels = {
    terreo: 'Térreo (até 2m)',
    media: 'Média (2-4m)',
    alta: 'Alta (4-8m)',
    muito_alta: 'Muito Alta (+8m)'
  };

  const scenarioLabels = {
    loja_rua: 'Loja de Rua',
    shopping: 'Shopping',
    evento: 'Evento',
    fachada: 'Fachada',
    outdoor: 'Outdoor',
    veiculo: 'Veículo'
  };

  const complexityLabels = {
    1: 'Muito Fácil',
    2: 'Fácil',
    3: 'Médio',
    4: 'Difícil',
    5: 'Muito Difícil'
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-white">Carregando métricas...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/dashboard')}
              className="text-muted-foreground hover:text-white"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-white flex items-center gap-2">
                <BarChart3 className="h-8 w-8 text-primary" />
                Métricas de Produtividade
              </h1>
              <p className="text-muted-foreground mt-1">
                Análise de produtividade por produto, família e cenário
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={fetchData} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </Button>
            
            {families.length === 0 && (
              <Button onClick={seedFamilies} className="gap-2 bg-purple-600 hover:bg-purple-700">
                <Layers className="h-4 w-4" />
                Criar Famílias Padrão
              </Button>
            )}

            <Dialog open={showAddFamily} onOpenChange={setShowAddFamily}>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <Plus className="h-4 w-4" />
                  Nova Família
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-card border-white/10">
                <DialogHeader>
                  <DialogTitle className="text-white">Nova Família de Produtos</DialogTitle>
                  <DialogDescription>Adicione uma nova categoria de produtos</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleAddFamily} className="space-y-4">
                  <div>
                    <Label className="text-white">Nome</Label>
                    <Input
                      value={newFamily.name}
                      onChange={(e) => setNewFamily({ ...newFamily, name: e.target.value })}
                      placeholder="Ex: Adesivos, Lonas, ACM..."
                      className="bg-white/5 border-white/10 text-white"
                      required
                    />
                  </div>
                  <div>
                    <Label className="text-white">Descrição</Label>
                    <Input
                      value={newFamily.description}
                      onChange={(e) => setNewFamily({ ...newFamily, description: e.target.value })}
                      placeholder="Descrição da família"
                      className="bg-white/5 border-white/10 text-white"
                    />
                  </div>
                  <div>
                    <Label className="text-white">Cor</Label>
                    <Input
                      type="color"
                      value={newFamily.color}
                      onChange={(e) => setNewFamily({ ...newFamily, color: e.target.value })}
                      className="h-10 w-full"
                    />
                  </div>
                  <Button type="submit" className="w-full">Criar Família</Button>
                </form>
              </DialogContent>
            </Dialog>

            <Dialog open={showAddProduct} onOpenChange={setShowAddProduct}>
              <DialogTrigger asChild>
                <Button className="gap-2 bg-primary hover:bg-primary/90">
                  <Plus className="h-4 w-4" />
                  Registrar Instalação
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-card border-white/10 max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="text-white">Registrar Produto Instalado</DialogTitle>
                  <DialogDescription>Registre uma instalação para calcular métricas de produtividade</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleAddProduct} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-white">Job (Concluídos)</Label>
                      <Select value={newProduct.job_id} onValueChange={(v) => setNewProduct({ ...newProduct, job_id: v })}>
                        <SelectTrigger className="bg-white/5 border-white/10 text-white">
                          <SelectValue placeholder="Selecione o job" />
                        </SelectTrigger>
                        <SelectContent className="bg-card border-white/10">
                          {jobs.filter(job => job.status === 'completed').length === 0 ? (
                            <div className="p-3 text-center text-muted-foreground text-sm">
                              Nenhum job concluído disponível
                            </div>
                          ) : (
                            jobs.filter(job => job.status === 'completed').map(job => (
                              <SelectItem key={job.id} value={job.id}>{job.title}</SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-white">Família</Label>
                      <Select value={newProduct.family_id} onValueChange={(v) => setNewProduct({ ...newProduct, family_id: v })}>
                        <SelectTrigger className="bg-white/5 border-white/10 text-white">
                          <SelectValue placeholder="Selecione a família" />
                        </SelectTrigger>
                        <SelectContent className="bg-card border-white/10">
                          {families.map(family => (
                            <SelectItem key={family.id} value={family.id}>{family.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <Label className="text-white">Nome do Produto</Label>
                    <Input
                      value={newProduct.product_name}
                      onChange={(e) => setNewProduct({ ...newProduct, product_name: e.target.value })}
                      placeholder="Ex: Adesivo Branco Impresso"
                      className="bg-white/5 border-white/10 text-white"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label className="text-white">Largura (m)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={newProduct.width_m}
                        onChange={(e) => setNewProduct({ ...newProduct, width_m: e.target.value })}
                        placeholder="2.5"
                        className="bg-white/5 border-white/10 text-white"
                      />
                    </div>
                    <div>
                      <Label className="text-white">Altura (m)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={newProduct.height_m}
                        onChange={(e) => setNewProduct({ ...newProduct, height_m: e.target.value })}
                        placeholder="1.2"
                        className="bg-white/5 border-white/10 text-white"
                      />
                    </div>
                    <div>
                      <Label className="text-white">Quantidade</Label>
                      <Input
                        type="number"
                        value={newProduct.quantity}
                        onChange={(e) => setNewProduct({ ...newProduct, quantity: e.target.value })}
                        className="bg-white/5 border-white/10 text-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label className="text-white">Complexidade</Label>
                      <Select value={String(newProduct.complexity_level)} onValueChange={(v) => setNewProduct({ ...newProduct, complexity_level: parseInt(v) })}>
                        <SelectTrigger className="bg-white/5 border-white/10 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-card border-white/10">
                          {[1, 2, 3, 4, 5].map(level => (
                            <SelectItem key={level} value={String(level)}>{level} - {complexityLabels[level]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-white">Altura</Label>
                      <Select value={newProduct.height_category} onValueChange={(v) => setNewProduct({ ...newProduct, height_category: v })}>
                        <SelectTrigger className="bg-white/5 border-white/10 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-card border-white/10">
                          {Object.entries(heightCategoryLabels).map(([key, label]) => (
                            <SelectItem key={key} value={key}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-white">Cenário</Label>
                      <Select value={newProduct.scenario_category} onValueChange={(v) => setNewProduct({ ...newProduct, scenario_category: v })}>
                        <SelectTrigger className="bg-white/5 border-white/10 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-card border-white/10">
                          {Object.entries(scenarioLabels).map(([key, label]) => (
                            <SelectItem key={key} value={key}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label className="text-white">Tempo Estimado (min)</Label>
                      <Input
                        type="number"
                        value={newProduct.estimated_time_min}
                        onChange={(e) => setNewProduct({ ...newProduct, estimated_time_min: e.target.value })}
                        placeholder="60"
                        className="bg-white/5 border-white/10 text-white"
                      />
                    </div>
                    <div>
                      <Label className="text-white">Tempo Real (min)</Label>
                      <Input
                        type="number"
                        value={newProduct.actual_time_min}
                        onChange={(e) => setNewProduct({ ...newProduct, actual_time_min: e.target.value })}
                        placeholder="75"
                        className="bg-white/5 border-white/10 text-white"
                        required
                      />
                    </div>
                    <div>
                      <Label className="text-white">Nº Instaladores</Label>
                      <Input
                        type="number"
                        value={newProduct.installers_count}
                        onChange={(e) => setNewProduct({ ...newProduct, installers_count: e.target.value })}
                        className="bg-white/5 border-white/10 text-white"
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="text-white">Observações (causa de desvio)</Label>
                    <Input
                      value={newProduct.cause_notes}
                      onChange={(e) => setNewProduct({ ...newProduct, cause_notes: e.target.value })}
                      placeholder="Ex: Chuva, superfície irregular..."
                      className="bg-white/5 border-white/10 text-white"
                    />
                  </div>

                  <Button type="submit" className="w-full">Registrar Instalação</Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Overall Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-blue-500/20 to-blue-600/10 border-blue-500/20">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-blue-400">Total Produtos</p>
                  <p className="text-3xl font-bold text-white">{metrics?.overall?.total_products || 0}</p>
                </div>
                <Package className="h-10 w-10 text-blue-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-500/20 to-green-600/10 border-green-500/20">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-green-400">Área Total (m²)</p>
                  <p className="text-3xl font-bold text-white">{metrics?.overall?.total_area_m2?.toLocaleString('pt-BR') || 0}</p>
                </div>
                <Ruler className="h-10 w-10 text-green-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-500/20 to-purple-600/10 border-purple-500/20">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-purple-400">Tempo Total (h)</p>
                  <p className="text-3xl font-bold text-white">{metrics?.overall?.total_time_hours?.toLocaleString('pt-BR') || 0}</p>
                </div>
                <Clock className="h-10 w-10 text-purple-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-yellow-500/20 to-yellow-600/10 border-yellow-500/20">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-yellow-400">Produtividade Média</p>
                  <p className="text-3xl font-bold text-white">{metrics?.overall?.avg_productivity_m2_h || 0} <span className="text-lg">m²/h</span></p>
                </div>
                <TrendingUp className="h-10 w-10 text-yellow-400" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs for different views */}
        <Tabs defaultValue="families" className="space-y-6">
          <TabsList className="bg-white/5">
            <TabsTrigger value="families" className="data-[state=active]:bg-primary">
              <Layers className="h-4 w-4 mr-2" />
              Por Família
            </TabsTrigger>
            <TabsTrigger value="complexity" className="data-[state=active]:bg-primary">
              <Target className="h-4 w-4 mr-2" />
              Por Complexidade
            </TabsTrigger>
            <TabsTrigger value="height" className="data-[state=active]:bg-primary">
              <Mountain className="h-4 w-4 mr-2" />
              Por Altura
            </TabsTrigger>
            <TabsTrigger value="scenario" className="data-[state=active]:bg-primary">
              <Building className="h-4 w-4 mr-2" />
              Por Cenário
            </TabsTrigger>
            <TabsTrigger value="history" className="data-[state=active]:bg-primary">
              <Activity className="h-4 w-4 mr-2" />
              Histórico
            </TabsTrigger>
          </TabsList>

          {/* By Family */}
          <TabsContent value="families">
            <Card className="bg-card border-white/5">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Palette className="h-5 w-5 text-primary" />
                  Produtividade por Família de Produtos
                </CardTitle>
                <CardDescription>Métricas consolidadas por tipo de material</CardDescription>
              </CardHeader>
              <CardContent>
                {Object.keys(metrics?.by_family || {}).length === 0 ? (
                  <div className="text-center py-12">
                    <Layers className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">Nenhuma família cadastrada ainda.</p>
                    <Button onClick={seedFamilies} className="mt-4 gap-2">
                      <Plus className="h-4 w-4" />
                      Criar Famílias Padrão
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Object.entries(metrics?.by_family || {}).map(([name, data]) => (
                      <div
                        key={name}
                        className="p-4 rounded-lg bg-white/5 border border-white/10 hover:border-white/20 transition-colors"
                      >
                        <div className="flex items-center gap-2 mb-3">
                          <div
                            className="w-4 h-4 rounded-full"
                            style={{ backgroundColor: data.color }}
                          />
                          <h3 className="text-white font-semibold">{name}</h3>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div className="bg-white/5 rounded p-2">
                            <p className="text-muted-foreground">Produtos</p>
                            <p className="text-white font-bold">{data.total_products}</p>
                          </div>
                          <div className="bg-white/5 rounded p-2">
                            <p className="text-muted-foreground">Área (m²)</p>
                            <p className="text-white font-bold">{data.total_area_m2}</p>
                          </div>
                          <div className="bg-white/5 rounded p-2">
                            <p className="text-muted-foreground">Tempo (h)</p>
                            <p className="text-white font-bold">{data.total_time_hours}</p>
                          </div>
                          <div className="bg-primary/20 rounded p-2 border border-primary/30">
                            <p className="text-primary">Prod. (m²/h)</p>
                            <p className="text-white font-bold">{data.avg_productivity_m2_h}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* By Complexity */}
          <TabsContent value="complexity">
            <Card className="bg-card border-white/5">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Target className="h-5 w-5 text-primary" />
                  Produtividade por Nível de Complexidade
                </CardTitle>
                <CardDescription>Como a dificuldade afeta a produtividade</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[1, 2, 3, 4, 5].map(level => {
                    const data = metrics?.by_complexity?.[`level_${level}`] || { total_products: 0, total_area_m2: 0, avg_productivity_m2_h: 0 };
                    const maxProd = Math.max(...Object.values(metrics?.by_complexity || {}).map(d => d.avg_productivity_m2_h || 0));
                    const percentage = maxProd > 0 ? (data.avg_productivity_m2_h / maxProd) * 100 : 0;
                    
                    return (
                      <div key={level} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-1 rounded text-xs font-bold ${
                              level === 1 ? 'bg-green-500/20 text-green-400' :
                              level === 2 ? 'bg-blue-500/20 text-blue-400' :
                              level === 3 ? 'bg-yellow-500/20 text-yellow-400' :
                              level === 4 ? 'bg-orange-500/20 text-orange-400' :
                              'bg-red-500/20 text-red-400'
                            }`}>
                              Nível {level}
                            </span>
                            <span className="text-muted-foreground">{complexityLabels[level]}</span>
                          </div>
                          <div className="flex items-center gap-4 text-sm">
                            <span className="text-muted-foreground">{data.total_products} produtos</span>
                            <span className="text-muted-foreground">{data.total_area_m2} m²</span>
                            <span className="text-primary font-bold">{data.avg_productivity_m2_h} m²/h</span>
                          </div>
                        </div>
                        <div className="h-3 bg-white/5 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              level === 1 ? 'bg-green-500' :
                              level === 2 ? 'bg-blue-500' :
                              level === 3 ? 'bg-yellow-500' :
                              level === 4 ? 'bg-orange-500' :
                              'bg-red-500'
                            }`}
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* By Height */}
          <TabsContent value="height">
            <Card className="bg-card border-white/5">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Mountain className="h-5 w-5 text-primary" />
                  Produtividade por Categoria de Altura
                </CardTitle>
                <CardDescription>Impacto da altura na produtividade</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {Object.entries(heightCategoryLabels).map(([key, label]) => {
                    const data = metrics?.by_height?.[key] || { total_products: 0, total_area_m2: 0, avg_productivity_m2_h: 0 };
                    
                    return (
                      <div
                        key={key}
                        className="p-4 rounded-lg bg-white/5 border border-white/10 text-center"
                      >
                        <Mountain className={`h-8 w-8 mx-auto mb-2 ${
                          key === 'terreo' ? 'text-green-400' :
                          key === 'media' ? 'text-blue-400' :
                          key === 'alta' ? 'text-orange-400' :
                          'text-red-400'
                        }`} />
                        <h3 className="text-white font-semibold">{label}</h3>
                        <div className="mt-3 space-y-1">
                          <p className="text-2xl font-bold text-primary">{data.avg_productivity_m2_h} <span className="text-sm">m²/h</span></p>
                          <p className="text-sm text-muted-foreground">{data.total_products} produtos</p>
                          <p className="text-sm text-muted-foreground">{data.total_area_m2} m²</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* By Scenario */}
          <TabsContent value="scenario">
            <Card className="bg-card border-white/5">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Building className="h-5 w-5 text-primary" />
                  Produtividade por Cenário de Instalação
                </CardTitle>
                <CardDescription>Como o local afeta a produtividade</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Object.entries(scenarioLabels).map(([key, label]) => {
                    const data = metrics?.by_scenario?.[key] || { total_products: 0, total_area_m2: 0, avg_productivity_m2_h: 0 };
                    
                    return (
                      <div
                        key={key}
                        className="p-4 rounded-lg bg-white/5 border border-white/10"
                      >
                        <h3 className="text-white font-semibold mb-3">{label}</h3>
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div>
                            <p className="text-xl font-bold text-white">{data.total_products}</p>
                            <p className="text-xs text-muted-foreground">Produtos</p>
                          </div>
                          <div>
                            <p className="text-xl font-bold text-white">{data.total_area_m2}</p>
                            <p className="text-xs text-muted-foreground">m²</p>
                          </div>
                          <div>
                            <p className="text-xl font-bold text-primary">{data.avg_productivity_m2_h}</p>
                            <p className="text-xs text-muted-foreground">m²/h</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* History */}
          <TabsContent value="history">
            <Card className="bg-card border-white/5">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Activity className="h-5 w-5 text-primary" />
                  Histórico de Instalações
                </CardTitle>
                <CardDescription>Últimos produtos instalados com métricas</CardDescription>
              </CardHeader>
              <CardContent>
                {products.length === 0 ? (
                  <div className="text-center py-12">
                    <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">Nenhuma instalação registrada ainda.</p>
                    <Button onClick={() => setShowAddProduct(true)} className="mt-4 gap-2">
                      <Plus className="h-4 w-4" />
                      Registrar Primeira Instalação
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {products.slice(0, 20).map(product => (
                      <div
                        key={product.id}
                        className="p-4 rounded-lg bg-white/5 border border-white/10 flex items-center justify-between"
                      >
                        <div>
                          <h4 className="text-white font-medium">{product.product_name}</h4>
                          <div className="flex items-center gap-2 mt-1">
                            {product.family_name && (
                              <span className="px-2 py-0.5 rounded text-xs bg-primary/20 text-primary">
                                {product.family_name}
                              </span>
                            )}
                            <span className="text-sm text-muted-foreground">
                              {product.area_m2} m² | {product.actual_time_min} min
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-primary">{product.productivity_m2_h || 0}</p>
                          <p className="text-xs text-muted-foreground">m²/h</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Product Families List */}
        <Card className="bg-card border-white/5">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Layers className="h-5 w-5 text-primary" />
              Famílias de Produtos Cadastradas ({families.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {families.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">
                Nenhuma família cadastrada. Clique em "Criar Famílias Padrão" para começar.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {families.map(family => (
                  <div
                    key={family.id}
                    className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 flex items-center gap-2"
                  >
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: family.color }}
                    />
                    <span className="text-white text-sm">{family.name}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Metrics;
