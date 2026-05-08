import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Calendar as CalendarComponent } from '../components/ui/calendar';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../components/ui/collapsible';
import {
  ArrowLeft, BarChart2, Calendar, ChevronDown, X, AlertTriangle, CheckCircle2,
  XCircle, Clock, MapPin, Building2, Wrench, TrendingUp, Activity, Users
} from 'lucide-react';
import { format } from 'date-fns';
import {
  useVisitasReportByVendedor,
  useVisitasReportByFilial,
  useVisitasReportByAprovacao,
  useVisitasReportByDificuldade,
  useVisitasReportByTipoServico,
  useVisitasReportByAltura,
  useVisitasReportDivergenciaRemocao,
  useVisitasReportCustoDeslocamento,
  useVisitasReportByInstalador,
} from '../hooks/useVisitasReports';

const fmtBRL = (v) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fmtNum = (v) => Number(v || 0).toLocaleString('pt-BR');

const fmtPct = (v) => `${Number(v || 0).toFixed(1)}%`;

const NIVEL_DIFICULDADE_LABELS = {
  1: '🟢 1 — Simples',
  2: '🟡 2 — Moderado',
  3: '🟠 3 — Complexo',
  4: '🔴 4 — Crítico',
};

const APROVACAO_LABELS = {
  PENDENTE: 'Pendente',
  APROVADO: 'Aprovado',
  NAO_APROVADO: 'Não aprovado',
};

const APROVACAO_COLORS = {
  PENDENTE: 'bg-yellow-500',
  APROVADO: 'bg-green-500',
  NAO_APROVADO: 'bg-red-500',
};

// Skeleton compartilhado
const CardSkeleton = ({ rows = 4 }) => (
  <div className="space-y-2 animate-pulse">
    {[...Array(rows)].map((_, i) => (
      <div key={i} className="h-6 bg-white/5 rounded" />
    ))}
  </div>
);

// Barra horizontal CSS proporcional
const BarRow = ({ label, value, max, sub, color = 'bg-primary' }) => {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-gray-300 truncate flex-1">{label}</span>
        <span className="text-white font-medium tabular-nums">{fmtNum(value)}</span>
      </div>
      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} transition-all duration-300`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
};

const SectionCard = ({ title, icon: Icon, children, fullWidth = false, className = '' }) => (
  <Card
    className={`bg-card border-white/5 ${fullWidth ? 'md:col-span-2' : ''} ${className}`}
  >
    <CardContent className="p-4 md:p-6">
      <div className="flex items-center gap-2 mb-4">
        {Icon && <Icon className="h-4 w-4 text-primary" />}
        <h2 className="text-sm font-semibold text-white uppercase tracking-wider">{title}</h2>
      </div>
      {children}
    </CardContent>
  </Card>
);

const EmptyState = ({ message = 'Sem dados para o período selecionado' }) => (
  <p className="text-center text-xs text-muted-foreground py-6">{message}</p>
);

// =============== Cards ===============

const VendedoresCard = ({ filters }) => {
  const { data, loading, error } = useVisitasReportByVendedor(filters);
  const top10 = useMemo(() => (data || []).slice(0, 10), [data]);
  const max = useMemo(
    () => top10.reduce((m, r) => Math.max(m, Number(r.total) || 0), 0),
    [top10]
  );

  return (
    <SectionCard title="Por Vendedor (Top 10)" icon={Users} fullWidth>
      {loading ? (
        <CardSkeleton rows={6} />
      ) : error ? (
        <p className="text-xs text-red-400">{error}</p>
      ) : top10.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          {/* Tabela */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-white/5">
                  <th className="py-2 font-medium">Vendedor</th>
                  <th className="py-2 font-medium text-right">Total</th>
                  <th className="py-2 font-medium text-right">Concl.</th>
                  <th className="py-2 font-medium text-right">Aprov.</th>
                  <th className="py-2 font-medium text-right">Custo Total</th>
                </tr>
              </thead>
              <tbody>
                {top10.map((r, i) => (
                  <tr key={i} className="border-b border-white/5 last:border-0">
                    <td className="py-2 text-gray-200 truncate max-w-[140px]">
                      {r.vendedor_nome || '—'}
                    </td>
                    <td className="py-2 text-right text-white tabular-nums">{fmtNum(r.total)}</td>
                    <td className="py-2 text-right text-gray-300 tabular-nums">
                      {fmtNum(r.concluidas)}
                    </td>
                    <td className="py-2 text-right text-gray-300 tabular-nums">
                      {fmtNum(r.aprovadas)}
                    </td>
                    <td className="py-2 text-right text-gray-300 tabular-nums">
                      {fmtBRL(r.custo_deslocamento_total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* "BarChart" CSS */}
          <div className="space-y-3">
            {top10.map((r, i) => (
              <BarRow
                key={i}
                label={r.vendedor_nome || '—'}
                value={Number(r.total) || 0}
                max={max}
                sub={`Custo médio ${fmtBRL(r.custo_medio)}`}
              />
            ))}
          </div>
        </div>
      )}
    </SectionCard>
  );
};

const FilialKpiCard = ({ filial }) => {
  const cor = filial.branch === 'POA' ? 'text-blue-400' : 'text-green-400';
  return (
    <SectionCard title={`Filial ${filial.branch}`} icon={Building2}>
      <dl className="grid grid-cols-2 gap-4">
        <div>
          <dt className="text-[10px] text-muted-foreground uppercase tracking-wider">Total VTs</dt>
          <dd className={`text-2xl font-bold ${cor} tabular-nums`}>{fmtNum(filial.total)}</dd>
        </div>
        <div>
          <dt className="text-[10px] text-muted-foreground uppercase tracking-wider">Concluídas</dt>
          <dd className="text-2xl font-bold text-white tabular-nums">{fmtNum(filial.concluidas)}</dd>
        </div>
        <div>
          <dt className="text-[10px] text-muted-foreground uppercase tracking-wider">Custo Médio</dt>
          <dd className="text-xl font-semibold text-white tabular-nums">{fmtBRL(filial.custo_medio)}</dd>
        </div>
        <div>
          <dt className="text-[10px] text-muted-foreground uppercase tracking-wider">
            Taxa Aprovação
          </dt>
          <dd className="text-xl font-semibold text-white tabular-nums">
            {fmtPct(filial.taxa_aprovacao)}
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-[10px] text-muted-foreground uppercase tracking-wider">
            Tempo Médio
          </dt>
          <dd className="text-lg font-semibold text-white tabular-nums">
            {fmtNum(filial.tempo_medio_minutos)} min
          </dd>
        </div>
      </dl>
    </SectionCard>
  );
};

const FiliaisCard = ({ filters }) => {
  const { data, loading, error } = useVisitasReportByFilial(filters);
  const filiais = data || [];

  if (loading) {
    return (
      <>
        <SectionCard title="Filial POA" icon={Building2}>
          <CardSkeleton rows={3} />
        </SectionCard>
        <SectionCard title="Filial SP" icon={Building2}>
          <CardSkeleton rows={3} />
        </SectionCard>
      </>
    );
  }
  if (error) {
    return (
      <SectionCard title="Por Filial" icon={Building2} fullWidth>
        <p className="text-xs text-red-400">{error}</p>
      </SectionCard>
    );
  }
  if (filiais.length === 0) {
    return (
      <SectionCard title="Por Filial" icon={Building2} fullWidth>
        <EmptyState />
      </SectionCard>
    );
  }
  return (
    <>
      {filiais.map((f) => (
        <FilialKpiCard key={f.branch} filial={f} />
      ))}
    </>
  );
};

const AprovacaoCard = ({ filters }) => {
  const { data, loading, error } = useVisitasReportByAprovacao(filters);
  const lista = data || [];
  const total = useMemo(() => lista.reduce((s, r) => s + (Number(r.total) || 0), 0), [lista]);
  const pendentesAtrasados = useMemo(() => {
    const pend = lista.find((r) => r.aprovacao_status === 'PENDENTE');
    return pend?.pendentes_atrasados || [];
  }, [lista]);

  return (
    <SectionCard title="Status de Aprovação" icon={CheckCircle2}>
      {loading ? (
        <CardSkeleton rows={4} />
      ) : error ? (
        <p className="text-xs text-red-400">{error}</p>
      ) : total === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-4">
          {/* "Donut" CSS via barras empilhadas */}
          <div>
            <div className="flex h-3 rounded-full overflow-hidden bg-white/5">
              {lista.map((r) => {
                const pct = total > 0 ? (Number(r.total) / total) * 100 : 0;
                if (pct === 0) return null;
                return (
                  <div
                    key={r.aprovacao_status}
                    className={APROVACAO_COLORS[r.aprovacao_status] || 'bg-gray-500'}
                    style={{ width: `${pct}%` }}
                    title={`${APROVACAO_LABELS[r.aprovacao_status] || r.aprovacao_status}: ${fmtNum(
                      r.total
                    )}`}
                  />
                );
              })}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              {lista.map((r) => {
                const pct = total > 0 ? (Number(r.total) / total) * 100 : 0;
                return (
                  <div key={r.aprovacao_status}>
                    <div className="flex items-center justify-center gap-1.5">
                      <span
                        className={`inline-block w-2 h-2 rounded-full ${
                          APROVACAO_COLORS[r.aprovacao_status] || 'bg-gray-500'
                        }`}
                      />
                      <span className="text-[10px] text-muted-foreground uppercase">
                        {APROVACAO_LABELS[r.aprovacao_status] || r.aprovacao_status}
                      </span>
                    </div>
                    <p className="text-lg font-bold text-white tabular-nums">{fmtNum(r.total)}</p>
                    <p className="text-[10px] text-muted-foreground">{fmtPct(pct)}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {pendentesAtrasados.length > 0 && (
            <div className="pt-3 border-t border-white/5">
              <p className="text-xs font-semibold text-yellow-400 mb-2 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Pendentes &gt; 7 dias ({pendentesAtrasados.length})
              </p>
              <ul className="space-y-1.5 max-h-40 overflow-y-auto">
                {pendentesAtrasados.map((p) => (
                  <li
                    key={p.id}
                    className="text-xs flex items-center justify-between gap-2 bg-yellow-500/5 px-2 py-1 rounded"
                  >
                    <span className="text-gray-300 truncate">
                      <span className="font-mono text-primary">{p.numero_vt || '—'}</span>{' '}
                      <span className="text-muted-foreground">·</span> {p.client_name}
                    </span>
                    <span className="text-yellow-400 tabular-nums shrink-0">{p.dias_pendente}d</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
};

const DificuldadeCard = ({ filters }) => {
  const { data, loading, error } = useVisitasReportByDificuldade(filters);
  const lista = data || [];
  const max = useMemo(() => lista.reduce((m, r) => Math.max(m, Number(r.total) || 0), 0), [lista]);

  return (
    <SectionCard title="Por Nível de Dificuldade" icon={Activity}>
      {loading ? (
        <CardSkeleton rows={4} />
      ) : error ? (
        <p className="text-xs text-red-400">{error}</p>
      ) : lista.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-3">
          {lista.map((r) => (
            <BarRow
              key={r.nivel_dificuldade ?? 'na'}
              label={NIVEL_DIFICULDADE_LABELS[r.nivel_dificuldade] || 'Sem nível'}
              value={Number(r.total) || 0}
              max={max}
              sub={`Tempo médio: ${fmtNum(r.tempo_medio_minutos)} min`}
            />
          ))}
        </div>
      )}
    </SectionCard>
  );
};

const TipoServicoCard = ({ filters }) => {
  const { data, loading, error } = useVisitasReportByTipoServico(filters);
  const top10 = useMemo(() => (data || []).slice(0, 10), [data]);
  const max = useMemo(() => top10.reduce((m, r) => Math.max(m, Number(r.total) || 0), 0), [top10]);

  return (
    <SectionCard title="Por Tipo de Serviço (Top 10)" icon={Wrench}>
      {loading ? (
        <CardSkeleton rows={5} />
      ) : error ? (
        <p className="text-xs text-red-400">{error}</p>
      ) : top10.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
          {top10.map((r, i) => (
            <BarRow
              key={i}
              label={r.tipo || '—'}
              value={Number(r.total) || 0}
              max={max}
              color="bg-blue-500"
            />
          ))}
        </div>
      )}
    </SectionCard>
  );
};

const AlturaCard = ({ filters }) => {
  const { data, loading, error } = useVisitasReportByAltura(filters);
  const lista = data || [];
  const max = useMemo(() => lista.reduce((m, r) => Math.max(m, Number(r.total) || 0), 0), [lista]);

  return (
    <SectionCard title="Por Faixa de Altura" icon={TrendingUp}>
      {loading ? (
        <CardSkeleton rows={3} />
      ) : error ? (
        <p className="text-xs text-red-400">{error}</p>
      ) : lista.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-3">
          {lista.map((r, i) => (
            <BarRow
              key={i}
              label={r.faixa || '—'}
              value={Number(r.total) || 0}
              max={max}
              sub={`Dificuldade média: ${Number(r.dificuldade_media || 0).toFixed(1)}`}
              color="bg-purple-500"
            />
          ))}
        </div>
      )}
    </SectionCard>
  );
};

const DivergenciaCard = ({ filters }) => {
  const { data, loading, error } = useVisitasReportDivergenciaRemocao(filters);
  const [expanded, setExpanded] = useState(false);
  const divergencias = data?.divergencias || 0;
  const total = data?.total || 0;
  const pct = data?.percentual_divergencia || 0;
  const lista = data?.lista_divergencias || [];

  return (
    <SectionCard title="Divergência de Remoção" icon={AlertTriangle}>
      {loading ? (
        <CardSkeleton rows={3} />
      ) : error ? (
        <p className="text-xs text-red-400">{error}</p>
      ) : total === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-3">
          <div className="text-center py-3">
            <p
              className={`text-4xl font-bold tabular-nums ${
                pct > 20 ? 'text-red-400' : pct > 10 ? 'text-yellow-400' : 'text-green-400'
              }`}
            >
              {fmtPct(pct)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {fmtNum(divergencias)} de {fmtNum(total)} visitas com remoção divergente
            </p>
          </div>

          {lista.length > 0 && (
            <Collapsible open={expanded} onOpenChange={setExpanded}>
              <CollapsibleTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full border-white/10 text-gray-300 text-xs"
                >
                  <ChevronDown
                    className={`h-3 w-3 mr-1 transition-transform ${
                      expanded ? 'rotate-180' : ''
                    }`}
                  />
                  {expanded ? 'Ocultar' : 'Ver'} {lista.length} caso(s)
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <ul className="mt-3 space-y-1.5 max-h-60 overflow-y-auto">
                  {lista.map((d) => (
                    <li
                      key={d.id}
                      className="text-xs bg-white/5 px-2 py-1.5 rounded space-y-0.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-primary">{d.numero_vt || '—'}</span>
                        <span className="text-gray-400 truncate">{d.client_name}</span>
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                        <span>
                          OS:{' '}
                          {d.prevista ? (
                            <CheckCircle2 className="h-3 w-3 inline text-green-400" />
                          ) : (
                            <XCircle className="h-3 w-3 inline text-red-400" />
                          )}
                        </span>
                        <span>
                          Local:{' '}
                          {d.realizada ? (
                            <CheckCircle2 className="h-3 w-3 inline text-green-400" />
                          ) : (
                            <XCircle className="h-3 w-3 inline text-red-400" />
                          )}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      )}
    </SectionCard>
  );
};

const CustoDeslocamentoCard = ({ filters }) => {
  const { data, loading, error } = useVisitasReportCustoDeslocamento(filters);
  const lista = data || [];

  // Agrega por filial+mes para a "linha" e por filial para o resumo
  const { meses, porFilialMes, resumo, max } = useMemo(() => {
    const mesesSet = new Set();
    const porFilialMes = {};
    const resumoAcc = {};

    for (const r of lista) {
      const branch = r.branch || '—';
      const mes = r.mes || '—';
      mesesSet.add(mes);
      porFilialMes[branch] = porFilialMes[branch] || {};
      porFilialMes[branch][mes] =
        (porFilialMes[branch][mes] || 0) + (Number(r.custo_total) || 0);
      resumoAcc[branch] = resumoAcc[branch] || { branch, km_total: 0, custo_total: 0, visitas: 0 };
      resumoAcc[branch].km_total += Number(r.km_total) || 0;
      resumoAcc[branch].custo_total += Number(r.custo_total) || 0;
      resumoAcc[branch].visitas += Number(r.visitas) || 0;
    }

    const meses = Array.from(mesesSet).sort();
    let max = 0;
    for (const branch of Object.keys(porFilialMes)) {
      for (const mes of meses) {
        max = Math.max(max, porFilialMes[branch][mes] || 0);
      }
    }

    return { meses, porFilialMes, resumo: Object.values(resumoAcc), max };
  }, [lista]);

  const branchColors = {
    POA: 'bg-blue-500',
    SP: 'bg-green-500',
  };

  return (
    <SectionCard title="Custo de Deslocamento" icon={MapPin} fullWidth>
      {loading ? (
        <CardSkeleton rows={5} />
      ) : error ? (
        <p className="text-xs text-red-400">{error}</p>
      ) : lista.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-6">
          {/* Gráfico mês x filial — barras agrupadas via CSS */}
          <div className="space-y-3">
            {meses.map((mes) => (
              <div key={mes}>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                  {mes}
                </p>
                <div className="space-y-1.5">
                  {Object.keys(porFilialMes).map((branch) => {
                    const v = porFilialMes[branch][mes] || 0;
                    const pct = max > 0 ? (v / max) * 100 : 0;
                    return (
                      <div key={branch} className="flex items-center gap-2 text-xs">
                        <span className="w-12 text-gray-400 shrink-0">{branch}</span>
                        <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${branchColors[branch] || 'bg-primary'} transition-all`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-white tabular-nums w-24 text-right shrink-0">
                          {fmtBRL(v)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Tabela resumo */}
          <div className="overflow-x-auto pt-3 border-t border-white/5">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-white/5">
                  <th className="py-2 font-medium">Filial</th>
                  <th className="py-2 font-medium text-right">Visitas</th>
                  <th className="py-2 font-medium text-right">KM Total</th>
                  <th className="py-2 font-medium text-right">Custo Total</th>
                </tr>
              </thead>
              <tbody>
                {resumo.map((r) => (
                  <tr key={r.branch} className="border-b border-white/5 last:border-0">
                    <td className="py-2 text-white font-medium">{r.branch}</td>
                    <td className="py-2 text-right text-gray-300 tabular-nums">
                      {fmtNum(r.visitas)}
                    </td>
                    <td className="py-2 text-right text-gray-300 tabular-nums">
                      {fmtNum(Math.round(r.km_total))} km
                    </td>
                    <td className="py-2 text-right text-white tabular-nums">
                      {fmtBRL(r.custo_total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </SectionCard>
  );
};

const InstaladorCard = ({ filters }) => {
  const { data, loading, error } = useVisitasReportByInstalador(filters);
  const top10 = useMemo(() => (data || []).slice(0, 10), [data]);
  const max = useMemo(
    () => top10.reduce((m, r) => Math.max(m, Number(r.total) || 0), 0),
    [top10]
  );

  return (
    <SectionCard title="Por Instalador (Top 10)" icon={Users} fullWidth>
      {loading ? (
        <CardSkeleton rows={6} />
      ) : error ? (
        <p className="text-xs text-red-400">{error}</p>
      ) : top10.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-white/5">
                  <th className="py-2 font-medium">Instalador</th>
                  <th className="py-2 font-medium text-right">Total</th>
                  <th className="py-2 font-medium text-right">Concl.</th>
                  <th className="py-2 font-medium text-right">T. Médio</th>
                  <th className="py-2 font-medium text-right">Custo Total</th>
                </tr>
              </thead>
              <tbody>
                {top10.map((r, i) => (
                  <tr key={i} className="border-b border-white/5 last:border-0">
                    <td className="py-2 text-gray-200 truncate max-w-[140px]">
                      {r.installer_name || '—'}
                    </td>
                    <td className="py-2 text-right text-white tabular-nums">{fmtNum(r.total)}</td>
                    <td className="py-2 text-right text-gray-300 tabular-nums">{fmtNum(r.concluidas)}</td>
                    <td className="py-2 text-right text-gray-300 tabular-nums">
                      {r.tempo_medio_minutos ? `${fmtNum(Math.round(r.tempo_medio_minutos))} min` : '—'}
                    </td>
                    <td className="py-2 text-right text-gray-300 tabular-nums">
                      {fmtBRL(r.custo_total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-3">
            {top10.map((r, i) => (
              <BarRow
                key={i}
                label={r.installer_name || '—'}
                value={Number(r.total) || 0}
                max={max}
                sub={`Custo total ${fmtBRL(r.custo_total)}`}
                color="bg-orange-500"
              />
            ))}
          </div>
        </div>
      )}
    </SectionCard>
  );
};

// =============== Página principal ===============

const VisitasRelatorios = () => {
  const navigate = useNavigate();
  const [filterBranch, setFilterBranch] = useState('all');
  const [filterDateFrom, setFilterDateFrom] = useState(null);
  const [filterDateTo, setFilterDateTo] = useState(null);
  const [datePopoverOpen, setDatePopoverOpen] = useState(false);

  const filters = useMemo(
    () => ({
      branch: filterBranch,
      date_from: filterDateFrom ? format(filterDateFrom, 'yyyy-MM-dd') : null,
      date_to: filterDateTo ? format(filterDateTo, 'yyyy-MM-dd') : null,
    }),
    [filterBranch, filterDateFrom, filterDateTo]
  );

  const hasFilters = filterBranch !== 'all' || filterDateFrom || filterDateTo;

  const clearFilters = () => {
    setFilterBranch('all');
    setFilterDateFrom(null);
    setFilterDateTo(null);
  };

  const dateRangeLabel =
    filterDateFrom || filterDateTo
      ? `${filterDateFrom ? format(filterDateFrom, 'dd/MM/yy') : '…'} — ${
          filterDateTo ? format(filterDateTo, 'dd/MM/yy') : '…'
        }`
      : 'Período';

  return (
    <div className="p-4 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-white -ml-2 mb-2"
            onClick={() => navigate('/visitas-tecnicas')}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Voltar
          </Button>
          <h1 className="text-3xl font-heading font-bold text-white tracking-tight flex items-center gap-3">
            <BarChart2 className="h-7 w-7 text-primary" />
            Relatórios de Visitas Técnicas
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Indicadores analíticos de desempenho operacional
          </p>
        </div>
      </div>

      {/* Filtros sticky */}
      <div className="sticky top-0 z-10 -mx-4 md:-mx-8 px-4 md:px-8 py-3 bg-background/95 backdrop-blur border-b border-white/5">
        <div className="flex flex-wrap gap-3 items-center">
          <Select value={filterBranch} onValueChange={setFilterBranch}>
            <SelectTrigger className="bg-card border-white/10 text-white w-36">
              <SelectValue placeholder="Filial" />
            </SelectTrigger>
            <SelectContent className="bg-card border-white/10">
              <SelectItem value="all">Todas filiais</SelectItem>
              <SelectItem value="POA">POA</SelectItem>
              <SelectItem value="SP">SP</SelectItem>
            </SelectContent>
          </Select>

          <Popover open={datePopoverOpen} onOpenChange={setDatePopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={`border-white/10 text-sm gap-2 ${
                  filterDateFrom || filterDateTo
                    ? 'text-primary border-primary/30'
                    : 'text-gray-300'
                }`}
              >
                <Calendar className="h-4 w-4" />
                {dateRangeLabel}
                <ChevronDown className="h-3 w-3" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="bg-card border-white/10 p-0 w-auto" align="start">
              <CalendarComponent
                mode="range"
                selected={{ from: filterDateFrom, to: filterDateTo }}
                onSelect={(range) => {
                  setFilterDateFrom(range?.from || null);
                  setFilterDateTo(range?.to || null);
                }}
                className="text-white"
              />
            </PopoverContent>
          </Popover>

          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-white"
              onClick={clearFilters}
            >
              <X className="h-3 w-3 mr-1" />
              Limpar filtros
            </Button>
          )}
        </div>
      </div>

      {/* Grid de cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        <VendedoresCard filters={filters} />
        <InstaladorCard filters={filters} />
        <FiliaisCard filters={filters} />
        <AprovacaoCard filters={filters} />
        <DificuldadeCard filters={filters} />
        <TipoServicoCard filters={filters} />
        <AlturaCard filters={filters} />
        <DivergenciaCard filters={filters} />
        <CustoDeslocamentoCard filters={filters} />
      </div>
    </div>
  );
};

export default VisitasRelatorios;
