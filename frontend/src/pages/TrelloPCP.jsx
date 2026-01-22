import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { 
  Loader2, 
  RefreshCw, 
  Search,
  ExternalLink,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Users,
  Wrench,
  Package,
  Truck,
  FileCheck
} from 'lucide-react';
import api from '../utils/api';

const TrelloPCP = () => {
  const [summary, setSummary] = useState(null);
  const [selectedList, setSelectedList] = useState(null);
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);

  const fetchSummary = async () => {
    try {
      setLoading(true);
      const response = await api.getTrelloSummary();
      setSummary(response.data.summary);
    } catch (error) {
      toast.error('Erro ao carregar dados do Trello');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const fetchListCards = async (listId, listName) => {
    try {
      setCardsLoading(true);
      setSelectedList({ id: listId, name: listName });
      setSearchResults(null);
      const response = await api.getTrelloCards(listId);
      setCards(response.data.cards || []);
    } catch (error) {
      toast.error('Erro ao carregar cards');
    } finally {
      setCardsLoading(false);
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    
    try {
      setCardsLoading(true);
      setSelectedList(null);
      const response = await api.searchTrelloCards(searchQuery);
      setSearchResults({
        query: searchQuery,
        cards: response.data.cards || []
      });
      setCards([]);
    } catch (error) {
      toast.error('Erro na busca');
    } finally {
      setCardsLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, []);

  const getListIcon = (listName) => {
    const name = listName.toUpperCase();
    if (name.includes('INSTALAÇÃO')) return <Wrench className="h-4 w-4" />;
    if (name.includes('ACABAMENTO')) return <Package className="h-4 w-4" />;
    if (name.includes('IMPRESSÃO')) return <FileCheck className="h-4 w-4" />;
    if (name.includes('ENTREGA')) return <Truck className="h-4 w-4" />;
    if (name.includes('PROJETO')) return <Users className="h-4 w-4" />;
    if (name.includes('CONCLUÍDO')) return <CheckCircle2 className="h-4 w-4" />;
    if (name.includes('OCORRÊNCIA')) return <AlertTriangle className="h-4 w-4" />;
    return <Clock className="h-4 w-4" />;
  };

  const formatDate = (dateString) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  };

  const isOverdue = (dateString) => {
    if (!dateString) return false;
    return new Date(dateString) < new Date();
  };

  if (loading && !summary) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6" data-testid="trello-pcp">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <img src="https://cdn.worldvectorlogo.com/logos/trello.svg" alt="Trello" className="h-6 w-6" />
            PCP - Controle de Produção
          </h1>
          <p className="text-muted-foreground mt-1">
            Integração com Trello • {summary?.total_cards || 0} cards no quadro
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={fetchSummary}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <a 
            href="https://trello.com/b/XiH7Nd9A/pcp-industria-visual"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="outline" size="sm">
              <ExternalLink className="h-4 w-4 mr-2" />
              Abrir Trello
            </Button>
          </a>
        </div>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <Input
          placeholder="Buscar cards por nome ou descrição..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 bg-white/5 border-white/10"
        />
        <Button type="submit" disabled={cardsLoading}>
          <Search className="h-4 w-4 mr-2" />
          Buscar
        </Button>
      </form>

      {/* Lists Summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        {summary?.lists?.filter(lst => !lst.name.includes('CONCLUÍDO')).map((lst) => (
          <Card 
            key={lst.id}
            className={`bg-card border-white/10 cursor-pointer hover:bg-white/5 transition-colors ${selectedList?.id === lst.id ? 'ring-2 ring-primary' : ''}`}
            onClick={() => fetchListCards(lst.id, lst.name)}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                {getListIcon(lst.name)}
                <span className="text-xs text-muted-foreground truncate">{lst.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold text-white">{lst.total_cards}</span>
                {lst.overdue_cards > 0 && (
                  <Badge variant="destructive" className="text-xs">
                    {lst.overdue_cards} atrasados
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Selected List Cards or Search Results */}
      {(selectedList || searchResults) && (
        <Card className="bg-card border-white/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center justify-between">
              <span className="flex items-center gap-2">
                {searchResults ? (
                  <>
                    <Search className="h-5 w-5 text-primary" />
                    Resultados para "{searchResults.query}"
                  </>
                ) : (
                  <>
                    {getListIcon(selectedList?.name || '')}
                    {selectedList?.name}
                  </>
                )}
              </span>
              <Badge variant="secondary">
                {searchResults ? searchResults.cards.length : cards.length} cards
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {cardsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : (
              <div className="space-y-3">
                {(searchResults ? searchResults.cards : cards)
                  .filter(card => !['A FAZER', 'FAZENDO', 'PENDENCIA', 'CONCLUIDO', 'VERIFICAÇÃO', 'VALIDANDO ESTOQUE'].includes(card.name))
                  .map((card) => (
                  <div 
                    key={card.id}
                    className="bg-white/5 rounded-lg p-4 border border-white/10 hover:border-white/20 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <a 
                          href={card.shortUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-white hover:text-primary transition-colors"
                        >
                          {card.name}
                        </a>
                        {card.desc && (
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                            {card.desc}
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          {card.labels?.map((label, idx) => (
                            <Badge 
                              key={idx} 
                              variant="outline"
                              className="text-xs"
                              style={{ 
                                borderColor: label.color ? `var(--${label.color})` : undefined,
                                color: label.color ? `var(--${label.color})` : undefined
                              }}
                            >
                              {label.name || label.color}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        {card.due && (
                          <Badge 
                            variant={isOverdue(card.due) ? "destructive" : "secondary"}
                            className="flex items-center gap-1"
                          >
                            <Calendar className="h-3 w-3" />
                            {formatDate(card.due)}
                          </Badge>
                        )}
                        <a 
                          href={card.shortUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-white"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </div>
                    </div>
                  </div>
                ))}
                
                {((searchResults ? searchResults.cards : cards).filter(card => !['A FAZER', 'FAZENDO', 'PENDENCIA', 'CONCLUIDO', 'VERIFICAÇÃO', 'VALIDANDO ESTOQUE'].includes(card.name)).length === 0) && (
                  <div className="text-center py-8 text-muted-foreground">
                    Nenhum card encontrado
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Quick Stats */}
      {!selectedList && !searchResults && (
        <Card className="bg-blue-500/10 border-blue-500/30">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-blue-500/20 rounded-lg">
                <Wrench className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <h4 className="font-semibold text-white mb-1">Fila de Instalação</h4>
                <p className="text-sm text-muted-foreground">
                  Clique na lista "TIME DE INSTALAÇÃO" para ver os jobs aguardando instalação. 
                  Você pode sincronizar esses dados com o sistema de produtividade.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default TrelloPCP;
