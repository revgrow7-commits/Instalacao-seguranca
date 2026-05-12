import { useEffect, useState } from 'react';
import api from '../utils/api';

// Converte um colaborador do CS em opção para o Combobox existente.
// value = email (identificador único e enviado ao backend)
// label = "Nome — Cargo · Unidade" (texto exibido)
function toComboOption(c) {
  const detail = [c.cargo, c.unidade].filter(Boolean).join(' · ');
  return {
    value: c.email || c.nome,
    label: detail ? `${c.nome} — ${detail}` : c.nome,
    // dados completos para setValue no form
    _nome: c.nome,
    _email: c.email || '',
  };
}

export function useCatalogos() {
  const [vendedores, setVendedores] = useState([]);
  const [tiposServico, setTiposServico] = useState([]);
  const [ferramentas, setFerramentas] = useState([]);
  // Colaboradores do Visual Connect (nome + email) para o seletor de Vendedor
  const [colaboradoresVC, setColaboradoresVC] = useState([]);
  const [colaboradoresVCMap, setColaboradoresVCMap] = useState(new Map());
  // Listas filtradas por role — para os comboboxes de vendedor e instalador
  const [vendedoresVC, setVendedoresVC] = useState([]);
  const [vendedoresVCMap, setVendedoresVCMap] = useState(new Map());
  const [instaladoresVC, setInstaladoresVC] = useState([]);
  const [instaladoresVCMap, setInstaloresVCMap] = useState(new Map());
  const [csLoading, setCsLoading] = useState(false);
  const [csError, setCsError] = useState(null);

  useEffect(() => {
    api.listVendedores().then(r => setVendedores((r.data || []).map(v => ({ value: v.nome, label: v.nome })))).catch(err => console.error('useCatalogos: falha ao carregar vendedores', err));
    api.listTiposServico().then(r => setTiposServico((r.data || []).map(v => ({ value: v.nome, label: v.nome })))).catch(err => console.error('useCatalogos: falha ao carregar tipos de serviço', err));
    api.listFerramentas().then(r => setFerramentas((r.data || []).map(v => ({ value: v.nome, label: v.nome })))).catch(err => console.error('useCatalogos: falha ao carregar ferramentas', err));

    // Todos os colaboradores do Visual Connect — usado pelos seletores de Vendedor e Instalador
    // Edge Function retorna { colaboradores: [...] }, Axios envolve em { data: { colaboradores: [...] } }
    api.getCsColaboradores()
      .then(r => {
        const data = r.data?.colaboradores || r.data || [];
        const opts = data.map(toComboOption);
        setColaboradoresVC(opts);
        setColaboradoresVCMap(new Map(opts.map(o => [o.value, o])));
      })
      .catch(err => console.error('useCatalogos: falha ao carregar colaboradores do Visual Connect', err));

    // Colaboradores filtrados por role — vendedor e instalador
    setCsLoading(true);
    Promise.all([
      api.getCsColaboradores('vendedor').catch(err => { console.error('useCatalogos: falha ao carregar vendedores VC', err); return { data: [] }; }),
      api.getCsColaboradores('instalador').catch(err => { console.error('useCatalogos: falha ao carregar instaladores VC', err); return { data: [] }; }),
    ]).then(([resV, resI]) => {
      const vData = resV.data?.colaboradores || resV.data || [];
      const iData = resI.data?.colaboradores || resI.data || [];
      const vOpts = vData.map(toComboOption);
      const iOpts = iData.map(toComboOption);
      setVendedoresVC(vOpts);
      setVendedoresVCMap(new Map(vOpts.map(o => [o.value, o])));
      setInstaladoresVC(iOpts);
      setInstaloresVCMap(new Map(iOpts.map(o => [o.value, o])));
    }).catch(err => {
      console.error('useCatalogos: erro inesperado ao carregar listas por role', err);
      setCsError('Não foi possível carregar colaboradores do Visual Connect');
    }).finally(() => setCsLoading(false));
  }, []);

  const addVendedor = async (nome) => {
    try {
      const res = await api.createVendedor(nome);
      const item = { value: res.data.nome, label: res.data.nome };
      setVendedores(prev => [...prev, item]);
      return res.data.nome;
    } catch (err) { console.error('useCatalogos: falha ao criar vendedor', err); return null; }
  };

  const addTipoServico = async (nome) => {
    try {
      const res = await api.createTipoServico(nome);
      const item = { value: res.data.nome, label: res.data.nome };
      setTiposServico(prev => [...prev, item]);
      return res.data.nome;
    } catch (err) { console.error('useCatalogos: falha ao criar tipo de serviço', err); return null; }
  };

  const addFerramenta = async (nome) => {
    try {
      const res = await api.createFerramenta(nome);
      const item = { value: res.data.nome, label: res.data.nome };
      setFerramentas(prev => [...prev, item]);
      return res.data.nome;
    } catch (err) { console.error('useCatalogos: falha ao criar ferramenta', err); return null; }
  };

  return {
    vendedores,
    tiposServico,
    ferramentas,
    // legado
    colaboradoresVC,
    colaboradoresVCMap,
    // por role
    vendedoresVC,
    vendedoresVCMap,
    instaladoresVC,
    instaladoresVCMap,
    csLoading,
    csError,
    addVendedor,
    addTipoServico,
    addFerramenta,
  };
}

export default useCatalogos;
