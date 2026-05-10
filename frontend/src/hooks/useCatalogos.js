import { useEffect, useState } from 'react';
import api from '../utils/api';

export function useCatalogos() {
  const [vendedores, setVendedores] = useState([]);
  const [tiposServico, setTiposServico] = useState([]);
  const [ferramentas, setFerramentas] = useState([]);

  useEffect(() => {
    api.listVendedores().then(r => setVendedores((r.data || []).map(v => ({ value: v.nome, label: v.nome })))).catch(err => console.error('useCatalogos: falha ao carregar vendedores', err));
    api.listTiposServico().then(r => setTiposServico((r.data || []).map(v => ({ value: v.nome, label: v.nome })))).catch(err => console.error('useCatalogos: falha ao carregar tipos de serviço', err));
    api.listFerramentas().then(r => setFerramentas((r.data || []).map(v => ({ value: v.nome, label: v.nome })))).catch(err => console.error('useCatalogos: falha ao carregar ferramentas', err));
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

  return { vendedores, tiposServico, ferramentas, addVendedor, addTipoServico, addFerramenta };
}

export default useCatalogos;
