import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { 
  ArrowLeft, 
  Package, 
  Ruler, 
  DollarSign, 
  Briefcase,
  RefreshCw,
  Search,
  ChevronDown,
  ChevronUp,
  Layers,
  AlertTriangle,
  CheckCircle,
  FileText
} from 'lucide-react';

const FamilyReport = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedFamily, setExpandedFamily] = useState(null);

  useEffect(() => {
    if (user?.role !== 'admin' && user?.role !== 'manager') {
      navigate('/');
      return;
    }
    fetchReport();
  }, [user, navigate]);

  const fetchReport = async () => {
    try {
      setLoading(true);
      const response = await api.getReportByFamily();
      setReport(response.data);
    } catch (error) {
      console.error('Error fetching report:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredFamilies = report?.by_family?.filter(family => 
    family.family_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    family.products?.some(p => p.product_name.toLowerCase().includes(searchTerm.toLowerCase()))
  ) || [];

  const getConfidenceColor = (confidence) => {
    if (confidence >= 70) return 'text-green-400 bg-green-500/20';
    if (confidence >= 40) return 'text-yellow-400 bg-yellow-500/20';
    return 'text-red-400 bg-red-500/20';
  };

  const getConfidenceIcon = (confidence) => {
    if (confidence >= 70) return <CheckCircle className="h-3 w-3" />;
    if (confidence >= 40) return <AlertTriangle className="h-3 w-3" />;
    return <AlertTriangle className="h-3 w-3" />;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-white">Carregando relatório por família...</div>
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
              onClick={() => navigate('/reports')}
              className="text-muted-foreground hover:text-white"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-white flex items-center gap-2">
                <Layers className="h-8 w-8 text-primary" />
                Relatório por Família
              </h1>
              <p className="text-muted-foreground mt-1">
                Análise de produtos dos jobs por família/categoria
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={fetchReport} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card className="bg-gradient-to-br from-blue-500/20 to-blue-600/10 border-blue-500/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-blue-400">Jobs Analisados</p>
                  <p className="text-2xl font-bold text-white">{report?.summary?.total_jobs || 0}</p>
                </div>
                <Briefcase className="h-8 w-8 text-blue-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-500/20 to-green-600/10 border-green-500/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-green-400">Total Produtos</p>
                  <p className="text-2xl font-bold text-white">{report?.summary?.total_products || 0}</p>
                </div>
                <Package className="h-8 w-8 text-green-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-500/20 to-purple-600/10 border-purple-500/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-purple-400">Área Total (m²)</p>
                  <p className="text-2xl font-bold text-white">{report?.summary?.total_area_m2?.toLocaleString('pt-BR') || 0}</p>
                </div>
                <Ruler className="h-8 w-8 text-purple-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-yellow-500/20 to-yellow-600/10 border-yellow-500/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-yellow-400">Famílias</p>
                  <p className="text-2xl font-bold text-white">{report?.summary?.families_count || 0}</p>
                </div>
                <Layers className="h-8 w-8 text-yellow-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-red-500/20 to-red-600/10 border-red-500/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-red-400">Não Classificados</p>
                  <p className="text-2xl font-bold text-white">{report?.summary?.unclassified_count || 0}</p>
                </div>
                <AlertTriangle className="h-8 w-8 text-red-400" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por família ou produto..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-white/5 border-white/10 text-white"
          />
        </div>

        {/* Tabs */}
        <Tabs defaultValue="families" className="space-y-6">
          <TabsList className="bg-white/5">
            <TabsTrigger value="families" className="data-[state=active]:bg-primary">
              <Layers className="h-4 w-4 mr-2" />
              Por Família
            </TabsTrigger>
            <TabsTrigger value="products" className="data-[state=active]:bg-primary">
              <Package className="h-4 w-4 mr-2" />
              Todos os Produtos
            </TabsTrigger>
            <TabsTrigger value="unclassified" className="data-[state=active]:bg-primary">
              <AlertTriangle className="h-4 w-4 mr-2" />
              Não Classificados
            </TabsTrigger>
          </TabsList>

          {/* Por Família */}
          <TabsContent value="families">
            <div className="space-y-4">
              {filteredFamilies.map((family, index) => (
                <Card key={index} className="bg-card border-white/5 overflow-hidden">
                  <div
                    className="p-4 cursor-pointer hover:bg-white/5 transition-colors"
                    onClick={() => setExpandedFamily(expandedFamily === family.family_name ? null : family.family_name)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-4 h-4 rounded-full"
                          style={{ backgroundColor: family.color }}
                        />
                        <h3 className="text-white font-semibold text-lg">{family.family_name}</h3>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Jobs</p>
                          <p className="text-white font-bold">{family.total_jobs}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Produtos</p>
                          <p className="text-white font-bold">{family.total_products}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Quantidade</p>
                          <p className="text-white font-bold">{family.total_quantity}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Área (m²)</p>
                          <p className="text-primary font-bold">{family.total_area_m2?.toLocaleString('pt-BR')}</p>
                        </div>
                        {expandedFamily === family.family_name ? (
                          <ChevronUp className="h-5 w-5 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  </div>

                  {expandedFamily === family.family_name && family.products && (
                    <div className="border-t border-white/5 p-4 bg-white/5">
                      <div className="space-y-2 max-h-96 overflow-y-auto">
                        <div className="grid grid-cols-7 gap-2 text-xs text-muted-foreground font-medium pb-2 border-b border-white/10">
                          <span>Produto</span>
                          <span>Job</span>
                          <span>Cliente</span>
                          <span className="text-center">Qtd</span>
                          <span className="text-center">Medidas</span>
                          <span className="text-center">Área (m²)</span>
                          <span className="text-center">Confiança</span>
                        </div>
                        {family.products.map((product, pIndex) => (
                          <div key={pIndex} className="grid grid-cols-7 gap-2 text-sm py-2 border-b border-white/5">
                            <span className="text-white truncate" title={product.product_name}>
                              {product.product_name}
                            </span>
                            <span className="text-muted-foreground truncate" title={product.job_title}>
                              {product.job_code ? `#${product.job_code}` : product.job_title?.substring(0, 20)}
                            </span>
                            <span className="text-muted-foreground truncate" title={product.client_name}>
                              {product.client_name?.substring(0, 15)}
                            </span>
                            <span className="text-white text-center">{product.quantity}</span>
                            <span className="text-white text-center">
                              {product.width_m && product.height_m 
                                ? `${product.width_m}×${product.height_m}m`
                                : '-'
                              }
                            </span>
                            <span className="text-primary text-center font-medium">
                              {product.area_m2 || '-'}
                            </span>
                            <span className={`text-center px-2 py-0.5 rounded-full text-xs flex items-center justify-center gap-1 ${getConfidenceColor(product.confidence)}`}>
                              {getConfidenceIcon(product.confidence)}
                              {product.confidence?.toFixed(0)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Todos os Produtos */}
          <TabsContent value="products">
            <Card className="bg-card border-white/5">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Package className="h-5 w-5 text-primary" />
                  Todos os Produtos ({report?.all_products?.length || 0})
                </CardTitle>
                <CardDescription>Lista completa de produtos de todos os jobs</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-[600px] overflow-y-auto">
                  <div className="grid grid-cols-8 gap-2 text-xs text-muted-foreground font-medium pb-2 border-b border-white/10 sticky top-0 bg-card">
                    <span>Produto</span>
                    <span>Família</span>
                    <span>Job</span>
                    <span>Cliente</span>
                    <span className="text-center">Qtd</span>
                    <span className="text-center">Medidas</span>
                    <span className="text-center">Área</span>
                    <span className="text-center">Conf.</span>
                  </div>
                  {report?.all_products?.map((product, index) => (
                    <div key={index} className="grid grid-cols-8 gap-2 text-sm py-2 border-b border-white/5">
                      <span className="text-white truncate" title={product.product_name}>
                        {product.product_name}
                      </span>
                      <span className="text-primary truncate">{product.family_name}</span>
                      <span className="text-muted-foreground truncate">
                        {product.job_code ? `#${product.job_code}` : '-'}
                      </span>
                      <span className="text-muted-foreground truncate">{product.client_name?.substring(0, 12)}</span>
                      <span className="text-white text-center">{product.quantity}</span>
                      <span className="text-white text-center">
                        {product.width_m && product.height_m 
                          ? `${product.width_m}×${product.height_m}`
                          : '-'
                        }
                      </span>
                      <span className="text-primary text-center">{product.area_m2 || '-'}</span>
                      <span className={`text-center px-1 py-0.5 rounded text-xs ${getConfidenceColor(product.confidence)}`}>
                        {product.confidence?.toFixed(0)}%
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Não Classificados */}
          <TabsContent value="unclassified">
            <Card className="bg-card border-white/5">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-400" />
                  Produtos Não Classificados ({report?.unclassified?.length || 0})
                </CardTitle>
                <CardDescription>Produtos com baixa confiança de classificação (&lt;50%)</CardDescription>
              </CardHeader>
              <CardContent>
                {report?.unclassified?.length === 0 ? (
                  <div className="text-center py-8">
                    <CheckCircle className="h-12 w-12 mx-auto text-green-400 mb-4" />
                    <p className="text-green-400 font-medium">Todos os produtos foram classificados com alta confiança!</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[500px] overflow-y-auto">
                    {report?.unclassified?.map((product, index) => (
                      <div key={index} className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-white font-medium">{product.product_name}</p>
                            <p className="text-sm text-muted-foreground">
                              Job: {product.job_title} | Cliente: {product.client_name}
                            </p>
                          </div>
                          <div className="text-right">
                            <span className="px-2 py-1 rounded bg-yellow-500/20 text-yellow-400 text-xs">
                              Classificado como: {product.family_name}
                            </span>
                            <p className="text-xs text-muted-foreground mt-1">
                              Confiança: {product.confidence?.toFixed(0)}%
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Info Box */}
        <Card className="bg-blue-500/10 border-blue-500/20">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <FileText className="h-5 w-5 text-blue-400 mt-0.5" />
              <div>
                <h4 className="text-white font-medium">Sobre a Classificação Automática</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  O sistema classifica automaticamente os produtos dos jobs da Holdprint em famílias baseado no nome. 
                  A confiança indica o quão precisa é a classificação:
                </p>
                <div className="flex gap-4 mt-2">
                  <span className="text-xs flex items-center gap-1 text-green-400">
                    <CheckCircle className="h-3 w-3" /> ≥70%: Alta confiança
                  </span>
                  <span className="text-xs flex items-center gap-1 text-yellow-400">
                    <AlertTriangle className="h-3 w-3" /> 40-69%: Média confiança
                  </span>
                  <span className="text-xs flex items-center gap-1 text-red-400">
                    <AlertTriangle className="h-3 w-3" /> &lt;40%: Baixa confiança
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default FamilyReport;
