import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import api from '../utils/api';

export function useCatalogos() {
  const [vendedores, setVendedores] = useState([]);
  const [tiposServico, setTiposServico] = useState([]);
  const [ferramentas, setFerramentas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    // M5: carrega as três listas em paralelo, expõe `loading`/`error` e dá
    // feedback ao usuário (toast) se algo falhar — antes a falha era silenciosa
    // (só console.error) e a tela mostrava campos vazios sem explicação.
    // A flag `cancelled` evita setState após desmontagem (race condition).
    let cancelled = false;
    const toOptions = (data) => (data || []).map((v) => ({ value: v.nome, label: v.nome }));

    setLoading(true);
    setError(false);

    Promise.allSettled([
      api.listVendedores(),
      api.listTiposServico(),
      api.listFerramentas(),
    ])
      .then(([vRes, tRes, fRes]) => {
        if (cancelled) return;
        let algumaFalhou = false;

        if (vRes.status === 'fulfilled') {
          setVendedores(toOptions(vRes.value.data));
        } else {
          algumaFalhou = true;
          console.error('useCatalogos: falha ao carregar vendedores', vRes.reason);
        }

        if (tRes.status === 'fulfilled') {
          setTiposServico(toOptions(tRes.value.data));
        } else {
          algumaFalhou = true;
          console.error('useCatalogos: falha ao carregar tipos de serviço', tRes.reason);
        }

        if (fRes.status === 'fulfilled') {
          setFerramentas(toOptions(fRes.value.data));
        } else {
          algumaFalhou = true;
          console.error('useCatalogos: falha ao carregar ferramentas', fRes.reason);
        }

        if (algumaFalhou) {
          setError(true);
          toast.error('Não foi possível carregar algumas listas (vendedores, serviços ou ferramentas). Recarregue a página para tentar novamente.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  const addVendedor = async (nome) => {
    try {
      const res = await api.createVendedor(nome);
      const item = { value: res.data.nome, label: res.data.nome };
      setVendedores((prev) => [...prev, item]);
      return res.data.nome;
    } catch (err) {
      console.error('useCatalogos: falha ao criar vendedor', err);
      toast.error('Não foi possível adicionar o vendedor.');
      return null;
    }
  };

  const addTipoServico = async (nome) => {
    try {
      const res = await api.createTipoServico(nome);
      const item = { value: res.data.nome, label: res.data.nome };
      setTiposServico((prev) => [...prev, item]);
      return res.data.nome;
    } catch (err) {
      console.error('useCatalogos: falha ao criar tipo de serviço', err);
      toast.error('Não foi possível adicionar o tipo de serviço.');
      return null;
    }
  };

  const addFerramenta = async (nome) => {
    try {
      const res = await api.createFerramenta(nome);
      const item = { value: res.data.nome, label: res.data.nome };
      setFerramentas((prev) => [...prev, item]);
      return res.data.nome;
    } catch (err) {
      console.error('useCatalogos: falha ao criar ferramenta', err);
      toast.error('Não foi possível adicionar a ferramenta.');
      return null;
    }
  };

  return {
    vendedores,
    tiposServico,
    ferramentas,
    loading,
    error,
    addVendedor,
    addTipoServico,
    addFerramenta,
  };
}

export default useCatalogos;
